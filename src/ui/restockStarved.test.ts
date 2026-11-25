import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import type { MonthReport } from '../sim';
import { AUTO_RESTOCK_STARVED_WARN } from '../sim/economics';
import { monthTodos, TODO_ORDER } from './alerts';

// [결정 #399 · #386 ④] 자동 납품이 연달아 못 채운 제품 — 할 일 warn(ARCH). 9차 64 세이브 「김포 3년 셰리 캐스크」(P510)
const load = () => {
  const r = parsePlayFile(readFileSync('docs/playtest/9/distillery-mvp-standard-y6m5-202611240759.json', 'utf8')); if ('error' in r) throw new Error(r.error);
  return r.save;
};
const rep = (month: number, notes: string[]) => ({ month, notes, expenses: {}, sales: [], events: [], revenue: 0, cashEnd: 0 }) as unknown as MonthReport;

describe('#386 ④ restock-starved 할 일', () => {
  it(`${AUTO_RESTOCK_STARVED_WARN}달 연달아 못 채우면 warn — 사유가 띠 정책이면 숙성고로 · 같은 제품은 「채울 원액이 없다」 줄에서 뺀다`, () => {
    const s = load();
    const p = s.commerce.products.find((x) => x.id === 'P510')!;
    p.autoRestock = 2;
    const miss = `자동 납품 「${p.name}」 — 쓸 원액이 없어 못 채웠다 (사유)`;
    const base = s.history.reports.at(-1)!.month;
    s.history.reports.push(rep(base + 1, [miss]), rep(base + 2, [miss]), rep(base + 3, [miss]));
    const t = monthTodos(s).find((x) => x.id === 'restock-starved');
    expect(t?.level).toBe('warn');
    expect(t?.text).toContain(`「${p.name}」 자동 납품이 ${AUTO_RESTOCK_STARVED_WARN}달째 못 채웠다`);
    expect(monthTodos(s).filter((x) => x.id === 'restock-short').every((x) => !x.text.includes(`「${p.name}」`))).toBe(true);
    expect(TODO_ORDER.indexOf('restock-starved')).toBe(TODO_ORDER.indexOf('restock-short') - 1);
  });
  it('2달이면 없다', () => {
    const s = load();
    const p = s.commerce.products.find((x) => x.id === 'P510')!;
    p.autoRestock = 2;
    const miss = `자동 납품 「${p.name}」 — 쓸 원액이 없어 못 채웠다 (사유)`;
    const base = s.history.reports.at(-1)!.month;
    s.history.reports.push(rep(base + 1, [miss]), rep(base + 2, [miss]));
    expect(monthTodos(s).some((x) => x.id === 'restock-starved')).toBe(false);
  });
});
