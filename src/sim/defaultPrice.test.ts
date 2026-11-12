// 기본 정책 가격 n ([결정 #290] B1-4) — 한 함수(defaultPolicyPrice)를 병입 첫 값·병입 미리보기·생산 경제성 표·"권장" 버튼이 같이 쓴다(PROD 합의 option A)
import { describe, expect, it } from 'vitest';
import { applyAction, previewBatch, previewBlend, type GameState } from './index';
import { DEFAULT_POLICY_N, defaultPolicyPrice } from './content/market';
import { PRICE_POLICY, resetFirstPriceOnAuto } from './pricePolicy';
import { newScenarioGame } from './newScenario';
import { recipeEconomics, STANDARD_BOTTLE } from './economics';

const mvp = (): GameState => { const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 5 }); s.finance.cash = 5e9; return s; };
function withLot(s: GameState) {
  const r = s.production.recipes.find((x) => x.kind === 'soju')!;
  const b = previewBatch(s, r)!;
  s.inventory.lots.push({ id: 'X', name: 'x', kind: 'soju', volumeL: b.volumeL, abv: b.abv, flavor: b.flavor, createdMonth: s.month, oakMonths: 0, sourced: false, costPerLPA: b.cost / b.lpa, recipeId: r.id, mashShare: Object.fromEntries(r.mashBill.map((m) => [m.ingredientId, m.ratio])) });
  return { r, opts: { name: '', targetAbv: STANDARD_BOTTLE.soju.abv, bottleMl: STANDARD_BOTTLE.soju.bottleMl, chillFilter: true, packagingId: 'standard' } };
}

describe('기본 정책 가격 n (B1-4)', () => {
  it('n은 한 곳 — 가격 정책 시작 배수와 같다', () => {
    expect(PRICE_POLICY.n).toBe(DEFAULT_POLICY_N);
    expect(defaultPolicyPrice(10_000)).toBe(13_000);
    expect(defaultPolicyPrice(12_345)).toBe(Math.round((12_345 * DEFAULT_POLICY_N) / 100) * 100);
  });

  it('병입 미리보기에서 보인 값 = 병입한 새 제품의 첫 값 = 생산 경제성 표의 값', () => {
    const s = mvp();
    const { r, opts } = withLot(s);
    const comps = [{ source: 'lot' as const, id: 'X', liters: 100 }];
    const shown = defaultPolicyPrice(previewBlend(s, comps, opts).suggestedPrice);
    const after = applyAction(s, { type: 'bottle', components: comps, options: opts });
    expect(after.error).toBeUndefined();
    expect(after.state.commerce.products.at(-1)!.price).toBe(shown);
    expect(recipeEconomics(s, r)[0]!.price).toBe(shown);
  });

  it('옵션으로 배수를 정하면 그 값 — 1이면 기준가 그대로(옛 동작)', () => {
    const s = mvp();
    const { opts } = withLot(s);
    const comps = [{ source: 'lot' as const, id: 'X', liters: 100 }];
    const base = previewBlend(s, comps, opts).suggestedPrice;
    const after = applyAction(s, { type: 'bottle', components: comps, options: { ...opts, firstPriceFactor: 1 } });
    expect(after.state.commerce.products.at(-1)!.price).toBe(base);
  });
});

// 결정 #304 — 자동 가격 A를 켤 때 첫 출고가(기준가 × n) 그대로면 기준가로 되돌린다. 자동 가격 판은 n이 없던 때와 같은 길을 간다
describe('자동 가격 A로 켤 때 첫 출고가 되돌리기 (결정 #304)', () => {
  const bottled = (factor?: number) => {
    const s = mvp();
    const { opts } = withLot(s);
    const comps = [{ source: 'lot' as const, id: 'X', liters: 100 }];
    const base = previewBlend(s, comps, opts).suggestedPrice;
    const r = applyAction(s, { type: 'bottle', components: comps, options: factor == null ? opts : { ...opts, firstPriceFactor: factor } });
    expect(r.error).toBeUndefined();
    return { s: r.state, id: r.state.commerce.products.at(-1)!.id, base };
  };
  const priceOf = (s: GameState, id: string) => s.commerce.products.find((p) => p.id === id)!.price;

  it('A로 켜면(setAutoPrice · setPricePolicy turnover) 첫 값 ×n에서 시작해도 기준가에서 켠 것과 같다', () => {
    const n = bottled(), one = bottled(1);
    expect(priceOf(n.s, n.id)).toBe(defaultPolicyPrice(n.base));
    expect(priceOf(one.s, one.id)).toBe(one.base);
    const a = applyAction(n.s, { type: 'setAutoPrice', productId: n.id, on: true }).state;
    const b = applyAction(one.s, { type: 'setAutoPrice', productId: one.id, on: true }).state;
    expect(a.commerce.products).toEqual(b.commerce.products);
    const c = applyAction(n.s, { type: 'setPricePolicy', productId: n.id, mode: 'turnover' }).state;
    const d = applyAction(one.s, { type: 'setPricePolicy', productId: one.id, mode: 'turnover' }).state;
    expect(c.commerce.products).toEqual(d.commerce.products);
  });

  it('A로 켜는 순간 기준가로 돌아간다 — 자동 가격이 값을 고르지 않는 달(재고 0)에도', () => {
    for (const on of [
      (id: string) => ({ type: 'setAutoPrice' as const, productId: id, on: true }),
      (id: string) => ({ type: 'setPricePolicy' as const, productId: id, mode: 'turnover' as const }),
    ]) {
      const n = bottled();
      n.s.commerce.products.find((p) => p.id === n.id)!.stockBottles = 0; // bestAutoPrice null → 지금 값을 둔다
      const r = applyAction(n.s, on(n.id));
      expect(r.error).toBeUndefined();
      expect(priceOf(r.state, n.id)).toBe(n.base);
    }
  });

  it('B·C로 켜면 첫 값 ×n에서 출발한다(되돌리지 않는다, P-PROD-53)', () => {
    // B: 한 달에 ±step만 움직이니 출발점이 다르면 켠 뒤 값도 다르다
    const n = bottled(), one = bottled(1);
    const a = applyAction(n.s, { type: 'setPricePolicy', productId: n.id, mode: 'profit' }).state;
    const b = applyAction(one.s, { type: 'setPricePolicy', productId: one.id, mode: 'profit' }).state;
    expect(priceOf(a, n.id)).not.toBe(priceOf(b, one.id));
    // C: 목표 ×n = 첫 값 — 켜도 그 값 그대로
    const c = applyAction(n.s, { type: 'setPricePolicy', productId: n.id, mode: 'premium' }).state;
    expect(priceOf(c, n.id)).toBe(defaultPolicyPrice(n.base));
  });

  it('손으로 정한 값 · 이미 켜진 제품 · 기준가가 움직여 첫 값과 다른 값은 그대로 둔다', () => {
    const p = { price: 15_000 };
    resetFirstPriceOnAuto(p, 10_000);
    expect(p.price).toBe(15_000); // 손으로 정한 값
    const on = { price: 13_000, autoPrice: true };
    resetFirstPriceOnAuto(on, 10_000);
    expect(on.price).toBe(13_000); // 이미 켜져 있다
    const later = { price: defaultPolicyPrice(10_000) };
    resetFirstPriceOnAuto(later, 11_000);
    expect(later.price).toBe(defaultPolicyPrice(10_000)); // 병입 뒤 기준가가 움직였다
    const df = { price: 13_000, dutyFreeOnly: true };
    resetFirstPriceOnAuto(df, 10_000);
    expect(df.price).toBe(13_000);
    const fresh = { price: 13_000 };
    resetFirstPriceOnAuto(fresh, 10_000);
    expect(fresh.price).toBe(10_000);
  });
});
