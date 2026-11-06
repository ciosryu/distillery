import { create } from 'zustand';

// 비영속 UI 상태 (architecture §3.3) — 세이브에 들어가지 않는다. 게임 상태(useGame)와 섞지 않는다.

export interface Toast { id: number; kind: 'ok' | 'error'; text: string }

/** 픽셀 뷰·표에서 고른 대상 (캐스크·설비·직원 등) */
export type Selection = { kind: 'cask' | 'equipment' | 'staff' | 'product' | 'warehouse'; id: string } | null;

const TAB_KEY = 'distillery-tycoon/tab';

function readTab(): string {
  try {
    return localStorage.getItem(TAB_KEY) ?? 'dashboard';
  } catch {
    return 'dashboard';
  }
}

interface UiStore {
  tab: string;
  setTab: (tab: string) => void;
  toast: Toast | null;
  showToast: (kind: Toast['kind'], text: string) => void;
  clearToast: () => void;
  selection: Selection;
  select: (sel: Selection) => void;
}

let toastId = 0;

export const useUi = create<UiStore>((set) => ({
  tab: readTab(),
  setTab: (tab) => {
    try { localStorage.setItem(TAB_KEY, tab); } catch { /* 무시 */ }
    set({ tab });
  },
  toast: null,
  showToast: (kind, text) => set({ toast: { id: ++toastId, kind, text } }),
  clearToast: () => set({ toast: null }),
  selection: null,
  select: (selection) => set({ selection }),
}));
