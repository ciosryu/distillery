// F7-A 블록 C 수출 실험 해제(MGT) — 측정 전용 함수
import { describe, expect, it } from 'vitest';
import { advanceMonth, isLocked } from '../../src/sim';
import { newScenarioGame } from '../../src/sim/newScenario';
import { EXPORT_UNLOCK_KEYS, EXPORT_UNLOCK_MONTH, unlockExports } from './f7Exports';

const v16 = () => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 3 });

describe('unlockExports (F7-A 블록 C)', () => {
  it('v16 판의 수출 키 4개만 푼다 — export_inquiry는 잠긴 채 · 받은 상태는 그대로 · 두 번 불러도 같다', () => {
    const s = v16();
    for (const k of EXPORT_UNLOCK_KEYS) expect(isLocked(s, k)).toBe(true);
    const before = JSON.stringify(s);
    const u = unlockExports(s);
    expect(JSON.stringify(s)).toBe(before);
    for (const k of EXPORT_UNLOCK_KEYS) expect(isLocked(u, k)).toBe(false);
    expect(isLocked(u, 'event:export_inquiry')).toBe(true);
    expect(unlockExports(u)).toBe(u);
    expect(EXPORT_UNLOCK_MONTH).toBe(84);
  });
  it('84개월에 풀면 그 전 달까지 잠김 짝과 상태가 같다(풀기 전에는 아무것도 바꾸지 않는다)', () => {
    let a = v16(), b = v16();
    for (let m = 0; m < EXPORT_UNLOCK_MONTH; m++) { a = advanceMonth(a); b = advanceMonth(b); }
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    b = unlockExports(b);
    expect(isLocked(b, 'system:exports')).toBe(false);
    expect(isLocked(a, 'system:exports')).toBe(true);
  });
});
