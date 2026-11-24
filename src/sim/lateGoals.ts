import { SCENARIOS, type LateGoalDef } from './content/scenarios';
import { campaignWon } from './ledger';
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

/**
 * 이 후반 목표를 이뤘는가 — **판정은 MGT 몫(①-c)**. 그릇 PR(①-b)에서는 모두 false(기록 · 화면 자리만 시험한다)
 * `[TODO MGT ①-c]` ladder_mid(ageBand bandCounts 5 ~ 9년 ≥ THIN_BAND_CASKS) · lounge_3(visitor_vip 가동 ∧ 12개월 tourismRevenue) ·
 * flagship_300(saleEvents · caskEligibility) · aged15_sold / aged18_sold(`caskEligibility(s, cask, 180 | 216)` — 연수 인자는 코어에 있다)
 */
export function lateGoalMet(_s: GameState, _id: LateGoalDef['id']): boolean {
  return false;
}

/** 진척 수치(화면 「n/m」) — 수치로 보일 수 있는 목표만. 그릇 PR에서는 모두 null(MGT ①-c가 채운다) */
export function lateGoalProgress(_s: GameState, _id: LateGoalDef['id']): { have: number; need: number } | null {
  return null;
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
