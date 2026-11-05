import { EQUIPMENT } from './content/catalog';
import type { GameState, Staff, StaffRole } from './types';

export function nid(s: GameState, prefix: string): string {
  const id = `${prefix}${s.nextId}`;
  s.nextId += 1;
  return id;
}

export function clone<T>(v: T): T {
  return structuredClone(v);
}

export function calendar(s: Pick<GameState, 'month' | 'startYear'>) {
  return { year: s.startYear + Math.floor(s.month / 12), monthOfYear: (s.month % 12) + 1 };
}

export function monthLabel(startYear: number, month: number): string {
  return `${startYear + Math.floor(month / 12)}년 ${(month % 12) + 1}월`;
}

export function isReady(s: GameState, equipmentId: string): boolean {
  const e = s.equipment.find((x) => x.id === equipmentId);
  return !!e && e.readyMonth <= s.month;
}

export function warehouseCapacity(s: GameState): number {
  return s.warehouseBase + s.equipment.reduce((sum, e) => {
    const def = EQUIPMENT[e.catalogId];
    if (!def) return sum;
    // 직판장 같은 시설은 숙성고 자리를 차지한다 (공사 중부터)
    return sum + (def.kind === 'warehouse' && e.readyMonth <= s.month ? def.casks : 0) - (def.warehouseSlots ?? 0);
  }, 0);
}

export function staffOf(s: GameState, role: StaffRole): Staff[] {
  return s.staff.filter((x) => x.role === role);
}

export function bestBy(list: Staff[], key: 'a' | 'b' | 'c'): Staff | undefined {
  return list.reduce<Staff | undefined>((best, x) => (!best || x.stats[key] > best.stats[key] ? x : best), undefined);
}

export function annuityPayment(principal: number, annualRate: number, termMonths: number): number {
  const r = annualRate / 12;
  if (r === 0) return Math.ceil(principal / termMonths);
  return Math.ceil((principal * r) / (1 - Math.pow(1 + r, -termMonths)));
}
