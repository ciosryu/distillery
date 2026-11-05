import { BOTTLING_LABOR_PER_BOTTLE, PACKAGING, packagingCost } from './content/catalog';
import { CATEGORY } from './content/categories';
import { priceForConsumer, refPricePerL, regionOf, type RegionDef, type TaxOptions } from './content/regions';
import { siteOf } from './content/sites';
import { dutyFreeSlotBlocker, nextDutyFreeEdition, traditionalReliefRate } from './sites';
import { clampFlavor, evaluate, weightedAverage, type Evaluation } from './flavor';
import { emptyCask } from './maturation';
import { bestBy, nid, staffOf } from './util';
import { mod } from './modifiers';
import type { AxisId, Flavor, GameState, Product, ProductCategory, SpiritKind, SpiritLot } from './types';

export interface BlendComponent { source: 'cask' | 'lot'; id: string; liters: number }
export interface BottleOptions { name: string; targetAbv: number | 'cask'; bottleMl: number; chillFilter: boolean; packagingId: string; /** 면세 전용 한정판(제주) */ dutyFreeOnly?: boolean }

export interface BlendPreview {
  ok: boolean;
  errors: string[];
  warnings: string[];
  kind: SpiritKind | null;
  category: ProductCategory | null;
  volumeL: number;
  lpa: number;
  mixAbv: number;
  finalAbv: number;
  bottles: number;
  minOakMonths: number;
  ageYears: number | null;
  flavor: Flavor;
  evaluation: Evaluation | null;
  unitCost: number;
  sourcedShare: number;
  suggestedPrice: number;
  /** 전통주 자격 (모든 구성 원액이 전통주 원액) */
  traditional: boolean;
  /** 산지 원료 제품 (면세 기념품 보너스 대상) */
  localIngredient: boolean;
  /** 면세 한정판으로 내면 붙을 판 번호·연속 완판 수 */
  dfEdition: { vol: number; streak: number } | null;
}

/** 공통 "위스키" 최소 숙성 — 국가별 값은 CountryDef.whiskyMinMonths (대만 24) */
export const WHISKY_MIN_MONTHS = 36;
export const MIN_BOTTLING_ABV: Record<ProductCategory, number> = { whisky: 0.4, grain_whisky: 0.4, blended_whisky: 0.4, baijiu: 0.3, malt_spirit: 0.3, soju_distilled: 0.17, gin: 0.375, flavored_spirit: 0.2 };

export function lotOf(s: GameState, c: BlendComponent): SpiritLot | undefined {
  return c.source === 'cask' ? s.casks.find((k) => k.id === c.id)?.contents : s.lots.find((l) => l.id === c.id);
}

/** 라벨 판정 (대표 법규만) */
export function categorize(kind: SpiritKind, minOakMonths: number, abv: number, flavor: Flavor, hasGrain = kind === 'grain', hasMalt = kind === 'malt', minMonths = WHISKY_MIN_MONTHS): ProductCategory {
  if (kind === 'soju') return 'soju_distilled';
  if (kind === 'baijiu') return 'baijiu';
  if (kind === 'gin') return evaluate(flavor, 'gin').labelOk && abv >= MIN_BOTTLING_ABV.gin ? 'gin' : 'flavored_spirit';
  if (minOakMonths < minMonths || abv < MIN_BOTTLING_ABV.whisky) return 'malt_spirit';
  if (hasMalt && hasGrain) return 'blended_whisky';
  return hasGrain ? 'grain_whisky' : 'whisky';
}

const WHISKY_CATS: ProductCategory[] = ['whisky', 'grain_whisky', 'blended_whisky'];
export const isWhiskyCategory = (c: ProductCategory) => WHISKY_CATS.includes(c);

/** 원액(탱크·캐스크)을 지금 병입한다면 받을 카테고리 — 평가 표시용 */
export function lotCategory(lot: SpiritLot, minMonths = WHISKY_MIN_MONTHS): ProductCategory {
  if (lot.kind === 'soju') return 'soju_distilled';
  if (lot.kind === 'baijiu') return 'baijiu';
  if (lot.kind === 'gin') return 'gin';
  if (lot.oakMonths < minMonths) return 'malt_spirit';
  return lot.kind === 'grain' ? 'grain_whisky' : 'whisky';
}

/** 권장 출고가 — 기준 소비자가에서 세금(기준판매비율·전통주 감면 반영)을 역산 */
export function suggestedPrice(region: RegionDef, category: ProductCategory, bottleMl: number, quality: number, ageYears: number | null, abv: number, tax: TaxOptions = { category }): number {
  const ageBonus = isWhiskyCategory(category) && ageYears ? 1 + 0.06 * Math.min(ageYears, 12) : 1;
  const consumer = refPricePerL(region, category, abv) * (bottleMl / 1000) * Math.sqrt(Math.max(quality, 20) / 60) * ageBonus;
  const p = priceForConsumer(region, consumer, bottleMl, abv, { category, ...tax });
  return Math.round(p / 100) * 100;
}

export function previewBlend(s: GameState, components: BlendComponent[], opts: BottleOptions): BlendPreview {
  const errors: string[] = [];
  const warnings: string[] = [];
  const items: { lot: SpiritLot; liters: number }[] = [];
  for (const c of components) {
    if (c.liters <= 0) continue;
    const lot = lotOf(s, c);
    if (!lot) { errors.push('원액을 찾을 수 없습니다'); continue; }
    if (c.liters > lot.volumeL + 1e-6) errors.push(`${lot.name}: 보유량(${lot.volumeL.toFixed(1)}L)보다 많이 선택했습니다`);
    items.push({ lot, liters: Math.min(c.liters, lot.volumeL) });
  }
  const empty: BlendPreview = { ok: false, errors, warnings, kind: null, category: null, volumeL: 0, lpa: 0, mixAbv: 0, finalAbv: 0, bottles: 0, minOakMonths: 0, ageYears: null, flavor: {}, evaluation: null, unitCost: 0, sourcedShare: 0, suggestedPrice: 0, traditional: false, localIngredient: false, dfEdition: null };
  if (!items.length) { errors.push('블렌딩할 원액을 선택하세요'); return empty; }
  const kinds = new Set(items.map((i) => i.lot.kind));
  const whiskyMix = [...kinds].every((k) => k === 'malt' || k === 'grain');
  if (kinds.size > 1 && !whiskyMix) { errors.push('서로 다른 주종은 섞을 수 없습니다 (몰트+그레인 블렌디드만 가능)'); return { ...empty, errors }; }
  const hasMalt = kinds.has('malt');
  const hasGrain = kinds.has('grain');
  const kind = hasMalt ? 'malt' : items[0]!.lot.kind;

  const volumeL = items.reduce((t, i) => t + i.liters, 0);
  const lpa = items.reduce((t, i) => t + i.liters * i.lot.abv, 0);
  const mixAbv = lpa / volumeL;
  let finalAbv = opts.targetAbv === 'cask' ? mixAbv : opts.targetAbv;
  if (finalAbv > mixAbv + 1e-6) { errors.push(`목표 도수(${(finalAbv * 100).toFixed(1)}%)가 원액 도수(${(mixAbv * 100).toFixed(1)}%)보다 높습니다`); finalAbv = mixAbv; }
  const minOakMonths = Math.min(...items.map((i) => i.lot.oakMonths));
  const sourcedShare = items.reduce((t, i) => t + (i.lot.sourced ? i.liters * i.lot.abv : 0), 0) / lpa;
  const traditional = items.every((i) => i.lot.traditional);
  const localIngredient = items.every((i) => i.lot.localIngredient);

  let flavor = weightedAverage(items.map((i) => ({ flavor: i.lot.flavor, weight: i.liters * i.lot.abv })));
  // 가수: 지각 강도 약화, 자극 완화
  const ratio = finalAbv / mixAbv;
  const f: Flavor = {};
  for (const [k, v] of Object.entries(flavor) as [AxisId, number][]) {
    if (k === 'harshness') f[k] = v * Math.pow(ratio, 0.8);
    else if (k === 'integration' || k === 'color') f[k] = v;
    else f[k] = v * Math.pow(ratio, 0.3);
  }
  // 블렌더(디스틸러 직관 스탯) 매링 보너스
  const blender = bestBy(staffOf(s, 'distiller'), 'c');
  if (blender && items.length > 1) f.integration = (f.integration ?? 0) + blender.stats.c / 20;
  if (opts.chillFilter) { f.body = (f.body ?? 0) - 8; f.oily_waxy = (f.oily_waxy ?? 0) * 0.8; }
  flavor = clampFlavor(f);

  const minMonths = regionOf(s).whiskyMinMonths;
  const category = categorize(kind, minOakMonths, finalAbv, flavor, hasGrain, hasMalt, minMonths);
  if ((hasMalt || hasGrain) && category === 'malt_spirit') warnings.push(minOakMonths < minMonths ? `오크 숙성 ${minOakMonths}개월 — ${minMonths}개월 미만이라 "위스키" 표기 불가(몰트 스피릿)` : '도수 40% 미만 — 위스키 표기 불가');
  if (opts.dutyFreeOnly && !siteOf(s).dutyFree) errors.push('면세 전용 한정판은 지정면세점이 있는 산지(제주)에서만 만들 수 있습니다');
  else if (opts.dutyFreeOnly) {
    const blocker = dutyFreeSlotBlocker(s);
    if (blocker) errors.push(blocker);
    else if (!localIngredient) warnings.push('제주 원료(차조·청귤)를 쓰지 않은 한정판 — 기념품 매력도 보너스 없음');
  }
  if (kind === 'gin' && category === 'flavored_spirit') warnings.push('주니퍼가 지배적이지 않거나 도수 37.5% 미만 — "진" 표기 불가(기타 증류주)');
  if (finalAbv < MIN_BOTTLING_ABV[category]) errors.push(`${CATEGORY[category].nameKo} 최소 병입 도수는 ${(MIN_BOTTLING_ABV[category] * 100).toFixed(1)}%`);
  if (!opts.chillFilter && finalAbv < 0.46 && (hasMalt || hasGrain)) warnings.push('논칠필터 + 46% 미만 — 저온 혼탁 클레임 위험');
  if (!PACKAGING[opts.packagingId]) errors.push('패키징을 선택하세요');

  const ageYears = isWhiskyCategory(category) ? Math.floor(minOakMonths / 12) : null;
  const finalVolume = lpa / finalAbv;
  const bottles = Math.floor(finalVolume / (opts.bottleMl / 1000));
  if (bottles < 1) errors.push('병입할 양이 부족합니다');
  const spiritCost = items.reduce((t, i) => t + i.liters * i.lot.abv * i.lot.costPerLPA, 0);
  const perBottleFixed = packagingUnitCost(s, opts) + BOTTLING_LABOR_PER_BOTTLE;
  const unitCost = bottles > 0 ? spiritCost / bottles + perBottleFixed : 0;
  const evaluation = evaluate(flavor, category);
  return {
    ok: errors.length === 0, errors, warnings, kind, category, volumeL: finalVolume, lpa, mixAbv, finalAbv, bottles,
    minOakMonths, ageYears, flavor, evaluation, unitCost: Math.round(unitCost), sourcedShare, traditional, localIngredient,
    dfEdition: opts.dutyFreeOnly && siteOf(s).dutyFree ? nextDutyFreeEdition(s) : null,
    suggestedPrice: suggestedPrice(regionOf(s), category, opts.bottleMl, evaluation.quality, ageYears, finalAbv, { category, relief: traditionalReliefRate(s, traditional) }),
  };
}

/** 병당 포장재 원가 — 이벤트 보정 × 산지 운송 할증 */
function packagingUnitCost(s: GameState, opts: Pick<BottleOptions, 'packagingId' | 'bottleMl'>): number {
  return packagingCost(opts.packagingId, opts.bottleMl) * mod(s, 'packaging') * siteOf(s).freight.packaging;
}

/** 블렌딩·병입 실행 (s는 변경 가능한 복제본) */
export function executeBlend(s: GameState, components: BlendComponent[], opts: BottleOptions): { error?: string; product?: Product } {
  const p = previewBlend(s, components, opts);
  if (!p.ok || !p.category || !p.evaluation) return { error: p.errors.join(' / ') || '병입할 수 없습니다' };
  for (const c of components) {
    if (c.liters <= 0) continue;
    if (c.source === 'cask') {
      const idx = s.casks.findIndex((k) => k.id === c.id);
      const cask = s.casks[idx]!;
      const lot = cask.contents!;
      const remain = lot.volumeL - c.liters;
      s.casks[idx] = remain < 1 ? emptyCask(cask) : { ...cask, contents: { ...lot, volumeL: remain } };
    } else {
      const idx = s.lots.findIndex((l) => l.id === c.id);
      const lot = s.lots[idx]!;
      const remain = lot.volumeL - c.liters;
      if (remain < 1) s.lots.splice(idx, 1);
      else s.lots[idx] = { ...lot, volumeL: remain };
    }
  }
  const product: Product = {
    id: nid(s, 'P'),
    name: opts.name.trim() || `${CATEGORY[p.category].nameKo} ${s.products.length + 1}`,
    category: p.category,
    ageYears: p.ageYears,
    abv: p.finalAbv,
    bottleMl: opts.bottleMl,
    chillFiltered: opts.chillFilter,
    packagingId: opts.packagingId,
    flavor: p.flavor,
    quality: p.evaluation.quality,
    typicity: p.evaluation.typicity,
    style: p.evaluation.style,
    sourcedShare: p.sourcedShare,
    stockBottles: p.bottles,
    price: p.suggestedPrice,
    unitCost: p.unitCost,
    createdMonth: s.month,
    lastMonthSold: 0,
    totalSold: 0,
    ...(p.traditional ? { traditional: true } : {}),
    ...(p.localIngredient ? { localIngredient: true } : {}),
    ...(opts.dutyFreeOnly ? { dutyFreeOnly: true } : {}),
    ...(p.dfEdition ? { dfEdition: { ...p.dfEdition } } : {}),
  };
  if (p.dfEdition) s.siteState.dfSeries = { vol: p.dfEdition.vol, streak: p.dfEdition.streak };
  // 포장재·병입 인건비는 병입 시점에 지출
  s.cash -= Math.round((packagingUnitCost(s, opts) + BOTTLING_LABOR_PER_BOTTLE) * p.bottles);
  s.products.push(product);
  return { product };
}
