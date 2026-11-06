import type { GameState, Modifier } from './types';
import { nid } from './util';

// 기간 한정 보정치. 같은 key의 활성 보정치는 곱해서 적용한다.
// key 규칙: 'ingredient:<id>' 'energy' 'packaging' 'cask:<typeId>' 'demand:<category>' 'demand:all'
//          'appeal:peated' 'appeal:sherried' 'appeal:all' 'consumerPrice:all' 'awareness_gain'
//          'bulk' 'bulk:peated' 'evaporation' 'production' 'domestic_premium'

export function isActive(m: Modifier, month: number): boolean {
  return m.fromMonth <= month && month < m.untilMonth;
}

export function mod(s: Pick<GameState, 'modifiers' | 'month'>, key: string): number {
  let f = 1;
  for (const m of s.world.modifiers) if (m.key === key && isActive(m, s.month)) f *= m.factor;
  return f;
}

export function addModifier(s: GameState, key: string, factor: number, months: number, label: string, delay = 0): Modifier {
  const m: Modifier = { id: nid(s, 'M'), key, factor, fromMonth: s.month + delay, untilMonth: s.month + delay + months, label };
  s.world.modifiers.push(m);
  return m;
}

export function pruneModifiers(s: GameState): void {
  s.world.modifiers = s.world.modifiers.filter((m) => m.untilMonth > s.month);
}

/** 원재료·에너지 가격 지수 × 이벤트 보정 (생산 원가 계산용) */
export function effectivePriceIndex(s: GameState, volumeDiscount: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(s.world.priceIndex)) {
    const key = k === 'energy' ? 'energy' : `ingredient:${k}`;
    out[k] = v * mod(s, key) * (volumeDiscount[k] ?? 1);
  }
  return out;
}
