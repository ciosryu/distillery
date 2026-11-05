import type { GameState } from './types';

/**
 * 테크트리 해금 조회 (docs/design/tech-tree.md §7 아키텍처 요구사항).
 * 엔진은 선택지·설비·계약을 이 함수로 조회한다. 연구 시스템(Phase 2) 전까지는 전부 허용한다.
 * 키 예: 'build:upg_seismic_2' (방재 엔지니어링 ENG-2b로 잠글 후보)
 */
export function isUnlocked(_s: GameState, _key: string): boolean {
  return true;
}
