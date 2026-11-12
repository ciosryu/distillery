import { checkInvariants, migrateSave, type GameState } from '../sim';

// 세이브 저장소 (architecture §3.6). 지금은 localStorage, 웹 최종이 정해지면 IndexedDB 세이브 슬롯으로 바꾼다(단계 C).
// - 읽기: 현재 키 → 옛 키(v5) 순서로 찾아 마이그레이션 체인으로 올린다. 버리지 않는다
// - 쓰기: 디바운스(연속 행동을 한 번에), 실패는 결과로 돌려줘 화면에 알린다 (조용한 유실 방지, D1)

const SAVE_KEY = 'distillery-tycoon/save';
const LEGACY_KEYS = ['distillery-tycoon/save-v5'];
const DEBOUNCE_MS = 400;

export type SaveResult = { ok: true; chars: number } | { ok: false; error: string };

export function loadGame(): GameState | null {
  for (const key of [SAVE_KEY, ...LEGACY_KEYS]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const s = migrateSave(JSON.parse(raw));
      if (s) {
        // 불러올 때 불변식 검사 (INV-ARCH-1) — 수리(#285) 뒤에도 남은 위반은 콘솔에만 적는다. 판을 막을지는 [제안 P-ARCH-52]
        const { errors } = checkInvariants(s);
        if (errors.length) console.error(`[불변식] 불러온 세이브 ${s.month}개월: ${errors.join(' · ')}`);
        return s;
      }
    } catch {
      /* 손상된 세이브 — 다음 키를 본다 */
    }
  }
  return null;
}

export function saveNow(s: GameState): SaveResult {
  let json: string;
  try {
    json = JSON.stringify(s);
  } catch (e) {
    return { ok: false, error: `세이브 직렬화 실패: ${(e as Error).message}` };
  }
  try {
    localStorage.setItem(SAVE_KEY, json);
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
    return { ok: true, chars: json.length };
  } catch (e) {
    const quota = (e as DOMException)?.name === 'QuotaExceededError';
    return { ok: false, error: quota ? `저장 공간이 부족해 저장하지 못했습니다 (세이브 ${(json.length / 1e6).toFixed(1)}M자)` : '이 브라우저 환경에서는 저장할 수 없습니다 (시크릿 모드 등)' };
  }
}

let pending: GameState | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** 연속 행동을 모아 한 번 저장한다. 실패하면 onError로 알린다 */
export function queueSave(s: GameState, onError: (msg: string) => void): void {
  pending = s;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const snap = pending;
    pending = null;
    if (!snap) return;
    const res = saveNow(snap);
    if (!res.ok) onError(res.error);
  }, DEBOUNCE_MS);
}

/** 창을 닫기 전에 남은 저장을 바로 쓴다 */
export function flushSave(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (pending) saveNow(pending);
  pending = null;
}
