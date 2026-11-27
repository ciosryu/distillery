import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { newGame, type GameState, type Staff } from '../../sim';
import { parsePlayFile } from '../../store/playlog';
import { coverage } from '../../sim/market';
import { capacityReport } from '../../sim/production';
import { TRAINING } from '../../sim/hr';
import { statImpact, statImpactTitle } from './staffImpact';

// 오너 요청(10차 판 도중, 2026-11-27) — 교육 버튼에 마우스를 올리면 그 능력치 +3이 바꾸는 것. 화면 계산만(상태 불변) · 규칙 함수 그대로
const ROLES: Staff['role'][] = ['distiller', 'sales', 'warehouse', 'blender', 'office'];
const allRoles = (): GameState => {
  const s = newGame({ seed: 1 });
  const base = s.hr.staff[0]!;
  for (const role of ROLES) if (!s.hr.staff.some((x) => x.role === role)) s.hr.staff.push({ ...base, id: `S-${role}`, name: role, role, stats: { a: 50, b: 50, c: 50 } });
  return s;
};

describe('교육 능력치 효과 (statImpact)', () => {
  it('다섯 직군 × 능력치 셋 모두 설명이 있고 상태를 바꾸지 않는다', () => {
    const s = allRoles();
    const before = JSON.stringify(s);
    for (const role of ROLES) {
      const x = s.hr.staff.find((y) => y.role === role)!;
      for (const k of ['a', 'b', 'c'] as const) {
        const v = statImpact(s, x, k);
        expect(v.lines.length, `${role}.${k}`).toBeGreaterThan(0);
        expect(v.to).toBe(Math.min(TRAINING.statCap, x.stats[k] + TRAINING.statGain));
        expect(statImpactTitle(s, x, k).split('\n')[0]).toBe(`${v.label} ${v.from} → ${v.to}`);
      }
    }
    expect(JSON.stringify(s)).toBe(before);
  });

  it('10차 70: 영업 네트워크 +3 — 유통 커버리지 전→후가 규칙 함수 값과 같다 · 디스틸러 공정 +3 — 운전 한도', () => {
    const r = parsePlayFile(readFileSync('docs/playtest/10/distillery-mvp-standard-y6m11-202611261003.json', 'utf8')); if ('error' in r) throw new Error(r.error);
    const s = r.save;
    const sales = s.hr.staff.find((y) => y.role === 'sales')!;
    const g = { ...s, hr: { ...s.hr, staff: s.hr.staff.map((y) => (y.id === sales.id ? { ...y, stats: { ...y.stats, b: y.stats.b + 3 } } : y)) } };
    const net = statImpact(s, sales, 'b').lines.find((l) => l.startsWith('유통 커버리지'))!;
    expect(net).toContain(`${(coverage(s) * 100).toFixed(1)}% → ${(coverage(g) * 100).toFixed(1)}%`);
    const d = s.hr.staff.find((y) => y.role === 'distiller')!;
    const gd = { ...s, hr: { ...s.hr, staff: s.hr.staff.map((y) => (y.id === d.id ? { ...y, stats: { ...y.stats, b: y.stats.b + 3 } } : y)) } };
    expect(statImpact(s, d, 'b').lines).toContain(`월 증류 운전 한도 ${capacityReport(s).distillerRunsCap}회 → ${capacityReport(gd).distillerRunsCap}회`);
  });

  it('상한이면 그렇게 말한다', () => {
    const s = allRoles();
    const x = s.hr.staff.find((y) => y.role === 'office')!;
    x.stats.a = TRAINING.statCap;
    expect(statImpact(s, x, 'a').lines).toEqual([`이미 교육 상한(${TRAINING.statCap})이다`]);
  });
});
