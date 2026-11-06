import { BRANDS } from './content/market';
import { nid } from './util';
import type { BrandLine, GameState, Product } from './types';

// 브랜드 라인 (파트 MKT, skeleton S-2 #148 · PRD §11.2 ④) — 인지도를 읽고 쓰는 곳은 모두 이 접근자를 거친다.
// 세컨드 브랜드 규칙(개설·배정·폐지·브랜드별 마케팅비·유지비)은 제안 P-MKT-2. 인지도 성장식은 market.ts updateAwareness

/** 하우스 브랜드 id — 고정값이라 세이브·마이그레이션 사이에 안 바뀐다 */
export const HOUSE_BRAND_ID = 'house';

/** 하우스 브랜드 (회사명). 항상 있다 */
export const houseBrand = (s: Pick<GameState, 'commerce'>): BrandLine => s.commerce.brands.find((b) => b.isHouse)!;

/** 세컨드 브랜드들 (개설 순) */
export const secondBrands = (s: Pick<GameState, 'commerce'>): BrandLine[] => s.commerce.brands.filter((b) => !b.isHouse);

/** 제품이 속한 브랜드 — brandId가 없거나 모르는 id면 하우스 */
export const brandOf = (s: Pick<GameState, 'commerce'>, p: Pick<Product, 'brandId'>): BrandLine =>
  (p.brandId ? s.commerce.brands.find((b) => b.id === p.brandId) : undefined) ?? houseBrand(s);

/** 인지도 — 제품을 주면 그 제품의 브랜드, 안 주면 하우스(회사 단위로 쓰는 곳: 관광·이벤트·오너십·수출 후광·판정) */
export const awarenessOf = (s: Pick<GameState, 'commerce'>, p?: Pick<Product, 'brandId'>): number => (p ? brandOf(s, p) : houseBrand(s)).awareness;

/** 브랜드의 월 마케팅비 — 하우스는 commerce.marketingBudget, 세컨드는 브랜드별 */
export const brandMarketing = (s: Pick<GameState, 'commerce'>, b: BrandLine): number => (b.isHouse ? s.commerce.marketingBudget : b.marketingBudget ?? 0);

/** 세컨드 브랜드의 이번 달 고정 지출 (유지비 + 마케팅비). 판매 단계가 낸다 */
export const secondBrandMonthlyCost = (s: Pick<GameState, 'commerce'>): number =>
  secondBrands(s).reduce((t, b) => t + BRANDS.monthlyUpkeep + (b.marketingBudget ?? 0), 0);

/** 세컨드 브랜드 개설 — 개설비를 내고, 하우스 인지도의 s배에서 시작한다(#52). 실패하면 사유 문자열 */
export function openSecondBrand(s: GameState, rawName: string): BrandLine | string {
  const name = rawName.trim();
  if (!name) return '브랜드 이름을 입력하세요';
  if (name.length > BRANDS.maxNameLength) return `브랜드 이름은 ${BRANDS.maxNameLength}자까지입니다`;
  if (s.commerce.brands.some((b) => b.name === name) || name === s.distilleryName) return '이미 있는 브랜드 이름입니다';
  if (s.finance.cash < BRANDS.openCost) return `현금이 부족합니다 (개설비 ${BRANDS.openCost.toLocaleString()}원)`;
  s.finance.cash -= BRANDS.openCost;
  const b: BrandLine = { id: nid(s, 'brand'), name, isHouse: false, openedMonth: s.month, awareness: BRANDS.spillover * houseBrand(s).awareness, luxury: 0, marketingBudget: 0 };
  s.commerce.brands.push(b);
  return b;
}

/** 제품을 다른 브랜드로 옮기는 비용 — 아직 한 병도 안 판 제품은 무료(출시 전 라벨 선택), 판 적 있으면 고정비 + 남은 재고 병당 */
export const rebrandCost = (p: Pick<Product, 'totalSold' | 'stockBottles'>): number => (p.totalSold > 0 ? BRANDS.rebrandFixed + BRANDS.rebrandPerBottle * p.stockBottles : 0);

/** 제품 배정 — 판매 시점 브랜드 기준으로 인지도가 쌓이므로 과거 판매분의 영향은 원래 브랜드에 남는다. 실패하면 사유, 성공하면 낸 비용 */
export function assignProductBrand(s: GameState, productId: string, brandId: string): number | string {
  const p = s.commerce.products.find((x) => x.id === productId);
  if (!p) return '제품이 없습니다';
  const to = s.commerce.brands.find((b) => b.id === brandId);
  if (!to) return '브랜드가 없습니다';
  if (brandOf(s, p).id === to.id) return `이미 ${to.name} 브랜드입니다`;
  const cost = rebrandCost(p);
  if (s.finance.cash < cost) return `현금이 부족합니다 (리브랜딩 ${cost.toLocaleString()}원)`;
  s.finance.cash -= cost;
  if (to.isHouse) delete p.brandId;
  else p.brandId = to.id;
  return cost;
}

/** 세컨드 브랜드 폐지 — 재고가 남은 제품이 있으면 못 한다. 남은(재고 0) 제품·보관 제품은 하우스로 돌아간다(brandOf 기본값) */
export function closeSecondBrand(s: GameState, brandId: string): BrandLine | string {
  const b = s.commerce.brands.find((x) => x.id === brandId);
  if (!b || b.isHouse) return '폐지할 수 있는 세컨드 브랜드가 아닙니다';
  const live = s.commerce.products.filter((p) => p.brandId === b.id && p.stockBottles > 0);
  if (live.length) return `재고가 남은 제품이 있습니다 (${live.map((p) => p.name).join(', ')}) — 다 팔거나 다른 브랜드로 옮기세요`;
  for (const p of s.commerce.products) if (p.brandId === b.id) delete p.brandId;
  s.commerce.brands = s.commerce.brands.filter((x) => x.id !== b.id);
  return b;
}
