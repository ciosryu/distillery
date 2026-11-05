import { BOTANICALS, EQUIPMENT, GNS, INGREDIENTS, VOLUME_DISCOUNT_TIERS, YEASTS, type EquipmentDef } from './content/catalog';
import { addScaled, clampFlavor, distillFlavor, heartsFraction } from './flavor';
import { regionOf } from './content/regions';
import { siteOf, type WaterId } from './content/sites';
import type { Flavor, FermenterType, GameState, Recipe, Staff } from './types';

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
  const site = siteOf(state);
  if (!region.allowedKinds.includes(r.kind)) errs.push(`${region.nameKo}에서는 이 주종을 생산할 수 없습니다`);
  const still = stillDefOf(state, r.stillId);
  if (!still) errs.push('증류기를 선택하세요');
  if (r.cut.c1 < 0 || r.cut.c2 > 1 || r.cut.c1 >= r.cut.c2) errs.push('컷 포인트는 0 ≤ c1 < c2 ≤ 1 이어야 합니다');
  if (r.kind === 'gin') {
    if (!r.botanicals.length) errs.push('진에는 보태니컬이 필요합니다');
    if (!r.botanicals.some((b) => b.botanicalId === 'juniper')) errs.push('진에는 주니퍼가 반드시 들어가야 합니다');
    if (r.botanicalMethod === 'vapor' && still && !still.ginBasket) errs.push('이 증류기에는 진 바스켓이 없습니다(침지만 가능)');
    for (const b of r.botanicals) {
      const def = BOTANICALS[b.botanicalId];
      if (def?.regions && !def.regions.includes(region.id)) errs.push(`${def.nameKo}은(는) 이 지역에서 구할 수 없습니다`);
      if (def?.sites && !def.sites.includes(site.id)) errs.push(`${def.nameKo}은(는) ${site.nameKo}에서만 구할 수 있습니다`);
    }
  } else {
    const sum = r.mashBill.reduce((s, m) => s + m.ratio, 0);
    if (Math.abs(sum - 1) > 0.01) errs.push('원재료 비율 합이 100%가 되어야 합니다');
    for (const m of r.mashBill) {
      const ing = INGREDIENTS[m.ingredientId];
      if (!ing) errs.push(`알 수 없는 원재료: ${m.ingredientId}`);
      else if (!(ing.kinds as string[]).includes(r.kind)) errs.push(`${ing.nameKo}은(는) 이 주종에 쓸 수 없습니다`);
      else if (ing.sites && !ing.sites.includes(site.id)) errs.push(`${ing.nameKo}은(는) ${site.nameKo}에서만 구할 수 있습니다`);
    }
    if (r.fermentDays < 2 || r.fermentDays > 28) errs.push('발효 기간은 2~28일');
  }
  if (r.pressure === 'vacuum' && still && !still.vacuum) errs.push('감압 증류는 감압 증류기에서만 가능합니다');
  return errs;
}

/** 물이 발효에 주는 효과 [튜닝] — 연수 = 과일·플로럴↑·이취↓, 화산암반수 = 이취↓·과일↑·수율↑ */
export const WATER_EFFECT: Record<WaterId, { offnote: number; fruity: number; fruitAdd: number; yield: number }> = {
  medium: { offnote: 1, fruity: 1, fruitAdd: 0, yield: 1 },
  soft: { offnote: 0.7, fruity: 1.1, fruitAdd: 0, yield: 1 },
  volcanic: { offnote: 0.8, fruity: 1, fruitAdd: 5, yield: 1.03 },
};

/** 배치 1회 시뮬레이션 (결정론적) */
export function simulateBatch(
  r: Recipe,
  still: StillDef,
  fermenterType: FermenterType | null,
  distiller: Staff | undefined,
  priceIndex: Record<string, number>,
  feintsInLPA: number,
  water: WaterId = 'medium',
): BatchResult {
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
      cost += kg * def.pricePerKg;
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
    const w = WATER_EFFECT[water];
    const avgLpaPerKg = r.mashBill.reduce((s, m) => s + m.ratio * (INGREDIENTS[m.ingredientId]?.lpaPerKg ?? 0), 0);
    const kgTotal = chargeLPA / Math.max(0.01, avgLpaPerKg * yeast.yieldFactor * w.yield);
    for (const m of r.mashBill) {
      const ing = INGREDIENTS[m.ingredientId];
      if (!ing) continue;
      const kg = kgTotal * m.ratio;
      ingredientsKg[ing.id] = kg;
      cost += kg * ing.pricePerKg * (priceIndex[ing.id] ?? 1);
      flavor = addScaled(flavor, ing.flavor, m.ratio);
    }
    // 발효: 기간이 길수록 에스테르 포화 증가
    const ester = 1 - Math.exp(-r.fermentDays / 4);
    flavor.fresh_fruit = (flavor.fresh_fruit ?? 0) + 18 * ester * yeast.ester;
    flavor.floral = (flavor.floral ?? 0) + 6 * ester * yeast.ester;
    flavor.tropical = (flavor.tropical ?? 0) + yeast.tropical * ester;
    flavor.acetic = yeast.acetic + (r.kind === 'malt' ? Math.max(0, r.fermentDays - 6) * 2 : 0);
    // 물: 발효 단계의 과일·플로럴과 산패
    flavor.fresh_fruit = (flavor.fresh_fruit ?? 0) * w.fruity + w.fruitAdd;
    flavor.floral = (flavor.floral ?? 0) * w.fruity;
    flavor.acetic *= w.offnote;
    if (fermenterType === 'onggi') {
      flavor.nuruk_rice = (flavor.nuruk_rice ?? 0) * 1.1;
      flavor.earthy = (flavor.earthy ?? 0) + 3;
      flavor.fresh_fruit = (flavor.fresh_fruit ?? 0) + 3;
    }
    // 발효가 만드는 기본 이취·무게감 (물이 초류취를 조금 바꾼다)
    flavor.solvent = 30 * (0.5 + 0.5 * w.offnote);
    flavor.feinty = 35;
    flavor.sulfur_meaty = r.kind === 'malt' ? 25 : r.kind === 'grain' ? 15 : 12;
    flavor.oily_waxy = 20;
    if (r.kind === 'soju' && r.pressure === 'atmospheric') flavor.toasted_grain = (flavor.toasted_grain ?? 0) + 14;
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
  // 석탄 직화: 솥 바닥이 국부 가열돼 무겁고 구수한 원액 (요이치형)
  if (still.directFire && r.kind !== 'gin') {
    bodyBonus += 6;
    flavor.oily_waxy = (flavor.oily_waxy ?? 0) + 5;
    flavor.toasted_grain = (flavor.toasted_grain ?? 0) + 4;
  }
  flavor.body = (flavor.body ?? 0) + bodyBonus;

  // 디스틸러: 공정 스탯이 이취를 줄임 (결과 확률 아님 — 결정론적 보정). 직화는 불 조절 숙련이 더 필요하다
  const fireSkill = still.directFire ? 1.15 - 0.3 * ((distiller?.stats.b ?? 0) / 100) : 1;
  const offMul = (distiller ? 1.25 - 0.5 * (distiller.stats.b / 100) : 1.4) * fireSkill;
  for (const k of ['solvent', 'feinty', 'acetic'] as const) flavor[k] = (flavor[k] ?? 0) * offMul;
  if (distiller) flavor.fresh_fruit = (flavor.fresh_fruit ?? 0) * (1 + 0.1 * (distiller.stats.a / 100));
  else warnings.push('디스틸러 없이 생산 — 품질 저하');

  // 규모의 경제: 큰 증류기일수록 L당 에너지비가 낮다
  cost += batchEnergyCost(still, r.runs, priceIndex.energy ?? 1);

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

/** 배치 증류 에너지비 — 큰 증류기일수록 L당 에너지비가 낮다(규모의 경제), 직화는 +15% */
export function batchEnergyCost(still: StillDef, runs: number, energyIndex: number): number {
  return runs * still.chargeL * ENERGY_PER_L_RUN * Math.pow(1000 / still.chargeL, 0.3) * energyIndex * (still.directFire ? 1.15 : 1);
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
