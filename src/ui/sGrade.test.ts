import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import { GRADE, type GameState } from '../sim';
import { bestEligibleMaltQuality, isWinBottling, sGradeNow, sGradeRowText } from './sGrade';
import { winDelayNote } from './alerts';

// [결정 #439] S 등급 세 조건을 승리 전에 보인다. 10차 153 세이브의 승리 · 판정을 지워 「승리 직전」으로 본다(첫 채움 버번 몰트가 목재 144개월↑)
const load = (f: string): GameState => {
  const r = parsePlayFile(readFileSync(f, 'utf8')); if ('error' in r) throw new Error(r.error);
  return r.save;
};
const beforeWin = (): GameState => {
  const s = load('docs/playtest/10/distillery-mvp-standard-y13m10-202611270816.json');
  delete s.progress.win;
  delete s.progress.verdict;
  return s;
};

describe('S 등급 조건 미리 보기 (#439)', () => {
  it('승리 뒤 · 옛 판에는 없다', () => {
    const won = load('docs/playtest/10/distillery-mvp-standard-y13m10-202611270816.json');
    expect(sGradeNow(won)).toBeNull();
  });
  it('승리 전 — 세 줄 · 품질은 적격 몰트 조합의 예상(병입 탭과 같은 값) · 80 미만이면 A', () => {
    const s = beforeWin();
    const g = sGradeNow(s)!;
    expect(g.rows.map((r) => r.id)).toEqual(['quality', 'netWorth', 'awareness']);
    const q = bestEligibleMaltQuality(s)!;
    expect(q).toBeLessThan(GRADE.sFlagshipQuality); // 첫 채움 버번 — 10차 판에서 S를 가른 조건
    expect(g.rows[0]!.ok).toBe(false);
    expect(g.rows[1]!.ok).toBe(true);
    expect(g.rows[2]!.ok).toBe(true);
    expect(g.grade).toBe('A');
    expect(sGradeRowText(g.rows[0]!)).toContain('(지금 ');
  });
  it('병입 미리보기 품질을 넘기면 그 값으로 본다 — 85면 S', () => {
    const g = sGradeNow(beforeWin(), 85)!;
    expect(g.rows[0]!.ok).toBe(true);
    expect(g.grade).toBe('S');
  });
  it('「기다리면 n개월 뒤」 문장은 없다 — ⏳ 줄은 품질 조건을 나란히 말한다', () => {
    const s = beforeWin();
    s.progress.firstEligibleMonth = s.month - 3;
    const t = winDelayNote(s)!;
    expect(t).toContain(`12년 품질 ${GRADE.sFlagshipQuality}도 본다`);
    expect(t).not.toMatch(/기다리면|개월 뒤/);
  });
  it('승리 병입 판별 — 목재 144개월↑ 자가 몰트 통이면 true, 어린 통이 섞이면 false', () => {
    const s = beforeWin();
    const old = s.inventory.casks.find((c) => c.contents?.kind === 'malt' && c.contents.oakMonths >= 144 && !c.owner)!;
    const young = s.inventory.casks.find((c) => c.contents?.kind === 'malt' && c.contents.oakMonths < 60 && !c.owner)!;
    expect(isWinBottling(s, [{ source: 'cask', id: old.id, liters: 10 }])).toBe(true);
    expect(isWinBottling(s, [{ source: 'cask', id: old.id, liters: 10 }, { source: 'cask', id: young.id, liters: 10 }])).toBe(false);
  });
});
