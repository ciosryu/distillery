// 난이도 손잡이 — PROD 몫 (F6b, [결정 #314] · P-PROD-56 v16 갱신). 원자재·공급망(supply)과 사고·재난(incidents) 영역의 **크기** 손잡이를
// 시스템에 잇는 한 곳이다. 발생 **확률**은 코어가 `EventDef.domain` × `<영역>.eventChance`로 곱한다(events.ts rollChance).
// 원칙: 값은 `rules.ts knob(s, id)`로만 읽는다 · Normal·옛 판·샌드박스는 늘 ×1(이 파일의 함수는 받은 것을 **그대로** 돌려준다 — 출력 불변) ·
// 숙성 물리(누수·오염 추첨·증발)·고온 발효 산패·샘플 오차는 여기서도, 어디서도 손잡이를 읽지 않는다(#314 — `prodKnobs.test.ts` 정적 테스트)
import { CASK_MARKET } from './content/catalog';
import type { Effect, EventDef } from './content/events';
import { knob } from './rules';
import type { GameState } from './types';

type S = Pick<GameState, 'difficulty'>;

/** 개월 범위에 배수 — 1개월 아래로 내려가지 않는다 */
const scaleMonths = (m: [number, number], k: number): [number, number] => [Math.max(1, Math.round(m[0] * k)), Math.max(1, Math.round(m[1] * k))];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * 이벤트 효과에 난이도 크기 손잡이를 입힌다 — 이벤트 **범주**로 가른다(supply = 원가·공급 · disaster = 사고·재난).
 * - supply: 원가를 올리는 배수(>1)는 1에서 떨어진 거리 × `supply.costSize`, 지속 개월 × `supply.costMonths`.
 *   원가를 내리는 호재(<1, 예: 가공용 쌀 할인)는 거리 × `supply.windfallSize`(Easy에서 키우고 Hard에서 줄이는 방향 — 악재와 반대라 따로 둔다)
 * - disaster: 통 소실·원액 손실 비율 × `incidents.lossSize` · 증류기 중단 개월 × `incidents.stillDownMonths` · 발효 오염 이취 × `incidents.spoilSize`.
 *   생산 중단(`production` ×0)·현금 피해·기상 입력은 그대로(현금 피해는 보험·연구 `damageMul` 몫, 기상은 숙성 물리로 이어진다)
 * 손잡이가 모두 1이면 받은 배열을 그대로 돌려준다(같은 객체 — Normal 바이트 동일)
 */
export function tuneEventEffects(s: S, def: Pick<EventDef, 'category'>, effects: Effect[]): Effect[] {
  if (def.category === 'supply') {
    const up = knob(s, 'supply.costSize');
    const months = knob(s, 'supply.costMonths');
    const down = knob(s, 'supply.windfallSize');
    if (up === 1 && months === 1 && down === 1) return effects;
    return effects.map((e) => {
      if (e.type !== 'modifier') return e;
      if (e.factor > 1) return { ...e, factor: 1 + (e.factor - 1) * up, months: scaleMonths(e.months, months) };
      if (e.factor < 1 && e.factor > 0) return { ...e, factor: Math.max(0.05, 1 - (1 - e.factor) * down) };
      return e;
    });
  }
  if (def.category === 'disaster') {
    const loss = knob(s, 'incidents.lossSize');
    const down = knob(s, 'incidents.stillDownMonths');
    const spoil = knob(s, 'incidents.spoilSize');
    if (loss === 1 && down === 1 && spoil === 1) return effects;
    return effects.map((e) => {
      if (e.type === 'caskLoss') return { ...e, share: [clamp01(e.share[0] * loss), clamp01(e.share[1] * loss)] as [number, number] };
      if (e.type === 'caskVolumeLoss') return { ...e, share: Math.min(0.9, e.share * loss) };
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
