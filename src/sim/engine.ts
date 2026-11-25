import { applyAction, type Action, type ActionResult } from './actions';
import { advanceMonth } from './step';
import type { GameState, MonthReport } from './types';
import { campaignWon, caskEligibility } from './ledger';
import { rulesVersionOf } from './rules';

// 엔진 계약 (docs/design/architecture.md §3.2) — 명령이 들어가고 스냅샷이 나온다.
// 지금은 같은 스레드 구현(createLocalEngine). 월 처리가 무거워지면 Web Worker 구현(단계 E),
// Godot 이식(Phase G)에서는 C# 라이브러리가 같은 모양을 구현한다. 화면·store는 이 계약만 안다.

/** 자동 진행이 멈추는 이유 (PRD §2.1 "다음 이벤트·알림까지 진행") */
export type StopReason = 'pendingEvent' | 'cashWarning' | 'bankrupt' | 'gameOver' | 'verdict' | 'equipmentReady' | 'forecast' | 'commission' | 'flagshipReady' | 'caskBid' | 'goalDone' | 'maxMonths';

export const DEFAULT_STOPS: StopReason[] = ['pendingEvent', 'cashWarning', 'bankrupt', 'gameOver', 'verdict', 'equipmentReady', 'forecast', 'commission', 'flagshipReady'];

/**
 * [#388 ① A1] 종반 운영 모드의 여러 달 진행 — 안전 정지(현금 · 파산 · 끝 · 판정 · 12년 적격)에 더해 **결정이 필요한 것**에서 멈춘다:
 * 선택 이벤트 · 블렌딩 의뢰(6개월 마감) · IB 입찰 제안(2개월 안에 답) · 중반 · 후반 목표 달성. 9차 판: 133번 모두 1개월 진행 — 분기 진행은 이것들을 지나쳤다(endgame.md §7.4)
 */
export const OPS_STOPS: StopReason[] = ['cashWarning', 'bankrupt', 'gameOver', 'verdict', 'flagshipReady', 'pendingEvent', 'commission', 'caskBid', 'goalDone'];

const doneGoals = (s: GameState) => (s.progress.midGoals ?? []).filter((g) => g.result === 'done').length + (s.progress.lateGoals ?? []).filter((g) => g.result === 'done').length;

/**
 * 새 캠페인(v16) 승리 전 — 승리 적격 통(승리 판정과 같은 `caskEligibility`)이 하나라도 있는가.
 * 자동 진행 멈춤 `flagshipReady`가 "없다 → 있다"로 바뀐 달만 본다(6차 판: 146개월에 적격이 됐는데 [1년 진행]이 지나쳐 158개월에 병입 — [결정 #333])
 */
export function hasWinReadyCask(s: GameState): boolean {
  if (!s.scenario || rulesVersionOf(s) !== 'v16' || campaignWon(s)) return false;
  return s.inventory.casks.some((c) => caskEligibility(s, c).eligible);
}

export interface AdvanceOptions {
  /** 최대 진행 개월 */
  months: number;
  /** 이 중 하나가 생기면 그 달에서 멈춘다 (없으면 months만큼) */
  stopOn?: StopReason[];
}

export interface AdvanceResult {
  state: GameState;
  /** 실제로 진행한 개월 */
  months: number;
  stoppedBy: StopReason;
  reports: MonthReport[];
}

/** 한 달 진행 뒤 멈춰야 하는지 — prev → next 사이에 새로 생긴 것만 본다 */
export function stopReasonOf(prev: GameState, next: GameState, stopOn: StopReason[]): StopReason | null {
  const on = new Set(stopOn);
  if (next.status === 'bankrupt') return 'bankrupt';
  // 면허 취소·해임 (S-9 자리) — 끝나면 항상 멈춘다
  if (next.status !== 'running') return 'gameOver';
  // 목표 판정이 막 나왔다 (S-9) — 결과 화면
  if (on.has('verdict') && next.progress.verdict && !prev.progress.verdict) return 'verdict';
  if (on.has('pendingEvent') && next.events.pending.some((p) => !prev.events.pending.some((q) => q.id === p.id))) return 'pendingEvent';
  if (on.has('cashWarning') && next.finance.negativeCashMonths > prev.finance.negativeCashMonths) return 'cashWarning';
  if (on.has('equipmentReady') && next.production.equipment.some((e) => e.readyMonth === next.month && e.readyMonth > prev.month)) return 'equipmentReady';
  if (on.has('forecast') && next.events.forecasts.some((f) => !prev.events.forecasts.some((g) => g.id === f.id))) return 'forecast';
  // 블렌딩 의뢰는 6개월 마감이라 놓치지 않게 (결정 #124)
  if (on.has('commission') && next.commerce.commissions.some((c) => !prev.commerce.commissions.some((d) => d.id === c.id))) return 'commission';
  // 12년 적격 통이 처음 생긴 달 — 판에서 가장 큰 소식(승리 출고 재료). 상태는 읽기만 해 출력 불변
  if (on.has('flagshipReady') && hasWinReadyCask(next) && !hasWinReadyCask(prev)) return 'flagshipReady';
  // [#388 ① A1] IB 입찰 제안(2개월 안에 답) · 목표 달성 — 읽기만 한다(출력 불변)
  if (on.has('caskBid') && next.b2b.caskBids.some((b) => !prev.b2b.caskBids.some((c) => c.id === b.id))) return 'caskBid';
  if (on.has('goalDone') && doneGoals(next) > doneGoals(prev)) return 'goalDone';
  return null;
}

/** 조건이 생길 때까지 한 달씩 진행 (순수 함수) */
export function advanceUntil(s: GameState, opts: AdvanceOptions): AdvanceResult {
  const stopOn = opts.stopOn ?? [];
  const reports: MonthReport[] = [];
  let cur = s;
  for (let i = 0; i < opts.months; i++) {
    if (cur.status !== 'running') return { state: cur, months: i, stoppedBy: cur.status === 'bankrupt' ? 'bankrupt' : 'gameOver', reports };
    const next = advanceMonth(cur);
    reports.push(next.history.reports.at(-1)!);
    const why = stopReasonOf(cur, next, stopOn);
    cur = next;
    if (why) return { state: cur, months: i + 1, stoppedBy: why, reports };
  }
  return { state: cur, months: opts.months, stoppedBy: 'maxMonths', reports };
}

export interface GameEngine {
  snapshot(): Readonly<GameState>;
  dispatch(cmd: Action): ActionResult;
  advance(opts: AdvanceOptions): AdvanceResult;
  /** 새 게임·불러오기 */
  load(s: GameState): void;
  subscribe(fn: (s: Readonly<GameState>) => void): () => void;
}

/** 같은 스레드 엔진 — 상태는 불변 스냅샷으로만 바뀐다 */
export function createLocalEngine(initial: GameState): GameEngine {
  let state = initial;
  const subs = new Set<(s: Readonly<GameState>) => void>();
  const emit = () => { for (const fn of subs) fn(state); };
  return {
    snapshot: () => state,
    dispatch: (cmd) => {
      const res = applyAction(state, cmd);
      if (!res.error) { state = res.state; emit(); }
      return res;
    },
    advance: (opts) => {
      const res = advanceUntil(state, opts);
      state = res.state;
      emit();
      return res;
    },
    load: (s) => { state = s; emit(); },
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
  };
}
