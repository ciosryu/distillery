import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { newScenarioGame } from './index';
import { lateGoalProgress, lateGoalsOf, updateLateGoals, visibleLateGoals } from './lateGoals';
import { caskEligibility } from './ledger';
import type { GameState, MonthReport } from './types';
import { LADDER_MID_WINDOW } from './content/scenarios';

// [#388 ① G3] 후반 목표 그릇 — 판정(lateGoalMet)은 MGT ①-c. 여기서는 열림 · 늦게 본 목표 건너뛰기 · 놓침 기록 · 옛 판을 본다
const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')).save)!;
const ids = (s: GameState) => visibleLateGoals(s).map((x) => x.def.id);
const rep = () => ({ notes: [] }) as unknown as MonthReport;

describe('#388 ① G3 후반 목표 그릇', () => {
  it('옛 판은 후반 목표가 없다(X0L 그대로)', () => {
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 5, rules: 'legacy-v15' });
    expect(lateGoalsOf(s)).toEqual([]);
  });
  it('새 판: 띠 목표는 72개월(#395)에 보이고 · 108개월에 라운지', () => {
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 5, rules: 'v16' });
    expect(ids(s)).toEqual([]);
    s.month = LADDER_MID_WINDOW.opens; expect(LADDER_MID_WINDOW.opens).toBe(72); expect(ids(s)).toEqual(['ladder_mid']);
    s.month = 108; expect(ids(s)).toEqual(['ladder_mid', 'lounge_3']);
  });
  it('9차 134(승리 전): 띠 · 라운지 두 개 — 늦게 본 목표로 건너뛰지 않고 기록도 없다(실패로 찍히지 않음) · 승리 뒤 300병 · 15년이 더해지고 18년은 15년 뒤', () => {
    const s = load();
    expect(ids(s)).toEqual(['ladder_mid', 'lounge_3']);
    const r = rep(); updateLateGoals(s, r);
    expect(s.progress.lateGoals ?? []).toEqual([]);
    expect(r.notes.filter((n) => n.startsWith('후반 목표'))).toEqual([]);
    s.progress.win = { month: s.month, productId: 'P', lotId: 'L', kind: 'retail', unitPrice: 1, bottles: 1 } as never;
    expect(ids(s)).toEqual(['ladder_mid', 'lounge_3', 'flagship_300', 'aged15_sold']);
    s.progress.lateGoals = [{ id: 'aged15_sold', month: s.month, result: 'done' }];
    expect(ids(s)).toContain('aged18_sold');
  });
  it('처음 볼 때 기한이 지났으면 적지 않고 보이지 않는다(진행 중 세이브) — 기한 달에 이르면 놓침으로 적는다', () => {
    const s = load();
    s.month = LADDER_MID_WINDOW.byMonth + 6; // ladder_mid 기한을 넘긴 세이브
    updateLateGoals(s, rep());
    expect(s.progress.lateGoals ?? []).toEqual([]);
    expect(ids(s)).not.toContain('ladder_mid');
    const t = load();
    t.month = LADDER_MID_WINDOW.byMonth - 1; // 기한 달(s.month + 1 = byMonth)
    const r = rep();
    updateLateGoals(t, r);
    expect(t.progress.lateGoals?.find((g) => g.id === 'ladder_mid')?.result).toBe('missed');
    expect(r.notes.some((n) => n.startsWith('후반 목표 기한 지남'))).toBe(true);
    expect(ids(t)).toContain('ladder_mid'); // ✗로 남아 보인다
  });
  it('caskEligibility 연수 인자 — 없으면 지금 그대로 · 216개월이면 12년 적격 통도 아니다', () => {
    const s = load();
    for (const c of s.inventory.casks.filter((x) => x.contents)) expect(caskEligibility(s, c, undefined)).toEqual(caskEligibility(s, c));
    const c = s.inventory.casks.filter((x) => x.contents).sort((a, b) => caskEligibility(s, b).woodMonths - caskEligibility(s, a).woodMonths)[0]!;
    const w = caskEligibility(s, c).woodMonths;
    expect(w).toBeGreaterThan(100); // 9차 134 — 가장 오래된 통
    expect(caskEligibility(s, c, w + 1).reasons.some((r) => r.startsWith('목재 숙성'))).toBe(true);
    expect(caskEligibility(s, c, w).reasons.some((r) => r.startsWith('목재 숙성'))).toBe(false);
  });
});

describe('[결정 #395] ladder_mid checkFrom — 72에 보이고 120부터 판정', () => {
  it('9차 134 세이브의 5 ~ 9년 띠를 6통 넘게 채워도 119개월까지는 기록하지 않고, 120개월에 달성으로 적는다(MGT 판정 그대로)', () => {
    const s = load();
    // 몰트 통 8개를 목재 70개월(5 ~ 9년 띠)로 — 판정 재료만 바꾼다
    for (const c of s.inventory.casks.filter((x) => x.contents && x.contents.kind === 'malt').slice(0, 8)) c.contents!.oakMonths = 70;
    expect(lateGoalProgress(s, 'ladder_mid')!.have).toBeGreaterThanOrEqual(6);
    s.progress.lateGoals = [];
    s.month = LADDER_MID_WINDOW.checkFrom - 1;
    updateLateGoals(s, rep());
    expect(s.progress.lateGoals).toEqual([]); // 판정 전 — 보이기만
    expect(ids(s)).toContain('ladder_mid');
    s.month = LADDER_MID_WINDOW.checkFrom;
    const r = rep();
    updateLateGoals(s, r);
    expect(s.progress.lateGoals.find((g) => g.id === 'ladder_mid')?.result).toBe('done');
    expect(r.notes.some((n) => n.startsWith('후반 목표 달성 — 숙성고'))).toBe(true);
  });
});
