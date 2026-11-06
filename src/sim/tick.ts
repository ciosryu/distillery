import type { Climate } from './maturation';
import { climateTable, SlotIndex } from './ops';
import { fermentationClimate } from './production';
import type { Cask, GameState } from './types';
import { calendar, staffOf } from './util';

// 틱 컨텍스트 (docs/design/architecture.md §3.4·§3.5) — 한 달 동안 변하지 않는 파생값을 틱 시작에 한 번만 계산한다.
// 이벤트 단계 뒤에 만든다: 이번 달 이벤트(폭염·한파 충격, 숙성고 사고)가 이번 달 조건에 반영돼야 인과가 보인다.

export interface TickContext {
  month: number;
  year: number;
  monthOfYear: number;
  /** 캐스크가 놓인 칸(숙성고 × 단)의 이번 달 기후 — 칸마다 한 번 계산한 표를 조회 */
  climateOf: (cask: Cask) => Climate;
  /** 숙성고 칸 점유 — 자리 배정 O(1) */
  slots: SlotIndex;
  /** 발효실 온도(°C) */
  fermentC: number;
  /** 숙성고 매니저 최고 스탯 (환경통제·관찰·성실) */
  warehouse: { control: number; observe: number; diligence: number };
}

export function buildTickContext(s: GameState): TickContext {
  const { year, monthOfYear } = calendar(s);
  const wm = staffOf(s, 'warehouse');
  return {
    month: s.month,
    year,
    monthOfYear,
    climateOf: climateTable(s, monthOfYear),
    slots: new SlotIndex(s),
    fermentC: fermentationClimate(s, monthOfYear),
    warehouse: {
      control: Math.max(0, ...wm.map((x) => x.stats.b)),
      observe: Math.max(0, ...wm.map((x) => x.stats.a)),
      diligence: Math.max(0, ...wm.map((x) => x.stats.c)),
    },
  };
}
