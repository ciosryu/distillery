import { BOTTLES, BOXES, CLOSURES, LABEL_COLORS, LABELS, PACKAGING_LUXURY_MAX, PACKAGING_PRESETS, WAX, type PackagingChoice } from './content/packaging';
import type { BottleMl } from './content/market';
import type { Product, ProductPackaging } from './types';

// ───────────── 병입 패키징 커스터마이징 (#248, 2026-11-10 오너 요청) ─────────────
// 부품 조합 → 병당 포장 원가·패키징 럭셔리(0~30). 병입 순간에 제품에 고정한다(Product.packaging) — 뒤에 카탈로그 수치를 바꿔도 만든 제품은 그대로.
// 옛 제품(필드 없음)은 packagingId 프리셋에서 읽는다(세이브를 고쳐 쓰지 않는다). MKT는 아래 접근자로 수요에 반영한다(판매 공식은 MKT 몫)

/** 고른 조합이 안 되는 이유 — 되면 null */
export function packagingError(c: PackagingChoice, bottleMl: number): string | null {
  if (!BOTTLES[c.bottle] || !CLOSURES[c.closure] || !LABELS[c.label] || !BOXES[c.box]) return '알 수 없는 패키징 부품입니다';
  if (c.wax && c.closure !== 'cork') return '왁스 실링은 코르크 마개에만 씌울 수 있습니다(스크류 캡과 같이 못 씀)';
  if (c.labelColor && !(LABEL_COLORS as readonly string[]).includes(c.labelColor)) return '알 수 없는 라벨 색입니다';
  if (BOTTLES[c.bottle].costBySize[bottleMl as BottleMl] == null) return `${bottleMl}ml 병은 이 패키징이 없습니다`;
  return null;
}

/** 병당 포장 원가(이벤트·입지 할증 전) */
export function packagingPartsCost(c: PackagingChoice, bottleMl: number): number {
  const ml = bottleMl as BottleMl;
  return BOTTLES[c.bottle].costBySize[ml] + CLOSURES[c.closure].costBySize[ml] + (c.wax ? WAX.costBySize[ml] : 0) + LABELS[c.label].costBySize[ml] + BOXES[c.box].costBySize[ml];
}

/** 패키징 럭셔리 0~30 */
export function packagingPartsLuxury(c: PackagingChoice): number {
  return Math.min(PACKAGING_LUXURY_MAX, BOTTLES[c.bottle].luxury + CLOSURES[c.closure].luxury + (c.wax ? WAX.luxury : 0) + LABELS[c.label].luxury + BOXES[c.box].luxury);
}

/** 기존 패키징 id에 맞는 조합 — 모르는 id는 스탠다드 */
export const presetChoice = (packagingId: string): PackagingChoice => PACKAGING_PRESETS[packagingId] ?? PACKAGING_PRESETS.standard!;

/** 조합에 가장 가까운 기존 id — 옛 공식(packagingId를 읽는 곳)이 접근자로 바뀌기 전까지 쓰는 근사: 15점 이상이면 premium */
export const nearestPresetId = (c: PackagingChoice): string => {
  for (const [id, p] of Object.entries(PACKAGING_PRESETS)) if (sameChoice(p, c)) return id;
  return packagingPartsLuxury(c) >= PACKAGING_LUXURY_MAX / 2 ? 'premium' : 'standard';
};

/** 병입이 제품에 고정할 값 */
export function fixPackaging(c: PackagingChoice, bottleMl: number): ProductPackaging {
  return { bottle: c.bottle, closure: c.closure, ...(c.wax ? { wax: true } : {}), label: c.label, box: c.box, ...(c.labelColor ? { labelColor: c.labelColor } : {}), luxury: packagingPartsLuxury(c), costPerBottle: packagingPartsCost(c, bottleMl) };
}

/** 같은 패키징인가 — 라벨 색은 보기만이라 비교하지 않는다(재고 보충 판정) */
export const sameChoice = (a: PackagingChoice, b: PackagingChoice) => a.bottle === b.bottle && a.closure === b.closure && !!a.wax === !!b.wax && a.label === b.label && a.box === b.box;

/** 제품의 패키징 — 고정값이 있으면 그것, 없으면(옛 제품) packagingId 프리셋 */
export function productPackaging(p: Pick<Product, 'packaging' | 'packagingId' | 'bottleMl'>): ProductPackaging {
  return p.packaging ?? fixPackaging(presetChoice(p.packagingId), p.bottleMl);
}

/** [접근자 — MKT용] 패키징 럭셔리 0~30. 스탠다드 0 · 디캔터+케이스 30 — 브랜드 럭셔리(#235 BRAND_LUXURY.packaging)와 같은 값 */
export const packagingLuxury = (p: Pick<Product, 'packaging' | 'packagingId' | 'bottleMl'>): number => productPackaging(p).luxury;

/** [접근자 — MKT용] 매력도 배수 — 지금 판매 공식의 PACKAGING[id].luxury(1.0 / 1.15)와 같은 값을 0~30점에서 선형으로 낸다 */
export const packagingAppealFactor = (p: Pick<Product, 'packaging' | 'packagingId' | 'bottleMl'>): number => 1 + 0.15 * (packagingLuxury(p) / PACKAGING_LUXURY_MAX);
