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
  const e = s.production.equipment.find((x) => x.id === equipmentId);
  return !!e && e.readyMonth <= s.month;
}

export function warehouseCapacity(s: GameState): number {
  return s.inventory.warehouseBase + s.production.equipment.reduce((sum, e) => {
    const def = EQUIPMENT[e.catalogId];
    return sum + (def?.kind === 'warehouse' && e.readyMonth <= s.month ? def.casks : 0);
  }, 0);
}

export function staffOf(s: GameState, role: StaffRole): Staff[] {
  return s.hr.staff.filter((x) => x.role === role);
}

export function bestBy(list: Staff[], key: 'a' | 'b' | 'c'): Staff | undefined {
  return list.reduce<Staff | undefined>((best, x) => (!best || x.stats[key] > best.stats[key] ? x : best), undefined);
}

export function annuityPayment(principal: number, annualRate: number, termMonths: number): number {
  const r = annualRate / 12;
  if (r === 0) return Math.ceil(principal / termMonths);
  return Math.ceil((principal * r) / (1 - Math.pow(1 + r, -termMonths)));
}

// ───────────── 설비 보유 조회 (옛 ops.ts) (결정 #144 — 파일 쪼개기로 옮겨 왔다) ─────────────

/** 이 설비를 갖고 있고 가동 중인가 (생산·이벤트·블렌딩이 함께 쓴다) */
export const ownsFacility = (s: GameState, id: string) => s.production.equipment.some((e) => e.catalogId === id && e.readyMonth <= s.month);
