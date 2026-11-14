import { useMemo, useState } from 'react';
import { MVP_KR, previewPlan, type DifficultyConfig, type DifficultyDomain, type DifficultyLevel, type DifficultyPreset, type ScenarioTierDef } from '../sim';
import { DIFFICULTY_DOMAINS, DIFFICULTY_DOMAIN_KO, normalizeDifficulty } from '../sim/content/difficulty';
import { HARD_STACK_WARN_AT, LEVEL_KO, LOCKED_DOMAINS, PRESET_KO, difficultyLabel, hardCount } from './difficultyLabel';
import { useGame } from '../store/game';
import { months, pct, won } from './format';
import { Badge, Button, Card, TextField } from './kit';

// 사업 계획서 — MVP 시나리오의 새 게임 입구 (skeleton S-8, #140·3)
// ① 규모 티어 ② 시작 자금 조달(기존 대출 상품을 미리 당겨 받는다) ③ 난이도(F6c, [결정 #313·#314] — 6영역 × 3단계, 프리셋/사용자 설정, 시작 스냅샷) ④ 재무 시뮬레이터(실시간 런웨이)

const LEVELS: DifficultyLevel[] = [1, 2, 3];
const PRESETS: Exclude<DifficultyPreset, 'custom'>[] = ['easy', 'normal', 'hard'];

const STEP = 10_000_000;

export function BusinessPlan({ onClose, onSandbox }: { onClose?: () => void; onSandbox?: () => void }) {
  const startScenario = useGame((g) => g.startScenario);
  const scenario = MVP_KR;
  const [tierId, setTierId] = useState<ScenarioTierDef['id']>(scenario.defaultTier);
  const [loan, setLoan] = useState(0);
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyConfig>(() => normalizeDifficulty('normal'));
  const [detail, setDetail] = useState(false);
  const setLevel = (d: DifficultyDomain, lv: DifficultyLevel) => setDifficulty((c) => normalizeDifficulty({ preset: 'custom', levels: { ...c.levels, [d]: lv } }));
  const hards = hardCount(difficulty);
  const tier = scenario.tiers.find((t) => t.id === tierId)!;
  const loanAmount = Math.min(loan, tier.funding.max);
  const p = useMemo(() => previewPlan({ scenarioId: scenario.id, tierId, loanAmount, difficulty }), [scenario.id, tierId, loanAmount, difficulty]); // 난이도(금융 손잡이)가 시작 대출·급여에 닿으면 시뮬레이터도 같은 값을 본다
  const graceEnd = p.loans.length ? Math.min(...p.loans.map((l) => l.graceMonths)) : 0;
  const leverage = p.cashStart > 0 ? p.loanTotal / p.cashStart : 0;

  return (
    <Card title="사업 계획서 — 새 증류소" actions={onClose && <Button variant="ghost" small onClick={onClose}>닫기</Button>}>
      <p className="mb-3 text-sm text-stone-600 dark:text-stone-300">{scenario.nameKo}. 15년 안에 12년 숙성 플래그십을 내고, 파산하지 않고, 순자산을 시작 자기자본의 {scenario.goal.netWorthMultiple}배로 키운다.</p>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <section>
            <h3 className="mb-2 text-sm font-semibold">1. 증류소 규모</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {scenario.tiers.map((t) => {
                const on = t.id === tierId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={!!t.locked}
                    title={t.locked?.reason}
                    aria-pressed={on}
                    onClick={() => { setTierId(t.id); setLoan((v) => Math.min(v, t.funding.max)); }}
                    className={`rounded-lg border p-3 text-left text-sm ${on ? 'border-amber-600 bg-amber-50 dark:border-amber-400 dark:bg-amber-950' : 'border-stone-300 dark:border-stone-700'} ${t.locked ? 'cursor-not-allowed opacity-50' : 'hover:border-amber-500'}`}
                  >
                    <div className="font-semibold">{t.locked ? '🔒 ' : ''}{t.nameKo}</div>
                    <div className="mt-1 text-xs text-stone-600 dark:text-stone-300">{t.locked ? t.locked.reason : t.tagline}</div>
                    {!t.locked && (
                      <ul className="mt-2 space-y-0.5 text-xs tabular-nums">
                        <li>자기자본 {won(t.equity)}</li>
                        <li>관리비 월 {won(t.overheadPerMonth)}</li>
                        <li>숙성고 {t.warehouseBase}통</li>
                      </ul>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">2. 시작 자금 조달</h3>
            <label className="block text-sm">
              <span className="flex justify-between"><span>시작 대출 (정책·시설자금을 미리 받는다)</span><span className="font-semibold tabular-nums">{won(loanAmount)} / {won(tier.funding.max)}</span></span>
              <input type="range" className="mt-1 w-full accent-amber-700" min={0} max={tier.funding.max} step={STEP} value={loanAmount} onChange={(e) => setLoan(Number(e.target.value))} aria-label="시작 대출" />
            </label>
            <div className="mt-2 flex h-3 overflow-hidden rounded bg-stone-200 dark:bg-stone-700" aria-hidden>
              <div className="bg-emerald-600" style={{ width: `${(1 - leverage) * 100}%` }} />
              <div className="bg-rose-600" style={{ width: `${leverage * 100}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-xs text-stone-600 dark:text-stone-300"><span>내 자본금 {won(p.equity)}</span><span>대출 {won(p.loanTotal)} ({pct(leverage, 0)})</span></div>
            {p.loans.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-stone-600 dark:text-stone-300">
                {p.loans.map((l) => <li key={l.offerId}>{l.name} — {won(l.amount)} · 연 {pct(l.annualRate)} · 거치 {l.graceMonths}개월 뒤 월 {won(l.paymentAfterGrace)}</li>)}
              </ul>
            )}
            <p className="mt-2 text-xs text-stone-500">미리 받은 상품은 게임 중에 다시 받을 수 없다 — 시작 대출과 게임 중 대출은 같은 한도를 나눠 쓴다.</p>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">3. 난이도 <span className="ml-1 font-normal text-stone-500">— {difficultyLabel(difficulty)}</span></h3>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="난이도 프리셋">
              {PRESETS.map((pr) => {
                const on = difficulty.preset === pr;
                return (
                  <button key={pr} type="button" role="radio" aria-checked={on} onClick={() => setDifficulty(normalizeDifficulty(pr))}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${on ? 'border-amber-600 bg-amber-50 dark:border-amber-400 dark:bg-amber-950' : 'border-stone-300 hover:border-amber-500 dark:border-stone-700'}`}>
                    {PRESET_KO[pr]}
                  </button>
                );
              })}
              <Button variant="ghost" small onClick={() => setDetail((v) => !v)} title="6영역을 따로 고른다 — 하나라도 바꾸면 사용자 설정">{detail ? '세부 설정 접기' : '세부 설정'}{difficulty.preset === 'custom' ? ' · 사용자 설정' : ''}</Button>
            </div>
            {detail && (
              <table className="mt-2 w-full text-xs">
                <tbody>
                  {DIFFICULTY_DOMAINS.map((d) => {
                    const locked = LOCKED_DOMAINS.has(d);
                    return (
                      <tr key={d} className="border-t border-stone-200 dark:border-stone-800">
                        <td className="py-1 pr-2 font-medium">{DIFFICULTY_DOMAIN_KO[d]}</td>
                        <td className="py-1">
                          {locked ? <span className="text-stone-500">준비 중 — 경쟁 AI와 함께 열린다(지금은 보통 고정)</span> : (
                            <div className="flex gap-1" role="radiogroup" aria-label={`${DIFFICULTY_DOMAIN_KO[d]} 난이도`}>
                              {LEVELS.map((lv) => {
                                const on = difficulty.levels[d] === lv;
                                return <button key={lv} type="button" role="radio" aria-checked={on} onClick={() => setLevel(d, lv)} className={`rounded border px-2 py-0.5 ${on ? 'border-amber-600 bg-amber-50 dark:border-amber-400 dark:bg-amber-950' : 'border-stone-300 dark:border-stone-700'}`}>{LEVEL_KO[lv]}</button>;
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <ul className="mt-2 space-y-0.5 text-xs text-stone-500">
              <li>난이도는 판을 시작할 때 정해지고 플레이 중 바꿀 수 없다. 모든 난이도가 같은 규칙으로 돈다 — 숙성·숨은 품질·승리 조건은 난이도로 바뀌지 않는다.</li>
              <li>원자재·공급망과 사고·재난 이벤트는 6년 차부터 열린다 — 그 전에는 거시경제·금융 환경이 체감 난이도를 맡는다.</li>
              <li>지금(개발 중)은 쉬움·어려움의 크기가 아직 정해지지 않아 모든 난이도가 보통과 같은 값으로 돈다 — 선택은 저장되고, 크기는 다음 측정 뒤 정한다.</li>
              {hards >= HARD_STACK_WARN_AT && <li className="text-rose-700 dark:text-rose-400">⚠ 어려움을 {hards}개 영역에 겹쳐 골랐다 — 복합 충격이 한 달에 몰릴 수 있다(한 달 새 이벤트 상한은 그대로).</li>}
              {difficulty.preset === 'custom' && <li>사용자 설정 판은 공식 기록(프리셋)과 따로 센다.</li>}
            </ul>
          </section>

          <div className="flex flex-wrap items-end gap-2">
            <TextField label="증류소 이름" value={name} onChange={setName} />
            <Button variant="primary" onClick={() => { startScenario({ scenarioId: scenario.id, tierId, loanAmount, distilleryName: name || undefined, difficulty }); onClose?.(); }}>사업 시작</Button>
            {onSandbox && <Button variant="ghost" small onClick={onSandbox} title="모든 시스템이 켜지고 MVP 경제 설정이 없는 개발용 판 — 플레이테스트는 왼쪽 '사업 시작'">개발자용 샌드박스 (플레이테스트용 아님)</Button>}
          </div>
        </div>

        <section className="rounded-lg border border-stone-200 p-3 text-sm dark:border-stone-700" aria-live="polite">
          <h3 className="mb-2 font-semibold">4. 재무 시뮬레이터</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 tabular-nums">
            <dt className="text-stone-600 dark:text-stone-300">시작 현금</dt><dd className="text-right font-semibold">{won(p.cashStart)}</dd>
            <dt className="text-stone-600 dark:text-stone-300">예상 월 고정 지출</dt><dd className="text-right">{won(p.fixedMonthly)}</dd>
            <dt className="text-stone-600 dark:text-stone-300">대출 이자 (거치 중)</dt><dd className="text-right">{won(p.loanPaymentNow)}</dd>
            <dt className="text-stone-600 dark:text-stone-300">거치 기간 이후 월 상환액</dt><dd className={`text-right ${p.loanPaymentAfterGrace > 0 ? 'font-semibold text-rose-700 dark:text-rose-400' : ''}`}>{won(p.loanPaymentAfterGrace)}{graceEnd > 0 && <span className="ml-1 text-xs font-normal">({graceEnd}개월 차부터)</span>}</dd>
            <dt className="text-stone-600 dark:text-stone-300">15년 순자산 목표</dt><dd className="text-right">{won(p.goalNetWorth)}</dd>
          </dl>
          <div className={`mt-3 rounded-md p-2 ${p.runwayMonths < 24 ? 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100'}`}>
            <div className="text-xs">현재 런웨이</div>
            <div className="text-base font-semibold">{p.runwayCapped ? '20년 이상' : months(p.runwayMonths)}</div>
            <div className="text-xs">매출이 0원이면 이만큼 뒤 현금이 바닥납니다 (그 뒤 3개월 연속 적자면 파산). 캐스크·설비 구매는 빼고 셌다.</div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1 text-xs">
            <Badge tone="info">첫 위스키: 한국 법정 최소 숙성 12개월 뒤</Badge>
            <Badge>{tier.staff.length + 1}명 고정 인력</Badge>
          </div>
        </section>
      </div>
    </Card>
  );
}
