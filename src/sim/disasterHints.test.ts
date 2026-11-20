import { describe, expect, it } from 'vitest';
import { newScenarioGame, type GameState } from '../sim';
import { undefendedDisasters } from './events';

// 7차 판 뒤 화면 계산 (docs/playtest/7/mgt/README.md · [제안 P-MGT-61]) — 방재 설비가 있었으면 막았을 재해. 상태를 바꾸지 않는다
const mvp = (): GameState => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 1 });

describe('undefendedDisasters (P-MGT-61)', () => {
  const withReports = (s: GameState, events: Record<number, string[]>) => {
    s.month = 30;
    s.history.reports = Array.from({ length: 30 }, (_, m) => ({ month: m, events: events[m] ?? [] }) as unknown as GameState['history']['reports'][number]);
    return s;
  };

  it('최근 24개월 결산의 재해 제목을 세고, 방재 설비 이름·값을 붙인다', () => {
    const s = withReports(mvp(), { 3: ['폭설'], 10: ['폭설', '한파'], 20: ['한파'] });
    s.scenario!.locked = s.scenario!.locked.filter((x) => x !== 'facility:facility_snow' && x !== 'facility:facility_heating');
    const d = undefendedDisasters(s, 24);
    expect(d.find((x) => x.defId === 'snowstorm')).toMatchObject({ count: 1, facility: '내설 지붕 보강', cost: 40_000_000 }); // 3개월째는 24개월 밖
    expect(d.find((x) => x.defId === 'cold_wave')?.count).toBe(2);
  });

  it('설비가 있거나 잠겨 있으면 뺀다', () => {
    const s = withReports(mvp(), { 10: ['폭설', '한파'] });
    s.scenario!.locked = s.scenario!.locked.filter((x) => x !== 'facility:facility_snow').concat('facility:facility_heating');
    s.production.equipment.push({ id: 'EX', catalogId: 'facility_snow', readyMonth: 0 } as GameState['production']['equipment'][number]);
    expect(undefendedDisasters(s, 24)).toEqual([]);
  });
});
