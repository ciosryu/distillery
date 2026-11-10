// 이번 달 소식 (5차 MVP 플레이테스트 2026-11-10 오너 요청 — "이벤트나 시장 상황을 보기 힘들다. 선택이 필요하거나 중요·긴급한 이벤트는 턴 시작 때 바로 보이게")
// 진행으로 달이 넘어가면, 고를 것(선택 대기)이나 지난 진행 동안 일어난 이벤트·새로 열린 기능·목표 소식이 있을 때만 화면 가운데 창으로 띄운다.
// 고를 것은 창 안에서 바로 고른다. [확인]을 누르면 닫히고, 같은 달에는 다시 뜨지 않는다(고를 것이 남아 있으면 증류소 탭 맨 위에 계속 보인다 — #216).
// 화면만 바꾼다(코어 UI). 브라우저 저장이 막혀도 돈다
import { useEffect, useState } from 'react';
import { monthLabel } from '../sim';
import { EVENTS } from '../sim/content/events';
import { useGame } from '../store/game';
import { Badge, Button } from './kit';
import { PendingEventChoices } from './panels/Events';

const SEEN_KEY = 'distillery-tycoon/brief-seen';
const URGENT = new Set(['disaster', 'regulation']);
const readSeen = () => { try { return Number(sessionStorage.getItem(SEEN_KEY) ?? NaN); } catch { return NaN; } };
const writeSeen = (m: number) => { try { sessionStorage.setItem(SEEN_KEY, String(m)); } catch { /* 저장 막힘 — 이번 화면에서만 닫힌다 */ } };

/** 지난 진행 동안의 소식 — 이벤트(긴급 먼저)·새로 열린 기능·목표·마일스톤 */
export function turnNews(s: ReturnType<typeof useGame.getState>['state'], fromMonth: number) {
  const events = s.events.log.filter((e) => e.month >= fromMonth && e.month < s.month && !e.title.startsWith('예보 빗나감')).map((e) => { // 빗나간 예보는 창을 띄울 만큼 중요하지 않다
    const def = EVENTS.find((d) => d.title === e.title);
    return { ...e, urgent: !!def && URGENT.has(def.category) };
  }).sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.month - b.month);
  const notes = s.history.reports.filter((r) => r.month >= fromMonth && r.month < s.month)
    .flatMap((r) => r.notes.filter((n) => /^(새 기능 열림|중반 목표|마일스톤|핸드필 .*비었다|자동 통입 못 함)/.test(n)).map((n) => ({ month: r.month, text: n })));
  return { events, notes };
}

export function TurnBrief() {
  const s = useGame((g) => g.state);
  const undoInfo = useGame((g) => g.undoInfo);
  const [seen, setSeen] = useState<number>(() => readSeen());
  useEffect(() => { setSeen(readSeen()); }, [s.month]);
  if (!s.scenario || s.status !== 'running') return null;
  // 이번 진행이 넘긴 달들(분기·1년 진행이면 여러 달) — 기록이 없으면 지난 한 달
  const from = undoInfo && undoInfo.month < s.month ? undoInfo.month : s.month - 1;
  const { events, notes } = turnNews(s, from);
  const pending = s.events.pending.length;
  if (seen === s.month || (!pending && !events.length && !notes.length)) return null;
  const close = () => { writeSeen(s.month); setSeen(s.month); };
  const span = s.month - from > 1 ? `${monthLabel(s.startYear, from)} ~ ${monthLabel(s.startYear, s.month - 1)}` : monthLabel(s.startYear, s.month - 1);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16" role="dialog" aria-modal="true" aria-label="이번 달 소식">
      <div className="w-full max-w-2xl rounded-xl border border-stone-200 bg-white p-4 shadow-xl dark:border-stone-700 dark:bg-stone-900">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">이번 달 소식 <span className="text-sm font-normal text-stone-500">· {span}</span></h2>
          {pending > 0 && <Badge tone="warn">고를 것 {pending}개</Badge>}
        </div>
        {pending > 0 && <div className="mb-3"><PendingEventChoices /><p className="mt-1 text-xs text-stone-500">고르지 않으면 다음 달 기본값(파란 버튼)으로 처리된다. 창을 닫아도 증류소 탭 맨 위에 남는다.</p></div>}
        {events.length > 0 && (
          <ul className="mb-3 grid gap-1.5 text-sm">
            {events.map((e, i) => (
              <li key={i} className={`rounded-md border px-2 py-1.5 ${e.urgent ? 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40' : 'border-stone-200 dark:border-stone-700'}`}>
                <div className="font-medium">{e.urgent && <Badge tone="bad">긴급</Badge>} {e.title} <span className="text-xs font-normal text-stone-500">{monthLabel(s.startYear, e.month)}</span></div>
                <div className="text-xs text-stone-600 dark:text-stone-300">{e.text}</div>
              </li>
            ))}
          </ul>
        )}
        {notes.length > 0 && <ul className="mb-3 grid gap-1 text-xs text-stone-700 dark:text-stone-300">{notes.map((n, i) => <li key={i}>• {n.text}</li>)}</ul>}
        <div className="flex justify-end gap-2"><Button variant="primary" onClick={close}>확인</Button></div>
      </div>
    </div>
  );
}
