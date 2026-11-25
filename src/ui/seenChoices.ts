import { useEffect, useMemo, useState } from 'react';
import type { GameState } from '../sim';
import { useUi } from '../store/ui';
import { newChoices, type NewChoice } from './newChoices';

// [결정 #416] 맨 위 「새로 열림」 — 「본 적 있음」(닫기 · 가기를 누름)은 판(시드)별로 localStorage에 둔다(seenFacilities.ts와 같은 틀 · 세이브 밖이라 sim에 닿지 않는다).
// 저장이 막히면(사생활 창 등) 이번 화면 동안만 닫힌다
const KEY = 'distillery-tycoon/seen-choices';
const EVENT = 'distillery-tycoon:seen-choices';

const read = (seed: number): string[] => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { seed: number; keys: string[] } | null; return v && v.seed === seed && Array.isArray(v.keys) ? v.keys : []; } catch { return []; } };
let memo: { seed: number; keys: string[] } = { seed: -1, keys: [] };

/** 이 항목들을 본 것으로 적는다 */
export function markChoicesSeen(seed: number, keys: readonly string[]): void {
  const have = [...new Set([...read(seed), ...(memo.seed === seed ? memo.keys : [])])];
  const next = [...new Set([...have, ...keys])];
  memo = { seed, keys: next };
  try { localStorage.setItem(KEY, JSON.stringify({ seed, keys: next })); } catch { /* 저장 막힘 — memo만 */ }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** 아직 닫지 않은 새 선택(열린 달 최신 순) */
export function useNewChoices(s: GameState): NewChoice[] {
  const opsOn = useUi((u) => u.opsMode);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((n) => n + 1);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return useMemo(() => {
    const seen = new Set([...read(s.seed), ...(memo.seed === s.seed ? memo.keys : [])]);
    return newChoices(s, opsOn).filter((c) => !seen.has(c.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, opsOn, tick]);
}
