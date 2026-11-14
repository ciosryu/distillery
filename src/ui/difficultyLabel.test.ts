import { describe, expect, it } from 'vitest';
import { PRESET_LEVELS, normalizeDifficulty } from '../sim/content/difficulty';
import { HARD_STACK_WARN_AT, difficultyLabel, hardCount } from './difficultyLabel';

describe('F6c — 난이도 화면 문구', () => {
  it('프리셋은 이름 · Custom은 보통이 아닌 영역만 · 전부 보통인 Custom은 "모두 보통" · Hard 수', () => {
    expect(difficultyLabel(normalizeDifficulty('normal'))).toBe('보통');
    expect(difficultyLabel(normalizeDifficulty('hard'))).toBe('어려움');
    expect(difficultyLabel(normalizeDifficulty({ preset: 'custom', levels: { ...PRESET_LEVELS.normal, macro: 3, finance: 1 } }))).toBe('사용자 설정(거시경제 어려움 · 금융 환경 쉬움)');
    expect(difficultyLabel(normalizeDifficulty({ preset: 'custom', levels: PRESET_LEVELS.normal }))).toBe('사용자 설정(모두 보통)');
    expect(hardCount(normalizeDifficulty('hard'))).toBe(5); // 잠긴 경쟁 영역은 세지 않는다
    expect(difficultyLabel(normalizeDifficulty({ preset: 'custom', levels: { ...PRESET_LEVELS.normal, competition: 3 } }))).toBe('사용자 설정(모두 보통)'); // 잠긴 영역은 문구에 안 나온다
    expect(hardCount(normalizeDifficulty({ preset: 'custom', levels: { ...PRESET_LEVELS.normal, macro: 3, supply: 3 } }))).toBe(2);
    expect(HARD_STACK_WARN_AT).toBe(3);
  });
});
