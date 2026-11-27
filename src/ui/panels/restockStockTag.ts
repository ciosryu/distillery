// [P-PROD-76] 10차 판 오너: 「기존 제품 재고 보충」 「보충할 제품」 메뉴에서 결품 · 결품 예정 제품을 색으로 — 화면 · 읽기만
// 기준은 할 일 `stockout`과 같은 `stockoutSoon`(아는 품질로 센 이번 달 국내 수요 — F5d · I2). 판매 탭 「약 n개월 치」로는 「1개월 치 미만」에 해당한다
import type { GameState, Product } from '../../sim';
import { stockoutSoon } from '../alerts';

export type RestockStockTag = { kind: 'empty' | 'soon'; mark: string; cls: string };

/** 결품(재고 0) — 맨 위 · 빨강. 할 일의 「품절」(최근 12개월 판 제품만)보다 넓다: 보충 메뉴에서는 재고 0이면 모두 결품이다 */
export const RESTOCK_TAG_EMPTY: RestockStockTag = { kind: 'empty', mark: '● 결품', cls: 'text-red-700 dark:text-red-400' };
/** 결품 예정 — 재고 < 이번 달 수요(다음 턴에 바닥) · 호박색 */
export const RESTOCK_TAG_SOON: RestockStockTag = { kind: 'soon', mark: '▲ 다음 달 결품', cls: 'text-amber-700 dark:text-amber-400' };

/** 제품 id → 꼬리표(없으면 넣지 않는다) */
export function restockStockTags(s: GameState): Map<string, RestockStockTag> {
  const out = new Map<string, RestockStockTag>();
  for (const p of s.commerce.products) if (!p.dutyFreeOnly && p.stockBottles <= 0) out.set(p.id, RESTOCK_TAG_EMPTY);
  for (const x of stockoutSoon(s).soon) if (!out.has(x.id)) out.set(x.id, RESTOCK_TAG_SOON);
  return out;
}

/** 결품 → 결품 예정 → 나머지(같은 칸 안에서는 원래 순서) */
export function sortByStockTag<P extends Pick<Product, 'id'>>(ps: P[], tags: Map<string, RestockStockTag>): P[] {
  const rank = (p: P) => { const t = tags.get(p.id)?.kind; return t === 'empty' ? 0 : t === 'soon' ? 1 : 2; };
  return ps.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p);
}
