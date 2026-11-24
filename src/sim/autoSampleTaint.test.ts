// [결정 #383] 자동 샘플은 아는 오염 통을 건너뛴다 (v16만 · 손 샘플 · 옛 판 그대로) — 9차 판: K11 · K388에 오염이 드러난 뒤에도 자동 샘플이 떴다
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyAction } from './index';
import { migrateSave } from './migrate';
import { autoSamplePicks, knownReads } from './blendTable';
import type { GameState } from './types';

const load = (): GameState => {
  const s = migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')).save)!;
  const k = s.inventory.casks.find((c) => c.id === 'K388')!;
  expect(k.contaminationKnown).toBe(true);
  delete k.sampleLog; // 가장 오래 안 뜬 통으로 — 지금 규칙이면 맨 먼저 뽑힌다
  delete k.samples;
  for (const c of s.inventory.casks) if (c.sampleLog?.at(-1)?.month === s.month) c.sampleLog = c.sampleLog.slice(0, -1); // 이번 달 손 샘플 없음
  return s;
};

describe('#383 자동 샘플 — 아는 오염 통', () => {
  it('v16: 가장 오래 안 뜬 아는 오염 통 K388을 건너뛴다', () => {
    const s = load();
    const picks = autoSamplePicks(s, knownReads(s)).map((c) => c.id);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks).not.toContain('K388');
  });
  it('옛 판(legacy-v15)은 그대로 — K388을 먼저 뽑는다', () => {
    const s = load();
    s.rulesVersion = 'legacy-v15';
    expect(autoSamplePicks(s, knownReads(s)).map((c) => c.id)).toContain('K388');
  });
  it('손 샘플은 그대로 뜰 수 있다', () => {
    const s = load();
    expect(applyAction(s, { type: 'sampleCask', caskIds: ['K388'] }).error).toBeUndefined();
  });
});
