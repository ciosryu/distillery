// 자동 진행 멈춤 `flagshipReady` — 12년 적격 통이 처음 생긴 달 (결정 대기 100 · 6차 판 docs/playtest/6/arch.md ①). 상태는 읽기만(출력 불변)
import { describe, expect, it } from 'vitest';
import { advanceMonth, advanceUntil, DEFAULT_STOPS, hasWinReadyCask, newScenarioGame, type GameState, type SpiritLot } from '.';
import { emptyCaskOf } from './newGame';

const lot = (over: Partial<SpiritLot> = {}): SpiritLot => ({ id: 'LX', name: 'l', kind: 'malt', volumeL: 200, abv: 0.6, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 10_000, ...over });
const withCask = (s: GameState, oakMonths: number) => { const c = emptyCaskOf(s, 'ex_bourbon_barrel'); c.id = 'K-old'; c.contents = lot({ oakMonths }); s.inventory.casks.push(c); return s; };
const game = (rules?: 'legacy-v15') => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 4, ...(rules ? { rules } : {}) });

describe('자동 진행 멈춤 — 12년 적격 첫 달', () => {
  it('목재 143개월 통이 한 달 뒤 144개월(적격)이 되면 그 달에 멈춘다 · 기본 멈춤 목록에 있다', () => {
    const s = withCask(game(), 143);
    expect(hasWinReadyCask(s)).toBe(false);
    const r = advanceUntil(s, { months: 12, stopOn: ['flagshipReady'] });
    expect(r).toMatchObject({ months: 1, stoppedBy: 'flagshipReady' });
    expect(hasWinReadyCask(r.state)).toBe(true);
    expect(DEFAULT_STOPS).toContain('flagshipReady');
  });

  it('이미 적격 통이 있으면 다시 멈추지 않는다 (판에 한 번)', () => {
    const s = withCask(game(), 150);
    expect(advanceUntil(s, { months: 6, stopOn: ['flagshipReady'] })).toMatchObject({ months: 6, stoppedBy: 'maxMonths' });
  });

  it('멈춤은 상태를 바꾸지 않는다 — 같은 달 수를 한 달씩 진행한 것과 같다', () => {
    const s = withCask(game(), 143);
    const r = advanceUntil(s, { months: 1, stopOn: ['flagshipReady'] });
    expect(r.state).toEqual(advanceMonth(withCask(game(), 143)));
  });

  it('옛 판(legacy-v15)·승리 뒤에는 멈추지 않는다', () => {
    expect(advanceUntil(withCask(game('legacy-v15'), 143), { months: 3, stopOn: ['flagshipReady'] }).stoppedBy).toBe('maxMonths');
    const won = withCask(game(), 143);
    won.progress.win = { month: 0, productId: 'P', lotId: 'P:0:0', kind: 'domestic', unitPrice: 1, bottles: 1 } as never;
    expect(advanceUntil(won, { months: 3, stopOn: ['flagshipReady'] }).stoppedBy).toBe('maxMonths');
  });
});
