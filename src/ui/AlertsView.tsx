// 위기 경고·이번 달 할 일·지난달 현금 흐름·대출 상환 예정 — 화면 (코어 UI, 1차 MVP 플레이테스트 대응 ①~④, 계산은 alerts.ts)
// 파일 이름이 alerts.ts와 대소문자만 다르면 대소문자를 가리지 않는 파일 시스템(macOS·Windows 기본)에서 './Alerts'가 alerts.ts로 풀릴 수 있어 AlertsView로 둔다
import { BANKRUPT_AFTER_MONTHS, midGoalsOf, monthLabel, whiskySkipCheck, stagesOf } from '../sim';
import { productionValue } from '../sim/economics';
import { loanRoomTotal, monthlyFixedCost } from '../sim/loans';
import { won } from './format';
import { useGame } from '../store/game';
import { useUi } from '../store/ui';
import { cashAlert, fmtWon, lastMonthFlow, loanSchedule, monthTodos, paymentJump, spotSaleStake, type TodoTarget } from './alerts';
import { Button } from './kit';
import { PolicySwitchHint } from './PricePolicyPicker'; // 자동 가격 정책 정보 한 줄 (#291 ⑥, MKT)

/** 증류소 탭의 접힌 블록을 여는 신호 — detail = 블록 id(= 스크롤 앵커). MvpHome의 useFold가 듣는다 (#182) */
export const OPEN_FOLD_EVENT = 'mvp-open-fold';

/** 탭 이동 또는 증류소 화면 안의 카드로 스크롤 — 접혀 있으면 먼저 연다 */
function useGo() {
  const setTab = useUi((u) => u.setTab);
  return (t: TodoTarget) => {
    if ('tab' in t) { setTab(t.tab); return; }
    setTab('home');
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent(OPEN_FOLD_EVENT, { detail: t.anchor }));
      requestAnimationFrame(() => document.getElementById(t.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    });
  };
}

/**
 * 위스키 원액 생산 건너뛰기 (#268 — 오너 답 2 "생산 중단 알림은 다음 턴 가장 위에 크게"). 지난 결산에 `whiskySkipped`가 있으면 파산 경고 자리 위에.
 * 이번 달도 건너뛸지는 지금 현금으로 미리 본다(`whiskySkipCheck` — 생산 단계와 같은 식)
 */
export function SkipBanner() {
  const s = useGame((g) => g.state);
  const go = useGo();
  const last = s.history.reports.at(-1);
  if (!s.scenario || !last?.whiskySkipped) return null;
  let streak = 0;
  for (let i = s.history.reports.length - 1; i >= 0 && s.history.reports[i]!.whiskySkipped; i--) streak++;
  const again = whiskySkipCheck(s);
  return (
    <div role="alert" className="mb-4 rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <div className="text-base font-semibold">⏸ 위스키 원액 생산을 건너뛰었다{streak > 1 ? ` — ${streak}개월째` : ''}</div>
      <div className="mt-1 text-sm">
        지난달 월초 현금 {fmtWon(last.whiskySkipped.cash)} &lt; 고정비 보름치 {fmtWon(last.whiskySkipped.threshold)} — 몰트·그레인을 만들지 않았다(소주는 만들었다).
        <b> 몇 년 뒤 그만큼 위스키가 빈다.</b> 생산 지시는 그대로라 현금이 돌아오면 저절로 다시 만든다.
        {again ? <> 지금 현금으로는 <b>이번 달도 건너뛴다</b>.</> : <> 지금 현금이면 이번 달은 만든다.</>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <Button small variant="primary" onClick={() => go({ tab: 'finance' })}>대출·급전 받기 — 아직 {fmtWon(loanRoomTotal(s))}</Button>
        <Button small onClick={() => go({ anchor: 'mvp-orders' })}>생산 지시 보기</Button>
        {s.scenario && <Button small variant="ghost" onClick={() => go({ anchor: 'mvp-fixed' })}>매달 나가는 돈 줄이기</Button>}
      </div>
    </div>
  );
}

/**
 * ① 파산 카운트다운 — 모든 탭 맨 위. 현금 부족 첫 달부터 "n개월째 · 월말 m번 더 마이너스면 파산"과 그 자리에서 할 수 있는 일을 보인다.
 * 현금이 아직 플러스여도 최근 속도로 3개월 안에 바닥나면 미리 노랑으로 알린다 (첫 플레이테스트 "파산 전에 미리 경고해 달라")
 */
export function CashBanner() {
  const s = useGame((g) => g.state);
  const go = useGo();
  const a = cashAlert(s);
  if (!a) return null;
  const danger = a.level === 'danger';
  const room = loanRoomTotal(s); // 지금 더 빌릴 수 있는 돈 (#192) — 2차 판은 16억을 남긴 채 파산했다
  const box = danger
    ? 'border-rose-400 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100'
    : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100';
  const head = a.kind === 'negative'
    ? <>현금 부족 <b>{a.negativeMonths}개월째</b> — {a.monthEndsLeft === 1 ? <b>이번 달 말에도 현금이 마이너스면 파산합니다</b> : <>월말 현금이 <b>{a.monthEndsLeft}번 더</b> 마이너스면 파산합니다</>}</>
    : a.kind === 'belowZeroNow'
      ? <>지금 현금이 <b>마이너스</b>입니다 — 이번 달 말까지 메우지 못하면 현금 부족 1개월째 (월말 {BANKRUPT_AFTER_MONTHS}번 연속이면 파산)</>
      : <>이 속도면 <b>약 {a.runwayMonths}개월 뒤</b> 현금이 바닥납니다 — 그 뒤 월말 {BANKRUPT_AFTER_MONTHS}번 연속 마이너스면 파산</>;
  return (
    <div role="alert" className={`mb-4 rounded-lg border p-3 text-sm ${box}`}>
      <div>{danger ? '🚨 ' : '⚠ '}{head}{a.avgSelfFunded != null && a.avgSelfFunded < 0 && <span className="opacity-80"> · 최근 3개월 자체 현금 흐름 월 {fmtWon(a.avgSelfFunded)}</span>}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="opacity-80">지금 할 수 있는 일:</span>
        <Button small variant={danger ? 'primary' : 'secondary'} onClick={() => go({ tab: 'finance' })}>{room > 0 ? <>대출·급전 받기 — 아직 {fmtWon(room)}</> : '대출·급전 — 남은 한도 없음'}</Button>
        {/* 원액 현물 판매는 미래 위스키를 판다 — 대출 다음, 대가를 바로 아래 줄에 (#203) */}
        <Button small onClick={() => go({ tab: 'b2b' })}>원액 현물 판매{s.scenario && spotSaleStake(s) ? ' ↓ 대가 확인' : ''}</Button>
        <Button small onClick={() => go({ tab: 'sales' })}>값 낮춰 재고 팔기</Button>
        {s.scenario && <Button small variant="ghost" onClick={() => go({ anchor: 'mvp-fixed' })}>매달 나가는 돈 줄이기</Button>}
        <Button small variant="ghost" onClick={() => go({ tab: 'dashboard' })}>월 결산표</Button>
      </div>
      <SpotSaleTruth s={s} />
      <ProductionTruth s={s} />
      {/* 자동 가격 정책 — 정보만, 자동 전환 없음 (#291 ⑥, MKT 대행) */}
      <PolicySwitchHint s={s} />
    </div>
  );
}

/**
 * 원액 현물 판매의 대가 (#203) — 3차 MVP 판은 이 경고를 보고 "패닉에" 몰트 원액을 8번(1.58억) 팔았고, 48개월 뒤 몰트는 거의 통에 들어가지 못했다.
 * 사람형 실험: 3차 판의 행동 중 원액 현물 판매 하나만 빼면 파산 10/10 → 3/10 (mvp.md §7.9). 2차의 [생산 지시 줄이기]와 같은 모양의 함정이라
 * 버튼은 두되, 누르기 전에 무엇을 파는지 돈으로 보인다. 숫자는 B2B 견적·공급 전망(#178)·생산 가치(#185)를 그대로 쓴다(alerts.ts spotSaleStake)
 */
function SpotSaleTruth({ s }: { s: Parameters<typeof spotSaleStake>[0] }) {
  if (!s.scenario) return null;
  const v = spotSaleStake(s);
  if (!v) return null;
  const later = (b: number, r: number | null) => <>위스키 약 <b>{b.toLocaleString()}병</b>{r != null && <>(≈ 매출 <b>{won(r)}</b>)</>}</>;
  return (
    <div className="mt-2 rounded border border-current/20 px-2 py-1 text-xs opacity-90">
      <div className="font-medium">원액 현물 판매는 앞으로 팔 위스키를 지금 파는 것이다 — 대출로 버틸 수 있으면 대출이 먼저다</div>
      <ul className="mt-0.5 list-inside list-disc">
        {v.tank && <li>탱크 뉴메이크 {v.tank.count}로트: 지금 팔면 <b>{won(v.tank.spotNow)}</b> · 통에 넣어 두면 {v.minMonths}개월 뒤 {later(v.tank.bottles, v.tank.revenue)}</li>}
        {v.casks && <li>숙성 중인 통 {v.casks.count}통: 지금 팔면 <b>{won(v.casks.spotNow)}</b> · 그대로 두면 {v.minMonths}개월 안에 {later(v.casks.bottles, v.casks.revenue)} — 이미 들인 숙성 기간까지 판다</li>}
        {v.ready && <li>숙성을 채운 통 {v.ready.count}통(현물가 {won(v.ready.spotNow)})은 이미 위스키다 — 병입해 팔 수 있다</li>}
      </ul>
      <div className="mt-0.5 opacity-80">매출은 1년 숙성 권장 출고가 기준 추정(증발 연 5%) · 판매 속도를 넘는 양은 바로 팔리지 않는다</div>
    </div>
  );
}

/**
 * 생산을 멈춰도 아끼는 돈은 작다 (#185, 2차 MVP 플레이테스트) — 2차 판은 이 경고의 [생산 지시 줄이기]를 보고 생산을 0으로 했고
 * (오너 답변), 생산비 월 약 300만을 아끼는 대신 3~5년 차 위스키를 잃었다. 버튼을 빼고 사실을 보인다
 */
function ProductionTruth({ s }: { s: Parameters<typeof productionValue>[0] }) {
  if (!s.scenario) return null;
  const v = productionValue(s);
  const fixed = monthlyFixedCost(s);
  if (!v.perBatch.length) return null;
  return (
    <p className="mt-2 text-xs opacity-90">
      참고: 지금 생산비는 월 <b>{won(v.costPerMonth)}</b>뿐이고 고정비 월 <b>{won(fixed)}</b>은 생산과 상관없이 나간다 — 생산을 멈춰도 이만큼만 아낀다.
      {v.whiskyBottlesPerYear > 0 && v.pricePerBottle != null && <> 대신 {v.minMonths}개월 뒤부터 해마다 위스키 약 {v.whiskyBottlesPerYear.toLocaleString()}병(≈ 매출 {won(v.whiskyBottlesPerYear * v.pricePerBottle)}, 추정)이 사라진다.</>}
      {' '}급한 현금은 먼저 대출·급전으로 만든다 — 대출 일부 상환은 월 납부를 줄이지만 지금 현금을 더 줄인다.
    </p>
  );
}

/** ③ 이번 달 할 일 — 증류소 탭 맨 위. 놓치기 쉬운 신호(통입 대기·병입 시기·샘플 시기·대출 거치 종료)를 급한 순서로 */
export function MonthTodo() {
  const s = useGame((g) => g.state);
  const go = useGo();
  if (s.status !== 'running') return null;
  const todos = monthTodos(s);
  const tone = { danger: 'text-rose-700 dark:text-rose-400', warn: 'text-amber-800 dark:text-amber-300', info: 'text-stone-700 dark:text-stone-300' } as const;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-1 font-medium">이번 달 할 일 <span className="text-xs font-normal text-stone-500">— {monthLabel(s.startYear, s.month)} · 놓치기 쉬운 것만 (안내일 뿐, 꼭 할 필요는 없다)</span></div>
      {todos.length === 0
        ? <p className="text-xs text-stone-500">급한 일이 없습니다 — 생산 지시·가격을 확인하고 한 달 진행하세요.</p>
        : (
          <ul className="grid gap-1">
            {todos.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className={`min-w-0 text-xs ${tone[t.level]}`}>{t.level === 'warn' ? '⚠ ' : '• '}{t.text}</span>
                <Button small variant="ghost" onClick={() => go(t.target)}>{t.action} →</Button>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

/** ④ 지난달 현금 흐름 한 줄 + ② 대출 상환 예정 — 증류소 탭 현금 카드 안 */
export function CashFlowLine() {
  const s = useGame((g) => g.state);
  const go = useGo();
  const r = s.history.reports.at(-1);
  const sched = loanSchedule(s, 12);
  const total = sched.reduce((t, m) => t + m.payment, 0);
  const jump = paymentJump(sched);
  const peak = sched.reduce((m, x) => (x.payment > m.payment ? x : m), sched[0] ?? { month: s.month, payment: 0, interest: 0, principal: 0 });
  const f = r ? lastMonthFlow(r) : null;
  const part = (p: { label: string; amount: number }) => <span key={p.label} className="whitespace-nowrap">{p.label} <span className="tabular-nums">{fmtWon(Math.abs(p.amount))}</span></span>;
  const join = (xs: { label: string; amount: number }[], n: number) => {
    const shown = xs.slice(0, n);
    const restSum = xs.slice(n).reduce((t, p) => t + p.amount, 0);
    const items = shown.map(part);
    if (restSum) items.push(<span key="_rest" className="whitespace-nowrap">그 밖 <span className="tabular-nums">{fmtWon(Math.abs(restSum))}</span></span>);
    return items.flatMap((x, i) => (i ? [<span key={`sep${i}`}> · </span>, x] : [x]));
  };
  return (
    <div className="mt-3 grid gap-1.5 text-xs">
      {f && (
        <p className="rounded-md bg-stone-50 px-3 py-2 dark:bg-stone-800/50">
          <b>지난달 현금 흐름</b>{' '}
          <span className="text-emerald-700 dark:text-emerald-400">들어옴 +{fmtWon(f.inflow.reduce((t, p) => t + p.amount, 0))}</span>
          {f.inflow.length > 0 && <span className="text-stone-500"> ({join(f.inflow, 3)})</span>}
          {' − '}
          <span className="text-rose-700 dark:text-rose-400">나감 {fmtWon(Math.abs(f.outflow.reduce((t, p) => t + p.amount, 0)))}</span>
          {f.outflow.length > 0 && <span className="text-stone-500"> ({join(f.outflow, 4)})</span>}
          {' = '}
          <b className={f.net < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}>{f.net >= 0 ? '+' : ''}{fmtWon(f.net)}</b>
        </p>
      )}
      {s.finance.loans.length > 0 && (
        <p className="rounded-md bg-stone-50 px-3 py-2 dark:bg-stone-800/50">
          <b>대출 상환 예정</b> 이번 달 말 <span className="tabular-nums">{fmtWon(sched[0]?.payment ?? 0)}</span>
          {' · '}앞으로 12개월 <span className="tabular-nums">{fmtWon(total)}</span>
          {peak.payment > (sched[0]?.payment ?? 0) && <> (가장 많은 달 {monthLabel(s.startYear, peak.month)} <span className="tabular-nums">{fmtWon(peak.payment)}</span>)</>}
          {jump && <span className="text-amber-800 dark:text-amber-300"> · ⚠ {monthLabel(s.startYear, jump.month)}부터 거치가 끝나 월 납부 {fmtWon(jump.from)} → <b>{fmtWon(jump.to)}</b></span>}
          {' '}<button className="underline" onClick={() => go({ tab: 'finance' })}>재무</button>
        </p>
      )}
    </div>
  );
}

/**
 * 15년 여정 — 단계 해금(언제 무엇이 열리나)과 중반 목표(기한·결과·보상) 한 줄씩 (#215·#216, 4차 MVP 플레이테스트:
 * 6년 차 흑자 뒤 "너무 쉽고 지루하다"). 증류소 탭 현금 카드 위
 */
export function JourneyStrip() {
  const s = useGame((g) => g.state);
  const stages = stagesOf(s); // F5a: 규칙 묶음별 단계·중반 목표
  if (!s.scenario || (!stages.length && !midGoalsOf(s).length)) return null;
  const done = new Set(s.scenario!.stagesDone ?? []);
  const res = new Map((s.progress.midGoals ?? []).map((g) => [g.id, g]));
  const ym = (m: number) => `${Math.floor(m / 12) + 1}년 차`;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs dark:border-stone-800 dark:bg-stone-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-stone-700 dark:text-stone-200">15년 여정</span>
        {stages.map((st) => (
          <span key={st.id} title={st.text} className={done.has(st.id) ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-500'}>
            {done.has(st.id) ? '✓' : '🔒'} {st.title.split(' — ')[1] ?? st.title} <span className="opacity-70">({done.has(st.id) ? '열림' : s.month >= st.month ? '다음 턴에 열림' : `${ym(st.month)} · ${st.month - s.month}개월 뒤`})</span>
          </span>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-stone-700 dark:text-stone-200">중반 목표</span>
        {midGoalsOf(s).map((g) => {
          const r = res.get(g.id);
          return (
            <span key={g.id} title={`보상: 인지도 +${Math.round(g.rewardAwareness * 100)}%p`} className={r?.result === 'done' ? 'text-emerald-700 dark:text-emerald-400' : r?.result === 'missed' ? 'text-stone-400 line-through' : 'text-amber-800 dark:text-amber-300'}>
              {r?.result === 'done' ? '✓' : r?.result === 'missed' ? '✗' : '◎'} {g.title} <span className="opacity-70 no-underline">({r?.result === 'done' ? `${monthLabel(s.startYear, r.month)} 달성` : r?.result === 'missed' ? '놓침' : g.byMonth - s.month > 0 ? `${ym(g.byMonth - 1)}까지 · ${g.byMonth - s.month}개월 남음` : '이번 턴에 판정'})</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
