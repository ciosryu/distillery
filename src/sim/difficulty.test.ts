// F6a — 난이도 그릇·읽기·영역 배수 (architecture §10.10 [제안 P-ARCH-58], [결정 #313·#314], REQ-CORE-6)
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { advanceMonths, checkInvariants, newGame, type GameState } from './index';
import { DIFFICULTY_DOMAINS, DIFFICULTY_NORMAL, KNOBS, PRESET_LEVELS, difficultyError, normalizeDifficulty, presetOf } from './content/difficulty';
import { newScenarioGame } from './newScenario';
import { difficultyOf, domainEventMul, knob, levelOf } from './rules';
import type { DifficultyDomain, DifficultyLevel } from './types';

const v16 = (over: Record<string, unknown> = {}) => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 11, ...over });
const strip = (s: GameState) => JSON.stringify({ ...s, difficulty: undefined });

describe('F6a — 난이도 스냅샷은 v16 새 판에만, 없으면 Normal', () => {
  it('v16 새 판 = Normal 스냅샷 · 옛 판(legacy-v15)·샌드박스(newGame)는 필드 없음 · 읽기는 모두 Normal(2 · ×1)', () => {
    expect(v16().difficulty).toEqual(DIFFICULTY_NORMAL);
    const legacy = v16({ rules: 'legacy-v15' });
    expect(legacy.difficulty).toBeUndefined();
    expect(newGame({ seed: 1 }).difficulty).toBeUndefined();
    for (const s of [legacy, newGame({ seed: 1 })]) {
      expect(difficultyOf(s)).toEqual(DIFFICULTY_NORMAL);
      for (const d of DIFFICULTY_DOMAINS) expect(levelOf(s, d)).toBe(2);
      for (const id of Object.keys(KNOBS)) expect(knob(s, id as never)).toBe(1);
    }
  });

  it('프리셋 이름·설정·모르는 값 정규화 — 한 항목만 바꾸면 Custom · Custom 전부 Normal이어도 표시는 Custom · 범위 밖 단계는 Normal', () => {
    expect(normalizeDifficulty('hard')).toEqual({ preset: 'hard', levels: PRESET_LEVELS.hard });
    expect(normalizeDifficulty('custom')).toEqual({ preset: 'custom', levels: PRESET_LEVELS.normal });
    expect(normalizeDifficulty(undefined)).toEqual(DIFFICULTY_NORMAL);
    expect(normalizeDifficulty({ preset: 'easy', levels: { ...PRESET_LEVELS.easy, finance: 3 } }).preset).toBe('custom'); // 표시가 틀려도 값에서 다시 계산
    expect(normalizeDifficulty({ preset: 'custom', levels: PRESET_LEVELS.normal })).toEqual({ preset: 'custom', levels: PRESET_LEVELS.normal });
    expect(normalizeDifficulty({ preset: 'normal', levels: { ...PRESET_LEVELS.normal, macro: 9 as never } })).toEqual(DIFFICULTY_NORMAL);
  });

  it('729 조합 — 직렬화 왕복 동일 · presetOf는 세 프리셋만 이름, 나머지 custom · 불변식 통과', () => {
    let named = 0;
    for (let n = 0; n < 729; n++) {
      const levels = Object.fromEntries(DIFFICULTY_DOMAINS.map((d, i) => [d, (Math.floor(n / 3 ** i) % 3) + 1 as DifficultyLevel])) as Record<DifficultyDomain, DifficultyLevel>;
      const cfg = normalizeDifficulty({ preset: 'normal', levels });
      expect(JSON.parse(JSON.stringify(cfg))).toEqual(cfg);
      expect(difficultyError(cfg)).toBeNull();
      if (cfg.preset !== 'custom') { named++; expect(PRESET_LEVELS[cfg.preset]).toEqual(levels); }
      expect(presetOf(levels)).toBe(cfg.preset);
    }
    expect(named).toBe(3);
  });

  it('knob — Normal은 늘 1 · 표에 없는 id도 1 · Easy/Hard는 표의 값 · 영역 배수는 태그 없으면 1', () => {
    const s = v16();
    for (const id of Object.keys(KNOBS)) expect(knob(s, id as never)).toBe(1);
    expect(knob(s, 'finance.__없는손잡이')).toBe(1);
    KNOBS['macro.__test'] = { easy: 0.5, hard: 2 };
    try {
      expect(knob({ difficulty: normalizeDifficulty('easy') }, 'macro.__test')).toBe(0.5);
      expect(knob({ difficulty: normalizeDifficulty('hard') }, 'macro.__test')).toBe(2);
      expect(knob({ difficulty: normalizeDifficulty({ preset: 'custom', levels: { ...PRESET_LEVELS.normal, macro: 3 } }) }, 'macro.__test')).toBe(2);
      expect(knob({ difficulty: normalizeDifficulty({ preset: 'custom', levels: { ...PRESET_LEVELS.hard, macro: 2 } }) }, 'macro.__test')).toBe(1);
    } finally { delete KNOBS['macro.__test']; }
    expect(domainEventMul(s, undefined)).toBe(1);
    expect(domainEventMul(s, 'incidents')).toBe(1);
  });

  it('프리셋 = 대응 Custom 실행 동치 — hard 프리셋 판과 custom(전부 3) 판은 표시만 다르고 같은 시드에서 바이트 동일 · Normal 판은 스냅샷을 지운 판과 동일(= 지금 출력)', () => {
    const a = advanceMonths(v16({ difficulty: 'hard' }), 72);
    const b = advanceMonths(v16({ difficulty: { preset: 'custom', levels: PRESET_LEVELS.hard } }), 72);
    expect(a.difficulty!.preset).toBe('hard'); expect(b.difficulty!.preset).toBe('custom');
    expect(strip(a)).toBe(strip(b));
    const n0 = v16(); const bare = structuredClone(n0); delete bare.difficulty;
    expect(strip(advanceMonths(n0, 72))).toBe(strip(advanceMonths(bare, 72))); // 이벤트가 열리는 60개월을 지나도 같다(배수 1)
  });

  it('불변식 — 범위 밖 단계·표시≠값은 오류, 저장 왕복 뒤 스냅샷 그대로', () => {
    const s = v16();
    expect(checkInvariants(s).errors).toEqual([]);
    const bad = structuredClone(s); (bad.difficulty!.levels as Record<string, number>).taste = 4;
    expect(checkInvariants(bad).errors.join()).toContain('난이도 taste');
    const mis = structuredClone(s); mis.difficulty!.preset = 'hard';
    expect(checkInvariants(mis).errors.join()).toContain('표시 hard ≠ 값 normal');
    expect(JSON.parse(JSON.stringify(advanceMonths(s, 3))).difficulty).toEqual(DIFFICULTY_NORMAL);
  });
});

describe('F6a — 정적: 플레이 중 변경 입구 없음 · 승리 자격·순자산 정의·숙성 물리는 난이도를 읽지 않는다', () => {
  const sim = join(__dirname);
  const src = (f: string) => readFileSync(join(sim, f), 'utf8');
  it('actions*.ts는 difficulty에 **쓰지** 않는다(플레이 중 불변 — 입구가 없다). 읽기(knob·levelOf·*Knobs.ts import)는 허용', () => {
    const files = readdirSync(sim).filter((f) => /^actions.*\.ts$/.test(f) && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(0);
    // 쓰기 = 대입 `… .difficulty =` · 객체 리터럴 키 `difficulty:` · `delete …difficulty`. `difficultyOf(s)`·`knob(s, …)`·`import … from './mgtKnobs'`는 걸리지 않는다
    const WRITE = /\.difficulty\s*=[^=]|\bdifficulty\s*:|delete\s+[\w.[\]'"]*difficulty/;
    for (const f of files) for (const [i, line] of src(f).split('\n').entries()) expect(WRITE.test(line), `${f}:${i + 1} ${line.trim()}`).toBe(false);
  });
  it('rules.ts 밖의 승리·평가·숙성 모듈은 knob( 를 부르지 않는다', () => {
    for (const f of ['ledger.ts', 'valuation.ts', 'progress.ts', 'maturation.ts', 'warehouse.ts', 'lots.ts', 'saleEvents.ts']) expect(/\bknob\(/.test(src(f)), f).toBe(false);
  });
});
