import { MACRO_WARNING } from './content/tech';
import { macroWarnings, type MacroWarning } from './events';
import { infoBonus } from './research';
import type { GameState } from './types';

// ENG-3 공급망 예측 — 매크로 이벤트 조기 경보 (파트 MGT, #189, tech-tree §4.3). 정보만 준다(P2): 대응은 선도계약·비축·보험으로

/** 사무직(office) 중 가장 높은 행정 스탯(c) — 원안 "예측 정확도 = 백오피스 스탯" */
const officeStat = (s: Pick<GameState, 'hr'>): number => s.hr.staff.filter((x) => x.role === 'office').reduce((m, x) => Math.max(m, x.stats.c), 0);

/** 조짐 감지 확률 — 행정 스탯 0이면 60%, 100이면 90%(상한) [튜닝] */
export const macroDetect = (s: Pick<GameState, 'hr'>): number => Math.min(MACRO_WARNING.maxDetect, MACRO_WARNING.baseDetect + officeStat(s) / MACRO_WARNING.statDivisor);

/** 매크로 이벤트 조기 경보 — ENG-3을 연구하지 않았으면 null. 앞으로 N개월(효과 forecastMonths) 안의 조짐. 상태·난수를 바꾸지 않는다 */
export function macroForecast(s: GameState): MacroWarning[] | null {
  const months = infoBonus(s, 'macro_event').forecastMonths;
  if (months <= 0) return null;
  return macroWarnings(s, months, macroDetect(s));
}
