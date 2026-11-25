// [결정 #393 N1] 한 번 쓴 버번 배럴(리필) — 쿠퍼리지 정상 주문 · 도착하면 채웠다 뺀 통과 같은 상태 · v16만. 카탈로그(CASKS)는 그대로라 스팟 · 브로커 난수가 바뀌지 않는다
import { describe, expect, it } from 'vitest';
import { advanceMonth, applyAction } from './index';
import { newScenarioGame } from './newScenario';
import { CASK_MARKET, CASKS } from './content/catalog';
import { emptyCask, EMPTY_ACTIVITY_FACTOR, EMPTY_SEASONING_FACTOR, refillState } from './maturation';
import { tanninOutlook } from './warehouse';
import { autoFillCasks } from './autoFill';
import { usedCaskPrice } from './casks';
import { emptyCaskOf, regionalCaskPrice } from './newGame';
import { refillBlocker, refillUnitPrice } from './actions.prod';
import type { GameState } from './types';

const game = (rules?: 'legacy-v15'): GameState => {
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 1, ...(rules ? { rules } : {}) });
  s.finance.cash = 1e10;
  return s;
};

describe('#393 N1 리필 통', () => {
  it('값은 그 지역 새 통 값 × 0.65 — 주문은 쿠퍼리지 납기 그대로', () => {
    const s = game();
    const cash = s.finance.cash;
    const r = applyAction(s, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: 3, refill: true });
    expect(r.error).toBeUndefined();
    expect(refillUnitPrice(s)).toBe(Math.round(regionalCaskPrice(s, 'ex_bourbon_barrel') * CASK_MARKET.refill.priceShare));
    expect(cash - r.state.finance.cash).toBe(refillUnitPrice(s) * 3);
    const o = r.state.inventory.caskOrders.at(-1)!;
    expect(o).toMatchObject({ typeId: 'ex_bourbon_barrel', qty: 3, source: 'refill', arriveMonth: s.month + CASK_MARKET.cooperageLeadMonths });
  });
  it('도착하면 채웠다 뺀 통과 같다 — 활성도 ×0.6 · 시즈닝 ×0.35 · 1회 사용 · 종류는 ex-버번', () => {
    let s = game();
    const before = new Set(s.inventory.casks.map((c) => c.id));
    s = applyAction(s, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: 2, refill: true }).state;
    for (let m = 0; m < 6 && s.inventory.caskOrders.length; m++) s = advanceMonth(s);
    expect(s.inventory.caskOrders).toHaveLength(0);
    const got = s.inventory.casks.filter((c) => !before.has(c.id));
    expect(got).toHaveLength(2);
    const def = CASKS.ex_bourbon_barrel;
    for (const c of got) {
      expect(c.typeId).toBe('ex_bourbon_barrel');
      expect(c.activity).toBeCloseTo(def.activity * EMPTY_ACTIVITY_FACTOR, 12);
      expect(c.seasoning).toBeCloseTo(def.seasoning * EMPTY_SEASONING_FACTOR, 12);
      expect(c.fills).toBe(1);
      expect(c.char).toBe(def.char);
      // 채웠다 뺀 통(새 통 → 1회 사용 → emptyCask)과 같은 값
      const dumped = emptyCask({ ...emptyCaskOf(game(), 'ex_bourbon_barrel'), fills: 1 });
      expect({ activity: c.activity, seasoning: c.seasoning, fills: c.fills }).toEqual({ activity: dumped.activity, seasoning: dumped.seasoning, fills: dumped.fills });
    }
    expect(s.history.reports.some((r) => r.notes.some((n) => n.includes('리필(한 번 쓴) 통 주문 캐스크 2개 도착')))).toBe(true);
  });
  it('막는 곳 — 옛 판 · ex-버번이 아닌 통', () => {
    expect(applyAction(game('legacy-v15'), { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: 1, refill: true }).error).toBeDefined();
    expect(refillBlocker(game('legacy-v15'))).not.toBeNull();
    expect(applyAction(game(), { type: 'buyCasks', caskType: 'oloroso_butt', qty: 1, refill: true }).error).toBeDefined();
    expect(refillBlocker(game())).toBeNull();
  });
  it('보통 주문(refill 없음)은 그대로 새 통', () => {
    let s = game();
    const before = new Set(s.inventory.casks.map((c) => c.id));
    s = applyAction(s, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: 1 }).state;
    expect(s.inventory.caskOrders.at(-1)!.source).toBe('cooperage');
    for (let m = 0; m < 6 && s.inventory.caskOrders.length; m++) s = advanceMonth(s);
    expect(s.inventory.caskOrders).toHaveLength(0);
    const c = s.inventory.casks.find((x) => !before.has(x.id))!;
    expect(c.activity).toBe(CASKS.ex_bourbon_barrel.activity);
    expect(c.fills).toBe(0);
  });

  // ARCH 리뷰(2026-11-25): 리필 통이 12년 감점 풀이 · 자동 통입 순서 · 사용 횟수 표기에서 채웠다 뺀 통과 같은 길로 읽히는지
  it('12년 탄닌 전망(#367 · #374 tanninOutlook)이 채웠다 뺀 통과 같다 — 활성도만 읽는다', () => {
    const s = game();
    const refill = Object.assign(emptyCaskOf(s, 'ex_bourbon_barrel'), refillState(CASKS.ex_bourbon_barrel));
    const dumped = emptyCask({ ...emptyCaskOf(s, 'ex_bourbon_barrel'), fills: 1 });
    const lot = { id: 'L', name: 'L', kind: 'malt' as const, volumeL: 190, abv: 0.635, flavor: { oak_tannin: 2 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 1 };
    const a = tanninOutlook(s, { ...refill, contents: { ...lot }, filledMonth: s.month, fills: 2 });
    const b = tanninOutlook(s, { ...dumped, id: refill.id, contents: { ...lot }, filledMonth: s.month, fills: 2 });
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
  });
  it('자동 통입 순서 · 사용 횟수 — 리필 통은 「재사용 통」(1회 사용)으로 읽힌다 · 중고 매각가도 같다', () => {
    const s = game();
    s.inventory.casks = [];
    const fresh = emptyCaskOf(s, 'ex_bourbon_barrel');
    const refill = Object.assign(emptyCaskOf(s, 'ex_bourbon_barrel'), refillState(CASKS.ex_bourbon_barrel));
    s.inventory.casks.push(fresh, refill);
    expect(autoFillCasks(s, { prefer: 'used' }).map((c) => c.id)).toEqual([refill.id, fresh.id]);
    expect(autoFillCasks(s, {}).map((c) => c.id)).toEqual([fresh.id, refill.id]);
    expect(refill.fills).toBe(1);
    expect(usedCaskPrice(refill)).toBe(usedCaskPrice(emptyCask({ ...emptyCaskOf(s, 'ex_bourbon_barrel'), fills: 1 })));
  });
});
