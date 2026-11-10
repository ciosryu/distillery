import { isActive, monthLabel } from '../../sim';
import { useGame } from '../../store/game';
import { macroDetect, macroForecast } from '../../sim/earlyWarning';
import { pct } from '../format';
import { Badge, Button, Card, Empty } from '../kit';

/** 시장 상황: 선택 대기 이벤트 · 예보 · 활성 보정치 · 최근 이벤트 */
export function EventsCard() {
  const s = useGame((g) => g.state);
  const active = s.world.modifiers.filter((m) => isActive(m, s.month));
  const upcoming = s.world.modifiers.filter((m) => m.fromMonth > s.month);
  return (
    <Card title="시장 상황 · 이벤트">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-3">
          <PendingEventChoices />
          <MacroWarnings />
          <div>
            <h3 className="mb-1 text-xs font-semibold text-stone-500">예보 (빗나갈 수 있음)</h3>
            {!s.events.forecasts.length ? <p className="text-xs text-stone-500">예보 없음</p> : (
              <ul className="grid gap-1 text-sm">
                {s.events.forecasts.map((f) => (
                  <li key={f.id}><Badge tone="info">{monthLabel(s.startYear, f.fireMonth)} 전후</Badge> {f.text} <span className="text-xs text-stone-500">확률 {pct(f.certainty, 0)}</span></li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold text-stone-500">현재 시장 조건</h3>
            {!active.length && !upcoming.length ? <p className="text-xs text-stone-500">특이 사항 없음</p> : (
              <ul className="grid gap-1 text-sm">
                {active.map((m) => (
                  <li key={m.id}>
                    <Badge tone={m.factor >= 1 ? (m.key.startsWith('ingredient') || m.key === 'energy' || m.key === 'packaging' || m.key.startsWith('cask') || m.key === 'evaporation' || m.key.startsWith('consumerPrice') ? 'bad' : 'good') : (m.key.startsWith('ingredient') || m.key === 'energy' || m.key === 'packaging' ? 'good' : 'bad')}>{m.label}</Badge>{' '}
                    <span className="text-xs text-stone-600 dark:text-stone-300">{m.key} × {m.factor.toFixed(2)} · {monthLabel(s.startYear, m.untilMonth)}까지</span>
                  </li>
                ))}
                {upcoming.map((m) => <li key={m.id} className="text-xs text-stone-500">예정: {m.label} ({m.key} × {m.factor.toFixed(2)}) {monthLabel(s.startYear, m.fromMonth)}부터</li>)}
              </ul>
            )}
          </div>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold text-stone-500">최근 이벤트</h3>
          {!s.events.log.length ? <Empty>아직 이벤트가 없습니다</Empty> : (
            <ul className="grid max-h-72 gap-1.5 overflow-y-auto text-sm">
              {[...s.events.log].reverse().slice(0, 15).map((e, i) => (
                <li key={i}><span className="text-xs text-stone-500">{monthLabel(s.startYear, e.month)}</span> <b>{e.title}</b> — <span className="text-xs text-stone-600 dark:text-stone-300">{e.text}</span></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

/** 매크로 이벤트 조기 경보 (ENG-3, #189) — 연구했을 때만 */
function MacroWarnings() {
  const s = useGame((g) => g.state);
  const w = macroForecast(s);
  if (!w) return null;
  const when = (m: number) => (m === s.month ? '다음 결산' : `${m - s.month + 1}번째 결산`);
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold text-stone-500">조기 경보 — 공급망 예측(연구 ENG-3) · 감지율 {pct(macroDetect(s), 0)}</h3>
      {!w.length ? <p className="text-xs text-stone-500">감지된 조짐 없음 (놓친 조짐이 있을 수 있다)</p> : (
        <ul className="grid gap-1 text-sm">
          {w.map((x) => (
            <li key={`${x.defId}-${x.month}`}><Badge tone="warn">{when(x.month)}</Badge> {x.title} 조짐{x.forecastFirst ? ' — 먼저 예보가 나온다' : ''}</li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-stone-500">조짐은 지금 상황 기준이다 — 상황이 바뀌거나 같은 달 다른 일에 밀리면 일어나지 않을 수 있다.</p>
    </div>
  );
}

/**
 * 선택 대기 이벤트 — 고를 버튼과 각 선택의 결과. 고르지 않으면 다음 달 기본값으로 처리된다.
 * 대시보드 "시장 상황"과 MVP 증류소 탭 맨 위가 같이 쓴다(5차 MVP 플레이테스트: 증류소 탭에만 있으면 "선택 대기"를 어디서 고르는지 몰랐다)
 */
export function PendingEventChoices() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  if (!s.events.pending.length) return null;
  return (
    <div className="grid gap-3">
      {s.events.pending.map((p) => (
        <div key={p.id} className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
          <div className="text-sm font-semibold">{p.title} <Badge tone="warn">선택 필요</Badge></div>
          <p className="mt-1 text-xs text-stone-600 dark:text-stone-300">{p.text}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {p.choices.map((c, i) => (
              <Button key={i} small variant={i === p.defaultChoice ? 'primary' : 'secondary'} onClick={() => dispatch({ type: 'resolveEvent', eventId: p.id, choice: i })} title={c.detail}>
                {c.label}
              </Button>
            ))}
          </div>
          <ul className="mt-1 text-xs text-stone-500">{p.choices.map((c, i) => <li key={i}>{c.label}: {c.detail}{i === p.defaultChoice ? ' (고르지 않으면 다음 달 자동 선택)' : ''}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}
