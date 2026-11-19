// [제안 P-MKT-42] 납품 제안 전망 · 파기까지 남은 병 — 화면 계산 함수(규칙 불변)
import { describe, expect, it } from 'vitest';
import { RETAIL_BREAK_MONTHS, retailBreakRemaining, retailOfferOutlook } from './deals';
import type { GameState } from './types';

const prod = (id: string, category: string, stockBottles: number, dutyFreeOnly = false) => ({ id, category, stockBottles, dutyFreeOnly });
const rep = (sales: [string, number][]) => ({ sales: sales.map(([productId, bottles]) => ({ productId, bottles })) });
const state = (products: ReturnType<typeof prod>[], reports: ReturnType<typeof rep>[]) =>
  ({ commerce: { products }, history: { reports } }) as unknown as Pick<GameState, 'commerce' | 'history'>;

describe('retailOfferOutlook — 받기 전에 "채울 수 있나"', () => {
  it('그 범주 재고(면세 한정판 제외) · 최근 3개월 국내 판매 평균 · 재고 개월치 · 한 달 미납 위약금', () => {
    const s = state(
      [prod('P1', 'soju_distilled', 900), prod('P2', 'soju_distilled', 300), prod('P3', 'soju_distilled', 5000, true), prod('W', 'whisky', 400)],
      [rep([['P1', 9999]]), rep([['P1', 1000], ['W', 50]]), rep([['P1', 1200], ['P2', 300]]), rep([['P2', 500], ['W', 70]])],
    );
    const o = retailOfferOutlook(s, { category: 'soju_distilled', bottlesPerMonth: 600, penaltyPerBottle: 780 });
    expect(o.stock).toBe(1200); // P3(면세 한정판)은 납품에 쓰이지 않는다
    expect(o.recentSales).toBe((1000 + 1500 + 500) / 3); // 마지막 3개 리포트만
    expect(o.coverMonths).toBe(2);
    expect(o.penaltyPerMonth).toBe(468_000);
  });
  it('리포트가 없으면 판매 0, 재고가 없으면 0개월치', () => {
    const o = retailOfferOutlook(state([], []), { category: 'whisky', bottlesPerMonth: 300, penaltyPerBottle: 7680 });
    expect(o).toEqual({ stock: 0, recentSales: 0, coverMonths: 0, penaltyPerMonth: 2_304_000 });
  });
});

describe('retailBreakRemaining — 파기까지 남은 미납', () => {
  it(`월 물량 × ${RETAIL_BREAK_MONTHS} − 누적 미납, 0 밑으로 안 간다`, () => {
    expect(retailBreakRemaining({ bottlesPerMonth: 600, shortfall: 0 })).toBe(1200);
    expect(retailBreakRemaining({ bottlesPerMonth: 600, shortfall: 600 })).toBe(600);
    expect(retailBreakRemaining({ bottlesPerMonth: 1000, shortfall: 1762 })).toBe(238); // 6차 판 계약 C 128개월 뒤
    expect(retailBreakRemaining({ bottlesPerMonth: 300, shortfall: 900 })).toBe(0);
  });
});
