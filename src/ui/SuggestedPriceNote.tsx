import { bestAutoPrice } from '../sim/economics';
import type { GameState, Product } from '../sim';

// 권장가 표시의 정직성 ([결정 #283], 파트 MKT — 판매 화면은 PROD 임시 소유라 Sales.tsx에서 PROD 대행으로 부른다).
// 권장가는 품질·숙성·주세 경감으로 정한 기준가이지 이익 최대가가 아니다(진단: 권장가에 머문 판은 자동 가격의 49~63%, 권장가 × 1.3은 110~122%).
// 그래서 권장가 옆에 이번 달 가격표(priceOptions)에서 국내 진열 공헌이 가장 큰 값이 권장가의 몇 배인지 함께 보인다. 재고 0·면세 한정판은 보이지 않는다. 규칙·출력 불변

/** 권장가 옆 한 줄 — 가격표 최선(자동 가격과 같은 기준, economics.bestAutoPrice)이 권장가의 몇 배인지 */
export function SuggestedPriceNote({ s, p, suggested }: { s: GameState; p: Product; suggested: number | null }) {
  if (suggested == null || suggested <= 0 || p.stockBottles <= 0 || p.dutyFreeOnly) return null;
  const best = bestAutoPrice(s, p);
  if (best == null) return null;
  const k = best / suggested;
  return (
    <div className="text-[11px] text-stone-500 dark:text-stone-400" title="권장가 = 기준 소비자가 × √(품질/60) × 숙성 인식에 맞춘 출고가 — 이익을 최대로 하는 값이 아니다. 가격표의 초록 줄(진열 공헌 최대)은 재고·같은 주종 제품에 따라 달마다 달라진다. 국내 판매 기준(수출가는 수출 탭의 배수)">
      권장가는 이익 기준 아님 — 이번 달 가격표 최선 ×{k.toFixed(2)}(국내)
    </div>
  );
}
