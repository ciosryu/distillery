// MGT 난이도 손잡이 읽기 (F6b, [결정 #313·#314] — architecture §10.10 F6 규약 ①, MGT P-MGT-48·P-MGT-51).
// `rules.ts knob(s, id)`를 감싼 **이름 있는 함수만** 내보낸다. 상태를 바꾸지 않는다. Normal은 늘 1이고,
// 아래 `mul`은 1이면 값을 그대로 돌려줘 Normal 출력이 바이트 동일하다(곱셈 반올림 차이 0).
// 실험 손잡이(`scripts/experiments/mgtKnobs.ts`, 전역 값을 바꾸는 측정 도구)와는 이름만 같고 다른 파일이다.
import { regionOf } from './content/regions';
import { knob } from './rules';
import type { GameState } from './types';

type S = Pick<GameState, 'difficulty'>;
/** 배수를 곱한다 — 1이면 원래 값 그대로(부동소수 차이 0) */
export const mul = (x: number, k: number): number => (k === 1 ? x : x * k);

/** 대출 금리 배수 — 상품 연 금리에 곱한다. 급전(`emergency`)은 법정 최고금리 20%를 넘지 않는다(호출 쪽) */
export const loanRateMul = (s: S) => knob(s, 'finance.loanRate');
/** 대출 한도 배수 — 상품 최대액에 곱한다 */
export const loanLimitMul = (s: S) => knob(s, 'finance.loanLimit');
/** 거치 기간 배수 — 상품 거치 개월에 곱한다(반올림, 기간 − 1 이하) */
export const loanGraceMul = (s: S) => knob(s, 'finance.loanGrace');
/** 재고 담보 인정 비율(LTV) 배수 — 입지 `inventoryLtv`에 곱한다. v16 담보 가치는 이미 관측 q̂로 보수적이다(P-MGT-51 — Hard 크기는 그 효과를 뺀 뒤 [튜닝]) */
export const inventoryLtvMul = (s: S) => knob(s, 'finance.inventoryLtv');
/** 금융 수수료 배수 — 보험료·팩토링 할인율에 곱한다 */
export const financeFeeMul = (s: S) => knob(s, 'finance.fees');
/** 인건비 배수 — 지역 `laborCost`에 곱한다(새로 정하는 급여: 창업 멤버·채용·시세·핵심 전문가). 이미 정한 급여는 바꾸지 않는다 */
export const laborMul = (s: S) => knob(s, 'finance.laborMul');
/** 정기 임금 상승 — 매년 1월 전 직원 급여에 곱한다(1 = 오르지 않음). 선택 사건이 아니라 사기 없이도 비용 압력(P-MGT-51 · [결정 대기 94] — Normal은 1) */
export const wageDrift = (s: S) => knob(s, 'finance.wageDrift');
/** 사고·재난 피해 크기 — 재해 손실 원장 `damageMul`에 곱해 현금 피해(복구비)와 통·원액 소실 비율을 **한 값으로** 키운다(ARCH 규약 ②: PROD·MGT 같은 값) */
export const lossSizeMul = (s: S) => knob(s, 'incidents.lossSize');

/** 급여를 정할 때 쓰는 인건비 계수 = 지역 laborCost × 인건비 배수 */
export function staffLaborCost(s: Pick<GameState, 'difficulty' | 'regionId'>): number {
  return mul(regionOf(s).laborCost, laborMul(s));
}
