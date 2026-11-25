import { describe, expect, it } from 'vitest';
import { newScenarioGame, type GameState } from '../sim';
import { emptyCaskOf } from '../sim/newGame';
import { monthTodos, onggiIdle } from './alerts';
import { newChoices } from './newChoices';
import { turnNews } from './TurnBrief';

// [결정 #425] 옹기 알림 화면 — PROD onggiIdleSince(빈 옹기 + 「소주 → 옹기」 꺼짐이 시작된 달)를 읽는다
const game = (rules: 'v16' | 'legacy-v15' = 'v16'): GameState => {
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 3, rules });
  for (let i = 0; i < 3; i++) s.inventory.casks.push(emptyCaskOf(s, 'onggi_jar'));
  return s;
};

describe('#425 onggi alert screen', () => {
  it('3개월 미만 · 기록 없음은 할 일이 없고, 3개월째부터 매달 info 「빈 옹기 3개가 n개월째」 → 통입 칸', () => {
    const s = game();
    expect(onggiIdle(s)).toBeNull();
    s.inventory.onggiIdleSince = 10; s.month = 12;
    expect(onggiIdle(s)).toBeNull();
    s.month = 13;
    expect(onggiIdle(s)).toEqual({ jars: 3, months: 3 });
    s.month = 20;
    const t = monthTodos(s).find((x) => x.id === 'onggi-idle')!;
    expect(t).toMatchObject({ level: 'info', target: { anchor: 'mvp-fill' } });
    expect(t.text).toContain('빈 옹기 3개가 10개월째');
  });
  it('켜면 · 옹기가 다 차면 · 옛 판이면 없다', () => {
    const s = game(); s.inventory.onggiIdleSince = 0; s.month = 5;
    expect(onggiIdle({ ...s, inventory: { ...s.inventory, autoFill: { kinds: ['malt', 'grain', 'soju'] } } })).toBeNull();
    expect(onggiIdle({ ...s, inventory: { ...s.inventory, casks: s.inventory.casks.filter((c) => c.typeId !== 'onggi_jar') } })).toBeNull();
    const old = game('legacy-v15'); old.inventory.onggiIdleSince = 0; old.month = 5;
    expect(onggiIdle(old)).toBeNull();
  });
  it('맨 위 띠: 옹기가 놀기 시작한 달부터 12개월 「자동 통입 — 소주 → 옹기」 · 켜면 빠진다', () => {
    const s = game(); s.month = 30; s.inventory.onggiIdleSince = 29;
    const c = newChoices(s, false).find((x) => x.key === 'onggi-auto')!;
    expect(c).toMatchObject({ openedMonth: 29, go: { target: { anchor: 'mvp-fill' } } });
    s.inventory.autoFill = { kinds: ['malt', 'grain', 'soju'] };
    expect(newChoices(s, false).some((x) => x.key === 'onggi-auto')).toBe(false);
    s.inventory.autoFill = undefined; s.month = 29 + 13;
    expect(newChoices(s, false).some((x) => x.key === 'onggi-auto')).toBe(false);
  });
  it('소식 창: 옹기 결산 메모 두 가지를 고른다', () => {
    const s = game(); s.month = 5;
    s.history.reports = [{ ...(s.history.reports.at(-1) ?? {}), month: 4, notes: ['빈 옹기 3개가 3개월째 놀고 있다 — …', '옹기는 자동 통입이 저절로 채우지 않는다 — …'], events: [] } as never];
    expect(turnNews(s, 4).notes.map((n) => n.text)).toEqual(['빈 옹기 3개가 3개월째 놀고 있다 — …', '옹기는 자동 통입이 저절로 채우지 않는다 — …']);
  });
});
