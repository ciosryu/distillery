import type { GameState, MonthReport } from './types';

// 투자·캐스크 오너십 (상품 데이터는 content/finance.ts) (파트 MGT, 결정 #144 — 파일 쪼개기로 옮겨 왔다. 규칙·수치 불변)

// ───────────── 자금 조달: 투자·캐스크 오너십 ─────────────

/** 캐스크 오너십 판매가 = 현물가 × (1.3 + 0.8 × 인지도) × (0.9 + 하우스 스타일/500). 고객은 8년 숙성 시점에 인도받는다 */
export const OWNERSHIP = { premiumBase: 1.3, premiumAwareness: 0.8, deliverAtMonths: 96, minDeliverWait: 12, oversellShare: 0.25, oversellAppeal: 0.9 };

export function ownershipOversold(s: GameState): boolean {
  const filled = s.inventory.casks.filter((c) => c.contents);
  return filled.length > 0 && filled.filter((c) => c.owner).length / filled.length > OWNERSHIP.oversellShare;
}

export function deliverOwnedCasks(s: GameState, report: MonthReport): void {
  const due = s.inventory.casks.filter((c) => c.owner && c.owner.deliverMonth <= s.month);
  for (const c of due) report.notes.push(`캐스크 오너십: ${c.owner!.name} 고객에게 캐스크 ${c.id} 인도`);
  if (due.length) s.inventory.casks = s.inventory.casks.filter((c) => !due.includes(c));
}
