import { describe, expect, it } from 'vitest';
import { mergeIntoTank, sameTank, HEX_AXES, basePresetOf, craftPresets, flavorProfile, leverEffects, leverSummary, newScenarioGame, presetAsRecipe, previewBatch, type GameState, type Recipe, advanceMonths, applyAction, bulkValuePerLPA, categorize, evaporate, heartsFraction, matureCask, newGame, previewBlend, sizeFactor, simulateBatch, stillDefOf, volumeDiscounts, windowFraction, type Cask, type SpiritLot, appeal, type Product, caskStorageCost, fermentDaysAt, waterPermitCap } from './index';
import { AGING_HORIZONS, recipeEconomics, STANDARD_BOTTLE, stockMonthsAfter, tankFillNeed, whiskyAnnualPace, whiskySupplyForecast } from './economics';
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

describe('위스키 공급 전망·병입 재고 경고 (P-PROD-12, 1차 MVP 플레이테스트)', () => {
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
