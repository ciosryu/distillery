// 자동 납품 「쓸 원액이 없어 못 채웠다」 메모 — 원액이 있는데 모자란 양이 1병 안팎이라 계획이 빈 달에는 내지 않는다(9차 판 65개월째 뉴본 그레인 · PM 2026-11-24)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { applyAutoRestock, autoRestockPlan, autoRestockSources, productMonthlyPace } from './economics';
import type { GameState, MonthReport } from './types';

const SAVE = 'docs/playtest/9/distillery-mvp-standard-y6m5-202611240759.json';
const report = (s: GameState): MonthReport => ({ month: s.month, notes: [], expenses: {} }) as unknown as MonthReport;

function soju() {
  const s = migrateSave(JSON.parse(readFileSync(SAVE, 'utf8')).save)!;
  const p = s.commerce.products.find((x) => x.name === '김포 소주')!;
  p.autoRestock = 1;
  return { s, p, target: Math.ceil(productMonthlyPace(s, p)) };
}

describe('자동 납품 못 채움 메모', () => {
  it('탱크 원액이 있고 1병 모자라 계획이 비면 「원액이 없다」를 내지 않는다(채우는 양은 그대로 0)', () => {
    const { s, p, target } = soju();
    p.stockBottles = target - 1;
    expect(autoRestockSources(s, p).length).toBeGreaterThan(0);
    const plan = autoRestockPlan(s, p);
    const r = report(s);
    applyAutoRestock(s, r);
    expect(r.notes.some((n) => n.includes('쓸 원액이 없어'))).toBe(false);
    if (!plan) expect(s.commerce.products.find((x) => x.id === p.id)!.stockBottles).toBe(target - 1);
  });
  it('탱크 원액이 정말 없으면 지금처럼 메모한다', () => {
    const { s, p } = soju();
    p.stockBottles = 0;
    s.inventory.lots = s.inventory.lots.filter((l) => l.kind !== 'soju');
    const r = report(s);
    applyAutoRestock(s, r);
    expect(r.notes.some((n) => n.includes(`「${p.name}」 — 쓸 원액이 없어 못 채웠다`))).toBe(true);
  });
});
