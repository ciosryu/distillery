import { migrateSave, type GameState } from '../sim';

// 플레이 기록 (플레이테스트용, mvp.md §7.2) — 사람이 한 판을 하는 데 실제로 든 시간을 잰다(mvp.md §7: 첫 24턴 ≤ 90분).
// GameState 밖에 둔다 — 세이브 스키마는 그대로이고 시뮬레이션은 이 값을 모른다.
// 시간은 "화면이 보이고 최근 2분 안에 입력이 있었던" 동안만 센다(창을 켜 두고 자리를 비운 시간은 빼려고).
// 기록 내보내기 = 세이브 + 이 기록을 한 파일로 — 피드백을 받은 세션이 그 판을 그대로 불러와 재현한다

export interface PlayTurn {
  /** 이 달로 넘어왔다 (진행 후 state.month) */
  month: number;
  /** 그때까지 누적 플레이 시간(ms) */
  activeMs: number;
  /** 그때까지 누적 행동 수(성공한 dispatch) */
  actions: number;
}

export interface Playlog {
  v: 1;
  startedAt: number;
  activeMs: number;
  actions: number;
  turns: PlayTurn[];
}

/** 기록 내보내기 파일 */
export interface PlayFile {
  kind: 'distillery-playtest';
  v: 1;
  exportedAt: string;
  playlog: Playlog | null;
  save: GameState;
}

const KEY = 'distillery-tycoon/playlog';
/** 마지막 입력 뒤 이만큼 지나면 자리를 비운 것으로 본다 */
export const IDLE_MS = 120_000;
const TICK_MS = 5_000;

export const freshPlaylog = (now = Date.now()): Playlog => ({ v: 1, startedAt: now, activeMs: 0, actions: 0, turns: [] });

/** 진행으로 넘어온 달들을 기록한다 (순수 함수). 여러 달을 한 번에 넘기면 같은 시간·행동 수로 한 달씩 남긴다 */
export function withTurns(log: Playlog, fromMonth: number, toMonth: number): Playlog {
  if (toMonth <= fromMonth) return log;
  const add: PlayTurn[] = [];
  for (let m = fromMonth + 1; m <= toMonth; m++) add.push({ month: m, activeMs: log.activeMs, actions: log.actions });
  return { ...log, turns: [...log.turns, ...add] };
}

/** 이 달에 처음 닿았을 때의 누적 플레이 시간(ms). 아직 못 닿았으면 null */
export const activeMsAt = (log: Playlog, month: number): number | null => log.turns.find((t) => t.month >= month)?.activeMs ?? null;

function load(): Playlog | null {
  try {
    const raw = localStorage.getItem(KEY);
    const l = raw ? (JSON.parse(raw) as Playlog) : null;
    return l?.v === 1 ? l : null;
  } catch {
    return null;
  }
}
function store(): void {
  try { localStorage.setItem(KEY, JSON.stringify(log)); } catch { /* 기록은 부가 정보 — 실패해도 게임은 그대로 */ }
}

let log: Playlog = (typeof localStorage !== 'undefined' && load()) || freshPlaylog();
let lastInput = Date.now();
let clock: ReturnType<typeof setInterval> | null = null;

export const getPlaylog = (): Playlog => log;
export function resetPlaylog(): void { log = freshPlaylog(); store(); }
export function replacePlaylog(l: Playlog | null): void { log = l?.v === 1 ? l : freshPlaylog(); store(); }
export function recordAction(): void { log = { ...log, actions: log.actions + 1 }; store(); }
export function recordTurns(fromMonth: number, toMonth: number): void { log = withTurns(log, fromMonth, toMonth); store(); }

/** 브라우저에서 한 번 부른다 — 입력을 보고, 화면이 보이며 최근에 입력이 있었던 동안만 시간을 더한다 */
export function startPlayClock(): void {
  if (clock || typeof window === 'undefined') return;
  const touch = () => { lastInput = Date.now(); };
  for (const ev of ['pointerdown', 'keydown', 'wheel'] as const) window.addEventListener(ev, touch, { passive: true });
  clock = setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastInput < IDLE_MS) { log = { ...log, activeMs: log.activeMs + TICK_MS }; store(); }
  }, TICK_MS);
}

/** 세이브 + 플레이 기록을 파일로 내려받는다 */
export function exportPlayFile(s: GameState): void {
  const file: PlayFile = { kind: 'distillery-playtest', v: 1, exportedAt: new Date().toISOString(), playlog: log, save: s };
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  // 파일 이름에 모드를 넣는다 (mvp / sandbox) — 첫 플레이테스트가 샌드박스였던 것을 파일만 보고도 알 수 있게 (할 일 ⓪)
  const mode = s.scenario ? `mvp-${s.scenario.tierId}` : 'sandbox';
  // 파일 이름은 ASCII만 — 한글이 섞이면 이름을 버리고 "download"로 받는 환경이 있다
  a.download = `distillery-${mode}-y${Math.floor(s.month / 12) + 1}m${(s.month % 12) + 1}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.json`;
  document.body.appendChild(a); // 문서에 붙여야 download 이름이 지켜지는 브라우저가 있다
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** 내보낸 파일(또는 세이브 JSON만)을 읽는다 — 옛 세이브는 마이그레이션 체인으로 올린다 */
export function parsePlayFile(text: string): { save: GameState; playlog: Playlog | null } | { error: string } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { error: 'JSON 파일이 아닙니다' }; }
  const wrapped = (data as Partial<PlayFile>)?.kind === 'distillery-playtest';
  const save = migrateSave(wrapped ? (data as PlayFile).save : data);
  if (!save) return { error: '이 게임의 세이브가 아니거나 읽을 수 없는 버전입니다' };
  const pl = wrapped ? (data as PlayFile).playlog : null;
  return { save, playlog: pl?.v === 1 ? pl : null };
}
