import { useGame } from './game';
import type { GameState } from '../sim';

// 도메인 셀렉터 (architecture §3.3). 화면은 원시 상태 모양 대신 이 함수들을 쓴다 — 상태 모양이 바뀌어도 화면 코드는 그대로.
// 지금은 틱·행동이 상태 전체를 복제하므로 슬라이스 참조가 매번 바뀐다. 구조적 공유(단계 D)를 넣으면
// 같은 셀렉터가 "바뀐 슬라이스만 리렌더"로 바로 이득을 본다.

export type SliceKey = 'world' | 'finance' | 'hr' | 'production' | 'inventory' | 'commerce' | 'b2b' | 'events' | 'research' | 'site' | 'history';

/** 슬라이스 하나만 구독한다 */
export function useSlice<K extends SliceKey>(key: K): GameState[K] {
  return useGame((g) => g.state[key]);
}

/** 헤더(시간·지역·상태) 값 하나 — 원시값이라 바뀔 때만 리렌더 */
export function useHeader<K extends 'month' | 'startYear' | 'regionId' | 'siteId' | 'distilleryName' | 'status'>(key: K): GameState[K] {
  return useGame((g) => g.state[key]);
}

export const useCash = () => useGame((g) => g.state.finance.cash);
export const usePendingEventCount = () => useGame((g) => g.state.events.pending.length);
