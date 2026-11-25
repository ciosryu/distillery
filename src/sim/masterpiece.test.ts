// [결정 #433] 「명작」 칭호 — 등급과 따로 · 승리 뒤 새 적격 로트의 첫 정상 유상 출하 달 · 표기 15년+ · 품질 80 · 인지도 20% · 순자산 안 봄 (MGT progress.ts judgeMasterpiece)
import { describe, expect, it } from 'vitest';
import { houseBrand } from './brands';
import { GRADE, type GameState, type MonthReport, type Product } from './index';
import { addLot, sellFromLots } from './lots';
import { newScenarioGame } from './newScenario';
import { bestVerdict, MASTERPIECE_MIN_AGE, updateProgress } from './progress';

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

describe('[결정 #433] 「명작」 — 등급과 따로', () => {
  it('12년으로 A → 15년 새 로트(품질 85) 첫 출하 → 명작, 등급은 승리 달 A 그대로', () => {
    const s = wonA();
    const r = sell15(s, 182, 85);
    expect(s.progress.verdict!.grade).toBe('A');
    expect(bestVerdict(s)!.grade).toBe('A'); // S로 오르지 않는다(#433)
    expect(s.progress.verdictBest).toBeUndefined();
    expect(s.progress.masterpiece).toMatchObject({ month: 183, productId: 'Q', quality: 85, ageYears: 15 });
    expect(s.progress.masterpiece!.acknowledged).toBeUndefined();
    expect(r.notes.some((n) => n.startsWith('명작 —'))).toBe(true);
  });
  it('순자산은 보지 않는다 — 현금 0이어도 품질 80 · 인지도 20%면 명작', () => {
    const s = wonA();
    s.finance.cash = 0;
    houseBrand(s).awareness = GRADE.sAwareness;
    sell15(s, 182, GRADE.sFlagshipQuality);
    expect(s.progress.masterpiece).toMatchObject({ quality: GRADE.sFlagshipQuality });
  });
  it('품질 79 · 인지도 20% 밑이면 명작이 아니다', () => {
    const a = wonA();
    sell15(a, 182, 79);
    expect(a.progress.masterpiece).toBeUndefined();
    const b = wonA();
    houseBrand(b).awareness = GRADE.sAwareness - 0.01;
    sell15(b, 182, 90);
    expect(b.progress.masterpiece).toBeUndefined();
  });
  it(`표기 ${MASTERPIECE_MIN_AGE}년 밑(12년 다시 병입)은 품질 90이어도 명작이 아니다`, () => {
    const s = wonA();
    s.commerce.products.push(product({ id: 'R', name: '리필 12년 B', ageYears: 12, oakMonths: 150, quality: 90 }));
    addLot(s, 'R', 50, { month: 151, eligibleAtBottling: true });
    s.month = 151; const r = report(s); sellFromLots(s, r, 'R', 1, SALE); updateProgress(s, r);
    expect(s.progress.masterpiece).toBeUndefined();
  });
  it('같은 로트의 두 번째 판매는 다시 보지 않는다 — 첫 출하 달만 · 새 로트면 본다', () => {
    const s = wonA();
    houseBrand(s).awareness = GRADE.sAwareness - 0.01;
    sell15(s, 182, 90, 180); // 첫 출하 — 인지도 모자라 아님
    houseBrand(s).awareness = GRADE.sAwareness + 0.1;
    sell15(s, 183, 90, 180); // 같은 로트 다시 — 보지 않는다
    expect(s.progress.masterpiece).toBeUndefined();
    s.month = 184; s.commerce.products.push(product({ id: 'Q2', name: '셰리 15년 2', ageYears: 15, oakMonths: 184, quality: 90 }));
    addLot(s, 'Q2', 100, { month: 184, eligibleAtBottling: true });
    const r = report(s); sellFromLots(s, r, 'Q2', 1, SALE); updateProgress(s, r);
    expect(s.progress.masterpiece).toMatchObject({ productId: 'Q2' });
  });
  it('한 번만 쓴다 — 더 좋은 18년을 내도 첫 명작 그대로', () => {
    const s = wonA();
    sell15(s, 182, 85);
    const m = s.progress.masterpiece;
    s.commerce.products.push(product({ id: 'E', name: '셰리 18년', ageYears: 18, oakMonths: 216, quality: 95 }));
    addLot(s, 'E', 50, { month: 216, eligibleAtBottling: true });
    s.month = 216; const r = report(s); sellFromLots(s, r, 'E', 1, SALE); updateProgress(s, r);
    expect(s.progress.masterpiece).toBe(m);
  });
  it('[결정 #435] 표기 15년 · 품질 85 제품으로 이긴 판은 승리 달에 명작 — 등급은 승리 판정 그대로', () => {
    const s = v16(); s.month = 186;
    s.progress.firstEligibleMonth = 144;
    s.commerce.products.push(product({ id: 'W', name: '셰리 15년', ageYears: 15, oakMonths: 182, quality: 85 }));
    addLot(s, 'W', 300, { month: 186, eligibleAtBottling: true });
    houseBrand(s).awareness = GRADE.sAwareness + 0.1;
    const r = report(s); sellFromLots(s, r, 'W', 1, SALE); updateProgress(s, r);
    expect(s.progress.win).toMatchObject({ productId: 'W' });
    expect(s.progress.masterpiece).toMatchObject({ month: 187, productId: 'W', lotId: s.progress.win!.lotId, ageYears: 15, quality: 85 });
    expect(bestVerdict(s)).toBe(s.progress.verdict); // 등급은 승리 판정 하나(#433)
  });
  it('12년 승리 로트를 다시 팔아도 · 옛 판에는 아무 일도 없다', () => {
    const s = wonA();
    s.month = 151; const r = report(s); sellFromLots(s, r, 'P', 1, SALE); updateProgress(s, r); // 승리 로트 다시(12년)
    expect(s.progress.masterpiece).toBeUndefined();
    const old = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 4, rules: 'legacy-v15' });
    old.month = 150; old.commerce.products.push(product({ quality: 95, ageYears: 15 }));
    addLot(old, 'P', 10, { month: 150, eligibleAtBottling: true });
    const r2 = report(old); sellFromLots(old, r2, 'P', 1, SALE); updateProgress(old, r2);
    expect(old.progress.masterpiece).toBeUndefined();
  });
  it('옛 세이브의 verdictBest(S)는 읽지 않는다 — 등급은 첫 판정', () => {
    const s = wonA();
    s.progress.verdictBest = { ...s.progress.verdict!, grade: 'S', rejudged: { month: 183, productId: 'Q', lotId: 'L' } };
    expect(bestVerdict(s)!.grade).toBe('A');
  });
});

describe('[결정 #433] 결과 화면 — acknowledged', () => {
  it('명작은 닫히지 않은 채로 쓰이고(첫 판정을 닫았어도), acknowledgeVerdict가 그것을 먼저 닫는다', async () => {
    const { applyAction } = await import('./index');
    let s = wonA();
    s = applyAction(s, { type: 'acknowledgeVerdict' }).state;
    expect(s.progress.verdict!.acknowledged).toBe(true);
    sell15(s, 182, 85);
    expect(s.progress.masterpiece!.acknowledged).toBeUndefined();
    const r = applyAction(s, { type: 'acknowledgeVerdict' });
    expect(r.error).toBeUndefined();
    expect(r.state.progress.masterpiece!.acknowledged).toBe(true);
    expect(r.message).toContain('명작');
  });
});
