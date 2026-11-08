import { BOARD } from './content/catalog';
import { monthlyFixedCost } from './loans';
import { endGame } from './progress';
import type { GameState, MonthReport } from './types';

// 이사회 (파트 MGT, #180, PRD §8.2) — 외부 지분 25%↑면 생기고, 석 달마다 목표를 하나 낸다. 달성하면 신뢰↑, 미달이면 신뢰↓.
// 외부 지분 50%↑에서 신뢰가 0이 되면 대표 해임(GameEnding 'dismissed'). 목표 수치는 월 리포트 기록에서 다시 계산한다(상태 모양은 S-11 자리 그대로).
// 이사회가 없으면(외부 지분 25% 미만 — MVP는 투자가 잠겨 있다) 아무 일도 하지 않는다.

export type BoardDemandId = 'revenue_growth' | 'cash_buffer';

/** 한 달 리포트의 매출 — 병입 제품 + 원액(계약·현물) + 수출 + 비지터 센터 */
export const reportRevenue = (r: MonthReport): number => r.revenue + r.bulkRevenue + (r.spotBulkRevenue ?? 0) + (r.exportRevenue ?? 0) + (r.tourismRevenue ?? 0);

/** 끝 달이 lastMonth인 석 달 매출 합 (기록이 없는 달은 0) */
export function quarterRevenue(s: GameState, lastMonth: number): number {
  return s.history.reports.filter((r) => r.month > lastMonth - 3 && r.month <= lastMonth).reduce((t, r) => t + reportRevenue(r), 0);
}

/** 외부 지분이 기준을 넘으면 이사회를 만든다 (투자 유치 직후 부른다) */
export function ensureBoard(s: GameState): boolean {
  if (s.finance.board || s.finance.investorShare < BOARD.formShare - 1e-9) return false;
  s.finance.board = { confidence: BOARD.startConfidence, demands: [] };
  return true;
}

/** 이번 분기(이번 달부터 석 달) 목표 — 직전 석 달 매출이 없으면 현금 버티기, 있으면 매출 성장 */
function nextDemand(s: GameState): { id: BoardDemandId; label: string; dueMonth: number } {
  const prev = quarterRevenue(s, s.month - 1);
  const dueMonth = s.month + 2;
  if (prev <= 0) return { id: 'cash_buffer', label: `분기 말 현금을 월 고정비 ${BOARD.cashBufferMonths}개월분 이상으로 유지`, dueMonth };
  return { id: 'revenue_growth', label: `분기 매출을 직전 분기(${Math.round(prev).toLocaleString()}원)의 ${Math.round(BOARD.revenueGrowth * 100)}% 이상으로`, dueMonth };
}

/** 목표 판정 — 기한 달까지의 기록으로 (기한 다음 달 재무 단계에서 부른다) */
export function demandMet(s: GameState, d: { id: string; dueMonth: number }): boolean {
  if (d.id === 'revenue_growth') return quarterRevenue(s, d.dueMonth) >= quarterRevenue(s, d.dueMonth - 3) * BOARD.revenueGrowth;
  const end = s.history.reports.find((r) => r.month === d.dueMonth);
  return (end?.cashEnd ?? s.finance.cash) >= monthlyFixedCost(s) * BOARD.cashBufferMonths;
}

/** 7 재무 단계 끝에서 부른다: 기한이 지난 목표를 판정하고 다음 목표를 낸다. 지분 50%↑에서 신뢰 0이면 해임 */
export function runBoard(s: GameState, report: MonthReport): void {
  const b = s.finance.board;
  if (!b) return;
  for (const d of b.demands.filter((x) => s.month > x.dueMonth)) {
    const ok = demandMet(s, d);
    b.confidence = Math.max(0, Math.min(100, b.confidence + (ok ? BOARD.metGain : -BOARD.missLoss)));
    report.notes.push(`이사회 분기 목표 ${ok ? '달성' : '미달'}: ${d.label} — 신뢰 ${b.confidence}`);
  }
  b.demands = b.demands.filter((x) => s.month <= x.dueMonth);
  if (s.finance.investorShare >= BOARD.dismissShare && b.confidence <= 0) {
    endGame(s, 'dismissed');
    report.notes.push('이사회가 대표를 해임했습니다');
    return;
  }
  if (!b.demands.length) {
    const d = nextDemand(s);
    b.demands.push(d);
    report.notes.push(`이사회 새 분기 목표 (${d.dueMonth - s.month + 1}개월): ${d.label}`);
  }
}
