import { describe, expect, it } from 'vitest';
import { applyAction, caskSlots, newGame, newScenarioGame, slotsUsed, warehouseCapacity, type GameState } from './index';
import { emptyCaskOf } from './newGame';
import { monthTodos } from '../ui/alerts';

// [결정 #360] 숙성고에서 400L 이상 통은 2칸 — v16 캠페인만, 옛 판 · 샌드박스는 1칸 그대로 (cask-types.md §9.1 · [제안 P-ARCH-80] (가))

const campaign = (): GameState => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 3, rules: 'v16' });
const legacy = (): GameState => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 3, rules: 'legacy-v15' });

describe('숙성고 칸 — 400L 이상 통은 2칸 ([결정 #360])', () => {
  it('v16 캠페인: 셰리 벗 500L는 2칸 · 버번 200L는 1칸 · 옛 판 · 샌드박스는 모두 1칸', () => {
    expect(caskSlots(campaign(), 500)).toBe(2);
    expect(caskSlots(campaign(), 400)).toBe(2);
    expect(caskSlots(campaign(), 350)).toBe(1); // 코냑 펀천은 1칸
    expect(caskSlots(campaign(), 200)).toBe(1);
    expect(caskSlots(legacy(), 500)).toBe(1);
    expect(caskSlots(newGame({ seed: 3 }), 500)).toBe(1); // 샌드박스 새 판도 v16이지만 시나리오가 없다
  });

  it('쓰는 칸은 통마다 칸의 합(빈 통 포함) — 옛 판은 통 개수와 같다', () => {
    const s = campaign();
    const n = s.inventory.casks.length;
    s.inventory.casks.push(emptyCaskOf(s, 'oloroso_butt'), emptyCaskOf(s, 'oloroso_butt'));
    expect(slotsUsed(s)).toBe(n + 4);
    const l = legacy();
    l.inventory.casks.push(emptyCaskOf(l, 'oloroso_butt'));
    expect(slotsUsed(l)).toBe(l.inventory.casks.length);
  });

  it('남은 칸이 1이면 벗(2칸)은 사지 못하고 버번(1칸)은 산다 — 쿠퍼리지 주문 · 스팟 모두', () => {
    let s = campaign();
    s.finance.cash = 1e10;
    while (slotsUsed(s) < warehouseCapacity(s) - 1) s.inventory.casks.push(emptyCaskOf(s, 'ex_bourbon_barrel'));
    expect(applyAction(s, { type: 'buySpotCasks', caskType: 'oloroso_butt', qty: 1 }).error).toBeTruthy();
    expect(applyAction(s, { type: 'buyCasks', caskType: 'oloroso_butt', qty: 1 }).error).toBeTruthy();
    const r = applyAction(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: 1 });
    expect(r.error).toBeFalsy();
    s = r.state;
    expect(slotsUsed(s)).toBe(warehouseCapacity(s));
  });

  it('진행 중인 판이 칸을 넘으면(벗이 2칸이 되어) 통은 그대로 두고 새 통만 막는다 · 할 일 warn「숙성고 n칸 넘침」', () => {
    const s = campaign();
    s.finance.cash = 1e10;
    // 옛 규칙으로는 꽉 차지 않은 판 — 통 개수는 정원 안이지만 벗 때문에 칸이 넘친다
    while (s.inventory.casks.length < warehouseCapacity(s) - 2) s.inventory.casks.push(emptyCaskOf(s, 'ex_bourbon_barrel'));
    for (let i = 0; i < 2; i++) { const b = emptyCaskOf(s, 'oloroso_butt'); b.fills = 1; s.inventory.casks.push(b); } // 한 번 쓴 벗(중고로 팔 수 있다)
    const before = s.inventory.casks.length;
    expect(before).toBe(warehouseCapacity(s));
    expect(slotsUsed(s) - warehouseCapacity(s)).toBe(2);
    expect(applyAction(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: 1 }).error).toBeTruthy();
    expect(s.inventory.casks.length).toBe(before); // 아무것도 버리지 않는다
    const t = monthTodos(s).find((x) => x.id === 'slots-over');
    expect(t?.level).toBe('warn');
    expect(t?.text).toContain('2칸 넘침');
    // 한 번 쓴 빈 벗 하나를 팔면 2칸이 풀린다
    const butt = s.inventory.casks.find((c) => c.typeId === 'oloroso_butt')!;
    const sold = applyAction(s, { type: 'sellUsedCask', caskId: butt.id });
    expect(sold.error).toBeFalsy();
    expect(slotsUsed(sold.state)).toBe(warehouseCapacity(s));
    expect(monthTodos(sold.state).some((x) => x.id === 'slots-over')).toBe(false);
  });

  // 피니싱(transferCask)은 칸을 바꾸지 않는다 — 옮겨 갈 빈 통은 살 때 이미 칸을 잡았고, 옮긴 뒤 원래 통도 빈 통으로 숙성고에 남는다(칸 합 그대로). 그래서 넘친 동안에도 피니싱을 막을 까닭이 없다
});
