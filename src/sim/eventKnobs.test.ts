// F6 코어 — 이벤트 효과 크기·기간 손잡이(`<영역>.eventMagnitude`·`eventDuration`, MKT #566 제안 ②): applyEffects가 EventDef.domain으로 읽는다
import { afterEach, describe, expect, it } from 'vitest';
import { KNOBS } from './content/difficulty';
import { applyEffects } from './events';
import { newScenarioGame } from './newScenario';
import { mulberry32 } from './rng';
import type { GameState } from './types';
import type { Effect } from './content/events';

const IDS = ['macro.eventMagnitude', 'macro.eventDuration', 'taste.eventDuration'] as const;
const saved = Object.fromEntries(IDS.map((k) => [k, { ...KNOBS[k]! }]));
afterEach(() => { for (const k of IDS) Object.assign(KNOBS[k]!, saved[k]); });
const game = (difficulty: 'easy' | 'normal' | 'hard' = 'normal') => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 3, difficulty });
const EFFECTS: Effect[] = [{ type: 'modifier', key: 'demand:whisky', factor: 0.8, months: [6, 6] }, { type: 'flavorTrend', axis: 'peat', strength: 0.4, lo: 15, hi: 25, months: [10, 10], label: '피트' }];
const mods = (s: GameState) => s.world.modifiers.map((m) => ({ key: m.key, factor: m.factor, months: m.untilMonth - m.fromMonth }));

describe('F6 — 이벤트 효과 크기·기간 손잡이', () => {
  it('자리값(모두 1): 태그 있는 이벤트도 태그 없는 것과 같은 효과 — 어느 난이도든 modifier·유행 기간 그대로', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const a = game(d), b = game(d);
      applyEffects(a, EFFECTS, mulberry32(1), 't', undefined, null, 'macro');
      applyEffects(b, EFFECTS, mulberry32(1), 't');
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(mods(a)).toEqual([{ key: 'demand:whisky', factor: 0.8, months: 6 }]);
    }
  });
  it('표를 바꾸면: Hard 거시 → 배수 0.8이 0.6(거리 ×2) · 기간 6 → 12 · 태그 없는 이벤트·다른 영역은 그대로 · Easy는 거리 ×0.5', () => {
    Object.assign(KNOBS['macro.eventMagnitude']!, { easy: 0.5, hard: 2 });
    Object.assign(KNOBS['macro.eventDuration']!, { easy: 1, hard: 2 });
    const hard = game('hard'); applyEffects(hard, EFFECTS, mulberry32(1), 't', undefined, null, 'macro');
    expect(mods(hard)).toHaveLength(1); expect(mods(hard)[0]!.factor).toBeCloseTo(0.6, 12); expect(mods(hard)[0]!.months).toBe(12); // 1 + (0.8 − 1) × 2 — 부동소수 자리까지 같다고는 안 본다
    expect(hard.world.flavorTrend.shifts.at(-1)!.untilMonth - hard.world.flavorTrend.shifts.at(-1)!.fromMonth).toBe(20); // 유행 기간도 ×2
    const easy = game('easy'); applyEffects(easy, EFFECTS, mulberry32(1), 't', undefined, null, 'macro');
    expect(mods(easy)[0]!.factor).toBeCloseTo(0.9, 12);
    const none = game('hard'); applyEffects(none, EFFECTS, mulberry32(1), 't');
    expect(mods(none)).toEqual([{ key: 'demand:whisky', factor: 0.8, months: 6 }]);
    const taste = game('hard'); applyEffects(taste, EFFECTS, mulberry32(1), 't', undefined, null, 'taste');
    expect(mods(taste)).toEqual([{ key: 'demand:whisky', factor: 0.8, months: 6 }]); // 거시 손잡이는 취향 이벤트에 안 닿는다
  });
  it('기간 배수가 작아도 최소 1개월 · 난수 스트림은 그대로(기간 배수를 바꿔도 다음 난수가 같다)', () => {
    Object.assign(KNOBS['taste.eventDuration']!, { easy: 0.01, hard: 1 });
    const s = game('easy'); const rng = mulberry32(5);
    applyEffects(s, EFFECTS, rng, 't', undefined, null, 'taste');
    expect(mods(s)[0]!.months).toBe(1);
    const s2 = game('normal'); const rng2 = mulberry32(5);
    applyEffects(s2, EFFECTS, rng2, 't', undefined, null, 'taste');
    expect(rng.next()).toBe(rng2.next());
  });
});
