import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type MonthReport } from './index';
import { fireEvent } from './events';

// 이벤트 리스크 배수 (#184, tech-tree P3 "면역 대신 크기 감소") — 연구한 노드의 risk_scale이 이벤트 피해를 줄인다

const rep = (s: GameState): MonthReport => ({ month: s.month, revenue: 0, expenses: {}, netCash: 0, cashEnd: 0, sales: [], production: [], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] });
const game = (unlocked: string[] = []): GameState => {
  const s = newGame({ seed: 1, startingCash: 5_000_000_000 });
  for (const o of s.b2b.brokerOffers.slice(0, 3)) s.inventory.casks.push({ ...o.cask, id: `C-${o.id}` });
  s.inventory.lots.push({ id: 'L-S', name: '소주', kind: 'soju', volumeL: 400, abv: 0.45, flavor: {}, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 9_000 });
  s.inventory.lots.push({ id: 'L-M', name: '몰트', kind: 'malt', volumeL: 400, abv: 0.68, flavor: {}, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 9_000 });
  s.research.unlocked.push(...unlocked);
  return s;
};

describe('이벤트 리스크 배수 (#184)', () => {
  it('ENG-2b(방재 엔지니어링): 숙성고 화재의 복구비가 ×0.6', () => {
    const plain = game(); const c0 = plain.finance.cash; fireEvent(plain, 'warehouse_fire', rep(plain));
    const eng = game(['ENG-2b']); const c1 = eng.finance.cash; fireEvent(eng, 'warehouse_fire', rep(eng));
    expect(c0 - plain.finance.cash).toBe(20_000_000);
    expect(c1 - eng.finance.cash).toBe(12_000_000);
  });

  it('발효 오염: PRO-1이면 이취 ×0.7, ASN-1이면 소주만 ×0.3 더', () => {
    const acetic = (unlocked: string[]) => { const s = game(unlocked); fireEvent(s, 'ferment_infection', rep(s)); return Object.fromEntries(s.inventory.lots.map((l) => [l.kind, l.flavor.acetic ?? 0])); };
    expect(acetic([])).toEqual({ soju: 8, malt: 8 });
    const pro = acetic(['PRO-1']);
    expect(pro.malt).toBeCloseTo(5.6, 10);
    expect(pro.soju).toBeCloseTo(5.6, 10);
    const both = acetic(['PRO-1', 'ASN-1']);
    expect(both.malt).toBeCloseTo(5.6, 10);
    expect(both.soju).toBeCloseTo(8 * 0.7 * 0.3, 10);
  });

  it('BIZ-3(앰버서더): 인플루언서 바이럴 뒤 반동의 수요 감소 폭이 절반', () => {
    const backlash = (unlocked: string[]) => {
      const s = game(unlocked);
      s.commerce.products.push({ id: 'P1', name: 'p', category: 'whisky', ageYears: null, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 60, typicity: 100, style: null, sourcedShare: 0, stockBottles: 100, price: 50_000, unitCost: 0, createdMonth: 0, lastMonthSold: 10, totalSold: 10 } as never);
      fireEvent(s, 'influencer_viral', rep(s));
      return s.world.modifiers.find((m) => m.label.endsWith('반동'))!.factor;
    };
    expect(backlash([])).toBeCloseTo(0.85, 10);
    expect(backlash(['BIZ-3'])).toBeCloseTo(1 - 0.15 * 0.5, 10);
  });
});
