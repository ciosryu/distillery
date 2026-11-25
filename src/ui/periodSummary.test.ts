import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import { advanceMonths } from '../sim';
import { periodSummary, stockoutSummary } from './TurnBrief';

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

  it('[#410 T8] 품절로 못 판 병 — 결산 stockoutDemand 합계만(100병 단위 · 제품 수), 제품별 값은 내지 않는다', () => {
    const s0 = load();
    const from = s0.month;
    const s = advanceMonths(s0, 3);
    const span = s.history.reports.filter((r) => r.month >= from && r.month < s.month);
    const rows = span.flatMap((r) => r.stockoutDemand ?? []);
    const p = periodSummary(s, from)!;
    if (!rows.length) { expect(p.stockout).toBeNull(); return; }
    const total = rows.reduce((t, x) => t + x.bottles, 0);
    expect(p.stockout).toEqual({ bottles: Math.max(100, Math.round(total / 100) * 100), products: new Set(rows.map((x) => x.productId)).size });
    expect(Object.keys(p.stockout!).sort()).toEqual(['bottles', 'products']); // 제품 id · 제품별 병 수 없음(F5d)
  });
  it('[#410 T8] stockoutSummary — 기록 없음 · 0병이면 null, 적으면 100병으로 올린다', () => {
    expect(stockoutSummary([])).toBeNull();
    expect(stockoutSummary([{ stockoutDemand: [] } as never])).toBeNull();
    expect(stockoutSummary([{ stockoutDemand: [{ productId: 'a', bottles: 12 }] } as never])).toEqual({ bottles: 100, products: 1 });
    expect(stockoutSummary([{ stockoutDemand: [{ productId: 'a', bottles: 340 }] } as never, { stockoutDemand: [{ productId: 'a', bottles: 120 }, { productId: 'b', bottles: 99 }] } as never])).toEqual({ bottles: 600, products: 2 });
  });
});
