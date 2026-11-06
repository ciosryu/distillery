import { describe, expect, it } from 'vitest';
import { advanceMonth, advanceMonths, advanceUntil, applyAction, DEFAULT_STOPS, GRADE, judgeGoal, migrateSave, netWorth, newGame, newScenarioGame, SAVE_VERSION, timelineOf, type GameState, type Product } from '.';
import fixture from './fixtures/save-v9.json';

const micro = (seed = 4) => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed });
const ids = (s: GameState) => s.progress.milestones.map((m) => m.id);
const product = (over: Partial<Product>): Product => ({ id: 'P', name: 'p', category: 'whisky', ageYears: 12, oakMonths: 150, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 85, typicity: 80, style: null, sourcedShare: 0, stockBottles: 0, price: 120_000, unitCost: 30_000, createdMonth: 0, lastMonthSold: 0, totalSold: 0, ...over });

describe('세이브 v9 → v10 (S-9)', () => {
  it('v9 세이브는 빈 진행 기록으로 이어지고, 진행 결과가 v9 코드와 같다', () => {
    const s = migrateSave(structuredClone(fixture.save))!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.progress).toEqual({ milestones: [] });
    const t = advanceMonths(s, 3);
    expect({ month: t.month, cash: t.finance.cash }).toEqual(fixture.expectedAfter3);
    // 이미 지난 일은 다음 판정 때 그 달 날짜로 잡힌다
    expect(ids(t)).toEqual(expect.arrayContaining(['first_distill', 'first_fill']));
  });

  it('옛 파산 세이브는 끝난 이유를 채운다', () => {
    const s = migrateSave({ ...structuredClone(fixture.save), status: 'bankrupt' })!;
    expect(s.progress.ending).toEqual({ reason: 'bankrupt', month: fixture.save.month });
  });
});

describe('마일스톤 (S-9)', () => {
  it('처음 일어난 달에 한 번만 기록한다', () => {
    let s = newGame({ seed: 4 }); // 첫 달에 생산을 멈추는 이벤트가 없는 시드 (S-5)
    const malt = s.production.recipes.find((r) => r.kind === 'malt')!;
    s = applyAction(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: 2 }).state;
    s = applyAction(s, { type: 'takeLoan', offerId: 'kr_regional', amount: 100_000_000 }).state;
    s = advanceMonth(s);
    expect(ids(s)).toEqual(expect.arrayContaining(['first_distill', 'first_loan']));
    expect(s.progress.milestones.find((m) => m.id === 'first_distill')!.month).toBe(0);
    s = advanceMonths(s, 3);
    expect(ids(s).filter((x) => x === 'first_distill')).toHaveLength(1);
    expect(s.history.reports[0]!.notes.some((n) => n.includes('마일스톤: 첫 증류'))).toBe(true);
  });

  it('연표에는 연표용 마일스톤만 달 순서로', () => {
    const s = { progress: { milestones: [{ id: 'first_whisky_sale' as const, month: 20 }, { id: 'first_loan' as const, month: 0 }, { id: 'first_distill' as const, month: 1 }] } };
    expect(timelineOf(s).map((m) => m.id)).toEqual(['first_distill', 'first_whisky_sale']);
  });
});

describe('목표 판정 (S-9, MVP §3)', () => {
  it('샌드박스는 판정하지 않는다', () => {
    expect(advanceMonths(newGame({ seed: 1 }), 6).progress.verdict).toBeUndefined();
  });

  it('시나리오 목표 기간이 끝나면 한 번 판정하고, 자동 진행은 거기서 멈춘다', () => {
    const s = micro();
    s.scenario!.goal.months = 4;
    const r = advanceUntil(s, { months: 12, stopOn: DEFAULT_STOPS });
    expect(r.stoppedBy).toBe('verdict');
    expect(r.state.month).toBe(4);
    const v = r.state.progress.verdict!;
    expect(v.month).toBe(4);
    expect(v.result).toBe('missed'); // 4개월에 플래그십·순자산 3배는 없다
    expect(v.checks.find((c) => c.id === 'survive')!.ok).toBe(true);
    expect(v.checks.find((c) => c.id === 'flagship')!.ok).toBe(false);
    // 판정 뒤에도 게임은 계속되고 판정은 바뀌지 않는다
    const later = advanceMonths(r.state, 3);
    expect(later.status).toBe('running');
    expect(later.progress.verdict).toEqual(v);
  });

  it('목표 기간 전에 파산하면 failed, 등급 없음, 끝난 이유 기록', () => {
    const s = micro();
    s.finance.cash = -10_000_000_000;
    const t = advanceMonths(s, 4);
    expect(t.status).toBe('bankrupt');
    expect(t.progress.ending?.reason).toBe('bankrupt');
    expect(t.progress.verdict?.result).toBe('failed');
    expect(t.progress.verdict?.grade).toBeNull();
    // 파산과 판정이 같은 달이면 파산이 먼저다
    expect(advanceUntil(s, { months: 6, stopOn: ['verdict'] }).stoppedBy).toBe('bankrupt');
  });

  it('등급: 목표를 모두 달성하면 A, 거기에 순자산·플래그십 품질·인지도가 기준을 넘으면 S', () => {
    const s = micro();
    s.progress.milestones.push({ id: 'flagship_sold', month: 170, value: GRADE.sFlagshipQuality + 5 });
    const target = s.scenario!.equity * s.scenario!.goal.netWorthMultiple;
    s.finance.cash = target * GRADE.sNetWorthRatio + 1;
    s.commerce.awareness = GRADE.sAwareness + 0.05;
    expect(judgeGoal(s, 180)).toMatchObject({ result: 'heritage', grade: 'S' });
    s.commerce.awareness = GRADE.sAwareness - 0.05;
    expect(judgeGoal(s, 180)).toMatchObject({ result: 'heritage', grade: 'A' });
    s.finance.cash = target - 1_000_000_000;
    expect(judgeGoal(s, 180)).toMatchObject({ result: 'missed', grade: 'B' }); // 플래그십만
    s.progress.milestones = [];
    expect(judgeGoal(s, 180)).toMatchObject({ result: 'missed', grade: 'C' }); // 버티기만
  });

  it('플래그십: 12년 이상 위스키를 병입하면 "병입", 한 병이라도 팔리면 "판매" (품질이 값으로 남는다)', () => {
    let s = micro();
    s.commerce.products.push(product({ totalSold: 0 }));
    s = advanceMonth(s);
    expect(ids(s)).toContain('flagship_bottled');
    expect(ids(s)).not.toContain('flagship_sold');
    s.commerce.products.find((p) => p.id === 'P')!.totalSold = 1;
    s = advanceMonth(s);
    expect(s.progress.milestones.find((m) => m.id === 'flagship_sold')?.value).toBe(85);
    // 11년짜리는 플래그십이 아니다
    let t = micro();
    t.commerce.products.push(product({ id: 'Q', oakMonths: 143, ageYears: 11, totalSold: 5 }));
    t = advanceMonth(t);
    expect(ids(t)).not.toContain('flagship_sold');
  });
});

describe('순자산 (S-9) — 지금 정리하면 받는 돈', () => {
  it('현금 − 대출 + 매출채권 + 제품 재고 원가 + 몰트 원액 현물가', () => {
    const s = micro();
    const base = netWorth(s);
    expect(base).toBe(s.finance.cash);
    s.finance.receivables.push({ dueMonth: 3, amount: 1_000_000, label: 'x' });
    s.commerce.products.push(product({ stockBottles: 10, unitCost: 20_000 }));
    s.finance.loans.push({ id: 'D', offerId: 'working', name: 'x', principal: 5_000_000, balance: 5_000_000, annualRate: 0.07, termMonths: 36, monthlyPayment: 1, graceMonths: 0, startMonth: 0 });
    expect(netWorth(s)).toBe(base + 1_000_000 + 200_000 - 5_000_000);
  });
});

describe('결과 확인 → 계속 운영 (S-9)', () => {
  it('판정이 없으면 실패, 있으면 확인 표시만 하고 게임은 계속된다', () => {
    const s = micro();
    expect(applyAction(s, { type: 'acknowledgeVerdict' }).error).toBeDefined();
    s.scenario!.goal.months = 2;
    const t = advanceMonths(s, 2);
    const r = applyAction(t, { type: 'acknowledgeVerdict' });
    expect(r.error).toBeUndefined();
    expect(r.state.progress.verdict?.acknowledged).toBe(true);
    expect(advanceMonth(r.state).month).toBe(3);
  });
});
