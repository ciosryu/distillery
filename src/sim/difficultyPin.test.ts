// 난이도 값 고정 (`[제안 P-MGT-59]` C안 — 결정 98 값과 같은 PR): 시작 때 값을 세이브에 박고, 값 이전 세이브는 1로 고정
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { knob, migrateSave, newScenarioGame, SAVE_VERSION, type GameState } from '.';
import { difficultyError, KNOBS, pinDifficultyValues, PRESET_LEVELS } from './content/difficulty';

const game = (difficulty: 'easy' | 'normal' | 'hard') => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 3, difficulty });

describe('난이도 값 고정 — 새 판', () => {
  it('어려움 판은 1이 아닌 Hard 값을 모두 저장 · 보통 판은 values를 두지 않는다(바이트 동일)', () => {
    const h = game('hard').difficulty!;
    const want = Object.fromEntries(Object.entries(KNOBS).filter(([, d]) => d.hard !== 1).map(([id, d]) => [id, d.hard]));
    expect(h.values).toEqual(want);
    expect(Object.keys(h.values!).length).toBeGreaterThan(0);
    expect('values' in game('normal').difficulty!).toBe(false);
  });
  it('저장된 값이 표보다 먼저 — 시작한 뒤 표가 바뀌어도 판의 값은 그대로', () => {
    const s = game('hard');
    const id = 'finance.loanRate';
    const before = knob(s, id);
    const saved = { ...KNOBS[id]! };
    try {
      KNOBS[id] = { ...saved, hard: 9 };
      expect(knob(s, id)).toBe(before);
      expect(knob({ difficulty: { preset: 'hard', levels: { ...PRESET_LEVELS.hard } } }, id)).toBe(9); // values 없는 메모리 판(실험)은 표를 읽는다
    } finally { KNOBS[id] = saved; }
  });
  it('적을 값이 없으면(모두 1) values를 두지 않는다 — 경쟁만 어려움인 사용자 설정', () => {
    expect('values' in pinDifficultyValues({ preset: 'custom', levels: { ...PRESET_LEVELS.normal, competition: 3 } })).toBe(false);
  });
});

describe('난이도 값 고정 — 불러오기', () => {
  it('값 이전 빌드의 Normal 아닌 세이브 → values {} (모두 1) · 멱등 · Normal 세이브는 그대로', () => {
    const old = structuredClone(game('easy')) as GameState;
    delete old.difficulty!.values;
    const m = migrateSave(old)!;
    expect(m.difficulty!.values).toEqual({});
    expect(knob(m, 'incidents.eventChance')).toBe(1);
    expect(migrateSave(m)!.difficulty).toEqual(m.difficulty);
    const n = game('normal');
    expect(migrateSave(n)).toBe(n); // 고칠 것이 없으면 같은 객체
    const h = game('hard');
    expect(migrateSave(h)!.difficulty).toEqual(h.difficulty); // 값 빌드의 판은 그대로
    expect(SAVE_VERSION).toBe(16); // 버전을 올리지 않는다(#187)
  });
  it('6차 판(easy, 값 이전 빌드) 세이브는 모두 1로 — 오너가 한 판 그대로 이어진다', () => {
    const file = JSON.parse(readFileSync('docs/playtest/6/distillery-mvp-standard-y14m3-202611190926.json', 'utf8'));
    const s = migrateSave(file.save)!;
    expect(s.difficulty).toMatchObject({ preset: 'easy', values: {} });
    for (const id of Object.keys(KNOBS)) expect(knob(s, id as never), id).toBe(1);
  });
  it('검사: values는 0 이상 유한수', () => {
    const base = { preset: 'hard' as const, levels: { ...PRESET_LEVELS.hard } };
    expect(difficultyError({ ...base, values: { 'finance.loanRate': 1.25 } })).toBeNull();
    expect(difficultyError({ ...base, values: { 'finance.loanRate': -1 } })).toMatch(/0 이상/);
    expect(difficultyError({ ...base, values: { 'finance.loanRate': Number.NaN } })).toMatch(/0 이상/);
  });
});
