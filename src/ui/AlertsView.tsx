// 위기 경고·이번 달 할 일·지난달 현금 흐름·대출 상환 예정 — 화면 (코어 UI, 1차 MVP 플레이테스트 대응 ①~④, 계산은 alerts.ts)
// 파일 이름이 alerts.ts와 대소문자만 다르면 대소문자를 가리지 않는 파일 시스템(macOS·Windows 기본)에서 './Alerts'가 alerts.ts로 풀릴 수 있어 AlertsView로 둔다
import { BANKRUPT_AFTER_MONTHS, monthLabel } from '../sim';
import { productionValue } from '../sim/economics';
import { monthlyFixedCost } from '../sim/loans';
import { won } from './format';
import { useGame } from '../store/game';
import { useUi } from '../store/ui';
import { cashAlert, fmtWon, lastMonthFlow, loanSchedule, monthTodos, paymentJump, type TodoTarget } from './alerts';
import { Button } from './kit';

/** 탭 이동 또는 증류소 화면 안의 카드로 스크롤 */
function useGo() {
  const setTab = useUi((u) => u.setTab);
  return (t: TodoTarget) => {
    if ('tab' in t) { setTab(t.tab); return; }
    setTab('home');
    requestAnimationFrame(() => document.getElementById(t.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
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
        <Button small variant={danger ? 'primary' : 'secondary'} onClick={() => go({ tab: 'finance' })}>대출·급전 받기</Button>
        <Button small onClick={() => go({ tab: 'b2b' })}>원액 현물 판매</Button>
        <Button small onClick={() => go({ tab: 'sales' })}>값 낮춰 재고 팔기</Button>
        {s.scenario && <Button small variant="ghost" onClick={() => go({ anchor: 'mvp-fixed' })}>매달 나가는 돈 줄이기</Button>}
        <Button small variant="ghost" onClick={() => go({ tab: 'dashboard' })}>월 결산표</Button>
      </div>
      <ProductionTruth s={s} />
    </div>
  );
}

/**
 * 생산을 멈춰도 아끼는 돈은 작다 (P-PROD-15, 2차 MVP 플레이테스트) — 2차 판은 이 경고의 [생산 지시 줄이기]를 보고 생산을 0으로 했고
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
      {' '}현금은 대출·급전, 원액 현물 판매, 가격, 마케팅·대출 상환 같은 매달 나가는 돈에서 만든다.
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
