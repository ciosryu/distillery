import { describe, expect, it } from 'vitest';
import { applyAutoPrices, AUTO_PRICE_MAX_ROUNDS } from './economics';
import type { GameState, Product } from './types';
import { newScenarioGame } from './newScenario';

// TECH-01 (AP3-ARCH-1) — 자동 가격이 제품을 차례로 정해 배열 순서가 결과를 바꿨다(A 먼저 → B 6,500원, B 먼저 → B 5,800원).
// S6([결정 #295])에서 고쳤다 — id 순 Gauss-Seidel, 값이 더 안 바뀔 때까지 최대 3바퀴([결정 #298] 수정안 [제안 P-ARCH-54], architecture §10.9 ④)

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

describe('자동 가격 순서 의존 (TECH-01) · 수렴 ([제안 P-ARCH-54] Gauss-Seidel)', () => {
  it('배열 순서를 바꿔도 결과가 같다', () => {
    const ab = game('ab'), ba = game('ba');
    applyAutoPrices(ab, 1); applyAutoPrices(ba, 1);
    expect(prices(ba)).toEqual(prices(ab));
  });

  it('여러 형제 조합(2~3제품, 품질·재고·시작 값)에서 3바퀴 안에 고정점에 닿고, 역순 배열도 같은 값', () => {
    // 같은 진열 공헌을 좌표 상승으로 올리므로 진동하지 않는다[추론] — 탐색 7,500조합에서 3바퀴 안에 수렴하지 않은 경우 0건(2026-11-12)
    let n = 0;
    for (const qa of [45, 60, 75]) for (const qb of [45, 60, 75]) for (const qc of [0, 55]) for (const sa of [50, 300]) for (const pa of [5000, 9000]) {
      const mk = (rev: boolean) => {
        const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
        const ps = [{ ...BASE, id: 'A', quality: qa, stockBottles: sa, price: pa }, { ...BASE, id: 'B', quality: qb, stockBottles: 100 }, ...(qc ? [{ ...BASE, id: 'C', quality: qc, stockBottles: 60 }] : [])] as Product[];
        s.commerce.products = rev ? ps.reverse() : ps;
        return s;
      };
      const a = mk(false), b = mk(true);
      expect(applyAutoPrices(a, 1)).toBeLessThan(AUTO_PRICE_MAX_ROUNDS + 1);
      applyAutoPrices(b, 1);
      expect(prices(b)).toEqual(prices(a));
      const again = structuredClone(a);
      expect(applyAutoPrices(again, 1)).toBe(1); // 고정점 — 한 바퀴 더 돌려도 바뀌지 않는다
      n++;
    }
    expect(n).toBe(72);
  });
});
