import { runBoard } from './board';
import { EQUIPMENT, LOAN_OFFERS, type LoanOfferDef } from './content/catalog';
import { BANK_SCREENING } from './content/finance';
import { siteOf } from './content/regions';
import type { GameState, MonthReport } from './types';
import { bulkValuePerLPA, isBulkKind } from './bulk';
import { collateralValue, usesObservedValuation } from './valuation';
import { heatingCost, siteOverhead } from './sites';
import { caskStorageCost } from './casks';
import { secondBrandMonthlyCost } from './brands';
import { settleForwards } from './forwards';
import { annuityPayment, calendar } from './util';
import { isLocked } from './scenario';
import { houseBrand } from './brands';
import { AWARENESS } from './market';
import { mod } from './modifiers';
import { inventoryLtvMul, loanGraceMul, loanLimitMul, loanRateMul, mul } from './mgtKnobs';

// 대출·재고 담보대출·월 고정비·재무 단계(틱 7) (파트 MGT, 결정 #144 — 파일 쪼개기로 옮겨 왔다. 규칙·수치 불변)

// ───────────── 재고 담보대출 (홋카이도, 결정 #90) ─────────────

/**
 * 담보 가치 = 숙성 중인 몰트·그레인 원액의 현물 시가 (오너십 캐스크 제외). 새 판(v16, F5b #310 2단계·#326)은 **관측 품질 q̂**와 권리 제외(선판매·다른 담보)로 —
 * 숨은 품질을 바꿔도 담보 한도가 같다. 옛 판은 참 품질 식 그대로(X0L 바이트 동일)
 */
export function inventoryCollateral(s: GameState): number {
  if (usesObservedValuation(s)) return collateralValue(s);
  return s.inventory.casks.reduce((t, c) => t + (c.contents && !c.owner && isBulkKind(c.contents) ? c.contents.volumeL * c.contents.abv * bulkValuePerLPA(s, c.contents) : 0), 0);
}

export const inventoryLtv = (s: Pick<GameState, 'regionId' | 'siteId' | 'difficulty'>) => mul(siteOf(s).inventoryLtv ?? 0, inventoryLtvMul(s)); // 난이도 finance.inventoryLtv(F6b)

/**
 * 난이도를 반영한 대출 상품(F6b — finance.loanRate·loanLimit·loanGrace). Normal(모두 1)이면 **같은 객체**를 돌려준다(출력 바이트 동일).
 * 급전(`emergency`)은 법정 최고금리 연 20%를 넘지 않는다. 거치는 기간 − 1개월 이하. 실행(`takeLoan`)·화면(`availableLoans`·Finance)이 같은 값을 쓴다
 */
export function effectiveOffer(s: Pick<GameState, 'difficulty'>, o: LoanOfferDef): LoanOfferDef {
  const r = loanRateMul(s), l = loanLimitMul(s), g = loanGraceMul(s);
  if (r === 1 && l === 1 && g === 1) return o;
  const annualRate = o.emergency ? Math.min(0.2, mul(o.annualRate, r)) : mul(o.annualRate, r);
  return { ...o, annualRate, max: Math.round(mul(o.max, l) / 1_000_000) * 1_000_000, graceMonths: Math.min(o.termMonths - 1, Math.round(mul(o.graceMonths, g))) };
}

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

// ───────────── 지금 받을 수 있는 대출 (#192, 화면용 — 1·2차 MVP 플레이테스트 "현금 부족 때 할 일을 몰랐다") ─────────────

/** 대출 한 건을 실행하면 내는 돈 — `takeLoan`·`currentLoanPayment`와 같은 식. graceEndMonth = 원금까지 내기 시작하는 달 */
export function loanTerms(o: Pick<LoanOfferDef, 'annualRate' | 'termMonths' | 'graceMonths'>, amount: number, month: number) {
  const afterGrace = annuityPayment(amount, o.annualRate, o.termMonths - o.graceMonths);
  return { paymentNow: o.graceMonths > 0 ? Math.round(amount * (o.annualRate / 12)) : afterGrace, paymentAfterGrace: afterGrace, graceEndMonth: month + o.graceMonths };
}

export interface LoanOption { offer: LoanOfferDef; /** 지금 신청할 수 있는 최대액 */ max: number; /** 신청할 수 없는 이유 (없으면 신청 가능) */ blocked?: string }

/**
 * 지금 신청할 수 있는 대출 상품과 한도 — `takeLoan`과 같은 조건(지역·이용 중·소주 생산 실적·재고 담보 한도·시나리오 잠금).
 * 이용 중인 상품과 이 입지에서 없는 상품은 뺀다. 조건이 모자란 상품은 blocked로 남긴다(무엇을 하면 열리는지 보이려고). 상태를 바꾸지 않는다
 */
export function availableLoans(s: GameState): LoanOption[] {
  if (isLocked(s, 'action:takeLoan')) return [];
  const out: LoanOption[] = [];
  for (const base of LOAN_OFFERS) {
    const o = effectiveOffer(s, base);
    if (o.regions && !o.regions.includes(s.regionId)) continue;
    if (s.finance.loans.some((l) => l.offerId === o.id)) continue;
    if (o.collateral === 'inventory') {
      if (inventoryLtv(s) <= 0) continue;
      const room = Math.min(o.max, inventoryLoanRoom(s));
      out.push(room < 10_000_000 ? { offer: o, max: 0, blocked: '담보로 잡을 숙성 재고가 부족하다' } : { offer: o, max: room });
      continue;
    }
    if (o.requires === 'producedSoju' && !s.production.flags.producedSoju) { out.push({ offer: o, max: o.max, blocked: '증류식 소주를 한 번 생산하면 열린다' }); continue; }
    out.push({ offer: o, max: o.max });
  }
  return out;
}

/** 한 번만 받는 상품을 amount만 받으면 다시 받을 수 없게 되는 나머지 한도 (#196, mvp.md §7.8 — 3차 판은 창업자금 2억 중 0.5억만 받아 1.5억을 잃었다).
 *  이용 중이거나 받을 수 없는 상품이면 0 */
export function forfeitedLoanRoom(s: GameState, offerId: string, amount: number): number {
  const o = availableLoans(s).find((x) => x.offer.id === offerId);
  return !o || o.blocked ? 0 : Math.max(0, o.max - amount);
}

/** 지금 바로 더 빌릴 수 있는 돈의 합 (조건이 모자란 상품은 뺀다) */
export const loanRoomTotal = (s: GameState) => availableLoans(s).reduce((t, x) => t + (x.blocked ? 0 : x.max), 0);


/** 매달 나가는 고정 지출 예상 — 대시보드 "월 고정비"·증류소 탭 "매달 나가는 돈"·사업 계획서 미리보기·이사회 현금 기준·영업중단 보험금.
 *  다음 결산(7 재무 단계 + 판매 단계의 마케팅비)이 실제로 낼 돈과 맞춘다: 세컨드 브랜드 유지비·마케팅비(#155), 다음 달 난방비(겨울만), 완공된 설비의 유지비만 */
export function monthlyFixedCost(s: GameState): number {
  return monthlyFixedBreakdown(s).reduce((t, x) => t + x.amount, 0);
}

// ───────────── 은행 심사 — 실험 손잡이 (T-0, M2 · #210). 게임 기본은 꺼짐(BANK_SCREENING.enabled = false) ─────────────

/** 심사 대상 = 은행·정책 상품. 고금리 급전(심사 없음)과 재고 담보대출(담보가 한도를 정한다, #90)은 뺀다 */
export const isScreenedOffer = (o: LoanOfferDef) => !o.emergency && !o.collateral;

/** 은행 심사 결과 — 꺼져 있으면 늘 통과. 켜면 takeLoan이 이 값으로 거절한다 */
export function bankScreening(s: GameState, offer: LoanOfferDef): { screened: boolean; ok: boolean; reason?: string } {
  const cfg = BANK_SCREENING;
  if (!cfg.enabled || !isScreenedOffer(offer) || s.month < cfg.startupMonths) return { screened: false, ok: true };
  const recent = s.history.reports.slice(-cfg.lookbackMonths);
  const operating = recent.reduce((t, r) => t + (r.operatingCash ?? r.netCash), 0);
  const cashFloor = Math.round(monthlyFixedCost(s) * cfg.cashFloorMonths);
  const deficit = recent.length > 0 && operating < 0;
  const cashShort = s.finance.cash < cashFloor;
  const rejected = cfg.mode === 'and' ? deficit && cashShort : deficit || cashShort;
  if (!rejected) return { screened: true, ok: true };
  const why = [deficit ? `최근 ${recent.length}개월 영업 적자 ${Math.round(-operating).toLocaleString()}원` : '', cashShort ? `현금이 고정비 ${cfg.cashFloorMonths}개월분(${cashFloor.toLocaleString()}원)보다 적음` : ''].filter(Boolean).join(' · ');
  return { screened: true, ok: false, reason: `은행 심사 거절 — ${why}. 고금리 급전은 심사 없이 받을 수 있다` };
}

/** 월 고정비 예상의 내역 (#181 안 A — 증류소 탭 "매달 나가는 돈"). 합은 monthlyFixedCost와 같다. adjustable = 플레이어가 바로 조절할 수 있는 줄 */
export function monthlyFixedBreakdown(s: GameState): { id: string; label: string; amount: number; adjustable?: boolean }[] {
  return [
    { id: 'salaries', label: '급여', amount: s.hr.staff.reduce((t, x) => t + x.salary, 0) },
    { id: 'overhead', label: '관리비', amount: siteOverhead(s) },
    // 다음 결산 달의 난방비 (runFinance와 같은 달 — 결산은 s.month를 처리한다)
    { id: 'heating', label: '난방비', amount: heatingCost(s, calendar(s).monthOfYear) },
    // 마케팅 입력칸이 바꾸는 하우스 예산만 — 세컨드 브랜드 비용은 아래 줄 (#100 검토)
    { id: 'marketing', label: '마케팅', amount: s.commerce.marketingBudget, adjustable: true },
    { id: 'secondBrand', label: '세컨드 브랜드', amount: secondBrandMonthlyCost(s) },
    // 짓는 중인 설비는 유지비를 내지 않는다 (runFinance와 같은 조건)
    { id: 'maintenance', label: '설비 유지비', amount: s.production.equipment.reduce((t, e) => t + (e.readyMonth <= s.month ? (EQUIPMENT[e.catalogId]?.maintenance ?? 0) : 0), 0) },
    { id: 'storage', label: '통 보관비', amount: caskStorageCost(s) },
    { id: 'loans', label: '대출 원리금', amount: s.finance.loans.reduce((t, l) => t + currentLoanPayment(s, l), 0) },
    { id: 'insurance', label: '보험료', amount: s.finance.insurance.reduce((t, x) => t + x.premiumPerMonth, 0) },
  ].filter((x) => x.amount > 0 || x.adjustable);
}

// ───────────── 마케팅 예산의 앞날 (#193, mvp.md §7.7) ─────────────

/** 마케팅 예산을 바꾸면 n개월 뒤 하우스 브랜드 인지도·수요가 어떻게 되는지 — 인지도 갱신식(market.ts updateAwareness)을 앞으로 돌린 추정.
 *  입소문은 지난달 판매에서 시작하고 인지도에 비례해 변한다고 본다(수요 ∝ 인지도). 세컨드 브랜드 파급은 뺀다(MVP는 잠김).
 *  demandMul = n개월 뒤 수요 / 지금 수요. 매출은 공급이 받쳐 주면 같은 비율로 움직인다. 상태는 바꾸지 않는다 */
export function marketingOutlook(s: GameState, budget: number, months = 36): { awarenessNow: number; awareness: number; demandMul: number } {
  const house = houseBrand(s);
  const a0 = house.awareness;
  const ids = new Set(s.commerce.products.filter((p) => !p.brandId || p.brandId === house.id).map((p) => p.id));
  const last = s.history.reports.at(-1)?.sales ?? [];
  const wom0 = AWARENESS.wordOfMouth * last.filter((x) => ids.has(x.productId)).reduce((t, x) => t + x.bottles * ((s.commerce.products.find((p) => p.id === x.productId)?.quality ?? 50) / 60), 0);
  const gm = AWARENESS.marketing * Math.log10(1 + budget / 1_000_000) * mod(s, 'awareness_gain');
  let a = a0;
  for (let m = 0; m < months; m++) {
    const g = gm + wom0 * (a / a0);
    a = Math.min(0.95, Math.max(0.001, a + g * (1 - a) - AWARENESS.decay * a));
  }
  return { awarenessNow: a0, awareness: a, demandMul: a / a0 };
}

/** 최근 n개월(기록이 있는 만큼) 하우스 브랜드 판매 매출 — 마케팅 앞날을 돈으로 바꾸는 기준 */
export function recentHouseRevenue(s: GameState, months = 12): number {
  const house = houseBrand(s).id;
  const brandOfId = new Map(s.commerce.products.map((p) => [p.id, p.brandId ?? house]));
  return s.history.reports.slice(-months).reduce((t, r) => t + r.sales.filter((x) => (brandOfId.get(x.productId) ?? house) === house /* 보관된 옛 제품은 하우스로 친다 */).reduce((u, x) => u + x.revenue, 0), 0);
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
  // 원재료 선도계약 차액 정산 (#179) — 계약이 없으면 아무 일도 없다
  settleForwards(s, report);
  // 재고 담보대출(홋카이도, 결정 #90): 시가가 떨어지면 추가 상환 요구
  pay('principal', inventoryMarginCall(s, report));
  s.finance.loans = s.finance.loans.filter((l) => l.balance > 0);
  // 이사회 (#180) — 외부 지분 25%↑일 때만 있다
  runBoard(s, report);
}
