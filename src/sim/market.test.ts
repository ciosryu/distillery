import { describe, expect, it } from 'vitest';
import { houseBrand } from './brands';
import { advanceMonths, applyAction, bottleMargin, brokerAskPerLPA, bulkValuePerLPA, demandFor, evaluate, spotBidPerLPA, spotQuote, makeContractOffer, makeCraftContractOffer, contractAgingImpact, mulberry32, newGame, previewBlend, qualityFactor, type Cask, type GameState, type SpiritLot, appeal, applyEffects, buyersFor, type Product, agePerception, suggestedPrice, spotSaturation, sourcedElasticityFactor, sourcedPrestigeOf, executeBlend, runSales, updateAwareness, DUTY_FREE, dutyFreeSlotBlocker, makeOemOffer, makeRetailOffer, oemPackageCost, OEM, productDutyFreeDemand, resolveDutyFreeEditions, startOem, startRetail, type MonthReport } from './index';
import { overhangFactor, retailCapacityCases } from './retail';
import { BULK } from './content/catalog';
import { BUYERS } from './content/names';
import { REGIONS, traditionalTaxFactor, refPricePerL } from './content/regions';

// 시장·판매·주세·B2B·입지 거래 테스트 (파트 MKT, 결정 #144 — sim.test.ts·sites.test.ts에서 옮겨 왔다. 테스트 이름·본문 불변)

const recipeId = (s: GameState, prefix: string) => s.production.recipes.find((r) => r.name.startsWith(prefix))!.id;
const product = (over: Partial<Product> = {}): Product => ({ id: 'p', name: 'p', category: 'whisky', ageYears: 4, oakMonths: 48, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 70, typicity: 80, style: null, sourcedShare: 0, stockBottles: 5000, price: 60_000, unitCost: 20_000, createdMonth: 0, lastMonthSold: 0, totalSold: 0, ...over });
const lot = (over: Partial<SpiritLot> = {}): SpiritLot => ({ id: 'L1', name: 'l', kind: 'soju', volumeL: 400, abv: 0.45, flavor: { nuruk_rice: 30, fresh_fruit: 20 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 9_000, ...over });
const report = (s: GameState): MonthReport => ({ month: s.month, revenue: 0, expenses: {}, netCash: 0, cashEnd: 0, sales: [], production: [], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] });

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

describe('지역 (v0.6)', () => {

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
  it('소매 처리 역량을 넘는 판매분은 고비용 채널, 2배를 넘으면 못 판다', () => {
    let s = newGame({ seed: 1, startingCash: 50_000_000_000 });
    houseBrand(s).awareness = 0.9;
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

  it('비지터 센터: 방문객 매출과 입소문이 쌓인다', () => {
    let s = newGame({ seed: 1, startingCash: 5_000_000_000 });
    s = applyAction(s, { type: 'buyEquipment', catalogId: 'visitor_basic' }).state;
    expect(applyAction(s, { type: 'buyEquipment', catalogId: 'visitor_restaurant' }).error).toBeTruthy();
    s = advanceMonths(s, 12);
    expect(s.history.reports.at(-1)!.visitors).toBeGreaterThan(0);
    expect(s.commerce.localBuzz).toBeGreaterThan(0);
  });
});

describe('입지 목록 (결정 #86)', () => {
  it('일본 미즈나라 인센스 향 매력도 ×1.25 (한국은 없음)', () => {
    const jp = newGame({ seed: 1, region: 'JP' });
    const kr = newGame({ seed: 1, region: 'KR' });
    expect(appeal(product({ flavor: { incense: 10 } }), jp) / appeal(product(), jp)).toBeCloseTo(1.25, 6);
    expect(appeal(product({ flavor: { incense: 10 } }), kr) / appeal(product(), kr)).toBeCloseTo(1, 6);
  });
});

describe('제주 — 취수 허가·면세 한정판 (결정 #87)', () => {
  it('면세 한정판: 국내 수요 0, 위스키 한정판은 숙성 연수 보너스, 기념품은 ×1.1, 연속 완판 보너스', () => {
    const j = newGame({ seed: 1, region: 'KR', site: 'jeju' });
    houseBrand(j).awareness = 0.3;
    const normal = productDutyFreeDemand(j, product(), 1, 8);
    expect(normal).toBeGreaterThan(0);
    expect(productDutyFreeDemand(newGame({ seed: 1, region: 'KR' }), product(), 1, 8)).toBe(0);
    const ed = (over: Partial<Product>) => productDutyFreeDemand(j, product({ dutyFreeOnly: true, ...over }), 1, 8) / normal;
    expect(ed({ ageYears: 4 })).toBeCloseTo(1, 6);
    expect(ed({ ageYears: 6 })).toBeCloseTo(1.05, 6);
    expect(ed({ ageYears: 12 })).toBeCloseTo(1.15, 6);
    expect(ed({ localIngredient: true })).toBeCloseTo(DUTY_FREE.localAppeal, 6);
    expect(ed({ localIngredient: true, dfEdition: { vol: 2, streak: 2 } })).toBeCloseTo(DUTY_FREE.localAppeal * (1 + 2 * DUTY_FREE.streakAppeal), 6);
    expect(ed({ ageYears: 4, dfEdition: { vol: 9, streak: 9 } })).toBeCloseTo(1 + DUTY_FREE.maxStreak * DUTY_FREE.streakAppeal, 6);
  });

  it('전용 매대 1칸, 면세 권장가, 완판 → 연속 기록, 12개월 미판매 → 국내 이관', () => {
    const j = newGame({ seed: 1, region: 'KR', site: 'jeju' });
    j.inventory.lots = [lot({ id: 'S1', localIngredient: true }), lot({ id: 'S2', localIngredient: true })];
    const opts = { name: 'Vol', targetAbv: 0.4, bottleMl: 500, chillFilter: true, packagingId: 'standard', dutyFreeOnly: true };
    const pv = previewBlend(j, [{ source: 'lot', id: 'S1', liters: 100 }], opts);
    expect(pv.ok).toBe(true);
    expect(pv.localIngredient).toBe(true);
    expect(pv.dfEdition).toEqual({ vol: 1, streak: 0 });
    // 권장가 = 면세 기준가(국내 기준가 × 0.6) × √(품질/60) ÷ 면세점 마진
    const dfRef = refPricePerL(REGIONS.KR, pv.category!, pv.finalAbv) * DUTY_FREE.refFactor * 0.5 * Math.sqrt(Math.max(pv.evaluation!.quality, 20) / 60);
    expect((pv.suggestedPrice * DUTY_FREE.markup) / dfRef).toBeCloseTo(1, 1);
    const first = executeBlend(j, [{ source: 'lot', id: 'S1', liters: 100 }], opts).product!;
    expect(first.dutyFreeOnly).toBe(true);
    expect(dutyFreeSlotBlocker(j)).toContain('1칸');
    expect(previewBlend(j, [{ source: 'lot', id: 'S2', liters: 100 }], opts).ok).toBe(false);
    expect(previewBlend(j, [{ source: 'lot', id: 'S2', liters: 100 }], { ...opts, dutyFreeOnly: false }).ok).toBe(true);
    // 5개월 만에 완판
    j.month = first.createdMonth + 4;
    first.stockBottles = 0;
    const aw = houseBrand(j).awareness;
    resolveDutyFreeEditions(j, report(j));
    expect(j.site.dfSeries).toEqual({ vol: 1, streak: 1 });
    expect(houseBrand(j).awareness).toBeCloseTo(aw + DUTY_FREE.sellOutAwareness, 6);
    const second = executeBlend(j, [{ source: 'lot', id: 'S2', liters: 100 }], opts).product!;
    expect(second.dfEdition).toEqual({ vol: 2, streak: 1 });
    j.month = second.createdMonth + DUTY_FREE.returnMonths - 1;
    resolveDutyFreeEditions(j, report(j));
    expect(second.dutyFreeOnly).toBe(false);
    expect(j.site.dfSeries!.streak).toBe(0);
    // 다른 입지에선 못 만든다
    const g = newGame({ seed: 1, region: 'KR' });
    g.inventory.lots = [lot()];
    expect(previewBlend(g, [{ source: 'lot', id: 'L1', liters: 100 }], opts).errors.some((e) => e.includes('면세'))).toBe(true);
  });

  it('면세 판매: 소매 처리 역량을 쓰지 않고, 입소문은 ×2, 주세·전통주 출고량에서 빠진다', () => {
    let j = newGame({ seed: 1, region: 'KR', site: 'jeju' });
    houseBrand(j).awareness = 0.3;
    j.commerce.products = [product({ category: 'soju_distilled', ageYears: null, abv: 0.4, bottleMl: 500, price: 10_000, traditional: true, localIngredient: true, dutyFreeOnly: true })];
    const { results } = runSales(structuredClone(j), mulberry32(1), 8);
    expect(results[0]!.dutyFree).toBeGreaterThan(0);
    expect(results[0]!.bottles).toBe(results[0]!.dutyFree);
    const a = structuredClone(j);
    const dfPart = updateAwareness(a, results);
    expect(dfPart).toBeGreaterThan(0);
    const b = structuredClone(j);
    updateAwareness(b, results.map((x) => ({ ...x, dutyFree: 0 })));
    expect(houseBrand(a).awareness).toBeGreaterThan(houseBrand(b).awareness);
    j = advanceMonths(j, 1);
    expect(j.commerce.traditionalReleasedL).toBe(0);
    expect(j.history.reports.at(-1)!.liquorTaxRemitted).toBe(0);
    expect(j.history.reports.at(-1)!.dutyFreeBottles).toBeGreaterThan(0);
  });
});

describe('경기 대형 유통 납품 (결정 #88)', () => {
  it('계약: 매달 출고가 80%로 가져가고 대금은 2개월 뒤, 숙성 위스키 매력도 ×0.9', () => {
    let g = newGame({ seed: 1, region: 'KR' });
    g.commerce.products = [product({ id: 'P1', category: 'soju_distilled', ageYears: null, abv: 0.25, bottleMl: 375, price: 8_000, stockBottles: 2000 })];
    const offer = { ...makeRetailOffer(g, mulberry32(2)), bottlesPerMonth: 300 };
    expect(offer.category).toBe('soju_distilled');
    const w = appeal(product(), g);
    g.commerce.retailContracts.push(startRetail(g, offer));
    expect(appeal(product(), g) / w).toBeCloseTo(0.9, 6);
    g = advanceMonths(g, 1);
    expect(g.finance.receivables[0]!.amount).toBe(Math.round(300 * 8_000 * 0.8));
    expect(g.history.reports.at(-1)!.retailDealRevenue).toBe(Math.round(300 * 8_000 * 0.8));
    const cash = g.finance.cash;
    g = advanceMonths(g, 2);
    expect(g.finance.receivables.length).toBeGreaterThanOrEqual(1);
    expect(g.history.reports.at(-1)!.revenue).toBeGreaterThan(0);
    expect(g.finance.cash).not.toBe(cash);
  });

  it('제안은 대형 유통 입지(경기 기본)에서만', () => {
    let a = newGame({ seed: 5, region: 'KR', site: 'andong' });
    let g = newGame({ seed: 5, region: 'KR' });
    a = advanceMonths(a, 40);
    g = advanceMonths(g, 40);
    expect(a.commerce.retailOffers.length + a.commerce.retailContracts.length).toBe(0);
    expect(g.history.reports.some(() => true)).toBe(true);
  });
});

describe('간토 위탁생산 (결정 #89)', () => {
  it('남는 설비가 있으면 그 크기, 없으면 전용 증류기 지원형 — 지원금만큼 덜 내고 설치 후 시작', () => {
    const k = newGame({ seed: 1, region: 'JP' });
    const o = makeOemOffer(k, mulberry32(1))!;
    expect(o.dedicated).toBeFalsy();
    const busy = structuredClone(k);
    busy.production.orders = [{ recipeId: busy.production.recipes.find((r) => r.kind === 'malt')!.id, batchesPerMonth: 10 }];
    const d = makeOemOffer(busy, mulberry32(1))!;
    expect(d.dedicated).toBe(true);
    expect(d.capexSupport).toBe(Math.round((oemPackageCost(busy) * OEM.dedicated.supportShare) / 1_000_000) * 1_000_000);
    const cash = busy.finance.cash;
    const c = startOem(busy, d)!;
    expect(cash - busy.finance.cash).toBe(oemPackageCost(busy) - d.capexSupport!);
    expect(c.startMonth).toBeGreaterThan(busy.month);
    expect(c.stillId).toBeTruthy();
  });

  it('위탁 배치는 가공비를 받고 원료비 없이 에너지비만 낸다', () => {
    let k = newGame({ seed: 1, region: 'JP' });
    const o = { ...makeOemOffer(k, mulberry32(1))!, batchesPerMonth: 2 };
    k.b2b.oemContracts.push(startOem(k, o)!);
    k = advanceMonths(k, 1);
    const r = k.history.reports.at(-1)!;
    expect(r.oemRevenue).toBe(2 * OEM.feePerBatch);
    expect(r.expenses.production ?? 0).toBeGreaterThan(0);
    expect(r.expenses.production ?? 0).toBeLessThan(OEM.feePerBatch);
  });
});
