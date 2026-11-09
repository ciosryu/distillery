import { describe, expect, it } from 'vitest';
import { applyAction, newGame, type GameState, type MonthReport } from './index';
import { fireEvent } from './events';
import { insuredInventoryValue, insuredPropertyValue } from './insurance';
import { settleForwards } from './forwards';
import { lastMonthFlow } from '../ui/alerts';

// 매출이 아닌 입금 — 보험금(#171)·선도계약 정산(#179)이 월 리포트 otherIncome에 남고, 지난달 현금 흐름이 그 이름으로 묶는다 (MGT 샌드박스 다듬기)

const rep = (s: GameState): MonthReport => ({ month: s.month, revenue: 0, expenses: {}, netCash: 0, cashEnd: 0, sales: [], production: [], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] });

describe('매출이 아닌 입금 (otherIncome)', () => {
  it('재해 보험금이 otherIncome.insurance로 남고, 지난달 현금 흐름에 "보험금"으로 보인다', () => {
    let s = newGame({ seed: 1, startingCash: 5_000_000_000 });
    for (const o of s.b2b.brokerOffers.slice(0, 3)) s.inventory.casks.push({ ...o.cask, id: `C-${o.id}` });
    s = applyAction(s, { type: 'buyInsurance', kind: 'property', coverage: insuredPropertyValue(s) + 1e6 }).state;
    s = applyAction(s, { type: 'buyInsurance', kind: 'inventory', coverage: insuredInventoryValue(s) + 1e6 }).state;
    for (const x of s.finance.insurance) x.fromMonth = s.month;
    const r = rep(s);
    const cash = s.finance.cash;
    fireEvent(s, 'warehouse_fire', r);
    expect(r.otherIncome?.insurance).toBeGreaterThan(20_000_000 - 1);
    r.netCash = s.finance.cash - cash;
    const flow = lastMonthFlow(r);
    expect(flow.inflow.find((p) => p.label === '보험금')?.amount).toBe(Math.round(r.otherIncome!.insurance!));
    expect([...flow.inflow, ...flow.outflow].some((p) => p.label === '기타' && Math.abs(p.amount) >= r.otherIncome!.insurance!)).toBe(false);
  });

  it('선도계약: 받은 정산은 otherIncome.hedge, 낸 정산은 expenses.hedge — 둘 다 "선도계약 정산"으로 묶인다', () => {
    const base = newGame({ seed: 1, startingCash: 5_000_000_000 });
    let s = applyAction(base, { type: 'setOrder', recipeId: base.production.recipes.find((r) => r.name.startsWith('싱글 몰트 — 언'))!.id, batchesPerMonth: 2 }).state;
    s = applyAction(s, { type: 'signForward', ingredientId: 'malt_unpeated', kgPerMonth: 1000, months: 12 }).state;
    const up = structuredClone(s); up.world.priceIndex.malt_unpeated = 1.5;
    const r1 = rep(up); const c1 = up.finance.cash; settleForwards(up, r1); r1.netCash = up.finance.cash - c1;
    expect(r1.otherIncome?.hedge).toBeGreaterThan(0);
    expect(lastMonthFlow(r1).inflow.find((p) => p.label === '선도계약 정산')?.amount).toBe(Math.round(r1.otherIncome!.hedge!));
    const down = structuredClone(s); down.world.priceIndex.malt_unpeated = 0.7;
    const r2 = rep(down); const c2 = down.finance.cash; settleForwards(down, r2); r2.netCash = down.finance.cash - c2;
    expect(r2.otherIncome?.hedge).toBeUndefined();
    expect(lastMonthFlow(r2).outflow.find((p) => p.label === '선도계약 정산')?.amount).toBe(-Math.round(r2.expenses.hedge!));
  });
});
