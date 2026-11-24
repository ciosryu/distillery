import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import { advanceMonths } from '../sim';
import { periodSummary } from './TurnBrief';

// [#388 ① A1 · ①-e2] 분기 요약 — 9차 134 세이브를 3개월 넘겨 본다
const load = () => {
  const r = parsePlayFile(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')); if ('error' in r) throw new Error(r.error);
  return r.save;
};

describe('#388 ① ①-e2 periodSummary', () => {
  it('한 달 진행이면 없다 · 세 달이면 매출 합 · 현금 변화 · 목표 · 연령 띠', () => {
    const s0 = load();
    const from = s0.month;
    const one = advanceMonths(s0, 1);
    expect(periodSummary(one, from)).toBeNull();
    const s = advanceMonths(s0, 3);
    const p = periodSummary(s, from)!;
    expect(p.months).toBe(3);
    const span = s.history.reports.filter((r) => r.month >= from && r.month < s.month);
    expect(span).toHaveLength(3);
    expect(p.revenue).toBe(span.reduce((t, r) => t + r.revenue, 0));
    expect(p.cashDelta).toBe(span.at(-1)!.cashEnd - s0.history.reports.at(-1)!.cashEnd);
    expect(p.goals).toContain('숙성고 5 ~ 9년 띠 6통');
    expect(p.bands).toMatch(/^0–2년 \d+/);
  });
});
