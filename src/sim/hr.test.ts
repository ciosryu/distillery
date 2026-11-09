import { describe, expect, it } from 'vitest';
import { applyAction, newGame, newScenarioGame, type GameState, type MonthReport, type Staff } from './index';
import { headhuntCost, makeCandidate, marketSalary, mentoringXp, MORALE, moraleOf, quitChance, runMorale, xpMultiplier } from './hr';
import { houseBrand } from './brands';
import { resolvePending, runEvents } from './events';
import { rngFor } from './rng';

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

const rep = (s: GameState): MonthReport => ({ month: s.month, revenue: 0, expenses: {}, netCash: 0, cashEnd: 0, sales: [], production: [], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] });

// 사기·성격 특성 1단계 (#225, PRD §7.2) — MVP(HR 잠김)에서는 꺼진다
describe('사기·성격 특성 (#225)', () => {
  const sales = (s: GameState, extra: Partial<Staff> = {}): Staff => {
    const d = s.hr.staff[0]!;
    const x: Staff = { ...d, id: `S-x${s.hr.staff.length}`, role: 'sales', apprenticeOf: undefined, ...extra };
    x.salary = extra.salary ?? marketSalary(s, x);
    s.hr.staff.push(x);
    return x;
  };

  it('매달: 70 쪽으로 10% 돌아가고, 시세보다 덜 받으면 부족 % × 0.5만큼, 인지도 50% 이상이면 +1', () => {
    const s = newGame({ seed: 1 });
    const d = s.hr.staff[0]!;
    expect(moraleOf(d)).toBe(70);
    d.morale = 40;
    const under = sales(s, { morale: 70 });
    under.salary = Math.round(marketSalary(s, under) * 0.9);
    runMorale(s, rep(s));
    expect(d.morale).toBe(43);
    expect(under.morale).toBeCloseTo(65, 0);
    houseBrand(s).awareness = 0.6;
    d.morale = 70;
    runMorale(s, rep(s));
    expect(d.morale).toBe(71);
  });

  it('부사수는 시세의 60%를 시세로 본다 — 채용 급여(60%)로는 사기가 깎이지 않는다', () => {
    const s = newGame({ seed: 1 });
    const m = s.hr.staff[0]!;
    const ap: Staff = { ...m, id: 'S-ap', apprenticeOf: m.id, salary: 0 };
    ap.salary = Math.round(marketSalary(s, ap));
    s.hr.staff.push(ap);
    runMorale(s, rep(s));
    expect(ap.morale).toBe(70);
  });

  it('이직: 사기 30 미만이면 (30 − 사기)/30 × 3% — 철새 ×2, 토박이 ×0.5. 하나뿐인 디스틸러는 나가지 않는다', () => {
    const s = newGame({ seed: 1 });
    const x = sales(s, { morale: 0 });
    expect(quitChance(x)).toBeCloseTo(0.03);
    expect(quitChance({ ...x, morale: 15 })).toBeCloseTo(0.015);
    expect(quitChance({ ...x, morale: 30 })).toBe(0);
    expect(quitChance({ ...x, traits: ['drifter'] })).toBeCloseTo(0.06);
    expect(quitChance({ ...x, traits: ['loyal'] })).toBeCloseTo(0.015);
    const d = s.hr.staff[0]!;
    let quitAt = -1;
    for (let m = 1; m <= 400 && quitAt < 0; m++) {
      s.month = m; d.morale = 0;
      const sx = s.hr.staff.find((y) => y.id === x.id);
      if (!sx) { quitAt = m; break; }
      sx.morale = 0;
      const r = rep(s);
      runMorale(s, r);
      if (!s.hr.staff.some((y) => y.id === x.id)) { quitAt = m; expect(r.notes.join(' ')).toMatch(/사기 저하로 이직/); }
    }
    expect(quitAt).toBeGreaterThan(0);
    expect(s.hr.staff.some((y) => y.id === d.id)).toBe(true);
  });

  it('XP 배수: 사기 70이면 ×1, 0이면 ×0.5', () => {
    const s = newGame({ seed: 1 });
    const d = s.hr.staff[0]!;
    expect(xpMultiplier(d)).toBe(1);
    expect(xpMultiplier({ ...d, morale: 0 })).toBe(0.5);
  });

  it('교육 +10, 해고하면 남은 직원 −10', () => {
    const s = newGame({ seed: 1 });
    const x = sales(s);
    const y = sales(s);
    const r = applyAction(s, { type: 'trainStaff', staffId: x.id });
    expect(r.state.hr.staff.find((z) => z.id === x.id)!.morale).toBe(80);
    const f = applyAction(r.state, { type: 'fire', staffId: y.id });
    expect(f.state.hr.staff.find((z) => z.id === x.id)!.morale).toBe(70);
    expect(f.state.hr.staff[0]!.morale).toBe(60);
    expect(f.message).toMatch(/사기 −10/);
  });

  it('성격 특성: 후보 0~2개, 철새와 토박이는 함께 없다. 협상가 영업은 협상 스탯 +5. 후보 스탯 난수는 그대로', () => {
    const s = newGame({ seed: 7 });
    const all = Array.from({ length: 200 }, (_, i) => makeCandidate(s, rngFor(7, i, 'c'), 'sales'));
    expect(all.some((c) => c.traits?.length)).toBe(true);
    expect(all.some((c) => !c.traits)).toBe(true);
    for (const c of all) {
      expect(c.traits?.length ?? 0).toBeLessThanOrEqual(2);
      expect(c.traits?.includes('drifter') && c.traits?.includes('loyal')).toBeFalsy();
    }
    const neg = all.find((c) => c.traits?.includes('negotiator'))!;
    const plain = makeCandidate({ ...s, seed: -1 }, rngFor(7, all.indexOf(neg), 'c'), 'sales');
    expect(neg.stats.c - plain.stats.c).toBe(plain.traits?.includes('negotiator') ? 0 : Math.min(5, 100 - plain.stats.c));
  });

  it('멘토 특성: 멘토링으로 주는 XP 2배', () => {
    const s = newGame({ seed: 1 });
    const m = s.hr.staff[0]!;
    const ap: Staff = { ...m, id: 'S-ap', level: 1, apprenticeOf: m.id };
    s.hr.staff.push(ap);
    expect(mentoringXp(s, ap)).toBe(8);
    m.traits = ['mentor'];
    expect(mentoringXp(s, ap)).toBe(16);
  });

  it('연봉 협상: 1월에 선택 이벤트(첫해 제외). 인상 +5%(협상가 +2.5%)·사기 +15 / 동결(기본값) 사기 −15(토박이 −7.5)', () => {
    const s = newGame({ seed: 1 });
    runEvents(s, rep(s), 1);
    expect(s.events.pending.some((p) => p.defId === 'salary_review')).toBe(false);
    s.month = 12;
    s.history.reports = [{ ...rep(s), operatingCash: 1_000_000 }]; // 지난 1년 흑자 (P-MGT-25)
    const neg = sales(s, { traits: ['negotiator'] });
    const loyal = sales(s, { traits: ['loyal'] });
    neg.salary = 4_000_000; loyal.salary = 4_000_000;
    runEvents(s, rep(s), 1);
    const p = s.events.pending.find((x) => x.defId === 'salary_review')!;
    expect(p.defaultChoice).toBe(1);
    const raise = structuredClone(s);
    resolvePending(raise, p.id, 0);
    expect(raise.hr.staff.find((x) => x.id === loyal.id)!.salary).toBe(4_200_000);
    expect(raise.hr.staff.find((x) => x.id === neg.id)!.salary).toBe(4_100_000);
    expect(raise.hr.staff.find((x) => x.id === neg.id)!.morale).toBe(85);
    resolvePending(s, p.id, 1);
    expect(s.hr.staff.find((x) => x.id === neg.id)!.morale).toBe(55);
    expect(s.hr.staff.find((x) => x.id === loyal.id)!.morale).toBe(62.5);
    expect(s.hr.staff.find((x) => x.id === neg.id)!.salary).toBe(4_000_000);
  });

  it('MVP(HR 잠김)에서는 꺼진다 — 사기가 변하지 않고 연봉 협상도 없다', () => {
    const m = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    for (const x of m.hr.staff) x.salary = 1;
    runMorale(m, rep(m));
    expect(m.hr.staff.every((x) => x.morale === undefined)).toBe(true);
    m.month = 12;
    runEvents(m, rep(m), 1);
    expect(m.events.pending.some((p) => p.defId === 'salary_review')).toBe(false);
    expect(MORALE.base).toBe(70);
  });
});

// MVP 11년 차 직원 관리 단계 + 적자면 연봉 협상 없음 (P-MGT-25)
describe('MVP 11년 차 HR 단계·연봉 협상 조건 (P-MGT-25)', () => {
  it('120개월에 HR이 열리고 채용 후보가 바로 채워진다 — 그 전에는 잠겨 있다', async () => {
    const { advanceMonth, isLocked } = await import('./index');
    let m = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    m.month = 119; m = advanceMonth(m);
    expect(isLocked(m, 'system:hr')).toBe(true);
    expect(m.hr.candidates.length).toBe(0);
    m = advanceMonth(m);
    expect(isLocked(m, 'system:hr')).toBe(false);
    expect(isLocked(m, 'action:hire')).toBe(false);
    expect(m.scenario!.stagesDone).toContain('y11_people');
    expect(m.hr.candidates.length).toBeGreaterThan(0);
    expect(m.history.reports.at(-1)!.notes.some((n) => n.startsWith('새 기능 열림 — 11년 차'))).toBe(true);
    const c = m.hr.candidates[0]!;
    const r = applyAction(m, { type: 'hire', candidateId: c.id });
    expect(r.error).toBeUndefined();
    expect(applyAction(r.state, { type: 'trainStaff', staffId: c.id }).error).toBeUndefined();
  });

  it('지난 12개월 영업 현금흐름이 적자면 1월 연봉 협상을 열지 않는다 — 사기 변화 없음, 리포트 알림', () => {
    const s = newGame({ seed: 1 });
    s.month = 12;
    s.hr.staff[0]!.morale = 60;
    s.history.reports = [{ ...rep(s), operatingCash: 5_000_000 }, { ...rep(s), operatingCash: -6_000_000 }];
    const r = rep(s);
    runEvents(s, r, 1);
    expect(s.events.pending.some((p) => p.defId === 'salary_review')).toBe(false);
    expect(r.notes.join(' ')).toMatch(/연봉 협상 없음/);
    expect(s.hr.staff[0]!.morale).toBe(60);
    // 흑자면 연다 (옛 보고서는 순현금으로 본다)
    s.history.reports = [{ ...rep(s), netCash: 1 }];
    runEvents(s, rep(s), 1);
    expect(s.events.pending.some((p) => p.defId === 'salary_review')).toBe(true);
  });
});
