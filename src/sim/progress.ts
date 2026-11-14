import { isWhiskyCategory } from './blending';
import { awarenessOf, houseBrand } from './brands';
import { SCENARIOS, midGoalsForRules, type MidGoalDef } from './content/scenarios';
import { candidateHorizon, isCampaignCandidate } from './ledger';
import { isBulkKind, spotBidPerLPA } from './bulk';
import { MILESTONES } from './content/milestones';
import { firstEligibleSale } from './saleEvents';
import { DEFAULT_FLAGSHIP_MONTHS, campaignMinOakMonths, rulesVersionOf } from './rules';
import type { GameEnding, GameState, GoalCheck, GoalVerdict, MilestoneId, MonthReport, Product } from './types';

// 진행 — 마일스톤·목표 판정·게임이 끝난 이유 (파트 META, skeleton S-9, #145)
// 틱 9단계(판정)에서 updateProgress가 한 번 부른다. 돈·재고를 바꾸지 않는다 — 기록과 판정만 한다

// 규칙 묶음 읽기(`DEFAULT_FLAGSHIP_MONTHS`·`campaignMinOakMonths`·`rulesVersionOf`)는 잎 모듈 `rules.ts`로 옮겼다(P-ARCH-56 — 순환 방지). 호환을 위해 다시 내보낸다
export { DEFAULT_FLAGSHIP_MONTHS, campaignMinOakMonths, rulesVersionOf };

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
const flagshipMonths = campaignMinOakMonths;
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
  // 등급제 (#263 ①안 — 등급표는 그대로, 결과 이름만): 버티고 순자산을 채우면 플래그십이 없어도 "달성"(B).
  // 플래그십까지면 헤리티지(A·S), 순자산 미달이면 "일부 미달"(플래그십만 B · 버티기만 C)
  const result: GoalVerdict['result'] = !survive ? 'failed' : checks.every((c) => c.ok) ? 'heritage' : nw >= target ? 'achieved' : 'missed';
  let grade: GoalVerdict['grade'] = null;
  if (result === 'heritage') {
    grade = nw >= target * GRADE.sNetWorthRatio && (flag?.value ?? 0) >= GRADE.sFlagshipQuality && awarenessOf(s) >= GRADE.sAwareness ? 'S' : 'A';
  } else if (result === 'achieved') {
    grade = 'B';
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
  updateMidGoals(s, report);
  if (!s.scenario) return;
  const ended = s.status !== 'running';
  if (rulesVersionOf(s) === 'legacy-v15' || !s.scenario.campaignGoal) {
    // 옛 판 — 목표 기간(180개월)이 끝나거나 게임이 끝나면 한 번 판정(동작 그대로, 바이트 동일)
    if (s.progress.verdict) return;
    if (ended || s.month + 1 >= s.scenario.goal.months) {
      const v = judgeGoal(s, s.month + 1);
      if (v) s.progress.verdict = v;
    }
    return;
  }
  // 새 판(v16, F4 [결정 #308]) — 승리 = 적격 로트의 최초 정상 유상 출하. 그달 결산의 사건에서 첫 승리 후보를 읽는다(틱 순서 = 출고 순서).
  // 강제 판정은 없다: `verdict`는 승리 달에 한 번(성과 등급) 또는 판이 끝날 때(failed)만 — [결정 #324]. 승리는 멈춤 사유가 아니다(계속 운영)
  if (!s.progress.win) {
    const e = firstEligibleSale(report.saleEvents ?? []);
    if (e) {
      s.progress.win = { month: s.month, productId: e.productId, lotId: e.lotId, kind: e.kind, unitPrice: e.unitPrice, bottles: e.bottles };
      const quality = s.commerce.products.find((p) => p.id === e.productId)?.quality;
      s.progress.milestones.push({ id: 'campaign_win', month: s.month, ...(quality != null ? { value: quality } : {}) });
      report.notes.push(`캠페인 승리 — ${MILESTONES.campaign_win.nameKo}${e.kind === 'cellar_door' ? ' (핸드필)' : ''}: ${e.bottles}병 · 병당 ${Math.round(e.unitPrice).toLocaleString()}원`);
      if (!s.progress.verdict) s.progress.verdict = judgeWin(s, s.month + 1, quality);
    }
  }
  if (ended && !s.progress.verdict) { const v = judgeGoal(s, s.month + 1); if (v) s.progress.verdict = v; }
}

/**
 * 승리 달의 성과 판정(F4, v16, [결정 #324] — achieved·missed는 v16에서 생기지 않는다) — 결과는 늘 heritage, 등급은 지금 `GRADE` 기준 그대로(S: 순자산 목표 × 1.5 · 승리 로트 품질 ≥ 80 · 인지도 ≥ 20%).
 * 순자산은 성과이고 승리 조건이 아니다(#308) — `netWorth` 칸은 참고로 남는다. 핸드필 승리(`cellar_door`)는 제품이 없어 품질 값이 없다 → S 불가, A
 */
export function judgeWin(s: GameState, month: number, quality?: number): GoalVerdict {
  const sc = s.scenario!;
  const nw = netWorth(s);
  const target = sc.equity * sc.goal.netWorthMultiple;
  const checks: GoalCheck[] = [
    { id: 'survive', ok: true },
    { id: 'flagship', ok: true, ...(quality != null ? { value: quality } : {}) },
    { id: 'netWorth', ok: nw >= target, value: nw, target },
  ];
  const grade: GoalVerdict['grade'] = nw >= target * GRADE.sNetWorthRatio && (quality ?? 0) >= GRADE.sFlagshipQuality && awarenessOf(s) >= GRADE.sAwareness ? 'S' : 'A';
  return { month, result: 'heritage', grade, checks, netWorth: nw, ...(quality != null ? { flagshipQuality: quality } : {}), awareness: awarenessOf(s) };
}

/** 결과 화면 연표 — 연표에 보이는 마일스톤을 달 순서로 */
export const timelineOf = (s: Pick<GameState, 'progress'>) =>
  s.progress.milestones.filter((m) => MILESTONES[m.id].timeline).sort((a, b) => a.month - b.month);

// ───────────── 중반 목표 (#216, 4차 MVP 플레이테스트: 중반 이후 방향감이 없다) ─────────────

/** 지금 이 중반 목표를 이뤘는가 */
export function midGoalMet(s: GameState, id: MidGoalDef['id']): boolean {
  switch (id) {
    case 'aged3_sold': return s.commerce.products.some((p) => isWhiskyCategory(p.category) && (p.ageYears ?? 0) >= 3 && p.totalSold > 0);
    case 'commission_done': return s.commerce.commissions.some((c) => !!c.fulfilledBy) || s.commerce.products.some((p) => p.blend?.source === 'critic' && (p.blend.appealBonus ?? 0) > 0);
    case 'export_open': return (s.commerce.exports ?? []).length > 0;
    case 'revenue_8': return s.history.reports.slice(-12).reduce((t, r) => t + r.revenue, 0) >= 800_000_000;
    // F5a [결정 #319]: 12년 후보 통 3개 — 안내 지평('hint' 36 → 목재 108개월↑ 자가 몰트). 'reserve'(144)를 쓰면 모든 자가 몰트 통이 후보라 저절로 달성된다(MKT §7.3). 오염 조건 없음(한 함수 원칙)
    case 'reserve_casks': return s.inventory.casks.filter((c) => isCampaignCandidate(s, c, candidateHorizon(s, 'hint'))).length >= 3;
  }
}

/** 이 판의 중반 목표 정의 (없으면 빈 목록) */
export const midGoalsOf = (s: Pick<GameState, 'scenario' | 'rulesVersion'>): MidGoalDef[] => { const def = s.scenario ? SCENARIOS[s.scenario.id] : undefined; return def ? midGoalsForRules(def, rulesVersionOf(s)) : []; }; // F5a: 규칙 묶음별(옛 판 midGoals · v16 midGoalsV16)

/** 월말: 아직 결과가 없는 중반 목표를 판정한다 — 이루면 보상(하우스 브랜드 인지도), 기한이 지나면 놓침(벌은 없다) */
function updateMidGoals(s: GameState, report: MonthReport): void {
  const defs = midGoalsOf(s);
  if (!defs.length || s.status !== 'running') return;
  const have = new Set((s.progress.midGoals ?? []).map((g) => g.id));
  for (const g of defs) {
    if (have.has(g.id)) continue;
    if (midGoalMet(s, g.id)) {
      s.progress.midGoals = [...(s.progress.midGoals ?? []), { id: g.id, month: s.month, result: 'done' }];
      const b = houseBrand(s);
      b.awareness = Math.min(0.95, b.awareness + g.rewardAwareness);
      report.notes.push(`중반 목표 달성 — ${g.title}: 인지도 +${Math.round(g.rewardAwareness * 100)}%p`);
    } else if (s.month + 1 >= g.byMonth) {
      s.progress.midGoals = [...(s.progress.midGoals ?? []), { id: g.id, month: s.month, result: 'missed' }];
      report.notes.push(`중반 목표 기한 지남 — ${g.title}`);
    }
  }
}
