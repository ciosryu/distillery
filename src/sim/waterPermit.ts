import { siteOf } from './content/regions';
import { rngFor } from './rng';
import type { GameState, MonthReport } from './types';

// 취수 허가 (제주) — 월 발효 투입 상한 (파트 PROD, 결정 #144 — 파일 쪼개기로 옮겨 왔다. 규칙·수치 불변)

// ───────────── 취수 허가 (제주) ─────────────

/** 월 발효 투입 용량 상한(L). 없으면 Infinity */
export function waterPermitCap(s: GameState): number {
  const wp = siteOf(s).waterPermit;
  return wp ? s.site.waterPermitL ?? wp.baseL : Infinity;
}

/** 취수 증량 신청 (s는 변경 가능한 복제본) — 오류 문구 또는 null */
export function applyWaterPermit(s: GameState): string | null {
  const wp = siteOf(s).waterPermit;
  if (!wp) return '이 입지에는 취수 허가 제도가 없습니다';
  if (s.site.permitApplication) return '이미 심사 중인 신청이 있습니다';
  if (s.finance.cash < wp.cost) return '현금이 부족합니다';
  s.finance.cash -= wp.cost;
  const rng = rngFor(s.seed, s.month, 'permit');
  s.site.permitApplication = { decideMonth: s.month + rng.int(wp.months[0], wp.months[1]), addL: wp.stepL, chance: wp.chance };
  return null;
}

/** 월초: 심사 결과 확정 */
export function resolveWaterPermit(s: GameState, report: MonthReport): void {
  const app = s.site.permitApplication;
  if (!app || s.month < app.decideMonth) return;
  s.site.permitApplication = undefined;
  if (rngFor(s.seed, s.month, 'permit-decide').chance(app.chance)) {
    s.site.waterPermitL = waterPermitCap(s) + app.addL;
    report.events.push('취수 증량 승인');
    report.notes.push(`취수 허가 증량 승인 — 월 ${waterPermitCap(s).toLocaleString()}L`);
  } else {
    report.events.push('취수 증량 불허');
    report.notes.push('취수 허가 증량 신청이 불허됐습니다 (다시 신청할 수 있습니다)');
  }
}
