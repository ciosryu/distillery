// F5d-1 코어 (#338) — 병입 제품의 아는 품질: 병입 때 추정 · 보충 혼합 · 읽기 한 함수(공개 · 면세 짝) · 보관 사본. 출력은 바뀌지 않는다(아무도 아직 읽지 않음)
import { describe, expect, it } from 'vitest';
import { applyAction, knownProductQuality, newGame, bottledQualityKnown, mergeQualityKnown, dutyFreePair, UNKNOWN_QUALITY_SIGMA, QHAT_PRIOR, type Flavor, type GameState, type Product } from '.';
import { emptyCaskOf } from './newGame';
import { toArchiveEntry } from './lifecycle';

const BOURBON: Flavor = { fresh_fruit: 35, vanilla_caramel: 40, floral: 25, cereal: 15, sweetness: 10, integration: 40 };
const opts = { name: 't', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };

function withCasks(legacy = false): GameState {
  const s = newGame({ seed: 3, startingCash: 50_000_000_000 });
  if (legacy) s.rulesVersion = 'legacy-v15';
  for (let i = 0; i < 4; i++) {
    const c = emptyCaskOf(s, 'ex_bourbon_barrel');
    c.contents = { id: `B-${i}`, name: 'B', kind: 'malt', volumeL: 190, abv: 0.6, flavor: { ...BOURBON }, createdMonth: 0, oakMonths: 48, sourced: false, costPerLPA: 10_000, batchId: 'B' };
    c.filledMonth = 0;
    s.inventory.casks.push(c);
  }
  return s;
}
const ids = (s: GameState) => s.inventory.casks.filter((c) => c.contents?.batchId === 'B').map((c) => c.id);
const bottle = (s: GameState, caskIds: string[], extra: object = {}) => applyAction(s, { type: 'bottle', components: caskIds.map((id) => ({ source: 'cask' as const, id, liters: 150 })), options: { ...opts, ...extra } });

describe('병입 때 추정 (bottledQualityKnown)', () => {
  it('아는 원액만 → 그 추정 그대로 · 모르는 몫은 사전값·큰 오차로 섞는다 · 아무것도 모르면 사전값', () => {
    const hex = { fruity: 1, sweet: 1, spicy: 1, woody: 1, smoky: 1, floral: 1 } as never;
    expect(bottledQualityKnown({ quality: 70, sigma: 3, hex, unknownShare: 0 }, 'malt', 5)).toEqual({ est: 70, sigma: 3, reviews: 0, month: 5, hex });
    const half = bottledQualityKnown({ quality: 70, sigma: 4, hex, unknownShare: 0.5 }, 'malt', 5);
    expect(half.est).toBe(Math.round((35 + QHAT_PRIOR.malt! / 2) * 10) / 10);
    expect(half.sigma).toBeCloseTo(Math.sqrt(2 ** 2 + (UNKNOWN_QUALITY_SIGMA / 2) ** 2), 1);
    expect(bottledQualityKnown({ quality: null, sigma: 0, hex: null, unknownShare: 1 }, 'grain', 5)).toEqual({ est: QHAT_PRIOR.grain, sigma: UNKNOWN_QUALITY_SIGMA, reviews: 0, month: 5 });
  });
});

describe('병입 행동 — v16은 아는 품질을 쓰고, 옛 판은 쓰지 않는다 · 참 품질은 같다', () => {
  it('샘플 없이 병입 → 사전값 ±15 · 육각형 없음("모름") · 화면 읽기는 추정(공개 아님)', () => {
    const r = bottle(withCasks(), ids(withCasks()).slice(0, 2));
    const p = r.state.commerce.products.at(-1)!;
    expect(p.qualityKnown).toEqual({ est: QHAT_PRIOR.malt, sigma: UNKNOWN_QUALITY_SIGMA, reviews: 0, month: r.state.month });
    const k = knownProductQuality(r.state, p);
    expect(k).toMatchObject({ q: QHAT_PRIOR.malt, sigma: UNKNOWN_QUALITY_SIGMA, public: false, hex: null });
    expect(k.q).not.toBe(p.quality);
  });
  it('샘플을 뜨고 병입 → 추정이 좁아지고 육각형이 생긴다', () => {
    let s = withCasks();
    const [a, b] = ids(s);
    s = applyAction(s, { type: 'sampleCask', caskIds: [a!, b!] }).state;
    const p = bottle(s, [a!, b!]).state.commerce.products.at(-1)!;
    expect(p.qualityKnown!.sigma).toBeLessThan(UNKNOWN_QUALITY_SIGMA);
    expect(p.qualityKnown!.hex).toBeDefined();
    expect(Math.abs(p.qualityKnown!.est - p.quality)).toBeLessThan(4 * p.qualityKnown!.sigma + 1);
  });
  it('옛 판(legacy-v15): 아는 품질 없음 → 공개 · 참 품질은 v16과 같다(출력 불변)', () => {
    const lg = withCasks(true);
    const pl = bottle(lg, ids(lg).slice(0, 2)).state.commerce.products.at(-1)!;
    const v16 = withCasks();
    const pv = bottle(v16, ids(v16).slice(0, 2)).state.commerce.products.at(-1)!;
    expect(pl.qualityKnown).toBeUndefined();
    expect(knownProductQuality({ ...lg, rulesVersion: 'legacy-v15' }, pl)).toMatchObject({ q: pl.quality, public: true });
    expect(pv.quality).toBe(pl.quality);
    expect(pv.price).toBe(pl.price);
    expect(pv.stockBottles).toBe(pl.stockBottles);
  });
});

describe('보충 — 남은 재고와 새 배치를 병 수로 합친다', () => {
  it('F5d 전 공개 제품(아는 품질 없음)에 보충하면 그 몫은 참값을 오차 0으로 안다', () => {
    const old = { quality: 60, stockBottles: 300, hex: undefined } as Pick<Product, 'quality' | 'qualityKnown' | 'stockBottles' | 'hex'>;
    const m = mergeQualityKnown(old, { est: 45, sigma: 15, reviews: 0, month: 9 }, 100, 9);
    expect(m.est).toBe(56.3); // 0.75 × 60 + 0.25 × 45
    expect(m.sigma).toBe(3.8); // 0.25 × 15
    expect(m.hex).toBeUndefined();
  });
  it('남은 재고가 0이면 새 배치 그대로 · 리뷰는 남은 몫만큼 이어 간다', () => {
    const qk = { est: 70, sigma: 2, reviews: 8, month: 3 };
    expect(mergeQualityKnown({ quality: 71, qualityKnown: qk, stockBottles: 0 }, { est: 50, sigma: 10, reviews: 0, month: 9 }, 200, 9)).toEqual({ est: 50, sigma: 10, reviews: 0, month: 9 });
    expect(mergeQualityKnown({ quality: 71, qualityKnown: qk, stockBottles: 200 }, { est: 50, sigma: 10, reviews: 0, month: 9 }, 200, 9).reviews).toBe(4);
  });
  it('보충 행동: v16 제품에 같은 통으로 보충 → 아는 품질이 갱신된다', () => {
    let s = withCasks();
    const [a, b, c] = ids(s);
    s = bottle(s, [a!]).state;
    const p0 = s.commerce.products.at(-1)!;
    s = applyAction(s, { type: 'sampleCask', caskIds: [b!, c!] }).state;
    s = bottle(s, [b!, c!], { restockId: p0.id }).state;
    const p1 = s.commerce.products.find((x) => x.id === p0.id)!;
    expect(p1.qualityKnown!.sigma).toBeLessThan(p0.qualityKnown!.sigma);
  });
});

describe('읽기 한 함수 — 면세 전용 제품은 짝 일반 제품의 리뷰 추정을 빌린다(#338 ③(가))', () => {
  const base = (o: Partial<Product>): Product => ({ id: 'x', name: 'x', category: 'single_malt', ageYears: 5, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 72, typicity: 0, style: null, sourcedShare: 0, stockBottles: 100, price: 1, unitCost: 1, createdMonth: 40, lastMonthSold: 0, totalSold: 0, recipeIds: ['R1'], ...o } as Product);
  it('짝의 리뷰가 더 많으면 짝 추정 · 육각형은 자기 것 · 짝이 없으면 자기 병입 추정', () => {
    const s = newGame({ seed: 1 });
    const df = base({ id: 'DF', dutyFreeOnly: true, qualityKnown: { est: 60, sigma: 6, reviews: 0, month: 40, hex: { a: 1 } as never } });
    const pair = base({ id: 'P', qualityKnown: { est: 71, sigma: 2, reviews: 8, month: 50 } });
    const other = base({ id: 'Q', createdMonth: 41, qualityKnown: { est: 90, sigma: 1, reviews: 20, month: 50 } });
    s.commerce.products = [df, pair, other];
    expect(dutyFreePair(s, df)!.id).toBe('P');
    expect(knownProductQuality(s, df)).toMatchObject({ q: 71, sigma: 2, reviews: 8, public: false, hex: { a: 1 } });
    s.commerce.products = [df, other];
    expect(knownProductQuality(s, df)).toMatchObject({ q: 60, sigma: 6, public: false });
    expect(dutyFreePair(s, pair)).toBeNull(); // 일반 제품은 짝을 찾지 않는다
  });
  it('F5d 전 제품(아는 품질 없음)은 v16에서도 공개 — 참 품질 · 참 육각형(#338 ①(가))', () => {
    const s = newGame({ seed: 1 });
    const p = base({ id: 'OLD', hex: { b: 2 } as never });
    expect(knownProductQuality(s, p)).toEqual({ q: 72, sigma: 0, reviews: 0, public: true, hex: { b: 2 } });
  });
});

describe('보관 사본', () => {
  it('보관 항목에 아는 품질을 함께 남긴다(없으면 필드 없음 — 옛 보관과 바이트 동일)', () => {
    const p = { id: 'P1', name: 'n', category: 'single_malt', createdMonth: 1, lastMonthSold: 0, totalSold: 3, quality: 70, price: 9, qualityKnown: { est: 65, sigma: 4, reviews: 2, month: 7 } } as unknown as Product;
    expect(toArchiveEntry(p).qualityKnown).toEqual({ est: 65, sigma: 4, reviews: 2, month: 7 });
    expect('qualityKnown' in toArchiveEntry({ ...p, qualityKnown: undefined })).toBe(false);
  });
});
