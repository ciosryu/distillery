import { forwardRoomKg, marketIndex } from './forwards';
import { FORWARD, INGREDIENTS } from './content/catalog';
import { LOAN_OFFERS } from './content/catalog';
import { awarenessOf } from './brands';
import { handleDeparture, masterDistiller } from './hr';
import { INVESTMENT_OFFERS } from './content/catalog';
import { OWNERSHIP } from './investment';
import { isBulkKind, spotQuote } from './bulk';
import { resolvePending } from './events';
import { inventoryLoanRoom, inventoryLtv } from './loans';
import { annuityPayment, nid } from './util';
import { fail, type CashKeys, type Handlers } from './actionKit';
import { TECH_BY_ID } from './content/tech';
import { researchBlocker } from './research';
import { insurancePremium, insuranceProduct } from './insurance';

// 플레이어 행동 — 재무·인사·이벤트 (MGT) (결정 #144 — 파일 쪼개기로 actions.ts에서 옮겨 왔다. 규칙 불변)
// 행동을 더할 때: 아래 타입·처리기·현금 분류 세 곳만 고친다. 코어(actions.ts)는 이 파일의 타입을 통째로 합친다

export type MgtAction =
  /** 연구 (S-6, tech-tree §2.1) — 시작 / 일시정지·재개·담당자 교체 / 포기(진행도를 잃는다) */
  | { type: 'startResearch'; techId: string; leadStaffId: string }
  | { type: 'setResearch'; techId: string; paused?: boolean; leadStaffId?: string }
  | { type: 'cancelResearch'; techId: string }
  /** 재무 확장 (S-11 자리, PRD §8.4) — 원재료 선도계약(P-MGT-6: 차액 정산형) / 보험 가입·해지(#171: 재산·재고·영업중단) */
  | { type: 'signForward'; ingredientId: string; kgPerMonth: number; months: number }
  | { type: 'buyInsurance'; kind: 'property' | 'inventory' | 'business_interruption' | 'product_liability' | 'credit'; coverage: number }
  | { type: 'cancelInsurance'; policyId: string }
  /** 투자 유치 */
  | { type: 'takeInvestment'; offerId: string }
  /** 수출 (#95·#101): 수입사 제안 수락 / 계약 해지 */
  | { type: 'sellCaskOwnership'; caskId: string }
  /** 피니싱 (S-10 자리) — 캐스크 원액을 빈 캐스크로 옮겨 마무리한다. 규칙은 단계 P(PROD): 지금은 항상 실패 */
  | { type: 'hire'; candidateId: string; asApprentice?: boolean }
  | { type: 'fire'; staffId: string }
  | { type: 'takeLoan'; offerId: string; amount: number }
  | { type: 'repayLoan'; loanId: string }
  | { type: 'resolveEvent'; eventId: string; choice: number };

export const MGT_CASH_KEY: CashKeys<MgtAction> = {
  // 연구비는 행동이 아니라 매달 틱에서 나간다 (월 리포트 expenses.research)
  startResearch: null,
  setResearch: null,
  cancelResearch: null,
  signForward: null,
  buyInsurance: null,
  cancelInsurance: null,
  hire: null,
  takeInvestment: 'investment',
  sellCaskOwnership: 'caskOwnership',
  fire: 'severance',
  takeLoan: 'loan',
  repayLoan: 'loanRepay',
  resolveEvent: 'event',
};

export const MGT_HANDLERS: Handlers<MgtAction> = {
  startResearch: (s, prev, a) => {
    const why = researchBlocker(s, a.techId, a.leadStaffId);
    if (why) return fail(prev, why);
    s.research.active.push({ techId: a.techId, progress: 0, leadStaffId: a.leadStaffId, paused: false, startedMonth: s.month, spent: 0 });
    const node = TECH_BY_ID[a.techId]!;
    return { state: s, message: `연구 시작: ${node.nameKo} — 월 ${node.research.monthlyCost.toLocaleString()}원, 약 ${node.research.baseMonths}개월` };
  },
  setResearch: (s, prev, a) => {
    const r = s.research.active.find((x) => x.techId === a.techId);
    if (!r) return fail(prev, '진행 중인 연구가 아닙니다');
    if (a.leadStaffId !== undefined) {
      const lead = s.hr.staff.find((x) => x.id === a.leadStaffId);
      if (!lead) return fail(prev, '담당자가 없습니다');
      if (!TECH_BY_ID[a.techId]!.research.leadRoles.includes(lead.role)) return fail(prev, '담당 직군이 아닙니다');
      if (s.research.active.some((x) => x !== r && x.leadStaffId === a.leadStaffId)) return fail(prev, '이 직원은 이미 다른 연구를 맡고 있습니다');
      r.leadStaffId = a.leadStaffId;
    }
    if (a.paused !== undefined) r.paused = a.paused;
    return { state: s, message: r.paused ? '연구 일시정지 — 진행도는 남고 연구비는 멈춘다' : '연구 진행' };
  },
  // 원재료 선도계약 (P-MGT-6) — 고정 가격 = 지금 시장 지수 × (1 + spread), 이번 달부터 months개월, 월 kg는 생산 지시의 사용량까지. 중도 해지 없음
  signForward: (s, prev, a) => {
    const ing = INGREDIENTS[a.ingredientId];
    if (!ing) return fail(prev, '원료가 없습니다');
    const months = Math.round(a.months);
    if (months < FORWARD.minMonths || months > FORWARD.maxMonths) return fail(prev, `계약 기간은 ${FORWARD.minMonths}~${FORWARD.maxMonths}개월입니다`);
    const room = forwardRoomKg(s, ing.id);
    const kg = Math.min(room, Math.round(a.kgPerMonth));
    if (room < FORWARD.minKgPerMonth) return fail(prev, `${ing.nameKo}: 지금 생산 지시가 쓰는 양만큼만 계약할 수 있습니다 (남은 한도 월 ${room.toLocaleString()}kg)`);
    if (kg < FORWARD.minKgPerMonth) return fail(prev, `월 ${FORWARD.minKgPerMonth}kg 이상이어야 합니다`);
    const priceIndex = Math.round(marketIndex(s, ing.id) * (1 + FORWARD.spread) * 1000) / 1000;
    s.finance.hedges.push({ id: nid(s, 'H'), ingredientId: ing.id, kgPerMonth: kg, priceIndex, fromMonth: s.month, untilMonth: s.month + months });
    return { state: s, message: `${ing.nameKo} 선도계약 — 월 ${kg.toLocaleString()}kg × ${months}개월, 고정 가격 지수 ${priceIndex.toFixed(3)} (시세와의 차액을 매달 정산)` };
  },
  // 보험 (#171) — 종류마다 1건. 가입한 다음 달부터 보장, 보험료는 재무 단계에서 매달. 해지하면 바로 끝난다(환급 없음 — 보험료는 매달 낸다)
  buyInsurance: (s, prev, a) => {
    const p = insuranceProduct(a.kind);
    if (!p) return fail(prev, a.kind === 'credit' ? '매출채권 신용보험은 고급 상품입니다 (연구 BIZ-2b 재무 리스크 관리 뒤)' : '제조물 책임 보험은 아직 없습니다 (리콜 사고가 생기면 함께)');
    if (s.finance.insurance.some((x) => x.kind === p.kind)) return fail(prev, '같은 종류 보험에 이미 가입했습니다 — 금액을 바꾸려면 해지 후 다시 가입');
    const coverage = Math.round(Math.min(p.maxCoverage, Math.max(p.minCoverage, a.coverage)) / 1_000_000) * 1_000_000;
    const premium = insurancePremium(s, p.kind, coverage);
    s.finance.insurance.push({ id: nid(s, 'I'), kind: p.kind, premiumPerMonth: premium, coverage, fromMonth: s.month + 1 });
    return { state: s, message: `${p.nameKo} 가입 — ${p.basis === 'monthly' ? '월 보상 한도' : '가입금액'} ${coverage.toLocaleString()}원, 월 보험료 ${premium.toLocaleString()}원 (다음 달부터 보장)` };
  },
  cancelInsurance: (s, prev, a) => {
    const x = s.finance.insurance.find((y) => y.id === a.policyId);
    if (!x) return fail(prev, '보험이 없습니다');
    s.finance.insurance = s.finance.insurance.filter((y) => y.id !== x.id);
    return { state: s, message: `${insuranceProduct(x.kind)?.nameKo ?? '보험'} 해지` };
  },
  cancelResearch: (s, prev, a) => {
    if (!s.research.active.some((x) => x.techId === a.techId)) return fail(prev, '진행 중인 연구가 아닙니다');
    s.research.active = s.research.active.filter((x) => x.techId !== a.techId);
    return { state: s, message: '연구를 포기했습니다 — 진행도는 사라진다 (멈추기만 하려면 일시정지)' };
  },
  takeInvestment: (s, prev, a) => {
    const o = INVESTMENT_OFFERS.find((x) => x.id === a.offerId);
    if (!o) return fail(prev, '투자 제안이 없습니다');
    if (s.finance.investmentsTaken.includes(o.id)) return fail(prev, '이미 받은 투자입니다');
    if (s.month < o.minMonth || s.month > o.maxMonth) return fail(prev, '지금은 받을 수 없는 투자입니다');
    s.finance.cash += o.amount;
    s.finance.investorShare = 1 - (1 - s.finance.investorShare) * (1 - o.share);
    s.finance.investmentsTaken.push(o.id);
    return { state: s, message: `${o.nameKo} ${o.amount.toLocaleString()}원 유치 — 외부 지분 ${(s.finance.investorShare * 100).toFixed(1)}%` };
  },
  sellCaskOwnership: (s, prev, a) => {
    const cask = s.inventory.casks.find((c) => c.id === a.caskId);
    if (!cask?.contents) return fail(prev, '원액이 든 캐스크가 없습니다');
    if (cask.owner) return fail(prev, '이미 판매한 캐스크입니다');
    if (cask.contents.sourced) return fail(prev, '자사 증류 원액만 오너십으로 팔 수 있습니다');
    if (!isBulkKind(cask.contents)) return fail(prev, '몰트·그레인 캐스크만 가능합니다');
    const price = Math.round(spotQuote(s, cask.contents, cask.contents.volumeL, cask) * (OWNERSHIP.premiumBase + OWNERSHIP.premiumAwareness * awarenessOf(s)) * (0.9 + s.hr.houseStyle / 500));
    s.finance.cash += price;
    cask.owner = { name: `개인 고객 ${cask.id}`, soldMonth: s.month, deliverMonth: s.month + Math.max(OWNERSHIP.minDeliverWait, OWNERSHIP.deliverAtMonths - cask.contents.oakMonths) };
    return { state: s, message: `캐스크 ${cask.id} 오너십 판매 ${price.toLocaleString()}원 — ${cask.owner.deliverMonth - s.month}개월 뒤 인도` };
  },
  hire: (s, prev, a) => {
    const c = s.hr.candidates.find((x) => x.id === a.candidateId);
    if (!c) return fail(prev, '후보가 없습니다');
    s.hr.candidates = s.hr.candidates.filter((x) => x.id !== c.id);
    const { askSalary: _ask, ...staff } = c;
    if (a.asApprentice) {
      const master = masterDistiller(s);
      if (c.role !== 'distiller') return fail(prev, '부사수는 디스틸러 후보만 가능합니다');
      if (!master) return fail(prev, '가르칠 마스터 디스틸러가 없습니다');
      // 부사수: 급여 60%, 마스터 곁에서 24개월 이상 배워야 하우스 스타일을 잇는다
      s.hr.staff.push({ ...staff, salary: Math.round(c.askSalary * 0.6), hiredMonth: s.month, apprenticeOf: master.id });
      return { state: s, message: `${c.name}을(를) ${master.name}의 부사수로 채용` };
    }
    s.hr.staff.push({ ...staff, salary: c.askSalary, hiredMonth: s.month });
    return { state: s, message: `${c.name} 채용` };
  },
  fire: (s, prev, a) => {
    const x = s.hr.staff.find((y) => y.id === a.staffId);
    if (!x) return fail(prev, '직원이 없습니다');
    s.finance.cash -= x.salary; // 퇴직 위로금 1개월분
    const notes: string[] = [];
    handleDeparture(s, x, notes);
    s.hr.staff = s.hr.staff.filter((y) => y.id !== x.id);
    return { state: s, message: [`${x.name} 퇴사 (위로금 1개월분 지급)`, ...notes].join(' — ') };
  },
  takeLoan: (s, prev, a) => {
    const offer = LOAN_OFFERS.find((o) => o.id === a.offerId);
    if (!offer) return fail(prev, '대출 상품이 없습니다');
    if (offer.requires === 'producedSoju' && !s.production.flags.producedSoju) return fail(prev, '전통주(증류식 소주) 생산 실적이 있어야 신청할 수 있습니다');
    if (offer.regions && !offer.regions.includes(s.regionId)) return fail(prev, '이 지역에서는 신청할 수 없는 정책자금입니다');
    if (s.finance.loans.some((l) => l.offerId === offer.id)) return fail(prev, '같은 상품을 이미 이용 중입니다');
    let max = offer.max;
    if (offer.collateral === 'inventory') {
      if (inventoryLtv(s) <= 0) return fail(prev, '이 입지에서는 재고 담보대출을 받을 수 없습니다');
      max = Math.min(max, inventoryLoanRoom(s));
      if (max < 10_000_000) return fail(prev, '담보로 잡을 숙성 재고가 부족합니다');
    }
    const amount = Math.min(max, Math.max(10_000_000, Math.round(a.amount / 1_000_000) * 1_000_000));
    s.finance.cash += amount;
    s.finance.loans.push({
      id: nid(s, 'D'), offerId: offer.id, name: offer.nameKo, principal: amount, balance: amount,
      annualRate: offer.annualRate, termMonths: offer.termMonths, monthlyPayment: annuityPayment(amount, offer.annualRate, offer.termMonths - offer.graceMonths), graceMonths: offer.graceMonths, startMonth: s.month,
    });
    return { state: s, message: `${offer.nameKo} ${amount.toLocaleString()}원 실행` };
  },
  repayLoan: (s, prev, a) => {
    const loan = s.finance.loans.find((l) => l.id === a.loanId);
    if (!loan) return fail(prev, '대출이 없습니다');
    if (s.finance.cash < loan.balance) return fail(prev, '현금이 부족합니다');
    s.finance.cash -= loan.balance;
    s.finance.loans = s.finance.loans.filter((l) => l.id !== loan.id);
    return { state: s, message: '대출 전액 상환' };
  },
  resolveEvent: (s, prev, a) => {
    const text = resolvePending(s, a.eventId, a.choice);
    if (!text) return fail(prev, '처리할 이벤트가 없습니다');
    return { state: s, message: text };
  },
};
