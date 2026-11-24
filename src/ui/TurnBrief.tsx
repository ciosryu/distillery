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
import { briefTodos, flagshipReady, monthTodos, stageTarget } from './alerts';
import { TodoText, useGo } from './AlertsView';
import { useUi } from '../store/ui';
import { campaignMinOakMonths, stagesOf } from '../sim';

const SEEN_KEY = 'distillery-tycoon/brief-seen';
const URGENT = new Set(['disaster', 'regulation']);
// 본 달은 판(시드)별로 localStorage에 — 새로 고침·새 탭에서도 같은 달의 소식이 다시 뜨지 않는다(PROD 화면 메모 C3 — sessionStorage는 탭을 바꾸거나 다시 열면 비어 있었다)
const readSeen = (seed: number) => { try { const [k, m] = (localStorage.getItem(SEEN_KEY) ?? '').split(':'); return Number(k) === seed ? Number(m) : NaN; } catch { return NaN; } };
const writeSeen = (seed: number, m: number) => { try { localStorage.setItem(SEEN_KEY, `${seed}:${m}`); } catch { /* 저장 막힘 — 이번 화면에서만 닫힌다 */ } };
// [결정 #373] 지난번 소식 창을 닫을 때 떠 있던 warn · danger 할 일 id — 판(시드)별. 없으면 null(지금 것이 모두 새것)
const TODO_SEEN_KEY = 'distillery-tycoon/brief-todos';
const readSeenTodos = (seed: number): string[] | null => { try { const v = JSON.parse(localStorage.getItem(TODO_SEEN_KEY) ?? 'null') as { seed: number; ids: string[] } | null; return v && v.seed === seed ? v.ids : null; } catch { return null; } };
const writeSeenTodos = (seed: number, ids: string[]) => { try { localStorage.setItem(TODO_SEEN_KEY, JSON.stringify({ seed, ids })); } catch { /* 저장 막힘 */ } };

/** 지난 진행 동안의 소식 — 이벤트(긴급 먼저)·새로 열린 기능·목표·마일스톤 */
export function turnNews(s: ReturnType<typeof useGame.getState>['state'], fromMonth: number) {
  const span = s.history.reports.filter((r) => r.month >= fromMonth && r.month < s.month);
  // 고르지 않아 기본값으로 처리된 선택(6차 판 arch.md — `[제안 P-ARCH-63]`): 월 틱이 처리한 선택만 그달 결산 사건에 남는다(턴 사이에 직접 고르면 결산이 없다 — events.ts resolvePending)
  const tickResolved = new Set(span.flatMap((r) => r.events.filter((t) => t.includes(' → '))));
  const events = s.events.log.filter((e) => e.month >= fromMonth && e.month < s.month && !e.title.startsWith('예보 빗나감')).map((e) => { // 빗나간 예보는 창을 띄울 만큼 중요하지 않다
    const def = EVENTS.find((d) => d.title === e.title);
    return { ...e, urgent: !!def && URGENT.has(def.category), defaulted: tickResolved.has(e.title) };
  }).sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.month - b.month);
  const notes = span
    .flatMap((r) => r.notes.filter((n) => /^(새 기능 열림|중반 목표|마일스톤|핸드필 .*비었다|자동 통입 못 함|IB 입찰 제안|위스키 원액 생산을 건너뛰었다|플래그십 후보 \d+통에서|세이브 복구|정기 임금 조정|.+ 납품 제안 만료)/.test(n)).map((n) => ({ month: r.month, text: n })))
    // 여러 달 진행(분기·1년) 안에 온 IB 입찰은 답할 틈 없이 사라졌을 수 있다 — 지금 열린 입찰에 없으면 그렇다고 붙인다(P-ARCH-63)
    .map((n) => { const id = n.text.match(/^IB 입찰 제안 — .*?통 (K\d+)/)?.[1]; return id && s.month - fromMonth > 1 && !s.b2b.caskBids.some((b) => b.caskId === id) ? { ...n, text: `${n.text} → 진행 중에 답하지 않아 이미 사라졌다` } : n; });
  // 플래그십 후보가 줄었다 (#261) — 이번 진행 직전 결산과 마지막 결산의 후보 수. 자동 납품 몫은 위 메모가, 나머지는 손 병입·맡기기·판매·빼기 등
  const before = s.history.reports.filter((r) => r.month < fromMonth).at(-1)?.flagshipCandidates;
  const after = span.at(-1)?.flagshipCandidates;
  if (before != null && after != null && after < before) {
    notes.unshift({ month: span.at(-1)!.month, text: `플래그십 후보 ${before} → ${after}통${after === 0 ? ' — 남은 후보가 없다' : ''}. 남길 통은 숙성고 카드에서 "플래그십 예비"로 묶는다(자동 기능이 쓰지 않는다)` });
  }
  // 12년 적격 첫 도달 (6차 판 arch.md ① — `[제안 P-ARCH-61]` (c)): 이번 진행이 넘긴 달 안에 가장 오래된 적격 통이 기준을 넘었으면 한 줄.
  // 결산 메모를 새로 쓰지 않고(출력 불변) 지금 적격 통의 목재 개월에서 넘긴 달 수를 빼 본다 — 진행 전에는 적격 통이 없었다는 뜻
  const win12 = flagshipReady(s);
  if (win12?.casks.length && !win12.bottled) {
    const A = campaignMinOakMonths(s);
    const oldest = Math.max(...win12.casks.map((c) => c.woodMonths));
    if (oldest - (s.month - fromMonth) < A) notes.unshift({ month: s.month - 1, text: `12년 병입 가능 — 자가 몰트 통 ${win12.casks.length}개가 목재 ${A}개월을 넘었다. 이 통들로 싱글 몰트를 병입해 팔면 캠페인 승리(블렌딩·병입 탭)` });
  }
  // 새 기능 열림 — 그 탭으로 바로 가는 버튼을 붙여 크게 보인다(7차 판: 11년 차 핵심 전문가 해금을 0초에 넘겨 "못 봤다" — MGT 넘김)
  const unlocks = notes.flatMap((n) => {
    if (!n.text.startsWith('새 기능 열림')) return [];
    const st = stagesOf(s).find((x) => n.text.includes(x.title));
    return st ? [{ ...n, ...stageTarget(st) }] : [];
  });
  return { events, notes: notes.filter((n) => !unlocks.some((u) => u.text === n.text)), unlocks };
}

export function TurnBrief() {
  const s = useGame((g) => g.state);
  const undoInfo = useGame((g) => g.undoInfo);
  const setTab = useUi((u) => u.setTab);
  const go = useGo();
  const [seen, setSeen] = useState<number>(() => readSeen(s.seed));
  useEffect(() => { setSeen(readSeen(s.seed)); }, [s.month, s.seed]);
  if (!s.scenario || s.status !== 'running') return null;
  // 이번 진행이 넘긴 달들(분기·1년 진행이면 여러 달) — 기록이 없으면 지난 한 달
  const from = undoInfo && undoInfo.month < s.month ? undoInfo.month : s.month - 1;
  const { events, notes, unlocks } = turnNews(s, from);
  const pending = s.events.pending.length;
  const todos = monthTodos(s);
  const { fresh, continuing } = briefTodos(todos, readSeenTodos(s.seed));
  if (seen === s.month || (!pending && !events.length && !notes.length && !unlocks.length && !fresh.length)) return null;
  const close = () => { writeSeen(s.seed, s.month); writeSeenTodos(s.seed, todos.filter((t) => t.level !== 'info').map((t) => t.id)); setSeen(s.month); };
  const span = s.month - from > 1 ? `${monthLabel(s.startYear, from)} ~ ${monthLabel(s.startYear, s.month - 1)}` : monthLabel(s.startYear, s.month - 1);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16" role="dialog" aria-modal="true" aria-label="이번 달 소식">
      <div className="w-full max-w-2xl rounded-xl border border-stone-200 bg-white p-4 shadow-xl dark:border-stone-700 dark:bg-stone-900">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">이번 달 소식 <span className="text-sm font-normal text-stone-500">· {span}</span></h2>
          {pending > 0 && <Badge tone="warn">고를 것 {pending}개</Badge>}
        </div>
        {pending > 0 && <div className="mb-3"><PendingEventChoices /><p className="mt-1 text-xs text-stone-500">고르지 않으면 다음 달 기본값(파란 버튼)으로 처리된다. 창을 닫아도 증류소 탭 맨 위에 남는다.</p></div>}
        {unlocks.length > 0 && (
          <ul className="mb-3 grid gap-1.5">
            {unlocks.map((u, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-md border-2 border-amber-400 bg-amber-50 px-2 py-2 text-sm dark:border-amber-600 dark:bg-amber-950/40">
                <span className="min-w-0"><Badge tone="warn">새로 열림</Badge> {u.text.replace(/^새 기능 열림 — /, '')}</span>
                <Button small variant="primary" onClick={() => { close(); setTab(u.tab); }}>{u.label} 탭 열기</Button>
              </li>
            ))}
          </ul>
        )}
        {events.length > 0 && (
          <ul className="mb-3 grid gap-1.5 text-sm">
            {events.map((e, i) => (
              <li key={i} className={`rounded-md border px-2 py-1.5 ${e.urgent ? 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40' : 'border-stone-200 dark:border-stone-700'}`}>
                <div className="font-medium">{e.urgent && <Badge tone="bad">긴급</Badge>} {e.title} {e.defaulted && <Badge tone="warn">고르지 않아 기본값</Badge>} <span className="text-xs font-normal text-stone-500">{monthLabel(s.startYear, e.month)}</span></div>
                <div className="text-xs text-stone-600 dark:text-stone-300">{e.text}</div>
              </li>
            ))}
          </ul>
        )}
        {notes.length > 0 && <ul className="mb-3 grid gap-1 text-xs text-stone-700 dark:text-stone-300">{notes.map((n, i) => <li key={i}>• {n.text}</li>)}</ul>}
        {/* [결정 #373] 새로 생긴 warn · danger 할 일 — 계속 떠 있는 것은 개수만(매달 같은 줄이 반복되면 무시하게 된다) */}
        {(fresh.length > 0 || continuing > 0) && (
          <div className="mb-3">
            {fresh.length > 0 && <div className="mb-1 text-sm font-semibold">새 할 일</div>}
            <ul className="grid gap-1.5">
              {fresh.map((t) => (
                <li key={t.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-md border-l-4 px-2 py-1.5 ${t.level === 'danger' ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40' : 'border-amber-500 bg-amber-50 dark:bg-amber-950/40'}`}>
                  <TodoText level={t.level as 'warn' | 'danger'} text={t.text} tone={t.level === 'danger' ? 'text-rose-700 dark:text-rose-400' : 'text-amber-800 dark:text-amber-300'} />
                  <Button small variant="ghost" onClick={() => { close(); go(t.target); }}>{t.action} →</Button>
                </li>
              ))}
            </ul>
            {continuing > 0 && <p className="mt-1 text-xs text-stone-500">할 일 {continuing}개 계속 — 증류소 탭 맨 위 「이번 달 할 일」</p>}
          </div>
        )}
        <div className="flex justify-end gap-2"><Button variant="primary" onClick={close}>확인</Button></div>
      </div>
    </div>
  );
}
