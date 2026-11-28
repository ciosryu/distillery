// 자동 가격 3정책 (AUTO-PRICE-3) — 결정 #291 · #288 · REQ-MKT-9 (docs/design/mkt-stage-t.md 「AUTO-PRICE-3」 · architecture.md §10.9)
// MKT 몫 = 정책마다 "이번 달 이 제품의 값"을 정하는 순수 함수. 그릇(Product.pricePolicy)·명령(setPricePolicy)·틱 연결·형제 공유 스냅샷(S6)·
// 사유 기록 저장(priceLog)은 ARCH 엔진 몫이다 — 엔진은 판매 전 진열 스냅샷 s로 decidePolicyPrice를 부르고, 돌려받은 값·배수·사유를 적용한다.
//   A 현금회전(turnover) = 지금 자동 가격 #200 그대로(이번 달 진열 공헌 최대 — bestAutoPrice)
//   B 이익 극대화(profit) = 다기간 공헌 최대(지평 h = 3개월) + 한 달 한 단계 가드(기준 = lastFactor)
//   C 프리미엄 유지(premium) = 목표 배수 유지(기본 n = 1.3), 분기 경계에서만 맞춘다. 적체면 분기에 한 단계 내림, 판매 0이 3개월이면 하한을 낮춘다
//   D 원액 소화(drain, [결정 #441]) = 공급(병 재고 + 표기에 맞는 통 원액, 같은 원액을 쓰는 제품 수로 나눔)이 기간 H(기본 12개월)에 팔리는 값 + 한 달 한 단계 가드
// 모든 배수는 기준가(currentSuggested — 권장가 식 그대로) 대비 한 가지 뜻이다(PROD AP3-PROD-1, P-PROD-53). 값은 100원 단위로 반올림한다(#200과 같다)
import { AUTO_PRICE_FACTORS, autoRestockSources, bestAutoPrice, currentSuggested } from './economics';
import { bottleMargin, knownState, priceOptions, sellOutPrice, STOCKOUT_LOOKBACK_MONTHS } from './market';
import { outboundLogistics } from './sites';
import { DEFAULT_POLICY_N, defaultPolicyPrice } from './content/market';
import type { GameState, Product } from './types';

export type PriceMode = 'turnover' | 'profit' | 'premium' | 'drain';

/** 정책 그릇의 값(ARCH §10.9 ① (b) 안과 같은 모양 — 코어 타입이 들어오면 그쪽을 쓴다) */
export interface PolicySpec {
  mode: PriceMode;
  /** C의 목표 배수(기준가 대비). 없으면 n */
  target?: number;
  /** 범위(기준가 배수) — 없으면 [0.6, 2](지금 자동 가격 후보 범위) */
  min?: number;
  max?: number;
  /** 정책이 마지막으로 정한 배수 — 가드 기준(재고 보충으로 값이 기준가로 돌아간 달에도 흔들리지 않게, MKT 0a182d1) */
  lastFactor?: number;
  /** D의 기간(개월) — 없으면 PRICE_POLICY.drainHorizon */
  horizon?: number;
}

/** 정책 결정 — price가 null이면 값을 바꾸지 않는다(why에 이유) */
export interface PolicyDecision {
  price: number | null;
  /** 고른 값의 기준가 배수 — 엔진이 lastFactor로 저장한다(값을 안 바꾸면 null) */
  factor: number | null;
  /** 사유 한 줄(priceLog) */
  why: string;
}

/** 손잡이 — 모두 `[튜닝]`(결정 #291: 구조만 확정, 수치는 단계 T) */
export const PRICE_POLICY = {
  /** 세 정책 공통 시작 배수 = C 기본 목표(P-PROD-53) — 한 곳(content/market.ts DEFAULT_POLICY_N) */
  n: DEFAULT_POLICY_N,
  /** B 지평(개월) — 2차 측정에서 3이 가장 고르다(6은 현금 부족에서, 12는 거의 모든 조건에서 무너짐) */
  profitHorizon: 3,
  /** 한 단계(배수) */
  step: 0.1,
  /** 범위 기본값 */
  min: 0.6,
  max: 2,
  /** C: 적체 판정(재고 ÷ 판매 EMA, 개월) · 하한(목표 배수의 비율) · 판매 0 고착 */
  premiumOverstockMonths: 9,
  premiumFloor: 0.9,
  premiumStuckFloor: 0.8,
  premiumStuckMonths: 3,
  /** D: 기간 고르기 · 기본(12 — 6은 원액이 계속 들어오는 소주에서 너무 높게 나와 흔들린다, mkt-pricing-postrun §6.7) · 범위(D만 상한 ×4 — 원액이 없을 때 ×2 위로 가는 것이 D의 뜻, 153 세이브 시그니처 블랜드 ×3.62) */
  drainHorizons: [6, 12, 24, 36] as readonly number[],
  drainHorizon: 12,
  drainMin: 0.6,
  drainMax: 4,
} as const;

/** 정책별 가드(공통 가드 장치의 값 — ARCH §10.9 ⑥3): A 없음(#200 그대로) · B 한 달 한 단계 · C는 분기 한 단계(내림만, premiumTarget 안에서) */
export const POLICY_GUARD: Record<PriceMode, { step: number; period: 'month' | 'quarter' } | null> = {
  turnover: null,
  profit: { step: PRICE_POLICY.step, period: 'month' },
  premium: { step: PRICE_POLICY.step, period: 'quarter' },
  drain: { step: PRICE_POLICY.step, period: 'month' },
};

const round100 = (v: number) => Math.max(100, Math.round(v / 100) * 100);
const fx = (f: number) => `×${f.toFixed(2)}`;
/** 재고 개월 — 판매 EMA가 아직 없으면 0(적체 아님). retail.overhangFactor와 같은 잣대 */
export const stockMonths = (p: Pick<Product, 'stockBottles' | 'salesEma'>) => (p.salesEma == null ? 0 : p.stockBottles / Math.max(1, p.salesEma));
/** 병당 공헌 > 0 */
const profitable = (s: GameState, p: Product, price: number) => bottleMargin({ ...p, price }, outboundLogistics(s)).perBottle > 0;
/** 최근 국내 판매가 0인 달이 몇 달 이어졌나(지난 결산부터 거꾸로, 최대 limit) */
export function zeroSalesRun(s: GameState, productId: string, limit = 12): number {
  let n = 0;
  for (const r of [...s.history.reports].reverse().slice(0, limit)) {
    const sold = r.sales.filter((x) => x.productId === productId).reduce((t, x) => t + x.bottles, 0);
    if (sold > 0) break;
    n++;
  }
  return n;
}

/**
 * [결정 #441] D의 「맞는 원액」(병) — 자동 납품이 이 제품에 쓸 수 있는 원액(`autoRestockSources` — 표기 · 레시피 · 스타일이 맞는 통 · 탱크, 자동 납품을 켜지 않아도)을 병으로 바꾼 값.
 * **같은 원액을 쓸 수 있는 다른 진열 제품이 있으면 그 수로 나눈다**(겹쳐 세지 않게 — 단순한 안, PROD 자동 납품 우선순위와 맞추는 것은 뒤). 「진열 제품」 = 재고가 있거나
 * 최근 6개월(`STOCKOUT_LOOKBACK_MONTHS` — T8과 같은 잣대) 안에 판 제품 · 면세 전용 제외. 원액 양은 보이는 값이라 품질을 읽지 않는다(I2)
 */
export function matchingCaskBottles(s: GameState, p: Product): number {
  const perBottle = p.abv * (p.bottleMl / 1000);
  if (perBottle <= 0) return 0;
  const mine = autoRestockSources(s, p);
  if (!mine.length) return 0;
  const key = (x: { comp: { source: string; id: string } }) => `${x.comp.source}:${x.comp.id}`;
  const sold = new Set(s.history.reports.slice(-STOCKOUT_LOOKBACK_MONTHS).flatMap((r) => r.sales.filter((x) => x.bottles > 0).map((x) => x.productId)));
  const users = new Map<string, number>();
  for (const x of s.commerce.products) {
    if (x.id === p.id || x.dutyFreeOnly || (x.stockBottles <= 0 && !sold.has(x.id))) continue;
    for (const y of autoRestockSources(s, x)) users.set(key(y), (users.get(key(y)) ?? 0) + 1);
  }
  return Math.floor(mine.reduce((t, x) => t + (x.lot.volumeL * x.lot.abv) / (1 + (users.get(key(x)) ?? 0)), 0) / perBottle);
}

/** D의 바닥 배수 — drainMin과 「병당 공헌 > 0」 중 높은 쪽(0.05 간격으로 찾는다, drainMax까지). 없으면 null */
function drainFloor(s: GameState, p: Product, sug: number): number | null {
  for (let f: number = PRICE_POLICY.drainMin; f <= PRICE_POLICY.drainMax + 1e-9; f += 0.05) if (profitable(s, p, round100(sug * f))) return f;
  return null;
}
/** D가 값을 찾는 범위(원) — [바닥, 기준가 × drainMax]. 한 화면 가격표도 같은 범위로 찾는다(같은 숫자). 기준가 · 이익 나는 값이 없으면 null */
export function drainBounds(s: GameState, p: Product): { lo: number; hi: number } | null {
  const sug = currentSuggested(s, p);
  if (sug <= 0) return null;
  const floor = drainFloor(s, p, sug);
  return floor == null ? null : { lo: sug * floor, hi: sug * PRICE_POLICY.drainMax };
}

/**
 * D 원액 소화(가드 전) — 공급(병 재고 + 맞는 원액)이 기간 H에 국내에서 팔리는 값(아는 품질 · `sellOutPrice` — 한 화면 가격표와 같은 셈).
 * 범위는 D 기본 [바닥, drainMax](플레이어 범위 칸을 쓰지 않는다). 재고 0이면 null(진열에 없으면 팔 수 없다)
 */
export function drainTarget(s: GameState, p: Product, monthOfYear: number, horizon: number = PRICE_POLICY.drainHorizon): { price: number; factor: number; at: 'cap' | 'floor' | null; stock: number; cask: number } | null {
  if (p.dutyFreeOnly || p.stockBottles <= 0 || p.price <= 0) return null;
  const sug = currentSuggested(s, p);
  const b = drainBounds(s, p);
  if (sug <= 0 || b == null) return null;
  const cask = matchingCaskBottles(s, p);
  const r = sellOutPrice(knownState(s), p.id, monthOfYear, horizon, p.stockBottles + cask, b.lo, b.hi);
  if (!r) return null;
  return { price: r.price, factor: r.price / sug, at: r.at, stock: p.stockBottles, cask };
}

/** A 현금회전 — #200 그대로 */
export function turnoverTarget(s: GameState, p: Product, monthOfYear: number): { price: number | null; why: string } {
  const v = bestAutoPrice(s, p, monthOfYear);
  return { price: v, why: v == null ? '현금회전 — 이익 나는 값이 없어 그대로' : '현금회전 — 이번 달 진열 공헌 최대' };
}

/**
 * B 이익 극대화(가드 전) — 후보 격자(기준가 × 0.6~2)마다 h개월 누적 공헌이 가장 큰 값.
 * 팔 수 있는 양 = 재고 + 판매 EMA × h(지금 판매 속도로 보충된다고 본다 — 리드타임 근사), 형제 공헌 변화 × h를 더한다(엣지 ③ 형제 잠식).
 * h개월 동안 형제 값이 그대로라고 가정한다(근사 — architecture §10.9 ⑥2)
 */
export function profitTarget(s: GameState, p: Product, monthOfYear: number, h: number = PRICE_POLICY.profitHorizon): number | null {
  if (p.dutyFreeOnly || p.stockBottles <= 0 || p.price <= 0) return null;
  const sug = currentSuggested(s, p);
  if (sug <= 0) return null;
  const opts = priceOptions(s, p, monthOfYear, AUTO_PRICE_FACTORS.map((f) => (sug * f) / p.price));
  const logistics = outboundLogistics(s);
  let best: { price: number; v: number } | null = null;
  for (const o of opts) {
    const per = bottleMargin({ ...p, price: o.price }, logistics).perBottle;
    if (per <= 0) continue;
    const v = Math.min(p.stockBottles + (p.salesEma ?? 0) * h, o.demandBottles * h) * per + (o.lineupContribution - o.contribution) * h;
    if (!best || v > best.v) best = { price: o.price, v };
  }
  return best?.price ?? null;
}

/** 가드 — lastFactor(없으면 지금 배수)에서 ±step 안으로 자른다 */
export function guardFactor(target: number, base: number, step: number): number {
  return Math.min(base + step, Math.max(base - step, target));
}

/**
 * 이번 달 이 제품의 값 — 정책 → (B) 한 달 가드 → 범위 → 병당 공헌 > 0.
 * s는 판매 전 진열 스냅샷(형제 동시 결정 — 엔진이 같은 s를 모든 제품에 준다). 면세 한정판·재고 0은 바꾸지 않는다
 */
export function decidePolicyPrice(s: GameState, p: Product, spec: PolicySpec, monthOfYear: number): PolicyDecision {
  if (p.dutyFreeOnly) return { price: null, factor: null, why: '면세 한정판 — 정책 없음' };
  if (p.stockBottles <= 0 || p.price <= 0) return { price: null, factor: null, why: '재고 없음 — 그대로' };
  const sug = currentSuggested(s, p);
  if (sug <= 0) return { price: null, factor: null, why: '기준가 없음 — 그대로' };
  // D는 플레이어 범위 칸을 쓰지 않는다 — 다른 정책에서 남은 min/max가 그릇에 있어도 D 기본 범위(바닥은 drainTarget이 공헌 > 0으로 올린다)
  const min = spec.mode === 'drain' ? PRICE_POLICY.drainMin : spec.min ?? PRICE_POLICY.min, max = spec.mode === 'drain' ? PRICE_POLICY.drainMax : spec.max ?? PRICE_POLICY.max;
  if (min > max) return { price: null, factor: null, why: `범위가 틀렸다(${fx(min)} > ${fx(max)}) — 그대로` };
  const now = p.price / sug;
  const base = spec.lastFactor ?? now;
  let factor: number;
  let why: string;

  if (spec.mode === 'turnover') {
    const t = turnoverTarget(s, p, monthOfYear);
    if (t.price == null) return { price: null, factor: null, why: t.why };
    // 범위를 따로 정하지 않았으면 #200과 바이트까지 같게 그 값을 그대로 쓴다(후보에 지금 값이 끼어 있어 [0.6, 2] 밖일 수 있다 — 지금 동작)
    if (spec.min == null && spec.max == null) return { price: t.price, factor: t.price / sug, why: t.why };
    factor = t.price / sug;
    why = t.why;
  } else if (spec.mode === 'profit') {
    const v = profitTarget(s, p, monthOfYear);
    if (v == null) return { price: null, factor: null, why: '이익 — 이익 나는 값이 없어 그대로' };
    const want = v / sug;
    factor = guardFactor(want, base, POLICY_GUARD.profit!.step);
    why = Math.abs(factor - want) > 1e-9 ? `이익 — ${PRICE_POLICY.profitHorizon}개월 이익 최대 ${fx(want)}, 가드로 한 단계(${fx(factor)})` : `이익 — ${PRICE_POLICY.profitHorizon}개월 이익 최대 ${fx(want)}`;
  } else if (spec.mode === 'drain') {
    const h = spec.horizon ?? PRICE_POLICY.drainHorizon;
    const d = drainTarget(s, p, monthOfYear, h);
    if (d == null) return { price: null, factor: null, why: '원액 소화 — 이익 나는 값이 없어 그대로' };
    const want = d.factor;
    factor = guardFactor(want, base, POLICY_GUARD.drain!.step);
    const edge = d.at === 'cap' ? ` — 상한 ${fx(PRICE_POLICY.drainMax)}에서도 다 팔린다` : d.at === 'floor' ? ' — 바닥 값에서도 남는다' : '';
    const what = `원액 소화 — 병 ${d.stock.toLocaleString()} + 맞는 원액 ${d.cask.toLocaleString()}병을 ${h}개월에 팔 값 ${fx(want)}${edge}`;
    why = Math.abs(factor - want) > 1e-9 ? `${what}, 가드로 한 단계(${fx(factor)})` : what;
  } else {
    const target = Math.min(max, Math.max(min, spec.target ?? PRICE_POLICY.n));
    const quarter = s.month % 3 === 0;
    // 처음 켠 달은 바로 목표로. 그 뒤로는 분기 경계에서만 맞춘다(기준가가 바뀌어도 다음 분기까지 원 단위 값 유지 — 엣지 ⑨)
    if (spec.lastFactor != null && !quarter) return { price: null, factor: null, why: `가격 유지 ${fx(spec.lastFactor)} — 분기 경계까지 그대로` };
    const stuck = zeroSalesRun(s, p.id) >= PRICE_POLICY.premiumStuckMonths;
    const overstock = stockMonths(p) > PRICE_POLICY.premiumOverstockMonths;
    if (spec.lastFactor != null && (overstock || stuck)) {
      const floor = target * (stuck ? PRICE_POLICY.premiumStuckFloor : PRICE_POLICY.premiumFloor);
      factor = Math.max(floor, base - POLICY_GUARD.premium!.step);
      why = stuck ? `가격 유지 — 국내 판매 0이 ${PRICE_POLICY.premiumStuckMonths}개월, 분기 한 단계 내림 ${fx(factor)}` : `가격 유지 — 재고 ${stockMonths(p).toFixed(0)}개월치 > ${PRICE_POLICY.premiumOverstockMonths}, 분기 한 단계 내림 ${fx(factor)}`;
    } else {
      factor = target;
      why = `가격 유지 ${fx(target)}`;
    }
  }

  // 범위 — 공통 가드(마지막에 자른다)
  const clamped = Math.min(max, Math.max(min, factor));
  if (Math.abs(clamped - factor) > 1e-9) why += ` · 범위 ${clamped > factor ? '하한' : '상한'} ${fx(clamped)}으로 자름`;
  const price = round100(sug * clamped);
  if (!profitable(s, p, price)) return { price: null, factor: null, why: `${why} — 범위 안에 이익 나는 값이 없다(범위나 원가를 보세요), 그대로` };
  return { price, factor: price / sug, why };
}

// ── 화면용 추정 (결정 #291 ④·⑥ · architecture §10.9 ③) — 판정에 쓰지 않는 정보값(등급 E 추정) ──

/** 이 제품을 값 v로 팔 때 이번 달 국내 판매(병)·진열 전체 공헌 — priceOptions 한 줄 */
function optionAt(s: GameState, p: Product, monthOfYear: number, v: number) {
  return priceOptions(s, p, monthOfYear, [v / p.price])[0]!;
}

/**
 * C(가격 유지)의 대가 한 줄 — 목표 배수 target으로 팔면 A(이번 달 진열 공헌 최대) 대비 이번 달 국내 판매가 몇 % 달라지나.
 * A 값이 없거나(이익 나는 값 없음) 재고가 없으면 null
 */
export function premiumCost(s: GameState, p: Product, target: number, monthOfYear: number): { pct: number; price: number; aPrice: number } | null {
  if (p.dutyFreeOnly || p.stockBottles <= 0 || p.price <= 0) return null;
  const sug = currentSuggested(s, p);
  const a = bestAutoPrice(s, p, monthOfYear);
  if (sug <= 0 || a == null) return null;
  const price = round100(sug * target);
  const at = optionAt(s, p, monthOfYear, price).sellBottles, base = optionAt(s, p, monthOfYear, a).sellBottles;
  return { pct: base > 0 ? at / base - 1 : 0, price, aPrice: a };
}

/**
 * 현금 위기 배너의 정보 한 줄(#291 ⑥ — 자동 전환 없음) — B·C로 둔 제품을 A로 바꾸면 이번 달 진열 공헌이 얼마나 느나(제품마다 따로 바꿔 본 합, 형제 상호작용은 근사).
 * 이번 달 이익만 본다 — 다음 달 이후 이익은 줄 수 있다. B·C 제품이 없거나 늘지 않으면 null
 */
export function switchToTurnoverGain(s: GameState, monthOfYear: number, modeOf: (p: Product) => PriceMode | null): { gain: number; products: number } | null {
  let gain = 0, products = 0;
  for (const p of s.commerce.products) {
    const m = modeOf(p);
    if (m !== 'profit' && m !== 'premium') continue;
    const a = bestAutoPrice(s, p, monthOfYear);
    if (a == null || a === p.price) continue;
    const d = optionAt(s, p, monthOfYear, a).lineupContribution - optionAt(s, p, monthOfYear, p.price).lineupContribution;
    if (d > 0) { gain += d; products++; }
  }
  return products ? { gain: Math.round(gain), products } : null;
}

/** 정책 고를 때 둘째 안내의 문턱(개월) — `[가설]`(P-MGT-43 · PROD 공급 지평 #407) */
export const SUPPLY_HINT_MONTHS = 12;
/**
 * 정책 고를 때 둘째 안내 (P-MGT-43 · PROD P-PROD-54, 조건 방향은 PROD 정정 2026-11-12):
 *  - 'refill' — 위스키인데 SUPPLY_HINT_MONTHS 안에 보충할 통이 없고(refillGap) 지금 물량도 그 안에 바닥난다 → 이익(B)·가격 유지(C)가 어울린다. A·끔일 때만
 *  - 'overstock' — 재고 + 지금 채울 병이 판매 속도로 SUPPLY_HINT_MONTHS개월치를 넘는다(적체) → 현금회전(A)이 어울린다. B·C일 때만
 * 판매가 0이면(months = Infinity) 적체로 보지 않는다(판단할 판매 속도가 없다)
 */
export function supplyHintOf(mode: PriceMode | null, h: { months: number; refillGap: boolean }): 'refill' | 'overstock' | null {
  const bc = mode === 'profit' || mode === 'premium';
  if (!bc && h.refillGap && h.months < SUPPLY_HINT_MONTHS) return 'refill';
  if (bc && Number.isFinite(h.months) && h.months > SUPPLY_HINT_MONTHS) return 'overstock';
  return null;
}

/**
 * 자동 가격 A(현금회전)를 켤 때 첫 출고가 되돌리기 ([결정 #304] = P-MKT-34 (나), PROD 합의) — 값이 아직 첫 출고가(그달 기준가 × n) 그대로면 기준가로.
 * 자동 가격 후보에는 지금 값이 들어가므로(bestAutoPrice), ×n에서 출발하면 그 값에 머무는 경로가 생기고 수출 FOB(= 출고가 × 배수)가 깎였다
 * (P8 X0 −1.65억). 손으로 정한 값, 병입 뒤 기준가가 움직여 첫 값과 다른 값은 두고, 이미 켜져 있으면 아무것도 하지 않는다
 */
export function resetFirstPriceOnAuto(p: { price: number; autoPrice?: boolean; dutyFreeOnly?: boolean }, base: number): number | null {
  if (p.autoPrice || p.dutyFreeOnly || p.price !== defaultPolicyPrice(base)) return null;
  const before = p.price;
  p.price = base;
  return before; // 되돌리기 전 값(첫 출고가) — 안 되돌렸으면 null. 켤 때 메시지에 쓴다(PROD)
}
