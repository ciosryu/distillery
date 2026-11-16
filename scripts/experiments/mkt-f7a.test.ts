// F7-A 하네스(mkt-f7a.ts)의 행 목록·시드 짝 합치기 — 측정 스크립트의 자기 검사(게임 코드 아님)
import { describe, expect, it } from 'vitest';
import { f7aRows, paired, report, wilson, type F7Line } from './mkt-f7a';

const X0F = { launch: 'new', gameTags: true, retailFrom: 84, specialist: 'sales' };
const line = (id: string, seed: number, nw: number, o: Partial<F7Line> = {}): F7Line => ({
  id, tier: 'standard', months: 180, seed, nw, nwLegacy: nw, survived: true, bankrupt: -1, win: 'win', winMonth: 145, minCash72: 1, minCash: 1, minCashMonth: 20,
  contracts: 0, retailRev: 0, penalty: 0, shortBottles: 0, shortMonths: 0, broken: 0, domRev: 0, dv: 5, dvMonth: 30, cash83: 7, nw83: 9, ...o,
});

describe('f7aRows — #581 §3 행 설계', () => {
  const rows = f7aRows();
  it('46행(A 30 · B 10 · C 6) · ID가 겹치지 않고 빈칸이 없다(ONLY는 이름의 첫 낱말로 고른다)', () => {
    expect(rows.length).toBe(46);
    expect(rows.filter((r) => r.block === 'A').length).toBe(30);
    expect(rows.filter((r) => r.block === 'B').length).toBe(10);
    expect(rows.filter((r) => r.block === 'C').length).toBe(6);
    expect(new Set(rows.map((r) => r.id)).size).toBe(46);
    for (const r of rows) { expect(r.id).not.toMatch(/[\s,]/); expect(r.name.split(' ')[0]).toBe(r.id); }
  });
  it('첫 행은 X0 — X0F 그대로(덮어쓰는 값이 없다)', () => {
    expect(rows[0]!.id).toBe('A4·b15');
    expect(rows[0]!.over(X0F)).toEqual(X0F);
  });
  it('P8 기준 행과 같은 정책 조각: 8배치 = X13F · 장기 보유 = X0P · 납품 끔 = retailFrom 없음', () => {
    const by = (id: string) => rows.find((r) => r.id === id)!.over(X0F);
    expect(by('A8·b15')).toEqual({ ...X0F, maltB: 8 });
    expect(by('A6·b15')).toEqual({ ...X0F, maltB: 6 });
    expect(by('BP·sales')).toEqual({ ...X0F, protectFrom: [96, 8] });
    expect(by('A4·0')).toEqual({ ...X0F, retailFrom: undefined });
    expect('retailFrom' in by('A4·0')).toBe(true); // 키가 있어야 P8 기본값을 덮어쓴다
    expect(by('B4·none')).toEqual({ ...X0F, specialist: 'none' });
    expect(by('B8·wh')).toEqual({ ...X0F, maltB: 8, specialist: 'warehouse' });
  });
  it('위약금은 행 단위(ext.retail) — 지금 게임 값 15%인 행은 ext가 없다', () => {
    const by = (id: string) => rows.find((r) => r.id === id)!.over(X0F);
    expect(by('A4·b100').ext).toEqual({ retail: { penaltyShare: 1 } });
    expect(by('A6·s50')).toEqual({ ...X0F, maltB: 6, retailFrom: undefined, retailMode: 'small', ext: { retail: { penaltyShare: 0.5 } } });
    expect(by('A8·m15')).toEqual({ ...X0F, maltB: 8, retailFrom: undefined, retailMode: 'mid' });
    for (const r of rows.filter((x) => x.penalty === 15 && !x.exportUnlock)) expect(r.over(X0F).ext).toBeUndefined();
  });
  it('블록 C는 수출 해제 표시만 다르다 — 잠긴 짝은 블록 A의 같은 행', () => {
    const by = (id: string) => rows.find((r) => r.id === id)!.over(X0F);
    for (const b of [4, 6, 8]) {
      expect(by(`C${b}·0x`)).toEqual({ ...by(`A${b}·0`), ext: { exportUnlock: true } });
      expect(by(`C${b}·bx`)).toEqual({ ...by(`A${b}·b15`), ext: { exportUnlock: true } });
    }
  });
});

describe('시드 짝 · 합치기', () => {
  it('wilson: 0/0은 NaN, 5/10은 0.5를 품는다', () => {
    expect(wilson(0, 0)[0]).toBeNaN();
    const [lo, hi] = wilson(5, 10);
    expect(lo).toBeGreaterThan(0.2); expect(lo).toBeLessThan(0.5); expect(hi).toBeGreaterThan(0.5); expect(hi).toBeLessThan(0.8);
  });
  it('paired: 둘 다 있는 시드만 짝짓는다', () => {
    const a = new Map([1, 2, 3].map((s) => [s, line('A4·b15', s, 10 + s)]));
    const b = new Map([2, 3, 4].map((s) => [s, line('A4·0', s, 10)]));
    const p = paired(a, b);
    expect(p.n).toBe(2);
    expect(p.mean).toBe(2.5);
    expect(p.wins).toBe(2);
    expect(paired(a, undefined).n).toBe(0);
  });
  it('report: 묶음 여럿의 줄을 티어·개월별로 나눠 표를 내고, 같은 행·시드가 두 번 오면 멈춘다', () => {
    const lines = [1, 2].flatMap((s) => [line('A4·b15', s, 30e8), line('A4·0', s, 28e8), line('A4·s15', s, 29e8), line('A4·b15', s, 20e8, { tier: 'micro' })]);
    const out: string[] = [];
    report(lines, (s) => out.push(s));
    const text = out.join('\n');
    expect(text).toContain('## F7-A · standard·180개월 — 3/46행 · 시드 1~2 (2)');
    expect(text).toContain('## F7-A · micro·180개월 — 1/46행');
    expect(text).toContain('| 4배치 | 봇 규칙 | +2.00 · t — · 2/2'); // 납품 끔 대비
    expect(text).toContain('| 4배치 | 15% | +1.00 · t — · 2/2'); // 봇 규칙 − 작은 계약
    expect(text).toContain('다른 행: 없음(2행 견줌)');
    expect(() => report([...lines, line('A4·0', 1, 1)], () => {})).toThrow(/두 번/);
  });
  it('report: 84개월 전 상태가 기준 행과 다르면 굵게 알린다(합격 조건 4)', () => {
    const out: string[] = [];
    report([line('A4·0', 1, 28e8), line('A4·b15', 1, 30e8, { cash83: 8 })], (s) => out.push(s));
    expect(out.join('\n')).toContain('**A4·b15 ↔ A4·0: 1시드**');
  });
});
