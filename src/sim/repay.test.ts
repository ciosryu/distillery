import { describe, expect, it } from 'vitest';
import { advanceMonths, annuityPayment, applyAction, currentLoanPayment, newGame, type GameState } from './index';
import { PARTIAL_REPAY_MIN } from './actions.mgt';

// 대출 일부 상환 (#181, PRD §8.1.1 안 B) — 파트 MGT

const withLoan = (offerId: string, amount: number): GameState => {
  const s = newGame({ seed: 1, startingCash: 5_000_000_000 });
  return applyAction(s, { type: 'takeLoan', offerId, amount }).state;
};

describe('대출 일부 상환 (#181)', () => {
  it('거치 없는 대출: 잔액이 줄고, 남은 기간 그대로 월 납부를 다시 계산한다', () => {
    let s = advanceMonths(withLoan('working', 300_000_000), 6);
    const l0 = s.finance.loans[0]!;
    const left = l0.startMonth + l0.termMonths - s.month;
    const cash = s.finance.cash;
    const r = applyAction(s, { type: 'repayLoan', loanId: l0.id, amount: 100_000_000 });
    expect(r.error).toBeUndefined();
    s = r.state;
    const l = s.finance.loans[0]!;
    expect(l.balance).toBe(l0.balance - 100_000_000);
    expect(s.finance.cash).toBe(cash - 100_000_000);
    expect(l.monthlyPayment).toBe(annuityPayment(l.balance, l.annualRate, left));
    expect(l.monthlyPayment).toBeLessThan(l0.monthlyPayment);
    // 원래 만기에 다 갚는다
    s = advanceMonths(s, left);
    expect(s.finance.loans.some((x) => x.id === l.id)).toBe(false);
  });

  it('거치 중인 대출: 이자가 바로 줄고, 거치 뒤 납부는 줄어든 잔액 기준', () => {
    const s = withLoan('facility', 1_000_000_000);
    const l0 = s.finance.loans[0]!;
    const t = applyAction(s, { type: 'repayLoan', loanId: l0.id, amount: 400_000_000 }).state;
    const l = t.finance.loans[0]!;
    expect(currentLoanPayment(t, l)).toBe(Math.round(600_000_000 * (l.annualRate / 12)));
    expect(l.monthlyPayment).toBe(annuityPayment(600_000_000, l.annualRate, l.termMonths - l.graceMonths));
  });

  it('잔액 이상이면 전액 상환, 최소액·현금 부족은 거절, 금액이 없으면 예전처럼 전액', () => {
    const s = withLoan('working', 100_000_000);
    const id = s.finance.loans[0]!.id;
    expect(applyAction(s, { type: 'repayLoan', loanId: id, amount: PARTIAL_REPAY_MIN - 1_000_000 }).error).toMatch(/이상/);
    expect(applyAction(s, { type: 'repayLoan', loanId: id, amount: 1e12 }).state.finance.loans).toEqual([]);
    expect(applyAction(s, { type: 'repayLoan', loanId: id }).state.finance.loans).toEqual([]);
    const poor = { ...s, finance: { ...s.finance, cash: 5_000_000 } };
    expect(applyAction(poor, { type: 'repayLoan', loanId: id, amount: 50_000_000 }).error).toMatch(/현금이 부족/);
  });
});
