// 난이도 손잡이 — PROD 몫 (F6b, [결정 #314] · P-PROD-56 v16 갱신). 원자재·공급망(supply)과 사고·재난(incidents) 영역의 **크기** 손잡이를
// 시스템에 잇는 한 곳이다. 발생 **확률**은 코어가 `EventDef.domain` × `<영역>.eventChance`로 곱한다(events.ts rollChance).
// 원칙: 값은 `rules.ts knob(s, id)`로만 읽는다 · Normal·옛 판·샌드박스는 늘 ×1(이 파일의 함수는 받은 것을 **그대로** 돌려준다 — 출력 불변) ·
// 숙성 물리(누수·오염 추첨·증발)·고온 발효 산패·샘플 오차는 여기서도, 어디서도 손잡이를 읽지 않는다(#314 — `prodKnobs.test.ts` 정적 테스트)
import { CASK_MARKET } from './content/catalog';
import { PRICE_INDEX_WALK } from './content/production';
import type { Effect, EventDef } from './content/events';
import { knob } from './rules';
import type { GameState } from './types';

type S = Pick<GameState, 'difficulty'>;


/**
 * 이벤트 효과에 난이도 크기 손잡이를 입힌다 — 이벤트 **범주**로 가른다(supply = 원가·공급 · disaster = 사고·재난).
 * - supply: 원가를 내리는 호재(영역 태그 없는 `rice_surplus`의 원재료 값 <1)의 할인 폭 × `supply.windfallSize`(Easy에서 키우고 Hard에서 줄인다).
 *   **원가 악재의 크기·기간은 여기서 곱하지 않는다** — 코어 `events.ts applyEffects`가 `EventDef.domain`으로 `supply.eventMagnitude`·`supply.eventDuration`을
 *   한 자리에서 곱한다(한 손잡이 한 자리 — 여기서도 곱하면 보리 흉작 ×1.5가 Hard 2에서 ×2.0이 아니라 ×2.5가 된다)
 * - disaster: 증류기 중단 개월 × `incidents.stillDownMonths` · 발효 오염 이취 × `incidents.spoilSize`.
 *   **통 소실·원액 손실 비율은 여기서 곱하지 않는다** — `incidents.lossSize`는 MGT가 손실 원장 `damageMul`에 넣어 `applyEffects` 한 자리에서
 *   현금 피해·통 소실·원액 손실·오염 비율을 함께 키운다(한 손잡이 한 자리 — 여기서도 곱하면 Hard에서 k²).
 *   생산 중단(`production` ×0)·현금 피해·기상 입력은 그대로(현금 피해는 보험·연구 `damageMul` 몫, 기상은 숙성 물리로 이어진다)
 * 손잡이가 모두 1이면 받은 배열을 그대로 돌려준다(같은 객체 — Normal 바이트 동일)
 */
export function tuneEventEffects(s: S, def: Pick<EventDef, 'category' | 'domain'>, effects: Effect[]): Effect[] {
  if (def.category === 'supply') {
    const down = knob(s, 'supply.windfallSize');
    if (down === 1) return effects;
    return effects.map((e) => {
      // 호재 = **영역 태그가 없는** supply 이벤트(`rice_surplus`)의 원재료 값 할인만. 태그된 악재 안의 <1 배수(예: `tariff_retaliation`의 `bulk` ×0.9 = 현물가 하락)는
      // 플레이어에게 나쁜 효과라 호재 손잡이를 받지 않는다(ARCH 발견 — 받으면 Hard에서 그 악재가 줄어든다)
      if (e.type === 'modifier' && !def.domain && e.key.startsWith('ingredient:') && e.factor < 1 && e.factor > 0) return { ...e, factor: Math.max(0.05, 1 - (1 - e.factor) * down) };
      return e;
    });
  }
  if (def.category === 'disaster') {
    const down = knob(s, 'incidents.stillDownMonths');
    const spoil = knob(s, 'incidents.spoilSize');
    if (down === 1 && spoil === 1) return effects;
    return effects.map((e) => {
      if (e.type === 'stillDown') return { ...e, months: Math.max(1, Math.round(e.months * down)) };
      if (e.type === 'lotSpoil') return { ...e, acetic: e.acetic * spoil };
      return e;
    });
  }
  return effects;
}

/** 원가 이벤트 예보 — 미리 알려 주는 개월 × `supply.forecastMonths`, 맞을 확률 × `supply.forecastCertainty`(supply 범주만). 손잡이가 1이면 그대로 */
export function tuneForecast<T extends { months: number; certainty: number }>(s: S, def: Pick<EventDef, 'category'>, f: T): T {
  if (def.category !== 'supply') return f;
  const m = knob(s, 'supply.forecastMonths');
  const c = knob(s, 'supply.forecastCertainty');
  if (m === 1 && c === 1) return f;
  return { ...f, months: Math.max(1, Math.round(f.months * m)), certainty: Math.min(0.95, Math.max(0.05, f.certainty * c)) };
}

/** 쿠퍼리지 통 납기(개월) — 기본 2개월 × `supply.caskLead`. 통입이 늦으면 144개월 도달이 그만큼 늦는다(Hard 폭은 작게 `[튜닝]`) */
export const cooperageLeadMonths = (s: S): number => Math.max(1, Math.round(CASK_MARKET.cooperageLeadMonths * knob(s, 'supply.caskLead')));

/**
 * 원재료·에너지 기본 시세의 월 변동폭(σ) — `PRICE_INDEX_WALK.sigma` × `supply.priceWalkSigma`. 이벤트가 열리기 전(v16은 60개월 전)에도 닿는
 * 유일한 공급 손잡이다(P-PROD-56 v16 갱신). 평균 회귀·범위는 그대로 둔다. 월 틱(`step.ts`)이 부른다
 */
export const priceWalkSigma = (s: S): number => PRICE_INDEX_WALK.sigma * knob(s, 'supply.priceWalkSigma');

