import { BULK, HOLDING, LOAN_OFFERS } from './content/catalog';
import { siteOf } from './content/sites';
import { bulkValuePerLPA, isBulkKind } from './bulk';
import { R0_EVAP, sizeFactor, tempFactor } from './maturation';
import type { Cask, GameState, MonthReport, SpiritLot } from './types';

// 숙성 재고 보유 비용·재고 담보대출·숙성 전망 (결정 #65, regions.md §6.2)

/** 원액 재고 시가 — 몰트·그레인은 벌크 기준가치, 그 밖은 장부 원가 */
export function stockValue(s: GameState, lot: SpiritLot): number {
  const lpa = lot.volumeL * lot.abv;
  return lpa * (isBulkKind(lot) ? bulkValuePerLPA(s, lot) : lot.costPerLPA);
}

/** 이번 달 숙성 재고 보유 비용 = 캐스크당 보관료 × 산지 땅값 + 재고 시가 × 보험료율. 시작 후 graceMonths 동안 0 */
export function holdingCost(s: GameState): { storage: number; insurance: number } {
  if (s.month < HOLDING.graceMonths) return { storage: 0, insurance: 0 };
  const filled = s.casks.filter((c) => c.contents);
  const land = siteOf(s).warehouseCostFactor * siteOf(s).buildCostFactor;
  return {
    storage: Math.round(filled.length * HOLDING.perCaskMonth * land),
    insurance: Math.round(filled.reduce((t, c) => t + stockValue(s, c.contents!), 0) * HOLDING.insuranceRateMonth),
  };
}

// ── 재고 담보대출 ──

/** 담보로 인정되는 숙성 재고 시가 (캐스크 속 몰트·그레인) */
export function inventoryCollateral(s: GameState): number {
  return s.casks.reduce((t, c) => t + (c.contents && isBulkKind(c.contents) ? stockValue(s, c.contents) : 0), 0);
}

export const inventoryLtv = (s: GameState) => siteOf(s).inventoryLtv ?? 0.4;

/** 지금 더 빌릴 수 있는 재고 담보대출 한도 */
export function inventoryLoanRoom(s: GameState): number {
  const used = s.loans.filter((l) => LOAN_OFFERS.find((o) => o.id === l.offerId)?.collateral === 'inventory').reduce((t, l) => t + l.balance, 0);
  return Math.max(0, Math.floor((inventoryCollateral(s) * inventoryLtv(s) - used) / 1_000_000) * 1_000_000);
}

/** 월말: 재고 시가가 떨어져 대출 잔액이 담보 한도의 110%를 넘으면 초과분을 즉시 상환 (추가 담보 요구) */
export function inventoryMarginCall(s: GameState, report: MonthReport): number {
  const loans = s.loans.filter((l) => LOAN_OFFERS.find((o) => o.id === l.offerId)?.collateral === 'inventory');
  if (!loans.length) return 0;
  const limit = inventoryCollateral(s) * inventoryLtv(s);
  const balance = loans.reduce((t, l) => t + l.balance, 0);
  if (balance <= limit * 1.1) return 0;
  let excess = Math.round(balance - limit);
  for (const l of loans) {
    const pay = Math.min(l.balance, excess);
    l.balance -= pay;
    excess -= pay;
  }
  const paid = Math.round(balance - limit) - excess;
  report.notes.push(`재고 시가 하락 — 담보대출 추가 상환 요구 ${paid.toLocaleString()}원`);
  return paid;
}

// ── 숙성 전망: 1년 더 두면 ──

/** 이 산지에서 이 캐스크의 연 증발률 (숙성고 매니저 보정 없음) */
export function annualEvaporation(s: GameState, cask: Pick<Cask, 'sizeL'>): number {
  const site = siteOf(s);
  let keep = 1;
  for (const t of site.tempC) keep *= 1 - R0_EVAP * tempFactor(t) * sizeFactor(cask.sizeL) * site.angelShareFactor;
  return 1 - keep;
}

export interface AgingOutlook { evaporation: number; valueGain: number; holding: number; net: number }

/** 1년 더 숙성할 때 재고 가치 변화 = 숙성 가치 상승 × (1 − 증발) − 보유 비용. 몰트·그레인만 */
export function agingOutlook(s: GameState, cask: Cask): AgingOutlook | null {
  const lot = cask.contents;
  if (!lot || !isBulkKind(lot)) return null;
  const per = lot.kind === 'grain' ? BULK.grainAgePerYear : BULK.agePerYear;
  const y = lot.oakMonths / 12;
  const valueGain = (1 + per * (y + 1)) / (1 + per * y) - 1;
  const evaporation = annualEvaporation(s, cask);
  const value = stockValue(s, lot);
  const land = siteOf(s).warehouseCostFactor * siteOf(s).buildCostFactor;
  const holding = value > 0 ? (12 * HOLDING.perCaskMonth * land) / value + 12 * HOLDING.insuranceRateMonth : 0;
  return { evaporation, valueGain, holding, net: (1 + valueGain) * (1 - evaporation) - 1 - holding };
}
