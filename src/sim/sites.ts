import { EQUIPMENT, INGREDIENTS, UPGRADE_RISK_REDUCTION, type EquipmentDef, type UpgradeId } from './content/catalog';
import { regionOf } from './content/regions';
import { siteOf, type SiteDef } from './content/sites';
import { clamp } from './flavor';
import { rngFor } from './rng';
import { isUnlocked } from './unlocks';
import type { Cask, GameState, MonthReport, Product, Recipe } from './types';
import { calendar } from './util';

// 산지 규칙 (docs/design/regions.md Tier 1) — 부지 개량, 건설비, 전통주, 취수 허가, 겨울 발효, 테루아

// ── 부지 개량 ──

export function hasUpgrade(s: GameState, upgrade: UpgradeId): boolean {
  return s.equipment.some((e) => {
    const d = EQUIPMENT[e.catalogId];
    return d?.kind === 'upgrade' && d.upgrade === upgrade && e.readyMonth <= s.month;
  });
}

/** 리스크 피해 배수 (1 = 대비 없음). 가장 강한 개량 하나만 적용 */
export function riskScale(s: GameState, risk: 'earthquake'): number {
  let reduce = 0;
  for (const [id, r] of Object.entries(UPGRADE_RISK_REDUCTION)) if (r?.risk === risk && hasUpgrade(s, id as UpgradeId)) reduce = Math.max(reduce, r.reduce);
  return 1 - reduce;
}

// ── 설비 발주 ──

/** 산지 건설비 반영 설비 단가 */
export function equipmentCost(s: GameState, def: EquipmentDef): number {
  const site = siteOf(s);
  return Math.round(def.cost * site.buildCostFactor * (def.kind === 'warehouse' ? site.warehouseCostFactor : 1));
}

/** 발주 가능 여부 — 불가하면 사유 */
export function equipmentBlocker(s: GameState, def: EquipmentDef): string | null {
  if (def.sites && !def.sites.includes(s.siteId)) return `${siteOf(s).nameKo}에서는 설치할 수 없습니다`;
  if (!isUnlocked(s, `build:${def.id}`)) return '아직 해금되지 않았습니다';
  if (def.kind === 'upgrade') {
    if (s.equipment.some((e) => e.catalogId === def.id)) return '이미 설치(발주)했습니다';
    if (def.requires && !s.equipment.some((e) => e.catalogId === def.requires && e.readyMonth <= s.month)) return `${EQUIPMENT[def.requires]?.nameKo ?? def.requires} 설치가 먼저 필요합니다`;
  }
  return null;
}

/** 이 산지에서 발주 목록에 보일 설비 */
export function equipmentAvailable(s: GameState): EquipmentDef[] {
  return Object.values(EQUIPMENT).filter((d) => !d.sites || d.sites.includes(s.siteId));
}

// ── 전통주 (한국: 민속주·지역특산주) ──

/**
 * 레시피가 이 산지에서 전통주 자격을 갖는가 (결정 #62) — 주원료가 모두 산지가 정한 지역 농산물이고 발효제는 허용 목록만.
 * 주종은 가리지 않는다: 수입 맥아·옥수수·주정(진) 같은 원료가 하나라도 있으면 자격 없음
 */
export function isTraditionalRecipe(site: SiteDef, r: Pick<Recipe, 'kind' | 'mashBill'>): boolean {
  const t = site.traditional;
  if (!t || !r.mashBill.length) return false;
  const mains = r.mashBill.filter((m) => m.ratio > 0 && !t.starters.includes(m.ingredientId));
  if (!mains.length || !mains.every((m) => t.mainIngredients.includes(m.ingredientId))) return false;
  if (t.minShare) {
    const share = r.mashBill.filter((m) => m.ingredientId === t.minShare!.ingredient).reduce((a, m) => a + m.ratio, 0);
    if (share + 1e-9 < t.minShare.share) return false;
  }
  return true;
}

/** 연도가 바뀌면 전통주 출고량 집계를 넘긴다 */
export function rollTraditionalYear(s: GameState): NonNullable<GameState['siteState']['traditionalShipped']> {
  const { year } = calendar(s);
  const cur = s.siteState.traditionalShipped;
  if (!cur) return (s.siteState.traditionalShipped = { year, liters: 0, lastYearLiters: 0 });
  if (cur.year !== year) s.siteState.traditionalShipped = { year, liters: 0, lastYearLiters: cur.year === year - 1 ? cur.liters : 0 };
  return s.siteState.traditionalShipped!;
}

/** 이번 출고분에 적용할 전통주 감면율 (0이면 감면 없음) */
export function traditionalReliefRate(s: GameState, traditional: boolean | undefined): number {
  const rule = regionOf(s).traditional;
  if (!traditional || !rule) return 0;
  const st = s.siteState.traditionalShipped;
  const { year } = calendar(s);
  const lastYear = st ? (st.year === year ? st.lastYearLiters : st.year === year - 1 ? st.liters : 0) : 0;
  if (lastYear > rule.eligibleMaxLastYearL) return 0;
  const ytd = st && st.year === year ? st.liters : 0;
  return rule.tiers.find((t) => ytd < t.uptoL)?.relief ?? 0;
}

/** 전통주 온라인 직판 커버리지 가산 */
export function onlineCoverageBonus(s: GameState, p: Pick<Product, 'traditional'>): number {
  return p.traditional ? regionOf(s).traditional?.onlineCoverage ?? 0 : 0;
}

// ── 취수 허가 (제주) ──

/** 월 발효 투입 용량 상한(L). 없으면 Infinity */
export function waterPermitCap(s: GameState): number {
  return siteOf(s).waterPermit ? s.siteState.waterPermitL ?? siteOf(s).waterPermit!.baseL : Infinity;
}

/** 취수 증량 신청 (s는 변경 가능한 복제본) — 오류 문구 또는 null */
export function applyWaterPermit(s: GameState): string | null {
  const wp = siteOf(s).waterPermit;
  if (!wp) return '이 산지에는 취수 허가 제도가 없습니다';
  if (s.siteState.permitApplication) return '이미 심사 중인 신청이 있습니다';
  if (s.cash < wp.cost) return '현금이 부족합니다';
  s.cash -= wp.cost;
  const rng = rngFor(s.seed, s.month, 'permit');
  s.siteState.permitApplication = { decideMonth: s.month + rng.int(wp.months[0], wp.months[1]), addL: wp.stepL, chance: wp.chance };
  return null;
}

/** 월초: 심사 결과 확정 */
export function resolveWaterPermit(s: GameState, report: MonthReport): void {
  const app = s.siteState.permitApplication;
  if (!app || s.month < app.decideMonth) return;
  s.siteState.permitApplication = undefined;
  if (rngFor(s.seed, s.month, 'permit-decide').chance(app.chance)) {
    s.siteState.waterPermitL = waterPermitCap(s) + app.addL;
    report.events.push('취수 증량 승인');
    report.notes.push(`취수 허가 증량 승인 — 월 ${waterPermitCap(s).toLocaleString()}L`);
  } else {
    report.events.push('취수 증량 불허');
    report.notes.push('취수 허가 증량 신청이 불허됐습니다 (다시 신청할 수 있습니다)');
  }
}

// ── 지역 원료 계약재배 (안동, 결정 #68) ──

/** 원재료 월 공급 한도(kg) — 기본 한도 + 계약재배 확대분. 한도 없는 원료는 Infinity */
export function ingredientSupplyCap(s: GameState, ingredientId: string): number {
  const base = INGREDIENTS[ingredientId]?.monthlySupplyKg;
  if (base == null) return Infinity;
  const ls = siteOf(s).localSupply;
  return base + (ls?.ingredient === ingredientId ? s.siteState.localSupplyKg ?? 0 : 0);
}

/** 계약재배 확대 신청 — 오류 문구 또는 null */
export function expandLocalSupply(s: GameState): string | null {
  const ls = siteOf(s).localSupply;
  if (!ls) return '이 산지에는 지역 원료 계약재배가 없습니다';
  if (s.siteState.localSupplyPending) return '이미 진행 중인 계약재배 확대가 있습니다';
  if ((s.siteState.localSupplySteps ?? 0) >= ls.maxSteps) return `계약재배 확대는 최대 ${ls.maxSteps}회입니다`;
  if (s.cash < ls.cost) return '현금이 부족합니다';
  s.cash -= ls.cost;
  s.siteState.localSupplyPending = { readyMonth: s.month + ls.leadMonths, addKg: ls.stepKg };
  s.siteState.localSupplySteps = (s.siteState.localSupplySteps ?? 0) + 1;
  return null;
}

/** 월초: 계약재배 확대분 반영 */
export function resolveLocalSupply(s: GameState, report: MonthReport): void {
  const p = s.siteState.localSupplyPending;
  if (!p || s.month < p.readyMonth) return;
  s.siteState.localSupplyPending = undefined;
  s.siteState.localSupplyKg = (s.siteState.localSupplyKg ?? 0) + p.addKg;
  const ls = siteOf(s).localSupply!;
  report.notes.push(`${INGREDIENTS[ls.ingredient]?.nameKo ?? ls.ingredient} 계약재배 확대 — 월 ${ingredientSupplyCap(s, ls.ingredient).toLocaleString()}kg`);
}

// ── 계절 ──

/** 발효조 월 가동 일수 배수 (겨울 발효 지연) */
export function fermentCapacityFactor(s: GameState, monthOfYear: number): number {
  const w = siteOf(s).winterFerment;
  if (!w || !w.months.includes(monthOfYear) || hasUpgrade(s, 'temp_control')) return 1;
  return w.capacity;
}

/** 증류 에너지비 배수 (겨울 난방) */
export function seasonalEnergyFactor(s: GameState, monthOfYear: number): number {
  const h = siteOf(s).heating;
  return h && h.months.includes(monthOfYear) ? h.energyFactor : 1;
}

/** 이번 달 난방비 */
export function heatingCost(s: GameState, monthOfYear: number): number {
  const h = siteOf(s).heating;
  return h && h.months.includes(monthOfYear) ? h.perMonth : 0;
}

// ── 숙성 테루아 ──

export function applyTerroir(site: SiteDef, cask: Cask, tempC: number): Cask {
  if (!site.terroir || !cask.contents) return cask;
  const f = { ...cask.contents.flavor };
  for (const t of site.terroir) {
    if (tempC < t.minTempC) continue;
    const cur = f[t.axis] ?? 0;
    if (cur < t.cap) f[t.axis] = clamp(cur + t.perMonth, 0, t.cap);
  }
  return { ...cask, contents: { ...cask.contents, flavor: f } };
}
