import { describe, expect, it } from 'vitest';
import {
  advanceMonths, annuityPayment, applyAction, bottleMargin, brokerAskPerLPA, bulkValuePerLPA, categorize, demandFor, evaluate, evaporate, heartsFraction, spotBidPerLPA, spotQuote,
  makeContractOffer, makeCraftContractOffer, contractAgingImpact, matureCask, mulberry32, newGame, previewBlend, qualityFactor, sizeFactor, simulateBatch, stillDefOf, volumeDiscounts, windowFraction, type Cask, type GameState, type SpiritLot,
  appeal, applyEffects, buyersFor, presetRecipes, validateRecipe, type Product,
  agePerception, suggestedPrice, spotSaturation, exportAwarenessMax, updateExportAwareness, EXPORT_MARKETS, exportShelfPrice, exportEligible, exportDemandFor, makeExportOffer, sourcedElasticityFactor, sourcedPrestigeOf, caskStorageCost, fermentDaysAt,
} from './index';
import { overhangFactor, retailCapacityCases } from './retail';
import { ownsFacility } from './util';
import { slotClimate } from './warehouse';
import { BULK, EQUIPMENT } from './content/catalog';
import { BUYERS } from './content/names';
import { consumerPrice, logisticsMultiplier, priceForConsumer, REGIONS, siteOf, traditionalTaxFactor } from './content/regions';

const recipeId = (s: GameState, prefix: string) => s.production.recipes.find((r) => r.name.startsWith(prefix))!.id;

describe('컷 포인트', () => {
  it('전 구간이면 거의 전부, 좁힐수록 하트 비율이 줄어든다', () => {
    expect(windowFraction(0.5, 0.1, -1, 2)).toBeCloseTo(1, 3);
    expect(heartsFraction(0.15, 0.72)).toBeLessThan(heartsFraction(0.1, 0.8));
  });

  it('후류 전환점(c2)을 늦추면 피트·후류취가 늘고 수율이 오른다', () => {
    const s = newGame({ seed: 1 });
    const still = stillDefOf(s, s.production.recipes[0]!.stillId)!;
    const peated = s.production.recipes.find((r) => r.name.endsWith('— 피티드'))!;
    const early = simulateBatch({ ...peated, cut: { c1: 0.15, c2: 0.65 } }, still, 'stainless', s.hr.staff[0], s.world.priceIndex, 0);
    const late = simulateBatch({ ...peated, cut: { c1: 0.15, c2: 0.85 } }, still, 'stainless', s.hr.staff[0], s.world.priceIndex, 0);
    expect(late.flavor.peat_smoke ?? 0).toBeGreaterThan(early.flavor.peat_smoke ?? 0);
    expect(late.flavor.feinty ?? 0).toBeGreaterThan(early.flavor.feinty ?? 0);
    expect(late.lpa).toBeGreaterThan(early.lpa);
  });
});

describe('숙성', () => {
  it('습하면 도수가 내려가고 건조하면 올라간다', () => {
    expect(evaporate(200, 0.635, 0.002, 85).abv).toBeLessThan(0.635);
    expect(evaporate(200, 0.635, 0.002, 40).abv).toBeGreaterThan(0.635);
  });

  it('작은 캐스크일수록 숙성 속도 계수가 크다', () => {
    expect(sizeFactor(125)).toBeGreaterThan(1);
    expect(sizeFactor(200)).toBeCloseTo(1, 6);
    expect(sizeFactor(500)).toBeLessThan(1);
  });

  it('숙성하면 바닐라·통합감이 늘고 자극이 줄어든다', () => {
    const s = newGame({ seed: 2 });
    const lot: SpiritLot = { id: 'x', name: 'x', kind: 'malt', volumeL: 200, abv: 0.635, flavor: { cereal: 30, harshness: 65 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 0 };
    let cask: Cask = { ...s.inventory.casks[0]!, contents: lot, fills: 1 };
    for (let i = 0; i < 36; i++) cask = matureCask(cask, { tempC: 15, humidity: 70 }, { control: 0 }).cask;
    const f = cask.contents!.flavor;
    expect(f.vanilla_caramel!).toBeGreaterThan(20);
    expect(f.integration!).toBeGreaterThan(20);
    expect(f.harshness!).toBeLessThan(65);
    expect(cask.contents!.oakMonths).toBe(36);
  });
});

describe('라벨·숙성 연수', () => {
  it('36개월 미만이면 몰트 스피릿, 이상이고 40% 이상이면 위스키', () => {
    expect(categorize('malt', 35, 0.46, {})).toBe('malt_spirit');
    expect(categorize('malt', 36, 0.46, {})).toBe('whisky');
    expect(categorize('malt', 48, 0.39, {})).toBe('malt_spirit');
  });

  it('주니퍼가 지배적이지 않으면 진 표기 불가', () => {
    expect(categorize('gin', 0, 0.43, { juniper: 50, citrus: 30 })).toBe('gin');
    expect(categorize('gin', 0, 0.43, { juniper: 20, citrus: 60 })).toBe('flavored_spirit');
  });

  it('블렌드의 숙성 연수 = 가장 어린 원액', () => {
    let s = newGame({ seed: 3 });
    const mk = (id: string, months: number) => ({ id, name: id, kind: 'malt' as const, volumeL: 150, abv: 0.6, flavor: { cereal: 20, vanilla_caramel: 30 }, createdMonth: 0, oakMonths: months, sourced: false, costPerLPA: 10_000 });
    s = { ...s, inventory: { ...s.inventory, casks: [{ ...s.inventory.casks[0]!, contents: mk('a', 60) }, { ...s.inventory.casks[1]!, contents: mk('b', 40) }] } };
    const p = previewBlend(s, [{ source: 'cask', id: s.inventory.casks[0]!.id, liters: 100 }, { source: 'cask', id: s.inventory.casks[1]!.id, liters: 100 }], { name: 't', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' });
    expect(p.ok).toBe(true);
    expect(p.category).toBe('whisky');
    expect(p.ageYears).toBe(3);
  });
});

describe('시장', () => {
  it('가격이 오르면 수요가 줄어든다', () => {
    const s = newGame({ seed: 4 });
    const base = { id: 'p', name: 'p', category: 'gin' as const, ageYears: null, abv: 0.43, bottleMl: 700, chillFiltered: true, packagingId: 'standard', flavor: {}, quality: 55, typicity: 100, style: null, sourcedShare: 0, stockBottles: 100, unitCost: 0, createdMonth: 0, lastMonthSold: 0, totalSold: 0 };
    const cheap = demandFor(s, { ...base, price: 15_000 }, 1, 1);
    const pricey = demandFor(s, { ...base, price: 30_000 }, 1, 1);
    expect(pricey.demandBottles).toBeLessThan(cheap.demandBottles);
  });

  it('품질이 높으면 매력도가 높다', () => {
    expect(evaluate({ fresh_fruit: 30, floral: 20, vanilla_caramel: 30, integration: 60, harshness: 20 }, 'whisky').quality)
      .toBeGreaterThan(evaluate({ fresh_fruit: 10, solvent: 20, feinty: 20, harshness: 70 }, 'whisky').quality);
  });
});

describe('마진 사다리', () => {
  const setup = () => {
    let s = newGame({ seed: 3 });
    s = applyAction(s, { type: 'setOrder', recipeId: recipeId(s, '런던'), batchesPerMonth: 1 }).state;
    s = applyAction(s, { type: 'setOrder', recipeId: recipeId(s, '싱글 몰트 — 언'), batchesPerMonth: 2 }).state;
    return advanceMonths(s, 1);
  };

  it('진은 권장가에서 마진율이 25% 미만, 숙성 위스키는 60% 이상', () => {
    const s = setup();
    const gin = s.inventory.lots.find((l) => l.kind === 'gin')!;
    const g = previewBlend(s, [{ source: 'lot', id: gin.id, liters: gin.volumeL }], { name: 'g', targetAbv: 0.43, bottleMl: 700, chillFilter: true, packagingId: 'standard' });
    expect(bottleMargin({ price: g.suggestedPrice, unitCost: g.unitCost, bottleMl: 700 }).rate).toBeLessThan(0.25);

    const aged: SpiritLot = { id: 'w', name: 'w', kind: 'malt', volumeL: 180, abv: 0.6, flavor: { fresh_fruit: 30, floral: 15, cereal: 20, vanilla_caramel: 45, oak_tannin: 25, wood_spice: 20, integration: 60, harshness: 25 }, createdMonth: 0, oakMonths: 48, sourced: false, costPerLPA: 8_000 };
    const s2 = { ...s, inventory: { ...s.inventory, casks: [{ ...s.inventory.casks[0]!, contents: aged }] } };
    const w = previewBlend(s2, [{ source: 'cask', id: s2.inventory.casks[0]!.id, liters: 180 }], { name: 'w', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' });
    expect(w.category).toBe('whisky');
    expect(bottleMargin({ price: w.suggestedPrice, unitCost: w.unitCost, bottleMl: 700 }).rate).toBeGreaterThan(0.6);
  });
});

describe('원액 B2B', () => {
  it('같은 원액이면 현물 매입가 < 브로커 판매가 (사고팔기 차익 없음)', () => {
    const s = newGame({ seed: 9 });
    const lot = s.b2b.brokerOffers[0]!.cask.contents!;
    expect(spotBidPerLPA(s, lot)).toBeLessThan(brokerAskPerLPA(s, lot));
    expect(spotQuote(s, lot, lot.volumeL, s.b2b.brokerOffers[0]!.cask)).toBeLessThan(s.b2b.brokerOffers[0]!.price);
  });

  it('숙성될수록 벌크 가치가 오른다', () => {
    const s = newGame({ seed: 10 });
    const base: SpiritLot = { id: 'n', name: 'n', kind: 'malt', volumeL: 100, abv: 0.635, flavor: { cereal: 30, fresh_fruit: 20 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 6000 };
    expect(bulkValuePerLPA(s, { ...base, oakMonths: 48 })).toBeGreaterThan(bulkValuePerLPA(s, base));
  });

  it('캐스크째 현물 판매하면 캐스크가 사라지고 현금이 들어온다', () => {
    let s = newGame({ seed: 11 });
    s = applyAction(s, { type: 'buyBrokerCask', offerId: s.b2b.brokerOffers[0]!.id }).state;
    const cask = s.inventory.casks.at(-1)!;
    const cash = s.finance.cash;
    s = applyAction(s, { type: 'sellBulk', source: 'cask', id: cask.id }).state;
    expect(s.inventory.casks.some((c) => c.id === cask.id)).toBe(false);
    expect(s.finance.cash).toBeGreaterThan(cash);
  });

  it('계약은 매달 탱크 뉴메이크를 자동 납품하고, 부족하면 위약금을 낸다', () => {
    let s = newGame({ seed: 12 });
    const offer = { ...s.b2b.contractOffers[0]!, style: 'any' as const, minQuality: 30, lpaPerMonth: 60, prepayShare: 0 };
    s = { ...s, b2b: { ...s.b2b, contractOffers: [offer] } };
    s = applyAction(s, { type: 'acceptContract', offerId: offer.id }).state;
    // 생산 없음 → 첫 달 전량 미납
    s = advanceMonths(s, 1);
    expect(s.history.reports.at(-1)!.bulk[0]!.deliveredLPA).toBe(0);
    expect(s.history.reports.at(-1)!.expenses.penalty).toBeGreaterThan(0);
    // 몰트 생산 → 납품
    s = applyAction(s, { type: 'setOrder', recipeId: recipeId(s, '싱글 몰트 — 언'), batchesPerMonth: 3 }).state;
    s = advanceMonths(s, 1);
    expect(s.history.reports.at(-1)!.bulk[0]!.deliveredLPA).toBeCloseTo(60, 3);
    expect(s.history.reports.at(-1)!.bulkRevenue).toBeCloseTo(60 * offer.pricePerLPA, -1);
  });

  it('누적 미납이 두 달치가 되면 계약이 파기되고 신뢰도가 떨어진다', () => {
    let s = newGame({ seed: 13 });
    const offer = { ...s.b2b.contractOffers[0]!, minQuality: 30, prepayShare: 0.3 };
    s = { ...s, b2b: { ...s.b2b, contractOffers: [offer] } };
    const trust = s.b2b.trust;
    s = applyAction(s, { type: 'acceptContract', offerId: offer.id }).state;
    expect(s.b2b.contracts[0]!.prepaidRemaining).toBeGreaterThan(0);
    s = advanceMonths(s, 2);
    expect(s.b2b.contracts.length).toBe(0);
    expect(s.b2b.trust).toBeLessThan(trust - 10);
  });
});

describe('그레인·블렌디드', () => {
  it('연속식 증류기는 한 번에 고도수 그레인 원액을 만든다', () => {
    const s = newGame({ seed: 21 });
    const r = { ...s.production.recipes[0]!, kind: 'grain' as const, mashBill: [{ ingredientId: 'corn', ratio: 0.9 }, { ingredientId: 'malt_unpeated', ratio: 0.1 }], fermentDays: 3, runs: 1 as const };
    const b = simulateBatch(r, EQUIPMENT.column_2 as never, 'stainless', s.hr.staff[0], s.world.priceIndex, 0);
    expect(b.abv).toBeGreaterThan(0.88);
    expect(b.cost / b.lpa).toBeLessThan(3000);
  });

  it('몰트 + 그레인 3년 이상 = 블렌디드 위스키', () => {
    expect(categorize('malt', 40, 0.4, {}, true, true)).toBe('blended_whisky');
    expect(categorize('grain', 40, 0.4, {}, true, false)).toBe('grain_whisky');
    expect(categorize('malt', 20, 0.4, {}, true, true)).toBe('malt_spirit');
  });

  it('대량 구매하면 원재료 할인이 붙는다', () => {
    const s = newGame({ seed: 22 });
    expect(volumeDiscounts(s).malt_unpeated).toBeUndefined();
    expect(volumeDiscounts({ ...s, production: { ...s.production, ingredientKgLastMonth: { malt_unpeated: 20_000 } } }).malt_unpeated).toBeLessThan(1);
  });
});

describe('국산 원액 프리미엄', () => {
  it('국내 블렌더 계약은 해외 블렌더보다 단가가 높다', () => {
    const s = newGame({ seed: 23 });
    const rng = mulberry32(1);
    const offers = Array.from({ length: 40 }, () => makeContractOffer(s, rng)).filter((o) => o.style === 'any');
    const dom = offers.filter((o) => o.domestic && o.prepayShare === 0);
    const foreign = offers.filter((o) => !o.domestic && o.prepayShare === 0);
    const avg = (xs: typeof offers) => xs.reduce((t, o) => t + o.pricePerLPA / qualityFactor(o.minQuality + 8), 0) / xs.length;
    expect(dom.length && foreign.length).toBeTruthy();
    expect(avg(dom)).toBeGreaterThan(avg(foreign));
  });

  it('크래프트 계약은 일반 계약보다 소량·고단가다 (#78)', () => {
    const s = newGame({ seed: 23 });
    const rng = mulberry32(2);
    const crafts = Array.from({ length: 30 }, () => makeCraftContractOffer(s, rng)!).filter((o) => o.style === 'any' && o.prepayShare === 0);
    const regular = Array.from({ length: 60 }, () => makeContractOffer(s, rng)).filter((o) => o.spirit === 'malt_newmake' && o.style === 'any' && o.prepayShare === 0 && !o.domestic);
    const norm = (o: { pricePerLPA: number; minQuality: number; termMonths: number }) => o.pricePerLPA / qualityFactor(o.minQuality + 8) / (1 + 0.04 * (o.termMonths - 12) / 12);
    const avg = (xs: { pricePerLPA: number; minQuality: number; termMonths: number }[]) => xs.reduce((t, o) => t + norm(o), 0) / xs.length;
    expect(crafts.length && regular.length).toBeTruthy();
    expect(crafts.every((o) => o.craft && o.lpaPerMonth >= 20)).toBe(true);
    expect(avg(crafts)).toBeGreaterThan(avg(regular) * 1.3);
    expect(Math.max(...crafts.map((o) => o.lpaPerMonth))).toBeLessThan(Math.max(...regular.map((o) => o.lpaPerMonth)));
  });

  it('그레인 현물은 많이 팔수록 단가가 떨어지고, 시장이 매달 회복한다 (#81)', () => {
    const s = newGame({ seed: 31, region: 'TW' });
    const grain = { id: 'g', name: 'g', kind: 'grain', volumeL: 10_000, abv: 0.94, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 1800 } as SpiritLot;
    const malt = { ...grain, id: 'm', kind: 'malt' } as SpiritLot;
    expect(spotSaturation(s, grain)).toBe(1);
    expect(spotSaturation(s, grain, 20_000 * 2)).toBeCloseTo(0.5, 6); // 시장 깊이만큼(절반 지점) 팔면 단가 절반
    expect(spotSaturation({ ...s, b2b: { ...s.b2b, spotSoldLPA: { grain: 1e9 } } }, malt)).toBe(1); // 몰트는 포화 없음
    expect(spotSaturation({ ...s, regionId: 'JP', b2b: { ...s.b2b, spotSoldLPA: { grain: 1e9 } } }, grain)).toBe(1); // 일본·한국은 무한
    const sold = applyAction(s, { type: 'sellBulk', source: 'lot', id: 'x' }).state; // 없는 원액 → 변화 없음
    expect(sold.b2b.spotSoldLPA?.grain).toBe(0);
    const s2 = applyAction({ ...s, inventory: { ...s.inventory, lots: [grain] } }, { type: 'sellBulk', source: 'lot', id: 'g' }).state;
    expect(s2.b2b.spotSoldLPA!.grain).toBeCloseTo(9400, 6);
    expect(spotBidPerLPA(s2, grain)).toBeLessThan(spotBidPerLPA(s, grain));
    const s3 = advanceMonths(s2, 1);
    expect(s3.b2b.spotSoldLPA!.grain).toBeLessThan(s2.b2b.spotSoldLPA!.grain);
  });

  it('계약 경고: 첫 위스키 전에 끝나면 안전, 넘기면 겹친 개월과 빠지는 원액을 알려 준다 (§16.16)', () => {
    const s = { ...newGame({ seed: 23 }), month: 10 };
    // 숙성 중인 자사 몰트가 없으면 첫 위스키는 지금 + 36개월
    const ok = contractAgingImpact(s, { lpaPerMonth: 100, termMonths: 24, spirit: 'malt_newmake' });
    expect(ok.endMonth).toBe(34);
    expect(ok.firstWhiskyMonth).toBe(46);
    expect(ok.overlapMonths).toBe(0);
    expect(ok.divertedLPA).toBe(2400);
    expect(ok.bottleEquivalent).toBe(Math.round(2400 / (0.46 * 0.7)));
    // 2개월째에 통입한 몰트가 있으면 첫 위스키는 38개월 → 36개월 계약은 8개월 겹친다
    const cask = { id: 'k', typeId: 'ex_bourbon_barrel', sizeL: 200, wood: 'american_oak', activity: 1, seasoning: 1, fills: 0, recharCount: 0, char: 4, filledMonth: 2,
      contents: { id: 'l', name: 'm', kind: 'malt', volumeL: 190, abv: 0.635, flavor: {}, createdMonth: 2, oakMonths: 8, sourced: false, costPerLPA: 0 } } as unknown as Cask;
    const bad = contractAgingImpact({ ...s, inventory: { ...s.inventory, casks: [cask] } }, { lpaPerMonth: 100, termMonths: 36, spirit: 'malt_newmake' });
    expect(bad.firstWhiskyMonth).toBe(38);
    expect(bad.overlapMonths).toBe(8);
    expect(bad.whiskyGap).toEqual([46, 82]);
    // 진행 중 계약은 남은 기간만 센다
    expect(contractAgingImpact(s, { lpaPerMonth: 100, termMonths: 36, spirit: 'malt_newmake', monthsDone: 30 }).divertedLPA).toBe(600);
  });
});

describe('변동 요소', () => {
  it('수요 보정치가 활성 기간에만 수요를 바꾼다', () => {
    const s = newGame({ seed: 24 });
    const p = { id: 'p', name: 'p', category: 'gin' as const, ageYears: null, abv: 0.43, bottleMl: 700, chillFiltered: true, packagingId: 'standard', flavor: {}, quality: 55, typicity: 100, style: null, sourcedShare: 0, stockBottles: 100, price: 8000, unitCost: 0, createdMonth: 0, lastMonthSold: 0, totalSold: 0 };
    const base = demandFor(s, p, 1, 1).demandBottles;
    const s2 = { ...s, world: { ...s.world, modifiers: [{ id: 'm', key: 'demand:gin', factor: 0.5, fromMonth: 0, untilMonth: 3, label: 't' }] } };
    expect(demandFor(s2, p, 1, 1).demandBottles).toBeCloseTo(base * 0.5, 6);
    expect(demandFor({ ...s2, month: 3 }, p, 1, 1).demandBottles).toBeCloseTo(base, 6);
  });

  it('10년이면 이벤트가 여러 번 일어나고, 선택 이벤트는 기본값으로 처리된다', () => {
    let s = newGame({ seed: 25, startingCash: 50_000_000_000 });
    s = applyAction(s, { type: 'setOrder', recipeId: recipeId(s, '싱글 몰트 — 언'), batchesPerMonth: 2 }).state;
    s = advanceMonths(s, 120);
    expect(s.events.log.length).toBeGreaterThan(20);
    expect(s.events.pending.every((p) => p.month >= s.month - 1)).toBe(true);
  });

  it('예보된 이벤트는 예고 월이 지나면 발생하거나 빗나간다', () => {
    let s = newGame({ seed: 26 });
    s = { ...s, events: { ...s.events, forecasts: [{ id: 'f', defId: 'barley_failure', title: '보리 흉작', text: 't', fireMonth: 1, certainty: 1 }] } };
    s = advanceMonths(s, 2);
    expect(s.events.forecasts.length === 0 || s.events.forecasts.every((f) => f.defId !== 'barley_failure' || f.fireMonth > 1)).toBe(true);
    expect(s.world.modifiers.some((m) => m.key === 'ingredient:malt_unpeated' && m.factor > 1)).toBe(true);
  });

  it('선택 이벤트를 고르면 효과가 적용된다', () => {
    let s = newGame({ seed: 27 });
    s = { ...s, events: { ...s.events, pending: [{ id: 'v', defId: 'export_support', title: 't', text: 't', month: 0, choices: [], defaultChoice: 1 }] } };
    const cash = s.finance.cash;
    s = applyAction(s, { type: 'resolveEvent', eventId: 'v', choice: 0 }).state;
    expect(s.events.pending.length).toBe(0);
    expect(s.finance.cash).not.toBe(cash);
  });
});

describe('재무', () => {
  it('원리금 균등 상환액', () => {
    expect(annuityPayment(120_000_000, 0, 120)).toBe(1_000_000);
    const p = annuityPayment(100_000_000, 0.06, 12);
    expect(p).toBeGreaterThan(8_600_000);
    expect(p).toBeLessThan(8_610_000);
  });

  it('대출 잔액은 매달 줄어든다', () => {
    let s = newGame({ seed: 5 });
    s = applyAction(s, { type: 'takeLoan', offerId: 'working', amount: 100_000_000 }).state;
    const b0 = s.finance.loans[0]!.balance;
    s = advanceMonths(s, 3);
    expect(s.finance.loans[0]!.balance).toBeLessThan(b0);
  });
});

describe('결정론', () => {
  it('같은 시드와 같은 행동이면 결과가 같다', () => {
    const play = () => {
      let s = newGame({ seed: 77 });
      s = applyAction(s, { type: 'setOrder', recipeId: recipeId(s, '증류식'), batchesPerMonth: 2 }).state;
      s = applyAction(s, { type: 'setOrder', recipeId: recipeId(s, '싱글 몰트 — 언'), batchesPerMonth: 3 }).state;
      return advanceMonths(s, 18);
    };
    expect(JSON.stringify(play())).toBe(JSON.stringify(play()));
  });

  it('행동은 원본 상태를 바꾸지 않는다', () => {
    const s = newGame({ seed: 8 });
    const before = JSON.stringify(s);
    applyAction(s, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: 2 });
    advanceMonths(s, 2);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('지역 (v0.6)', () => {
  const asRecipe = (s: GameState, kind: string) => ({ ...presetRecipes(s.production.equipment[0]!.id, 'KR').find((r) => r.kind === kind)!, id: 'X' });

  it('교차 생산(결정 #67): 원산지 잠금이 없는 주종은 어느 지역에서나 만들 수 있고, 자생하지 않는 원재료는 물류 배수가 붙는다', () => {
    const jp = newGame({ seed: 1, region: 'JP' });
    const tw = newGame({ seed: 1, region: 'TW' });
    expect(validateRecipe(jp, asRecipe(jp, 'baijiu'))).toEqual([]);
    expect(validateRecipe(tw, asRecipe(tw, 'soju'))).toEqual([]);
    expect(logisticsMultiplier(['KR'], 'KR')).toBe(1);
    expect(logisticsMultiplier(['KR'], 'TW')).toBeCloseTo(1.3, 5);
    expect(logisticsMultiplier(['MX'], 'KR')).toBeCloseTo(1.8, 5);
    expect(logisticsMultiplier(undefined, 'JP')).toBe(1);
    // 같은 레시피(국산 쌀·누룩)를 대만에서 만들면 원재료비가 오른다
    const kr = newGame({ seed: 1, region: 'KR' });
    const soju = asRecipe(kr, 'soju');
    const still = stillDefOf(kr, kr.production.equipment[0]!.id)!;
    const home = simulateBatch(soju, still, 'stainless', kr.hr.staff[0], kr.world.priceIndex, 0, { tempC: 18, regionId: 'KR' });
    const away = simulateBatch(soju, still, 'stainless', kr.hr.staff[0], kr.world.priceIndex, 0, { tempC: 18, regionId: 'TW' });
    expect(away.cost).toBeGreaterThan(home.cost * 1.15);
  });

  it('진먼 고량은 대만 자생(다른 곳은 수입), 진먼섬 증류소에서 60% 이상 쓰면 "진먼 고량주" 특산물이 된다', () => {
    const yilan = newGame({ seed: 1, region: 'TW', startingCash: 5_000_000_000 });
    const yk = yilan.production.recipes.find((r) => r.kind === 'baijiu')!;
    const yl = advanceMonths(applyAction(yilan, { type: 'setOrder', recipeId: yk.id, batchesPerMonth: 1 }).state, 1);
    const ylot = yl.inventory.lots.find((l) => l.kind === 'baijiu')!;
    const ypv = previewBlend(yl, [{ source: 'lot', id: ylot.id, liters: ylot.volumeL }], { name: 'k', targetAbv: 0.58, bottleMl: 600, chillFilter: true, packagingId: 'standard' });
    expect(ypv.specialty).toBeNull();
    expect(ypv.warnings.some((w) => w.includes('진먼섬'))).toBe(true);
    let tw = newGame({ seed: 1, region: 'TW', site: 'kinmen', startingCash: 5_000_000_000 });
    const kinmen = tw.production.recipes.find((r) => r.kind === 'baijiu')!;
    tw = advanceMonths(applyAction(tw, { type: 'setOrder', recipeId: kinmen.id, batchesPerMonth: 1 }).state, 1);
    const lot = tw.inventory.lots.find((l) => l.kind === 'baijiu')!;
    const pv = previewBlend(tw, [{ source: 'lot', id: lot.id, liters: lot.volumeL }], { name: 'k', targetAbv: 0.58, bottleMl: 600, chillFilter: true, packagingId: 'standard' });
    expect(pv.specialty).toBe('kinmen');
    const p = { category: 'baijiu', ageYears: null, packagingId: 'standard', flavor: {}, quality: 60, typicity: 80, sourcedShare: 0 } as unknown as Product;
    expect(appeal({ ...p, specialty: 'kinmen' }, tw) / appeal(p, tw)).toBeCloseTo(1.35, 5);
  });

  it('최소 숙성 기간은 나라별: 한국 1년, 일본은 규정이 없어 바로 위스키, 대만 2년, 기본 3년', () => {
    const rules = (r: 'KR' | 'JP' | 'TW') => REGIONS[r].whisky;
    expect(categorize('malt', 11, 0.46, {}, false, true, rules('KR'))).toBe('malt_spirit');
    expect(categorize('malt', 12, 0.46, {}, false, true, rules('KR'))).toBe('whisky');
    expect(categorize('malt', 0, 0.46, {}, false, true, rules('JP'))).toBe('whisky');
    expect(categorize('malt', 23, 0.46, {}, false, true, rules('TW'))).toBe('malt_spirit');
    expect(categorize('malt', 24, 0.46, {}, false, true, rules('TW'))).toBe('whisky');
    expect(categorize('malt', 35, 0.46, {})).toBe('malt_spirit');
  });

  it('어린 위스키는 소비자 인식이 낮다 — 3년 미만은 크게 깎이고 3년에서 연속', () => {
    expect(agePerception(0)).toBeCloseTo(0.472, 2);
    expect(agePerception(12)).toBeLessThan(0.8);
    expect(agePerception(35.999)).toBeCloseTo(agePerception(36), 2);
  });

  it('3년 뒤 병 숙성 프리미엄은 같은 원액의 현물 시가와 같은 비율로 오른다, 18년 상한 (§6.2.1)', () => {
    // 몰트: 12년/3년 = 현물 시가 (1 + 0.2·12)/(1 + 0.2·3)
    expect(agePerception(144) / agePerception(36)).toBeCloseTo((1 + BULK.agePerYear * 12) / (1 + BULK.agePerYear * 3), 10);
    expect(agePerception(144)).toBeCloseTo(2.5075, 3);
    expect(agePerception(36)).toBeCloseTo(1.18, 10);
    // 그레인·블렌디드는 각자의 원액 상승률
    expect(agePerception(144, 'grain_whisky') / agePerception(36, 'grain_whisky')).toBeCloseTo((1 + BULK.grainAgePerYear * 12) / (1 + BULK.grainAgePerYear * 3), 10);
    expect(agePerception(144, 'blended_whisky')).toBeGreaterThan(agePerception(144, 'grain_whisky'));
    expect(agePerception(144, 'blended_whisky')).toBeLessThan(agePerception(144));
    // 연 단위 계단·단조 증가·상한
    for (let m = 36; m < 18 * 12; m += 12) expect(agePerception(m + 12)).toBeGreaterThan(agePerception(m));
    expect(agePerception(18 * 12)).toBe(agePerception(30 * 12));
    expect(agePerception(12 * 12 + 11)).toBe(agePerception(12 * 12));
  });

  it('숙성 프리미엄은 권장가와 매력도에 같이 들어간다 — 권장가로 내면 오래된 위스키도 수요(병)가 크게 줄지 않는다', () => {
    const kr = REGIONS.KR;
    const p3 = suggestedPrice(kr, 'whisky', 700, 75, 36, 0.46);
    const p12 = suggestedPrice(kr, 'whisky', 700, 75, 144, 0.46);
    expect(p12 / p3).toBeCloseTo(agePerception(144) / agePerception(36), 1);
    // 수요(병) ∝ 매력도 × (가격)^−탄력성 — 매력도도 같은 배수로 오르므로 한국(탄력성 1.1)에서 12년 대 3년 수요는 약 0.9배
    const base = { category: 'whisky', ageYears: 3, packagingId: 'standard', flavor: {}, quality: 75, typicity: 80, sourcedShare: 0 } as unknown as Product;
    const appealRatio = appeal({ ...base, oakMonths: 144, ageYears: 12 }) / appeal({ ...base, oakMonths: 36 });
    const demandRatio = appealRatio * Math.pow(p12 / p3, -kr.market.whisky!.elasticity);
    expect(demandRatio).toBeGreaterThan(0.85);
    expect(demandRatio).toBeLessThan(1);
  });

  it('일본: 3년 미만 자사 위스키는 "재패니즈 위스키" 표기를 못 해 매력도가 깎인다', () => {
    const jp = newGame({ seed: 1, region: 'JP' });
    const p = { category: 'whisky', ageYears: 3, oakMonths: 40, packagingId: 'standard', flavor: {}, quality: 70, typicity: 80, sourcedShare: 0 } as unknown as Product;
    expect(appeal({ ...p, premiumLabel: false }, jp) / appeal({ ...p, premiumLabel: true }, jp)).toBeCloseTo(0.7, 5);
  });
});

describe('매입 원액 브랜드 가치 (v0.8)', () => {
  const sourced = (prestige: number) => ({ category: 'whisky', ageYears: 5, oakMonths: 60, packagingId: 'standard', flavor: {}, quality: 75, typicity: 80, sourcedShare: 1, sourcedPrestige: prestige }) as unknown as Product;
  it('비싸게 사 온 원액일수록 브랜드 가치가 높다', () => {
    expect(sourcedPrestigeOf(35_000)).toBe(0);
    expect(sourcedPrestigeOf(58_000)).toBeGreaterThan(0.4);
    expect(sourcedPrestigeOf(90_000)).toBe(1);
    const kr = newGame({ seed: 1, region: 'KR' });
    expect(appeal(sourced(1), kr)).toBeGreaterThan(appeal(sourced(0), kr) * 1.5);
  });
  it('싼 매입 원액 병입은 한국에서 가장 덜 깎이고(종가세), 일본·대만에서는 거의 안 팔린다', () => {
    const own = { ...sourced(0), sourcedShare: 0 };
    const ratio = (r: 'KR' | 'JP' | 'TW') => { const g = newGame({ seed: 1, region: r }); return appeal(sourced(0), g) / appeal(own, g); };
    expect(ratio('KR')).toBeCloseTo(0.6, 5);
    expect(ratio('TW')).toBeCloseTo(0.3, 5);
    expect(ratio('JP')).toBeLessThan(0.2);
    expect(sourcedElasticityFactor(sourced(0))).toBeCloseTo(1.6, 5);
    expect(sourcedElasticityFactor(sourced(1))).toBe(1);
  });
});

describe('증발 보정 (v0.8)', () => {
  it('200L 배럴 연 증발: 대만 약 10~12%, 한국·일본 약 5%, 스코틀랜드형 약 2%', () => {
    const rate = (temps: number[], hum: number) => {
      const s = newGame({ seed: 1 });
      let cask: Cask = { ...s.inventory.casks[0]!, contents: { id: 'L', name: '', kind: 'malt', volumeL: 190, abv: 0.635, flavor: {}, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 0 } };
      for (let m = 0; m < 36; m++) cask = matureCask(cask, { tempC: temps[m % 12]!, humidity: hum }, { control: 0 }).cask;
      return 1 - Math.pow(cask.contents!.volumeL / 190, 1 / 3);
    };
    // 외기 그대로(습도 60 중립) 기준 — 숙성고 내부 보정은 아래 테스트
    expect(rate(REGIONS.TW.tempC, 60)).toBeGreaterThan(0.095);
    expect(rate(REGIONS.TW.tempC, 60)).toBeLessThan(0.14);
    expect(rate(REGIONS.KR.tempC, 60)).toBeGreaterThan(0.045);
    expect(rate([4, 4, 6, 8, 11, 14, 15, 15, 13, 10, 7, 5], 60)).toBeLessThan(0.025);
  });

  it('입지에 따라 기후가 바뀐다 (안동·진먼섬)', () => {
    expect(siteOf(newGame({ seed: 1, region: 'KR', site: 'andong' })).nameKo).toBe('경북 안동');
    expect(siteOf(newGame({ seed: 1, region: 'KR' })).tempC).toEqual(REGIONS.KR.tempC);
  });
});

describe('캐스크 보관비 (결정 #61)', () => {
  it('원액이 든 캐스크만 보관비·보험료가 붙고, 지역 인건비 배수를 따른다', () => {
    const kr = newGame({ seed: 1, region: 'KR' });
    expect(caskStorageCost(kr)).toBe(0);
    const cask = kr.b2b.brokerOffers[0]!.cask;
    kr.inventory.casks.push(cask);
    const value = cask.contents!.volumeL * cask.contents!.abv * bulkValuePerLPA(kr, cask.contents!);
    expect(caskStorageCost(kr)).toBe(Math.round(5_000 + value * 0.001));
    const jp = newGame({ seed: 1, region: 'JP' });
    jp.inventory.casks.push(cask);
    expect(caskStorageCost(jp)).toBeGreaterThan(caskStorageCost(kr));
  });

  it('고량주 원액은 백주 카테고리', () => {
    expect(categorize('baijiu', 0, 0.5, {})).toBe('baijiu');
  });

  it('종량세(일본) vs 종가세(한국): 같은 출고가면 한국 소비자가가 훨씬 높고, 권장가 역산이 맞는다', () => {
    const jp = consumerPrice(REGIONS.JP, 10_000, 700, 0.4);
    const kr = consumerPrice(REGIONS.KR, 10_000, 700, 0.4);
    expect(jp).toBeCloseTo((10_000 + 9_000 * 0.28) * 1.1 * 1.3, 0);
    expect(kr).toBeGreaterThan(jp * 1.4);
    for (const r of [REGIONS.KR, REGIONS.JP, REGIONS.TW]) expect(priceForConsumer(r, consumerPrice(r, 30_000, 700, 0.46), 700, 0.46)).toBeCloseTo(30_000, 0);
  });

  it('일본은 매입(수입) 원액 비중 감점이 크다 (재패니즈 위스키 표기 기준)', () => {
    const p = { category: 'whisky', ageYears: 5, packagingId: 'standard', flavor: {}, quality: 70, typicity: 80, sourcedShare: 1 } as unknown as Product;
    const own = { ...p, sourcedShare: 0 };
    const kr = newGame({ seed: 1, region: 'KR' });
    const jp = newGame({ seed: 1, region: 'JP' });
    expect(appeal(p, jp) / appeal(own, jp)).toBeLessThan(appeal(p, kr) / appeal(own, kr));
  });

  it('지역 한정 이벤트는 그 지역에서만 일어난다', () => {
    const titles = (region: 'KR' | 'TW') => new Set(advanceMonths(newGame({ seed: 7, region, startingCash: 50_000_000_000 }), 240).events.log.map((e) => e.title));
    const tw = titles('TW');
    const kr = titles('KR');
    for (const t of ['전통주 재조명', '정부 가공용 쌀 할인 공급', '지진', '본격 쇼추 붐']) expect(tw.has(t)).toBe(false);
    for (const t of ['지진', '대만 위스키 투기 거품 붕괴', '태풍 상륙']) expect(kr.has(t)).toBe(false);
  });
});

describe('실명 레지스트리 (결정 #44)', () => {
  it('실존 회사는 부도 이벤트 대상이 아니다 — 가상 회사 계약만 끊긴다', () => {
    const s = newGame({ seed: 1, region: 'KR' });
    const terms = { spirit: 'malt_newmake' as const, domestic: true, style: 'any' as const, lpaPerMonth: 100, termMonths: 12, pricePerLPA: 15_000, minQuality: 40, prepayShare: 0, penaltyPerLPA: 4_500, startMonth: 0, monthsDone: 0, deliveredLPA: 0, shortfallLPA: 0, prepaidRemaining: 0 };
    s.b2b.contracts = [
      { ...terms, id: 'C1', buyerId: 'goldenblue', buyerName: '골든블루' },
      { ...terms, id: 'C2', buyerId: 'hanra', buyerName: '한라 블렌디드 컴퍼니' },
    ];
    applyEffects(s, [{ type: 'buyerDefault' }], mulberry32(1), 'test');
    expect(s.b2b.contracts.map((c) => c.id)).toEqual(['C1']);
    applyEffects(s, [{ type: 'buyerDefault' }], mulberry32(2), 'test');
    expect(s.b2b.contracts.map((c) => c.id)).toEqual(['C1']);
  });

  it('실존 회사는 모두 canDefault가 아니고, 지역마다 현지 구매자가 있다', () => {
    const real = BUYERS.filter((b) => b.real !== b.fictional);
    expect(real.every((b) => !b.canDefault)).toBe(true);
    for (const region of ['KR', 'JP', 'TW'] as const) expect(buyersFor(newGame({ seed: 1, region })).some((b) => b.domestic)).toBe(true);
  });

  it('독립 병입자 캐스크 매입 제안을 수락하면 현금이 들어오고 캐스크가 빠진다', () => {
    let s = newGame({ seed: 1, region: 'KR' });
    const cask = s.b2b.brokerOffers[0]!.cask;
    s.inventory.casks.push(cask);
    s.b2b.caskBids = [{ id: 'I1', buyerName: '고든 앤 맥페일', caskId: cask.id, price: 12_000_000, expiresMonth: s.month + 2 }];
    const cash = s.finance.cash;
    s = applyAction(s, { type: 'acceptCaskBid', bidId: 'I1' }).state;
    expect(s.finance.cash).toBe(cash + 12_000_000);
    expect(s.inventory.casks.some((c) => c.id === cask.id)).toBe(false);
    expect(s.b2b.caskBids).toEqual([]);
  });
});

describe('v1.0 운영 시스템', () => {
  it('습도: 70%↑면 액량은 덜 줄고 도수가 떨어지며, 50%↓면 물이 더 날아가 도수가 오른다', () => {
    const wet = evaporate(200, 0.6, 0.004, 85);
    const dry = evaporate(200, 0.6, 0.004, 40);
    expect(wet.abv).toBeLessThan(0.6);
    expect(dry.abv).toBeGreaterThan(0.6);
    expect(wet.lostL).toBeLessThan(dry.lostL);
  });

  it('숙성고: 랙은 위가 덥고 건조하며, 더니지는 상하단 차이가 작고 연교차가 줄어든다', () => {
    const s = newGame({ seed: 1, region: 'KR', startingCash: 5_000_000_000 });
    s.production.equipment.push({ id: 'WD', catalogId: 'warehouse_dunnage_45', readyMonth: 0 });
    const at = (w: string, tier: number) => slotClimate(s, { slot: { w, tier } } as Cask, 8);
    expect(at('W0', 5).tempC - at('W0', 0).tempC).toBeGreaterThan(4);
    expect(at('W0', 5).humidity).toBeLessThan(at('W0', 0).humidity);
    expect(Math.abs(at('WD', 2).tempC - at('WD', 0).tempC)).toBeLessThan(1);
    expect(at('WD', 0).tempC).toBeLessThan(at('W0', 0).tempC);
  });

  it('로테이션: QC가 있어야 하고, 단을 뒤집는다', () => {
    let s = newGame({ seed: 1, region: 'KR' });
    const cask = s.b2b.brokerOffers[0]!.cask; s.inventory.casks.push(cask); cask.slot = { w: 'W0', tier: 5 };
    expect(applyAction(s, { type: 'rotateWarehouse', warehouseId: 'W0' }).error).toContain('QC');
    const qc = s.hr.candidates.find((c) => c.role === 'warehouse')!;
    s = applyAction(s, { type: 'hire', candidateId: qc.id }).state;
    s = applyAction(s, { type: 'rotateWarehouse', warehouseId: 'W0' }).state;
    expect(s.inventory.casks.find((c) => c.id === cask.id)!.slot!.tier).toBe(0);
  });

  it('발효 온도: 추우면 발효가 길어지고 플로럴↑, 더우면 짧아지고 열대 과일↑', () => {
    expect(fermentDaysAt(10, 0)).toBe(13);
    expect(fermentDaysAt(10, 30)).toBe(9);
    const s = newGame({ seed: 1 });
    const r = s.production.recipes.find((x) => x.kind === 'malt')!;
    const still = stillDefOf(s, r.stillId)!;
    const cold = simulateBatch(r, still, 'stainless', s.hr.staff[0], s.world.priceIndex, 0, { tempC: 2 });
    const hot = simulateBatch(r, still, 'stainless', s.hr.staff[0], s.world.priceIndex, 0, { tempC: 32 });
    expect(cold.flavor.floral ?? 0).toBeGreaterThan(hot.flavor.floral ?? 0);
    expect(hot.flavor.tropical ?? 0).toBeGreaterThan(cold.flavor.tropical ?? 0);
  });

  it('소매 처리 역량을 넘는 판매분은 고비용 채널, 2배를 넘으면 못 판다', () => {
    let s = newGame({ seed: 1, startingCash: 50_000_000_000 });
    s.commerce.awareness = 0.9;
    s.commerce.products.push({ id: 'P1', name: 'x', category: 'soju_distilled', ageYears: null, abv: 0.25, bottleMl: 375, chillFiltered: true, packagingId: 'standard', flavor: {}, quality: 80, typicity: 90, style: null, sourcedShare: 0, stockBottles: 1_000_000, price: 3000, unitCost: 1000, createdMonth: 0, lastMonthSold: 0, totalSold: 0 });
    s = advanceMonths(s, 1);
    const r = s.history.reports.at(-1)!;
    expect(r.retailSoldCases).toBeLessThanOrEqual(2 * r.retailCapacityCases! + 1);
    expect(r.overflowCases).toBeGreaterThan(0);
  });

  it('영업 직원을 늘릴수록 관리 효율이 떨어진다', () => {
    const s = newGame({ seed: 1 });
    const c0 = retailCapacityCases(s);
    const add = () => { const c = s.hr.candidates.find((x) => x.role === 'sales' && !s.hr.staff.includes(x))!; s.hr.staff.push({ ...c, stats: { a: 50, b: 60, c: 50 }, id: `S${s.hr.staff.length + 10}` }); s.hr.candidates = s.hr.candidates.filter((x) => x !== c); };
    s.hr.candidates = Array.from({ length: 4 }, (_, i) => ({ ...s.hr.candidates.find((x) => x.role === 'sales')!, id: `C${i}` }));
    add(); const c1 = retailCapacityCases(s); add(); const c2 = retailCapacityCases(s); add(); const c3 = retailCapacityCases(s);
    expect(c1 - c0).toBeGreaterThan(c2 - c1);
    expect(c2 - c1).toBeGreaterThan(c3 - c2);
    expect((c3 - c2) / (c1 - c0)).toBeCloseTo(0.36, 1);
  });

  it('재고 적체: 6개월 넘게 팔 재고는 매력도가 떨어진다', () => {
    expect(overhangFactor({ stockBottles: 1200, salesEma: 100, createdMonth: 0 }, 12)).toBeCloseTo(Math.sqrt(0.5), 5);
    expect(overhangFactor({ stockBottles: 500, salesEma: 100, createdMonth: 0 }, 12)).toBe(1);
    expect(overhangFactor({ stockBottles: 5000, salesEma: 10, createdMonth: 10 }, 12)).toBe(1);
  });

  it('캐스크 시장: 쿠퍼리지 주문은 2개월 뒤 도착, 스팟은 즉시·웃돈, 시즈닝 계약은 24개월 뒤 최상급', () => {
    let s = newGame({ seed: 1, startingCash: 5_000_000_000 });
    const n0 = s.inventory.casks.length;
    s = applyAction(s, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: 3 }).state;
    expect(s.inventory.casks.length).toBe(n0);
    s = applyAction(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: 2 }).state;
    expect(s.inventory.casks.length).toBe(n0 + 2);
    s = applyAction(s, { type: 'orderSeasoning', caskType: 'oloroso_butt', qty: 1 }).state;
    s = advanceMonths(s, 2);
    expect(s.inventory.casks.length).toBe(n0 + 2);
    s = advanceMonths(s, 1); // 2개월 뒤(3번째 월 처리 시작)에 도착
    expect(s.inventory.casks.length).toBe(n0 + 5);
    s = advanceMonths(s, 22);
    const butt = s.inventory.casks.find((c) => c.typeId === 'oloroso_butt')!;
    expect(butt.seasoning).toBeGreaterThan(1);
  });

  it('중고 통 매각: 쓴 빈 통만, 활성도가 높을수록 비싸다', () => {
    let s = newGame({ seed: 1 });
    const c = s.inventory.casks[0]!;
    expect(applyAction(s, { type: 'sellUsedCask', caskId: c.id }).error).toBeTruthy();
    c.fills = 2;
    const cash = s.finance.cash;
    s = applyAction(s, { type: 'sellUsedCask', caskId: c.id }).state;
    expect(s.finance.cash).toBeGreaterThan(cash);
  });

  it('부사수 없이 마스터가 떠나면 하우스 스타일 초기화, 24개월 수련한 부사수가 있으면 이어받는다', () => {
    let s = newGame({ seed: 1, startingCash: 5_000_000_000 });
    s.hr.houseStyle = 50;
    const master = s.hr.staff[0]!;
    let a = applyAction(s, { type: 'fire', staffId: master.id }).state;
    expect(a.hr.houseStyle).toBe(0);
    const cand = s.hr.candidates.find((c) => c.role === 'distiller')!;
    s = applyAction(s, { type: 'hire', candidateId: cand.id, asApprentice: true }).state;
    s.month += 24;
    a = applyAction(s, { type: 'fire', staffId: master.id }).state;
    expect(a.hr.houseStyle).toBe(45);
  });

  it('에이징 커브(근속 기준): 근속 20년 전에는 스탯이 꺾이지 않고, 넘으면 꺾인다', () => {
    let s = newGame({ seed: 3 });
    s.finance.cash = 1e11; // 매출 없이 4년을 돌리므로 파산해서 진행이 멈추지 않게
    const x = s.hr.staff[0]!;
    const id = x.id; // 퇴사 이벤트로 순서가 바뀔 수 있어 id로 추적한다
    const me = (g: GameState) => g.hr.staff.find((y) => y.id === id)!;
    x.ageAtHire = 20;
    s.finance.cash = 1e12; // 개월을 건너뛰는 시나리오라 파산으로 진행이 멈추지 않게 한다
    s.month = 200; x.hiredMonth = 0; const before = { ...x.stats };
    s = advanceMonths(s, 24);
    const st = me(s).stats;
    expect(st.a >= before.a && st.b >= before.b && st.c >= before.c).toBe(true); // 레벨업으로 오를 수는 있어도 꺾이지 않는다
    s.month = 300;
    me(s).level = 1000; // 에이징만 보려고 레벨업을 막는다
    const mid = { ...me(s).stats };
    s = advanceMonths(s, 24);
    const after = me(s).stats;
    expect(after.a + after.b + after.c).toBeLessThan(mid.a + mid.b + mid.c);
  });

  it('한국 완화책: 국산 원료 50% 이상 자사 제품은 전통주 주세 경감(연 100㎘까지 50%, 200㎘까지 30%), 지역 정책자금', () => {
    expect(traditionalTaxFactor(REGIONS.KR, true, 0)).toBe(0.5);
    expect(traditionalTaxFactor(REGIONS.KR, true, 150_000)).toBe(0.7);
    expect(traditionalTaxFactor(REGIONS.KR, true, 250_000)).toBe(1);
    expect(traditionalTaxFactor(REGIONS.JP, true, 0)).toBe(1);
    let kr = newGame({ seed: 1, region: 'KR', startingCash: 5_000_000_000 });
    const soju = kr.production.recipes.find((r) => r.kind === 'soju')!;
    kr = advanceMonths(applyAction(kr, { type: 'setOrder', recipeId: soju.id, batchesPerMonth: 1 }).state, 1);
    const lot = kr.inventory.lots.find((l) => l.kind === 'soju')!;
    const pv = previewBlend(kr, [{ source: 'lot', id: lot.id, liters: lot.volumeL }], { name: 's', targetAbv: 0.25, bottleMl: 375, chillFilter: true, packagingId: 'standard' });
    expect(pv.traditional).toBe(false); // 농업경영체 등록 전
    kr.production.equipment.push({ id: 'FR', catalogId: 'kr_farm_registration', readyMonth: 0 });
    expect(previewBlend(kr, [{ source: 'lot', id: lot.id, liters: lot.volumeL }], { name: 's', targetAbv: 0.25, bottleMl: 375, chillFilter: true, packagingId: 'standard' }).traditional).toBe(true);
    expect(traditionalTaxFactor(REGIONS.KR, true, 0, 600_000)).toBe(1); // 전년 500㎘ 초과
    expect(applyAction(kr, { type: 'takeLoan', offerId: 'kr_regional', amount: 300_000_000 }).error).toBeUndefined();
    expect(applyAction(newGame({ seed: 1, region: 'JP' }), { type: 'takeLoan', offerId: 'kr_regional', amount: 300_000_000 }).error).toBeTruthy();
  });

  it('에이징 커브: 65세에 은퇴한다', () => {
    let s = newGame({ seed: 1 });
    s.hr.staff[0]!.ageAtHire = 64.95;
    s = advanceMonths(s, 2);
    expect(s.hr.staff.length).toBe(0);
  });

  it('오염 통은 비워도 오염이 남고(통입 불가), 재탄화하면 다시 쓸 수 있다', () => {
    let s = newGame({ seed: 1 });
    const c = s.inventory.casks[0]!;
    c.contamination = 'mold'; c.fills = 1;
    expect(applyAction(s, { type: 'rechar', caskId: c.id }).state.inventory.casks[0]!.contamination).toBeUndefined();
    s = applyAction(s, { type: 'rechar', caskId: c.id }).state;
    expect(s.inventory.casks[0]!.contamination).toBeUndefined();
  });

  it('방재 설비가 있으면 재해 피해가 없다', () => {
    const s = newGame({ seed: 1 });
    expect(ownsFacility(s, 'facility_snow')).toBe(false);
    s.production.equipment.push({ id: 'F', catalogId: 'facility_snow', readyMonth: 0 });
    expect(ownsFacility(s, 'facility_snow')).toBe(true);
  });

  it('투자 유치와 캐스크 오너십 선도 판매', () => {
    let s = newGame({ seed: 1, startingCash: 5_000_000_000 });
    const cash = s.finance.cash;
    s = applyAction(s, { type: 'takeInvestment', offerId: 'angel' }).state;
    expect(s.finance.cash).toBe(cash + 200_000_000);
    expect(s.finance.investorShare).toBeCloseTo(0.1, 5);
    const cask = { ...s.b2b.brokerOffers[0]!.cask, contents: { ...s.b2b.brokerOffers[0]!.cask.contents!, sourced: false } };
    s.inventory.casks.push(cask);
    const before = s.finance.cash;
    s = applyAction(s, { type: 'sellCaskOwnership', caskId: cask.id }).state;
    expect(s.finance.cash).toBeGreaterThan(before);
    expect(applyAction(s, { type: 'sellBulk', source: 'cask', id: cask.id }).error).toContain('고객');
  });

  it('비지터 센터: 방문객 매출과 입소문이 쌓인다', () => {
    let s = newGame({ seed: 1, startingCash: 5_000_000_000 });
    s = applyAction(s, { type: 'buyEquipment', catalogId: 'visitor_basic' }).state;
    expect(applyAction(s, { type: 'buyEquipment', catalogId: 'visitor_restaurant' }).error).toBeTruthy();
    s = advanceMonths(s, 12);
    expect(s.history.reports.at(-1)!.visitors).toBeGreaterThan(0);
    expect(s.commerce.localBuzz).toBeGreaterThan(0);
  });
});

describe('월간 보고서 — 턴 사이 현금 흐름', () => {
  it('현물 벌크 판매(sellBulk)가 그달 보고서의 현물 매출·순현금에 잡힌다', () => {
    let s = newGame({ seed: 21 });
    s = applyAction(s, { type: 'setOrder', recipeId: recipeId(s, '싱글 몰트 — 언'), batchesPerMonth: 2 }).state;
    s = advanceMonths(s, 1);
    const lot = s.inventory.lots.find((l) => l.kind === 'malt')!;
    const before = s.finance.cash;
    s = applyAction(s, { type: 'sellBulk', source: 'lot', id: lot.id }).state;
    const sold = s.finance.cash - before;
    expect(sold).toBeGreaterThan(0);
    expect(s.finance.pendingCash?.spotBulk).toBe(sold);

    s = advanceMonths(s, 1);
    const r = s.history.reports.at(-1)!;
    expect(r.spotBulkRevenue).toBe(sold);
    expect(r.offTurn?.spotBulk).toBe(sold);
    // 순현금 = 직전 결산 이후 현금 변화 전체 (현물 판매 포함)
    expect(r.netCash).toBeCloseTo(r.cashEnd - s.history.reports.at(-2)!.cashEnd, 0);
    expect(r.operatingCash).toBeCloseTo(r.netCash, 0);
    // 결산 후 대기 중인 턴 사이 흐름은 비워진다
    expect(s.finance.pendingCash).toEqual({});
  });

  it('대출·캐스크 구매·IB/현물 매각까지 섞여도 순현금 = 월말 현금 차이, 영업+투자+재무 = 순현금', () => {
    let s = newGame({ seed: 22 });
    const cash0 = s.finance.cash;
    s = applyAction(s, { type: 'takeLoan', offerId: 'working', amount: 100_000_000 }).state;
    s = applyAction(s, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: 2 }).state;
    s = applyAction(s, { type: 'buyBrokerCask', offerId: s.b2b.brokerOffers[0]!.id }).state;
    s = applyAction(s, { type: 'sellBulk', source: 'cask', id: s.inventory.casks.at(-1)!.id }).state;
    s = advanceMonths(s, 1);
    let r = s.history.reports.at(-1)!;
    expect(r.netCash).toBeCloseTo(r.cashEnd - cash0, 0);
    expect(r.offTurn?.loan).toBe(100_000_000);
    expect(r.offTurn?.casks).toBeLessThan(0);
    expect(r.offTurn?.brokerCask).toBeLessThan(0);
    expect(r.spotBulkRevenue).toBeGreaterThan(0);
    // 대출(실행 − 그달 원금 상환)은 재무, 빈 캐스크는 투자 — 영업 현금흐름에는 들어가지 않는다
    expect(r.expenses.principal).toBeGreaterThan(0); // 운전자금 대출은 거치 기간이 없다
    expect(r.financingCash).toBe(100_000_000 - r.expenses.principal!);
    expect(r.investingCash).toBe(r.offTurn!.casks);
    expect(r.operatingCash! + r.investingCash! + r.financingCash!).toBeCloseTo(r.netCash, 0);

    // 행동 없는 달: 순현금은 예전과 같다(턴 안의 변화만), 정기 원금 상환은 재무
    s = advanceMonths(s, 1);
    r = s.history.reports.at(-1)!;
    expect(r.offTurn).toEqual({});
    expect(r.netCash).toBeCloseTo(r.cashEnd - s.history.reports.at(-2)!.cashEnd, 0);
    expect(r.financingCash).toBe(-(r.expenses.principal ?? 0));
  });

  it('계약 선급금은 재무로 잡혀 영업 현금흐름에서 빠지고, 납품 때 상계분은 영업 매출로 돌아온다', () => {
    let s = newGame({ seed: 24 });
    const offer = { ...s.b2b.contractOffers[0]!, style: 'any' as const, minQuality: 30, lpaPerMonth: 60, prepayShare: 0.3 };
    s = { ...s, b2b: { ...s.b2b, contractOffers: [offer] } };
    s = applyAction(s, { type: 'setOrder', recipeId: recipeId(s, '싱글 몰트 — 언'), batchesPerMonth: 3 }).state;
    s = applyAction(s, { type: 'acceptContract', offerId: offer.id }).state;
    const prepaid = s.finance.pendingCash!.contractPrepay!;
    expect(prepaid).toBeGreaterThan(0);
    s = advanceMonths(s, 1);
    const r = s.history.reports.at(-1)!;
    // 생산한 달에 바로 납품 → 상계분은 현금이 아니지만 영업 매출로, 같은 금액은 재무(선급금 상환)로
    expect(r.prepayApplied).toBeGreaterThan(0);
    expect(r.financingCash).toBeCloseTo(prepaid - r.prepayApplied!, 0);
    expect(r.operatingCash! + r.investingCash! + r.financingCash!).toBeCloseTo(r.netCash, 0);
    // 선급금 없이 같은 납품을 했을 때와 영업 현금흐름이 같다 (상계분 = 납품 총액 − 받은 현금)
    expect(r.bulkRevenue + r.prepayApplied!).toBeCloseTo(r.bulk[0]!.deliveredLPA * offer.pricePerLPA, -1);
  });

  it('계약 해지 비용은 위약금(영업)과 남은 선급금 반환(재무)으로 나뉜다', () => {
    let s = newGame({ seed: 25 });
    const offer = { ...s.b2b.contractOffers[0]!, minQuality: 30, prepayShare: 0.3 };
    s = { ...s, b2b: { ...s.b2b, contractOffers: [offer] } };
    s = applyAction(s, { type: 'acceptContract', offerId: offer.id }).state;
    const remaining = s.b2b.contracts[0]!.prepaidRemaining;
    const before = s.finance.cash;
    s = applyAction(s, { type: 'cancelContract', contractId: s.b2b.contracts[0]!.id }).state;
    const cost = before - s.finance.cash;
    expect(s.finance.pendingCash!.contractPrepay).toBeCloseTo(remaining - Math.round(remaining), 0); // 입금 − 반환 ≈ 0
    expect(s.finance.pendingCash!.contractCancel).toBeCloseTo(-(cost - Math.round(remaining)), 0);
    expect(s.finance.pendingCash!.contractCancel).toBeLessThan(0);
  });

  it('구버전 세이브(pendingCash 없음)도 그대로 진행된다', () => {
    const g = newGame({ seed: 23 });
    const { pendingCash: _p, ...finance } = g.finance;
    let s: GameState = { ...g, finance };
    s = applyAction(s, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: 1 }).state;
    s = advanceMonths(s, 1);
    expect(s.history.reports.at(-1)!.offTurn?.casks).toBeLessThan(0);
  });
});

describe('수출 (#95)', () => {
  const whisky = (over: Partial<Product> = {}): Product => ({ id: 'w', name: 'w', category: 'whisky', ageYears: 3, oakMonths: 40, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 70, typicity: 100, style: null, sourcedShare: 0, stockBottles: 1000, price: 40_000, unitCost: 12_000, createdMonth: 0, lastMonthSold: 0, totalSold: 0, ...over });

  it('수출 소비자가 = ((출고가+운임)×(1+관세) + 현지 주세) × 유통 배수 × (1+부가세)', () => {
    const m = EXPORT_MARKETS.UK;
    const p = whisky();
    const lpa = 0.7 * 0.46;
    const expected = ((40_000 + m.freightPerBottle.KR) * (1 + m.tariff.KR) + m.excisePerLPA * lpa) * m.channelMultiple * (1 + m.vat);
    expect(exportShelfPrice({ regionId: 'KR' }, p, m)).toBeCloseTo(expected, 6);
    // 면세점은 세금이 없어 같은 출고가라도 영국보다 싸다
    expect(exportShelfPrice({ regionId: 'KR' }, p, EXPORT_MARKETS.DF)).toBeLessThan(exportShelfPrice({ regionId: 'KR' }, p, m));
  });

  it('영국은 3년 미만 위스키를 받지 않는다', () => {
    expect(exportEligible(whisky({ oakMonths: 24 }), EXPORT_MARKETS.UK)).toBe(false);
    expect(exportEligible(whisky({ oakMonths: 24 }), EXPORT_MARKETS.US)).toBe(true);
    expect(exportEligible(whisky({ category: 'baijiu' }), EXPORT_MARKETS.US)).toBe(false);
  });

  it('수입사 계약(#101) → 준비 기간 뒤 판매, 수출분은 국내 주세가 없고 매입가는 출고가 × 계약 비율, 대금은 3개월 뒤', () => {
    let s = newGame({ seed: 41 });
    s = { ...s, finance: { ...s.finance, cash: 1e10 }, commerce: { ...s.commerce, awareness: 0.5, products: [whisky({ stockBottles: 5000 })] } };
    const offer = makeExportOffer(s, 'DF', mulberry32(1));
    s.commerce.exportOffers = [offer];
    s = applyAction(s, { type: 'acceptExportOffer', offerId: offer.id }).state;
    expect(s.commerce.exports).toHaveLength(1);
    expect(s.finance.cash).toBe(1e10 - EXPORT_MARKETS.DF.entryCost);
    const before = advanceMonths(s, 1);
    expect(before.history.reports.at(-1)!.exports?.reduce((t, x) => t + x.bottles, 0) ?? 0).toBe(0); // 아직 준비 중
    expect(before.history.reports.at(-1)!.expenses.export_fixed).toBe(offer.marketingPerMonth);
    const after = advanceMonths(s, EXPORT_MARKETS.DF.entryMonths + 1);
    const r = after.history.reports.at(-1)!;
    const sold = r.exports!.reduce((t, x) => t + x.bottles, 0);
    expect(sold).toBeGreaterThan(0);
    expect(r.exportRevenue).toBe(Math.round(sold * 40_000 * offer.priceFactor));
    expect(r.expenses.export_freight).toBe(sold * EXPORT_MARKETS.DF.freightPerBottle.KR);
    expect(after.finance.receivables.some((x) => x.dueMonth === after.month - 1 + 3 && x.label.includes('수출'))).toBe(true);
    expect(exportDemandFor(after, after.commerce.products[0]!, after.commerce.exports![0]!, 1)).toBeGreaterThan(0);
  });
});

describe('해외 명성 (#96)', () => {
  it('명성이 오르면 진출 시장 인지도가 뛰고 상한이 오르며, 매달 식는다', () => {
    const s = newGame({ seed: 51 });
    s.commerce.exports = [{ marketId: 'US', openedMonth: 0, readyMonth: 0, awareness: 0.05, totalBottles: 0 }];
    const base = exportAwarenessMax(s, 'US');
    applyEffects(s, [{ type: 'acclaim', delta: 0.35 }], mulberry32(1), 't');
    expect(s.commerce.acclaim).toBeCloseTo(0.35, 6);
    expect(s.commerce.exports[0]!.awareness).toBeCloseTo(0.4, 6);
    expect(exportAwarenessMax(s, 'US')).toBeCloseTo(base + 0.4 * 0.35, 6);
    updateExportAwareness(s);
    expect(s.commerce.acclaim!).toBeLessThan(0.35);
    // 나중에 진출해도 명성만큼 바닥이 깔린다
    s.commerce.exports.push({ marketId: 'UK', openedMonth: 1, readyMonth: 1, awareness: 0.02, totalBottles: 0 });
    s.month = 1;
    updateExportAwareness(s);
    expect(s.commerce.exports[1]!.awareness).toBeGreaterThanOrEqual(0.15);
  });
});
