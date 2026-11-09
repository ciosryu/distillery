import { describe, expect, it } from 'vitest';
import { advanceMonth, advanceMonths, applyAction, BANKRUPT_AFTER_MONTHS, newGame, newScenarioGame, type GameState } from '../sim';
import { AUTO_SAMPLE_EXPENSE, AUTO_SAMPLE_MIN_AGE } from '../sim/blendTable';
import { cashAlert, runway, lastMonthFlow, loanSchedule, monthTodos, paymentJump, SAMPLE_STALE_MONTHS } from './alerts';

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

describe('ARCH 사후 검토 (#90) — 시뮬레이션이 쓰는 지출 키는 모두 이름이 있다', () => {
  it('선도계약 정산(hedge, #179)·자동 샘플(#177)은 "기타"로 빠지지 않는다', () => {
    const r = { ...mvp().history.reports.at(-1), month: 0, revenue: 0, bulkRevenue: 0, netCash: -150, expenses: { hedge: 100, [AUTO_SAMPLE_EXPENSE]: 50 }, offTurn: {}, sales: [] } as never;
    const f = lastMonthFlow(r);
    expect(f.outflow.map((p) => p.label).sort()).toEqual(['샘플·분석', '선도계약 정산']);
  });
  it('"샘플 시기" 기준 = 자동 샘플이 뜨는 기준', () => {
    expect(SAMPLE_STALE_MONTHS).toBe(AUTO_SAMPLE_MIN_AGE);
  });
});

describe('런웨이 — 한 번 나가는 설비 구매는 "이 속도"에 넣지 않는다', () => {
  it('시작하자마자 비지터 센터를 지어도 첫 달에 "약 3개월 뒤 바닥" 경보가 뜨지 않는다', () => {
    let s = mvp();
    s = applyAction(s, { type: 'buyEquipment', catalogId: 'visitor_basic' }).state;
    s = advanceMonth(s);
    expect(s.history.reports.at(-1)!.offTurn?.equipment).toBeLessThan(0);
    expect(runway(s).months!).toBeGreaterThan(6);
    expect(cashAlert(s)).toBeNull();
  });
});

describe('비지터 센터 할 일 (#139 P-MGT-14, mvp.md §7.8)', () => {
  it('MVP 판에서 비지터 센터가 없으면 뜨고, 발주하면(짓는 중 포함) 사라진다. 샌드박스는 안 뜬다', () => {
    let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const t = monthTodos(s).find((x) => x.id === 'visitor');
    expect(t?.level).toBe('warn');
    expect(t?.target).toEqual({ anchor: 'mvp-crafting' });
    expect(t?.text).toMatch(/관광 매출 0원/);
    s = applyAction(s, { type: 'buyEquipment', catalogId: 'visitor_basic' }).state;
    expect(s.production.equipment.some((e) => e.catalogId === 'visitor_basic' && e.readyMonth > s.month)).toBe(true);
    expect(monthTodos(s).some((x) => x.id === 'visitor')).toBe(false);
    expect(monthTodos(newGame({ seed: 1 })).some((x) => x.id === 'visitor')).toBe(false);
  });
});
