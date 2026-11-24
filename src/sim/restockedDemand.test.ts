// 품절 배지 「다시 채우면 수요 약 n병」 — 같은 범주와 나눈 뒤 값 (9차 134개월째 MKT 분석 · market.ts restockedDemand)
import { describe, expect, it } from 'vitest';
import type { GameState } from './types';
describe('restockedDemand — 품절 배지 「다시 채우면 수요 약 n병」은 같은 범주와 나눈 뒤 값 (9차 134개월째 MKT 분석)', () => {
  const mk = async () => {
    const { newScenarioGame } = await import('./newScenario');
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 5, rules: 'v16' });
    s.month = 40;
    const base = { category: 'whisky', ageYears: 3, oakMonths: 36, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 65, typicity: 70, style: null, sourcedShare: 0, price: 60_000, unitCost: 20_000, createdMonth: 30, lastMonthSold: 30, totalSold: 300 };
    s.commerce.products.push({ ...base, id: 'A', name: '팔리는 몰트', stockBottles: 400 } as GameState['commerce']['products'][number]);
    s.commerce.products.push({ ...base, id: 'B', name: '품절 몰트', stockBottles: 0 } as GameState['commerce']['products'][number]);
    return s;
  };
  it('다시 채운 판(재고 1병)에서 domesticDemands가 세는 값과 같다', async () => {
    const { restockedDemand, domesticDemands } = await import('./market');
    const s = await mk();
    const b = s.commerce.products.find((p) => p.id === 'B')!;
    const filled = structuredClone(s); filled.commerce.products.find((p) => p.id === 'B')!.stockBottles = 1;
    expect(restockedDemand(s, b, 5).demandBottles).toBeCloseTo(domesticDemands(filled, 5).get('B')!.demandBottles, 6);
  });
  it('나누기 전 값(demandFor split 1)보다 작다 — 같은 범주 제품이 손님을 나눈다', async () => {
    const { restockedDemand, demandFor } = await import('./market');
    const s = await mk();
    const b = s.commerce.products.find((p) => p.id === 'B')!;
    expect(restockedDemand(s, b, 5).demandBottles).toBeLessThan(demandFor(s, b, 1, 5).demandBottles);
  });
  it('재고 있는 제품은 domesticDemands와 같다', async () => {
    const { restockedDemand, domesticDemands } = await import('./market');
    const s = await mk();
    const a = s.commerce.products.find((p) => p.id === 'A')!;
    expect(restockedDemand(s, a, 5).demandBottles).toBeCloseTo(domesticDemands(s, 5).get('A')!.demandBottles, 6);
  });
});
