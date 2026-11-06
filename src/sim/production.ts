import { BOTANICALS, EQUIPMENT, GNS, INGREDIENTS, VOLUME_DISCOUNT_TIERS, YEASTS, type EquipmentDef } from './content/catalog';
import { addScaled, clamp, clampFlavor, distillFlavor, heartsFraction } from './flavor';
import { GI_LOCK, logisticsMultiplier, regionOf, siteOf, type WaterId } from './content/regions';
import type { Rng } from './rng';
import type { Flavor, FermenterType, GameState, Recipe, RegionId, Staff } from './types';

type StillDef = Extract<EquipmentDef, { kind: 'still' }>;

export const WASH_ABV = { malt: 0.08, soju: 0.16, grain: 0.09, baijiu: 0.06 } as const;
/** 백주는 고체 발효 곡물을 증기로 증류 → 한 번에 약 60% */
export const BAIJIU_ABV = 0.6;
export const GIN_CHARGE_ABV = 0.45;
const WASH_RUN_CUT = { c1: 0.02, c2: 0.98 };
/** 연속식 증류기의 고정 분획 (레시피 컷 무시) */
export const COLUMN_CUT = { c1: 0.1, c2: 0.82 };
const FEINTS_RECOVERY = 0.9;
const ENERGY_PER_L_RUN = 60; // 원 / (L·회)

/** 배치 에너지비 — 위탁생산(OEM)처럼 원료 없이 증류만 할 때 (결정 #87) */
export function batchEnergyCost(still: StillDef, runs: number, energyIndex: number, factor = 1): number {
  return runs * still.chargeL * ENERGY_PER_L_RUN * Math.pow(1000 / still.chargeL, 0.3) * energyIndex * factor;
}

export interface BatchResult {
  lpa: number;
  abv: number;
  volumeL: number;
  flavor: Flavor;
  cost: number;
  feintsOutLPA: number;
  ingredientsKg: Record<string, number>;
  warnings: string[];
}

/** 배치 환경: 발효실 온도(°C), 난수(수율 편차·산패), 생산 지역(물류 배수) */
export interface BatchEnv {
  tempC: number; rng?: Rng; regionId?: RegionId;
  /** 입지 물 (결정 #84) */
  water?: WaterId;
  /** 입지 입고 운송 할증(원재료) · 에너지비 배수(겨울 난방) */
  freight?: number;
  energyFactor?: number;
}

/** 물 효과 (결정 #84): 연수 = 이취↓·과일↑, 화산암반수 = 이취↓·과일 가산·수율↑ */
export const WATER_EFFECT: Record<WaterId, { offnote: number; fruity: number; fruitAdd: number; yield: number }> = {
  medium: { offnote: 1, fruity: 1, fruitAdd: 0, yield: 1 },
  soft: { offnote: 0.7, fruity: 1.1, fruitAdd: 0, yield: 1 },
  volcanic: { offnote: 0.8, fruity: 1, fruitAdd: 5, yield: 1.03 },
};

/** 발효실 온도 = 연평균 + 외기 편차의 80% + 발효열 2°C */
export function fermentationClimate(s: GameState, monthOfYear: number): number {
  const site = siteOf(s);
  const tm = site.tempC.reduce((a, b) => a + b, 0) / 12;
  return tm + 0.8 * (site.tempC[monthOfYear - 1]! - tm) + 2;
}

/** 발효 기간: 10°C 미만이면 1°C마다 3% 늘고, 25°C 초과면 1°C마다 2% 준다(최대 30%) (결정 #67) */
export function fermentDaysAt(days: number, tempC: number): number {
  if (tempC < 10) return Math.round(days * (1 + 0.03 * (10 - tempC)));
  if (tempC > 25) return Math.max(1, Math.round(days * Math.max(0.7, 1 - 0.02 * (tempC - 25))));
  return days;
}

export function stillDefOf(state: GameState, stillId: string): StillDef | null {
  const inst = state.equipment.find((e) => e.id === stillId);
  if (!inst) return null;
  const def = EQUIPMENT[inst.catalogId];
  return def && def.kind === 'still' ? def : null;
}

/** 레시피 검증 — 문제 목록(빈 배열이면 OK) */
export function validateRecipe(state: GameState, r: Recipe): string[] {
  const errs: string[] = [];
  const region = regionOf(state);
  // 교차 생산(결정 #67): 모든 주종을 어디서나 만들 수 있고, 원산지 표기 잠금(AOC·GI) 주종만 제한
  const lock = GI_LOCK[r.kind];
  if (!region.allowedKinds.includes(r.kind) || (lock && !lock.includes(region.id))) errs.push(`${region.nameKo}에서는 이 주종을 생산할 수 없습니다(원산지 표기 잠금)`);
  const still = stillDefOf(state, r.stillId);
  if (!still) errs.push('증류기를 선택하세요');
  if (r.cut.c1 < 0 || r.cut.c2 > 1 || r.cut.c1 >= r.cut.c2) errs.push('컷 포인트는 0 ≤ c1 < c2 ≤ 1 이어야 합니다');
  if (r.kind === 'gin') {
    if (!r.botanicals.length) errs.push('진에는 보태니컬이 필요합니다');
    if (!r.botanicals.some((b) => b.botanicalId === 'juniper')) errs.push('진에는 주니퍼가 반드시 들어가야 합니다');
    if (r.botanicalMethod === 'vapor' && still && !still.ginBasket) errs.push('이 증류기에는 진 바스켓이 없습니다(침지만 가능)');
    for (const b of r.botanicals) {
      const def = BOTANICALS[b.botanicalId];
      if (!def) errs.push(`알 수 없는 보태니컬: ${b.botanicalId}`);
      else if (def.sites && !def.sites.includes(siteOf(state).id)) errs.push(`${def.nameKo}은(는) 이 입지에서만 구할 수 있습니다`);
    }
  } else {
    const sum = r.mashBill.reduce((s, m) => s + m.ratio, 0);
    if (Math.abs(sum - 1) > 0.01) errs.push('원재료 비율 합이 100%가 되어야 합니다');
    for (const m of r.mashBill) {
      const ing = INGREDIENTS[m.ingredientId];
      if (!ing) errs.push(`알 수 없는 원재료: ${m.ingredientId}`);
      else if (!(ing.kinds as string[]).includes(r.kind)) errs.push(`${ing.nameKo}은(는) 이 주종에 쓸 수 없습니다`);
      else if (ing.sites && !ing.sites.includes(siteOf(state).id)) errs.push(`${ing.nameKo}은(는) 이 입지에서만 구할 수 있습니다`);
    }
    if (r.fermentDays < 2 || r.fermentDays > 28) errs.push('발효 기간은 2~28일');
  }
  if (r.pressure === 'vacuum' && still && !still.vacuum) errs.push('감압 증류는 감압 증류기에서만 가능합니다');
  return errs;
}

/** 배치 1회 시뮬레이션 (결정론적) */
export function simulateBatch(
  r: Recipe,
  still: StillDef,
  fermenterType: FermenterType | null,
  distiller: Staff | undefined,
  priceIndex: Record<string, number>,
  feintsInLPA: number,
  env?: BatchEnv,
): BatchResult {
  const at = env?.regionId;
  const logi = (native?: string[]) => (at ? logisticsMultiplier(native, at) : 1) * (env?.freight ?? 1);
  const warnings: string[] = [];
  const ingredientsKg: Record<string, number> = {};
  let cost = 0;
  let flavor: Flavor = {};
  let chargeLPA: number;
  let bodyBonus = 0;

  if (r.kind === 'gin') {
    chargeLPA = still.chargeL * GIN_CHARGE_ABV;
    const gnsL = chargeLPA / GNS.abv;
    cost += gnsL * GNS.pricePerL * (priceIndex.gns ?? 1);
    ingredientsKg.gns = gnsL;
    flavor = { ...GNS.flavor };
    const methodK = r.botanicalMethod === 'vapor' ? 0.85 : 1;
    for (const b of r.botanicals) {
      const def = BOTANICALS[b.botanicalId];
      if (!def) continue;
      const kg = (b.gramsPerL * still.chargeL) / 1000;
      ingredientsKg[b.botanicalId] = kg;
      cost += kg * def.pricePerKg * logi(def.native);
      let contrib: Flavor = {};
      contrib = addScaled(contrib, def.perGram, b.gramsPerL * methodK * 1.5);
      if (r.botanicalMethod === 'vapor') {
        contrib.citrus = (contrib.citrus ?? 0) * 1.15;
        contrib.floral = (contrib.floral ?? 0) * 1.15;
        contrib.earthy = (contrib.earthy ?? 0) * 0.6;
        contrib.body = 0;
      }
      bodyBonus += (contrib.body ?? 0) * 0.3;
      delete contrib.body;
      flavor = addScaled(flavor, contrib);
    }
    if (r.botanicalMethod === 'steep') bodyBonus += 5;
  } else {
    const washAbv = WASH_ABV[r.kind];
    chargeLPA = still.chargeL * washAbv;
    const yeast = YEASTS[r.yeast];
    const avgLpaPerKg = r.mashBill.reduce((s, m) => s + m.ratio * (INGREDIENTS[m.ingredientId]?.lpaPerKg ?? 0), 0);
    const kgTotal = chargeLPA / Math.max(0.01, avgLpaPerKg * yeast.yieldFactor);
    for (const m of r.mashBill) {
      const ing = INGREDIENTS[m.ingredientId];
      if (!ing) continue;
      const kg = kgTotal * m.ratio;
      ingredientsKg[ing.id] = kg;
      // 물류망 페널티: baseMaterialCost × logisticsMultiplier (자생지가 아니면 수입)
      cost += kg * ing.pricePerKg * (priceIndex[ing.id] ?? 1) * logi(ing.native);
      flavor = addScaled(flavor, ing.flavor, m.ratio);
    }
    // 발효: 기간이 길수록 에스테르 포화 증가. 온도에 따라 실제 발효 기간이 달라진다
    const temp = env?.tempC ?? 18;
    const days = fermentDaysAt(r.fermentDays, temp);
    const ester = 1 - Math.exp(-days / 4);
    flavor.fresh_fruit = (flavor.fresh_fruit ?? 0) + 18 * ester * yeast.ester;
    flavor.floral = (flavor.floral ?? 0) + 6 * ester * yeast.ester;
    flavor.tropical = (flavor.tropical ?? 0) + yeast.tropical * ester;
    flavor.acetic = yeast.acetic + (r.kind === 'malt' ? Math.max(0, days - 6) * 2 : 0);
    // 교차 발효 로직 (결정 #67): 저온 = 느리고 안정, 플로럴 에스테르↑ / 고온 = 빠르고 들쭉날쭉, 열대 과일↑, 산패 위험
    const sens = fermenterType === 'onggi' ? 1.2 : 1;
    const cold = Math.max(0, 10 - temp) * sens;
    const hot = Math.max(0, temp - 25) * sens;
    flavor.floral = (flavor.floral ?? 0) + 1.5 * cold;
    flavor.fresh_fruit = (flavor.fresh_fruit ?? 0) + 0.5 * cold;
    flavor.tropical = (flavor.tropical ?? 0) + 2.5 * hot;
    if (hot > 0 && env?.rng) {
      chargeLPA *= clamp(1 + env.rng.normal(0, 0.015 * hot), 0.8, 1.1);
      const qc = distiller?.stats.b ?? 0;
      if (env.rng.chance(0.025 * hot * (1 - qc / 120))) {
        flavor.acetic = (flavor.acetic ?? 0) + 25;
        flavor.sulfur_meaty = (flavor.sulfur_meaty ?? 0) + 8;
        chargeLPA *= 0.8;
        warnings.push(`고온 발효(${temp.toFixed(0)}°C) 중 산패 — 수율 20% 손실, 산미 이취`);
      }
    }
    if (fermenterType === 'onggi') {
      flavor.nuruk_rice = (flavor.nuruk_rice ?? 0) * 1.1;
      flavor.earthy = (flavor.earthy ?? 0) + 3;
      flavor.fresh_fruit = (flavor.fresh_fruit ?? 0) + 3;
    }
    // 발효가 만드는 기본 이취·무게감
    flavor.solvent = 30;
    flavor.feinty = 35;
    flavor.sulfur_meaty = r.kind === 'malt' ? 25 : r.kind === 'grain' ? 15 : 12;
    flavor.oily_waxy = 20;
    if (r.kind === 'soju' && r.pressure === 'atmospheric') flavor.toasted_grain = (flavor.toasted_grain ?? 0) + 14;
    // 입지 물 (결정 #84)
    const w = WATER_EFFECT[env?.water ?? 'medium'];
    flavor.solvent *= w.offnote;
    flavor.feinty *= w.offnote;
    flavor.sulfur_meaty *= w.offnote;
    flavor.acetic = (flavor.acetic ?? 0) * w.offnote;
    flavor.fresh_fruit = (flavor.fresh_fruit ?? 0) * w.fruity + w.fruitAdd;
    flavor.floral = (flavor.floral ?? 0) * w.fruity;
    chargeLPA *= w.yield;
  }

  // 페인츠 재투입
  if (feintsInLPA > 0) {
    const share = Math.min(0.5, feintsInLPA / chargeLPA);
    flavor.feinty = (flavor.feinty ?? 0) + 20 * share;
    flavor.oily_waxy = (flavor.oily_waxy ?? 0) + 10 * share;
    chargeLPA += feintsInLPA * FEINTS_RECOVERY;
  }

  // 증류
  let lpa = chargeLPA;
  let abv = r.kind === 'gin' ? GIN_CHARGE_ABV : WASH_ABV[r.kind];
  let feintsOutLPA = 0;
  const maxAbv = 0.82 + 0.1 * still.reflux;
  if (still.stillType === 'column') {
    // 연속식: 한 번에 고도수로 정류하고, 초류·퓨젤은 별도 인출단으로 빠진다 → 레시피 컷 대신 고정 분획
    flavor = distillFlavor(flavor, { c1: COLUMN_CUT.c1, c2: COLUMN_CUT.c2, reflux: still.reflux, copperContact: still.copperContact });
    flavor.solvent = (flavor.solvent ?? 0) * 0.3;
    flavor.feinty = (flavor.feinty ?? 0) * 0.3;
    flavor.harshness = (flavor.harshness ?? 0) * 0.8;
    const hearts = heartsFraction(COLUMN_CUT.c1, COLUMN_CUT.c2);
    feintsOutLPA = lpa * (1 - hearts) * 0.97;
    lpa = lpa * hearts;
    abv = maxAbv;
  } else if (r.kind === 'baijiu') {
    flavor = distillFlavor(flavor, { c1: r.cut.c1, c2: r.cut.c2, reflux: still.reflux, copperContact: still.copperContact });
    const hearts = heartsFraction(r.cut.c1, r.cut.c2);
    feintsOutLPA = lpa * (1 - hearts) * 0.97;
    lpa = lpa * hearts;
    abv = BAIJIU_ABV;
  } else {
    for (let run = 0; run < r.runs; run++) {
      const final = run === r.runs - 1;
      const cut = final ? r.cut : WASH_RUN_CUT;
      flavor = distillFlavor(flavor, { c1: cut.c1, c2: cut.c2, reflux: still.reflux, copperContact: still.copperContact });
      const hearts = heartsFraction(cut.c1, cut.c2);
      if (final) feintsOutLPA = lpa * (1 - hearts) * 0.97;
      lpa = lpa * hearts;
      abv = Math.min(maxAbv, abv * 2.9 + 0.04 * still.reflux);
    }
  }
  if (r.pressure === 'vacuum' && still.vacuum) {
    flavor.toasted_grain = (flavor.toasted_grain ?? 0) * 0.3;
    flavor.fresh_fruit = (flavor.fresh_fruit ?? 0) * 1.2;
    flavor.floral = (flavor.floral ?? 0) * 1.2;
    flavor.harshness = (flavor.harshness ?? 0) - 10;
  }
  if (still.condenser === 'worm_tub') bodyBonus += 8;
  flavor.body = (flavor.body ?? 0) + bodyBonus;

  // 디스틸러: 공정 스탯이 이취를 줄임 (결과 확률 아님 — 결정론적 보정)
  const offMul = distiller ? 1.25 - 0.5 * (distiller.stats.b / 100) : 1.4;
  for (const k of ['solvent', 'feinty', 'acetic'] as const) flavor[k] = (flavor[k] ?? 0) * offMul;
  if (distiller) flavor.fresh_fruit = (flavor.fresh_fruit ?? 0) * (1 + 0.1 * (distiller.stats.a / 100));
  else warnings.push('디스틸러 없이 생산 — 품질 저하');

  // 규모의 경제: 큰 증류기일수록 L당 에너지비가 낮다
  cost += r.runs * still.chargeL * ENERGY_PER_L_RUN * Math.pow(1000 / still.chargeL, 0.3) * (priceIndex.energy ?? 1) * (env?.energyFactor ?? 1);

  return {
    lpa,
    abv,
    volumeL: lpa / abv,
    flavor: clampFlavor(flavor),
    cost: Math.round(cost),
    feintsOutLPA,
    ingredientsKg,
    warnings,
  };
}

/** 대량 구매 할인 배수 — 지난달 실제 구매량(kg) 기준 공급 등급 (주문만 크게 넣는 꼼수 방지) */
export function volumeDiscounts(s: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, kg] of Object.entries(s.ingredientKgLastMonth ?? {})) {
    const tier = VOLUME_DISCOUNT_TIERS.find((t) => kg >= t.minKg);
    if (tier) out[id] = tier.factor;
  }
  return out;
}
