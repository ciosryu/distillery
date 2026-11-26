import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import { applyAction, type GameState } from '../sim';
import { agingCheckIdle, agingCheckReach, monthTodos } from './alerts';

// U1(10차 70개월): 오너가 34개월에 디스틸러에게 「숙성 점검」을 맡겼는데, 일은 목재 7년(84개월)↑ 통만 맛본다 — 가장 오래된 통 68개월이라 36개월 동안 0통
const load = (): GameState => {
  const r = parsePlayFile(readFileSync('docs/playtest/10/distillery-mvp-standard-y6m11-202611261003.json', 'utf8')); if ('error' in r) throw new Error(r.error);
  return r.save;
};

describe('U1 「숙성 점검」 맛볼 통 0개 알림', () => {
  it('10차 70: 지금 0통 · 첫 통은 16개월 뒤(84 − 68) · 할 일 warn이 직원 탭으로 간다', () => {
    const s = load();
    expect(agingCheckReach(s)).toEqual({ now: 0, wait: 16 });
    expect(agingCheckIdle(s)).toEqual({ names: ['윤도현'], wait: 16 });
    const t = monthTodos(s).find((x) => x.id === 'aging-check-idle')!;
    expect(t.level).toBe('warn');
    expect(t.text).toContain('첫 통은 16개월 뒤');
    expect(t.target).toEqual({ tab: 'staff' });
  });
  it('「평소 업무」로 돌리면 할 일이 사라진다', () => {
    const s = load();
    s.month = 72; // 다음 분기 — 바꿀 수 있는 달
    const x = s.hr.staff.find((y) => y.role === 'distiller')!;
    const next = applyAction(s, { type: 'assignStaffTask', staffId: x.id, task: 'routine' }).state;
    expect(agingCheckIdle(next)).toBeNull();
    expect(monthTodos(next).some((t) => t.id === 'aging-check-idle')).toBe(false);
  });
  it('맛볼 통이 생기면(목재 84개월↑) 할 일이 없다', () => {
    const s = load();
    const c = s.inventory.casks.find((y) => y.contents && !y.owner && !y.handfill && !y.contaminationKnown && y.contents.oakMonths === 68)!;
    c.contents!.oakMonths = 84;
    expect(agingCheckReach(s).now).toBe(1);
    expect(agingCheckIdle(s)).toBeNull();
  });
});
