import { describe, expect, it } from 'vitest';
import { EQUIPMENT } from './content/catalog';
import { applyAction, heatingCost, monthlyFixedCost, newGame, newScenarioGame } from './index';
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

  // #100 검토에서 넘어온 것 — 예상이 다음 결산이 실제로 낼 돈과 맞아야 한다
  it('겨울 난방비(홋카이도)는 그 달에만 예상에 들어간다', () => {
    const jan = newGame({ seed: 1, region: 'JP', site: 'hokkaido' }); // month 0 = 1월
    const jun = { ...jan, month: 5 };
    expect(heatingCost(jan, 1)).toBeGreaterThan(0);
    expect(monthlyFixedBreakdown(jan).find((p) => p.id === 'heating')?.amount).toBe(heatingCost(jan, 1));
    expect(monthlyFixedBreakdown(jun).find((p) => p.id === 'heating')).toBeUndefined();
    expect(monthlyFixedCost(jan) - monthlyFixedCost(jun)).toBe(heatingCost(jan, 1));
  });

  it('짓는 중인 설비의 유지비는 완공 전까지 예상에 없다', () => {
    const s = newGame({ seed: 1 });
    const id = Object.keys(EQUIPMENT).find((k) => (EQUIPMENT[k].maintenance ?? 0) > 0)!;
    const base = monthlyFixedCost(s);
    const building = { ...s, production: { ...s.production, equipment: [...s.production.equipment, { ...s.production.equipment[0], catalogId: id, readyMonth: s.month + 3 }] } };
    expect(monthlyFixedCost(building)).toBe(base);
    expect(monthlyFixedCost({ ...building, month: s.month + 3 })).toBe(monthlyFixedCost({ ...s, month: s.month + 3 }) + EQUIPMENT[id].maintenance);
  });

  it('마케팅 줄은 입력칸이 바꾸는 하우스 예산만, 세컨드 브랜드는 따로', () => {
    let s = newGame({ seed: 1 });
    s = applyAction(s, { type: 'setMarketing', amount: 3_000_000 }).state;
    const parts = monthlyFixedBreakdown(s);
    expect(parts.find((p) => p.id === 'marketing')?.amount).toBe(s.commerce.marketingBudget);
    expect(parts.find((p) => p.id === 'secondBrand')).toBeUndefined(); // 세컨드 브랜드가 없으면 줄도 없다
  });
});
