import { describe, expect, it } from 'vitest';
import { newGame, type Candidate } from '../../sim';
import { coverage } from '../../sim/market';
import { raiseAllSalaries } from '../../sim/hr';
import { bottlenecks, hireImpact, salaryReviewPreview, trainingImpact } from './staffImpact';

// 직원 탭 "하면 무엇이 바뀌나" (#251) — 화면 계산이 실제 규칙 함수와 같은 값을 내고 상태를 바꾸지 않는다
describe('staffImpact (#251)', () => {
  it('영업 후보: 유통 커버리지 전→후와 수요 배수 — 상태는 그대로', () => {
    const s = newGame({ seed: 1 });
    const c = s.hr.candidates.find((x) => x.role === 'sales') as Candidate;
    const before = JSON.stringify(s);
    const lines = hireImpact(s, c);
    expect(JSON.stringify(s)).toBe(before);
    const cov = lines.find((l) => l.label.startsWith('국내 수요'))!;
    const c0 = coverage(s);
    const c1 = coverage({ ...s, hr: { ...s.hr, staff: [...s.hr.staff, { ...c, salary: c.askSalary }] } });
    expect(cov.note).toBe(`국내 판매 수요 ×${(c1 / c0).toFixed(2)}`);
    expect(lines.at(-1)!.label).toBe('월 급여');
  });

  it('직군마다 줄이 있고, 교육·병목 문구가 만들어진다', () => {
    const s = newGame({ seed: 1 });
    for (const c of s.hr.candidates) expect(hireImpact(s, c as Candidate).length).toBeGreaterThanOrEqual(2);
    expect(trainingImpact(s, s.hr.staff[0]!)).toMatch(/교육하면 XP \+50/);
    expect(Array.isArray(bottlenecks(s))).toBe(true);
  });

  it('연봉 협상 미리보기의 인상액 = 실제 인상(협상가 절반 포함)', () => {
    const s = newGame({ seed: 1 });
    s.hr.staff.push({ ...s.hr.staff[0]!, id: 'S-n', role: 'sales', salary: 4_000_000, traits: ['negotiator'] });
    const v = salaryReviewPreview(s);
    const copy = structuredClone(s);
    expect(v.raiseCost).toBe(raiseAllSalaries(copy, 0.05));
    expect(v.freezeMin).toBe(55);
  });
});

describe('후보 나이 표시 (#251 중 발견)', () => {
  it('ageOf는 입사한 직원용 — 후보(hiredMonth −1)에 쓰면 판 진행만큼 나이가 붙는다', async () => {
    const { ageOf } = await import('../../sim/hr');
    const s = newGame({ seed: 1 });
    const c = s.hr.candidates[0]!;
    expect(ageOf(c, 166)).toBeCloseTo((c.ageAtHire ?? 40) + 167 / 12);
  });
});
