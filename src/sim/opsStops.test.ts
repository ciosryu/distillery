import { describe, expect, it } from 'vitest';
import { DEFAULT_STOPS, OPS_STOPS, newScenarioGame, stopReasonOf } from './index';
import type { GameState } from './types';

// [#388 ① A1] 운영 모드 여러 달 진행 — 결정이 필요한 것(IB 입찰 · 목표 달성 · 선택 이벤트 · 의뢰)에서 멈춘다. 상태는 읽기만 한다
const base = (): GameState => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 5, rules: 'v16' });
const clone = (s: GameState): GameState => structuredClone(s);

describe('#388 ① A1 OPS_STOPS', () => {
  it('새 IB 입찰 제안에서 멈춘다 — 기본 멈춤(DEFAULT_STOPS · 다음 알림까지)에는 없다', () => {
    const prev = base();
    const next = clone(prev);
    next.b2b.caskBids.push({ id: 'B1', caskId: 'K1', expiresMonth: 3 } as never);
    expect(stopReasonOf(prev, next, OPS_STOPS)).toBe('caskBid');
    expect(stopReasonOf(prev, next, DEFAULT_STOPS)).toBeNull();
  });
  it('중반 · 후반 목표 달성에서 멈춘다(놓침은 아님)', () => {
    const prev = base();
    const done = clone(prev);
    done.progress.midGoals = [{ id: 'aged3_sold', month: 0, result: 'done' }];
    expect(stopReasonOf(prev, done, OPS_STOPS)).toBe('goalDone');
    const late = clone(prev);
    late.progress.lateGoals = [{ id: 'lounge_3', month: 0, result: 'done' }];
    expect(stopReasonOf(prev, late, OPS_STOPS)).toBe('goalDone');
    const missed = clone(prev);
    missed.progress.lateGoals = [{ id: 'lounge_3', month: 0, result: 'missed' }];
    expect(stopReasonOf(prev, missed, OPS_STOPS)).toBeNull();
  });
  it('선택 이벤트에서 멈춘다(지금 분기 진행 SAFETY_STOPS는 지나친다)', () => {
    const prev = base();
    const next = clone(prev);
    next.events.pending.push({ id: 'EV1' } as never);
    expect(stopReasonOf(prev, next, OPS_STOPS)).toBe('pendingEvent');
  });
});
