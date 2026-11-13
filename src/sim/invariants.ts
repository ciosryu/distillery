import { MIN_BOTTLING_ABV } from './blending';
import { MIN_CASK_VOLUME_L } from './maturation';
import { nonFinitePaths } from './repair';
import { ledgerError } from './ledger';
import type { Flavor, GameState } from './types';

// 공통 불변식 계약 (코어 ARCH — INV-ARCH-1, #285 이어서). 범위는 PROD `prod-stage-t.md` AP3-PROD-1 3. 표.
// - errors: 규칙상 생길 수 없는 값 — 하나라도 있으면 버그다(테스트 실패). 도수 > 0은 7개 나눗셈 경로(autoFill·자동 납품·계약 납품·
//   뉴메이크 판매·블렌드 표·통입 리터·sourcedShare)가 기대는 전제다
// - warnings: 규칙상 가능하지만 정상 범위 밖 — 개발 경고(튜닝 확인용). 판을 멈추지 않는다
// 상태를 바꾸지 않는 순수 함수다. 어디서 부르는지(architecture §9.5): 테스트·개발 빌드는 매달, 배포 빌드는 불러올 때만

export interface InvariantReport { errors: string[]; warnings: string[] }

/** 도수 상한 — 정류 상한 0.82 + 0.1 × 환류보다 넉넉한 물리 상한 */
export const ABV_MAX = 0.97;
/** 향미 축 개발 경고 기준 — 식에 상한이 없다. 장기·고온 칸에서 100을 넘을 수 있다 `[튜닝]` */
export const FLAVOR_WARN = 200;
const EPS = 1e-6;

const fin = Number.isFinite;
const isInt = (x: number) => fin(x) && Math.abs(x - Math.round(x)) < EPS;

function flavorCheck(f: Flavor | undefined, at: string, r: InvariantReport): void {
  if (!f || typeof f !== 'object') { r.errors.push(`${at}.flavor 없음`); return; }
  for (const [k, v] of Object.entries(f)) {
    if (v == null) continue;
    if (!(v >= 0)) r.errors.push(`${at}.flavor.${k} = ${v} (≥ 0)`);
    else if (v > FLAVOR_WARN) r.warnings.push(`${at}.flavor.${k} = ${v.toFixed(1)} (> ${FLAVOR_WARN})`);
  }
}

/**
 * 상태의 불변식을 검사한다. 개수가 많아도 앞의 `limit`개만 적는다(같은 원인이 수백 통에 퍼질 수 있다)
 */
export function checkInvariants(s: GameState, limit = 20): InvariantReport {
  const r: InvariantReport = { errors: [], warnings: [] };
  for (const p of nonFinitePaths(s, '', [], limit)) r.errors.push(`${p} 유한하지 않다`);

  for (const l of s.inventory.lots) {
    const at = `탱크 ${l.id}`;
    { const e = ledgerError(l); if (e) r.errors.push(`${at} ${e}`); }
    if (!(l.abv > 0 && l.abv <= ABV_MAX)) r.errors.push(`${at} abv = ${l.abv} (0 < abv ≤ ${ABV_MAX})`);
    else if (l.abv < 0.15 || l.abv > 0.96) r.warnings.push(`${at} abv = ${l.abv.toFixed(3)} (정상 0.15~0.96)`);
    if (!(l.volumeL > 0)) r.errors.push(`${at} volumeL = ${l.volumeL} (> 0)`);
    else if (l.volumeL < MIN_CASK_VOLUME_L) r.warnings.push(`${at} volumeL = ${l.volumeL.toFixed(2)} (정상 ≥ 1)`);
    if (!(l.costPerLPA >= 0)) r.errors.push(`${at} costPerLPA = ${l.costPerLPA} (≥ 0)`);
    if (!(l.oakMonths >= 0)) r.errors.push(`${at} oakMonths = ${l.oakMonths} (≥ 0)`);
    flavorCheck(l.flavor, at, r);
  }

  for (const c of s.inventory.casks) {
    const l = c.contents;
    if (!l) continue;
    const at = `통 ${c.id}`;
    { const e = ledgerError(l); if (e) r.errors.push(`${at} ${e}`); }
    if (!(l.abv > 0 && l.abv <= ABV_MAX)) r.errors.push(`${at} abv = ${l.abv} (0 < abv ≤ ${ABV_MAX})`);
    else if (l.abv < 0.3 || l.abv > 0.8) r.warnings.push(`${at} abv = ${l.abv.toFixed(3)} (정상 0.3~0.8)`);
    if (!(l.volumeL >= MIN_CASK_VOLUME_L - EPS && l.volumeL <= c.sizeL + EPS)) r.errors.push(`${at} volumeL = ${l.volumeL} (${MIN_CASK_VOLUME_L} ≤ v ≤ ${c.sizeL})`);
    if (!(l.costPerLPA >= 0)) r.errors.push(`${at} costPerLPA = ${l.costPerLPA} (≥ 0)`);
    if (!(l.oakMonths >= 0)) r.errors.push(`${at} oakMonths = ${l.oakMonths} (≥ 0)`);
    flavorCheck(l.flavor, at, r);
  }

  for (const p of s.commerce.products) {
    const at = `제품 ${p.id}`;
    const min = MIN_BOTTLING_ABV[p.category] ?? 0;
    if (!(p.abv >= min - EPS && p.abv <= ABV_MAX)) r.errors.push(`${at} abv = ${p.abv} (${min} ≤ abv ≤ ${ABV_MAX})`);
    else if (p.abv > 0.8) r.warnings.push(`${at} abv = ${p.abv.toFixed(3)} (캐스크 스트렝스 정상 ≤ 0.8)`);
    if (!(p.price > 0)) r.errors.push(`${at} price = ${p.price} (> 0)`);
    if (!(p.unitCost >= 0)) r.errors.push(`${at} unitCost = ${p.unitCost} (≥ 0)`);
    if (!(isInt(p.stockBottles) && p.stockBottles >= 0)) r.errors.push(`${at} stockBottles = ${p.stockBottles} (정수 ≥ 0)`);
    if (!(p.quality >= 0 && p.quality <= 100)) r.errors.push(`${at} quality = ${p.quality} (0~100)`);
    if (!(p.typicity >= 0 && p.typicity <= 100)) r.errors.push(`${at} typicity = ${p.typicity} (0~100)`);
    flavorCheck(p.flavor, at, r);
  }

  r.errors.splice(limit);
  r.warnings.splice(limit);
  return r;
}

/** 테스트·개발 빌드용 — 오류가 있으면 던진다 */
export function assertInvariants(s: GameState, where = ''): void {
  const { errors } = checkInvariants(s);
  if (errors.length) throw new Error(`불변식 위반${where ? ` (${where})` : ''} ${s.month}개월: ${errors.join(' · ')}`);
}

// ───────────── 매달 검사 스위치 (architecture §9.5) ─────────────
// off: 배포 빌드(불러올 때만 검사) · throw: 테스트(vitest)·스크립트 `INVARIANTS=1` — 첫 위반에서 멈춘다 · warn: 개발 빌드 화면 — 콘솔에만 적는다.
// 검사는 상태를 읽기만 한다 → 어느 모드든 판 결과·RNG가 같다

export type InvariantMode = 'off' | 'throw' | 'warn';
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
let mode: InvariantMode = env?.INVARIANTS === '0' ? 'off' : env?.VITEST || env?.INVARIANTS === '1' ? 'throw' : 'off';

export function setInvariantMode(m: InvariantMode): void { mode = m; }
export function invariantMode(): InvariantMode { return mode; }

/** 달 끝(advanceMonth)에서 부른다 */
export function monthlyInvariantHook(s: GameState): void {
  if (mode === 'off') return;
  if (mode === 'throw') { assertInvariants(s, 'advanceMonth'); return; }
  const { errors } = checkInvariants(s);
  if (errors.length) console.error(`[불변식] ${s.month}개월: ${errors.join(' · ')}`);
}
