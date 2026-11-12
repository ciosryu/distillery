// 기본 정책 가격 n ([결정 #290] B1-4) — 한 함수(defaultPolicyPrice)를 병입 첫 값·병입 미리보기·생산 경제성 표·"권장" 버튼이 같이 쓴다(PROD 합의 option A)
import { describe, expect, it } from 'vitest';
import { applyAction, previewBatch, previewBlend, type GameState } from './index';
import { DEFAULT_POLICY_N, defaultPolicyPrice } from './content/market';
import { PRICE_POLICY } from './pricePolicy';
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
