// 규칙 묶음 읽기 — 의존 없는 잎 모듈 (코어 ARCH, [제안 P-ARCH-56]).
// 왜 따로: `ledger.ts`가 이 둘을 `progress.ts`에서 가져오면 `ledger → progress → blending → blendTable → maturation` 순환이 생겨
// 숙성 쪽에서 원장을 만지려는 모듈이 첫 진입점일 때 초기화 순서 오류(TDZ)가 났다(PROD #498 실측 → 지점 7·8을 warehouse.ts로 우회).
// 여기는 types만 보므로 어디서든 안전하게 부를 수 있다. `progress.ts`는 호환을 위해 그대로 다시 내보낸다
import type { GameState } from './types';

/** 플래그십 최소 숙성 — 시나리오가 없으면(샌드박스) 12년 */
export const DEFAULT_FLAGSHIP_MONTHS = 144;

/**
 * 캠페인 승리 적격의 최소 목재 숙성 개월 (F1, [결정 #308·#309]) — 모든 읽는 쪽이 이 한 함수를 쓴다.
 * 새 판(v16) = `scenario.campaignGoal.minOakMonths`(144) · 옛 판(`legacy-v15`) = `goal.flagshipMinMonths`(같은 144) · 샌드박스 = 기본 144
 */
export const campaignMinOakMonths = (s: Pick<GameState, 'scenario'>): number => s.scenario?.campaignGoal?.minOakMonths ?? s.scenario?.goal.flagshipMinMonths ?? DEFAULT_FLAGSHIP_MONTHS;
/** 세이브가 따르는 규칙 묶음 — 없으면 옛 판 */
export const rulesVersionOf = (s: Pick<GameState, 'rulesVersion'>) => s.rulesVersion ?? 'legacy-v15';
