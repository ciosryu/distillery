import { describe, expect, it } from 'vitest';
import { mergeIntoTank, sameTank, HEX_AXES, basePresetOf, craftPresets, flavorProfile, leverEffects, leverSummary, newScenarioGame, presetAsRecipe, previewBatch, type GameState, type Recipe, advanceMonths, advanceMonth, applyAction, bulkValuePerLPA, categorize, evaporate, heartsFraction, matureCask, newGame, previewBlend, sizeFactor, simulateBatch, stillDefOf, volumeDiscounts, windowFraction, type Cask, type SpiritLot, appeal, type Product, caskStorageCost, fermentDaysAt, waterPermitCap } from './index';
import { AGING_HORIZONS, recipeEconomics, STANDARD_BOTTLE, stockMonthsAfter, tankFillNeed, whiskyAnnualPace, whiskySupplyForecast, productionValue } from './economics';
import { slotClimate } from './warehouse';
import { EQUIPMENT } from './content/catalog';
import { consumerPrice, priceForConsumer, REGIONS, siteOf } from './content/regions';

// 생산·숙성·블렌딩 테스트 (파트 PROD, 결정 #144 — sim.test.ts·sites.test.ts에서 옮겨 왔다. 테스트 이름·본문 불변)


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
    s.research.unlocked.push('MAT-3a'); // 로테이션은 테크 MAT-3a 뒤 (tech-tree §1.2, 게이트 켜기)
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

  it('오염 통은 비워도 오염이 남고(통입 불가), 재탄화하면 다시 쓸 수 있다', () => {
    let s = newGame({ seed: 1 });
    const c = s.inventory.casks[0]!;
    c.contamination = 'mold'; c.fills = 1;
    expect(applyAction(s, { type: 'rechar', caskId: c.id }).state.inventory.casks[0]!.contamination).toBeUndefined();
    s = applyAction(s, { type: 'rechar', caskId: c.id }).state;
    expect(s.inventory.casks[0]!.contamination).toBeUndefined();
  });
});

describe('제주 — 취수 허가·면세 한정판 (결정 #87)', () => {
  it('취수 허가: 월 15,000L 상한, 증량 신청은 심사 후 승인/불허', () => {
    let j = newGame({ seed: 3, region: 'KR', site: 'jeju' });
    expect(waterPermitCap(j)).toBe(15_000);
    expect(waterPermitCap(newGame({ seed: 3, region: 'KR' }))).toBe(Infinity);
    j = applyAction(j, { type: 'applyWaterPermit' }).state;
    expect(j.site.permitApplication).toBeTruthy();
    expect(applyAction(j, { type: 'applyWaterPermit' }).error).toContain('심사 중');
    j = advanceMonths(j, 13);
    expect(j.site.permitApplication).toBeUndefined();
    expect([15_000, 25_000]).toContain(waterPermitCap(j));
  });
});

describe('크래프팅 레버 미리보기 (mvp.md §1.2, #156)', () => {
  const mvp = () => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
  const malt = (s: GameState) => s.production.recipes.find((r) => r.kind === 'malt')!;
  const soju = (s: GameState) => s.production.recipes.find((r) => r.kind === 'soju')!;
  const baseOf = (s: GameState, r: Recipe) => presetAsRecipe(s, basePresetOf(s, r)!, r);

  it('MVP 프리셋은 잠긴 주종(진·고량주)을 빼고, 레시피는 같은 이름의 프리셋에서 출발한 것으로 본다', () => {
    const s = mvp();
    expect(new Set(craftPresets(s).map((p) => p.kind))).toEqual(new Set(['soju', 'malt']));
    expect(basePresetOf(s, malt(s))!.name).toBe(malt(s).name);
    // 이름을 바꿔도 같은 주원료의 프리셋으로 찾는다
    expect(basePresetOf(s, { ...malt(s), name: '내 몰트' })!.mashBill[0]!.ingredientId).toBe(malt(s).mashBill[0]!.ingredientId);
  });

  it('프리셋 그대로면 효과가 없고, 한 줄은 "프리셋 그대로"라고 쓴다', () => {
    const s = mvp();
    expect(leverEffects(s, baseOf(s, malt(s)), malt(s))).toEqual([]);
    expect(leverSummary([])).toContain('프리셋 그대로');
  });

  it('바꾼 레버만 효과로 나오고, 한 줄에 레버·전후 값·품질 변화가 들어간다', () => {
    const s = mvp();
    const r = malt(s);
    const fx = leverEffects(s, baseOf(s, r), { ...r, fermentDays: r.fermentDays + 3, cut: { c1: r.cut.c1 - 0.04, c2: r.cut.c2 + 0.08 } });
    expect(fx.map((e) => e.lever).sort()).toEqual(['cut', 'fermentDays']);
    const cut = fx.find((e) => e.lever === 'cut')!;
    expect(cut.dYield).toBeGreaterThan(0); // 본류를 넓히면 수율↑
    expect(cut.dOffnotes).toBeGreaterThan(0); // 이취↑
    expect(leverSummary(fx)).toMatch(/발효 기간 \d+일→\d+일: .*품질 [+−±]\d/);
  });

  it('감압은 감압 증류기와 함께 하나의 레버로 본다 — 깔끔해진다(누룽지 향↓)', () => {
    const s = mvp();
    s.production.equipment.push({ id: 'EV', catalogId: 'vacuum_1000', readyMonth: 0, feintsLPA: 0 });
    const r = soju(s);
    const fx = leverEffects(s, baseOf(s, r), { ...r, pressure: 'vacuum', stillId: 'EV' });
    expect(fx.map((e) => e.lever)).toEqual(['pressure']);
    expect(fx[0]!.from).toBe('상압');
    expect(fx[0]!.to).toBe('감압');
    const v = previewBatch(s, { ...r, pressure: 'vacuum', stillId: 'EV' })!;
    const a = previewBatch(s, r)!;
    expect(v.flavor.toasted_grain ?? 0).toBeLessThan(a.flavor.toasted_grain ?? 0);
  });

  it('향미 프로필: 몰트는 블렌딩 육각형 6축(샘플 기록과 같은 축), 소주는 주종 레이더 축', () => {
    const s = mvp();
    expect(flavorProfile('malt', previewBatch(s, malt(s))!.flavor).map((a) => a.id)).toEqual([...HEX_AXES]);
    expect(flavorProfile('soju', previewBatch(s, soju(s))!.flavor).map((a) => a.id)).toContain('nuruk_rice');
  });

  it('미리보기는 게임 상태를 바꾸지 않는다', () => {
    const s = mvp();
    const before = JSON.stringify(s);
    const r = malt(s);
    leverEffects(s, baseOf(s, r), { ...r, yeast: 'ale', runs: 1, mashBill: [{ ingredientId: 'malt_korean', ratio: 1 }] });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('탱크 합치기 (#166)', () => {
  it('같은 레시피 몰트 뉴메이크는 달이 바뀌어도 탱크 하나에 합쳐진다 — id 유지, 생산 달은 가장 오래된 배치, 배치 id는 새로', () => {
    let s = newGame({ seed: 2 });
    const malt = s.production.recipes.find((r) => r.kind === 'malt' && r.name.endsWith('언피티드'))!;
    s = applyAction(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: 2 }).state;
    // 지시한 달 다음 틱부터 생산되는 배치가 쌓일 때까지
    while (!s.inventory.lots.some((l) => l.recipeId === malt.id)) s = advanceMonths(s, 1);
    const first = s.inventory.lots.filter((l) => l.recipeId === malt.id);
    expect(first).toHaveLength(1);
    const lpa1 = first[0]!.volumeL * first[0]!.abv;
    s = advanceMonths(s, 2);
    const after = s.inventory.lots.filter((l) => l.recipeId === malt.id);
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(first[0]!.id);
    expect(after[0]!.createdMonth).toBe(first[0]!.createdMonth);
    expect(after[0]!.batchId).not.toBe(first[0]!.batchId);
    expect(after[0]!.volumeL * after[0]!.abv).toBeGreaterThan(lpa1 * 2.5);
    expect(after[0]!.name).toContain('탱크');
  });

  it('소주는 합치지 않는다 — 탱크에서 쉬는 것 자체가 숙성(스테인리스 휴지, #161)', () => {
    let s = newGame({ seed: 2 });
    const soju = s.production.recipes.find((r) => r.kind === 'soju')!;
    s = applyAction(s, { type: 'setOrder', recipeId: soju.id, batchesPerMonth: 1 }).state;
    while (!s.inventory.lots.some((l) => l.recipeId === soju.id)) s = advanceMonths(s, 1);
    s = advanceMonths(s, 2);
    expect(s.inventory.lots.filter((l) => l.recipeId === soju.id)).toHaveLength(3);
  });

  it('합친 원액: LPA 가중 평균(도수·원가·원료 비율), 매입 원액·숙성 원액·다른 레시피와는 섞지 않는다', () => {
    const base: SpiritLot = { id: 'A', name: 'a', kind: 'malt', volumeL: 100, abv: 0.7, flavor: { cereal: 40 }, createdMonth: 1, oakMonths: 0, sourced: false, costPerLPA: 10_000, recipeId: 'R1', batchId: 'A', mashShare: { malt_unpeated: 1 } };
    const fresh: SpiritLot = { ...base, id: 'B', batchId: 'B', volumeL: 300, abv: 0.7, flavor: { cereal: 20 }, createdMonth: 3, costPerLPA: 20_000, mashShare: { malt_peated: 1 } };
    expect(sameTank(base, fresh)).toBe(true);
    expect(sameTank(base, { ...fresh, recipeId: 'R2' })).toBe(false);
    expect(sameTank(base, { ...fresh, sourced: true })).toBe(false);
    expect(sameTank({ ...base, kind: 'soju' }, { ...fresh, kind: 'soju' })).toBe(false);
    const m = mergeIntoTank(base, fresh, '몰트', '1월');
    expect(m.id).toBe('A');
    expect(m.batchId).toBe('B');
    expect(m.createdMonth).toBe(1);
    expect(m.volumeL).toBe(400);
    expect(m.costPerLPA).toBeCloseTo(17_500, 6);
    expect(m.flavor.cereal).toBeCloseTo(25, 6);
    expect(m.mashShare).toEqual({ malt_unpeated: 0.25, malt_peated: 0.75 });
  });
});

describe('병당 손익 (#173, 플레이테스트 요청)', () => {
  const mvp = () => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
  it('소주는 바로 병입 한 줄, 몰트는 숙성 1·3년 두 줄 — 이익 = 출고가 − 원가 − 유통비, 숙성할수록 품질·출고가가 오른다', () => {
    const s = mvp();
    const soju = recipeEconomics(s, s.production.recipes.find((r) => r.kind === 'soju')!);
    expect(soju.map((r) => r.months)).toEqual([0]);
    const malt = recipeEconomics(s, s.production.recipes.find((r) => r.kind === 'malt')!);
    expect(malt.map((r) => r.months)).toEqual([...AGING_HORIZONS]);
    for (const r of [...soju, ...malt]) {
      expect(Math.abs(r.margin - (r.price - r.spiritCost - r.packCost - r.distribution))).toBeLessThanOrEqual(3);
      expect(r.bottlesPerBatch).toBeGreaterThan(0);
      expect(r.demandPerMonth).toBeGreaterThanOrEqual(0);
    }
    expect(malt[1]!.quality).toBeGreaterThan(malt[0]!.quality);
    expect(malt[1]!.price).toBeGreaterThan(malt[0]!.price);
    expect(malt[0]!.category).toBe('whisky');
  });

  it('권장 출고가는 같은 원액을 실제로 병입할 때의 권장 출고가와 같다(같은 식)', () => {
    const s = mvp();
    const r = s.production.recipes.find((x) => x.kind === 'soju')!;
    const row = recipeEconomics(s, r)[0]!;
    const b = previewBatch(s, r)!;
    s.inventory.lots.push({ id: 'X', name: 'x', kind: 'soju', volumeL: b.volumeL, abv: b.abv, flavor: b.flavor, createdMonth: s.month, oakMonths: 0, sourced: false, costPerLPA: b.cost / b.lpa, recipeId: r.id, mashShare: Object.fromEntries(r.mashBill.map((m) => [m.ingredientId, m.ratio])) });
    const p = previewBlend(s, [{ source: 'lot', id: 'X', liters: 100 }], { name: '', targetAbv: STANDARD_BOTTLE.soju.abv, bottleMl: STANDARD_BOTTLE.soju.bottleMl, chillFilter: true, packagingId: 'standard' });
    expect(row.price).toBe(p.suggestedPrice);
  });

  it('게임 상태를 바꾸지 않는다 (id 카운터 포함)', () => {
    const s = mvp();
    const before = JSON.stringify(s);
    for (const r of s.production.recipes) recipeEconomics(s, r);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('위스키 공급 전망·병입 재고 경고 (#178, 1차 MVP 플레이테스트)', () => {
  const mvp = () => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
  const maltLot = (s: GameState, id: string, volumeL: number, oakMonths = 0): SpiritLot => ({
    id, name: id, kind: 'malt', volumeL, abv: 0.635, flavor: {}, createdMonth: s.month, oakMonths, sourced: false, costPerLPA: 10_000,
  });
  const clearOrders = (s: GameState) => { s.production.orders = []; };

  it('숙성 중인 통은 법정 최소 숙성을 채우는 해에, 탱크 몰트는 지금 통입한다고 보고 센다 (700ml·40% 병, 증발 연 5%)', () => {
    const s = mvp();
    clearOrders(s);
    const cask = { id: 'C1', typeId: 'ex_bourbon_barrel', sizeL: 200, wood: 'american_oak', activity: 1, seasoning: 1, fills: 1, recharCount: 0, char: 3 } as Cask;
    s.inventory.casks.push({ ...cask, contents: maltLot(s, 'L1', 200, 2) }); // 한국 최소 12개월 — 10개월 뒤
    s.inventory.lots.push(maltLot(s, 'T1', 100));
    const f = whiskySupplyForecast(s, 3);
    const bottle = 0.7 * 0.4;
    expect(f[0]!.fromCasks).toBe(Math.round((200 * 0.635 * Math.pow(0.95, 10 / 12)) / bottle));
    // 지금 통입하면 12번째 월 마감에 12개월을 채운다 — 앞으로 1년 칸
    expect(f[0]!.fromTank).toBe(Math.round((100 * 0.635 * 0.95) / bottle));
    expect(f[1]!.fromTank).toBe(0);
    expect(f.every((y) => y.fromOrders === 0)).toBe(true);
    expect(f[2]!.bottles).toBe(0);
  });

  it('생산 지시를 줄이면 최소 숙성 뒤 해부터 공급이 준다 — 이번 해 칸은 그대로', () => {
    const s = mvp();
    const malt = s.production.recipes.find((r) => r.kind === 'malt')!;
    s.production.orders = [{ recipeId: malt.id, batchesPerMonth: 4 }];
    const hi = whiskySupplyForecast(s, 3);
    s.production.orders = [{ recipeId: malt.id, batchesPerMonth: 1 }];
    const lo = whiskySupplyForecast(s, 3);
    expect(hi[0]!.fromOrders).toBe(lo[0]!.fromOrders); // 12개월 미만이라 아직 위스키가 아니다
    expect(hi[1]!.fromOrders).toBeGreaterThan(lo[1]!.fromOrders * 3.5);
  });

  it('병입 뒤 재고 개월 수 — 판매 기록이 있으면 최근 3개월 판매, 없으면 수요 근사로 나눈다', () => {
    const s = mvp();
    const before = stockMonthsAfter(s, 'soju_distilled', 600, 100);
    expect(before.basis).toBe('demand');
    expect(before.months).toBeCloseTo(6, 6);
    expect(stockMonthsAfter(s, 'soju_distilled', 600, 0).months).toBe(Infinity);
    const p = { id: 'P1', category: 'soju_distilled', stockBottles: 400, dutyFreeOnly: false } as Product;
    s.commerce.products.push(p);
    const rep = (n: number) => ({ sales: [{ productId: 'P1', name: 'x', bottles: n, revenue: 0, demandBottles: n }] }) as unknown as GameState['history']['reports'][number];
    s.history.reports.push(rep(40), rep(60), rep(50));
    const after = stockMonthsAfter(s, 'soju_distilled', 600, 999);
    expect(after.basis).toBe('sales');
    expect(after.monthly).toBe(50);
    expect(after.months).toBeCloseTo((400 + 600) / 50, 6);
  });

  it('연 판매 속도는 위스키 범주 판매 × 12, 없으면 수요 추정 — 탱크 통입 자리 안내, 상태 불변', () => {
    const s = mvp();
    expect(whiskyAnnualPace(s)?.basis).toBe('demand');
    s.inventory.lots.push(maltLot(s, 'T1', 450));
    const before = JSON.stringify(s);
    whiskySupplyForecast(s);
    expect(tankFillNeed(s).casks200).toBe(3);
    expect(JSON.stringify(s)).toBe(before);
    s.commerce.products.push({ id: 'W1', category: 'whisky', stockBottles: 10 } as Product, { id: 'B1', category: 'blended_whisky', stockBottles: 10 } as Product);
    const rep = { sales: [{ productId: 'W1', name: 'w', bottles: 30, revenue: 0, demandBottles: 30 }, { productId: 'B1', name: 'b', bottles: 10, revenue: 0, demandBottles: 10 }] } as unknown as GameState['history']['reports'][number];
    s.history.reports.push(rep);
    expect(whiskyAnnualPace(s)).toEqual({ bottles: 480, basis: 'sales' });
  });
});

describe('소주·진 샘플 — 그 주종 레이더 축으로도 읽는다 (#183, 2차 플레이테스트)', () => {
  it('옹기 소주 샘플 기록에 소주 레이더 축 읽기가 남고, 병입 추정에 축이 나온다 — 육각형·추정 품질 읽기는 그대로', async () => {
    const { sampleAxesOf, knownReads, recordSample, readCask } = await import('./blendTable');
    const { estimateBlend } = await import('./blending');
    let s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const soju = s.production.recipes.find((r) => r.kind === 'soju')!;
    s = applyAction(s, { type: 'setOrder', recipeId: soju.id, batchesPerMonth: 1 }).state;
    s = advanceMonths(s, 1);
    s = applyAction(s, { type: 'buySpotCasks', caskType: 'onggi_jar', qty: 1 }).state;
    const lot = s.inventory.lots.find((l) => l.kind === 'soju')!;
    const jar = s.inventory.casks.find((c) => !c.contents && c.typeId === 'onggi_jar')!;
    s = applyAction(s, { type: 'fillCasks', lotId: lot.id, caskIds: [jar.id], entryAbv: 0.45 }).state;
    s = advanceMonths(s, 3);
    const pre = s.inventory.casks.find((c) => c.id === jar.id)!;
    const hexBefore = readCask(s, { ...pre, samples: (pre.samples ?? 0) + 1 }); // takeSample이 횟수를 먼저 올리고 읽는다
    s = applyAction(s, { type: 'sampleCask', caskIds: [jar.id] }).state;
    const c = s.inventory.casks.find((x) => x.id === jar.id)!;
    const rec = c.sampleLog!.at(-1)!;
    const axes = sampleAxesOf('soju')!;
    expect(Object.keys(rec.axes ?? {}).sort()).toEqual([...axes].sort());
    expect(rec.hex).toEqual(hexBefore); // 육각형 읽기는 축 읽기를 더해도 그대로 (난수 스트림이 따로)
    expect(knownReads(s).get(jar.id)?.axes).toEqual(rec.axes);
    const est = estimateBlend(s, [{ source: 'cask', id: jar.id, liters: 50 }]);
    expect(est.axes).not.toBeNull();
    for (const a of axes) expect(est.axes![a]).toBeCloseTo(rec.axes![a]!, 6);
    // 몰트는 육각형만
    expect(sampleAxesOf('malt')).toBeNull();
    // 옛 기록(축 없음)이 섞이면 축 추정은 null — 화면은 "다시 샘플"
    c.sampleLog = [{ ...rec, axes: undefined }];
    expect(estimateBlend(s, [{ source: 'cask', id: jar.id, liters: 50 }]).axes).toBeNull();
    void recordSample;
  });
});

describe('생산비 대 고정비 · 생산이 만드는 미래 위스키 (#185, 2차 플레이테스트)', () => {
  it('월 생산비 = 배치 원가 × 월 배치 수, 해마다 위스키 병 수 = 공급 전망의 생산 지시 몫(정상 상태)과 같다', () => {
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const malt = s.production.recipes.find((r) => r.kind === 'malt')!;
    const soju = s.production.recipes.find((r) => r.kind === 'soju')!;
    s.production.orders = [{ recipeId: malt.id, batchesPerMonth: 3 }, { recipeId: soju.id, batchesPerMonth: 2 }];
    const v = productionValue(s);
    expect(v.costPerMonth).toBe(Math.round(previewBatch(s, malt)!.cost * 3 + previewBatch(s, soju)!.cost * 2));
    expect(v.whiskyCostPerMonth).toBe(Math.round(previewBatch(s, malt)!.cost * 3));
    const steady = whiskySupplyForecast(s, 3)[2]!.fromOrders; // 3년째 = 12개 월 생산분이 모두 위스키가 된 해
    expect(Math.abs(v.whiskyBottlesPerYear - steady)).toBeLessThanOrEqual(2);
    expect(v.pricePerBottle).toBeGreaterThan(0);
    const one = v.perBatch.find((x) => x.recipeId === malt.id)!;
    expect(Math.abs(one.whiskyBottlesPerYear * 3 - v.whiskyBottlesPerYear)).toBeLessThanOrEqual(3);
    s.production.orders = [{ recipeId: soju.id, batchesPerMonth: 2 }];
    expect(productionValue(s).whiskyBottlesPerYear).toBe(0);
  });
});

describe('기존 제품에 재고 보충 (#186, 2차 플레이테스트 오너 요청)', () => {
  const setup = () => {
    let s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const soju = s.production.recipes.find((r) => r.kind === 'soju')!;
    s = applyAction(s, { type: 'setOrder', recipeId: soju.id, batchesPerMonth: 2 }).state;
    s = advanceMonths(s, 2);
    return s;
  };
  const opts = { name: '하회', targetAbv: 0.4, bottleMl: 700, chillFilter: true, packagingId: 'standard' } as const;
  const lots = (s: GameState) => s.inventory.lots.filter((l) => l.kind === 'soju');

  it('새 제품을 만들지 않고 재고에 더한다 — 품질·원가는 재고 가중 평균, 이름·출고가·출시 달은 그대로', () => {
    let s = setup();
    const [a, b] = lots(s);
    s = applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: a!.id, liters: 60 }], options: { ...opts } }).state;
    const p0 = s.commerce.products.at(-1)!;
    const n0 = s.commerce.products.length;
    s = applyAction(s, { type: 'setPrice', productId: p0.id, price: p0.price + 1000 }).state;
    const before = s.commerce.products.find((x) => x.id === p0.id)!;
    const preview = previewBlend(s, [{ source: 'lot', id: b!.id, liters: 90 }], { ...opts, name: '', restockId: p0.id });
    expect(preview.ok).toBe(true);
    const res = applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: b!.id, liters: 90 }], options: { ...opts, name: '', restockId: p0.id } });
    expect(res.error).toBeUndefined();
    s = res.state;
    expect(s.commerce.products.length).toBe(n0);
    const after = s.commerce.products.find((x) => x.id === p0.id)!;
    expect(after.stockBottles).toBe(before.stockBottles + preview.bottles);
    const w = preview.bottles / after.stockBottles;
    expect(after.quality).toBeCloseTo(before.quality + (preview.evaluation!.quality - before.quality) * w, 0);
    expect(after.name).toBe(before.name);
    expect(after.price).toBe(before.price);
    expect(after.createdMonth).toBe(before.createdMonth);
    expect(res.message).toContain('재고 보충');
  });

  it('병 크기·도수·범주가 다르면 보충할 수 없다', () => {
    let s = setup();
    const [a, b] = lots(s);
    s = applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: a!.id, liters: 60 }], options: { ...opts } }).state;
    const id = s.commerce.products.at(-1)!.id;
    const comp = [{ source: 'lot' as const, id: b!.id, liters: 60 }];
    expect(previewBlend(s, comp, { ...opts, bottleMl: 500, restockId: id }).errors.join()).toContain('병 크기');
    expect(previewBlend(s, comp, { ...opts, targetAbv: 0.25, restockId: id }).errors.join()).toContain('도수');
    expect(previewBlend(s, comp, { ...opts, restockId: 'NOPE' }).ok).toBe(false);
  });
});

describe('재고 보충 — 매대 재고가 0이면 새 배치의 숙성 표기를 그대로 (P-PROD-14 수정)', () => {
  it('남은 재고가 있으면 어린 쪽, 0이면 새 배치 값', async () => {
    const { restockedProduct } = await import('./blending');
    const base = { id: 'P', name: 'x', category: 'whisky', ageYears: 1, oakMonths: 12, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 60, typicity: 50, style: null, sourcedShare: 0, stockBottles: 100, price: 40000, unitCost: 10000, createdMonth: 0, lastMonthSold: 0, totalSold: 0 } as Product;
    const batch = { ...base, ageYears: 3, oakMonths: 38, quality: 75, stockBottles: 300 } as Product;
    expect(restockedProduct(base, batch).ageYears).toBe(1);
    const empty = restockedProduct({ ...base, stockBottles: 0 }, batch);
    expect(empty.ageYears).toBe(3);
    expect(empty.oakMonths).toBe(38);
    expect(empty.quality).toBe(75);
    expect(empty.price).toBe(40000); // 출고가는 플레이어 몫 — 화면이 올리라고 알린다
  });
});

describe('자동 최적 가격 (#200, 3차 MVP 플레이테스트 오너 요청)', () => {
  const setup = () => {
    let s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const soju = s.production.recipes.find((r) => r.kind === 'soju')!;
    s = applyAction(s, { type: 'setOrder', recipeId: soju.id, batchesPerMonth: 1 }).state;
    s = advanceMonths(s, 2);
    const lot = s.inventory.lots.find((l) => l.kind === 'soju')!;
    s = applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: 120 }], options: { name: '소주', targetAbv: 0.4, bottleMl: 700, chillFilter: true, packagingId: 'standard' } }).state;
    return s;
  };
  it('켜면 이 제품 공헌이 남는 후보 중 진열 전체 공헌이 가장 큰 값으로 바뀐다 (#220)', async () => {
    const { bestAutoPrice, AUTO_PRICE_FACTORS, currentSuggested } = await import('./economics');
    const { priceOptions, calendar } = await import('./index');
    const s = setup();
    const p = s.commerce.products.at(-1)!;
    const best = bestAutoPrice(s, p)!;
    expect(best).toBeGreaterThan(0);
    const base = currentSuggested(s, p);
    const cands = [...new Set([p.price, ...AUTO_PRICE_FACTORS.map((f) => Math.max(100, Math.round((base * f) / 100) * 100))])];
    const opts = priceOptions(s, p, calendar(s).monthOfYear, cands.map((x) => x / p.price));
    const ok = opts.filter((o) => o.contribution > 0);
    expect(ok.length).toBeGreaterThan(0);
    const top = ok.reduce((a, b) => (b.lineupContribution > a.lineupContribution ? b : a));
    expect(best).toBe(top.price);
    const on = applyAction(s, { type: 'setAutoPrice', productId: p.id, on: true }).state;
    expect(on.commerce.products.find((x) => x.id === p.id)!.price).toBe(best);
    expect(on.commerce.products.find((x) => x.id === p.id)!.autoPrice).toBe(true);
  });
  it('매달 판매 직전에 다시 정한다 — 끈 제품은 손대지 않는다', () => {
    let s = setup();
    const p = s.commerce.products.at(-1)!;
    s = applyAction(s, { type: 'setPrice', productId: p.id, price: p.price * 3 }).state;
    const off = advanceMonth(s);
    expect(off.commerce.products.find((x) => x.id === p.id)!.price).toBe(p.price * 3 >= 100 ? Math.round((p.price * 3) / 100) * 100 : 100);
    s = applyAction(s, { type: 'setAutoPrice', productId: p.id, on: true }).state;
    s = applyAction(s, { type: 'setPrice', productId: p.id, price: p.price * 3 }).state; // 수동으로 틀어도
    const t2 = advanceMonth(s);
    expect(t2.commerce.products.find((x) => x.id === p.id)!.price).toBeLessThan(p.price * 3); // 다음 판매 전에 다시 맞춘다
  });
});

describe('품절 제품 지우기 · 통에서 원액 빼기 (2026-11-09 오너 요청)', () => {
  const base = () => {
    let s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const malt = s.production.recipes.find((r) => r.kind === 'malt')!;
    const soju = s.production.recipes.find((r) => r.kind === 'soju')!;
    s = applyAction(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: 2 }).state;
    s = applyAction(s, { type: 'setOrder', recipeId: soju.id, batchesPerMonth: 1 }).state;
    return advanceMonth(s);
  };
  it('재고가 남은 제품은 못 지우고, 품절이면 지워 판매 기록만 남긴다', () => {
    let s = base();
    const lot = s.inventory.lots.find((l) => l.kind === 'soju')!;
    s = applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: 3 }], options: { name: 'x', targetAbv: 0.4, bottleMl: 700, chillFilter: true, packagingId: 'standard' } }).state;
    const id = s.commerce.products.at(-1)!.id;
    expect(applyAction(s, { type: 'archiveProduct', productId: id }).error).toContain('재고');
    s.commerce.products.find((p) => p.id === id)!.stockBottles = 0;
    const r = applyAction(s, { type: 'archiveProduct', productId: id });
    expect(r.error).toBeUndefined();
    expect(r.state.commerce.products.some((p) => p.id === id)).toBe(false);
    expect(r.state.commerce.productArchive.some((p) => p.id === id)).toBe(true);
  });
  it('통입한 달·샘플 전이면 통입 취소 — 통은 넣기 전 그대로, 원액은 탱크로', () => {
    let s = base();
    const lot = s.inventory.lots.find((l) => l.kind === 'malt')!;
    const cask = s.inventory.casks.find((c) => !c.contents)!;
    s = applyAction(s, { type: 'fillCasks', lotId: lot.id, caskIds: [cask.id], entryAbv: 0.635 }).state;
    const filled = s.inventory.casks.find((c) => c.id === cask.id)!;
    const vol = filled.contents!.volumeL;
    const r = applyAction(s, { type: 'unfillCask', caskId: cask.id });
    expect(r.error).toBeUndefined();
    const after = r.state.inventory.casks.find((c) => c.id === cask.id)!;
    expect(after.contents).toBeUndefined();
    expect(after.fills).toBe(cask.fills);
    expect(after.activity).toBe(cask.activity);
    const back = r.state.inventory.lots.find((l) => l.name.includes('통입 취소'))!;
    expect(back.volumeL).toBeCloseTo(vol, 6);
  });
  it('몇 달 뒤에는 옮겨 붓기 — 0.75% 손실, 숙성 개월은 원액에 남고 통은 한 번 쓴 통', () => {
    let s = base();
    const lot = s.inventory.lots.find((l) => l.kind === 'malt')!;
    const cask = s.inventory.casks.find((c) => !c.contents)!;
    s = applyAction(s, { type: 'fillCasks', lotId: lot.id, caskIds: [cask.id], entryAbv: 0.635 }).state;
    s = advanceMonths(s, 3);
    const before = s.inventory.casks.find((c) => c.id === cask.id)!;
    const r = applyAction(s, { type: 'unfillCask', caskId: cask.id });
    const back = r.state.inventory.lots.find((l) => l.name.includes('에서 뺌'))!;
    expect(back.oakMonths).toBe(before.contents!.oakMonths);
    expect(back.oakMonths).toBeGreaterThan(0);
    expect(back.volumeL).toBeCloseTo(before.contents!.volumeL * (1 - 0.0075), 6);
    expect(r.state.inventory.casks.find((c) => c.id === cask.id)!.activity).toBeLessThan(before.activity);
    // 숙성 원액은 새 뉴메이크와 탱크에서 섞이지 않는다
    const t2 = advanceMonth(r.state);
    expect(t2.inventory.lots.some((l) => l.id === back.id && l.oakMonths === back.oakMonths)).toBe(true);
  });
});

describe('자동 납품 (#206, 2026-11-09 오너 요청)', () => {
  it('소주: 매달 판매 전에 재고를 n개월분으로 채운다 — 탱크 원액, 먼저 만든 것부터', async () => {
    const { autoRestockPlan, productMonthlyPace } = await import('./economics');
    let s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const soju = s.production.recipes.find((r) => r.kind === 'soju')!;
    s = applyAction(s, { type: 'setOrder', recipeId: soju.id, batchesPerMonth: 2 }).state;
    s = advanceMonths(s, 2);
    const lot = s.inventory.lots.find((l) => l.kind === 'soju')!;
    s = applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: 3 }], options: { name: '소주', targetAbv: 0.4, bottleMl: 700, chillFilter: true, packagingId: 'standard' } }).state;
    const id = s.commerce.products.at(-1)!.id;
    s = applyAction(s, { type: 'setAutoRestock', productId: id, months: 2 }).state;
    const p = s.commerce.products.find((x) => x.id === id)!;
    const plan = autoRestockPlan(s, p)!;
    expect(plan.components.every((c) => c.source === 'lot')).toBe(true);
    expect(plan.target).toBe(Math.ceil(productMonthlyPace(s, p) * 2));
    const n0 = s.commerce.products.length;
    const t = advanceMonth(s);
    expect(t.commerce.products.length).toBe(n0); // 새 제품이 아니라 보충
    expect(t.history.reports.at(-1)!.notes.some((n) => n.startsWith('자동 납품 「소주」 +'))).toBe(true);
    expect(t.history.reports.at(-1)!.sales.find((x) => x.productId === id)!.bottles).toBeGreaterThan(5); // 결품 없이 팔렸다
  });

  it('위스키: 숙성 표기를 채운 통 중 표기에 가장 가까운(어린) 통부터, 피니시·표기 미달 통은 쓰지 않는다', async () => {
    const { autoRestockSources } = await import('./economics');
    const s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const mk = (id: string, oak: number) => { const c = { id, typeId: 'ex_bourbon_barrel', sizeL: 200, wood: 'american_oak', activity: 1, seasoning: 1, fills: 1, recharCount: 0, char: 3, contents: { id: `L${id}`, name: id, kind: 'malt', volumeL: 190, abv: 0.6, flavor: {}, createdMonth: 0, oakMonths: oak, sourced: false, costPerLPA: 10000 } } as Cask; s.inventory.casks.push(c); };
    mk('A', 20); mk('B', 50); mk('C', 38); mk('D', 144);
    const p = { id: 'W', name: 'w', category: 'whisky', ageYears: 3, oakMonths: 36, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 70, typicity: 50, style: null, sourcedShare: 0, stockBottles: 0, price: 40000, unitCost: 10000, createdMonth: 0, lastMonthSold: 0, totalSold: 0 } as Product;
    expect(autoRestockSources(s, p).map((x) => x.comp.id)).toEqual(['C', 'B', 'D']); // 20개월 통은 3년 표기 미달
  });

  it('면세 한정판·블렌디드는 켤 수 없다', () => {
    const s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    s.commerce.products.push({ id: 'X', name: 'x', category: 'blended_whisky', stockBottles: 0 } as Product);
    expect(applyAction(s, { type: 'setAutoRestock', productId: 'X', months: 2 }).error).toBeDefined();
  });
});

describe('캐스크 스트렝스 제품 재고 보충 (2026-11-09 오너 보고: 61.0% 제품에 61.0% 통을 못 넣음)', () => {
  it('표준 도수가 아닌 제품은 캐스크 스트렝스 — 도수가 조금 달라도 보충되고 제품 도수는 병 수 가중 평균', async () => {
    const { isCaskStrength } = await import('./blending');
    let s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const mk = (id: string, abv: number) => { s.inventory.casks.push({ id, typeId: 'ex_bourbon_barrel', sizeL: 200, wood: 'american_oak', activity: 1, seasoning: 1, fills: 1, recharCount: 0, char: 3, contents: { id: `L${id}`, name: id, kind: 'malt', volumeL: 150, abv, flavor: { vanilla_caramel: 40, cereal: 20 }, createdMonth: 0, oakMonths: 40, sourced: false, costPerLPA: 10000 } } as Cask); };
    mk('A', 0.6104); mk('B', 0.6098);
    const o = { name: '셰리', targetAbv: 'cask' as const, bottleMl: 700, chillFilter: false, packagingId: 'standard' };
    s = applyAction(s, { type: 'bottle', components: [{ source: 'cask', id: 'A', liters: 150 }], options: o }).state;
    const p = s.commerce.products.at(-1)!;
    expect(isCaskStrength(p)).toBe(true);
    const r = applyAction(s, { type: 'bottle', components: [{ source: 'cask', id: 'B', liters: 150 }], options: { ...o, name: '', restockId: p.id } });
    expect(r.error).toBeUndefined();
    const after = r.state.commerce.products.find((x) => x.id === p.id)!;
    expect(after.abv).toBeLessThan(0.6104);
    expect(after.abv).toBeGreaterThan(0.6098);
    // 표준 도수 제품은 지금처럼 도수를 맞춰야 한다
    expect(isCaskStrength({ abv: 0.46 })).toBe(false);
  });
});

describe('숙성 소주 표기 — 병입·보충·권장가·자동 납품 (#217 · #221)', () => {
  const setup = async () => {
    const { emptyCaskOf } = await import('./index');
    const s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const add = (id: string, rest: number, type: 'onggi_jar' | 'ex_bourbon_barrel' = 'onggi_jar', oak = 0) => {
      const c = emptyCaskOf(s, type); c.id = id;
      c.contents = { id: `L${id}`, name: id, kind: 'soju', volumeL: 150, abv: 0.6, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: oak, restMonths: rest || undefined, sourced: false, costPerLPA: 10_000, batchId: `B${id}` };
      s.inventory.casks.push(c);
    };
    add('J24', 24); add('J30', 30); add('J8', 8); add('J4', 4);
    s.inventory.lots.push({ id: 'T1', name: '탱크', kind: 'soju', volumeL: 300, abv: 0.6, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 10_000, batchId: 'BT' });
    s.finance.cash = 1e9;
    return s;
  };
  const opts = { name: '', targetAbv: 0.4, bottleMl: 375, chillFilter: true, packagingId: 'standard' } as const;

  it('옹기 2년 원액 → 제품에 restMonths·기본 이름 표기, 권장가는 표기 배수(×1.16)만큼 높다', async () => {
    const { agedWhiteLabel } = await import('./index');
    const s = await setup();
    const aged = previewBlend(s, [{ source: 'cask', id: 'J24', liters: 50 }], opts);
    expect(aged.minRestMonths).toBe(24);
    expect(aged.agedLabel).toBe('옹기 2년 숙성');
    // 같은 원액을 숙성 0으로 바꾼 비교 — 품질이 같으니 권장가 비는 배수(반올림 오차 안)
    const s0 = structuredClone(s);
    s0.inventory.casks.find((c) => c.id === 'J24')!.contents!.restMonths = undefined;
    const plain = previewBlend(s0, [{ source: 'cask', id: 'J24', liters: 50 }], opts);
    expect(plain.agedLabel).toBeNull();
    expect(aged.suggestedPrice / plain.suggestedPrice).toBeGreaterThan(1.1);
    // 6개월 미만 원액이 섞이면 표기 없음, 8개월은 "개월"
    expect(previewBlend(s, [{ source: 'cask', id: 'J24', liters: 50 }, { source: 'cask', id: 'J4', liters: 10 }], opts).agedLabel).toBeNull();
    expect(previewBlend(s, [{ source: 'cask', id: 'J8', liters: 50 }], opts).agedLabel).toBe('옹기 8개월 숙성');
    const after = applyAction(s, { type: 'bottle', components: [{ source: 'cask', id: 'J24', liters: 50 }], options: opts }).state;
    const p = after.commerce.products.at(-1)!;
    expect(p.restMonths).toBe(24);
    expect(p.name.endsWith('옹기 2년 숙성')).toBe(true);
    expect(agedWhiteLabel(p.category, p.oakMonths, p.restMonths)).toBe('옹기 2년 숙성');
    // 판매 화면 권장가(currentSuggested)도 같은 배수 — 병입 권장가와 같다
    const { currentSuggested } = await import('./economics');
    expect(currentSuggested(after, p)).toBe(p.price);
  });

  it('탱크 원액으로 보충하면 경고 후 표기가 빠지고, 자동 납품은 표기 개월 이상 옹기 통만 어린 통부터 쓴다', async () => {
    const { autoRestockSources } = await import('./economics');
    let s = await setup();
    s = applyAction(s, { type: 'bottle', components: [{ source: 'cask', id: 'J24', liters: 50 }], options: opts }).state;
    const p = s.commerce.products.at(-1)!;
    const pv = previewBlend(s, [{ source: 'lot', id: 'T1', liters: 30 }], { ...opts, restockId: p.id });
    expect(pv.warnings.some((w) => w.includes('「옹기 2년 숙성」 → 없음'))).toBe(true);
    const r = applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: 'T1', liters: 30 }], options: { ...opts, restockId: p.id } }).state;
    expect(r.commerce.products.find((x) => x.id === p.id)!.restMonths).toBeUndefined();
    // 자동 납품 후보: 24개월 이상 옹기 통만, 어린 통부터(남은 J24 → J30) — J8·J4·탱크는 표기를 깎는다
    expect(autoRestockSources(s, p).map((x) => x.comp.id)).toEqual(['J24', 'J30']);
  });
});

describe('핸드필 존 (#233, 2026-11-10 오너 요청)', () => {
  const setup = async () => {
    const { emptyCaskOf } = await import('./index');
    let s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    s.finance.cash = 1e10;
    const add = (id: string, oak: number, vol = 150) => {
      const c = emptyCaskOf(s, 'ex_bourbon_barrel'); c.id = id;
      c.contents = { id: `L${id}`, name: id, kind: 'malt', volumeL: vol, abv: 0.6, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: oak, sourced: false, costPerLPA: 10_000, batchId: `B${id}` };
      s.inventory.casks.push(c);
    };
    add('H1', 40); add('H2', 6); add('H3', 30, 0.8);
    return { s, apply: (a: Parameters<typeof applyAction>[1]) => { const r = applyAction(s, a); s = r.state; return r; }, get: () => s };
  };

  it('비지터 센터가 있어야 짓고, 설비가 있어야 통을 지정한다 — 위스키 기간을 못 채운 통은 안 된다', async () => {
    const t = await setup();
    expect(t.apply({ type: 'buyEquipment', catalogId: 'handfill_zone' }).error).toContain('베이직 투어');
    expect(t.apply({ type: 'setHandfillCask', caskId: 'H1' }).error).toContain('핸드필 존');
    t.apply({ type: 'buyEquipment', catalogId: 'visitor_basic' });
    expect(t.apply({ type: 'buyEquipment', catalogId: 'handfill_zone' }).error).toBeUndefined();
    expect(t.apply({ type: 'setHandfillCask', caskId: 'H2' }).error).toContain('숙성 기간');
    t.apply({ type: 'setHandfillCask', caskId: 'H1' });
    t.apply({ type: 'setHandfillCask', caskId: 'H3' }); // 한 번에 하나
    expect(t.get().inventory.casks.filter((c) => c.handfill).map((c) => c.id)).toEqual(['H3']);
    t.apply({ type: 'setHandfillCask', caskId: null });
    expect(t.get().inventory.casks.some((c) => c.handfill)).toBe(false);
  });

  it('매달 방문객의 일부가 지정 통에서 500ml를 사 간다 — 병입 권장가의 2배, 통이 비면 지정이 풀린다, 자동 납품은 이 통을 안 쓴다', async () => {
    const { runHandfill, handfillPrice, handfillBottleCost, HANDFILL, lotQuality } = await import('./index');
    const { autoRestockSources } = await import('./economics');
    const t = await setup();
    t.apply({ type: 'buyEquipment', catalogId: 'visitor_basic' });
    t.apply({ type: 'buyEquipment', catalogId: 'handfill_zone' });
    const s = t.get();
    for (const e of s.production.equipment) e.readyMonth = 0;
    t.apply({ type: 'setHandfillCask', caskId: 'H1' });
    const g = t.get();
    const cask = g.inventory.casks.find((c) => c.id === 'H1')!;
    const price = handfillPrice(g, cask.contents!, lotQuality(cask.contents!));
    expect(price).toBeGreaterThan(0);
    const cash0 = g.finance.cash;
    const rep = { month: g.month, revenue: 0, expenses: {} as Record<string, number>, notes: [] as string[], visitors: 500, tourismRevenue: 1_000_000 } as unknown as Parameters<typeof runHandfill>[1];
    runHandfill(g, rep);
    const n = Math.round(500 * HANDFILL.buyRate);
    expect(rep.tourismRevenue).toBe(1_000_000 + n * price);
    expect(g.finance.cash - cash0).toBe(n * price - n * handfillBottleCost());
    expect(g.inventory.casks.find((c) => c.id === 'H1')!.contents!.volumeL).toBeCloseTo(150 - n * 0.5, 6);
    // 자동 납품(위스키)은 핸드필 통을 고르지 않는다
    const p = { category: 'whisky', ageYears: 1, abv: 0.4, finish: undefined } as unknown as Product;
    expect(autoRestockSources(g, p).map((x) => x.comp.id)).not.toContain('H1');
    // 거의 빈 통 — 남은 만큼만 팔고 지정이 풀린다
    t.apply({ type: 'setHandfillCask', caskId: 'H3' });
    const g2 = t.get();
    const rep2 = { month: g2.month, revenue: 0, expenses: {} as Record<string, number>, notes: [] as string[], visitors: 500 } as unknown as Parameters<typeof runHandfill>[1];
    runHandfill(g2, rep2);
    const h3 = g2.inventory.casks.find((c) => c.id === 'H3')!;
    expect(h3.contents).toBeUndefined();
    expect(h3.handfill).toBeUndefined();
    expect(rep2.notes.some((x) => x.includes('비었다'))).toBe(true);
  });
});

describe('제품 이름 바꾸기 (#236, 2026-11-10 오너 요청)', () => {
  it('공백을 정리해 바꾸고 판매 기록은 그대로, 빈 이름·너무 긴 이름·다른 제품과 같은 이름은 막는다', () => {
    let s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const soju = s.production.recipes.find((r) => r.kind === 'soju')!;
    s = applyAction(s, { type: 'setOrder', recipeId: soju.id, batchesPerMonth: 1 }).state;
    s = advanceMonths(s, 2);
    for (const name of ['가', '나']) {
      const lot = s.inventory.lots.find((l) => l.kind === 'soju')!;
      s = applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: 20 }], options: { name, targetAbv: 0.4, bottleMl: 700, chillFilter: true, packagingId: 'standard' } }).state;
    }
    const [a, b] = s.commerce.products.slice(-2);
    const r = applyAction(s, { type: 'renameProduct', productId: a!.id, name: '  남양주   소주 ' });
    expect(r.error).toBeUndefined();
    const renamed = r.state.commerce.products.find((x) => x.id === a!.id)!;
    expect(renamed.name).toBe('남양주 소주');
    expect(renamed.stockBottles).toBe(a!.stockBottles);
    expect(applyAction(r.state, { type: 'renameProduct', productId: b!.id, name: '남양주 소주' }).error).toContain('이미');
    expect(applyAction(r.state, { type: 'renameProduct', productId: b!.id, name: '   ' }).error).toBeDefined();
    expect(applyAction(r.state, { type: 'renameProduct', productId: b!.id, name: 'x'.repeat(41) }).error).toContain('40자');
  });
});

describe('[블렌더에게 맡기기] 확인 (#238, 5차 MVP 플레이테스트)', () => {
  it('맡기기 전에 쓸 통·병 수·남는 위스키 통을 행동과 같은 계획으로 보이고, 다 쓰면·플래그십 후보면·이번 달 또 맡기면 경고한다', async () => {
    const { emptyCaskOf, delegateCheck, findTarget, blendTargets } = await import('./index');
    let s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    s.month = 40;
    s.inventory.casks = s.inventory.casks.filter((c) => !c.contents); // 이 통만 위스키 통
    s.scenario!.locked = s.scenario!.locked.filter((k) => k !== 'action:delegateBlend'); // 6년 차 해금 전이라 직접 연다
    const hex = { peat: 10, fruit: 40, floral: 30, spicy: 20, woody: 30, sweet: 40 };
    for (const [id, oak] of [['D1', 30]] as const) { // 통 하나 — 같은 맛 통이 여럿이면 블렌더는 한 통만 쓸 수 있다
      const c = emptyCaskOf(s, 'ex_bourbon_barrel'); c.id = id;
      c.contents = { id: `L${id}`, name: id, kind: 'malt', volumeL: 100, abv: 0.6, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: oak, sourced: false, costPerLPA: 10_000, batchId: `B${id}` };
      c.sampleLog = [{ month: 40, hex, sigma: 3, estQuality: 70 }];
      s.inventory.casks.push(c);
    }
    const target = blendTargets(s)[0]!;
    const opts = { name: '맡김', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' } as const;
    const chk = delegateCheck(s, target, ['D1'], 50_000, opts);
    if ('error' in chk) throw new Error(chk.error);
    expect(chk.casks.every((c) => c.empties)).toBe(true);     // 병 수가 커서 통을 다 쓴다
    expect(chk.whiskyLeft).toBe(0);
    expect(chk.warnings.some((w) => w.includes('하나도 남지 않는다'))).toBe(true);
    expect(chk.warnings.some((w) => w.includes('플래그십 후보'))).toBe(true); // 30 + (180 − 40) ≥ 144
    const before = s.inventory.casks.filter((c) => c.contents).length;
    s = applyAction(s, { type: 'delegateBlend', targetId: target.id, caskIds: ['D1'], bottles: 100, options: opts }).state;
    expect(s.inventory.casks.filter((c) => c.contents).length).toBe(before); // 100병은 통을 비우지 않는다 — 미리 보기와 같은 계획
    const again = delegateCheck(s, findTarget(s, target.id)!, ['D1'], 100, opts);
    if ('error' in again) throw new Error(again.error);
    expect(again.alreadyThisMonth.length).toBe(1);
    expect(again.warnings.some((w) => w.includes('이미 맡겼다'))).toBe(true);
  });
});

describe('자동 통입 (#239, 5차 MVP 플레이테스트)', () => {
  const setup = async () => {
    const { emptyCaskOf } = await import('./index');
    const s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    s.inventory.casks = [];
    for (const [id, fills] of [['N1', 0], ['N2', 0], ['U1', 2]] as const) { const c = emptyCaskOf(s, 'ex_bourbon_barrel'); c.id = id; c.fills = fills; s.inventory.casks.push(c); }
    s.inventory.lots = [{ id: 'T1', name: '몰트', kind: 'malt', volumeL: 1000, abv: 0.68, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 10_000, batchId: 'BT' }];
    return s;
  };
  it('끄면 아무것도 안 하고, 켜면 진행 때 빈 나무 통에 넣는다 — 새 통 먼저, 모자라면 남은 양을 메모', async () => {
    const { applyAutoFill } = await import('./index');
    const s = await setup();
    const rep = () => ({ month: s.month, notes: [] as string[], expenses: {} as Record<string, number> }) as unknown as Parameters<typeof applyAutoFill>[1];
    const r0 = rep(); applyAutoFill(s, r0);
    expect(s.inventory.casks.some((c) => c.contents)).toBe(false);
    const on = applyAction(s, { type: 'setAutoFill', settings: { prefer: 'new' } }).state;
    const r1 = rep(); applyAutoFill(on, r1);
    const filled = on.inventory.casks.filter((c) => c.contents).map((c) => c.id);
    expect(filled).toEqual(['N1', 'N2', 'U1']); // 1000L × 68% → 200L × 63.5% 통 5통 분량이라 셋 다 차고 남는다
    expect(on.inventory.casks.find((c) => c.id === 'N1')!.contents!.abv).toBeCloseTo(0.635, 6);
    expect(r1.notes.some((n) => n.includes('자동 통입 3통') && n.includes('남았다'))).toBe(true);
    expect(on.inventory.lots[0]!.volumeL).toBeLessThan(1000);
  });
  it('간격·재사용 통 먼저·원액 종류 — 설정은 정리해 저장한다', async () => {
    const { applyAutoFill, autoFillCasks } = await import('./index');
    let s = await setup();
    s = applyAction(s, { type: 'setAutoFill', settings: { everyMonths: 3, prefer: 'used', kinds: ['grain'], entryAbv: 0.635 } }).state;
    expect(s.inventory.autoFill).toEqual({ everyMonths: 3, prefer: 'used', kinds: ['grain'] });
    expect(autoFillCasks(s, s.inventory.autoFill!)[0]!.id).toBe('U1');
    s.month = 3;
    applyAutoFill(s, { month: 3, notes: [], expenses: {} } as never);
    expect(s.inventory.casks.some((c) => c.contents)).toBe(false); // 몰트뿐이라 그레인 설정이면 넣지 않는다
    s = applyAction(s, { type: 'setAutoFill', settings: { everyMonths: 3, prefer: 'used' } }).state;
    s.month = 4; applyAutoFill(s, { month: 4, notes: [], expenses: {} } as never);
    expect(s.inventory.casks.some((c) => c.contents)).toBe(false); // 3개월마다 — 4월은 아니다
    s.month = 6; applyAutoFill(s, { month: 6, notes: [], expenses: {} } as never);
    expect(s.inventory.casks.find((c) => c.id === 'U1')!.contents).toBeDefined();
    s = applyAction(s, { type: 'setAutoFill', settings: null }).state;
    expect(s.inventory.autoFill).toBeUndefined();
  });
});

describe('자동 납품은 같은 레시피 원액만 (#243, 5차 MVP 플레이테스트)', () => {
  it('병입이 레시피를 기록하고, 자동 납품은 그 레시피 탱크만 쓴다 — 기록 없는 옛 제품은 모든 탱크', async () => {
    const { autoRestockSources } = await import('./economics');
    let s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const lot = (id: string, recipeId: string) => ({ id, name: id, kind: 'soju' as const, volumeL: 300, abv: 0.6, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 10_000, batchId: `B${id}`, recipeId });
    s.inventory.lots = [lot('TA', 'RA'), lot('TB', 'RB')];
    const opts = { name: '옹기', targetAbv: 0.4, bottleMl: 700, chillFilter: true, packagingId: 'standard' } as const;
    s = applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: 'TB', liters: 50 }], options: opts }).state;
    const p = s.commerce.products.at(-1)!;
    expect(p.recipeIds).toEqual(['RB']);
    expect(autoRestockSources(s, p).map((x) => x.comp.id)).toEqual(['TB']);
    const legacy = { ...p, recipeIds: undefined };
    expect(autoRestockSources(s, legacy).map((x) => x.comp.id).sort()).toEqual(['TA', 'TB']);
    // 다른 레시피로 보충하면 합집합 — 그 뒤로는 둘 다 쓴다
    s = applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: 'TA', liters: 20 }], options: { ...opts, restockId: p.id } }).state;
    expect(s.commerce.products.find((x) => x.id === p.id)!.recipeIds).toEqual(['RA', 'RB']);
  });
});

describe('헤리티지 병입 연표 (#244, 2026-11-10 오너 요청)', () => {
  it('10년 이상 통만 연출 대상이고, 연표에 증류·통입·숙성 중 재해·통의 사고·샘플·이정표가 시간순으로 모인다', async () => {
    const { emptyCaskOf, heritageCasks, caskStory } = await import('./index');
    const s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    s.month = 150;
    const mk = (id: string, oak: number) => { const c = emptyCaskOf(s, 'ex_bourbon_barrel'); c.id = id; c.filledMonth = s.month - oak; c.contents = { id: `L${id}`, name: `몰트 → ${id}`, kind: 'malt', volumeL: 120, abv: 0.55, flavor: { cereal: 20 }, createdMonth: s.month - oak - 1, oakMonths: oak, sourced: false, costPerLPA: 10_000, batchId: `B${id}` }; s.inventory.casks.push(c); return c; };
    const old = mk('K900', 130); mk('K901', 40);
    old.sampleLog = [{ month: 60, hex: { peat: 0, fruit: 0, floral: 0, spicy: 0, woody: 0, sweet: 0 }, sigma: 5, estQuality: 70 }];
    s.events.log = [{ month: 50, title: '집중호우 침수', text: '비' }, { month: 5, title: '집중호우 침수', text: '통입 전' }];
    s.history.reports = [{ month: 80, notes: ['캐스크 K900 누수 — 6.5% 손실', '캐스크 K9000 누수'] } as never];
    expect(heritageCasks(s, [{ source: 'cask', id: 'K901', liters: 10 }])).toHaveLength(0);
    expect(heritageCasks(s, [{ source: 'cask', id: 'K900', liters: 10 }, { source: 'cask', id: 'K901', liters: 10 }]).map((c) => c.id)).toEqual(['K900']);
    const st = caskStory(s, old);
    const texts = st.lines.map((l) => l.text);
    expect(texts[0]).toContain('증류');
    expect(texts.some((t) => t.includes('통입'))).toBe(true);
    expect(texts.filter((t) => t.includes('집중호우')).length).toBe(1); // 통입 전 재해는 빠진다
    expect(texts.some((t) => t.includes('K900 누수'))).toBe(true);
    expect(texts.some((t) => t.includes('K9000'))).toBe(false);
    expect(texts.some((t) => t.includes('첫 샘플'))).toBe(true);
    expect(texts.some((t) => t === '10년 숙성')).toBe(true);
    expect(st.lines.map((l) => l.month)).toEqual([...st.lines.map((l) => l.month)].sort((a, b) => a - b));
    expect(st.angelsShare).toBeGreaterThan(0);
  });
});

describe('병입 패키징 커스터마이징 (P-PROD-38, 2026-11-10 오너 요청)', () => {
  it('기존 두 패키징은 부품 조합으로 원가·럭셔리가 예전과 같다 — 접근자도 옛 제품에 같은 값', async () => {
    const { packagingPartsCost, packagingPartsLuxury, presetChoice, packagingLuxury, packagingAppealFactor } = await import('./index');
    const { packagingCost, PACKAGING } = await import('./content/catalog');
    const { BRAND_LUXURY } = await import('./content/market');
    for (const id of ['standard', 'premium']) {
      for (const ml of [375, 500, 600, 700]) expect(packagingPartsCost(presetChoice(id), ml)).toBe(packagingCost(id, ml));
      expect(packagingPartsLuxury(presetChoice(id))).toBe(BRAND_LUXURY.packaging[id]);
      const legacy = { packagingId: id, bottleMl: 700 } as Product;
      expect(packagingLuxury(legacy)).toBe(BRAND_LUXURY.packaging[id]);
      expect(packagingAppealFactor(legacy)).toBeCloseTo(PACKAGING[id]!.luxury, 10);
    }
  });
  it('직접 고른 조합: 왁스는 스크류와 못 쓰고, 디캔터·도자기는 375~700 모두, 병입하면 원가·럭셔리가 제품에 고정된다 · 보충은 같은 패키징만', async () => {
    const { packagingError, packagingPartsCost } = await import('./index');
    expect(packagingError({ bottle: 'standard', closure: 'screw', wax: true, label: 'paper', box: 'none' }, 700)).toContain('왁스');
    for (const ml of [375, 500, 600, 700]) for (const b of ['decanter', 'stoneware'] as const) expect(packagingError({ bottle: b, closure: 'cork', label: 'foil', box: 'wooden' }, ml)).toBeNull();
    let s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    s.inventory.lots = [{ id: 'T1', name: '소주', kind: 'soju', volumeL: 300, abv: 0.6, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 10_000, batchId: 'B1', recipeId: 'R1' }];
    const pkg = { bottle: 'stoneware', closure: 'cork', wax: true, label: 'foil', box: 'none', labelColor: 'burgundy' } as const;
    const base = { name: '도자기 소주', targetAbv: 0.4, bottleMl: 375, chillFilter: true, packagingId: 'standard' } as const;
    const bad = applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: 'T1', liters: 20 }], options: { ...base, packaging: { ...pkg, closure: 'screw' } } });
    expect(bad.error).toContain('왁스');
    s = applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: 'T1', liters: 20 }], options: { ...base, packaging: pkg } }).state;
    const p = s.commerce.products.at(-1)!;
    expect(p.packaging).toMatchObject({ bottle: 'stoneware', wax: true, label: 'foil', labelColor: 'burgundy', luxury: 24, costPerBottle: packagingPartsCost(pkg, 375) });
    expect(p.packagingId).toBe('premium'); // 24점 ≥ 15 → 옛 공식용 근사
    const plain = applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: 'T1', liters: 10 }], options: { ...base, restockId: p.id } });
    expect(plain.error).toContain('패키징');
    const ok = applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: 'T1', liters: 10 }], options: { ...base, restockId: p.id, packaging: { ...pkg, labelColor: 'navy' } } });
    expect(ok.error).toBeUndefined(); // 라벨 색은 보기만 — 보충을 막지 않는다
  });
});
