// [P-PROD-79 · P-MGT-72 (가)] 「숙성 점검」 분기 메모의 12년 감점 알림 — 월 진행 안에서도 옮기지 않은 통을 잡는다
// 10차 판 121 ~ 150개월: 첫 채움 통 17개가 12년 감점 18 ~ 35였는데 메모는 늘 「12년 감점이 큰 통은 없다」 — 목재 개월은 +1, s.month는 그대로라 모든 통이 「옮긴 원액」으로 빠졌다
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { advanceMonth } from './step';
import { tanninOutlook } from './warehouse';
import type { GameState } from './types';

const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/10/distillery-mvp-standard-y13m10-202611270816.json', 'utf8')).save)!;
const agingNote = (s: GameState) => s.history.reports.at(-1)!.notes.find((n) => /숙성 점검.*맛봤다/.test(n));

describe('[P-PROD-79] 숙성 점검 — 12년 감점 큰 통 알림', () => {
  it('10차 153개월 세이브를 한 달 진행하면(분기 첫 달) 첫 채움 통이 메모에 잡힌다', () => {
    const s = advanceMonth(load());
    const note = agingNote(s)!;
    expect(note).toBeDefined();
    expect(note).toMatch(/12년에 나무 맛이 넘쳐 감점 약 \d+/);
    expect(note).not.toMatch(/넘는 통은 없다/);
    expect(note).toMatch(/K\d+ 외 \d+통(\(첫 채움 \d+통\))?은 지금 통 그대로면/);
  });
  it('결산 뒤 상태(화면)에서는 옮기지 않은 통에 moved가 없다 — 화면 값은 그대로', () => {
    const s = load();
    for (const id of ['K17', 'K19', 'K66']) expect(tanninOutlook(s, s.inventory.casks.find((c) => c.id === id)!)!.moved).toBeUndefined();
  });
  it('여러 달 전에 옮긴 원액은 여전히 「옮긴 원액」이다', () => {
    const s = load();
    const c = s.inventory.casks.find((x) => x.id === 'K17')!;
    const moved = { ...c, filledMonth: s.month - 10 };
    expect(tanninOutlook(s, moved)!.moved?.monthsHere).toBe(10);
  });
});
