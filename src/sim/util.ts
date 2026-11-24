import { CASKS, EQUIPMENT } from './content/catalog';
import { caskSlots } from './rules';
import type { GameState, Staff, StaffRole } from './types';

export function nid(s: GameState, prefix: string): string {
  const id = `${prefix}${s.nextId}`;
  s.nextId += 1;
  return id;
}

/** 턴 사이 행동이 다음 결산 메모로 남길 한 줄 — 다음 틱이 그달 `MonthReport.notes` 맨 앞에 옮긴다 (`HistorySlice.pendingNotes`) */
export function queueReportNote(s: GameState, note: string): void {
  (s.history.pendingNotes ??= []).push(note);
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

/** [결정 #360] 숙성고에서 쓰는 칸 — 통마다 `caskSlots`(v16 캠페인 400L↑ 2칸, 그 밖 1칸)의 합. 빈 통도 센다. 옛 판 · 샌드박스는 통 개수와 같다 */
export function slotsUsed(s: GameState): number {
  return s.inventory.casks.reduce((t, c) => t + caskSlots(s, c.sizeL), 0);
}
/** 주문 중인 통(쿠퍼리지 · 시즈닝)이 들어오면 차지할 칸 */
export function pendingOrderSlots(s: GameState): number {
  return s.inventory.caskOrders.reduce((t, o) => t + o.qty * caskSlots(s, CASKS[o.typeId].sizeL), 0);
}
/** 이 종류 통 qty개가 차지할 칸 */
export const slotsFor = (s: GameState, typeId: keyof typeof CASKS, qty: number): number => qty * caskSlots(s, CASKS[typeId].sizeL);

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
