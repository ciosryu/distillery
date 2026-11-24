import { describe, expect, it } from 'vitest';
import { applyAction, newScenarioGame, type GameState } from '../sim';
import { emptyCaskOf } from '../sim/newGame';
import { fillTally, freshPlaylog, parsePlayFile, withFill, withTurns } from './playlog';

// [제안 P-ARCH-88] 손 통입 통 수 · 덜 찬 통 수를 턴 기록에 — 세이브 · sim은 그대로, 기록 파일에만
describe('playlog 손 통입 합계 (P-ARCH-88)', () => {
  const setup = (): { s: GameState; lotId: string; ids: string[] } => {
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 4, rules: 'v16' });
    const casks = [emptyCaskOf(s, 'ex_bourbon_barrel'), emptyCaskOf(s, 'ex_bourbon_barrel')];
    casks.forEach((c, i) => { c.id = `KF${i}`; s.inventory.casks.push(c); });
    s.inventory.lots.push({ id: 'LF', name: '몰트', kind: 'malt', volumeL: 280, abv: 0.635, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 10_000 } as never);
    return { s, lotId: 'LF', ids: casks.map((c) => c.id) };
  };
  it('두 통에 280L — 한 통은 꽉(200L) · 한 통은 덜 찬(80L) → casks 2 · partial 1', () => {
    const { s, lotId, ids } = setup();
    const r = applyAction(s, { type: 'fillCasks', lotId, caskIds: ids, entryAbv: 0.635 });
    expect(r.error).toBeFalsy();
    expect(fillTally(s, r.state, ids)).toEqual({ casks: 2, partial: 1 });
  });
  it('턴 기록의 첫 달에 붙고 비운다 · 통입 없던 턴에는 없다 · 옛 기록(필드 없음)도 그대로 읽는다', () => {
    let log = withFill(withFill(freshPlaylog(0), { casks: 2, partial: 1 }), { casks: 3, partial: 0 });
    expect(log.pendingFill).toEqual({ casks: 5, partial: 1 });
    log = withTurns(log, 10, 12, 'quarter');
    expect(log.turns.map((t) => t.fill)).toEqual([{ casks: 5, partial: 1 }, undefined]);
    expect(log.pendingFill).toBeUndefined();
    log = withTurns(log, 12, 13, 'month');
    expect(log.turns.at(-1)!.fill).toBeUndefined();
    expect(withFill(log, { casks: 0, partial: 0 })).toBe(log);
    const { s } = setup();
    const old = parsePlayFile(JSON.stringify({ kind: 'distillery-playtest', v: 1, exportedAt: 'x', playlog: { v: 1, startedAt: 0, activeMs: 0, actions: 0, turns: [{ month: 1, activeMs: 0, actions: 0 }] }, save: s }));
    expect('error' in old).toBe(false);
  });
});
