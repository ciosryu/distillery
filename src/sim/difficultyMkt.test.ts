// F6b MKT — 취향(#313 속도·지속성·폭·향미 유행 세기)·원액 현물 지수 손잡이가 `knob`으로 읽히는지 (P-MKT-37 · P-MGT-48 거시 표)
// 값은 F7까지 모두 1(자리)이라, 여기서는 표를 **잠깐** Easy ≠ Hard로 바꿔 손잡이가 실제로 먹는지 본 뒤 되돌린다
import { afterEach, describe, expect, it } from 'vitest';
import { advanceMonths, type GameState, type Product } from './index';
import { BULK_WALK, bulkWalkOf, updateBulkIndex } from './bulk';
import { addTrendShift } from './blendTable';
import { KNOBS } from './content/difficulty';
import { TREND_WALK, appeal, aroundOne, trendWalkOf, updateTrends } from './market';
import { newScenarioGame } from './newScenario';
import { rngFor } from './rng';

const MKT_KNOBS = ['taste.trendSigma', 'taste.trendReversion', 'taste.trendRange', 'taste.flavorTrendStrength', 'macro.bulkSigma', 'macro.bulkReversion', 'macro.bulkRange'] as const;
const saved = Object.fromEntries(MKT_KNOBS.map((k) => [k, { ...KNOBS[k]! }]));
afterEach(() => { for (const k of MKT_KNOBS) Object.assign(KNOBS[k]!, saved[k]); });
const set = (id: (typeof MKT_KNOBS)[number], easy: number, hard: number) => Object.assign(KNOBS[id]!, { easy, hard });

const game = (difficulty: 'easy' | 'normal' | 'hard' | { preset: 'custom'; levels: Record<string, 1 | 2 | 3> } = 'normal', seed = 7) =>
  newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed, difficulty: difficulty as never });
/** 트렌드 워크만 n개월 굴린 위스키 트렌드 경로(판 전체를 돌리지 않는다 — 손잡이만 본다) */
const trendPath = (s: GameState, n: number): number[] => { const out: number[] = []; for (let m = 0; m < n; m++) { updateTrends(s, rngFor(s.seed, m, 'trend')); out.push(s.world.trend.whisky!); } return out; };
const bulkPath = (s: GameState, n: number): number[] => { const out: number[] = []; for (let m = 0; m < n; m++) { updateBulkIndex(s, rngFor(s.seed, m, 'bulk')); out.push(s.b2b.bulkIndex); } return out; };
const spread = (xs: number[]) => Math.sqrt(xs.reduce((t, x) => t + (x - 1) ** 2, 0) / xs.length);
const peated: Product = { id: 'P', name: '피트', category: 'whisky', ageYears: 5, oakMonths: 60, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, hex: { fruity: 10, floral: 5, cereal: 20, woody: 20, spicy: 10, peat: 30 } as never, quality: 70, typicity: 80, style: null, sourcedShare: 0, stockBottles: 100, price: 60_000, unitCost: 20_000, createdMonth: 0, lastMonthSold: 0, totalSold: 0 };

describe('F6b MKT — 자리값(모두 1)에서는 어느 난이도든 지금 값 그대로', () => {
  it('표의 MKT 7행이 모두 easy = hard = 1 · 워크 값이 기준값과 같은 수(부동소수까지)', () => {
    for (const k of MKT_KNOBS) expect(KNOBS[k]).toMatchObject({ easy: 1, hard: 1 });
    for (const d of ['easy', 'normal', 'hard'] as const) {
      expect(trendWalkOf(game(d))).toEqual({ ...TREND_WALK });
      expect(bulkWalkOf(game(d))).toEqual({ ...BULK_WALK });
    }
    expect(aroundOne(1.4, 1)).toBe(1.4); // k = 1이면 식을 타지 않는다(1 + (1.4 − 1) × 1 ≠ 1.4일 수 있다)
    expect(aroundOne(0.6, 1)).toBe(0.6);
  });

  it('Easy·Hard 판도 Normal 판과 같은 판이다 — 24개월 진행이 난이도 스냅샷 말고는 바이트 동일', () => {
    const run = (d: 'easy' | 'normal' | 'hard') => { const s = advanceMonths(game(d), 24); expect(s.month).toBe(24); expect(s.difficulty?.preset).toBe(d); return JSON.stringify({ ...s, difficulty: undefined }); };
    expect(run('easy').length).toBeGreaterThan(10_000); // 빈 비교가 아니다
    expect(run('easy')).toBe(run('normal'));
    expect(run('hard')).toBe(run('normal'));
  });
});

describe('F6b MKT — 표를 Easy ≠ Hard로 바꾸면 손잡이가 먹는다 ([결정 #313] 속도·지속성·폭)', () => {
  it('취향 속도(σ): Easy < Normal < Hard 순으로 트렌드가 1에서 멀리 흔들린다 · 같은 시드·난이도면 같은 경로', () => {
    set('taste.trendSigma', 0.2, 3);
    const e = spread(trendPath(game('easy'), 240)), n = spread(trendPath(game('normal'), 240)), h = spread(trendPath(game('hard'), 240));
    expect(e).toBeLessThan(n);
    expect(n).toBeLessThan(h);
    expect(trendPath(game('hard'), 60)).toEqual(trendPath(game('hard'), 60));
  });

  it('지속성(평균 회귀): 회귀가 약하면(Hard) 벌어진 트렌드가 더디게 돌아온다', () => {
    set('taste.trendReversion', 4, 0.1);
    set('taste.trendSigma', 0, 0); // 잡음을 꺼 회귀만 본다
    const back = (d: 'easy' | 'hard') => { const s = game(d); s.world.trend.whisky = 1.4; trendPath(s, 12); return s.world.trend.whisky!; };
    expect(back('easy')).toBeLessThan(back('hard')); // Easy는 1 쪽으로 더 많이 돌아왔다
    expect(back('easy')).toBeGreaterThanOrEqual(1);
  });

  it('폭(범위): Easy는 좁은 띠 안, Hard는 Normal 띠(0.6~1.5) 밖까지 — 아래는 0.2 가드', () => {
    set('taste.trendRange', 0.25, 2);
    set('taste.trendSigma', 6, 6); // 범위에 닿게 크게 흔든다
    expect(trendWalkOf(game('easy'))).toMatchObject({ lo: 0.9, hi: 1.125 });
    const e = trendPath(game('easy'), 240), h = trendPath(game('hard'), 240);
    expect(Math.min(...e)).toBeGreaterThanOrEqual(0.9);
    expect(Math.max(...e)).toBeLessThanOrEqual(1.125);
    expect(Math.max(...h)).toBeGreaterThan(TREND_WALK.hi);
    expect(Math.min(...h)).toBeGreaterThanOrEqual(0.2);
    set('taste.trendRange', 1, 5);
    expect(trendWalkOf(game('hard')).lo).toBe(0.2); // 1 − 0.4 × 5 = −1 → 가드
  });

  it('향미 유행 세기: 피트 열풍의 매력 배수가 Easy에서는 1에 가깝고 Hard에서는 멀다 — 유행이 없으면 난이도와 무관', () => {
    set('taste.flavorTrendStrength', 0.5, 2);
    const withTrend = (d: 'easy' | 'normal' | 'hard') => { const s = game(d); addTrendShift(s, '피트 열풍', 'peat', 0.4, 15, 25, 24); return appeal(peated, s) / appeal(peated, game(d)); };
    const [e, n, h] = [withTrend('easy'), withTrend('normal'), withTrend('hard')];
    expect(n).toBeGreaterThan(1);
    expect(e - 1).toBeCloseTo((n - 1) * 0.5, 10);
    expect(h - 1).toBeCloseTo((n - 1) * 2, 10);
    expect(appeal(peated, game('hard'))).toBe(appeal(peated, game('easy'))); // 유행 없음 → 배수 1 → 거리 0
  });

  it('영역 분리: 취향만 Hard인 Custom 판은 취향 손잡이만, 거시만 Hard면 현물 지수만 움직인다', () => {
    set('taste.trendSigma', 1, 3);
    set('macro.bulkSigma', 1, 3);
    const custom = (over: Record<string, 1 | 2 | 3>) => game({ preset: 'custom', levels: { macro: 2, competition: 2, taste: 2, supply: 2, incidents: 2, finance: 2, ...over } });
    const tasteHard = custom({ taste: 3 }), macroHard = custom({ macro: 3 });
    expect(trendWalkOf(tasteHard).sigma).toBe(TREND_WALK.sigma * 3);
    expect(bulkWalkOf(tasteHard)).toEqual({ ...BULK_WALK });
    expect(bulkWalkOf(macroHard).sigma).toBe(BULK_WALK.sigma * 3);
    expect(trendWalkOf(macroHard)).toEqual({ ...TREND_WALK });
    expect(spread(bulkPath(macroHard, 240))).toBeGreaterThan(spread(bulkPath(custom({}), 240)));
  });
});
