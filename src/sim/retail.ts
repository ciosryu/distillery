import type { GameState } from './types';
import { staffOf } from './util';

// 소매 처리 역량·재고 적체 (파트 MKT, 결정 #144 — 파일 쪼개기로 옮겨 왔다. 규칙·수치 불변)

// ───────────── 소매 처리 역량 (결정 #65) ─────────────

export const RETAIL = {
  /** 직원 없이도 처리하는 월 9L 케이스 */
  baseCases: 60,
  /** 영업 직원 1명당 + 네트워크 스탯 1당 — 네트워크 60이면 1명당 약 100케이스 (#72) */
  perSalesCases: 40,
  perNetworkCase: 1.0,
  /** 관리 효율 저하(#76): 영업 직원을 늘릴수록 추가 1명의 기여가 직전의 60%로 준다 (네트워크 높은 순으로 1.0, 0.6, 0.36, 0.22…) */
  staffEfficiencyDecay: 0.6,
  /** 네트워크 70↑ 영업 직원이 있으면 고급 유통망(B2B 온트레이드) 확보 → 역량 +30% */
  premiumNetwork: 70,
  premiumBonus: 0.3,
  /** 역량 초과분(최대 역량의 100%까지)은 할인·추가 수수료 채널 — 출고가 대비 수수료 */
  overflowFeeRate: 0.3,
  /** 고비용 채널로 팔 수 있는 양 = 역량 × 이 비율 (그 너머는 못 판다) */
  overflowShare: 1,
};

export const hasPremiumChannel = (s: GameState) => staffOf(s, 'sales').some((x) => x.stats.b >= RETAIL.premiumNetwork);

export function retailCapacityCases(s: GameState): number {
  const sales = [...staffOf(s, 'sales')].sort((a, b) => b.stats.b - a.stats.b);
  const base = RETAIL.baseCases + sales.reduce((t, x, i) => t + (RETAIL.perSalesCases + RETAIL.perNetworkCase * x.stats.b) * Math.pow(RETAIL.staffEfficiencyDecay, i), 0);
  return Math.round(base * (hasPremiumChannel(s) ? 1 + RETAIL.premiumBonus : 1));
}

/** 재고 적체: 6개월 넘게 팔 재고가 쌓이면 할인 이미지로 매력도가 떨어진다 (출시 6개월 후부터) */
export function overhangFactor(p: { stockBottles: number; salesEma?: number; createdMonth: number }, month: number): number {
  if (month - p.createdMonth < 6 || p.salesEma == null) return 1;
  const months = p.stockBottles / Math.max(1, p.salesEma);
  return months > 6 ? Math.max(0.6, Math.sqrt(6 / months)) : 1;
}
