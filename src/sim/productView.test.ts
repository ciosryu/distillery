// F5d-1 코어 (#338) — 병입 제품의 아는 품질: 병입 때 추정 · 보충 혼합 · 읽기 한 함수(공개 · 면세 짝) · 보관 사본. 출력은 바뀌지 않는다(아무도 아직 읽지 않음)
import { describe, expect, it } from 'vitest';
import { applyAction, mulberry32, bottlingOffset, batchQualityKnown, estimateBlend, previewBlend, restockMix, restockPrior, RESTOCK_PRIOR_SIGMA_FLOOR, knownProductQuality, newGame, bottledQualityKnown, mergeQualityKnown, dutyFreePair, UNKNOWN_QUALITY_SIGMA, QHAT_PRIOR, type Flavor, type GameState, type Product } from '.';
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
    const s0 = withCasks();
    const comps = ids(s0).slice(0, 2).map((id) => ({ source: 'cask' as const, id, liters: 150 }));
    const prior = Math.round((QHAT_PRIOR.malt! + bottlingOffset(s0, comps, previewBlend(s0, comps, opts).evaluation!.quality)) * 10) / 10; // 사전값(원액 P25) + 병입 보정량
    const r = bottle(withCasks(), ids(withCasks()).slice(0, 2));
    const p = r.state.commerce.products.at(-1)!;
    expect(p.qualityKnown).toEqual({ est: prior, sigma: UNKNOWN_QUALITY_SIGMA, reviews: 0, month: r.state.month });
    const k = knownProductQuality(r.state, p);
    expect(k).toMatchObject({ q: prior, sigma: UNKNOWN_QUALITY_SIGMA, public: false, hex: null });
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

describe('탱크 원액만 병입 — 숨길 것이 없으니 병입 평가 그대로(MKT 진단: 원액별 평균은 약 3점 낮고 σ 0이라 리뷰가 못 고쳤다)', () => {
  it('아는 품질 = 참 품질 · 오차 0 · 육각형 있음', () => {
    const s = newGame({ seed: 3, startingCash: 50_000_000_000 });
    s.inventory.lots.push({ id: 'T1', name: '소주', kind: 'soju', volumeL: 400, abv: 0.45, flavor: { cereal: 30, sweetness: 20, fresh_fruit: 15, integration: 30 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 9000 });
    const r = applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: 'T1', liters: 300 }], options: { ...opts, targetAbv: 0.25, bottleMl: 375 } });
    const p = r.state.commerce.products.at(-1);
    expect(r.message).not.toMatch(/할 수 없|부족/);
    expect(p!.qualityKnown!.est).toBe(Math.round(p!.quality * 10) / 10);
    expect(p!.qualityKnown!.sigma).toBe(0);
    expect(p!.qualityKnown!.hex).toBeDefined();
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

describe('병입 보정량 — 샘플 추정에 병입 공정(희석 · 여과 · 섞임)의 몫을 더한다 (MKT F5d 전후 표: 통 블렌드 추정이 늘 약 −3점)', () => {
  it('통 블렌드: 아는 품질 = 샘플 추정 평균 + (병입 평가 − 원액 품질 평균) — 오차는 샘플 오차만 남는다', () => {
    let s = withCasks();
    const [a, b] = ids(s);
    s = applyAction(s, { type: 'sampleCask', caskIds: [a!, b!] }).state;
    const comps = [a!, b!].map((id) => ({ source: 'cask' as const, id, liters: 150 }));
    const pv = previewBlend(s, comps, opts);
    const off = bottlingOffset(s, comps, pv.evaluation!.quality);
    const k = batchQualityKnown(s, comps, pv)!;
    expect(k.est).toBeCloseTo(Math.round((estimateBlend(s, comps).quality! + off) * 10) / 10, 1);
    const p = bottle(s, [a!, b!]).state.commerce.products.at(-1)!;
    expect(p.qualityKnown!.est).toBe(k.est); // 미리보기 = 병입 결과
  });
  it('통 원액을 참값으로 안다고 치면(샘플 오차 0) 추정 = 병입 참 품질 — 보정량이 병입 공정 몫을 다 메운다', () => {
    const s = withCasks();
    const comps = ids(s).slice(0, 3).map((id) => ({ source: 'cask' as const, id, liters: 120 }));
    const pv = previewBlend(s, comps, opts);
    const avgTrue = pv.evaluation!.quality - bottlingOffset(s, comps, pv.evaluation!.quality);
    expect(avgTrue + bottlingOffset(s, comps, pv.evaluation!.quality)).toBeCloseTo(pv.evaluation!.quality, 6);
    expect(Math.abs(bottlingOffset(s, comps, pv.evaluation!.quality))).toBeGreaterThan(0); // 46% 희석 — 공정 몫이 실제로 있다
  });
});

describe('[결정 #346] 같은 레시피 보충 — 그 제품의 추정 · 리뷰 수를 잇는다', () => {
  const recipeCasks = (recipeId: string) => { const s = withCasks(); for (const c of s.inventory.casks) if (c.contents?.batchId === 'B') c.contents.recipeId = recipeId; return s; };
  it('모르는 몫 사전값 = 그 제품의 지금 추정 · σ는 하한 4', () => {
    expect(bottledQualityKnown({ quality: null, sigma: 0, hex: null, unknownShare: 1 }, 'malt', 9, { est: 70, sigma: 1.5 })).toEqual({ est: 70, sigma: RESTOCK_PRIOR_SIGMA_FLOOR, reviews: 0, month: 9 });
    expect(bottledQualityKnown({ quality: null, sigma: 0, hex: null, unknownShare: 1 }, 'malt', 9, { est: 70, sigma: 6 }).sigma).toBe(6);
  });
  it('재고 0에서 같은 레시피 · 샘플 없는 통으로 보충 → 추정 70 ±4 · 리뷰 8건 그대로(전역 사전값 45 ±15로 돌아가지 않음)', () => {
    let s = recipeCasks('R1');
    const [a, b] = ids(s);
    s = bottle(s, [a!]).state;
    const pid = s.commerce.products.at(-1)!.id;
    const p0 = s.commerce.products.find((x) => x.id === pid)!;
    expect(p0.recipeIds).toEqual(['R1']);
    p0.qualityKnown = { est: 70, sigma: 2, reviews: 8, month: s.month };
    p0.stockBottles = 0;
    s = bottle(s, [b!], { restockId: pid }).state;
    const k = s.commerce.products.find((x) => x.id === pid)!.qualityKnown!;
    expect(k).toMatchObject({ est: 70, sigma: RESTOCK_PRIOR_SIGMA_FLOOR, reviews: 8 });
  });
  it('레시피가 다르면 잇지 않는다 — 전역 사전값 · 리뷰는 남은 재고 몫만큼', () => {
    let s = recipeCasks('R1');
    const [a, b] = ids(s);
    s = bottle(s, [a!]).state;
    const pid = s.commerce.products.at(-1)!.id;
    const p0 = s.commerce.products.find((x) => x.id === pid)!;
    p0.qualityKnown = { est: 70, sigma: 2, reviews: 8, month: s.month };
    p0.stockBottles = 0;
    s.inventory.casks.find((c) => c.id === b)!.contents!.recipeId = 'R2';
    expect(restockPrior(s, p0, ['R2'])).toBeUndefined();
    const comps = [{ source: 'cask' as const, id: b!, liters: 150 }];
    const prior = Math.round((QHAT_PRIOR.malt! + bottlingOffset(s, comps, previewBlend(s, comps, opts).evaluation!.quality)) * 10) / 10;
    s = bottle(s, [b!], { restockId: pid }).state;
    expect(s.commerce.products.find((x) => x.id === pid)!.qualityKnown).toMatchObject({ est: prior, sigma: UNKNOWN_QUALITY_SIGMA, reviews: 0 });
  });
});

describe('[#346 보완] 같은 레시피 보충 + 샘플 있음 — 이어 온 추정과 결합(바꿔치기 금지)', () => {
  it('결합 뒤 σ는 두 쪽(배치 샘플 · 이어 온 추정) 어느 것보다 크지 않다 · 추정은 둘 사이', () => {
    const carried = { est: 70, sigma: 2 };
    const k = bottledQualityKnown({ quality: 62, sigma: 5, hex: null, unknownShare: 0 }, 'malt', 9, carried, 0);
    expect(k.sigma).toBeLessThanOrEqual(5);
    expect(k.sigma).toBeLessThanOrEqual(RESTOCK_PRIOR_SIGMA_FLOOR); // 이어 온 쪽 σ는 하한 4
    expect(k.est).toBeGreaterThan(62);
    expect(k.est).toBeLessThan(70);
    // 이어 올 것이 없으면(새 제품 · 다른 레시피) 지금처럼 샘플 추정 그대로
    expect(bottledQualityKnown({ quality: 62, sigma: 5, hex: null, unknownShare: 0 }, 'malt', 9, undefined, 0)).toMatchObject({ est: 62, sigma: 5 });
  });
  it('정보가 많은 쪽(샘플 켬 = 결합)이 추정 오차 기대값에서 불리하지 않다 — 같은 참값을 두 번 잰 몬테카를로 2,000회', () => {
    const rng = mulberry32(346);
    const normal = () => rng.normal(0, 1);
    let seOn = 0; let seOff = 0;
    for (let i = 0; i < 2000; i++) {
      const truth = rng.range(60, 80);
      const sC = RESTOCK_PRIOR_SIGMA_FLOOR; const sK = rng.range(3, 5);
      const carried = { est: truth + sC * normal(), sigma: sC };
      const on = bottledQualityKnown({ quality: truth + sK * normal(), sigma: sK, hex: null, unknownShare: 0 }, 'malt', 1, carried, 0).est;
      const off = bottledQualityKnown({ quality: null, sigma: 0, hex: null, unknownShare: 1 }, 'malt', 1, carried, 0).est; // 샘플 없음 = 이어 온 추정 그대로
      seOn += (on - truth) ** 2; seOff += (off - truth) ** 2;
    }
    expect(seOn).toBeLessThanOrEqual(seOff);
  });
});

describe('보충 미리보기(restockMix) — 화면 식을 코어로, 행동의 합치기와 같은 가중', () => {
  it('미리보기 = mergeQualityKnown 결과(추정·오차) · 남은 재고 0이면 새 배치 그대로', () => {
    const m = restockMix({ q: 60, sigma: 0 }, 300, { q: 45, sigma: 15 }, 100);
    const k = mergeQualityKnown({ quality: 60, stockBottles: 300 }, { est: 45, sigma: 15, reviews: 0, month: 1 }, 100, 1);
    expect(m.stock).toBe(400);
    expect(Math.round(m.q * 10) / 10).toBe(k.est);
    expect(Math.round(m.sigma * 10) / 10).toBe(k.sigma);
    expect(restockMix({ q: 70, sigma: 2 }, 0, { q: 50, sigma: 4 }, 10)).toEqual({ stock: 10, w: 1, q: 50, sigma: 4 });
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
