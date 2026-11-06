// 테크 노드 데이터 (docs/design/tech-tree.md §4·§7) — 파트 MGT. 노드 스키마는 전체 트리(약 42노드)를 넣을 그릇이다 (skeleton S-6).
// 지금은 tech-tree §1.2가 "테크 뒤로" 옮기기로 한 기능만 키를 단 4개. 나머지 노드는 단계 P(MGT)에서 넣는다. 수치는 [튜닝].

import type { StaffRole } from '../types';

export type TreeId = 'production' | 'maturation' | 'engineering' | 'business' | 'whisky' | 'white' | 'brandy' | 'tequila' | 'rum' | 'asian';

/** 연구 담당자 스탯 — 직군마다 stats a·b·c의 뜻이 다르다(ROLE_INFO.stats). 노드는 그 직군의 어느 칸을 쓰는지만 적는다 */
export type LeadStat = 'a' | 'b' | 'c';

/**
 * 해금 효과 중 게이트가 아닌 것 (tech-tree §7 TechUnlock의 loss_reduction·risk_scale·info) — 그릇만 있고 아직 적용하지 않는다.
 * 게이트(선택지·설비·계약·라벨·이벤트 선택지)는 unlockKeys가 isUnlocked 키로 표현한다
 */
export type TechEffect =
  | { kind: 'loss_reduction'; target: string; value: number }
  | { kind: 'risk_scale'; riskId: string; mul: number }
  | { kind: 'info'; target: string; sigmaMul?: number; detectAdd?: number; forecastMonths?: number };

export interface TechNodeDef {
  id: string;
  nameKo: string;
  tree: TreeId;
  /** 비용·기간 등급 (선행 깊이와 꼭 같지 않다) */
  tier: 1 | 2 | 3;
  /** 모두 충족해야 연구 가능 (AND) */
  prereq: string[];
  /** 연구 시작 조건 (tech-tree §7) — 설비 보유·가동 개월. 지역 게이팅(categoryAvailable)은 단계 P */
  requires?: { facilities?: string[]; operatingMonths?: number };
  research: {
    baseMonths: number;
    monthlyCost: number;
    /** 담당할 수 있는 직군 */
    leadRoles: StaffRole[];
    /** 진행 속도에 쓰는 담당자 스탯 칸 */
    leadStat: LeadStat;
    /** 실적 보너스 기준 (최대 +30%) — 지표 계산은 단계 P. 없으면 보너스 없음 */
    milestone?: { metric: string; target: number };
  };
  /** isUnlocked 키 — research.ts 주석의 키 규칙 */
  unlockKeys: string[];
  /** 게이트가 아닌 효과 (그릇) */
  effects?: TechEffect[];
}

/** false = 잠금 없음: 모든 키가 열려 있다 (게임 동작 불변). 연구로 해금해도 아직 바뀌는 것이 없다 — 노드·효과가 채워지는 단계 P에서 true */
export const TECH_GATING = false;

export const TECH_NODES: TechNodeDef[] = [
  { id: 'MAT-1', nameKo: '캐스크 이력 DB', tree: 'maturation', tier: 1, prereq: [], research: { baseMonths: 3, monthlyCost: 3_000_000, leadRoles: ['warehouse'], leadStat: 'a' }, unlockKeys: ['info:cask_history'] },
  { id: 'MAT-3a', nameKo: '미세기후 활용', tree: 'maturation', tier: 3, prereq: ['MAT-1'], research: { baseMonths: 6, monthlyCost: 8_000_000, leadRoles: ['warehouse'], leadStat: 'b' }, unlockKeys: ['action:rotateWarehouse'] },
  { id: 'BIZ-1b', nameKo: '캐스크 오너십', tree: 'business', tier: 1, prereq: [], research: { baseMonths: 3, monthlyCost: 4_000_000, leadRoles: ['office', 'sales'], leadStat: 'b' }, unlockKeys: ['action:sellCaskOwnership'] },
  { id: 'WHI-3', nameKo: '장인급 우드 피니시', tree: 'whisky', tier: 3, prereq: [], research: { baseMonths: 9, monthlyCost: 10_000_000, leadRoles: ['distiller'], leadStat: 'b' }, unlockKeys: ['recipe:finish=exotic', 'recipe:finish=multiple'] },
];

export const TECH_BY_ID: Record<string, TechNodeDef> = Object.fromEntries(TECH_NODES.map((n) => [n.id, n]));
