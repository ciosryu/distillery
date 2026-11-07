import { BOTTLING_LABOR_PER_BOTTLE, PACKAGING, packagingCost } from './content/catalog';
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
import { COMMISSION, findTarget, knownReads, QUALITY_SIGMA_PER_HEX, revealNotes } from './blendTable';
import { productCountEver } from './lifecycle';
import type { AxisId, CaskTypeId, Flavor, GameState, Hex, Product, ProductCategory, SpiritKind, SpiritLot } from './types';

export interface BlendComponent { source: 'cask' | 'lot'; id: string; liters: number }
export interface BottleOptions {
  name: string; targetAbv: number | 'cask'; bottleMl: number; chillFilter: boolean; packagingId: string;
  /** 면세 전용 한정판(제주, 결정 #87) */ dutyFreeOnly?: boolean;
  /** 블렌딩 테이블 (결정 #124): 맞출 목표 — 'trend' · 의뢰 id · 'line:<이름>' */ targetId?: string;
  /** 코어 레인지 라인 — 처음이면 이 배치가 기준 육각형이 되고, 다음 배치부터 일관성으로 평가 */ line?: string;
  /** 블렌더에게 맡긴 배팅 */ delegated?: boolean;
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

export function suggestedPrice(region: RegionDef, category: ProductCategory, bottleMl: number, quality: number, oakMonths: number | null, abv: number, taxFactor = 1): number {
  const ageBonus = isWhiskyCategory(category) && oakMonths != null ? agePerception(oakMonths, category) : 1;
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
  const empty: BlendPreview = { ok: false, errors, warnings, kind: null, category: null, volumeL: 0, lpa: 0, mixAbv: 0, finalAbv: 0, bottles: 0, minOakMonths: 0, ageYears: null, flavor: {}, evaluation: null, unitCost: 0, sourcedShare: 0, sourcedPrestige: 1, specialty: null, premiumLabel: false, traditional: false, suggestedPrice: 0, localIngredient: false, dfEdition: null, finish: null };
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
      ? dutyFreeSuggestedPrice(region, category, opts.bottleMl, evaluation.quality, isWhiskyCategory(category) ? agePerception(minOakMonths, category) : 1, finalAbv)
      : suggestedPrice(region, category, opts.bottleMl, evaluation.quality, isWhiskyCategory(category) ? minOakMonths : null, finalAbv, traditionalTaxFactor(region, traditional, s.commerce.traditionalReleasedL, s.commerce.traditionalPrevYearL)),
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
export function estimateBlend(s: GameState, components: BlendComponent[]): { quality: number | null; sigma: number; hex: Hex | null; unknownShare: number; fromCasks: boolean } {
  const known = knownReads(s);
  let total = 0;
  // key = 오차가 함께 움직이는 단위(같은 샘플 기록) — 같은 기록을 빌린 통들의 오차는 독립이 아니라 한 덩어리다
  const parts: { w: number; q: number; sd: number; hex: Hex; key: string }[] = [];
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
      if (k) parts.push({ w, q: k.estQuality, sd: k.sigma * QUALITY_SIGMA_PER_HEX, hex: k.hex, key: `rec:${k.sourceId}:${k.month}` });
    } else parts.push({ w, q: evaluate(lot.flavor, lotCategory(lot, regionOf(s).whisky)).quality, sd: 0, hex: hexOf(lot.flavor), key: `lot:${c.id}` });
  }
  const kw = parts.reduce((t, p) => t + p.w, 0);
  if (!kw) return { quality: null, sigma: 0, hex: null, unknownShare: total > 0 ? 1 : 0, fromCasks };
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
  };
}

/**
 * 추정 품질로 매긴 권장 출고가 — 병입 전에는 참 품질을 모르므로(#162) 추정 품질 ± 오차로 출고가 범위를 보여 준다 (#172, 플레이테스트 2026-11-07).
 * previewBlend의 권장 출고가와 같은 식에 품질만 바꿔 넣는다. 면세 한정판은 제외(null)
 */
export function priceAtQuality(s: GameState, p: BlendPreview, opts: BottleOptions, quality: number): number | null {
  if (!p.category || p.dfEdition) return null;
  const region = regionOf(s);
  return suggestedPrice(region, p.category, opts.bottleMl, quality, isWhiskyCategory(p.category) ? p.minOakMonths : null, p.finalAbv, traditionalTaxFactor(region, p.traditional, s.commerce.traditionalReleasedL, s.commerce.traditionalPrevYearL));
}

/** 병당 포장재 원가 — 이벤트 보정 × 입지 운송 할증 (결정 #86) */
function packagingUnitCost(s: GameState, opts: Pick<BottleOptions, 'packagingId' | 'bottleMl'>): number {
  return packagingCost(opts.packagingId, opts.bottleMl) * mod(s, 'packaging') * siteFreight(s, 'packaging');
}

/** 블렌딩·병입 실행 (s는 변경 가능한 복제본) */
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
  const product: Product = {
    id: nid(s, 'P'),
    name: opts.name.trim() || `${CATEGORY[p.category].nameKo} ${productCountEver(s) + 1}${p.finish ? ` ${finishLabel(p.finish)}` : ''}`,
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
    ...(p.finish ? { finish: p.finish } : {}),
    ...(opts.dutyFreeOnly && p.dfEdition ? { dutyFreeOnly: true, dfEdition: { ...p.dfEdition } } : {}),
  };
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
