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
