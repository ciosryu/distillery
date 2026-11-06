import { TECH_GATING, TECH_NODES } from './content/tech';
import type { GameState } from './types';

// 테크트리 게이트 (docs/design/tech-tree.md §7, PRD §14 Phase 1 각주)
// 모든 선택지·설비·계약·행동은 isUnlocked(state, key) 하나로 잠금을 판정한다.
// Phase 1은 연구 시스템이 없으므로 TECH_GATING = false → 항상 true (게임 동작 불변).
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
