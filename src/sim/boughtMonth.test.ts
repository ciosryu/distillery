import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyAction, newScenarioGame } from './index';
import { migrateSave } from './migrate';
import { boughtMonthOf } from './valuation';
import { EQUIPMENT } from './content/catalog';
import type { GameState } from './types';

// [#388 ① G4] 설비 산 달 — readyMonth는 수리 때 덮어쓰이므로 감가 나이는 boughtMonth로 센다(MGT 지적)
describe('#388 ① G4 boughtMonth', () => {
  it('새 판 시작 설비는 0 · 산 설비는 산 달 · 수리로 readyMonth가 바뀌어도 그대로', () => {
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 5, rules: 'v16' });
    expect(s.production.equipment.every((e) => e.boughtMonth === 0)).toBe(true);
    s.month = 30;
    s.finance.cash = 10_000_000_000;
    const r = applyAction(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' });
    expect(r.error).toBeUndefined();
    const e = r.state.production.equipment.at(-1)!;
    expect(e.boughtMonth).toBe(30);
    e.readyMonth = 90; // 수리(events.ts stillDown이 하는 것)
    expect(boughtMonthOf(e)).toBe(30);
  });
  it('옛 세이브(필드 없음): readyMonth − leadMonths · readyMonth 0이면 0 · 증류기는 0(수리로 readyMonth가 덮여 가릴 수 없다 — 보수적)', () => {
    const s: GameState = migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')).save)!;
    expect(s.production.equipment.some((e) => e.boughtMonth != null)).toBe(false);
    for (const e of s.production.equipment) {
      const def = EQUIPMENT[e.catalogId];
      expect(boughtMonthOf(e)).toBe(e.readyMonth <= 0 || def?.kind === 'still' ? 0 : Math.max(0, e.readyMonth - (def?.leadMonths ?? 0)));
    }
    const still = s.production.equipment.find((e) => EQUIPMENT[e.catalogId]?.kind === 'still')!;
    expect(still.readyMonth).toBeGreaterThan(0); // 9차 133 — 수리로 덮인 시작 증류기
    expect(boughtMonthOf(still)).toBe(0);
  });
});
