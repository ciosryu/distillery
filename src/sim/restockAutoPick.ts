// [결정 #437 ①] 재고 보충 「자동으로 골라 담기」 — 조건(숙성 최저 · 상한 · 품질 하한 · 향미 방향)으로 통 · L을 고른다. 순수 함수 · 읽기만.
// 화면이 결과를 병입 칸에 담고, 병입은 사람이 지금 「병입」(restockId)으로 누른다 — 새 행동 · 필드 없음.
// 아는 값만(I2): 통 개월 · 종류(공개) · 샘플 기록(knownReads) · 제품의 병입 때 추정 향미(knownProductQuality().hex) · 통 구성 기록(caskMix). 참 향미 · 참 품질은 읽지 않는다.
// 보호 · 예비 · 띠 정책 · 레시피 거름은 자동 납품과 같은 함수(autoRestockExcluded · agePolicyFilter · recipeFilter)다.
import { agePolicyFilter } from './ageBand';
import { CASK_FAMILY_LABEL, caskFamily, type CaskFamily } from './agedCombos';
import { isCaskStrength, isWhiskyCategory, whiskyMinMonths, type BottleOptions } from './blending';
import { delegatePlan, knownReads } from './blendTable';
import { regionOf } from './content/regions';
import { autoRestockExcluded, newmakeRestock, productMonthlyPace, recipeFilter, RESTOCK_KIND } from './economics';
import { finishOf, vesselMaterial } from './maturation';
import { knownState } from './market';
import { knownProductQuality } from './productView';
import { preferredCaskIds } from './tags';
import type { Cask, GameState, Product, SpiritKind, SpiritLot } from './types';

/** 향미 방향 — (B) 지금 제품 맛 유지 · (A) 통 계열(계열 안에서도 지금 맛에 가깝게 — 오너 「권장안대로」) */
export type RestockFlavor = { kind: 'keep' } | { kind: 'family'; family: CaskFamily };
export interface RestockPickCond {
  /** 숙성 최저(목재 개월) — 기본 = 표기 연수(없으면 법정 숙성) */
  minMonths: number;
  /** 숙성 상한(목재 개월) — 없으면 상한 없음 */
  maxMonths?: number;
  /** 품질 하한 — 샘플 기록의 아는 품질이 이 이상인 통만(기록 없는 통은 쓰지 않는다 · #419와 같다). 없으면 조건 없음 */
  minKnownQuality?: number;
  flavor: RestockFlavor;
  bottles: number;
}
/** 고르는 법 — flavor: 블렌더 계획(제품 추정 향미에 가깝게) · mix: 통 구성 기록의 계열 비율로 어린 통부터 · youngest: 어린 통부터 */
export type RestockPickMethod = 'flavor' | 'mix' | 'youngest';
export interface RestockPickResult {
  components: { caskId: string; liters: number }[];
  method: RestockPickMethod;
  /** 담은 양으로 나오는 어림 병 수 */
  bottles: number;
  /** 조건에 맞지만 뺀 통 수 — 보호 태그 · 플래그십 예비 / 띠 정책 / 품질 하한 / 샘플 기록 없음 / 다른 계열 */
  held: { reserve: number; policy: number; lowQuality: number; noRead: number; family: number };
  error?: string;
}

/** 블렌더에게 넘길 후보 — 필요한 알코올의 이 배수가 될 때까지 어린 통부터(남은 통이 너무 잘게 나뉘지 않게) `[튜닝]` */
export const RESTOCK_PICK_SPARE = 2;
/** 블렌더 후보 최소 통 수 `[튜닝]` */
export const RESTOCK_PICK_MIN_CASKS = 3;

type Filled = Cask & { contents: SpiritLot };

/** 자동으로 골라 담기를 보일 제품 — 통 원액으로 채우는 위스키(뉴본 · 면세 한정판 제외) */
export function restockAutoPickSupported(s: GameState, p: Product): boolean {
  if (p.dutyFreeOnly || !isWhiskyCategory(p.category) || newmakeRestock(p, s)) return false;
  return !!RESTOCK_KIND[p.category] || p.category === 'blended_whisky';
}

/** 숙성 최저 기본값 = 표기 연수(없으면 법정 숙성) */
export const restockLabelMonths = (s: GameState, p: Pick<Product, 'ageYears'>): number => (p.ageYears ? p.ageYears * 12 : whiskyMinMonths(regionOf(s).whisky));

/** 병 수 기본값 — 이 제품 월 판매 속도 3개월 치(10병 단위 · 최소 50병). 아는 품질로 센 수요(`knownState` — 판매 화면과 같다, I2) */
export function restockPickDefaultBottles(s: GameState, p: Product): number {
  const ks = knownState(s);
  const kp = ks.commerce.products.find((x) => x.id === p.id) ?? p;
  return Math.max(50, Math.ceil((productMonthlyPace(ks, kp) * 3) / 10) * 10);
}

/** 보충 병입 옵션 — 제품과 같은 병 · 도수 · 포장(자동 납품 `economics` 1105행과 같은 꼴) */
export const restockBottleOptions = (p: Product): BottleOptions => ({ name: '', targetAbv: isCaskStrength(p) ? 'cask' : p.abv, bottleMl: p.bottleMl, chillFilter: p.chillFiltered, packagingId: p.packagingId, restockId: p.id, ...(p.packaging ? { packaging: p.packaging } : {}) });

/** 이 제품에 맞는 통 계열(지금 조건 — 계열 고르기 선택지). 피니시 제품은 계열을 고르지 않는다(같은 피니시만 보충된다) */
export function restockPickFamilies(s: GameState, p: Product, cond: Pick<RestockPickCond, 'minMonths' | 'maxMonths'>): { family: CaskFamily; label: string; casks: number }[] {
  if (p.finish) return [];
  const n = new Map<CaskFamily, number>();
  for (const c of baseCasks(s, p, cond)) n.set(caskFamily(c), (n.get(caskFamily(c)) ?? 0) + 1);
  return [...n].map(([family, casks]) => ({ family, label: CASK_FAMILY_LABEL[family], casks }));
}

/** 범주 · 피니시 · 도수 · 레시피 · 개월이 맞는 통(보호 · 띠 · 품질은 아직) — 자동 납품 `whiskyCasks`의 첫 거름과 같다 */
function baseCasks(s: GameState, p: Product, cond: Pick<RestockPickCond, 'minMonths' | 'maxMonths'>): Filled[] {
  const kind = RESTOCK_KIND[p.category];
  const kindOk = (k: SpiritKind) => (kind ? k === kind : k === 'malt' || k === 'grain');
  const sameRecipe = recipeFilter(p);
  const minAbv = isCaskStrength(p) ? 0.4 : p.abv - 1e-9;
  const finish = p.finish ?? null;
  const max = cond.maxMonths ?? Infinity;
  return s.inventory.casks.filter((c): c is Filled => !!c.contents && !c.owner && !c.handfill && !c.contaminationKnown && vesselMaterial(c) === 'wood'
    && kindOk(c.contents.kind) && !c.contents.sourced && c.contents.oakMonths >= cond.minMonths && c.contents.oakMonths <= max
    && c.contents.abv >= minAbv && (finishOf(c.contents)?.typeId ?? null) === finish && sameRecipe(c.contents));
}

const lpaOf = (c: Filled) => c.contents.volumeL * c.contents.abv;
const floor1 = (x: number) => Math.floor(x * 10) / 10;

/** 어린 통부터 needLPA만큼 */
function fillYoungest(casks: Filled[], needLPA: number): { caskId: string; liters: number }[] {
  const out: { caskId: string; liters: number }[] = [];
  let left = needLPA;
  for (const c of casks) {
    if (left <= 1e-6) break;
    const l = floor1(Math.min(c.contents.volumeL, left / c.contents.abv));
    if (l < 0.5) continue;
    out.push({ caskId: c.id, liters: l });
    left -= l * c.contents.abv;
  }
  return out;
}

export function restockAutoPick(s: GameState, p: Product, cond: RestockPickCond): RestockPickResult {
  const held = { reserve: 0, policy: 0, lowQuality: 0, noRead: 0, family: 0 };
  const done = (components: { caskId: string; liters: number }[], method: RestockPickMethod, error?: string): RestockPickResult => {
    const lpa = components.reduce((t, x) => t + x.liters * (s.inventory.casks.find((c) => c.id === x.caskId)?.contents?.abv ?? 0), 0);
    const bottles = Math.floor(lpa / ((p.bottleMl / 1000) * p.abv) + 1e-6);
    return { components, method, bottles, held, ...(error ? { error } : {}) };
  };
  if (!restockAutoPickSupported(s, p)) return done([], 'youngest', '이 제품은 자동으로 골라 담지 않는다(통 원액으로 채우는 위스키만)');
  if (cond.maxMonths != null && cond.maxMonths < cond.minMonths) return done([], 'youngest', '숙성 범위가 거꾸로다 — 최저가 상한보다 크다');
  if (cond.bottles <= 0) return done([], 'youngest', '병 수를 정하세요');

  const reads = knownReads(s);
  const hex = knownProductQuality(s, p).hex;
  // 지금 맛 유지: 제품 통 구성 기록(공개)의 계열로 좁힌다 — 버번 제품이 향미만 비슷한 다른 계열 통으로 바뀌지 않게
  const mixFamilies = p.caskMix?.length ? new Set(p.caskMix.map((x) => caskFamily(x))) : null;
  const familyOk = (c: Filled) => (cond.flavor.kind === 'family' ? caskFamily(c) === cond.flavor.family : !mixFamilies || mixFamilies.has(caskFamily(c)));
  const excluded = autoRestockExcluded(s, p);
  const pref = preferredCaskIds(s);
  const minQ = cond.minKnownQuality;
  const ordered: Filled[] = [];
  for (const c of baseCasks(s, p, cond)) {
    if (!familyOk(c)) { held.family++; continue; }
    if (excluded.has(c.id)) { held.reserve++; continue; }
    if (minQ != null && (reads.get(c.id)?.estQuality ?? -Infinity) < minQ - 1e-9) { if (reads.has(c.id)) held.lowQuality++; else held.noRead++; continue; }
    ordered.push(c);
  }
  // 자동 납품과 같은 순서(「먼저 쓰기」 태그 → 어린 통) · 같은 띠 정책
  ordered.sort((a, b) => Number(pref.has(b.id)) - Number(pref.has(a.id)) || a.contents.oakMonths - b.contents.oakMonths || a.id.localeCompare(b.id));
  const allowed = agePolicyFilter(s, ordered).allowed;
  held.policy = ordered.length - allowed.length;
  if (!allowed.length) return done([], 'youngest', '조건에 맞는 통이 없다');

  const needLPA = cond.bottles * (p.bottleMl / 1000) * p.abv;

  // 블렌디드 — 첫 병입의 레시피 비율(#399 C restockMix)을 지키고, 레시피마다 어린 통부터
  if (p.category === 'blended_whisky' && p.restockMix?.length) {
    const out = p.restockMix.flatMap((m) => fillYoungest(allowed.filter((c) => c.contents.recipeId === m.recipeId), needLPA * m.share));
    return done(out, 'mix', out.length ? undefined : '조건에 맞는 통이 없다');
  }

  // (B) · (A) — 제품 추정 향미가 있으면 블렌더 계획(샘플 기록이 있는 통만)
  if (hex) {
    const known = allowed.filter((c) => reads.has(c.id));
    held.noRead += allowed.length - known.length;
    const pool: Filled[] = [];
    let poolLPA = 0;
    for (const c of known) {
      if (pool.length >= RESTOCK_PICK_MIN_CASKS && poolLPA >= needLPA * RESTOCK_PICK_SPARE) break;
      pool.push(c);
      poolLPA += lpaOf(c);
    }
    if (!pool.length) return done([], 'flavor', '샘플 기록이 있는 통이 없다 — 블렌더는 맛본 통만 섞는다. 먼저 샘플을 뜨세요');
    const plan = delegatePlan(s, { hex }, pool.map((c) => c.id), cond.bottles, restockBottleOptions(p));
    if ('error' in plan) return done([], 'flavor', plan.error);
    return done(plan.components.map((x) => ({ caskId: x.id, liters: x.liters })), 'flavor');
  }

  // 추정 향미가 없는 제품 — 지금 맛 유지면 통 구성 기록의 계열 비율로, 아니면 어린 통부터
  if (cond.flavor.kind === 'keep' && p.caskMix?.length) {
    const byFam = new Map<CaskFamily, number>();
    for (const x of p.caskMix) byFam.set(caskFamily(x), (byFam.get(caskFamily(x)) ?? 0) + x.share);
    const sum = [...byFam.values()].reduce((t, x) => t + x, 0) || 1;
    const out = [...byFam].flatMap(([f, sh]) => fillYoungest(allowed.filter((c) => caskFamily(c) === f), (needLPA * sh) / sum));
    return done(out, 'mix', out.length ? undefined : '조건에 맞는 통이 없다');
  }
  return done(fillYoungest(allowed, needLPA), 'youngest');
}

// ───────────── [P-PROD-78] 계열 다름 알림 — 고른 계열이 제품 통 구성 기록과 다를 때 한 줄(화면만 · 막지 않는다) ─────────────

/** 고른 계열이 제품 통 구성 기록에서 이 몫 미만이면 알린다 `[튜닝]` */
export const RESTOCK_FAMILY_NOTE_SHARE = 0.2;

/** 제품 통 구성 기록(`caskMix` — 공개)을 계열별 몫(합 1)으로. 기록이 없으면 null */
export function productFamilyShares(p: Pick<Product, 'caskMix'>): Map<CaskFamily, number> | null {
  if (!p.caskMix?.length) return null;
  const m = new Map<CaskFamily, number>();
  for (const x of p.caskMix) m.set(caskFamily(x), (m.get(caskFamily(x)) ?? 0) + x.share);
  const sum = [...m.values()].reduce((t, x) => t + x, 0);
  if (sum <= 0) return null;
  for (const [f, v] of m) m.set(f, v / sum);
  return m;
}

/** 이 계열로 채우면 알릴까 — 기록에서 그 계열 몫이 RESTOCK_FAMILY_NOTE_SHARE 미만. 기록이 없으면 알리지 않는다(null) */
export function restockFamilyNote(p: Pick<Product, 'caskMix'>, family: CaskFamily): { share: number; top: { family: CaskFamily; label: string; share: number } } | null {
  const m = productFamilyShares(p);
  if (!m) return null;
  const share = m.get(family) ?? 0;
  if (share >= RESTOCK_FAMILY_NOTE_SHARE) return null;
  const [tf, ts] = [...m].sort((a, b) => b[1] - a[1])[0]!;
  return { share, top: { family: tf, label: CASK_FAMILY_LABEL[tf], share: ts } };
}
