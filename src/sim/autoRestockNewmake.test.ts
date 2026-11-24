// [결정 #370] 뉴본(몰트 스피릿 · oak 0개월) 제품을 같은 레시피 탱크 원액으로 자동 납품한다 (v16만)
import { describe, expect, it } from 'vitest';
import { applyAction, newScenarioGame } from './index';
import { emptyCaskOf } from './newGame';
import { autoRestockSources, autoRestockSupported, newmakeTankUseL } from './economics';
import type { GameState, Product, SpiritLot } from './types';

const lot = (id: string, extra: Partial<SpiritLot> = {}): SpiritLot => ({ id, name: id, kind: 'malt', volumeL: 300, abv: 0.65, flavor: { toasted_grain: 20 }, createdMonth: 5, oakMonths: 0, sourced: false, costPerLPA: 8000, recipeId: 'RM', ...extra });

function setup(rules: 'v16' | 'legacy-v15', product: Partial<Product> = {}) {
  const s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 1 });
  s.rulesVersion = rules;
  s.inventory.lots.push(lot('NEW', { createdMonth: 9 }), lot('OLD', { createdMonth: 2 }), lot('OTHER', { recipeId: 'RG', kind: 'grain' }), lot('BUY', { sourced: true }), lot('WEAK', { abv: 0.3 }));
  const cask = emptyCaskOf(s, 'ex_bourbon_barrel');
  cask.contents = lot('CASKED', { oakMonths: 0 });
  s.inventory.casks.push(cask);
  const p = { id: 'NB', name: '뉴본 언피티드', category: 'malt_spirit', abv: 0.46, bottleMl: 700, oakMonths: 0, recipeIds: ['RM'], stockBottles: 0, chillFiltered: false, packagingId: 'standard', ...product } as unknown as Product;
  s.commerce.products.push(p);
  return { s, p };
}

describe('#370 뉴본 자동 납품', () => {
  it('v16: 같은 레시피 탱크 원액만, 오래된 것부터 — 다른 레시피 · 매입 · 도수 모자람 · 통 원액은 빼고', () => {
    const { s, p } = setup('v16');
    expect(autoRestockSupported(p, s)).toBe(true);
    expect(autoRestockSources(s, p).map((x) => x.comp.id)).toEqual(['OLD', 'NEW']);
    expect(autoRestockSources(s, p).every((x) => x.comp.source === 'lot')).toBe(true);
  });
  it('v16: 켤 수 있다(setAutoRestock)', () => {
    const { s } = setup('v16');
    const r = applyAction(s, { type: 'setAutoRestock', productId: 'NB', months: 2 });
    expect(r.error).toBeUndefined();
    expect(r.state.commerce.products.find((x) => x.id === 'NB')!.autoRestock).toBe(2);
  });
  it('옛 판(legacy-v15)은 지금대로 — 지원하지 않고 켜기도 막는다', () => {
    const { s, p } = setup('legacy-v15');
    expect(autoRestockSupported(p, s)).toBe(false);
    expect(autoRestockSources(s, p)).toEqual([]);
    expect(applyAction(s, { type: 'setAutoRestock', productId: 'NB', months: 2 }).error).toBeDefined();
  });
  it('통에서 쉰 몰트 스피릿(oak > 0)과 레시피 기록 없는 제품은 범위 밖', () => {
    expect(autoRestockSupported(setup('v16', { oakMonths: 8 }).p, setup('v16').s)).toBe(false);
    const { s, p } = setup('v16', { recipeIds: undefined });
    expect(autoRestockSupported(p, s)).toBe(false);
    expect(autoRestockSources(s, p)).toEqual([]);
  });
  it('newmakeTankUseL — 뉴본만 숫자, 옛 판 · 다른 제품은 null', () => {
    expect(newmakeTankUseL(setup('legacy-v15').s, setup('legacy-v15').p)).toBeNull();
    const { s } = setup('v16');
    const soju = s.commerce.products.find((x) => x.category === 'soju_distilled');
    if (soju) expect(newmakeTankUseL(s, soju)).toBeNull();
  });
});
