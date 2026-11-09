import { BOTANICALS, EQUIPMENT, INGREDIENTS, type EquipmentDef } from './content/catalog';
import { regionOf, siteOf, type SiteDef } from './content/regions';
import type { GameState, Recipe } from './types';

// 입지 특성 규칙 (결정 #86~, docs/design/regions.md) — 기후·특산물(v0.9 #62) 위에 얹는 물·고정비·물류·취수·면세·담보대출

// ───────────── 고정비·건설비·물류 ─────────────

/** 이 입지의 월 관리비 = (시나리오 관리비 또는 지역 관리비) × 입지 배수 — 시나리오 규모 티어가 관리비를 정한다 (S-8, #139·2) */
export const siteOverhead = (s: Pick<GameState, 'regionId' | 'siteId'> & Partial<Pick<GameState, 'scenario'>>) => Math.round((s.scenario?.economy.overheadPerMonth ?? regionOf(s).overheadPerMonth) * (siteOf(s).overheadFactor ?? 1));

/** 입지 건설비 반영 설비 단가 (숙성고는 땅값 배수를 한 번 더) */
export function equipmentCost(s: Pick<GameState, 'regionId' | 'siteId'>, def: EquipmentDef): number {
  const site = siteOf(s);
  return Math.round(def.cost * (site.buildCostFactor ?? 1) * (def.kind === 'warehouse' ? site.warehouseCostFactor ?? 1 : 1));
}

/** 입고 운송 할증 */
export const siteFreight = (s: Pick<GameState, 'regionId' | 'siteId'>, k: 'ingredients' | 'packaging' | 'casks') => siteOf(s).freight?.[k] ?? 1;

/** 국내 출고 물류비 배수 */
export const outboundLogistics = (s: Pick<GameState, 'regionId' | 'siteId'>) => siteOf(s).outboundLogistics ?? 1;

/** 원액 B2B 운송비 배수 (블렌더 매입 단가) */
export const bulkFreight = (s: Pick<GameState, 'regionId' | 'siteId'>) => siteOf(s).bulkFreight ?? 1;

/** 이번 달 난방비 / 증류 에너지비 배수 */
export function heatingCost(s: Pick<GameState, 'regionId' | 'siteId'>, monthOfYear: number): number {
  const h = siteOf(s).heating;
  return h && h.months.includes(monthOfYear) ? h.perMonth : 0;
}
export function seasonalEnergyFactor(s: Pick<GameState, 'regionId' | 'siteId'>, monthOfYear: number): number {
  const h = siteOf(s).heating;
  return h && h.months.includes(monthOfYear) ? h.energyFactor : 1;
}

/** 발주 목록에서 숨길 설비가 생기면 여기서 거른다 (지금은 전부 허용) */
export const equipmentAvailable = (): EquipmentDef[] => Object.values(EQUIPMENT);

// ───────────── 입지 원료 (결정 #87) ─────────────

/** 레시피가 이 입지의 원료(입지 전용 원재료·보태니컬)를 쓰는가 — 제주 차조 고소리술, 청귤 진 */
export function hasLocalIngredient(site: Pick<SiteDef, 'id'>, r: Pick<Recipe, 'mashBill'> & Partial<Pick<Recipe, 'botanicals'>>): boolean {
  const local = (sites?: string[]) => !!sites?.includes(site.id);
  if (r.mashBill.some((m) => m.ratio > 0 && local(INGREDIENTS[m.ingredientId]?.sites))) return true;
  return (r.botanicals ?? []).some((b) => b.gramsPerL > 0 && local(BOTANICALS[b.botanicalId]?.sites));
}
