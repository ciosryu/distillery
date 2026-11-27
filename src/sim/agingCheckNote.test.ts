// P-MGT-72 (나)(10차 153개월): 「숙성 점검」 분기 메모 문구 — 무엇을 봤는지(나무 맛 = 탄닌 상한 초과)를 쓰고 첫 채움 통 수를 따로 센다. 권고는 넣지 않는다(#367 · #411 · H1)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { advanceMonth, type GameState } from './index';
import { parsePlayFile } from '../store/playlog';
import { TASK_VALUES } from './staffTaskRules';
import { TASK_NOTE } from './staffTasks';

const load = (): GameState => {
  const r = parsePlayFile(readFileSync('docs/playtest/10/distillery-mvp-standard-y13m10-202611270816.json', 'utf8')); if ('error' in r) throw new Error(r.error);
  return r.save;
};
const agingNote = (s: GameState) => s.history.reports.at(-1)!.notes.find((n) => n.startsWith(`${TASK_NOTE} 숙성 점검`) && n.includes('넘은 통'));

describe('P-MGT-72 (나) 숙성 점검 메모 문구', () => {
  it('10차 153 → 154: 감점 큰 통과 그 가운데 첫 채움 통 수 · 「나무 맛」 · 권고 없음', () => {
    const n = agingNote(advanceMonth(load()))!;
    expect(n).toMatch(/K\d+ 외 16통\(첫 채움 \d+통\)은 지금 통 그대로면 12년에 나무 맛이 넘쳐 감점 약 19 ~ 35/);
    expect(n).not.toMatch(/섞거나|옮기면|리필 통/);
  });
  it('감점 큰 통이 없으면 무엇을 봤는지 말한다(「품질에 문제가 없다」로 읽히지 않게)', () => {
    const s = load();
    for (const c of s.inventory.casks) if (c.contents) c.activity = 0.05;
    expect(agingNote(advanceMonth(s))).toContain(`12년에 나무 맛 감점 ${TASK_VALUES.agingCheck.flagPenalty}점 넘는 통은 없다(나무 맛만 본다 — 샘플 추정은 지금 품질이다)`);
  });
});
