import { describe, expect, it } from 'vitest';
import { applyAction, monthlyFixedCost, newScenarioGame } from './index';
import { monthlyFixedBreakdown } from './loans';

// 매달 나가는 돈 (#181 안 A) — 내역의 합은 월 고정비 예상과 같다

describe('월 고정비 내역 (#181)', () => {
  it('MVP 판: 내역 합 = monthlyFixedCost, 마케팅은 조절 가능 줄로 늘 보인다', () => {
    let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 500_000_000, seed: 1 });
    const parts = monthlyFixedBreakdown(s);
    expect(parts.reduce((t, p) => t + p.amount, 0)).toBeCloseTo(monthlyFixedCost(s), 6);
    expect(parts.find((p) => p.id === 'marketing')?.adjustable).toBe(true);
    s = applyAction(s, { type: 'setMarketing', amount: 0 }).state;
    const zero = monthlyFixedBreakdown(s);
    expect(zero.find((p) => p.id === 'marketing')?.amount).toBe(0);
    expect(zero.reduce((t, p) => t + p.amount, 0)).toBeCloseTo(monthlyFixedCost(s), 6);
  });
});
