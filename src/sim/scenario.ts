import type { ScenarioSystem } from './content/scenarios';
import type { GameState } from './types';

// 시나리오 잠금 (skeleton S-8, #140) — 기능 플래그. 테크 게이트(research.ts isUnlocked)와 같은 키 규칙을 쓴다.
// 시나리오가 없는 게임(샌드박스·옛 세이브)은 아무것도 잠기지 않는다 → 게임 동작 불변.
// 이 파일은 타입만 가져온다 — actions.ts·step.ts가 import해도 순환이 생기지 않는다. 새 게임 만들기는 newScenario.ts

/** 이 판의 시나리오가 이 키를 잠갔는가 */
export const isLocked = (s: Pick<GameState, 'scenario'>, key: string): boolean => !!s.scenario?.locked.includes(key);

/** 이 틱 시스템이 켜져 있는가 ('system:<이름>' 키) */
export const systemOn = (s: Pick<GameState, 'scenario'>, name: ScenarioSystem): boolean => !isLocked(s, `system:${name}`);

export const LOCKED_MESSAGE = '이 시나리오에서는 쓸 수 없는 기능입니다';
