import { DISTRIBUTION, PACKAGING, logisticsCost } from './content/catalog';
import { KOREA, consumerMultiplier, refPricePerL, type RegionDef } from './content/korea';
import { clamp } from './flavor';
import { staffOf } from './util';
import type { GameState, Product, ProductCategory } from './types';
import type { Rng } from './rng';

// 수요 공식 (PRD §9.2) — 수치 [튜닝]

/** 유통 커버리지: 영업 직원 네트워크 스탯 기반 */
export function coverage(s: GameState): number {
  return clamp(0.03 + staffOf(s, 'sales').reduce((t, x) => t + 0.04 + (x.stats.b / 100) * 0.12, 0), 0, 1);
}

/** 영업 협상 스탯: 유통 마진 최대 10% 절감 */
export function effectiveConsumerMultiplier(s: GameState, region: RegionDef = KOREA): number {
  const best = Math.max(0, ...staffOf(s, 'sales').map((x) => x.stats.c));
  const markup = region.retailMarkup * (1 - 0.1 * (best / 100));
  return consumerMultiplier({ ...region, retailMarkup: markup });
}

export function appeal(p: Product): number {
  const ageBonus = p.category === 'whisky' && p.ageYears ? 1 + 0.06 * Math.min(p.ageYears, 12) : 1;
  const lux = PACKAGING[p.packagingId]?.luxury ?? 1;
  return Math.pow(Math.max(p.quality, 1) / 60, 1.6) * (0.6 + 0.4 * (p.typicity / 100)) * lux * ageBonus * (1 - 0.15 * p.sourcedShare);
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

export function demandFor(s: GameState, p: Product, sameCategoryCount: number, monthOfYear: number, region: RegionDef = KOREA): DemandBreakdown {
  const m = region.market[p.category];
  const marketL = (m.baseCases * 9 / 12) * region.seasonality[monthOfYear - 1]! * (s.trend[p.category] ?? 1);
  const reach = (s.awareness * coverage(s) * m.shareCap) / Math.sqrt(Math.max(1, sameCategoryCount));
  const a = appeal(p);
  const bottleL = p.bottleMl / 1000;
  const consumerPricePerL = (p.price * effectiveConsumerMultiplier(s, region)) / bottleL;
  const charm = Math.max(0, ...staffOf(s, 'sales').map((x) => x.stats.a));
  const elasticity = m.elasticity * (1 - 0.15 * (charm / 100));
  const ref = refPricePerL(region, p.category, p.abv);
  const priceFactor = Math.pow(consumerPricePerL / ref, -elasticity);
  const demandBottles = (marketL * reach * a * priceFactor) / bottleL;
  return { marketL, reach, appeal: a, consumerPricePerL, refPricePerL: ref, priceFactor, demandBottles };
}

export interface SalesResult { productId: string; name: string; bottles: number; revenue: number; demandBottles: number; distribution: number }

/** 병당 유통비 = 채널 수수료(출고가 비례) + 물류비 */
export function distributionCostPerBottle(price: number, bottleMl: number): number {
  return price * DISTRIBUTION.channelFeeRate + logisticsCost(bottleMl);
}

/** 병당 공헌이익과 공헌이익률 (출고가 − 생산 원가 − 유통비) */
export function bottleMargin(p: Pick<Product, 'price' | 'unitCost' | 'bottleMl'>): { perBottle: number; rate: number } {
  const perBottle = p.price - p.unitCost - distributionCostPerBottle(p.price, p.bottleMl);
  return { perBottle, rate: p.price > 0 ? perBottle / p.price : 0 };
}

export function runSales(s: GameState, rng: Rng, monthOfYear: number): SalesResult[] {
  const counts: Partial<Record<ProductCategory, number>> = {};
  for (const p of s.products) if (p.stockBottles > 0) counts[p.category] = (counts[p.category] ?? 0) + 1;
  const out: SalesResult[] = [];
  for (const p of s.products) {
    if (p.stockBottles <= 0) { p.lastMonthSold = 0; continue; }
    const d = demandFor(s, p, counts[p.category] ?? 1, monthOfYear);
    const demand = Math.round(d.demandBottles * rng.range(0.9, 1.1));
    const sold = Math.min(p.stockBottles, demand);
    p.stockBottles -= sold;
    p.lastMonthSold = sold;
    p.totalSold += sold;
    out.push({ productId: p.id, name: p.name, bottles: sold, revenue: sold * p.price, demandBottles: demand, distribution: Math.round(sold * distributionCostPerBottle(p.price, p.bottleMl)) });
  }
  return out;
}

/** 인지도 계수 [튜닝] — 월 500만 원 마케팅 단독이면 평형 인지도 ≈ 0.4 */
export const AWARENESS = { marketing: 0.012, wordOfMouth: 0.000003, decay: 0.012 };

/** 인지도 갱신: 마케팅 + 입소문(판매량 × 품질) − 망각 */
export function updateAwareness(s: GameState, sales: SalesResult[]): void {
  const bottles = sales.reduce((t, x) => t + x.bottles, 0);
  const avgQ = s.products.length ? s.products.reduce((t, p) => t + p.quality, 0) / s.products.length : 50;
  const a = s.awareness;
  const gain = (AWARENESS.marketing * Math.log10(1 + s.marketingBudget / 1_000_000) + AWARENESS.wordOfMouth * bottles * (avgQ / 60)) * (1 - a);
  s.awareness = clamp(a + gain - AWARENESS.decay * a, 0.001, 0.95);
}

export function updateTrends(s: GameState, rng: Rng): void {
  for (const k of Object.keys(s.trend) as ProductCategory[]) {
    const t = s.trend[k];
    s.trend[k] = clamp(t * Math.exp(rng.normal(0, 0.015)) + 0.05 * (1 - t), 0.6, 1.5);
  }
}
