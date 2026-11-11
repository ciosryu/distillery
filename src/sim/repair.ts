import { emptyCask } from './maturation';
import type { GameState } from './types';
import { clone } from './util';

// 세이브 수리 (코어 ARCH — [결정 #285], C-ARCH-2). 버전 마이그레이션이 아니라 **불러올 때마다** 도는 한 단계다.
// 왜: JSON은 NaN을 null로 저장한다. 다시 불러오면 null은 산술에서 0처럼 굴어(`null − 100 = −100`, `null < 0`은 false)
// 현금이 오류 없이 조용히 0원이 되고, 도수가 null인 통은 계속 계산을 망친다(C-PROD-1 — 0L 통 증발 → 도수 NaN → 보관비·현금 NaN).
// 고칠 것이 없으면 입력을 그대로 돌려준다(migrateSave의 "입력을 바꾸지 않는다" 약속 — 고칠 때만 복제한다).

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** 원액이 망가졌나 — 양이 유한한 양수가 아니거나, 도수·원가·숙성 개월이 유한하지 않다 */
const brokenSpirit = (l: { volumeL: unknown; abv: unknown; costPerLPA: unknown; oakMonths: unknown }) =>
  !(finite(l.volumeL) && l.volumeL > 0) || !finite(l.abv) || !finite(l.costPerLPA) || !finite(l.oakMonths);

/**
 * 고칠 것을 찾아 고친다. 돌려주는 `fixes`가 비어 있으면 `state`는 입력 그대로다.
 * 규칙: ① 망가진 통 원액은 비운다(통·자리는 남는다) ② 망가진 탱크 원액은 지운다 ③ 현금이 유한하지 않으면 마지막으로 유한했던 결산의 월말 현금으로
 * (없으면 0) ④ 제품의 재고·원가가 유한하지 않으면 0, 출고가가 유한하지 않으면 원가의 2배(100원 단위)로 ⑤ 유한하지 않은 매출채권은 지운다.
 * 고친 내용은 마지막 결산 메모("세이브 복구 — …")로 남겨 불러온 직후 소식 창에 뜬다
 */
export function repairSave(input: GameState): { state: GameState; fixes: string[] } {
  if (!needsRepair(input)) return { state: input, fixes: [] };
  const s = clone(input);
  const fixes: string[] = [];
  let emptied = 0;
  s.inventory.casks = s.inventory.casks.map((c) => (c.contents && brokenSpirit(c.contents) ? (emptied++, emptyCask(c)) : c));
  if (emptied) fixes.push(`원액이 망가진 통 ${emptied}개를 비웠다`);
  const lotsBefore = s.inventory.lots.length;
  s.inventory.lots = s.inventory.lots.filter((l) => !brokenSpirit(l));
  if (s.inventory.lots.length < lotsBefore) fixes.push(`망가진 탱크 원액 ${lotsBefore - s.inventory.lots.length}개를 지웠다`);
  if (!finite(s.finance.cash)) {
    const last = [...s.history.reports].reverse().find((r) => finite(r.cashEnd));
    s.finance.cash = last ? last.cashEnd : 0;
    fixes.push(last ? `현금을 ${last.month + 1}개월째 결산의 월말 현금(${Math.round(last.cashEnd).toLocaleString()}원)으로 되돌렸다` : '현금을 알 수 없어 0원으로 두었다');
  }
  let products = 0;
  for (const p of s.commerce.products) {
    let touched = false;
    if (!finite(p.stockBottles)) { p.stockBottles = 0; touched = true; }
    if (!finite(p.unitCost)) { p.unitCost = 0; touched = true; }
    if (!finite(p.price)) { p.price = Math.max(100, Math.round((p.unitCost * 2) / 100) * 100); touched = true; }
    if (touched) products++;
  }
  if (products) fixes.push(`제품 ${products}개의 재고·원가·출고가를 고쳤다`);
  const recBefore = s.finance.receivables.length;
  s.finance.receivables = s.finance.receivables.filter((r) => finite(r.amount));
  if (s.finance.receivables.length < recBefore) fixes.push(`망가진 매출채권 ${recBefore - s.finance.receivables.length}건을 지웠다`);
  const last = s.history.reports.at(-1);
  if (last && fixes.length) last.notes = [...last.notes, `세이브 복구 — ${fixes.join(' · ')}. 계산이 망가진 값(NaN)이 세이브에 남아 있었다`];
  return { state: s, fixes };
}

function needsRepair(s: GameState): boolean {
  return s.inventory.casks.some((c) => c.contents && brokenSpirit(c.contents))
    || s.inventory.lots.some(brokenSpirit)
    || !finite(s.finance.cash)
    || s.commerce.products.some((p) => !finite(p.stockBottles) || !finite(p.unitCost) || !finite(p.price))
    || s.finance.receivables.some((r) => !finite(r.amount));
}

/**
 * 상태 안의 유한하지 않은 수(NaN·±Infinity) 경로 — 불변식 테스트용("상태에 유한하지 않은 수가 없다", #285).
 * null은 세지 않는다(선택 값으로 쓰는 곳이 있다 — 예: 숙성 표기 없음). 메모리 상태의 NaN은 세이브 전이라 null이 아니다
 */
export function nonFinitePaths(x: unknown, path = '', out: string[] = [], limit = 20): string[] {
  if (out.length >= limit) return out;
  if (typeof x === 'number') { if (!Number.isFinite(x)) out.push(path || '(root)'); return out; }
  if (Array.isArray(x)) { x.forEach((v, i) => nonFinitePaths(v, `${path}[${i}]`, out, limit)); return out; }
  if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) nonFinitePaths(v, path ? `${path}.${k}` : k, out, limit);
  return out;
}
