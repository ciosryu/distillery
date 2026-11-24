import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import { newScenarioGame } from '../sim';
import { newFacilities } from './alerts';

// [#388 ① A3] 새로 열린 시설 — 9차 134개월 세이브: VIP 라운지(108개월 단계)를 사지 않았다
const load = () => {
  const r = parsePlayFile(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')); if ('error' in r) throw new Error(r.error);
  return r.save;
};

describe('#388 ① A3 newFacilities', () => {
  it('9차 134: 열렸고 사지 않은 VIP 라운지가 목록에 있다(열린 달 = 단계 month)', () => {
    const s = load();
    const vip = newFacilities(s).find((f) => f.id === 'visitor_vip');
    expect(vip?.openedMonth).toBe(108);
    expect(s.production.equipment.some((e) => e.catalogId === 'visitor_vip')).toBe(false);
  });
  it('사면 빠진다', () => {
    const s = load();
    s.production.equipment.push({ id: 'E-test', catalogId: 'visitor_vip', readyMonth: s.month } as never);
    expect(newFacilities(s).some((f) => f.id === 'visitor_vip')).toBe(false);
  });
  it('새 판(단계 전)에는 없다 · 시나리오 밖(샌드박스)도 없다', () => {
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 5, rules: 'v16' });
    expect(newFacilities(s)).toEqual([]);
    expect(newFacilities({ ...s, scenario: undefined } as never)).toEqual([]);
  });
});
