import { describe, expect, it } from 'vitest';
import {
  addModifier, advanceMonths, applyAction, effectiveTariff, EXPORT_MARKETS, exportMarketsFor, exportShelfPrice, makeExportOffer, mulberry32, newGame, runExportContracts, updateExportAwareness,
  type GameState, type MonthReport, type Product,
} from './index';

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
    const s = { ...newGame({ seed: 2 }), products: [whisky()] };
    const o = makeExportOffer(s, 'US', mulberry32(3));
    const [lo, hi] = EXPORT_MARKETS.US.offer.priceFactor;
    expect(o.priceFactor).toBeGreaterThanOrEqual(lo);
    expect(o.priceFactor).toBeLessThanOrEqual(hi);
    expect(o.entryCost).toBe(EXPORT_MARKETS.US.entryCost);
    s.exportEntered = ['US'];
    expect(makeExportOffer(s, 'US', mulberry32(3)).entryCost).toBe(0);
  });

  it('제안은 팔 수 있는 재고가 있을 때만 들어온다 (영국은 3년 미만 위스키 불가)', () => {
    let s: GameState = { ...newGame({ seed: 5 }), products: [whisky({ oakMonths: 24, ageYears: 2 })] };
    s = advanceMonths(s, 60);
    expect((s.exportOffers ?? []).some((o) => o.marketId === 'UK')).toBe(false);
  });

  it('연 최소 물량에 못 미치면 수입사가 계약을 끝낸다 / 우리가 해지하면 마케팅 3개월 치 위약금', () => {
    const s = { ...newGame({ seed: 2 }), cash: 1e10, products: [whisky()] };
    const o = { ...makeExportOffer(s, 'US', mulberry32(3)), minBottlesPerYear: 1_000_000 };
    s.exportOffers = [o];
    const t = applyAction(s, { type: 'acceptExportOffer', offerId: o.id }).state;
    const e = t.exports![0]!;
    t.month = e.readyMonth + 11;
    runExportContracts(t, report(t));
    expect(t.exports).toHaveLength(0);
    const u = applyAction(s, { type: 'acceptExportOffer', offerId: o.id }).state;
    const cash = u.cash;
    const res = applyAction(u, { type: 'closeExport', marketId: 'US' });
    expect(cash - res.state.cash).toBe(o.marketingPerMonth * 3);
  });

  it('국내 인지도 후광은 공항 면세점만 — 해외 시장은 0에서 시작한다', () => {
    const s = { ...newGame({ seed: 2 }), awareness: 0.6, month: 10 };
    s.exports = [
      { marketId: 'DF', openedMonth: 0, readyMonth: 0, awareness: 0, totalBottles: 0 },
      { marketId: 'US', openedMonth: 0, readyMonth: 0, awareness: 0.02, totalBottles: 0, marketingPerMonth: EXPORT_MARKETS.US.monthlyCost },
    ];
    updateExportAwareness(s);
    expect(s.exports[0]!.awareness).toBeCloseTo(0.6, 6);
    expect(s.exports[1]!.awareness).toBeLessThan(0.05);
  });

  it('마케팅 분담이 클수록 현지 인지도가 빨리 오른다', () => {
    const mk = (marketing: number) => {
      const s = { ...newGame({ seed: 2 }), month: 10 };
      s.exports = [{ marketId: 'US', openedMonth: 0, readyMonth: 0, awareness: 0.02, totalBottles: 0, marketingPerMonth: marketing }];
      for (let i = 0; i < 12; i++) updateExportAwareness(s);
      return s.exports[0]!.awareness;
    };
    expect(mk(EXPORT_MARKETS.US.monthlyCost * 1.5)).toBeGreaterThan(mk(EXPORT_MARKETS.US.monthlyCost * 0.5));
  });
});
