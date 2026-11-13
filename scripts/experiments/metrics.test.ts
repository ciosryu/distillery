import { describe, expect, it } from 'vitest';
import { bankruptAfterWin, classifyWin, comparePairedWin, summarizeWin, winOutcomeOf, type WinInput } from './metrics';

// 새 승리 판정 지표 (P-MGT-46) — 게임 상태 없이 손으로 만든 값으로 분류·집계 규칙을 고정한다
const W = 180;
const run = (x: Partial<WinInput>): WinInput => ({ window: W, eligibleAtWindow: false, ...x });

describe('classifyWin', () => {
  it('창 안 승리는 승리 — 승리 뒤 파산해도 승리(사건이 먼저)', () => {
    expect(classifyWin(run({ winMonth: 145 }))).toBe('win');
    const x = run({ winMonth: 145, endMonth: 170, endBankrupt: true });
    expect(classifyWin(x)).toBe('win');
    expect(bankruptAfterWin(x)).toBe(true);
    expect(bankruptAfterWin(run({ winMonth: 145 }))).toBe(false);
  });
  it('창 경계 — 승리 달 = 창이면 승리, 창 뒤 승리는 관측 종료', () => {
    expect(classifyWin(run({ winMonth: 180 }))).toBe('win');
    expect(classifyWin(run({ winMonth: 181, eligibleAtWindow: true }))).toBe('censored_ready');
    expect(classifyWin({ window: 240, winMonth: 181, eligibleAtWindow: true })).toBe('win');
  });
  it('승리 없이 끝나면 파산 또는 기타 종료', () => {
    expect(classifyWin(run({ endMonth: 80, endBankrupt: true }))).toBe('bankrupt');
    expect(classifyWin(run({ endMonth: 80, endBankrupt: false }))).toBe('ended');
    expect(classifyWin(run({ endMonth: 200, endBankrupt: true }))).toBe('censored_none');
  });
  it('끝나지 않고 승리도 없으면 관측 종료 — 적격 원액 유무로 나눈다(파산과 섞지 않는다)', () => {
    expect(classifyWin(run({ eligibleAtWindow: true }))).toBe('censored_ready');
    expect(classifyWin(run({ eligibleAtWindow: false }))).toBe('censored_none');
  });
  it('승리 달은 승리 판에만 남는다', () => {
    expect(winOutcomeOf(run({ winMonth: 150 }))).toEqual({ cls: 'win', window: W, winMonth: 150 });
    expect(winOutcomeOf(run({ winMonth: 200, eligibleAtWindow: true }))).toEqual({ cls: 'censored_ready', window: W });
  });
});

describe('summarizeWin', () => {
  const os = [
    winOutcomeOf(run({ winMonth: 145 })),
    winOutcomeOf(run({ winMonth: 145 })),
    winOutcomeOf(run({ winMonth: 160 })),
    winOutcomeOf(run({ endMonth: 80, endBankrupt: true })),
    winOutcomeOf(run({ eligibleAtWindow: true })),
  ];
  const sm = summarizeWin(os);
  it('분류 수·비율·Wilson 구간', () => {
    expect(sm.n).toBe(5);
    expect(sm.count).toEqual({ win: 3, bankrupt: 1, ended: 0, censored_ready: 1, censored_none: 0 });
    expect(sm.rate.win).toBeCloseTo(0.6);
    expect(sm.ci.win[0]).toBeLessThan(0.6);
    expect(sm.ci.win[1]).toBeGreaterThan(0.6);
    expect(sm.ci.ended).toEqual([0, expect.any(Number)]);
  });
  it('승리 달 분포는 승리 판만', () => {
    expect(sm.winMonthMedian).toBe(145);
    expect(sm.winMonthP90).toBe(160);
  });
  it('누적 승리 곡선 — 전체 판 대비, 창 넘는 눈금은 NaN', () => {
    expect(sm.cum[144]).toBe(0);
    expect(sm.cum[150]).toBeCloseTo(0.4);
    expect(sm.cum[168]).toBeCloseTo(0.6);
    expect(sm.cum[180]).toBeCloseTo(0.6);
    expect(sm.cum[240]).toBeNaN();
  });
  it('측정 창이 다른 판을 섞으면 멈춘다', () => {
    expect(() => summarizeWin([winOutcomeOf(run({})), winOutcomeOf({ window: 240, eligibleAtWindow: false })])).toThrow();
  });
});

describe('comparePairedWin', () => {
  it('네 칸과 둘 다 승리한 시드의 승리 달 차이', () => {
    const a = [145, 145, 150, undefined, undefined].map((m) => winOutcomeOf(run({ winMonth: m })));
    const b = [146, 150, undefined, 160, undefined].map((m) => winOutcomeOf(run({ winMonth: m })));
    const c = comparePairedWin(a, b);
    expect([c.both, c.onlyA, c.onlyB, c.neither]).toEqual([2, 1, 1, 1]);
    expect(c.winMonthDiff).toBeCloseTo(-3); // (−1 + −5) / 2 — A가 빠르다
    expect(Number.isFinite(c.t)).toBe(true);
  });
  it('판 수가 다르면 멈춘다', () => {
    expect(() => comparePairedWin([winOutcomeOf(run({}))], [])).toThrow();
  });
});
