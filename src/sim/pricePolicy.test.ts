import { afterEach, describe, expect, it } from 'vitest';
import { advanceMonth, applyAction, migrateSave, type GameState, type Product } from './index';
import { newScenarioGame } from './newScenario';
import { currentSuggested } from './economics';
import { priceModeOf, registerPricePolicy, runPricePolicies } from './pricePolicy';

// 자동 가격 3정책 그릇 ([결정 #291], architecture §10.9) — 코어 ARCH. 정책 함수 B·C는 MKT가 등록한다

const P: Product = { id: 'P', name: 'p', category: 'soju_distilled', ageYears: null, oakMonths: 0, abv: 0.25, bottleMl: 375, chillFiltered: true, packagingId: 'standard', flavor: { cereal: 20 }, quality: 60, typicity: 60, style: null, sourcedShare: 0, stockBottles: 2000, price: 8000, unitCost: 3000, createdMonth: 0, lastMonthSold: 0, totalSold: 0 } as never;
function game(products: Partial<Product>[]): GameState {
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 3 });
  s.commerce.products = products.map((x, i) => ({ ...P, id: `P${i}`, name: `제품${i}`, ...x })) as Product[];
  return s;
}
const ok = (s: GameState, a: Parameters<typeof applyAction>[1]) => { const r = applyAction(s, a); expect(r.error).toBeUndefined(); return r.state; };
afterEach(() => { registerPricePolicy('profit', null); registerPricePolicy('premium', null); });

describe('3정책 그릇 — 명령 (setPricePolicy)', () => {
  it('옛 판(autoPrice만)은 A로 읽는다 · 옛 setAutoPrice on은 다른 정책을 A로 되돌린다', () => {
    let s = game([{ autoPrice: true }]);
    expect(priceModeOf(s.commerce.products[0]!)).toBe('turnover');
    registerPricePolicy('profit', () => null);
    s = ok(s, { type: 'setPricePolicy', productId: 'P0', mode: 'profit' });
    expect(priceModeOf(s.commerce.products[0]!)).toBe('profit');
    s = ok(s, { type: 'setAutoPrice', productId: 'P0', on: true });
    expect(s.commerce.products[0]!.pricePolicy?.mode).toBe('turnover');
  });

  it("'all'은 면세 한정판을 빼고 건다 · 끄면 값은 그대로, 정책은 남는다", () => {
    let s = game([{}, { dutyFreeOnly: true } as never, {}]);
    const r = applyAction(s, { type: 'setPricePolicy', productId: 'all', mode: 'turnover' });
    expect(r.error).toBeUndefined();
    expect(r.message).toMatch(/면세 한정판 1개 제외/);
    s = r.state;
    expect(s.commerce.products.map((p) => !!p.autoPrice)).toEqual([true, false, true]);
    const prices = s.commerce.products.map((p) => p.price);
    s = ok(s, { type: 'setPricePolicy', productId: 'all', mode: null });
    expect(s.commerce.products.map((p) => p.price)).toEqual(prices);
    expect(s.commerce.products[0]!.autoPrice).toBeUndefined();
    expect(s.commerce.products[0]!.pricePolicy?.mode).toBe('turnover');
  });

  it('등록되지 않은 정책·틀린 범위는 거절하고 아무것도 바꾸지 않는다', () => {
    const s = game([{}]);
    expect(applyAction(s, { type: 'setPricePolicy', productId: 'P0', mode: 'profit' }).error).toMatch(/아직 없습니다/);
    expect(applyAction(s, { type: 'setPricePolicy', productId: 'P0', mode: 'turnover', min: 1.5, max: 1.2 }).error).toMatch(/최소 배수가 최대/);
    expect(applyAction(s, { type: 'setPricePolicy', productId: 'P0', mode: 'turnover', max: 3 }).error).toMatch(/0.6~2/);
    registerPricePolicy('premium', () => null);
    expect(applyAction(s, { type: 'setPricePolicy', productId: 'P0', mode: 'premium', min: 1.0, max: 1.2, target: 1.5 }).error).toMatch(/목표 배수가 범위 밖/);
    const c = applyAction(s, { type: 'setPricePolicy', productId: 'P0', mode: 'premium' }).state.commerce.products[0]!;
    expect(c.pricePolicy).toEqual({ mode: 'premium', target: 1.3 }); // C 기본 목표 n
  });
});

describe('공통 가드 · 사유 기록 (엣지 ⑦)', () => {
  it('정책이 범위 밖 값을 내면 범위로 자르고 사유에 적는다 · 결과는 늘 [min, max] × 기준가 안', () => {
    for (const [ask, lo, hi] of [[5, 1.0, 1.2], [0.1, 1.0, 1.2], [1.1, 1.0, 1.2], [1.1, 1.1, 1.1]] as const) {
      const s = game([{}]);
      const p = s.commerce.products[0]!;
      const base = currentSuggested(s, p);
      registerPricePolicy('profit', (_snap, q) => ({ price: Math.round((currentSuggested(_snap, q) * ask) / 100) * 100, why: `시험 ×${ask}` }));
      p.autoPrice = true; p.pricePolicy = { mode: 'profit', min: lo, max: hi };
      const report = { priceLog: [] } as never as Parameters<typeof runPricePolicies>[1];
      runPricePolicies(s, report, 1);
      const f = p.price / base;
      expect(f).toBeGreaterThanOrEqual(lo - 0.02);
      expect(f).toBeLessThanOrEqual(hi + 0.02);
      if (ask > hi || ask < lo) expect(report!.priceLog!.at(-1)!.why).toMatch(/범위 (하한|상한)/);
      expect(p.pricePolicy.lastFactor).toBeCloseTo(f, 2);
    }
  });

  it('A는 판매 전에 값을 정하고 결산에 사유 한 줄을 남긴다', () => {
    let s = game([{ autoPrice: true, price: 3000 }]);
    s = advanceMonth(s);
    const log = s.history.reports.at(-1)!.priceLog ?? [];
    expect(log.length).toBe(1);
    expect(log[0]).toMatchObject({ productId: 'P0', mode: 'turnover', from: 3000 });
    expect(log[0]!.why).toMatch(/진열 공헌 최대/);
  });
});

describe('불러오기 왕복 (엣지 ⑧)', () => {
  it('정책·목표·마지막 배수가 저장 → 불러오기 뒤 그대로 · 같은 달 결과도 같다', () => {
    registerPricePolicy('premium', (snap, q) => ({ price: Math.round((currentSuggested(snap, q) * (q.pricePolicy?.target ?? 1.3)) / 100) * 100, why: '목표 유지' }));
    let s = game([{}, {}]);
    s = ok(s, { type: 'setPricePolicy', productId: 'P0', mode: 'premium', target: 1.5 });
    s = ok(s, { type: 'setPricePolicy', productId: 'P1', mode: 'turnover', min: 0.9, max: 1.4 });
    s = advanceMonth(s);
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(loaded.commerce.products.map((p) => p.pricePolicy)).toEqual(s.commerce.products.map((p) => p.pricePolicy));
    expect(JSON.stringify(advanceMonth(loaded))).toBe(JSON.stringify(advanceMonth(s)));
  });

  it('모르는 정책은 A로 처리하되 값을 지우지 않고 사유에 적는다 · 범위 밖 배수는 불러올 때 한계로 자른다', () => {
    const s = advanceMonth(game([])); // 결산이 하나 있어야 수리 메모가 남는다
    s.commerce.products = [{ ...P, id: 'P0', autoPrice: true, price: 3000, pricePolicy: { mode: 'luxury' as never, target: 1.4 } }, { ...P, id: 'P1', autoPrice: true, pricePolicy: { mode: 'turnover', max: 9 } }] as Product[];
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(loaded.commerce.products[0]!.pricePolicy).toEqual({ mode: 'luxury', target: 1.4 });
    expect(loaded.commerce.products[1]!.pricePolicy).toEqual({ mode: 'turnover', max: 2 });
    expect(loaded.history.reports.at(-1)?.notes.at(-1) ?? '').toMatch(/가격 정책 배수/);
    const next = advanceMonth(loaded);
    expect(next.history.reports.at(-1)!.priceLog![0]!.why).toMatch(/알 수 없는 정책 'luxury' — 현금회전으로 처리/);
    expect(next.commerce.products[0]!.pricePolicy!.mode).toBe('luxury');
  });
});
