import { describe, expect, it } from 'vitest';
import {
  advanceMonths, annuityPayment, applyAction, bottleMargin, brokerAskPerLPA, bulkValuePerLPA, categorize, demandFor, evaluate, evaporate, heartsFraction, spotBidPerLPA, spotQuote,
  makeContractOffer, matureCask, mulberry32, newGame, previewBlend, qualityFactor, sizeFactor, simulateBatch, stillDefOf, volumeDiscounts, warehouseCapacity, windowFraction, type Cask, type GameState, type SpiritLot,
  appeal, applyEffects, buyersFor, presetRecipes, suggestedPrice, validateRecipe, type Product,
} from './index';
import { EQUIPMENT, INGREDIENTS } from './content/catalog';
import { BUYERS } from './content/names';
import { APPLY_KR_BASE_DEDUCTION, consumerPrice, krImportCompetitionFactor, priceForConsumer, REGIONS, setKrBaseDeduction } from './content/regions';
import { DEFAULT_SITE, SITES } from './content/sites';
import {
  applyTerroir, dutyFreeDemand, fermentCapacityFactor, isTraditionalRecipe, migrateState, productConsumerPrice, riskScale, scaleEffects,
  traditionalReliefRate, waterPermitCap, WATER_EFFECT,
  agingOutlook, holdingCost, ingredientSupplyCap, inventoryCollateral, inventoryLoanRoom, makeOemOffer, oemPackageCost, makeRetailOffer, runVisitorSales, startOem, startRetail,
} from './index';
import { HOLDING } from './content/catalog';

const recipeId = (s: GameState, prefix: string) => s.recipes.find((r) => r.name.startsWith(prefix))!.id;

describe('컷 포인트', () => {
  it('전 구간이면 거의 전부, 좁힐수록 하트 비율이 줄어든다', () => {
    expect(windowFraction(0.5, 0.1, -1, 2)).toBeCloseTo(1, 3);
    expect(heartsFraction(0.15, 0.72)).toBeLessThan(heartsFraction(0.1, 0.8));
  });

  it('후류 전환점(c2)을 늦추면 피트·후류취가 늘고 수율이 오른다', () => {
    const s = newGame({ seed: 1 });
    const still = stillDefOf(s, s.recipes[0]!.stillId)!;
    const peated = s.recipes.find((r) => r.name.endsWith('— 피티드'))!;
    const early = simulateBatch({ ...peated, cut: { c1: 0.15, c2: 0.65 } }, still, 'stainless', s.staff[0], s.priceIndex, 0);
    const late = simulateBatch({ ...peated, cut: { c1: 0.15, c2: 0.85 } }, still, 'stainless', s.staff[0], s.priceIndex, 0);
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
    let cask: Cask = { ...s.casks[0]!, contents: lot, fills: 1 };
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
    s = { ...s, casks: [{ ...s.casks[0]!, contents: mk('a', 60) }, { ...s.casks[1]!, contents: mk('b', 40) }] };
    const p = previewBlend(s, [{ source: 'cask', id: s.casks[0]!.id, liters: 100 }, { source: 'cask', id: s.casks[1]!.id, liters: 100 }], { name: 't', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' });
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
    const gin = s.lots.find((l) => l.kind === 'gin')!;
    const g = previewBlend(s, [{ source: 'lot', id: gin.id, liters: gin.volumeL }], { name: 'g', targetAbv: 0.43, bottleMl: 700, chillFilter: true, packagingId: 'standard' });
    expect(bottleMargin({ price: g.suggestedPrice, unitCost: g.unitCost, bottleMl: 700 }).rate).toBeLessThan(0.25);

    const aged: SpiritLot = { id: 'w', name: 'w', kind: 'malt', volumeL: 180, abv: 0.6, flavor: { fresh_fruit: 30, floral: 15, cereal: 20, vanilla_caramel: 45, oak_tannin: 25, wood_spice: 20, integration: 60, harshness: 25 }, createdMonth: 0, oakMonths: 48, sourced: false, costPerLPA: 8_000 };
    const s2 = { ...s, casks: [{ ...s.casks[0]!, contents: aged }] };
    const w = previewBlend(s2, [{ source: 'cask', id: s2.casks[0]!.id, liters: 180 }], { name: 'w', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' });
    expect(w.category).toBe('whisky');
    expect(bottleMargin({ price: w.suggestedPrice, unitCost: w.unitCost, bottleMl: 700 }).rate).toBeGreaterThan(0.6);
  });
});

describe('원액 B2B', () => {
  it('같은 원액이면 현물 매입가 < 브로커 판매가 (사고팔기 차익 없음)', () => {
    const s = newGame({ seed: 9 });
    const lot = s.brokerOffers[0]!.cask.contents!;
    expect(spotBidPerLPA(s, lot)).toBeLessThan(brokerAskPerLPA(s, lot));
    expect(spotQuote(s, lot, lot.volumeL, s.brokerOffers[0]!.cask)).toBeLessThan(s.brokerOffers[0]!.price);
  });

  it('숙성될수록 벌크 가치가 오른다', () => {
    const s = newGame({ seed: 10 });
    const base: SpiritLot = { id: 'n', name: 'n', kind: 'malt', volumeL: 100, abv: 0.635, flavor: { cereal: 30, fresh_fruit: 20 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 6000 };
    expect(bulkValuePerLPA(s, { ...base, oakMonths: 48 })).toBeGreaterThan(bulkValuePerLPA(s, base));
  });

  it('캐스크째 현물 판매하면 캐스크가 사라지고 현금이 들어온다', () => {
    let s = newGame({ seed: 11 });
    s = applyAction(s, { type: 'buyBrokerCask', offerId: s.brokerOffers[0]!.id }).state;
    const cask = s.casks.at(-1)!;
    const cash = s.cash;
    s = applyAction(s, { type: 'sellBulk', source: 'cask', id: cask.id }).state;
    expect(s.casks.some((c) => c.id === cask.id)).toBe(false);
    expect(s.cash).toBeGreaterThan(cash);
  });

  it('계약은 매달 탱크 뉴메이크를 자동 납품하고, 부족하면 위약금을 낸다', () => {
    let s = newGame({ seed: 12 });
    const offer = { ...s.contractOffers[0]!, style: 'any' as const, minQuality: 30, lpaPerMonth: 60, prepayShare: 0 };
    s = { ...s, contractOffers: [offer] };
    s = applyAction(s, { type: 'acceptContract', offerId: offer.id }).state;
    // 생산 없음 → 첫 달 전량 미납
    s = advanceMonths(s, 1);
    expect(s.reports.at(-1)!.bulk[0]!.deliveredLPA).toBe(0);
    expect(s.reports.at(-1)!.expenses.penalty).toBeGreaterThan(0);
    // 몰트 생산 → 납품
    s = applyAction(s, { type: 'setOrder', recipeId: recipeId(s, '싱글 몰트 — 언'), batchesPerMonth: 3 }).state;
    s = advanceMonths(s, 1);
    expect(s.reports.at(-1)!.bulk[0]!.deliveredLPA).toBeCloseTo(60, 3);
    expect(s.reports.at(-1)!.bulkRevenue).toBeCloseTo(60 * offer.pricePerLPA, -1);
  });

  it('누적 미납이 두 달치가 되면 계약이 파기되고 신뢰도가 떨어진다', () => {
    let s = newGame({ seed: 13 });
    const offer = { ...s.contractOffers[0]!, minQuality: 30, prepayShare: 0.3 };
    s = { ...s, contractOffers: [offer] };
    const trust = s.b2bTrust;
    s = applyAction(s, { type: 'acceptContract', offerId: offer.id }).state;
    expect(s.contracts[0]!.prepaidRemaining).toBeGreaterThan(0);
    s = advanceMonths(s, 2);
    expect(s.contracts.length).toBe(0);
    expect(s.b2bTrust).toBeLessThan(trust - 10);
  });
});

describe('그레인·블렌디드', () => {
  it('연속식 증류기는 한 번에 고도수 그레인 원액을 만든다', () => {
    const s = newGame({ seed: 21 });
    const r = { ...s.recipes[0]!, kind: 'grain' as const, mashBill: [{ ingredientId: 'corn', ratio: 0.9 }, { ingredientId: 'malt_unpeated', ratio: 0.1 }], fermentDays: 3, runs: 1 as const };
    const b = simulateBatch(r, EQUIPMENT.column_2 as never, 'stainless', s.staff[0], s.priceIndex, 0);
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
    expect(volumeDiscounts({ ...s, ingredientKgLastMonth: { malt_unpeated: 20_000 } }).malt_unpeated).toBeLessThan(1);
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
});

describe('변동 요소', () => {
  it('수요 보정치가 활성 기간에만 수요를 바꾼다', () => {
    const s = newGame({ seed: 24 });
    const p = { id: 'p', name: 'p', category: 'gin' as const, ageYears: null, abv: 0.43, bottleMl: 700, chillFiltered: true, packagingId: 'standard', flavor: {}, quality: 55, typicity: 100, style: null, sourcedShare: 0, stockBottles: 100, price: 8000, unitCost: 0, createdMonth: 0, lastMonthSold: 0, totalSold: 0 };
    const base = demandFor(s, p, 1, 1).demandBottles;
    const s2 = { ...s, modifiers: [{ id: 'm', key: 'demand:gin', factor: 0.5, fromMonth: 0, untilMonth: 3, label: 't' }] };
    expect(demandFor(s2, p, 1, 1).demandBottles).toBeCloseTo(base * 0.5, 6);
    expect(demandFor({ ...s2, month: 3 }, p, 1, 1).demandBottles).toBeCloseTo(base, 6);
  });

  it('10년이면 이벤트가 여러 번 일어나고, 선택 이벤트는 기본값으로 처리된다', () => {
    let s = newGame({ seed: 25, startingCash: 50_000_000_000 });
    s = applyAction(s, { type: 'setOrder', recipeId: recipeId(s, '싱글 몰트 — 언'), batchesPerMonth: 2 }).state;
    s = advanceMonths(s, 120);
    expect(s.eventLog.length).toBeGreaterThan(20);
    expect(s.pendingEvents.every((p) => p.month >= s.month - 1)).toBe(true);
  });

  it('예보된 이벤트는 예고 월이 지나면 발생하거나 빗나간다', () => {
    let s = newGame({ seed: 26 });
    s = { ...s, forecasts: [{ id: 'f', defId: 'barley_failure', title: '보리 흉작', text: 't', fireMonth: 1, certainty: 1 }] };
    s = advanceMonths(s, 2);
    expect(s.forecasts.length === 0 || s.forecasts.every((f) => f.defId !== 'barley_failure' || f.fireMonth > 1)).toBe(true);
    expect(s.modifiers.some((m) => m.key === 'ingredient:malt_unpeated' && m.factor > 1)).toBe(true);
  });

  it('선택 이벤트를 고르면 효과가 적용된다', () => {
    let s = newGame({ seed: 27 });
    s = { ...s, pendingEvents: [{ id: 'v', defId: 'export_support', title: 't', text: 't', month: 0, choices: [], defaultChoice: 1 }] };
    const cash = s.cash;
    s = applyAction(s, { type: 'resolveEvent', eventId: 'v', choice: 0 }).state;
    expect(s.pendingEvents.length).toBe(0);
    expect(s.cash).not.toBe(cash);
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
    const b0 = s.loans[0]!.balance;
    s = advanceMonths(s, 3);
    expect(s.loans[0]!.balance).toBeLessThan(b0);
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
  const asRecipe = (s: GameState, kind: string) => ({ ...presetRecipes(s.equipment[0]!.id, 'KR').find((r) => r.kind === kind)!, id: 'X' });

  it('주종 생산 지역 규칙: 소주는 한국·일본, 백주는 한국만(중국은 추후), 대만은 둘 다 불가', () => {
    const kr = newGame({ seed: 1, region: 'KR' });
    const jp = newGame({ seed: 1, region: 'JP' });
    const tw = newGame({ seed: 1, region: 'TW' });
    expect(validateRecipe(kr, asRecipe(kr, 'baijiu'))).toEqual([]);
    expect(validateRecipe(jp, asRecipe(jp, 'baijiu')).length).toBeGreaterThan(0);
    expect(validateRecipe(tw, asRecipe(tw, 'soju')).length).toBeGreaterThan(0);
    expect(jp.recipes.some((r) => r.kind === 'soju')).toBe(true);
    expect(tw.recipes.some((r) => r.kind === 'soju' || r.kind === 'baijiu')).toBe(false);
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
    const titles = (region: 'KR' | 'TW') => new Set(advanceMonths(newGame({ seed: 7, region, startingCash: 50_000_000_000 }), 240).eventLog.map((e) => e.title));
    const tw = titles('TW');
    const kr = titles('KR');
    // v0.8: 대만(이란)은 지진대에 있어 지진이 일어날 수 있다 (regions.md §4.3.1)
    for (const t of ['전통주 재조명', '정부 가공용 쌀 할인 공급', '본격 쇼추 붐']) expect(tw.has(t)).toBe(false);
    for (const t of ['지진', '대만 위스키 투기 거품 붕괴', '태풍 상륙']) expect(kr.has(t)).toBe(false);
  });
});

describe('실명 레지스트리 (결정 #44)', () => {
  it('실존 회사는 부도 이벤트 대상이 아니다 — 가상 회사 계약만 끊긴다', () => {
    const s = newGame({ seed: 1, region: 'KR' });
    const terms = { spirit: 'malt_newmake' as const, domestic: true, style: 'any' as const, lpaPerMonth: 100, termMonths: 12, pricePerLPA: 15_000, minQuality: 40, prepayShare: 0, penaltyPerLPA: 4_500, startMonth: 0, monthsDone: 0, deliveredLPA: 0, shortfallLPA: 0, prepaidRemaining: 0 };
    s.contracts = [
      { ...terms, id: 'C1', buyerId: 'goldenblue', buyerName: '골든블루' },
      { ...terms, id: 'C2', buyerId: 'hanra', buyerName: '한라 블렌디드 컴퍼니' },
    ];
    applyEffects(s, [{ type: 'buyerDefault' }], mulberry32(1), 'test');
    expect(s.contracts.map((c) => c.id)).toEqual(['C1']);
    applyEffects(s, [{ type: 'buyerDefault' }], mulberry32(2), 'test');
    expect(s.contracts.map((c) => c.id)).toEqual(['C1']);
  });

  it('실존 회사는 모두 canDefault가 아니고, 지역마다 현지 구매자가 있다', () => {
    const real = BUYERS.filter((b) => b.real !== b.fictional);
    expect(real.every((b) => !b.canDefault)).toBe(true);
    for (const region of ['KR', 'JP', 'TW'] as const) expect(buyersFor(newGame({ seed: 1, region })).some((b) => b.domestic)).toBe(true);
  });

  it('독립 병입자 캐스크 매입 제안을 수락하면 현금이 들어오고 캐스크가 빠진다', () => {
    let s = newGame({ seed: 1, region: 'KR' });
    const cask = s.brokerOffers[0]!.cask;
    s.casks.push(cask);
    s.caskBids = [{ id: 'I1', buyerName: '고든 앤 맥페일', caskId: cask.id, price: 12_000_000, expiresMonth: s.month + 2 }];
    const cash = s.cash;
    s = applyAction(s, { type: 'acceptCaskBid', bidId: 'I1' }).state;
    expect(s.cash).toBe(cash + 12_000_000);
    expect(s.casks.some((c) => c.id === cask.id)).toBe(false);
    expect(s.caskBids).toEqual([]);
  });
});

describe('산지 (v0.8, regions.md Tier 1)', () => {
  const sojuOf = (s: GameState) => s.recipes.find((r) => r.kind === 'soju')!;
  const bottleLot = (s: GameState, lotId: string, abv = 0.25) => applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: lotId, liters: s.lots.find((l) => l.id === lotId)!.volumeL }], options: { name: 'x', targetAbv: abv, bottleMl: 375, chillFilter: true, packagingId: 'standard' } }).state;

  it('국가마다 표준 산지가 있고, 표준 산지는 v0.6 지역 수치를 그대로 쓴다', () => {
    for (const r of ['KR', 'JP', 'TW'] as const) {
      const s = newGame({ seed: 1, region: r });
      expect(s.siteId).toBe(DEFAULT_SITE[r]);
      expect(SITES[s.siteId].standard).toBe(true);
    }
    expect(SITES.gyeonggi.tempC).toEqual([-3, 0, 6, 13, 18, 23, 26, 26, 21, 14, 6, -1]);
    expect(SITES.kanto.overheadPerMonth).toBe(12_000_000);
    expect(newGame({ seed: 1, site: 'hokkaido' }).regionId).toBe('JP');
  });

  it('v4 세이브는 국가의 표준 산지로 마이그레이션된다', () => {
    const { siteId: _siteId, siteState: _ss, ...rest } = newGame({ seed: 1, region: 'JP' });
    const v4 = { ...rest, version: 4 };
    const s = migrateState(JSON.parse(JSON.stringify(v4)))!;
    expect(s.version).toBe(5);
    expect(s.siteId).toBe('kanto');
    expect(s.siteState).toEqual({});
    expect(s.priceIndex.jeju_millet).toBe(1);
    expect(migrateState({ version: 3 })).toBeNull();
    expect(advanceMonths(s, 2).month).toBe(2);
  });

  it('증발 보정: 이란은 연 약 10%, 홋카이도는 1.5% 안팎 (기후 모델 × angelShareFactor)', () => {
    const yearLoss = (siteId: keyof typeof SITES) => {
      const site = SITES[siteId];
      let c: Cask = { id: 'c', typeId: 'ex_bourbon_barrel', sizeL: 200, wood: 'american_oak', activity: 1, seasoning: 1, fills: 1, recharCount: 0, char: 3, contents: { id: 'l', name: 'x', kind: 'malt', volumeL: 190, abv: 0.635, flavor: {}, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 1 } };
      for (let m = 0; m < 12; m++) c = matureCask(c, { tempC: site.tempC[m]!, humidity: site.humidity[m]! }, { control: 0, evaporationFactor: site.angelShareFactor }).cask;
      return 1 - c.contents!.volumeL / 190;
    };
    expect(yearLoss('yilan')).toBeGreaterThan(0.09);
    expect(yearLoss('yilan')).toBeLessThan(0.11);
    expect(yearLoss('hokkaido')).toBeGreaterThan(0.013);
    expect(yearLoss('hokkaido')).toBeLessThan(0.017);
  });

  it('기준판매비율(결정 #61): 과세표준이 줄지만, 수입 경쟁 기준가·가격 민감도 때문에 국산 마진은 v0.6 수준에 머문다', () => {
    expect(APPLY_KR_BASE_DEDUCTION).toBe(true);
    const plain = consumerPrice(REGIONS.KR, 50_000, 700, 0.4);
    const whisky = consumerPrice(REGIONS.KR, 50_000, 700, 0.4, 1, { category: 'whisky' });
    expect(whisky).toBeLessThan(plain * 0.92);
    expect(consumerPrice(REGIONS.JP, 50_000, 700, 0.4, 1, { category: 'whisky' })).toBeCloseTo(consumerPrice(REGIONS.JP, 50_000, 700, 0.4), 6);
    for (const opts of [{ category: 'whisky' as const }, { category: 'soju_distilled' as const, relief: 0.5 }])
      expect(priceForConsumer(REGIONS.KR, consumerPrice(REGIONS.KR, 30_000, 700, 0.4, 1, opts), 700, 0.4, opts)).toBeCloseTo(30_000, 0);
    const on = { ref: REGIONS.KR.market.whisky.refConsumerPricePerL, e: REGIONS.KR.market.whisky.elasticity, price: suggestedPrice(REGIONS.KR, 'whisky', 700, 70, 4, 0.46) };
    setKrBaseDeduction(false);
    const off = { ref: REGIONS.KR.market.whisky.refConsumerPricePerL, e: REGIONS.KR.market.whisky.elasticity, price: suggestedPrice(REGIONS.KR, 'whisky', 700, 70, 4, 0.46) };
    setKrBaseDeduction(true);
    expect(on.ref).toBeCloseTo(off.ref * krImportCompetitionFactor('whisky'), -2);
    expect(on.e).toBeCloseTo(off.e + 0.2, 6);
    // 기준판매비율로 생긴 출고가 여유는 수입 경쟁이 상쇄 → 권장 출고가는 거의 같다 (±1%)
    expect(Math.abs(on.price / off.price - 1)).toBeLessThan(0.01);
  });

  it('전통주 자격(결정 #62): 안동은 안동 쌀(지역 농산물)만, 수입·타지역 원료가 섞이면 감면 없음. 제주는 차조 50% 이상', () => {
    const local = { kind: 'soju' as const, mashBill: [{ ingredientId: 'andong_rice', ratio: 0.92 }, { ingredientId: 'nuruk', ratio: 0.08 }] };
    const korean = { kind: 'soju' as const, mashBill: [{ ingredientId: 'rice_domestic', ratio: 0.92 }, { ingredientId: 'nuruk', ratio: 0.08 }] };
    const mixed = { kind: 'soju' as const, mashBill: [{ ingredientId: 'andong_rice', ratio: 0.6 }, { ingredientId: 'rice_processing', ratio: 0.32 }, { ingredientId: 'nuruk', ratio: 0.08 }] };
    const millet = { kind: 'soju' as const, mashBill: [{ ingredientId: 'jeju_millet', ratio: 0.9 }, { ingredientId: 'nuruk', ratio: 0.1 }] };
    expect(isTraditionalRecipe(SITES.andong, local)).toBe(true);
    expect(isTraditionalRecipe(SITES.andong, korean)).toBe(false);
    expect(isTraditionalRecipe(SITES.andong, mixed)).toBe(false);
    expect(isTraditionalRecipe(SITES.andong, { kind: 'malt', mashBill: [{ ingredientId: 'malt_unpeated', ratio: 1 }] })).toBe(false);
    expect(isTraditionalRecipe(SITES.andong, { kind: 'malt', mashBill: [{ ingredientId: 'malt_korean', ratio: 1 }] })).toBe(false);
    expect(isTraditionalRecipe(SITES.gyeonggi, local)).toBe(false);
    expect(isTraditionalRecipe(SITES.jeju, millet)).toBe(true);
    expect(isTraditionalRecipe(SITES.jeju, korean)).toBe(false);
  });

  it('전통주 감면: 안동 소주는 감면으로 소비자가가 낮고, 출고량 구간·전년 실적에 따라 감면율이 바뀐다', () => {
    let a = newGame({ seed: 2, site: 'andong' });
    let g = newGame({ seed: 2, site: 'gyeonggi' });
    a = advanceMonths(applyAction(a, { type: 'setOrder', recipeId: sojuOf(a).id, batchesPerMonth: 1 }).state, 1);
    g = advanceMonths(applyAction(g, { type: 'setOrder', recipeId: sojuOf(g).id, batchesPerMonth: 1 }).state, 1);
    expect(a.lots[0]!.traditional).toBe(true);
    expect(g.lots[0]!.traditional).toBeFalsy();
    a = bottleLot(a, a.lots[0]!.id);
    const p = a.products[0]!;
    expect(p.traditional).toBe(true);
    expect(productConsumerPrice(a, p)).toBeLessThan(productConsumerPrice(a, { ...p, traditional: false }));
    const year = a.startYear;
    a.siteState.traditionalShipped = { year, liters: 0, lastYearLiters: 0 };
    expect(traditionalReliefRate(a, true)).toBe(0.5);
    a.siteState.traditionalShipped = { year, liters: 7_000, lastYearLiters: 0 };
    expect(traditionalReliefRate(a, true)).toBe(0.3);
    a.siteState.traditionalShipped = { year, liters: 12_000, lastYearLiters: 0 };
    expect(traditionalReliefRate(a, true)).toBe(0);
    a.siteState.traditionalShipped = { year, liters: 0, lastYearLiters: 30_000 };
    expect(traditionalReliefRate(a, true)).toBe(0);
    expect(traditionalReliefRate(a, false)).toBe(0);
  });

  it('쌀 세분화·공급 한도(결정 #64): 수입·국산 쌀은 감면 없음, 안동 쌀은 월 800kg까지만 — 3배치째는 막힌다', () => {
    expect(INGREDIENTS.andong_rice!.origin).toBe('local');
    expect(INGREDIENTS.rice_domestic!.origin).toBe('domestic');
    expect(INGREDIENTS.rice_imported!.origin).toBe('imported');
    expect(INGREDIENTS.rice_imported!.pricePerKg).toBeLessThan(INGREDIENTS.rice_processing!.pricePerKg);
    const imported = { kind: 'soju' as const, mashBill: [{ ingredientId: 'rice_imported', ratio: 0.92 }, { ingredientId: 'nuruk', ratio: 0.08 }] };
    expect(isTraditionalRecipe(SITES.andong, imported)).toBe(false);
    expect(isTraditionalRecipe(SITES.jeju, { kind: 'soju', mashBill: [{ ingredientId: 'jeju_millet', ratio: 0.5 }, { ingredientId: 'rice_imported', ratio: 0.45 }, { ingredientId: 'nuruk', ratio: 0.05 }] })).toBe(false);
    let s = newGame({ seed: 3, site: 'andong' });
    const local = s.recipes.find((r) => r.mashBill.some((m) => m.ingredientId === 'andong_rice'))!;
    s = applyAction(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' }).state;
    s = advanceMonths(applyAction(s, { type: 'setOrder', recipeId: local.id, batchesPerMonth: 4 }).state, 2);
    const last = s.reports.at(-1)!;
    expect(last.production[0]!.batches).toBe(2);
    expect(last.notes.some((n) => n.includes('공급 한도'))).toBe(true);
    expect(s.ingredientKgLastMonth.andong_rice).toBeLessThanOrEqual(800);
  });

  it('산지 한정 원료·설비: 제주 차조는 제주에서만, 내진 개량은 지진 산지에서만, 2단계는 1단계 뒤에', () => {
    const andong = newGame({ seed: 1, site: 'andong' });
    const jeju = newGame({ seed: 1, site: 'jeju' });
    const millet = { ...sojuOf(jeju), id: 'X' };
    expect(millet.mashBill.some((m) => m.ingredientId === 'jeju_millet')).toBe(true);
    expect(validateRecipe(jeju, millet)).toEqual([]);
    expect(validateRecipe(andong, millet).length).toBeGreaterThan(0);
    expect(applyAction(andong, { type: 'buyEquipment', catalogId: 'upg_seismic_1' }).error).toBeTruthy();
    expect(applyAction(newGame({ seed: 1, site: 'kansai' }), { type: 'buyEquipment', catalogId: 'upg_temp_control' }).error).toBeTruthy();
    let k = newGame({ seed: 1, site: 'kansai' });
    expect(applyAction(k, { type: 'buyEquipment', catalogId: 'upg_seismic_2' }).error).toBeTruthy();
    k = applyAction(k, { type: 'buyEquipment', catalogId: 'upg_seismic_1' }).state;
    expect(riskScale(k, 'earthquake')).toBe(1);
    k = advanceMonths(k, 2);
    expect(riskScale(k, 'earthquake')).toBe(0.5);
  });

  it('지진 피해 경감: 현금·캐스크·가동 중단 피해가 비율대로 준다', () => {
    const effects = [{ type: 'cash' as const, amount: -30_000_000 }, { type: 'caskLoss' as const, share: [0.02, 0.06] as [number, number] }, { type: 'stillDown' as const, months: 1 }];
    const scaled = scaleEffects(effects, 0.15);
    expect(scaled[0]).toEqual({ type: 'cash', amount: -4_500_000 });
    expect(scaled[1]).toMatchObject({ type: 'caskLoss', allowZero: true });
    expect(scaled.some((e) => e.type === 'stillDown')).toBe(false);
  });

  it('제주 취수 허가: 월 발효 투입 상한을 넘으면 생산이 멈추고, 증량 신청은 심사 후 결정된다', () => {
    let s = newGame({ seed: 4, site: 'jeju' });
    expect(waterPermitCap(s)).toBe(15_000);
    s.siteState.waterPermitL = 3_000;
    const malt = s.recipes.find((r) => r.kind === 'malt')!;
    s = applyAction(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: 6 }).state;
    s = advanceMonths(s, 1);
    expect(s.reports.at(-1)!.production[0]!.batches).toBe(3);
    expect(s.reports.at(-1)!.notes.some((n) => n.includes('취수 허가량'))).toBe(true);
    const cash = s.cash;
    s = applyAction(s, { type: 'applyWaterPermit' }).state;
    expect(s.cash).toBe(cash - 20_000_000);
    expect(applyAction(s, { type: 'applyWaterPermit' }).error).toBeTruthy();
    s = advanceMonths(applyAction(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: 0 }).state, 13);
    expect(s.siteState.permitApplication).toBeUndefined();
    expect([3_000, 13_000]).toContain(waterPermitCap(s));
    expect(waterPermitCap(newGame({ seed: 1, site: 'andong' }))).toBe(Infinity);
  });

  it('제주 면세 채널: 제주에서만 수요가 있고, 1인 한도(약 55만 원)를 넘는 병은 팔 수 없다', () => {
    const p = { id: 'p', name: 'p', category: 'whisky', ageYears: 3, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 70, typicity: 80, style: null, sourcedShare: 0, stockBottles: 1000, price: 60_000, unitCost: 20_000, createdMonth: 0, lastMonthSold: 0, totalSold: 0 } as Product;
    const jeju = newGame({ seed: 1, site: 'jeju' });
    jeju.awareness = 0.3;
    expect(dutyFreeDemand(jeju, p, 1, 1)).toBeGreaterThan(0);
    expect(dutyFreeDemand({ ...jeju, siteId: 'gyeonggi' }, p, 1, 1)).toBe(0);
    expect(dutyFreeDemand(jeju, { ...p, price: 400_000 }, 1, 1)).toBe(0);
  });

  it('물·계절·테루아: 연수는 산패를 줄이고, 안동 겨울은 발효가 늦고, 이란 더운 달은 열대향이 쌓인다', () => {
    const s = newGame({ seed: 1, site: 'kansai' });
    const malt = s.recipes.find((r) => r.kind === 'malt')!;
    const still = stillDefOf(s, malt.stillId)!;
    const slow = { ...malt, fermentDays: 10 };
    const soft = simulateBatch(slow, still, 'stainless', s.staff[0], s.priceIndex, 0, 'soft');
    const medium = simulateBatch(slow, still, 'stainless', s.staff[0], s.priceIndex, 0, 'medium');
    expect(soft.flavor.acetic ?? 0).toBeLessThan(medium.flavor.acetic ?? 0);
    expect(WATER_EFFECT.volcanic.yield).toBeGreaterThan(1);
    const a = newGame({ seed: 1, site: 'andong' });
    expect(fermentCapacityFactor(a, 1)).toBe(0.85);
    expect(fermentCapacityFactor(a, 6)).toBe(1);
    const cask = { ...newGame({ seed: 1 }).casks[0]!, contents: { id: 'l', name: 'x', kind: 'malt' as const, volumeL: 190, abv: 0.6, flavor: {}, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 1 } };
    expect(applyTerroir(SITES.yilan, cask, 28).contents!.flavor.tropical).toBeCloseTo(0.1, 6);
    expect(applyTerroir(SITES.yilan, cask, 20).contents!.flavor.tropical).toBeUndefined();
  });

  it('산지 고정비: 홋카이도는 1월 난방비가 나가고, 관리비는 간사이가 가장 비싸다', () => {
    const h = advanceMonths(newGame({ seed: 1, site: 'hokkaido' }), 1);
    expect(h.reports[0]!.expenses.heating).toBe(4_000_000);
    expect(advanceMonths(newGame({ seed: 1, site: 'kanto' }), 1).reports[0]!.expenses.heating).toBeUndefined();
    expect(SITES.kansai.overheadPerMonth).toBeGreaterThan(SITES.kanto.overheadPerMonth);
    expect(SITES.hokkaido.overheadPerMonth).toBeLessThan(SITES.kanto.overheadPerMonth);
  });

  it('산지 한정 이벤트는 그 산지에서만 일어난다', () => {
    const titles = (site: 'andong' | 'kansai') => new Set(advanceMonths(newGame({ seed: 7, site, startingCash: 50_000_000_000 }), 120).eventLog.map((e) => e.title));
    const andong = titles('andong');
    const kansai = titles('kansai');
    expect(andong.has('안동 탈춤축제')).toBe(true);
    for (const t of ['태풍 상륙', '폭설', '간사이 인바운드 관광 붐', '지진']) expect(andong.has(t)).toBe(false);
    for (const t of ['안동 탈춤축제', '제주 관광객 급증', '폭설']) expect(kansai.has(t)).toBe(false);
  });
});

describe('보유 비용·산지 대표 결정 (결정 #65)', () => {
  const malt = (oakMonths: number, volumeL = 190): SpiritLot => ({ id: 'm', name: 'm', kind: 'malt', volumeL, abv: 0.6, flavor: { fresh_fruit: 30, cereal: 20, vanilla_caramel: 40, integration: 50, harshness: 25 }, createdMonth: 0, oakMonths, sourced: false, costPerLPA: 9_000 });
  const withCasks = (s: GameState, n: number, oakMonths = 48): GameState => ({ ...s, casks: s.casks.slice(0, n).map((c) => ({ ...c, contents: malt(oakMonths) })) });
  const product = (over: Partial<Product> = {}): Product => ({ id: 'p', name: 'p', category: 'whisky', ageYears: 4, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 70, typicity: 80, style: null, sourcedShare: 0, stockBottles: 5000, price: 60_000, unitCost: 20_000, createdMonth: 0, lastMonthSold: 0, totalSold: 0, ...over });

  it('보관료: 시작 후 36개월은 면제, 그 뒤 캐스크당 보관료(산지 땅값 반영) + 재고 보험료', () => {
    const k = withCasks(newGame({ seed: 1, site: 'kansai' }), 10);
    const h = withCasks(newGame({ seed: 1, site: 'hokkaido' }), 10);
    expect(holdingCost(k)).toEqual({ storage: 0, insurance: 0 });
    const kc = holdingCost({ ...k, month: HOLDING.graceMonths });
    const hc = holdingCost({ ...h, month: HOLDING.graceMonths });
    expect(kc.storage).toBe(Math.round(10 * HOLDING.perCaskMonth * 1.3));
    expect(hc.storage).toBeLessThan(kc.storage);
    expect(kc.insurance).toBeGreaterThan(0);
    const after = advanceMonths({ ...k, month: HOLDING.graceMonths }, 1);
    expect(after.reports.at(-1)!.expenses.storage).toBeGreaterThan(0);
  });

  it('숙성 전망: 같은 캐스크라도 이란은 증발 때문에 1년 더 두는 이득이 경기보다 작다', () => {
    const y = withCasks(newGame({ seed: 1, site: 'yilan' }), 1, 60);
    const g = withCasks(newGame({ seed: 1, site: 'gyeonggi' }), 1, 60);
    const oy = agingOutlook(y, y.casks[0]!)!;
    const og = agingOutlook(g, g.casks[0]!)!;
    expect(oy.evaporation).toBeGreaterThan(0.09);
    expect(oy.net).toBeLessThan(og.net);
  });

  it('재고 담보대출: 한도 = 재고 시가 × 담보 인정 비율(홋카이도 0.6), 시가가 떨어지면 추가 상환', () => {
    let h = withCasks(newGame({ seed: 1, site: 'hokkaido' }), 10);
    const g = withCasks(newGame({ seed: 1, site: 'gyeonggi' }), 10);
    expect(inventoryLoanRoom(h)).toBeGreaterThan(inventoryLoanRoom(g));
    expect(inventoryLoanRoom(h)).toBeLessThanOrEqual(inventoryCollateral(h) * 0.6);
    const room = inventoryLoanRoom(h);
    h = applyAction(h, { type: 'takeLoan', offerId: 'inventory', amount: room }).state;
    expect(h.loans.find((l) => l.offerId === 'inventory')!.balance).toBe(room);
    expect(applyAction(newGame({ seed: 1, site: 'hokkaido' }), { type: 'takeLoan', offerId: 'inventory', amount: 50_000_000 }).error).toBeTruthy();
    const crash = advanceMonths({ ...h, bulkIndex: 0.6 }, 1);
    expect(crash.loans.find((l) => l.offerId === 'inventory')!.balance).toBeLessThan(room);
    expect(crash.reports.at(-1)!.notes.some((n) => n.includes('추가 상환'))).toBe(true);
  });

  it('대형 유통 납품(경기): 재고를 먼저 가져가고 대금은 2개월 뒤, 계약 중 숙성 위스키 매력도 ×0.9', () => {
    let s = newGame({ seed: 2, site: 'gyeonggi' });
    s.products = [product({ category: 'soju_distilled', bottleMl: 375, abv: 0.25, price: 5_000, ageYears: null })];
    const offer = makeRetailOffer(s, mulberry32(1));
    expect(offer.category).toBe('soju_distilled');
    const before = appeal(product(), s);
    s.retailContracts = [startRetail(s, { ...offer, bottlesPerMonth: 600 })];
    expect(appeal(product(), s)).toBeCloseTo(before * 0.9, 6);
    s = advanceMonths(s, 1);
    expect(s.receivables.some((r) => r.amount === Math.round(600 * 5_000 * 0.8))).toBe(true);
    s = advanceMonths(s, 2);
    expect(s.reports.some((r) => (r.retailRevenue ?? 0) >= 600 * 5_000 * 0.8)).toBe(true);
  });

  it('위탁생산(간토): 자사 생산보다 먼저 설비를 쓰고 가공비를 받는다', () => {
    let s = newGame({ seed: 2, site: 'kanto' });
    expect(makeOemOffer(s, mulberry32(1))).not.toBeNull();
    const o = { ...makeOemOffer(s, mulberry32(1))!, batchesPerMonth: 2 };
    s.oemContracts = [startOem(s, o)!];
    s = advanceMonths(s, 1);
    expect(s.reports.at(-1)!.oemRevenue).toBe(2 * o.feePerBatch);
    expect(s.oemContracts[0]!.missed).toBe(0);
  });

  it('위탁생산 전용 증류기 지원형(결정 #66): 남는 설비가 없으면 설치비 60% 지원 제안, 설치 후 시작, 파기 시 지원금 일부 반환', () => {
    let s = newGame({ seed: 2, site: 'kanto' });
    const malt = s.recipes.find((r) => r.kind === 'malt')!;
    s = applyAction(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: 10 }).state;
    const o = makeOemOffer(s, mulberry32(3))!;
    expect(o.dedicated).toBe(true);
    expect(o.capexSupport).toBeCloseTo(oemPackageCost(s) * 0.6, -6);
    s.oemOffers = [o];
    const cash = s.cash;
    s = applyAction(s, { type: 'acceptOem', offerId: o.id }).state;
    expect(cash - s.cash).toBeCloseTo(oemPackageCost(s) - o.capexSupport!, -1);
    const c = s.oemContracts[0]!;
    expect(c.startMonth).toBeGreaterThan(s.month);
    expect(s.equipment.some((e) => e.id === c.stillId)).toBe(true);
    s = advanceMonths(applyAction(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: 0 }).state, c.startMonth + 1);
    expect(s.reports.some((r) => (r.oemRevenue ?? 0) > 0)).toBe(true);
  });

  it('직판장: 숙성고 40자리를 쓰고, 관광객이 소비자가로 사 간다(오사카·교토가 경기보다 많이)', () => {
    let k = newGame({ seed: 1, site: 'kansai', startingCash: 2_000_000_000 });
    const cap = warehouseCapacity(k);
    k = applyAction(k, { type: 'buyEquipment', catalogId: 'upg_visitor' }).state;
    expect(warehouseCapacity(k)).toBe(cap - 40);
    k = { ...advanceMonths(k, 4), products: [product()] };
    const g = { ...k, siteId: 'gyeonggi' as const, regionId: 'KR' as const, products: [product()] };
    const kv = runVisitorSales(structuredClone(k), 6);
    const gv = runVisitorSales(structuredClone(g), 6);
    expect(kv[0]!.bottles).toBeGreaterThan(gv[0]!.bottles);
    expect(kv[0]!.revenue / kv[0]!.bottles).toBeGreaterThan(60_000);
  });

  it('면세 전용 한정판(제주): 국내에선 안 팔리고 면세 수요는 늘어난다, 제주 밖에선 못 만든다', () => {
    const j = newGame({ seed: 1, site: 'jeju' });
    j.awareness = 0.3;
    const normal = dutyFreeDemand(j, product(), 1, 8);
    const limited = dutyFreeDemand(j, product({ dutyFreeOnly: true }), 1, 8);
    expect(limited).toBeGreaterThan(normal * 1.15);
    expect(dutyFreeDemand(j, product(), 1, 8)).toBeGreaterThan(dutyFreeDemand(j, product(), 1, 3));
    const a = newGame({ seed: 1, site: 'andong' });
    const lot = { ...malt(48), id: 'L1' };
    a.lots = [lot];
    expect(previewBlend(a, [{ source: 'lot', id: 'L1', liters: 100 }], { name: 'x', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard', dutyFreeOnly: true }).errors.some((e) => e.includes('면세'))).toBe(true);
  });

  it('안동 계약재배 확대·원액 운송비(결정 #68): 6개월 뒤 공급 한도 +400kg(최대 3회), 제주는 블렌더 단가 ×0.85', () => {
    let a = newGame({ seed: 1, site: 'andong' });
    expect(ingredientSupplyCap(a, 'andong_rice')).toBe(800);
    a = applyAction(a, { type: 'expandLocalSupply' }).state;
    expect(applyAction(a, { type: 'expandLocalSupply' }).error).toBeTruthy();
    a = advanceMonths(a, 6);
    expect(ingredientSupplyCap(a, 'andong_rice')).toBe(800); // 6개월째 달이 시작될 때 반영
    a = advanceMonths(a, 1);
    expect(ingredientSupplyCap(a, 'andong_rice')).toBe(1_200);
    expect(ingredientSupplyCap(a, 'rice_domestic')).toBe(Infinity);
    expect(ingredientSupplyCap(newGame({ seed: 1, site: 'gyeonggi' }), 'andong_rice')).toBe(800);
    const lot = malt(0);
    const j = newGame({ seed: 1, site: 'jeju' });
    const g = newGame({ seed: 1, site: 'gyeonggi' });
    expect(spotBidPerLPA(j, lot) / spotBidPerLPA(g, lot)).toBeCloseTo(0.85, 6);
  });

  it('대만은 24개월이면 위스키, 수집가는 열대향 캐스크에 더 쳐준다 / 일본은 미즈나라 인센스 프리미엄', () => {
    const tw = newGame({ seed: 1, site: 'yilan' });
    const kr = newGame({ seed: 1, site: 'gyeonggi' });
    for (const s of [tw, kr]) s.lots = [{ ...malt(26), id: 'L1' }];
    const opts = { name: 'x', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };
    expect(previewBlend(tw, [{ source: 'lot', id: 'L1', liters: 100 }], opts).category).toBe('whisky');
    expect(previewBlend(kr, [{ source: 'lot', id: 'L1', liters: 100 }], opts).category).toBe('malt_spirit');
    expect(REGIONS.TW.caskBids.tropicalPremium!).toBeGreaterThan(REGIONS.TW.caskBids.premium);
    const jp = newGame({ seed: 1, site: 'kansai' });
    expect(appeal(product({ flavor: { incense: 10 } }), jp)).toBeCloseTo(appeal(product(), jp) * 1.25, 6);
    expect(appeal(product({ flavor: { incense: 10 } }), kr)).toBeCloseTo(appeal(product(), kr), 6);
  });
});
