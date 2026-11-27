// P-MGT-72 (가)(나) · P-PROD-79(10차 153개월) — 「숙성 점검」 분기 메모의 12년 감점 알림이 틱 안에서 모든 통을 「옮긴 원액」으로 읽어 늘 「없다」였다.
// 153개월 세이브: 화면(결산 뒤) 기준 감점 10↑ 통 17개(첫 채움 18.5 ~ 21.5 · K74 · K388 · K389 32 ~ 35). 다음 분기 첫 달(154 결산)의 메모가 그 통들을 알려야 한다
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { advanceMonth, type GameState } from './index';
import { parsePlayFile } from '../store/playlog';
import { tanninOutlook } from './warehouse';
import { TASK_VALUES } from './staffTaskRules';
import { TASK_NOTE } from './staffTasks';

const load = (): GameState => {
  const r = parsePlayFile(readFileSync('docs/playtest/10/distillery-mvp-standard-y13m10-202611270816.json', 'utf8')); if ('error' in r) throw new Error(r.error);
  return r.save;
};
const agingNote = (s: GameState) => s.history.reports.at(-1)!.notes.find((n) => n.startsWith(`${TASK_NOTE} 숙성 점검`) && n.includes('넘은 통'));

describe('P-MGT-72 「숙성 점검」 12년 감점 알림', () => {
  it('10차 153 → 154(분기 첫 달 결산): 옮기지 않은 첫 채움 통들이 메모에 잡힌다 · 「없다」가 아니다', () => {
    const s = load();
    const V = TASK_VALUES.agingCheck;
    const screen = s.inventory.casks.filter((c) => c.contents && !c.owner && c.contents.oakMonths >= V.minOakMonths).filter((c) => { const t = tanninOutlook(s, c); return (t?.penalty ?? 0) >= V.flagPenalty && !t?.moved; });
    expect(screen.length).toBe(17);
    const n = agingNote(advanceMonth(s))!;
    expect(n).toBeDefined();
    expect(n).not.toContain('넘는 통은 없다');
    expect(n).toMatch(/외 \d+통\(첫 채움 \d+통\)은 지금 통 그대로면 12년에 나무 맛이 넘쳐 감점 약 \d+ ~ \d+/);
  });

  it('맛볼 통 고르기는 그대로다(moved를 보지 않음) — 이번 수리는 메모 글자만 바꾼다', () => {
    const a = advanceMonth(load());
    const sampled = a.history.reports.at(-1)!.notes.find((n) => /이번 달 (\d+)통을 맛봤다/.test(n));
    expect(sampled).toMatch(/이번 달 4통을 맛봤다/);
  });

  it('감점 큰 통이 없으면 무엇을 봤는지 말한다', () => {
    const s = load();
    for (const c of s.inventory.casks) if (c.contents) c.activity = 0.05; // 탄닌이 거의 안 쌓이는 통
    const n = agingNote(advanceMonth(s))!;
    expect(n).toContain(`12년에 나무 맛 감점 ${TASK_VALUES.agingCheck.flagPenalty}점 넘는 통은 없다(나무 맛만 본다 — 샘플 추정은 지금 품질이다)`);
  });
});
