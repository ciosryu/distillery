// 테스트 도우미 — 손잡이 표를 "자리값(모두 1)" 세계로 두고 끝나면 되돌린다.
// F6b 파트 테스트는 값이 모두 1이던 때 쓰였다(시험값을 손으로 넣어 장치만 검사). 결정 대기 98로 실제 값이 들어간 뒤에도
// 그 테스트들이 같은 전제로 돌게 한다. 실제 값 자체는 difficultyValues.test.ts가 F7-B 최종 후보 파일과 맞춰 본다
import { afterEach, beforeEach } from 'vitest';
import { KNOBS, type KnobDef } from './content/difficulty';

export function useKnobsAtOne(): void {
  let real: Record<string, KnobDef> = {};
  beforeEach(() => {
    real = Object.fromEntries(Object.entries(KNOBS).map(([k, v]) => [k, { ...v }]));
    for (const k of Object.keys(KNOBS)) Object.assign(KNOBS[k]!, { easy: 1, hard: 1 });
  });
  afterEach(() => { for (const [k, v] of Object.entries(real)) KNOBS[k] = { ...v }; });
}
