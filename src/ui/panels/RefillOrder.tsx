// [결정 #393 N1] 리필(한 번 쓴) 버번 배럴 주문 버튼 — 숙성고 탭(PROD)과 MVP 홈 「빈 통 사기」(ARCH 끼움)가 같이 쓴다.
// 왜 좋은지(12년 탄닌)는 말하지 않는다(#367) — 활성도 · 값 · 납기만. ex-버번을 고른 새 판에서만 보인다
import { EMPTY_ACTIVITY_FACTOR } from '../../sim/maturation';
import { CASK_MARKET, CASKS } from '../../sim/content/catalog';
import { cooperageLeadMonths } from '../../sim/prodKnobs';
import { REFILL_NAME, refillBlocker, refillUnitPrice } from '../../sim/actions.prod';
import type { CaskTypeId } from '../../sim/types';
import { useGame } from '../../store/game';
import { won } from '../format';
import { Button } from '../kit';

export function RefillOrderButton({ caskType, qty, disabled }: { caskType: CaskTypeId; qty: number; disabled?: boolean }) {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  if (refillBlocker(s, caskType)) return null;
  const def = CASKS[caskType];
  return (
    <Button small disabled={disabled} onClick={() => dispatch({ type: 'buyCasks', caskType, qty, refill: true })}
      title={`${REFILL_NAME} — 한 번 쓴 통이라 활성도 ${(def.activity * EMPTY_ACTIVITY_FACTOR).toFixed(2)}(새 통 ${def.activity.toFixed(2)}), 새 통 값의 ${Math.round(CASK_MARKET.refill.priceShare * 100)}% · ${cooperageLeadMonths(s)}개월 뒤 도착`}>
      리필(한 번 쓴 통) 주문 {won(refillUnitPrice(s) * qty)}
    </Button>
  );
}
