// F6 코어 — 이벤트 효과 크기·기간 손잡이(`<영역>.eventMagnitude`·`eventDuration`, MKT #566 제안 ②): applyEffects가 EventDef.domain으로 읽는다
import { afterEach, describe, expect, it } from 'vitest';
import { KNOBS } from './content/difficulty';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyEffects } from './events';
import { EVENTS, TRIGGERED_EVENTS } from './content/events';
import { newScenarioGame } from './newScenario';
import { mulberry32 } from './rng';
import type { GameState } from './types';
import type { Effect } from './content/events';

const IDS = ['macro.eventMagnitude', 'macro.eventDuration', 'taste.eventDuration', 'incidents.eventMagnitude'] as const;
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
  it('배수 0(생산 중단)은 크기 손잡이가 건드리지 않는다 · 그 외는 0 하한 (PROD 확인 ①)', () => {
    Object.assign(KNOBS['incidents.eventMagnitude']!, { easy: 0.5, hard: 2 });
    Object.assign(KNOBS['macro.eventMagnitude']!, { easy: 1, hard: 6 });
    const s = game('hard');
    applyEffects(s, [{ type: 'modifier', key: 'production', factor: 0, months: [1, 1] }], mulberry32(1), '침수', undefined, null, 'incidents');
    expect(mods(s)).toEqual([{ key: 'production', factor: 0, months: 1 }]);
    const s2 = game('hard');
    applyEffects(s2, [{ type: 'modifier', key: 'demand:whisky', factor: 0.8, months: [3, 3] }], mulberry32(1), '불황', undefined, null, 'macro');
    expect(mods(s2)[0]!.factor).toBe(0); // 1 + (−0.2) × 6 = −0.2 → 0 하한
  });
  it('선택지 효과 경로(resolvePending)와 발생 경로(runEvents) 둘 다 def.domain을 넘긴다 — 소스 검사 (PROD 확인 ③)', () => {
    const src = readFileSync(join(__dirname, 'events.ts'), 'utf8');
    const calls = src.split('\n').filter((l) => /applyEffects\(/.test(l) && !/export function applyEffects/.test(l));
    expect(calls.length).toBeGreaterThanOrEqual(5);
    for (const l of calls) expect(/,\s*(def\.domain|domain)\)/.test(l), l.trim().slice(0, 100)).toBe(true);
  });
  it('방향 규칙(PROD 확인 ②): supply·incidents·finance·competition 태그 이벤트의 modifier는 모두 불리한 방향 — Hard가 호재를 키우지 않는다', () => {
    const COST = /^(ingredient:|energy$|packaging$|cask:)/, HARM_DOWN = /^(demand:|bulk$|dutyfree$|production$|awareness_gain$)/;
    const effectsOf = (e: (typeof EVENTS)[number]) => [...(e.effects ?? []), ...(e.choices ?? []).flatMap((c) => c.effects)];
    for (const e of [...EVENTS, ...TRIGGERED_EVENTS]) {
      if (!e.domain || e.domain === 'macro' || e.domain === 'taste') continue; // 거시·취향은 변동성(양방향)
      for (const x of effectsOf(e)) {
        if (x.type !== 'modifier') continue;
        const ok = COST.test(x.key) ? x.factor >= 1 : HARM_DOWN.test(x.key) ? x.factor <= 1 : false;
        expect(ok, `${e.id} ${x.key} ×${x.factor}`).toBe(true);
      }
    }
    expect(EVENTS.find((e) => e.id === 'rice_surplus')!.domain).toBeUndefined(); // 호재는 무태그
  });
});
