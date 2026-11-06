import { BOTTLING_LABOR_PER_BOTTLE, PACKAGING, packagingCost } from './content/catalog';
import { CATEGORY } from './content/categories';
import { BULK, INGREDIENTS } from './content/catalog';
import { DEFAULT_WHISKY_RULES, priceForConsumer, refPricePerL, regionOf, traditionalTaxFactor, type RegionDef, type WhiskyRules } from './content/regions';
import { clampFlavor, evaluate, weightedAverage, type Evaluation } from './flavor';
import { emptyCask } from './maturation';
import { ownsFacility } from './ops';
import { dutyFreeAgedAppeal, dutyFreeSlotBlocker, dutyFreeSuggestedPrice, hasDutyFree, nextDutyFreeEdition, siteFreight, DUTY_FREE } from './sites';
import { bestBy, nid, staffOf } from './util';
import { mod } from './modifiers';
import type { AxisId, Flavor, GameState, Product, ProductCategory, SpiritKind, SpiritLot } from './types';

export interface BlendComponent { source: 'cask' | 'lot'; id: string; liters: number }
export interface BottleOptions { name: string; targetAbv: number | 'cask'; bottleMl: number; chillFilter: boolean; packagingId: string; /** 면세 전용 한정판(제주, 결정 #87) */ dutyFreeOnly?: boolean }

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
  /** 매입 원액의 브랜드 가치 0~1 (매입 원액이 없으면 1) */
  sourcedPrestige: number;
  specialty: string | null;
  premiumLabel: boolean;
  traditional: boolean;
  suggestedPrice: number;
  /** 입지 원료 제품 (면세 기념품 보너스 대상, 결정 #87) */
  localIngredient: boolean;
  /** 면세 한정판으로 내면 붙을 판 번호·연속 완판 수 */
  dfEdition: { vol: number; streak: number } | null;
}

/** 기본(스코틀랜드·EU식) 위스키 최소 숙성. 지역별 규칙은 RegionDef.whisky */
export const WHISKY_MIN_MONTHS = DEFAULT_WHISKY_RULES.minMonths;

/** 이 규칙에서 "위스키"가 되는 최소 오크 숙성 개월 (나무통 요건이 있으면 최소 1개월) */
export const whiskyMinMonths = (rules: WhiskyRules) => Math.max(rules.minMonths, rules.requiresOak ? 1 : 0);

/** 매입 원액 브랜드 가치: LPA당 매입가가 뉴메이크 기준가의 2.8배(약 3만 5천 원 — 3년급 저가 원액) 이하면 0,
 *  6.3배(약 7만 9천 원 — 12년급 고가 원액) 이상이면 1. 브로커 매물 기준 3년 10개월 ≈ 0.1, 9년 ≈ 0.5, 12년 ≈ 1 */
export function sourcedPrestigeOf(costPerLPA: number): number {
  return Math.max(0, Math.min(1, (costPerLPA / BULK.newMakeBase - 2.8) / 3.5));
}
export const MIN_BOTTLING_ABV: Record<ProductCategory, number> = { whisky: 0.4, grain_whisky: 0.4, blended_whisky: 0.4, baijiu: 0.3, malt_spirit: 0.3, soju_distilled: 0.17, gin: 0.375, flavored_spirit: 0.2 };

export function lotOf(s: GameState, c: BlendComponent): SpiritLot | undefined {
  return c.source === 'cask' ? s.casks.find((k) => k.id === c.id)?.contents : s.lots.find((l) => l.id === c.id);
}

/** 라벨 판정 (대표 법규만) */
export function categorize(kind: SpiritKind, minOakMonths: number, abv: number, flavor: Flavor, hasGrain = kind === 'grain', hasMalt = kind === 'malt', rules: WhiskyRules = DEFAULT_WHISKY_RULES): ProductCategory {
  if (kind === 'soju') return 'soju_distilled';
  if (kind === 'baijiu') return 'baijiu';
  if (kind === 'gin') return evaluate(flavor, 'gin').labelOk && abv >= MIN_BOTTLING_ABV.gin ? 'gin' : 'flavored_spirit';
  if (minOakMonths < whiskyMinMonths(rules) || abv < MIN_BOTTLING_ABV.whisky) return 'malt_spirit';
  if (hasMalt && hasGrain) return 'blended_whisky';
  return hasGrain ? 'grain_whisky' : 'whisky';
}

const WHISKY_CATS: ProductCategory[] = ['whisky', 'grain_whisky', 'blended_whisky'];
export const isWhiskyCategory = (c: ProductCategory) => WHISKY_CATS.includes(c);

/** 원액(탱크·캐스크)을 지금 병입한다면 받을 카테고리 — 평가 표시용 */
export function lotCategory(lot: SpiritLot, rules: WhiskyRules = DEFAULT_WHISKY_RULES): ProductCategory {
  if (lot.kind === 'soju') return 'soju_distilled';
  if (lot.kind === 'baijiu') return 'baijiu';
  if (lot.kind === 'gin') return 'gin';
  if (lot.oakMonths < whiskyMinMonths(rules)) return 'malt_spirit';
  return lot.kind === 'grain' ? 'grain_whisky' : 'whisky';
}

/** 숙성 연수에 대한 소비자 인식 (위스키류). 3년 = 1.18, 이후 1년마다 +0.06(12년까지).
 *  3년 미만은 법적으로 위스키라도 "어린 위스키"로 보고 크게 깎는다 — 0개월 0.47, 12개월 0.77, 24개월 0.98 (v0.8) */
export function agePerception(oakMonths: number): number {
  if (oakMonths >= 36) return 1 + 0.06 * Math.min(Math.floor(oakMonths / 12), 12);
  return 1.18 * (0.4 + 0.6 * Math.pow(Math.max(0, oakMonths) / 36, 0.8));
}

export function suggestedPrice(region: RegionDef, category: ProductCategory, bottleMl: number, quality: number, oakMonths: number | null, abv: number, taxFactor = 1): number {
  const ageBonus = isWhiskyCategory(category) && oakMonths != null ? agePerception(oakMonths) : 1;
  const consumer = refPricePerL(region, category, abv) * (bottleMl / 1000) * Math.sqrt(Math.max(quality, 20) / 60) * ageBonus;
  const p = priceForConsumer(region, consumer, bottleMl, abv, taxFactor);
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
    if (c.source === 'cask' && s.casks.find((k) => k.id === c.id)?.owner) { errors.push('고객 소유(캐스크 오너십) 캐스크는 병입할 수 없습니다'); continue; }
    if (c.liters > lot.volumeL + 1e-6) errors.push(`${lot.name}: 보유량(${lot.volumeL.toFixed(1)}L)보다 많이 선택했습니다`);
    items.push({ lot, liters: Math.min(c.liters, lot.volumeL) });
  }
  const empty: BlendPreview = { ok: false, errors, warnings, kind: null, category: null, volumeL: 0, lpa: 0, mixAbv: 0, finalAbv: 0, bottles: 0, minOakMonths: 0, ageYears: null, flavor: {}, evaluation: null, unitCost: 0, sourcedShare: 0, sourcedPrestige: 1, specialty: null, premiumLabel: false, traditional: false, suggestedPrice: 0, localIngredient: false, dfEdition: null };
  const region = regionOf(s);
  const rules = region.whisky;
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
  const sourcedLPA = items.reduce((t, i) => t + (i.lot.sourced ? i.liters * i.lot.abv : 0), 0);
  const sourcedShare = sourcedLPA / lpa;
  // 매입 원액 브랜드 가치 = 매입 원액들의 LPA당 매입가로 정한 값의 LPA 가중 평균
  const sourcedPrestige = sourcedLPA > 0 ? items.reduce((t, i) => t + (i.lot.sourced ? i.liters * i.lot.abv * sourcedPrestigeOf(i.lot.costPerLPA) : 0), 0) / sourcedLPA : 1;
  // 원재료 배합 비율 (LPA 가중) — 특산물 판정
  const mash: Record<string, number> = {};
  for (const i of items) for (const [id, v] of Object.entries(i.lot.mashShare ?? {})) mash[id] = (mash[id] ?? 0) + (v * i.liters * i.lot.abv) / lpa;

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
  // 하우스 스타일: 마스터 디스틸러가 쌓은 증류소 고유의 블렌딩 감각 (부사수 없이 은퇴하면 사라진다)
  if (s.houseStyle > 0) f.integration = (f.integration ?? 0) + s.houseStyle / 25;
  if (opts.chillFilter) { f.body = (f.body ?? 0) - 8; f.oily_waxy = (f.oily_waxy ?? 0) * 0.8; }
  flavor = clampFlavor(f);

  const category = categorize(kind, minOakMonths, finalAbv, flavor, hasGrain, hasMalt, rules);
  const minMonths = whiskyMinMonths(rules);
  if ((hasMalt || hasGrain) && category === 'malt_spirit') warnings.push(minOakMonths < minMonths ? `오크 숙성 ${minOakMonths}개월 — ${region.nameKo}에서는 ${rules.requiresOak && rules.minMonths === 0 ? '나무통 저장' : `${minMonths}개월 이상 숙성`}해야 "위스키" 표기 가능(몰트 스피릿)` : '도수 40% 미만 — 위스키 표기 불가');
  // 전통주(지역특산주): 자국 자생 원재료 비율이 기준 이상인 자사 원액 (한국 주세 경감 #73)
  const nativeShare = Object.entries(mash).reduce((t, [id, v]) => t + (INGREDIENTS[id]?.native?.includes(region.id) ? v : 0), 0);
  const traditional = !!region.traditionalRelief && sourcedShare === 0 && nativeShare >= region.traditionalRelief.nativeShare && ownsFacility(s, region.traditionalRelief.requiresFacility);
  if (region.traditionalRelief && !traditional && sourcedShare === 0 && nativeShare >= region.traditionalRelief.nativeShare) warnings.push(`국산 원료 ${Math.round(nativeShare * 100)}% — 농업경영체 등록이 있으면 ${region.traditionalRelief.label} 대상`);
  const premiumLabel = !!rules.premiumLabel && isWhiskyCategory(category) && minOakMonths >= rules.premiumLabel.minMonths && sourcedShare === 0;
  if (rules.premiumLabel && isWhiskyCategory(category) && !premiumLabel) warnings.push(`"${rules.premiumLabel.name}" 표기 불가(${rules.premiumLabel.minMonths}개월 이상 자사 원액만) — 매력도 ×${rules.premiumLabel.appealWithout}`);
  const specialty = region.specialties?.find((sp) => sp.category === category && (mash[sp.ingredientId] ?? 0) >= sp.minShare && sourcedShare === 0 && (!sp.siteOnly || sp.siteOnly === s.siteId)) ?? null;
  const missedSite = region.specialties?.find((sp) => sp.siteOnly && sp.siteOnly !== s.siteId && sp.category === category && (mash[sp.ingredientId] ?? 0) >= sp.minShare);
  if (missedSite) warnings.push(`"${missedSite.label}" 표기는 ${region.sites?.find((x) => x.id === missedSite.siteOnly)?.nameKo ?? missedSite.siteOnly} 증류소에서 만든 것만 가능`);
  if (sourcedShare > 0 && region.sourcedPenalty > 0) warnings.push(`매입 원액 ${Math.round(sourcedShare * 100)}% · 브랜드 가치 ${Math.round(sourcedPrestige * 100)}점 — 싼 원액일수록 저가 하이볼용으로만 팔린다`);
  if (kind === 'gin' && category === 'flavored_spirit') warnings.push('주니퍼가 지배적이지 않거나 도수 37.5% 미만 — "진" 표기 불가(기타 증류주)');
  if (finalAbv < MIN_BOTTLING_ABV[category]) errors.push(`${CATEGORY[category].nameKo} 최소 병입 도수는 ${(MIN_BOTTLING_ABV[category] * 100).toFixed(1)}%`);
  if (!opts.chillFilter && finalAbv < 0.46 && (hasMalt || hasGrain)) warnings.push('논칠필터 + 46% 미만 — 저온 혼탁 클레임 위험');
  if (!PACKAGING[opts.packagingId]) errors.push('패키징을 선택하세요');

  const ageYears = isWhiskyCategory(category) ? Math.floor(minOakMonths / 12) : null;
  // 면세 전용 한정판 (제주, 결정 #87): 전용 매대 1칸, 제주 원료 기념품 / 위스키는 숙성 연수 보너스
  const localIngredient = items.every((i) => i.lot.localIngredient);
  const dutyFree = !!opts.dutyFreeOnly;
  if (dutyFree && !hasDutyFree(s)) errors.push('면세 전용 한정판은 지정면세점이 있는 입지(제주)에서만 만들 수 있습니다');
  else if (dutyFree) {
    const blocker = dutyFreeSlotBlocker(s);
    if (blocker) errors.push(blocker);
    else if (!localIngredient) {
      const minAged = DUTY_FREE.agedTiers.at(-1)!;
      if (ageYears == null) warnings.push('제주 원료(차조·청귤)를 쓰지 않은 한정판 — 기념품 매력도 보너스 없음');
      else if (dutyFreeAgedAppeal(ageYears) <= 1) warnings.push(`숙성 ${ageYears}년 — ${minAged.years}년 이상이면 숙성 한정판 수요 ×${minAged.appeal} (가격 프리미엄은 없음)`);
    }
  }
  const finalVolume = lpa / finalAbv;
  const bottles = Math.floor(finalVolume / (opts.bottleMl / 1000));
  if (bottles < 1) errors.push('병입할 양이 부족합니다');
  const spiritCost = items.reduce((t, i) => t + i.liters * i.lot.abv * i.lot.costPerLPA, 0);
  const perBottleFixed = packagingUnitCost(s, opts) + BOTTLING_LABOR_PER_BOTTLE;
  const unitCost = bottles > 0 ? spiritCost / bottles + perBottleFixed : 0;
  const evaluation = evaluate(flavor, category);
  return {
    ok: errors.length === 0, errors, warnings, kind, category, volumeL: finalVolume, lpa, mixAbv, finalAbv, bottles,
    minOakMonths, ageYears, flavor, evaluation, unitCost: Math.round(unitCost), sourcedShare, sourcedPrestige, specialty: specialty?.id ?? null, premiumLabel, traditional,
    // 면세 전용 한정판은 면세 기준가로 권장가를 잡는다 (주세·부가세 없음)
    suggestedPrice: dutyFree && hasDutyFree(s)
      ? dutyFreeSuggestedPrice(region, category, opts.bottleMl, evaluation.quality, isWhiskyCategory(category) ? agePerception(minOakMonths) : 1, finalAbv)
      : suggestedPrice(region, category, opts.bottleMl, evaluation.quality, isWhiskyCategory(category) ? minOakMonths : null, finalAbv, traditionalTaxFactor(region, traditional, s.traditionalReleasedL, s.traditionalPrevYearL)),
    localIngredient,
    dfEdition: dutyFree && hasDutyFree(s) ? nextDutyFreeEdition(s) : null,
  };
}

/** 병당 포장재 원가 — 이벤트 보정 × 입지 운송 할증 (결정 #86) */
function packagingUnitCost(s: GameState, opts: Pick<BottleOptions, 'packagingId' | 'bottleMl'>): number {
  return packagingCost(opts.packagingId, opts.bottleMl) * mod(s, 'packaging') * siteFreight(s, 'packaging');
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
    oakMonths: p.minOakMonths,
    abv: p.finalAbv,
    bottleMl: opts.bottleMl,
    chillFiltered: opts.chillFilter,
    packagingId: opts.packagingId,
    flavor: p.flavor,
    quality: p.evaluation.quality,
    typicity: p.evaluation.typicity,
    style: p.evaluation.style,
    sourcedShare: p.sourcedShare,
    sourcedPrestige: p.sourcedPrestige,
    ...(p.specialty ? { specialty: p.specialty } : {}),
    premiumLabel: p.premiumLabel,
    ...(p.traditional ? { traditional: true } : {}),
    stockBottles: p.bottles,
    price: p.suggestedPrice,
    unitCost: p.unitCost,
    createdMonth: s.month,
    lastMonthSold: 0,
    totalSold: 0,
    ...(p.localIngredient ? { localIngredient: true } : {}),
    ...(opts.dutyFreeOnly && p.dfEdition ? { dutyFreeOnly: true, dfEdition: { ...p.dfEdition } } : {}),
  };
  if (p.dfEdition && opts.dutyFreeOnly) s.siteState.dfSeries = { vol: p.dfEdition.vol, streak: p.dfEdition.streak };
  // 첫 위스키 출시: 비지터 센터 입소문이 높으면 오픈런 (3개월간 수요 × (1 + 2 × 입소문))
  if (isWhiskyCategory(product.category) && !s.products.some((x) => isWhiskyCategory(x.category)) && s.localBuzz > 0.05) {
    product.launchBoost = { factor: 1 + 2 * s.localBuzz, untilMonth: s.month + 3 };
  }
  // 포장재·병입 인건비는 병입 시점에 지출
  s.cash -= Math.round((packagingUnitCost(s, opts) + BOTTLING_LABOR_PER_BOTTLE) * p.bottles);
  s.products.push(product);
  return { product };
}
