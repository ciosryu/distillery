// F4 v16 대응 — MKT 판매 지점이 새 캠페인에서 승리(progress.win)로 이어지는지 (결정 #308·#318·#311, ARCH #494 요청)
// win.test.ts(ARCH)는 sellFromLots를 직접 부른다. 여기서는 **실제 판매 지점**(runSales → settleSales · runHandfill)을 거친다
import { describe, expect, it } from 'vitest';
import { houseBrand } from './brands';
import { runHandfill } from './handfill';
import { advanceMonth, type Cask, type GameState, type MonthReport, type Product } from './index';
import { checkInvariants } from './invariants';
import { addLot, lotsOf } from './lots';
import { newGame } from './newGame';
import { newScenarioGame } from './newScenario';
import { updateProgress } from './progress';
import { isLocked } from './scenario';
import { siteIdOf } from './ledger';

const v16 = (seed = 4) => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed });
const product = (over: Partial<Product> = {}): Product => ({ id: 'P', name: '12년', category: 'whisky', ageYears: 12, oakMonths: 150, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 85, typicity: 80, style: null, sourcedShare: 0, stockBottles: 300, price: 120_000, unitCost: 30_000, createdMonth: 150, lastMonthSold: 0, totalSold: 0, ...over });
const self = (s: GameState, woodMonths: number, lpa = 60, costKRW = 1_000_000) => [{ batchId: 'b', origin: 'self' as const, siteId: siteIdOf(s), kindAtBirth: 'malt' as const, contribLPA: lpa, costKRW, woodMonths }];
/** 통 원액의 원장 한 줄 — R2(Σ LPA = volumeL × abv · Σ cost = costPerLPA × LPA)를 맞춘다 */
const caskSelf = (s: GameState, c: Cask, woodMonths: number, origin: 'self' | 'sourced' = 'self') => { const l = c.contents!; const lpa = l.volumeL * l.abv; return [{ ...self(s, woodMonths, lpa, l.costPerLPA * lpa)[0]!, origin }]; };
/** 통 틀 — 샌드박스 브로커 매물에서 빌린다(MVP 판에는 채워진 통이 없다) */
const caskTemplate = (): Cask => newGame({ seed: 3, region: 'KR' }).b2b.brokerOffers[0]!.cask;
const report = (s: GameState, visitors = 0): MonthReport => ({ month: s.month, revenue: 0, expenses: {}, netCash: 0, cashEnd: 0, sales: [], production: [], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [], visitors } as unknown as MonthReport);

describe('v16: 판매 지점 → progress.win', () => {
  it('국내 판매 지점(runSales)을 거친 적격 로트의 첫 출고가 승리가 된다 — 어린 로트가 먼저 빠지므로 승리 달은 어린 재고 소진 뒤', () => {
    const s = v16(); s.month = 150; houseBrand(s).awareness = 0.6;
    s.commerce.products.push(product({ stockBottles: 60 }));
    addLot(s, 'P', 40, { month: 120, components: self(s, 100) }); // 어린 로트(100개월) 40병이 먼저
    addLot(s, 'P', 20, { month: 150, components: self(s, 150) }); // 적격 20병
    expect(lotsOf(s).map((l) => l.eligibleAtBottling)).toEqual([false, true]);
    let n = 0; let cur = s;
    while (!cur.progress.win && n < 6) { cur = advanceMonth(cur); n++; }
    expect(cur.progress.win).toBeDefined();
    expect(cur.progress.win).toMatchObject({ productId: 'P', lotId: 'P:150:0', kind: 'domestic' });
    const rep = cur.history.reports.at(-1)!;
    expect(rep.saleEvents?.some((e) => e.lotId === 'P:150:0' && e.eligibleAtSale)).toBe(true);
    expect(cur.status).toBe('running');
    expect(checkInvariants(cur).errors).toEqual([]);
  });

  it('핸드필 지점(runHandfill)을 거친 적격 통의 첫 병이 cellar_door 승리가 된다 — 통 하나 로트는 남지 않는다', () => {
    const s = v16(); s.month = 150;
    const base = caskTemplate();
    const cask = { ...base, id: 'HF', owner: undefined, handfill: true, contents: { ...base.contents!, kind: 'malt', oakMonths: 150, sourced: false, volumeL: 200 } } as Cask;
    cask.contents!.components = caskSelf(s, cask, 150);
    s.inventory.casks = [cask];
    s.production.equipment.push({ id: 'HZ', catalogId: 'handfill_zone', readyMonth: 0 });
    const r = report(s, 100);
    runHandfill(s, r);
    expect(r.saleEvents).toHaveLength(1);
    expect(r.saleEvents![0]).toMatchObject({ kind: 'cellar_door', productId: 'handfill:HF', eligibleAtSale: true });
    updateProgress(s, r);
    expect(s.progress.win).toMatchObject({ kind: 'cellar_door', productId: 'handfill:HF', month: 150 });
    expect(lotsOf(s)).toEqual([]);
    expect(checkInvariants(s).errors).toEqual([]);
  });

  it('매입(sourced) 통의 핸드필은 사건은 남지만 승리가 아니다', () => {
    const s = v16(); s.month = 150;
    const base = caskTemplate();
    const cask = { ...base, id: 'HS', owner: undefined, handfill: true, contents: { ...base.contents!, kind: 'malt', oakMonths: 150, sourced: true, volumeL: 200 } } as Cask;
    cask.contents!.components = caskSelf(s, cask, 150, 'sourced');
    s.inventory.casks = [cask];
    s.production.equipment.push({ id: 'HZ', catalogId: 'handfill_zone', readyMonth: 0 });
    const r = report(s, 100);
    runHandfill(s, r);
    expect(r.saleEvents![0]).toMatchObject({ kind: 'cellar_door', eligibleAtSale: false });
    updateProgress(s, r);
    expect(s.progress.win).toBeUndefined();
  });
});

describe('v16: 대형 유통 납품(retail_deal) → progress.win (#319 y7_retail 대비)', () => {
  // 새 캠페인에서 이 길은 F5(#319 `y7_retail`, 84개월)가 `system:siteDeals`를 풀어야 열린다. 납품 처리(`fulfillRetail`)는 계약이 있으면 잠금과 무관하게 돌므로
  // 계약을 직접 넣어 판매 지점 4를 미리 잡아 둔다 — 납품은 소매보다 먼저 재고를 가져가(틱 4단계) 승리 로트의 첫 출하 채널이 될 수 있다
  const contract = (bottlesPerMonth: number) => ({ id: 'U1', partner: '대형 유통', category: 'whisky' as const, bottlesPerMonth, priceFactor: 0.8, termMonths: 12, paymentDelay: 2, penaltyPerBottle: 1_000, startMonth: 150, monthsDone: 0, delivered: 0, shortfall: 0 });

  it('납품이 어린 로트를 다 가져간 뒤 적격 로트에 닿으면 그 달 승리 — 외상(receivable)·출고가 80%도 정상 유상 출하다', () => {
    const s = v16(); s.month = 150; houseBrand(s).awareness = 0.6;
    s.commerce.products.push(product({ stockBottles: 60 }));
    addLot(s, 'P', 40, { month: 120, components: self(s, 100) }); // 어린 로트 40병
    addLot(s, 'P', 20, { month: 150, components: self(s, 150) }); // 적격 20병
    s.commerce.retailContracts = [contract(50)]; // 50병 = 어린 40 + 적격 10 → 소매보다 먼저(틱 4단계)
    const next = advanceMonth(s);
    const ev = next.history.reports.at(-1)!.saleEvents ?? [];
    const deal = ev.filter((e) => e.channel === 'retail_deal');
    expect(deal.map((e) => [e.lotId, e.bottles, e.eligibleAtSale])).toEqual([['P:120:0', 40, false], ['P:150:0', 10, true]]);
    expect(deal.every((e) => e.kind === 'domestic' && e.settlement === 'receivable' && e.unitPrice === 120_000 * 0.8)).toBe(true);
    expect(next.progress.win).toMatchObject({ month: 150, productId: 'P', lotId: 'P:150:0', kind: 'domestic', unitPrice: 96_000, bottles: 10 }); // 그달 첫 적격 사건 = 납품(소매 사건보다 먼저 쌓인다)
    expect(next.finance.receivables.some((r) => r.dueMonth === 152 && r.amount === 50 * 96_000)).toBe(true); // 대금은 2개월 뒤 — 승리는 출하 달
    expect(next.status).toBe('running');
    expect(checkInvariants(next).errors).toEqual([]);
  });

  it('납품이 어린 로트만 가져가면 승리가 아니다 — 적격 로트가 남아 있어도', () => {
    const s = v16(); s.month = 150; houseBrand(s).awareness = 0; // 인지도 0 — 소매 수요를 줄여 납품만 본다
    s.commerce.products.push(product({ stockBottles: 320, price: 100_000_000 })); // 값이 터무니없어 소매로는 안 팔린다(납품은 계약 물량이라 값과 무관)
    addLot(s, 'P', 300, { month: 120, components: self(s, 100) });
    addLot(s, 'P', 20, { month: 150, components: self(s, 150) });
    s.commerce.retailContracts = [contract(100)];
    const next = advanceMonth(s);
    const ev = next.history.reports.at(-1)!.saleEvents ?? [];
    expect(ev.filter((e) => e.channel === 'retail_deal').map((e) => [e.lotId, e.bottles])).toEqual([['P:120:0', 100]]);
    expect(ev.some((e) => e.eligibleAtSale)).toBe(false);
    expect(next.progress.win).toBeUndefined();
  });
});

describe('v16: 수출 잠금 아래 판매 지점 (#311)', () => {
  it('새 캠페인에서 수출이 잠겨 있으면 판매 사건은 국내·면세뿐이고, 수출 사건은 생기지 않는다', () => {
    const s = v16(); s.month = 60; houseBrand(s).awareness = 0.6;
    expect(isLocked(s, 'system:exports')).toBe(true);
    expect(s.commerce.exports ?? []).toEqual([]);
    s.commerce.products.push(product({ ageYears: 4, oakMonths: 48, stockBottles: 500, createdMonth: 40 }));
    addLot(s, 'P', 500, { month: 40, components: self(s, 48) });
    const next = advanceMonth(s);
    const ev = next.history.reports.at(-1)!.saleEvents ?? [];
    expect(ev.length).toBeGreaterThan(0);
    expect(new Set(ev.map((e) => e.kind))).toEqual(new Set(['domestic']));
    expect(ev.every((e) => e.settlement === 'cash')).toBe(true);
    expect(next.progress.win).toBeUndefined(); // 48개월 — 적격 아님
  });
});
