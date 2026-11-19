// 난이도 Easy·Hard 값 = F7-B 최종 후보 `[제안 P-MGT-58]` ([결정 #331]) — 표와 측정 파일이 어긋나지 않게 묶는다
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KNOBS } from './content/difficulty';

const DIR = 'docs/baseline/2026-11-19-f7b-r2/cand';
const final = Object.assign({}, ...['mgt', 'mkt', 'prod'].map((p) => JSON.parse(readFileSync(`${DIR}/final-${p}.json`, 'utf8')))) as Record<string, { easy: number; hard: number }>;

describe('난이도 값 — F7-B 최종 후보와 같다', () => {
  it('후보 37행은 표와 같은 값 · 표의 나머지(경쟁 3행, #329)는 1', () => {
    expect(Object.keys(final)).toHaveLength(37);
    for (const [id, v] of Object.entries(final)) expect(KNOBS[id], id).toMatchObject({ easy: v.easy, hard: v.hard });
    for (const id of Object.keys(KNOBS).filter((k) => !(k in final))) {
      expect(id.startsWith('competition.'), id).toBe(true);
      expect(KNOBS[id]).toMatchObject({ easy: 1, hard: 1 });
    }
  });
});
