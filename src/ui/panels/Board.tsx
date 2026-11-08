import { BOARD } from '../../sim/content/catalog';
import { quarterRevenue, reportRevenue } from '../../sim/board';
import { monthlyFixedCost } from '../../sim';
import { useGame } from '../../store/game';
import { pct, won } from '../format';
import { Badge, Card } from '../kit';

// 이사회 (P-MGT-7, PRD §8.2) — 외부 지분 25%↑일 때만 보인다

export function BoardCard() {
  const s = useGame((g) => g.state);
  const b = s.finance.board;
  if (!b) return null;
  const d = b.demands[0];
  /** 기한이 dueMonth인 분기에서 지금까지 결산된 매출 */
  const soFar = (due: number) => s.history.reports.filter((r) => r.month > due - 3 && r.month <= due).reduce((t, r) => t + reportRevenue(r), 0);
  const canDismiss = s.finance.investorShare >= BOARD.dismissShare;
  const tone = b.confidence >= 60 ? 'good' : b.confidence >= 30 ? 'warn' : 'bad';
  const progress = d
    ? d.id === 'revenue_growth'
      ? `이번 분기 매출 지금까지 ${won(soFar(d.dueMonth))} / 목표 ${won(quarterRevenue(s, d.dueMonth - 3) * BOARD.revenueGrowth)}`
      : `지금 현금 ${won(s.finance.cash)} / 기준 ${won(monthlyFixedCost(s) * BOARD.cashBufferMonths)}`
    : '';
  return (
    <Card title={`이사회 — 외부 지분 ${pct(s.finance.investorShare, 1)}`}>
      <div className="grid gap-2 text-sm">
        <div className="flex items-center gap-2">신뢰 <Badge tone={tone}>{b.confidence} / 100</Badge>
          <span className="text-xs text-stone-500">목표 달성 +{BOARD.metGain} · 미달 −{BOARD.missLoss}. {canDismiss ? <b className="text-rose-700">외부 지분 {pct(BOARD.dismissShare, 0)}↑ — 신뢰가 0이 되면 대표 해임(게임 끝)</b> : `외부 지분 ${pct(BOARD.dismissShare, 0)}↑가 되면 신뢰 0에서 해임된다`}</span>
        </div>
        {d && (
          <div>
            <span className="font-medium">이번 분기 목표</span> (기한 {d.dueMonth - s.month + 1}개월 뒤 결산까지): {d.label}
            <div className="text-xs text-stone-500">{progress}</div>
          </div>
        )}
      </div>
    </Card>
  );
}
