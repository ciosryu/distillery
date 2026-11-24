// 피니싱 탄닌 전망 (GAP-PROD-4, 결정 #345) — 화면 힌트용 어림. 원액 맛을 읽지 않고 matureCask ②(목재 추출)와 같은 식으로 센다.
// 숙성 식이 바뀌면 이 테스트가 먼저 깨져 전망과 실제가 어긋나지 않게 한다 (tanninOutlook.test.ts와 같은 방식)
import { describe, expect, it } from 'vitest';
import { newScenarioGame } from './newScenario';
import { emptyCaskOf } from './newGame';
import { historyAfterTransfer, matureCask } from './maturation';
import { finishTanninOutlook, slotClimateNormal, warehousesOf } from './warehouse';
import type { Cask, GameState } from './types';

const game = () => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 1 });

/** 버번 통에 n개월 숙성한 통 + 빈 셰리 벗 */
function setup(s: GameState, oak: number): { from: Cask; to: Cask } {
  const w = warehousesOf(s)[0]!;
  let from: Cask = { ...emptyCaskOf(s, 'ex_bourbon_barrel'), slot: { w: w.id, tier: 0 }, filledMonth: s.month - oak, contents: { id: 'L', name: 'x', kind: 'malt', volumeL: 190, abv: 0.635, flavor: { fresh_fruit: 20, cereal: 15 }, createdMonth: s.month - oak, oakMonths: 0, sourced: false, costPerLPA: 1 } };
  for (let k = 0; k < oak; k++) from = matureCask(from, slotClimateNormal(s, w, 0, ((s.month - oak + k) % 12 + 12) % 12 + 1), { control: 50 }).cask;
  return { from, to: emptyCaskOf(s, 'oloroso_butt') };
}

/** 실제로 옮겨 m개월 더 숙성한 탄닌 */
function simulateFinish(s: GameState, from: Cask, to: Cask, m: number): number {
  const w = warehousesOf(s)[0]!;
  const lot = from.contents!;
  let c: Cask = { ...to, slot: from.slot, filledMonth: s.month, contents: { ...lot, caskHistory: historyAfterTransfer(lot, from.typeId, to.typeId, s.month) } };
  for (let k = 0; k < m; k++) c = matureCask(c, slotClimateNormal(s, w, 0, ((s.month + k) % 12) + 1), { control: 50 }).cask;
  return c.contents!.flavor.oak_tannin ?? 0;
}

describe('finishTanninOutlook — 피니싱 탄닌 전망', () => {
  it('now = 원래 통에서 쌓인 탄닌 · after = 옮겨 m개월 숙성한 탄닌 (반올림 오차 안)', () => {
    const s = game();
    const { from, to } = setup(s, 60);
    const o = finishTanninOutlook(s, from, to, 12)!;
    expect(Math.abs(o.now - (from.contents!.flavor.oak_tannin ?? 0))).toBeLessThan(0.6);
    expect(Math.abs(o.after - simulateFinish(s, from, to, 12))).toBeLessThan(0.8);
    expect(o.after).toBeGreaterThan(o.now);
  });

  it('12년(144개월) 전에 옮기면 그때 탄닌 · 감점을 세고, 이미 넘었으면 null', () => {
    const s = game();
    const early = finishTanninOutlook(s, setup(s, 100).from, setup(s, 100).to, 6)!;
    expect(early.at?.atMonths).toBe(144);
    expect(early.at!.penalty).toBeCloseTo(Math.max(0, early.at!.tannin - early.cap) * 0.8, 0);
    const late = setup(s, 150);
    expect(finishTanninOutlook(s, late.from, late.to, 6)!.at).toBeNull();
  });

  it('활성도가 높은 통으로 옮길수록 탄닌이 더 는다 — 재사용 통(×0.6)은 새 통보다 덜', () => {
    const s = game();
    const { from, to } = setup(s, 60);
    const fresh = finishTanninOutlook(s, from, to, 24)!;
    const used = finishTanninOutlook(s, from, { ...to, activity: to.activity * 0.6 }, 24)!;
    expect(used.after - used.now).toBeLessThan(fresh.after - fresh.now);
  });

  it('모르는 활성도(스팟 매입 6개월 전)·원액 없는 통은 null — 숨은 값을 드러내지 않는다', () => {
    const s = game();
    const { from, to } = setup(s, 60);
    expect(finishTanninOutlook(s, from, { ...to, activityKnown: false }, 6)).toBeNull();
    expect(finishTanninOutlook(s, { ...from, activityKnown: false }, to, 6)).toBeNull();
    expect(finishTanninOutlook(s, { ...from, contents: undefined }, to, 6)).toBeNull();
  });
});
