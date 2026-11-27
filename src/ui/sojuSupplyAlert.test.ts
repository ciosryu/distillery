// [P-PROD-81] 소주 공급 할 일 — 소주 지시 0 · 생산 < 수요(같은 id) · 「소주 과잉」 문구에 되돌릴 때 (10차 153개월 세이브)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from '../sim/migrate';
import { sojuSupply, sojuSupplyAlert, SOJU_RESTART_MONTHS } from '../sim/economics';
import type { GameState } from '../sim';
import { monthTodos, TODO_ORDER } from './alerts';

const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/10/distillery-mvp-standard-y13m10-202611270816.json', 'utf8')).save)!;
const noSojuOrder = (s: GameState) => { s.production.orders = s.production.orders.filter((o) => s.production.recipes.find((r) => r.id === o.recipeId)?.kind !== 'soju'); };
const scaleTank = (s: GameState, k: number) => { for (const l of s.inventory.lots) if (l.kind === 'soju') l.volumeL *= k; };
const todo = (s: GameState) => monthTodos(s).find((t) => t.id === 'soju-supply');

describe('[P-PROD-81] 소주 공급 할 일', () => {
  it('153개월 그대로(지시 1배치 · 생산 ≥ 수요 × 0.9): 알리지 않는다', () => {
    const s = load();
    expect(sojuSupplyAlert(s)).toBeNull();
    expect(todo(s)).toBeUndefined();
  });
  it('지시 0: 소주가 넉넉하면(4개월 치↑) 조용하고, 그 아래로 내려오면 「소주 지시가 0이다」 · 1배치면 월 약 n병', () => {
    const s = load();
    noSojuOrder(s);
    const v = sojuSupply(s);
    const months = (v.productBottles + v.tankBottles) / Math.max(v.demandPerMonth, v.perMonth);
    expect(months).toBeGreaterThanOrEqual(SOJU_RESTART_MONTHS); // 약 4.1개월 치
    expect(todo(s)).toBeUndefined();
    scaleTank(s, 0.5);
    const a = sojuSupplyAlert(s)!;
    expect(a.kind).toBe('zero');
    expect(a.months).toBeLessThan(SOJU_RESTART_MONTHS);
    const t = todo(s)!;
    expect(t.text).toMatch(/^소주 지시가 0이다 — 지금 소주\(탱크 \+ 제품\)는 약 [\d.]+개월 치/);
    expect(t.text).toMatch(/소주 지시 1배치면 월 약 1,\d{3}병/);
    expect(t.target).toEqual({ anchor: 'mvp-orders' });
    scaleTank(s, 0);
    for (const p of s.commerce.products) if (p.category === 'soju_distilled') p.stockBottles = Math.min(p.stockBottles, 100);
    expect(todo(s)!.level).toBe('warn'); // 곧 바닥(2개월 치 아래)
  });
  it('지시는 있는데 수요가 생산을 넘고 소주가 3개월 치 아래면 「소주 생산 < 수요」 — 같은 id', () => {
    const s = load();
    for (const r of s.history.reports.slice(-3)) for (const x of r.sales) x.demandBottles = (x.demandBottles ?? x.bottles) * 2;
    scaleTank(s, 0.2);
    const a = sojuSupplyAlert(s)!;
    expect(a.kind).toBe('short');
    expect(a.made).toBeLessThan(a.demand * 0.9);
    expect(todo(s)!.text).toMatch(/^소주 생산 < 수요 — 지금 지시로 월 약 [\d,]+병 · 수요 월 약 [\d,]+병 · 소주 /);
    expect(todo(s)!.text).toMatch(/1배치 더하면 월 약 \+1,\d{3}병/);
  });
  it('「소주 과잉」은 되돌릴 때를 말한다 · 두 줄은 함께 뜨지 않는다 · 순서는 소주 과잉 바로 앞', () => {
    const s = load();
    scaleTank(s, 30);
    const glut = monthTodos(s).find((t) => t.id === 'soju-glut')!;
    expect(glut.text).toMatch(new RegExp(`소주가 ${SOJU_RESTART_MONTHS}개월 치 아래로 내려오면 다시 올리라고 알린다`));
    expect(todo(s)).toBeUndefined();
    expect(TODO_ORDER.indexOf('soju-supply')).toBe(TODO_ORDER.indexOf('soju-glut') - 1);
  });
});
