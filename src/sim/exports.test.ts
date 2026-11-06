import { describe, expect, it } from 'vitest';
import { addModifier, advanceMonths, applyAction, domesticNetPerBottle, effectiveTariff, EXPORT_MARKETS, EXPORT_SALES, exportDemandFor, exportMarketsFor, exportNetPerBottle, exportShelfPrice, makeExportOffer, mulberry32, newGame, runExportContracts, runSales, updateExportAwareness, type GameState, type MonthReport, type Product } from './index';
import { applyEffects, exportAwarenessMax, exportEligible } from './index';

// 수출 확장 (#100~#104, docs/design/export.md)

const whisky = (over: Partial<Product> = {}): Product => ({ id: 'w', name: 'w', category: 'whisky', ageYears: 4, oakMonths: 48, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 70, typicity: 100, style: null, sourcedShare: 0, stockBottles: 5000, price: 40_000, unitCost: 12_000, createdMonth: 0, lastMonthSold: 0, totalSold: 0, ...over });
const report = (s: GameState): MonthReport => ({ month: s.month, revenue: 0, expenses: {}, netCash: 0, cashEnd: 0, sales: [], production: [], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] });

describe('수출 시장 확장 (#100)', () => {
  it('자국 시장은 수출 대상에서 빠진다 — 한국은 일본·대만으로, 일본은 한국·대만으로', () => {
    expect(exportMarketsFor('KR')).not.toContain('KR');
    expect(exportMarketsFor('KR')).toEqual(expect.arrayContaining(['US', 'UK', 'EU', 'CN', 'SEA', 'JP', 'TW', 'DF']));
    expect(exportMarketsFor('JP')).toEqual(expect.arrayContaining(['KR', 'TW']));
    expect(exportMarketsFor('JP')).not.toContain('JP');
  });

  it('관세 사실 (오너 확인·웹 확인): 한국 수입 위스키 20%(일본·대만산), 대만 증류주 0% + NT$250/LPA, 중국 5%, 미국 Section 301 한·일 12.5% 대만 10%', () => {
    expect(EXPORT_MARKETS.KR.tariff.JP).toBe(0.2);
    expect(EXPORT_MARKETS.KR.tariff.TW).toBe(0.2);
    expect(EXPORT_MARKETS.TW.tariff.KR).toBe(0);
    expect(EXPORT_MARKETS.TW.vat).toBe(0.05);
    expect(EXPORT_MARKETS.CN.tariff.KR).toBe(0.05);
    expect(EXPORT_MARKETS.US.tariff.KR).toBe(0.125);
    expect(EXPORT_MARKETS.US.tariff.TW).toBe(0.1);
  });

  it('한국 시장은 수입 신고가에 주세 72% × 교육세 1.3이 붙는다 (종가세)', () => {
    const m = EXPORT_MARKETS.KR;
    const p = whisky();
    const expected = ((40_000 + m.freightPerBottle.JP) * 1.2 * (1 + 0.72 * 1.3)) * m.channelMultiple * 1.1;
    expect(exportShelfPrice({ regionId: 'JP' }, p, m)).toBeCloseTo(expected, 6);
    // 매입가 비율이 낮으면 현지 소비자가도 낮다
    expect(exportShelfPrice({ regionId: 'JP' }, p, m, 0.6)).toBeLessThan(expected);
  });

  it('미국 추가 관세 이벤트(#103)는 (1 + 관세)에 곱해진다', () => {
    const s = newGame({ seed: 1 });
    const base = effectiveTariff(s, EXPORT_MARKETS.US);
    expect(base).toBeCloseTo(0.125, 9);
    addModifier(s, 'tariff:US', 1.1, 12, '미국 추가 관세');
    expect(effectiveTariff(s, EXPORT_MARKETS.US)).toBeCloseTo(1.125 * 1.1 - 1, 9);
    expect(exportShelfPrice(s, whisky(), EXPORT_MARKETS.US)).toBeGreaterThan(exportShelfPrice({ regionId: 'KR' }, whisky(), EXPORT_MARKETS.US));
  });
});

describe('수입사 계약 (#101)·인지도 후광 (#102)', () => {
  it('제안: 매입가 비율은 시장 범위 안, 시장 개척비는 처음 들어가는 시장만', () => {
    const s = newGame({ seed: 2 }); s.commerce.products = [whisky()];
    const o = makeExportOffer(s, 'US', mulberry32(3));
    const [lo, hi] = EXPORT_MARKETS.US.offer.priceFactor;
    expect(o.priceFactor).toBeGreaterThanOrEqual(lo);
    expect(o.priceFactor).toBeLessThanOrEqual(hi);
    expect(o.entryCost).toBe(EXPORT_MARKETS.US.entryCost);
    s.commerce.exportEntered = ['US'];
    expect(makeExportOffer(s, 'US', mulberry32(3)).entryCost).toBe(0);
  });

  it('제안은 팔 수 있는 재고가 있을 때만 들어온다 (영국은 3년 미만 위스키 불가)', () => {
    let s: GameState = newGame({ seed: 5 }); s.commerce.products = [whisky({ oakMonths: 24, ageYears: 2 })];
    s = advanceMonths(s, 60);
    expect((s.commerce.exportOffers ?? []).some((o) => o.marketId === 'UK')).toBe(false);
  });

  it('연 최소 물량에 못 미치면 수입사가 계약을 끝낸다 / 우리가 해지하면 마케팅 3개월 치 위약금', () => {
    const s = newGame({ seed: 2 }); s.finance.cash = 1e10; s.commerce.products = [whisky()];
    const o = { ...makeExportOffer(s, 'US', mulberry32(3)), minBottlesPerYear: 1_000_000 };
    s.commerce.exportOffers = [o];
    const t = applyAction(s, { type: 'acceptExportOffer', offerId: o.id }).state;
    const e = t.commerce.exports![0]!;
    t.month = e.readyMonth + 11;
    runExportContracts(t, report(t));
    expect(t.commerce.exports).toHaveLength(0);
    const u = applyAction(s, { type: 'acceptExportOffer', offerId: o.id }).state;
    const cash = u.finance.cash;
    const res = applyAction(u, { type: 'closeExport', marketId: 'US' });
    expect(cash - res.state.finance.cash).toBe(o.marketingPerMonth * 3);
  });

  it('국내 인지도 후광은 공항 면세점만 — 해외 시장은 0에서 시작한다', () => {
    const s = newGame({ seed: 2 }); s.commerce.awareness = 0.6; s.month = 10;
    s.commerce.exports = [
      { marketId: 'DF', openedMonth: 0, readyMonth: 0, awareness: 0, totalBottles: 0 },
      { marketId: 'US', openedMonth: 0, readyMonth: 0, awareness: 0.02, totalBottles: 0, marketingPerMonth: EXPORT_MARKETS.US.monthlyCost },
    ];
    updateExportAwareness(s);
    expect(s.commerce.exports[0]!.awareness).toBeCloseTo(0.6, 6);
    expect(s.commerce.exports[1]!.awareness).toBeLessThan(0.05);
  });

  it('마케팅 분담이 클수록 현지 인지도가 빨리 오른다', () => {
    const mk = (marketing: number) => {
      const s = newGame({ seed: 2 }); s.month = 10;
      s.commerce.exports = [{ marketId: 'US', openedMonth: 0, readyMonth: 0, awareness: 0.02, totalBottles: 0, marketingPerMonth: marketing }];
      for (let i = 0; i < 12; i++) updateExportAwareness(s);
      return s.commerce.exports[0]!.awareness;
    };
    expect(mk(EXPORT_MARKETS.US.monthlyCost * 1.5)).toBeGreaterThan(mk(EXPORT_MARKETS.US.monthlyCost * 0.5));
  });
});

describe('재고 배분 (#109)·수출가 (#106·#108)', () => {
  const setup = (stock: number, priceFactor = 0.95) => {
    const s = newGame({ seed: 7 }); s.commerce.awareness = 0.6; s.month = 60; s.commerce.products = [whisky({ stockBottles: stock })];
    s.commerce.exports = [{ marketId: 'DF', openedMonth: 0, readyMonth: 0, awareness: 0.6, totalBottles: 0, priceFactor, marketingPerMonth: 2_000_000 }];
    return s;
  };
  const exported = (r: ReturnType<typeof runSales>) => r.exports.reduce((t, x) => t + x.bottles, 0);

  it('재고가 모자라면 병당 순수입이 높은 판로부터 채운다 — 수출가가 낮으면 국내, 높으면 수출 먼저', () => {
    const s = setup(5, 0.8);
    expect(exportNetPerBottle(s, s.commerce.products[0]!, EXPORT_MARKETS.DF, 0.8)).toBeLessThan(domesticNetPerBottle(s, s.commerce.products[0]!));
    const low = runSales(s, mulberry32(1), 6);
    expect(low.results[0]!.demandBottles).toBeGreaterThan(5);
    expect(low.results[0]!.bottles).toBe(5);
    expect(exported(low)).toBe(0);
    // 수출가를 ×1.5로 올리면 수출이 먼저 채워지고 국내는 남는 만큼만
    const high = runSales(setup(5, 1.5), mulberry32(1), 6);
    expect(exported(high)).toBe(5);
    expect(high.results[0]?.bottles ?? 0).toBe(0);
    // 재고가 넉넉하면 둘 다 수요만큼 나간다
    const big = runSales(setup(100_000), mulberry32(1), 6);
    expect(exported(big)).toBeGreaterThan(0);
    expect(big.results[0]!.bottles).toBe(big.results[0]!.demandBottles);
  });

  it('수출가 조정(#108): 계약 뒤 0.5~3 사이로, 올리면 현지 수요가 준다', () => {
    const s = newGame({ seed: 2 }); s.finance.cash = 1e10; s.commerce.products = [whisky()];
    const o = makeExportOffer(s, 'US', mulberry32(3));
    s.commerce.exportOffers = [o];
    let t = applyAction(s, { type: 'acceptExportOffer', offerId: o.id }).state;
    expect(t.commerce.exports![0]!.priceFactor).toBe(o.priceFactor);
    t = applyAction(t, { type: 'setExportPrice', marketId: 'US', priceFactor: 9 }).state;
    expect(t.commerce.exports![0]!.priceFactor).toBe(3);
    const e = { ...t.commerce.exports![0]!, readyMonth: 0, awareness: 0.2 };
    expect(exportDemandFor(t, t.commerce.products[0]!, { ...e, priceFactor: 1.5 }, 1)).toBeLessThan(exportDemandFor(t, t.commerce.products[0]!, { ...e, priceFactor: 1 }, 1));
  });

  it('수요 비율 배분(#95 원래 규칙)으로 바꾸면 모자란 재고를 수출과 나눈다 — 실험용 스위치', () => {
    EXPORT_SALES.allocation = 'proportional';
    try {
      const r = runSales(setup(200), mulberry32(1), 6);
      expect(exported(r)).toBeGreaterThan(0);
      expect(r.results[0]!.bottles).toBeLessThan(200);
    } finally {
      EXPORT_SALES.allocation = 'margin';
    }
  });

  it('수입사 제안 수출가는 출고가에 가깝다 — 수입상 마진은 유통 배수에 이미 들어 있다 (#106)', () => {
    for (const id of exportMarketsFor('KR')) {
      const [lo, hi] = EXPORT_MARKETS[id].offer.priceFactor;
      expect(lo).toBeGreaterThanOrEqual(0.85);
      expect(hi).toBeLessThanOrEqual(1);
    }
  });
});

// ───────────── 수출·해외 명성 (결정 #144 — sim.test.ts에서 옮겨 왔다) ─────────────


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
