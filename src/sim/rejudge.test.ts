// [결정 #422] 승리 뒤 재판정 — 오르기만 · 새 적격 로트의 첫 정상 유상 출하 달에만 · 문턱은 그달의 미룬 몫 포함(#407 · #423) (MGT progress.ts rejudge)
import { describe, expect, it } from 'vitest';
import { houseBrand } from './brands';
import { GRADE, type GameState, type MonthReport, type Product } from './index';
import { addLot, sellFromLots } from './lots';
import { newScenarioGame } from './newScenario';
import { bestVerdict, sNetWorthTarget, updateProgress } from './progress';

const v16 = (seed = 4) => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed });
const product = (over: Partial<Product> = {}): Product => ({ id: 'P', name: '12년', category: 'whisky', ageYears: 12, oakMonths: 150, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 70, typicity: 80, style: null, sourcedShare: 0, stockBottles: 300, price: 120_000, unitCost: 30_000, createdMonth: 100, lastMonthSold: 0, totalSold: 0, ...over });
const report = (s: GameState): MonthReport => ({ month: s.month, revenue: 0, expenses: {}, netCash: 0, cashEnd: 0, sales: [], production: [], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] });
const SALE = { kind: 'domestic', settlement: 'cash', unitPrice: 120_000 } as const;

/** 150개월에 품질 70 「12년」으로 이긴 판(A) — 인지도 충분 · 첫 적격 144 */
const wonA = (): GameState => {
  const s = v16(); s.month = 150;
  s.progress.firstEligibleMonth = 144;
  s.commerce.products.push(product());
  addLot(s, 'P', 300, { month: 150, eligibleAtBottling: true });
  houseBrand(s).awareness = GRADE.sAwareness + 0.1;
  s.finance.cash = 5e9;
  const r = report(s); sellFromLots(s, r, 'P', 1, SALE); updateProgress(s, r);
  s.history.reports.push(r);
  expect(s.progress.verdict).toMatchObject({ result: 'heritage', grade: 'A' });
  return s;
};
/** month에 품질 q 「15년」 새 적격 로트를 처음 판다 */
const sell15 = (s: GameState, month: number, q: number, lotMonth = month): MonthReport => {
  s.month = month;
  if (!s.commerce.products.some((p) => p.id === 'Q')) s.commerce.products.push(product({ id: 'Q', name: '셰리 15년', ageYears: 15, oakMonths: 182, quality: q }));
  if (!s.commerce.lots?.some((l) => l.productId === 'Q' && l.bottledMonth === lotMonth)) addLot(s, 'Q', 200, { month: lotMonth, eligibleAtBottling: true });
  const r = report(s); sellFromLots(s, r, 'Q', 1, SALE); updateProgress(s, r);
  s.history.reports.push(r);
  return r;
};

describe('[결정 #422] 재판정 — 오르기만', () => {
  it('12년으로 A → 15년 새 로트(품질 85) 첫 출하 · 순자산 충분 → S, 승리 달 판정은 그대로 남는다', () => {
    const s = wonA();
    const r = sell15(s, 182, 85);
    expect(s.progress.verdict!.grade).toBe('A');
    expect(bestVerdict(s)).toMatchObject({ grade: 'S', rejudged: { month: 183, productId: 'Q' } });
    expect(s.progress.verdictBest!.sNetWorthTarget).toBe(sNetWorthTarget(s, 183)); // 그달의 미룬 몫 포함(183 − 144 − 2 = 37개월)
    expect(sNetWorthTarget(s, 183)).toBe(GRADE.sNetWorthV16.micro! + 37 * GRADE.sDelayPerMonthV16.micro!);
    expect(r.notes.some((n) => n.startsWith('등급이 올랐다'))).toBe(true);
  });
  it('품질 79면 그대로 A', () => {
    const s = wonA();
    sell15(s, 182, 79);
    expect(s.progress.verdictBest).toBeUndefined();
    expect(bestVerdict(s)!.grade).toBe('A');
  });
  it('순자산이 그달 문턱(미룬 몫 포함) 밑이면 그대로 A — 기본값만 넘어도 오르지 않는다', () => {
    const s = wonA();
    s.finance.cash = GRADE.sNetWorthV16.micro! + 0.5e8; // 기본값 25.5억은 넘고, 미룸 37개월 몫(+9.25억)에는 못 미친다
    sell15(s, 182, 90);
    expect(s.progress.verdictBest).toBeUndefined();
  });
  it('같은 로트의 두 번째 판매는 다시 보지 않는다 — 첫 출하 달만', () => {
    const s = wonA();
    s.finance.cash = GRADE.sNetWorthV16.micro! + 0.5e8;
    sell15(s, 182, 90, 180); // 첫 출하 — 순자산 모자라 A
    s.finance.cash = 9e9;
    sell15(s, 183, 90, 180); // 같은 로트 다시 — 순자산이 넉넉해져도 보지 않는다
    expect(s.progress.verdictBest).toBeUndefined();
    // 새 로트 첫 출하 → S (같은 제품은 FIFO라 옛 로트가 먼저 나가므로 다른 제품의 로트로)
    s.month = 184; s.commerce.products.push(product({ id: 'Q2', name: '셰리 15년 2', ageYears: 15, oakMonths: 184, quality: 90 }));
    addLot(s, 'Q2', 100, { month: 184, eligibleAtBottling: true });
    const r = report(s); sellFromLots(s, r, 'Q2', 1, SALE); updateProgress(s, r);
    expect(bestVerdict(s)).toMatchObject({ grade: 'S', rejudged: { productId: 'Q2' } });
  });
  it('S 뒤에는 더 나쁜 제품을 내도 내려가지 않는다', () => {
    const s = wonA();
    sell15(s, 182, 85);
    const v = s.progress.verdictBest;
    s.commerce.products.push(product({ id: 'R', name: '더 나쁜 15년', quality: 50 }));
    addLot(s, 'R', 50, { month: 190, eligibleAtBottling: true });
    s.month = 190; const r = report(s); sellFromLots(s, r, 'R', 1, SALE); updateProgress(s, r);
    expect(s.progress.verdictBest).toBe(v);
  });
  it('승리 로트 자신 · 승리 전 · 옛 판에는 아무 일도 없다', () => {
    const s = wonA();
    s.month = 151; const r = report(s); sellFromLots(s, r, 'P', 1, SALE); updateProgress(s, r); // 승리 로트 다시
    expect(s.progress.verdictBest).toBeUndefined();
    const old = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 4, rules: 'legacy-v15' });
    old.month = 150; old.commerce.products.push(product({ quality: 95 }));
    addLot(old, 'P', 10, { month: 150, eligibleAtBottling: true });
    const r2 = report(old); sellFromLots(old, r2, 'P', 1, SALE); updateProgress(old, r2);
    expect(old.progress.verdictBest).toBeUndefined();
  });
});

describe('[결정 #422] 결과 화면 다시 띄움 — acknowledged', () => {
  it('재판정 결과는 닫히지 않은 채로 쓰이고(첫 판정을 닫았어도), acknowledgeVerdict가 그것을 먼저 닫는다', async () => {
    const { applyAction } = await import('./index');
    let s = wonA();
    s = applyAction(s, { type: 'acknowledgeVerdict' }).state;
    expect(s.progress.verdict!.acknowledged).toBe(true);
    sell15(s, 182, 85);
    expect(s.progress.verdictBest!.acknowledged).toBeUndefined();
    const r = applyAction(s, { type: 'acknowledgeVerdict' });
    expect(r.error).toBeUndefined();
    expect(r.state.progress.verdictBest!.acknowledged).toBe(true);
    expect(r.message).toContain('등급이 올랐다');
  });
});
