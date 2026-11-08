import { runBoard } from './board';
import { EQUIPMENT, LOAN_OFFERS } from './content/catalog';
import { siteOf } from './content/regions';
import type { GameState, MonthReport } from './types';
import { bulkValuePerLPA, isBulkKind } from './bulk';
import { heatingCost, siteOverhead } from './sites';
import { caskStorageCost } from './casks';
import { secondBrandMonthlyCost } from './brands';
import { settleForwards } from './forwards';

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
    s.finance.loans.reduce((t, l) => t + currentLoanPayment(s, l), 0) + s.finance.insurance.reduce((t, x) => t + x.premiumPerMonth, 0);
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
  // 보험료 (#171) — 가입한 달부터 매달
  pay('insurance', s.finance.insurance.reduce((t, x) => t + x.premiumPerMonth, 0));
  for (const loan of s.finance.loans) {
    const interest = Math.round(loan.balance * (loan.annualRate / 12));
    const inGrace = s.month < loan.startMonth + loan.graceMonths;
    const principal = inGrace ? 0 : Math.min(loan.balance, loan.monthlyPayment - interest);
    loan.balance -= principal;
    pay('interest', interest);
    pay('principal', principal);
  }
  // 원재료 선도계약 차액 정산 (P-MGT-6) — 계약이 없으면 아무 일도 없다
  settleForwards(s, report);
  // 재고 담보대출(홋카이도, 결정 #90): 시가가 떨어지면 추가 상환 요구
  pay('principal', inventoryMarginCall(s, report));
  s.finance.loans = s.finance.loans.filter((l) => l.balance > 0);
  // 이사회 (P-MGT-7) — 외부 지분 25%↑일 때만 있다
  runBoard(s, report);
}
