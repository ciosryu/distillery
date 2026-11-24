// [제안 P-MKT-42] 납품 제안 전망 · 파기까지 남은 병 — 화면 계산 함수(규칙 불변)
import { describe, expect, it } from 'vitest';
import { RETAIL_BREAK_MONTHS, retailBreakRemaining, retailOfferOutlook } from './deals';
import type { GameState } from './types';

const prod = (id: string, category: string, stockBottles: number, dutyFreeOnly = false) => ({ id, category, stockBottles, dutyFreeOnly });
const rep = (sales: [string, number][]) => ({ sales: sales.map(([productId, bottles]) => ({ productId, bottles })) });
const state = (products: ReturnType<typeof prod>[], reports: ReturnType<typeof rep>[]) =>
  ({ commerce: { products }, history: { reports } }) as unknown as Pick<GameState, 'commerce' | 'history'>;

describe('retailOfferOutlook — 받기 전에 "채울 수 있나"', () => {
  it('그 범주 재고(면세 한정판 제외) · 재고 개월치 · 한 달 미납 위약금 — 판매 속도는 화면이 categoryMonthlySales로 따로 본다', () => {
    const s = state(
      [prod('P1', 'soju_distilled', 900), prod('P2', 'soju_distilled', 300), prod('P3', 'soju_distilled', 5000, true), prod('W', 'whisky', 400)],
      [rep([['P1', 9999]]), rep([['P1', 1000], ['W', 50]]), rep([['P1', 1200], ['P2', 300]]), rep([['P2', 500], ['W', 70]])],
    );
    const o = retailOfferOutlook(s, { category: 'soju_distilled', bottlesPerMonth: 600, penaltyPerBottle: 780 });
    expect(o.stock).toBe(1200); // P3(면세 한정판)은 납품에 쓰이지 않는다
    expect('recentSales' in o).toBe(false); // 판매 속도를 두 곳에서 세지 않는다(PROD SALES_LOOKBACK 하나)
    expect(o.coverMonths).toBe(2);
    expect(o.penaltyPerMonth).toBe(468_000);
  });
  it('재고가 없으면 0개월치', () => {
    const o = retailOfferOutlook(state([], []), { category: 'whisky', bottlesPerMonth: 300, penaltyPerBottle: 7680 });
    expect(o).toEqual({ stock: 0, coverMonths: 0, penaltyPerMonth: 2_304_000 });
  });
});

describe('retailBreakRemaining — 파기까지 남은 미납', () => {
  it(`월 물량 × ${RETAIL_BREAK_MONTHS} − 누적 미납, 0 밑으로 안 간다`, () => {
    expect(retailBreakRemaining({ bottlesPerMonth: 600, shortfall: 0 })).toBe(1200);
    expect(retailBreakRemaining({ bottlesPerMonth: 600, shortfall: 600 })).toBe(600);
    expect(retailBreakRemaining({ bottlesPerMonth: 1000, shortfall: 1762 })).toBe(238); // 6차 판 계약 C 128개월 뒤
    expect(retailBreakRemaining({ bottlesPerMonth: 300, shortfall: 900 })).toBe(0);
  });
});

describe('refreshDeals — 받지 않고 만료된 납품 제안을 메모로 (#334 7차 관찰)', () => {
  it('만료되는 달에 메모 한 줄 · 아직 남은 제안은 메모 없음 · report가 없으면 메모 없이 지운다', async () => {
    const { newScenarioGame } = await import('./newScenario');
    const { refreshDeals } = await import('./deals');
    const { rngFor } = await import('./rng');
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const offer = (id: string, expiresMonth: number) => ({ id, partner: '가온마트', category: 'soju_distilled' as const, bottlesPerMonth: 1000, priceFactor: 0.8, termMonths: 12, paymentDelay: 2, penaltyPerBottle: 780, expiresMonth });
    s.commerce.retailOffers = [offer('U1', s.month), offer('U2', s.month + 2)];
    const report = { notes: [] as string[] } as unknown as Parameters<typeof refreshDeals>[2] & { notes: string[] };
    refreshDeals(s, rngFor(s.seed, s.month, 'deals'), report);
    expect(report.notes).toEqual(['가온마트 납품 제안 만료 — 증류식 소주 1,000병/월 (받지 않음)']);
    expect(s.commerce.retailOffers.map((o) => o.id)).toContain('U2');
    expect(s.commerce.retailOffers.map((o) => o.id)).not.toContain('U1');
    s.commerce.retailOffers = [offer('U3', s.month)];
    refreshDeals(s, rngFor(s.seed, s.month, 'deals'));
    expect(s.commerce.retailOffers.map((o) => o.id)).not.toContain('U3');
  });
});

describe('retailDrawOrder — 납품이 재고를 가져가는 순서 (화면 확인 문구와 fulfillRetail이 같이 씀)', () => {
  it('같은 범주 · 재고 있음 · 면세 한정판 아님, 만든 달 순', async () => {
    const { retailDrawOrder } = await import('./deals');
    const mk = (id: string, category: string, stockBottles: number, createdMonth: number, dutyFreeOnly = false) => ({ id, category, stockBottles, createdMonth, dutyFreeOnly });
    const s = { commerce: { products: [mk('B', 'whisky', 273, 141), mk('A', 'whisky', 553, 83), mk('Z', 'whisky', 0, 10), mk('D', 'whisky', 90, 5, true), mk('S', 'soju_distilled', 999, 1)] } } as unknown as Parameters<typeof retailDrawOrder>[0];
    expect(retailDrawOrder(s, 'whisky').map((p) => p.id)).toEqual(['A', 'B']);
  });
});

describe('[결정 #337] ① 제안 물량 ≤ 판매 속도 · ② 10년↑ 기본 납품 제외 — v16 캠페인만', () => {
  const rep2 = (sales: [string, number][]) => ({ sales: sales.map(([productId, bottles]) => ({ productId, bottles })) });
  const camp = (products: object[], reports: object[], over: object = {}) =>
    ({ rulesVersion: 'v16', scenario: {}, commerce: { products, productArchive: [] }, history: { reports }, ...over }) as unknown as GameState;

  it('retailRules337: v16 캠페인만 켜진다 — 옛 판 · 샌드박스(v16이지만 시나리오 없음)는 꺼짐', async () => {
    const { retailRules337 } = await import('./deals');
    expect(retailRules337({ rulesVersion: 'v16', scenario: {} } as unknown as GameState)).toBe(true);
    expect(retailRules337({ rulesVersion: 'v16' } as unknown as GameState)).toBe(false);
    expect(retailRules337({ scenario: {} } as unknown as GameState)).toBe(false); // rulesVersion 없음 = legacy-v15
  });

  it('retailVolumesFor: 판매 속도(품절 달 제외) 이하 물량만 · 판매 기록 없으면 없음 · 옛 판은 셋 다', async () => {
    const { retailVolumesFor, RETAIL_VOLUMES } = await import('./deals');
    const w = { id: 'W', category: 'whisky' };
    // 7차 판처럼 위스키 월 265병 → 300도 못 받는다
    expect(retailVolumesFor(camp([w], [rep2([['W', 265]]), rep2([['W', 265]]), rep2([['W', 265]])]), 'whisky')).toEqual([]);
    // 품절 달(0)은 빼고 평균: 700 · 0 · 700 → 700 → 300 · 600
    expect(retailVolumesFor(camp([w], [rep2([['W', 700]]), rep2([]), rep2([['W', 700]])]), 'whisky')).toEqual([300, 600]);
    expect(retailVolumesFor(camp([w], [rep2([['W', 1000]])]), 'whisky')).toEqual([300, 600, 1000]);
    expect(retailVolumesFor(camp([w], []), 'whisky')).toEqual([]);
    expect(retailVolumesFor(camp([w], [], { rulesVersion: undefined }), 'whisky')).toEqual([...RETAIL_VOLUMES]);
  });

  it('retailDrawEligible: 면세 한정판은 늘 아니다 · 「납품 제외/넣기」가 먼저 · 안 골랐으면 v16 캠페인은 10년(120개월)↑ 제외', async () => {
    const { retailDrawEligible, RETAIL_PREMIUM_OAK_MONTHS } = await import('./deals');
    const c = camp([], []); const legacy = camp([], [], { rulesVersion: undefined });
    expect(RETAIL_PREMIUM_OAK_MONTHS).toBe(120);
    expect(retailDrawEligible(c, { oakMonths: 119 })).toBe(true);
    expect(retailDrawEligible(c, { oakMonths: 120 })).toBe(false);
    expect(retailDrawEligible(c, { oakMonths: 150, retailDraw: true })).toBe(true);
    expect(retailDrawEligible(c, { oakMonths: 36, retailDraw: false })).toBe(false);
    expect(retailDrawEligible(c, { oakMonths: 36, dutyFreeOnly: true, retailDraw: true })).toBe(false);
    expect(retailDrawEligible(legacy, { oakMonths: 150 })).toBe(true); // 옛 판은 다 낸다(바이트 동일)
    expect(retailDrawEligible(legacy, { oakMonths: 36, retailDraw: false })).toBe(false); // 직접 고른 것은 어느 판이든 따른다
  });

  it('makeRetailOffer: v16 캠페인은 맞는 물량이 있는 범주만, 없으면 null · 10년↑만 있는 범주도 후보가 아니다', async () => {
    const { makeRetailOffer } = await import('./deals');
    const { mulberry32 } = await import('./rng');
    const { newScenarioGame } = await import('./newScenario');
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const prod = (id: string, category: string, oakMonths: number | undefined, stockBottles = 2000) => ({ id, name: id, category, oakMonths, stockBottles, createdMonth: 1 }) as unknown as GameState['commerce']['products'][number];
    s.commerce.products = [prod('W', 'whisky', 150), prod('S', 'soju_distilled', undefined)];
    s.history.reports = [rep2([['W', 2000], ['S', 400]])] as unknown as GameState['history']['reports'];
    for (let i = 0; i < 20; i++) {
      const o = makeRetailOffer(s, mulberry32(i))!;
      expect(o.category).toBe('soju_distilled'); // 12년 위스키는 납품에 못 나가므로 후보가 아니다
      expect(o.bottlesPerMonth).toBe(300); // 소주 판매 400 → 300만
    }
    s.history.reports = [rep2([['W', 2000], ['S', 200]])] as unknown as GameState['history']['reports'];
    expect(makeRetailOffer(s, mulberry32(1))).toBeNull();
  });

  it('retailOfferOutlook 재고는 납품이 실제로 가져갈 수 있는 것만(10년↑ 기본 제외)', async () => {
    const c = camp([{ id: 'A', category: 'whisky', stockBottles: 500, oakMonths: 40, createdMonth: 1 }, { id: 'B', category: 'whisky', stockBottles: 273, oakMonths: 132, createdMonth: 2 }], []);
    expect(retailOfferOutlook(c, { category: 'whisky', bottlesPerMonth: 1000, penaltyPerBottle: 7680 }).stock).toBe(500);
  });
});

describe('setProductRetail — 제품별 납품 넣기 · 빼기 (#337 ② (가))', () => {
  it('include true · false는 필드로, 없으면 지운다(기본 규칙)', async () => {
    const { applyAction } = await import('./index');
    const { newScenarioGame } = await import('./newScenario');
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    s.commerce.products = [{ id: 'P', name: '김포 11년', category: 'whisky', oakMonths: 132, stockBottles: 273, createdMonth: 1 } as unknown as GameState['commerce']['products'][number]];
    const a = applyAction(s, { type: 'setProductRetail', productId: 'P', include: true });
    expect(a.state.commerce.products[0]!.retailDraw).toBe(true);
    const b = applyAction(a.state, { type: 'setProductRetail', productId: 'P' });
    expect('retailDraw' in b.state.commerce.products[0]!).toBe(false);
    expect(applyAction(s, { type: 'setProductRetail', productId: 'X', include: false }).error).toBeTruthy();
  });
});

describe('[결정 #341] 납품 단가의 판매가 상한 — 기준가 × 4 (v16 캠페인)', () => {
  const whisky = (price: number) => ({ id: 'P', name: '시험 몰트', category: 'whisky', ageYears: 5, oakMonths: 60, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 70, typicity: 70, style: null, sourcedShare: 0, stockBottles: 3000, price, unitCost: 20000, createdMonth: 90, lastMonthSold: 0, totalSold: 0 }) as unknown as GameState['commerce']['products'][number];
  const contract = { id: 'U1', partner: '가온마트', category: 'whisky' as const, bottlesPerMonth: 1000, priceFactor: 0.8, termMonths: 12, paymentDelay: 2, penaltyPerBottle: 7680, startMonth: 99, monthsDone: 1, delivered: 1000, shortfall: 0 };
  const run = async (price: number, legacy = false) => {
    const { newScenarioGame } = await import('./newScenario');
    const { advanceMonth } = await import('./step');
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 5 });
    if (legacy) s.rulesVersion = 'legacy-v15';
    s.month = 100; s.commerce.products = [whisky(price)]; s.commerce.retailContracts = [{ ...contract }];
    return advanceMonth(s).history.reports.at(-1)!.retailDealRevenue ?? 0;
  };
  it('정상 값(기준가 × 3 이하)은 그대로 판매가 × 0.8 — 7차 판 오너 최고 배수 3.19', async () => {
    const { retailPriceBasis } = await import('./deals');
    const { newScenarioGame } = await import('./newScenario');
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 5 });
    const b = retailPriceBasis(s, whisky(1));
    expect(b.cap).toBeGreaterThan(100_000); // 5년 · 품질 70 위스키 기준가의 4배
    expect(retailPriceBasis(s, whisky(Math.floor(b.cap * 0.75))).capped).toBe(false);
    expect(await run(60_000)).toBe(48_000_000);
  });
  it('값을 터무니없이 올려도 납품 단가는 기준가 × 4 × 0.8까지 — 1,000만 원이면 80억이 아니라 상한', async () => {
    const { retailPriceBasis } = await import('./deals');
    const { newScenarioGame } = await import('./newScenario');
    const cap = retailPriceBasis(newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 5 }), whisky(1)).cap;
    expect(await run(10_000_000)).toBe(Math.round(1000 * cap * 0.8));
  });
  it('옛 판은 그대로(판매가 × 0.8, 상한 없음 — 바이트 동일 원칙)', async () => {
    expect(await run(10_000_000, true)).toBe(8_000_000_000);
  });
});

describe('검토 D1 — 납품 단가 상한은 공개 정보로만 센다 (F5d 품질 누수, STATUS 2026-11-24)', () => {
  // 검토 재현: 공개 추정 60 ±8을 고정하고 숨은 품질만 40 → 80으로 바꾸면, 고치기 전에는 표시 단가(B2B 화면 = retailPriceBasis)와
  // 정산(fulfillRetail)이 121,280 → 171,520원으로 갈렸다. 공개 정보가 같은 두 상태는 화면 표시도 실제 정산도 같아야 한다
  const known = { est: 60, sigma: 8, reviews: 0, month: 90 };
  const whisky = (quality: number, price: number) => ({ id: 'P', name: '시험 몰트', category: 'whisky', ageYears: 5, oakMonths: 60, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality, qualityKnown: { ...known }, typicity: 70, style: null, sourcedShare: 0, stockBottles: 3000, price, unitCost: 20000, createdMonth: 90, lastMonthSold: 0, totalSold: 0 }) as unknown as GameState['commerce']['products'][number];
  const contract = { id: 'U1', partner: '가온마트', category: 'whisky' as const, bottlesPerMonth: 1000, priceFactor: 0.8, termMonths: 12, paymentDelay: 2, penaltyPerBottle: 7680, startMonth: 99, monthsDone: 1, delivered: 1000, shortfall: 0 };
  const game = async (quality: number, price: number) => {
    const { newScenarioGame } = await import('./newScenario');
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 5 });
    s.month = 100; s.commerce.products = [whisky(quality, price)]; s.commerce.retailContracts = [{ ...contract }];
    return s;
  };
  const settle = async (quality: number, price: number) => {
    const { advanceMonth } = await import('./step');
    return advanceMonth(await game(quality, price)).history.reports.at(-1)!.retailDealRevenue ?? 0;
  };
  it('화면 상한 — 숨은 품질 40 · 80에서 같다', async () => {
    const { retailPriceBasis } = await import('./deals');
    const lo = retailPriceBasis(await game(40, 10_000_000), whisky(40, 10_000_000));
    const hi = retailPriceBasis(await game(80, 10_000_000), whisky(80, 10_000_000));
    expect(lo.capped && hi.capped).toBe(true);
    expect(hi.cap).toBe(lo.cap);
  });
  it('실제 정산 — 숨은 품질 40 · 80에서 같다(상한에 걸린 값)', async () => {
    expect(await settle(80, 10_000_000)).toBe(await settle(40, 10_000_000));
  });
  it('상한은 판매 화면 기준가(currentSuggested — 아는 품질)의 4배와 같다', async () => {
    const { retailPriceBasis, RETAIL_PRICE_CAP_MULT } = await import('./deals');
    const { currentSuggested } = await import('./economics');
    const s = await game(80, 10_000_000);
    const p = s.commerce.products[0]!;
    expect(retailPriceBasis(s, p).cap).toBe(Math.round(currentSuggested(s, p) * RETAIL_PRICE_CAP_MULT));
  });
  it('아는 품질이 없는 제품(옛 제품 · 공개)은 참 품질 그대로 — 지금 값 유지', async () => {
    const { retailPriceBasis } = await import('./deals');
    const s = await game(70, 10_000_000);
    const pub = { ...whisky(70, 10_000_000) }; delete (pub as { qualityKnown?: unknown }).qualityKnown;
    const est70 = { ...whisky(70, 10_000_000), qualityKnown: { ...known, est: 70 } } as typeof pub;
    expect(retailPriceBasis(s, pub).cap).toBe(retailPriceBasis(s, est70).cap);
  });
});

describe('소매 처리 역량 전망 · 재고 적체 개월 (9차 판 64개월째 MKT 분석 · 화면만)', () => {
  const withProduct = async (trueQuality: number) => {
    const { newScenarioGame } = await import('./newScenario');
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 5, rules: 'v16' });
    s.month = 40;
    s.commerce.products.push({
      id: 'P1', name: '싱글 몰트 1', category: 'whisky', ageYears: 3, oakMonths: 36, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard',
      flavor: {}, quality: trueQuality, typicity: 70, style: null, sourcedShare: 0, stockBottles: 4000, price: 60_000, unitCost: 20_000,
      createdMonth: 30, lastMonthSold: 30, totalSold: 300, qualityKnown: { est: 60, sigma: 8, reviews: 3, month: 39 },
    } as GameState['commerce']['products'][number]);
    return s;
  };
  it('12달 · 첫 칸은 다음 결산 달 · 역량은 retailCapacityCases', async () => {
    const { retailCapacityOutlook } = await import('./market');
    const { retailCapacityCases } = await import('./retail');
    const { calendar } = await import('./util');
    const s = await withProduct(60);
    const o = retailCapacityOutlook(s, 12);
    expect(o).toHaveLength(12);
    expect(o[0]!.monthOfYear).toBe(calendar(s).monthOfYear);
    expect(o.every((x) => x.capacity === retailCapacityCases(s))).toBe(true);
  });
  it('공개 정보가 같고 참 품질만 다르면 같다(I2 — 아는 정보로만 센다)', async () => {
    const { retailCapacityOutlook } = await import('./market');
    expect(retailCapacityOutlook(await withProduct(80))).toEqual(retailCapacityOutlook(await withProduct(40)));
  });
  it('overhangMonths — overhangFactor와 같은 셈(재고 ÷ 판매 평균), 출시 6개월 전 · 평균 없으면 null', async () => {
    const { overhangFactor, overhangMonths } = await import('./retail');
    const p = { stockBottles: 2400, salesEma: 100, createdMonth: 0 };
    expect(overhangMonths(p, 12)).toBe(24);
    expect(overhangFactor(p, 12)).toBeCloseTo(Math.max(0.6, Math.sqrt(6 / 24)), 9);
    expect(overhangMonths({ ...p, createdMonth: 8 }, 12)).toBeNull();
    expect(overhangMonths({ stockBottles: 10, createdMonth: 0 }, 12)).toBeNull();
  });
});
