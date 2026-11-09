import { ROLE_INFO } from './content/catalog';
import { regionOf } from './content/regions';
import { clamp } from './flavor';
import { rngFor, type Rng } from './rng';
import type { Candidate, GameState, Staff, StaffRole, StaffTrait } from './types';
import { houseBrand } from './brands';
import { systemOn } from './scenario';
import { SCENARIOS } from './content/scenarios';
import { nid } from './util';
import { addModifier, isActive, mod } from './modifiers';
import type { MonthReport } from './types';
import { staffOf } from './util';

const ROLES: StaffRole[] = ['distiller', 'warehouse', 'sales', 'office'];

export function salaryFor(role: StaffRole, stats: Staff['stats'], level: number, laborCost = 1): number {
  const avg = (stats.a + stats.b + stats.c) / 3;
  const raw = ROLE_INFO[role].baseSalary * laborCost * (0.8 + (avg / 100) * 0.8) * (1 + 0.05 * (level - 1));
  return Math.round(raw / 10_000) * 10_000;
}

export function makeCandidate(s: GameState, rng: Rng, role?: StaffRole): Candidate {
  const r = role ?? rng.pick(ROLES);
  const stat = () => Math.round(clamp(rng.normal(45, 15), 15, 90));
  const stats = { a: stat(), b: stat(), c: stat() };
  const id = nid(s, 'C');
  const traits = rollTraits(s, id, r, stats);
  const level = 1 + Math.floor(((stats.a + stats.b + stats.c) / 3) / 30);
  const salary = salaryFor(r, stats, level, regionOf(s).laborCost);
  const pool = regionOf(s).namePool;
  return {
    id,
    name: `${rng.pick(pool.surnames)}${rng.pick(pool.given)}`,
    role: r, level, xp: 0, stats, salary, askSalary: salary, hiredMonth: -1,
    // 입사 나이 24~58세: 노련할수록 스탯은 높지만 은퇴(65세)가 가깝다
    ageAtHire: Math.round(clamp(rng.normal(36 + (level - 1) * 5, 7), 24, 58)),
    ...(traits.length ? { traits } : {}),
  };
}

// ───────────── 성격 특성 (#225, PRD §7.2) — 1단계는 MGT 효과만. 확률·배수 [튜닝] ─────────────

export const TRAIT_INFO: Record<StaffTrait, { nameKo: string; desc: string }> = {
  mentor: { nameKo: '멘토', desc: '멘토링으로 주는 XP 2배' },
  drifter: { nameKo: '철새', desc: '이직 확률 2배, 사기가 빨리 변한다' },
  loyal: { nameKo: '토박이', desc: '이직 확률 절반, 연봉 동결 때 사기 하락 절반' },
  negotiator: { nameKo: '협상가', desc: '연봉 협상 때 인상 폭 절반. 영업·사무면 협상 스탯 +5' },
};
const TRAIT_LIST = Object.keys(TRAIT_INFO) as StaffTrait[];
/** 후보가 특성을 하나 / 둘 가질 확률 */
export const TRAIT_CHANCE = { one: 0.4, two: 0.1 };
/** 협상가의 협상 스탯 보너스 — 영업(c)·사무(b) */
export const NEGOTIATOR_STAT = 5;
const NEGOTIATION_STAT: Partial<Record<StaffRole, keyof Staff['stats']>> = { sales: 'c', office: 'b' };

export const hasTrait = (x: Pick<Staff, 'traits'>, t: StaffTrait) => !!x.traits?.includes(t);

/**
 * 후보의 성격 특성 0~2개 — 후보 id로 독립 난수를 쓴다(채용 풀·헤드헌팅의 다른 결과는 그대로).
 * 협상가면 협상 스탯을 바로 올린다(급여·레벨 계산 전에 불러야 한다)
 */
function rollTraits(s: GameState, id: string, role: StaffRole, stats: Staff['stats']): StaffTrait[] {
  const rng = rngFor(s.seed, s.month, `traits:${id}`);
  const u = rng.next();
  const n = u < TRAIT_CHANCE.two ? 2 : u < TRAIT_CHANCE.two + TRAIT_CHANCE.one ? 1 : 0;
  const pool = [...TRAIT_LIST];
  const out: StaffTrait[] = [];
  for (let i = 0; i < n; i++) {
    const t = pool.splice(rng.int(0, pool.length - 1), 1)[0]!;
    // 철새와 토박이는 함께 갖지 않는다
    if ((t === 'drifter' && out.includes('loyal')) || (t === 'loyal' && out.includes('drifter'))) continue;
    out.push(t);
  }
  const k = NEGOTIATION_STAT[role];
  if (k && out.includes('negotiator')) stats[k] = Math.min(100, stats[k] + NEGOTIATOR_STAT);
  return out;
}

// ───────────── 사기 (#225, PRD §7.2) — HR이 잠긴 시나리오(MVP)에서는 꺼진다. 수치 [튜닝] ─────────────

export const MORALE = {
  /** 기준값 — 필드가 없으면 이 값으로 읽는다 */
  base: 70,
  /** 매달 기준값 쪽으로 돌아가는 비율 (철새는 × drifter) */
  drift: 0.1,
  drifter: 1.5,
  /** 급여가 시세보다 적으면 매달 −(부족 % × payShortfall) */
  payShortfall: 0.5,
  /** 부사수 시세 = 시세 × 0.6 (채용 때 급여 60%) */
  apprenticePay: 0.6,
  /** 회사 인지도가 이 이상이면 매달 +reputation */
  reputationAwareness: 0.5,
  reputation: 1,
  /** 교육을 받으면 +training, 누군가 해고되면 남은 직원 −fired */
  training: 10,
  fired: 10,
  /** 사기가 quitBelow 미만이면 매달 이직 확률 (quitBelow − 사기)/quitBelow × quitMax (철새 ×2, 토박이 ×0.5) */
  quitBelow: 30,
  quitMax: 0.03,
  /** 연봉 협상 (1월, 선택 이벤트 salary_review): 인상 폭과 사기 변화 */
  raise: 0.05,
  raiseMorale: 15,
  freezeMorale: -15,
};

export const moraleOf = (x: Pick<Staff, 'morale'>) => x.morale ?? MORALE.base;
/** 사기 시스템이 켜져 있나 — HR이 잠긴 시나리오(MVP)는 꺼진다 */
export const moraleOn = (s: Pick<GameState, 'scenario'>) => systemOn(s, 'hr');

/** 이 직원의 지금 시세 월급 (레벨·스탯·지역 인건비 기준, 부사수는 60%) */
export function marketSalary(s: Pick<GameState, 'regionId'>, x: Staff): number {
  const m = salaryFor(x.role, x.stats, x.level, regionOf(s).laborCost);
  return x.apprenticeOf ? m * MORALE.apprenticePay : m;
}
/** 시세보다 덜 받는 비율 (0 = 시세 이상) */
export function payShortfall(s: Pick<GameState, 'regionId'>, x: Staff): number {
  const m = marketSalary(s, x);
  return m > 0 ? Math.max(0, 1 - x.salary / m) : 0;
}

/** 사기를 delta만큼 바꾼다 (0~100) */
export function shiftMorale(x: Staff, delta: number): void {
  x.morale = Math.round(clamp(moraleOf(x) + delta, 0, 100) * 10) / 10;
}

/** 이번 달 이직 확률 */
export function quitChance(x: Staff): number {
  const m = moraleOf(x);
  if (m >= MORALE.quitBelow) return 0;
  const trait = (hasTrait(x, 'drifter') ? 2 : 1) * (hasTrait(x, 'loyal') ? 0.5 : 1);
  return ((MORALE.quitBelow - m) / MORALE.quitBelow) * MORALE.quitMax * trait;
}

/** XP 배수 — 사기 70이면 ×1, 0이면 ×0.5, 100이면 ×1.21 */
export const xpMultiplier = (x: Staff) => 1 + (moraleOf(x) - MORALE.base) / 140;

/** 연봉 협상 '인상' — 전 직원 급여 +raise (협상가는 절반). 오른 월 급여 합계를 돌려준다 */
export function raiseAllSalaries(s: GameState, share: number): number {
  let added = 0;
  for (const x of s.hr.staff) {
    const before = x.salary;
    x.salary = Math.round((x.salary * (1 + share * (hasTrait(x, 'negotiator') ? 0.5 : 1))) / 10_000) * 10_000;
    added += x.salary - before;
  }
  return added;
}

/** 전 직원 사기 변화 — 떨어질 때 토박이는 절반 */
export function shiftAllMorale(s: GameState, delta: number): void {
  for (const x of s.hr.staff) shiftMorale(x, delta < 0 && hasTrait(x, 'loyal') ? delta / 2 : delta);
}

/**
 * 매달 사기 갱신과 사기 저하 이직 (runStaffLifecycle 끝에서). 난수는 직원마다 독립 스트림('morale:<id>')이라
 * 다른 생애주기 판정(에이징 커브)은 그대로다. 하나뿐인 디스틸러는 사기로 나가지 않는다(이벤트 loseStaff와 같은 보호)
 */
export function runMorale(s: GameState, report: MonthReport): void {
  if (!moraleOn(s)) return;
  const rep = houseBrand(s).awareness >= MORALE.reputationAwareness ? MORALE.reputation : 0;
  for (const x of [...s.hr.staff]) {
    const m = moraleOf(x);
    const drift = MORALE.drift * (hasTrait(x, 'drifter') ? MORALE.drifter : 1);
    shiftMorale(x, (MORALE.base - m) * drift - payShortfall(s, x) * 100 * MORALE.payShortfall + rep);
    const now = moraleOf(x);
    if (m >= MORALE.quitBelow && now < MORALE.quitBelow) report.notes.push(`${x.name}(${roleName(x.role)}) 사기 저하 (${Math.round(now)}) — 이직 위험`);
    const soleDistiller = x.role === 'distiller' && staffOf(s, 'distiller').length === 1;
    if (soleDistiller || !rngFor(s.seed, s.month, `morale:${x.id}`).chance(quitChance(x))) continue;
    const notes: string[] = [];
    handleDeparture(s, x, notes);
    s.hr.staff = s.hr.staff.filter((y) => y.id !== x.id);
    report.notes.push(`${x.name}(${roleName(x.role)}) 사기 저하로 이직 (사기 ${Math.round(now)})`, ...notes);
  }
}

export function refreshCandidates(s: GameState, rng: Rng): void {
  s.hr.candidates = ROLES.map((r) => makeCandidate(s, rng, r)).concat([makeCandidate(s, rng)]);
  // 마스터 블렌더 후보 (결정 #123) — 독립 난수 스트림으로 뽑아 기존 직군 후보는 그대로 둔다
  s.hr.candidates.push(makeCandidate(s, rngFor(s.seed, s.month, 'candidates:blender'), 'blender'));
}

/** 레벨이 오를 때마다 급여가 오르는 비율 (gainXp와 같다) */
export const LEVEL_RAISE = 0.05;

/**
 * 직원 급여가 시작보다 얼마나 올랐나 (#197, mvp.md §7.8) — HR이 잠긴 시나리오(MVP)에서만 계산한다.
 * 거기서는 직원이 모두 레벨 1로 시작해 고용·해고가 없으므로, 레벨이 오른 만큼(×1.05씩)이 곧 인상분이다(반올림 오차 만 원 단위).
 * HR이 열린 판은 입사 레벨을 알 수 없어 null. 상태를 바꾸지 않는다
 */
export function salaryRaiseSinceStart(s: Pick<GameState, 'hr' | 'scenario'>): { now: number; start: number } | null {
  if (!s.scenario?.locked.includes('system:hr')) return null;
  const now = s.hr.staff.reduce((t, x) => t + x.salary, 0);
  const start = s.hr.staff.reduce((t, x) => t + Math.round(x.salary / (1 + LEVEL_RAISE) ** (x.level - 1) / 10_000) * 10_000, 0);
  return { now, start };
}

// ───────────── 성장: 교육·멘토링·헤드헌팅 (PRD §7.3, #222) — 수치 [튜닝] ─────────────

/** 멘토링: 매달 더 얻는 XP. 부사수(마스터 곁) / 같은 직군에 레벨이 seniorGap 이상 높은 선배가 있으면 */
export const MENTORING = { apprenticeXp: 8, seniorXp: 4, seniorGap: 2 };
/** 교육 프로그램: 비용 = 월급 × costMonths, XP += xpPerLevel × 지금 레벨(반 레벨), 같은 직원은 cooldownMonths 뒤에 다시 */
export const TRAINING = { costMonths: 2, xpPerLevel: 50, cooldownMonths: 12 };
/** 헤드헌팅: 비용 = 그 직군 기본급 × 지역 인건비 × costMonths, 스탯 평균 statMean(표준편차 statSd, 40~95) 후보 1명, 직군마다 한 달에 한 번 */
export const HEADHUNT = { costMonths: 3, statMean: 68, statSd: 8 };

/** 멘토링으로 이번 달 더 얻는 XP — 가르치는 쪽에 '멘토' 특성이 있으면 2배 (#225) */
export function mentoringXp(s: Pick<GameState, 'hr'>, x: Staff): number {
  const master = x.apprenticeOf ? s.hr.staff.find((y) => y.id === x.apprenticeOf) : undefined;
  if (master) return MENTORING.apprenticeXp * (hasTrait(master, 'mentor') ? 2 : 1);
  const seniors = s.hr.staff.filter((y) => y.id !== x.id && y.role === x.role && y.level >= x.level + MENTORING.seniorGap);
  return seniors.length ? MENTORING.seniorXp * (seniors.some((y) => hasTrait(y, 'mentor')) ? 2 : 1) : 0;
}

/** 보정치 표식(쿨다운) — 상태 필드 없이 world.modifiers로 기억한다 */
const marked = (s: Pick<GameState, 'world' | 'month'>, key: string) => s.world.modifiers.find((m) => m.key === key && isActive(m, s.month));

export const trainingCost = (x: Staff) => Math.round(x.salary * TRAINING.costMonths);
/** 교육을 다시 받을 수 있을 때까지 남은 개월 (0 = 지금 가능) */
export function trainingCooldown(s: Pick<GameState, 'world' | 'month'>, staffId: string): number {
  const m = marked(s, `training:${staffId}`);
  return m ? m.untilMonth - s.month : 0;
}
/** 교육 — 비용을 내고 XP를 얻는다. 레벨업은 다음 결산의 gainXp가 처리한다. 실패하면 이유 */
export function trainStaff(s: GameState, staffId: string): string | null {
  const x = s.hr.staff.find((y) => y.id === staffId);
  if (!x) return '직원이 없습니다';
  const wait = trainingCooldown(s, staffId);
  if (wait > 0) return `${wait}개월 뒤에 다시 교육할 수 있습니다`;
  const cost = trainingCost(x);
  if (s.finance.cash < cost) return '현금이 부족합니다';
  s.finance.cash -= cost;
  x.xp += TRAINING.xpPerLevel * x.level;
  if (moraleOn(s)) shiftMorale(x, MORALE.training);
  addModifier(s, `training:${staffId}`, 1, TRAINING.cooldownMonths, `${x.name} 교육`);
  return null;
}

export const headhuntCost = (s: GameState, role: StaffRole) => Math.round(ROLE_INFO[role].baseSalary * regionOf(s).laborCost * HEADHUNT.costMonths);
export const headhuntedThisMonth = (s: Pick<GameState, 'world' | 'month'>, role: StaffRole) => !!marked(s, `headhunt:${role}`);
/** 헤드헌팅 — 비용을 내고 스탯이 높은 후보 1명을 지금 받는다. 후보 난수는 따로(채용 풀 갱신과 무관). 실패하면 이유 */
export function headhunt(s: GameState, role: StaffRole): string | Candidate {
  if (headhuntedThisMonth(s, role)) return '이 직군은 이번 달에 이미 헤드헌팅했습니다';
  const cost = headhuntCost(s, role);
  if (s.finance.cash < cost) return '현금이 부족합니다';
  const rng = rngFor(s.seed, s.month, `headhunt:${role}`);
  const stat = () => Math.round(clamp(rng.normal(HEADHUNT.statMean, HEADHUNT.statSd), 40, 95));
  const stats = { a: stat(), b: stat(), c: stat() };
  const id = nid(s, 'C');
  const traits = rollTraits(s, id, role, stats);
  const level = 1 + Math.floor(((stats.a + stats.b + stats.c) / 3) / 30);
  const salary = salaryFor(role, stats, level, regionOf(s).laborCost);
  const pool = regionOf(s).namePool;
  const c: Candidate = {
    id, name: `${rng.pick(pool.surnames)}${rng.pick(pool.given)}`, role, level, xp: 0, stats, salary, askSalary: salary, hiredMonth: -1,
    ageAtHire: Math.round(clamp(rng.normal(36 + (level - 1) * 5, 7), 24, 58)),
    ...(traits.length ? { traits } : {}),
  };
  s.finance.cash -= cost;
  s.hr.candidates.push(c);
  addModifier(s, `headhunt:${role}`, 1, 1, `${ROLE_INFO[role].nameKo} 헤드헌팅`);
  return c;
}

/** 월간 XP와 레벨업 (+ 멘토링 XP) */
export function gainXp(s: GameState, rng: Rng, activity: Record<StaffRole, number>): string[] {
  const notes: string[] = [];
  // 멘토링은 이번 달 시작 레벨로 판단한다 (같은 달 레벨업 순서와 무관)
  const mentor = new Map(s.hr.staff.map((x) => [x.id, mentoringXp(s, x)]));
  for (const x of s.hr.staff) {
    // 사기 배수 (#225) — 사기 70(기본값)이면 ×1이라 사기가 꺼진 시나리오는 그대로
    x.xp += (10 + activity[x.role] + (mentor.get(x.id) ?? 0)) * xpMultiplier(x);
    while (x.xp >= 100 * x.level) {
      x.xp -= 100 * x.level;
      x.level += 1;
      const k = rng.pick(['a', 'b', 'c'] as const);
      x.stats[k] = Math.min(100, x.stats[k] + rng.int(2, 4));
      x.salary = Math.round((x.salary * (1 + LEVEL_RAISE)) / 10_000) * 10_000;
      notes.push(`${x.name}(${ROLE_INFO[x.role].nameKo}) 레벨 ${x.level} 달성`);
    }
  }
  return notes;
}

// ───────────── 인사 생애주기·사무직 (옛 ops.ts·step.ts) (결정 #144 — 파일 쪼개기로 옮겨 왔다) ─────────────

// ───────────── 인사: 에이징 커브·은퇴·부사수 ─────────────

export const RETIRE_AGE = 65;
export const ageOf = (x: Staff, month: number) => (x.ageAtHire ?? 40) + (month - x.hiredMonth) / 12;
/** 에이징 커브는 근속 기준 (#74): 근속 20년부터 스탯이 꺾이고 25년부터 더 빨라진다. 은퇴는 65세 */
export const AGING_TENURE_MONTHS = 240;
export const AGING_FAST_TENURE_MONTHS = 300;
export const tenureOf = (x: Staff, month: number) => Math.max(0, month - x.hiredMonth);

/** 마스터 디스틸러 = 부사수가 아닌 디스틸러 중 레벨이 가장 높고 가장 오래된 사람 */
export function masterDistiller(s: GameState): Staff | undefined {
  return staffOf(s, 'distiller').filter((x) => !x.apprenticeOf).sort((a, b) => b.level - a.level || a.hiredMonth - b.hiredMonth)[0];
}

/** 부사수가 하우스 스타일을 이어받으려면 최소 24개월 함께 일해야 한다 */
export const APPRENTICE_MONTHS = 24;

export function handleDeparture(s: GameState, leaving: Staff, notes: string[]): void {
  const master = masterDistiller(s);
  if (leaving.role !== 'distiller' || master?.id !== leaving.id) return;
  const heir = s.hr.staff.find((x) => x.apprenticeOf === leaving.id && s.month - x.hiredMonth >= APPRENTICE_MONTHS);
  // 장인 전수 기록(PRO-3 선택지, #213)이 살아 있으면 손실이 그 배수만큼 준다 — 없으면 1(옛 규칙 그대로)
  const lossMul = mod(s, 'house_style_loss');
  if (heir) {
    heir.apprenticeOf = undefined;
    s.hr.houseStyle = Math.round(s.hr.houseStyle * (1 - 0.1 * lossMul));
    notes.push(`부사수 ${heir.name}이(가) 하우스 스타일을 이어받았습니다 (${s.hr.houseStyle})`);
  } else if (lossMul < 1) {
    const before = Math.round(s.hr.houseStyle);
    s.hr.houseStyle = Math.round(s.hr.houseStyle * (1 - lossMul));
    if (before > 0) notes.push(`부사수는 없지만 전수 기록 덕분에 하우스 스타일을 지켰습니다 (${before} → ${s.hr.houseStyle})`);
  } else {
    if (s.hr.houseStyle > 0) notes.push(`부사수 없이 마스터 디스틸러가 떠나 하우스 스타일이 초기화됐습니다 (${Math.round(s.hr.houseStyle)} → 0)`);
    s.hr.houseStyle = 0;
  }
  for (const x of s.hr.staff) if (x.apprenticeOf === leaving.id) x.apprenticeOf = undefined;
}

/** 시나리오 단계가 이번 달 HR을 열었나 (#232) */
export function hrOpenedThisMonth(s: Pick<GameState, 'scenario' | 'month'>): boolean {
  const def = s.scenario ? SCENARIOS[s.scenario.id] : undefined;
  return !!def?.stages?.some((st) => st.month === s.month && st.unlock.includes('system:hr') && s.scenario!.stagesDone?.includes(st.id));
}

export function runStaffLifecycle(s: GameState, report: MonthReport, rng: Rng): void {
  // 단계가 HR을 연 달에는 분기 갱신을 기다리지 않고 채용 후보를 바로 채운다 — 독립 난수라 다른 결과는 그대로
  if (hrOpenedThisMonth(s) && !s.hr.candidates.length) refreshCandidates(s, rngFor(s.seed, s.month, 'candidates:stage'));
  const master = masterDistiller(s);
  if (master) s.hr.houseStyle = clamp(s.hr.houseStyle + 0.4 * (master.stats.c / 60), 0, 100);
  for (const x of [...s.hr.staff]) {
    const age = ageOf(x, s.month);
    if (age >= RETIRE_AGE) {
      const notes: string[] = [];
      handleDeparture(s, x, notes);
      s.hr.staff = s.hr.staff.filter((y) => y.id !== x.id);
      report.notes.push(`${x.name} 은퇴 (${Math.floor(age)}세)`, ...notes);
      continue;
    }
    // 에이징 커브(근속 기준): 근속 20년부터 매달 12%, 25년부터 25% 확률로 스탯 1~2 하락
    const tenure = tenureOf(x, s.month);
    if (tenure >= AGING_TENURE_MONTHS && rng.chance(tenure >= AGING_FAST_TENURE_MONTHS ? 0.25 : 0.12)) {
      const k = rng.pick(['a', 'b', 'c'] as const);
      x.stats[k] = Math.max(10, x.stats[k] - rng.int(1, 2));
    }
  }
  runMorale(s, report);
}

// ───────────── 사무직: 폐기물 유상 판매 계약 ─────────────

/** 사무직이 있으면 매달 확률로 농장 사료용 드래프·지게미 판매 계약을 맺는다. 단가 = 20 + 협상 × 0.4 (원/kg 원재료) */
export function runOffice(s: GameState, report: MonthReport, rng: Rng, mashKg: number): void {
  const office = staffOf(s, 'office');
  if (s.production.wasteContractPerKg === 0 && office.length && rng.chance(0.3)) {
    const best = Math.max(...office.map((x) => x.stats.b));
    s.production.wasteContractPerKg = Math.round(20 + best * 0.4);
    report.notes.push(`사무: 농장과 드래프·지게미 사료 판매 계약 체결 (원재료 kg당 ${s.production.wasteContractPerKg}원)`);
  }
  if (s.production.wasteContractPerKg > 0 && mashKg > 0) s.finance.cash += Math.round(mashKg * s.production.wasteContractPerKg);
}

/** 세무조사 방어율 = 사무직 세무 스탯 (최대 70% 감면) */
export const taxAuditDefense = (s: GameState) => 0.7 * (Math.max(0, ...staffOf(s, 'office').map((x) => x.stats.a)) / 100);

export const roleName = (r: StaffRole) => ROLE_INFO[r].nameKo;
