import { CATEGORY } from './content/categories';
import { regionOf } from './content/regions';
import { CAFE_CLOSE, CAFE_LINES, CAFE_OPEN, COMPARE_LINES, COMPARE_REASON, DCJ_CLOSE, DCJ_LINES, DCJ_OFFTOPIC, DCJ_OPEN, DCW_CLOSE, DCW_FEATURE, DCW_LINES, DCW_OPEN, FEED_AUTHORS, FEED_BENCHMARKS, FEED_COMMUNITIES, REPLIES, WB_FINISH, WB_NOSE_ADJ, WB_VERDICT, type FeedFeature, type FeedSituation, type FeedStyle, type Harsh } from './content/feed';
import { AXIS } from './content/axes';
import { productLuxury } from './brands';
import { topNotes } from './flavor';
import { expectedPricePerL, productConsumerPrice } from './market';
import { rngFor, type Rng } from './rng';
import type { AxisId, GameState, MonthReport, Product } from './types';

// 가상 주류 커뮤니티 피드 ([결정 #247] → v2 [결정 #254], 오너 2026-11-10) — 파트 MKT. **순수 연출: 판매·인지도에 영향 없음.**
// v2: 디시를 위스키 갤러리(거칠지만 진지)·주류 갤러리(욕설·뻘소리)로 나누고, 머리말·본문·특징·맺음말을 섞어 만들며 댓글을 단다
// 세이브에 아무것도 남기지 않는다: 최근 월 리포트(판매량·매출·수요)와 지금 제품 값(품질·향 — 판매 화면에 이미 보이는 값)으로
// (시드, 달, 제품)마다 고정된 난수 스트림으로 화면에서 만든다 → 새로고침해도 같은 피드, 세이브 크기 0, 시뮬레이션 난수 순서 불변.
// 보관(단종)된 제품은 향·품질 기록이 없어 뺀다.

export type { FeedStyle, Harsh } from './content/feed';

export interface FeedPost {
  id: string;
  month: number;
  style: FeedStyle;
  community: string;
  author: string;
  productId: string;
  productName: string;
  text: string;
  /** 위스키베이스 점수 (리뷰어 오차 ±3 — 품질을 그대로 옮기지 않는다) */
  score?: number;
  tone: 'pos' | 'neu' | 'neg';
  harsh: Harsh;
  /** 가격 신호 (오너 결정 2): 품질은 좋은데 너무 싸면 '가격 올려라' */
  signal?: 'raise_price';
  /** 댓글 (v2) — 위스키베이스는 없다 */
  replies?: { author: string; text: string }[];
}

/** 한 제품·한 달의 반응 재료 */
export interface FeedSignals {
  quality: number;
  /** 소비자가 ÷ 기대 소비자가 E(#198) — 1이면 제값, 작을수록 싸다 */
  qpr: number;
  consumer: number;
  bottles: number;
  stockout: boolean;
  launch: boolean;
  priceChange: number;
  /** 감정 −1~1 = 0.6 × 품질 + 0.4 × 가성비 */
  sentiment: number;
  mania: number;
  mass: number;
  extreme: number;
}

const WHITE: readonly string[] = ['soju_distilled', 'gin', 'baijiu'];
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const fmtPrice = (won: number) => (won >= 10_000 ? `${(won / 10_000).toFixed(won >= 100_000 ? 0 : 1).replace(/\.0$/, '')}만 원` : `${Math.round(won / 100) * 100}원`);

/** 그 달의 판매가(매출 ÷ 병)로 본 반응 재료. 판매가 없으면 지금 출고가 */
export function feedSignals(s: GameState, p: Product, sale: MonthReport['sales'][number] | undefined, prev: MonthReport['sales'][number] | undefined, month: number): FeedSignals {
  const region = regionOf(s);
  const price = sale && sale.bottles > 0 ? Math.round(sale.revenue / sale.bottles) : p.price;
  const consumer = productConsumerPrice(s, { ...p, price }, region);
  const expected = expectedPricePerL(region, p) * (p.bottleMl / 1000);
  const qpr = expected > 0 ? consumer / expected : 1;
  const prevPrice = prev && prev.bottles > 0 ? prev.revenue / prev.bottles : price;
  const qs = clamp((p.quality - 62) / 18, -1, 1);
  const ps = clamp((1 - qpr) * 2, -1, 1);
  const years = Math.floor((p.oakMonths ?? (p.ageYears ?? 0) * 12) / 12);
  const peat = (p.flavor.peat_smoke ?? 0) >= 30 || (p.flavor.dried_fruit ?? 0) >= 30;
  const mania = clamp((p.abv >= 0.55 ? 0.4 : 0) + (p.rareSingleCask ? 0.3 : 0) + (years >= 10 ? 0.3 : 0) + (peat ? 0.2 : 0) + productLuxury(p) / 200, 0, 1);
  const bottles = sale?.bottles ?? 0;
  const mass = clamp((WHITE.includes(p.category) ? 0.5 : 0) + (qpr < 0.9 ? 0.2 : 0) + (bottles >= 500 ? 0.3 : 0), 0, 1);
  const extreme = qpr < 0.67 ? clamp((0.67 - qpr) / 0.3, 0, 1) : qpr > 1.5 ? clamp((qpr - 1.5) / 0.5, 0, 1) : 0;
  return {
    quality: p.quality, qpr, consumer, bottles,
    stockout: !!sale && sale.bottles > 0 && sale.demandBottles > sale.bottles * 1.05,
    launch: (!!p.launchBoost && month < p.launchBoost.untilMonth) || month - p.createdMonth <= 1,
    priceChange: prevPrice > 0 ? price / prevPrice - 1 : 0,
    sentiment: 0.6 * qs + 0.4 * ps,
    mania, mass, extreme,
  };
}

/** 세 커뮤니티 출현 비율 — 매니아 성향은 위스키베이스, 대중 성향·가격 극단은 디시, 무난·신제품은 카페. 소주·진·고량주는 위스키베이스 ×0.3 */
export function styleWeights(p: Pick<Product, 'category'>, g: Pick<FeedSignals, 'mania' | 'mass' | 'extreme' | 'launch'>): Record<FeedStyle, number> {
  const white = WHITE.includes(p.category);
  const w = (0.22 + 0.4 * g.mania) * (white ? 0.3 : 1);
  const c = 0.32 + 0.18 * (1 - g.extreme) + (g.launch ? 0.12 : 0);
  const gw = (0.16 + 0.35 * g.mania + 0.2 * g.extreme) * (white ? 0.35 : 1); // 위갤 — 매니아·위스키
  const gj = 0.14 + 0.35 * g.mass + 0.25 * g.extreme; // 주갤 — 대중·가격 극단
  const t = w + c + gw + gj;
  return { whiskybase: w / t, cafe: c / t, dc_whisky: gw / t, dc_jugal: gj / t };
}

/** 상황 판정 — 오너 결정 2: 품질 좋은데 너무 싸면 'raise'(가격 올려라 신호), 품질 최하인데 싸면 'cheapLow' */
export function feedSituation(g: Pick<FeedSignals, 'quality' | 'qpr' | 'sentiment'>): FeedSituation {
  if (g.quality >= 70 && g.qpr < 0.8) return 'raise';
  if (g.quality < 55 && g.qpr < 0.9) return 'cheapLow';
  if ((g.qpr > 1.2 && g.quality < 62) || g.qpr > 1.8 || g.sentiment <= -0.5) return 'ripoff';
  if (g.qpr > 1.3) return 'pricey';
  if (g.sentiment >= 0.45) return 'great';
  if (g.sentiment >= 0.15) return 'good';
  if (g.sentiment <= -0.3) return 'bad';
  return 'meh';
}

const POSITIVE: readonly FeedSituation[] = ['raise', 'great', 'good', 'stockout', 'launch', 'priceDown'];
const NEGATIVE: readonly FeedSituation[] = ['cheapLow', 'pricey', 'ripoff', 'bad', 'priceUp'];
const toneOf = (x: FeedSituation): FeedPost['tone'] => (POSITIVE.includes(x) ? 'pos' : NEGATIVE.includes(x) ? 'neg' : 'neu');

function pickStyle(rng: Rng, w: Record<FeedStyle, number>): FeedStyle {
  let r = rng.next();
  for (const k of ['whiskybase', 'cafe', 'dc_whisky'] as const) { if (r < w[k]) return k; r -= w[k]; }
  return 'dc_jugal';
}

function benchmarkFor(p: Product, consumer: number): string {
  const list = FEED_BENCHMARKS[p.category] ?? FEED_BENCHMARKS.whisky!;
  const peaty = (p.flavor.peat_smoke ?? 0) >= 30;
  const pool = peaty && list.some((b) => b.peat) ? list.filter((b) => b.peat) : list;
  return pool.reduce((best, b) => (Math.abs(b.price - consumer) < Math.abs(best.price - consumer) ? b : best), pool[0]!).name;
}

function offNote(p: Product): string | null {
  const offs = (Object.entries(p.flavor) as [AxisId, number][]).filter(([a, v]) => AXIS[a]?.polarity === 'offnote' && v >= 8).sort((a, b) => b[1] - a[1]);
  if (offs.length) return AXIS[offs[0]![0]].nameKo;
  if ((p.flavor.harshness ?? 0) >= 45) return '알코올 자극';
  if ((p.flavor.sulfur_meaty ?? 0) >= 20) return AXIS.sulfur_meaty.nameKo;
  return null;
}

function fill(t: string, v: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? '');
}

/**
 * 디시 거친 말 수위 (v2, 오너 2026-11-10) — 위갤: 긍정 0.5 · 부정 1 · 심한 부정에서 25%만 2.
 * 주갤(욕설·뻘소리 중심): 칭찬도 1(욕 섞인 칭찬) · 부정은 60%가 2
 */
function dcHarsh(rng: Rng, style: 'dc_whisky' | 'dc_jugal', x: FeedSituation, sentiment: number): Harsh {
  const lines = style === 'dc_whisky' ? DCW_LINES[x] : DCJ_LINES[x];
  if (style === 'dc_whisky') {
    if (toneOf(x) !== 'neg') return lines[0.5] ? 0.5 : 1;
    return sentiment <= -0.5 && lines[2] && rng.next() < 0.25 ? 2 : 1;
  }
  if (toneOf(x) !== 'neg') return 1;
  return lines[2] && rng.next() < 0.6 ? 2 : 1;
}

/** 제품 특징 — 위갤·위스키베이스 디테일 문장 */
function featuresOf(p: Product): FeedFeature[] {
  const out: FeedFeature[] = [];
  const years = Math.floor((p.oakMonths ?? (p.ageYears ?? 0) * 12) / 12);
  if ((p.flavor.peat_smoke ?? 0) >= 30) out.push('peat');
  if ((p.flavor.dried_fruit ?? 0) >= 30 || (p.finish ?? '').includes('oloroso')) out.push('sherry');
  if (p.abv >= 0.55) out.push('cs');
  if (!WHITE.includes(p.category) && years >= 5) out.push('aged');
  if (!WHITE.includes(p.category) && years <= 1) out.push('young');
  if ((p.restMonths ?? 0) >= 6) out.push('onggi');
  if (p.category === 'soju_distilled') out.push('soju');
  if (p.category === 'gin') out.push('gin');
  return out;
}

function writePost(rng: Rng, p: Product, g: FeedSignals, x: FeedSituation, style: FeedStyle, month: number, i: number): FeedPost {
  const notes = topNotes(p.flavor, 3).map((n) => n.nameKo);
  const off = offNote(p);
  const years = Math.floor((p.oakMonths ?? (p.ageYears ?? 0) * 12) / 12);
  const vars: Record<string, string> = {
    name: p.name, n1: notes[0] ?? '은은한 곡물', n2: notes[1] ?? notes[0] ?? '단맛', n3: notes[2] ?? notes[1] ?? '여운',
    off: off ?? '알코올 자극', price: fmtPrice(g.consumer), bench: benchmarkFor(p, g.consumer), cat: CATEGORY[p.category].nameKo,
    abv: `${Math.round(p.abv * 100)}%`, age: years > 0 ? `${years}년` : '어린',
  };
  const white = WHITE.includes(p.category);
  const community = FEED_COMMUNITIES[style][white ? 'white' : 'whisky'];
  const author = rng.pick(FEED_AUTHORS[style]);
  const tone = toneOf(x);
  const base = { id: `${month}:${p.id}:${i}`, month, style, community, author, productId: p.id, productName: p.name, tone, ...(x === 'raise' ? { signal: 'raise_price' as const } : {}) };
  const feats = featuresOf(p);
  if (style === 'whiskybase') {
    const score = clamp(Math.round(60 + p.quality * 0.38 + rng.int(-3, 3)), 50, 98);
    const finish = rng.pick(WB_FINISH[p.quality >= 75 ? 'long' : p.quality >= 60 ? 'mid' : 'short']);
    const palate = `${vars.n3}${off ? `, 옅은 ${off}` : ''}`;
    const verdict = fill(rng.pick(WB_VERDICT[x]), vars);
    const tasting = ['stockout', 'priceUp', 'priceDown', 'forgotten'].includes(x) ? '' : `Nose: ${rng.pick(WB_NOSE_ADJ)} ${vars.n1}, ${vars.n2}. Palate: ${palate}. Finish: ${finish}. `;
    return { ...base, text: `${tasting}${verdict} ${score}점`, score, harsh: 0 };
  }
  if (style === 'cafe') {
    const text = `${rng.pick(CAFE_OPEN)}${fill(rng.pick(CAFE_LINES[x]), vars)}${rng.pick(CAFE_CLOSE)}`;
    return { ...base, text, harsh: 0, replies: replies(rng, style, tone) };
  }
  const harsh = dcHarsh(rng, style, x, g.sentiment);
  if (style === 'dc_whisky') {
    const pool = DCW_LINES[x][harsh] ?? DCW_LINES[x][1] ?? DCW_LINES[x][0.5]!;
    const feat = feats.length && rng.next() < 0.5 ? ` — ${fill(rng.pick(DCW_FEATURE[rng.pick(feats)]), vars)}` : '';
    return { ...base, text: `${rng.pick(DCW_OPEN)}${fill(rng.pick(pool), vars)}${feat}${rng.pick(DCW_CLOSE)}`, harsh, replies: replies(rng, style, tone) };
  }
  // 주갤 — 30%는 뻘글(제품 이름만 걸친 헛소리). 가격 신호 글은 뻘글로 바꾸지 않는다
  if (x !== 'raise' && rng.next() < 0.3) {
    return { ...base, tone: 'neu', text: `${rng.pick(DCJ_OPEN)}${fill(rng.pick(DCJ_OFFTOPIC), vars)}${rng.pick(DCJ_CLOSE)}`, harsh: 1, replies: replies(rng, style, 'neu') };
  }
  const pool = DCJ_LINES[x][harsh] ?? DCJ_LINES[x][1] ?? DCJ_LINES[x][0.5]!;
  return { ...base, text: `${rng.pick(DCJ_OPEN)}${fill(rng.pick(pool), vars)}${rng.pick(DCJ_CLOSE)}`, harsh, replies: replies(rng, style, tone) };
}

/** 댓글 0~3개 (위갤·주갤은 더 많이, 카페는 0~2) */
function replies(rng: Rng, style: Exclude<FeedStyle, 'whiskybase'>, tone: FeedPost['tone']): FeedPost['replies'] {
  const n = style === 'cafe' ? rng.int(0, 2) : rng.int(0, 3);
  const pool = REPLIES[style][tone];
  const out: { author: string; text: string }[] = [];
  for (let k = 0; k < n; k++) {
    const text = rng.pick(pool);
    if (out.some((r) => r.text === text)) continue;
    out.push({ author: rng.pick(FEED_AUTHORS[style]), text });
  }
  return out.length ? out : undefined;
}

/** 한 제품·한 달의 글 수 — 판매량(로그)·오픈런·출시 직후·화제(품절·가격 변동)로 0~4개. 판매가 줄면 글도 준다 */
export function postCount(rng: Rng, p: Product, g: FeedSignals, month: number): number {
  const launchMul = p.launchBoost && month < p.launchBoost.untilMonth ? 2 : month - p.createdMonth <= 3 ? 1.5 : 1;
  const buzz = (g.stockout ? 1 : 0) + (Math.abs(g.priceChange) > 0.3 ? 1 : 0) + (g.quality >= 80 ? 0.5 : 0);
  return clamp(Math.round(1.0 * Math.log10(1 + g.bottles) * launchMul + buzz + rng.next() * 0.8 - 0.5), 0, 4);
}

/**
 * 최근 months개월 피드 — 새 글이 위. 같은 주종을 둘 이상 판 달에는 비교 글(오너 결정 6), 3개월 이상 안 팔린 제품은 "단종?" 글.
 * maxPosts개까지. 판매 화면 카드(ui/FeedCard.tsx)가 부른다
 */
export function feedFor(s: GameState, months = 3, maxPosts = 14): FeedPost[] {
  const reports = s.history.reports.slice(-months);
  const all: FeedPost[] = [];
  for (let k = reports.length - 1; k >= 0; k--) {
    const r = reports[k]!;
    const prevR = s.history.reports[s.history.reports.indexOf(r) - 1];
    const sold: { p: Product; g: FeedSignals }[] = [];
    for (const sale of r.sales) {
      const p = s.commerce.products.find((x) => x.id === sale.productId);
      if (!p || p.dutyFreeOnly) continue;
      const g = feedSignals(s, p, sale, prevR?.sales.find((x) => x.productId === p.id), r.month);
      if (g.bottles <= 0) continue;
      sold.push({ p, g });
      const rng = rngFor(s.seed, r.month, `feed:${p.id}`);
      const w = styleWeights(p, g);
      const x = feedSituation(g);
      const events: FeedSituation[] = [];
      if (g.launch) events.push('launch');
      if (g.stockout) events.push('stockout');
      if (g.priceChange > 0.3) events.push('priceUp');
      if (g.priceChange < -0.3) events.push('priceDown');
      let n = postCount(rng, p, g, r.month);
      if (x === 'raise') n = Math.max(n, 1); // 가격 신호는 반드시 하나
      const used = new Set<string>();
      for (let i = 0; i < n; i++) {
        const sit = i < events.length && rng.next() < 0.7 ? events[i]! : x;
        let post = writePost(rng, p, g, sit, pickStyle(rng, w), r.month, i);
        for (let k = 0; k < 4 && used.has(post.text); k++) post = writePost(rng, p, g, sit, pickStyle(rng, w), r.month, i); // 같은 달 같은 문장 피하기
        if (used.has(post.text)) continue;
        used.add(post.text);
        all.push(post);
      }
    }
    // 비교 글: 같은 주종 둘 이상
    const rng = rngFor(s.seed, r.month, 'feed:compare');
    const byCat = new Map<string, { p: Product; g: FeedSignals }[]>();
    for (const x of sold) byCat.set(x.p.category, [...(byCat.get(x.p.category) ?? []), x]);
    for (const list of byCat.values()) {
      if (list.length < 2 || rng.next() > 0.6) continue;
      const i = rng.int(0, list.length - 1);
      const j = (i + 1 + rng.int(0, list.length - 2)) % list.length; // i와 다른 제품
      const [win, lose] = list[i]!.g.sentiment >= list[j]!.g.sentiment ? [list[i]!, list[j]!] : [list[j]!, list[i]!];
      const style = pickStyle(rng, styleWeights(win.p, win.g));
      const reason = win.p.quality - lose.p.quality >= 5 ? COMPARE_REASON.quality : COMPARE_REASON.price;
      const text = fill(rng.pick(COMPARE_LINES[style]), { winner: win.p.name, loser: lose.p.name, reason });
      const white = WHITE.includes(win.p.category);
      all.push({ id: `${r.month}:cmp:${win.p.id}:${lose.p.id}`, month: r.month, style, community: FEED_COMMUNITIES[style][white ? 'white' : 'whisky'], author: rng.pick(FEED_AUTHORS[style]), productId: win.p.id, productName: `${win.p.name} vs ${lose.p.name}`, text, tone: 'neu', harsh: style === 'dc_jugal' ? 1 : style === 'dc_whisky' ? 0.5 : 0 });
    }
  }
  // 잊혀 가는 제품 — 판 적은 있는데 최근 3개월 리포트에 판매가 없다
  const last = reports.at(-1);
  if (last) {
    const rng = rngFor(s.seed, last.month, 'feed:forgotten');
    const recent = s.history.reports.slice(-3);
    const soldRecently = (id: string) => recent.some((r) => r.sales.some((x) => x.productId === id && x.bottles > 0));
    for (const p of s.commerce.products) {
      if (p.dutyFreeOnly || p.totalSold <= 0 || recent.length < 3 || soldRecently(p.id) || rng.next() > 0.5) continue;
      const g = feedSignals(s, p, undefined, undefined, last.month);
      const style = pickStyle(rng, styleWeights(p, g));
      all.push(writePost(rng, p, g, 'forgotten', style, last.month, 9));
    }
  }
  // 새 달이 위. 같은 달 안에서는 가격 신호 먼저, 그다음 제품별 첫 글 → 둘째 글 순(한 제품이 목록을 차지하지 않게)
  const rank = (x: FeedPost) => Number(x.id.split(':').at(-1)) || 0;
  return all
    .sort((a, b) => b.month - a.month || Number(!!b.signal) - Number(!!a.signal) || rank(a) - rank(b))
    .slice(0, maxPosts);
}
