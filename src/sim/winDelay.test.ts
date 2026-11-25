import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { advanceMonth } from './step';
import { caskEligibility, recordFirstEligible, winDelayMonths } from './ledger';
import { campaignMinOakMonths } from './rules';
import type { GameState } from './types';

// [결정 #407] 승리 미루기 보강 — 첫 적격 통 달(코어 기록). 문턱 식(k × 미룬 개월)은 MGT `sNetWorthTarget`
const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')).save)!;
/** 가장 오래된 자가 몰트 통을 목재 `wood`개월로(원액 · 구성 원장 함께) */
const age = (s: GameState, wood: number) => {
  const c = s.inventory.casks.filter((x) => x.contents && caskEligibility(s, x).origin === 'self' && x.contents.kind === 'malt').sort((a, b) => b.contents!.oakMonths - a.contents!.oakMonths)[0]!;
  const d = wood - caskEligibility(s, c).woodMonths;
  c.contents!.oakMonths += d;
  for (const e of c.contents!.components ?? []) e.woodMonths += d;
  return c;
};

describe('[결정 #407] firstEligibleMonth', () => {
  it('9차 134(적격 통 없음): 기록하지 않는다 · 미룬 개월 0', () => {
    const s = load();
    recordFirstEligible(s);
    expect(s.progress.firstEligibleMonth).toBeUndefined();
    expect(winDelayMonths(s)).toBe(0);
  });
  it('필드가 없는 세이브에 이미 적격 통이 있으면 가장 오래된 통이 기준을 넘은 달로 거슬러 적는다', () => {
    const s = load();
    const A = campaignMinOakMonths(s);
    age(s, A + 6);
    recordFirstEligible(s);
    expect(s.progress.firstEligibleMonth).toBe(s.month - 6);
    expect(winDelayMonths(s)).toBe(6);
    expect(winDelayMonths(s, s.month + 10)).toBe(16);
    // 한 번 적으면 바뀌지 않는다
    age(s, A + 20);
    recordFirstEligible(s);
    expect(s.progress.firstEligibleMonth).toBe(s.month - 6);
  });
  it('월 틱이 적는다(진행 중 판은 적격이 된 그 달) · 승리 뒤 · 옛 판은 적지 않는다', () => {
    const s = load();
    const A = campaignMinOakMonths(s);
    age(s, A - 1); // 다음 달에 적격
    const n = advanceMonth(s);
    expect(n.progress.firstEligibleMonth).toBe(s.month); // 결산은 달을 넘기기 전 — 그 달(s.month)에 목재 A개월
    const won = load(); age(won, A + 3); won.progress.win = { month: won.month } as never;
    recordFirstEligible(won);
    expect(won.progress.firstEligibleMonth).toBeUndefined();
    const old = load(); age(old, A + 3); old.rulesVersion = 'legacy-v15';
    recordFirstEligible(old);
    expect(old.progress.firstEligibleMonth).toBeUndefined();
  });
});
