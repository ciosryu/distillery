// 고장 수리 끝 알림을 새 설비 "가동 시작"과 구분 (7차 판 MGT 넘김 — 142개월 수리 끝이 새 설비처럼 읽혔다). 메모 글자만, 수치는 그대로
import { describe, expect, it } from 'vitest';
import { advanceMonth, newScenarioGame } from '.';
import { applyEffects } from './events';
import { rngFor } from './rng';

describe('수리 끝 알림', () => {
  it('일반 수리(stillDown 2개월) → 다시 도는 달의 결산 "… 수리 끝 — 다시 가동" · "가동 시작" 아님 · 표시 필드는 지워진다', () => {
    let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 2 });
    for (let i = 0; i < 3; i++) s = advanceMonth(s); // 시작 증류기가 돌기 시작한 뒤
    const stills = s.production.equipment.filter((e) => e.readyMonth <= s.month && e.feintsLPA != null);
    expect(stills.length).toBeGreaterThan(0);
    applyEffects(s, [{ type: 'stillDown', months: 2 }], rngFor(s.seed, s.month, 'test'), '증류기 고장');
    const st = s.production.equipment.find((e) => e.repairUntil != null)!;
    expect(st.repairUntil).toBe(s.month + 2);
    const back = st.repairUntil!;
    for (let i = 0; i < 3; i++) s = advanceMonth(s); // 그 달(back)의 결산까지
    const notes = s.history.reports.find((r) => r.month === back)!.notes;
    expect(notes.some((n) => n.endsWith(`${st.id} 수리 끝 — 다시 가동`))).toBe(true);
    expect(notes.some((n) => n.endsWith('가동 시작'))).toBe(false);
    expect(s.production.equipment.find((e) => e.id === st.id)!.repairUntil).toBeUndefined();
  });
});
