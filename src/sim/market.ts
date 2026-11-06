import { DISTRIBUTION, PACKAGING, logisticsCost } from './content/catalog';
import { rivalShare } from './rivals';
import { awarenessOf, houseBrand } from './brands';
import { consumerPrice, refPricePerL, regionOf, siteOf, traditionalTaxFactor, type RegionDef } from './content/regions';
import { outboundLogistics } from './sites';
import { DUTY_FREE, dutyFreeDemand, dutyFreeEditionAppeal } from './dutyFree';
import { agePerception } from './blending';
import { overhangFactor, retailCapacityCases, RETAIL } from './retail';
import { ownershipOversold, OWNERSHIP } from './investment';
import { clamp } from './flavor';
import { hexOf } from './blendRadar';
import { RARE, trendFactor } from './blendTable';
import { allProductQualities } from './lifecycle';
import { staffOf } from './util';
import { mod } from './modifiers';
import type { ExportEntry, ExportSale, GameState, Product, ProductCategory } from './types';
import { EXPORT_MARKETS, EXPORT_SALES, tariffKey, type ExportMarketDef } from './content/exports';
import type { Rng } from './rng';

// 수요 공식 (PRD §9.2) — 수치 [튜닝]

/** 유통 커버리지: 영업 직원 네트워크 스탯 기반 */
export function coverage(s: GameState): number {
  return clamp(0.03 + staffOf(s, 'sales').reduce((t, x) => t + 0.04 + (x.stats.b / 100) * 0.12, 0), 0, 1);
}

/** 영업 협상 스탯: 유통 마진 최대 10% 절감 → 소비자가 배수 */
export function markupFactor(s: GameState): number {
  const best = Math.max(0, ...staffOf(s, 'sales').map((x) => x.stats.c));
  return (1 - 0.1 * (best / 100)) * mod(s, 'consumerPrice:all');
}

/** 제품의 병당 소비자가 (지역 세제·유통 마진·영업 협상·이벤트 반영) */
export function productConsumerPrice(s: GameState, p: Pick<Product, 'price' | 'bottleMl' | 'abv' | 'traditional'>, region: RegionDef = regionOf(s)): number {
  return consumerPrice(region, p.price, p.bottleMl, p.abv, markupFactor(s), traditionalTaxFactor(region, p.traditional, s.commerce.traditionalReleasedL, s.commerce.traditionalPrevYearL));
}

export function appeal(p: Product, s?: Pick<GameState, 'world' | 'month' | 'regionId'>): number {
  const aged = p.category === 'whisky' || p.category === 'blended_whisky' || p.category === 'grain_whisky';
  const ageBonus = aged ? agePerception(p.oakMonths ?? (p.ageYears ?? 0) * 12, p.category) : 1;
  const lux = PACKAGING[p.packagingId]?.luxury ?? 1;
  // 시장 국면: 피트·셰리 유행
  // 시장 국면: 향미 트렌드 이동 (결정 #125 — 옛 피트·셰리 계단식 보정치를 육각형 축 기반 연속 배수로 대체)
  const trend = s ? mod(s, 'appeal:all') * trendFactor(s, p.hex ?? hexOf(p.flavor)) : 1;
  // 블렌딩 테이블 (결정 #124): 평론가 의뢰 블렌드는 기간 한정 가산, 코어 레인지는 일관성(0.9~1.1), 레어 싱글 캐스크
  const blendBonus = !p.blend ? 1
    : p.blend.source === 'critic' ? (s && p.blend.untilMonth != null && s.month < p.blend.untilMonth ? 1 + (p.blend.appealBonus ?? 0) : 1)
    : p.blend.source === 'core' ? 0.9 + 0.2 * (p.blend.score / 100)
    : 1;
  const rare = p.rareSingleCask ? RARE.singleCaskAppeal : 1;
  const region = s ? regionOf(s) : null;
  // 매입 원액 병입의 브랜드 가치: 싸게 사 온 원액일수록 감점, 비싼 원액이면 감점이 줄어든다
  const brand = 1 - (region?.sourcedPenalty ?? 0.4) * p.sourcedShare * (1 - (p.sourcedPrestige ?? 0));
  // 지역 프리미엄 표기(재패니즈 위스키 등)를 못 채운 위스키
  const label = region?.whisky.premiumLabel && aged && !p.premiumLabel ? region.whisky.premiumLabel.appealWithout : 1;
  // 지역 특산물
  const specialty = p.specialty ? region?.specialties?.find((x) => x.id === p.specialty)?.appealBonus ?? 1 : 1;
  // 입지 특성 (결정 #86~): 대형 유통 입점은 숙성 위스키의 프리미엄 이미지를 깎는다 / 미즈나라 인센스 향은 일본 프리미엄 / 면세 한정판
  const premium = s && aged ? mod(s, 'appeal:premium') : 1;
  const incense = region?.incensePremium && (p.flavor.incense ?? 0) >= 8 ? region.incensePremium : 1;
  const edition = dutyFreeEditionAppeal(p);
  return Math.pow(Math.max(p.quality, 1) / 60, 1.6) * (0.6 + 0.4 * (p.typicity / 100)) * lux * ageBonus * brand * label * specialty * trend * premium * incense * edition * blendBonus * rare;
}

/** 브랜드 가치가 낮은 매입 원액 병입은 저가 하이볼 수요라 가격에 훨씬 민감하다 */
export const sourcedElasticityFactor = (p: Pick<Product, 'sourcedShare' | 'sourcedPrestige'>) => 1 + 0.6 * p.sourcedShare * (1 - (p.sourcedPrestige ?? 0));

export interface DemandBreakdown {
  marketL: number;
  reach: number;
  appeal: number;
  consumerPricePerL: number;
  refPricePerL: number;
  priceFactor: number;
  demandBottles: number;
}

export function demandFor(s: GameState, p: Product, sameCategoryCount: number, monthOfYear: number, region: RegionDef = regionOf(s)): DemandBreakdown {
  const m = region.market[p.category];
  // 면세 전용 한정판은 국내 매대에 없다 (결정 #87). 입지 수요 배수(관광·인바운드, 결정 #86)
  if (p.dutyFreeOnly) return { marketL: 0, reach: 0, appeal: appeal(p, s), consumerPricePerL: 0, refPricePerL: refPricePerL(region, p.category, p.abv), priceFactor: 0, demandBottles: 0 };
  const marketL = (m.baseCases * 9 / 12) * region.seasonality[monthOfYear - 1]! * (s.world.trend[p.category] ?? 1) * mod(s, `demand:${p.category}`) * mod(s, 'demand:all') * (siteOf(s).demandFactor ?? 1) * (1 - rivalShare(s, p.category)); // 경쟁 AI 몫 (S-12 훅 — 경쟁사가 없으면 0)
  const reach = (awarenessOf(s, p) * coverage(s) * m.shareCap) / Math.sqrt(Math.max(1, sameCategoryCount));
  const a = appeal(p, s);
  const bottleL = p.bottleMl / 1000;
  const consumerPricePerL = productConsumerPrice(s, p, region) / bottleL;
  const charm = Math.max(0, ...staffOf(s, 'sales').map((x) => x.stats.a));
  const elasticity = m.elasticity * (1 - 0.15 * (charm / 100)) * sourcedElasticityFactor(p);
  const ref = refPricePerL(region, p.category, p.abv);
  const priceFactor = m.baseCases > 0 ? Math.pow(consumerPricePerL / ref, -elasticity) : 0;
  // 재고 적체(할인 이미지)·첫 출시 오픈런·캐스크 오너십 과다 판매(매니아 신뢰↓)
  const launch = p.launchBoost && s.month < p.launchBoost.untilMonth ? p.launchBoost.factor : 1;
  const oversold = ownershipOversold(s) ? OWNERSHIP.oversellAppeal : 1;
  const demandBottles = (marketL * reach * a * priceFactor * overhangFactor(p, s.month) * launch * oversold) / bottleL;
  return { marketL, reach, appeal: a, consumerPricePerL, refPricePerL: ref, priceFactor, demandBottles };
}

// ── 수출 (#95) ──

const AGED_CATEGORIES: ProductCategory[] = ['whisky', 'blended_whisky', 'grain_whisky'];

/** 수출 1병 운임 (700ml 기준 운임을 병 크기로 비례) */
export const exportFreightPerBottle = (s: Pick<GameState, 'regionId'>, p: Pick<Product, 'bottleMl'>, m: ExportMarketDef) => Math.round(m.freightPerBottle[s.regionId] * (p.bottleMl / 700));

/** 수출가(FOB, 병당 우리가 받는 값) = 출고가 × 수출가 배수 — 수입사 제안가로 시작해 플레이어가 조정 (#95·#101·#108). 계약 전 미리보기는 1 */
export const exportFob = (p: Pick<Product, 'price'>, priceFactor = 1) => Math.round(p.price * priceFactor);

/** 관세 이벤트(#103) 반영 실효 관세율 */
export function effectiveTariff(s: Pick<GameState, 'regionId'> & Partial<Pick<GameState, 'world' | 'month'>>, m: ExportMarketDef): number {
  const k = s.world?.modifiers && s.month != null ? mod(s as GameState, tariffKey(m.id)) : 1;
  return (1 + m.tariff[s.regionId]) * k - 1;
}

/** 수출 시장 소비자가 (병당): ((FOB + 운임) × (1 + 관세) × (1 + 현지 종가세) + 현지 주세) × 유통 배수 × (1 + 부가세). 국내 주세는 수출 면세 */
export function exportShelfPrice(s: Pick<GameState, 'regionId'> & Partial<Pick<GameState, 'world' | 'month'>>, p: Pick<Product, 'price' | 'bottleMl' | 'abv'>, m: ExportMarketDef, priceFactor = 1): number {
  const lpa = (p.bottleMl / 1000) * p.abv;
  return ((exportFob(p, priceFactor) + exportFreightPerBottle(s, p, m)) * (1 + effectiveTariff(s, m)) * (1 + (m.adValorem ?? 0)) + m.excisePerLPA * lpa) * m.channelMultiple * (1 + m.vat);
}

/** 수출 1병 순수입 = 수출가 − 운임 (#109 판로 배분 기준. 현지 마케팅 분담은 고정비라 뺀다) */
export const exportNetPerBottle = (s: Pick<GameState, 'regionId'>, p: Pick<Product, 'price' | 'bottleMl'>, m: ExportMarketDef, priceFactor = 1) => exportFob(p, priceFactor) - exportFreightPerBottle(s, p, m);
/** 국내 1병 순수입 = 출고가 − 유통비(채널 수수료 + 출고 물류). 주세는 소비자에게 넘어가므로 빼지 않는다 (#109) */
export const domesticNetPerBottle = (s: Pick<GameState, 'regionId' | 'siteId'>, p: Pick<Product, 'price' | 'bottleMl'>) => p.price - distributionCostPerBottle(p.price, p.bottleMl, outboundLogistics(s));

/** 이 시장에 팔 수 있는 제품인가 (주종·현지 위스키 숙성 규정) */
export function exportEligible(p: Pick<Product, 'category' | 'oakMonths' | 'ageYears'>, m: ExportMarketDef): boolean {
  if (!m.categories[p.category]) return false;
  if (AGED_CATEGORIES.includes(p.category) && (p.oakMonths ?? (p.ageYears ?? 0) * 12) < m.minWhiskyMonths) return false;
  return true;
}

export function exportDemandFor(s: GameState, p: Product, entry: ExportEntry, sameCategoryCount: number): number {
  const m = EXPORT_MARKETS[entry.marketId];
  const c = m.categories[p.category];
  if (!c || !exportEligible(p, m)) return 0;
  const marketL = (c.baseCases * 9 / 12) * (m.regionScale?.[s.regionId] ?? 1) * (s.world.trend[p.category] ?? 1) * mod(s, 'demand:all') * mod(s, `export:${m.id}`) * mod(s, 'export:all');
  const reach = (entry.awareness * c.shareCap) / Math.sqrt(Math.max(1, sameCategoryCount));
  const bottleL = p.bottleMl / 1000;
  const ref = c.refConsumerPricePerL * Math.pow(p.abv / c.refAbv, 0.7);
  const priceFactor = Math.pow(exportShelfPrice(s, p, m, entry.priceFactor ?? 1) / bottleL / ref, -c.elasticity * sourcedElasticityFactor(p));
  return (marketL * reach * appeal(p, s) * priceFactor * overhangFactor(p, s.month)) / bottleL;
}

/** 해외 명성 (#96): 진출 시장의 현지 인지도 상한을 높이고, 바닥(명성 × 0.5)을 깐다. 매달 1.5%씩 식는다 */
export const ACCLAIM = { maxBonus: 0.4, floor: 0.5, decay: 0.015 };
export const exportAwarenessMax = (s: { commerce: Pick<GameState['commerce'], 'acclaim'> }, id: keyof typeof EXPORT_MARKETS) => Math.min(0.95, EXPORT_MARKETS[id].awareness.max + ACCLAIM.maxBonus * (s.commerce.acclaim ?? 0));

/** 수출 인지도: 매달 상승(계약 마케팅 분담이 클수록 빠르게, #101) + 국내 인지도 후광(면세점만, #102) + 해외 명성 상한·바닥(#96) */
export function updateExportAwareness(s: GameState): void {
  for (const e of s.commerce.exports ?? []) {
    if (e.readyMonth > s.month) continue;
    const m = EXPORT_MARKETS[e.marketId];
    const a = m.awareness;
    const max = exportAwarenessMax(s, e.marketId);
    // 마케팅 분담 = 시장 기준 월 비용이면 ×1, 0이면 ×0.3, 2배면 ×1.5 (체감)
    const push = e.marketingPerMonth == null ? 1 : 0.3 + 0.7 * Math.sqrt(e.marketingPerMonth / m.monthlyCost) * (e.marketingPerMonth > m.monthlyCost ? 0.85 : 1);
    const target = Math.min(max, e.awareness + a.perMonth * push * (1 - e.awareness) * mod(s, 'awareness_gain'));
    e.awareness = clamp(Math.max(target, awarenessOf(s) * a.domesticSpill, (s.commerce.acclaim ?? 0) * ACCLAIM.floor), 0, max);
  }
  if (s.commerce.acclaim) s.commerce.acclaim = Math.max(0, s.commerce.acclaim * (1 - ACCLAIM.decay));
}

export interface SalesResult { productId: string; name: string; bottles: number; revenue: number; demandBottles: number; distribution: number; overflowBottles?: number; /** 면세 채널 판매 병수 (bottles에 포함, 주세 없음) — 결정 #87 */ dutyFree?: number }

/** 소매 처리 역량 집계 (runSales가 채운다) */
export interface RetailSummary { capacityCases: number; soldCases: number; overflowCases: number; lostBottles: number }

/** 병당 유통비 = 채널 수수료(출고가 비례) + 물류비 × 입지 출고 물류 배수 (결정 #86) */
export function distributionCostPerBottle(price: number, bottleMl: number, outbound = 1): number {
  return price * DISTRIBUTION.channelFeeRate + logisticsCost(bottleMl) * outbound;
}

/** 이 제품의 면세 채널 수요 (제주) */
export function productDutyFreeDemand(s: GameState, p: Product, sameCategoryCount: number, monthOfYear: number): number {
  return dutyFreeDemand(s, p, sameCategoryCount, monthOfYear, (x) => appeal(x, s), coverage(s));
}

/** 병당 공헌이익과 공헌이익률 (출고가 − 생산 원가 − 유통비) */
export function bottleMargin(p: Pick<Product, 'price' | 'unitCost' | 'bottleMl'>, outbound = 1): { perBottle: number; rate: number } {
  const perBottle = p.price - p.unitCost - distributionCostPerBottle(p.price, p.bottleMl, outbound);
  return { perBottle, rate: p.price > 0 ? perBottle / p.price : 0 };
}

export function runSales(s: GameState, rng: Rng, monthOfYear: number): { results: SalesResult[]; retail: RetailSummary; exports: ExportSale[] } {
  const counts: Partial<Record<ProductCategory, number>> = {};
  for (const p of s.commerce.products) if (p.stockBottles > 0) counts[p.category] = (counts[p.category] ?? 0) + 1;
  // 1) 제품별 수요
  const wants: { p: Product; demand: number; want: number }[] = [];
  for (const p of s.commerce.products) {
    if (p.stockBottles <= 0) { p.lastMonthSold = 0; p.salesEma = (p.salesEma ?? 0) * 0.7; continue; }
    const d = demandFor(s, p, counts[p.category] ?? 1, monthOfYear);
    const demand = Math.round(d.demandBottles * rng.range(0.9, 1.1));
    wants.push({ p, demand, want: Math.min(p.stockBottles, demand) });
  }
  // 1-b) 수출 수요 (#95·#109): 재고가 모자라면 병당 순수입이 높은 판로부터 채운다(EXPORT_SALES.allocation, 같으면 국내 먼저).
  //      숙성 원액은 정해진 양뿐이라, 수요 비율로 나누면 싸게 파는 판로가 비싸게 파는 판로의 몫을 빼앗는다.
  //      수출가를 올리면(#108) 수출이 먼저 채워진다. 수출은 수입상이 받아 가므로 소매 처리 역량을 쓰지 않는다
  const exportWants = new Map<string, { entry: ExportEntry; demand: number; want: number }[]>();
  const active = (s.commerce.exports ?? []).filter((e) => e.readyMonth <= s.month);
  for (const w of wants) {
    const list = active.map((entry) => ({ entry, demand: Math.round(exportDemandFor(s, w.p, entry, counts[w.p.category] ?? 1) * rng.range(0.9, 1.1)), want: 0 })).filter((x) => x.demand > 0);
    if (!list.length) continue;
    exportWants.set(w.p.id, list);
    if (EXPORT_SALES.allocation === 'margin') {
      const chans = [
        { net: domesticNetPerBottle(s, w.p), demand: w.demand, set: (n: number) => { w.want = n; } },
        ...list.map((x) => ({ net: exportNetPerBottle(s, w.p, EXPORT_MARKETS[x.entry.marketId], x.entry.priceFactor ?? 1), demand: x.demand, set: (n: number) => { x.want = n; } })),
      ].sort((a, b) => b.net - a.net); // 안정 정렬 — 같으면 국내 먼저
      let left = w.p.stockBottles;
      for (const c of chans) { const n = Math.min(left, c.demand); c.set(n); left -= n; }
      continue;
    }
    if (EXPORT_SALES.allocation === 'domestic') continue; // 수출 몫은 국내 판매 뒤 남은 재고로 (아래)
    const total = w.demand + list.reduce((t, x) => t + x.demand, 0);
    const f = Math.min(1, w.p.stockBottles / Math.max(1, total));
    w.want = Math.floor(w.demand * f);
    for (const x of list) x.want = Math.floor(x.demand * f);
  }
  // 2) 소매 처리 역량 (결정 #65): 역량까지는 정상 채널, 역량의 2배까지는 고비용 채널(할인·추가 수수료), 그 너머는 못 판다
  //    영업은 케이스당 공헌이익이 큰 제품부터 민다 → 역량이 모자라면 저마진 제품부터 밀려난다
  const cap = retailCapacityCases(s);
  const cases = (bottles: number, ml: number) => (bottles * ml) / 9000;
  const marginPerCase = (p: Product) => (bottleMargin(p).perBottle * 9000) / p.bottleMl;
  const order = [...wants].sort((a, b) => marginPerCase(b.p) - marginPerCase(a.p));
  let normalLeft = cap;
  let overflowLeft = cap * RETAIL.overflowShare;
  const alloc = new Map<string, { sold: number; over: number }>();
  for (const w of order) {
    const perBottle = w.p.bottleMl / 9000;
    const normal = Math.min(w.want, Math.floor(normalLeft / perBottle));
    normalLeft -= normal * perBottle;
    const over = Math.min(w.want - normal, Math.floor(overflowLeft / perBottle));
    overflowLeft -= over * perBottle;
    alloc.set(w.p.id, { sold: normal + over, over });
  }
  const soldCases = wants.reduce((t, w) => t + cases(alloc.get(w.p.id)!.sold, w.p.bottleMl), 0);
  const overflowCases = wants.reduce((t, w) => t + cases(alloc.get(w.p.id)!.over, w.p.bottleMl), 0);
  const out: SalesResult[] = [];
  let lost = 0;
  for (const { p, demand, want } of wants) {
    const { sold, over } = alloc.get(p.id)!;
    lost += want - sold;
    p.stockBottles -= sold;
    p.lastMonthSold = sold;
    p.totalSold += sold;
    p.salesEma = p.salesEma == null ? sold : 0.7 * p.salesEma + 0.3 * sold;
    const extraFee = over * p.price * (RETAIL.overflowFeeRate - DISTRIBUTION.channelFeeRate);
    out.push({ productId: p.id, name: p.name, bottles: sold, revenue: sold * p.price, demandBottles: demand, distribution: Math.round(sold * distributionCostPerBottle(p.price, p.bottleMl, outboundLogistics(s)) + extraFee), overflowBottles: over });
  }
  // 3) 지정면세점 채널 (제주, 결정 #87) — 면세점이 진열·판매하므로 소매 처리 역량을 쓰지 않고, 섬 안에서 팔려 육지 출고 물류 할증도 없다
  if (siteOf(s).dutyFree) {
    for (const p of s.commerce.products) {
      if (p.stockBottles <= 0) { p.lastMonthDutyFree = 0; continue; }
      const df = Math.min(p.stockBottles, Math.round(productDutyFreeDemand(s, p, counts[p.category] ?? 1, monthOfYear) * rng.range(0.9, 1.1)));
      p.lastMonthDutyFree = df;
      if (df <= 0) continue;
      p.stockBottles -= df;
      p.lastMonthSold += df;
      p.totalSold += df;
      const r = out.find((x) => x.productId === p.id);
      const dist = Math.round(df * distributionCostPerBottle(p.price, p.bottleMl));
      if (r) { r.bottles += df; r.revenue += df * p.price; r.demandBottles += df; r.distribution += dist; r.dutyFree = df; }
      else out.push({ productId: p.id, name: p.name, bottles: df, revenue: df * p.price, demandBottles: df, distribution: dist, dutyFree: df });
    }
  }
  const exports: ExportSale[] = [];
  for (const { p } of wants) {
    const list = exportWants.get(p.id) ?? [];
    if (EXPORT_SALES.allocation === 'domestic' && list.length) {
      const f = Math.min(1, p.stockBottles / Math.max(1, list.reduce((t, x) => t + x.demand, 0)));
      for (const x of list) x.want = Math.floor(x.demand * f);
    }
    for (const x of list) {
      const bottles = Math.min(x.want, p.stockBottles);
      if (bottles <= 0 && x.demand <= 0) continue;
      p.stockBottles -= bottles;
      p.lastMonthSold += bottles;
      p.totalSold += bottles;
      x.entry.totalBottles += bottles;
      const m = EXPORT_MARKETS[x.entry.marketId];
      x.entry.bottlesThisYear = (x.entry.bottlesThisYear ?? 0) + bottles;
      exports.push({ marketId: x.entry.marketId, productId: p.id, name: p.name, bottles, revenue: bottles * exportFob(p, x.entry.priceFactor ?? 1), demandBottles: x.demand, freight: bottles * exportFreightPerBottle(s, p, m) });
    }
  }
  return { results: out, retail: { capacityCases: cap, soldCases: Math.round(soldCases), overflowCases: Math.round(overflowCases), lostBottles: lost }, exports };
}

/** 인지도 계수 [튜닝] — 월 500만 원 마케팅 단독이면 평형 인지도 ≈ 0.4 */
export const AWARENESS = { marketing: 0.012, wordOfMouth: 0.000003, decay: 0.012 };

/**
 * 인지도 갱신: 마케팅 + 입소문(판매량 × 품질) − 망각.
 * 면세 판매 1병은 입소문에서 DUTY_FREE.wordOfMouthWeight병으로 친다 — 출도 관광객이 육지로 가져간다 (결정 #87).
 * 반환: 그중 면세 판매 입소문 몫(인지도 증가분)
 */
export function updateAwareness(s: GameState, sales: SalesResult[]): number {
  const dutyFree = sales.reduce((t, x) => t + (x.dutyFree ?? 0), 0);
  const bottles = sales.reduce((t, x) => t + x.bottles, 0) + (DUTY_FREE.wordOfMouthWeight - 1) * dutyFree;
  const qs = allProductQualities(s); // 역대 전 제품(아카이브 포함) 평균 — lifecycle.ts의 [열린 문제] 참고
  const avgQ = qs.length ? qs.reduce((t, q) => t + q, 0) / qs.length : 50;
  // 브랜드별 성장(PRD §11.2 ④)은 단계 P — 지금은 하우스 브랜드 하나라 회사 인지도 성장식을 하우스에 그대로 쓴다
  const house = houseBrand(s);
  const a = house.awareness;
  const gain = (AWARENESS.marketing * Math.log10(1 + s.commerce.marketingBudget / 1_000_000) * mod(s, 'awareness_gain') + AWARENESS.wordOfMouth * bottles * (avgQ / 60)) * (1 - a);
  house.awareness = clamp(a + gain - AWARENESS.decay * a, 0.001, 0.95);
  return AWARENESS.wordOfMouth * DUTY_FREE.wordOfMouthWeight * dutyFree * (avgQ / 60) * (1 - a);
}

export function updateTrends(s: GameState, rng: Rng): void {
  for (const k of Object.keys(s.world.trend) as ProductCategory[]) {
    const t = s.world.trend[k];
    s.world.trend[k] = clamp(t * Math.exp(rng.normal(0, 0.015)) + 0.05 * (1 - t), 0.6, 1.5);
  }
}
