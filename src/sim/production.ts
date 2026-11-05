import { BOTANICALS, EQUIPMENT, GNS, INGREDIENTS, YEASTS, type EquipmentDef } from './content/catalog';
import { addScaled, clampFlavor, distillFlavor, heartsFraction } from './flavor';
import type { Flavor, FermenterType, GameState, Recipe, Staff } from './types';

type StillDef = Extract<EquipmentDef, { kind: 'still' }>;

export const WASH_ABV = { malt: 0.08, soju: 0.16 } as const;
export const GIN_CHARGE_ABV = 0.45;
const WASH_RUN_CUT = { c1: 0.02, c2: 0.98 };
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
  const still = stillDefOf(state, r.stillId);
  if (!still) errs.push('증류기를 선택하세요');
  if (r.cut.c1 < 0 || r.cut.c2 > 1 || r.cut.c1 >= r.cut.c2) errs.push('컷 포인트는 0 ≤ c1 < c2 ≤ 1 이어야 합니다');
  if (r.kind === 'gin') {
    if (!r.botanicals.length) errs.push('진에는 보태니컬이 필요합니다');
    if (!r.botanicals.some((b) => b.botanicalId === 'juniper')) errs.push('진에는 주니퍼가 반드시 들어가야 합니다');
    if (r.botanicalMethod === 'vapor' && still && !still.ginBasket) errs.push('이 증류기에는 진 바스켓이 없습니다(침지만 가능)');
  } else {
    const sum = r.mashBill.reduce((s, m) => s + m.ratio, 0);
    if (Math.abs(sum - 1) > 0.01) errs.push('원재료 비율 합이 100%가 되어야 합니다');
    for (const m of r.mashBill) {
      const ing = INGREDIENTS[m.ingredientId];
      if (!ing) errs.push(`알 수 없는 원재료: ${m.ingredientId}`);
      else if (!ing.kinds.includes(r.kind)) errs.push(`${ing.nameKo}은(는) 이 주종에 쓸 수 없습니다`);
    }
    if (r.fermentDays < 2 || r.fermentDays > 21) errs.push('발효 기간은 2~21일');
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
    const avgLpaPerKg = r.mashBill.reduce((s, m) => s + m.ratio * (INGREDIENTS[m.ingredientId]?.lpaPerKg ?? 0), 0);
    const kgTotal = chargeLPA / Math.max(0.01, avgLpaPerKg * yeast.yieldFactor);
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
    if (fermenterType === 'onggi') {
      flavor.nuruk_rice = (flavor.nuruk_rice ?? 0) * 1.1;
      flavor.earthy = (flavor.earthy ?? 0) + 3;
      flavor.fresh_fruit = (flavor.fresh_fruit ?? 0) + 3;
    }
    // 발효가 만드는 기본 이취·무게감
    flavor.solvent = 30;
    flavor.feinty = 35;
    flavor.sulfur_meaty = r.kind === 'malt' ? 25 : 12;
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
  for (let run = 0; run < r.runs; run++) {
    const final = run === r.runs - 1;
    const cut = final ? r.cut : WASH_RUN_CUT;
    flavor = distillFlavor(flavor, { c1: cut.c1, c2: cut.c2, reflux: still.reflux, copperContact: still.copperContact });
    const hearts = heartsFraction(cut.c1, cut.c2);
    if (final) feintsOutLPA = lpa * (1 - hearts) * 0.97;
    lpa = lpa * hearts;
    abv = Math.min(maxAbv, abv * 2.9 + 0.04 * still.reflux);
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
  cost += r.runs * still.chargeL * ENERGY_PER_L_RUN * Math.pow(1000 / still.chargeL, 0.3) * (priceIndex.energy ?? 1);

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
