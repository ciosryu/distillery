// 12년 탄닌 전망 (P-PROD-66 a·b, 결정 #339) — 화면 힌트용 어림. 원액 맛을 읽지 않고 matureCask ②(목재 추출)와 같은 식으로 센다.
// 숙성 식이 바뀌면 이 테스트가 먼저 깨져 전망과 실제가 어긋나지 않게 한다
import { describe, expect, it } from 'vitest';
import { newScenarioGame } from './newScenario';
import { CATEGORY } from './content/categories';
import { EMPTY_ACTIVITY_FACTOR, emptyCask, matureCask } from './maturation';
import { CAP_PENALTY_PER_POINT, slotClimateNormal, tanninOutlook, warehousesOf } from './warehouse';
import { evaluate } from './flavor';
import type { Cask } from './types';

const game = () => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 1 });
const bourbon = (s: ReturnType<typeof game>) => s.inventory.casks.find((c) => !c.contents && c.typeId === 'ex_bourbon_barrel')!;

/** 게임 숙성 함수를 평년 칸 기후로 n개월 돌린 탄닌 */
function simulate(s: ReturnType<typeof game>, cask: Cask, months: number): number {
  const w = warehousesOf(s)[0]!;
  let c: Cask = { ...cask, slot: { w: w.id, tier: 0 }, contents: { id: 'L', name: 'x', kind: 'malt', volumeL: cask.sizeL, abv: 0.635, flavor: { fresh_fruit: 20, cereal: 15 }, createdMonth: s.month, oakMonths: 0, sourced: false, costPerLPA: 1 } };
  for (let k = 0; k < months; k++) c = matureCask(c, slotClimateNormal(s, w, 0, ((s.month + k) % 12) + 1), { control: 50 }).cask;
  return c.contents!.flavor.oak_tannin ?? 0;
}

describe('tanninOutlook — 12년 탄닌 전망', () => {
  it('빈 통의 "지금 채우면" 전망 = 게임 숙성 함수로 144개월 돌린 탄닌 (반올림 오차 안)', () => {
    const s = game();
    const cask = bourbon(s);
    const o = tanninOutlook(s, cask)!;
    expect(o.atMonths).toBe(144);
    expect(o.activity).toBe(1);
    expect(o.now).toBe(0);
    expect(Math.abs(o.tannin - simulate(s, cask, 144))).toBeLessThan(0.6);
  });

  it('감점 = (탄닌 − 위스키 상한) × 0.8 — evaluate의 상한 감점과 같은 계수', () => {
    const s = game();
    const o = tanninOutlook(s, bourbon(s))!;
    expect(o.cap).toBe(CATEGORY.whisky.caps.oak_tannin);
    expect(o.penalty).toBeCloseTo(Math.max(0, o.tannin - o.cap) * CAP_PENALTY_PER_POINT, 0);
    // 같은 맛에서 탄닌만 상한을 넘기면 evaluate가 정확히 그만큼 깎는다
    const base = { fresh_fruit: 30, vanilla_caramel: 30, integration: 60 };
    const q = (t: number) => evaluate({ ...base, oak_tannin: t }, 'whisky').quality;
    expect(q(o.cap) - q(o.cap + 10)).toBeGreaterThan(10 * CAP_PENALTY_PER_POINT - 1.5); // 복잡도·강도 변화 몫을 빼고 감점이 주된 차이
  });

  it('비웠다 다시 쓴 통(활성도 ×0.6)은 새 통보다 12년 탄닌·감점이 작다', () => {
    const s = game();
    const fresh = bourbon(s);
    const refill = emptyCask({ ...fresh, contents: { id: 'L', name: 'x', kind: 'malt', volumeL: 1, abv: 0.6, flavor: {}, createdMonth: 0, oakMonths: 1, sourced: false, costPerLPA: 1 } });
    expect(refill.activity).toBeCloseTo(fresh.activity * EMPTY_ACTIVITY_FACTOR);
    const a = tanninOutlook(s, fresh)!;
    const b = tanninOutlook(s, refill)!;
    expect(b.tannin).toBeLessThan(a.tannin);
    expect(b.penalty).toBeLessThan(a.penalty);
    expect(a.penalty).toBeGreaterThan(10); // 새 버번 통은 12년이면 상한을 넘는다(김포 평년 기후)
  });

  it('숙성 중인 통은 통입한 달부터 센다 — now는 지금 목재 개월까지의 값', () => {
    const s = game();
    const cask = bourbon(s);
    const w = warehousesOf(s)[0]!;
    const filled: Cask = { ...cask, slot: { w: w.id, tier: 0 }, filledMonth: s.month, contents: { id: 'L', name: 'x', kind: 'malt', volumeL: 200, abv: 0.635, flavor: {}, createdMonth: s.month, oakMonths: 60, sourced: false, costPerLPA: 1 } };
    const o = tanninOutlook(s, filled)!;
    expect(Math.abs(o.now - simulate(s, cask, 60))).toBeLessThan(0.4);
    expect(o.tannin).toBeGreaterThan(o.now);
  });

  it('모르는 활성도(스팟 매입 6개월 전)·나무가 아닌 통은 null — 숨은 값을 드러내지 않는다', () => {
    const s = game();
    expect(tanninOutlook(s, { ...bourbon(s), activityKnown: false })).toBeNull();
    expect(tanninOutlook(s, { ...bourbon(s), typeId: 'onggi_jar', wood: 'none' })).toBeNull();
  });
});
