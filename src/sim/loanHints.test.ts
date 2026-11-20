import { describe, expect, it } from 'vitest';
import { newScenarioGame, type GameState } from '../sim';
import { availableLoans, cheapestLoan, loanTerms } from './loans';
import { undefendedDisasters } from './events';

// 7차 판 뒤 화면 계산 (docs/playtest/7/mgt/README.md · [제안 P-MGT-60·61]) — 상태를 바꾸지 않고 대출 탭·이벤트 규칙과 같은 값을 낸다
const mvp = (): GameState => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 1 });

describe('cheapestLoan (P-MGT-60)', () => {
  it('받을 수 있는 상품 중 금리가 가장 낮은 것 · 지금 낼 돈은 loanTerms와 같다 · 상태 불변', () => {
    const s = mvp();
    const before = JSON.stringify(s);
    const c = cheapestLoan(s)!;
    expect(JSON.stringify(s)).toBe(before);
    const open = availableLoans(s).filter((x) => !x.blocked && x.max > 0);
    expect(c.offer.annualRate).toBe(Math.min(...open.map((x) => x.offer.annualRate)));
    expect(c.paymentNow).toBe(loanTerms(c.offer, c.max, s.month).paymentNow);
    expect(c.offer.id).toBe('kr_regional'); // 한국 표준: 지자체 육성자금 연 2% · 3억 · 거치 24개월
    expect(c.paymentNow).toBe(500_000);
  });

  it('이미 쓰는 상품은 빼고 다음으로 싼 것 · 대출이 잠기면 null', () => {
    const s = mvp();
    s.finance.loans.push({ id: 'L1', offerId: 'kr_regional', principal: 300_000_000, balance: 300_000_000, annualRate: 0.02, termMonths: 96, graceMonths: 24, openedMonth: 0 } as unknown as GameState['finance']['loans'][number]);
    expect(cheapestLoan(s)?.offer.id).not.toBe('kr_regional');
    s.scenario!.locked.push('action:takeLoan');
    expect(cheapestLoan(s)).toBeNull();
  });
});

describe('undefendedDisasters (P-MGT-61)', () => {
  const withReports = (s: GameState, events: Record<number, string[]>) => {
    s.month = 30;
    s.history.reports = Array.from({ length: 30 }, (_, m) => ({ month: m, events: events[m] ?? [] }) as unknown as GameState['history']['reports'][number]);
    return s;
  };

  it('최근 24개월 결산의 재해 제목을 세고, 방재 설비 이름·값을 붙인다', () => {
    const s = withReports(mvp(), { 3: ['폭설'], 10: ['폭설', '한파'], 20: ['한파'] });
    s.scenario!.locked = s.scenario!.locked.filter((x) => x !== 'facility:facility_snow' && x !== 'facility:facility_heating');
    const d = undefendedDisasters(s, 24);
    expect(d.find((x) => x.defId === 'snowstorm')).toMatchObject({ count: 1, facility: '내설 지붕 보강', cost: 40_000_000 }); // 3개월째는 24개월 밖
    expect(d.find((x) => x.defId === 'cold_wave')?.count).toBe(2);
  });

  it('설비가 있거나 잠겨 있으면 뺀다', () => {
    const s = withReports(mvp(), { 10: ['폭설', '한파'] });
    s.scenario!.locked = s.scenario!.locked.filter((x) => x !== 'facility:facility_snow').concat('facility:facility_heating');
    s.production.equipment.push({ id: 'EX', catalogId: 'facility_snow', readyMonth: 0 } as GameState['production']['equipment'][number]);
    expect(undefendedDisasters(s, 24)).toEqual([]);
  });
});
