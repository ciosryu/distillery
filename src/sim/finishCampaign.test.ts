import { describe, expect, it } from 'vitest';
import { advanceMonth, applyAction, newScenarioGame, type GameState } from './index';
import { caskEligibility } from './ledger';
import { finishOf } from './maturation';
import { sampleNoiseId } from './rules';
import { knownReads } from './blendTable';

// #345 ② 피니싱(GAP-PROD-4)을 v16 캠페인에서 열기 전 확인 (PM 2026-11-24 조건 (b) · (c))
// (b) 12년 승리 적격(목재 숙성 개월)이 피니싱 뒤에도 이어지는가 · (c) 피니싱 뒤 첫 샘플 잡음이 새로 뽑히는가(#351)

/** 목재 150개월 자가 몰트가 든 버번 통 하나 + 빈 올로로소 셰리 벗 하나 — 피니싱 잠금은 시험에서만 푼다(실제 판은 60개월 y5_finish — 결정 #354) */
function setup(): { s: GameState; fromId: string; toId: string } {
  let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 11, rules: 'v16' });
  const malt = s.production.recipes.find((r) => r.kind === 'malt')!;
  s = applyAction(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: 1 }).state;
  s = advanceMonth(s);
  s = applyAction(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: 1 }).state;
  const lot = s.inventory.lots.find((l) => l.kind === 'malt')!;
  const from = s.inventory.casks.find((c) => !c.contents && c.typeId === 'ex_bourbon_barrel')!;
  s = applyAction(s, { type: 'fillCasks', lotId: lot.id, caskIds: [from.id], entryAbv: 0.63 }).state;
  // 150개월 숙성한 것처럼 — 로트 숙성 개월과 원장 목재 개월을 함께 올린다(원장 불변식 min(woodMonths) = oakMonths)
  const c = s.inventory.casks.find((x) => x.id === from.id)!;
  c.contents = { ...c.contents!, oakMonths: 150, components: c.contents!.components!.map((e) => ({ ...e, woodMonths: 150 })) };
  s = applyAction(s, { type: 'buySpotCasks', caskType: 'oloroso_butt', qty: 1 }).state;
  const to = s.inventory.casks.find((x) => !x.contents && x.typeId === 'oloroso_butt')!;
  s.scenario!.locked = s.scenario!.locked.filter((k) => k !== 'action:transferCask');
  return { s, fromId: from.id, toId: to.id };
}

describe('v16 캠페인 피니싱 — 승리 적격 · 샘플 잡음 (#345 ② · #351)', () => {
  it('(b) 승리 적격 통을 셰리 벗으로 피니싱해도 목재 숙성 개월이 이어져 적격이 남는다', () => {
    const { s: s0, fromId, toId } = setup();
    const before = caskEligibility(s0, s0.inventory.casks.find((c) => c.id === fromId)!);
    expect(before.eligible).toBe(true);
    const r = applyAction(s0, { type: 'transferCask', fromCaskId: fromId, toCaskId: toId });
    expect(r.error).toBeFalsy();
    let s = r.state;
    const moved = s.inventory.casks.find((c) => c.id === toId)!;
    const after = caskEligibility(s, moved);
    expect(after.eligible).toBe(true);
    expect(after.woodMonths).toBe(before.woodMonths); // 옮긴 달에는 그대로
    expect(moved.contents!.oakMonths).toBe(150);
    s = advanceMonth(s);
    const aged = s.inventory.casks.find((c) => c.id === toId)!;
    expect(caskEligibility(s, aged).woodMonths).toBe(before.woodMonths + 1); // 셰리 벗(유럽 참나무)에서도 목재 개월이 쌓인다
    expect(finishOf(aged.contents!)).toEqual({ typeId: 'oloroso_butt', months: 1 });
  });

  it('(c) 피니싱한 통은 샘플 기록이 비워지고, 다음 샘플은 새 통 id · 새 채움 번호의 잡음으로 읽는다', () => {
    const { s: s0, fromId, toId } = setup();
    const oldId = sampleNoiseId(s0, s0.inventory.casks.find((c) => c.id === fromId)!);
    const toBefore = s0.inventory.casks.find((c) => c.id === toId)!;
    let s = applyAction(s0, { type: 'transferCask', fromCaskId: fromId, toCaskId: toId }).state;
    const moved = s.inventory.casks.find((c) => c.id === toId)!;
    expect(moved.sampleLog).toBeUndefined();
    expect(knownReads(s).get(toId)).toBeUndefined(); // 기록 없음 — 화면은 "모른다(샘플 먼저)"
    expect(moved.fills).toBe(toBefore.fills + 1);
    const newId = sampleNoiseId(s, moved);
    expect(newId).toBe(`${toId}#f${moved.fills}`);
    expect(newId).not.toBe(oldId); // 옮기기 전 통의 잡음을 이어 쓰지 않는다
    expect(newId).not.toBe(sampleNoiseId(s0, toBefore)); // 셰리 벗의 지난 채움 잡음도 아니다
    s = advanceMonth(s); // 자동 샘플은 기록 없는 통부터 뜬다
    expect(knownReads(s).get(toId)?.from).toBe('own');
  });
});
