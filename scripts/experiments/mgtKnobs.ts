// MGT 실험 손잡이 (단계 T 측정 준비 T-0, mvp.md "단계 T — MGT 측정 계획") — 환경 변수로 켠다. 아무것도 안 주면 아무 일도 하지 않는다(출력 불변).
//   LEVEL_RAISE=<비율>      레벨업 급여 인상률 (기본 0.05, M1 · #211)
//   BANK_SCREEN=and|or       은행 심사를 켠다 (게임 기본은 꺼짐, M2 · #210 — 규칙은 src/sim/loans.ts bankScreening)
//   HIRE_SALES_AT=<개월>     그 달부터(HR이 열려 있으면) 영업 직원 1명을 채용한다 — 후보 중 네트워크(b) 최고, 없으면 헤드헌팅 (M4 · #251)
//   SALARY_REVIEW=raise|freeze  연봉 협상 선택을 봇이 고른다 (기본: 고르지 않음 = 다음 달 동결, M5 · #225)
// balance-sim.ts·mvp-survival.ts가 맨 앞에서 applyMgtKnobs()를 부르고, 매달 행동 끝에 mgtPolicy(s)를 부른다
import { applyAction, isLocked, type Candidate, type GameState } from '../../src/sim';
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
  const label = on.join(' ');
  if (label) console.error(`MGT 손잡이: ${label}`);
  return label;
}

/** 매달 봇 행동 끝 — 영업 채용·연봉 협상 선택. 손잡이가 꺼져 있으면 s를 그대로 돌려준다 */
export function mgtPolicy(s: GameState): GameState {
  const k = MGT_KNOBS;
  if (k.hireSalesAt != null && s.month >= k.hireSalesAt && !isLocked(s, 'system:hr') && !s.hr.staff.some((x) => x.role === 'sales' && x.hiredMonth >= k.hireSalesAt!)) {
    let c: Candidate | undefined = s.hr.candidates.filter((x) => x.role === 'sales').sort((a, b) => b.stats.b - a.stats.b)[0];
    if (!c) {
      const r = applyAction(s, { type: 'headhunt', role: 'sales' });
      if (!r.error) { s = r.state; c = s.hr.candidates.filter((x) => x.role === 'sales').at(-1); }
    }
    if (c) s = applyAction(s, { type: 'hire', candidateId: c.id }).state;
  }
  if (k.salaryReview) {
    const p = s.events.pending.find((e) => e.defId === 'salary_review');
    if (p) s = applyAction(s, { type: 'resolveEvent', eventId: p.id, choice: k.salaryReview === 'raise' ? 0 : 1 }).state;
  }
  return s;
}
