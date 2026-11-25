// [결정 #410] T8 품절 손실 어림 — 결산 `stockoutDemand` (MKT · market.ts stockoutDemands, docs/playtest/9/mkt.md §4)
import { describe, expect, it } from 'vitest';
import type { GameState, MonthReport } from './types';

type P = GameState['commerce']['products'][number];
const soldIn = (month: number, ids: string[]): MonthReport =>
  ({ month, revenue: 0, expenses: {}, netCash: 0, cashEnd: 0, sales: ids.map((productId) => ({ productId, name: productId, bottles: 50, revenue: 0, demandBottles: 50 })), production: [], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] }) as unknown as MonthReport;

describe('stockoutDemand — 판매 전 재고 0 · 최근 6개월 안에 팔린 진열 제품의 「다시 채웠다면 수요」 (T8 · #410)', () => {
  const mk = async () => {
    const { newScenarioGame } = await import('./newScenario');
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 5, rules: 'v16' });
    s.month = 40;
    const base = { category: 'whisky', ageYears: 3, oakMonths: 36, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 65, typicity: 70, style: null, sourcedShare: 0, price: 60_000, unitCost: 20_000, createdMonth: 20, lastMonthSold: 0, totalSold: 300 };
    s.commerce.products.push({ ...base, id: 'A', name: '팔리는 몰트', stockBottles: 400 } as P);
    s.commerce.products.push({ ...base, id: 'B', name: '품절 몰트', stockBottles: 0 } as P);
    s.commerce.products.push({ ...base, id: 'C', name: '그만 판 몰트', stockBottles: 0 } as P);
    // C는 7개월 전에 마지막으로 팔렸고, B는 2개월 전, A는 매달
    s.history.reports = [soldIn(33, ['A', 'C']), ...[34, 35, 36, 37, 38, 39].map((m) => soldIn(m, m === 38 ? ['A', 'B'] : ['A']))];
    return s;
  };

  it('B만 적힌다 — 값은 restockedDemand(품절 배지와 같은 셈)의 반올림. 재고 있는 A · 6개월 넘게 안 판 C는 빠진다', async () => {
    const { stockoutDemands, restockedDemand } = await import('./market');
    const s = await mk();
    const b = s.commerce.products.find((p) => p.id === 'B')!;
    const out = stockoutDemands(s, 5);
    expect(out.map((x) => x.productId)).toEqual(['B']);
    expect(out[0]!.bottles).toBe(Math.round(restockedDemand(s, b, 5).demandBottles));
    expect(out[0]!.bottles).toBeGreaterThan(0);
  });

  it('상태를 바꾸지 않는다(기록만)', async () => {
    const { stockoutDemands } = await import('./market');
    const s = await mk();
    const before = structuredClone(s);
    stockoutDemands(s, 5);
    expect(s).toEqual(before);
  });

  it('월 진행 결산에 실린다 — 재고 있는 제품만 있으면 필드가 없다', async () => {
    const { advanceMonth } = await import('./step');
    const s = await mk();
    const r = advanceMonth(s).history.reports.at(-1)!;
    expect(r.stockoutDemand?.map((x) => x.productId)).toEqual(['B']);
    const t = await mk();
    t.commerce.products = t.commerce.products.filter((p) => p.id === 'A');
    expect(advanceMonth(t).history.reports.at(-1)!.stockoutDemand).toBeUndefined();
  });
});
