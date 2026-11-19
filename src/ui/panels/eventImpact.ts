// 선택 대기 이벤트 카드의 「고르면 무엇이 멈추나」 줄 — 화면 계산만 한다(상태를 바꾸지 않는다 · 규칙 함수를 그대로 읽는다).
// 6차 플레이테스트: 증류기가 1대뿐인 판에서 「일반 수리 · 해당 증류기 2개월 중단」이 사실상 모든 증류를 멈춘다는 것이 카드에 없었다.
import type { GameState, PendingEvent } from '../../sim';
import { EVENT } from '../../sim/content/events';
import { tuneEventEffects } from '../../sim/prodKnobs';

export interface StillDownHint {
  /** `stillDown` 효과가 든 선택의 번호(일반 수리) */
  choice: number;
  /** 실제로 멈추는 개월 — 난이도 `incidents.stillDownMonths`를 입힌 값(events.ts resolvePending과 같은 계산) */
  months: number;
  /** 지금 가동 중인 증류기 대수(events.ts stillDown이 고르는 후보와 같은 조건) */
  stills: number;
  /** 지난달 결산의 새 원액 LPA 합 — 1대뿐일 때 한 달에 덜 만드는 양의 어림 */
  lastMonthLPA: number;
}

/** 증류기 고장 카드에만 값을 낸다. 다른 이벤트·`stillDown` 선택이 없으면 null */
export function stillDownHint(s: GameState, p: Pick<PendingEvent, 'defId'>): StillDownHint | null {
  const def = EVENT[p.defId];
  if (!def?.choices) return null;
  for (let i = 0; i < def.choices.length; i++) {
    const down = tuneEventEffects(s, def, def.choices[i]!.effects).find((e) => e.type === 'stillDown');
    if (down?.type !== 'stillDown') continue;
    const stills = s.production.equipment.filter((x) => x.readyMonth <= s.month && x.feintsLPA != null).length;
    const lastMonthLPA = (s.history.reports.at(-1)?.production ?? []).reduce((t, r) => t + r.lpa, 0);
    return { choice: i, months: down.months, stills, lastMonthLPA };
  }
  return null;
}

/** 카드에 붙일 한 줄. 증류기가 0대(이미 모두 멈춤)면 일반 수리가 아무것도 멈추지 않으므로 줄을 내지 않는다 */
export function stillDownLine(h: StillDownHint, label: string): string | null {
  if (h.stills <= 0) return null;
  if (h.stills > 1) return `「${label}」: 증류기 ${h.stills}대 중 1대만 ${h.months}개월 멈춘다 — 나머지는 계속 돈다.`;
  const lpa = Math.round(h.lastMonthLPA * h.months);
  return `증류기가 1대뿐이라 「${label}」를 고르면 모든 증류가 ${h.months}개월 멈춘다`
    + (lpa > 0 ? ` — 지난달 생산 기준 약 ${lpa.toLocaleString('ko-KR')} LPA를 덜 만든다.` : '.');
}
