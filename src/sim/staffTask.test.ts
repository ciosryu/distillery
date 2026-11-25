// [결정 #412] 직원 그릇 — 맡길 일(분기에 한 번 · 이어 함) · 교육 「무엇을 가르칠까」 · 해고 열기(MGT). 채용 · 사기(`system:hr`)는 v16에서 잠근 채
import { describe, expect, it } from 'vitest';
import { advanceMonth, applyAction, type GameState } from './index';
import { newScenarioGame } from './newScenario';
import { canReassign, moraleOn, nextReassignMonth, staffTaskOf, TRAINING } from './hr';
import { baseWageDrift } from './rules';

const v16 = (tier: 'micro' | 'standard' = 'standard', seed = 3): GameState => {
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: tier, loanAmount: 0, seed });
  s.finance.cash = 5e9;
  return s;
};
const legacy = (seed = 3): GameState => {
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed, rules: 'legacy-v15' });
  s.finance.cash = 5e9;
  return s;
};
/** 단계 y1_staff(12개월)가 열린 판 — 12개월째 틱을 지난 상태 */
const opened = (): GameState => {
  let s = v16();
  while (s.month <= 12) { s = advanceMonth(s); s.finance.cash = 5e9; }
  return s;
};

describe('[결정 #412] 잠금 — v16은 2년 차(12개월)에 교육 · 해고 · 맡길 일만 연다', () => {
  it('11개월까지는 잠겨 있고, 단계 y1_staff가 지나면 열린다 — 채용 · 사기 · 헤드헌팅은 계속 잠금', () => {
    let s = v16();
    const sales = s.hr.staff.find((x) => x.role === 'sales')!;
    expect(applyAction(s, { type: 'assignStaffTask', staffId: sales.id, task: 'routine' }).error).toBeTruthy();
    expect(applyAction(s, { type: 'trainStaff', staffId: sales.id }).error).toBeTruthy();
    expect(applyAction(s, { type: 'fire', staffId: sales.id }).error).toBeTruthy();
    s = opened();
    expect(s.scenario!.stagesDone).toContain('y1_staff');
    for (const k of ['action:trainStaff', 'action:fire', 'action:assignStaffTask']) expect(s.scenario!.locked).not.toContain(k);
    for (const k of ['system:hr', 'action:hire']) expect(s.scenario!.locked).toContain(k);
    expect(moraleOn(s)).toBe(false); // 사기 꺼짐 그대로
    expect(baseWageDrift(s)).toBeGreaterThan(0); // v16 정기 임금(#330) 그대로 — system:hr 잠금에 묶여 있다
    expect(applyAction(s, { type: 'headhunt', role: 'sales' }).error).toBeTruthy();
    expect(s.hr.candidates).toHaveLength(0);
  });
  it('옛 판(legacy-v15)은 그대로 — 새 단계 없음 · 교육은 system:hr이 막고 · 맡길 일은 없다', () => {
    let s = legacy();
    while (s.month <= 13) { s = advanceMonth(s); s.finance.cash = 5e9; }
    expect(s.scenario!.stagesDone ?? []).not.toContain('y1_staff');
    const x = s.hr.staff[0]!;
    expect(applyAction(s, { type: 'trainStaff', staffId: x.id }).error).toContain('직원을 관리할 수 없습니다');
    expect(applyAction(s, { type: 'assignStaffTask', staffId: x.id, task: 'routine' }).error).toBeTruthy();
    expect(s.scenario!.locked).toContain('action:fire');
  });
});

describe('[결정 #412] 맡길 일 — 분기에 한 번, 고르지 않으면 이어 함', () => {
  it('처음엔 평소 업무(task 없음 = 지금 효과) — 직원 상태에 필드를 만들지 않는다', () => {
    const s = opened();
    for (const x of s.hr.staff) { expect(x.task).toBeUndefined(); expect(staffTaskOf(x)).toBe('routine'); }
  });
  it('직군에 없는 일 · 같은 일은 실패한다', () => {
    const s = opened();
    const d = s.hr.staff.find((x) => x.role === 'distiller')!;
    expect(applyAction(s, { type: 'assignStaffTask', staffId: d.id, task: 'routine' }).error).toContain('이미');
    expect(applyAction(s, { type: 'assignStaffTask', staffId: 'nobody', task: 'routine' }).error).toBeTruthy();
  });
  it('분기 규칙 — 맡긴 달 안에서는 고쳐 고를 수 있고, 같은 분기 다음 달엔 막히며, 다음 분기엔 열린다', () => {
    const s = opened(); // 13개월째(분기 4: 12 ~ 14)
    const d = s.hr.staff.find((x) => x.role === 'distiller')!;
    d.task = 'aging_check'; d.taskMonth = 12; // 그릇 시험: PR2 일 목록 전, 상태로 직접 둔다
    expect(canReassign(s, d)).toBe(false);
    expect(nextReassignMonth(s, d)).toBe(15);
    expect(applyAction(s, { type: 'assignStaffTask', staffId: d.id, task: 'routine' }).error).toContain('분기에 한 번');
    d.taskMonth = s.month;
    expect(canReassign(s, d)).toBe(true); // 맡긴 그 달
    const r = applyAction(s, { type: 'assignStaffTask', staffId: d.id, task: 'routine' });
    expect(r.error).toBeUndefined();
    const d2 = r.state.hr.staff.find((x) => x.id === d.id)!;
    expect(d2.task).toBeUndefined(); // 평소 업무로 돌리면 필드를 지운다
    expect(d2.taskMonth).toBe(s.month);
    let t = r.state;
    while (t.month < 15) t = advanceMonth(t);
    expect(canReassign(t, t.hr.staff.find((x) => x.id === d.id)!)).toBe(true);
  });
  it('맡긴 일은 달이 지나도 이어진다(고르지 않으면 그대로)', () => {
    const s = opened();
    const d = s.hr.staff.find((x) => x.role === 'distiller')!;
    d.task = 'aging_check'; d.taskMonth = s.month;
    let t = s;
    for (let i = 0; i < 7; i++) t = advanceMonth(t);
    expect(t.hr.staff.find((x) => x.id === d.id)!.task).toBe('aging_check');
  });
});

describe('[결정 #412] 교육 「무엇을 가르칠까」 · 해고', () => {
  it('능력치를 고르면 그 능력치 +3(상한 95) · XP · 비용 · 1년 대기는 그대로', () => {
    const s = opened();
    const x = s.hr.staff.find((y) => y.role === 'sales')!;
    const cash = s.finance.cash;
    const r = applyAction(s, { type: 'trainStaff', staffId: x.id, stat: 'b' });
    expect(r.error).toBeUndefined();
    const y = r.state.hr.staff.find((z) => z.id === x.id)!;
    expect(y.stats.b).toBe(Math.min(TRAINING.statCap, x.stats.b + TRAINING.statGain));
    expect(y.stats.a).toBe(x.stats.a);
    expect(y.xp).toBe(x.xp + TRAINING.xpPerLevel * x.level);
    expect(cash - r.state.finance.cash).toBe(x.salary * TRAINING.costMonths);
    expect(r.message).toContain('네트워크');
    expect(applyAction(r.state, { type: 'trainStaff', staffId: x.id, stat: 'a' }).error).toContain('개월 뒤');
  });
  it('능력치를 고르지 않으면 지금 그대로(XP만)', () => {
    const s = opened();
    const x = s.hr.staff.find((y) => y.role === 'sales')!;
    const y = applyAction(s, { type: 'trainStaff', staffId: x.id }).state.hr.staff.find((z) => z.id === x.id)!;
    expect(y.stats).toEqual(x.stats);
  });
  it('해고 — 하나뿐인 디스틸러는 막고, 다른 직원은 위로금 1개월로 내보낸다', () => {
    const s = opened();
    const d = s.hr.staff.find((x) => x.role === 'distiller')!;
    expect(applyAction(s, { type: 'fire', staffId: d.id }).error).toContain('하나뿐인 디스틸러');
    const x = s.hr.staff.find((y) => y.role === 'sales')!;
    const r = applyAction(s, { type: 'fire', staffId: x.id });
    expect(r.error).toBeUndefined();
    expect(r.state.hr.staff.find((y) => y.id === x.id)).toBeUndefined();
    expect(s.finance.cash - r.state.finance.cash).toBe(x.salary);
  });
});

describe('[결정 #412] 이미 있는 v16 세이브(잠금 목록에 새 키가 없음) — 단계 기록으로 가른다(ARCH)', () => {
  it('새 키 없는 잠금 목록이라도 단계 y1_staff가 지나기 전에는 교육 · 맡길 일이 막히고, 다음 틱에 단계가 열린다', () => {
    let s = v16();
    s.scenario!.locked = s.scenario!.locked.filter((k) => k !== 'action:trainStaff' && k !== 'action:assignStaffTask'); // 옛 v16 세이브 모양
    s.month = 30; // 이미 12개월을 지난 판
    const x = s.hr.staff.find((y) => y.role === 'sales')!;
    expect(applyAction(s, { type: 'trainStaff', staffId: x.id }).error).toContain('2년 차');
    expect(applyAction(s, { type: 'assignStaffTask', staffId: x.id, task: 'routine' }).error).toContain('2년 차');
    s = advanceMonth(s);
    s.finance.cash = 5e9;
    expect(s.scenario!.stagesDone).toContain('y1_staff');
    expect(applyAction(s, { type: 'trainStaff', staffId: s.hr.staff.find((y) => y.role === 'sales')!.id }).error).toBeUndefined();
  });
});
