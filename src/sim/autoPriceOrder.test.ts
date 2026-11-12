import { describe, expect, it } from 'vitest';
import { applyAutoPrices, AUTO_PRICE_MAX_ROUNDS, bestAutoPrice } from './economics';
import type { GameState, Product } from './types';
import { newScenarioGame } from './newScenario';

// TECH-01 (AP3-ARCH-1) — 자동 가격이 제품을 차례로 정해 배열 순서가 결과를 바꿨다(A 먼저 → B 6,500원, B 먼저 → B 5,800원).
// S6([결정 #295])에서 공유 스냅샷으로 고치고, 값이 더 안 바뀔 때까지 최대 3회 되풀이한다([결정 #298], architecture §10.9 ④)

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

/** 공유 스냅샷 한 회차 — 테스트에서 기대값을 손으로 만든다 */
function oneRound(s: GameState): void {
  const picks = s.commerce.products.filter((p) => p.autoPrice).map((p) => [p, bestAutoPrice(s, p, 1)] as const);
  for (const [p, v] of picks) if (v != null) p.price = v;
}

describe('자동 가격 순서 의존 (TECH-01) · 수렴 ([결정 #298])', () => {
  it('배열 순서를 바꿔도 결과가 같다', () => {
    const ab = game('ab'), ba = game('ba');
    applyAutoPrices(ab, 1); applyAutoPrices(ba, 1);
    expect(prices(ba)).toEqual(prices(ab));
  });

  it('수렴하면 그 고정점에서 멈춘다 — 한 회차 더 돌려도 값이 같다', () => {
    const s = game('ab');
    const rounds = applyAutoPrices(s, 1);
    expect(rounds).toBeLessThanOrEqual(AUTO_PRICE_MAX_ROUNDS);
    const again = structuredClone(s); oneRound(again);
    if (rounds < AUTO_PRICE_MAX_ROUNDS) expect(prices(again)).toEqual(prices(s));
  });

  it('마지막 회차 규칙 — 2주기로 진동하는 형제 쌍은 3회째 값으로 끝나고, 결정적이며 순서와 무관하다', () => {
    // 탐색(2,048조합)에서 찾은 진동 쌍: 6,800/6,800 ↔ 6,100/7,500 을 끝없이 오간다
    const pair = (rev: boolean) => {
      const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
      const a = { ...BASE, id: 'A', name: 'A', quality: 45, stockBottles: 50, price: 9000 } as Product;
      const b = { ...BASE, id: 'B', name: 'B', quality: 55, stockBottles: 50, price: 9000 } as Product;
      s.commerce.products = rev ? [b, a] : [a, b];
      return s;
    };
    const manual = pair(false);
    const seq: Record<string, number>[] = [];
    for (let i = 0; i < 4; i++) { oneRound(manual); seq.push(prices(manual)); }
    expect(seq[0]).toEqual({ A: 6800, B: 6800 });
    expect(seq[1]).toEqual({ A: 6100, B: 7500 });
    expect(seq[2]).toEqual(seq[0]); // 진동 — 수렴하지 않는다
    expect(seq[3]).toEqual(seq[1]);
    const s = pair(false), r = pair(true);
    expect(applyAutoPrices(s, 1)).toBe(AUTO_PRICE_MAX_ROUNDS);
    applyAutoPrices(r, 1);
    expect(prices(s)).toEqual(seq[2]); // 3회째 값
    expect(prices(r)).toEqual(seq[2]);
  });
});
