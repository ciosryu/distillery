import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import { GRADE, sNetWorthTarget } from '../sim';
import { fmtWon, winDelayNote } from './alerts';

// [결정 #407] 승리 미루기 알림 — 9차 134 세이브(표준 · 승리 전)에 첫 적격 달을 넣어 본다
const load = () => {
  const r = parsePlayFile(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')); if ('error' in r) throw new Error(r.error);
  return r.save;
};

describe('[결정 #407] winDelayNote', () => {
  it('적격 기록이 없으면 없다 · 유예 안이면 「n개월 안에 출하하지 않으면」 · 넘으면 지금 기준 금액과 +몫', () => {
    const s = load();
    expect(winDelayNote(s)).toBeNull();
    s.progress.firstEligibleMonth = s.month; // 이번 달 적격 — 판정 달(s.month + 1)까지 1개월 < 유예 2
    expect(winDelayNote(s)).toContain(`${GRADE.sDelayGraceMonths}개월 안에 출하하지 않으면`);
    s.progress.firstEligibleMonth = s.month - 9; // 판정 달까지 10개월 → 미룸 8개월
    const note = winDelayNote(s)!;
    expect(note).toContain(fmtWon(sNetWorthTarget(s)!));
    expect(note).toContain(`8개월 × ${fmtWon(GRADE.sDelayPerMonthV16.standard!)}`);
    expect(sNetWorthTarget(s)).toBe(GRADE.sNetWorthV16.standard! + 8 * GRADE.sDelayPerMonthV16.standard!);
  });
  it('승리 뒤 · 옛 판은 없다', () => {
    const s = load(); s.progress.firstEligibleMonth = s.month - 9;
    s.progress.win = { month: s.month } as never;
    expect(winDelayNote(s)).toBeNull();
    const o = load(); o.progress.firstEligibleMonth = o.month - 9; o.rulesVersion = 'legacy-v15';
    expect(winDelayNote(o)).toBeNull();
  });
});
