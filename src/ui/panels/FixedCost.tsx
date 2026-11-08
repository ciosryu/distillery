import { monthlyFixedBreakdown } from '../../sim/loans';
import { useGame } from '../../store/game';
import { useUi } from '../../store/ui';
import { won } from '../format';
import { Button, NumberField } from '../kit';

// 매달 나가는 돈 (P-MGT-8 안 A, 1차 MVP 플레이테스트 대응) — 월 고정비 예상의 내역 + 바로 조절할 수 있는 마케팅 예산. 규칙은 바꾸지 않는다

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
        <span>— 줄이면 인지도가 덜 자란다. 대출은 일부 상환으로 월 납부를 줄일 수 있다</span>
        <Button small variant="ghost" onClick={() => setTab('finance')}>대출 보기</Button>
      </div>
    </div>
  );
}
