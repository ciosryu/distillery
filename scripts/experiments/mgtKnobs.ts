// MGT 실험 손잡이 (단계 T 측정 준비 T-0, docs/design/mgt-stage-t.md) — 환경 변수로 켠다. 아무것도 안 주면 아무 일도 하지 않는다(출력 불변).
//   LEVEL_RAISE=<비율>      레벨업 급여 인상률 (기본 0.05, M1 · #211)
//   BANK_SCREEN=and|or       은행 심사를 켠다 (게임 기본은 꺼짐, M2 · #210 — 규칙은 src/sim/loans.ts bankScreening)
//   HIRE_SALES_AT=<개월>     그 달부터(HR이 열려 있으면) 영업 직원 1명을 채용한다 — 후보 중 네트워크(b) 최고, 없으면 헤드헌팅 (M4 · #251)
//   SALARY_REVIEW=raise|freeze  연봉 협상 선택을 봇이 고른다 (기본: 고르지 않음 = 다음 달 동결, M5 · #225)
//   티어 분해(MGT-B, 요구사항 감사 Phase B) — 새 판을 만든 직후 applyTierKnobs(s)가 넣는다(mvp-human.ts):
//   TIER_OVERHEAD=<원>      월 관리비 (micro 300만 · standard 1,000만)
//   TIER_EQUITY=<원>        시작 자기자본 — 시작 현금을 그 차이만큼 바꾸고 순자산 목표의 기준도 바꾼다 (micro 5억 · standard 8억)
//   TIER_WAREHOUSE=<통>     시작 숙성고 용량 (micro 90 · standard 150)
//   GOAL_MULT=<배수>        순자산 목표 배수 (기본 3) — 목표만 바꾸고 판 진행은 같다
//   SALARY_SCALE=<배수>     시작 직원 급여 배수 (C-MGT-1 — MVP는 HR이 120개월까지 잠겨 급여를 못 줄인다. "급여 조정 허용"의 상한 효과)
//   EVENTS_EARLY=1          랜덤 이벤트를 0개월부터 연다 (MVP는 60개월에 연다 — Death Valley 구간의 사건 위험을 보는 민감도)
//   DIFF=easy|normal|hard|custom:<6자리>  난이도 시작 스냅샷(F6c, [결정 #313·#314] — architecture §10.10). custom 자리 순서 = macro·competition·taste·supply·incidents·finance, 값 1·2·3.
//                           mvp-human.ts는 사업 계획서(`BusinessPlan.difficulty`)로, balance-sim.ts(샌드박스)는 새 판에 넣는다. 없으면 = 지금 기준선(Normal과 같은 출력)
// balance-sim.ts·mvp-survival.ts가 맨 앞에서 applyMgtKnobs()를 부르고, 매달 행동 끝에 mgtPolicy(s)를 부른다
import { applyAction, isLocked, salaryFor, type Candidate, type GameState } from '../../src/sim';
import { DIFFICULTY_DOMAINS, normalizeDifficulty } from '../../src/sim/content/difficulty';
import { laborMul, staffLaborCost } from '../../src/sim/mgtKnobs';
import type { DifficultyConfig, DifficultyDomain, DifficultyLevel } from '../../src/sim/types';
import { HR_TUNING } from '../../src/sim/hr';
import { BANK_SCREENING } from '../../src/sim/content/finance';

const env = process.env;
export const MGT_KNOBS = {
  hireSalesAt: env.HIRE_SALES_AT != null ? Number(env.HIRE_SALES_AT) : null,
  salaryReview: (env.SALARY_REVIEW === 'raise' || env.SALARY_REVIEW === 'freeze' ? env.SALARY_REVIEW : null) as 'raise' | 'freeze' | null,
};

/** 환경 변수를 게임 손잡이에 넣는다. 켠 것이 있으면 한 줄 설명(stderr)을 남긴다 */
export function applyMgtKnobs(): string {
  const on: string[] = [];
  if (env.LEVEL_RAISE != null) { HR_TUNING.levelRaise = Number(env.LEVEL_RAISE); on.push(`levelRaise=${HR_TUNING.levelRaise}`); }
  if (env.BANK_SCREEN === 'and' || env.BANK_SCREEN === 'or') { BANK_SCREENING.enabled = true; BANK_SCREENING.mode = env.BANK_SCREEN; on.push(`bankScreen=${env.BANK_SCREEN}`); }
  if (MGT_KNOBS.hireSalesAt != null) on.push(`hireSalesAt=${MGT_KNOBS.hireSalesAt}`);
  if (MGT_KNOBS.salaryReview) on.push(`salaryReview=${MGT_KNOBS.salaryReview}`);
  for (const k of ['TIER_OVERHEAD', 'TIER_EQUITY', 'TIER_WAREHOUSE', 'GOAL_MULT', 'SALARY_SCALE', 'EVENTS_EARLY']) if (env[k] != null && env[k] !== '') on.push(`${k}=${env[k]}`);
  if (DIFF) on.push(`DIFF=${DIFF.preset}(${DIFFICULTY_DOMAINS.map((d) => DIFF!.levels[d]).join('')})`);
  const label = on.join(' ');
  if (label) console.error(`MGT 손잡이: ${label}`);
  return label;
}

/** 티어 손잡이를 새 판에 넣는다(MGT-B). 아무것도 없으면 s를 그대로 돌려준다 */
export function applyTierKnobs(s: GameState): GameState {
  const n = (k: string) => (env[k] != null && env[k] !== '' ? Number(env[k]) : null);
  const overhead = n('TIER_OVERHEAD'), equity = n('TIER_EQUITY'), warehouse = n('TIER_WAREHOUSE'), mult = n('GOAL_MULT'), salary = n('SALARY_SCALE');
  const early = env.EVENTS_EARLY === '1';
  if (overhead == null && equity == null && warehouse == null && mult == null && salary == null && !early) return s;
  if (!s.scenario) throw new Error('티어 손잡이는 시나리오 판에서만 쓴다');
  const sc = { ...s.scenario, economy: { ...s.scenario.economy }, goal: { ...s.scenario.goal } };
  let cash = s.finance.cash;
  if (overhead != null) sc.economy.overheadPerMonth = overhead;
  if (equity != null) { cash += equity - sc.equity; sc.equity = equity; }
  if (mult != null) sc.goal.netWorthMultiple = mult;
  if (early) sc.locked = sc.locked.filter((k) => k !== 'system:events');
  const hr = salary != null ? { ...s.hr, staff: s.hr.staff.map((x) => ({ ...x, salary: Math.round((x.salary * salary) / 10_000) * 10_000 })) } : s.hr;
  return { ...s, scenario: sc, hr, finance: { ...s.finance, cash }, inventory: warehouse != null ? { ...s.inventory, warehouseBase: warehouse } : s.inventory };
}

/** 그 달부터(HR이 열려 있으면) 영업 직원 1명 채용 — 후보 중 네트워크(b) 최고, 없으면 헤드헌팅. 이미 그 뒤에 뽑았으면 그대로 */
export function hireSales(s: GameState, from: number): GameState {
  if (s.month < from || isLocked(s, 'system:hr') || s.hr.staff.some((x) => x.role === 'sales' && x.hiredMonth >= from)) return s;
  let c: Candidate | undefined = s.hr.candidates.filter((x) => x.role === 'sales').sort((a, b) => b.stats.b - a.stats.b)[0];
  if (!c) {
    const r = applyAction(s, { type: 'headhunt', role: 'sales' });
    if (!r.error) { s = r.state; c = s.hr.candidates.filter((x) => x.role === 'sales').at(-1); }
  }
  return c ? applyAction(s, { type: 'hire', candidateId: c.id }).state : s;
}

/** 매달 봇 행동 끝 — 영업 채용·연봉 협상 선택. 손잡이가 꺼져 있으면 s를 그대로 돌려준다 */
export function mgtPolicy(s: GameState): GameState {
  const k = MGT_KNOBS;
  if (k.hireSalesAt != null) s = hireSales(s, k.hireSalesAt);
  if (k.salaryReview) {
    const p = s.events.pending.find((e) => e.defId === 'salary_review');
    if (p) s = applyAction(s, { type: 'resolveEvent', eventId: p.id, choice: k.salaryReview === 'raise' ? 0 : 1 }).state;
  }
  return s;
}

/**
 * `DIFF=` 환경 변수 → 난이도 스냅샷(F6c, MGT). `easy|normal|hard` 또는 `custom:<6자리>`(자리 순서 = `DIFFICULTY_DOMAINS`, 값 1·2·3).
 * 없으면 undefined — 판을 지금처럼 만든다(기존 기준선 그대로). 잘못된 값은 예외(조용히 Normal로 돌지 않게)
 */
export function difficultyFromEnv(v: string | undefined = env.DIFF): DifficultyConfig | undefined {
  if (v == null || v === '') return undefined;
  if (v === 'easy' || v === 'normal' || v === 'hard') return normalizeDifficulty(v);
  const m = /^custom:([123]{6})$/.exec(v);
  if (!m) throw new Error(`DIFF=${v} — easy|normal|hard|custom:<6자리 1~3, 순서 ${DIFFICULTY_DOMAINS.join('·')}>`);
  const levels = Object.fromEntries(DIFFICULTY_DOMAINS.map((d, i) => [d, Number(m[1]![i]) as DifficultyLevel])) as Record<DifficultyDomain, DifficultyLevel>;
  return normalizeDifficulty({ preset: 'custom', levels });
}
/** 이 실행의 실험 난이도(없으면 undefined) */
export const DIFF = difficultyFromEnv();

/**
 * 샌드박스 판(`newGame` — 난이도 그릇이 없다, #314는 캠페인 설정)에 실험 난이도를 넣는다. 시작 직원 급여는 인건비 배수로 다시 정한다
 * (`newScenario`와 같은 규칙 — 배수 1이면 건너뛴다). DIFF가 없으면 s를 그대로 돌려준다
 */
export function applyDifficulty(s: GameState, d: DifficultyConfig | undefined = DIFF): GameState {
  if (!d) return s;
  s.difficulty = d;
  if (laborMul(s) !== 1) for (const x of s.hr.staff) x.salary = salaryFor(x.role, x.stats, x.level, staffLaborCost(s));
  return s;
}
