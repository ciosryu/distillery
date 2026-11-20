// 탱크 소주까지 센 소주 재고 (7차 판 P-PROD-62 후보) — 할 일은 제품 재고만 세서 탱크에 판매 22~36개월 치가 있어도 "1.7개월 치"로 보였다
import { describe, expect, it } from 'vitest';
import { applyAction, advanceMonth, type GameState } from './index';
import { sojuSupply, STANDARD_BOTTLE } from './economics';
import { newScenarioGame } from './newScenario';

function sojuGame(batches: number): GameState {
  let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 1 });
  const soju = s.production.recipes.find((r) => r.kind === 'soju')!;
  const x = applyAction(s, { type: 'setOrder', recipeId: soju.id, batchesPerMonth: batches });
  if (x.error) throw new Error(x.error);
  s = x.state;
  for (let m = 0; m < 2; m++) s = advanceMonth(s);
  return s;
}

describe('sojuSupply — 탱크 소주를 표준 병으로 더한 재고 개월', () => {
  it('탱크 소주를 375ml·25% 병으로 환산하고, 판매가 없으면 개월 수는 null', () => {
    const s = sojuGame(1);
    const v = sojuSupply(s);
    const lpa = s.inventory.lots.filter((l) => l.kind === 'soju').reduce((t, l) => t + l.volumeL * l.abv, 0);
    expect(v.tankL).toBeGreaterThan(0);
    expect(v.tankBottles).toBe(Math.floor(lpa / ((STANDARD_BOTTLE.soju.bottleMl / 1000) * STANDARD_BOTTLE.soju.abv)));
    expect(v.months).toBeNull();
    expect(v.madeBottlesPerMonth).toBeGreaterThan(0);
    expect(v.costPerBatch).toBeGreaterThan(0);
    expect(v.costPerMonth).toBe(v.costPerBatch);
  });
  it('(제품 + 탱크) ÷ 최근 3개월 평균 판매 · 지시 0이면 새로 만드는 병·생산비 0', () => {
    let s = sojuGame(2);
    const soju = s.production.recipes.find((r) => r.kind === 'soju')!;
    s = applyAction(s, { type: 'setOrder', recipeId: soju.id, batchesPerMonth: 0 }).state;
    const p = { id: 'PX', category: 'soju_distilled', stockBottles: 300 } as unknown as GameState['commerce']['products'][number];
    s = { ...s, commerce: { ...s.commerce, products: [...s.commerce.products, p] },
      history: { ...s.history, reports: s.history.reports.map((r, i, a) => (i >= a.length - 3 ? { ...r, sales: [...r.sales, { productId: 'PX', bottles: 100 } as (typeof r.sales)[number]] } : r)) } };
    const v = sojuSupply(s);
    const base = s.history.reports.slice(-3).reduce((t, r) => t + r.sales.filter((x) => x.productId !== 'PX' && s.commerce.products.find((q) => q.id === x.productId)?.category === 'soju_distilled').reduce((u, x) => u + x.bottles, 0), 0) / 3;
    expect(v.perMonth).toBeCloseTo(base + 100);
    expect(v.months).toBeCloseTo((v.productBottles + v.tankBottles) / v.perMonth);
    expect(v.madeBottlesPerMonth).toBe(0);
    expect(v.costPerMonth).toBe(0);
    expect(v.costPerBatch).toBeNull();
  });
});
