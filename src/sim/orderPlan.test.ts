// 생산 지시 대 실제 가능 배치(orderPlan) · 빈 통이 떨어지는 때(caskRunway) — 플레이테스트 준비 A1·A2·A4 (PROD, 2026-11-16)
// orderPlan은 runProduction의 한도 배분을 따로 미리 돈다 → 둘이 어긋나면 화면이 거짓말을 한다. "계획 = 다음 달 실제 배치"를 여기서 지킨다
import { describe, expect, it } from 'vitest';
import { applyAction, advanceMonth, type GameState } from './index';
import { caskRunway, productionValue, whiskySupplyForecast } from './economics';
import { autoFillPreview } from './autoFill';
import { newScenarioGame } from './newScenario';
import { orderPlan, previewBatch, steadyBatch } from './production';

function game(tierId: 'micro' | 'standard' = 'standard'): GameState {
  return newScenarioGame({ scenarioId: 'mvp_kr', tierId, loanAmount: 0, seed: 1 });
}
function order(s: GameState, batches: number[]): GameState {
  s.production.recipes.forEach((r, i) => { const x = applyAction(s, { type: 'setOrder', recipeId: r.id, batchesPerMonth: batches[i] ?? 0 }); if (x.error) throw new Error(x.error); s = x.state; });
  return s;
}

describe('orderPlan — 이번 달 실제로 만들 배치 수', () => {
  it.each([[[2, 6, 0]], [[0, 4, 0]], [[3, 3, 3]], [[0, 30, 0]], [[8, 0, 2]], [[1, 1, 1]]])('계획 = 다음 진행의 실제 배치 (지시 %j)', (batches) => {
    for (const tier of ['micro', 'standard'] as const) {
      let s = order(game(tier), batches);
      for (let m = 0; m < 3; m++) { // 계절(발효 온도)이 달라져도 맞는다
        const plan = orderPlan(s);
        const next = advanceMonth(s);
        const made = new Map(next.history.reports.at(-1)!.production.map((p) => [p.recipeId, p.batches]));
        for (const x of plan) expect([tier, m, x.name, made.get(x.recipeId) ?? 0]).toEqual([tier, m, x.name, x.feasible]);
        s = next;
      }
    }
  });
  it('모자라면 까닭을 붙이고, 다 만들면 null — 화면 진행 메모의 경우(소주 2 · 몰트 6 → 몰트는 발효조 부족)', () => {
    const plan = orderPlan(order(game(), [2, 6, 0]));
    const malt = plan.find((x) => x.kind === 'malt')!;
    expect(malt.ordered).toBe(6);
    expect(malt.feasible).toBeLessThan(6);
    expect(malt.blocker).toBe('발효조 부족');
    expect(plan.find((x) => x.kind === 'soju')).toMatchObject({ ordered: 2, feasible: 2, blocker: null });
  });
  it('결산 메모 문구 — 조사 오류 없이 「n배치 생산 못 함 — 까닭」', () => {
    const next = advanceMonth(order(game(), [2, 6, 0]));
    const note = next.history.reports.at(-1)!.notes.find((n) => n.includes('생산 못 함'))!;
    expect(note).toMatch(/: \d+배치 생산 못 함 — 발효조 부족$/);
  });
  it('전망(productionValue · whiskySupplyForecast)은 지시 수가 아니라 실제 가능 배치로 센다', () => {
    const lo = order(game(), [2, 6, 0]);
    const malt = orderPlan(lo).find((x) => x.kind === 'malt')!;
    const same = order(game(), [2, malt.feasible, 0]); // 처음부터 가능한 만큼만 지시한 판
    expect(productionValue(lo).whiskyBottlesPerYear).toBe(productionValue(same).whiskyBottlesPerYear);
    expect(productionValue(lo).costPerMonth).toBe(productionValue(same).costPerMonth);
    expect(productionValue(lo).shortBatches).toBe(6 - malt.feasible);
    expect(productionValue(same).shortBatches).toBe(0);
    expect(whiskySupplyForecast(lo, 3).map((y) => y.fromOrders)).toEqual(whiskySupplyForecast(same, 3).map((y) => y.fromOrders));
  });
  it('steady — 이번 달만의 사정(소주 건너뛰기)은 여러 해 전망에서 뺀다', () => {
    let s = order(game(), [2, 2, 0]);
    s = applyAction(s, { type: 'skipSojuThisMonth', on: true }).state;
    expect(orderPlan(s).find((x) => x.kind === 'soju')).toMatchObject({ feasible: 0, blocker: '이번 달 소주 건너뛰기' });
    expect(orderPlan(s, { steady: true }).find((x) => x.kind === 'soju')!.feasible).toBe(2);
  });
  it('상태를 바꾸지 않는다', () => {
    const s = order(game(), [2, 6, 0]);
    const before = JSON.stringify(s);
    orderPlan(s); caskRunway(s); productionValue(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('caskRunway — 빈 나무 통이 떨어지는 때', () => {
  it('몰트를 만들지 않으면 null', () => {
    expect(caskRunway(order(game(), [2, 0, 0]))).toBeNull();
  });
  it('빈 통 ÷ 매달 드는 통 — 통을 사면 늘고, 도착 예정도 센다', () => {
    const s = order(game(), [0, 4, 0]);
    const r = caskRunway(s)!;
    expect(r.empty).toBe(s.inventory.casks.filter((c) => !c.contents).length);
    expect(r.casksPerMonth).toBeGreaterThan(0);
    expect(r.months).toBe(Math.floor(r.empty / r.casksPerMonth));
    const more = applyAction(s, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: 20 });
    if (more.error) throw new Error(more.error);
    const r2 = caskRunway(more.state)!;
    expect(r2.onOrder).toBe(20);
    expect(r2.months).toBeGreaterThan(r.months);
  });
  it('자동 통입을 켜도 리터 ÷ 통 크기 그대로 — 덜 찰 끝자리는 탱크에 두고 합친다(후보 ②)', () => {
    let s = order(game(), [2, 2, 0]);
    const manual = caskRunway(s)!.casksPerMonth;
    s = applyAction(s, { type: 'setAutoFill', settings: {} }).state;
    expect(caskRunway(s)!.casksPerMonth).toBeCloseTo(manual, 9);
    const buy = applyAction(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: 20 }); // 12달 동안 통이 떨어지지 않게
    if (buy.error) throw new Error(buy.error);
    s = buy.state;
    const empty0 = s.inventory.casks.filter((c) => !c.contents).length;
    for (let m = 0; m < 13; m++) s = advanceMonth(s); // 12번 통입
    const used = empty0 - s.inventory.casks.filter((c) => !c.contents).length;
    // 실제로 만든 몰트를 63.5%·200L로 나눈 통 수와 거의 같다 — 끝자리마다 통 하나씩 더 쓰지 않는다(전에는 매달 +1)
    const maltLpa = s.history.reports.slice(0, 12).reduce((t, r) => t + r.production.filter((p) => s.production.recipes.find((x) => x.id === p.recipeId)?.kind === 'malt').reduce((u, p) => u + p.lpa, 0), 0);
    expect(used).toBeLessThanOrEqual(maltLpa / 0.635 / 200);
    expect(used).toBeGreaterThanOrEqual(maltLpa / 0.635 / 200 - 1); // 탱크에 둔 끝자리는 통 하나 미만
    expect(s.inventory.casks.filter((c) => c.contents && c.contents.volumeL < 180).length).toBe(0); // 생산이 이어지는 동안은 꽉 차는 통만(증발로 조금 준 것 제외)
  });
  it('생산 지시를 끄면 남은 끝자리도 그 달에 넣는다 — 탱크에 영영 남지 않는다', () => {
    let s = order(game(), [0, 2, 0]);
    s = advanceMonth(s); // 탱크에 몰트 한 달 치
    s = applyAction(s, { type: 'setAutoFill', settings: {} }).state;
    const tank = () => s.inventory.lots.filter((l) => l.kind === 'malt').reduce((t, l) => t + l.volumeL, 0);
    const pv = autoFillPreview(s, s.inventory.autoFill!);
    expect(pv.heldL).toBeGreaterThan(0); // 만드는 중 — 끝자리를 둔다
    expect(pv.leftL).toBe(0); // 빈 통이 모자란 것이 아니다
    s = order(s, [0, 0, 0]);
    expect(autoFillPreview(s, s.inventory.autoFill!).heldL).toBe(0);
    s = advanceMonth(s);
    expect(tank()).toBeLessThan(1);
  });
  it('탱크에 이미 쌓인 원액이 빈 통보다 많으면 0개월(이미 모자람)', () => {
    let s = order(game(), [0, 4, 0]);
    for (let m = 0; m < 14; m++) s = advanceMonth(s); // 통입하지 않고 14달 — 탱크에 쌓인다
    expect(caskRunway(s)!.months).toBe(0);
  });
});

describe('steadyBatch — 초류·후류 재투입이 쌓인 정상 상태 배치 (후보 ①)', () => {
  it.each(['micro', 'standard'] as const)('같은 레시피만 돌리면 넷째 달 실제 배치당 LPA와 같다 (%s)', (tier) => {
    const s0 = game(tier);
    for (const r of s0.production.recipes) {
      let s = applyAction(s0, { type: 'setOrder', recipeId: r.id, batchesPerMonth: 2 }).state;
      const steady = steadyBatch(s, r)!;
      const first = previewBatch(s, r)!;
      expect(steady.lpa).toBeGreaterThan(first.lpa); // 첫 배치(재투입 없음)보다 많다
      expect(steady.cost).toBe(first.cost); // 원가는 같다 — 원료·에너지는 그대로, 수율만 오른다
      for (let m = 0; m < 4; m++) s = advanceMonth(s);
      const rep = s.history.reports.at(-1)!.production.find((x) => x.recipeId === r.id)!;
      expect(steady.lpa).toBeCloseTo(rep.lpa / rep.batches, 1);
    }
  });
});
