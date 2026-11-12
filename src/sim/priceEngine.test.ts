import { describe, expect, it } from 'vitest';
import { advanceMonth, applyAction, migrateSave, type GameState, type Product } from './index';
import { newScenarioGame } from './newScenario';
import { applyAutoPrices, bestAutoPrice, currentSuggested } from './economics';
import { priceModeOf, runPricePolicies } from './priceEngine';

// 자동 가격 3정책 엔진 ([결정 #291], architecture §10.9 ④) — 코어 ARCH. 정책 함수는 MKT pricePolicy.ts(decidePolicyPrice)

const P: Product = { id: 'P', name: 'p', category: 'soju_distilled', ageYears: null, oakMonths: 0, abv: 0.25, bottleMl: 375, chillFiltered: true, packagingId: 'standard', flavor: { cereal: 20 }, quality: 60, typicity: 60, style: null, sourcedShare: 0, stockBottles: 2000, price: 8000, unitCost: 3000, createdMonth: 0, lastMonthSold: 0, totalSold: 0 } as never;
function game(products: Partial<Product>[], months = 0): GameState {
  let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 3 });
  for (let i = 0; i < months; i++) s = advanceMonth(s);
  s.commerce.products = products.map((x, i) => ({ ...P, id: `P${i}`, name: `제품${i}`, ...x })) as Product[];
  return s;
}
const ok = (s: GameState, a: Parameters<typeof applyAction>[1]) => { const r = applyAction(s, a); expect(r.error).toBeUndefined(); return r.state; };

describe('3정책 엔진 — 명령 (setPricePolicy)', () => {
  it('옛 판(autoPrice만)은 A로 읽고 #200과 같은 값 · 상태에 새 값을 쓰지 않는다 · 옛 setAutoPrice on은 A로 되돌린다', () => {
    let s = game([{ autoPrice: true, price: 3000 }]);
    expect(priceModeOf(s.commerce.products[0]!)).toBe('turnover');
    const want = bestAutoPrice(s, s.commerce.products[0]!, 1);
    runPricePolicies(s, null, 1);
    expect(s.commerce.products[0]!.price).toBe(want);
    expect(s.commerce.products[0]!.pricePolicy).toBeUndefined();
    s = ok(s, { type: 'setPricePolicy', productId: 'P0', mode: 'profit' });
    expect(priceModeOf(s.commerce.products[0]!)).toBe('profit');
    s = ok(s, { type: 'setAutoPrice', productId: 'P0', on: true });
    expect(s.commerce.products[0]!.pricePolicy?.mode).toBe('turnover');
  });

  it("'all'은 면세 한정판을 빼고 건다 · 끄면 값은 그대로, 정책 그릇은 남는다 · C 기본 목표 1.3", () => {
    let s = game([{}, { dutyFreeOnly: true } as never, {}]);
    const r = applyAction(s, { type: 'setPricePolicy', productId: 'all', mode: 'premium' });
    expect(r.error).toBeUndefined();
    expect(r.message).toMatch(/면세 한정판 1개 제외/);
    s = r.state;
    expect(s.commerce.products.map((p) => !!p.autoPrice)).toEqual([true, false, true]);
    expect(s.commerce.products[0]!.pricePolicy).toMatchObject({ mode: 'premium', target: 1.3 });
    const prices = s.commerce.products.map((p) => p.price);
    s = ok(s, { type: 'setPricePolicy', productId: 'all', mode: null });
    expect(s.commerce.products.map((p) => p.price)).toEqual(prices);
    expect(s.commerce.products[0]!.autoPrice).toBeUndefined();
    expect(s.commerce.products[0]!.pricePolicy?.mode).toBe('premium');
  });

  it('틀린 범위·한계 밖·목표가 범위 밖이면 거절하고 아무것도 바꾸지 않는다', () => {
    const s = game([{}]);
    expect(applyAction(s, { type: 'setPricePolicy', productId: 'P0', mode: 'turnover', min: 1.5, max: 1.2 }).error).toMatch(/최소 배수가 최대/);
    expect(applyAction(s, { type: 'setPricePolicy', productId: 'P0', mode: 'turnover', max: 3 }).error).toMatch(/0.6~2/);
    expect(applyAction(s, { type: 'setPricePolicy', productId: 'P0', mode: 'premium', min: 1.0, max: 1.2, target: 1.5 }).error).toMatch(/목표 배수가 범위 밖/);
  });
});

describe('실행 — 공유 스냅샷·사유·범위 (엣지 ⑦)', () => {
  it('세 정책 × 범위(위·아래·안·min = max) — 결과는 늘 [min, max] × 기준가 안(100원 반올림 허용)', () => {
    for (const mode of ['turnover', 'profit', 'premium'] as const) {
      for (const [lo, hi] of [[1.0, 1.2], [1.5, 2], [0.6, 0.8], [1.1, 1.1]] as const) {
        const s = game([{ autoPrice: true, pricePolicy: { mode, min: lo, max: hi, target: Math.min(hi, Math.max(lo, 1.3)) } }], 1);
        const p = s.commerce.products[0]!;
        const before = p.price;
        runPricePolicies(s, null, 1);
        if (p.price === before) continue; // 이익 나는 값이 없으면 그대로(MKT 가드)
        const f = p.price / currentSuggested(s, p);
        expect(f).toBeGreaterThanOrEqual(lo - 0.02);
        expect(f).toBeLessThanOrEqual(hi + 0.02);
        expect(p.pricePolicy!.lastFactor).toBeCloseTo(f, 6);
      }
    }
  });

  it('배열 순서를 바꿔도 결과가 같다(id 순 Gauss-Seidel, 결정 #300) · 결산에 사유 한 줄', () => {
    const mk = (rev: boolean) => { const s = game([{ autoPrice: true, price: 5000, stockBottles: 100 }, { autoPrice: true, stockBottles: 100, pricePolicy: { mode: 'profit' } }, { autoPrice: true, pricePolicy: { mode: 'premium' } }], 1); if (rev) s.commerce.products.reverse(); return s; };
    const a = advanceMonth(mk(false)), b = advanceMonth(mk(true));
    const prices = (s: GameState) => Object.fromEntries(s.commerce.products.map((p) => [p.id, p.price]));
    expect(prices(b)).toEqual(prices(a));
    const log = a.history.reports.at(-1)!.priceLog ?? [];
    expect(log.length).toBeGreaterThan(0);
    for (const e of log) expect(e.why.length).toBeGreaterThan(0);
  });
});

describe('수렴 ([결정 #300] Gauss-Seidel) — 가드 기준은 바퀴 사이에 고정', () => {
  it('B는 여러 회차를 돌아도 그달 시작 lastFactor에서 한 단계(±0.1)를 넘지 않는다 · 확정 값으로만 lastFactor 갱신', () => {
    for (const start of [0.8, 1.3, 1.9]) {
      const s = game([{ autoPrice: true, stockBottles: 50, pricePolicy: { mode: 'profit', lastFactor: start } }, { autoPrice: true, stockBottles: 50, quality: 70, pricePolicy: { mode: 'profit', lastFactor: start } }], 1);
      runPricePolicies(s, null, 1);
      for (const p of s.commerce.products) {
        const f = p.price / currentSuggested(s, p);
        expect(Math.abs(f - start)).toBeLessThanOrEqual(0.1 + 0.02);
        expect(Math.abs(p.pricePolicy!.lastFactor! - start)).toBeLessThanOrEqual(0.1 + 0.02); // 100원 반올림 뒤 배수(MKT factor = 값 ÷ 기준가)
      }
    }
  });
});

describe('엔진 = economics.applyAutoPrices (옛 판 A, 결정 #300)', () => {
  it('옛 판(autoPrice만)은 economics.applyAutoPrices와 같은 값', () => {
    const a = game([{ autoPrice: true, price: 5000, stockBottles: 100 }, { autoPrice: true, stockBottles: 100, quality: 50 }, { autoPrice: true, quality: 75, stockBottles: 60 }], 1);
    const b = structuredClone(a);
    runPricePolicies(a, null, 1);
    applyAutoPrices(b, 1);
    expect(a.commerce.products.map((p) => p.price)).toEqual(b.commerce.products.map((p) => p.price));
  });
});

describe('불러오기 왕복 (엣지 ⑧)', () => {
  it('정책·목표·마지막 배수가 저장 → 불러오기 뒤 그대로 · 왕복 뒤 같은 달 결과가 바이트 동일', () => {
    let s = game([{}, {}, {}], 1);
    s = ok(s, { type: 'setPricePolicy', productId: 'P0', mode: 'premium', target: 1.5 });
    s = ok(s, { type: 'setPricePolicy', productId: 'P1', mode: 'turnover', min: 0.9, max: 1.4 });
    s = ok(s, { type: 'setPricePolicy', productId: 'P2', mode: 'profit' });
    s = advanceMonth(s);
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(loaded.commerce.products.map((p) => p.pricePolicy)).toEqual(s.commerce.products.map((p) => p.pricePolicy));
    expect(JSON.stringify(advanceMonth(loaded))).toBe(JSON.stringify(advanceMonth(s)));
  });

  it('모르는 정책은 A로 처리하되 값을 지우지 않고 사유에 적는다 · 한계 밖 배수는 불러올 때 자른다(메모)', () => {
    const s = game([{ autoPrice: true, price: 3000, pricePolicy: { mode: 'luxury' as never, target: 1.4 } }, { autoPrice: true, pricePolicy: { mode: 'turnover', max: 9 } }], 1);
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(loaded.commerce.products[0]!.pricePolicy).toEqual({ mode: 'luxury', target: 1.4 });
    expect(loaded.commerce.products[1]!.pricePolicy).toEqual({ mode: 'turnover', max: 2 });
    expect(loaded.history.reports.at(-1)!.notes.at(-1)).toMatch(/가격 정책 배수/);
    const next = advanceMonth(loaded);
    expect(next.history.reports.at(-1)!.priceLog!.find((e) => e.productId === 'P0')!.why).toMatch(/알 수 없는 정책 'luxury' — 현금회전으로 처리/);
    expect(next.commerce.products[0]!.pricePolicy!.mode).toBe('luxury');
  });
});
