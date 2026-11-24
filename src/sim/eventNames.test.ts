// 이벤트 제목 · 본문의 대회 · 평론가 이름이 같다 (9차 판 96개월째 「도쿄 … 수상」 제목 + 「샌프란시스코 … 메달」 본문 — MKT 발견, MGT 수리)
// 난수는 예전과 같은 두 벌을 뽑으므로 이벤트 결과 · 수치는 그대로다. 옛 판은 문구까지 예전 그대로
import { describe, expect, it } from 'vitest';
import { advanceMonths, newGame } from '.';
import { fireEvent } from './events';
import type { MonthReport } from './types';

const report = () => ({ month: 0, notes: [], events: [], expenses: {}, sales: [] }) as unknown as MonthReport;

describe('이벤트 이름 — 제목과 본문이 같은 대회 · 평론가', () => {
  it('v16 판: 「{대회} 수상」 제목의 대회 이름이 본문에 그대로 나온다(시드 여럿)', async () => {
    const { newScenarioGame } = await import('./newScenario');
    for (let seed = 1; seed <= 12; seed++) {
      const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed, rules: 'v16' });
      s.month = 70 + seed;
      fireEvent(s, 'competition_medal', report());
      const e = s.events.log.at(-1)!;
      const name = e.title.replace(/ 수상$/, '');
      expect(e.text).toContain(`${name}에서`);
    }
  });
  it('평론가 이름도 제목과 본문이 같다(평론가 방문)', async () => {
    const { newScenarioGame } = await import('./newScenario');
    for (let seed = 1; seed <= 12; seed++) {
      const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed, rules: 'v16' });
      s.month = 70 + seed;
      fireEvent(s, 'critic_visit', report());
      const e = s.events.log.at(-1)!;
      const name = e.title.replace(/^평론가 /, '').replace(/ 방문$/, '');
      expect(e.text).toContain(name);
    }
  });
  it('이벤트 결과(현금 · 기록 제목)는 이름 수리와 무관하게 결정론', () => {
    const a = advanceMonths(newGame({ seed: 7, region: 'KR' }), 90);
    const b = advanceMonths(newGame({ seed: 7, region: 'KR' }), 90);
    expect(b.events.log.map((x) => x.title)).toEqual(a.events.log.map((x) => x.title));
    expect(b.finance.cash).toBe(a.finance.cash);
  });
});
