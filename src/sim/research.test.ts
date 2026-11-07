import { describe, expect, it } from 'vitest';
import { advanceMonth, advanceMonths, applyAction, isUnlocked, migrateSave, newGame, newScenarioGame, RESEARCH, researchRate, SAVE_VERSION, type GameState } from '.';
import { TECH_BY_ID, TECH_NODES } from './content/tech';
import { EQUIPMENT } from './content/catalog';
import { SCENARIOS } from './content/scenarios';
import { infoBonus, isGated, lossReductionMul, riskMul } from './research';
import fixture from './fixtures/save-v11.json';

// 연구 진행 (skeleton S-6, #149, tech-tree §2.1)

/** 숙성고 매니저(MAT 담당)를 둔 게임 */
function withWarehouseLead(seed = 1): { s: GameState; leadId: string } {
  const s = newGame({ seed, startingCash: 5_000_000_000 });
  const id = 'S-LEAD';
  s.hr.staff.push({ id, name: '연구 담당', role: 'warehouse', level: 1, xp: 0, stats: { a: 60, b: 40, c: 50 }, salary: 3_000_000, hiredMonth: 0, ageAtHire: 40 });
  return { s, leadId: id };
}
const start = (s: GameState, techId: string, leadStaffId: string) => applyAction(s, { type: 'startResearch', techId, leadStaffId });

describe('세이브 v11 → v12 (S-6)', () => {
  it('v11 세이브는 그대로 이어지고 진행 결과가 v11 코드와 같다', () => {
    const s = migrateSave(structuredClone(fixture.save))!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.research).toEqual(fixture.save.research);
    const t = advanceMonths(s, 3);
    expect({ month: t.month, cash: t.finance.cash }).toEqual(fixture.expectedAfter3);
  });
});

describe('연구 시작 조건', () => {
  it('선행 연구·슬롯·담당 직군·중복 담당을 확인한다', () => {
    const { s, leadId } = withWarehouseLead();
    expect(start(s, 'MAT-3a', leadId).error).toMatch(/선행 연구/);
    expect(start(s, 'PRO-1', leadId).error).toMatch(/담당 직군/); // 디스틸러 담당
    expect(start(s, 'NOPE', leadId).error).toMatch(/알 수 없는/);
    const r = start(s, 'MAT-1', leadId);
    expect(r.error).toBeUndefined();
    expect(r.state.research.active).toEqual([{ techId: 'MAT-1', progress: 0, leadStaffId: leadId, paused: false, startedMonth: 0, spent: 0 }]);
    expect(start(r.state, 'MAT-1', leadId).error).toMatch(/이미 진행/);
    const distiller = r.state.hr.staff.find((x) => x.role === 'distiller')!.id;
    expect(start(r.state, 'PRO-1', distiller).error).toMatch(/슬롯/); // 기본 슬롯 1
  });
});

describe('연구 진행 (tech-tree §2.1)', () => {
  it('매달 연구비가 나가고 진행도 = (1/기간) × (1 + 스탯/200), 다 차면 해금된다', () => {
    const { s, leadId } = withWarehouseLead();
    const node = TECH_BY_ID['MAT-1']!;
    let t = start(s, 'MAT-1', leadId).state;
    const rate = researchRate(t, 'MAT-1', leadId);
    expect(rate).toBeCloseTo((1 / node.research.baseMonths) * (1 + 60 / RESEARCH.statDivisor), 10);
    t = advanceMonth(t);
    expect(t.history.reports.at(-1)!.expenses.research).toBe(node.research.monthlyCost);
    expect(t.research.active[0]!.progress).toBeCloseTo(rate, 10);
    const months = Math.ceil(1 / rate);
    t = advanceMonths(t, months - 1);
    expect(t.research.unlocked).toContain('MAT-1');
    expect(t.research.active).toEqual([]);
    expect(t.history.reports.at(-1)!.notes).toContain('연구 완료: 캐스크 이력 DB');
    // 게이트는 아직 꺼져 있다 — 켜면 해금한 키만 열린다
    expect(isUnlocked(t, 'info:cask_history', true)).toBe(true);
    expect(isUnlocked(t, 'action:rotateWarehouse', true)).toBe(false);
    // 이제 선행이 풀린 MAT-3a를 시작할 수 있다
    expect(start(t, 'MAT-3a', leadId).error).toBeUndefined();
  });

  it('일시정지하면 진행도는 남고 연구비가 멈춘다. 포기하면 진행도가 사라진다', () => {
    const { s, leadId } = withWarehouseLead();
    let t = advanceMonth(start(s, 'MAT-1', leadId).state);
    const p = t.research.active[0]!.progress;
    t = applyAction(t, { type: 'setResearch', techId: 'MAT-1', paused: true }).state;
    t = advanceMonths(t, 2);
    expect(t.research.active[0]!.progress).toBe(p);
    expect(t.history.reports.at(-1)!.expenses.research).toBeUndefined();
    t = applyAction(t, { type: 'cancelResearch', techId: 'MAT-1' }).state;
    expect(t.research.active).toEqual([]);
    expect(t.research.unlocked).not.toContain('MAT-1');
  });

  it('담당자가 떠나면 진행도 −25%, 새 담당자를 정할 때까지 멈춘다', () => {
    const { s, leadId } = withWarehouseLead();
    let t = advanceMonth(start(s, 'MAT-1', leadId).state);
    const p = t.research.active[0]!.progress;
    t.hr.staff = t.hr.staff.filter((x) => x.id !== leadId);
    t = advanceMonth(t);
    expect(t.research.active[0]!.progress).toBeCloseTo(Math.max(0, p - RESEARCH.departureSetback), 10);
    expect(t.research.active[0]!.leadStaffId).toBeUndefined();
    expect(t.history.reports.at(-1)!.expenses.research).toBeUndefined();
    t.hr.staff.push({ id: 'S-NEW', name: '새 담당', role: 'warehouse', level: 1, xp: 0, stats: { a: 50, b: 50, c: 50 }, salary: 3_000_000, hiredMonth: t.month, ageAtHire: 30 });
    t = applyAction(t, { type: 'setResearch', techId: 'MAT-1', leadStaffId: 'S-NEW' }).state;
    expect(advanceMonth(t).research.active[0]!.progress).toBeGreaterThan(t.research.active[0]!.progress);
  });

  it('MVP 시나리오에서는 연구가 잠겨 있다', () => {
    const mvp = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    expect(applyAction(mvp, { type: 'startResearch', techId: 'MAT-1', leadStaffId: mvp.hr.staff[0]!.id }).error).toMatch(/시나리오/);
  });
});

describe('노드 데이터 (P-MGT-3, tech-tree §8 Phase 2)', () => {
  it('Phase 2 범위 28개 — id가 겹치지 않고, 선행 노드가 있고, 순환이 없다', () => {
    expect(TECH_NODES.length).toBe(28);
    expect(new Set(TECH_NODES.map((n) => n.id)).size).toBe(TECH_NODES.length);
    for (const n of TECH_NODES) for (const p of n.prereq) expect(TECH_BY_ID[p], `${n.id} → ${p}`).toBeDefined();
    const depth = (id: string, seen: string[] = []): number => {
      expect(seen, `순환 ${[...seen, id].join(' → ')}`).not.toContain(id);
      return 1 + Math.max(0, ...TECH_BY_ID[id]!.prereq.map((p) => depth(p, [...seen, id])));
    };
    for (const n of TECH_NODES) expect(depth(n.id)).toBeLessThanOrEqual(4);
  });

  it('모든 노드가 무언가를 해금한다 (P1 숫자보다 동사), 효과에 면역(0)이 없다 (P3)', () => {
    for (const n of TECH_NODES) {
      expect(n.unlockKeys.length, n.id).toBeGreaterThan(0);
      for (const e of n.effects ?? []) if (e.kind === 'risk_scale') expect(e.mul, n.id).toBeGreaterThan(0);
    }
  });

  it('MVP 전수 점검: 연구가 잠긴 MVP에서 쓰는 행동·설비에 테크 게이트가 걸려 있지 않다 (게이트를 켜도 MVP가 막히지 않는다)', () => {
    // 알려진 빈틈: MVP는 로테이션을 잠그지 않았다(화면에는 숙성고 탭이 없어 안 보인다). 게이트를 켜기 전에 코어 PR로 MVP 잠금 목록에 넣는다
    const KNOWN_GAPS = ['mvp_kr: action:rotateWarehouse'];
    const gaps: string[] = [];
    for (const sc of Object.values(SCENARIOS)) {
      if (!sc.locked.includes('system:research')) continue;
      for (const key of TECH_NODES.flatMap((n) => n.unlockKeys)) {
        const live = key.startsWith('action:') || (key.startsWith('facility:') && !!EQUIPMENT[key.slice('facility:'.length)]);
        if (live && !sc.locked.includes(key)) gaps.push(`${sc.id}: ${key}`);
      }
    }
    expect(gaps.filter((g) => !KNOWN_GAPS.includes(g))).toEqual([]); // 코어 PR이 빈틈을 막으면 KNOWN_GAPS에서 지운다
  });

  it('게임에 이미 있는 기능 중 테크로 잠기는 것은 tech-tree §1.2 목록뿐이다 (로테이션·캐스크 오너십)', () => {
    const live = TECH_NODES.flatMap((n) => n.unlockKeys).filter((k) => (k.startsWith('facility:') && EQUIPMENT[k.slice(9)]) || k.startsWith('action:'));
    expect(live.sort()).toEqual(['action:rotateWarehouse', 'action:sellCaskOwnership']);
    expect(isGated('action:sellCaskOwnership')).toBe(true);
  });

  it('아직 없는 설비가 요건이면 연구를 시작할 수 없고 이름으로 알려 준다', () => {
    const s = newGame({ seed: 1, startingCash: 5_000_000_000 });
    const distiller = s.hr.staff.find((x) => x.role === 'distiller')!.id;
    s.research.unlocked.push('PRO-1');
    expect(start(s, 'PRO-2', distiller).error).toBe('설비가 필요합니다: 실험실 (아직 게임에 없음)');
  });
});

describe('효과 조회 (P-MGT-3)', () => {
  it('해금한 노드의 효과만 읽는다 — 손실은 곱으로, 리스크는 곱으로, 감지는 합으로', () => {
    const none = { research: { unlocked: [] as string[], active: [], slots: 1 } };
    expect(lossReductionMul(none, 'ferment')).toBe(1);
    expect(riskMul(none, 'acetic')).toBe(1);
    expect(infoBonus(none, 'cask_fault')).toEqual({ sigmaMul: 1, detectAdd: 0, forecastMonths: 0 });
    const done = { research: { ...none.research, unlocked: ['PRO-1', 'MAT-1', 'ENG-3'] } };
    expect(lossReductionMul(done, 'ferment')).toBeCloseTo(0.85, 10);
    expect(riskMul(done, 'acetic')).toBeCloseTo(0.7, 10);
    expect(infoBonus(done, 'cask_fault').detectAdd).toBeCloseTo(0.15, 10);
    expect(infoBonus(done, 'ingredient_price').forecastMonths).toBe(3);
    expect(lossReductionMul(done, 'grain_conversion')).toBe(1);
  });
});
