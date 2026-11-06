// ── 현금 흐름 분류 ──
// 턴 사이 행동(현물 판매·대출·설비 구매 등)은 행동 즉시 현금이 움직인다.
// 그 금액을 GameState.pendingCash에 쌓아 두었다가 다음 결산(advanceMonth) 보고서에 합친다.
import type { CashFlowKey, CashFlows, GameState, MonthReport } from './types';

/** 영업(본업) · 투자(설비·빈 캐스크) · 재무(차입·상환·지분) */
export type CashFlowGroup = 'operating' | 'investing' | 'financing';

export const CASH_FLOW_LINES: Record<CashFlowKey, { label: string; group: CashFlowGroup }> = {
  spotBulk: { label: '원액 현물 판매', group: 'operating' },
  caskBid: { label: 'IB 캐스크 매각', group: 'operating' },
  caskOwnership: { label: '캐스크 오너십 판매', group: 'operating' },
  contractCancel: { label: '계약 해지 비용', group: 'operating' },
  bottling: { label: '병입(포장·인건비)', group: 'operating' },
  severance: { label: '퇴직 위로금', group: 'operating' },
  rotation: { label: '캐스크 로테이션', group: 'operating' },
  event: { label: '이벤트 대응', group: 'operating' },
  brokerCask: { label: '브로커 원액 매입', group: 'operating' },
  export: { label: '수출 시장 진출·철수', group: 'operating' },
  other: { label: '기타 행동 (취수 신청 등)', group: 'operating' },
  casks: { label: '빈 캐스크 구매·재탄화', group: 'investing' },
  usedCask: { label: '중고 캐스크 매각', group: 'investing' },
  equipment: { label: '설비 구매', group: 'investing' },
  loan: { label: '대출 실행', group: 'financing' },
  loanRepay: { label: '대출 조기 상환', group: 'financing' },
  investment: { label: '투자 유치', group: 'financing' },
  // 선급금은 나중 납품으로 갚는 고객 선수금 → 대출처럼 재무로 본다 (흑자 전환 지표에서 제외, §16.20)
  contractPrepay: { label: '계약 선급금 (입금·반환)', group: 'financing' },
};

/** 턴 사이 현금 흐름을 기록한다 (현금 자체는 호출 측에서 이미 움직였다) */
export function recordPendingCash(s: GameState, key: CashFlowKey, amount: number): void {
  if (!amount) return;
  const p = { ...(s.finance.pendingCash ?? {}) };
  p[key] = (p[key] ?? 0) + amount;
  s.finance.pendingCash = p;
}

export const sumCashFlows = (f: CashFlows, group?: CashFlowGroup): number =>
  (Object.entries(f) as [CashFlowKey, number][]).reduce((t, [k, v]) => t + (!group || CASH_FLOW_LINES[k].group === group ? v : 0), 0);

/** 외부 자금(대출 실행·투자 유치·계약 선급금 입금)을 뺀 순현금 — 런웨이 계산용 (설비 투자·상환은 포함) */
export const selfFundedCash = (r: MonthReport): number =>
  r.netCash - (r.offTurn?.loan ?? 0) - (r.offTurn?.investment ?? 0) - Math.max(0, r.offTurn?.contractPrepay ?? 0);
