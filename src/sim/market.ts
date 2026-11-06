import { DISTRIBUTION, PACKAGING, logisticsCost } from './content/catalog';
import { consumerPrice, refPricePerL, regionOf, traditionalTaxFactor, type RegionDef } from './content/regions';
import { agePerception } from './blending';
import { overhangFactor, ownershipOversold, OWNERSHIP, retailCapacityCases, RETAIL } from './ops';
import { clamp } from './flavor';
import { staffOf } from './util';
import { mod } from './modifiers';
import type { ExportEntry, ExportSale, GameState, Product, ProductCategory } from './types';
import { EXPORT_MARKETS, type ExportMarketDef } from './content/exports';
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
  return consumerPrice(region, p.price, p.bottleMl, p.abv, markupFactor(s), traditionalTaxFactor(region, p.traditional, s.traditionalReleasedL, s.traditionalPrevYearL));
}

export function appeal(p: Product, s?: Pick<GameState, 'modifiers' | 'month' | 'regionId'>): number {
  const aged = p.category === 'whisky' || p.category === 'blended_whisky' || p.category === 'grain_whisky';
  const ageBonus = aged ? agePerception(p.oakMonths ?? (p.ageYears ?? 0) * 12) : 1;
  const lux = PACKAGING[p.packagingId]?.luxury ?? 1;
  // 시장 국면: 피트·셰리 유행
  const trend = s ? mod(s, 'appeal:all') * ((p.flavor.peat_smoke ?? 0) >= 25 ? mod(s, 'appeal:peated') : 1) * ((p.flavor.dried_fruit ?? 0) >= 25 ? mod(s, 'appeal:sherried') : 1) : 1;
  const region = s ? regionOf(s) : null;
  // 매입 원액 병입의 브랜드 가치: 싸게 사 온 원액일수록 감점, 비싼 원액이면 감점이 줄어든다
  const brand = 1 - (region?.sourcedPenalty ?? 0.4) * p.sourcedShare * (1 - (p.sourcedPrestige ?? 0));
  // 지역 프리미엄 표기(재패니즈 위스키 등)를 못 채운 위스키
  const label = region?.whisky.premiumLabel && aged && !p.premiumLabel ? region.whisky.premiumLabel.appealWithout : 1;
  // 지역 특산물
  const specialty = p.specialty ? region?.specialties?.find((x) => x.id === p.specialty)?.appealBonus ?? 1 : 1;
  return Math.pow(Math.max(p.quality, 1) / 60, 1.6) * (0.6 + 0.4 * (p.typicity / 100)) * lux * ageBonus * brand * label * specialty * trend;
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
  const marketL = (m.baseCases * 9 / 12) * region.seasonality[monthOfYear - 1]! * (s.trend[p.category] ?? 1) * mod(s, `demand:${p.category}`) * mod(s, 'demand:all');
  const reach = (s.awareness * coverage(s) * m.shareCap) / Math.sqrt(Math.max(1, sameCategoryCount));
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

// ── 수출 (#86) ──

const AGED_CATEGORIES: ProductCategory[] = ['whisky', 'blended_whisky', 'grain_whisky'];

/** 수출 1병 운임 (700ml 기준 운임을 병 크기로 비례) */
export const exportFreightPerBottle = (s: Pick<GameState, 'regionId'>, p: Pick<Product, 'bottleMl'>, m: ExportMarketDef) => Math.round(m.freightPerBottle[s.regionId] * (p.bottleMl / 700));

/** 수출 시장 소비자가 (병당): ((출고가 + 운임) × (1 + 관세) + 현지 주세) × 유통 배수 × (1 + 부가세). 국내 주세는 수출 면세 */
export function exportShelfPrice(s: Pick<GameState, 'regionId'>, p: Pick<Product, 'price' | 'bottleMl' | 'abv'>, m: ExportMarketDef): number {
  const lpa = (p.bottleMl / 1000) * p.abv;
  return ((p.price + exportFreightPerBottle(s, p, m)) * (1 + m.tariff[s.regionId]) + m.excisePerLPA * lpa) * m.channelMultiple * (1 + m.vat);
}

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
  const marketL = (c.baseCases * 9 / 12) * (m.regionScale?.[s.regionId] ?? 1) * (s.trend[p.category] ?? 1) * mod(s, 'demand:all') * mod(s, `export:${m.id}`);
  const reach = (entry.awareness * c.shareCap) / Math.sqrt(Math.max(1, sameCategoryCount));
  const bottleL = p.bottleMl / 1000;
  const ref = c.refConsumerPricePerL * Math.pow(p.abv / c.refAbv, 0.7);
  const priceFactor = Math.pow(exportShelfPrice(s, p, m) / bottleL / ref, -c.elasticity * sourcedElasticityFactor(p));
  return (marketL * reach * appeal(p, s) * priceFactor * overhangFactor(p, s.month)) / bottleL;
}

/** 수출 인지도: 매달 상승 + 국내 인지도가 넘어옴 (면세는 국내 인지도 그대로) */
export function updateExportAwareness(s: GameState): void {
  for (const e of s.exports ?? []) {
    if (e.readyMonth > s.month) continue;
    const a = EXPORT_MARKETS[e.marketId].awareness;
    const target = Math.min(a.max, e.awareness + a.perMonth * (1 - e.awareness) * mod(s, 'awareness_gain'));
    e.awareness = clamp(Math.max(target, s.awareness * a.domesticSpill), 0, a.max);
  }
}

export interface SalesResult { productId: string; name: string; bottles: number; revenue: number; demandBottles: number; distribution: number; overflowBottles?: number }

/** 소매 처리 역량 집계 (runSales가 채운다) */
export interface RetailSummary { capacityCases: number; soldCases: number; overflowCases: number; lostBottles: number }

/** 병당 유통비 = 채널 수수료(출고가 비례) + 물류비 */
export function distributionCostPerBottle(price: number, bottleMl: number): number {
  return price * DISTRIBUTION.channelFeeRate + logisticsCost(bottleMl);
}

/** 병당 공헌이익과 공헌이익률 (출고가 − 생산 원가 − 유통비) */
export function bottleMargin(p: Pick<Product, 'price' | 'unitCost' | 'bottleMl'>): { perBottle: number; rate: number } {
  const perBottle = p.price - p.unitCost - distributionCostPerBottle(p.price, p.bottleMl);
  return { perBottle, rate: p.price > 0 ? perBottle / p.price : 0 };
}

export function runSales(s: GameState, rng: Rng, monthOfYear: number): { results: SalesResult[]; retail: RetailSummary; exports: ExportSale[] } {
  const counts: Partial<Record<ProductCategory, number>> = {};
  for (const p of s.products) if (p.stockBottles > 0) counts[p.category] = (counts[p.category] ?? 0) + 1;
  // 1) 제품별 수요
  const wants: { p: Product; demand: number; want: number }[] = [];
  for (const p of s.products) {
    if (p.stockBottles <= 0) { p.lastMonthSold = 0; p.salesEma = (p.salesEma ?? 0) * 0.7; continue; }
    const d = demandFor(s, p, counts[p.category] ?? 1, monthOfYear);
    const demand = Math.round(d.demandBottles * rng.range(0.9, 1.1));
    wants.push({ p, demand, want: Math.min(p.stockBottles, demand) });
  }
  // 1-b) 수출 수요 (#86): 재고가 모자라면 국내·수출에 수요 비율대로 나눈다. 수출은 수입상이 받아 가므로 소매 처리 역량을 쓰지 않는다
  const exportWants = new Map<string, { entry: ExportEntry; demand: number; want: number }[]>();
  const active = (s.exports ?? []).filter((e) => e.readyMonth <= s.month);
  for (const w of wants) {
    const list = active.map((entry) => ({ entry, demand: Math.round(exportDemandFor(s, w.p, entry, counts[w.p.category] ?? 1) * rng.range(0.9, 1.1)), want: 0 })).filter((x) => x.demand > 0);
    if (!list.length) continue;
    const total = w.demand + list.reduce((t, x) => t + x.demand, 0);
    const f = Math.min(1, w.p.stockBottles / Math.max(1, total));
    w.want = Math.floor(w.demand * f);
    for (const x of list) x.want = Math.floor(x.demand * f);
    exportWants.set(w.p.id, list);
  }
  // 2) 소매 처리 역량 (결정 #65): 역량까지는 정상 채널, 역량의 2배까지는 고비용 채널(할인·추가 수수료), 그 너머는 못 판다
  //    영업은 케이스당 공헌이익이 큰 제품부터 민다 → 역량이 모자라면 저마진 제품부터 밀려난다
  const cap = retailCapacityCases(s);
  const cases = (bottles: number, ml: number) => (bottles * ml) / 9000;
  const marginPerCase = (p: Product) => (bottleMargin(p).perBottle * 9000) / p.bottleMl;
  const order = [...wants].sort((a, b) => marginPerCase(b.p) - marginPerCase(a.p));
  let normalLeft = cap;
  let overflowLeft = cap;
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
    out.push({ productId: p.id, name: p.name, bottles: sold, revenue: sold * p.price, demandBottles: demand, distribution: Math.round(sold * distributionCostPerBottle(p.price, p.bottleMl) + extraFee), overflowBottles: over });
  }
  const exports: ExportSale[] = [];
  for (const { p } of wants) {
    for (const x of exportWants.get(p.id) ?? []) {
      const bottles = Math.min(x.want, p.stockBottles);
      if (bottles <= 0 && x.demand <= 0) continue;
      p.stockBottles -= bottles;
      p.lastMonthSold += bottles;
      p.totalSold += bottles;
      x.entry.totalBottles += bottles;
      const m = EXPORT_MARKETS[x.entry.marketId];
      exports.push({ marketId: x.entry.marketId, productId: p.id, name: p.name, bottles, revenue: bottles * p.price, demandBottles: x.demand, freight: bottles * exportFreightPerBottle(s, p, m) });
    }
  }
  return { results: out, retail: { capacityCases: cap, soldCases: Math.round(soldCases), overflowCases: Math.round(overflowCases), lostBottles: lost }, exports };
}

/** 인지도 계수 [튜닝] — 월 500만 원 마케팅 단독이면 평형 인지도 ≈ 0.4 */
export const AWARENESS = { marketing: 0.012, wordOfMouth: 0.000003, decay: 0.012 };

/** 인지도 갱신: 마케팅 + 입소문(판매량 × 품질) − 망각 */
export function updateAwareness(s: GameState, sales: SalesResult[]): void {
  const bottles = sales.reduce((t, x) => t + x.bottles, 0);
  const avgQ = s.products.length ? s.products.reduce((t, p) => t + p.quality, 0) / s.products.length : 50;
  const a = s.awareness;
  const gain = (AWARENESS.marketing * Math.log10(1 + s.marketingBudget / 1_000_000) * mod(s, 'awareness_gain') + AWARENESS.wordOfMouth * bottles * (avgQ / 60)) * (1 - a);
  s.awareness = clamp(a + gain - AWARENESS.decay * a, 0.001, 0.95);
}

export function updateTrends(s: GameState, rng: Rng): void {
  for (const k of Object.keys(s.trend) as ProductCategory[]) {
    const t = s.trend[k];
    s.trend[k] = clamp(t * Math.exp(rng.normal(0, 0.015)) + 0.05 * (1 - t), 0.6, 1.5);
  }
}
