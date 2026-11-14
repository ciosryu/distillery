// F6c `DIFF=` 파서 (MGT) — architecture §10.10: DIFF=easy|normal|hard|custom:<6자리>, 없으면 지금 기준선
import { describe, expect, it } from 'vitest';
import { newGame } from '../../src/sim';
import { DIFFICULTY_DOMAINS } from '../../src/sim/content/difficulty';
import { applyDifficulty, difficultyFromEnv } from './mgtKnobs';

describe('DIFF= (F6c)', () => {
  it('없으면 undefined — 판을 지금처럼 만든다', () => {
    expect(difficultyFromEnv(undefined)).toBeUndefined();
    expect(difficultyFromEnv('')).toBeUndefined();
  });
  it('프리셋 이름 · custom 6자리(영역 순서 = DIFFICULTY_DOMAINS) · 같은 값이면 프리셋으로 표시', () => {
    expect(difficultyFromEnv('hard')).toMatchObject({ preset: 'hard', levels: { macro: 3, finance: 3 } });
    const c = difficultyFromEnv('custom:122223')!;
    expect(c.preset).toBe('custom');
    expect(DIFFICULTY_DOMAINS.map((d) => c.levels[d]).join('')).toBe('122223');
    expect(c.levels.macro).toBe(1);
    expect(c.levels.finance).toBe(3);
    expect(difficultyFromEnv('custom:222222')!.preset).toBe('custom'); // 들어온 표시가 custom이면 유지(#314)
  });
  it('잘못된 값은 예외 — 조용히 Normal로 돌지 않는다', () => {
    for (const v of ['Hard', 'custom:12', 'custom:1234567', 'custom:12340', 'insane']) expect(() => difficultyFromEnv(v)).toThrow(/DIFF=/);
  });
  it('샌드박스 판(newGame)에 넣는다 — 없으면 그대로(같은 객체·difficulty 없음)', () => {
    const s = newGame({ seed: 1, region: 'KR' });
    expect(applyDifficulty(s, undefined)).toBe(s);
    expect(s.difficulty).toBeUndefined();
    const t = applyDifficulty(newGame({ seed: 1, region: 'KR' }), difficultyFromEnv('hard'));
    expect(t.difficulty?.preset).toBe('hard');
  });
});
