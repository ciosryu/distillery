import { DISTRIBUTION, PACKAGING, VISITOR, logisticsCost } from './content/catalog';
import { consumerPrice, liquorTaxPerBottle, refPricePerL, regionOf, type RegionDef } from './content/regions';
import { DUTY_FREE, siteOf } from './content/sites';
import { hasUpgrade, onlineCoverageBonus, rollTraditionalYear, traditionalReliefRate } from './sites';
import { clamp } from './flavor';
import { staffOf } from './util';
import { mod } from './modifiers';
import type { GameState, Product, ProductCategory } from './types';
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

type PricedProduct = Pick<Product, 'price' | 'bottleMl' | 'abv'> & Partial<Pick<Product, 'category' | 'traditional'>>;

/** 제품의 병당 소비자가 (국가 세제·기준판매비율·전통주 감면·유통 마진·영업 협상·이벤트 반영) */
export function productConsumerPrice(s: GameState, p: PricedProduct, region: RegionDef = regionOf(s)): number {
  return consumerPrice(region, p.price, p.bottleMl, p.abv, markupFactor(s), { category: p.category, relief: traditionalReliefRate(s, p.traditional) });
}

/** 면세 채널 병당 소비자가 — 주세·부가세 없음 */
export function dutyFreeConsumerPrice(p: Pick<Product, 'price'>): number {
  return p.price * DUTY_FREE.markup;
}

export function appeal(p: Product, s?: Pick<GameState, 'modifiers' | 'month' | 'regionId'>): number {
  const aged = p.category === 'whisky' || p.category === 'blended_whisky' || p.category === 'grain_whisky';
  const ageBonus = aged && p.ageYears ? 1 + 0.06 * Math.min(p.ageYears, 12) : 1;
  const lux = PACKAGING[p.packagingId]?.luxury ?? 1;
  // 시장 국면: 피트·셰리 유행
  const trend = s ? mod(s, 'appeal:all') * ((p.flavor.peat_smoke ?? 0) >= 25 ? mod(s, 'appeal:peated') : 1) * ((p.flavor.dried_fruit ?? 0) >= 25 ? mod(s, 'appeal:sherried') : 1) : 1;
  const sourcedPenalty = s ? regionOf(s).sourcedPenalty : 0.15;
  // 대형 유통 입점(경기)은 숙성 위스키의 프리미엄 이미지를 깎는다 / 미즈나라 백단·인센스 향은 일본 시장 프리미엄
  const premium = s && aged ? mod(s, 'appeal:premium') : 1;
  const incense = s && (p.flavor.incense ?? 0) >= 8 ? regionOf(s).incensePremium ?? 1 : 1;
  // 면세 전용 한정판(제주)
  const limited = p.dutyFreeOnly ? DUTY_FREE.limitedAppeal : 1;
  return Math.pow(Math.max(p.quality, 1) / 60, 1.6) * (0.6 + 0.4 * (p.typicity / 100)) * lux * ageBonus * (1 - sourcedPenalty * p.sourcedShare) * trend * premium * incense * limited;
}

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
  const marketL = (m.baseCases * 9 / 12) * region.seasonality[monthOfYear - 1]! * (s.trend[p.category] ?? 1) * mod(s, `demand:${p.category}`) * mod(s, 'demand:all') * siteOf(s).demandFactor;
  const cov = clamp(coverage(s) + onlineCoverageBonus(s, p), 0, 1);
  const reach = (s.awareness * cov * m.shareCap) / Math.sqrt(Math.max(1, sameCategoryCount));
  const a = appeal(p, s);
  const bottleL = p.bottleMl / 1000;
  const consumerPricePerL = productConsumerPrice(s, p, region) / bottleL;
  const charm = Math.max(0, ...staffOf(s, 'sales').map((x) => x.stats.a));
  const elasticity = m.elasticity * (1 - 0.15 * (charm / 100));
  const ref = refPricePerL(region, p.category, p.abv);
  const priceFactor = m.baseCases > 0 ? Math.pow(consumerPricePerL / ref, -elasticity) : 0;
  const demandBottles = (marketL * reach * a * priceFactor) / bottleL;
  return { marketL, reach, appeal: a, consumerPricePerL, refPricePerL: ref, priceFactor, demandBottles };
}

/** 지정면세점 채널 수요 (제주) — 국내 기준가의 60%를 기준으로, 주세·부가세 없이 */
export function dutyFreeDemand(s: GameState, p: Product, sameCategoryCount: number, monthOfYear: number, region: RegionDef = regionOf(s)): number {
  if (!siteOf(s).dutyFree) return 0;
  const base = DUTY_FREE.market[p.category] ?? 0;
  const consumer = dutyFreeConsumerPrice(p);
  if (base <= 0 || consumer > DUTY_FREE.maxBottlePrice) return 0;
  const season = (siteOf(s).dutyFreeSeasonality ?? region.seasonality)[monthOfYear - 1]!;
  const marketL = (base * 9 / 12) * season * (s.trend[p.category] ?? 1) * mod(s, 'dutyfree');
  // 면세점 입점은 지역 상품 진열이 기본 → 영업 커버리지의 영향이 작다. 면세 전용 한정판은 전용 매대(점유 상한 ×2)
  const shareCap = DUTY_FREE.shareCap * (p.dutyFreeOnly ? DUTY_FREE.limitedShareCap : 1);
  const reach = (s.awareness * (0.3 + 0.5 * coverage(s)) * shareCap) / Math.sqrt(Math.max(1, sameCategoryCount));
  const bottleL = p.bottleMl / 1000;
  const ref = refPricePerL(region, p.category, p.abv) * DUTY_FREE.refFactor;
  const priceFactor = Math.pow(consumer / bottleL / ref, -region.market[p.category].elasticity);
  return (marketL * reach * appeal(p, s) * priceFactor) / bottleL;
}

export interface SalesResult {
  productId: string; name: string; bottles: number; revenue: number; demandBottles: number; distribution: number;
  /** 면세 채널 판매 병수 (bottles에 포함) */
  dutyFree: number;
  /** 국내 판매분 주세 (감면 후) / 전통주 감면액 */
  tax: number; relief: number;
}

/** 병당 유통비 = 채널 수수료(출고가 비례) + 물류비 × 산지 출고 물류 배수 */
export function distributionCostPerBottle(price: number, bottleMl: number, outbound = 1): number {
  return price * DISTRIBUTION.channelFeeRate + logisticsCost(bottleMl) * outbound;
}

/** 병당 공헌이익과 공헌이익률 (출고가 − 생산 원가 − 유통비) */
export function bottleMargin(p: Pick<Product, 'price' | 'unitCost' | 'bottleMl'>, outbound = 1): { perBottle: number; rate: number } {
  const perBottle = p.price - p.unitCost - distributionCostPerBottle(p.price, p.bottleMl, outbound);
  return { perBottle, rate: p.price > 0 ? perBottle / p.price : 0 };
}

export function runSales(s: GameState, rng: Rng, monthOfYear: number): SalesResult[] {
  const region = regionOf(s);
  const site = siteOf(s);
  const counts: Partial<Record<ProductCategory, number>> = {};
  for (const p of s.products) if (p.stockBottles > 0) counts[p.category] = (counts[p.category] ?? 0) + 1;
  const shipped = region.traditional ? rollTraditionalYear(s) : null;
  const out: SalesResult[] = [];
  for (const p of s.products) {
    if (p.stockBottles <= 0) { p.lastMonthSold = 0; p.lastMonthDutyFree = 0; continue; }
    const d = demandFor(s, p, counts[p.category] ?? 1, monthOfYear, region);
    const noise = rng.range(0.9, 1.1);
    const domestic = p.dutyFreeOnly ? 0 : Math.round(d.demandBottles * noise);
    const df = Math.round(dutyFreeDemand(s, p, counts[p.category] ?? 1, monthOfYear, region) * noise);
    const demand = domestic + df;
    const sold = Math.min(p.stockBottles, demand);
    const dfSold = demand > 0 ? Math.round((sold * df) / demand) : 0;
    const domSold = sold - dfSold;
    // 주세는 국내 판매분만. 전통주는 이번 달 시작 시점의 누적 출고 구간으로 감면율을 정한다
    const relief = traditionalReliefRate(s, p.traditional);
    const opts = { category: p.category, relief };
    const tax = domSold * liquorTaxPerBottle(region, p.price, p.bottleMl, p.abv, opts);
    const fullTax = domSold * liquorTaxPerBottle(region, p.price, p.bottleMl, p.abv, { category: p.category });
    if (p.traditional && shipped) shipped.liters += (sold * p.bottleMl) / 1000;
    p.stockBottles -= sold;
    p.lastMonthSold = sold;
    p.lastMonthDutyFree = dfSold;
    p.totalSold += sold;
    // 면세 판매분은 섬 안에서 소화 → 육지 출고 물류 할증 없음
    const distribution = domSold * distributionCostPerBottle(p.price, p.bottleMl, site.outboundLogistics) + dfSold * distributionCostPerBottle(p.price, p.bottleMl);
    out.push({ productId: p.id, name: p.name, bottles: sold, revenue: sold * p.price, demandBottles: demand, distribution: Math.round(distribution), dutyFree: dfSold, tax, relief: fullTax - tax });
  }
  return out;
}

export interface VisitorSale { productId: string; bottles: number; revenue: number; tax: number }

/**
 * 증류소 투어·직판장 (결정 #65): 방문객 = 산지 관광 잠재력 × 계절 × (0.5 + 인지도). 1인당 0.12병을 매력도에 비례해 나눠 산다.
 * 직판은 소비자가로 팔고 부가세·주세만 내므로 유통 마진(채널 수수료·소매 마진)을 증류소가 가져간다
 */
export function runVisitorSales(s: GameState, monthOfYear: number): VisitorSale[] {
  if (!hasUpgrade(s, 'visitor')) return [];
  const region = regionOf(s);
  const visitors = siteOf(s).tourism * region.seasonality[monthOfYear - 1]! * mod(s, 'demand:all') * (0.5 + s.awareness);
  const items = s.products.filter((p) => p.stockBottles > 0 && !p.dutyFreeOnly);
  const weights = items.map((p) => appeal(p, s));
  const total = weights.reduce((a, b) => a + b, 0);
  if (!items.length || total <= 0) return [];
  const bottles = visitors * VISITOR.bottlesPerVisitor;
  const out: VisitorSale[] = [];
  items.forEach((p, i) => {
    const n = Math.min(p.stockBottles, Math.round((bottles * weights[i]!) / total));
    if (n <= 0) return;
    const opts = { category: p.category, relief: traditionalReliefRate(s, p.traditional) };
    const consumer = consumerPrice(region, p.price, p.bottleMl, p.abv, 1, opts);
    const tax = liquorTaxPerBottle(region, p.price, p.bottleMl, p.abv, opts);
    p.stockBottles -= n;
    p.totalSold += n;
    p.lastMonthSold += n;
    out.push({ productId: p.id, bottles: n, revenue: Math.round(n * (consumer / (1 + region.tax.vat) - tax)), tax: Math.round(n * tax) });
  });
  return out;
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
