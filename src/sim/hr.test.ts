import { describe, expect, it } from 'vitest';
import { applyAction, newGame, newScenarioGame } from './index';
import { headhuntCost, mentoringXp } from './hr';

// HR 성장 — 교육·멘토링·헤드헌팅 (PRD §7.3, #222). MVP는 HR이 잠겨 있다
describe('HR 성장 (#222)', () => {
  it('교육: 월급 2개월 치를 내고 XP +50×레벨, 같은 직원은 12개월 뒤에 다시', () => {
    const s = newGame({ seed: 1 });
    const x = s.hr.staff[0]!;
    const r = applyAction(s, { type: 'trainStaff', staffId: x.id });
    expect(r.error).toBeUndefined();
    expect(s.finance.cash - r.state.finance.cash).toBe(x.salary * 2);
    expect(r.state.hr.staff[0]!.xp - x.xp).toBe(50 * x.level);
    expect(applyAction(r.state, { type: 'trainStaff', staffId: x.id }).error).toMatch(/12개월 뒤/);
    expect(applyAction({ ...r.state, month: r.state.month + 12 }, { type: 'trainStaff', staffId: x.id }).error).toBeUndefined();
  });

  it('멘토링: 부사수 +8, 같은 직군에 레벨 2 이상 높은 선배가 있으면 +4, 아니면 0', () => {
    const s = newGame({ seed: 1 });
    const m = s.hr.staff.find((x) => x.role === 'distiller')!;
    m.level = 4;
    const peer = { ...m, id: 'S-peer', level: 3, apprenticeOf: undefined };
    const junior = { ...m, id: 'S-jr', level: 2, apprenticeOf: undefined };
    const appr = { ...m, id: 'S-ap', level: 1, apprenticeOf: m.id };
    s.hr.staff.push(peer, junior, appr);
    expect(mentoringXp(s, appr)).toBe(8);
    expect(mentoringXp(s, junior)).toBe(4);
    expect(mentoringXp(s, peer)).toBe(0);
    expect(mentoringXp(s, m)).toBe(0);
  });

  it('헤드헌팅: 기본급 3개월 치로 스탯 높은 후보 1명, 직군마다 한 달에 한 번, 채용 풀 갱신 난수와 무관', () => {
    const s = newGame({ seed: 1 });
    const before = s.hr.candidates.map((c) => c.id);
    const r = applyAction(s, { type: 'headhunt', role: 'warehouse' });
    expect(r.error).toBeUndefined();
    const c = r.state.hr.candidates.at(-1)!;
    expect(c.role).toBe('warehouse');
    expect((c.stats.a + c.stats.b + c.stats.c) / 3).toBeGreaterThan(50);
    expect(s.finance.cash - r.state.finance.cash).toBe(headhuntCost(s, 'warehouse'));
    expect(r.state.hr.candidates.slice(0, before.length).map((x) => x.id)).toEqual(before);
    expect(applyAction(r.state, { type: 'headhunt', role: 'warehouse' }).error).toMatch(/이번 달/);
    expect(applyAction(r.state, { type: 'headhunt', role: 'sales' }).error).toBeUndefined();
  });

  it('MVP(HR 잠김)에서는 교육·헤드헌팅을 할 수 없다', () => {
    const m = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    expect(applyAction(m, { type: 'trainStaff', staffId: m.hr.staff[0]!.id }).error).toMatch(/시나리오/);
    expect(applyAction(m, { type: 'headhunt', role: 'sales' }).error).toMatch(/시나리오/);
  });
});
