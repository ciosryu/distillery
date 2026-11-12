import { describe, expect, it } from 'vitest';
import { bestAutoPrice, currentSuggested } from './economics';
import { decidePolicyPrice, guardFactor, PRICE_POLICY, profitTarget, stockMonths, zeroSalesRun } from './pricePolicy';
import { newScenarioGame } from './newScenario';
import type { GameState, MonthReport, Product } from './types';

// REQ-MKT-9 (AUTO-PRICE-3, 결정 #291) — MKT 정책 함수의 불변식. 엔진(틱 연결·공유 스냅샷·옛 세이브 = A·정책 끈 판 바이트 동일)은 ARCH 테스트 몫
const BASE: Product = { id: 'P', name: 'p', category: 'soju_distilled', ageYears: null, oakMonths: 0, abv: 0.25, bottleMl: 375, chillFiltered: true, packagingId: 'standard', flavor: { cereal: 20 }, quality: 60, typicity: 60, style: null, sourcedShare: 0, stockBottles: 3000, price: 9000, unitCost: 3000, createdMonth: 0, lastMonthSold: 0, totalSold: 0 } as never;

function game(products: Partial<Product>[], month = 12): GameState {
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
  s.commerce.products = products.map((x, i) => ({ ...BASE, id: `P${i}`, name: `p${i}`, ...x }) as Product);
  s.month = month;
  return s;
}
const sug = (s: GameState, p: Product) => currentSuggested(s, p);

describe('AUTO-PRICE-3 정책 함수 (REQ-MKT-9)', () => {
  it('A 현금회전 = 지금 자동 가격(#200)과 같은 값 — 범위를 따로 정하지 않으면 바이트까지 같다', () => {
    for (const price of [3000, 9000, 20000]) for (const stock of [50, 3000]) {
      const s = game([{ price, stockBottles: stock }, { price: 7000, quality: 70 }]);
      const p = s.commerce.products[0]!;
      expect(decidePolicyPrice(s, p, { mode: 'turnover' }, 1).price).toBe(bestAutoPrice(s, p, 1));
    }
  });

  it('세 정책 모두 값이 범위 [min, max] × 기준가 안이다(불변식 ③)', () => {
    for (const mode of ['turnover', 'profit', 'premium'] as const) for (const [min, max] of [[0.8, 1.2], [1.0, 1.0], [1.5, 2]] as const) {
      const s = game([{ price: 9000 }, { price: 6000 }]);
      const p = s.commerce.products[0]!;
      const d = decidePolicyPrice(s, p, { mode, min, max, target: 1.3 }, 1);
      if (d.price == null) continue;
      const f = d.price / sug(s, p);
      expect(f).toBeGreaterThanOrEqual(min - 0.01); // 100원 반올림 오차
      expect(f).toBeLessThanOrEqual(max + 0.01);
    }
  });

  it('범위가 틀리면(min > max) 값을 바꾸지 않는다', () => {
    const s = game([{}]);
    expect(decidePolicyPrice(s, s.commerce.products[0]!, { mode: 'profit', min: 1.5, max: 1.2 }, 1).price).toBeNull();
  });

  it('병당 공헌 ≤ 0인 값은 고르지 않는다(불변식 ②) — 원가가 범위 상한보다 비싸면 그대로 두고 사유를 남긴다', () => {
    const s = game([{ unitCost: 10_000_000 }]);
    for (const mode of ['turnover', 'profit', 'premium'] as const) {
      const d = decidePolicyPrice(s, s.commerce.products[0]!, { mode }, 1);
      expect(d.price).toBeNull();
    }
  });

  it('면세 한정판·재고 0은 건드리지 않는다(불변식 ⑥)', () => {
    const s = game([{ dutyFreeOnly: true }, { stockBottles: 0 }]);
    for (const p of s.commerce.products) for (const mode of ['turnover', 'profit', 'premium'] as const) expect(decidePolicyPrice(s, p, { mode }, 1).price).toBeNull();
  });

  it('B 가드 — lastFactor에서 한 달에 한 단계(±0.1)만 움직인다', () => {
    const s = game([{ price: 3000, stockBottles: 50 }, { price: 9000 }]);
    const p = s.commerce.products[0]!;
    const want = profitTarget(s, p, 1)! / sug(s, p);
    for (const last of [0.8, 1.0, 1.3, 1.9]) {
      const d = decidePolicyPrice(s, p, { mode: 'profit', lastFactor: last }, 1);
      if (d.price == null) continue;
      expect(Math.abs(d.factor! - last)).toBeLessThanOrEqual(PRICE_POLICY.step + 0.01);
      if (Math.abs(want - last) <= PRICE_POLICY.step) expect(d.factor!).toBeCloseTo(want, 1);
    }
  });

  it('B 가드 기준은 지금 값이 아니라 lastFactor — 보충으로 값이 기준가 ×1로 돌아간 달에도 묶이지 않는다(MKT 0a182d1 회귀)', () => {
    const s = game([{ stockBottles: 50 }, { price: 9000 }]);
    const p = s.commerce.products[0]!;
    p.price = Math.round(sug(s, p)); // 보충이 값을 기준가로 되돌린 달
    const d = decidePolicyPrice(s, p, { mode: 'profit', lastFactor: 1.6 }, 1);
    if (d.price != null) expect(d.factor!).toBeGreaterThanOrEqual(1.5 - 0.01);
  });

  it('guardFactor는 base ± step 안으로 자른다', () => {
    expect(guardFactor(2, 1.3, 0.1)).toBeCloseTo(1.4);
    expect(guardFactor(0.6, 1.3, 0.1)).toBeCloseTo(1.2);
    expect(guardFactor(1.35, 1.3, 0.1)).toBeCloseTo(1.35);
  });

  it('C — 처음 켠 달은 목표(기본 n = ×1.3)로, 그 뒤 분기 경계가 아니면 그대로', () => {
    const s = game([{ price: 9000 }], 13); // 13 % 3 ≠ 0
    const p = s.commerce.products[0]!;
    const first = decidePolicyPrice(s, p, { mode: 'premium' }, 1);
    expect(first.factor!).toBeCloseTo(PRICE_POLICY.n, 1);
    expect(decidePolicyPrice(s, p, { mode: 'premium', lastFactor: 1.3 }, 1).price).toBeNull();
  });

  it('C — 분기 경계에서 적체(재고 > 9개월치)면 한 단계 내리고, 하한은 목표 × 0.9', () => {
    const s = game([{ price: 9000, stockBottles: 10_000, salesEma: 100 }], 12);
    const p = s.commerce.products[0]!;
    expect(stockMonths(p)).toBeGreaterThan(PRICE_POLICY.premiumOverstockMonths);
    const d = decidePolicyPrice(s, p, { mode: 'premium', target: 1.5, lastFactor: 1.5 }, 1);
    expect(d.factor!).toBeCloseTo(1.4, 1);
    const floor = decidePolicyPrice(s, p, { mode: 'premium', target: 1.5, lastFactor: 1.36 }, 1);
    expect(floor.factor!).toBeCloseTo(1.35, 1); // 1.5 × 0.9
  });

  it('C — 국내 판매 0이 3개월이면 하한을 목표 × 0.8까지 낮춘다(판매 0 고착 방지, 엣지 ②)', () => {
    const s = game([{ price: 9000 }], 12);
    const p = s.commerce.products[0]!;
    const empty = (m: number) => ({ month: m, sales: [{ productId: p.id, name: p.name, bottles: 0, revenue: 0, demandBottles: 0 }] }) as unknown as MonthReport;
    s.history.reports = [empty(9), empty(10), empty(11)];
    expect(zeroSalesRun(s, p.id)).toBe(3);
    const d = decidePolicyPrice(s, p, { mode: 'premium', target: 1.5, lastFactor: 1.26 }, 1);
    expect(d.factor!).toBeCloseTo(1.2, 1); // 1.5 × 0.8
  });

  it('같은 입력이면 같은 값(결정론, 불변식 ①)', () => {
    for (const mode of ['turnover', 'profit', 'premium'] as const) {
      const a = decidePolicyPrice(game([{}, { price: 6000 }]), game([{}, { price: 6000 }]).commerce.products[0]!, { mode }, 1);
      const b = decidePolicyPrice(game([{}, { price: 6000 }]), game([{}, { price: 6000 }]).commerce.products[0]!, { mode }, 1);
      expect(a).toEqual(b);
    }
  });
});
