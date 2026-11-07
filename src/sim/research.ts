import { TECH_BY_ID, TECH_FACILITY_NAMES, TECH_GATING, TECH_NODES, type TechEffect } from './content/tech';
import { EQUIPMENT } from './content/catalog';
import type { GameState, MonthReport } from './types';
import { ownsFacility } from './util';

// 테크트리 게이트 (docs/design/tech-tree.md §7, PRD §14 Phase 1 각주)
// 모든 선택지·설비·계약·행동은 isUnlocked(state, key) 하나로 잠금을 판정한다.
// TECH_GATING = false인 동안은 항상 true (게임 동작 불변). 연구 진행은 아래 runResearch (S-6).
// 키 규칙: 'action:<Action.type>' · 'facility:<catalogId>' · 'recipe:<path>=<value>' · 'label:<claimId>' · 'contract:<id>' · 'info:<target>'

/** 키 → 그 키를 해금하는 노드 id 목록 (노드 데이터에서 한 번 만든다) */
const GATES: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const n of TECH_NODES) for (const key of n.unlockKeys) m.set(key, [...(m.get(key) ?? []), n.id]);
  return m;
})();

/** 이 키가 테크로 잠겨 있는가 (어떤 노드든 이 키를 해금하면 잠긴 키다) */
export const isGated = (key: string): boolean => GATES.has(key);

export function isUnlocked(s: Pick<GameState, 'research'>, key: string, gating: boolean = TECH_GATING): boolean {
  if (!gating) return true;
  const nodes = GATES.get(key);
  if (!nodes) return true;
  return nodes.some((id) => s.research.unlocked.includes(id));
}

/** 이 키를 해금하는 노드 (UI 안내용: "MAT-3a 미세기후 활용 연구 필요") */
export function unlockingNodes(key: string): { id: string; nameKo: string }[] {
  return (GATES.get(key) ?? []).map((id) => TECH_NODES.find((n) => n.id === id)!).map((n) => ({ id: n.id, nameKo: n.nameKo }));
}

// ───────────── 연구 진행 (skeleton S-6, #149, tech-tree §2.1) ─────────────
// 연구 = 기간 + 월 연구비(현금) + 담당자. 'R&D 포인트' 화폐는 없다(#46).
// 진행도/월 = (1 / 기본기간) × (1 + 담당 스탯 / 200) × 실적 보너스(지표는 단계 P — 지금 1).
// 일시정지·담당자 없음 = 진행·비용 정지. 담당자가 떠나면 진행도 −25%. 연구 중 본업 효율 −30%는 단계 P(생산·영업 쪽 규칙)

/** 연구 수치 `[튜닝]` */
export const RESEARCH = {
  /** 담당 스탯 이만큼마다 속도 +100% (스탯 100 = +50%) */
  statDivisor: 200,
  /** 담당자가 떠나면 잃는 진행도 */
  departureSetback: 0.25,
};

/** 연구 요건 설비 이름 — 카탈로그에 있으면 그 이름, 아직 없는 설비는 "(아직 게임에 없음)"을 붙인다 */
export function facilityName(id: string): string {
  const def = EQUIPMENT[id];
  if (def) return def.nameKo;
  return `${TECH_FACILITY_NAMES[id] ?? id} (아직 게임에 없음)`;
}

/** 연구를 시작할 수 없는 이유 (없으면 null) */
export function researchBlocker(s: GameState, techId: string, leadStaffId?: string): string | null {
  const node = TECH_BY_ID[techId];
  if (!node) return '알 수 없는 연구입니다';
  if (s.research.unlocked.includes(techId)) return '이미 완료한 연구입니다';
  if (s.research.active.some((a) => a.techId === techId)) return '이미 진행 중입니다';
  const missing = node.prereq.filter((p) => !s.research.unlocked.includes(p));
  if (missing.length) return `선행 연구가 필요합니다: ${missing.map((id) => TECH_BY_ID[id]?.nameKo ?? id).join(', ')}`;
  if (s.research.active.length >= s.research.slots) return `연구 슬롯이 꽉 찼습니다 (${s.research.slots}개)`;
  const fac = (node.requires?.facilities ?? []).filter((id) => !ownsFacility(s, id));
  if (fac.length) return `설비가 필요합니다: ${fac.map(facilityName).join(', ')}`;
  if (node.requires?.operatingMonths && s.month < node.requires.operatingMonths) return `가동 ${node.requires.operatingMonths}개월이 지나야 합니다`;
  if (leadStaffId) {
    const lead = s.hr.staff.find((x) => x.id === leadStaffId);
    if (!lead) return '담당자가 없습니다';
    if (!node.research.leadRoles.includes(lead.role)) return `담당 직군이 아닙니다 (${node.research.leadRoles.join('·')})`;
    if (s.research.active.some((a) => a.leadStaffId === leadStaffId)) return '이 직원은 이미 다른 연구를 맡고 있습니다';
  }
  return null;
}

/** 이번 달 진행도 증가분 */
export function researchRate(s: GameState, techId: string, leadStaffId?: string): number {
  const node = TECH_BY_ID[techId];
  const lead = s.hr.staff.find((x) => x.id === leadStaffId);
  if (!node || !lead) return 0;
  return (1 / node.research.baseMonths) * (1 + lead.stats[node.research.leadStat] / RESEARCH.statDivisor);
}

/** 틱 8단계: 담당자 확인 → 월 연구비 → 진행 → 완료 시 해금. 진행 중인 연구가 없으면 아무 일도 하지 않는다 */
export function runResearch(s: GameState, report: MonthReport): void {
  for (const a of s.research.active) {
    const node = TECH_BY_ID[a.techId];
    if (!node) continue;
    if (a.leadStaffId && !s.hr.staff.some((x) => x.id === a.leadStaffId)) {
      a.progress = Math.max(0, a.progress - RESEARCH.departureSetback);
      a.leadStaffId = undefined;
      report.notes.push(`연구 "${node.nameKo}" 담당자가 떠났습니다 — 진행도 −${RESEARCH.departureSetback * 100}%, 새 담당자가 필요합니다`);
    }
    if (a.paused || !a.leadStaffId) continue;
    const cost = node.research.monthlyCost;
    s.finance.cash -= cost;
    report.expenses.research = (report.expenses.research ?? 0) + cost;
    a.spent = (a.spent ?? 0) + cost;
    a.progress = Math.min(1, a.progress + researchRate(s, a.techId, a.leadStaffId));
  }
  const done = s.research.active.filter((a) => a.progress >= 1);
  for (const a of done) {
    s.research.unlocked.push(a.techId);
    report.notes.push(`연구 완료: ${TECH_BY_ID[a.techId]?.nameKo ?? a.techId}`);
  }
  if (done.length) s.research.active = s.research.active.filter((a) => a.progress < 1);
}

// ───────────── 효과 조회 (#170, tech-tree §4 "손실 감소"·§1 P2·P3) ─────────────
// 해금한 노드의 effects를 모아 읽는다. 게이트(TECH_GATING)와 상관없이 연구를 끝내야 적용된다 — 효과는 잠금이 아니라 노하우다.
// 읽는 쪽(생산 손실·숙성 감지·이벤트 리스크)은 담당 파트가 붙인다. 아직 아무도 읽지 않아 게임 동작은 그대로다.

function unlockedEffects(s: Pick<GameState, 'research'>): TechEffect[] {
  return s.research.unlocked.flatMap((id) => TECH_BY_ID[id]?.effects ?? []);
}

/** 손실 배수 — 실제 손실 = 기본 손실 × 이 값. 여러 노드는 곱으로 쌓여 이론 수율을 넘지 않는다 (tech-tree §4 머리말). 해당 효과가 없으면 1 */
export function lossReductionMul(s: Pick<GameState, 'research'>, target: string): number {
  return unlockedEffects(s).reduce((m, e) => (e.kind === 'loss_reduction' && e.target === target ? m * (1 - e.value) : m), 1);
}

/** 리스크 배수 — 확률·피해 크기에 곱한다. 0(면역)은 데이터에 두지 않는다(P3) */
export function riskMul(s: Pick<GameState, 'research'>, riskId: string): number {
  return unlockedEffects(s).reduce((m, e) => (e.kind === 'risk_scale' && e.riskId === riskId ? m * e.mul : m), 1);
}

/** 정보 효과 — 관측 오차 배수(곱), 감지 확률 가산(합), 예측 기간(최댓값). P2: 결과 확률이 아니라 정보만 바꾼다 */
export function infoBonus(s: Pick<GameState, 'research'>, target: string): { sigmaMul: number; detectAdd: number; forecastMonths: number } {
  const out = { sigmaMul: 1, detectAdd: 0, forecastMonths: 0 };
  for (const e of unlockedEffects(s)) {
    if (e.kind !== 'info' || e.target !== target) continue;
    out.sigmaMul *= e.sigmaMul ?? 1;
    out.detectAdd += e.detectAdd ?? 0;
    out.forecastMonths = Math.max(out.forecastMonths, e.forecastMonths ?? 0);
  }
  return out;
}
