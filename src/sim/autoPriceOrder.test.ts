import { describe, expect, it } from 'vitest';
import { applyAutoPrices } from './economics';
import type { GameState, Product } from './types';
import { newScenarioGame } from './newScenario';

// TECH-01 (AP3-ARCH-1) — 자동 가격이 제품을 차례로 정해 배열 순서가 결과를 바꿨다(A 먼저 → B 6,500원, B 먼저 → B 5,800원).
// S6([결정 #295])에서 공유 스냅샷으로 고쳤다 — 모든 제품이 같은 판매 전 진열을 보고 정한다(architecture §10.9 ④)

const BASE: Product = { id: 'P', name: 'p', category: 'soju_distilled', ageYears: null, oakMonths: 0, abv: 0.25, bottleMl: 375, chillFiltered: true, packagingId: 'standard', flavor: { cereal: 20 }, quality: 60, typicity: 60, style: null, sourcedShare: 0, stockBottles: 3000, price: 9000, unitCost: 3000, createdMonth: 0, lastMonthSold: 0, totalSold: 0, autoPrice: true } as never;

function game(order: 'ab' | 'ba'): GameState {
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
  // 탐색(품질 3 × 재고 3 × 3 × 값 3, 243조합)에서 189조합이 순서에 따라 갈렸다 — 그중 하나
  const a = { ...BASE, id: 'A', name: 'A', quality: 50, stockBottles: 100, price: 5000 } as Product;
  const b = { ...BASE, id: 'B', name: 'B', quality: 50, stockBottles: 100 } as Product;
  s.commerce.products = order === 'ab' ? [a, b] : [b, a];
  return s;
}
const prices = (s: GameState) => Object.fromEntries(s.commerce.products.map((p) => [p.id, p.price]));

describe('자동 가격 순서 의존 (TECH-01)', () => {
  it('공유 스냅샷 — B는 A의 지난 값(5,000원)을 보고 정한다(차례로 정하던 때 B 먼저의 값과 같다)', () => {
    const ab = game('ab');
    applyAutoPrices(ab, 1);
    expect(prices(ab)).toEqual({ A: 6500, B: 5800 });
  });
  it('배열 순서를 바꿔도 결과가 같다 — S6 공유 스냅샷', () => {
    const ab = game('ab'), ba = game('ba');
    applyAutoPrices(ab, 1); applyAutoPrices(ba, 1);
    expect(prices(ba)).toEqual(prices(ab));
  });
});
