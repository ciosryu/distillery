import type { BrandLine, GameState, Product } from './types';

// 브랜드 라인 (파트 MKT, skeleton S-2, P-ARCH-11) — 인지도를 읽고 쓰는 곳은 모두 이 접근자를 거친다.
// 지금은 하우스 브랜드 하나뿐이라 동작은 옛 회사 인지도와 같다. 세컨드 브랜드 개설·배정·브랜드별 성장(PRD §11.2 ④)은 단계 P(MKT)

/** 하우스 브랜드 id — 고정값이라 세이브·마이그레이션 사이에 안 바뀐다 */
export const HOUSE_BRAND_ID = 'house';

/** 하우스 브랜드 (회사명). 항상 있다 */
export const houseBrand = (s: Pick<GameState, 'commerce'>): BrandLine => s.commerce.brands.find((b) => b.isHouse)!;

/** 제품이 속한 브랜드 — brandId가 없거나 모르는 id면 하우스 */
export const brandOf = (s: Pick<GameState, 'commerce'>, p: Pick<Product, 'brandId'>): BrandLine =>
  (p.brandId ? s.commerce.brands.find((b) => b.id === p.brandId) : undefined) ?? houseBrand(s);

/** 인지도 — 제품을 주면 그 제품의 브랜드, 안 주면 하우스(회사 단위로 쓰는 곳: 관광·이벤트·오너십·수출 후광·판정) */
export const awarenessOf = (s: Pick<GameState, 'commerce'>, p?: Pick<Product, 'brandId'>): number => (p ? brandOf(s, p) : houseBrand(s)).awareness;
