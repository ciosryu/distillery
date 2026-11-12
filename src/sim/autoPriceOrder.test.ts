import { describe, expect, it } from 'vitest';
import { applyAutoPrices } from './economics';
import type { GameState, Product } from './types';
import { newScenarioGame } from './newScenario';

// TECH-01 (AP3-ARCH-1) — 자동 가격이 제품을 차례로 정해서 배열 순서가 결과를 바꾼다. 먼저 실패 테스트로 고정한다(architecture §10.9).
// 고치면 it.fails → it 으로 바꾼다

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
  it('지금 동작 — A 먼저면 B 6,500원, B 먼저면 B 5,800원(A는 둘 다 6,500원)', () => {
    const ab = game('ab'), ba = game('ba');
    applyAutoPrices(ab, 1); applyAutoPrices(ba, 1);
    expect(prices(ab)).toEqual({ A: 6500, B: 6500 });
    expect(prices(ba)).toEqual({ A: 6500, B: 5800 });
  });
  it.fails('배열 순서를 바꿔도 결과가 같아야 한다 — 지금은 다르다(고칠 대상)', () => {
    const ab = game('ab'), ba = game('ba');
    applyAutoPrices(ab, 1); applyAutoPrices(ba, 1);
    expect(prices(ba)).toEqual(prices(ab));
  });
});
