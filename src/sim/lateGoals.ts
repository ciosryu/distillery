import { SCENARIOS, type LateGoalDef } from './content/scenarios';
import { campaignWon, ledgerEligibility } from './ledger';
import { bandCounts, THIN_BAND_CASKS } from './ageBand';
import { campaignMinOakMonths } from './rules';
import { rulesVersionOf } from './rules';
import type { GameState, MonthReport } from './types';

// ───────────── [#388 ① G3] 후반 목표 사다리 (endgame.md §7.2 — 그릇 ARCH · 판정 MGT ①-c) ─────────────
// 9차 판: 중반 목표 넷이 112개월째에 다 끝났고, 승리 뒤에는 「계속 운영(목표 없이)」뿐이었다. 후반 목표는 **보상이 없다**(기록 · 화면만) —
// 봇이 이루어도 sim 수치가 같아 v16 X0 바이트가 그대로다. 옛 판(legacy-v15)은 읽지 않는다(X0L 그대로)

/** 이 판의 후반 목표 정의 — v16 새 캠페인만 */
export const lateGoalsOf = (s: Pick<GameState, 'scenario' | 'rulesVersion'>): LateGoalDef[] => {
  if (!s.scenario || rulesVersionOf(s) === 'legacy-v15') return [];
  return SCENARIOS[s.scenario.id]?.lateGoalsV16 ?? [];
};

const recordOf = (s: Pick<GameState, 'progress'>, id: string) => (s.progress.lateGoals ?? []).find((g) => g.id === id);

/** 지금 보이는(열린) 목표인가 — 달 · 승리 · 앞 목표 달성 */
export function lateGoalOpen(s: Pick<GameState, 'month' | 'progress' | 'rulesVersion'>, g: LateGoalDef): boolean {
  if (g.opens === 'win') return campaignWon(s);
  if ('month' in g.opens) return s.month >= g.opens.month;
  return recordOf(s, g.opens.after)?.result === 'done';
}

// ───────────── 판정 (MGT ①-c, mgt-endgame.md §4.1) — 문턱은 모두 `[튜닝 — 단계 T]` ─────────────

/** `lounge_3` — 최근 12개월 관광 매출 문턱(원) */
export const LOUNGE_TOURISM_GOAL = 300_000_000;
/** `flagship_300` — 12년 이상 자가 싱글 몰트 누적 출하 병 수 */
export const FLAGSHIP_BOTTLES_GOAL = 300;
/** 15 · 18년 목표의 목재 개월 */
export const AGED_GOAL_MONTHS = { aged15_sold: 180, aged18_sold: 216 } as const;

/** 승리와 같은 셈의 출하 — 적격 로트 · 유상 · 납품(b2b) 아님 (`saleEvents.ts firstEligibleSale`과 같은 거르기) */
const paidEligible = (e: NonNullable<MonthReport['saleEvents']>[number]) => e.eligibleAtSale && e.kind !== 'b2b' && e.bottles > 0 && e.unitPrice > 0;

/** VIP 라운지가 가동 중인가(공사 끝) */
const loungeReady = (s: GameState) => s.production.equipment.some((e) => e.catalogId === 'visitor_vip' && e.readyMonth <= s.month);
/** 최근 12개월 관광 매출(원) */
const tourism12 = (s: GameState) => s.history.reports.slice(-12).reduce((t, r) => t + (r.tourismRevenue ?? 0), 0);
/** 승리 적격 출하 누적 병(결산 기록에 남은 만큼 — 기록 창보다 오래된 판매는 세지 않는다) */
const flagshipBottles = (s: GameState) => s.history.reports.reduce((t, r) => t + (r.saleEvents ?? []).filter(paidEligible).reduce((u, e) => u + e.bottles, 0), 0);

/**
 * 지난달 출하 가운데 목재 `months` 이상인 승리 적격 출하가 있었나.
 * 로트가 남아 있으면 그 원장(`components`)의 가장 어린 원액으로, 다 팔려 지워졌으면 제품의 표기 목재 개월(`oakMonths`)로 본다
 */
function agedSold(s: GameState, months: number): boolean {
  const events = (s.history.reports.at(-1)?.saleEvents ?? []).filter(paidEligible);
  return events.some((e) => {
    const lot = (s.commerce.lots ?? []).find((l) => l.id === e.lotId);
    if (lot?.components?.length) return ledgerEligibility(s, lot.components, 0, months).eligible;
    const p = s.commerce.products.find((x) => x.id === e.productId); // 보관 제품(productArchive)에는 목재 개월이 없다 — 그달 판 로트는 보통 남아 있다
    return (p?.oakMonths ?? 0) >= Math.max(months, campaignMinOakMonths(s));
  });
}

/** 이 후반 목표를 이뤘는가 (MGT ①-c) — 보상은 없다(기록만, 그래서 봇 출력이 같다) */
export function lateGoalMet(s: GameState, id: LateGoalDef['id']): boolean {
  switch (id) {
    case 'ladder_mid': return bandCounts(s)['5-9'].casks >= THIN_BAND_CASKS; // #380 띠와 한 정의(5 ~ 9년 = 목재 60 ~ 119개월, 몰트 · 그레인)
    case 'lounge_3': return loungeReady(s) && tourism12(s) >= LOUNGE_TOURISM_GOAL;
    case 'flagship_300': return flagshipBottles(s) >= FLAGSHIP_BOTTLES_GOAL;
    case 'aged15_sold': return agedSold(s, AGED_GOAL_MONTHS.aged15_sold);
    case 'aged18_sold': return agedSold(s, AGED_GOAL_MONTHS.aged18_sold);
    default: return false;
  }
}

/** 진척 수치(화면 「n/m」) — 수치로 보일 수 있는 목표만. 라운지는 억 단위(소수 한 자리) */
export function lateGoalProgress(s: GameState, id: LateGoalDef['id']): { have: number; need: number } | null {
  switch (id) {
    case 'ladder_mid': return { have: bandCounts(s)['5-9'].casks, need: THIN_BAND_CASKS };
    case 'lounge_3': return { have: Math.floor(tourism12(s) / 1e7) / 10, need: LOUNGE_TOURISM_GOAL / 1e8 };
    case 'flagship_300': return { have: Math.min(flagshipBottles(s), FLAGSHIP_BOTTLES_GOAL), need: FLAGSHIP_BOTTLES_GOAL };
    default: return null;
  }
}

/** 화면에 보일 목표 — 열렸고 아직 결과가 없거나, 결과가 있는 것(달성 ✓ · 놓침 ✗). 늦게 본 목표(기록 없이 기한이 지남)는 보이지 않는다 */
export function visibleLateGoals(s: GameState): { def: LateGoalDef; result?: { month: number; result: 'done' | 'missed' } }[] {
  return lateGoalsOf(s).flatMap((def) => {
    const r = recordOf(s, def.id);
    if (r) return [{ def, result: { month: r.month, result: r.result } }];
    if (!lateGoalOpen(s, def) || skippedLate(s, def)) return [];
    return [{ def }];
  });
}

/** 처음 보는 달에 이미 기한이 지났다 — 진행 중 세이브가 이 목표 전에 만들어졌다. 'missed'로 적지 않고 건너뛴다(그 목표가 없던 판, MGT 지적) */
const skippedLate = (s: Pick<GameState, 'month'>, g: LateGoalDef) => g.byMonth != null && s.month + 1 > g.byMonth;

/** 월말: 열린 후반 목표를 판정한다(updateProgress가 부른다 — 승리 뒤에도). 보상 없음 — 메모만 */
export function updateLateGoals(s: GameState, report: MonthReport): void {
  const defs = lateGoalsOf(s);
  if (!defs.length || s.status !== 'running') return;
  for (const g of defs) {
    if (recordOf(s, g.id) || !lateGoalOpen(s, g) || skippedLate(s, g)) continue;
    if (lateGoalMet(s, g.id)) {
      s.progress.lateGoals = [...(s.progress.lateGoals ?? []), { id: g.id, month: s.month, result: 'done' }];
      report.notes.push(`후반 목표 달성 — ${g.title}`);
    } else if (g.byMonth != null && s.month + 1 >= g.byMonth) {
      s.progress.lateGoals = [...(s.progress.lateGoals ?? []), { id: g.id, month: s.month, result: 'missed' }];
      report.notes.push(`후반 목표 기한 지남 — ${g.title}`);
    }
  }
}
