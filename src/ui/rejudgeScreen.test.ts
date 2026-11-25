import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import { applyAction, bestVerdict, type GameState } from '../sim';
import { rejudgeLine, sGradeRows } from './Verdict';
import { GRADE_NOTE } from './gradeHints';

// [결정 #422] 재판정 화면 — 9차 159개월 세이브(150개월 승리 · A)에 재판정 S를 얹어 본다
const load = (): GameState => {
  const r = parsePlayFile(readFileSync('docs/playtest/9/distillery-mvp-standard-y14m4-202611250055.json', 'utf8')); if ('error' in r) throw new Error(r.error);
  return r.save;
};
const withBest = (s: GameState): GameState => {
  const v = s.progress.verdict!;
  const p = s.commerce.products.find((x) => x.name.includes('셰리캐스크 피니시 12년'))!;
  s.progress.verdictBest = { ...v, grade: 'S', month: 158, acknowledged: undefined, rejudged: { month: 158, productId: p.id, lotId: 'L-test' } };
  return s;
};

describe('#422 rejudge screen', () => {
  it('재판정이 없으면 한 줄도 없다', () => {
    expect(rejudgeLine(load())).toBeNull();
  });
  it('「12년으로 승리(A · 승리 달) → 「제품」 첫 출하로 S(재판정 달)」', () => {
    const s = withBest(load());
    expect(rejudgeLine(s)).toBe('12년으로 승리(A · 2039년 7월) → 「김포 셰리캐스크 피니시 12년」 첫 출하로 S(2040년 2월)');
    expect(bestVerdict(s)!.grade).toBe('A'); // [결정 #433] 등급은 승리 달 첫 판정 하나 — 옛 verdictBest는 읽지 않는다(화면 줄은 ARCH 화면 PR이 「명작」으로 바꾼다)
  });
  it('결과 화면은 재판정이 닫히지 않은 동안만 다시 뜬다 — 같은 버튼이 재판정을 닫는다(첫 판정은 이미 닫혀 있다)', () => {
    const s = withBest(load());
    const show = (g: GameState) => !!g.progress.verdict && (!g.progress.verdict.acknowledged || (g.progress.verdictBest != null && !g.progress.verdictBest.acknowledged)); // App.tsx 조건과 같은 식
    expect(s.progress.verdict!.acknowledged).toBe(true);
    expect(show(s)).toBe(true);
    const r = applyAction(s, { type: 'acknowledgeVerdict' });
    expect(show(r.state)).toBe(false);
    expect(rejudgeLine(r.state)).toContain('첫 출하로 S'); // 목표 칸 한 줄은 남는다
  });
  it('[결정 #427] 재판정의 S 조건 줄은 품질 · 인지도 둘 — 순자산 줄이 없고, 첫 판정은 셋 그대로', () => {
    const s = withBest(load());
    expect(sGradeRows(s.progress.verdictBest!, true).map((r) => r.id)).toEqual(['s-quality', 's-awareness']);
    expect(sGradeRows(s.progress.verdict!).map((r) => r.id)).toEqual(['s-networth', 's-quality', 's-awareness']);
    expect(GRADE_NOTE.once).toContain('품질 · 인지도만');
  });
});
