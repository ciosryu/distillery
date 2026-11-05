import { NAME_POOLS, ROLE_INFO } from './content/catalog';
import { regionOf } from './content/regions';
import { clamp } from './flavor';
import type { Rng } from './rng';
import type { Candidate, GameState, Staff, StaffRole } from './types';
import { nid } from './util';

const ROLES: StaffRole[] = ['distiller', 'warehouse', 'sales', 'office'];

export function salaryFor(role: StaffRole, stats: Staff['stats'], level: number, laborCost = 1): number {
  const avg = (stats.a + stats.b + stats.c) / 3;
  const raw = ROLE_INFO[role].baseSalary * laborCost * (0.8 + (avg / 100) * 0.8) * (1 + 0.05 * (level - 1));
  return Math.round(raw / 10_000) * 10_000;
}

export function makeCandidate(s: GameState, rng: Rng, role?: StaffRole): Candidate {
  const r = role ?? rng.pick(ROLES);
  const stat = () => Math.round(clamp(rng.normal(45, 15), 15, 90));
  const stats = { a: stat(), b: stat(), c: stat() };
  const level = 1 + Math.floor(((stats.a + stats.b + stats.c) / 3) / 30);
  const salary = salaryFor(r, stats, level, regionOf(s).laborCost);
  const pool = NAME_POOLS[s.regionId] ?? NAME_POOLS.KR;
  return {
    id: nid(s, 'C'),
    name: `${rng.pick(pool.surnames)}${rng.pick(pool.given)}`,
    role: r, level, xp: 0, stats, salary, askSalary: salary, hiredMonth: -1,
    // 입사 나이 24~58세: 노련할수록 스탯은 높지만 은퇴(65세)가 가깝다
    ageAtHire: Math.round(clamp(rng.normal(36 + (level - 1) * 5, 7), 24, 58)),
  };
}

export function refreshCandidates(s: GameState, rng: Rng): void {
  s.candidates = ROLES.map((r) => makeCandidate(s, rng, r)).concat([makeCandidate(s, rng)]);
}

/** 월간 XP와 레벨업 */
export function gainXp(s: GameState, rng: Rng, activity: Record<StaffRole, number>): string[] {
  const notes: string[] = [];
  for (const x of s.staff) {
    x.xp += 10 + activity[x.role];
    while (x.xp >= 100 * x.level) {
      x.xp -= 100 * x.level;
      x.level += 1;
      const k = rng.pick(['a', 'b', 'c'] as const);
      x.stats[k] = Math.min(100, x.stats[k] + rng.int(2, 4));
      x.salary = Math.round((x.salary * 1.05) / 10_000) * 10_000;
      notes.push(`${x.name}(${ROLE_INFO[x.role].nameKo}) 레벨 ${x.level} 달성`);
    }
  }
  return notes;
}
