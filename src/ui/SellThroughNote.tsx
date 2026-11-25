import { SELL_THROUGH_MIN_GAP, SELL_THROUGH_MONTHS, sellThroughPrice } from '../sim/market';
import type { GameState, Product } from '../sim';
import { wonFull } from './format';

// [결정 #424] 판매 화면 「재고를 6개월에 다 팔 값 ≈ X」 한 줄 (MKT · T9의 10차 전 최소 몫, `docs/design/mkt-suggested-price.md` §6).
// 권장가(기준가)에는 재고 항이 없어, 재고가 수요보다 크게 적은 고연수 제품은 재고를 비우는 값이 기준가의 2 ~ 4배였다(9차 159개월).
// 셈은 아는 품질 상태(`ks` = knownState)로만 한다(I2). 화면만 — 권장가 · 자동 가격 · 봇은 그대로

/** 지금 값으로 6개월 안에 재고가 바닥나는 제품에만 보이는 한 줄. 자동 납품을 켠 제품은 매달 다시 채워져 「지금 재고」가 한도가 아니라 보이지 않는다. ks는 knownState(s) */
export function SellThroughNote({ ks, p, suggested, monthOfYear }: { ks: GameState; p: Product; suggested: number | null; monthOfYear: number }) {
  if (p.dutyFreeOnly || p.stockBottles <= 0 || p.autoRestock) return null;
  const x = sellThroughPrice(ks, p.id, monthOfYear);
  if (x == null || x < p.price * SELL_THROUGH_MIN_GAP) return null;
  return (
    <div className="text-[11px] text-stone-500 dark:text-stone-400" title={`지금 재고 ${p.stockBottles.toLocaleString()}병이 앞으로 ${SELL_THROUGH_MONTHS}개월 국내 수요(계절 · 같은 범주 제품과 나눔 포함, 잡음 없는 어림)와 같아지는 출고가. 아는 품질(리뷰 · 샘플 어림)로 셌고, 다른 제품 값 · 재고는 그대로라고 본다. 수출 · 면세는 빠진다. 이익이 가장 큰 값이 아니다 — 값을 올리면 판매 속도가 느려진다. 피드의 가성비 평은 나빠질 수 있다`}>
      재고를 {SELL_THROUGH_MONTHS}개월에 다 팔 값 ≈ {wonFull(x)}{suggested ? ` (기준가 ×${(x / suggested).toFixed(1)})` : ''} — 어림 · 국내
    </div>
  );
}
