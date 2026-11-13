import { applyAction } from './actions';
import { LOAN_OFFERS } from './content/catalog';
import { scenarioLockedKeys, SCENARIOS, type ScenarioDef, type ScenarioTierDef } from './content/scenarios';
import { regionOf } from './content/regions';
import { salaryFor } from './hr';
import { newGame } from './newGame';
import { currentLoanPayment, monthlyFixedCost } from './loans';
import type { GameState } from './types';
import { nid } from './util';

// 시나리오 새 게임 입구 (skeleton S-8, PRD §12.2) — "사업 계획서"(규모 티어 + 시작 자금 조달)로 GameState를 만든다.
// 가상 이력 생성기(§12.2)가 들어올 자리: newScenarioGame이 만든 상태 위에 이력을 덧입힌다 (아직 없음)

export interface BusinessPlan {
  scenarioId: string;
  tierId: ScenarioTierDef['id'];
  /** 시작 때 미리 당겨 받을 대출 합계 (0 ~ 티어 상한). 기존 대출 상품의 한도를 쓴다 (#141) */
  loanAmount: number;
  seed?: number;
  distilleryName?: string;
}

export function scenarioOf(id: string): ScenarioDef {
  const d = SCENARIOS[id];
  if (!d) throw new Error(`알 수 없는 시나리오: ${id}`);
  return d;
}

export function tierOf(d: ScenarioDef, tierId: string): ScenarioTierDef {
  const t = d.tiers.find((x) => x.id === tierId);
  if (!t) throw new Error(`알 수 없는 규모 티어: ${tierId}`);
  return t;
}

/** 시작 대출을 상품별로 나눈다 — 금리가 낮은 상품부터, 상품 한도까지. 1천만 원 미만 자투리는 버린다(takeLoan 최소액) */
export function allocateFunding(tier: ScenarioTierDef, amount: number): { offerId: string; amount: number }[] {
  let left = Math.max(0, Math.min(amount, tier.funding.max));
  const offers = tier.funding.offers.map((id) => LOAN_OFFERS.find((o) => o.id === id)!).filter(Boolean).sort((a, b) => a.annualRate - b.annualRate);
  const out: { offerId: string; amount: number }[] = [];
  for (const o of offers) {
    const a = Math.floor(Math.min(left, o.max) / 1_000_000) * 1_000_000;
    if (a < 10_000_000) continue;
    out.push({ offerId: o.id, amount: a });
    left -= a;
  }
  return out;
}

/** 사업 계획서로 새 게임을 만든다. 잠긴 티어·알 수 없는 시나리오는 예외 */
export function newScenarioGame(plan: BusinessPlan): GameState {
  const d = scenarioOf(plan.scenarioId);
  const tier = tierOf(d, plan.tierId);
  if (tier.locked) throw new Error(`${tier.nameKo}: ${tier.locked.reason}`);
  let s = newGame({ seed: plan.seed, region: d.region, site: d.site, startingCash: tier.equity, distilleryName: plan.distilleryName });
  const locked = scenarioLockedKeys(d);
  s.scenario = { id: d.id, tierId: tier.id, locked, economy: { overheadPerMonth: tier.overheadPerMonth }, equity: tier.equity, goal: { ...d.goal }, ...(d.campaignGoal ? { campaignGoal: { ...d.campaignGoal } } : {}) };
  // 잠긴 주종의 프리셋 레시피는 뺀다 (코드·콘텐츠는 그대로)
  s.production.recipes = s.production.recipes.filter((r) => !locked.includes(`kind:${r.kind}`));
  s.inventory.warehouseBase = tier.warehouseBase;
  // 고정 인력 — HR이 꺼진 시나리오에서도 영업 직원이 유통 커버리지를 만든다
  for (const p of tier.staff) {
    s.hr.staff.push({ id: nid(s, 'S'), name: `창업 멤버 (${p.role === 'sales' ? '영업' : p.role})`, role: p.role, level: 1, xp: 0, stats: { ...p.stats }, salary: salaryFor(p.role, p.stats, 1, regionOf(s).laborCost), hiredMonth: 0, ageAtHire: p.ageAtHire });
  }
  // 끈 시스템이 새 게임 때 만든 제안은 비운다
  if (locked.includes('system:hr')) s.hr.candidates = [];
  if (locked.includes('system:broker')) s.b2b.brokerOffers = [];
  if (locked.includes('system:contracts')) s.b2b.contractOffers = [];
  // 시작 대출 — 기존 대출 상품을 그대로 실행한다. 같은 상품은 게임 중에 다시 받을 수 없으므로 한도가 겹치지 않는다
  for (const f of allocateFunding(tier, plan.loanAmount)) {
    const r = applyAction(s, { type: 'takeLoan', offerId: f.offerId, amount: f.amount });
    if (r.error) throw new Error(`시작 대출 실패 (${f.offerId}): ${r.error}`);
    s = r.state;
  }
  return s;
}

export interface PlanPreview {
  equity: number;
  loanTotal: number;
  cashStart: number;
  loans: { offerId: string; name: string; amount: number; annualRate: number; graceMonths: number; interestPerMonth: number; paymentAfterGrace: number }[];
  /** 대출 상환을 뺀 월 고정 지출 (급여·관리비·마케팅·설비 유지비) */
  fixedMonthly: number;
  /** 첫 달 대출 납부액 (거치 중이면 이자만) */
  loanPaymentNow: number;
  /** 거치 기간이 모두 끝난 뒤 월 대출 납부액 */
  loanPaymentAfterGrace: number;
  /** 매출이 0이면 현금이 바닥나는 달 (이 달부터 음수). 파산은 그 뒤 3개월 연속 적자 */
  runwayMonths: number;
  /** runwayMonths가 계산 상한(240개월)에 걸렸는가 */
  runwayCapped: boolean;
  goalNetWorth: number;
}

const RUNWAY_CAP = 240;

/** 사업 계획서 미리보기 — 실제 새 게임 상태로 계산하므로 게임과 숫자가 어긋나지 않는다 */
export function previewPlan(plan: BusinessPlan): PlanPreview {
  const s = newScenarioGame({ ...plan, seed: plan.seed ?? 1 });
  const loanNow = s.finance.loans.reduce((t, l) => t + currentLoanPayment(s, l), 0);
  const fixed = monthlyFixedCost(s) - loanNow;
  // 매출 0 · 고정 지출 그대로 · 대출은 거치 → 원리금 일정대로
  let cash = s.finance.cash;
  const bal = s.finance.loans.map((l) => l.balance);
  let runway = RUNWAY_CAP;
  for (let m = 0; m < RUNWAY_CAP; m++) {
    let pay = fixed;
    s.finance.loans.forEach((l, i) => {
      const interest = Math.round(bal[i]! * (l.annualRate / 12));
      const principal = m < l.startMonth + l.graceMonths ? 0 : Math.min(bal[i]!, l.monthlyPayment - interest);
      bal[i]! -= principal;
      pay += interest + principal;
    });
    cash -= pay;
    if (cash < 0) { runway = m; break; }
  }
  const tier = tierOf(scenarioOf(plan.scenarioId), plan.tierId);
  return {
    equity: tier.equity,
    loanTotal: s.finance.loans.reduce((t, l) => t + l.principal, 0),
    cashStart: s.finance.cash,
    loans: s.finance.loans.map((l) => ({ offerId: l.offerId, name: l.name, amount: l.principal, annualRate: l.annualRate, graceMonths: l.graceMonths, interestPerMonth: Math.round(l.balance * (l.annualRate / 12)), paymentAfterGrace: l.monthlyPayment })),
    fixedMonthly: fixed,
    loanPaymentNow: loanNow,
    loanPaymentAfterGrace: s.finance.loans.reduce((t, l) => t + l.monthlyPayment, 0),
    runwayMonths: runway,
    runwayCapped: runway >= RUNWAY_CAP,
    goalNetWorth: tier.equity * scenarioOf(plan.scenarioId).goal.netWorthMultiple,
  };
}
