// F3 판매 지점 연결(MKT) — 국내·면세·수출(runSales) · 대형 유통 납품(fulfillRetail) · 핸드필(runHandfill, 결정 #318)이 sellFromLots로 사건을 쌓는다.
// 로트가 없는 제품은 무동작(연결 전·옛 세이브) — 출력 불변의 근거
import { describe, expect, it } from 'vitest';
import { fulfillRetail } from './deals';
import { recordHandfillSale, runHandfill } from './handfill';
import { checkInvariants } from './invariants';
import { addLot, lotsOf } from './lots';
import { runSales } from './market';
import { houseBrand } from './brands';
import { newGame } from './newGame';
import { mulberry32 } from './rng';
import type { Cask, MonthReport, Product } from './types';

const product = (over: Partial<Product> = {}): Product => ({ id: 'p', name: 'p', category: 'whisky', ageYears: 4, oakMonths: 48, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 70, typicity: 80, style: null, sourcedShare: 0, stockBottles: 300, price: 60_000, unitCost: 20_000, createdMonth: 0, lastMonthSold: 0, totalSold: 0, ...over });
const report = (month: number, visitors = 0): MonthReport => ({ month, revenue: 0, expenses: {}, notes: [], visitors } as unknown as MonthReport);

describe('F3 판매 지점 — 국내·면세·수출 (runSales)', () => {
  const setup = () => { const s = newGame({ seed: 7, region: 'KR' }); s.month = 60; houseBrand(s).awareness = 0.6; s.commerce.products = [product()]; return s; };
  it('로트가 없으면 사건도 로트도 없다(연결 전·옛 세이브) — 판매 결과는 같다', () => {
    const a = setup(); const b = setup();
    const ra = runSales(a, mulberry32(1), 6);
    const rep = report(60); const rb = runSales(b, mulberry32(1), 6, rep);
    expect(rb.results).toEqual(ra.results);
    expect(rep.saleEvents).toBeUndefined();
    expect(b.commerce.lots).toBeUndefined();
  });
  it('로트가 있으면 FIFO로 빠지고 사건이 쌓인다 — 합 = 판 병, 남은 로트 합 = 남은 재고', () => {
    const s = setup();
    addLot(s, 'p', 100, { month: 10, eligibleAtBottling: false });
    addLot(s, 'p', 200, { month: 30, eligibleAtBottling: true });
    const rep = report(60);
    const r = runSales(s, mulberry32(1), 6, rep);
    const sold = r.results[0]!.bottles;
    expect(sold).toBeGreaterThan(0);
    const ev = rep.saleEvents ?? [];
    expect(ev.reduce((t, e) => t + e.bottles, 0)).toBe(sold);
    expect(ev[0]).toMatchObject({ productId: 'p', lotId: 'p:10:0', kind: 'domestic', settlement: 'cash', unitPrice: 60_000, channel: 'retail', eligibleAtSale: false, month: 60 });
    expect(lotsOf(s).reduce((t, l) => t + l.bottles, 0)).toBe(s.commerce.products[0]!.stockBottles);
    expect(checkInvariants(s).errors).toEqual([]);
  });
  it('수출 — 대금 지급 기한이 있으면 receivable, 단가는 FOB(출고가 × 배수)', () => {
    const s = setup();
    s.commerce.exports = [{ marketId: 'DF', openedMonth: 0, readyMonth: 0, awareness: 0.6, totalBottles: 0, priceFactor: 1.5, marketingPerMonth: 2_000_000, paymentDelay: 3 }];
    addLot(s, 'p', 300, { month: 20 });
    const rep = report(60);
    const r = runSales(s, mulberry32(1), 6, rep);
    const exp = (rep.saleEvents ?? []).filter((e) => e.kind === 'export');
    expect(exp.reduce((t, e) => t + e.bottles, 0)).toBe(r.exports.reduce((t, x) => t + x.bottles, 0));
    expect(exp[0]).toMatchObject({ settlement: 'receivable', unitPrice: 90_000 });
  });
});

describe('F3 판매 지점 — 대형 유통 납품 (fulfillRetail)', () => {
  it('domestic · retail_deal · receivable · 출고가 × 비율', () => {
    const s = newGame({ seed: 7, region: 'KR' }); s.month = 60;
    s.commerce.products = [product({ stockBottles: 1000 })];
    addLot(s, 'p', 1000, { month: 40 });
    s.commerce.retailContracts = [{ id: 'U1', partner: '유통', category: 'whisky', bottlesPerMonth: 300, priceFactor: 0.8, termMonths: 12, paymentDelay: 2, penaltyPerBottle: 1000, startMonth: 60, monthsDone: 0, delivered: 0, shortfall: 0 }];
    const rep = report(60);
    fulfillRetail(s, rep);
    expect(rep.saleEvents).toEqual([expect.objectContaining({ productId: 'p', lotId: 'p:40:0', bottles: 300, kind: 'domestic', channel: 'retail_deal', settlement: 'receivable', unitPrice: 48_000 })]);
    expect(lotsOf(s)[0]!.bottles).toBe(700);
    expect(s.commerce.products[0]!.stockBottles).toBe(700);
  });
});

describe('F3 판매 지점 — 핸드필 (runHandfill, #318 cellar_door)', () => {
  // 통 틀은 샌드박스 브로커 매물에서 빌린다. 지점 25(브로커 매입 원장) 뒤로는 매물 통에 원장이 붙어 있어, volumeL을 바꾸면 R2가 어긋난다 → `components: undefined`로 뗀다(원장 없는 통 = 합성 경로)
  it('통 하나로 된 로트를 만들고 바로 다 판다 — 사건 cellar_door, 로트는 남지 않는다, 불변식 오류 0', () => {
    const s = newGame({ seed: 3, region: 'KR' }); s.month = 150;
    const base = s.b2b.brokerOffers[0]!.cask;
    s.inventory.casks = [{ ...base, id: 'H1', handfill: true, contents: { ...base.contents!, oakMonths: 150, sourced: false, volumeL: 200, components: undefined } } as Cask];
    s.production.equipment.push({ id: 'HZ', catalogId: 'handfill_zone', readyMonth: 0 });
    const rep = report(150, 100);
    runHandfill(s, rep);
    const ev = rep.saleEvents ?? [];
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ productId: 'handfill:H1', kind: 'cellar_door', settlement: 'cash', month: 150 });
    expect(ev[0]!.bottles).toBeGreaterThan(0);
    expect(ev[0]!.unitPrice).toBeGreaterThan(0);
    expect(lotsOf(s)).toEqual([]);
    expect(checkInvariants(s).errors).toEqual([]);
  });
  it('가격이 0이면 로트를 만들지 않는다 — 가상 제품 로트가 남아 "제품 없음" 오류가 되지 않게 (ARCH #487 사후 검토)', () => {
    const s = newGame({ seed: 3, region: 'KR' }); s.month = 150;
    const base = s.b2b.brokerOffers[0]!.cask;
    const cask = { ...base, id: 'H2', handfill: true, contents: { ...base.contents!, oakMonths: 150, sourced: false, volumeL: 200, components: undefined } } as Cask & { contents: NonNullable<Cask['contents']> };
    s.inventory.casks = [cask];
    const rep = report(150, 100);
    recordHandfillSale(s, rep, cask, 10, 0);
    expect(rep.saleEvents).toBeUndefined();
    expect(lotsOf(s)).toEqual([]);
    expect(checkInvariants(s).errors).toEqual([]);
    recordHandfillSale(s, rep, cask, 10, 250_000);
    expect(rep.saleEvents).toHaveLength(1);
    expect(lotsOf(s)).toEqual([]);
  });
});
