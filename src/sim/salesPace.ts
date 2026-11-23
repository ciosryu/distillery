// 범주 판매 속도 — 의존 없는 잎 모듈 (파트 PROD, #740 P-PROD-64 · MKT 대행으로 옮김 P-MKT-43 ①).
// 왜 따로: deals.ts(납품 제안 물량)가 economics.ts에서 가져오면 deals → economics → production → deals 순환이 생긴다.
// `rules.ts`와 같은 까닭(초기화 순서 오류 예방). types만 본다 — 어디서든 안전하게 부를 수 있다. economics.ts가 다시 내보낸다
import type { GameState, ProductCategory } from './types';

/** 이 범주의 판매 속도(병/월) — 최근 12개월 안에서 판매가 있었던 달 3개의 평균(품절 달 제외). 판매 기록이 없으면 null */
export function categoryMonthlySales(s: Pick<GameState, 'commerce' | 'history'>, category: ProductCategory): number | null {
  const ids = new Set([...s.commerce.products, ...(s.commerce.productArchive ?? [])].filter((p) => p.category === category).map((p) => p.id));
  const recent = s.history.reports.slice(-SALES_LOOKBACK.months);
  if (!recent.length) return null;
  // 품절 달은 판매도 수요도 기록되지 않는다(domesticDemands·runSales가 재고 0을 건너뜀, MKT #733) → 0인 달을 평균에 넣으면 품절일수록 속도가 낮아 보인다.
  // 7차 판 끝: 위스키가 다 품절이라 연 1,560병 → 공급 전망이 "남아 쌓임", 생산 되돌리기 안내(#725)와 엇갈렸다. 판매가 있었던 달만 최근 n개를 평균한다
  const per = recent.map((r) => r.sales.filter((x) => ids.has(x.productId)).reduce((u, x) => u + x.bottles, 0)).filter((n) => n > 0).slice(-SALES_LOOKBACK.soldMonths);
  return per.length ? per.reduce((a, n) => a + n, 0) / per.length : null;
}
/** 범주 판매 속도 — 최근 months개월 안에서 판매가 있었던 달 soldMonths개의 평균 (품절 달 제외, PROD 2026-11-20 · MKT #733 (가)) */
export const SALES_LOOKBACK = { months: 12, soldMonths: 3 } as const;

/**
 * 이 범주의 **수요 속도**(병/월, 재고가 있었다면) — 판매가 있었던 달마다 max(판매, 기록된 수요 `demandBottles`)를 더해, 최근 12개월 중 그런 달 3개를 평균한다(P-PROD-67).
 * 판매 속도(`categoryMonthlySales`)는 한 달 안에 재고가 바닥난 달(일부만 판 달)을 낮게 센다 — 봇 119개월: 판매 1,416병/년 · 수요 3,076병/년.
 * 쓰는 곳: 생산 쪽 화면(공급 전망 · 병입 뒤 재고 개월 · 줄인 생산 안내). **납품 제안 상한(결정 #337 ①)은 판매 속도 그대로**다 — 수요는 공급하지 못한 몫까지 세므로
 * 7차형(재고가 수요를 못 따라감)에서 상한이 올라가 못 채울 계약이 온다(MKT 의견 2026-11-21). 품절 달(재고 0 — 판매도 수요도 기록되지 않음)은 지금처럼 뺀다
 */
export function categoryMonthlyDemand(s: Pick<GameState, 'commerce' | 'history'>, category: ProductCategory): number | null {
  const ids = new Set([...s.commerce.products, ...(s.commerce.productArchive ?? [])].filter((p) => p.category === category).map((p) => p.id));
  const recent = s.history.reports.slice(-SALES_LOOKBACK.months);
  if (!recent.length) return null;
  const per = recent.map((r) => r.sales.filter((x) => ids.has(x.productId)).reduce((u, x) => u + Math.max(x.bottles, x.demandBottles ?? 0), 0)).filter((n) => n > 0).slice(-SALES_LOOKBACK.soldMonths);
  return per.length ? per.reduce((a, n) => a + n, 0) / per.length : null;
}
