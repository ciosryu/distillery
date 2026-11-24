import { useEffect, useMemo, useState } from 'react';
import type { GameState } from '../sim';
import { newFacilities } from './alerts';

// [#388 ① A3] 새로 열린 시설 — 「본 적 있음」은 판(시드)별로 localStorage에 둔다(#373 briefTodos와 같은 틀 · 세이브 밖이라 sim에 닿지 않는다).
// 설비 목록(홈 접힘 묶음 안 `#mvp-equipment`)이 화면에 보이면 본 것으로 친다. 사면 `newFacilities`에서 저절로 빠진다
const KEY = 'distillery-tycoon/seen-facilities';
const EVENT = 'distillery-tycoon:seen-facilities';

const read = (seed: number): string[] => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { seed: number; ids: string[] } | null; return v && v.seed === seed && Array.isArray(v.ids) ? v.ids : []; } catch { return []; } };

/** 이 시설들을 본 것으로 적는다 — 다른 화면(상단 메뉴 점)도 같은 신호로 다시 읽는다 */
export function markFacilitiesSeen(seed: number, ids: readonly string[]): void {
  const have = read(seed);
  const next = [...new Set([...have, ...ids])];
  if (next.length === have.length) return;
  try { localStorage.setItem(KEY, JSON.stringify({ seed, ids: next })); } catch { /* 저장 막힘 — 이번 화면에서만 */ }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** 아직 사지도 보지도 않은 새 시설 */
export function useUnseenFacilities(s: GameState): ReturnType<typeof newFacilities> {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((n) => n + 1);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return useMemo(() => {
    const seen = new Set(read(s.seed));
    return newFacilities(s).filter((f) => !seen.has(f.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, tick]);
}
