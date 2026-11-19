import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from '../../sim';
import { EVENT } from '../../sim/content/events';
import { stillDownHint, stillDownLine } from './eventImpact';

// 증류기 고장 카드 「일반 수리가 무엇을 멈추나」 줄 — 6차 플레이테스트. 화면 계산만 하고 상태를 바꾸지 않는다
const readyStills = (s: GameState) => s.production.equipment.filter((x) => x.readyMonth <= s.month && x.feintsLPA != null);

describe('stillDownHint · stillDownLine', () => {
  it('증류기 고장만 값을 낸다 — 일반 수리 선택 번호 · 2개월(Normal) · 상태 불변', () => {
    const s = newGame({ seed: 1 });
    const before = JSON.stringify(s);
    const h = stillDownHint(s, { defId: 'still_breakdown' })!;
    expect(JSON.stringify(s)).toBe(before);
    expect(EVENT.still_breakdown!.choices![h.choice]!.label).toBe('일반 수리');
    expect(h.months).toBe(2);
    expect(h.stills).toBe(readyStills(s).length);
    expect(stillDownHint(s, { defId: 'export_support' })).toBeNull();
    expect(stillDownHint(s, { defId: 'no_such_event' })).toBeNull();
  });

  it('1대뿐이면 모든 증류가 멈춘다고 쓰고, 지난달 LPA × 개월을 어림한다', () => {
    const line = stillDownLine({ choice: 1, months: 2, stills: 1, lastMonthLPA: 1234.4 }, '일반 수리')!;
    expect(line).toContain('1대뿐이라');
    expect(line).toContain('모든 증류가 2개월 멈춘다');
    expect(line).toContain('약 2,469 LPA');
    expect(stillDownLine({ choice: 1, months: 2, stills: 1, lastMonthLPA: 0 }, '일반 수리')).not.toContain('LPA');
  });

  it('2대 이상이면 1대만 멈춘다 · 0대면 줄이 없다', () => {
    expect(stillDownLine({ choice: 1, months: 2, stills: 2, lastMonthLPA: 500 }, '일반 수리')).toContain('2대 중 1대만');
    expect(stillDownLine({ choice: 1, months: 2, stills: 0, lastMonthLPA: 500 }, '일반 수리')).toBeNull();
  });

  it('지난달 결산의 production LPA 합을 읽는다', () => {
    const s = newGame({ seed: 1 });
    s.history.reports.push({ month: s.month - 1, revenue: 0, expenses: {}, netCash: 0, cashEnd: 0, sales: [], production: [
      { recipeId: 'a', name: 'a', batches: 1, lpa: 300, cost: 0 }, { recipeId: 'b', name: 'b', batches: 1, lpa: 120, cost: 0 },
    ], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] });
    expect(stillDownHint(s, { defId: 'still_breakdown' })!.lastMonthLPA).toBe(420);
  });
});
