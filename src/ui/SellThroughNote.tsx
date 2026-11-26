import { domesticDemands, SELL_THROUGH_MIN_GAP, SELL_THROUGH_MONTHS, sellThroughPrice } from '../sim/market';
import { autoRestockSources } from '../sim/economics';
import type { GameState, Product } from '../sim';
import { wonFull } from './format';

// [결정 #424] 판매 화면 「재고를 6개월에 다 팔 값 ≈ X」 한 줄 (MKT · T9의 10차 전 최소 몫, `docs/design/mkt-suggested-price.md` §6).
// 권장가(기준가)에는 재고 항이 없어, 재고가 수요보다 크게 적은 고연수 제품은 재고를 비우는 값이 기준가의 2 ~ 4배였다(9차 159개월).
// 셈은 아는 품질 상태(`ks` = knownState)로만 한다(I2). 화면만 — 권장가 · 자동 가격 · 봇은 그대로.
// [10차 70개월 U7 · PM 2026-11-26 · 오너 "다 팔 값은 어딘지 모른다"] 자동 납품 제품에도 보이고(공급 = 재고 + 채울 원액), 가격 칸 바로 아래에 눈에 띄게 · 누르면 그 값으로

/** 자동 납품이 앞으로 쓸 수 있는 원액을 병으로 — PROD `autoRestockSources`(판매 줄 「채울 원액」과 같은 후보)의 알코올 양 ÷ 병당 알코올. 병 수만 센다(품질 무관) */
export function autoRestockSupplyBottles(s: GameState, p: Product): number {
  const perBottle = p.abv * (p.bottleMl / 1000);
  if (perBottle <= 0) return 0;
  return Math.floor(autoRestockSources(s, p).reduce((t, x) => t + x.lot.volumeL * x.lot.abv, 0) / perBottle);
}

export type SellThroughView =
  | { kind: 'price'; price: number; supply: number; refill: number }
  /** 자동 납품 제품인데 공급(재고 + 채울 원액)이 지금 값의 6개월 수요보다 많다 — 비우는 값이 지금 값보다 낮다. 줄이 사라지면 오너가 까닭을 모른다(10차 U7) */
  | { kind: 'ample'; months: number; supply: number; refill: number };

/** 이 제품의 「다 팔 값」 — 보일 것이 없으면 null. 자동 납품을 켰으면 공급 = 지금 재고 + 채울 원액. ks는 knownState(s) */
export function sellThroughView(s: GameState, ks: GameState, p: Product, monthOfYear: number): SellThroughView | null {
  if (p.dutyFreeOnly || p.stockBottles <= 0) return null;
  const refill = p.autoRestock ? autoRestockSupplyBottles(s, p) : 0;
  const supply = p.stockBottles + refill;
  const x = sellThroughPrice(ks, p.id, monthOfYear, SELL_THROUGH_MONTHS, supply);
  if (x != null && x >= p.price * SELL_THROUGH_MIN_GAP) return { kind: 'price', price: x, supply, refill };
  if (!p.autoRestock || x != null) return null;
  const perMonth = domesticDemands(ks, monthOfYear).get(p.id)?.demandBottles ?? 0;
  return perMonth > 0 ? { kind: 'ample', months: supply / perMonth, supply, refill } : null;
}

/** 가격 칸 바로 아래 한 줄 — 지금 값으로 6개월 안에 공급이 바닥나는 제품에만. 손 가격 제품은 누르면 그 값으로 바꾼다 */
export function SellThroughNote({ s, ks, p, suggested, monthOfYear, onApply }: { s: GameState; ks: GameState; p: Product; suggested: number | null; monthOfYear: number; onApply?: (price: number) => void }) {
  const v = sellThroughView(s, ks, p, monthOfYear);
  if (!v) return null;
  if (v.kind === 'ample') {
    return (
      <div className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400" title={`지금 재고 ${p.stockBottles.toLocaleString()}병 + 자동 납품이 채울 원액 약 ${v.refill.toLocaleString()}병(지금 쓸 수 있는 통 · 탱크 원액 — 다른 제품과 나눠 쓸 수 있다)이 지금 값의 국내 수요로 약 ${Math.round(v.months)}개월 치다. 공급이 모자라지 않아 「다 팔 값」은 지금 값보다 낮다 — 값은 이익(가격 비교 표)으로 정한다. 어림 · 아는 품질`}>
        재고 + 채울 원액 약 {v.months >= 60 ? '5년 치 넘게' : `${Math.round(v.months)}개월 치`} — 공급이 넉넉해 「다 팔 값」은 지금 값보다 낮다
      </div>
    );
  }
  const what = v.refill > 0 ? `재고 + 채울 원액(약 ${v.refill.toLocaleString()}병)을` : '재고를';
  const title = `${v.refill > 0 ? `지금 재고 ${p.stockBottles.toLocaleString()}병 + 자동 납품이 채울 원액 약 ${v.refill.toLocaleString()}병(지금 쓸 수 있는 통 · 탱크 원액 — 다른 제품과 나눠 쓸 수 있다)` : `지금 재고 ${p.stockBottles.toLocaleString()}병`}이 앞으로 ${SELL_THROUGH_MONTHS}개월 국내 수요(계절 · 같은 범주 제품과 나눔 포함, 잡음 없는 어림)와 같아지는 출고가. 아는 품질(리뷰 · 샘플 어림)로 셌고, 다른 제품 값 · 재고는 그대로라고 본다. 수출 · 면세는 빠진다. 이익이 가장 큰 값이 아니다 — 값을 올리면 판매 속도가 느려진다. 피드의 가성비 평은 나빠질 수 있다`;
  return (
    <div className="mt-0.5 rounded border border-sky-300 bg-sky-50 px-1 py-0.5 text-[11px] text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100" title={title}>
      {what} {SELL_THROUGH_MONTHS}개월에 다 팔 값 ≈ <b className="tabular-nums">{wonFull(v.price)}</b>{suggested ? ` (기준가 ×${(v.price / suggested).toFixed(1)})` : ''} — 어림 · 국내
      {onApply && <button className="ml-1 underline decoration-dotted" onClick={() => onApply(v.price)} aria-label={`${p.name} 다 팔 값으로`}>이 값으로</button>}
    </div>
  );
}
