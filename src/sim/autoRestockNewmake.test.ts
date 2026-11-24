// [결정 #370] 뉴본(몰트 스피릿 · oak 0개월) 제품을 같은 레시피 탱크 원액으로 자동 납품한다 (v16만)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { advanceMonth } from './step';
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

// PM 요청(2026-11-24): 봇이 이 기능을 쓰지 않으므로 기능을 실제로 켠 시나리오로 확인한다 — 9차 세이브 뉴본 3종(R8 · R9 · R94)
describe('#370 시나리오 — 9차 세이브에서 뉴본 자동 납품을 켜고 진행', () => {
  const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y6m5-202611240759.json', 'utf8')).save)!;
  const tankL = (s: GameState, recipeId: string) => s.inventory.lots.filter((l) => l.recipeId === recipeId && l.oakMonths === 0 && !l.sourced).reduce((t, l) => t + l.volumeL, 0);
  it('켠 뒤 3개월: 「뉴본 언피티드」가 매달 같은 레시피 탱크(R8)에서 채워진다 — 다른 레시피 탱크는 이 제품이 쓰지 않는다', () => {
    let s = load();
    const p = s.commerce.products.find((x) => x.name === '김포 뉴본 언피티드')!;
    expect(p.recipeIds).toEqual(['R8']);
    p.stockBottles = 0;
    s = applyAction(s, { type: 'setAutoRestock', productId: p.id, months: 2 }).state;
    let filled = 0;
    for (let m = 0; m < 3; m++) {
      s = advanceMonth(s);
      const note = s.history.reports.at(-1)!.notes.find((n) => n.includes('「김포 뉴본 언피티드」'));
      if (note && /\+[\d,]+병/.test(note)) { filled++; expect(note).toContain('원액 탱크'); }
    }
    expect(filled).toBeGreaterThanOrEqual(1);
    expect(s.commerce.products.find((x) => x.id === p.id)!.stockBottles).toBeGreaterThan(0);
  });
  it('모자랄 때: 같은 레시피 탱크가 비면 다른 레시피 탱크로 대신하지 않고 「탱크 원액 필요」를 알린다', () => {
    let s = load();
    const p = s.commerce.products.find((x) => x.name === '김포 뉴본 그레인')!;
    p.stockBottles = 0;
    s = applyAction(s, { type: 'setAutoRestock', productId: p.id, months: 2 }).state;
    s.inventory.lots = s.inventory.lots.filter((l) => l.recipeId !== 'R94');
    s.production.orders = s.production.orders.filter((o) => o.recipeId !== 'R94'); // 이번 달 R94 생산도 없게
    s = advanceMonth(s);
    const note = s.history.reports.at(-1)!.notes.find((n) => n.includes('「김포 뉴본 그레인」'))!;
    expect(note).toContain('쓸 원액이 없어 못 채웠다');
    expect(s.commerce.products.find((x) => x.id === p.id)!.stockBottles).toBe(0); // R8 등 다른 레시피 탱크로 채우지 않았다
    expect(tankL(s, 'R94')).toBe(0);
  });
  it('경계값: 통에서 1개월이라도 쉰 몰트 스피릿(oak 1)은 켤 수 없다 · oak 0은 켤 수 있다', () => {
    const s = load();
    const p = s.commerce.products.find((x) => x.name === '김포 뉴본 피티드')!;
    expect(applyAction(s, { type: 'setAutoRestock', productId: p.id, months: 1 }).error).toBeUndefined();
    p.oakMonths = 1;
    expect(applyAction(s, { type: 'setAutoRestock', productId: p.id, months: 1 }).error).toBeDefined();
  });
});

