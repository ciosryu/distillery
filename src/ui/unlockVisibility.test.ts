// 새 기능 열림 — 탭 연결·소식 창 강조 (7차 판: 11년 차 핵심 전문가 해금을 0초에 넘겨 "못 봤다", 할 일 버튼은 [판매]로 보냈다)
import { describe, expect, it } from 'vitest';
import { newScenarioGame, stagesOf, type GameState } from '../sim';
import { monthTodos, stageTarget } from './alerts';
import { turnNews } from './TurnBrief';

const mvp = (): GameState => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });

describe('새 기능 열림 → 그 탭', () => {
  it('11년 차 핵심 전문가는 직원 탭(전에는 판매로 떨어졌다) · 나머지 단계는 그대로', () => {
    const s = mvp();
    const by = (id: string) => stageTarget(stagesOf(s).find((x) => x.id === id)!);
    expect(by('y11_specialist')).toEqual({ tab: 'staff', label: '직원' });
    expect(by('y5_market').tab).toBe('blendlab');
    expect(by('y7_retail').tab).toBe('b2b');
    expect(by('y9_casks').tab).toBe('b2b');
  });
  it('할 일 "새로 열림 — 11년 차" 버튼이 직원 탭', () => {
    const s = mvp(); s.month = 121; s.scenario!.stagesDone = [...(s.scenario!.stagesDone ?? []), 'y11_specialist'];
    const t = monthTodos(s).find((x) => x.id === 'stage-y11_specialist')!;
    expect(t).toMatchObject({ action: '직원', target: { tab: 'staff' } });
  });
  it('소식 창: "새 기능 열림" 메모는 일반 줄에서 빼고 탭 버튼이 붙은 강조 줄로', () => {
    const s = mvp(); s.month = 121;
    const st = stagesOf(s).find((x) => x.id === 'y11_specialist')!;
    s.history.reports = [{ ...(s.history.reports.at(-1) ?? {}), month: 120, notes: [`새 기능 열림 — ${st.title}: ${st.text}`, '정기 임금 조정 — 전 직원 급여 +1.0% (매년 1월)'], events: [] } as never];
    const n = turnNews(s, 120);
    expect(n.unlocks).toEqual([expect.objectContaining({ tab: 'staff', label: '직원' })]);
    expect(n.notes.map((x) => x.text)).toEqual(['정기 임금 조정 — 전 직원 급여 +1.0% (매년 1월)']);
  });
});

describe('피니싱 단계 y5_finish ([결정 #354]) — 같은 달 y5_market과 소식 창 한 창', () => {
  it('60개월을 넘기면 두 단계가 한 소식 창(turnNews 한 번)에 줄 두 개로 · 피니싱 줄은 홈 「숙성 중인 캐스크」로', async () => {
    const { advanceMonth } = await import('../sim');
    let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1, rules: 'v16' });
    s.month = 60;
    s = advanceMonth(s);
    const { unlocks } = turnNews(s, 60);
    const ids = unlocks.map((u) => stagesOf(s).find((x) => u.text.includes(x.title))?.id);
    expect(ids).toEqual(['y5_market', 'y5_finish']);
    expect(unlocks.find((u) => u.text.includes('피니싱'))).toMatchObject({ tab: 'home', label: '숙성 중인 캐스크' });
    expect(stageTarget(stagesOf(s).find((x) => x.id === 'y5_finish')!)).toEqual({ tab: 'home', label: '숙성 중인 캐스크' });
  });
});
