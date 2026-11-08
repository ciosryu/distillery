import { salaryRaiseSinceStart } from '../../sim/hr';
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
  // P-MGT-15 — HR이 잠긴 판(MVP)에서 급여가 저절로 오른 몫 (mvp.md §7.8: 3차 판 6년간 +19%)
  const raise = salaryRaiseSinceStart(s);
  const raised = raise && raise.now - raise.start >= 10_000 ? raise.now - raise.start : 0;
  return (
    <div className="mt-3 rounded-md border border-stone-200 px-3 py-2 text-sm dark:border-stone-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">매달 나가는 돈 {won(total)}</span>
        {parts.map((p) => (
          <span key={p.id} className="text-stone-600 dark:text-stone-400" title={p.id === 'salaries' && raised ? '직원 레벨이 오를 때마다 급여가 5%씩 오른다. MVP에서는 직원을 바꿀 수 없어 조절할 수 없다' : undefined}>
            {p.label} {won(p.amount)}{p.id === 'salaries' && raised > 0 && <span className="text-amber-800 dark:text-amber-300"> (시작보다 +{won(raised)} — 레벨이 오를 때마다 5%)</span>}
          </span>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <span>마케팅 예산(월)</span>
        <NumberField value={s.commerce.marketingBudget / 10_000} min={0} max={100_000} width="w-24" suffix="만 원" onCommit={(v) => dispatch({ type: 'setMarketing', amount: v * 10_000 })} />
        <span>— 대출은 일부 상환으로 월 납부를 줄일 수 있다</span>
        <Button small variant="ghost" onClick={() => setTab('finance')}>대출 보기</Button>
      </div>
      {/* 현금 부족 중엔 일부 상환이 지금 현금을 더 줄인다 (#192) — 파산 경고의 [매달 나가는 돈 줄이기]가 이 줄로 온다 */}
      {s.finance.cash < total && <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">⚠ 현금이 한 달 치 고정비보다 적다 — 지금 일부 상환하면 현금이 더 줄어든다. 먼저 대출·급전으로 현금을 만들고, 상환은 현금이 남을 때 한다.</p>}
      <MarketingOutlookLine s={s} />
    </div>
  );
}

/** 이 값 이하(100만 원 미만)면 빨강 — mvp.md §7.7: 관리비 300만(#190)에서 0원은 20/20 파산, 100만은 목표 19/20 [튜닝] */
const LOW_MARKETING = 999_999;
/** 낮을 때 비교하는 예산 = 새 게임 기본값 */
const REF_MARKETING = 3_000_000;

// 마케팅 예산의 앞날 (#193) — 줄여서 아끼는 돈과 3년 뒤 덜 팔리는 몫을 나란히 보인다. 규칙은 바꾸지 않는다
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
