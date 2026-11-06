import { afterEach, describe, expect, it } from 'vitest';
import { advanceMonths, newGame, type GameState } from '.';
import { EVENTS, type EventDef } from './content/events';

// 이벤트 난수 — 이벤트별 스트림 (skeleton S-5, #147)
// 옛 방식은 매달 목록 전체를 한 스트림으로 섞어 판정해서, 이벤트를 하나만 더해도 모든 시드의 결과가 바뀌었다

const play = (seed: number, months = 60): GameState => advanceMonths(newGame({ seed, region: 'KR' }), months);
const fingerprint = (s: GameState) => ({ cash: s.finance.cash, log: s.events.log.map((e) => `${e.month}:${e.title}`), forecasts: s.events.forecasts.map((f) => f.defId) });
const extra = (over: Partial<EventDef>): EventDef => ({ id: 'test_extra', title: '테스트 이벤트', category: 'market', text: '테스트', chance: 0, cooldown: 12, effects: [], ...over });

afterEach(() => {
  const i = EVENTS.findIndex((e) => e.id === 'test_extra');
  if (i >= 0) EVENTS.splice(i, 1);
});

describe('이벤트별 난수 스트림 (S-5)', () => {
  it('발생하지 않는 이벤트를 목록 맨 앞에 더해도 다른 이벤트 결과는 그대로다', () => {
    const before = [3, 8, 13].map((seed) => fingerprint(play(seed)));
    EVENTS.unshift(extra({ chance: 0 }));
    expect([3, 8, 13].map((seed) => fingerprint(play(seed)))).toEqual(before);
  });

  it('굴리기는 하지만 조건이 안 맞는 이벤트(다른 지역 전용)를 더해도 그대로다', () => {
    const before = [3, 8].map((seed) => fingerprint(play(seed)));
    EVENTS.push(extra({ chance: 1, regions: ['JP'] }));
    expect([3, 8].map((seed) => fingerprint(play(seed)))).toEqual(before);
  });

  it('같은 시드는 같은 결과(결정론), 이벤트는 실제로 일어난다', () => {
    const a = fingerprint(play(5));
    expect(fingerprint(play(5))).toEqual(a);
    expect(a.log.length).toBeGreaterThan(0);
  });
});
