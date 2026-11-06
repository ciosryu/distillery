import { create } from 'zustand';
import { advanceMonths, applyAction, newGame, type Action, type GameState, type RegionId } from '../sim';
import { flushSave, loadGame, queueSave, saveNow } from './persist';
import { useUi } from './ui';

// 게임 상태 읽기 모델 (architecture §3.2). 권위 상태는 이 store 하나 — 도메인별 store로 나누지 않는다.
// 화면은 원시 상태 대신 selectors.ts의 셀렉터를 쓰는 것을 원칙으로 한다.

interface GameStore {
  state: GameState;
  dispatch: (a: Action) => boolean;
  advance: (months: number) => void;
  restart: (name?: string, region?: RegionId, site?: string) => void;
}

const toast = (kind: 'ok' | 'error', text: string) => useUi.getState().showToast(kind, text);
const persist = (s: GameState) => queueSave(s, (msg) => toast('error', msg));

if (typeof window !== 'undefined') window.addEventListener('beforeunload', flushSave);

export const useGame = create<GameStore>((set, get) => ({
  state: loadGame() ?? newGame(),
  dispatch: (a) => {
    const res = applyAction(get().state, a);
    if (res.error) {
      toast('error', res.error);
      return false;
    }
    persist(res.state);
    set({ state: res.state });
    if (res.message) toast('ok', res.message);
    return true;
  },
  advance: (months) => {
    const next = advanceMonths(get().state, months);
    persist(next);
    set({ state: next });
  },
  restart: (name, region, site) => {
    const s = newGame({ distilleryName: name || undefined, region, site: site || undefined });
    const res = saveNow(s);
    set({ state: s });
    toast(res.ok ? 'ok' : 'error', res.ok ? '새 게임을 시작했습니다' : res.error);
  },
}));
