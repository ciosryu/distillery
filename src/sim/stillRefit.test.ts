// [결정 #418] 증류기 PR ③ — 개조(부품 값 · 공사 기간 · 증류 정지) · 웜 텁 물 × 1.5 · 유지비 할증 · 형태가 없으면 지금 그대로(바이트)
import { describe, expect, it } from 'vitest';
import { advanceMonth, applyAction } from './index';
import { newScenarioGame } from './newScenario';
import { EQUIPMENT } from './content/catalog';
import { stillDefOf } from './production';
import { monthlyFixedBreakdown } from './loans';
import { equipmentSalvage } from './valuation';
import { equipmentCost } from './sites';
import { refitPlan } from './actions.prod';
import { batchWaterL, catalogShapeOf, DEFAULT_STILL_SHAPE, equipmentMaintenance, refitQuote, STILL_REFIT_PARTS, STILL_SHAPE_PRESETS, stillParams } from './stillShape';
import type { GameState, StillShape } from './types';

const game = (rules?: 'legacy-v15'): GameState => {
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 1, ...(rules ? { rules } : {}) });
  s.finance.cash = 1e10;
  return s;
};
const heavy = STILL_SHAPE_PRESETS.find((p) => p.id === 'heavy')!.shape;
const still = (s: GameState) => s.production.equipment.find((e) => e.id === 'E1')!;
const maint = (s: GameState) => monthlyFixedBreakdown(s).find((x) => x.id === 'maintenance')?.amount ?? 0;

describe('#418 PR ③ 형태가 없으면 지금 그대로', () => {
  it('유지비 · 물 — 카탈로그 값 그대로(카탈로그 웜 텁 증류기도 × 1)', () => {
    for (const def of Object.values(EQUIPMENT)) expect(equipmentMaintenance({ catalogId: def.id })).toBe(def.maintenance);
    const worm = EQUIPMENT.pot_worm_1000 as Extract<(typeof EQUIPMENT)[string], { kind: 'still' }>;
    expect(batchWaterL(stillParams(worm))).toBe(worm.chargeL);
    expect(batchWaterL(stillDefOf(game(), 'E1')!)).toBe(1000);
  });
  it('기본 조합도 물 · 유지비가 같다 · 랜턴형의 지금 형태는 톨(ARCH #1104 리뷰)', () => {
    expect(equipmentMaintenance({ catalogId: 'pot_onion_1000', stillShape: DEFAULT_STILL_SHAPE })).toBe(1_500_000);
    expect(catalogShapeOf({ stillType: 'pot_lantern' }).body).toBe('tall');
    expect(stillParams(EQUIPMENT.pot_lantern_1000 as never, catalogShapeOf({ stillType: 'pot_lantern' })).reflux).toBe(0.6);
  });
});

describe('#418 PR ③ 개조', () => {
  it('견적 — 바꾼 부품 값의 합 · 공사는 가장 긴 부품 · 입지 건설비 배수', () => {
    const q = refitQuote(DEFAULT_STILL_SHAPE, heavy);
    expect(q.parts).toEqual(['body', 'lineArm', 'condenser']);
    expect(q.baseCost).toBe(STILL_REFIT_PARTS.body.cost + STILL_REFIT_PARTS.lineArm.cost + STILL_REFIT_PARTS.condenser.cost);
    expect(q.months).toBe(3);
    const s = game();
    const p = refitPlan(s, 'E1', heavy);
    expect(p.blocker).toBeNull();
    expect(p.cost).toBe(Math.round(q.baseCost * (equipmentCost(s, EQUIPMENT.pot_onion_1000!) / EQUIPMENT.pot_onion_1000!.cost)));
    expect(refitQuote(DEFAULT_STILL_SHAPE, { ...DEFAULT_STILL_SHAPE, option: 'boil_ball' })).toEqual({ parts: ['option'], baseCost: STILL_REFIT_PARTS.option.cost, months: 1 });
  });
  it('헤비로 개조 — 돈 · 공사 3개월 증류 정지 · 「개조 끝」 메모 · 그 뒤 유지비 +20% · 물 × 1.5 · 환류 0.2', () => {
    let s = game();
    s.production.orders = [{ recipeId: 'R8', batchesPerMonth: 2 }];
    const m0 = maint(s);
    const cost = refitPlan(s, 'E1', heavy).cost;
    const cash = s.finance.cash;
    const r = applyAction(s, { type: 'refitStill', equipmentId: 'E1', shape: heavy });
    expect(r.error).toBeUndefined();
    s = r.state;
    expect(cash - s.finance.cash).toBe(cost);
    expect(still(s)).toMatchObject({ stillShape: heavy, readyMonth: s.month + 3, refitUntil: s.month + 3 });
    expect(maint(s)).toBe(m0 - 1_500_000); // 공사 중에는 유지비가 없다(지금 규칙 — readyMonth)
    for (let i = 0; i < 3; i++) {
      s = advanceMonth(s); // 0 · 1 · 2개월 결산 — 공사 중이라 증류 정지
      expect(s.history.reports.at(-1)!.notes.some((n) => n.includes('증류기가 준비되지 않아'))).toBe(true);
    }
    s = advanceMonth(s); // 3개월 결산 — 공사 끝 · 다시 증류
    const notes = s.history.reports.at(-1)!.notes;
    expect(notes.some((n) => n.includes('개조 끝 — 새 형태로 가동'))).toBe(true);
    expect(notes.some((n) => n.includes('증류기가 준비되지 않아'))).toBe(false);
    expect(still(s).refitUntil).toBeUndefined();
    expect(maint(s)).toBe(m0 + 300_000);
    const d = stillDefOf(s, 'E1')!;
    expect(d.reflux).toBe(0.2);
    expect(batchWaterL(d)).toBe(1500);
  });
  it('양파형을 기본 조합으로 되돌리면 필드를 지운다(카탈로그 값 · 바이트) · 랜턴형 형태는 필드로 남는다', () => {
    let s = game();
    s = applyAction(s, { type: 'refitStill', equipmentId: 'E1', shape: { ...DEFAULT_STILL_SHAPE, option: 'boil_ball' } }).state;
    expect(still(s).stillShape).toEqual({ ...DEFAULT_STILL_SHAPE, option: 'boil_ball' });
    s = advanceMonth(s);
    const back = applyAction(s, { type: 'refitStill', equipmentId: 'E1', shape: DEFAULT_STILL_SHAPE });
    expect(back.error).toBeUndefined();
    expect('stillShape' in still(back.state)).toBe(false);
  });
  it('막는 곳 — 옛 판 · 같은 형태 · 공사 중 · 현금 · 단식 아님 · 틀린 값', () => {
    expect(applyAction(game('legacy-v15'), { type: 'refitStill', equipmentId: 'E1', shape: heavy }).error).toBeDefined();
    expect(refitPlan(game(), 'E1', DEFAULT_STILL_SHAPE).blocker).toBe('지금 형태와 같습니다');
    const s = applyAction(game(), { type: 'refitStill', equipmentId: 'E1', shape: heavy }).state;
    expect(refitPlan(s, 'E1', DEFAULT_STILL_SHAPE).blocker).toBe('개조 공사 중입니다');
    const poor = game();
    poor.finance.cash = 0;
    expect(refitPlan(poor, 'E1', heavy).blocker).toBe('현금이 부족합니다');
    expect(refitPlan(game(), 'E2', heavy).blocker).toBe('증류기가 아닙니다');
    expect(refitPlan(game(), 'E1', { ...heavy, body: 'huge' } as unknown as StillShape).blocker).toBe('알 수 없는 형태');
  });
  it('공사 중 처분가가 새 설비처럼 뛰지 않는다(valuation — 감가 나이 그대로)', () => {
    let s = game();
    for (let i = 0; i < 24; i++) s = advanceMonth(s);
    s.finance.cash = 1e10;
    const before = equipmentSalvage(s);
    s = applyAction(s, { type: 'refitStill', equipmentId: 'E1', shape: heavy }).state;
    expect(equipmentSalvage(s)).toBe(before);
  });
});
