import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type MonthReport, type Product } from './index';
import { feedFor, feedSituation, styleWeights } from './feed';

// 가상 주류 커뮤니티 피드 (#247) — 순수 연출, 세이브에 남기지 않는다

const product = (over: Partial<Product> = {}): Product => ({ id: 'p', name: '테스트 위스키', category: 'whisky', ageYears: 4, oakMonths: 48, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: { vanilla_caramel: 40, dried_fruit: 30, cereal: 20 }, quality: 70, typicity: 80, style: null, sourcedShare: 0, stockBottles: 5000, price: 60_000, unitCost: 20_000, createdMonth: 0, lastMonthSold: 0, totalSold: 1000, ...over });

/** 제품 목록과, 최근 달마다 그 제품들이 팔린 리포트를 가진 판 */
function world(ps: Product[], months = 3, bottles = 300, seed = 1): GameState {
  const s = newGame({ seed, region: 'KR' });
  s.commerce.products = ps;
  s.month = 40;
  s.history.reports = Array.from({ length: months }, (_, k) => ({
    month: 40 - months + k,
    sales: ps.map((p) => ({ productId: p.id, name: p.name, bottles, revenue: bottles * p.price, demandBottles: bottles })),
  }) as unknown as MonthReport);
  return s;
}

describe('가상 커뮤니티 피드 (#247)', () => {
  it('시드 고정 — 같은 판이면 같은 피드, 상태를 바꾸지 않는다(세이브·시뮬 난수 불변)', () => {
    const s = world([product({ id: 'a' }), product({ id: 'b', name: '다른 위스키', quality: 60 })]);
    const before = JSON.stringify(s);
    const a = feedFor(s), b = feedFor(s);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('출현 비율: 매니아(CS) → 위스키베이스, 대중(소주) → 위스키베이스가 작다, 가격 극단 → 디시가 커진다', () => {
    const cs = styleWeights({ category: 'whisky' }, { mania: 1, mass: 0, extreme: 0, launch: false });
    expect(cs.whiskybase).toBeGreaterThan(cs.cafe);
    expect(cs.whiskybase).toBeGreaterThan(cs.dc);
    const soju = styleWeights({ category: 'soju_distilled' }, { mania: 0, mass: 1, extreme: 0, launch: false });
    expect(soju.whiskybase).toBeLessThan(0.1);
    const calm = styleWeights({ category: 'whisky' }, { mania: 0, mass: 0, extreme: 0, launch: false });
    const wild = styleWeights({ category: 'whisky' }, { mania: 0, mass: 0, extreme: 1, launch: false });
    expect(wild.dc).toBeGreaterThan(calm.dc);
    for (const w of [cs, soju, calm, wild]) expect(w.whiskybase + w.cafe + w.dc).toBeCloseTo(1, 9);
  });

  it('상황: 품질 좋은데 너무 싸면 가격 신호, 최하인데 싸면 하이볼용, 비싸면 조롱', () => {
    expect(feedSituation({ quality: 75, qpr: 0.6, sentiment: 0.6 })).toBe('raise');
    expect(feedSituation({ quality: 45, qpr: 0.7, sentiment: -0.4 })).toBe('cheapLow');
    expect(feedSituation({ quality: 55, qpr: 1.4, sentiment: -0.3 })).toBe('ripoff');
    expect(feedSituation({ quality: 80, qpr: 2.0, sentiment: 0 })).toBe('ripoff'); // 품질이 좋아도 2배면 창렬
    expect(feedSituation({ quality: 75, qpr: 1.35, sentiment: 0.1 })).toBe('pricey');
    expect(feedSituation({ quality: 62, qpr: 1, sentiment: 0 })).toBe('meh');
  });

  it('오너 결정 2: 품질 좋은데 너무 싼 제품은 "가격 올려라" 신호 글이 반드시 나온다', () => {
    const cheap = product({ id: 'u', name: '저평가 위스키', quality: 78, price: 15_000 });
    const posts = feedFor(world([cheap]));
    const sig = posts.filter((p) => p.signal === 'raise_price');
    expect(sig.length).toBeGreaterThan(0);
    expect(posts[0]!.signal).toBe('raise_price'); // 같은 달 안에서 맨 위
  });

  it('거친 말 수위(오너 결정 5): 긍정 ≤ 0.5, 디시 부정 ≥ 1, 심한 부정에서만 가끔 2', () => {
    let n2 = 0, nNeg = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const bad = product({ id: 'x', name: '창렬 위스키', quality: 40, price: 200_000, flavor: { solvent: 20, cereal: 10 } });
      const good = product({ id: 'y', name: '좋은 위스키', quality: 82, price: 70_000 });
      for (const p of feedFor(world([bad, good], 3, 300, seed), 3, 100)) {
        if (p.tone === 'pos') expect(p.harsh).toBeLessThanOrEqual(0.5);
        if (p.style === 'dc' && p.tone === 'neg') { expect(p.harsh).toBeGreaterThanOrEqual(1); nNeg++; if (p.harsh === 2) n2++; }
        if (p.style !== 'dc') expect(p.harsh).toBe(0);
      }
    }
    expect(nNeg).toBeGreaterThan(10);
    expect(n2).toBeGreaterThan(0); // 나올 수는 있다
    expect(n2 / nNeg).toBeLessThan(0.45); // 빈도는 낮다
  });

  it('비교 글(오너 결정 6): 같은 주종을 둘 이상 팔면 "A vs B"가 나온다 — 낮은 품질 쪽이 진다', () => {
    let seen = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const posts = feedFor(world([product({ id: 'a', name: '좋은 몰트', quality: 85 }), product({ id: 'b', name: '평범 몰트', quality: 55 })], 3, 300, seed), 3, 100);
      for (const p of posts.filter((x) => x.id.includes(':cmp:'))) { seen++; expect(p.productName).toBe('좋은 몰트 vs 평범 몰트'); }
    }
    expect(seen).toBeGreaterThan(5);
  });

  it('위스키베이스 점수는 품질을 그대로 옮기지 않는다(±3 리뷰어 오차) · 판매가 없으면 글이 없다', () => {
    const s = world([product({ id: 'a', quality: 70 })], 3, 400);
    for (const p of feedFor(s, 3, 100).filter((x) => x.score != null)) expect(Math.abs(p.score! - (60 + 70 * 0.38))).toBeLessThanOrEqual(3.5);
    expect(feedFor(world([product({ id: 'a' })], 3, 0)).filter((p) => !p.id.includes(':9'))).toEqual([]);
  });
});
