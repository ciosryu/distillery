import { create } from 'zustand';
import { createLocalEngine, DEFAULT_STOPS, newGame, newScenarioGame, type Action, type BusinessPlan, type GameState, type RegionId, type StopReason } from '../sim';
import { flushSave, loadGame, queueSave, saveNow } from './persist';
import { useUi } from './ui';
import { parsePlayFile, recordAction, recordBuild, recordTurns, recordUndo, replacePlaylog, resetPlaylog } from './playlog';
import { BUILD_ID } from '../build';

// 게임 상태 읽기 모델 (architecture §3.2). 권위 상태는 엔진(GameEngine) 하나 — 도메인별 store로 나누지 않는다.
// store는 엔진 스냅샷을 비추고 명령을 넘길 뿐이다. 화면은 원시 상태 대신 selectors.ts의 셀렉터를 쓰는 것을 원칙으로 한다.

const STOP_LABEL: Record<StopReason, string> = {
  pendingEvent: '선택이 필요한 이벤트',
  cashWarning: '현금 부족 경고',
  bankrupt: '파산',
  gameOver: '게임 종료',
  verdict: '15년 목표 판정 — 결과 화면',
  equipmentReady: '설비 가동 시작',
  forecast: '새 예보',
  commission: '새 블렌딩 의뢰',
  maxMonths: '',
};

interface GameStore {
  state: GameState;
  dispatch: (a: Action) => boolean;
  /** n개월 진행. 여러 달(분기·1년)이면 현금 부족·파산·게임 종료·목표 판정에서 멈춘다 */
  advance: (months: number) => void;
  /** 멈춤 조건이 생길 때까지 최대 n개월 — 한 달마다 화면에 제어권을 돌려준다 (PRD §2.1) */
  advanceUntil: (maxMonths: number, stopOn?: StopReason[]) => Promise<void>;
  cancelAdvance: () => void;
  restart: (name?: string, region?: RegionId, site?: string) => void;
  /** 사업 계획서로 시나리오 새 게임 (S-8) */
  startScenario: (plan: BusinessPlan) => void;
  /** 기록 파일(세이브 + 플레이 기록) 또는 세이브 JSON을 불러온다 — 플레이테스트 피드백 재현용 (mvp.md §7.2) */
  /** 기록 파일(또는 세이브 JSON)을 불러온다 — 성공하면 true (화면이 사업 계획서 같은 열린 창을 닫는 데 쓴다) */
  loadFile: (text: string) => boolean;
  /**
   * 직전 진행(1개월·분기·1년·다음 알림까지) 전으로 한 번 되돌린다 (3차 MVP 플레이테스트 오너 요청: 실수로 분기 진행을 누를 때가 있다).
   * 진행 뒤에 한 행동도 함께 사라진다. 한 단계만 — 되돌린 뒤 다시 진행해야 또 쓸 수 있다. 시드가 같으니 같은 행동이면 같은 결과다(운을 다시 뽑지 못한다)
   */
  undo: () => void;
  /** 되돌릴 수 있는 진행 — 되돌아갈 달과 진행한 개월 수. 없으면 null */
  undoInfo: { month: number; months: number } | null;
}

const saved = loadGame();
/** 세이브 없이 처음 연 화면이면 사업 계획서부터 보여 준다 */
export const startedFresh = !saved;
const engine = createLocalEngine(saved ?? newGame());
const toast = (kind: 'ok' | 'error', text: string) => useUi.getState().showToast(kind, text);
const persist = (s: GameState) => queueSave(s, (msg) => toast('error', msg));
let cancelRequested = false;
/** 직전 진행 전 상태 (메모리에만 — 새로 고치면 사라진다) */
let undoState: GameState | null = null;
/**
 * "분기 진행"·"1년 진행"도 이 조건에서는 멈춘다 — 현금이 바닥난 줄 모르고 1년을 넘겨 손쓸 틈 없이 파산하지 않게
 * (플레이테스트 사전 점검에서 발견: 현금이 음수가 된 달에도 계속 진행했다). 이벤트·예보 같은 알림은 "다음 알림까지"의 몫
 */
const SAFETY_STOPS: StopReason[] = ['cashWarning', 'bankrupt', 'gameOver', 'verdict'];

if (typeof window !== 'undefined') window.addEventListener('beforeunload', flushSave);

export const useGame = create<GameStore>((set) => {
  // 플레이 기록 (playlog.ts): 달이 넘어가면 그때까지의 플레이 시간을 남긴다. 새 판·불러오기로 달이 줄면 기준만 옮긴다
  let lastMonth = engine.snapshot().month;
  engine.subscribe((s) => {
    if (s.month > lastMonth) recordTurns(lastMonth, s.month);
    lastMonth = s.month;
    persist(s);
    set({ state: s });
  });
  return {
    state: engine.snapshot(),
    dispatch: (a) => {
      const res = engine.dispatch(a);
      if (res.error) { toast('error', res.error); return false; }
      if (res.message) toast('ok', res.message);
      recordAction();
      return true;
    },
    advance: (months) => {
      const before = engine.snapshot() as GameState;
      const res = engine.advance({ months, stopOn: months > 1 ? SAFETY_STOPS : [] });
      if (res.months > 0) { undoState = before; set({ undoInfo: { month: before.month, months: res.months } }); }
      if (res.stoppedBy !== 'maxMonths' && res.months < months) toast(res.stoppedBy === 'verdict' ? 'ok' : 'error', `${res.months}개월 진행 후 멈춤 — ${STOP_LABEL[res.stoppedBy]}`);
    },
    advanceUntil: async (maxMonths, stopOn = DEFAULT_STOPS) => {
      const ui = useUi.getState();
      if (ui.advancing) return;
      cancelRequested = false;
      ui.setAdvancing({ done: 0, total: maxMonths });
      const before = engine.snapshot() as GameState;
      let stopped: StopReason = 'maxMonths';
      for (let i = 0; i < maxMonths; i++) {
        if (cancelRequested) break;
        const res = engine.advance({ months: 1, stopOn });
        useUi.getState().setAdvancing({ done: i + 1, total: maxMonths });
        if (res.stoppedBy !== 'maxMonths') { stopped = res.stoppedBy; break; }
        await new Promise((r) => setTimeout(r, 0)); // 화면이 그려질 틈
      }
      useUi.getState().setAdvancing(null);
      const moved = engine.snapshot().month - before.month;
      if (moved > 0) { undoState = before; set({ undoInfo: { month: before.month, months: moved } }); }
      if (stopped !== 'maxMonths') toast(stopped === 'bankrupt' || stopped === 'gameOver' || stopped === 'cashWarning' ? 'error' : 'ok', `자동 진행 멈춤 — ${STOP_LABEL[stopped]}`);
    },
    cancelAdvance: () => { cancelRequested = true; },
    undoInfo: null,
    undo: () => {
      if (!undoState || useUi.getState().advancing) return;
      const back = undoState;
      undoState = null;
      recordUndo(back.month);
      lastMonth = back.month; // 되돌린 달을 새 진행으로 기록하지 않는다
      set({ undoInfo: null });
      engine.load(back);
      toast('ok', '직전 진행 전으로 되돌렸습니다');
    },
    restart: (name, region, site) => {
      const s = newGame({ distilleryName: name || undefined, region, site: site || undefined });
      undoState = null; set({ undoInfo: null });
      resetPlaylog();
      engine.load(s);
      const res = saveNow(s);
      toast(res.ok ? 'ok' : 'error', res.ok ? '새 게임을 시작했습니다' : res.error);
    },
    startScenario: (plan) => {
      let s: GameState;
      try { s = newScenarioGame(plan); } catch (e) { toast('error', (e as Error).message); return; }
      if (s.scenario) s.scenario.startBuild = BUILD_ID; // 판을 시작한 빌드 (#241) — 머리글이 지금 빌드와 비교한다
      undoState = null; set({ undoInfo: null });
      resetPlaylog();
      engine.load(s);
      useUi.getState().setTab(''); // 새 판은 첫 탭(증류소 화면)부터
      const res = saveNow(s);
      toast(res.ok ? 'ok' : 'error', res.ok ? '사업을 시작했습니다' : res.error);
    },
    loadFile: (text) => {
      const r = parsePlayFile(text);
      if ('error' in r) { toast('error', r.error); return false; }
      replacePlaylog(r.playlog);
      recordBuild(r.save.month); // 불러온 판을 이 빌드로 이어 한다 — 바뀐 달을 남긴다(#227·#241)
      undoState = null; set({ undoInfo: null });
      lastMonth = r.save.month; // 불러온 달까지를 새 진행으로 기록하지 않는다
      engine.load(r.save);
      const res = saveNow(r.save);
      toast(res.ok ? 'ok' : 'error', res.ok ? `불러왔습니다 — ${r.save.distilleryName}${r.playlog ? ' (플레이 기록 포함)' : ''}` : res.error);
      return true;
    },
  };
});
