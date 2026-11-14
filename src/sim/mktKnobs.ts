// 난이도 손잡이 — MKT 몫 (F6b, [결정 #313·#314] · P-MKT-37, architecture §10.10 F6b 규약 ①). 소비자 취향(taste)의 **속도·지속성·폭·향미 유행 세기**와
// 거시(macro) 중 자리가 MKT 파일인 **원액 현물 지수 변동**을 시스템에 잇는 한 곳이다. 이벤트 발생 확률은 코어가 `EventDef.domain` × `<영역>.eventChance`로 곱한다.
// 원칙: 값은 `rules.ts knob(s, id)`로만 읽는다 · 전역 상수를 덮어쓰지 않는다 · Normal·옛 판·샌드박스는 늘 ×1 — 이 파일의 함수는 **기준값과 같은 수**를 돌려준다(출력 불변) ·
// 상태를 바꾸지 않는다. 화면(F6c)도 리터럴 대신 이 함수를 읽는다. 경쟁(competition) 영역은 손잡이를 두지 않는다([결정 대기 96])
import { BULK_WALK, TREND_WALK } from './content/market';
import { aroundOne, knob } from './rules';
import type { GameState } from './types';

type S = Pick<GameState, 'difficulty'>;
export interface WalkParams { sigma: number; reversion: number; lo: number; hi: number }

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 범위 아래 가드 — 난이도가 범위를 넓혀도 수요·시세가 0이 되는 판을 만들지 않는다 `[튜닝]` */
export const WALK_FLOOR = 0.2;

/** `aroundOne`은 코어 `rules.ts`(#571) 것 하나를 쓴다 — 여기서 다시 내보내 MKT 호출자·테스트의 import는 그대로 */
export { aroundOne } from './rules';

const walk = (base: WalkParams, sigma: number, reversion: number, range: number): WalkParams => ({
  sigma: Math.max(0, base.sigma * sigma),
  reversion: clamp01(base.reversion * reversion),
  lo: Math.max(WALK_FLOOR, aroundOne(base.lo, range)),
  hi: Math.max(1, aroundOne(base.hi, range)),
});

/**
 * 카테고리 트렌드 랜덤 워크 값([결정 #313] — 모든 난이도가 같은 식, **속도(σ) · 지속성(평균 회귀) · 폭(범위)** 만 다르다).
 * Easy 거의 고정(σ↓ · 회귀↑ · 범위 좁게) · Normal 지금 값 · Hard 급격(σ↑ · 회귀↓ · 범위 넓게) — 크기는 `content/difficulty.ts`(F7 뒤 오너)
 */
export const trendWalkOf = (s: S): WalkParams => walk(TREND_WALK, knob(s, 'taste.trendSigma'), knob(s, 'taste.trendReversion'), knob(s, 'taste.trendRange'));

/** 향미 유행(피트 열풍·셰리 인기 — `blendTable.ts trendFactor`)의 매력 배수에 난이도 **세기**를 입힌다 — 1에서의 거리 × `taste.flavorTrendStrength`. 유행이 없으면(배수 1) 그대로 */
export const flavorTrendFactorOf = (s: S, factor: number): number => aroundOne(factor, knob(s, 'taste.flavorTrendStrength'));

/** 원액 현물 지수 랜덤 워크 값(P-MGT-48 거시 표 "원액 현물 지수 변동") — Easy σ↓ · 회귀↑ / Hard σ↑ · 범위 넓게 */
export const bulkWalkOf = (s: S): WalkParams => walk(BULK_WALK, knob(s, 'macro.bulkSigma'), knob(s, 'macro.bulkReversion'), knob(s, 'macro.bulkRange'));
