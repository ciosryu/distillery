import { BOTANICALS, EQUIPMENT, GNS, INGREDIENTS, VOLUME_DISCOUNT_TIERS, YEASTS, type EquipmentDef } from './content/catalog';
import { addScaled, clamp, clampFlavor, distillFlavor, heartsFraction } from './flavor';
import { GI_LOCK, logisticsMultiplier, regionOf, siteOf, type WaterId } from './content/regions';
import type { Rng } from './rng';
import type { Flavor, FermenterType, GameState, Recipe, RegionId, Staff } from './types';
import { weatherOffset } from './weather';
import type { MonthReport, SpiritLot } from './types';
import { staffOf, bestBy, monthLabel, nid } from './util';
import { mod, effectivePriceIndex } from './modifiers';
import { rngFor } from './rng';
import { weightedAverage } from './flavor';
import type { TickContext } from './tick';
import { OEM } from './deals';
import { hasLocalIngredient, seasonalEnergyFactor, siteFreight } from './sites';
import { waterPermitCap } from './waterPermit';
import { evaluate, type Evaluation } from './flavor';
import { hexOf, HEX_AXES, HEX_LABEL } from './blendRadar';
import { AXIS } from './content/axes';
import { CATEGORY } from './content/categories';
import type { PresetRecipe } from './content/presets';
import { isLocked } from './scenario';
import type { ProductCategory, SpiritKind } from './types';

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

/** 배치 에너지비 — 위탁생산(OEM)처럼 원료 없이 증류만 할 때 (결정 #89) */
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
  /** 입지 물 (결정 #86) */
  water?: WaterId;
  /** 입지 입고 운송 할증(원재료) · 에너지비 배수(겨울 난방) */
  freight?: number;
  energyFactor?: number;
}

/** 물 효과 (결정 #86): 연수 = 이취↓·과일↑, 화산암반수 = 이취↓·과일 가산·수율↑ */
export const WATER_EFFECT: Record<WaterId, { offnote: number; fruity: number; fruitAdd: number; yield: number }> = {
  medium: { offnote: 1, fruity: 1, fruitAdd: 0, yield: 1 },
  soft: { offnote: 0.7, fruity: 1.1, fruitAdd: 0, yield: 1 },
  volcanic: { offnote: 0.8, fruity: 1, fruitAdd: 5, yield: 1.03 },
};

/** 발효실 온도 = 연평균 + 외기 편차의 80% + 발효열 2°C */
export function fermentationClimate(s: GameState, monthOfYear: number): number {
  const site = siteOf(s);
  const tm = site.tempC.reduce((a, b) => a + b, 0) / 12;
  // 발효실도 이번 달 기상 이상치·이벤트 충격을 받는다 (결정 #120)
  return tm + 0.8 * (site.tempC[monthOfYear - 1]! + weatherOffset(s).tempC - tm) + 2;
}

/** 발효 기간: 10°C 미만이면 1°C마다 3% 늘고, 25°C 초과면 1°C마다 2% 준다(최대 30%) (결정 #67) */
export function fermentDaysAt(days: number, tempC: number): number {
  if (tempC < 10) return Math.round(days * (1 + 0.03 * (10 - tempC)));
  if (tempC > 25) return Math.max(1, Math.round(days * Math.max(0.7, 1 - 0.02 * (tempC - 25))));
  return days;
}

export function stillDefOf(state: GameState, stillId: string): StillDef | null {
  const inst = state.production.equipment.find((e) => e.id === stillId);
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
    // 입지 물 (결정 #86)
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

// ───────────── 탱크 합치기 (P-PROD-6) ─────────────

/** 탱크에서 합치는 주종 — 캐스크로 갈 원액(몰트·그레인)만. 소주·진·고량주는 탱크에서 쉬는 것 자체가 숙성(스테인리스 휴지, #161)이라
 *  새 원액을 섞으면 오래 쉰 원액의 효과가 사라진다 → 달별 배치를 그대로 둔다(실측: 합치면 KR 경기 봇 파산 8/40 → 16/40, 몰트·그레인만 합치면 5/40) */
export const TANK_MERGE_KINDS: readonly SpiritKind[] = ['malt', 'grain'];

/** 같은 탱크에 합칠 원액인가 — 같은 레시피의 자체 뉴메이크(매입·숙성 원액 아님), 합치는 주종, 입지 원료 표기가 같을 때 */
export const sameTank = (a: SpiritLot, b: SpiritLot): boolean =>
  TANK_MERGE_KINDS.includes(a.kind) && !!a.recipeId && a.recipeId === b.recipeId && a.kind === b.kind && !a.sourced && !b.sourced && a.oakMonths === 0 && b.oakMonths === 0 && !!a.localIngredient === !!b.localIngredient;

/**
 * 탱크 원액에 새 뉴메이크를 합친다 — 향·도수·원가·원료 비율은 알코올(LPA) 가중 평균. id는 기존 탱크 것(화면 선택이 이어진다),
 * 생산 달은 가장 오래된 배치(탱크에 원액이 있던 첫 달), 배치 id는 새 것(이번 달 뒤로 통입한 캐스크가 이전 통입과 형제가 되지 않게)
 */
export function mergeIntoTank(tank: SpiritLot, fresh: SpiritLot, recipeName: string, sinceLabel: string): SpiritLot {
  const a = tank.volumeL * tank.abv;
  const b = fresh.volumeL * fresh.abv;
  const volumeL = tank.volumeL + fresh.volumeL;
  const shares = new Set([...Object.keys(tank.mashShare ?? {}), ...Object.keys(fresh.mashShare ?? {})]);
  const mashShare = shares.size ? Object.fromEntries([...shares].map((k) => [k, ((tank.mashShare?.[k] ?? 0) * a + (fresh.mashShare?.[k] ?? 0) * b) / (a + b)])) : undefined;
  return {
    ...tank,
    batchId: fresh.batchId,
    name: `${recipeName} · 탱크 (${sinceLabel}부터)`,
    volumeL,
    abv: (a + b) / volumeL,
    flavor: weightedAverage([{ flavor: tank.flavor, weight: a }, { flavor: fresh.flavor, weight: b }]),
    costPerLPA: (tank.costPerLPA * a + fresh.costPerLPA * b) / (a + b),
    createdMonth: Math.min(tank.createdMonth, fresh.createdMonth),
    ...(mashShare ? { mashShare } : {}),
  };
}

/** 대량 구매 할인 배수 — 지난달 실제 구매량(kg) 기준 공급 등급 (주문만 크게 넣는 꼼수 방지) */
export function volumeDiscounts(s: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, kg] of Object.entries(s.production.ingredientKgLastMonth ?? {})) {
    const tier = VOLUME_DISCOUNT_TIERS.find((t) => kg >= t.minKg);
    if (tier) out[id] = tier.factor;
  }
  return out;
}

// ───────────── 증류 인력·생산 단계(틱 2)·가동 미리보기 (옛 step.ts) (결정 #144 — 파일 쪼개기로 옮겨 왔다) ─────────────

/** 디스틸러 1인이 한 달에 운전할 수 있는 증류 횟수 */
export const distillerRunCapacity = (process: number) => 20 + process / 5;

interface FermenterSlot { id: string; type: FermenterType; capacityL: number; daysLeft: number }

/** 2 생산 (틱 단계 본문 — step.ts가 부른다) */
export function runProduction(s: GameState, report: MonthReport, ctx: TickContext): { runsUsed: number; mashKg: number } {
  const { monthOfYear, fermentC: fermC } = ctx;
  const prodRng = rngFor(s.seed, s.month, 'production');
  const distillers = staffOf(s, 'distiller');
  let distillerRuns = distillers.reduce((t, d) => t + distillerRunCapacity(d.stats.b), 0);
  const lead = bestBy(distillers, 'b');
  const stillRuns = new Map<string, number>();
  const fermenters: FermenterSlot[] = [];
  for (const e of s.production.equipment) {
    if (e.readyMonth > s.month) continue;
    const def = EQUIPMENT[e.catalogId];
    if (def?.kind === 'still') stillRuns.set(e.id, def.runsPerMonth);
    if (def?.kind === 'fermenter') fermenters.push({ id: e.id, type: def.fermenterType, capacityL: def.capacityL, daysLeft: 30 });
  }
  // 소주는 옹기 우선
  fermenters.sort((a, b) => (a.type === 'onggi' ? -1 : 0) - (b.type === 'onggi' ? -1 : 0));
  let runsUsed = 0;
  if (mod(s, 'production') === 0) { if (s.production.orders.length || s.b2b.oemContracts.length) report.notes.push('생산 중단 — 이번 달은 증류하지 못했습니다'); return { runsUsed, mashKg: 0 }; }
  // 원재료 가격 = 시세 지수 × 이벤트 보정 × 대량 구매 할인
  const prices = effectivePriceIndex(s, volumeDiscounts(s));
  const boughtKg: Record<string, number> = {};
  // 입지 특성 (결정 #86): 물·입고 운송 할증·겨울 에너지비, 취수 허가(제주) = 월 발효 투입 용량 상한
  const site = siteOf(s);
  const energyFactor = seasonalEnergyFactor(s, monthOfYear);
  let waterLeftL = waterPermitCap(s);
  let waterBlocked = false;

  // 위탁생산(OEM, 간토, 결정 #89) — 자사 생산보다 먼저 설비를 내준다. 원료는 위탁사 부담, 에너지비만 우리 몫
  const oemDone: string[] = [];
  for (const c of s.b2b.oemContracts) {
    if (s.month < c.startMonth) continue; // 전용 증류기 설치 중
    const stills = s.production.equipment
      .filter((e) => e.readyMonth <= s.month && EQUIPMENT[e.catalogId]?.kind === 'still' && (EQUIPMENT[e.catalogId] as { stillType: string }).stillType !== 'column')
      .sort((a, b) => (a.id === c.stillId ? -1 : 0) - (b.id === c.stillId ? -1 : 0));
    let done = 0;
    for (let b = 0; b < c.batchesPerMonth; b++) {
      const stillInst = stills.find((e) => (stillRuns.get(e.id) ?? 0) >= OEM.runs);
      const still = stillInst ? stillDefOf(s, stillInst.id) : null;
      if (!stillInst || !still || distillerRuns < OEM.runs || waterLeftL < still.chargeL) break;
      const need = fermentDaysAt(OEM.fermentDays, fermC) + 2;
      const ferm = fermenters.find((f) => f.capacityL >= still.chargeL && f.daysLeft >= need && f.type !== 'onggi');
      if (!ferm) break;
      ferm.daysLeft -= need;
      waterLeftL -= still.chargeL;
      stillRuns.set(stillInst.id, (stillRuns.get(stillInst.id) ?? 0) - OEM.runs);
      distillerRuns -= OEM.runs;
      runsUsed += OEM.runs;
      const energy = Math.round(batchEnergyCost(still, OEM.runs, prices.energy ?? 1, energyFactor));
      s.finance.cash -= energy;
      report.expenses.production = (report.expenses.production ?? 0) + energy;
      done++;
    }
    const missed = c.batchesPerMonth - done;
    const fee = done * c.feePerBatch;
    const penalty = missed * c.penaltyPerBatch;
    s.finance.cash += fee - penalty;
    report.oemRevenue = (report.oemRevenue ?? 0) + fee;
    report.revenue += fee;
    if (penalty > 0) { report.expenses.penalty = (report.expenses.penalty ?? 0) + penalty; report.notes.push(`${c.buyerName} 위탁생산 ${missed}배치 미이행 — 위약금`); }
    c.monthsDone += 1;
    c.missed += missed;
    if (c.missed >= 2 * c.batchesPerMonth) {
      // 전용 증류기 지원금은 남은 기간 비율만큼 돌려준다 (설비는 우리 것으로 남는다)
      const refund = Math.round(((c.capexSupport ?? 0) * Math.max(0, c.termMonths - c.monthsDone)) / c.termMonths);
      s.finance.cash -= refund;
      report.notes.push(`${c.buyerName} 위탁생산 계약 파기 — 누적 미이행 과다${refund ? `, 설비 지원금 ${refund.toLocaleString()}원 반환` : ''}`);
      oemDone.push(c.id);
    } else if (c.monthsDone >= c.termMonths) { report.notes.push(`${c.buyerName} 위탁생산 계약 만료`); oemDone.push(c.id); }
  }
  s.b2b.oemContracts = s.b2b.oemContracts.filter((c) => !oemDone.includes(c.id));

  for (const order of s.production.orders) {
    if (order.batchesPerMonth <= 0) continue;
    const recipe = s.production.recipes.find((r) => r.id === order.recipeId);
    if (!recipe) continue;
    const still = stillDefOf(s, recipe.stillId);
    const stillInst = s.production.equipment.find((e) => e.id === recipe.stillId);
    if (!still || !stillInst || stillInst.readyMonth > s.month) { report.notes.push(`${recipe.name}: 증류기가 준비되지 않아 생산 중단`); continue; }
    const parts: { lot: Omit<SpiritLot, 'id' | 'name'>; lpa: number; cost: number }[] = [];
    let blocked = '';
    for (let b = 0; b < order.batchesPerMonth; b++) {
      if ((stillRuns.get(stillInst.id) ?? 0) < recipe.runs) { blocked = '증류기 가동 한도'; break; }
      if (distillerRuns < recipe.runs) { blocked = distillers.length ? '디스틸러 운전 한도' : '디스틸러 없음'; break; }
      if (recipe.kind !== 'gin' && waterLeftL < still.chargeL) { blocked = '취수 허가량'; waterBlocked = true; break; }
      let ferm: FermenterSlot | undefined;
      if (recipe.kind !== 'gin') {
        // 발효실 온도에 따라 발효 기간이 늘거나 준다 (결정 #67)
        const need = fermentDaysAt(recipe.fermentDays, fermC) + 2;
        ferm = fermenters.find((f) => f.capacityL >= still.chargeL && f.daysLeft >= need && (recipe.kind === 'soju' || f.type !== 'onggi'))
          ?? fermenters.find((f) => f.capacityL >= still.chargeL && f.daysLeft >= need);
        if (!ferm) { blocked = '발효조 부족'; break; }
        ferm.daysLeft -= need;
        waterLeftL -= still.chargeL;
      }
      stillRuns.set(stillInst.id, (stillRuns.get(stillInst.id) ?? 0) - recipe.runs);
      distillerRuns -= recipe.runs;
      runsUsed += recipe.runs;
      const res = simulateBatch(recipe, still, ferm?.type ?? null, lead, prices, stillInst.feintsLPA ?? 0, { tempC: fermC, rng: prodRng, regionId: s.regionId, water: site.water, freight: siteFreight(s, 'ingredients'), energyFactor });
      stillInst.feintsLPA = res.feintsOutLPA;
      s.finance.cash -= res.cost;
      for (const [id, kg] of Object.entries(res.ingredientsKg)) boughtKg[id] = (boughtKg[id] ?? 0) + kg;
      parts.push({
        lpa: res.lpa, cost: res.cost,
        lot: { kind: recipe.kind, volumeL: res.volumeL, abv: res.abv, flavor: res.flavor, createdMonth: s.month, oakMonths: 0, sourced: false, costPerLPA: res.cost / res.lpa, recipeId: recipe.id, ...(recipe.mashBill.length ? { mashShare: Object.fromEntries(recipe.mashBill.map((m) => [m.ingredientId, m.ratio])) } : {}) },
      });
      for (const w of res.warnings) if (!report.notes.includes(w)) report.notes.push(w);
    }
    if (blocked) report.notes.push(`${recipe.name}: ${blocked}로 ${order.batchesPerMonth - parts.length}배치 생산 못 함`);
    if (!parts.length) continue;
    const lpa = parts.reduce((t, p) => t + p.lpa, 0);
    const volumeL = parts.reduce((t, p) => t + p.lot.volumeL, 0);
    const cost = parts.reduce((t, p) => t + p.cost, 0);
    const lotId = nid(s, 'L');
    const fresh: SpiritLot = {
      ...parts[0]!.lot,
      id: lotId,
      batchId: lotId,
      name: `${recipe.name} · ${monthLabel(s.startYear, s.month)}`,
      volumeL,
      abv: lpa / volumeL,
      flavor: weightedAverage(parts.map((p) => ({ flavor: p.lot.flavor, weight: p.lpa }))),
      costPerLPA: cost / lpa,
      ...(hasLocalIngredient(site, recipe) ? { localIngredient: true } : {}),
    };
    // 같은 레시피 몰트·그레인 뉴메이크는 탱크(스피릿 리시버)에서 합친다 (P-PROD-6) — 달마다 배치가 따로 쌓여 통입 화면에 원액이 수십 개가 되던 것
    const ti = s.inventory.lots.findIndex((l) => sameTank(l, fresh));
    if (ti < 0) s.inventory.lots.push(fresh);
    else s.inventory.lots[ti] = mergeIntoTank(s.inventory.lots[ti]!, fresh, recipe.name, monthLabel(s.startYear, s.inventory.lots[ti]!.createdMonth));
    if (recipe.kind === 'soju') s.production.flags.producedSoju = true;
    report.production.push({ recipeId: recipe.id, name: recipe.name, batches: parts.length, lpa, cost });
    report.expenses.production = (report.expenses.production ?? 0) + cost;
  }
  if (waterBlocked) report.notes.push(`취수 허가량(월 ${waterPermitCap(s).toLocaleString()}L)에 막혀 일부 배치를 못 만들었습니다 — 증량 신청을 검토하세요`);
  s.production.ingredientKgLastMonth = boughtKg;
  const mashKg = Object.entries(boughtKg).filter(([k]) => k !== 'gns' && INGREDIENTS[k]).reduce((t, [, v]) => t + v, 0);
  return { runsUsed, mashKg };
}

export interface CapacityReport {
  stills: { id: string; name: string; used: number; cap: number }[];
  fermenterDaysUsed: number;
  fermenterDaysCap: number;
  distillerRunsUsed: number;
  distillerRunsCap: number;
}

/** 현재 생산 지시 기준의 설비·인력 가동 예상 (UI 미리보기용) */
export function capacityReport(s: GameState): CapacityReport {
  const stills = s.production.equipment
    .filter((e) => EQUIPMENT[e.catalogId]?.kind === 'still')
    .map((e) => {
      const def = EQUIPMENT[e.catalogId]!;
      return { id: e.id, name: def.nameKo + (e.readyMonth > s.month ? ` (설치 중, ${monthLabel(s.startYear, e.readyMonth)})` : ''), used: 0, cap: e.readyMonth <= s.month && def.kind === 'still' ? def.runsPerMonth : 0 };
    });
  let fermenterDaysUsed = 0;
  let distillerRunsUsed = 0;
  for (const o of s.production.orders) {
    const r = s.production.recipes.find((x) => x.id === o.recipeId);
    if (!r) continue;
    const st = stills.find((x) => x.id === r.stillId);
    if (st) st.used += o.batchesPerMonth * r.runs;
    distillerRunsUsed += o.batchesPerMonth * r.runs;
    if (r.kind !== 'gin') fermenterDaysUsed += o.batchesPerMonth * (r.fermentDays + 2);
  }
  const fermenterDaysCap = s.production.equipment.filter((e) => EQUIPMENT[e.catalogId]?.kind === 'fermenter' && e.readyMonth <= s.month).length * 30;
  const distillerRunsCap = staffOf(s, 'distiller').reduce((t, d) => t + distillerRunCapacity(d.stats.b), 0);
  return { stills, fermenterDaysUsed, fermenterDaysCap, distillerRunsUsed, distillerRunsCap: Math.floor(distillerRunsCap) };
}

// ───────────── 크래프팅 레버 (mvp.md §1.2, 결정 #134 — 결정 #156) ─────────────
// 생산 화면이 "프리셋으로 시작 → 고급 설정에서 레버를 바꾼다 → 향미 육각형 + 품질 + 무엇이 무엇을 바꿨나 한 줄"을 보여 주는 데 쓰는 순수 함수.
// 게임 상태를 바꾸지 않는다(미리보기 전용) — 틱·봇·세이브 동작은 그대로다.

/** 뉴메이크(원액)를 평가하는 범주 — 생산 화면 미리보기 기준 */
export const newmakeCategory = (k: SpiritKind): ProductCategory => (k === 'soju' ? 'soju_distilled' : k === 'gin' ? 'gin' : k === 'baijiu' ? 'baijiu' : 'malt_spirit');

export type PreviewResult = BatchResult & { evaluation: Evaluation };

/**
 * 배치 1회 미리보기 — 지금 가진 발효조·리드 디스틸러·시세·입지 물로 계산한다. 발효실 온도는 기본 18°C(달마다 바뀌는 실제 온도는 쓰지 않는다 — 미리보기가 달마다 흔들리지 않게).
 * 증류기가 없으면 null
 */
export function previewBatch(s: GameState, r: Recipe): PreviewResult | null {
  const still = stillDefOf(s, r.stillId);
  if (!still) return null;
  const fermTypes = s.production.equipment.map((e) => EQUIPMENT[e.catalogId]).filter((d) => d?.kind === 'fermenter').map((d) => (d as { fermenterType: FermenterType }).fermenterType);
  const ferm: FermenterType | null = r.kind === 'gin' ? null : r.kind === 'soju' && fermTypes.includes('onggi') ? 'onggi' : fermTypes[0] ?? 'stainless';
  const b = simulateBatch(r, still, ferm, bestBy(staffOf(s, 'distiller'), 'b'), s.world.priceIndex, 0);
  return { ...b, evaluation: evaluate(b.flavor, newmakeCategory(r.kind)) };
}

/** 향미 프로필의 한 축 (화면 레이더용, 0~100으로 자르지 않은 값) */
export interface ProfileAxis { id: string; label: string; value: number }

/**
 * 향미 프로필 — 몰트·그레인은 블렌딩 육각형(6축, blendRadar)으로 본다: 뉴메이크 → 캐스크 샘플(sampleLog) → 블렌딩 테이블이 **같은 여섯 축**이라
 * "이 레시피가 숙성 뒤 어디로 갈지"를 같은 그림에서 읽는다. 위스키 육각형은 소주의 누룩·곡물 향을 담지 못하므로 그 밖의 주종은 주종 범주의 레이더 축을 쓴다(#156)
 */
export function flavorProfile(kind: SpiritKind, f: Flavor): ProfileAxis[] {
  if (kind === 'malt' || kind === 'grain') {
    const h = hexOf(f);
    return HEX_AXES.map((a) => ({ id: a, label: HEX_LABEL[a], value: h[a] }));
  }
  return CATEGORY[newmakeCategory(kind)].radarAxes.map((a) => ({ id: a, label: AXIS[a].nameKo, value: f[a] ?? 0 }));
}

/** 이 판에서 고를 수 있는 프리셋 — 입지 원료 프리셋 + 지역 프리셋, 시나리오가 잠근 주종은 뺀다 */
export function craftPresets(s: GameState): PresetRecipe[] {
  return [...(siteOf(s).presets ?? []), ...regionOf(s).presets].filter((p) => !isLocked(s, `kind:${p.kind}`));
}

const mainIngredient = (r: Pick<Recipe, 'mashBill'>) => [...r.mashBill].sort((a, b) => b.ratio - a.ratio)[0]?.ingredientId;

/** 레시피가 출발한 프리셋(추정) — 같은 이름 → 같은 주종·같은 주원료 → 같은 주종의 첫 프리셋. 레시피에 출처를 저장하지 않으므로 화면 설명용 추정이다 */
export function basePresetOf(s: GameState, r: Pick<Recipe, 'name' | 'kind' | 'mashBill'>): PresetRecipe | null {
  const same = craftPresets(s).filter((p) => p.kind === r.kind);
  return same.find((p) => p.name === r.name) ?? same.find((p) => mainIngredient(p) === mainIngredient(r)) ?? same[0] ?? null;
}

export type RecipeLever = 'mash' | 'botanicals' | 'yeast' | 'fermentDays' | 'runs' | 'cut' | 'pressure' | 'still';

export const LEVER_LABEL: Record<RecipeLever, string> = { mash: '원료', botanicals: '보태니컬', yeast: '효모', fermentDays: '발효 기간', runs: '증류 횟수', cut: '컷', pressure: '증류 방식', still: '증류기' };

/** 프리셋을 지금 판의 레시피로 — 증류기는 draft와 같은 것을 쓰되, 감압이 아닌 프리셋을 감압 증류기에 비교하지 않게 상압 증류기를 고른다 */
export function presetAsRecipe(s: GameState, p: PresetRecipe, draft: Pick<Recipe, 'stillId' | 'pressure'>): Recipe {
  let stillId = draft.stillId;
  if (p.pressure !== draft.pressure) {
    const plain = s.production.equipment.find((e) => { const d = EQUIPMENT[e.catalogId]; return d?.kind === 'still' && !d.vacuum && d.stillType !== 'column'; });
    if (plain) stillId = plain.id;
  }
  return { ...structuredClone(p), id: 'preset', stillId };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** base에 draft의 레버 하나만 옮긴 레시피 */
function withLever(base: Recipe, draft: Recipe, lever: RecipeLever): Recipe {
  switch (lever) {
    case 'mash': return { ...base, mashBill: draft.mashBill };
    case 'botanicals': return { ...base, botanicals: draft.botanicals, botanicalMethod: draft.botanicalMethod };
    case 'yeast': return { ...base, yeast: draft.yeast };
    case 'fermentDays': return { ...base, fermentDays: draft.fermentDays };
    case 'runs': return { ...base, runs: draft.runs };
    case 'cut': return { ...base, cut: draft.cut };
    // 감압은 감압 증류기에서만 된다 → 방식과 증류기를 함께 옮긴다
    case 'pressure': return { ...base, pressure: draft.pressure, stillId: draft.stillId };
    case 'still': return { ...base, stillId: draft.stillId };
  }
}

/** base와 draft가 다른 레버 (gin은 매시·효모·발효를 쓰지 않는다) */
export function changedLevers(base: Recipe, draft: Recipe): RecipeLever[] {
  const out: RecipeLever[] = [];
  if (draft.kind === 'gin') { if (!sameJson(base.botanicals, draft.botanicals) || base.botanicalMethod !== draft.botanicalMethod) out.push('botanicals'); }
  else {
    if (!sameJson(base.mashBill, draft.mashBill)) out.push('mash');
    if (base.yeast !== draft.yeast) out.push('yeast');
    if (base.fermentDays !== draft.fermentDays) out.push('fermentDays');
  }
  if (base.runs !== draft.runs) out.push('runs');
  if (base.cut.c1 !== draft.cut.c1 || base.cut.c2 !== draft.cut.c2) out.push('cut');
  if (base.pressure !== draft.pressure) out.push('pressure');
  else if (base.stillId !== draft.stillId) out.push('still');
  return out;
}

const shortName = (n: string) => n.replace(/\s*\(.*\)$/, '');

/** 레버 값의 짧은 표기 */
export function leverValue(s: GameState, r: Recipe, lever: RecipeLever): string {
  switch (lever) {
    case 'mash': return r.mashBill.map((m) => `${shortName(INGREDIENTS[m.ingredientId]?.nameKo ?? m.ingredientId)}${r.mashBill.length > 1 ? ` ${Math.round(m.ratio * 100)}%` : ''}`).join('·');
    case 'botanicals': return `${r.botanicals.length}종·${r.botanicalMethod === 'vapor' ? '증기' : '침지'}`;
    case 'yeast': return YEASTS[r.yeast].nameKo;
    case 'fermentDays': return `${r.fermentDays}일`;
    case 'runs': return `${r.runs}회`;
    case 'cut': return `${r.cut.c1.toFixed(2)}~${r.cut.c2.toFixed(2)}`;
    case 'pressure': return r.pressure === 'vacuum' ? '감압' : '상압';
    case 'still': return shortName(stillDefOf(s, r.stillId)?.nameKo ?? '—');
  }
}

export interface LeverEffect {
  lever: RecipeLever;
  from: string;
  to: string;
  /** 이 레버만 바꿨을 때의 변화 (다른 레버는 기준 프리셋 그대로) */
  dQuality: number;
  /** 산출 LPA 변화율 */
  dYield: number;
  dOffnotes: number;
  /** 향미 프로필에서 가장 크게 움직인 축 */
  topAxis: { label: string; d: number } | null;
}

/**
 * 레버별 효과 — base(기준 프리셋)에서 레버 **하나씩만** draft 값으로 바꿔 미리보기를 비교한다.
 * 레버끼리 상호작용이 있어(예: 컷 × 증류 횟수) 효과의 합이 전체 변화와 꼭 같지는 않다. 큰 순서로 정렬
 */
export function leverEffects(s: GameState, base: Recipe, draft: Recipe): LeverEffect[] {
  const b = previewBatch(s, base);
  if (!b) return [];
  const bp = flavorProfile(base.kind, b.flavor);
  const out: LeverEffect[] = [];
  for (const lever of changedLevers(base, draft)) {
    const v = previewBatch(s, withLever(base, draft, lever));
    if (!v) continue;
    const vp = flavorProfile(base.kind, v.flavor);
    let topAxis: LeverEffect['topAxis'] = null;
    vp.forEach((a, i) => { const d = a.value - bp[i]!.value; if (Math.abs(d) >= 1 && (!topAxis || Math.abs(d) > Math.abs(topAxis.d))) topAxis = { label: a.label, d }; });
    out.push({
      lever, from: leverValue(s, base, lever), to: leverValue(s, draft, lever),
      dQuality: v.evaluation.quality - b.evaluation.quality,
      dYield: b.lpa > 0 ? v.lpa / b.lpa - 1 : 0,
      dOffnotes: v.evaluation.offnotes - b.evaluation.offnotes,
      topAxis,
    });
  }
  const size = (e: LeverEffect) => Math.abs(e.dQuality) + Math.abs(e.topAxis?.d ?? 0) / 4 + Math.abs(e.dYield) * 20;
  return out.sort((x, y) => size(y) - size(x));
}

const signed = (v: number, digits = 0) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}`;

/** 레버 효과 한 개를 짧은 문장으로 — "발효 기간 4일→7일: 과일 +6 · 품질 +1.2" */
export function describeLeverEffect(e: LeverEffect): string {
  const parts: string[] = [];
  if (e.topAxis) parts.push(`${e.topAxis.label} ${signed(e.topAxis.d)}`);
  if (Math.abs(e.dOffnotes) >= 1) parts.push(`이취 ${signed(e.dOffnotes)}`);
  if (Math.abs(e.dYield) >= 0.02) parts.push(`수율 ${signed(e.dYield * 100)}%`);
  parts.push(`품질 ${signed(e.dQuality, 1)}`);
  return `${LEVER_LABEL[e.lever]} ${e.from}→${e.to}: ${parts.join(' · ')}`;
}

/** "무엇이 무엇을 바꿨나" 한 줄 — 큰 효과 2개 + 나머지 수. 바꾼 것이 없으면 프리셋 그대로라고 쓴다 */
export function leverSummary(effects: LeverEffect[], max = 2): string {
  if (!effects.length) return '프리셋 그대로입니다 — "고급 설정"에서 레버를 바꾸면 여기서 무엇이 무엇을 바꿨는지 보여 줍니다';
  const head = effects.slice(0, max).map(describeLeverEffect).join(' / ');
  return effects.length > max ? `${head} / 외 ${effects.length - max}개` : head;
}
