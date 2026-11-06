import { GRADE, monthLabel, timelineOf, type GameState, type GoalCheck } from '../sim';
import { MILESTONES } from '../sim/content/milestones';
import { useGame } from '../store/game';
import { won } from './format';
import { Badge, Button, Card } from './kit';

// 결과 화면 — 15년 목표 판정 (MVP §3, skeleton S-9). 확인하면 목표 없이 계속 운영(샌드박스)

const TITLE = { heritage: '헤리티지 달성', missed: '목표 일부 미달', failed: '실패' } as const;
const CHECK_LABEL: Record<GoalCheck['id'], string> = { survive: '파산하지 않는다', flagship: '12년 숙성 플래그십을 병입해 판다', netWorth: '순자산 목표' };

function checkText(c: GoalCheck): string {
  if (c.id === 'netWorth') return `${won(c.value ?? 0)} / 목표 ${won(c.target ?? 0)}`;
  if (c.id === 'flagship') return c.ok ? `품질 ${c.value ?? '—'}` : '아직 없음';
  return c.ok ? '버텼다' : '게임이 끝났다';
}

export function Verdict({ s, onNewGame }: { s: GameState; onNewGame: () => void }) {
  const dispatch = useGame((g) => g.dispatch);
  const v = s.progress.verdict;
  if (!v) return null;
  const ending = s.progress.ending;
  return (
    <Card title={`${s.distilleryName} — ${TITLE[v.result]}`}>
      <div className="grid gap-4 md:grid-cols-[auto_1fr_1fr]">
        <div className="flex flex-col items-center justify-center rounded-lg border border-stone-200 px-6 py-3 dark:border-stone-700">
          <div className="text-xs text-stone-500">등급</div>
          <div className="text-4xl font-bold tabular-nums">{v.grade ?? '—'}</div>
          <div className="text-xs text-stone-500">{monthLabel(s.startYear, v.month - 1)} 판정</div>
        </div>
        <section>
          <h3 className="mb-1 text-sm font-semibold">목표</h3>
          <ul className="space-y-1 text-sm">
            {v.checks.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-3">
                <span><span aria-hidden>{c.ok ? '✅' : '❌'}</span> {CHECK_LABEL[c.id]}</span>
                <span className="tabular-nums text-stone-600 dark:text-stone-300">{checkText(c)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-500">
            순자산 = 지금 정리하면 받는 돈(현금 − 대출 + 매출채권 + 원액 현물가 + 재고 원가). 브랜드 인지도 {(v.awareness * 100).toFixed(1)}%.
            S등급: 목표 달성 + 순자산 목표의 {GRADE.sNetWorthRatio}배 + 플래그십 품질 {GRADE.sFlagshipQuality}↑ + 인지도 {GRADE.sAwareness * 100}%↑
          </p>
          {ending && <p className="mt-1 text-sm text-rose-700 dark:text-rose-400">끝난 이유: {ending.reason === 'bankrupt' ? '파산' : ending.reason === 'licenseRevoked' ? '면허 취소' : '해임'} ({monthLabel(s.startYear, ending.month)})</p>}
        </section>
        <section>
          <h3 className="mb-1 text-sm font-semibold">연표</h3>
          <ol className="space-y-0.5 text-sm">
            {timelineOf(s).map((m) => (
              <li key={m.id} className="flex justify-between gap-3">
                <span>{MILESTONES[m.id].nameKo}{m.value != null ? ` (품질 ${m.value})` : ''}</span>
                <span className="tabular-nums text-stone-500">{monthLabel(s.startYear, m.month)}</span>
              </li>
            ))}
            {!timelineOf(s).length && <li className="text-stone-500">기록 없음</li>}
          </ol>
        </section>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {s.status === 'running' && <Button variant="primary" onClick={() => dispatch({ type: 'acknowledgeVerdict' })}>계속 운영 (목표 없이)</Button>}
        <Button onClick={onNewGame}>새 게임</Button>
        {v.result === 'heritage' && <Badge tone="good">내가 이 위스키를 키웠다</Badge>}
      </div>
    </Card>
  );
}
