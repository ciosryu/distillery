import type { CashFlowKey, GameState } from './types';

// 행동 처리기의 공용 조각 (코어, 결정 #144) — actions.ts(입구)와 파트별 처리기(actions.prod·mkt·mgt.ts)가 함께 쓴다.
// 이 파일은 다른 행동 파일을 가져오지 않는다 → 입구와 처리기 사이에 가져오기 순환이 생기지 않는다

export interface ActionResult { state: GameState; error?: string; message?: string }

export const fail = (state: GameState, error: string): ActionResult => ({ state, error });

/** 처리기 표 — 행동 타입마다 처리기 하나. s = 고쳐도 되는 사본, prev = 원본(실패할 때 그대로 돌려준다) */
export type Handlers<A extends { type: string }> = { [K in A['type']]: (s: GameState, prev: GameState, a: Extract<A, { type: K }>) => ActionResult };

/** 행동별 현금 흐름 항목 — 턴 사이 입출금을 다음 결산 보고서에 싣기 위한 분류 (null = 현금이 움직이지 않는 행동) */
export type CashKeys<A extends { type: string }> = Record<A['type'], CashFlowKey | null>;
