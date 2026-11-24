import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import { monthTodos, TODO_ORDER } from './alerts';
import { overhangFactor } from '../sim/retail';

// 재고 적체 할 일 (9차 판 64개월 세이브 — PROD 제안 2026-11-24): 수요를 깎는 제품이 있으면 warn 한 줄 · 가장 많이 깎인 제품 + 외 n개
const p9 = () => { const r = parsePlayFile(readFileSync('docs/playtest/9/distillery-mvp-standard-y6m5-202611240759.json', 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };

describe('할 일 「재고 적체」 (overhang)', () => {
  it('9차 64개월: 수요가 깎인 제품이 있으면 warn 한 줄 — 가장 많이 깎인 제품 · 판매 탭으로', () => {
    const s = p9();
    const hit = s.commerce.products.filter((p) => !p.dutyFreeOnly && p.stockBottles > 0 && overhangFactor(p, s.month) < 1);
    expect(hit.length).toBeGreaterThan(0);
    const t = monthTodos(s).filter((x) => x.id === 'overhang');
    expect(t).toHaveLength(1);
    expect(t[0]!.level).toBe('warn');
    expect(t[0]!.target).toEqual({ tab: 'sales' });
    const mo = (p: (typeof hit)[number]) => p.stockBottles / Math.max(1, p.salesEma ?? 0);
    const worst = [...hit].sort((a, b) => overhangFactor(a, s.month) - overhangFactor(b, s.month) || mo(b) - mo(a))[0]!;
    expect(t[0]!.text).toContain(`「${worst.name}」`);
    if (hit.length > 1) expect(t[0]!.text).toContain(`외 ${hit.length - 1}개 제품`);
  });
  it('깎인 제품이 없으면 뜨지 않는다 · 순서는 batch-short 뒤 · slots/casks 앞', () => {
    const s = p9();
    for (const p of s.commerce.products) p.stockBottles = Math.min(p.stockBottles, Math.floor((p.salesEma ?? 0) * 3));
    expect(monthTodos(s).some((x) => x.id === 'overhang')).toBe(false);
    expect(TODO_ORDER.indexOf('overhang')).toBe(TODO_ORDER.indexOf('batch-short') + 1);
  });
});
