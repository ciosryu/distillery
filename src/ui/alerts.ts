// 위기 경고·이번 달 할 일·지난달 현금 흐름·대출 상환 예정 — 화면용 계산 (코어 UI, 1차 MVP 플레이테스트 2026-11-08 대응 ①~④)
// 게임 규칙·상태를 바꾸지 않는다. 시뮬레이션과 같은 식(step.ts 파산 판정, loans.ts runFinance 대출 납부)을 읽기만 한다.
// 1차 MVP 판: 117개월째 파산, 대출 누적 20억 실행(파산 때 잔액 약 7.2억) — 현금 부족을 몰랐고, 돈이 어디로 나가는지, 언제 상환이 몰리는지 보이지 않았다 (mvp.md §7.4)

import { regionOf } from '../sim/content/regions';
import { BANKRUPT_AFTER_MONTHS, CASH_FLOW_LINES, selfFundedCash, warehouseCapacity, whiskyMinMonths, type CashFlowKey, type GameState, type MonthReport } from '../sim';
import { AUTO_SAMPLE_EXPENSE, AUTO_SAMPLE_MIN_AGE } from '../sim/blendTable';
import { EQUIPMENT } from '../sim/content/catalog';
import { isLocked } from '../sim/scenario';

// ───────────── ① 파산 카운트다운 ─────────────

export interface CashAlert {
  level: 'danger' | 'warn';
  /** 연속 현금 부족 개월 (월말 기준, step.ts phaseSettle) */
  negativeMonths: number;
  /** 앞으로 월말이 몇 번 더 마이너스면 파산하는가 (1 = 이번 달 말) */
  monthEndsLeft: number;
  /** 최근 3개월 자체 현금 흐름(차입·투자·선급금·설비 구매 제외)으로 본 런웨이 — 흑자거나 기록이 없으면 null */
  runwayMonths: number | null;
  /** 최근 3개월 평균 자체 순현금 */
  avgSelfFunded: number | null;
  kind: 'negative' | 'belowZeroNow' | 'runway';
}

/** 런웨이 경고 기준(개월) — 이 속도로 이 안에 현금이 바닥나면 미리 경고한다 (화면 안내 기준, 게임 규칙 아님) */
export const RUNWAY_WARN_MONTHS = 3;

/**
 * 런웨이에 넣는 한 달 현금 흐름 = 자체 현금 흐름(차입·투자 유치·선급금 제외)에서 **설비 구매를 뺀** 값.
 * 설비는 한 번 나가는 돈이라 "이 속도"가 아니다 — 시작하자마자 비지터 센터(8천만)를 지으면 첫 달에 "약 3개월 뒤 바닥" 경보가 떴다
 * (실제 런웨이 약 17개월, 다음 달 사라짐 — 결정 대기 19 실험에서 발견). 빈 통 구매는 매달 되풀이되므로 남긴다
 */
export const recurringCash = (r: MonthReport) => selfFundedCash(r) - (r.offTurn?.equipment ?? 0);

export function runway(s: GameState): { avg: number | null; months: number | null } {
  const recent = s.history.reports.slice(-3);
  if (!recent.length) return { avg: null, months: null };
  const avg = recent.reduce((t, r) => t + recurringCash(r), 0) / recent.length;
  return { avg, months: avg < 0 ? Math.floor(Math.max(0, s.finance.cash) / -avg) : null };
}

/**
 * 지금 보여야 할 현금 경고. 파산 = 월말 현금 마이너스가 BANKRUPT_AFTER_MONTHS번 이어질 때.
 * - 현금 부족 n개월째: 위험(빨강) — 월말이 (B − n)번 더 마이너스면 파산
 * - 지금 현금이 마이너스(턴 사이 지출): 이번 달 말까지 메우지 못하면 1개월째
 * - 흑자 아님 + 런웨이 RUNWAY_WARN_MONTHS개월 이하: 주의(노랑)
 */
export function cashAlert(s: GameState): CashAlert | null {
  if (s.status !== 'running') return null;
  const n = s.finance.negativeCashMonths;
  const r = runway(s);
  const base = { negativeMonths: n, monthEndsLeft: Math.max(1, BANKRUPT_AFTER_MONTHS - n), runwayMonths: r.months, avgSelfFunded: r.avg };
  if (n > 0) return { ...base, level: 'danger', kind: 'negative' };
  if (s.finance.cash < 0) return { ...base, level: 'danger', kind: 'belowZeroNow' };
  if (r.months != null && r.months <= RUNWAY_WARN_MONTHS) return { ...base, level: 'warn', kind: 'runway' };
  return null;
}

// ───────────── ② 대출 상환 예정 ─────────────

export interface LoanMonth { month: number; interest: number; principal: number; payment: number }

/**
 * 앞으로 months개월 대출 원리금 — loans.ts runFinance와 같은 식(거치 기간은 이자만, 그 뒤 원리금 균등, 잔액 한도).
 * 0 = 이번 달 말 결산에서 나갈 돈. 새 대출·조기 상환은 반영하지 않는다
 */
export function loanSchedule(s: GameState, months = 12): LoanMonth[] {
  const out: LoanMonth[] = Array.from({ length: months }, (_, i) => ({ month: s.month + i, interest: 0, principal: 0, payment: 0 }));
  for (const l of s.finance.loans) {
    let bal = l.balance;
    for (let i = 0; i < months && bal > 0; i++) {
      const m = s.month + i;
      const interest = Math.round(bal * (l.annualRate / 12));
      const principal = m < l.startMonth + l.graceMonths ? 0 : Math.min(bal, l.monthlyPayment - interest);
      bal -= principal;
      out[i]!.interest += interest;
      out[i]!.principal += principal;
      out[i]!.payment += interest + principal;
    }
  }
  return out;
}

/** 거치가 끝나 월 납부가 크게 뛰는 첫 달 — 이번 달보다 20% 넘게 오르는 달 (없으면 null) */
export function paymentJump(sched: LoanMonth[]): { month: number; from: number; to: number } | null {
  const first = sched[0]?.payment ?? 0;
  for (const m of sched.slice(1)) if (m.payment > first * 1.2 && m.payment - first >= 1_000_000) return { month: m.month, from: first, to: m.payment };
  return null;
}

// ───────────── ③ 이번 달 할 일 ─────────────

export type TodoTarget = { tab: string } | { anchor: string };
export interface Todo { id: string; level: 'danger' | 'warn' | 'info'; text: string; action: string; target: TodoTarget }

const SOJU = 'soju_distilled';
const WHISKY_CATS = new Set(['whisky', 'grain_whisky', 'blended_whisky']);

/** 범주 묶음의 재고 개월 수 — 최근 3개월 판매 기준. 판매가 없으면 재고가 있으면 Infinity, 없으면 0 */
function stockMonths(s: GameState, inCat: (c: string) => boolean): { stock: number; months: number } {
  // 면세 전용 한정판(제주)은 국내 재고가 아니다 — 재고와 판매 양쪽에서 같이 뺀다
  const domestic = s.commerce.products.filter((p) => inCat(p.category) && !p.dutyFreeOnly);
  const ids = new Set(domestic.map((p) => p.id));
  const stock = domestic.reduce((t, p) => t + p.stockBottles, 0);
  const recent = s.history.reports.slice(-3);
  const sold = recent.reduce((t, r) => t + r.sales.filter((x) => ids.has(x.productId)).reduce((u, x) => u + x.bottles, 0), 0);
  const per = recent.length ? sold / recent.length : 0;
  return { stock, months: per > 0 ? stock / per : stock > 0 ? Infinity : 0 };
}

/** 샘플 기록이 이만큼 오래된 통은 "샘플 시기" — 자동 샘플(#177)이 뜨는 기준과 같게 둔다 */
export const SAMPLE_STALE_MONTHS = AUTO_SAMPLE_MIN_AGE;
/** "샘플 시기"인 통 — 오크 숙성 SAMPLE_STALE_MONTHS개월 이상이고 자기 샘플 기록이 그만큼 오래됐거나 없다 (할 일·증류소 탭 숙성고 요약이 같이 쓴다) */
export const staleSampleCasks = (s: GameState) =>
  s.inventory.casks.filter((c) => c.contents && !c.owner && c.contents.oakMonths >= SAMPLE_STALE_MONTHS && s.month - (c.sampleLog?.at(-1)?.month ?? -Infinity) >= SAMPLE_STALE_MONTHS);

/** 재고가 이보다 적으면 "병입할 때" — 화면 안내 기준 */
export const RESTOCK_MONTHS = 2;

/**
 * 이번 달 할 일 — 급한 순서. 시나리오 게임(MVP) 증류소 탭에 보인다. 규칙이 아니라 놓치기 쉬운 신호를 모은 안내다
 * (현금 위기는 화면 맨 위 경고가 따로 맡는다 — 여기서는 대출 거치 종료만)
 */
export function monthTodos(s: GameState): Todo[] {
  const out: Todo[] = [];
  const min = whiskyMinMonths(regionOf(s).whisky); // 병입·표기와 같은 식 (blending.ts)
  // 비지터 센터가 없다 — 3차 MVP 판은 설비가 접힌 칸 안에 있어 "못 찾았다"(오너). 첫해 가장 큰 수입원(월 약 700만, 사람형 봇 실험)이라 할 일에 올린다
  const visitor = EQUIPMENT.visitor_basic;
  if (s.scenario && visitor && !isLocked(s, 'facility:visitor_basic') && !s.production.equipment.some((e) => EQUIPMENT[e.catalogId]?.kind === 'visitor')) {
    out.push({ id: 'visitor', level: s.month < 24 ? 'warn' : 'info', text: `비지터 센터(베이직 투어)가 없다 — ${fmtWon(visitor.cost)}, ${'leadMonths' in visitor ? visitor.leadMonths : 4}개월 뒤 문을 열면 관광 수입 월 약 600만~800만(유지비 월 ${fmtWon(visitor.maintenance)}). 첫해 소주보다 큰 수입원이다`, action: '설비에서 짓기', target: { anchor: 'mvp-equipment' } });
  }
  // 대출 거치가 3개월 안에 끝나 납부가 뛴다
  const jump = paymentJump(loanSchedule(s, 4));
  if (jump) out.push({ id: 'loan-jump', level: 'warn', text: `${jump.month - s.month === 0 ? '이번 달' : `${jump.month - s.month}개월 뒤`} 대출 거치가 끝나 월 납부가 ${fmtWon(jump.from)} → ${fmtWon(jump.to)}로 뛴다`, action: '대출 보기', target: { tab: 'finance' } });
  // 탱크 몰트·그레인 통입 대기 — 통에 넣어야 숙성이 시작된다
  const tankMalt = s.inventory.lots.filter((l) => (l.kind === 'malt' || l.kind === 'grain') && !l.sourced).reduce((t, l) => t + l.volumeL, 0);
  if (tankMalt >= 50) {
    const empties = s.inventory.casks.filter((c) => !c.contents && !(c.contamination && c.contaminationKnown)).length;
    const free = Math.max(0, warehouseCapacity(s) - s.inventory.casks.length);
    out.push({ id: 'fill', level: 'info', text: `탱크 몰트·그레인 ${Math.round(tankMalt).toLocaleString()}L 통입 대기 — 빈 통 ${empties}개 · 남은 자리 ${free}통 (통에 넣어야 숙성이 시작된다)`, action: '통입', target: { anchor: 'mvp-fill' } });
  }
  // 위스키 재고가 떨어져 가는데 숙성을 채운 통이 있다
  const ready = s.inventory.casks.filter((c) => c.contents && !c.owner && (c.contents.kind === 'malt' || c.contents.kind === 'grain') && c.contents.oakMonths >= min).length;
  const wh = stockMonths(s, (c) => WHISKY_CATS.has(c));
  if (ready > 0 && wh.months < RESTOCK_MONTHS) out.push({ id: 'whisky', level: 'info', text: `위스키 재고 ${wh.stock ? `${wh.months.toFixed(1)}개월 치` : '없음'} — 숙성 ${min}개월을 채운 통 ${ready}개를 병입할 수 있다`, action: '블렌딩·병입', target: { tab: 'bottling' } });
  // 소주 재고가 떨어져 가는데 탱크에 소주가 있다
  const tankSoju = s.inventory.lots.filter((l) => l.kind === 'soju').reduce((t, l) => t + l.volumeL, 0);
  const so = stockMonths(s, (c) => c === SOJU);
  if (tankSoju >= 50 && so.months < RESTOCK_MONTHS) out.push({ id: 'soju', level: 'info', text: `소주 재고 ${so.stock ? `${so.months.toFixed(1)}개월 치` : '없음'} — 탱크 소주 ${Math.round(tankSoju).toLocaleString()}L 병입 가능 (팔 만큼만)`, action: '블렌딩·병입', target: { tab: 'bottling' } });
  // 샘플 시기 — 기록이 없거나 오래된 통 (시나리오 게임만: 샌드박스는 참값을 본다)
  if (s.scenario) {
    const stale = staleSampleCasks(s).length;
    if (stale > 0) out.push({ id: 'sample', level: 'info', text: `샘플 기록이 ${SAMPLE_STALE_MONTHS}개월 넘은(또는 없는) 통 ${stale}개 — 병입 전에 맛을 확인한다`, action: '숙성 중인 캐스크', target: { anchor: 'mvp-warehouse' } });
  }
  return out;
}

// ───────────── ④ 지난달 현금 흐름 한 줄 ─────────────

export interface FlowPart { label: string; amount: number }

const EXPENSE_GROUP: Record<string, string> = {
  production: '생산', distribution: '유통비', export_freight: '유통비', export_fixed: '유통비', penalty: '기타',
  salaries: '고정비', overhead: '고정비', heating: '고정비', maintenance: '고정비', marketing: '고정비', storage: '고정비', insurance: '고정비', research: '고정비',
  interest: '대출 상환', principal: '대출 상환',
  hedge: '선도계약 정산', [AUTO_SAMPLE_EXPENSE]: '샘플·분석',
};
const OFFTURN_GROUP: Partial<Record<CashFlowKey, string>> = {
  spotBulk: '원액 판매', caskBid: '원액 판매', caskOwnership: '원액 판매', bottling: '병입', blending: '샘플·분석',
  casks: '통·설비', usedCask: '통·설비', equipment: '통·설비', loan: '대출·투자 유입', investment: '대출·투자 유입', loanRepay: '대출 상환', contractPrepay: '대출·투자 유입',
};

/**
 * 지난달 결산의 현금 흐름을 큰 덩어리로 — 들어온 돈과 나간 돈, 합 = 순현금(netCash). 대시보드 결산표(cashFlowRows)와 같은 원천을 묶기만 한다
 */
export function lastMonthFlow(r: MonthReport): { inflow: FlowPart[]; outflow: FlowPart[]; net: number } {
  const g = new Map<string, number>();
  const add = (label: string, v: number) => { if (v) g.set(label, (g.get(label) ?? 0) + v); };
  add('제품 매출', r.revenue);
  add('원액 판매', r.bulkRevenue);
  add('수출', r.exportRevenue ?? 0);
  add('비지터 센터', r.tourismRevenue ?? 0);
  if (r.prepayRefunded) add('대출·투자 유입', -r.prepayRefunded);
  add('보험금', r.otherIncome?.insurance ?? 0);
  add('선도계약 정산', r.otherIncome?.hedge ?? 0);
  for (const [k, v] of Object.entries(r.offTurn ?? {}) as [CashFlowKey, number][]) add(OFFTURN_GROUP[k] ?? (CASH_FLOW_LINES[k]?.label ?? '기타'), v);
  for (const [k, v] of Object.entries(r.expenses)) add(EXPENSE_GROUP[k] ?? '기타', -v);
  const rest = r.netCash - [...g.values()].reduce((t, v) => t + v, 0);
  if (Math.abs(rest) >= 1) add('기타', rest);
  const parts = [...g].map(([label, amount]) => ({ label, amount: Math.round(amount) })).filter((p) => p.amount !== 0);
  return {
    inflow: parts.filter((p) => p.amount > 0).sort((a, b) => b.amount - a.amount),
    outflow: parts.filter((p) => p.amount < 0).sort((a, b) => a.amount - b.amount),
    net: r.netCash,
  };
}

/** 억·만 원 축약 (한 줄 표시용) */
export function fmtWon(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 100_000_000) return `${sign}${(a / 100_000_000).toFixed(a >= 1_000_000_000 ? 1 : 2)}억`;
  if (a >= 10_000) return `${sign}${Math.round(a / 10_000).toLocaleString()}만`;
  return `${sign}${Math.round(a).toLocaleString()}원`;
}
