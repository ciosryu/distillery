import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import { newScenarioGame, type GameState } from '../sim';
import { NEW_CHOICE_MONTHS, newChoices, opsOpenedMonth } from './newChoices';

// [결정 #416] 새 시설 · 새 선택 — 첫 화면 맨 위. 9차 판 세이브 두 개(133 · 159개월)와 새 판으로 본다
const load = (f: string): GameState => {
  const r = parsePlayFile(readFileSync(`docs/playtest/9/${f}`, 'utf8')); if ('error' in r) throw new Error(r.error);
  return r.save;
};
const s133 = () => load('distillery-mvp-standard-y12m2-202611241000.json');
const s159 = () => load('distillery-mvp-standard-y14m4-202611250055.json');
const keys = (s: GameState, opsOn = false) => newChoices(s, opsOn).map((c) => c.key);

describe('#416 newChoices', () => {
  it('새 판 첫 달: 리필 통 주문만(판 첫 해) — 옛 판(legacy)에는 없다', () => {
    const v16 = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 5, rules: 'v16' });
    expect(keys(v16)).toEqual(['refill']);
    expect(keys({ ...v16, month: NEW_CHOICE_MONTHS + 1 })).toEqual([]);
    const legacy = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 5, rules: 'legacy-v15' });
    expect(keys(legacy)).not.toContain('refill');
    expect(newChoices({ ...v16, scenario: undefined } as never, false)).toEqual([]);
  });

  it('9차 판을 120개월로 돌려 보면: VIP 라운지 단계(시설 붙음)가 맨 앞 → 운영 모드 → 핵심 전문가 단계 → 라운지 목표', () => {
    const s = { ...s133(), month: 120 };
    const list = newChoices(s, false);
    expect(list.map((c) => c.key)).toEqual(expect.arrayContaining(['ops', 'late:lounge_3']));
    const vip = list.find((c) => c.facilities?.some((f) => f.id === 'visitor_vip'));
    expect(vip?.openedMonth).toBe(108);
    expect(vip?.go?.target).toEqual({ tab: 'b2b' }); // 같은 단계의 IB 입찰은 원액 B2B 탭
    // 72개월에 열린 띠 목표는 12개월이 지나 "새로"가 아니다
    expect(list.some((c) => c.key === 'late:ladder_mid')).toBe(false);
    expect(list[0]).toBe(vip); // 맨 위 3줄 안에 시설이 든다(9차: VIP 라운지 "못봤다")
    expect(list[1]!.key).toBe('ops');
    expect(list.at(-1)!.key).toBe('late:lounge_3');
  });

  it('한 것은 빠진다 — 운영 모드를 켬 · 라운지를 삼(단계 줄은 남고 시설만 빠짐) · 목표 결과', () => {
    const s = { ...s133(), month: 120 };
    expect(keys(s, true)).not.toContain('ops');
    const bought = { ...s, production: { ...s.production, equipment: [...s.production.equipment, { id: 'E-t', catalogId: 'visitor_vip', readyMonth: 120 } as never] } };
    const st = newChoices(bought, false).find((c) => c.title.includes('VIP'));
    expect(st).toBeDefined();
    expect(st!.facilities).toBeUndefined();
    const won = { ...s, progress: { ...s.progress, lateGoals: [...(s.progress.lateGoals ?? []), { id: 'lounge_3' as const, month: 119, result: 'done' as const }] } };
    expect(keys(won)).not.toContain('late:lounge_3');
  });

  it('9차 판 끝(159개월)을 불러와도 맨 위가 붐비지 않는다 — 승리(150)로 열린 15년 목표 하나', () => {
    const s = s159();
    expect(opsOpenedMonth(s)).toBe(120);
    expect(keys(s)).toEqual(['late:aged15_sold']);
    expect(keys(s133())).toEqual([]); // 133개월: 120 · 108에 열린 것은 12개월이 지났다
  });
});
