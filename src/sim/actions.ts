import { isUnlocked, unlockingNodes } from './research';
import { isLocked, LOCKED_MESSAGE } from './scenario';
import { recordPendingCash, sumCashFlows } from './cashflow';
import type { CashFlowKey, GameState } from './types';
import { clone } from './util';
import { fail, type ActionResult, type Handlers } from './actionKit';
import { MGT_CASH_KEY, MGT_HANDLERS, type MgtAction } from './actions.mgt';
import { MKT_CASH_KEY, MKT_HANDLERS, type MktAction } from './actions.mkt';
import { PROD_CASH_KEY, PROD_HANDLERS, type ProdAction } from './actions.prod';

// 플레이어 행동의 입구 (코어, 결정 #144) — 행동 타입 합집합 · 공통 관문(게임 종료·테크 게이트·시나리오 잠금) · 현금 흐름 기록 · 처리기 표.
// 처리 규칙은 파트별 파일에 있다: actions.prod.ts(PROD) · actions.mkt.ts(MKT) · actions.mgt.ts(MGT)

export type Action = ProdAction | MktAction | MgtAction;
export type { ActionResult } from './actionKit';

/** 행동별 현금 흐름 항목 */
const ACTION_CASH_KEY: Record<Action['type'], CashFlowKey | null> = { ...PROD_CASH_KEY, ...MKT_CASH_KEY, ...MGT_CASH_KEY };

/** 처리기 표 — 빠진 행동이 있으면 타입 오류 */
const HANDLERS: Handlers<Action> = { ...PROD_HANDLERS, ...MKT_HANDLERS, ...MGT_HANDLERS };

/** 행동 적용. 행동으로 움직인 현금은 pendingCash에 기록돼 다음 결산 보고서(offTurn·netCash)에 합쳐진다 */
export function applyAction(prev: GameState, a: Action): ActionResult {
  const res = applyActionRaw(prev, a);
  if (res.error) return res;
  // 행동 안에서 따로 기록한 몫(예: 계약 해지 비용 중 선급금 반환)을 뺀 나머지를 행동 항목으로 기록.
  // 분류가 없는 행동이 현금을 움직여도 순현금에서 빠지지 않도록 '기타'로 기록
  const recorded = sumCashFlows(res.state.finance.pendingCash ?? {}) - sumCashFlows(prev.finance.pendingCash ?? {});
  const rest = res.state.finance.cash - prev.finance.cash - recorded;
  if (Math.abs(rest) > 1e-6) recordPendingCash(res.state, ACTION_CASH_KEY[a.type] ?? 'other', rest);
  return res;
}

function applyActionRaw(prev: GameState, a: Action): ActionResult {
  if (prev.status !== 'running') return fail(prev, '게임이 종료되었습니다');
  // 테크 게이트 (tech-tree §7) — Phase 1은 TECH_GATING = false라 항상 통과
  if (!isUnlocked(prev, `action:${a.type}`)) return fail(prev, `연구가 필요합니다: ${unlockingNodes(`action:${a.type}`).map((n) => `${n.id} ${n.nameKo}`).join(' 또는 ')}`);
  // 시나리오 잠금 (S-8) — 시나리오가 없으면 항상 통과
  if (isLocked(prev, `action:${a.type}`)) return fail(prev, LOCKED_MESSAGE);
  const s = clone(prev);
  return (HANDLERS[a.type] as (s: GameState, prev: GameState, a: Action) => ActionResult)(s, prev, a);
}
