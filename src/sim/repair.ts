import { sumCashFlows } from './cashflow';
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
 * 규칙([결정 #295] — 이득이 생기지 않는 쪽으로만 고친다): ① 망가진 통 원액은 비운다(통·자리는 남는다) ② 망가진 탱크 원액은 지운다
 * ③ 현금이 유한하지 않으면 마지막으로 유한했던 결산의 월말 현금 + 그 뒤 턴 사이 행동의 현금(`pendingCash`) — 그 결산이 가장 최근 결산이고 pendingCash가 모두 유한할 때만
 *    더한다(아니면 결산 현금만, 메모에 적는다. 결산이 없으면 0) ④ 제품 재고가 유한하지 않으면 0병. 원가가 유한하지 않으면 **그 제품 재고를 0병으로**
 *    (원가 0으로 두면 매출원가가 사라져 이익을 부풀린다 — 손해 쪽으로) 출고가가 유한하지 않으면 원가의 2배(100원 단위 — 기준가 × n은 AP3 뒤) ⑤ 유한하지 않은 매출채권은 지운다.
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
    if (!last) { s.finance.cash = 0; fixes.push('현금을 알 수 없어 0원으로 두었다'); }
    else {
      const pending = Object.values(s.finance.pendingCash ?? {});
      const latest = last === s.history.reports.at(-1);
      const addPending = latest && pending.every(finite);
      const after = addPending ? sumCashFlows(s.finance.pendingCash ?? {}) : 0;
      s.finance.cash = last.cashEnd + after;
      fixes.push(`현금을 ${last.month + 1}개월째 결산의 월말 현금(${Math.round(last.cashEnd).toLocaleString()}원)${addPending ? (after ? ` + 그 뒤 행동 ${Math.round(after).toLocaleString()}원` : '') : ' — 그 뒤 행동의 현금은 되살리지 못했다'}으로 되돌렸다`);
    }
  }
  let products = 0;
  for (const p of s.commerce.products) {
    let touched = false;
    if (!finite(p.stockBottles)) { p.stockBottles = 0; touched = true; }
    if (!finite(p.unitCost)) { p.unitCost = 0; p.stockBottles = 0; touched = true; } // 원가를 모르는 병은 팔지 않는다(손해 쪽)
    if (!finite(p.price)) { p.price = Math.max(100, Math.round((p.unitCost * 2) / 100) * 100); touched = true; }
    if (touched) products++;
  }
  if (products) fixes.push(`제품 ${products}개의 재고·원가·출고가를 고쳤다(원가를 모르는 제품은 재고를 비웠다)`);
  // ⑥ 유한하지 않은 턴 사이 현금 기록은 지운다 — 다음 결산의 순현금(netCash)이 NaN이 되지 않게(현금은 ③에서 따로 고쳤다)
  const pc = s.finance.pendingCash ?? {};
  const badPending = Object.keys(pc).filter((k) => !finite(pc[k as keyof typeof pc]));
  if (badPending.length) { for (const k of badPending) delete pc[k as keyof typeof pc]; fixes.push(`턴 사이 현금 기록 ${badPending.length}항목을 지웠다`); }
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
    || s.finance.receivables.some((r) => !finite(r.amount))
    || Object.values(s.finance.pendingCash ?? {}).some((v) => !finite(v));
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
