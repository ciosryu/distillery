import { checkInvariants, inventoryCollateral, inventoryLtv, migrateSaveReport, usesObservedValuation, type GameState } from '../sim';
import { LOAN_OFFERS } from '../sim/content/catalog';

// 세이브 저장소 (architecture §3.6). 지금은 localStorage, 웹 최종이 정해지면 IndexedDB 세이브 슬롯으로 바꾼다(단계 C).
// - 읽기: 현재 키 → 옛 키(v5) 순서로 찾아 마이그레이션 체인으로 올린다. 버리지 않는다
// - 쓰기: 디바운스(연속 행동을 한 번에), 실패는 결과로 돌려줘 화면에 알린다 (조용한 유실 방지, D1)

const SAVE_KEY = 'distillery-tycoon/save';
const LEGACY_KEYS = ['distillery-tycoon/save-v5'];
const DEBOUNCE_MS = 400;

export type SaveResult = { ok: true; chars: number } | { ok: false; error: string };

/** 수리 전 원본 한 칸 ([결정 #295]) — 수리가 무엇이든 고쳤거나 불변식 오류가 남으면 불러온 JSON 그대로 둔다(다음 수리 때 덮어씀) */
export const PREREPAIR_KEY = 'distillery-tycoon/save-prerepair';

/** 불러올 때 생긴 일 — 화면(App)이 고정 알림으로 보인다. 오류가 남아도 판은 막지 않는다(#295: 거부 대신 명확한 오류 + 원본 보존) */
export interface LoadIssue { fixes: string[]; errors: string[]; preserved: boolean }
export let loadIssue: LoadIssue | null = null;

export function loadGame(): GameState | null {
  for (const key of [SAVE_KEY, ...LEGACY_KEYS]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const r = migrateSaveReport(JSON.parse(raw));
      if (!r) continue;
      // 불러올 때 불변식 검사 (INV-ARCH-1) — 수리(#285·#295) 뒤에도 남은 위반은 화면에 알린다
      const { errors } = checkInvariants(r.state);
      // F5b 이행 안내(MGT 발견): 새 평가(관측 품질 q̂) 전에 참 품질로 받은 재고 담보대출은 한도가 내려가 다음 월말 추가 상환 요구가 날 수 있다 — 고치지 않고 알리기만
      const fixes = [...r.fixes, ...collateralNotice(r.state)];
      if (fixes.length || errors.length) {
        let preserved = false;
        try { localStorage.setItem(PREREPAIR_KEY, raw); preserved = true; } catch { /* 저장 공간 부족 — 알림에 적는다 */ }
        loadIssue = { fixes, errors, preserved };
        if (errors.length) console.error(`[불변식] 불러온 세이브 ${r.state.month}개월: ${errors.join(' · ')}`);
      }
      return r.state;
    } catch {
      /* 손상된 세이브 — 다음 키를 본다 */
    }
  }
  return null;
}

/** v16 판에서 재고 담보대출 잔액이 관측 기반 한도의 110%를 넘으면 한 줄 — 다음 월말 `inventoryMarginCall`이 추가 상환을 요구한다(F5b #310 2단계 이행, MGT 발견 2026-11-14) */
export function collateralNotice(s: GameState): string[] {
  if (!usesObservedValuation(s)) return [];
  const inv = new Set(LOAN_OFFERS.filter((o) => o.collateral === 'inventory').map((o) => o.id));
  const balance = s.finance.loans.filter((l) => inv.has(l.offerId)).reduce((t, l) => t + l.balance, 0);
  if (!(balance > 0)) return [];
  const limit = inventoryCollateral(s) * inventoryLtv(s);
  return balance > limit * 1.1 ? [`재고 담보대출 잔액 ${Math.round(balance).toLocaleString()}원이 관측 기반 담보 한도 ${Math.round(limit).toLocaleString()}원의 110%를 넘는다 — 평가 방식이 바뀌어(샘플 기록이 없는 통은 보수적 사전값) 다음 월말 추가 상환 요구가 날 수 있다. 통을 샘플링하면 한도가 바뀐다`] : [];
}

/** 보존한 수리 전 원본(JSON 문자열) — 없으면 null */
export function preRepairSave(): string | null {
  try { return localStorage.getItem(PREREPAIR_KEY); } catch { return null; }
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
