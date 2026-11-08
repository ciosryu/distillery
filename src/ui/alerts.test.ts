import { describe, expect, it } from 'vitest';
import { advanceMonth, advanceMonths, applyAction, BANKRUPT_AFTER_MONTHS, newScenarioGame, type GameState } from '../sim';
import { cashAlert, lastMonthFlow, loanSchedule, monthTodos, paymentJump } from './alerts';

// 1차 MVP 플레이테스트 대응 ①~④ — 화면용 계산이 시뮬레이션과 같은 값을 내는지 (코어 UI)
const mvp = (loanAmount = 0) => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount, seed: 1 });

describe('파산 카운트다운 (①)', () => {
  it('현금 부족 n개월째면 월말 (파산 기준 − n)번 남았다고 말한다 — 1이면 이번 달 말', () => {
    const s = mvp();
    expect(cashAlert(s)).toBeNull();
    s.finance.cash = -1;
    expect(cashAlert(s)?.kind).toBe('belowZeroNow');
    s.finance.negativeCashMonths = BANKRUPT_AFTER_MONTHS - 1;
    const a = cashAlert(s)!;
    expect(a.level).toBe('danger');
    expect(a.monthEndsLeft).toBe(1);
  });

  it('카운트다운 1이 뜬 상태에서 월말에도 마이너스면 실제로 파산한다 (step.ts와 같은 기준)', () => {
    let s: GameState = mvp();
    s.finance.cash = -1_000_000_000;
    s.finance.negativeCashMonths = BANKRUPT_AFTER_MONTHS - 1;
    expect(cashAlert(s)!.monthEndsLeft).toBe(1);
    s = advanceMonth(s);
    expect(s.status).toBe('bankrupt');
    expect(cashAlert(s)).toBeNull();
  });

  it('현금이 플러스여도 최근 3개월 속도로 3개월 안에 바닥나면 미리 노랑', () => {
    const s = mvp();
    s.finance.cash = 30_000_000;
    s.history.reports.push(...[1, 2, 3].map((m) => ({ month: m, netCash: -12_000_000 }) as unknown as GameState['history']['reports'][number]));
    const a = cashAlert(s)!;
    expect(a.kind).toBe('runway');
    expect(a.level).toBe('warn');
    expect(a.runwayMonths).toBe(2);
  });
});

describe('대출 상환 예정 (②)', () => {
  it('예정 원리금이 실제 결산의 이자 + 원금과 같다', () => {
    let s: GameState = mvp(300_000_000);
    expect(s.finance.loans.length).toBeGreaterThan(0);
    const sched = loanSchedule(s, 3);
    for (let i = 0; i < 3; i++) {
      s = advanceMonth(s);
      const r = s.history.reports.at(-1)!;
      expect((r.expenses.interest ?? 0) + (r.expenses.principal ?? 0)).toBe(sched[i]!.payment);
    }
  });

  it('거치가 끝나 납부가 뛰는 달을 찾는다', () => {
    const s = mvp();
    s.finance.loans = [{ id: 'L', offerId: 'x', name: 'x', principal: 100_000_000, balance: 100_000_000, annualRate: 0.06, termMonths: 60, monthlyPayment: 2_000_000, graceMonths: 3, startMonth: s.month }];
    const j = paymentJump(loanSchedule(s, 12))!;
    expect(j.month).toBe(s.month + 3);
    expect(j.from).toBe(500_000);
    expect(j.to).toBe(2_000_000);
  });
});

describe('이번 달 할 일 (③) · 지난달 현금 흐름 (④)', () => {
  it('탱크 몰트가 있으면 통입 대기를 알린다', () => {
    let s: GameState = mvp();
    const malt = s.production.recipes.find((r) => r.kind === 'malt')!;
    s = applyAction(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: 2 }).state;
    expect(monthTodos(s).some((t) => t.id === 'fill')).toBe(false);
    s = advanceMonth(s);
    expect(monthTodos(s).some((t) => t.id === 'fill')).toBe(true);
  });

  it('들어온 돈 + 나간 돈 = 그달 순현금 (결산표와 같은 원천)', () => {
    let s: GameState = mvp(200_000_000);
    const soju = s.production.recipes.find((r) => r.kind === 'soju')!;
    s = applyAction(s, { type: 'setOrder', recipeId: soju.id, batchesPerMonth: 2 }).state;
    s = advanceMonths(s, 6);
    for (const r of s.history.reports) {
      const f = lastMonthFlow(r);
      const sum = [...f.inflow, ...f.outflow].reduce((t, p) => t + p.amount, 0);
      expect(Math.abs(sum - r.netCash)).toBeLessThanOrEqual(f.inflow.length + f.outflow.length);
      expect(f.outflow.every((p) => p.amount < 0) && f.inflow.every((p) => p.amount > 0)).toBe(true);
    }
  });
});
