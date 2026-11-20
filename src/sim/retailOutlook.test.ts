// [제안 P-MKT-42] 납품 제안 전망 · 파기까지 남은 병 — 화면 계산 함수(규칙 불변)
import { describe, expect, it } from 'vitest';
import { RETAIL_BREAK_MONTHS, retailBreakRemaining, retailOfferOutlook } from './deals';
import type { GameState } from './types';

const prod = (id: string, category: string, stockBottles: number, dutyFreeOnly = false) => ({ id, category, stockBottles, dutyFreeOnly });
const rep = (sales: [string, number][]) => ({ sales: sales.map(([productId, bottles]) => ({ productId, bottles })) });
const state = (products: ReturnType<typeof prod>[], reports: ReturnType<typeof rep>[]) =>
  ({ commerce: { products }, history: { reports } }) as unknown as Pick<GameState, 'commerce' | 'history'>;

describe('retailOfferOutlook — 받기 전에 "채울 수 있나"', () => {
  it('그 범주 재고(면세 한정판 제외) · 재고 개월치 · 한 달 미납 위약금 — 판매 속도는 화면이 categoryMonthlySales로 따로 본다', () => {
    const s = state(
      [prod('P1', 'soju_distilled', 900), prod('P2', 'soju_distilled', 300), prod('P3', 'soju_distilled', 5000, true), prod('W', 'whisky', 400)],
      [rep([['P1', 9999]]), rep([['P1', 1000], ['W', 50]]), rep([['P1', 1200], ['P2', 300]]), rep([['P2', 500], ['W', 70]])],
    );
    const o = retailOfferOutlook(s, { category: 'soju_distilled', bottlesPerMonth: 600, penaltyPerBottle: 780 });
    expect(o.stock).toBe(1200); // P3(면세 한정판)은 납품에 쓰이지 않는다
    expect('recentSales' in o).toBe(false); // 판매 속도를 두 곳에서 세지 않는다(PROD SALES_LOOKBACK 하나)
    expect(o.coverMonths).toBe(2);
    expect(o.penaltyPerMonth).toBe(468_000);
  });
  it('재고가 없으면 0개월치', () => {
    const o = retailOfferOutlook(state([], []), { category: 'whisky', bottlesPerMonth: 300, penaltyPerBottle: 7680 });
    expect(o).toEqual({ stock: 0, coverMonths: 0, penaltyPerMonth: 2_304_000 });
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

describe('refreshDeals — 받지 않고 만료된 납품 제안을 메모로 (#334 7차 관찰)', () => {
  it('만료되는 달에 메모 한 줄 · 아직 남은 제안은 메모 없음 · report가 없으면 메모 없이 지운다', async () => {
    const { newScenarioGame } = await import('./newScenario');
    const { refreshDeals } = await import('./deals');
    const { rngFor } = await import('./rng');
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const offer = (id: string, expiresMonth: number) => ({ id, partner: '가온마트', category: 'soju_distilled' as const, bottlesPerMonth: 1000, priceFactor: 0.8, termMonths: 12, paymentDelay: 2, penaltyPerBottle: 780, expiresMonth });
    s.commerce.retailOffers = [offer('U1', s.month), offer('U2', s.month + 2)];
    const report = { notes: [] as string[] } as unknown as Parameters<typeof refreshDeals>[2] & { notes: string[] };
    refreshDeals(s, rngFor(s.seed, s.month, 'deals'), report);
    expect(report.notes).toEqual(['가온마트 납품 제안 만료 — 증류식 소주 1,000병/월 (받지 않음)']);
    expect(s.commerce.retailOffers.map((o) => o.id)).toContain('U2');
    expect(s.commerce.retailOffers.map((o) => o.id)).not.toContain('U1');
    s.commerce.retailOffers = [offer('U3', s.month)];
    refreshDeals(s, rngFor(s.seed, s.month, 'deals'));
    expect(s.commerce.retailOffers.map((o) => o.id)).not.toContain('U3');
  });
});

describe('retailDrawOrder — 납품이 재고를 가져가는 순서 (화면 확인 문구와 fulfillRetail이 같이 씀)', () => {
  it('같은 범주 · 재고 있음 · 면세 한정판 아님, 만든 달 순', async () => {
    const { retailDrawOrder } = await import('./deals');
    const mk = (id: string, category: string, stockBottles: number, createdMonth: number, dutyFreeOnly = false) => ({ id, category, stockBottles, createdMonth, dutyFreeOnly });
    const s = { commerce: { products: [mk('B', 'whisky', 273, 141), mk('A', 'whisky', 553, 83), mk('Z', 'whisky', 0, 10), mk('D', 'whisky', 90, 5, true), mk('S', 'soju_distilled', 999, 1)] } } as unknown as Parameters<typeof retailDrawOrder>[0];
    expect(retailDrawOrder(s, 'whisky').map((p) => p.id)).toEqual(['A', 'B']);
  });
});
