import { isWhiskyCategory } from './blending';
import { awarenessOf } from './brands';
import { isBulkKind, spotBidPerLPA } from './bulk';
import { MILESTONES } from './content/milestones';
import type { GameEnding, GameState, GoalCheck, GoalVerdict, MilestoneId, MonthReport, Product } from './types';

// 진행 — 마일스톤·목표 판정·게임이 끝난 이유 (파트 META, skeleton S-9, #145)
// 틱 9단계(판정)에서 updateProgress가 한 번 부른다. 돈·재고를 바꾸지 않는다 — 기록과 판정만 한다

/** 플래그십 최소 숙성 — 시나리오가 없으면(샌드박스) 12년 */
export const DEFAULT_FLAGSHIP_MONTHS = 144;

/** 등급 기준 `[튜닝]` — 단계 T에서 정한다. 근거 없음 `[확인 불가]` */
export const GRADE = {
  /** S: 목표를 모두 달성하고 순자산이 목표의 이 배수 이상 */
  sNetWorthRatio: 1.5,
  /** S: 플래그십 품질 이 이상 */
  sFlagshipQuality: 80,
  /** S: 브랜드 인지도 이 이상 */
  sAwareness: 0.2,
};

const oakMonthsOf = (p: Pick<Product, 'oakMonths' | 'ageYears'>) => p.oakMonths ?? (p.ageYears ?? 0) * 12;
const flagshipMonths = (s: GameState) => s.scenario?.goal.flagshipMinMonths ?? DEFAULT_FLAGSHIP_MONTHS;
const flagshipProducts = (s: GameState) => s.commerce.products.filter((p) => isWhiskyCategory(p.category) && oakMonthsOf(p) >= flagshipMonths(s));

/**
 * 순자산 = 지금 정리하면 실제로 받을 수 있는 돈 (보수적):
 * 현금 − 대출 잔액 + 매출채권 + 원액(탱크·캐스크) 현물 매각가 + 제품 재고 × 병당 원가.
 * 소주·진 원액은 현물 시장이 없어 0으로 센다. 캐스크 오너십으로 판 통은 고객 것이라 뺀다.
 * 재고 평가액 곡선(#138)의 평가 방식이 정해지면(오너 결정 대기) 그쪽과 맞춘다
 */
export function netWorth(s: GameState): number {
  const spirits = [...s.inventory.lots, ...s.inventory.casks.filter((c) => c.contents && !c.owner).map((c) => c.contents!)]
    .reduce((t, l) => t + (isBulkKind(l) ? l.volumeL * l.abv * spotBidPerLPA(s, l) : 0), 0);
  const products = s.commerce.products.reduce((t, p) => t + p.stockBottles * p.unitCost, 0);
  const receivables = s.finance.receivables.reduce((t, r) => t + r.amount, 0);
  const loans = s.finance.loans.reduce((t, l) => t + l.balance, 0);
  return Math.round(s.finance.cash - loans + receivables + spirits + products);
}

/** 이번 달에 처음 일어난 일 — 이미 기록한 마일스톤은 다시 보지 않는다 */
function detect(s: GameState, report: MonthReport): { id: MilestoneId; value?: number }[] {
  const sold = (pred: (p: Product) => boolean) => report.sales.some((x) => x.bottles > 0 && s.commerce.products.some((p) => p.id === x.productId && pred(p)));
  const found: { id: MilestoneId; value?: number }[] = [];
  if (report.production.some((b) => b.lpa > 0)) found.push({ id: 'first_distill' });
  if (s.inventory.casks.some((c) => c.contents && !c.contents.sourced)) found.push({ id: 'first_fill' });
  if (s.finance.loans.length > 0) found.push({ id: 'first_loan' });
  if (sold((p) => p.category === 'soju_distilled')) found.push({ id: 'first_soju_sale' });
  if (s.commerce.products.some((p) => isWhiskyCategory(p.category))) found.push({ id: 'first_whisky_bottled' });
  if (sold((p) => isWhiskyCategory(p.category))) found.push({ id: 'first_whisky_sale' });
  if (s.finance.negativeCashMonths > 0) found.push({ id: 'first_cash_crisis' });
  const flag = flagshipProducts(s);
  const best = (ps: Product[]) => Math.max(...ps.map((p) => p.quality));
  if (flag.length) found.push({ id: 'flagship_bottled', value: best(flag) });
  const flagSold = flag.filter((p) => p.totalSold > 0);
  if (flagSold.length) found.push({ id: 'flagship_sold', value: best(flagSold) });
  return found;
}

/** 목표 판정 (시나리오가 있을 때만). failed = 목표 기간 전에 게임이 끝났다 */
export function judgeGoal(s: GameState, month: number): GoalVerdict | null {
  const sc = s.scenario;
  if (!sc) return null;
  const nw = netWorth(s);
  const target = sc.equity * sc.goal.netWorthMultiple;
  const flag = s.progress.milestones.find((m) => m.id === 'flagship_sold');
  const survive = s.status === 'running';
  const checks: GoalCheck[] = [
    { id: 'survive', ok: survive },
    { id: 'flagship', ok: !!flag, ...(flag?.value != null ? { value: flag.value } : {}) },
    { id: 'netWorth', ok: nw >= target, value: nw, target },
  ];
  const result = !survive ? 'failed' : checks.every((c) => c.ok) ? 'heritage' : 'missed';
  let grade: GoalVerdict['grade'] = null;
  if (result === 'heritage') {
    grade = nw >= target * GRADE.sNetWorthRatio && (flag?.value ?? 0) >= GRADE.sFlagshipQuality && awarenessOf(s) >= GRADE.sAwareness ? 'S' : 'A';
  } else if (result === 'missed') {
    grade = checks.filter((c) => c.id !== 'survive' && c.ok).length >= 1 ? 'B' : 'C';
  }
  return { month, result, grade, checks, netWorth: nw, ...(flag?.value != null ? { flagshipQuality: flag.value } : {}), awareness: awarenessOf(s) };
}

/** 게임을 끝낸다 — 끝난 이유를 남긴다 (파산은 step.ts가, 면허 취소·해임은 단계 P의 규칙이 부른다) */
export function endGame(s: GameState, reason: GameEnding): void {
  s.status = reason;
  s.progress.ending ??= { reason, month: s.month };
}

/** 틱 9단계: 마일스톤 기록 → (시나리오) 목표 기간이 끝났거나 게임이 끝났으면 판정. s.month는 아직 이번 달 */
export function updateProgress(s: GameState, report: MonthReport): void {
  const have = new Set(s.progress.milestones.map((m) => m.id));
  for (const f of detect(s, report)) {
    if (have.has(f.id)) continue;
    s.progress.milestones.push({ id: f.id, month: s.month, ...(f.value != null ? { value: f.value } : {}) });
    report.notes.push(`마일스톤: ${MILESTONES[f.id].nameKo}`);
  }
  if (!s.scenario || s.progress.verdict) return;
  const ended = s.status !== 'running';
  if (ended || s.month + 1 >= s.scenario.goal.months) {
    const v = judgeGoal(s, s.month + 1);
    if (v) s.progress.verdict = v;
  }
}

/** 결과 화면 연표 — 연표에 보이는 마일스톤을 달 순서로 */
export const timelineOf = (s: Pick<GameState, 'progress'>) =>
  s.progress.milestones.filter((m) => MILESTONES[m.id].timeline).sort((a, b) => a.month - b.month);
