import { FORWARD, INGREDIENTS } from './content/catalog';
import { logisticsMultiplier } from './content/regions';
import { effectivePriceIndex } from './modifiers';
import { previewBatch } from './production';
import type { GameState, MonthReport } from './types';

// 원재료 선도계약 (파트 MGT, #179, PRD §8.4) — 차액 정산형. 매달 재무 단계(7)에서 (시장 지수 − 고정 지수) × kg당 기준가 × kg를 주고받는다.
// 실제 원료 구매(생산 단계 원가)는 그대로 시세를 내고, 이 정산이 차이를 메워 원가를 고정한다. 계약이 없으면 아무 일도 없다.

/** 이 원료의 kg당 기준 금액 — 기준가 × 수입 물류 배수 (입지 운송비 배수는 넣지 않는다 `[튜닝]`) */
export function forwardNotionalPerKg(s: GameState, ingredientId: string): number {
  const ing = INGREDIENTS[ingredientId];
  return ing ? ing.pricePerKg * logisticsMultiplier(ing.native, s.regionId) : 0;
}

/** 지금 시장 가격 지수 (이벤트 보정 포함 — 생산 단계가 쓰는 값, 물량 할인 제외) */
export const marketIndex = (s: GameState, ingredientId: string): number => effectivePriceIndex(s)[ingredientId] ?? 1;

/** 지금 생산 지시가 한 달에 쓰는 원료 kg (배치 미리보기 × 월 배치 수) */
export function monthlyUsageKg(s: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of s.production.orders) {
    const r = s.production.recipes.find((x) => x.id === o.recipeId);
    const b = r && o.batchesPerMonth > 0 ? previewBatch(s, r) : null;
    if (!b) continue;
    for (const [id, kg] of Object.entries(b.ingredientsKg)) if (INGREDIENTS[id]) out[id] = (out[id] ?? 0) + kg * o.batchesPerMonth;
  }
  return out;
}

/** 더 계약할 수 있는 월 kg = 월 사용량 × 상한 배수 − 이 원료의 진행 중 계약량 */
export function forwardRoomKg(s: GameState, ingredientId: string): number {
  const used = s.finance.hedges.filter((h) => h.ingredientId === ingredientId && s.month < h.untilMonth).reduce((t, h) => t + h.kgPerMonth, 0);
  return Math.max(0, Math.floor((monthlyUsageKg(s)[ingredientId] ?? 0) * FORWARD.usageCap - used));
}

/** 이번 달 정산액 합계 (양수 = 받는다) — 화면 미리보기용 */
export function forwardSettlement(s: GameState): { id: string; amount: number }[] {
  return s.finance.hedges
    .filter((h) => s.month >= h.fromMonth && s.month < h.untilMonth)
    .map((h) => ({ id: h.id, amount: Math.round((marketIndex(s, h.ingredientId) - h.priceIndex) * forwardNotionalPerKg(s, h.ingredientId) * h.kgPerMonth) }));
}

/** 7 재무 단계에서 부른다: 정산하고 끝난 계약을 지운다. 계약이 없으면 아무 일도 하지 않는다 */
export function settleForwards(s: GameState, report: MonthReport): void {
  if (!s.finance.hedges.length) return;
  let net = 0;
  for (const x of forwardSettlement(s)) net += x.amount;
  if (net) {
    s.finance.cash += net;
    if (net < 0) report.expenses.hedge = (report.expenses.hedge ?? 0) - net;
    report.notes.push(`선도계약 정산 ${net > 0 ? '+' : ''}${net.toLocaleString()}원 (시세 ${net > 0 ? '상승분을 받음' : '하락분을 냄'})`);
  }
  s.finance.hedges = s.finance.hedges.filter((h) => s.month + 1 < h.untilMonth);
}
