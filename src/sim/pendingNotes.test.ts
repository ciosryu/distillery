import { describe, expect, it } from 'vitest';
import { advanceMonth, newScenarioGame, queueReportNote } from './index';

// 턴 사이 행동 → 다음 결산 메모 (9차 판 · PROD #910 핸드필 병입 메모의 그릇)
describe('history.pendingNotes — 행동이 남긴 메모는 다음 결산 notes 맨 앞으로 옮기고 지운다', () => {
  it('옮기고 비운다 · 없으면 손대지 않는다', () => {
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 2, rules: 'v16' });
    expect(s.history.pendingNotes).toBeUndefined();
    queueReportNote(s, '핸드필 통 K1이 병입으로 비었다 — 다음 핸드필 통을 지정하세요');
    const t = advanceMonth(s);
    expect(t.history.reports.at(-1)!.notes[0]).toBe('핸드필 통 K1이 병입으로 비었다 — 다음 핸드필 통을 지정하세요');
    expect(t.history.pendingNotes).toBeUndefined();
    const u = advanceMonth(t);
    expect(u.history.reports.at(-1)!.notes).not.toContain('핸드필 통 K1이 병입으로 비었다 — 다음 핸드필 통을 지정하세요');
    expect('pendingNotes' in u.history).toBe(false);
  });
});
