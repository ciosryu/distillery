import { create } from 'zustand';
import { advanceMonths, applyAction, newGame, type Action, type GameState } from '../sim';

const SAVE_KEY = 'distillery-tycoon/save-v2';

function load(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    return s && s.version === 2 ? s : null;
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
  restart: (name?: string) => void;
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
  restart: (name) => {
    const s = newGame({ distilleryName: name || undefined });
    save(s);
    set({ state: s, toast: { id: ++toastId, kind: 'ok', text: '새 게임을 시작했습니다' } });
  },
  clearToast: () => set({ toast: null }),
}));
