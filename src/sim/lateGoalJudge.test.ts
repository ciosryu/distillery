import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { bandCounts, THIN_BAND_CASKS } from './ageBand';
import { AGED_GOAL_MONTHS, FLAGSHIP_BOTTLES_GOAL, LOUNGE_TOURISM_GOAL, lateGoalMet, lateGoalProgress } from './lateGoals';
import { siteIdOf } from './ledger';
import type { GameState, LedgerEntry, SaleEvent } from './types';

// [#388 ① G3 · MGT ①-c] 후반 목표 판정 5종 (mgt-endgame.md §4.1). 보상은 없다 — 판정만 본다
const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')).save)!;
const sale = (o: Partial<SaleEvent>): SaleEvent => ({ month: 0, productId: 'P', lotId: 'L', bottles: 100, unitPrice: 50_000, settlement: 'cash', kind: 'retail', eligibleAtSale: true, ...o }) as SaleEvent;
const entry = (s: GameState, woodMonths: number): LedgerEntry => ({ batchId: 'B', origin: 'self', siteId: siteIdOf(s), kindAtBirth: 'malt', contribLPA: 100, costKRW: 1, woodMonths });

describe('후반 목표 판정 (MGT ①-c)', () => {
  it('ladder_mid — #380 띠 「5 ~ 9년」 통 수가 THIN_BAND_CASKS 이상 (9차 133개월: 미달)', () => {
    const s = load();
    const have = bandCounts(s)['5-9'].casks;
    expect(lateGoalProgress(s, 'ladder_mid')).toEqual({ have, need: THIN_BAND_CASKS });
    expect(lateGoalMet(s, 'ladder_mid')).toBe(have >= THIN_BAND_CASKS);
    expect(have).toBeLessThan(THIN_BAND_CASKS); // 9차 사실: 허리 없는 숙성 재고
  });

  it('lounge_3 — VIP 라운지 가동 ∧ 최근 12개월 관광 매출 3억 (9차: 라운지 없음 → 미달, 관광만 높여도 미달)', () => {
    const s = load();
    expect(lateGoalMet(s, 'lounge_3')).toBe(false);
    for (const r of s.history.reports.slice(-12)) r.tourismRevenue = LOUNGE_TOURISM_GOAL / 12 + 1;
    expect(lateGoalMet(s, 'lounge_3')).toBe(false); // 라운지가 없으면 관광만으로는 안 된다
    s.production.equipment.push({ id: 'EV', catalogId: 'visitor_vip', readyMonth: s.month + 3 } as never);
    expect(lateGoalMet(s, 'lounge_3')).toBe(false); // 공사 중
    (s.production.equipment.at(-1) as { readyMonth: number }).readyMonth = s.month;
    expect(lateGoalMet(s, 'lounge_3')).toBe(true);
    expect(lateGoalProgress(s, 'lounge_3')).toEqual({ have: 3, need: 3 });
  });

  it('flagship_300 — 승리와 같은 셈(적격 · 유상 · 납품 아님)의 출하 누적 300병', () => {
    const s = load();
    const last = s.history.reports.at(-1)!;
    last.saleEvents = [sale({ bottles: 200 }), sale({ bottles: 99, kind: 'b2b' }), sale({ bottles: 99, eligibleAtSale: false }), sale({ bottles: 99, unitPrice: 0 })];
    s.history.reports.at(-2)!.saleEvents = [sale({ bottles: 99 })];
    expect(lateGoalMet(s, 'flagship_300')).toBe(false);
    expect(lateGoalProgress(s, 'flagship_300')).toEqual({ have: 299, need: FLAGSHIP_BOTTLES_GOAL });
    last.saleEvents.push(sale({ bottles: 1 }));
    expect(lateGoalMet(s, 'flagship_300')).toBe(true);
  });

  it('aged15_sold · aged18_sold — 지난달 적격 출하의 로트 원장 가장 어린 원액이 180 · 216개월 이상', () => {
    const s = load();
    const lotOf = (wood: number) => { s.commerce.lots = [{ id: 'L15', productId: 'P', bottles: 10, bottledMonth: s.month, components: [entry(s, wood)], eligibleAtBottling: true }]; s.history.reports.at(-1)!.saleEvents = [sale({ lotId: 'L15' })]; };
    lotOf(AGED_GOAL_MONTHS.aged15_sold - 1);
    expect(lateGoalMet(s, 'aged15_sold')).toBe(false);
    lotOf(AGED_GOAL_MONTHS.aged15_sold);
    expect(lateGoalMet(s, 'aged15_sold')).toBe(true);
    expect(lateGoalMet(s, 'aged18_sold')).toBe(false);
    lotOf(AGED_GOAL_MONTHS.aged18_sold);
    expect(lateGoalMet(s, 'aged18_sold')).toBe(true);
    // 납품 · 부적격 출하는 세지 않는다
    s.history.reports.at(-1)!.saleEvents = [sale({ lotId: 'L15', kind: 'b2b' })];
    expect(lateGoalMet(s, 'aged18_sold')).toBe(false);
  });

  it('aged15_sold — 로트가 다 팔려 지워졌으면 제품 표기 목재 개월로 본다', () => {
    const s = load();
    const p = s.commerce.products[0]!;
    s.commerce.lots = [];
    s.history.reports.at(-1)!.saleEvents = [sale({ lotId: 'gone', productId: p.id })];
    p.oakMonths = AGED_GOAL_MONTHS.aged15_sold - 1;
    expect(lateGoalMet(s, 'aged15_sold')).toBe(false);
    p.oakMonths = AGED_GOAL_MONTHS.aged15_sold;
    expect(lateGoalMet(s, 'aged15_sold')).toBe(true);
  });
});
