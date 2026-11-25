import { CATEGORY } from './content/categories';
import { regionOf } from './content/regions';
import { FEED_GENERIC_OFF, CAFE_CLOSE, CAFE_LINES, CAFE_OPEN, COMPARE_LINES, COMPARE_REASON, DCJ_CLOSE, DCJ_LINES, DCJ_OFFTOPIC, DCJ_OPEN, DCW_CLOSE, DCW_FEATURE, DCW_LINES, DCW_TAG, FEED_AUTHORS, FEED_BENCHMARKS, FEED_COMMUNITIES, FEED_KIND_LINES, FEED_SEASON_LINES, FEED_SEASON_MONTHS, NOTE_PARTS, REPLIES, WB_FINISH, WB_KIND_LINES, WB_NOSE_ADJ, WB_VERDICT, type FeedFeature, type FeedKind, type FeedSeason, type FeedSituation, type FeedStyle, type Harsh } from './content/feed';
import { finishLabelOn } from './finishLabel';
import { hasDutyFree } from './dutyFree';
import { finishLabel } from './maturation';
import { AXIS } from './content/axes';
import { productLuxury } from './brands';
import { topNotes } from './flavor';
import { expectedPricePerL, productConsumerPrice } from './market';
import { rngFor, type Rng } from './rng';
import { hidesProductQuality, knownProductQuality } from './productView'; // F5d (#338)
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
  /** 글에 나오는 잡내 이름(없으면 null) — 공개 판은 참 잡내 축(`offNote`), 가리는 판은 커뮤니티 품질로만([결정 #366]) */
  off: string | null;
  /** 「bad」 글의 {off} 자리(잡내 이름이 없을 때 채우는 말) */
  offWord: string;
  mania: number;
  mass: number;
  extreme: number;
}

const WHITE: readonly string[] = ['soju_distilled', 'gin', 'baijiu'];
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const fmtPrice = (won: number) => (won >= 10_000 ? `${(won / 10_000).toFixed(won >= 100_000 ? 0 : 1).replace(/\.0$/, '')}만 원` : `${Math.round(won / 100) * 100}원`);

/**
 * 커뮤니티가 말하는 품질 (외부 검토 I2 누수 L3, 2026-11-24 · MKT) — 피드의 글 분위기 · 비교 글 · 매니아 비중이 읽는 값.
 * 가리는 판(F5d, v16)의 아는 품질이 있는 제품: **그달 전 12개월 위스키베이스 점수 읽기의 평균**(틱이 남긴 `MonthReport.reviews` — 플레이어가 피드에서 이미 본 점수,
 * 아는 품질 추정에도 이미 들어간 정보), 점수가 없으면 아는 품질(`knownProductQuality`). 공개 판 · 공개 제품은 참 품질 그대로(바이트 동일).
 * 그달 점수는 넣지 않는다 — 틱(리뷰를 뽑기 전)과 화면이 같은 값을 쓰게. 읽기 식은 reviews.ts `reviewReading`과 같다(순환 import를 피해 여기 적는다)
 */
export function communityQuality(s: Pick<GameState, 'rulesVersion' | 'commerce' | 'history'>, p: Product, month: number): number {
  if (!hidesProductQuality(s) || !p.qualityKnown) return p.quality;
  const scores = s.history.reports.filter((r) => r.month < month && r.month >= month - 12).flatMap((r) => r.reviews?.find((v) => v.productId === p.id)?.scores ?? []);
  return scores.length ? scores.reduce((t, sc) => t + (sc - 60) / 0.38, 0) / scores.length : knownProductQuality(s, p).q;
}

/** 그 달의 판매가(매출 ÷ 병)로 본 반응 재료. 판매가 없으면 지금 출고가 */
export function feedSignals(s: GameState, p: Product, sale: MonthReport['sales'][number] | undefined, prev: MonthReport['sales'][number] | undefined, month: number): FeedSignals {
  const region = regionOf(s);
  const price = sale && sale.bottles > 0 ? Math.round(sale.revenue / sale.bottles) : p.price;
  const consumer = productConsumerPrice(s, { ...p, price }, region);
  const quality = communityQuality(s, p, month); // I2 L3 — 가리는 판은 참 품질이 아니라 커뮤니티가 본 점수로(가성비의 기대 가격도 같은 값)
  // [결정 #366] I2 L7 (라): 잡내 · 자극 문구는 품질 신호라, 가리는 판에서는 참 잡내 축 대신 커뮤니티 품질로만 낸다(향 이름 · 방향은 공개 그대로)
  const hidden = hidesProductQuality(s) && !!p.qualityKnown;
  const off = hidden ? (quality < FEED_GENERIC_OFF.below ? FEED_GENERIC_OFF.word : null) : offNote(p);
  const seen = quality === p.quality ? p : { ...p, quality };
  const expected = expectedPricePerL(region, seen) * (p.bottleMl / 1000);
  const qpr = expected > 0 ? consumer / expected : 1;
  const prevPrice = prev && prev.bottles > 0 ? prev.revenue / prev.bottles : price;
  const qs = clamp((quality - 62) / 18, -1, 1);
  const ps = clamp((1 - qpr) * 2, -1, 1);
  const years = Math.floor((p.oakMonths ?? (p.ageYears ?? 0) * 12) / 12);
  const peat = (p.flavor.peat_smoke ?? 0) >= 30 || (p.flavor.dried_fruit ?? 0) >= 30;
  const mania = clamp((p.abv >= 0.55 ? 0.4 : 0) + (p.rareSingleCask ? 0.3 : 0) + (years >= 10 ? 0.3 : 0) + (peat ? 0.2 : 0) + productLuxury(seen) / 200, 0, 1);
  const bottles = sale?.bottles ?? 0;
  const mass = clamp((WHITE.includes(p.category) ? 0.5 : 0) + (qpr < 0.9 ? 0.2 : 0) + (bottles >= 500 ? 0.3 : 0), 0, 1);
  const extreme = qpr < 0.67 ? clamp((0.67 - qpr) / 0.3, 0, 1) : qpr > 1.5 ? clamp((qpr - 1.5) / 0.5, 0, 1) : 0;
  return {
    quality, qpr, consumer, bottles, off, offWord: off ?? (hidden ? FEED_GENERIC_OFF.word : '알코올 자극'),
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

export function pickStyle(rng: Rng, w: Record<FeedStyle, number>): FeedStyle {
  let r = rng.next();
  for (const k of ['whiskybase', 'cafe', 'dc_whisky'] as const) { if (r < w[k]) return k; r -= w[k]; }
  return 'dc_jugal';
}

function benchmarkOf(p: Product, consumer: number): { name: string; co?: string } {
  const list = FEED_BENCHMARKS[p.category] ?? FEED_BENCHMARKS.whisky!;
  const peaty = (p.flavor.peat_smoke ?? 0) >= 30;
  const pool = peaty && list.some((b) => b.peat) ? list.filter((b) => b.peat) : list;
  return pool.reduce((best, b) => (Math.abs(b.price - consumer) < Math.abs(best.price - consumer) ? b : best), pool[0]!);
}

/**
 * 줄임 이름 — 위스키 마이너 갤러리 관찰(브랜드 앞 글자 + 숫자, mkt-feed.md §4.1.1). 낱말마다 첫 글자(숫자 낱말은 빼고 앞 셋까지) + 이름 속 첫 숫자.
 * 「김포 블랜디드 3년」 → 「김블3」. 한 낱말 이름은 그대로
 */
export function shortName(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2) return name;
  const heads = words.filter((w) => !/^\d/.test(w)).slice(0, 3).map((w) => w[0]).join('');
  return `${heads}${name.match(/\d+/)?.[0] ?? ''}`;
}

/** 그달의 철 — 계절 글(FEED_SEASON_MONTHS). 설(1 · 2월)은 선물이 먼저 */
export const seasonOf = (month: number): FeedSeason | null => {
  const m = (month % 12) + 1;
  return (['gift', 'summer', 'winter'] as const).find((k) => FEED_SEASON_MONTHS[k].includes(m)) ?? null;
};

/** 틀이 이 제품에 맞는가 — 공개 표기만 본다(F5d · PROD 합의: 통 이름은 피니시 표기뿐) */
interface LineCtx { labelYears: number; finish: boolean; onggi: boolean; cs: boolean; co: boolean; limited: boolean; medal: boolean; dutyFree: boolean; noCask: boolean }
function lineOk(line: string, c: LineCtx): boolean {
  if (line.includes('{benchCo}') && !c.co) return false;
  if (c.noCask && CASK_WORDS.test(line)) return false;
  if (line.includes('한정') && !c.limited) return false;
  if (line.includes('수상') && !c.medal) return false;
  if (line.includes('면세') && !c.dutyFree) return false;
  if ((line.includes('{finish}') || line.includes('피니시 몇 개월')) && !c.finish) return false;
  if (line.includes('{age}') && c.labelYears <= 0) return false;
  if (line.includes('숙성 표기 없는데') && c.labelYears > 0) return false;
  if (line.includes('옹기') && !c.onggi) return false;
  if (line.includes('캐스크 스트렝스') && !c.cs) return false;
  if ((line.includes('숙성 연수 짧은데') || line.includes('어린 원액')) && c.labelYears > 3) return false;
  return true;
}
/** 틀 고르기 — 맞는 틀 가운데 이 피드에서 아직 안 쓴 것 먼저(되풀이 피하기 — 화면 한 번에 같은 문장이 두 번 나오지 않게) */
function pickLine(rng: Rng, pool: readonly string[] | undefined, c: LineCtx, used?: Set<string>): string | null {
  const ok = (pool ?? []).filter((l) => lineOk(l, c));
  if (!ok.length) return null;
  const fresh = used ? ok.filter((l) => !used.has(l)) : ok;
  const line = rng.pick(fresh.length ? fresh : ok);
  used?.add(line);
  return line;
}

/**
 * 통에서 쉬지 않은 제품(소주 · 진 · 고량주, 또는 오크 개월 0)에는 「캐스크」 · 「피니시」가 든 문장(맺음말 · 평가 · 특징 · 댓글)을 쓰지 않는다 — PM 2026-11-25
 * (「[질문] 김소 … 도수 25%임 (캐스크 넘버까지 확인함)」). 걸러서 남는 것이 없으면 원래 묶음을 쓴다
 */
const CASK_WORDS = /캐스크|피니시/;
function fit(pool: readonly string[], noCask: boolean): readonly string[] {
  if (!noCask) return pool;
  const ok = pool.filter((l) => !CASK_WORDS.test(l));
  return ok.length ? ok : pool;
}

/** 글 종류를 부르는 공개 사정 — 지난달 품절 뒤 재입고 · 수상 소식 · 유통 입점 · 면세 완판 · 철 */
interface KindFlags { restock: boolean; medal: boolean; deal: boolean; season: FeedSeason | null }
const KIND_TONE: Partial<Record<FeedKind, FeedPost['tone']>> = { proof: 'pos', restock: 'pos', soldout: 'pos', news: 'pos', qpr: 'pos', gift: 'pos', meetup: 'pos', starter: 'pos' };

/**
 * [결정 #400] 글 종류 비율 — 평가(지금 상황 글)는 2, 나머지는 공개 사정이 부른다. 0이면 나오지 않는다.
 * 화면 전용 난수(`feed:kind:<제품>`)로 고른다 — 리뷰 셈(postCount · styleWeights · pickStyle)과 무관해 봇 출력이 바뀌지 않는다(#406)
 */
export function kindWeights(style: FeedStyle, p: Product, g: FeedSignals, x: FeedSituation, f: KindFlags): Partial<Record<FeedKind, number>> {
  const white = WHITE.includes(p.category);
  const label = !!p.ageYears || finishLabelOn(p) || (p.restMonths ?? 0) >= 6 || p.abv >= 0.55;
  const cheap = g.qpr < 0.9;
  if (style === 'whiskybase') return { eval: 3, scoreonly: 0.6, batch: f.restock ? 1 : 0.2, english: 0.4 + g.mania };
  if (style === 'dc_whisky') {
    return { eval: 2, question: 1, news: g.launch ? 3 : 0, proof: g.stockout || f.restock || f.medal ? 2 : 0.5, starter: cheap && !white ? 1 : 0.3, soldout: g.stockout ? 3 : 0,
      qpr: cheap ? 1.5 : 0, label: label ? 1.5 : 0, bought: 1, meme: 0.4, longnote: white ? 0.3 : 1 };
  }
  if (style === 'dc_jugal') {
    return { eval: toneOf(x) === 'neg' ? 2.5 : 2, question: 1.5, mart: white || cheap ? 1.5 : 0.7, mixer: white ? 1.5 : 0.8, meme: 2, proof: 0.6, soldout: g.stockout ? 2 : 0, season: f.season ? 1.5 : 0 };
  }
  return { eval: 2, question: 1, buyinfo: Math.abs(g.priceChange) > 0.1 || f.deal ? 2 : 0.5, restock: f.restock ? 3 : 0, meetup: 0.5, gift: f.season === 'gift' || !!p.ageYears ? 1 : 0.3,
    season: f.season ? 1 : 0, longnote: 1 };
}
function pickKind(rng: Rng, w: Partial<Record<FeedKind, number>>): FeedKind {
  const entries = Object.entries(w).filter(([, v]) => (v ?? 0) > 0) as [FeedKind, number][];
  const total = entries.reduce((t, [, v]) => t + v, 0);
  let r = rng.next() * total;
  for (const [k, v] of entries) { r -= v; if (r <= 0) return k; }
  return entries.at(-1)?.[0] ?? 'eval';
}

function offNote(p: Product): string | null {
  const offs = (Object.entries(p.flavor) as [AxisId, number][]).filter(([a, v]) => AXIS[a]?.polarity === 'offnote' && v >= 8).sort((a, b) => b[1] - a[1]);
  if (offs.length) return AXIS[offs[0]![0]].nameKo;
  if ((p.flavor.harshness ?? 0) >= 45) return '알코올 자극';
  if ((p.flavor.sulfur_meaty ?? 0) >= 20) return AXIS.sulfur_meaty.nameKo;
  return null;
}

/** 끝 글자에 받침이 있는가 — 한글은 받침, 숫자는 읽는 소리(0 영 · 1 일 · 3 삼 · 6 육 · 7 칠 · 8 팔), 그 밖은 없음으로 본다. ㄹ 받침은 'l' */
function batchim(word: string): 'none' | 'l' | 'other' {
  const ch = word.trim().replace(/[)\]」』'"%.!?~]+$/, '').slice(-1);
  const c = ch.charCodeAt(0) - 0xac00;
  if (c >= 0 && c < 11172) { const j = c % 28; return j === 0 ? 'none' : j === 8 ? 'l' : 'other'; }
  if ('0136'.includes(ch)) return 'other';
  if ('178'.includes(ch)) return 'l';
  return 'none';
}
/** 빈칸 뒤 조사를 값의 받침에 맞춘다(「청사과·배이」 → 「청사과·배가」). 짝: 이/가 · 을/를 · 은/는 · 과/와 · 이랑/랑 · 으로/로 */
const PARTICLE: Record<string, [string, string]> = { 이: ['이', '가'], 가: ['이', '가'], 을: ['을', '를'], 를: ['을', '를'], 은: ['은', '는'], 는: ['은', '는'], 과: ['과', '와'], 와: ['과', '와'], 이랑: ['이랑', '랑'], 랑: ['이랑', '랑'] };
function fill(t: string, v: Record<string, string>): string {
  return t.replace(/\{(\w+)\}(이랑|랑|으로|로|이|가|을|를|은|는|과|와)?(?=[\s,.!?~^ㅋㅎ…)\]/]|$)/g, (_, k: string, pt?: string) => {
    const val = v[k] ?? '';
    if (!pt) return val;
    const b = batchim(val);
    if (pt === '으로' || pt === '로') return val + (b === 'other' ? '으로' : '로');
    const pair = PARTICLE[pt]!;
    return val + (b === 'none' ? pair[1] : pair[0]);
  }).replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? '');
}

/**
 * 디시 거친 말 수위 — 위갤: 긍정 0.5 · 부정 1. 주갤: 칭찬도 부정도 1(비속어 섞인 말).
 * [결정 #403] 비속어는 넣고 욕설은 넣지 않는다 — 욕설 단계 2(#254)는 쓰지 않는다(단계 1까지). 문장 틀에도 단계 2 묶음이 없다(content/feed.ts)
 */
function dcHarsh(style: 'dc_whisky' | 'dc_jugal', x: FeedSituation): Harsh {
  const lines = style === 'dc_whisky' ? DCW_LINES[x] : DCJ_LINES[x];
  if (style === 'dc_whisky' && toneOf(x) !== 'neg') return lines[0.5] ? 0.5 : 1;
  return 1;
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

/**
 * forcedScore — F5d(v16): 틱에서 그린 위스키베이스 점수(`MonthReport.reviews`). 있으면 그 점수와 그 점수가 말하는 품질로 쓴다(참 품질을 글에 새지 않게).
 * kind — [결정 #400] 글 종류(평가 밖의 글). 맞는 틀이 없으면 평가로 돌아간다. used — 이 피드에서 쓴 틀(되풀이 피하기)
 */
function writePost(rng: Rng, p: Product, g: FeedSignals, x: FeedSituation, style: FeedStyle, month: number, i: number, forcedScore?: number, kind: FeedKind = 'eval', used?: Set<string>, season: FeedSeason | null = null, medal = false, dutyFree = false): FeedPost {
  const notes = topNotes(p.flavor, 3).map((n) => n.nameKo);
  const off = g.off;
  const years = Math.floor((p.oakMonths ?? (p.ageYears ?? 0) * 12) / 12);
  const bench = benchmarkOf(p, g.consumer);
  const finish = finishLabelOn(p) && p.finish ? finishLabel(p.finish).replace(/ 피니시$/, '') : '오크 통';
  const vars: Record<string, string> = {
    name: p.name, short: style === 'cafe' ? p.name : shortName(p.name), n1: notes[0] ?? '은은한 곡물', n2: notes[1] ?? notes[0] ?? '단맛', n3: notes[2] ?? notes[1] ?? '여운',
    off: g.offWord, price: fmtPrice(g.consumer), bench: bench.name, benchCo: bench.co ?? '', cat: CATEGORY[p.category].nameKo,
    abv: `${Math.round(p.abv * 100)}%`, age: p.ageYears ? `${p.ageYears}년` : years > 0 ? `${years}년` : '어린', finish,
  };
  const noCask = WHITE.includes(p.category) || !((p.oakMonths ?? 0) > 0);
  const ctx: LineCtx = { labelYears: p.ageYears ?? 0, finish: finishLabelOn(p), onggi: (p.restMonths ?? 0) >= 6, cs: p.abv >= 0.55, co: !!bench.co, limited: !!p.rareSingleCask || !!p.dfEdition, medal, dutyFree, noCask };
  const white = WHITE.includes(p.category);
  const community = FEED_COMMUNITIES[style][white ? 'white' : 'whisky'];
  const author = rng.pick(FEED_AUTHORS[style]);
  const tone = toneOf(x);
  const base = { id: `${month}:${p.id}:${i}`, month, style, community, author, productId: p.id, productName: p.name, tone, ...(x === 'raise' ? { signal: 'raise_price' as const } : {}) };
  const feats = featuresOf(p);
  if (style === 'whiskybase') {
    const drawn = clamp(Math.round(60 + p.quality * 0.38 + rng.int(-3, 3)), 50, 98);
    const score = forcedScore ?? drawn;
    const q = forcedScore != null ? (forcedScore - 60) / 0.38 : p.quality; // 여운 문구도 점수가 말하는 품질로(reviews.ts reviewReading과 같은 식)
    const finishNote = rng.pick(WB_FINISH[q >= 75 ? 'long' : q >= 60 ? 'mid' : 'short']);
    const line = kind !== 'eval' ? pickLine(rng, WB_KIND_LINES[kind], ctx, used) : null;
    if (line) return { ...base, tone: 'neu', text: `${fill(line, vars)} ${score}점`, score, harsh: 0 };
    const palate = `${vars.n3}${off ? `, 옅은 ${off}` : ''}`;
    const verdict = fill(rng.pick(fit(WB_VERDICT[x], noCask)), vars);
    const tasting = ['stockout', 'priceUp', 'priceDown', 'forgotten'].includes(x) ? '' : `Nose: ${rng.pick(WB_NOSE_ADJ)} ${vars.n1}, ${vars.n2}. Palate: ${palate}. Finish: ${finishNote}. `;
    return { ...base, text: `${tasting}${verdict} ${score}점`, score, harsh: 0 };
  }
  // [결정 #400] 평가 밖의 글 — 다섯 줄 노트 · 계절 · 종류별 틀. 맞는 틀이 없으면 아래 평가 글로
  if (kind !== 'eval') {
    let body: string | null = null;
    if (kind === 'longnote' && (style === 'dc_whisky' || style === 'cafe')) {
      const n = NOTE_PARTS[style];
      body = [n.look, n.nose, n.palate, n.finish, n.verdict[tone]].map((pool) => fill(rng.pick(pool), vars)).join(' / ');
    } else if (kind === 'season' && season && (style === 'dc_jugal' || style === 'cafe')) {
      const line = pickLine(rng, FEED_SEASON_LINES[style][season], ctx, used);
      body = line && fill(line, vars);
    } else {
      const line = pickLine(rng, FEED_KIND_LINES[style][kind], ctx, used);
      body = line && fill(line, vars);
    }
    if (body) {
      const kTone: FeedPost['tone'] = kind === 'longnote' ? tone : KIND_TONE[kind] ?? 'neu';
      const { signal: _s, ...plain } = base;
      if (style === 'dc_whisky') return { ...plain, tone: kTone, text: `${DCW_TAG[kind] ?? '[일반]'} ${body}${rng.pick(fit(DCW_CLOSE, noCask))}`, harsh: 0.5, replies: replies(rng, style, kTone, noCask) };
      if (style === 'dc_jugal') return { ...plain, tone: kTone, text: `${kind === 'meme' ? rng.pick(DCJ_OPEN) : ''}${body}${rng.pick(DCJ_CLOSE)}`, harsh: 1, replies: replies(rng, style, kTone, noCask) };
      return { ...plain, tone: kTone, text: `${body}${rng.pick(CAFE_CLOSE)}`, harsh: 0, replies: replies(rng, style, kTone, noCask) };
    }
  }
  if (style === 'cafe') {
    const text = `${rng.pick(CAFE_OPEN)}${fill(rng.pick(fit(CAFE_LINES[x], noCask)), vars)}${rng.pick(CAFE_CLOSE)}`;
    return { ...base, text, harsh: 0, replies: replies(rng, style, tone, noCask) };
  }
  const harsh = dcHarsh(style, x);
  if (style === 'dc_whisky') {
    const pool = fit(DCW_LINES[x][harsh] ?? DCW_LINES[x][1] ?? DCW_LINES[x][0.5]!, noCask);
    const feat = feats.length && rng.next() < 0.5 ? ` — ${fill(rng.pick(fit(DCW_FEATURE[rng.pick(feats)], noCask)), vars)}` : '';
    // 위스키 마이너 갤러리 말머리(관찰 mkt-feed.md §4.1.1) — 평가 글은 [리뷰]
    return { ...base, text: `${DCW_TAG.eval} ${fill(rng.pick(pool), vars)}${feat}${rng.pick(fit(DCW_CLOSE, noCask))}`, harsh, replies: replies(rng, style, tone, noCask) };
  }
  // 주갤 — 30%는 뻘글(제품 이름만 걸친 헛소리). 가격 신호 글은 뻘글로 바꾸지 않는다
  if (x !== 'raise' && rng.next() < 0.3) {
    return { ...base, tone: 'neu', text: `${rng.pick(DCJ_OPEN)}${fill(rng.pick(DCJ_OFFTOPIC), vars)}${rng.pick(DCJ_CLOSE)}`, harsh: 1, replies: replies(rng, style, 'neu', noCask) };
  }
  // 부정 글은 v4 평가 틀(FEED_KIND_LINES.dc_jugal.eval — 상황 밖의 짧은 실망)도 섞는다
  const pool = [...(DCJ_LINES[x][harsh] ?? DCJ_LINES[x][1] ?? DCJ_LINES[x][0.5]!), ...(tone === 'neg' ? FEED_KIND_LINES.dc_jugal.eval ?? [] : [])];
  return { ...base, text: `${rng.pick(DCJ_OPEN)}${fill(rng.pick(fit(pool, noCask)), vars)}${rng.pick(DCJ_CLOSE)}`, harsh, replies: replies(rng, style, tone, noCask) };
}

/** 댓글 0~3개 (위갤·주갤은 더 많이, 카페는 0~2) */
function replies(rng: Rng, style: Exclude<FeedStyle, 'whiskybase'>, tone: FeedPost['tone'], noCask = false): FeedPost['replies'] {
  const n = style === 'cafe' ? rng.int(0, 2) : rng.int(0, 3);
  const pool = fit(REPLIES[style][tone], noCask);
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
  // F5d(#338 ⑥): 품질을 가리는 판(v16)은 위스키베이스 글을 틱에서 그린 리뷰(`MonthReport.reviews`)로만 보인다 — 추정 갱신(reviews.ts)과 같은 점수.
  // 다른 커뮤니티 글은 그대로 이 함수가 그린다. 옛 판은 지금 그대로(바이트 동일)
  const hidden = hidesProductQuality(s);
  const dutyFreeSite = hasDutyFree(s); // 면세 글은 면세점이 있는 입지에서만
  const tpl = new Set<string>(); // [결정 #400] 이 피드에서 쓴 틀 — 같은 화면 창에 같은 문장이 되풀이되지 않게
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
      // [결정 #400] 글 종류는 화면 전용 난수로 — 리뷰 셈(reviews.ts)이 쓰는 postCount · styleWeights · pickStyle의 순서를 건드리지 않는다
      const krng = rngFor(s.seed, r.month, `feed:kind:${p.id}`);
      const prevSale = prevR?.sales.find((x) => x.productId === p.id);
      const flags: KindFlags = {
        restock: !!prevSale && prevSale.bottles > 0 && prevSale.demandBottles > prevSale.bottles * 1.05 && !g.stockout,
        medal: (r.events ?? []).some((e) => e.includes('수상')),
        deal: (s.commerce.retailContracts ?? []).some((c) => c.category === p.category) || (r.events ?? []).some((e) => e.includes('면세 한정판') && e.includes('완판')),
        season: seasonOf(r.month),
      };
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
        // 사건 글(출시 · 품절 · 가격 변동)과 가격 신호 글은 평가 그대로. 나머지는 글 종류를 고른다
        const write = () => { const style = pickStyle(rng, w); const kind = sit === x && x !== 'raise' ? pickKind(krng, kindWeights(style, p, g, x, flags)) : 'eval'; return writePost(rng, p, g, sit, style, r.month, i, undefined, kind, tpl, flags.season, flags.medal, dutyFreeSite); };
        let post = write();
        for (let k = 0; k < 4 && used.has(post.text); k++) post = write(); // 같은 달 같은 문장 피하기
        if (used.has(post.text)) continue;
        if (hidden && post.style === 'whiskybase') continue; // 아래에서 틱의 리뷰로 다시 쓴다
        used.add(post.text);
        all.push(post);
      }
      if (hidden) (r.reviews?.find((v) => v.productId === p.id)?.scores ?? []).forEach((sc, j) => all.push(writePost(rng, p, g, x, 'whiskybase', r.month, 10 + j, sc, pickKind(krng, kindWeights('whiskybase', p, g, x, flags)), tpl, flags.season, flags.medal, dutyFreeSite)));
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
      const reason = win.g.quality - lose.g.quality >= 5 ? COMPARE_REASON.quality : COMPARE_REASON.price; // I2 L3 — 커뮤니티가 본 품질로(공개 판은 참 품질과 같다)
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
      all.push(writePost(rng, p, g, 'forgotten', hidden && style === 'whiskybase' ? 'cafe' : style, last.month, 9)); // 가리는 판: 팔리지 않은 달에는 리뷰 점수가 없다
    }
  }
  // 새 달이 위. 같은 달 안에서는 가격 신호 먼저, 그다음 제품별 첫 글 → 둘째 글 순(한 제품이 목록을 차지하지 않게)
  const rank = (x: FeedPost) => Number(x.id.split(':').at(-1)) || 0;
  return all
    .sort((a, b) => b.month - a.month || Number(!!b.signal) - Number(!!a.signal) || rank(a) - rank(b))
    .slice(0, maxPosts);
}

/** MVP 홈 요약(`FeedCard compact`, 오너 요청 2026-11-14)에 보일 글 수 — 접힌 상태 / "더 보기" */
export const FEED_BRIEF = { shown: 3, more: 8 } as const;

/**
 * 홈 요약에 올릴 글 n개 — `feedFor` 결과에서 **고르기만** 한다(글을 새로 만들지 않는다 → 난수·상태 불변).
 * ① **가장 최근 달의 가격 신호 글**(💡 가격 올릴 여지)을 맨 앞에: 홈에서 바로 쓸 수 있는 신호는 그것 하나다(가격 책상이 바로 위에 있다).
 * ② 나머지는 최근 달부터, 같은 달 안에서는 **아직 안 나온 커뮤니티·제품의 글 먼저**(3개가 같은 카페·같은 제품 글로 차지 않게). 점수가 같으면 피드 순서 그대로
 */
export function briefPosts(posts: readonly FeedPost[], n: number): FeedPost[] {
  const latest = Math.max(-Infinity, ...posts.map((p) => p.month));
  const picked = posts.filter((p) => p.signal === 'raise_price' && p.month === latest);
  const pool = posts.filter((p) => !picked.includes(p));
  while (picked.length < n && pool.length) {
    const month = Math.max(...pool.map((p) => p.month));
    const styles = new Set(picked.map((p) => p.style));
    const products = new Set(picked.map((p) => p.productId));
    let best = -1;
    let bestScore = -1;
    pool.forEach((p, k) => {
      if (p.month !== month) return;
      const score = (styles.has(p.style) ? 0 : 2) + (products.has(p.productId) ? 0 : 1);
      if (score > bestScore) { best = k; bestScore = score; }
    });
    picked.push(pool.splice(best, 1)[0]!);
  }
  return picked.slice(0, n);
}

/**
 * [결정 #400] 여러 달 진행(분기 · 1년) 요약에 넣을 커뮤니티 한 줄 — 넘긴 달들의 피드에서 **고르기만** 한다(새로 만들지 않음 → 난수 · 상태 불변).
 * 화제 글: 가격 신호(💡) → 댓글이 가장 많은 글 → 맨 위 글. 좋음 · 나쁨 = 그 글들의 분위기 수. ARCH 여러 달 요약(TurnBrief)이 읽는다
 */
export function feedDigest(s: GameState, months: number): { top: FeedPost | null; pos: number; neg: number; total: number } {
  const posts = feedFor(s, Math.max(1, months), 200);
  const top = posts.find((p) => p.signal === 'raise_price') ?? [...posts].sort((a, b) => (b.replies?.length ?? 0) - (a.replies?.length ?? 0))[0] ?? null;
  return { top, pos: posts.filter((p) => p.tone === 'pos').length, neg: posts.filter((p) => p.tone === 'neg').length, total: posts.length };
}
