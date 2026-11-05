import { create } from 'zustand';
import { advanceMonths, applyAction, migrateState, newGame, type Action, type GameState, type SiteId } from '../sim';

const SAVE_KEY = 'distillery-tycoon/save-v5';
/** 이전 형식 세이브 — 읽을 때 v5로 마이그레이션 (국가 → 표준 산지) */
const LEGACY_KEYS = ['distillery-tycoon/save-v4'];

function load(): GameState | null {
  try {
    for (const key of [SAVE_KEY, ...LEGACY_KEYS]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const s = migrateState(JSON.parse(raw));
      if (s) return s;
    }
    return null;
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
  restart: (name?: string, site?: SiteId) => void;
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
  restart: (name, site) => {
    const s = newGame({ distilleryName: name || undefined, site });
    save(s);
    set({ state: s, toast: { id: ++toastId, kind: 'ok', text: '새 게임을 시작했습니다' } });
  },
  clearToast: () => set({ toast: null }),
}));
