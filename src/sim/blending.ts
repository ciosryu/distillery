import { BOTTLING_LABOR_PER_BOTTLE, PACKAGING, packagingCost } from './content/catalog';
import type { PackagingChoice } from './content/packaging';
import { fixPackaging, nearestPresetId, packagingError, packagingPartsCost, presetChoice, productPackaging, sameChoice } from './packaging';
import { brandOf } from './brands';
import { CATEGORY } from './content/categories';
import { BULK, INGREDIENTS } from './content/catalog';
import { DEFAULT_WHISKY_RULES, priceForConsumer, refPricePerL, regionOf, traditionalTaxFactor, type RegionDef, type WhiskyRules } from './content/regions';
import { clampFlavor, evaluate, weightedAverage, type Evaluation } from './flavor';
import { emptyCask, finishLabel, finishOf } from './maturation';
import { ownsFacility } from './util';
import { siteFreight } from './sites';
import { dutyFreeAgedAppeal, dutyFreeSlotBlocker, dutyFreeSuggestedPrice, hasDutyFree, nextDutyFreeEdition, DUTY_FREE } from './dutyFree';
import { bestBy, nid, staffOf } from './util';
import { mod } from './modifiers';
import { hexOf, matchScore, mixHex } from './blendRadar';
import { COMMISSION, findTarget, knownReads, QUALITY_SIGMA_PER_HEX, revealNotes, sampleAxesOf } from './blendTable';
import { productCountEver } from './lifecycle';
import { agedWhitePerception } from './content/market';
import type { AxisId, CaskTypeId, Flavor, GameState, Hex, Product, ProductCategory, SpiritKind, SpiritLot } from './types';

export interface BlendComponent { source: 'cask' | 'lot'; id: string; liters: number }
export interface BottleOptions {
  name: string; targetAbv: number | 'cask'; bottleMl: number; chillFilter: boolean; packagingId: string;
  /** 면세 전용 한정판(제주, 결정 #87) */ dutyFreeOnly?: boolean;
  /** 블렌딩 테이블 (결정 #124): 맞출 목표 — 'trend' · 의뢰 id · 'line:<이름>' */ targetId?: string;
  /** 코어 레인지 라인 — 처음이면 이 배치가 기준 육각형이 되고, 다음 배치부터 일관성으로 평가 */ line?: string;
  /** 블렌더에게 맡긴 배팅 */ delegated?: boolean;
  /**
   * 기존 제품에 재고 보충 (#186, 2차 플레이테스트 오너 요청) — 새 제품을 만들지 않고 이 제품의 재고에 더한다.
   * 병 크기·도수·피니시·범주가 같아야 하고, 품질·향·원가는 남은 재고와 새 병 수로 가중 평균한다. 이름·출고가·판매 기록은 그대로
   */
  restockId?: string;
  /** 패키징 직접 고르기 (P-PROD-38) — 있으면 packagingId 대신 이 부품 조합으로 원가·럭셔리를 정한다 */
  packaging?: PackagingChoice;
}

/** 배팅 결과 공개 (P6) */
/** predicted = 블렌더가 아는 값(샘플 기록)으로 만든 예상. 아는 원액이 하나도 없으면 null (#157) */
export interface BlendReveal { targetLabel: string | null; score: number | null; predicted: Hex | null; actual: Hex; notes: string[]; rewardNote?: string }

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
  /** 최저 옹기(비목재 용기) 숙성 개월 — 섞은 원액의 restMonths 중 가장 짧은 값 (#217) */
  minRestMonths: number;
  /** 숙성 소주 표기 "옹기 N년 숙성" 등 — 대상이 아니면 null (#217 · #221) */
  agedLabel: string | null;
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
  /** 라벨 "○○ 캐스크 피니시" — 모든 원액이 같은 종류 캐스크로 피니싱됐을 때만 (#158) */
  finish: CaskTypeId | null;
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
  return c.source === 'cask' ? s.inventory.casks.find((k) => k.id === c.id)?.contents : s.inventory.lots.find((l) => l.id === c.id);
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

/** 병 숙성 프리미엄이 끝나는 연수 — 그 뒤로는 연수 표기가 값을 더 올리지 않는다 (§6.2.1) [튜닝] */
export const AGE_PREMIUM_CAP_YEARS = 18;

/** 숙성 1년당 병 프리미엄 상승률 = 같은 원액의 현물 시가 상승률(BULK). 블렌디드는 몰트·그레인 평균 (§6.2.1, #117)
 *  한 곳(BULK)에서 읽어 두 곡선이 다시 어긋나지 않게 한다 — 원액 시가와 병 가격이 같은 속도로 오른다 */
export function agePremiumRate(category: ProductCategory): number {
  if (category === 'grain_whisky') return BULK.grainAgePerYear;
  if (category === 'blended_whisky') return (BULK.agePerYear + BULK.grainAgePerYear) / 2;
  return BULK.agePerYear;
}

/** 숙성 연수에 대한 소비자 인식 (위스키류) — 권장가·면세 권장가·매력도가 함께 쓴다.
 *  3년 미만은 법적으로 위스키라도 "어린 위스키"로 보고 크게 깎는다 — 0개월 0.47, 12개월 0.77, 24개월 0.98 (v0.8, 그대로)
 *  3년 = 1.18, 그 뒤는 원액 시가와 같은 비율로 오른다: 1.18 × (1 + r·연수) / (1 + 3r), 18년 상한 (§6.2.1, 예약 #117의 규칙)
 *  몰트(r = 0.2): 6년 1.62 · 10년 2.21 · 12년 2.51 · 18년 3.39 (옛 공식: 연 +0.06, 12년 상한 1.72) */
export function agePerception(oakMonths: number, category: ProductCategory = 'whisky'): number {
  if (oakMonths < 36) return 1.18 * (0.4 + 0.6 * Math.pow(Math.max(0, oakMonths) / 36, 0.8));
  const r = agePremiumRate(category);
  const years = Math.min(Math.floor(oakMonths / 12), AGE_PREMIUM_CAP_YEARS);
  return (1.18 * (1 + r * years)) / (1 + 3 * r);
}

/**
 * 숙성 소주 표기 (#217 · #221) — 증류식 소주·고량주가 옹기 또는 오크에서 6개월 이상(섞은 원액 모두) 쉬었으면
 * "옹기 2년 숙성"·"오크 8개월 숙성"(1년 미만은 개월). 판매 효과(매력도·기대가 배수)는 MKT `agedWhitePerception`. 대상이 아니면 null
 */
export function agedWhiteLabel(category: ProductCategory, oakMonths: number | undefined, restMonths: number | undefined): string | null {
  if (agedWhitePerception(category, oakMonths, restMonths) <= 1) return null;
  const rest = restMonths ?? 0;
  const oak = oakMonths ?? 0;
  const m = Math.max(rest, oak);
  return `${rest >= oak ? '옹기' : '오크'} ${m < 12 ? `${m}개월` : `${Math.floor(m / 12)}년`} 숙성`;
}

/** 숙성 소주 표기가 약속하는 최저 개월 — "2년" = 24, "8개월" = 8. 자동 납품이 표기를 지키는 기준 */
export const agedWhiteLabelMonths = (months: number): number => (months < 12 ? months : Math.floor(months / 12) * 12);

/**
 * 권장 출고가. `aged`(제품·블렌드의 최저 오크·옹기 개월)를 주면 숙성 소주 표기 배수를 곱한다 — #198은 권장 출고가가 맞추는 소비자가를
 * 기대가 E로 정했고, E에 그 배수가 들어가기 때문(#217). 위스키·진은 배수 1
 */
export function suggestedPrice(region: RegionDef, category: ProductCategory, bottleMl: number, quality: number, oakMonths: number | null, abv: number, taxFactor = 1, aged?: { oakMonths?: number; restMonths?: number }): number {
  const ageBonus = (isWhiskyCategory(category) && oakMonths != null ? agePerception(oakMonths, category) : 1) * (aged ? agedWhitePerception(category, aged.oakMonths, aged.restMonths) : 1);
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
    if (c.source === 'cask' && s.inventory.casks.find((k) => k.id === c.id)?.owner) { errors.push('고객 소유(캐스크 오너십) 캐스크는 병입할 수 없습니다'); continue; }
    if (c.liters > lot.volumeL + 1e-6) errors.push(`${lot.name}: 보유량(${lot.volumeL.toFixed(1)}L)보다 많이 선택했습니다`);
    items.push({ lot, liters: Math.min(c.liters, lot.volumeL) });
  }
  const empty: BlendPreview = { ok: false, errors, warnings, kind: null, category: null, volumeL: 0, lpa: 0, mixAbv: 0, finalAbv: 0, bottles: 0, minOakMonths: 0, minRestMonths: 0, agedLabel: null, ageYears: null, flavor: {}, evaluation: null, unitCost: 0, sourcedShare: 0, sourcedPrestige: 1, specialty: null, premiumLabel: false, traditional: false, suggestedPrice: 0, localIngredient: false, dfEdition: null, finish: null };
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
  const minRestMonths = Math.min(...items.map((i) => i.lot.restMonths ?? 0));
  // 피니시 라벨: 섞은 원액이 모두 같은 종류 캐스크로 피니싱됐을 때만 붙인다 — 피니싱 안 한 원액이 섞이면 라벨 없음 (#158)
  const finishes = items.map((i) => finishOf(i.lot)?.typeId ?? null);
  const finish = finishes.every((f) => f && f === finishes[0]) ? finishes[0]! : null;
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
  if (s.hr.houseStyle > 0) f.integration = (f.integration ?? 0) + s.hr.houseStyle / 25;
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
  if (opts.packaging) { const pe = packagingError(opts.packaging, opts.bottleMl); if (pe) errors.push(pe); } else if (!PACKAGING[opts.packagingId]) errors.push('패키징을 선택하세요');

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
  if (opts.restockId) restockChecks(s, opts, { category, finalAbv, finish, ageYears, premiumLabel, traditional, specialty: specialty?.id ?? null, oakMonths: minOakMonths, restMonths: minRestMonths }, errors, warnings);
  return {
    ok: errors.length === 0, errors, warnings, kind, category, volumeL: finalVolume, lpa, mixAbv, finalAbv, bottles,
    minOakMonths, minRestMonths, agedLabel: agedWhiteLabel(category, minOakMonths, minRestMonths), ageYears, flavor, evaluation, unitCost: Math.round(unitCost), sourcedShare, sourcedPrestige, specialty: specialty?.id ?? null, premiumLabel, traditional,
    // 면세 전용 한정판은 면세 기준가로 권장가를 잡는다 (주세·부가세 없음)
    suggestedPrice: dutyFree && hasDutyFree(s)
      ? dutyFreeSuggestedPrice(region, category, opts.bottleMl, evaluation.quality, isWhiskyCategory(category) ? agePerception(minOakMonths, category) : 1, finalAbv)
      : suggestedPrice(region, category, opts.bottleMl, evaluation.quality, isWhiskyCategory(category) ? minOakMonths : null, finalAbv, traditionalTaxFactor(region, traditional, s.commerce.traditionalReleasedL, s.commerce.traditionalPrevYearL), { oakMonths: minOakMonths, restMonths: minRestMonths }),
    localIngredient,
    dfEdition: dutyFree && hasDutyFree(s) ? nextDutyFreeEdition(s) : null,
    finish,
  };
}

/**
 * 병입 전에 플레이어가 **아는** 블렌드 (#136·#159, #162) — 캐스크는 샘플 기록(knownReads), 탱크 원액은 우리가 막 만든 것이라 그대로 안다.
 * 추정 품질 = 아는 원액들의 품질을 알코올(LPA) 가중 평균한 값(블렌드 품질 공식은 비선형이라 근사), 오차 = 가중 오차의 제곱합 제곱근.
 * 기록이 없는 캐스크는 빠지고 그 비율을 unknownShare로 알린다. 아는 원액이 없으면 quality·hex = null
 */
export function estimateBlend(s: GameState, components: BlendComponent[]): { quality: number | null; sigma: number; hex: Hex | null; unknownShare: number; fromCasks: boolean; axes: Partial<Record<AxisId, number>> | null } {
  const known = knownReads(s);
  let total = 0;
  // key = 오차가 함께 움직이는 단위(같은 샘플 기록) — 같은 기록을 빌린 통들의 오차는 독립이 아니라 한 덩어리다
  const parts: { w: number; q: number; sd: number; hex: Hex; key: string; axes?: Partial<Record<AxisId, number>> }[] = [];
  let fromCasks = false;
  for (const c of components) {
    if (c.liters <= 0) continue;
    const lot = lotOf(s, c);
    if (!lot) continue;
    const w = c.liters * lot.abv;
    total += w;
    if (c.source === 'cask') {
      fromCasks = true;
      const k = known.get(c.id);
      if (k) parts.push({ w, q: k.estQuality, sd: k.sigma * QUALITY_SIGMA_PER_HEX, hex: k.hex, key: `rec:${k.sourceId}:${k.month}`, axes: k.axes });
    } else {
      // 탱크 원액은 막 만든 것이라 참값을 안다 — 소주·진·고량주는 레이더 축도 참값
      const ax = sampleAxesOf(lot.kind);
      parts.push({ w, q: evaluate(lot.flavor, lotCategory(lot, regionOf(s).whisky)).quality, sd: 0, hex: hexOf(lot.flavor), key: `lot:${c.id}`, axes: ax ? Object.fromEntries(ax.map((a) => [a, lot.flavor[a] ?? 0])) : undefined });
    }
  }
  const kw = parts.reduce((t, p) => t + p.w, 0);
  if (!kw) return { quality: null, sigma: 0, hex: null, unknownShare: total > 0 ? 1 : 0, fromCasks, axes: null };
  return {
    quality: Math.round((parts.reduce((t, p) => t + p.w * p.q, 0) / kw) * 10) / 10,
    sigma: (() => {
      // 같은 기록끼리 비중을 먼저 더하고(완전 상관), 서로 다른 기록끼리는 독립으로 합친다
      const byKey = new Map<string, { w: number; sd: number }>();
      for (const p of parts) byKey.set(p.key, { w: (byKey.get(p.key)?.w ?? 0) + p.w, sd: p.sd });
      return Math.sqrt([...byKey.values()].reduce((t, g) => t + ((g.w / kw) * g.sd) ** 2, 0));
    })(),
    hex: mixHex(parts.map((p) => ({ hex: p.hex, share: p.w }))),
    unknownShare: total > 0 ? 1 - kw / total : 0,
    fromCasks,
    // 소주·진·고량주의 레이더 축 추정 (#183) — 아는 원액 모두에 축 읽기가 있을 때만(옛 기록이 섞이면 null → 화면은 "다시 샘플")
    axes: parts.every((p) => p.axes) ? (() => {
      const out: Partial<Record<AxisId, number>> = {};
      for (const p of parts) for (const [a, v] of Object.entries(p.axes!) as [AxisId, number][]) out[a] = (out[a] ?? 0) + (v * p.w) / kw;
      return out;
    })() : null,
  };
}

/**
 * 추정 품질로 매긴 권장 출고가 — 병입 전에는 참 품질을 모르므로(#162) 추정 품질 ± 오차로 출고가 범위를 보여 준다 (#172, 플레이테스트 2026-11-07).
 * previewBlend의 권장 출고가와 같은 식에 품질만 바꿔 넣는다. 면세 한정판은 제외(null)
 */
export function priceAtQuality(s: GameState, p: BlendPreview, opts: BottleOptions, quality: number): number | null {
  if (!p.category || p.dfEdition) return null;
  const region = regionOf(s);
  return suggestedPrice(region, p.category, opts.bottleMl, quality, isWhiskyCategory(p.category) ? p.minOakMonths : null, p.finalAbv, traditionalTaxFactor(region, p.traditional, s.commerce.traditionalReleasedL, s.commerce.traditionalPrevYearL), { oakMonths: p.minOakMonths, restMonths: p.minRestMonths });
}

/** 병당 포장재 원가 — 이벤트 보정 × 입지 운송 할증 (결정 #86) */
function packagingUnitCost(s: GameState, opts: Pick<BottleOptions, 'packagingId' | 'bottleMl' | 'packaging'>): number {
  const base = opts.packaging ? packagingPartsCost(opts.packaging, opts.bottleMl) : packagingCost(opts.packagingId, opts.bottleMl); // 직접 고른 부품이면 부품 합 (P-PROD-38)
  return base * mod(s, 'packaging') * siteFreight(s, 'packaging');
}

/** 블렌딩·병입 실행 (s는 변경 가능한 복제본) */
// ───────────── 기존 제품에 재고 보충 (#186, 2차 플레이테스트 2026-11-08 오너 요청) ─────────────
// 새 이름으로만 병입하면 제품이 늘 때마다 같은 범주 수요를 나눠 갖고(#163 나눔) 판매 기록·가격이 처음부터다.
// 같은 제품으로 이어 가면 매대에 옛 병과 새 병이 섞인다고 보고 품질·향·원가를 재고 가중 평균한다(오너 승인: "재고 가중 평균").

/** 재고를 보충할 수 있는 제품 — 지금 판매 목록에 있고(보관 처리 전) 면세 한정판이 아닌 것 */
export const restockable = (s: GameState): Product[] => s.commerce.products.filter((p) => !p.dutyFreeOnly);

/** 병입 화면이 고르는 표준 도수(가수) — 이 밖의 도수는 캐스크 스트렝스로 병입한 제품이다 */
export const STANDARD_BOTTLING_ABVS = [0.25, 0.3, 0.34, 0.38, 0.4, 0.43, 0.46, 0.58] as const;
/**
 * 캐스크 스트렝스 제품인가 — 물을 타지 않아 통마다 도수가 다르다. 재고 보충은 도수를 맞추지 않고 새 배치도 캐스크 스트렝스로 병입하며,
 * 제품 도수는 병 수 가중 평균이 된다 (2026-11-09 오너 보고: 61.0% 제품에 61.0% 통을 보충할 수 없었다 — 실제로는 61.04% 대 61.0x%)
 */
export const isCaskStrength = (p: Pick<Product, 'abv'>): boolean => !STANDARD_BOTTLING_ABVS.some((a) => Math.abs(a - p.abv) < 0.0005);

function restockChecks(s: GameState, opts: BottleOptions, b: { category: ProductCategory; finalAbv: number; finish: CaskTypeId | null; ageYears: number | null; premiumLabel: boolean; traditional: boolean; specialty: string | null; oakMonths: number; restMonths: number }, errors: string[], warnings: string[]): void {
  const t = s.commerce.products.find((p) => p.id === opts.restockId);
  if (!t) { errors.push('보충할 제품이 판매 목록에 없습니다'); return; }
  if (t.dutyFreeOnly || opts.dutyFreeOnly) { errors.push('면세 한정판은 재고를 보충할 수 없습니다 — 판(Vol.)마다 새로 낸다'); return; }
  if (t.category !== b.category) errors.push(`「${t.name}」은 ${CATEGORY[t.category].nameKo} — 이 원액은 ${CATEGORY[b.category].nameKo}라 보충할 수 없습니다`);
  if (opts.bottleMl !== t.bottleMl) errors.push(`병 크기를 「${t.name}」과 같은 ${t.bottleMl}ml로 맞추세요`);
  // 패키징이 같아야 보충한다 (P-PROD-38 — 다른 병은 새 제품으로, 오너 "권장안대로")
  if (!sameChoice(productPackaging(t), opts.packaging ?? presetChoice(opts.packagingId))) errors.push(`패키징을 「${t.name}」과 같게 맞추세요 — 다른 병·마개·라벨·상자는 새 제품으로 낸다`);
  if (isCaskStrength(t)) {
    // 캐스크 스트렝스 — 배치마다 도수가 달라도 된다(라벨 도수는 병 수 가중 평균). 표준 도수로 물을 타면 캐스크 스트렝스가 아니다
    if (opts.targetAbv !== 'cask' && STANDARD_BOTTLING_ABVS.some((a) => Math.abs(a - b.finalAbv) < 0.0005)) errors.push(`「${t.name}」은 캐스크 스트렝스 제품 — 도수를 "캐스크 스트렝스"로 두세요`);
  } else if (Math.abs(b.finalAbv - t.abv) > 0.0005) errors.push(`도수를 「${t.name}」과 같은 ${(t.abv * 100).toFixed(1)}%로 맞추세요`);
  if ((b.finish ?? null) !== (t.finish ?? null)) errors.push(t.finish ? `「${t.name}」은 ${finishLabel(t.finish)} 피니시 제품 — 같은 피니시 원액만 보충할 수 있습니다` : `「${t.name}」은 피니시 표기가 없는 제품 — 피니싱한 원액은 새 제품으로 내세요`);
  if (t.ageYears != null && b.ageYears != null && b.ageYears < t.ageYears) warnings.push(`숙성 표기가 ${t.ageYears}년 → ${b.ageYears}년으로 내려갑니다 (가장 어린 원액 기준)`);
  // 숙성 소주 표기 (#221) — 가장 짧은 원액 기준이라 덜 쉰 원액(탱크 등)을 섞으면 표기가 내려가거나 빠진다
  const tAged = agedWhiteLabel(t.category, t.oakMonths, t.restMonths);
  if (tAged && agedWhitePerception(b.category, b.oakMonths, b.restMonths) < agedWhitePerception(t.category, t.oakMonths, t.restMonths) && t.stockBottles > 0) {
    const bAged = agedWhiteLabel(b.category, b.oakMonths, b.restMonths);
    warnings.push(`숙성 표기가 「${tAged}」 → ${bAged ? `「${bAged}」` : '없음'}으로 바뀝니다 (가장 짧게 쉰 원액 기준 · 제품 이름은 그대로)`);
  }
  if (t.premiumLabel && !b.premiumLabel) warnings.push('이 원액은 프리미엄 표기 조건을 못 채워 제품의 표기가 빠집니다');
  if (t.traditional && !b.traditional) warnings.push('이 원액은 전통주 주세 경감 대상이 아니라 제품의 경감 표기가 빠집니다');
  if (t.specialty && t.specialty !== b.specialty) warnings.push('이 원액은 특산물 표기 조건을 못 채워 제품의 특산물 표기가 빠집니다');
}

/** 두 비중 목록(통 구성)을 병 수로 가중 평균 */
function mergeCaskMix(a: Product['caskMix'], wa: number, b: Product['caskMix'], wb: number): Product['caskMix'] {
  const m = new Map<CaskTypeId, number>();
  for (const x of a ?? []) m.set(x.typeId, (m.get(x.typeId) ?? 0) + x.share * wa);
  for (const x of b ?? []) m.set(x.typeId, (m.get(x.typeId) ?? 0) + x.share * wb);
  const tot = wa + wb;
  const out = [...m.entries()].map(([typeId, v]) => ({ typeId, share: Math.round((v / tot) * 1000) / 1000 })).filter((x) => x.share > 0).sort((x, y) => y.share - x.share);
  return out.length ? out : undefined;
}

/** 보충 뒤 제품 — 남은 재고(old)와 새 병(batch)의 가중 평균. 이름·출고가·출시 달·판매 기록·블렌딩 목표 기록은 그대로 */
export function restockedProduct(old: Product, batch: Product): Product {
  const a = Math.max(0, old.stockBottles);
  const b = batch.stockBottles;
  const w = a + b > 0 ? b / (a + b) : 1;
  const avg = (x: number, y: number) => x + (y - x) * w;
  const flavor = weightedAverage([{ flavor: old.flavor, weight: a }, { flavor: batch.flavor, weight: b }].filter((x) => x.weight > 0));
  const caskMix = mergeCaskMix(old.caskMix, a, batch.caskMix, b);
  // 숙성 표기·표기 조건은 매대에 실제로 섞이는 병 기준 — 남은 재고가 없으면 새 배치 그대로 (2026-11-08 수정: 재고 0에서 보충해도
  // 옛 배치의 어린 표기가 남아, 한 제품을 계속 보충하면 위스키가 영원히 "1년"으로 팔렸다 — 사람형 봇 8/8 파산)
  const fresh = a === 0;
  const minAge = fresh ? batch.ageYears : old.ageYears == null || batch.ageYears == null ? (old.ageYears ?? batch.ageYears) : Math.min(old.ageYears, batch.ageYears);
  const merged: Product = {
    ...old,
    ageYears: minAge,
    oakMonths: fresh ? batch.oakMonths : Math.min(old.oakMonths ?? batch.oakMonths ?? 0, batch.oakMonths ?? old.oakMonths ?? 0),
    // 옹기 개월도 매대에 섞이는 병 중 가장 짧은 값 (#221) — 없으면 0(옛 제품·탱크 원액)
    restMonths: fresh ? batch.restMonths : Math.min(old.restMonths ?? 0, batch.restMonths ?? 0),
    flavor,
    hex: hexOf(flavor),
    quality: Math.round(avg(old.quality, batch.quality) * 10) / 10,
    typicity: Math.round(avg(old.typicity, batch.typicity) * 10) / 10,
    style: w > 0.5 ? batch.style : old.style,
    sourcedShare: avg(old.sourcedShare, batch.sourcedShare),
    sourcedPrestige: avg(old.sourcedPrestige ?? 1, batch.sourcedPrestige ?? 1),
    premiumLabel: fresh ? !!batch.premiumLabel : !!old.premiumLabel && !!batch.premiumLabel,
    stockBottles: a + b,
    unitCost: Math.round(avg(old.unitCost, batch.unitCost)),
    // 캐스크 스트렝스는 배치마다 도수가 달라 병 수 가중 평균(표준 도수 제품은 같은 도수라 그대로)
    abv: Math.round(avg(old.abv, batch.abv) * 10000) / 10000,
  };
  const keep = (o: unknown, b: unknown, same = true) => (fresh ? !!b : !!o && !!b && same);
  if (keep(old.traditional, batch.traditional)) merged.traditional = true; else delete merged.traditional;
  if (keep(old.specialty, batch.specialty, old.specialty === batch.specialty)) merged.specialty = batch.specialty; else delete merged.specialty;
  if (keep(old.localIngredient, batch.localIngredient)) merged.localIngredient = true; else delete merged.localIngredient;
  if (caskMix) merged.caskMix = caskMix; else delete merged.caskMix;
  // 레시피 — 남은 재고가 있으면 합집합, 한쪽이라도 기록이 없으면(옛 제품) 기록 없음(모든 원액)
  const rec = fresh ? batch.recipeIds : old.recipeIds && batch.recipeIds ? [...new Set([...old.recipeIds, ...batch.recipeIds])].sort() : undefined;
  if (rec?.length) merged.recipeIds = rec; else delete merged.recipeIds;
  if (!merged.restMonths) delete merged.restMonths;
  return merged;
}

export function executeBlend(s: GameState, components: BlendComponent[], opts: BottleOptions): { error?: string; product?: Product; reveal?: BlendReveal } {
  const p = previewBlend(s, components, opts);
  if (!p.ok || !p.category || !p.evaluation) return { error: p.errors.join(' / ') || '병입할 수 없습니다' };
  // 블렌딩 테이블 (결정 #124): 원액을 빼기 전에 블렌더가 아는 값으로 예상 육각형을 만든다 (공개 연출용).
  // 캐스크는 샘플 기록(#157) — 기록이 없는 캐스크는 예상에서 빠진다. 탱크 원액은 우리가 막 만든 것이라 참값으로 안다(#162의 estimateBlend와 같은 규칙)
  const known = knownReads(s);
  const parts = components.filter((c) => c.liters > 0).map((c) => {
    const lot = lotOf(s, c)!;
    const cask = c.source === 'cask' ? s.inventory.casks.find((k) => k.id === c.id) : undefined;
    const seen = cask ? known.get(cask.id)?.hex ?? null : hexOf(lot.flavor);
    return { seen, share: c.liters * lot.abv, cask };
  });
  const seenParts = parts.filter((x): x is typeof x & { seen: Hex } => !!x.seen);
  const unknownShare = parts.reduce((t, x) => t + (x.seen ? 0 : x.share), 0) / Math.max(1e-9, parts.reduce((t, x) => t + x.share, 0));
  const predicted = seenParts.length ? mixHex(seenParts.map((x) => ({ hex: x.seen, share: x.share }))) : null;
  // 통 구성 (#176) — 캐스크 원액의 통 종류별 알코올 비중(전체 블렌드 대비, 큰 순). 탱크 원액은 빠진다 — 합이 1보다 작으면 나머지가 탱크
  const totalShare = parts.reduce((t, x) => t + x.share, 0);
  const byType = new Map<CaskTypeId, number>();
  for (const x of parts) if (x.cask) byType.set(x.cask.typeId, (byType.get(x.cask.typeId) ?? 0) + x.share);
  const caskMix = totalShare > 0 ? [...byType.entries()].map(([typeId, v]) => ({ typeId, share: Math.round((v / totalShare) * 1000) / 1000 })).sort((a, b) => b.share - a.share) : [];
  const single = parts.length === 1 ? parts[0]!.cask : undefined;
  const lineTarget = opts.line && s.commerce.lines[opts.line] ? findTarget(s, `line:${opts.line}`) : undefined;
  const target = lineTarget ?? findTarget(s, opts.targetId);
  for (const c of components) {
    if (c.liters <= 0) continue;
    if (c.source === 'cask') {
      const idx = s.inventory.casks.findIndex((k) => k.id === c.id);
      const cask = s.inventory.casks[idx]!;
      const lot = cask.contents!;
      const remain = lot.volumeL - c.liters;
      s.inventory.casks[idx] = remain < 1 ? emptyCask(cask) : { ...cask, contents: { ...lot, volumeL: remain } };
    } else {
      const idx = s.inventory.lots.findIndex((l) => l.id === c.id);
      const lot = s.inventory.lots[idx]!;
      const remain = lot.volumeL - c.liters;
      if (remain < 1) s.inventory.lots.splice(idx, 1);
      else s.inventory.lots[idx] = { ...lot, volumeL: remain };
    }
  }
  // 섞은 원액의 레시피 (#243) — 자동 납품이 다른 제품 몫 원액을 가져가지 않게(5차 판: 「안성 소주」 자동 납품이 탱크 소주를 다 써 「옹기소주」를 못 채움)
  const recipeIds = [...new Set(components.filter((c) => c.liters > 0).map((c) => lotOf(s, c)?.recipeId).filter((x): x is string => !!x))].sort();
  const product: Product = {
    id: nid(s, 'P'),
    // 기본 이름에 숙성 소주 표기를 붙인다 (#221) — 직접 쓴 이름은 그대로(표기는 판매 화면 배지로 보인다)
    name: opts.name.trim() || `${CATEGORY[p.category].nameKo} ${productCountEver(s) + 1}${p.finish ? ` ${finishLabel(p.finish)}` : ''}${p.agedLabel ? ` ${p.agedLabel}` : ''}`,
    category: p.category,
    ageYears: p.ageYears,
    oakMonths: p.minOakMonths,
    ...(p.minRestMonths > 0 ? { restMonths: p.minRestMonths } : {}),
    abv: p.finalAbv,
    bottleMl: opts.bottleMl,
    chillFiltered: opts.chillFilter,
    packagingId: opts.packaging ? nearestPresetId(opts.packaging) : opts.packagingId,
    ...(opts.packaging ? { packaging: fixPackaging(opts.packaging, opts.bottleMl) } : {}),
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
    ...(p.finish ? { finish: p.finish } : {}),
    ...(caskMix.length ? { caskMix } : {}),
    ...(recipeIds.length ? { recipeIds } : {}),
    ...(opts.dutyFreeOnly && p.dfEdition ? { dutyFreeOnly: true, dfEdition: { ...p.dfEdition } } : {}),
  };
  // 기존 제품에 재고 보충 (#186) — 새 제품을 만들지 않고 가중 평균으로 합친다. 출시 효과·면세 판·블렌딩 목표 채점은 새 제품에만
  if (opts.restockId) {
    const idx = s.commerce.products.findIndex((x) => x.id === opts.restockId);
    const merged = restockedProduct(s.commerce.products[idx]!, product);
    s.commerce.products[idx] = merged;
    s.finance.cash -= Math.round((packagingUnitCost(s, opts) + BOTTLING_LABOR_PER_BOTTLE) * p.bottles);
    const actualBatch = hexOf(product.flavor);
    return { product: merged, reveal: { targetLabel: null, score: null, predicted, actual: actualBatch, notes: p.kind !== 'malt' && p.kind !== 'grain' ? [] : predicted ? [...revealNotes(predicted, actualBatch), ...(unknownShare >= 0.05 ? [`샘플 기록 없는 원액 ${Math.round(unknownShare * 100)}%는 예상 밖이었다`] : [])] : ['샘플 기록 없이 병입 — 예상 없이 섞었다'] } };
  }
  if (p.dfEdition && opts.dutyFreeOnly) s.site.dfSeries = { vol: p.dfEdition.vol, streak: p.dfEdition.streak };
  // 첫 위스키 출시: 비지터 센터 입소문이 높으면 오픈런 (3개월간 수요 × (1 + 2 × 입소문))
  if (isWhiskyCategory(product.category) && !s.commerce.products.some((x) => isWhiskyCategory(x.category)) && !s.commerce.productArchive.some((x) => isWhiskyCategory(x.category)) && s.commerce.localBuzz > 0.05) {
    product.launchBoost = { factor: 1 + 2 * s.commerce.localBuzz, untilMonth: s.month + 3 };
  }
  // 포장재·병입 인건비는 병입 시점에 지출
  s.finance.cash -= Math.round((packagingUnitCost(s, opts) + BOTTLING_LABOR_PER_BOTTLE) * p.bottles);
  s.commerce.products.push(product);
  // 결과 공개·채점·보상 (결정 #124 P5·P6·P8)
  const actual = hexOf(product.flavor);
  product.hex = actual;
  if (single?.rare && single.rareKnown) product.rareSingleCask = true;
  let rewardNote: string | undefined;
  let score: number | null = null;
  if (target) {
    score = matchScore(actual, target);
    product.blend = { targetId: target.id, source: target.source, label: target.label, score, delegated: !!opts.delegated };
    if (target.source === 'critic') {
      const c = s.commerce.commissions.find((x) => x.id === target.id);
      if (c && score >= COMMISSION.minScore) {
        c.fulfilledBy = product.id;
        const k = score / 100;
        const brand = brandOf(s, product);
        brand.awareness = Math.min(0.95, brand.awareness + c.reward.awareness * k);
        product.blend.appealBonus = c.reward.appealBonus * k;
        product.blend.untilMonth = s.month + c.reward.months;
        rewardNote = `${c.client}가 받아들였다 — 인지도 +${(c.reward.awareness * k * 100).toFixed(1)}%p, ${c.reward.months}개월간 매력도 +${(c.reward.appealBonus * k * 100).toFixed(0)}%`;
      } else if (c) rewardNote = `${c.client}가 받지 않았다 (${COMMISSION.minScore}점 미만) — 의뢰는 마감까지 남아 있다`;
    }
    if (target.source === 'core' && opts.line && lineTarget) {
      const l = s.commerce.lines[opts.line]!;
      l.batches += 1;
      l.lastScore = score;
      product.line = opts.line;
      rewardNote = `코어 레인지 일관성 ${score}점 — 매력도 ×${(0.9 + 0.2 * score / 100).toFixed(2)}`;
    }
  }
  if (opts.line && !s.commerce.lines[opts.line]) {
    s.commerce.lines[opts.line] = { refHex: actual, batches: 1, lastScore: null, createdMonth: s.month };
    product.line = opts.line;
    rewardNote = [rewardNote, `코어 레인지 「${opts.line}」 기준 배치로 등록 — 다음 배치부터 이 육각형과 비교한다`].filter(Boolean).join(' · ');
  }
  return { product, reveal: { targetLabel: target?.label ?? null, score, predicted, actual, notes: p.kind !== 'malt' && p.kind !== 'grain' ? [] : predicted ? [...revealNotes(predicted, actual), ...(unknownShare >= 0.05 ? [`샘플 기록 없는 원액 ${Math.round(unknownShare * 100)}%는 예상 밖이었다`] : [])] : ['샘플 기록 없이 병입 — 예상 없이 섞었다'], ...(rewardNote ? { rewardNote } : {}) } };
}
