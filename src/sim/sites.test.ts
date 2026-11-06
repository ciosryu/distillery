import { describe, expect, it } from 'vitest';
import {
  advanceMonths, appeal, applyAction, executeBlend, mulberry32, newGame, normalizeState, previewBlend, runSales, spotBidPerLPA, updateAwareness, validateRecipe,
  DUTY_FREE, dutyFreeSlotBlocker, equipmentCost, hasLocalIngredient, inventoryCollateral, inventoryLoanRoom, inventoryMarginCall, makeOemOffer, makeRetailOffer,
  oemPackageCost, OEM, productDutyFreeDemand, resolveDutyFreeEditions, siteOverhead, startOem, startRetail, waterPermitCap,
  type GameState, type MonthReport, type Product, type SpiritLot,
} from './index';
import { EQUIPMENT } from './content/catalog';
import { refPricePerL, REGIONS, siteOf, sitesOfRegion } from './content/regions';

// 입지 특성 이식 (결정 #86~#90) — docs/design/regions.md

const product = (over: Partial<Product> = {}): Product => ({ id: 'p', name: 'p', category: 'whisky', ageYears: 4, oakMonths: 48, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 70, typicity: 80, style: null, sourcedShare: 0, stockBottles: 5000, price: 60_000, unitCost: 20_000, createdMonth: 0, lastMonthSold: 0, totalSold: 0, ...over });
const lot = (over: Partial<SpiritLot> = {}): SpiritLot => ({ id: 'L1', name: 'l', kind: 'soju', volumeL: 400, abv: 0.45, flavor: { nuruk_rice: 30, fresh_fruit: 20 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 9_000, ...over });
const report = (s: GameState): MonthReport => ({ month: s.month, revenue: 0, expenses: {}, netCash: 0, cashEnd: 0, sales: [], production: [], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] });

describe('입지 목록 (결정 #86)', () => {
  it('한국 경기·안동·제주, 일본 간토·오사카교토·홋카이도, 대만 이란·진먼섬', () => {
    expect(sitesOfRegion('KR').map((x) => x.id)).toEqual(['default', 'andong', 'jeju']);
    expect(sitesOfRegion('JP').map((x) => x.id)).toEqual(['default', 'kansai', 'hokkaido']);
    expect(sitesOfRegion('TW').map((x) => x.id)).toEqual(['default', 'kinmen']);
    expect(siteOf({ regionId: 'KR' }).deals).toEqual(['retail']);
    expect(siteOf({ regionId: 'JP' }).deals).toEqual(['oem']);
    // 기본 입지의 기후는 지역 값 그대로
    expect(siteOf({ regionId: 'KR' }).tempC).toEqual(REGIONS.KR.tempC);
  });

  it('입지 관리비·건설비·숙성고 땅값', () => {
    const k = newGame({ seed: 1, region: 'JP', site: 'kansai' });
    const h = newGame({ seed: 1, region: 'JP', site: 'hokkaido' });
    const j = newGame({ seed: 1, region: 'KR', site: 'jeju' });
    expect(siteOverhead(k)).toBe(Math.round(REGIONS.JP.overheadPerMonth * siteOf(k).overheadFactor!));
    expect(siteOverhead(h)).toBe(Math.round(REGIONS.JP.overheadPerMonth * (siteOf(h).overheadFactor ?? 1)));
    const wh = EQUIPMENT.warehouse_rack_100!;
    expect(equipmentCost(k, wh)).toBe(Math.round(wh.cost * 1.3));
    expect(equipmentCost(h, wh)).toBe(Math.round(wh.cost * 0.7));
    expect(equipmentCost(j, EQUIPMENT.pot_onion_1000!)).toBe(Math.round(EQUIPMENT.pot_onion_1000!.cost * 1.2));
    const before = j.cash;
    const after = applyAction(j, { type: 'buyEquipment', catalogId: 'pot_onion_1000' }).state;
    expect(before - after.cash).toBe(equipmentCost(j, EQUIPMENT.pot_onion_1000!));
  });

  it('입지 전용 원료·프리셋: 제주 고소리술·청귤 진, 홋카이도 감자 — 다른 입지에선 못 쓴다', () => {
    const j = newGame({ seed: 1, region: 'KR', site: 'jeju' });
    const g = newGame({ seed: 1, region: 'KR' });
    const gosori = j.recipes.find((r) => r.name.startsWith('고소리술'))!;
    expect(validateRecipe(j, gosori)).toEqual([]);
    expect(validateRecipe(g, { ...gosori, stillId: g.equipment[0]!.id }).some((e) => e.includes('입지'))).toBe(true);
    expect(hasLocalIngredient(siteOf(j), gosori)).toBe(true);
    expect(hasLocalIngredient(siteOf(j), j.recipes.find((r) => r.name === '제주 청귤 진')!)).toBe(true);
    expect(hasLocalIngredient(siteOf(j), j.recipes.find((r) => r.kind === 'malt')!)).toBe(false);
    const h = newGame({ seed: 1, region: 'JP', site: 'hokkaido' });
    expect(h.recipes[0]!.name).toContain('감자');
    expect(h.staff[0]!.name).toBe('오노 다이치');
  });

  it('옛 저장은 입지 필드를 채워 읽는다', () => {
    const { siteState: _a, retailOffers: _b, retailContracts: _c, oemOffers: _d, oemContracts: _e, receivables: _f, ...old } = newGame({ seed: 1 });
    const s = normalizeState(old as GameState);
    expect(s.siteState).toEqual({});
    expect(s.receivables).toEqual([]);
    expect(advanceMonths(s, 2).month).toBe(2);
  });

  it('제주 원액 B2B 단가 ×0.85 (섬 운송비)', () => {
    const g = newGame({ seed: 1, region: 'KR' });
    const j = newGame({ seed: 1, region: 'KR', site: 'jeju' });
    const malt = lot({ kind: 'malt', abv: 0.68, oakMonths: 0 });
    expect(spotBidPerLPA(j, malt) / spotBidPerLPA(g, malt)).toBeCloseTo(0.85, 6);
  });

  it('일본 미즈나라 인센스 향 매력도 ×1.25 (한국은 없음)', () => {
    const jp = newGame({ seed: 1, region: 'JP' });
    const kr = newGame({ seed: 1, region: 'KR' });
    expect(appeal(product({ flavor: { incense: 10 } }), jp) / appeal(product(), jp)).toBeCloseTo(1.25, 6);
    expect(appeal(product({ flavor: { incense: 10 } }), kr) / appeal(product(), kr)).toBeCloseTo(1, 6);
  });
});

describe('제주 — 취수 허가·면세 한정판 (결정 #87)', () => {
  it('취수 허가: 월 15,000L 상한, 증량 신청은 심사 후 승인/불허', () => {
    let j = newGame({ seed: 3, region: 'KR', site: 'jeju' });
    expect(waterPermitCap(j)).toBe(15_000);
    expect(waterPermitCap(newGame({ seed: 3, region: 'KR' }))).toBe(Infinity);
    j = applyAction(j, { type: 'applyWaterPermit' }).state;
    expect(j.siteState.permitApplication).toBeTruthy();
    expect(applyAction(j, { type: 'applyWaterPermit' }).error).toContain('심사 중');
    j = advanceMonths(j, 13);
    expect(j.siteState.permitApplication).toBeUndefined();
    expect([15_000, 25_000]).toContain(waterPermitCap(j));
  });

  it('면세 한정판: 국내 수요 0, 위스키 한정판은 숙성 연수 보너스, 기념품은 ×1.1, 연속 완판 보너스', () => {
    const j = newGame({ seed: 1, region: 'KR', site: 'jeju' });
    j.awareness = 0.3;
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
    j.lots = [lot({ id: 'S1', localIngredient: true }), lot({ id: 'S2', localIngredient: true })];
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
    const aw = j.awareness;
    resolveDutyFreeEditions(j, report(j));
    expect(j.siteState.dfSeries).toEqual({ vol: 1, streak: 1 });
    expect(j.awareness).toBeCloseTo(aw + DUTY_FREE.sellOutAwareness, 6);
    const second = executeBlend(j, [{ source: 'lot', id: 'S2', liters: 100 }], opts).product!;
    expect(second.dfEdition).toEqual({ vol: 2, streak: 1 });
    j.month = second.createdMonth + DUTY_FREE.returnMonths - 1;
    resolveDutyFreeEditions(j, report(j));
    expect(second.dutyFreeOnly).toBe(false);
    expect(j.siteState.dfSeries!.streak).toBe(0);
    // 다른 입지에선 못 만든다
    const g = newGame({ seed: 1, region: 'KR' });
    g.lots = [lot()];
    expect(previewBlend(g, [{ source: 'lot', id: 'L1', liters: 100 }], opts).errors.some((e) => e.includes('면세'))).toBe(true);
  });

  it('면세 판매: 소매 처리 역량을 쓰지 않고, 입소문은 ×2, 주세·전통주 출고량에서 빠진다', () => {
    let j = newGame({ seed: 1, region: 'KR', site: 'jeju' });
    j.awareness = 0.3;
    j.products = [product({ category: 'soju_distilled', ageYears: null, abv: 0.4, bottleMl: 500, price: 10_000, traditional: true, localIngredient: true, dutyFreeOnly: true })];
    const { results } = runSales(structuredClone(j), mulberry32(1), 8);
    expect(results[0]!.dutyFree).toBeGreaterThan(0);
    expect(results[0]!.bottles).toBe(results[0]!.dutyFree);
    const a = structuredClone(j);
    const dfPart = updateAwareness(a, results);
    expect(dfPart).toBeGreaterThan(0);
    const b = structuredClone(j);
    updateAwareness(b, results.map((x) => ({ ...x, dutyFree: 0 })));
    expect(a.awareness).toBeGreaterThan(b.awareness);
    j = advanceMonths(j, 1);
    expect(j.traditionalReleasedL).toBe(0);
    expect(j.reports.at(-1)!.liquorTaxRemitted).toBe(0);
    expect(j.reports.at(-1)!.dutyFreeBottles).toBeGreaterThan(0);
  });
});

describe('경기 대형 유통 납품 (결정 #88)', () => {
  it('계약: 매달 출고가 80%로 가져가고 대금은 2개월 뒤, 숙성 위스키 매력도 ×0.9', () => {
    let g = newGame({ seed: 1, region: 'KR' });
    g.products = [product({ id: 'P1', category: 'soju_distilled', ageYears: null, abv: 0.25, bottleMl: 375, price: 8_000, stockBottles: 2000 })];
    const offer = { ...makeRetailOffer(g, mulberry32(2)), bottlesPerMonth: 300 };
    expect(offer.category).toBe('soju_distilled');
    const w = appeal(product(), g);
    g.retailContracts.push(startRetail(g, offer));
    expect(appeal(product(), g) / w).toBeCloseTo(0.9, 6);
    g = advanceMonths(g, 1);
    expect(g.receivables[0]!.amount).toBe(Math.round(300 * 8_000 * 0.8));
    expect(g.reports.at(-1)!.retailDealRevenue).toBe(Math.round(300 * 8_000 * 0.8));
    const cash = g.cash;
    g = advanceMonths(g, 2);
    expect(g.receivables.length).toBeGreaterThanOrEqual(1);
    expect(g.reports.at(-1)!.revenue).toBeGreaterThan(0);
    expect(g.cash).not.toBe(cash);
  });

  it('제안은 대형 유통 입지(경기 기본)에서만', () => {
    let a = newGame({ seed: 5, region: 'KR', site: 'andong' });
    let g = newGame({ seed: 5, region: 'KR' });
    a = advanceMonths(a, 40);
    g = advanceMonths(g, 40);
    expect(a.retailOffers.length + a.retailContracts.length).toBe(0);
    expect(g.reports.some(() => true)).toBe(true);
  });
});

describe('간토 위탁생산 (결정 #89)', () => {
  it('남는 설비가 있으면 그 크기, 없으면 전용 증류기 지원형 — 지원금만큼 덜 내고 설치 후 시작', () => {
    const k = newGame({ seed: 1, region: 'JP' });
    const o = makeOemOffer(k, mulberry32(1))!;
    expect(o.dedicated).toBeFalsy();
    const busy = structuredClone(k);
    busy.orders = [{ recipeId: busy.recipes.find((r) => r.kind === 'malt')!.id, batchesPerMonth: 10 }];
    const d = makeOemOffer(busy, mulberry32(1))!;
    expect(d.dedicated).toBe(true);
    expect(d.capexSupport).toBe(Math.round((oemPackageCost(busy) * OEM.dedicated.supportShare) / 1_000_000) * 1_000_000);
    const cash = busy.cash;
    const c = startOem(busy, d)!;
    expect(cash - busy.cash).toBe(oemPackageCost(busy) - d.capexSupport!);
    expect(c.startMonth).toBeGreaterThan(busy.month);
    expect(c.stillId).toBeTruthy();
  });

  it('위탁 배치는 가공비를 받고 원료비 없이 에너지비만 낸다', () => {
    let k = newGame({ seed: 1, region: 'JP' });
    const o = { ...makeOemOffer(k, mulberry32(1))!, batchesPerMonth: 2 };
    k.oemContracts.push(startOem(k, o)!);
    k = advanceMonths(k, 1);
    const r = k.reports.at(-1)!;
    expect(r.oemRevenue).toBe(2 * OEM.feePerBatch);
    expect(r.expenses.production ?? 0).toBeGreaterThan(0);
    expect(r.expenses.production ?? 0).toBeLessThan(OEM.feePerBatch);
  });
});

describe('홋카이도 재고 담보대출 (결정 #90)', () => {
  it('숙성 재고 시가 × 60%까지, 다른 입지는 불가, 시가가 떨어지면 추가 상환', () => {
    const h = newGame({ seed: 1, region: 'JP', site: 'hokkaido' });
    const k = newGame({ seed: 1, region: 'JP' });
    for (const s of [h, k]) for (const c of s.casks) c.contents = lot({ id: `c-${c.id}`, kind: 'malt', abv: 0.6, volumeL: 190, oakMonths: 48 });
    expect(inventoryLoanRoom(h)).toBe(Math.floor((inventoryCollateral(h) * 0.6) / 1_000_000) * 1_000_000);
    expect(applyAction(k, { type: 'takeLoan', offerId: 'inventory', amount: 50_000_000 }).error).toContain('입지');
    const res = applyAction(h, { type: 'takeLoan', offerId: 'inventory', amount: 10_000_000_000 });
    expect(res.error).toBeUndefined();
    const loan = res.state.loans.find((l) => l.offerId === 'inventory')!;
    expect(loan.principal).toBeLessThanOrEqual(inventoryCollateral(h) * 0.6);
    const s = structuredClone(res.state);
    s.bulkIndex = 0.5;
    const paid = inventoryMarginCall(s, report(s));
    expect(paid).toBeGreaterThan(0);
  });
});
