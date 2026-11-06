import { create } from 'zustand';
import { advanceMonths, applyAction, newGame, normalizeState, type Action, type GameState, type RegionId } from '../sim';

const SAVE_KEY = 'distillery-tycoon/save-v5';

function load(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    // 입지 특성(결정 #84~) 이전 저장은 빠진 필드를 채워 읽는다
    return s && s.version === 5 ? normalizeState(s) : null;
  } catch {
    return null;
  }
}

function save(s: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* 저장 불가 환경(시크릿 모드 등) — 무시 */
  }
}

export interface Toast { id: number; kind: 'ok' | 'error'; text: string }

interface GameStore {
  state: GameState;
  toast: Toast | null;
  dispatch: (a: Action) => boolean;
  advance: (months: number) => void;
  restart: (name?: string, region?: RegionId, site?: string) => void;
  clearToast: () => void;
}

let toastId = 0;

export const useGame = create<GameStore>((set, get) => ({
  state: load() ?? newGame(),
  toast: null,
  dispatch: (a) => {
    const res = applyAction(get().state, a);
    if (res.error) {
      set({ toast: { id: ++toastId, kind: 'error', text: res.error } });
      return false;
    }
    save(res.state);
    set({ state: res.state, toast: res.message ? { id: ++toastId, kind: 'ok', text: res.message } : get().toast });
    return true;
  },
  advance: (months) => {
    const next = advanceMonths(get().state, months);
    save(next);
    set({ state: next });
  },
  restart: (name, region, site) => {
    const s = newGame({ distilleryName: name || undefined, region, site: site || undefined });
    save(s);
    set({ state: s, toast: { id: ++toastId, kind: 'ok', text: '새 게임을 시작했습니다' } });
  },
  clearToast: () => set({ toast: null }),
}));
