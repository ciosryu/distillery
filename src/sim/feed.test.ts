import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type MonthReport, type Product } from './index';
import { FEED_BRIEF, briefPosts, feedFor, feedSituation, styleWeights, type FeedPost } from './feed';

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

  it('출현 비율(v2): 매니아(CS) → 위스키베이스·위갤, 대중(소주) → 주갤·카페, 가격 극단 → 디시 둘 다 커진다', () => {
    const cs = styleWeights({ category: 'whisky' }, { mania: 1, mass: 0, extreme: 0, launch: false });
    expect(cs.whiskybase).toBeGreaterThan(cs.cafe);
    expect(cs.dc_whisky).toBeGreaterThan(cs.dc_jugal);
    const soju = styleWeights({ category: 'soju_distilled' }, { mania: 0, mass: 1, extreme: 0, launch: false });
    expect(soju.whiskybase).toBeLessThan(0.1);
    expect(soju.dc_jugal).toBeGreaterThan(soju.dc_whisky);
    const calm = styleWeights({ category: 'whisky' }, { mania: 0, mass: 0, extreme: 0, launch: false });
    const wild = styleWeights({ category: 'whisky' }, { mania: 0, mass: 0, extreme: 1, launch: false });
    expect(wild.dc_jugal).toBeGreaterThan(calm.dc_jugal);
    expect(wild.dc_whisky).toBeGreaterThan(calm.dc_whisky);
    for (const w of [cs, soju, calm, wild]) expect(w.whiskybase + w.cafe + w.dc_whisky + w.dc_jugal).toBeCloseTo(1, 9);
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

  it('거친 말 수위([결정 #403]): 카페 · 위스키베이스 0 · 위갤 긍정 ≤ 0.5 · 주갤은 1 — 욕설 단계 2는 없다', () => {
    let w = 0, j = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const bad = product({ id: 'x', name: '창렬 위스키', quality: 40, price: 200_000, flavor: { solvent: 20, cereal: 10 } });
      const good = product({ id: 'y', name: '좋은 위스키', quality: 82, price: 70_000 });
      for (const p of feedFor(world([bad, good], 3, 300, seed), 3, 100)) {
        if (p.style === 'cafe' || p.style === 'whiskybase') expect(p.harsh).toBe(0);
        if (p.style === 'dc_whisky' && p.tone === 'pos') expect(p.harsh).toBeLessThanOrEqual(0.5);
        if (p.style === 'dc_jugal') expect(p.harsh).toBe(1);
        expect(p.harsh).not.toBe(2);
        if (p.style === 'dc_whisky' && p.tone === 'neg') w++;
        if (p.style === 'dc_jugal' && p.tone === 'neg') j++;
      }
    }
    expect(w).toBeGreaterThan(5);
    expect(j).toBeGreaterThan(5);
  });

  it('다양성(v2): 여러 판에서 글이 거의 겹치지 않고, 주갤 뻘글·댓글이 나온다', () => {
    const texts = new Set<string>();
    let offtopic = 0, replies = 0, total = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const ps = [product({ id: 'a', name: '피트 몰트', quality: 75, flavor: { peat_smoke: 40, cereal: 20 } }), product({ id: 'b', name: '소주', category: 'soju_distilled', ageYears: null, oakMonths: 0, abv: 0.25, quality: 52, price: 12_000, flavor: { nuruk_rice: 30 } })];
      for (const p of feedFor(world(ps, 3, 600, seed), 3, 100)) {
        total++; texts.add(p.text);
        if (p.style === 'dc_jugal' && p.tone === 'neu' && !p.id.includes(':cmp:')) offtopic++;
        if (p.replies?.length) replies++;
      }
    }
    expect(texts.size / total).toBeGreaterThan(0.6);
    expect(offtopic).toBeGreaterThan(0);
    expect(replies).toBeGreaterThan(total * 0.3);
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

describe('홈 요약 글 고르기 (오너 요청 2026-11-14 — MVP 홈에도 커뮤니티 반응)', () => {
  const post = (id: string, month: number, signal?: 'raise_price', style: FeedPost['style'] = 'cafe', productId = 'p'): FeedPost => ({ id, month, style, community: 'c', author: 'a', productId, productName: 'n', text: id, tone: 'neu', harsh: 0, ...(signal ? { signal } : {}) });

  it('새 글 순서 그대로 n개 — 가장 최근 달의 가격 신호 글만 맨 앞으로', () => {
    const posts = [post('a', 40), post('b', 40), post('s', 40, 'raise_price'), post('c', 39), post('old', 39, 'raise_price'), post('d', 38)];
    expect(briefPosts(posts, 3).map((p) => p.id)).toEqual(['s', 'a', 'b']);
    expect(briefPosts(posts, 6).map((p) => p.id)).toEqual(['s', 'a', 'b', 'c', 'old', 'd']); // 지난달 신호는 제자리 — 이미 지난 얘기다
    expect(briefPosts([], 3)).toEqual([]);
    expect(posts.map((p) => p.id)).toEqual(['a', 'b', 's', 'c', 'old', 'd']); // 원본은 그대로
  });

  it('같은 달 안에서는 아직 안 나온 커뮤니티·제품의 글을 먼저 — 3개가 같은 카페·같은 제품으로 차지 않는다. 달 순서는 지킨다', () => {
    const posts = [post('cafe-p1-a', 40), post('cafe-p1-b', 40), post('wb-p1', 40, undefined, 'whiskybase'), post('dc-p2', 40, undefined, 'dc_jugal', 'p2'), post('old-wb-p3', 39, undefined, 'dc_whisky', 'p3'), post('late-40', 40)];
    expect(briefPosts(posts, 3).map((p) => p.id)).toEqual(['cafe-p1-a', 'dc-p2', 'wb-p1']); // 새 커뮤니티 + 새 제품(3점) → 새 커뮤니티(2점)
    expect(briefPosts(posts, 6).map((p) => p.id)).toEqual(['cafe-p1-a', 'dc-p2', 'wb-p1', 'cafe-p1-b', 'late-40', 'old-wb-p3']); // 40개월 글을 다 쓴 뒤에야 39개월 글(뒤에 붙은 40개월 글 포함)
  });

  it('실제 피드에서: 싼데 좋은 제품이 있으면 홈 요약 첫 글이 가격 신호다 · 요약은 전체 피드의 부분집합', () => {
    const s = world([product({ id: 'good', name: '좋은 위스키', quality: 88, price: 20_000 }), product({ id: 'plain', name: '보통 위스키', quality: 55 })]);
    const all = feedFor(s, 3, 40);
    const brief = briefPosts(all, FEED_BRIEF.shown);
    expect(brief).toHaveLength(FEED_BRIEF.shown);
    expect(brief[0]!.signal).toBe('raise_price');
    expect(brief.every((p) => all.includes(p))).toBe(true);
    expect(FEED_BRIEF.more).toBeGreaterThan(FEED_BRIEF.shown);
  });
});

describe('외부 검토 I2 누수 L3 — 커뮤니티 글은 공개 정보만으로 정해진다 (가리는 판, MKT 2026-11-24)', () => {
  // ARCH I2(`src/ui/infoLeakProps.test.ts`)와 같은 판: 아는 품질 60 ±8 · 리뷰 3이 같고 참 품질만 40 · 80
  const withProduct = async (trueQuality: number) => {
    const { newScenarioGame } = await import('./newScenario');
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 5, rules: 'v16' });
    s.month = 40;
    const p = {
      id: 'P1', name: '싱글 몰트 1', category: 'whisky', ageYears: 3, oakMonths: 36, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard',
      flavor: {}, quality: trueQuality, typicity: 70, style: null, sourcedShare: 0, stockBottles: 400, price: 60_000, unitCost: 20_000,
      createdMonth: 30, lastMonthSold: 30, totalSold: 300, qualityKnown: { est: 60, sigma: 8, reviews: 3, month: 39 },
    } as Product;
    s.commerce.products.push(p);
    s.history.reports.push({ month: 39, sales: [{ productId: 'P1', name: p.name, bottles: 30, revenue: 1_800_000, demandBottles: 40 }], notes: [], expenses: {} } as never);
    return { s, p };
  };
  it('글 문장이 참 품질 40 · 80에서 같다', async () => {
    const { feedFor } = await import('./feed');
    const lo = await withProduct(40), hi = await withProduct(80);
    expect(feedFor(hi.s, 3, 40).map((x) => x.text)).toEqual(feedFor(lo.s, 3, 40).map((x) => x.text));
  });
  it('communityQuality — 지난 리뷰 점수가 있으면 그 읽기 평균, 없으면 아는 품질, 공개 판은 참 품질', async () => {
    const { communityQuality } = await import('./feed');
    const a = await withProduct(80);
    expect(communityQuality(a.s, a.p, 40)).toBe(60); // 리뷰 점수 기록 없음 → 아는 품질
    (a.s.history.reports.at(-1) as { reviews?: { productId: string; scores: number[] }[] }).reviews = [{ productId: 'P1', scores: [87, 89] }];
    expect(communityQuality(a.s, a.p, 40)).toBeCloseTo(((87 - 60) / 0.38 + (89 - 60) / 0.38) / 2, 6);
    expect(communityQuality(a.s, a.p, 39)).toBe(60); // 그달 점수는 넣지 않는다(틱과 화면이 같은 값)
    const pub = { ...a.p }; delete (pub as { qualityKnown?: unknown }).qualityKnown;
    expect(communityQuality(a.s, pub, 40)).toBe(80);
    expect(communityQuality({ ...a.s, rulesVersion: 'legacy-v15' }, a.p, 40)).toBe(80);
  });
});

describe('[결정 #366] I2 L7 (라) — 가리는 판의 잡내 문구는 커뮤니티 품질로만, 향 이름은 공개', () => {
  const mk = async (flavor: Record<string, number>, est = 60, rules: 'v16' | 'legacy-v15' = 'v16') => {
    const { newScenarioGame } = await import('./newScenario');
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 5, rules });
    s.month = 40;
    const p = {
      id: 'P1', name: '싱글 몰트 1', category: 'whisky', ageYears: 3, oakMonths: 36, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard',
      flavor, quality: 60, typicity: 70, style: null, sourcedShare: 0, stockBottles: 400, price: 60_000, unitCost: 20_000,
      createdMonth: 30, lastMonthSold: 30, totalSold: 300, qualityKnown: { est, sigma: 8, reviews: 3, month: 39 },
    } as Product;
    s.commerce.products.push(p);
    const scores = est >= 55 ? [83, 84] : [79, 80];
    s.history.reports.push({ month: 39, sales: [{ productId: 'P1', name: p.name, bottles: 30, revenue: 1_800_000, demandBottles: 40 }], notes: [], expenses: {}, reviews: [{ productId: 'P1', scores }] } as never);
    return { s, p };
  };
  const sale = { productId: 'P1', name: '싱글 몰트 1', bottles: 30, revenue: 1_800_000, demandBottles: 40 };
  it('가리는 판: 참 잡내 축이 달라도 잡내 문구 · 글이 같다(커뮤니티 품질 ≥ 문턱이면 잡내 없음)', async () => {
    const { feedFor, feedSignals } = await import('./feed');
    const clean = await mk({ fresh_fruit: 30 }), dirty = await mk({ fresh_fruit: 30, feinty: 20, harshness: 60 });
    expect(feedSignals(dirty.s, dirty.p, sale, undefined, 40).off).toBeNull();
    expect(feedFor(dirty.s, 3, 40).map((x) => x.text)).toEqual(feedFor(clean.s, 3, 40).map((x) => x.text));
  });
  it('가리는 판: 커뮤니티 품질이 문턱 미만이면 일반 낱말 「잡내」(참 잡내 이름이 아니다)', async () => {
    const { feedSignals } = await import('./feed');
    const { FEED_GENERIC_OFF } = await import('./content/feed');
    const low = await mk({ fresh_fruit: 30, feinty: 20 }, 48);
    const g = feedSignals(low.s, low.p, sale, undefined, 40);
    expect(g.quality).toBeLessThan(FEED_GENERIC_OFF.below);
    expect(g.off).toBe(FEED_GENERIC_OFF.word);
  });
  it('공개 판(옛 판)은 지금처럼 참 잡내 이름', async () => {
    const { feedSignals } = await import('./feed');
    const old = await mk({ fresh_fruit: 30, feinty: 20 }, 60, 'legacy-v15');
    expect(feedSignals(old.s, old.p, sale, undefined, 40).off).not.toBe('잡내');
    expect(feedSignals(old.s, old.p, sale, undefined, 40).off).not.toBeNull();
  });
});

describe('[결정 #400] 피드 v4 조건 — 글 종류 · 줄임 이름 · 철 · 틀 요건', () => {
  it('줄임 이름: 낱말 첫 글자 + 숫자(위스키 마이너 갤 관찰)', async () => {
    const { shortName } = await import('./feed');
    expect(shortName('김포 블랜디드 3년')).toBe('김블3');
    expect(shortName('김포 싱글몰트 셰리 6년')).toBe('김싱셰6');
    expect(shortName('김포 소주')).toBe('김소');
    expect(shortName('소주')).toBe('소주');
  });
  it('철: 1 · 2 · 9월 선물 · 7 · 8월 여름 · 12월 겨울 · 그 밖 없음', async () => {
    const { seasonOf } = await import('./feed');
    expect([0, 1, 8].map(seasonOf)).toEqual(['gift', 'gift', 'gift']);
    expect([6, 7].map(seasonOf)).toEqual(['summer', 'summer']);
    expect(seasonOf(11)).toBe('winter');
    expect([2, 3, 4, 5, 9, 10].map(seasonOf)).toEqual([null, null, null, null, null, null]);
  });
  it('글 종류 비율: 출시 달에만 신상 · 품절 달에만 품절 · 표기 없으면 표기 얘기 없음 · 위스키베이스는 점수 글 종류만', async () => {
    const { kindWeights } = await import('./feed');
    const p = product({ id: 'k', name: '시험 위스키', quality: 70, price: 60_000 });
    const g = { quality: 70, qpr: 1, consumer: 60_000, bottles: 30, stockout: false, launch: false, priceChange: 0, sentiment: 0, off: null, offWord: '', mania: 0.2, mass: 0.2, extreme: 0 };
    const f = { restock: false, medal: false, deal: false, season: null };
    const w = kindWeights('dc_whisky', { ...p, ageYears: undefined, finish: undefined, abv: 0.46 } as never, g, 'meh', f);
    expect(w.news).toBe(0);
    expect(w.soldout).toBe(0);
    expect(w.label).toBe(0);
    expect(kindWeights('dc_whisky', p, { ...g, launch: true, stockout: true }, 'meh', f).news).toBeGreaterThan(0);
    expect(Object.keys(kindWeights('whiskybase', p, g, 'meh', f)).sort()).toEqual(['batch', 'english', 'eval', 'scoreonly']);
    expect(kindWeights('cafe', p, g, 'meh', f).season).toBe(0);
    expect(kindWeights('cafe', p, g, 'meh', { ...f, season: 'summer' }).season).toBeGreaterThan(0);
  });
  it('여러 시드에서 새 글 종류가 실제로 나온다 · 같은 피드 안에 같은 글이 없다 · 위갤 글은 말머리로 시작한다', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const posts = feedFor(world([product({ id: 'a', name: '김포 블랜디드 3년', quality: 70, price: 60_000 }), product({ id: 'b', name: '김포 소주', category: 'soju_distilled', quality: 60, price: 9_000, abv: 0.25 })], 3, 300, seed), 3, 100);
      const texts = posts.map((x) => x.text);
      expect(new Set(texts).size).toBe(texts.length);
      for (const x of posts) {
        if (x.style === 'dc_whisky') expect(x.text).toMatch(/^\[(리뷰|질문|일반|소식)\] /);
        if (/^\[(질문|일반|소식)\]/.test(x.text) || /^\[(정보|모임후기|모임공지)\]/.test(x.text) || /\(사진\)/.test(x.text)) seen.add(x.style + (x.text.match(/^\[[^\]]+\]/)?.[0] ?? '(사진)'));
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
});

describe('[결정 #400] 피드 v4 — 조사 맞춤 · 카페는 전체 이름 · 한정 · 수상 · 면세 문장 요건', () => {
  it('빈칸 뒤 조사를 받침에 맞춘다 — 한글 · 숫자 끝', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const x of feedFor(world([product({ id: 'a', name: '김포 블랜디드 3년', quality: 70, price: 60_000, flavor: { fresh_fruit: 40, cereal: 30 } })], 3, 300, seed), 3, 100)) {
        expect(x.text).not.toMatch(/배이 |배을 |배은 |쌀가 |쌀를 |삼년가|3가 |3를 /);
      }
    }
  });
  it('카페 글은 줄임 이름을 쓰지 않는다 · 한정 · 수상 · 면세 문장은 그 사정이 있을 때만', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const x of feedFor(world([product({ id: 'a', name: '김포 블랜디드 3년', quality: 70, price: 60_000 })], 3, 300, seed), 3, 100)) {
        if (x.style === 'cafe') expect(x.text).not.toContain('김블3');
        expect(x.text).not.toMatch(/한정 번호|수상 소식|면세 한정판 소식/);
      }
    }
  });
});

describe('[결정 #400] feedDigest — 여러 달 요약 한 줄(고르기만)', () => {
  it('화제 글은 피드 안의 글이고, 좋음 · 나쁨 · 전체 수가 피드와 같다 · 상태를 바꾸지 않는다', async () => {
    const { feedDigest } = await import('./feed');
    const s = world([product({ id: 'a', name: '김포 블랜디드 3년', quality: 70, price: 60_000 }), product({ id: 'u', name: '저평가 위스키', quality: 78, price: 15_000 })], 3, 300, 7);
    const before = JSON.stringify(s);
    const d = feedDigest(s, 3);
    const posts = feedFor(s, 3, 200);
    expect(d.total).toBe(posts.length);
    expect(d.pos).toBe(posts.filter((p) => p.tone === 'pos').length);
    expect(d.neg).toBe(posts.filter((p) => p.tone === 'neg').length);
    expect(posts.map((p) => p.id)).toContain(d.top!.id);
    expect(d.top!.signal).toBe('raise_price'); // 가격 신호가 있으면 그것이 화제 글
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('통에서 쉬지 않은 제품 — 「캐스크」 문장 없음 (PM 2026-11-25)', () => {
  it('소주 글 · 댓글에 「캐스크」 · 「피니시 몇 개월」이 나오지 않는다(위갤 맺음말 「(캐스크 넘버까지 확인함)」 포함)', () => {
    let n = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const x of feedFor(world([product({ id: 's', name: '김포 소주', category: 'soju_distilled', quality: 60, price: 9_000, abv: 0.25, oakMonths: 0 }), product({ id: 'g', name: '김포 진', category: 'soju_distilled', quality: 70, price: 12_000, abv: 0.25, oakMonths: 0 })], 3, 300, seed), 3, 100)) {
        if (x.productName.includes(' vs ')) continue;
        n++;
        expect(x.text).not.toMatch(/캐스크/);
        for (const r of x.replies ?? []) expect(r.text).not.toMatch(/캐스크|피니시 몇 개월/);
      }
    }
    expect(n).toBeGreaterThan(50);
  });
});

describe('어긋난 글 셋 (9차 159개월 · PM 2026-11-25)', () => {
  it('고연수 · 고가(12년 · 30만 원)에는 입문 · 하이볼 글이 없고, 값이 내리지 않은 달에는 「할인」 · 「행사」 글이 없다', async () => {
    const C = await import('./content/feed');
    let n = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const x of feedFor(world([product({ id: 'w', name: '김포 시그니처 12년', quality: 56, price: 300_000, ageYears: 12, oakMonths: 144 })], 3, 300, seed), 3, 100)) {
        if (x.productName.includes(' vs ')) continue;
        n++;
        const { FEED_KIND_LINES } = C;
        const starterOrMixer = [...(FEED_KIND_LINES.dc_whisky.starter ?? []), ...(FEED_KIND_LINES.dc_jugal.mixer ?? [])].map((l) => l.replace(/\{\w+\}\S*/g, '').trim().slice(0, 8)).filter((s) => s.length >= 4);
        for (const frag of starterOrMixer) expect(x.text).not.toContain(frag);
        expect(x.text).not.toMatch(/할인하길래|행사하길래|할인 스티커|할인 중이네요|행사 상품에/);
      }
    }
    expect(n).toBeGreaterThan(30);
  });
  it('카페 「단종?」 · 품절 글에는 [시음기] · [후기] · [정보] 앞머리가 붙지 않는다', async () => {
    const { CAFE_LINES } = await import('./content/feed');
    for (let seed = 1; seed <= 40; seed++) {
      for (const x of feedFor(world([product({ id: 'a', name: '시험 위스키', quality: 70, price: 60_000 })], 3, 300, seed), 3, 100)) {
        if (x.style !== 'cafe') continue;
        const body = (k: 'forgotten' | 'stockout') => CAFE_LINES[k].some((l) => x.text.includes(l.split('{name}').at(-1)!.slice(0, 8)));
        if (body('forgotten') || body('stockout')) expect(x.text).not.toMatch(/^\[(시음기|후기|정보)\]/);
      }
    }
  });
});

describe('[결정 #418] 증류기 형태(공개 표기) 글 — 헤비 저숙성 · 장기 숙성 · 라이트', () => {
  type Still = { stillStyle?: 'light' | 'medium' | 'heavy' };
  const texts = (o: Partial<Product> & Still, seeds = 60) => {
    const out: string[] = [];
    for (let seed = 1; seed <= seeds; seed++) for (const x of feedFor(world([product({ id: 'h', name: '시험 헤비 몰트', price: 60_000, ...o } as Partial<Product>)], 3, 300, seed), 3, 100)) out.push(x.text);
    return out;
  };
  const heavy = (xs: string[]) => xs.filter((t) => t.includes('헤비 스틸'));
  it('헤비 · 표기 3년: 헤비 저숙성 글이 나오고 장기 숙성 글은 없다', () => {
    const h = heavy(texts({ stillStyle: 'heavy', ageYears: 3, oakMonths: 36, quality: 60 } as Partial<Product> & Still));
    expect(h.length).toBeGreaterThan(0);
    for (const t of h) expect(t).not.toMatch(/오래 재운|장기 숙성/);
  });
  it('헤비 · 표기 12년: 장기 숙성 글만(저숙성 「거칠다」 글 없음) · 표기 6년: 헤비 글 없음', () => {
    const h = heavy(texts({ stillStyle: 'heavy', ageYears: 12, oakMonths: 144, quality: 70, price: 200_000 } as Partial<Product> & Still));
    expect(h.length).toBeGreaterThan(0);
    for (const t of h) expect(t).toMatch(/오래 재운|장기 숙성/);
    expect(heavy(texts({ stillStyle: 'heavy', ageYears: 6, oakMonths: 72, quality: 70 } as Partial<Product> & Still))).toEqual([]);
  });
  it('증류기 형태가 없는 제품(지금 모든 판) · 미디엄 · 라이트에는 헤비 글이 없다 — 라이트 글은 라이트에만', () => {
    for (const o of [{}, { stillStyle: 'medium' }, { stillStyle: 'light' }] as Still[]) {
      const xs = texts({ ageYears: 3, oakMonths: 36, quality: 60, ...o } as Partial<Product> & Still, 30);
      expect(heavy(xs)).toEqual([]);
      if (o.stillStyle !== 'light') expect(xs.filter((t) => t.includes('라이트 스틸'))).toEqual([]);
    }
  });
  it('[결정 #429 · 10차 U5] 소주에 붙은 형태 값은 읽지 않는다 — 라이트 · 헤비 스틸 글이 없다. 같은 값의 위스키 · 뉴본(몰트 스피릿)은 나온다', () => {
    const lite = (xs: string[]) => xs.filter((t) => t.includes('라이트 스틸'));
    const soju = { name: '시험 소주', category: 'soju_distilled', ageYears: undefined, oakMonths: 0, abv: 0.25, quality: 60, price: 9_000 } as Partial<Product>;
    for (const st of ['light', 'heavy'] as const) {
      const xs = texts({ ...soju, stillStyle: st } as Partial<Product> & Still, 60);
      expect(lite(xs)).toEqual([]);
      expect(heavy(xs)).toEqual([]);
    }
    expect(lite(texts({ stillStyle: 'light', ageYears: 3, oakMonths: 36, quality: 60 } as Partial<Product> & Still, 60)).length).toBeGreaterThan(0);
    // 뉴본(몰트 스피릿 — 몰트 · 그레인 원액)은 #429대로 형태가 닿으니 읽는다(PROD 10차 70개월)
    expect(lite(texts({ name: '시험 뉴본', category: 'malt_spirit', ageYears: undefined, oakMonths: 0, abv: 0.6, stillStyle: 'light', quality: 60 } as Partial<Product> & Still, 60)).length).toBeGreaterThan(0);
  });
  it('I2 — 헤비 글은 참 품질과 무관하게 나온다(품질 40 · 90 모두)', () => {
    for (const q of [40, 90]) expect(heavy(texts({ stillStyle: 'heavy', ageYears: 3, oakMonths: 36, quality: q } as Partial<Product> & Still)).length).toBeGreaterThan(0);
  });
});

describe('[결정 #422] 15 · 18년 헤비 「명작」 글 — 공개 표기(증류기 형태 · 연수 · 셰리 표기)만', () => {
  type Still = { stillStyle?: 'light' | 'medium' | 'heavy' };
  const texts = (o: Partial<Product> & Still, seeds = 80) => {
    const out: string[] = [];
    for (let seed = 1; seed <= seeds; seed++) for (const x of feedFor(world([product({ id: 'm', name: '시험 몰트', price: 200_000, ...o } as Partial<Product>)], 3, 300, seed), 3, 100)) out.push(x.text);
    return out;
  };
  const master = (xs: string[]) => xs.filter((t) => t.includes('헤비 스틸') && /명작|기다린/.test(t));
  it('헤비 · 15년 · 이름에 「셰리」: 명작 글이 나오고 셰리 글도 나온다 — 기대 · 실망이 섞인다', () => {
    const m = master(texts({ name: '시험 셰리 몰트 15년', stillStyle: 'heavy', ageYears: 15, oakMonths: 180, quality: 80 } as Partial<Product> & Still));
    expect(m.length).toBeGreaterThan(0);
    expect(m.some((t) => t.includes('셰리'))).toBe(true);
  });
  it('셰리 표기가 없으면 「헤비 스틸 … 셰리」 글은 없다 · 12년에는 명작 글이 없다', () => {
    const noSherry = texts({ stillStyle: 'heavy', ageYears: 18, oakMonths: 216, quality: 80 } as Partial<Product> & Still);
    expect(noSherry.filter((t) => t.includes('헤비 스틸') && t.includes('셰리'))).toEqual([]);
    expect(master(noSherry).length).toBeGreaterThan(0); // 셰리를 말하지 않는 명작 글은 나온다
    expect(master(texts({ name: '시험 셰리 몰트', stillStyle: 'heavy', ageYears: 12, oakMonths: 144, quality: 80 } as Partial<Product> & Still))).toEqual([]);
  });
  it('I2 — 명작 글은 참 품질과 무관하게 나온다(품질 45 · 90 모두)', () => {
    for (const q of [45, 90]) expect(master(texts({ name: '시험 셰리 몰트', stillStyle: 'heavy', ageYears: 15, oakMonths: 180, quality: q } as Partial<Product> & Still)).length).toBeGreaterThan(0);
  });
});

describe('[결정 #422] 명작 글의 셰리 판정 — 통 구성(caskMix) 셰리 몫 0.5↑도 공개 값으로 본다(PROD 2026-11-25)', () => {
  type X = { stillStyle?: 'heavy'; caskMix?: { typeId: string; share: number }[] };
  const sherryHeavy = (o: Partial<Product> & X) => {
    const out: string[] = [];
    for (let seed = 1; seed <= 80; seed++) for (const x of feedFor(world([product({ id: 'm', name: '시험 몰트', price: 200_000, stillStyle: 'heavy', ageYears: 15, oakMonths: 180, quality: 80, ...o } as Partial<Product>)], 3, 300, seed), 3, 100)) if (x.text.includes('헤비 스틸') && x.text.includes('셰리')) out.push(x.text);
    return out;
  };
  it('이름 · 피니시 표기에 셰리가 없어도 처음부터 셰리 벗(caskMix 셰리 0.8)이면 셰리 명작 글이 나온다', () => {
    expect(sherryHeavy({ caskMix: [{ typeId: 'oloroso_butt', share: 0.8 }, { typeId: 'ex_bourbon_barrel', share: 0.2 }] } as Partial<Product> & X).length).toBeGreaterThan(0);
  });
  it('셰리 몫 0.5 미만 · 버번 통만이면 셰리 글이 없다', () => {
    expect(sherryHeavy({ caskMix: [{ typeId: 'oloroso_butt', share: 0.4 }, { typeId: 'ex_bourbon_barrel', share: 0.6 }] } as Partial<Product> & X)).toEqual([]);
    expect(sherryHeavy({ caskMix: [{ typeId: 'ex_bourbon_barrel', share: 1 }] } as Partial<Product> & X)).toEqual([]);
  });
});

describe('[제안 P-MKT-50] (가) 「창렬」 글 — 커뮤니티 품질 75↑이면 내용물 탓 문장 없이 「잘 만든 건 인정, 값이 문제」', () => {
  const BLAME = /품질 개에반|숙성 1도 안|숙성감 부족|내용물이 따라오지/;
  const PRAISE = /잘 만든 건 인정|내용물은 훌륭|맛은 인정|맛은 정말 좋은데/;
  const texts = (quality: number) => {
    const out: string[] = [];
    for (let seed = 1; seed <= 60; seed++) for (const x of feedFor(world([product({ id: 'r', name: '시험 고가 몰트', quality, price: 400_000, ageYears: 15, oakMonths: 180 })], 3, 300, seed), 3, 100)) out.push(x.text);
    return out;
  };
  it('품질 85 · 값 2배↑: 내용물 탓 문장이 없고 「잘 만든 건 인정」 꼴이 나온다', () => {
    const t = texts(85);
    expect(t.filter((x) => BLAME.test(x))).toEqual([]);
    expect(t.some((x) => PRAISE.test(x))).toBe(true);
  });
  it('품질 55 · 같은 값: 「잘 만든 건 인정」 꼴은 없고 내용물 탓 문장은 그대로 나온다', () => {
    const t = texts(55);
    expect(t.filter((x) => PRAISE.test(x))).toEqual([]);
    expect(t.some((x) => BLAME.test(x))).toBe(true);
  });
  it('I2 — 가리는 판: 아는 품질이 같으면 참 품질 40 · 90에서 글이 같다 · 내용물 탓 여부는 아는 품질을 따른다', async () => {
    const { newScenarioGame } = await import('./newScenario');
    const mk = (trueQ: number, est: number) => {
      const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 5, rules: 'v16' });
      s.month = 40;
      s.commerce.products.push({ ...product({ id: 'P1', name: '시험 고가 몰트', quality: trueQ, price: 400_000, ageYears: 15, oakMonths: 180 }), qualityKnown: { est, sigma: 4, reviews: 6, month: 39 } } as Product);
      s.history.reports.push({ month: 39, sales: [{ productId: 'P1', name: '시험 고가 몰트', bottles: 30, revenue: 12_000_000, demandBottles: 40 }], notes: [], expenses: {} } as never);
      return feedFor(s, 3, 60).map((x) => x.text);
    };
    expect(mk(90, 85)).toEqual(mk(40, 85));
    expect(mk(60, 85).some((x) => BLAME.test(x))).toBe(false); // 아는 품질 85 → 내용물 탓 없음(참 품질 60이어도)
  });
});
