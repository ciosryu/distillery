import { EQUIPMENT, LOAN_OFFERS } from './content/catalog';
import { BANK_SCREENING, type LoanOfferDef } from './content/finance';
import { siteOf } from './content/regions';
import type { GameState, MonthReport } from './types';
import { bulkValuePerLPA, isBulkKind } from './bulk';
import { heatingCost, siteOverhead } from './sites';
import { caskStorageCost } from './casks';
import { secondBrandMonthlyCost } from './brands';

// 대출·재고 담보대출·월 고정비·재무 단계(틱 7) (파트 MGT, 결정 #144 — 파일 쪼개기로 옮겨 왔다. 규칙·수치 불변)

// ───────────── 재고 담보대출 (홋카이도, 결정 #90) ─────────────

/** 담보 가치 = 숙성 중인 몰트·그레인 원액의 현물 시가 (오너십 캐스크 제외) */
export function inventoryCollateral(s: GameState): number {
  return s.inventory.casks.reduce((t, c) => t + (c.contents && !c.owner && isBulkKind(c.contents) ? c.contents.volumeL * c.contents.abv * bulkValuePerLPA(s, c.contents) : 0), 0);
}

export const inventoryLtv = (s: Pick<GameState, 'regionId' | 'siteId'>) => siteOf(s).inventoryLtv ?? 0;

const isInventoryLoan = (offerId: string) => LOAN_OFFERS.find((o) => o.id === offerId)?.collateral === 'inventory';

/** 지금 더 빌릴 수 있는 재고 담보대출 한도 */
export function inventoryLoanRoom(s: GameState): number {
  const used = s.finance.loans.filter((l) => isInventoryLoan(l.offerId)).reduce((t, l) => t + l.balance, 0);
  return Math.max(0, Math.floor((inventoryCollateral(s) * inventoryLtv(s) - used) / 1_000_000) * 1_000_000);
}

/** 월말: 재고 시가가 떨어져 대출 잔액이 담보 한도의 110%를 넘으면 초과분을 즉시 상환 (추가 담보 요구) */
export function inventoryMarginCall(s: GameState, report: MonthReport): number {
  const loans = s.finance.loans.filter((l) => isInventoryLoan(l.offerId));
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


/** 매달 나가는 고정 지출 예상 — 대시보드 "월 고정비"·사업 계획서 미리보기. 세컨드 브랜드 유지비·마케팅비(판매 단계가 낸다, #155)도 넣는다 */
export function monthlyFixedCost(s: GameState): number {
  return s.hr.staff.reduce((t, x) => t + x.salary, 0) + siteOverhead(s) + s.commerce.marketingBudget + secondBrandMonthlyCost(s) + caskStorageCost(s) +
    s.production.equipment.reduce((t, e) => t + (EQUIPMENT[e.catalogId]?.maintenance ?? 0), 0) +
    s.finance.loans.reduce((t, l) => t + currentLoanPayment(s, l), 0);
}

// ───────────── 은행 심사 (P-MGT-2, 초안) ─────────────

/** 심사 대상 = 은행·정책 상품. 고금리 급전(#160, 심사 없음)과 재고 담보대출(담보가 한도를 정한다, #90)은 뺀다 */
export const isScreenedOffer = (o: LoanOfferDef) => !o.emergency && !o.collateral;

export interface BankScreening {
  /** 심사를 하는가 (꺼져 있거나 대상이 아니거나 창업 유예 중이면 false) */
  screened: boolean;
  ok: boolean;
  /** 최근 lookbackMonths 영업현금흐름 합계 */
  operating: number;
  /** 현금 기준선 = 월 고정비 예상 × cashFloorMonths */
  cashFloor: number;
  deficit: boolean;
  cashShort: boolean;
  /** 거절 이유 (화면·행동 실패 문구) */
  reason?: string;
}

/** 은행 심사 — 상품을 신청하면 받을 결과. 화면이 미리 보여 주고 takeLoan이 같은 값으로 거절한다 */
export function bankScreening(s: GameState, offer: LoanOfferDef): BankScreening {
  const cfg = BANK_SCREENING;
  const recent = s.history.reports.slice(-cfg.lookbackMonths);
  const operating = recent.reduce((t, r) => t + (r.operatingCash ?? r.netCash), 0);
  const cashFloor = Math.round(monthlyFixedCost(s) * cfg.cashFloorMonths);
  const deficit = recent.length > 0 && operating < 0;
  const cashShort = s.finance.cash < cashFloor;
  const screened = cfg.enabled && isScreenedOffer(offer) && s.month >= cfg.startupMonths;
  const rejected = screened && (cfg.mode === 'and' ? deficit && cashShort : deficit || cashShort);
  const why = [
    deficit ? `최근 ${recent.length}개월 영업 적자 ${Math.round(-operating).toLocaleString()}원` : '',
    cashShort ? `현금이 고정비 ${cfg.cashFloorMonths}개월분(${cashFloor.toLocaleString()}원)보다 적음` : '',
  ].filter(Boolean).join(' · ');
  return { screened, ok: !rejected, operating, cashFloor, deficit, cashShort, ...(rejected ? { reason: `은행 심사 거절 — ${why}. 고금리 급전은 심사 없이 받을 수 있다` } : {}) };
}

/** 이번 달 대출 납부액 (거치 기간에는 이자만) */
export function currentLoanPayment(s: GameState, l: GameState['finance']['loans'][number]): number {
  return s.month < l.startMonth + l.graceMonths ? Math.round(l.balance * (l.annualRate / 12)) : l.monthlyPayment;
}

/** 7 재무 (틱 단계 본문 — step.ts가 부른다): 급여·관리비·난방·유지비·마케팅·보관비·대출 */
export function runFinance(s: GameState, report: MonthReport, monthOfYear: number): void {
  const pay = (key: string, amount: number) => {
    if (amount <= 0) return;
    s.finance.cash -= amount;
    report.expenses[key] = (report.expenses[key] ?? 0) + amount;
  };
  pay('salaries', s.hr.staff.reduce((t, x) => t + x.salary, 0));
  pay('overhead', siteOverhead(s));
  pay('heating', heatingCost(s, monthOfYear));
  pay('maintenance', s.production.equipment.reduce((t, e) => t + (e.readyMonth <= s.month ? (EQUIPMENT[e.catalogId]?.maintenance ?? 0) : 0), 0));
  pay('marketing', s.commerce.marketingBudget);
  pay('storage', caskStorageCost(s));
  for (const loan of s.finance.loans) {
    const interest = Math.round(loan.balance * (loan.annualRate / 12));
    const inGrace = s.month < loan.startMonth + loan.graceMonths;
    const principal = inGrace ? 0 : Math.min(loan.balance, loan.monthlyPayment - interest);
    loan.balance -= principal;
    pay('interest', interest);
    pay('principal', principal);
  }
  // 재고 담보대출(홋카이도, 결정 #90): 시가가 떨어지면 추가 상환 요구
  pay('principal', inventoryMarginCall(s, report));
  s.finance.loans = s.finance.loans.filter((l) => l.balance > 0);
}
