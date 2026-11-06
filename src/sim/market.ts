import { DISTRIBUTION, PACKAGING, logisticsCost } from './content/catalog';
import { consumerPrice, refPricePerL, regionOf, siteOf, traditionalTaxFactor, type RegionDef } from './content/regions';
import { DUTY_FREE, dutyFreeDemand, dutyFreeEditionAppeal, outboundLogistics } from './sites';
import { agePerception } from './blending';
import { overhangFactor, ownershipOversold, OWNERSHIP, retailCapacityCases, RETAIL } from './ops';
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
  // 입지 특성 (결정 #86~): 대형 유통 입점은 숙성 위스키의 프리미엄 이미지를 깎는다 / 미즈나라 인센스 향은 일본 프리미엄 / 면세 한정판
  const premium = s && aged ? mod(s, 'appeal:premium') : 1;
  const incense = region?.incensePremium && (p.flavor.incense ?? 0) >= 8 ? region.incensePremium : 1;
  const edition = dutyFreeEditionAppeal(p);
  return Math.pow(Math.max(p.quality, 1) / 60, 1.6) * (0.6 + 0.4 * (p.typicity / 100)) * lux * ageBonus * brand * label * specialty * trend * premium * incense * edition;
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
  const marketL = (m.baseCases * 9 / 12) * region.seasonality[monthOfYear - 1]! * (s.trend[p.category] ?? 1) * mod(s, `demand:${p.category}`) * mod(s, 'demand:all') * (siteOf(s).demandFactor ?? 1);
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

export function runSales(s: GameState, rng: Rng, monthOfYear: number): { results: SalesResult[]; retail: RetailSummary } {
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
    for (const p of s.products) {
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
  return { results: out, retail: { capacityCases: cap, soldCases: Math.round(soldCases), overflowCases: Math.round(overflowCases), lostBottles: lost } };
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
  const avgQ = s.products.length ? s.products.reduce((t, p) => t + p.quality, 0) / s.products.length : 50;
  const a = s.awareness;
  const gain = (AWARENESS.marketing * Math.log10(1 + s.marketingBudget / 1_000_000) * mod(s, 'awareness_gain') + AWARENESS.wordOfMouth * bottles * (avgQ / 60)) * (1 - a);
  s.awareness = clamp(a + gain - AWARENESS.decay * a, 0.001, 0.95);
  return AWARENESS.wordOfMouth * DUTY_FREE.wordOfMouthWeight * dutyFree * (avgQ / 60) * (1 - a);
}

export function updateTrends(s: GameState, rng: Rng): void {
  for (const k of Object.keys(s.trend) as ProductCategory[]) {
    const t = s.trend[k];
    s.trend[k] = clamp(t * Math.exp(rng.normal(0, 0.015)) + 0.05 * (1 - t), 0.6, 1.5);
  }
}
