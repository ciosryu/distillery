import { afterEach, describe, expect, it } from 'vitest';
import { advanceMonths, newGame, type GameState } from '.';
import { EVENTS, type Effect, type EventDef } from './content/events';
import { applyEffects } from './events';
import { addLot, lotBottles } from './lots';
import { checkInvariants } from './invariants';
import { mulberry32 } from './rng';
import type { MonthReport, Product } from './types';

// 이벤트 난수 — 이벤트별 스트림 (skeleton S-5, #147)
// 옛 방식은 매달 목록 전체를 한 스트림으로 섞어 판정해서, 이벤트를 하나만 더해도 모든 시드의 결과가 바뀌었다

const play = (seed: number, months = 60): GameState => advanceMonths(newGame({ seed, region: 'KR' }), months);
const fingerprint = (s: GameState) => ({ cash: s.finance.cash, log: s.events.log.map((e) => `${e.month}:${e.title}`), forecasts: s.events.forecasts.map((f) => f.defId) });
const extra = (over: Partial<EventDef>): EventDef => ({ id: 'test_extra', title: '테스트 이벤트', category: 'market', text: '테스트', chance: 0, cooldown: 12, effects: [], ...over });

afterEach(() => {
  const i = EVENTS.findIndex((e) => e.id === 'test_extra');
  if (i >= 0) EVENTS.splice(i, 1);
});

describe('이벤트별 난수 스트림 (S-5)', () => {
  it('발생하지 않는 이벤트를 목록 맨 앞에 더해도 다른 이벤트 결과는 그대로다', () => {
    const before = [3, 8, 13].map((seed) => fingerprint(play(seed)));
    EVENTS.unshift(extra({ chance: 0 }));
    expect([3, 8, 13].map((seed) => fingerprint(play(seed)))).toEqual(before);
  });

  it('굴리기는 하지만 조건이 안 맞는 이벤트(다른 지역 전용)를 더해도 그대로다', () => {
    const before = [3, 8].map((seed) => fingerprint(play(seed)));
    EVENTS.push(extra({ chance: 1, regions: ['JP'] }));
    expect([3, 8].map((seed) => fingerprint(play(seed)))).toEqual(before);
  });

  it('같은 시드는 같은 결과(결정론), 이벤트는 실제로 일어난다', () => {
    const a = fingerprint(play(5));
    expect(fingerprint(play(5))).toEqual(a);
    expect(a.log.length).toBeGreaterThan(0);
  });
});

// F3 판매 지점 — 수출 주문 이벤트 ([결정 #308·#318], architecture §10.10, MGT 연결). 기록만 — 현금·재고는 그대로
describe('수출 주문 이벤트 → 병입 로트 판매 사건', () => {
  const rep = (s: GameState): MonthReport => ({ month: s.month, revenue: 0, expenses: {}, netCash: 0, cashEnd: 0, sales: [], production: [], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] });
  const setup = (withLots: boolean) => {
    const s = newGame({ seed: 1, startingCash: 5_000_000_000 });
    s.commerce.products.push({ id: 'P1', name: 'p', category: 'whisky', ageYears: 4, oakMonths: 48, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 70, typicity: 80, style: null, sourcedShare: 0, stockBottles: 500, price: 60_000, unitCost: 20_000, createdMonth: 0, lastMonthSold: 0, totalSold: 0 } as Product);
    if (withLots) { addLot(s, 'P1', 200, { month: 0 }); addLot(s, 'P1', 300, { month: 1 }); }
    return s;
  };
  const order: Effect[] = [{ type: 'exportOrder', category: 'whisky', bottles: 300, priceFactor: 1.2 }];

  it('틱 안(결산 있음): 로트를 FIFO로 깎고 수출·이벤트·현금 사건을 쌓는다', () => {
    const s = setup(true), r = rep(s), cash = s.finance.cash;
    applyEffects(s, order, mulberry32(1), '해외 바이어 문의', undefined, r);
    expect(s.commerce.products[0]!.stockBottles).toBe(200);
    expect(s.finance.cash).toBe(cash + 300 * 60_000 * 1.2);
    expect(lotBottles(s, 'P1')).toBe(200);
    expect(r.saleEvents?.map((e) => [e.bottles, e.kind, e.channel, e.settlement, e.unitPrice])).toEqual([
      [200, 'export', 'event', 'cash', 72_000],
      [100, 'export', 'event', 'cash', 72_000],
    ]);
    expect(checkInvariants(s).errors).toEqual([]);
  });

  it('턴 사이(결산 없음): 로트만 맞추고 사건은 남지 않는다 — 로트 합 = 재고', () => {
    const s = setup(true);
    applyEffects(s, order, mulberry32(1), '해외 바이어 문의');
    expect(lotBottles(s, 'P1')).toBe(s.commerce.products[0]!.stockBottles);
    expect(checkInvariants(s).errors).toEqual([]);
  });

  it('로트가 없는 제품(연결 전·옛 세이브)은 사건을 만들지 않는다 — 재고·현금은 지금처럼', () => {
    const s = setup(false), r = rep(s), cash = s.finance.cash;
    applyEffects(s, order, mulberry32(1), '해외 바이어 문의', undefined, r);
    expect(s.commerce.products[0]!.stockBottles).toBe(200);
    expect(s.finance.cash).toBe(cash + 300 * 60_000 * 1.2);
    expect(r.saleEvents).toBeUndefined();
  });
});
