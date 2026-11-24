import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import { autoFillPreview } from '../sim/autoFill';
import { monthTodos } from './alerts';

// [결정 #372] (나) 켜는 순간의 약속 · (다) 켜면 무엇을 넣는지를 켜기 전 할 일 줄에 (9차 판 64개월 세이브 — 자동 통입 꺼짐)
describe('#372 — 통입 대기 할 일의 자동 통입 미리 보기 · 약속', () => {
  it('켜면 넣을 통 수 · 탱크에 둘 몫을 줄에 보이고, 빠른 버튼 확인 글이 「꽉 차는 통만」을 약속한다', () => {
    const r = parsePlayFile(readFileSync('docs/playtest/9/distillery-mvp-standard-y6m5-202611240759.json', 'utf8')); if ('error' in r) throw new Error(r.error);
    const s = r.save;
    const pv = autoFillPreview(s, {});
    const t = monthTodos(s).find((x) => x.id === 'fill')!;
    expect(t.text).toContain(`자동 통입을 켜면 이번 진행 때 꽉 차는 통 ${pv.casks}통에 넣는다`);
    expect(t.quick?.done).toContain('꽉 차는 통만 넣는다');
    expect(t.quick?.done).toContain('간격(매달 · 3 · 6개월)');
  });
});
