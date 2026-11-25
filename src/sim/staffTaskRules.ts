// [결정 #412] 직원 「맡길 일」의 값과 읽기 도우미 (MGT) — 다른 파트 파일(production · warehouse · market)이 읽는 잎 모듈: 타입만 가져온다(순환 없음).
// 일을 맡기지 않으면(Staff.task 없음 = 평소 업무) 모든 도우미가 지금 값을 그대로 돌려준다 → 봇 · 옛 세이브 출력 불변
import type { GameState, Staff, StaffTaskId } from './types';

/** 일마다 값 `[튜닝 — 단계 T]` */
export const TASK_VALUES = {
  /** 디스틸러 「숙성 점검」 — 매달 목재 minOakMonths↑ 통을 perMonth통까지 대신 맛본다(돈 · 월 샘플 여력 안 씀). 숨은 오염은 contamFind 확률로 안다. 맞바꿈: 그 달 새 원액 이취 보정에 쓰는 「공정」 × processMul */
  agingCheck: { minOakMonths: 84, perMonth: 4, contamFind: 0.5, processMul: 0.7, flagPenalty: 10 },
  /** 영업 「시음회」 — 분기에 한 번 cost. 이번 달 가장 많이 팔린 제품으로. 결과 성황 · 보통 · 썰렁(친화로 기움) → 그 제품 브랜드 인지도 + · 리뷰 몇 건. 맞바꿈: 맡은 동안 그 영업의 유통 커버리지 몫 × coverageMul */
  tasting: { cost: 15_000_000, coverageMul: 0.5, awareness: { great: 0.015, normal: 0.008, poor: 0.002 }, /** 그 제품 위스키베이스 리뷰 건수 — 작게(돈으로 품질을 사지 않게, MKT) */ reviews: { great: 3, normal: 1, poor: 0 } },
  /** 숙성고 「순찰 강화」 — 오염 발견 확률 × detectMul(상한 detectCap) · 월 costPerMonth(야근) */
  patrol: { detectMul: 1.6, detectCap: 0.95, costPerMonth: 3_000_000 },
};

/** 이 직원이 지금 하는 일(없으면 평소 업무) */
export const staffTaskOf = (x: Pick<Staff, 'task'>): StaffTaskId => x.task ?? 'routine';
/** 이 직원이 이 일을 맡았나 */
export const onTask = (x: Pick<Staff, 'task'>, task: StaffTaskId): boolean => staffTaskOf(x) === task;

/** 디스틸러의 「공정」 — 생산의 이취 보정에 쓰는 값(production.ts). 숙성 점검 중이면 × processMul */
export const effectiveProcess = (d: Pick<Staff, 'task' | 'stats'>): number => (onTask(d, 'aging_check') ? d.stats.b * TASK_VALUES.agingCheck.processMul : d.stats.b);
/** 영업 한 사람의 유통 커버리지 몫에 곱할 값(market.ts) — 시음회를 맡은 동안 × coverageMul */
export const coverageShare = (x: Pick<Staff, 'task'>): number => (onTask(x, 'tasting') ? TASK_VALUES.tasting.coverageMul : 1);
/** 숙성고 QC 오염 발견 확률에 순찰 강화를 넣는다(warehouse.ts) — 숙성고 매니저 누구라도 순찰 중이면 */
export const patrolDetect = (s: Pick<GameState, 'hr'>, p: number): number =>
  s.hr.staff.some((x) => x.role === 'warehouse' && onTask(x, 'patrol')) ? Math.min(TASK_VALUES.patrol.detectCap, p * TASK_VALUES.patrol.detectMul) : p;
