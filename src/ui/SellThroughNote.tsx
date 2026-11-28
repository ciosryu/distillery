import { domesticDemands, SELL_THROUGH_MIN_GAP, SELL_THROUGH_MONTHS, sellOutPrice } from '../sim/market';
import { drainBounds, matchingCaskBottles } from '../sim/pricePolicy';
import { priceModeOf, type GameState, type Product } from '../sim';
import { wonFull } from './format';

// [결정 #424] 판매 화면 「6개월에 다 팔 값 ≈ X」 한 줄 (MKT · T9의 10차 전 최소 몫, `docs/design/mkt-suggested-price.md` §6).
// 권장가(기준가)에는 재고 항이 없어, 재고가 수요보다 크게 적은 고연수 제품은 재고를 비우는 값이 기준가의 2 ~ 4배였다(9차 159개월).
// 셈은 아는 품질 상태(`ks` = knownState)로만 한다(I2). 화면만 — 권장가 · 자동 가격 · 봇은 그대로.
// [10차 70개월 U7 · PM 2026-11-26 · 오너 "다 팔 값은 어딘지 모른다"] 자동 납품 제품에도 보이고, 가격 칸 바로 아래에 눈에 띄게 · 누르면 그 값으로.
// [결정 #441 · PM 2026-11-28] **한 화면 가격표 · 정책 D와 같은 셈**으로 맞췄다 — 같은 이름의 숫자가 두 자리에서 다르면 틀린 신호가 된다.
//   기간 = **6개월 고정**(D를 켠 제품은 이 줄을 숨긴다 — 정책 설명 줄이 D 기간으로 같은 숫자를 말한다).
//   공급 = 자동 납품을 켰으면 **병 + 맞는 원액**(같은 원액을 쓰는 진열 제품 수로 나눔 · `matchingCaskBottles`), 아니면 **병 재고만**.
//   값 = 양쪽으로 찾는다(`sellOutPrice` · 범위 `drainBounds` [이익 나는 바닥, 기준가 × 4]) — 가격표에서 같은 기간 · 같은 공급을 고르면 같은 값이다

export type SellThroughView = {
  /** up = 지금 값보다 높다(공급이 빠듯) · down = 낮다(공급이 넉넉 — 자동 납품 제품에만 보인다) */
  kind: 'up' | 'down';
  price: number;
  /** 공급 병 = 병 재고 + refill */
  supply: number;
  /** 맞는 원액(병, 나눔) — 자동 납품을 끈 제품은 0 */
  refill: number;
  /** 범위 끝 — 'cap' 기준가 × 4에서도 다 팔림 · 'floor' 이익 나는 바닥에서도 남음 */
  edge: 'cap' | 'floor' | null;
  /** edge가 'floor'일 때 바닥 값에서 공급이 몇 개월 가나(계절 없는 어림) */
  coverMonths: number | null;
};

/** 이 제품의 「다 팔 값」 — 보일 것이 없으면 null(지금 값 ±5% 안 · D 제품 · 면세 · 재고 0 · 자동 납품을 끈 제품의 「내릴 값」). ks는 knownState(s) */
export function sellThroughView(s: GameState, ks: GameState, p: Product, monthOfYear: number): SellThroughView | null {
  if (p.dutyFreeOnly || p.stockBottles <= 0 || p.price <= 0 || priceModeOf(p) === 'drain') return null;
  const kp = ks.commerce.products.find((x) => x.id === p.id) ?? p;
  const b = drainBounds(ks, kp);
  if (!b) return null;
  const refill = p.autoRestock ? matchingCaskBottles(s, p) : 0;
  const supply = p.stockBottles + refill;
  const r = sellOutPrice(ks, p.id, monthOfYear, SELL_THROUGH_MONTHS, supply, b.lo, b.hi);
  if (!r) return null;
  const base = { price: r.price, supply, refill, edge: r.at };
  if (r.price >= p.price * SELL_THROUGH_MIN_GAP) return { kind: 'up', ...base, coverMonths: null };
  // 내릴 값은 자동 납품 제품에만 — 손으로 병입하는 제품은 병 재고가 넉넉해도 「값을 내려 비우라」고 보이지 않는다(9차 159 「김포 소주」 재고 5,022)
  if (!p.autoRestock || r.price * SELL_THROUGH_MIN_GAP > p.price) return null;
  let coverMonths: number | null = null;
  if (r.at === 'floor') {
    const t = { ...ks, commerce: { ...ks.commerce, products: ks.commerce.products.map((x) => (x.id === p.id ? { ...x, price: r.price } : x)) } };
    const d = domesticDemands(t, monthOfYear).get(p.id)?.demandBottles ?? 0;
    coverMonths = d > 0 ? supply / d : Infinity;
  }
  return { kind: 'down', ...base, coverMonths };
}

/** 가격 칸 바로 아래 한 줄 — 지금 값으로 6개월 안에 공급이 바닥나는 제품에만. 손 가격 제품은 누르면 그 값으로 바꾼다 */
export function SellThroughNote({ s, ks, p, suggested, monthOfYear, onApply }: { s: GameState; ks: GameState; p: Product; suggested: number | null; monthOfYear: number; onApply?: (price: number) => void }) {
  const v = sellThroughView(s, ks, p, monthOfYear);
  if (!v) return null;
  const what = v.refill > 0 ? `병 + 맞는 원액(약 ${v.supply.toLocaleString()}병)을` : `병 재고(${v.supply.toLocaleString()}병)를`;
  const edge = v.edge === 'cap' ? ' — 기준가 × 4에서도 다 팔린다' : v.edge === 'floor' ? ` — 이익 나는 바닥 값에서도 남는다${v.coverMonths != null && Number.isFinite(v.coverMonths) ? `(약 ${Math.round(v.coverMonths)}개월 치)` : ''}` : '';
  const title = `${v.refill > 0 ? `병 재고 ${p.stockBottles.toLocaleString()}병 + 맞는 원액 약 ${v.refill.toLocaleString()}병(자동 납품이 쓸 수 있는 통 · 탱크 원액 — 같은 원액을 쓰는 진열 제품이 있으면 그 수로 나눠 셈)` : `병 재고 ${p.stockBottles.toLocaleString()}병(자동 납품을 끈 제품은 병만 센다)`}이 앞으로 ${SELL_THROUGH_MONTHS}개월 국내 수요(계절 · 같은 범주 제품과 나눔 포함, 잡음 없는 어림)와 같아지는 출고가. 「한 화면 가격표」에서 같은 기간 · 같은 공급을 고르면 같은 값이고, 자동 가격 D와 같은 셈이다. 아는 품질(리뷰 · 샘플 어림)로 셌고, 다른 제품 값 · 재고는 그대로라고 본다. 수출 · 면세는 빠진다. 이익이 가장 큰 값이 아니다`;
  const tone = v.kind === 'up' ? 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100' : 'border-stone-200 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300';
  return (
    <div className={`mt-0.5 rounded border px-1 py-0.5 text-[11px] ${tone}`} title={title}>
      {what} {SELL_THROUGH_MONTHS}개월에 다 팔 값 ≈ <b className="tabular-nums">{wonFull(v.price)}</b>{suggested ? ` (기준가 ×${(v.price / suggested).toFixed(1)})` : ''}{v.kind === 'down' ? ' — 지금 값보다 낮다(공급이 넉넉)' : ''}{edge} — 어림 · 국내
      {onApply && <button className="ml-1 underline decoration-dotted" onClick={() => onApply(v.price)} aria-label={`${p.name} 다 팔 값으로`}>이 값으로</button>}
    </div>
  );
}
