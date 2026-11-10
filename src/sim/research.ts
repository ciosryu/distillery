import { TECH_BY_ID, TECH_FACILITY_NAMES, TECH_GATING, TECH_NODES, type TechEffect, type TreeId } from './content/tech';
import { EQUIPMENT } from './content/catalog';
import type { GameState, MonthReport, ProductCategory } from './types';
import { ownsFacility } from './util';

// 테크트리 게이트 (docs/design/tech-tree.md §7, PRD §14 Phase 1 각주)
// 모든 선택지·설비·계약·행동은 isUnlocked(state, key) 하나로 잠금을 판정한다.
// TECH_GATING = true(#174, content/tech.ts) — 테크 키는 연구를 끝내야 열린다. false면 항상 true. 연구 진행은 아래 runResearch (S-6).
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
// 진행도/월 = (1 / 기본기간) × (1 + 담당 스탯 / 200) × 실적 보너스(아래 milestoneBonus, #218).
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

// ───────────── 실적 보너스 (#218, tech-tree §2.1 "해 보면서 배운다") ─────────────
// 실적 보너스 = 1 + min(MAX, 누적 실적 / 기준 × MAX). 실적은 이미 세이브에 있는 누적 기록으로 센다(스키마 변경 없음 — 안 A):
// 연 요약(history.years) + 아직 연 요약에 들어가지 않은 올해 월 리포트, 제품·보관 제품의 누적 판매 병 수, 지금 숙성 중인 통 수.
// 연구 시작 전에 쌓은 실적도 센다. 연구 중에도 실적이 늘면 보너스가 오른다

/** 실적 지표 */
export type MetricId = 'lpa' | 'casks' | 'bottles' | 'bottles:whisky' | 'bottles:white' | 'bottles:asian';

/** 최대 보너스 (+30%) [튜닝] */
export const MILESTONE_MAX = 0.3;

/** 계통별 지표 — 노드에 research.milestone이 있으면 그것을 먼저 쓴다 */
export const TREE_METRIC: Record<TreeId, MetricId> = {
  production: 'lpa', engineering: 'lpa', maturation: 'casks', business: 'bottles',
  whisky: 'bottles:whisky', white: 'bottles:white', asian: 'bottles:asian',
  // 아직 노드가 없는 계통 — 노드가 생기면 그 주종 판매로 바꾼다
  brandy: 'bottles', tequila: 'bottles', rum: 'bottles',
};

/** 지표별 기준 실적 [T1, T2, T3] [튜닝] — 4차 MVP 판 감각: 생산 연 약 5,200 LPA, 판매 5년 누적 약 5만 병 */
export const MILESTONE_TARGETS: Record<MetricId, [number, number, number]> = {
  lpa: [5_000, 15_000, 40_000],
  casks: [20, 50, 100],
  bottles: [5_000, 20_000, 60_000],
  'bottles:whisky': [3_000, 10_000, 30_000],
  'bottles:white': [3_000, 10_000, 30_000],
  'bottles:asian': [3_000, 10_000, 30_000],
};

export const METRIC_LABEL: Record<MetricId, { nameKo: string; unit: string }> = {
  lpa: { nameKo: '누적 생산', unit: 'LPA' },
  casks: { nameKo: '숙성 중인 통', unit: '통' },
  bottles: { nameKo: '누적 판매', unit: '병' },
  'bottles:whisky': { nameKo: '위스키 누적 판매', unit: '병' },
  'bottles:white': { nameKo: '진·화이트 누적 판매', unit: '병' },
  'bottles:asian': { nameKo: '소주·백주 누적 판매', unit: '병' },
};

const METRIC_CATEGORIES: Partial<Record<MetricId, ProductCategory[]>> = {
  'bottles:whisky': ['whisky', 'grain_whisky', 'blended_whisky', 'malt_spirit'],
  'bottles:white': ['gin', 'flavored_spirit'],
  'bottles:asian': ['soju_distilled', 'baijiu'],
};

/** 연 요약에 아직 들어가지 않은 월 리포트 (올해) */
function unrolledReports(s: Pick<GameState, 'history' | 'startYear'>) {
  const rolled = new Set(s.history.years.map((y) => y.year));
  return s.history.reports.filter((r) => !rolled.has(Math.floor(r.month / 12) + s.startYear));
}

/** 지금까지의 실적 — 상태를 바꾸지 않는다 */
export function researchMetric(s: Pick<GameState, 'history' | 'startYear' | 'inventory' | 'commerce'>, metric: MetricId): number {
  if (metric === 'casks') return s.inventory.casks.filter((c) => c.contents).length;
  if (metric === 'lpa') return s.history.years.reduce((t, y) => t + y.lpaProduced, 0) + unrolledReports(s).reduce((t, r) => t + r.production.reduce((a, x) => a + x.lpa, 0), 0);
  if (metric === 'bottles') return s.history.years.reduce((t, y) => t + y.bottlesSold, 0) + unrolledReports(s).reduce((t, r) => t + r.sales.reduce((a, x) => a + x.bottles, 0), 0);
  const cats = new Set<string>(METRIC_CATEGORIES[metric] ?? []);
  return [...s.commerce.products, ...s.commerce.productArchive].reduce((t, p) => t + (cats.has(p.category) ? p.totalSold : 0), 0);
}

/** 노드의 실적 보너스 (0 ~ MILESTONE_MAX) — 지표·현재 실적·기준도 돌려준다(화면용) */
export function milestoneBonus(s: Pick<GameState, 'history' | 'startYear' | 'inventory' | 'commerce'>, techId: string): { bonus: number; metric: MetricId; value: number; target: number } | null {
  const node = TECH_BY_ID[techId];
  if (!node) return null;
  const metric = (node.research.milestone?.metric as MetricId | undefined) ?? TREE_METRIC[node.tree];
  const target = node.research.milestone?.target ?? MILESTONE_TARGETS[metric][Math.min(3, Math.max(1, node.tier)) - 1]!;
  const value = researchMetric(s, metric);
  return { bonus: Math.min(MILESTONE_MAX, (value / target) * MILESTONE_MAX), metric, value, target };
}

/** 이번 달 진행도 증가분 */
export function researchRate(s: GameState, techId: string, leadStaffId?: string): number {
  const node = TECH_BY_ID[techId];
  const lead = s.hr.staff.find((x) => x.id === leadStaffId);
  if (!node || !lead) return 0;
  return (1 / node.research.baseMonths) * (1 + lead.stats[node.research.leadStat] / RESEARCH.statDivisor) * (1 + (milestoneBonus(s, techId)?.bonus ?? 0));
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
