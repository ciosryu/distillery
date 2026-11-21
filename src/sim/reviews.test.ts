// F5d-2 (MKT) — 리뷰로 아는 품질 좁히기
import { describe, expect, it } from 'vitest';
import { applyReviews, drawWhiskybaseScores, REVIEW_READ_SIGMA, reviewReading, updateProductKnowledge, wbScore } from './reviews';
import { newScenarioGame } from './newScenario';
import { newGame } from './newGame';
import { feedSignals } from './feed';
import type { GameState, MonthReport, Product } from './types';

const product = (over: Partial<Product> = {}): Product => ({ id: 'P', name: '싱글 몰트', category: 'whisky', ageYears: 3, oakMonths: 40, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 70, typicity: 70, style: null, sourcedShare: 0, stockBottles: 500, price: 60_000, unitCost: 20_000, createdMonth: 50, lastMonthSold: 0, totalSold: 0, seq: 1, ...over });
const sale = (productId: string, bottles: number) => ({ productId, name: productId, bottles, revenue: bottles * 60_000, demandBottles: bottles });
const v16 = (): GameState => { const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 7 }); s.month = 60; return s; };

describe('점수 식 · 읽기 오차', () => {
  it('wbScore는 feed.ts와 같은 식(60 + 0.38q + 잡음, 50~98) · 읽기는 역식', () => {
    expect(wbScore(70, 0)).toBe(Math.round(60 + 70 * 0.38));
    expect(wbScore(200, 3)).toBe(98);
    expect(reviewReading(wbScore(50, 0))).toBeCloseTo(50, 0);
  });
  it('REVIEW_READ_SIGMA ≈ 5.3 (정수 잡음 분산 4 + 반올림 1/12)', () => {
    expect(REVIEW_READ_SIGMA).toBeCloseTo(5.32, 2);
  });
});

describe('applyReviews — 역분산 가중', () => {
  it('8건이면 σ 15 → 약 1.9, 추정은 읽기 쪽으로', () => {
    const k = { est: 45, sigma: 15, reviews: 0, month: 50 };
    const scores = Array.from({ length: 8 }, () => wbScore(70, 0));
    const r = applyReviews(k, scores, 60);
    expect(r.reviews).toBe(8);
    expect(r.sigma).toBeCloseTo(1.9, 1);
    expect(r.est).toBeGreaterThan(69);
    expect(r.est).toBeLessThan(71);
    expect(r.month).toBe(60);
  });
  it('점수가 없으면 그대로 · 오차 0(참값을 앎)이면 값은 두고 리뷰 수만', () => {
    const k = { est: 61, sigma: 0, reviews: 2, month: 50 };
    expect(applyReviews(k, [], 60)).toBe(k);
    expect(applyReviews(k, [90, 90], 60)).toEqual({ est: 61, sigma: 0, reviews: 4, month: 60 });
  });
  it('치우침 없음 — 참 품질 70 · 사전 45 ±15에서 9건 뒤 평균 추정이 70 근처(200판)', () => {
    let sum = 0; let seed = 1;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let t = 0; t < 200; t++) {
      const scores = Array.from({ length: 9 }, () => wbScore(70, Math.floor(rnd() * 7) - 3));
      sum += applyReviews({ est: 45, sigma: 15, reviews: 0, month: 0 }, scores, 1).est;
    }
    expect(Math.abs(sum / 200 - 70)).toBeLessThan(1.5); // 사전값 무게(약 1/(1+9×8)) 만큼만 끌린다
  });
});

describe('drawWhiskybaseScores — 결정론', () => {
  it('같은 (seed, 달, 제품 순번)이면 같은 점수, 점수는 50~98', () => {
    const s = v16(); const p = product({ quality: 72, mania: undefined } as Partial<Product>);
    const g = { ...feedSignals(s, p, sale('P', 900), undefined, 60), launch: true };
    const a = drawWhiskybaseScores(s, p, g, 60); const b = drawWhiskybaseScores(s, p, g, 60);
    expect(a).toEqual(b);
    for (const x of a) { expect(x).toBeGreaterThanOrEqual(50); expect(x).toBeLessThanOrEqual(98); }
  });
});

describe('updateProductKnowledge — 틱 5 뒤', () => {
  const run = (s: GameState, products: Product[], sales: MonthReport['sales']) => {
    s.commerce.products = products;
    return updateProductKnowledge(s, { sales });
  };
  it('옛 판(legacy-v15)은 아무것도 안 한다', () => {
    const s = v16(); s.rulesVersion = 'legacy-v15';
    const p = product({ qualityKnown: { est: 45, sigma: 15, reviews: 0, month: 50 } });
    expect(run(s, [p], [sale('P', 3000)])).toEqual([]);
    expect(p.qualityKnown!.reviews).toBe(0);
  });
  it('아는 품질 없음(F5d 전, 공개) · 면세 전용 · 안 팔림은 건너뛴다', () => {
    const s = v16();
    const pub = product({ id: 'A', seq: 1 });
    const df = product({ id: 'B', seq: 2, dutyFreeOnly: true, qualityKnown: { est: 45, sigma: 15, reviews: 0, month: 50 } });
    const idle = product({ id: 'C', seq: 3, qualityKnown: { est: 45, sigma: 15, reviews: 0, month: 50 } });
    expect(run(s, [pub, df, idle], [sale('A', 3000), sale('B', 3000), sale('C', 0)])).toEqual([]);
  });
  it('여러 달 팔면 리뷰가 쌓여 추정이 참 품질로 좁혀진다 — 반환 점수 = 갱신에 쓴 점수', () => {
    const s = v16();
    const p = product({ quality: 74, oakMonths: 130, abv: 0.58, qualityKnown: { est: 45, sigma: 15, reviews: 0, month: 50 } }); // 매니아 성향 ↑ → 위스키베이스 글이 잦다
    s.commerce.products = [p];
    let total = 0;
    for (let m = 60; m < 84; m++) {
      s.month = m;
      const out = updateProductKnowledge(s, { sales: [sale('P', 2000)] });
      total += out.reduce((t, x) => t + x.scores.length, 0);
    }
    expect(total).toBeGreaterThan(5);
    expect(p.qualityKnown!.reviews).toBe(total);
    expect(Math.abs(p.qualityKnown!.est - 74)).toBeLessThan(3 * p.qualityKnown!.sigma + 0.5);
    expect(p.qualityKnown!.sigma).toBeLessThan(5);
  });
  it('샌드박스 newGame도 v16이라 갱신한다(가리기 가드는 rulesVersion만 — F5b와 같음)', () => {
    const s = newGame({ seed: 3, region: 'KR' }); s.month = 60;
    const p = product({ quality: 74, oakMonths: 130, abv: 0.58, qualityKnown: { est: 45, sigma: 15, reviews: 0, month: 50 } });
    s.commerce.products = [p];
    for (let m = 60; m < 72; m++) { s.month = m; updateProductKnowledge(s, { sales: [sale('P', 2000)] }); }
    expect(p.qualityKnown!.reviews).toBeGreaterThan(0);
  });
});

describe('priceOptions — 계획은 아는 품질로 (F5d ④ · ⑤)', () => {
  it('v16: 추정이 참값보다 낮으면 가격 비교의 수요도 낮다 · 옛 판 · 공개 제품은 참값', async () => {
    const { priceOptions } = await import('./market');
    const s = v16(); s.month = 60;
    const known = product({ quality: 80, qualityKnown: { est: 40, sigma: 15, reviews: 0, month: 50 } });
    const pub = product({ quality: 80 });
    s.commerce.products = [known];
    const dKnown = priceOptions(s, known, 6, [1])[0]!.demandBottles;
    s.commerce.products = [pub];
    const dPub = priceOptions(s, pub, 6, [1])[0]!.demandBottles;
    expect(dKnown).toBeLessThan(dPub);
    s.rulesVersion = 'legacy-v15'; s.commerce.products = [known];
    expect(priceOptions(s, known, 6, [1])[0]!.demandBottles).toBeCloseTo(dPub, 6);
  });
});
