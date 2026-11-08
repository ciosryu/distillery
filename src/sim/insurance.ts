import { EQUIPMENT, INSURANCE_PRODUCTS, type InsuranceProductDef } from './content/catalog';
import { monthlyFixedCost } from './loans';
import { riskMul } from './research';
import type { GameState, InsurancePolicy } from './types';

// 보험 (파트 MGT, #171, PRD §8.4) — 재산·재고·영업중단. 재해 이벤트(events.ts fire)가 피해를 장부(LossLedger)에 적고, 끝에 settleClaims가 보험금을 준다.
// 보험이 없으면 장부는 적히기만 하고 현금·난수에 손대지 않는다 → 보험을 안 든 판은 동작이 그대로다.

export type InsuranceKind = InsuranceProductDef['kind'];

export const insuranceProduct = (kind: string): InsuranceProductDef | undefined => INSURANCE_PRODUCTS.find((p) => p.kind === kind);

/** 재해 한 건의 피해 장부 — applyEffects가 채운다 */
export interface LossLedger {
  /** 복구비 (재해 이벤트의 현금 지출) */
  property: number;
  /** 잃은 숙성 원액의 원가 (캐스크 소실·원액 손실) */
  inventory: number;
  /** 생산이 멈춘 개월 (전체 중단 = 1, 증류기 하나 = 1/증류기 수) */
  stopMonths: number;
  /** 재해 직전 재고 원가 — 비례 보상 기준 */
  inventoryValueBefore: number;
  /** 피해 크기 배수 — 연구 효과 riskMul('event:<이벤트 id>') (P-MGT-9, 예: ENG-2b 숙성고 화재 ×0.6). 1이면 피해 그대로 */
  damageMul: number;
}

export const newLedger = (s: GameState, eventId?: string): LossLedger => ({ property: 0, inventory: 0, stopMonths: 0, inventoryValueBefore: insuredInventoryValue(s), damageMul: eventId ? riskMul(s, `event:${eventId}`) : 1 });

/** 캐스크 한 통 원액의 원가 (오너십 판매분은 고객 재산이라 제외) */
export const caskBookValue = (c: GameState['inventory']['casks'][number]): number => (c.contents && !c.owner ? c.contents.volumeL * c.contents.abv * c.contents.costPerLPA : 0);

/** 재고 보험가액 = 숙성 중인 원액 원가 합계 */
export function insuredInventoryValue(s: GameState): number {
  return s.inventory.casks.reduce((t, c) => t + caskBookValue(c), 0);
}

/** 재산 보험가액 = 갖고 있는 설비(공사 중 포함)의 취득가 합계 */
export function insuredPropertyValue(s: GameState): number {
  return s.production.equipment.reduce((t, e) => t + (EQUIPMENT[e.catalogId]?.cost ?? 0), 0);
}

/** 월 보험료 — 연 보험료율 × 가입금액 / 12. 테크 ENG-2b(방재 엔지니어링)는 재산·재고 보험료를 깎는다(riskMul 'premium:<종류>') */
export function insurancePremium(s: GameState, kind: InsuranceKind, coverage: number): number {
  const p = insuranceProduct(kind);
  if (!p) return 0;
  return Math.round((coverage * p.annualRate * riskMul(s, `premium:${kind}`)) / 12);
}

/** 이번 달 내는 보험료 합계 (재무 단계·월 고정비 예상) */
export const insurancePremiumTotal = (s: GameState): number => s.finance.insurance.reduce((t, x) => t + x.premiumPerMonth, 0);

const active = (s: GameState, kind: InsuranceKind): InsurancePolicy | undefined => s.finance.insurance.find((x) => x.kind === kind && s.month >= x.fromMonth);

/** 보험금 계산 (현금은 건드리지 않는다) — 화면 미리보기·테스트용 */
export function claimFor(s: GameState, ledger: LossLedger): { property: number; inventory: number; interruption: number; ratio: { property?: number; inventory?: number } } {
  const out = { property: 0, inventory: 0, interruption: 0, ratio: {} as { property?: number; inventory?: number } };
  const prop = active(s, 'property');
  if (prop && ledger.property > 0) {
    const r = Math.min(1, prop.coverage / Math.max(1, insuredPropertyValue(s)));
    out.property = Math.round(Math.min(prop.coverage, ledger.property * r));
    if (r < 1) out.ratio.property = r;
  }
  const inv = active(s, 'inventory');
  if (inv && ledger.inventory > 0) {
    const r = Math.min(1, inv.coverage / Math.max(1, ledger.inventoryValueBefore));
    out.inventory = Math.round(Math.min(inv.coverage, ledger.inventory * r));
    if (r < 1) out.ratio.inventory = r;
  }
  const bi = active(s, 'business_interruption');
  if (bi && ledger.stopMonths > 0) out.interruption = Math.round(Math.min(bi.coverage, monthlyFixedCost(s)) * ledger.stopMonths);
  return out;
}

/** 재해 끝에 보험금을 준다 — 보험이 없거나 피해가 없으면 아무 일도 없다. 돌려주는 문구는 이벤트 기록에 붙는다 */
export function settleClaims(s: GameState, ledger: LossLedger): string[] {
  if (!s.finance.insurance.length) return [];
  const c = claimFor(s, ledger);
  const total = c.property + c.inventory + c.interruption;
  if (total <= 0) return [];
  s.finance.cash += total;
  const parts = [
    c.property ? `재산 ${c.property.toLocaleString()}원${c.ratio.property ? `(비례 ${Math.round(c.ratio.property * 100)}%)` : ''}` : '',
    c.inventory ? `재고 ${c.inventory.toLocaleString()}원${c.ratio.inventory ? `(비례 ${Math.round(c.ratio.inventory * 100)}%)` : ''}` : '',
    c.interruption ? `영업중단 ${c.interruption.toLocaleString()}원` : '',
  ].filter(Boolean);
  return [`보험금 ${total.toLocaleString()}원 — ${parts.join(' · ')}`];
}
