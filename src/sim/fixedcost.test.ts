import { describe, expect, it } from 'vitest';
import { EQUIPMENT } from './content/catalog';
import { applyAction, heatingCost, monthlyFixedCost, newGame, newScenarioGame } from './index';
import { marketingOutlook, monthlyFixedBreakdown, recentHouseRevenue } from './loans';
import { AWARENESS } from './market';

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

  // P-MGT-13 — 마케팅 예산의 앞날 (mvp.md §7.7)
  it('마케팅 앞날: 예산이 클수록 3년 뒤 수요 배수가 크고, 상태는 그대로', () => {
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const before = JSON.stringify(s);
    const muls = [0, 1_000_000, 3_000_000, 5_000_000].map((b) => marketingOutlook(s, b).demandMul);
    for (let i = 1; i < muls.length; i++) expect(muls[i]).toBeGreaterThan(muls[i - 1]!);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('마케팅 앞날 한 달 = 인지도 갱신식 한 번 (판매 없음)', () => {
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const a0 = s.commerce.brands[0]!.awareness;
    const g = AWARENESS.marketing * Math.log10(1 + 3_000_000 / 1_000_000);
    const o = marketingOutlook(s, 3_000_000, 1);
    expect(o.awarenessNow).toBe(a0);
    expect(o.awareness).toBeCloseTo(a0 + g * (1 - a0) - AWARENESS.decay * a0, 10);
  });

  it('최근 하우스 매출 = 최근 n개월 판매 매출 합', () => {
    let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    expect(recentHouseRevenue(s)).toBe(0);
    const id = 'P-test';
    s = { ...s, commerce: { ...s.commerce, products: [...s.commerce.products, { id } as never] },
      history: { ...s.history, reports: [{ sales: [{ productId: id, revenue: 100 }] }, { sales: [{ productId: id, revenue: 50 }] }] as never } };
    expect(recentHouseRevenue(s, 12)).toBe(150);
    expect(recentHouseRevenue(s, 1)).toBe(50);
  });
});
