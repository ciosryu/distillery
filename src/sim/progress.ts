import { isWhiskyCategory } from './blending';
import { awarenessOf, houseBrand } from './brands';
import { SCENARIOS, midGoalsForRules, type MidGoalDef } from './content/scenarios';
import { candidateHorizon, isCampaignCandidate, recordFirstEligible, winDelayMonths } from './ledger';
import { liquidationValue, usesObservedValuation } from './valuation';
import { isBulkKind, spotBidPerLPA } from './bulk';
import { MILESTONES } from './content/milestones';
import { firstEligibleSale } from './saleEvents';
import { updateLateGoals } from './lateGoals';
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
  /**
   * S 순자산 — 새 캠페인(v16)은 규모별 고정 금액(원, 설비 처분가를 넣은 순자산 기준) `[튜닝]` ([결정 #393] · MGT `mgt-grade-options.md` 「[결정 #393] · [결정 #398] 값 표」).
   * 드묾 목표 「평범하게 운영하면 거의 못 받고, 통을 준비한 사람의 3 ~ 4명 중 1명」 — 봇 X0-R 40시드 13 · 11 / 40, X0 0 / 40. 없는 규모 · 옛 판은 `sNetWorthRatio` 식
   */
  sNetWorthV16: { standard: 2_000_000_000, micro: 2_550_000_000 } as Record<string, number>,
  /**
   * [결정 #407] 승리를 미룬 만큼 S 순자산 문턱을 올린다 — 첫 12년 적격 통이 생긴 달부터 승리 달까지 한 달에 이만큼(원) `[튜닝]`.
   * [결정 #423] 출시를 미룬 판의 순자산 기울기(봇 X0-R best 출시, 미룸 6 ~ 36개월) 표준 0.18 · 마이크로 0.25억/월 — 미뤄서 얻는 순자산을 지우고 15년 길을 벌하지 않는다(MGT `mgt-grade-options.md` #418 절).
   * 처음 값 0.22 · 0.28(#407)은 플래그십을 팔던 봇의 146 → 180개월 기울기라 오래 미룰수록 S를 깎았다(36개월 S 14 → 9)
   * [결정 #434] 표준 0.25 · 마이크로 0.32억/월 — #433으로 15년 길이 승리 미루기가 아니라 「명작」 칭호가 되어, k는 6 · 12개월 짧은 미룸만 맡는다(최종 트리 40시드: 0.18 · 0.25에서 미룸 6 · 12의 S 17 ~ 20 → 띠 10 ~ 14 쪽으로).
   */
  sDelayPerMonthV16: { standard: 25_000_000, micro: 32_000_000 } as Record<string, number>, // [결정 #434] 0.25 · 0.32억(#423의 0.18 · 0.25를 대체 — 6 · 12개월 짧은 미룸을 지움)
  /**
   * [결정 #407] 미룸으로 세지 않는 개월 — 곧바로 이긴 판의 판정 달 − 첫 적격 달 = 2(첫 적격은 월말 결산에 생기고 → 다음 달 출시 · 판매 → 판정 달은 그 다음 경과 개월).
   * 봇 X0-R 곧바로 승리 3판 모두 2(MGT 측정). 이만큼은 벌하지 않는다 `[튜닝]`
   */
  sDelayGraceMonths: 2,
};

/** [결정 #407] S 문턱에 더할 미룬 개월 — 판정 달 `verdictMonth`(경과 개월 — `judgeWin`의 month) − 첫 적격 달 − 유예(`GRADE.sDelayGraceMonths`). 첫 적격 기록이 없으면 0 */
export function sDelayMonths(s: Pick<GameState, 'progress' | 'month'>, verdictMonth: number = s.month + 1): number {
  return Math.max(0, winDelayMonths(s, verdictMonth) - GRADE.sDelayGraceMonths);
}

/**
 * S 등급 순자산 문턱(원) — v16은 규모별 고정 금액 + [결정 #407] 승리를 미룬 개월(`sDelayMonths`) × 규모별 k.
 * `verdictMonth` = 판정 달(경과 개월). 기본 = 이번 달에 팔면 판정될 달(s.month + 1) — 화면은 「지금 이기면」 문턱을 그대로 읽는다.
 * 옛 판(legacy-v15)이나 표에 없는 규모는 성과 기준 × `sNetWorthRatio`(미룸 없음). 시나리오가 없으면 null
 */
export function sNetWorthTarget(s: Pick<GameState, 'scenario' | 'rulesVersion' | 'progress' | 'month'>, verdictMonth: number = s.month + 1): number | null {
  const sc = s.scenario;
  if (!sc) return null;
  const byRatio = sc.equity * sc.goal.netWorthMultiple * GRADE.sNetWorthRatio;
  if (rulesVersionOf(s) === 'legacy-v15') return byRatio;
  const base = GRADE.sNetWorthV16[sc.tierId];
  if (base == null) return byRatio;
  return base + (GRADE.sDelayPerMonthV16[sc.tierId] ?? 0) * sDelayMonths(s, verdictMonth);
}

const oakMonthsOf = (p: Pick<Product, 'oakMonths' | 'ageYears'>) => p.oakMonths ?? (p.ageYears ?? 0) * 12;
const flagshipMonths = campaignMinOakMonths;
const flagshipProducts = (s: GameState) => s.commerce.products.filter((p) => isWhiskyCategory(p.category) && oakMonthsOf(p) >= flagshipMonths(s));

/**
 * 순자산 = 지금 정리하면 실제로 받을 수 있는 돈 (보수적):
 * 현금 − 대출 잔액 + 매출채권 + 원액(탱크·캐스크) 현물 매각가 + 제품 재고 × 병당 원가.
 * 소주·진 원액은 현물 시장이 없어 0으로 센다. 캐스크 오너십으로 판 통은 고객 것이라 뺀다.
 * 재고 평가액 곡선(#138)의 평가 방식이 정해지면(오너 결정 대기) 그쪽과 맞춘다
 */
export function netWorthLegacy(s: GameState): number {
  const spirits = [...s.inventory.lots, ...s.inventory.casks.filter((c) => c.contents && !c.owner).map((c) => c.contents!)]
    .reduce((t, l) => t + (isBulkKind(l) ? l.volumeL * l.abv * spotBidPerLPA(s, l) : 0), 0);
  const products = s.commerce.products.reduce((t, p) => t + p.stockBottles * p.unitCost, 0);
  const receivables = s.finance.receivables.reduce((t, r) => t + r.amount, 0);
  const loans = s.finance.loans.reduce((t, l) => t + l.balance, 0);
  return Math.round(s.finance.cash - loans + receivables + spirits + products);
}
/**
 * 순자산 (#146·#317) — 새 판(v16, 샌드박스 포함)은 **처분 예상액**(`valuation.ts liquidationValue` — 통 원액은 관측 품질 q̂, 병 재고 초과분 할인, 선급 의무 부채),
 * 옛 판(`legacy-v15`)은 지금 식(`netWorthLegacy`, 참 품질 현물가 — 바이트 동일). 구기준선과는 `netWorthLegacy`로만 비교한다(P-MGT-47 리스크)
 */
export function netWorth(s: GameState, atMonth: number = s.month): number {
  return usesObservedValuation(s) ? liquidationValue(s, atMonth) : netWorthLegacy(s); // atMonth: 설비 처분가 감가 기준 달(#398 — 결산이 다음 달 값을 적는다)
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
  updateLateGoals(s, report); // [#388 ① G3] 후반 목표 — 승리 뒤에도 돈다(보상 없음)
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
  recordFirstEligible(s); // [결정 #407] 첫 적격 통 달 — 기록만(승리 미루기 문턱의 기준)
  if (!s.progress.win) {
    const e = firstEligibleSale(report.saleEvents ?? []);
    if (e) {
      s.progress.win = { month: s.month, productId: e.productId, lotId: e.lotId, kind: e.kind, ...(e.channel ? { channel: e.channel } : {}), unitPrice: e.unitPrice, bottles: e.bottles };
      const quality = s.commerce.products.find((p) => p.id === e.productId)?.quality;
      s.progress.milestones.push({ id: 'campaign_win', month: s.month, ...(quality != null ? { value: quality } : {}) });
      report.notes.push(`캠페인 승리 — ${MILESTONES.campaign_win.nameKo}${e.kind === 'cellar_door' ? ' (핸드필)' : ''}: ${e.bottles}병 · 병당 ${Math.round(e.unitPrice).toLocaleString()}원`);
      if (!s.progress.verdict) s.progress.verdict = judgeWin(s, s.month + 1, quality);
    }
  }
  if (s.progress.win) judgeMasterpiece(s, report); // [결정 #433] 승리 뒤 — 새 적격 로트의 첫 출하 달에 15년+ · 80 · 20%면 「명작」(등급은 그대로)
  if (ended && !s.progress.verdict) { const v = judgeGoal(s, s.month + 1); if (v) s.progress.verdict = v; }
}

/** 지금 등급 — [결정 #433] 등급은 승리 달 첫 판정(`verdict`) 하나다(재판정 없음 · 옛 `verdictBest`는 읽지 않는다). 화면이 부르는 이름은 그대로 둔다 */
export const bestVerdict = (s: Pick<GameState, 'progress'>): GoalVerdict | undefined => s.progress.verdict;

/** [결정 #433] 「명작」 제품 표기 연수 하한 */
export const MASTERPIECE_MIN_AGE = 15;

/**
 * [결정 #433 · #435] 「명작」 칭호 — **등급과 따로**(S는 승리 달에 한 번만 · #422 재판정 · #427을 대체). 승리 달부터, 이번 달 판매 사건 가운데 적격 로트의
 * **첫 정상 유상 출하**가 있고, 그 제품이 **표기 15년 이상 · 품질 ≥ 80 · 그달 인지도 ≥ 20%**면 `progress.masterpiece`에 한 번 적는다. 순자산은 보지 않는다.
 * [결정 #435] **승리 로트 자신도 본다** — 표기 15년 이상 제품으로 이긴 판은 승리 달에 명작이 된다(updateProgress가 승리를 적은 뒤 같은 달에 부른다).
 * 첫 출하인지는 남아 있는 결산(120개월 창)의 판매 사건으로 본다. 이미 명작이면 보지 않는다. 옛 판 · 승리 전은 아무 일도 없다
 */
export function judgeMasterpiece(s: GameState, report: MonthReport): void {
  if (rulesVersionOf(s) === 'legacy-v15' || !s.progress.win || s.progress.masterpiece) return;
  const fresh = (report.saleEvents ?? []).filter((e) => e.eligibleAtSale && e.kind !== 'b2b' && e.bottles > 0 && e.unitPrice > 0); // [결정 #435] 승리 로트도 본다
  if (!fresh.length) return;
  const seen = new Set<string>();
  for (const r of s.history.reports) for (const e of r.saleEvents ?? []) seen.add(e.lotId);
  let best: { e: (typeof fresh)[number]; q: number; age: number } | undefined;
  for (const e of fresh) {
    if (seen.has(e.lotId)) continue;
    const p = s.commerce.products.find((x) => x.id === e.productId);
    if (p?.quality == null || (p.ageYears ?? 0) < MASTERPIECE_MIN_AGE) continue;
    if (!best || p.quality > best.q) best = { e, q: p.quality, age: p.ageYears! };
  }
  if (!best || best.q < GRADE.sFlagshipQuality) return;
  const aw = awarenessOf(s);
  if (aw < GRADE.sAwareness) return;
  s.progress.masterpiece = { month: s.month + 1, productId: best.e.productId, lotId: best.e.lotId, quality: best.q, awareness: aw, ageYears: best.age };
  const name = s.commerce.products.find((p) => p.id === best!.e.productId)?.name ?? best.e.productId;
  report.notes.push(`명작 — 「${name}」(${best.age}년 · 품질 ${best.q.toFixed(1)}) 첫 출하로 「명작」 칭호를 받았다 (등급은 승리 달 그대로)`);
}

/**
 * 승리 달의 성과 판정(F4, v16, [결정 #324] — achieved·missed는 v16에서 생기지 않는다) — 결과는 늘 heritage, 등급은 지금 `GRADE` 기준 그대로(S: 순자산 목표 × 1.5 · 승리 로트 품질 ≥ 80 · 인지도 ≥ 20%).
 * 순자산은 성과이고 승리 조건이 아니다(#308) — `netWorth` 칸은 참고로 남는다. 핸드필 승리(`cellar_door`)는 제품이 없어 품질 값이 없다 → S 불가, A
 */
export function judgeWin(s: GameState, month: number, quality?: number): GoalVerdict {
  const sc = s.scenario!;
  const nw = netWorth(s, month); // [#398] 판정 달(승리 달 결산)의 설비 감가 기준 — 결산 report.netWorth와 같은 값
  const target = sc.equity * sc.goal.netWorthMultiple;
  const sTarget = sNetWorthTarget(s, month)!; // [결정 #393] 규모별 S 순자산 + [결정 #407] 승리 달까지 미룬 개월 × k
  const checks: GoalCheck[] = [
    { id: 'survive', ok: true },
    { id: 'flagship', ok: true, ...(quality != null ? { value: quality } : {}) },
    { id: 'netWorth', ok: nw >= target, value: nw, target },
  ];
  const grade: GoalVerdict['grade'] = nw >= sTarget && (quality ?? 0) >= GRADE.sFlagshipQuality && awarenessOf(s) >= GRADE.sAwareness ? 'S' : 'A';
  return { month, result: 'heritage', grade, checks, netWorth: nw, sNetWorthTarget: sTarget, ...(quality != null ? { flagshipQuality: quality } : {}), awareness: awarenessOf(s) };
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
    case 'reserve_casks': return reserveCandidateCount(s) >= RESERVE_CASKS_GOAL;
  }
}

/** 중반 목표 reserve_casks의 목표 통 수 (#319) */
export const RESERVE_CASKS_GOAL = 3;
/** 안내 지평 후보 통 수(자가 몰트 · 목재 108개월↑, 고객 소유 제외) — midGoalMet('reserve_casks')와 화면 "후보 n/3"이 같은 식을 쓴다 */
export const reserveCandidateCount = (s: GameState): number => s.inventory.casks.filter((c) => isCampaignCandidate(s, c, candidateHorizon(s, 'hint'))).length;
/** 중반 목표 진행 수치(F5c-2) — 수치로 보일 수 있는 목표만(지금은 reserve_casks), 나머지는 null */
export function midGoalProgress(s: GameState, id: MidGoalDef['id']): { have: number; need: number } | null {
  if (id === 'reserve_casks') return { have: reserveCandidateCount(s), need: RESERVE_CASKS_GOAL };
  return null;
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
