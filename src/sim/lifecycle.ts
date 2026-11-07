import type { GameState, Product, ProductArchiveEntry, YearSummary } from './types';

// 데이터 수명 관리 (docs/design/architecture.md §3.7) — 30년 플레이에서 세이브가 끝없이 커지지 않게.
// - 제품: 병입마다 Product가 생기고 다시 채우지 않는다 → 품절 후 팔리지 않는 제품은 아카이브(향미 객체 없이 이력만)
// - 리포트: 최근 120개월은 상세(REPORTS_KEPT), 해마다 12월에 연 요약을 남긴다

/** 품절 뒤 이 개월 수가 지나야 아카이브 (판매 화면이 직전 판매를 보여 줄 여유) */
export const ARCHIVE_AFTER_MONTHS = 3;

/** 품절·판매 없음·면세 한정판 판정 끝난 제품을 아카이브로 옮긴다 */
export function archiveSoldOutProducts(s: GameState): number {
  const keep: Product[] = [];
  let moved = 0;
  for (const p of s.commerce.products) {
    const done = p.stockBottles <= 0 && p.lastMonthSold === 0 && s.month - p.createdMonth >= ARCHIVE_AFTER_MONTHS && (!p.dfEdition || p.dfEdition.done);
    if (!done) { keep.push(p); continue; }
    const entry: ProductArchiveEntry = { id: p.id, name: p.name, category: p.category, createdMonth: p.createdMonth, lastMonthSold: p.lastMonthSold, totalSold: p.totalSold, quality: p.quality, price: p.price };
    s.commerce.productArchive.push(entry);
    moved++;
  }
  if (moved) s.commerce.products = keep;
  return moved;
}

/** 지금까지 만든 제품 수 (아카이브 포함) */
export const productCountEver = (s: GameState) => s.commerce.products.length + s.commerce.productArchive.length;

/** 12월 리포트까지 기록한 뒤 그해 요약을 남긴다 */
export function rollupYear(s: GameState, year: number): void {
  const rs = s.history.reports.filter((r) => Math.floor(r.month / 12) + s.startYear === year);
  if (!rs.length || s.history.years.some((y) => y.year === year)) return;
  const sum: YearSummary = {
    year,
    revenue: rs.reduce((t, r) => t + r.revenue, 0),
    bulkRevenue: rs.reduce((t, r) => t + r.bulkRevenue, 0),
    expenses: rs.reduce((t, r) => t + Object.values(r.expenses).reduce((a, b) => a + b, 0), 0),
    cashEnd: rs.at(-1)!.cashEnd,
    ...(rs.at(-1)!.netWorth != null ? { netWorthEnd: rs.at(-1)!.netWorth } : {}),
    bottlesSold: rs.reduce((t, r) => t + r.sales.reduce((a, x) => a + x.bottles, 0), 0),
    lpaProduced: rs.reduce((t, r) => t + r.production.reduce((a, x) => a + x.lpa, 0), 0),
    angelsShareL: rs.reduce((t, r) => t + r.angelsShareL, 0),
    filledCasksEnd: s.inventory.casks.filter((c) => c.contents).length,
  };
  s.history.years.push(sum);
}
