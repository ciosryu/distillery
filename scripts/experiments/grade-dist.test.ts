import { describe, expect, it } from 'vitest';
import { newScenarioGame } from '../../src/sim';
import { summarize, wipeKnown } from './grade-dist';

// grade-dist 래퍼(MGT, 결정 #339 T1·T6 · F5d 전후 표) — 표 계산과 오라클 지우기만 본다(P8 실행은 VITEST에서 건너뛴다)
describe('grade-dist', () => {
  const run = (nw: number, q: number, retail = 0, grade = 'A') => ({ pol: 'X0', seed: 1, target: 24e8, v: { month: 146, nw, q, aw: 0.5, grade }, retail, retailAtVerdict: retail, nwEnd: nw + 3e8, months: 180 });
  it('판정 달 순자산·품질·등급을 센다 — 성과 기준 24억 · S 36억 · 품질 80', () => {
    const s = summarize([run(15e8, 70), run(25e8, 81), run(37e8, 76, 5e8, 'S')]);
    expect(s).toMatchObject({ n: 3, wins: 3, verdictMonth: 146, geTarget: 2, geS: 1, q80: 1, gradeS: 1, nwP50: '25.00', endGeTarget: 2 });
    expect(s.retailAtVerdict).toBe('1.67');
  });
  it('승리 못 한 판은 판정 칸에서 빠지고 끝 순자산에는 남는다', () => {
    const s = summarize([run(20e8, 75), { pol: 'X0', seed: 2, target: 24e8, retail: 0, nwEnd: 10e8, months: 180 }]);
    expect(s).toMatchObject({ n: 2, wins: 1, nwEnd: '16.50' });
  });
  it('wipeKnown: 제품·보관 제품의 qualityKnown만 지운다 · 다른 칸은 그대로', () => {
    const g = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 1 });
    const p = { id: 'P1', name: 'x', qualityKnown: { est: 50, sigma: 5 } } as never;
    (g.commerce.products as unknown[]).push(p);
    (g.commerce.productArchive as unknown[]).push({ id: 'A1', qualityKnown: { est: 40, sigma: 3 } });
    wipeKnown(g);
    expect((g.commerce.products.at(-1) as unknown as Record<string, unknown>).qualityKnown).toBeUndefined();
    expect((g.commerce.products.at(-1) as unknown as Record<string, unknown>).name).toBe('x');
    expect((g.commerce.productArchive.at(-1) as unknown as Record<string, unknown>).qualityKnown).toBeUndefined();
  });
});
