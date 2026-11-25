import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import { applyAction, bestVerdict, type GameState } from '../sim';
import { masterpieceLine, masterpieceRows, sGradeRows } from './Verdict';
import { GRADE_NOTE } from './gradeHints';

// [결정 #433] 「명작」 화면 — 9차 159개월 세이브(150개월 승리 · A)에 명작 칭호를 얹어 본다. 등급은 A 그대로
const load = (): GameState => {
  const r = parsePlayFile(readFileSync('docs/playtest/9/distillery-mvp-standard-y14m4-202611250055.json', 'utf8')); if ('error' in r) throw new Error(r.error);
  return r.save;
};
const withMasterpiece = (s: GameState): GameState => {
  const p = s.commerce.products.find((x) => x.name.includes('셰리캐스크 피니시 12년'))!;
  s.progress.masterpiece = { month: 158, productId: p.id, lotId: 'L-test', quality: 84.2, awareness: 0.56, ageYears: 15 };
  return s;
};
// App.tsx 조건과 같은 식
const show = (g: GameState) => !!g.progress.verdict && (!g.progress.verdict.acknowledged || (g.progress.masterpiece != null && !g.progress.masterpiece.acknowledged));

describe('#433 masterpiece screen', () => {
  it('칭호가 없으면 줄이 없다', () => {
    const s = load();
    expect(masterpieceLine(s)).toBeNull();
    expect(masterpieceRows(s)).toEqual([]);
  });
  it('「「제품」(표기 15년) 첫 출하 · 받은 달」 + 조건 두 줄(품질 · 인지도 — 순자산 없음) · 등급은 A 그대로', () => {
    const s = withMasterpiece(load());
    expect(masterpieceLine(s)).toBe('「김포 셰리캐스크 피니시 12년」(표기 15년) 첫 출하 · 2040년 2월');
    expect(masterpieceRows(s).map((r) => [r.id, r.ok])).toEqual([['m-quality', true], ['m-awareness', true]]);
    expect(bestVerdict(s)!.grade).toBe('A');
    expect(sGradeRows(s.progress.verdict!).map((r) => r.id)).toEqual(['s-networth', 's-quality', 's-awareness']); // 첫 판정 S 조건은 셋 그대로
  });
  it('결과 화면은 명작이 닫히지 않은 동안만 다시 뜬다 — 같은 버튼이 명작을 닫고, 목표 칸 한 줄은 남는다', () => {
    const s = withMasterpiece(load());
    expect(s.progress.verdict!.acknowledged).toBe(true);
    expect(show(s)).toBe(true);
    const r = applyAction(s, { type: 'acknowledgeVerdict' });
    expect(show(r.state)).toBe(false);
    expect(masterpieceLine(r.state)).toContain('표기 15년');
  });
  it('옛 세이브의 재판정 S(verdictBest)는 화면을 다시 띄우지 않고 등급도 바꾸지 않는다', () => {
    const s = load();
    s.progress.verdictBest = { ...s.progress.verdict!, grade: 'S', acknowledged: undefined, rejudged: { month: 158, productId: 'x', lotId: 'y' } };
    expect(show(s)).toBe(false);
    expect(bestVerdict(s)!.grade).toBe('A');
  });
  it('안내 문구: 등급은 승리한 달에 한 번 · 명작은 따로', () => {
    expect(GRADE_NOTE.once).toContain('한 번');
    expect(GRADE_NOTE.once).toContain('명작');
    expect(GRADE_NOTE.once).not.toContain('재판정');
  });
});
