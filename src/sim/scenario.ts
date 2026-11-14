import { SCENARIOS, stagesForRules, type ScenarioStage, type ScenarioSystem } from './content/scenarios';
import { rulesVersionOf } from './rules';
import type { GameState, MonthReport } from './types';

// 시나리오 잠금 (skeleton S-8, #140) — 기능 플래그. 테크 게이트(research.ts isUnlocked)와 같은 키 규칙을 쓴다.
// 시나리오가 없는 게임(샌드박스·옛 세이브)은 아무것도 잠기지 않는다 → 게임 동작 불변.
// 이 파일은 타입만 가져온다 — actions.ts·step.ts가 import해도 순환이 생기지 않는다. 새 게임 만들기는 newScenario.ts

/** 이 판의 시나리오가 이 키를 잠갔는가 */
export const isLocked = (s: Pick<GameState, 'scenario'>, key: string): boolean => !!s.scenario?.locked.includes(key);

/** 이 틱 시스템이 켜져 있는가 ('system:<이름>' 키) */
export const systemOn = (s: Pick<GameState, 'scenario'>, name: ScenarioSystem): boolean => !isLocked(s, `system:${name}`);

export const LOCKED_MESSAGE = '이 시나리오에서는 쓸 수 없는 기능입니다';

/** 이 판의 단계 정의 — 규칙 묶음별(F5a): 옛 판은 `stages`, v16은 `stagesV16`. 콘텐츠를 매달 읽으므로 이 분기가 옛 세이브·X0L 보존이다 */
export function stagesOf(s: Pick<GameState, 'scenario' | 'rulesVersion'>): ScenarioStage[] {
  const def = s.scenario ? SCENARIOS[s.scenario.id] : undefined;
  return def ? stagesForRules(def, rulesVersionOf(s)) : [];
}

/** 이 판에서 아직 안 연 단계 (정의는 콘텐츠 — 진행 중인 판에도 적용된다) */
export function pendingStages(s: Pick<GameState, 'scenario' | 'rulesVersion'>): ScenarioStage[] {
  const done = new Set(s.scenario?.stagesDone ?? []);
  return stagesOf(s).filter((x) => !done.has(x.id));
}

/**
 * 단계 해금 (#215, 4차 MVP 플레이테스트: 6년 차 흑자 뒤 "너무 쉽고 지루하다") — 월 틱 0단계(준비)에서 그 달이 된 단계의 잠금 키를 푼다.
 * 잠금은 상태(scenario.locked)에서 빠지므로 isLocked는 그대로다. 연 단계는 stagesDone에 남고 리포트 메모로 알린다
 */
export function applyScenarioStages(s: GameState, report: MonthReport): void {
  if (!s.scenario) return;
  for (const st of pendingStages(s)) {
    if (s.month < st.month) continue;
    const keys = new Set(st.unlock);
    s.scenario.locked = s.scenario.locked.filter((k) => !keys.has(k));
    s.scenario.stagesDone = [...(s.scenario.stagesDone ?? []), st.id];
    report.notes.push(`새 기능 열림 — ${st.title}: ${st.text}`);
  }
}
