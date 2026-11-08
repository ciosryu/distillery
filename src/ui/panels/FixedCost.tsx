import { marketingOutlook, monthlyFixedBreakdown, recentHouseRevenue } from '../../sim/loans';
import type { GameState } from '../../sim';
import { useGame } from '../../store/game';
import { useUi } from '../../store/ui';
import { won } from '../format';
import { Button, NumberField } from '../kit';

// 매달 나가는 돈 (#181 안 A, 1차 MVP 플레이테스트 대응) — 월 고정비 예상의 내역 + 바로 조절할 수 있는 마케팅 예산. 규칙은 바꾸지 않는다

export function FixedCostLine() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const setTab = useUi((u) => u.setTab);
  const parts = monthlyFixedBreakdown(s);
  const total = parts.reduce((t, p) => t + p.amount, 0);
  return (
    <div className="mt-3 rounded-md border border-stone-200 px-3 py-2 text-sm dark:border-stone-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">매달 나가는 돈 {won(total)}</span>
        {parts.map((p) => <span key={p.id} className="text-stone-600 dark:text-stone-400">{p.label} {won(p.amount)}</span>)}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <span>마케팅 예산(월)</span>
        <NumberField value={s.commerce.marketingBudget / 10_000} min={0} max={100_000} width="w-24" suffix="만 원" onCommit={(v) => dispatch({ type: 'setMarketing', amount: v * 10_000 })} />
        <span>— 대출은 일부 상환으로 월 납부를 줄일 수 있다</span>
        <Button small variant="ghost" onClick={() => setTab('finance')}>대출 보기</Button>
      </div>
      <MarketingOutlookLine s={s} />
    </div>
  );
}

/** 이 값 이하(100만 원 미만)면 빨강 — mvp.md §7.6: 관리비 300만(#190)에서 0원은 20/20 파산, 100만은 목표 19/20 [튜닝] */
const LOW_MARKETING = 999_999;
/** 낮을 때 비교하는 예산 = 새 게임 기본값 */
const REF_MARKETING = 3_000_000;

// 마케팅 예산의 앞날 (P-MGT-12) — 줄여서 아끼는 돈과 3년 뒤 덜 팔리는 몫을 나란히 보인다. 규칙은 바꾸지 않는다
function MarketingOutlookLine({ s }: { s: GameState }) {
  const budget = s.commerce.marketingBudget;
  const cur = marketingOutlook(s, budget);
  const rev12 = recentHouseRevenue(s, 12);
  const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
  if (budget <= LOW_MARKETING) {
    const ref = marketingOutlook(s, REF_MARKETING);
    const less = Math.round((1 - cur.demandMul / ref.demandMul) * 100);
    return (
      <div className="mt-1 text-xs text-red-700 dark:text-red-400">
        마케팅이 거의 없다 — 3년 뒤 인지도(추정) {pct(cur.awareness)}, 월 {won(REF_MARKETING)}이면 {pct(ref.awareness)} → 수요가 <b>{less}% 적다</b>(지금 {pct(cur.awarenessNow)}).
        아끼는 돈은 연 {won((REF_MARKETING - budget) * 12)}{rev12 > 0 ? `, 지난 12개월 매출 기준 덜 팔리는 몫은 연 약 ${won(rev12 * (ref.demandMul - cur.demandMul))}(위스키가 늘면 더 크다)` : ''}.
        MVP 실험에서 마케팅 0원은 모두 파산했다
      </div>
    );
  }
  const zero = marketingOutlook(s, 0);
  const less = Math.round((1 - zero.demandMul / cur.demandMul) * 100);
  return (
    <div className="mt-1 text-xs text-stone-500">
      3년 뒤 인지도(추정, 지금 {pct(cur.awarenessNow)}): 이 예산이면 {pct(cur.awareness)}, 0원이면 {pct(zero.awareness)} — 수요는 인지도에 비례, 0원이면 {less}% 적다.
      0원으로 아끼는 돈 연 {won(budget * 12)}{rev12 > 0 ? ` · 지난 12개월 매출 기준 덜 팔리는 몫 연 약 ${won(rev12 * (cur.demandMul - zero.demandMul))}(위스키가 늘면 더 크다)` : ''}
    </div>
  );
}
