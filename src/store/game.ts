import { create } from 'zustand';
import { createLocalEngine, DEFAULT_STOPS, newGame, newScenarioGame, type Action, type BusinessPlan, type GameState, type RegionId, type StopReason } from '../sim';
import { flushSave, loadGame, queueSave, saveNow } from './persist';
import { useUi } from './ui';

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
}

const saved = loadGame();
/** 세이브 없이 처음 연 화면이면 사업 계획서부터 보여 준다 */
export const startedFresh = !saved;
const engine = createLocalEngine(saved ?? newGame());
const toast = (kind: 'ok' | 'error', text: string) => useUi.getState().showToast(kind, text);
const persist = (s: GameState) => queueSave(s, (msg) => toast('error', msg));
let cancelRequested = false;
/**
 * "분기 진행"·"1년 진행"도 이 조건에서는 멈춘다 — 현금이 바닥난 줄 모르고 1년을 넘겨 손쓸 틈 없이 파산하지 않게
 * (플레이테스트 사전 점검에서 발견: 현금이 음수가 된 달에도 계속 진행했다). 이벤트·예보 같은 알림은 "다음 알림까지"의 몫
 */
const SAFETY_STOPS: StopReason[] = ['cashWarning', 'bankrupt', 'gameOver', 'verdict'];

if (typeof window !== 'undefined') window.addEventListener('beforeunload', flushSave);

export const useGame = create<GameStore>((set) => {
  engine.subscribe((s) => { persist(s); set({ state: s }); });
  return {
    state: engine.snapshot(),
    dispatch: (a) => {
      const res = engine.dispatch(a);
      if (res.error) { toast('error', res.error); return false; }
      if (res.message) toast('ok', res.message);
      return true;
    },
    advance: (months) => {
      const res = engine.advance({ months, stopOn: months > 1 ? SAFETY_STOPS : [] });
      if (res.stoppedBy !== 'maxMonths' && res.months < months) toast(res.stoppedBy === 'verdict' ? 'ok' : 'error', `${res.months}개월 진행 후 멈춤 — ${STOP_LABEL[res.stoppedBy]}`);
    },
    advanceUntil: async (maxMonths, stopOn = DEFAULT_STOPS) => {
      const ui = useUi.getState();
      if (ui.advancing) return;
      cancelRequested = false;
      ui.setAdvancing({ done: 0, total: maxMonths });
      let stopped: StopReason = 'maxMonths';
      for (let i = 0; i < maxMonths; i++) {
        if (cancelRequested) break;
        const res = engine.advance({ months: 1, stopOn });
        useUi.getState().setAdvancing({ done: i + 1, total: maxMonths });
        if (res.stoppedBy !== 'maxMonths') { stopped = res.stoppedBy; break; }
        await new Promise((r) => setTimeout(r, 0)); // 화면이 그려질 틈
      }
      useUi.getState().setAdvancing(null);
      if (stopped !== 'maxMonths') toast(stopped === 'bankrupt' || stopped === 'gameOver' || stopped === 'cashWarning' ? 'error' : 'ok', `자동 진행 멈춤 — ${STOP_LABEL[stopped]}`);
    },
    cancelAdvance: () => { cancelRequested = true; },
    restart: (name, region, site) => {
      const s = newGame({ distilleryName: name || undefined, region, site: site || undefined });
      engine.load(s);
      const res = saveNow(s);
      toast(res.ok ? 'ok' : 'error', res.ok ? '새 게임을 시작했습니다' : res.error);
    },
    startScenario: (plan) => {
      let s: GameState;
      try { s = newScenarioGame(plan); } catch (e) { toast('error', (e as Error).message); return; }
      engine.load(s);
      useUi.getState().setTab(''); // 새 판은 첫 탭(증류소 화면)부터
      const res = saveNow(s);
      toast(res.ok ? 'ok' : 'error', res.ok ? '사업을 시작했습니다' : res.error);
    },
  };
});
