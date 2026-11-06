import type { GameState, ProductCategory } from './types';

// 경쟁 AI 증류소 (파트 META, skeleton S-12, PRD §9.4) — 자리와 수요 공식의 훅만.
// 지금은 배경 공급(원재료·원액 시세 랜덤 워크, 공급 과잉 이벤트)이 시장을 대신한다(§9.4 "경쟁 AI 이전 단계").
// 경쟁 AI를 넣을 때(Phase 5) 배경 공급의 일부를 개별 증류소(world.rivals)로 바꾸고, 시장 몫 규칙을 여기에 둔다. 틱은 8단계(성장)

/** 이 카테고리 국내 시장에서 경쟁 증류소가 가져가는 몫 0~1. 수요 공식이 시장 크기에 (1 − 몫)을 곱한다 */
export function rivalShare(s: Pick<GameState, 'world'>, category: ProductCategory): number {
  const rivals = s.world.rivals.filter((r) => r.categories.includes(category));
  if (!rivals.length) return 0;
  // 규칙(인지도·품질로 몫 나누기)은 단계 P — 그때까지 경쟁 증류소를 만드는 코드도 없다
  return 0;
}
