// [결정 #377] 보충 잇기 — 부분집합이면 잇고, 목록에 없던 레시피가 섞이면 잇되 σ를 넓히고, 겹침이 없으면 잇지 않는다 (MKT 셈 2026-11-24)
import { describe, expect, it } from 'vitest';
import { newRecipeShare, restockPrior, RESTOCK_NEW_RECIPE_SIGMA, RESTOCK_PRIOR_SIGMA_FLOOR } from './productView';
import { recipeSharesOf } from './blending';
import { newScenarioGame } from './newScenario';
import type { GameState, Product, SpiritLot } from './types';

// 9차 「블랜디드 퍼스트 배치」 꼴 — 제품 R8 · R9 · R94, 리뷰 9건 · ±3
const product = (extra: Partial<Product> = {}): Product => ({ id: 'BF', name: '블랜디드 퍼스트 배치', category: 'blended_whisky', quality: 68.2, recipeIds: ['R8', 'R9', 'R94'], qualityKnown: { est: 60.5, sigma: 3, reviews: 9, month: 60 }, stockBottles: 100, ...extra }) as unknown as Product;
const st = (p: Product, rulesVersion: 'v16' | 'legacy-v15' = 'v16') => ({ rulesVersion, commerce: { products: [p] } }) as unknown as GameState;

describe('#377 restockPrior', () => {
  it('(1) 부분집합 — R8 · R94 보충은 그대로 잇는다(σ는 지금 값, 하한은 병입 쪽이 건다)', () => {
    const p = product();
    expect(restockPrior(st(p), p, [{ recipeId: 'R8', lpa: 10 }, { recipeId: 'R94', lpa: 30 }])).toEqual({ est: 60.5, sigma: 3, newShare: 0 });
    expect(restockPrior(st(p), p, ['R8'])).toEqual({ est: 60.5, sigma: 3, newShare: 0 }); // 문자열 목록 호환
  });
  it('(2) 새 몫 0.5 — 잇되 σ = √(max(σ,4)² + (0.5 × 15)²), 평균 그대로', () => {
    const p = product();
    const r = restockPrior(st(p), p, [{ recipeId: 'R8', lpa: 20 }, { recipeId: 'R10', lpa: 20 }])!;
    expect(r.est).toBe(60.5);
    expect(r.newShare).toBeCloseTo(0.5, 9);
    expect(r.sigma).toBeCloseTo(Math.sqrt(RESTOCK_PRIOR_SIGMA_FLOOR ** 2 + (0.5 * RESTOCK_NEW_RECIPE_SIGMA) ** 2), 9); // ≈ 8.5
    // 새 몫이 작으면 조금만 넓힌다
    expect(restockPrior(st(p), p, [{ recipeId: 'R8', lpa: 90 }, { recipeId: 'R10', lpa: 10 }])!.sigma).toBeCloseTo(Math.sqrt(16 + 1.5 ** 2), 9);
  });
  it('(3) 겹침 없음 · 제품 레시피 기록 없음 · 빈 원액은 잇지 않는다', () => {
    const p = product();
    expect(restockPrior(st(p), p, [{ recipeId: 'R10', lpa: 5 }])).toBeUndefined();
    expect(restockPrior(st(p), p, [])).toBeUndefined();
    const old = product({ recipeIds: undefined });
    expect(restockPrior(st(old), old, ['R8'])).toBeUndefined();
  });
  it('레시피 기록 없는 원액(매입 등)의 몫은 목록에 없는 몫으로 센다', () => {
    expect(newRecipeShare(product(), [{ recipeId: 'R8', lpa: 3 }, { recipeId: '', lpa: 1 }])).toBeCloseTo(0.25, 9);
  });
});

describe('#377 recipeSharesOf', () => {
  it('레시피별 LPA(리터 × 도수) · 레시피 없는 원액은 \'\'', () => {
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 1 });
    const lot = (id: string, recipeId: string | undefined, abv: number): SpiritLot => ({ id, name: id, kind: 'malt', volumeL: 100, abv, flavor: {}, createdMonth: 0, oakMonths: 0, sourced: !recipeId, costPerLPA: 1, ...(recipeId ? { recipeId } : {}) });
    s.inventory.lots.push(lot('A', 'R8', 0.6), lot('B', 'R8', 0.7), lot('C', undefined, 0.5));
    expect(recipeSharesOf(s, [{ source: 'lot', id: 'A', liters: 10 }, { source: 'lot', id: 'B', liters: 10 }, { source: 'lot', id: 'C', liters: 4 }, { source: 'lot', id: 'A', liters: 0 }]))
      .toEqual([{ recipeId: '', lpa: 2 }, { recipeId: 'R8', lpa: 13 }]);
  });
});
