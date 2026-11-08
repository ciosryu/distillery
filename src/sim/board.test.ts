import { describe, expect, it } from 'vitest';
import { applyAction, newGame, newScenarioGame, type GameState, type MonthReport } from './index';
import { BOARD } from './content/catalog';
import { quarterRevenue, runBoard } from './board';

// 이사회 (P-MGT-7, PRD §8.2) — 파트 MGT

const rep = (month: number, revenue = 0, cashEnd = 0): MonthReport => ({ month, revenue, expenses: {}, netCash: 0, cashEnd, sales: [], production: [], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] });
/** month에 이사회가 있는 판 (외부 지분 share) */
const withBoard = (month: number, share = 0.325): GameState => {
  const s = newGame({ seed: 1, startingCash: 5_000_000_000 });
  s.month = month;
  s.finance.investorShare = share;
  s.finance.board = { confidence: BOARD.startConfidence, demands: [] };
  return s;
};

describe('이사회 (P-MGT-7)', () => {
  it('외부 지분 25%↑에서만 생긴다 — 엔젤(10%)만으로는 없고, 시드 VC를 더하면(32.5%) 생긴다', () => {
    let s = newGame({ seed: 1, startingCash: 5_000_000_000 });
    s = applyAction(s, { type: 'takeInvestment', offerId: 'angel' }).state;
    expect(s.finance.board).toBeUndefined();
    s.month = 12;
    const r = applyAction(s, { type: 'takeInvestment', offerId: 'seed_vc' });
    expect(r.state.finance.investorShare).toBeCloseTo(0.325, 5);
    expect(r.state.finance.board).toEqual({ confidence: BOARD.startConfidence, demands: [] });
    expect(r.message).toMatch(/이사회/);
  });

  it('매출이 없는 동안은 현금 버티기 목표 — 분기 말 현금이 고정비 3개월분 이상이면 신뢰↑', () => {
    const s = withBoard(12);
    const r0 = rep(12);
    runBoard(s, r0);
    const d = s.finance.board!.demands[0]!;
    expect(d.id).toBe('cash_buffer');
    expect(d.dueMonth).toBe(14);
    for (const m of [12, 13, 14]) s.history.reports.push(rep(m, 0, 5_000_000_000));
    s.month = 15;
    const r1 = rep(15);
    runBoard(s, r1);
    expect(s.finance.board!.confidence).toBe(BOARD.startConfidence + BOARD.metGain);
    expect(r1.notes.join(' ')).toMatch(/달성/);
    expect(s.finance.board!.demands[0]!.dueMonth).toBe(17); // 다음 분기 목표
  });

  it('매출이 있으면 매출 성장 목표 — 직전 분기의 105%에 못 미치면 신뢰↓', () => {
    const s = withBoard(15);
    for (const m of [12, 13, 14]) s.history.reports.push(rep(m, 100_000_000, 1e10));
    runBoard(s, rep(15));
    const d = s.finance.board!.demands[0]!;
    expect(d.id).toBe('revenue_growth');
    for (const m of [15, 16, 17]) s.history.reports.push(rep(m, 102_000_000, 1e10)); // +2% — 미달
    expect(quarterRevenue(s, 17)).toBe(306_000_000);
    s.month = 18;
    runBoard(s, rep(18));
    expect(s.finance.board!.confidence).toBe(BOARD.startConfidence - BOARD.missLoss);
  });

  it('외부 지분 50%↑에서 신뢰가 0이 되면 해임된다 — 50% 미만이면 신뢰가 0이어도 계속', () => {
    const run = (share: number) => {
      const s = withBoard(15, share);
      s.finance.board!.confidence = 10;
      s.finance.board!.demands = [{ id: 'cash_buffer', label: 't', dueMonth: 14 }];
      s.history.reports.push(rep(14, 0, 0));
      s.finance.cash = 0;
      runBoard(s, rep(15));
      return s;
    };
    const hi = run(0.6);
    expect(hi.status).toBe('dismissed');
    expect(hi.progress.ending?.reason).toBe('dismissed');
    const lo = run(0.325);
    expect(lo.status).toBe('running');
    expect(lo.finance.board!.confidence).toBe(0);
  });

  it('이사회가 없으면 아무 일도 없고, MVP는 투자가 잠겨 있어 이사회가 생기지 않는다', () => {
    const s = newGame({ seed: 1 });
    const r = rep(0);
    runBoard(s, r);
    expect(s.finance.board).toBeUndefined();
    expect(r.notes).toEqual([]);
    const m = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    expect(applyAction(m, { type: 'takeInvestment', offerId: 'angel' }).error).toMatch(/시나리오/);
  });
});
