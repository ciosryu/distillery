import { rngFor } from './rng';
import type { GameState } from './types';

// 기상 이상치 (PRD 결정 #120, docs/design/architecture.md §3.5)
// 입지 월 평년값에 "이번 달 이상치"를 더한다. 이상치는 AR(1) — 더운 달 다음 달도 더울 가능성이 높다(계절감).
//   a(t) = ρ·a(t−1) + σ·√(1−ρ²)·ε,  ε ~ N(0, 1),  난수 스트림 rngFor(seed, month, 'weather')
// 이벤트(폭염·한파)는 결과(증발 ×1.7)가 아니라 이 입력에 충격을 더한다 → 증발·추출·발효·도수가 한 원인에서 일관되게 따라온다.
//
// 밸런스 주의: 증발 계수가 exp(0.13·ΔT)라서 평균 0인 이상치도 기대 증발을 올린다(젠센 부등식).
// 랙 숙성고(외기 변동의 95% 전달) σ 1.2°C면 약 +1.1%, 더니지(60%)는 약 +0.4%.

export const WEATHER = {
  /** 기온 이상치 표준편차(°C) [튜닝] */
  tempSigma: 1.2,
  /** 상대습도 이상치 표준편차(%p) [튜닝] */
  humidSigma: 4,
  /** 자기상관 ρ — 0이면 매달 독립, 1에 가까울수록 이상 기후가 오래간다 [튜닝] */
  rho: 0.6,
};

/** 0 준비 단계: 이번 달 이상치를 뽑고 끝난 충격을 정리한다 */
export function updateWeather(s: GameState): void {
  const w = s.world.weather;
  const r = rngFor(s.seed, s.month, 'weather');
  const k = Math.sqrt(1 - WEATHER.rho * WEATHER.rho);
  w.tempAnom = WEATHER.rho * w.tempAnom + WEATHER.tempSigma * k * r.normal();
  w.humidAnom = WEATHER.rho * w.humidAnom + WEATHER.humidSigma * k * r.normal();
  w.shocks = w.shocks.filter((x) => x.untilMonth > s.month);
}

/** 이벤트 충격 등록 — 이번 달부터 months개월 */
export function addWeatherShock(s: GameState, id: string, label: string, tempC: number, humidity: number, months: number): void {
  s.world.weather.shocks.push({ id, label, tempC, humidity, fromMonth: s.month, untilMonth: s.month + months });
}

/** 이번 달 평년 대비 편차 = 난수 이상치 + 활성 충격 */
export function weatherOffset(s: Pick<GameState, 'world' | 'month'>): { tempC: number; humidity: number } {
  const w = s.world.weather;
  let tempC = w.tempAnom;
  let humidity = w.humidAnom;
  for (const x of w.shocks) if (x.fromMonth <= s.month && s.month < x.untilMonth) { tempC += x.tempC; humidity += x.humidity; }
  return { tempC, humidity };
}
