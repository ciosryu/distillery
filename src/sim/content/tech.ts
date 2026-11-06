// 테크 노드 데이터 (docs/design/tech-tree.md §4·§7). Phase 1: 게이트 구조만 — 연구 진행 로직은 Phase 2.
// 지금 코드에 이미 있는 기능 중 tech-tree §1.2가 "테크 뒤로" 옮기기로 한 것만 키를 단다. 수치는 [튜닝].

export type TreeId = 'production' | 'maturation' | 'engineering' | 'business' | 'whisky' | 'white' | 'brandy' | 'tequila' | 'rum' | 'asian';

export interface TechNodeDef {
  id: string;
  nameKo: string;
  tree: TreeId;
  tier: 1 | 2 | 3;
  /** 모두 충족해야 연구 가능 (AND) */
  prereq: string[];
  research: { baseMonths: number; monthlyCost: number; leadRoles: string[] };
  /** isUnlocked 키 — research.ts 주석의 키 규칙 */
  unlockKeys: string[];
}

/** false = Phase 1: 모든 키가 열려 있다 (게임 동작 불변). 연구 시스템을 넣을 때 true */
export const TECH_GATING = false;

export const TECH_NODES: TechNodeDef[] = [
  { id: 'MAT-1', nameKo: '캐스크 이력 DB', tree: 'maturation', tier: 1, prereq: [], research: { baseMonths: 3, monthlyCost: 3_000_000, leadRoles: ['warehouse'] }, unlockKeys: ['info:cask_history'] },
  { id: 'MAT-3a', nameKo: '미세기후 활용', tree: 'maturation', tier: 3, prereq: ['MAT-1'], research: { baseMonths: 6, monthlyCost: 8_000_000, leadRoles: ['warehouse'] }, unlockKeys: ['action:rotateWarehouse'] },
  { id: 'BIZ-1b', nameKo: '캐스크 오너십', tree: 'business', tier: 1, prereq: [], research: { baseMonths: 3, monthlyCost: 4_000_000, leadRoles: ['office', 'sales'] }, unlockKeys: ['action:sellCaskOwnership'] },
  { id: 'WHI-3', nameKo: '장인급 우드 피니시', tree: 'whisky', tier: 3, prereq: [], research: { baseMonths: 9, monthlyCost: 10_000_000, leadRoles: ['distiller'] }, unlockKeys: ['recipe:finish=exotic', 'recipe:finish=multiple'] },
];
