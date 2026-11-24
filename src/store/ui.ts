import { create } from 'zustand';

// 비영속 UI 상태 (architecture §3.3) — 세이브에 들어가지 않는다. 게임 상태(useGame)와 섞지 않는다.

export interface Toast { id: number; kind: 'ok' | 'error'; text: string }

/** 픽셀 뷰·표에서 고른 대상 (캐스크·설비·직원 등) */
export type Selection = { kind: 'cask' | 'equipment' | 'staff' | 'product' | 'warehouse'; id: string } | null;

const TAB_KEY = 'distillery-tycoon/tab';
/** [#388 ① A1] 종반 운영 모드 — 화면 설정(세이브 밖 · sim에 닿지 않는다) */
const OPS_KEY = 'distillery-tycoon/ops-mode';
const readOps = (): boolean => { try { return localStorage.getItem(OPS_KEY) === '1'; } catch { return false; } };

/** 저장된 탭이 없으면 '' — App이 그 판의 첫 탭(시나리오 = 증류소 화면, 샌드박스 = 대시보드)을 연다 */
function readTab(): string {
  try {
    return localStorage.getItem(TAB_KEY) ?? '';
  } catch {
    return '';
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
  /** 자동 진행 중이면 진행도 */
  advancing: { done: number; total: number } | null;
  setAdvancing: (p: { done: number; total: number } | null) => void;
  /** [#388 ① A1] 종반 운영 모드 — 켜면 기본 진행이 「분기 진행」이고, 여러 달 진행이 결정이 필요한 것(OPS_STOPS)에서 멈춘다 */
  opsMode: boolean;
  setOpsMode: (on: boolean) => void;
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
  advancing: null,
  setAdvancing: (advancing) => set({ advancing }),
  opsMode: readOps(),
  setOpsMode: (opsMode) => {
    try { localStorage.setItem(OPS_KEY, opsMode ? '1' : '0'); } catch { /* 무시 */ }
    set({ opsMode });
  },
}));
