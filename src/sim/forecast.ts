import { PRICE_FORECAST } from './content/tech';
import { clamp } from './flavor';
import { infoBonus } from './research';
import { rngFor } from './rng';
import type { GameState } from './types';

// ENG-3 공급망 예측 (파트 MGT, #188, tech-tree §4.3) — 원자재 가격 지수의 몇 달 앞 예측 범위. 정보만 준다(P2) — 대응은 선도계약(#179).
// 가격 지수는 상태와 무관한 난수 스트림('prices')으로 움직이므로 실제 미래 경로를 계산할 수 있다. 그대로 보이면 미래를 엿보는 것이라
// 실제 경로에 오차(사무직 행정 스탯이 높을수록 작다)를 섞은 90% 범위로만 보인다. 오차 난수는 별도 스트림이라 게임 결과는 그대로다.

/**
 * 앞으로 months번의 가격 변동 뒤 지수 — step.ts 8단계(성장)의 평균 회귀 랜덤 워크와 같은 식·같은 난수.
 * [k − 1] = k개월 뒤 생산 단계에서 쓰일 원지수(이벤트 보정 전). 식이 step.ts와 어긋나면 forecast.test.ts가 잡는다
 */
export function truePricePath(s: Pick<GameState, 'seed' | 'month' | 'world'>, months: number): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  let cur = { ...s.world.priceIndex };
  for (let k = 0; k < months; k++) {
    const prng = rngFor(s.seed, s.month + k, 'prices');
    const next: Record<string, number> = {};
    for (const key of Object.keys(cur)) {
      const v = cur[key]!;
      next[key] = clamp(v * Math.exp(prng.normal(0, 0.02)) + 0.05 * (1 - v), 0.6, 1.8);
    }
    out.push(next);
    cur = next;
  }
  return out;
}

/** 그 달에 걸려 있을, 이미 알려진 이벤트 보정치 (새로 생길 이벤트는 모른다) */
function knownModAt(s: Pick<GameState, 'world'>, key: string, month: number): number {
  const mk = key === 'energy' ? 'energy' : `ingredient:${key}`;
  return s.world.modifiers.reduce((f, m) => (m.key === mk && m.fromMonth <= month && month < m.untilMonth ? f * m.factor : f), 1);
}

export interface ForecastPoint { month: number; low: number; mid: number; high: number }

/** 예측 오차 σ_k — 사무직(office) 중 행정 스탯(c)이 가장 높은 사람 기준 */
export function forecastSigma(s: Pick<GameState, 'hr'>, k: number): number {
  const stat = s.hr.staff.filter((x) => x.role === 'office').reduce((m, x) => Math.max(m, x.stats.c), 0);
  return PRICE_FORECAST.baseSigma * Math.sqrt(k) * Math.max(0, 1 - stat / PRICE_FORECAST.statDivisor);
}

/**
 * 원재료·에너지 가격 지수(이벤트 보정 포함) 예측 — ENG-3을 연구하지 않았으면 null.
 * 키마다 1~N개월 뒤의 90% 범위. 상태를 바꾸지 않는다
 */
export function priceForecast(s: GameState): Record<string, ForecastPoint[]> | null {
  const months = infoBonus(s, 'ingredient_price').forecastMonths;
  if (months <= 0) return null;
  const path = truePricePath(s, months);
  const out: Record<string, ForecastPoint[]> = {};
  for (const key of Object.keys(s.world.priceIndex)) {
    const noise = rngFor(s.seed, s.month, `forecast:${key}`);
    out[key] = path.map((p, i) => {
      const k = i + 1;
      const sigma = forecastSigma(s, k);
      const mid = p[key]! * knownModAt(s, key, s.month + k) * Math.exp(noise.normal(0, 1) * sigma);
      const w = Math.exp(PRICE_FORECAST.z90 * sigma);
      return { month: s.month + k, low: mid / w, mid, high: mid * w };
    });
  }
  return out;
}
