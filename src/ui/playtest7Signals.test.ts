// 7차 판 뒤 화면 신호 (docs/playtest/7/mgt/README.md — [제안 P-MGT-60·61]) — 쌓인 현금 · 방재 · 가장 싼 대출. 화면만 읽는다(상태 불변)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { GameState } from '../sim';
import { parsePlayFile } from '../store/playlog';
import { CASH_IDLE_MONTHS, monthTodos, TODO_ORDER } from './alerts';
import { monthlyFixedCost } from '../sim/loans';

const P7 = 'docs/playtest/7/distillery-mvp-standard-y13m12-202611201440.json';
const p7 = (): GameState => { const r = parsePlayFile(readFileSync(P7, 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };
const todo = (s: GameState, id: string) => monthTodos(s).find((t) => t.id === id);

describe('쌓인 현금 → 증산 여유 할 일 (P-MGT-61)', () => {
  it('7차 완료 세이브(현금 13억 · 위스키 품절 · 생산 절반)에서 뜬다 — 생산 지시로 · 상태 불변', () => {
    const s = p7();
    const before = JSON.stringify(s);
    const t = todo(s, 'cash-idle')!;
    expect(JSON.stringify(s)).toBe(before);
    expect(t.level).toBe('info');
    expect(t.target).toEqual({ anchor: 'mvp-orders' });
    expect(t.text).toMatch(/^현금 .*이 쌓여 있는데 위스키 재고는 .*몰트\(「.*」\)를 월 약 3배치 더 돌릴 자리가 있다/);
  });

  it('현금이 고정비 기준보다 적으면 뜨지 않는다', () => {
    const s = p7();
    s.finance.cash = monthlyFixedCost(s) * (CASH_IDLE_MONTHS - 1);
    expect(todo(s, 'cash-idle')).toBeUndefined();
  });

  it('방재 할 일: 7차 완료 세이브는 최근 2년 폭설·한파를 설비 없이 겪었다 → 설비에서 짓기', () => {
    const t = todo(p7(), 'defense')!;
    expect(t.text).toBe('최근 2년 폭설 1회 · 한파 1회를 방재 설비 없이 겪었다 — 「내설 지붕 보강」 4,000만 · 「동파 방지·보온 설비」 3,500만이면 막는다');
    expect(t.target).toEqual({ anchor: 'mvp-equipment' });
  });

  it('순서: 통입 대기 다음 · 위스키 병입 권고 위', () => {
    expect(TODO_ORDER.indexOf('defense')).toBe(TODO_ORDER.indexOf('fill') + 1);
    expect(TODO_ORDER.indexOf('cash-idle')).toBe(TODO_ORDER.indexOf('whisky') - 1);
  });
});
