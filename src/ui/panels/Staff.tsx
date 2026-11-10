import { ROLE_INFO } from '../../sim/content/catalog';
import type { GameState, Staff as StaffT } from '../../sim';
import { ageOf, AGING_TENURE_MONTHS, APPRENTICE_MONTHS, departureHouseStyle, HEADHUNT, headhuntCost, headhuntedThisMonth, marketSalary, masterDistiller, mentoringXp, MORALE, moraleOf, moraleOn, payShortfall, RETIRE_AGE, tenureOf, TRAINING, trainingCooldown, trainingCost, TRAIT_INFO } from '../../sim/hr';
import { pendingStages } from '../../sim/scenario';
import { useGame } from '../../store/game';
import { won } from '../format';
import { Badge, Button, Card, ConfirmButton, Empty } from '../kit';
import { Research } from './Research';
import { bottlenecks, hireImpact, moraleEffect, salaryReviewPreview, trainingImpact, type ImpactLine } from './staffImpact';

const ROLE_EFFECT: Record<StaffT['role'], string> = {
  distiller: '후각: 과일 에스테르↑ · 공정: 이취↓·운전 횟수↑ · 직관: 블렌딩 통합감↑',
  warehouse: '숙성고 QC — 관찰: 누수 손실↓·오염 통(TCA·곰팡이) 색출·스팟 통 감별 · 환경통제: 증발↓·오염 확률↓ · 성실: 누수 확률↓·로테이션 여력↑',
  sales: '친화: 가격 민감도↓ · 네트워크: 유통 커버리지·소매 처리 역량↑(70↑ 고급 유통망) · 협상: 유통 마진↓',
  office: '세무: 세무조사 추징 감면 · 협상: 드래프·지게미 사료 판매 단가↑ · 행정: (후속)',
  blender: '블렌딩 테이블 — 후각: 원액을 읽는 오차↓ · 미각: 블렌드 예측 띠↓ · 감정력: 레어 캐스크 발견·샘플링 여력↑. 없으면 대표가 직접(오차 큼)',
};

function StatBar({ name, value }: { name: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 text-stone-500">{name}</span>
      <div className="h-1.5 flex-1 rounded bg-stone-200 dark:bg-stone-800"><div className="h-1.5 rounded bg-amber-600" style={{ width: `${value}%` }} /></div>
      <span className="w-6 text-right tabular-nums">{value}</span>
    </div>
  );
}

/** 사기 막대 (#225) — 낮을 때만 눈에 띄게: 30 미만 이직 위험, 50 미만 주의 */
function MoraleBar({ value, title, effect }: { value: number; title: string; effect?: string }) {
  const low = value < MORALE.quitBelow;
  const color = low ? 'bg-rose-600' : value < 50 ? 'bg-amber-500' : 'bg-emerald-600';
  return (
    <div className="flex items-center gap-2 text-xs" title={title}>
      <span className="w-14 text-stone-500">사기</span>
      <div className="h-1.5 flex-1 rounded bg-stone-200 dark:bg-stone-800"><div className={`h-1.5 rounded ${color}`} style={{ width: `${value}%` }} /></div>
      <span className="w-6 text-right tabular-nums">{Math.round(value)}</span>
      {low && <Badge tone="bad">이직 위험</Badge>}
      {effect && <span className="text-stone-500">{effect}</span>}
    </div>
  );
}

/** "뽑으면" 전→후 숫자 (P-MGT-28) */
function Impact({ lines }: { lines: ImpactLine[] }) {
  return (
    <div className="mt-2 rounded-md bg-stone-50 px-2 py-1 text-xs dark:bg-stone-800/50">
      <div className="font-medium text-stone-600 dark:text-stone-300">뽑으면</div>
      {lines.map((l) => (
        <div key={l.label} className="tabular-nums">
          {l.label} <span className="text-stone-500">{l.before}</span> → <b>{l.after}</b>{l.note && <span className="text-stone-500"> · {l.note}</span>}
        </div>
      ))}
    </div>
  );
}

function Traits({ x }: { x: StaffT }) {
  if (!x.traits?.length) return null;
  return <span className="ml-1 inline-flex gap-1">{x.traits.map((t) => <span key={t} title={TRAIT_INFO[t].desc}><Badge tone="info">{TRAIT_INFO[t].nameKo}</Badge></span>)}</span>;
}

function Person({ x, action, month, tag, morale, extra }: { x: StaffT & { askSalary?: number }; action: React.ReactNode; month: number; tag?: React.ReactNode; morale?: React.ReactNode; extra?: React.ReactNode }) {
  const info = ROLE_INFO[x.role];
  // 후보(hiredMonth −1)는 입사 나이 그대로 — ageOf에 넣으면 지금 달만큼 나이를 더 먹은 것으로 보였다(166개월째 후보가 +14세, "은퇴 임박")
  const age = Math.floor(x.hiredMonth < 0 ? (x.ageAtHire ?? 40) : ageOf(x, month));
  const tenureY = x.hiredMonth >= 0 ? Math.floor(tenureOf(x, month) / 12) : 0;
  return (
    <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="font-medium">{x.name}<Traits x={x} /></div>
          <div className="text-xs text-stone-500">{info.nameKo} · Lv.{x.level}{x.hiredMonth >= 0 && ` · XP ${Math.round(x.xp)}/${100 * x.level}`} · {age}세{x.hiredMonth >= 0 ? ` · 근속 ${tenureY}년` : ''}{x.hiredMonth >= 0 && tenureOf(x, month) >= AGING_TENURE_MONTHS ? ' (근속 20년↑ 기량 하락기)' : ''}{RETIRE_AGE - age <= 3 ? ` · ${RETIRE_AGE}세 은퇴 임박` : ''}</div>
          {tag}
        </div>
        <Badge>{won(x.askSalary ?? x.salary)}/월</Badge>
      </div>
      <div className="grid gap-1">
        <StatBar name={info.stats[0]} value={x.stats.a} />
        <StatBar name={info.stats[1]} value={x.stats.b} />
        <StatBar name={info.stats[2]} value={x.stats.c} />
        {morale}
      </div>
      {extra}
      <div className="mt-2">{action}</div>
    </div>
  );
}

/** 해고 확인 미리보기 (#240, #246) — 위로금·급여·사기·하우스 스타일·부사수. 계산은 actions.mgt.ts fire·hr.ts handleDeparture와 같다 */
function FirePreview({ s, x }: { s: GameState; x: StaffT }) {
  const others = s.hr.staff.filter((y) => y.id !== x.id);
  const house = departureHouseStyle(s, x);
  const apprentices = others.filter((y) => y.apprenticeOf === x.id && y.id !== house?.heir?.id);
  const lastDistiller = x.role === 'distiller' && !others.some((y) => y.role === 'distiller');
  return <>
    {x.name}({ROLE_INFO[x.role].nameKo}, Lv.{x.level})을(를) 내보낸다 — 위로금 <b>{won(x.salary)}</b> 지금 지급, 월 급여 {won(s.hr.staff.reduce((t, y) => t + y.salary, 0))} → {won(others.reduce((t, y) => t + y.salary, 0))}.
    {moraleOn(s) && others.length > 0 && <> 남은 직원 {others.length}명 사기 −{MORALE.fired}{others.some((y) => moraleOf(y) - MORALE.fired < MORALE.quitBelow) ? ` (${MORALE.quitBelow} 아래로 떨어지는 직원이 생긴다 — 이직 위험)` : ''}.</>}
    {house && house.mode === 'heir' && <> 마스터 디스틸러 — 부사수 {house.heir!.name}이(가) 잇는다: 하우스 스타일 {Math.round(s.hr.houseStyle)} → {house.after}.</>}
    {house && house.mode === 'record' && <> 마스터 디스틸러 — 전수 기록 덕분에 하우스 스타일 {Math.round(s.hr.houseStyle)} → {house.after}.</>}
    {house && house.mode === 'reset' && <b> 마스터 디스틸러 — 이을 부사수(24개월 이상)가 없어 하우스 스타일 {Math.round(s.hr.houseStyle)} → 0.</b>}
    {apprentices.length > 0 && <> 부사수 {apprentices.map((y) => y.name).join('·')}은(는) 스승을 잃는다.</>}
    {lastDistiller && <b> 마지막 디스틸러다 — 새로 뽑을 때까지 생산할 수 없다.</b>}
  </>;
}

/** 연봉 협상이 기다리고 있으면 인상·동결의 숫자를 보이고 여기서 고를 수 있다 (P-MGT-28) — 고르지 않으면 다음 달 동결 */
function SalaryReviewCard() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const p = s.events.pending.find((e) => e.defId === 'salary_review');
  if (!p || !s.hr.staff.length) return null;
  const v = salaryReviewPreview(s);
  const min = Math.round(Math.min(...s.hr.staff.map(moraleOf)));
  return (
    <Card title="연봉 협상 — 이번 달 결정 (고르지 않으면 다음 달 동결)">
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-md border border-stone-200 p-2 dark:border-stone-800">
          <div className="font-medium">인상</div>
          <div className="text-xs text-stone-600 dark:text-stone-400">월 급여 <b>+{won(v.raiseCost)}</b>(연 {won(v.raiseCost * 12)}, 협상가는 절반) · 사기 최저 {min} → {Math.round(v.raiseMin)} · 경험치 배수↑</div>
          <Button small variant="primary" onClick={() => dispatch({ type: 'resolveEvent', eventId: p.id, choice: 0 })}>인상</Button>
        </div>
        <div className="rounded-md border border-stone-200 p-2 dark:border-stone-800">
          <div className="font-medium">동결</div>
          <div className="text-xs text-stone-600 dark:text-stone-400">비용 없음 · 사기 최저 {min} → <b>{Math.round(v.freezeMin)}</b>(토박이는 절반){v.freezeAtRisk > 0 ? <b className="text-rose-700 dark:text-rose-400"> · {MORALE.quitBelow} 아래로 {v.freezeAtRisk}명 — 이직 위험</b> : ` · ${MORALE.quitBelow} 아래로 떨어지는 직원 없음`}</div>
          <Button small onClick={() => dispatch({ type: 'resolveEvent', eventId: p.id, choice: 1 })}>동결</Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-stone-500">사기는 매달 {MORALE.base} 쪽으로 돌아간다. 사기가 높으면 경험치가 빨리 쌓이고(레벨업 = 스탯↑·급여 +5%), {MORALE.quitBelow} 미만이면 매달 이직할 수 있다(하나뿐인 디스틸러는 남는다).</p>
    </Card>
  );
}

export function Staff() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  // HR이 잠긴 시나리오(MVP)는 직원 관리 버튼을 숨기고 언제 열리는지 알린다 (#232 — 11년 차 단계)
  const hrOn = moraleOn(s);
  const opens = hrOn ? undefined : pendingStages(s).find((st) => st.unlock.includes('system:hr'));
  const lockedNote = opens ? `직원 관리(채용·교육·헤드헌팅·해고)는 ${Math.floor(opens.month / 12) + 1}년 차에 열린다 — ${opens.month - s.month}개월 뒤` : '이 시나리오에서는 직원을 관리할 수 없다';
  return (
    <div className="grid gap-4">
      <Card title={`직원 (${s.hr.staff.length}명 · 월 급여 ${won(s.hr.staff.reduce((t, x) => t + x.salary, 0))}) · 하우스 스타일 ${Math.round(s.hr.houseStyle)}`}>
        {!s.hr.staff.length ? <Empty>직원이 없습니다. 디스틸러가 없으면 생산할 수 없습니다.</Empty> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {s.hr.staff.map((x) => {
              const master = masterDistiller(s);
              const mentor = mentoringXp(s, x);
              const tag = <>
                {x.id === master?.id ? <Badge tone="good">마스터 디스틸러</Badge> : x.apprenticeOf ? <Badge tone="info">부사수 · 수련 {s.month - x.hiredMonth}/{APPRENTICE_MONTHS}개월</Badge> : null}
                {mentor > 0 && <span className="ml-1 text-xs text-emerald-700 dark:text-emerald-400" title="부사수이거나 같은 직군에 레벨 2 이상 높은 선배가 있으면 매달 XP를 더 얻는다">멘토링 XP +{mentor}/월</span>}
              </>;
              const wait = trainingCooldown(s, x.id);
              const short = payShortfall(s, x);
              const morale = moraleOn(s) ? <MoraleBar value={moraleOf(x)} effect={moraleEffect(x)} title={`매달 ${MORALE.base} 쪽으로 돌아간다. 시세 ${won(Math.round(marketSalary(s, x)))}/월${short > 0 ? ` — ${Math.round(short * 100)}% 덜 받아 매달 −${(short * 100 * MORALE.payShortfall).toFixed(1)}` : ''}. 교육 +${MORALE.training}, 해고 때 남은 직원 −${MORALE.fired}, 1월 연봉 협상(인상 +${MORALE.raiseMorale} / 동결 ${MORALE.freezeMorale}). ${MORALE.quitBelow} 미만이면 이직할 수 있다`} /> : null;
              return <Person key={x.id} x={x} month={s.month} tag={tag} morale={morale} extra={hrOn && wait === 0 ? <div className="mt-2 text-xs text-stone-500">{trainingImpact(s, x)}</div> : null} action={!hrOn ? null : <div className="flex flex-wrap gap-1">
                <Button small disabled={wait > 0 || s.finance.cash < trainingCost(x)} onClick={() => dispatch({ type: 'trainStaff', staffId: x.id })} title={`교육 프로그램 — 월급 ${TRAINING.costMonths}개월 치, XP +${TRAINING.xpPerLevel * x.level}(반 레벨), 같은 직원은 ${TRAINING.cooldownMonths}개월에 한 번`}>{wait > 0 ? `교육 (${wait}개월 뒤)` : `교육 ${won(trainingCost(x))}`}</Button>
                <ConfirmButton small variant="danger" armKey={`fire-${x.id}@${s.month}`} armedLabel="한 번 더 누르면 내보낸다" preview={() => <FirePreview s={s} x={x} />} onConfirm={() => dispatch({ type: 'fire', staffId: x.id })}>내보내기 (위로금 1개월)</ConfirmButton>
              </div>} />;
            })}
          </div>
        )}
      </Card>
      {hrOn && <SalaryReviewCard />}
      {!hrOn ? <Card title="채용"><Empty>{lockedNote}</Empty></Card> : <Card title="채용 후보 (분기마다 갱신)">
        {/* 지금 막힌 곳 (P-MGT-28) — 어느 직군을 뽑아야 결과가 바뀌는지 */}
        {(() => { const b = bottlenecks(s); return b.length ? (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="font-medium">지금 막힌 곳</div>
            <ul className="list-disc pl-4">{b.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        ) : null; })()}
        <ul className="mb-3 grid gap-1 text-xs text-stone-500">
          {(Object.keys(ROLE_EFFECT) as StaffT['role'][]).map((r) => <li key={r}><span className="font-medium text-stone-700 dark:text-stone-300">{ROLE_INFO[r].nameKo}</span> — {ROLE_EFFECT[r]}</li>)}
        </ul>
        <div className="mb-3 flex flex-wrap items-center gap-1 text-xs text-stone-500">
          <span title={`비용 = 그 직군 기본급 ${HEADHUNT.costMonths}개월 치(지역 인건비 반영), 스탯 평균 ${HEADHUNT.statMean} 안팎 후보 1명 — 다음 후보 갱신 때까지 남는다`}>헤드헌팅 (직군마다 한 달에 한 번):</span>
          {(Object.keys(ROLE_INFO) as StaffT['role'][]).map((r) => (
            <Button key={r} small disabled={headhuntedThisMonth(s, r) || s.finance.cash < headhuntCost(s, r)} onClick={() => dispatch({ type: 'headhunt', role: r })}>{ROLE_INFO[r].nameKo} {won(headhuntCost(s, r))}</Button>
          ))}
        </div>
        {!s.hr.candidates.length ? <Empty>후보가 없습니다</Empty> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {s.hr.candidates.map((x) => <Person key={x.id} x={x} month={s.month} extra={<Impact lines={hireImpact(s, x)} />} action={<div className="flex gap-1"><Button small variant="primary" onClick={() => dispatch({ type: 'hire', candidateId: x.id })}>채용</Button>{x.role === 'distiller' && <Button small onClick={() => dispatch({ type: 'hire', candidateId: x.id, asApprentice: true })} title="급여 60%, 마스터 곁에서 24개월 이상 배우면 은퇴 때 하우스 스타일을 잇는다">부사수로 채용</Button>}</div>} />)}
          </div>
        )}
      </Card>}
      <Research />
    </div>
  );
}
