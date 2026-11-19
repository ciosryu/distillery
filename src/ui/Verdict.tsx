import { GRADE, monthLabel, rulesVersionOf, timelineOf, type GameState, type GoalCheck } from '../sim';
import { winLabel } from './winLabel'; // F5c-2 승리 채널 문구
import { MILESTONES } from '../sim/content/milestones';
import { useGame } from '../store/game';
import { won } from './format';
import { Badge, Button, Card } from './kit';

// 결과 화면 — 옛 판(legacy-v15)은 15년 목표 판정(MVP §3, skeleton S-9), 새 캠페인(v16)은 캠페인 승리 달의 성과 판정([결정 #308·#324] — heritage/failed만, 승리 뒤에도 계속 운영).
// 확인하면 목표 없이 계속 운영(샌드박스)

// 등급제 (#263 ①안): 버티고 순자산을 채우면 플래그십 없이도 "달성"(B) — 플래그십까지면 헤리티지(A·S)
const TITLE = { heritage: '헤리티지 달성', achieved: '목표 달성 — 플래그십 없이', missed: '목표 일부 미달', failed: '실패' } as const;
const CHECK_LABEL: Record<GoalCheck['id'], string> = { survive: '파산하지 않는다', flagship: '12년 숙성 플래그십을 병입해 판다', netWorth: '순자산 목표' };
/** 새 캠페인(v16): 순자산은 승리 조건이 아니라 등급 기준(#308·#324) — 칸 머리글·줄 이름을 바꿔 승패처럼 읽히지 않게(플레이테스트 준비 점검 §7.23 #3) */
const CHECK_LABEL_V16: Record<GoalCheck['id'], string> = { survive: '파산하지 않았다', flagship: '12년 싱글 몰트를 유상 출하했다(승리)', netWorth: '순자산 — 등급 기준(승리 조건 아님)' };

/**
 * 새 캠페인(v16) S 등급 조건 세 줄 (6차 판 뒤 PM 배정 — 옛 칸은 "순자산 / 등급 기준 24억 (S는 ×1.5)" 한 줄이라 S에 실제로 필요한 36억과 품질·인지도 조건이 작은 글씨에만 있었다. S = 셋 모두, `judgeWin`).
 * 판정 결과(verdict)에 남은 값만 읽는다
 */
export function sGradeRows(v: NonNullable<GameState['progress']['verdict']>): { id: string; label: string; ok: boolean; text: string }[] {
  const nwTarget = (v.checks.find((c) => c.id === 'netWorth')?.target ?? 0) * GRADE.sNetWorthRatio;
  const q = v.flagshipQuality ?? v.checks.find((c) => c.id === 'flagship')?.value;
  const aw = v.awareness ?? 0;
  return [
    { id: 's-networth', label: '순자산', ok: (v.netWorth ?? 0) >= nwTarget, text: `${won(v.netWorth ?? 0)} / S 조건 ${won(nwTarget)}` },
    { id: 's-quality', label: '12년 싱글 몰트 품질', ok: (q ?? 0) >= GRADE.sFlagshipQuality, text: `${q != null ? q.toFixed(1) : '—'} / S 조건 ${GRADE.sFlagshipQuality}` },
    { id: 's-awareness', label: '브랜드 인지도', ok: aw >= GRADE.sAwareness, text: `${(aw * 100).toFixed(1)}% / S 조건 ${GRADE.sAwareness * 100}%` },
  ];
}

function checkText(c: GoalCheck, legacy = true): string {
  if (c.id === 'netWorth') return legacy ? `${won(c.value ?? 0)} / 목표 ${won(c.target ?? 0)}` : `${won(c.value ?? 0)} / 등급 기준 ${won(c.target ?? 0)} (S는 ×${GRADE.sNetWorthRatio})`;
  if (c.id === 'flagship') return c.ok ? `품질 ${c.value ?? '—'}` : '아직 없음';
  return c.ok ? '버텼다' : '게임이 끝났다';
}

export function Verdict({ s, onNewGame }: { s: GameState; onNewGame: () => void }) {
  const dispatch = useGame((g) => g.dispatch);
  const v = s.progress.verdict;
  if (!v) return null;
  const ending = s.progress.ending;
  const legacy = rulesVersionOf(s) === 'legacy-v15';
  return (
    <Card title={`${s.distilleryName} — ${TITLE[v.result]}`}>
      <div className="grid gap-4 md:grid-cols-[auto_1fr_1fr]">
        <div className="flex flex-col items-center justify-center rounded-lg border border-stone-200 px-6 py-3 dark:border-stone-700">
          <div className="text-xs text-stone-500">등급</div>
          <div className="text-4xl font-bold tabular-nums">{v.grade ?? '—'}</div>
          <div className="text-xs text-stone-500">{monthLabel(s.startYear, v.month - 1)} {s.progress.win ? winLabel(s.progress.win) : '판정'}</div>
        </div>
        <section>
          <h3 className="mb-1 text-sm font-semibold">{legacy ? '목표' : '승리'}</h3>
          <ul className="space-y-1 text-sm">
            {v.checks.filter((c) => legacy || c.id !== 'netWorth').map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-3">
                <span><span aria-hidden>{c.ok ? '✅' : '❌'}</span> {(legacy ? CHECK_LABEL : CHECK_LABEL_V16)[c.id]}</span>
                <span className="tabular-nums text-stone-600 dark:text-stone-300">{checkText(c, legacy)}</span>
              </li>
            ))}
          </ul>
          {!legacy && (
            <>
              {/* 6차 판 뒤(PM 배정): 순자산 칸을 "등급 S 조건"으로 — 세 조건을 모두 채우면 S, 하나라도 모자라면 A(승리 조건은 위 한 줄뿐) */}
              <h3 className="mb-1 mt-3 text-sm font-semibold">등급 S 조건 <span className="font-normal text-stone-500">— 셋 다 채우면 S, 아니면 A</span></h3>
              <ul className="space-y-1 text-sm">
                {sGradeRows(v).map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-3">
                    <span><span aria-hidden>{r.ok ? '✅' : '◇'}</span> {r.label}</span>
                    <span className="tabular-nums text-stone-600 dark:text-stone-300">{r.text}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-2 text-xs text-stone-500">
            순자산 = 지금 정리하면 받는 돈(현금 − 대출 + 매출채권 + 원액 현물가 + 재고 원가).{legacy && <> 브랜드 인지도 {(v.awareness * 100).toFixed(1)}%.
            S등급: 목표 달성 + 순자산 목표의 {GRADE.sNetWorthRatio}배 + 플래그십 품질 {GRADE.sFlagshipQuality}↑ + 인지도 {GRADE.sAwareness * 100}%↑</>}
          </p>
          {v.result === 'achieved' && <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">순자산 목표를 채웠다. 12년 플래그십까지 냈다면 헤리티지(A·S) — 다음 판에는 가장 오래된 통을 "플래그십 예비"로 남겨 두라.</p>}
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
