import { describe, expect, it } from 'vitest';
import {
  applyAction, applyEffects, capacityLPA, collectFillingStorage, deliverOwnedCasks, EXPORT_MARKETS, exportMarketsFor, FILLING, fillingCaskLPA, fulfillContracts,
  makeFillingOffer, mulberry32, newGame, ownershipOversold, refreshContractOffers, regionalCaskPrice, startContract, warehouseCapacity,
  type GameState, type MonthReport, type SpiritLot,
} from './index';
import { REGIONS, siteOf } from './content/regions';
import { CASK_MARKET } from './content/catalog';

// 스코틀랜드(영국) — 국가·스페이사이드 (#110~#116, docs/design/scotland.md)

const report = (s: GameState): MonthReport => ({ month: s.month, revenue: 0, expenses: {}, netCash: 0, cashEnd: 0, sales: [], production: [], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] });
const newMake = (lpa: number): SpiritLot => ({ id: 'nm', name: '뉴메이크', kind: 'malt', volumeL: lpa / 0.68, abv: 0.68, flavor: { cereal: 40, fresh_fruit: 25, sweetness: 15 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 5_000 });

describe('영국 국가 (#110)', () => {
  it('스페이사이드가 기본 입지 — 종량세 £33.99/LPA, 부가세 20%, 스카치 3년 규정, 버번 배럴·셰리 벗으로 시작', () => {
    const s = newGame({ seed: 1, region: 'UK' });
    const r = REGIONS.UK;
    expect(r.tax.specificPerLPA).toBe(61_200);
    expect(r.tax.vat).toBe(0.2);
    expect(r.whisky.minMonths).toBe(36);
    expect(siteOf(s).deals).toContain('filling');
    expect(s.distilleryName).toBe('킬도니 증류소');
    expect(s.casks.filter((c) => c.typeId === 'oloroso_butt')).toHaveLength(2);
  });

  it('영국에서는 수출 시장 영국이 국내라 빠지고, 영국산 위스키의 미국 관세는 0%', () => {
    expect(exportMarketsFor('UK')).not.toContain('UK');
    expect(EXPORT_MARKETS.US.tariff.UK).toBe(0);
    expect(EXPORT_MARKETS.CN.tariff.UK).toBe(0.05);
    expect(EXPORT_MARKETS.KR.tariff.UK).toBe(0);
  });

  it('쿠퍼리지 클러스터 (#113): 캐스크 −20%(지역 0.9 × 입지 0.8), 쿠퍼리지 주문이 1개월 만에 온다', () => {
    const uk = newGame({ seed: 1, region: 'UK' });
    const kr = newGame({ seed: 1, region: 'KR' });
    expect(regionalCaskPrice(uk, 'ex_bourbon_barrel')).toBe(Math.round(regionalCaskPrice(kr, 'ex_bourbon_barrel') * 0.9 * 0.8));
    const s = applyAction({ ...uk, cash: 1e10 }, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: 5 }).state;
    expect(s.caskOrders.at(-1)!.arriveMonth).toBe(uk.month + 1);
    const k = applyAction({ ...kr, cash: 1e10 }, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: 5 }).state;
    expect(k.caskOrders.at(-1)!.arriveMonth).toBe(kr.month + CASK_MARKET.cooperageLeadMonths);
  });
});

describe('필링 계약 (#112)', () => {
  const ukWithStill = () => {
    const s = { ...newGame({ seed: 5, region: 'UK' }), cash: 1e10 };
    expect(capacityLPA(s, 'malt')).toBeGreaterThan(0);
    return s;
  };

  it('필링 제안은 필링 입지(스페이사이드)에서만 들어온다', () => {
    const count = (region: 'UK' | 'KR') => {
      const s = newGame({ seed: 9, region });
      let n = 0;
      for (let i = 0; i < 60; i++) { s.month = i; refreshContractOffers(s, mulberry32(i + 1)); n += s.contractOffers.some((o) => o.filling) ? 1 : 0; s.contractOffers = s.contractOffers.filter((o) => !o.filling); }
      return n;
    };
    expect(count('UK')).toBeGreaterThan(5);
    expect(count('KR')).toBe(0);
  });

  it('납품 원액을 블렌더 소유 캐스크에 채워 숙성고에 두고, 보관료를 받다가, 기한이 되면 인도한다', () => {
    const s = ukWithStill();
    const offer = makeFillingOffer(s, mulberry32(2));
    expect(offer?.filling).toBeTruthy();
    const c = startContract(s, { ...offer!, lpaPerMonth: 500, minQuality: 0, style: 'any' });
    s.contracts = [c];
    s.lots = [newMake(2_000)];
    s.casks = [];
    const r = report(s);
    fulfillContracts(s, r);
    const per = fillingCaskLPA();
    const blender = s.casks.filter((k) => k.owner?.filling);
    expect(blender).toHaveLength(Math.floor(500 / per));
    expect(blender[0]!.owner!.deliverMonth).toBe(s.month + c.filling!.holdMonths);
    expect(blender[0]!.contents!.abv).toBe(FILLING.fillAbv);
    // 원액값은 그대로 들어온다(선급 상계 제외)
    expect(r.bulk[0]!.deliveredLPA).toBeCloseTo(500, 6);
    // 보관료
    const r2 = report(s);
    const fee = collectFillingStorage(s, r2);
    expect(fee).toBe(blender.length * c.filling!.storagePerCaskMonth);
    expect(r2.bulkRevenue).toBe(fee);
    // 필링 캐스크는 오너십 과다 판매 판정에서 빠진다
    expect(ownershipOversold(s)).toBe(false);
    // 병입할 수 없다
    const bottled = applyAction(s, { type: 'bottle', components: [{ source: 'cask', id: blender[0]!.id, liters: 10 }], options: { name: 'x', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' } });
    expect(bottled.error).toBeTruthy();
    // 인도
    s.month = blender[0]!.owner!.deliverMonth;
    deliverOwnedCasks(s, report(s));
    expect(s.casks.filter((k) => k.owner?.filling)).toHaveLength(0);
  });

  it('숙성고가 차면 캐스크를 만들지 않고 탱크로 넘긴다 (보관료 없음)', () => {
    const s = ukWithStill();
    const offer = makeFillingOffer(s, mulberry32(2))!;
    s.contracts = [startContract(s, { ...offer, lpaPerMonth: 500, minQuality: 0, style: 'any' })];
    s.lots = [newMake(2_000)];
    const cap = warehouseCapacity(s);
    while (s.casks.length < cap) s.casks.push({ ...s.casks[0]!, id: `X${s.casks.length}` });
    const before = s.casks.length;
    const r = report(s);
    fulfillContracts(s, r);
    expect(s.casks.length).toBe(before);
    expect(r.bulk[0]!.deliveredLPA).toBeCloseTo(500, 6);
    expect(r.notes.some((n) => n.includes('탱크'))).toBe(true);
  });
});

describe('인재 쟁탈 (#113)', () => {
  it('스카우트: 스탯 70 이상 직원이 들어오고 계약금(월급 3개월 치)을 낸다', () => {
    const s = { ...newGame({ seed: 3, region: 'UK' }), cash: 1e9 };
    const n = s.staff.length;
    applyEffects(s, [{ type: 'scoutStaff', minStat: 70, salaryPremium: 0.3, signingMonths: 3 }], mulberry32(4), 't');
    expect(s.staff).toHaveLength(n + 1);
    const hired = s.staff.at(-1)!;
    expect(Math.min(hired.stats.a, hired.stats.b, hired.stats.c)).toBeGreaterThanOrEqual(70);
    expect(1e9 - s.cash).toBe(hired.salary * 3);
  });
});
