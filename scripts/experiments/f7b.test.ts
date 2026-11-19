// F7-B 하네스(P-MGT-55) — 설정 목록 · 시드 짝 통계 · 줄 읽기 · 후보 값 덮어쓰기 검사
import { describe, expect, it } from 'vitest';
import { F7B_PREFIX, f7bConfigs, f7bReport, paired, parseLines, verdictOf, type F7bLine } from './f7b';
import { loadKnobCandidates } from './mgtKnobs';
import { KNOBS } from '../../src/sim/content/difficulty';

describe('F7-B 설정', () => {
  it('13개 — N · E · H + 5영역 × Easy·Hard 단독, competition 자리(2번째)는 프리셋 밖에서 늘 2', () => {
    const c = f7bConfigs();
    expect(c.map((x) => x.id)).toEqual(['N', 'E', 'H', 'macroE', 'macroH', 'tasteE', 'tasteH', 'supplyE', 'supplyH', 'incidentsE', 'incidentsH', 'financeE', 'financeH']);
    for (const x of c.filter((y) => y.domain)) {
      expect(x.code[1]).toBe('2');
      expect([...x.code].filter((d) => d !== '2').length).toBe(1);
    }
    expect(c.find((x) => x.id === 'financeH')!.code).toBe('222223');
    expect(c.find((x) => x.id === 'macroE')!.code).toBe('122222');
  });
});

describe('F7-B 통계 · 줄', () => {
  it('시드 짝 차이: 같은 시드끼리만 · t · 이긴 수 · 판독 문턱 ±2', () => {
    const a = new Map([[1, 10], [2, 12], [3, 11], [9, 100]]), b = new Map([[1, 9], [2, 10], [3, 10]]);
    const p = paired(a, b);
    expect(p.n).toBe(3);
    expect(p.mean).toBeCloseTo(4 / 3);
    expect(p.wins).toBe(3);
    expect(p.t).toBeGreaterThan(2);
    expect(verdictOf(2)).toBe('이김');
    expect(verdictOf(-2)).toBe('짐');
    expect(verdictOf(1.9)).toBe('비김');
  });

  it('#F7B 줄만 읽고 보고 표를 낸다', () => {
    const mk = (cfg: string, seed: number, nw: number): F7bLine => ({ cfg, strat: 'X0', tier: 'standard', months: 180, seed, nw, bankrupt: -1, win: 'win', winMonth: 145, dv: 5e7, negMonths: 0, minCash72: 5e7, ladder: 1, loanIds: ['kr_regional'], loansMax: 3e8, interest: 1e7, emergency: false, cands144: 3, goal: true });
    const text = ['잡음', ...[1, 2, 3].flatMap((s) => [mk('N', s, 25e8 + s * 1e7), mk('E', s, 30e8 + s * 2e7), mk('H', s, 20e8 - s * 1e7)]).map((l) => F7B_PREFIX + JSON.stringify(l))].join('\n');
    const lines = parseLines(text);
    expect(lines.length).toBe(9);
    const r = f7bReport(lines);
    expect(r).toContain('## F7-B · standard·180');
    expect(r).toContain('조건 3 간격(X0)');
    expect(r).toContain('조건 1 Hard 생존: X0 파산 0/3');
  });
});

describe('KNOB_CAND — 실험 안에서만 KNOBS 후보 값 덮어쓰기', () => {
  const fresh = () => structuredClone(KNOBS);
  it('파일의 easy·hard를 넣고, Normal 칸은 없다(늘 1) · 여러 파일 합치기', () => {
    const k = fresh();
    const before = { ...KNOBS['finance.loanRate']! };
    // 실제 표([결정 #331])와 다른 시험값 — 원본이 그대로인지 보려고
    const files: Record<string, string> = { a: JSON.stringify({ 'finance.loanRate': { easy: 0.6, hard: 1.6, why: 'x' } }), b: JSON.stringify({ 'taste.trendSigma': { easy: 0.5, hard: 1.9 } }) };
    const r = loadKnobCandidates('a,b', k, (f) => files[f]!);
    expect(r).toEqual({ rows: 2, files: ['a', 'b'] });
    expect(k['finance.loanRate']).toMatchObject({ easy: 0.6, hard: 1.6 });
    expect(k['taste.trendSigma']).toMatchObject({ easy: 0.5, hard: 1.9 });
    expect(KNOBS['finance.loanRate']).toEqual(before); // 원본은 그대로(주입한 표만 바뀐다)
  });
  it('없는 id · 음수 · 두 파일 중복은 예외 · 빈 값이면 null', () => {
    const k = fresh();
    expect(loadKnobCandidates(undefined, k)).toBeNull();
    expect(() => loadKnobCandidates('a', k, () => JSON.stringify({ 'finance.nope': { easy: 1, hard: 1 } }))).toThrow(/KNOBS에 없다/);
    expect(() => loadKnobCandidates('a', k, () => JSON.stringify({ 'finance.loanRate': { easy: -1, hard: 1 } }))).toThrow(/0 이상/);
    expect(() => loadKnobCandidates('a,b', k, () => JSON.stringify({ 'finance.loanRate': { easy: 1, hard: 1 } }))).toThrow(/두 번/);
  });
});
