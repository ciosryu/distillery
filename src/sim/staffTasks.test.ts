// [결정 #412] 직원 「맡길 일」 셋 — 디스틸러 숙성 점검 · 영업 시음회 · 숙성고 순찰 강화(MGT). 맡기지 않으면 아무 일도 없다(봇 바이트)
import { describe, expect, it } from 'vitest';
import { applyAction, type GameState, type MonthReport } from './index';
import { newScenarioGame } from './newScenario';
import { STAFF_TASKS, staffTasksFor } from './hr';
import { agingCheckPicks, runStaffTasks, TASK_NOTE, taskEventMonth, tastingProduct } from './staffTasks';
import { coverageShare, effectiveProcess, patrolDetect, TASK_VALUES } from './staffTaskRules';
import { coverage } from './market';
import { houseBrand } from './brands';
import type { Product, Staff } from './types';

const report = (s: GameState): MonthReport => ({ month: s.month, revenue: 0, expenses: {}, netCash: 0, cashEnd: 0, sales: [], production: [], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] });
const game = (): GameState => {
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 5 });
  s.finance.cash = 5e9;
  s.month = 96;
  s.scenario!.stagesDone = [...(s.scenario!.stagesDone ?? []), 'y1_staff'];
  s.scenario!.locked = s.scenario!.locked.filter((k) => !['action:trainStaff', 'action:fire', 'action:assignStaffTask'].includes(k)); // 단계가 연 꼴
  return s;
};
const role = (s: GameState, r: Staff['role']) => s.hr.staff.find((x) => x.role === r)!;
/** 목재 n개월 몰트 통 하나를 만든다(빈 통 하나를 채운 꼴) */
const agedCask = (s: GameState, oak: number, extra: Partial<GameState['inventory']['casks'][number]> = {}) => {
  const c = s.inventory.casks.find((x) => !x.contents)!;
  Object.assign(c, { filledMonth: s.month - oak, fills: 1, ...extra, contents: { id: `L-${c.id}`, name: 't', kind: 'malt', volumeL: 190, abv: 0.62, oakMonths: oak, flavor: { cereal: 20, vanilla_caramel: 20 }, costPerLPA: 10_000, ...(extra.contents ?? {}) } });
  return c;
};
const addWarehouseManager = (s: GameState): Staff => {
  const d = role(s, 'distiller');
  const w: Staff = { ...d, id: 'S-W', name: '숙성고', role: 'warehouse', stats: { a: 60, b: 60, c: 60 }, keySpecialist: true };
  s.hr.staff.push(w);
  return w;
};

describe('[결정 #412] 일 목록 — 직군마다 하나 + 평소 업무', () => {
  it('디스틸러 = 숙성 점검 · 영업 = 시음회 · 숙성고 = 순찰 강화 · 다른 직군은 평소 업무만', () => {
    const ids = (r: Staff['role']) => staffTasksFor({ role: r }).map((t) => t.id);
    expect(ids('distiller')).toEqual(['routine', 'aging_check']);
    expect(ids('sales')).toEqual(['routine', 'tasting']);
    expect(ids('warehouse')).toEqual(['routine', 'patrol']);
    expect(ids('blender')).toEqual(['routine']);
    expect(STAFF_TASKS.every((t) => t.text.length > 10)).toBe(true);
    const s = game();
    expect(applyAction(s, { type: 'assignStaffTask', staffId: role(s, 'sales').id, task: 'aging_check' }).error).toContain('맡길 수 없는');
  });
  it('맡긴 사람이 없으면 runStaffTasks는 상태 · 메모를 바꾸지 않는다', () => {
    const s = game();
    agedCask(s, 120);
    const before = JSON.stringify(s);
    const r = report(s);
    runStaffTasks(s, r);
    expect(JSON.stringify(s)).toBe(before);
    expect(r.notes).toHaveLength(0);
    expect(r.expenses).toEqual({});
  });
  it('읽기 도우미는 평소 업무면 지금 값 그대로(봇 바이트) · 맡으면 맞바꿈', () => {
    const s = game();
    const d = role(s, 'distiller');
    const sales = role(s, 'sales');
    const cov = coverage(s);
    expect(effectiveProcess(d)).toBe(d.stats.b);
    expect(coverageShare(sales)).toBe(1);
    expect(patrolDetect(s, 0.4)).toBe(0.4);
    d.task = 'aging_check'; sales.task = 'tasting';
    expect(effectiveProcess(d)).toBeCloseTo(d.stats.b * TASK_VALUES.agingCheck.processMul);
    expect(coverage(s)).toBeLessThan(cov);
    addWarehouseManager(s).task = 'patrol';
    expect(patrolDetect(s, 0.4)).toBeCloseTo(0.64);
    expect(patrolDetect(s, 0.75)).toBe(TASK_VALUES.patrol.detectCap);
  });
});

describe('[결정 #412] 디스틸러 「숙성 점검」', () => {
  it('목재 84개월↑ 통을 4통까지 대신 맛본다 — 돈 · 월 샘플 여력은 쓰지 않고, 분기 첫 달에 소식 한 줄', () => {
    const s = game();
    const old = [agedCask(s, 130), agedCask(s, 100), agedCask(s, 90), agedCask(s, 86), agedCask(s, 85)];
    const young = agedCask(s, 40);
    const d = role(s, 'distiller');
    d.task = 'aging_check'; d.taskMonth = s.month;
    const picks = agingCheckPicks(s).map((c) => c.id);
    expect(picks).toHaveLength(4);
    expect(picks).not.toContain(young.id);
    const cash = s.finance.cash;
    const used = s.inventory.samplesThisMonth;
    const r = report(s);
    runStaffTasks(s, r);
    expect(s.finance.cash).toBe(cash);
    expect(s.inventory.samplesThisMonth).toBe(used);
    expect(old.filter((c) => (s.inventory.casks.find((x) => x.id === c.id)!.sampleLog?.length ?? 0) > 0)).toHaveLength(4); // 자동 샘플과 같은 읽기 — 손 샘플 횟수(samples)는 늘지 않는다
    expect(old.every((c) => !(s.inventory.casks.find((x) => x.id === c.id)!.samples))).toBe(true);
    expect(r.notes.some((n) => n.startsWith(`${TASK_NOTE} 숙성 점검`))).toBe(true);
  });
  it('숨은 오염 통은 맛보다가 찾을 수 있다(달마다 50%) — 찾으면 소식', () => {
    const s = game();
    const c = agedCask(s, 120, { contamination: 'mold' });
    const d = role(s, 'distiller');
    d.task = 'aging_check'; d.taskMonth = 0;
    const notes: string[] = [];
    for (let m = 0; m < 12 && !s.inventory.casks.find((x) => x.id === c.id)!.contaminationKnown; m++) { s.month += 1; const r = report(s); runStaffTasks(s, r); notes.push(...r.notes); }
    expect(s.inventory.casks.find((x) => x.id === c.id)!.contaminationKnown).toBe(true);
    expect(notes.some((n) => n.includes('오염을 찾았다'))).toBe(true);
  });
  it('분기 사건은 맡긴 달과 각 분기 첫 달만', () => {
    expect(taskEventMonth({ month: 97 }, { taskMonth: 97 })).toBe(true);
    expect(taskEventMonth({ month: 98 }, { taskMonth: 97 })).toBe(false);
    expect(taskEventMonth({ month: 99 }, { taskMonth: 97 })).toBe(true);
    expect(taskEventMonth({ month: 99 }, { taskMonth: undefined })).toBe(true);
  });
});

const product = (s: GameState, id: string): Product => {
  const p = { id, name: `시험 ${id}`, category: 'whisky', ageYears: 3, oakMonths: 40, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 70, typicity: 70, style: null, sourcedShare: 0, stockBottles: 300, price: 60_000, unitCost: 20_000, createdMonth: 50, lastMonthSold: 0, totalSold: 0 } as Product;
  s.commerce.products.push(p);
  return p;
};
const sold = (r: MonthReport, p: Product, bottles: number) => r.sales.push({ productId: p.id, name: p.name, bottles, revenue: bottles * p.price, demandBottles: bottles });

describe('[결정 #412] 영업 「시음회」', () => {
  it('이번 달 가장 많이 팔린 제품으로 — 분기 첫 달에 1,500만 원 · 인지도 + · 리뷰 덧붙임 · 같은 분기 다음 달엔 열지 않는다', () => {
    const s = game(); // 96 = 분기 첫 달
    const a = product(s, 'PA'); const b = product(s, 'PB');
    const x = role(s, 'sales');
    x.task = 'tasting'; x.taskMonth = 95;
    const aw = houseBrand(s).awareness;
    const cash = s.finance.cash;
    const r = report(s);
    sold(r, a, 20); sold(r, b, 50);
    expect(tastingProduct(s, r)!.id).toBe('PB');
    r.reviews = [{ productId: 'PB', scores: [80] }];
    runStaffTasks(s, r);
    const n = r.reviews!.find((y) => y.productId === 'PB')!.scores.length;
    expect(n - 1).toBe(TASK_VALUES.tasting.reviews[(['great', 'normal', 'poor'] as const).find((k) => r.notes[0]!.includes({ great: '성황', normal: '보통', poor: '썰렁' }[k]))!]);
    expect(cash - s.finance.cash).toBe(TASK_VALUES.tasting.cost);
    expect(r.expenses.marketing).toBe(TASK_VALUES.tasting.cost);
    expect(houseBrand(s).awareness).toBeGreaterThan(aw);
    expect(r.notes.find((n) => n.startsWith(`${TASK_NOTE} 시음회`))).toMatch(/「시험 PB」: (성황|보통|썰렁)/);
    s.month = 97;
    const r2 = report(s);
    sold(r2, b, 50);
    runStaffTasks(s, r2);
    expect(r2.notes).toHaveLength(0);
  });
  it('현금이 모자라면 열지 않고 소식만', () => {
    const s = game();
    const x = role(s, 'sales');
    x.task = 'tasting'; x.taskMonth = s.month;
    s.finance.cash = 1_000_000;
    const r = report(s);
    sold(r, product(s, 'PA'), 10);
    runStaffTasks(s, r);
    expect(s.finance.cash).toBe(1_000_000);
    expect(r.notes[0]).toContain('현금이 모자라');
  });
});

describe('[결정 #412] 숙성고 「순찰 강화」', () => {
  it('매달 야근 수당 300만 · 분기 첫 달에 소식', () => {
    const s = game();
    const w = addWarehouseManager(s);
    w.task = 'patrol'; w.taskMonth = 95;
    const cash = s.finance.cash;
    const r = report(s);
    runStaffTasks(s, r);
    expect(cash - s.finance.cash).toBe(TASK_VALUES.patrol.costPerMonth);
    expect(r.expenses.warehousePatrol).toBe(TASK_VALUES.patrol.costPerMonth);
    expect(r.notes.some((n) => n.startsWith(`${TASK_NOTE} 순찰 강화`))).toBe(true);
  });
});

describe('[결정 #412] 시음회 — 팔린 제품이 없으면 열지 않는다(돈 안 씀)', () => {
  it('이번 달 판매 0이면 소식만', () => {
    const s = game();
    const x = role(s, 'sales');
    x.task = 'tasting'; x.taskMonth = s.month;
    const cash = s.finance.cash;
    const r = report(s);
    runStaffTasks(s, r);
    expect(s.finance.cash).toBe(cash);
    expect(r.notes[0]).toContain('팔린 제품이 없어');
  });
});

describe('[결정 #412] 검토 반영(PROD · MKT 2026-11-25)', () => {
  it('영업 둘이 같은 달 시음회를 맡아도 한 번만 연다(돈 · 리뷰 한 번)', () => {
    const s = game();
    const a = role(s, 'sales');
    a.task = 'tasting'; a.taskMonth = s.month;
    s.hr.staff.push({ ...a, id: 'S-2', name: '영업 둘' });
    const cash = s.finance.cash;
    const r = report(s);
    sold(r, product(s, 'PA'), 10);
    runStaffTasks(s, r);
    expect(cash - s.finance.cash).toBe(TASK_VALUES.tasting.cost);
    expect(r.notes.some((n) => n.includes('이미 열렸다'))).toBe(true);
  });
  it('숙성 점검은 핸드필 통 · 이미 아는 오염 통을 맛보지 않는다', () => {
    const s = game();
    const h = agedCask(s, 130, { handfill: true });
    const k = agedCask(s, 120, { contamination: 'tca', contaminationKnown: true });
    const ok = agedCask(s, 110);
    const ids = agingCheckPicks(s).map((c) => c.id);
    expect(ids).toContain(ok.id);
    expect(ids).not.toContain(h.id);
    expect(ids).not.toContain(k.id);
  });
});
