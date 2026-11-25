import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import type { GameState } from '../sim';
import { FLAGSHIP_RESERVE_TAG } from '../sim/tags';
import { tanninOutlook } from '../sim/warehouse';
import { monthTodos, RESERVE_TANNIN_UNTIL, RESERVE_TANNIN_WARN, reserveTanninNote } from './alerts';

// [결정 #411] T1-b — 12년 후보(예비) 통의 12년 감점이 크면 할 일 info. 9차 판 133개월 세이브의 K74(새 올로로소 벗 · 12년 감점 약 31)를 "어린 통"으로 돌려 본다
const load = (): GameState => {
  const r = parsePlayFile(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')); if ('error' in r) throw new Error(r.error);
  return r.save;
};
/** 통 하나를 목재 m개월 · 플래그십 예비(직접 태그)로 */
const young = (s: GameState, id: string, m: number) => {
  const c = s.inventory.casks.find((k) => k.id === id)!;
  c.contents = { ...c.contents!, oakMonths: m, tagIds: [...(c.contents!.tagIds ?? []), FLAGSHIP_RESERVE_TAG] };
  c.filledMonth = s.month - m;
  return c;
};

describe('#411 reserveTanninNote', () => {
  it('지금 세이브(후보가 다 120개월 넘음)에는 없다 — 48개월이 지나면 손쓸 것이 없다', () => {
    expect(reserveTanninNote(load())).toBeNull();
    expect(monthTodos(load()).some((t) => t.id === 'reserve-tannin')).toBe(false);
  });

  it('새 벗 K74 · 새 버번 K10을 30개월 예비로: 감점 큰 순 「K74 외 1통 … 약 19~31」 · info · 숙성 칸으로', () => {
    const s = load();
    young(s, 'K74', 30); young(s, 'K10', 30);
    const n = reserveTanninNote(s)!;
    expect(n.ids).toEqual(['K74', 'K10']);
    expect([n.lo, n.hi]).toEqual([19, 31]);
    const t = monthTodos(s).find((x) => x.id === 'reserve-tannin')!;
    expect(t.level).toBe('info');
    expect(t.text).toBe('12년 후보 K74 외 1통, 지금 통 그대로면 12년 감점 약 19~31');
    expect(t.target).toEqual({ anchor: 'mvp-warehouse' });
    expect(t.text).not.toMatch(/리필|한 번 쓴/); // #411 (ㄱ) 알림만
  });

  it('49개월이면 빠진다 · 감점 10 미만(활성도 낮은 통)도 빠진다 · 옮긴 원액도 빠진다', () => {
    const s = load();
    young(s, 'K74', RESERVE_TANNIN_UNTIL + 1);
    expect(reserveTanninNote(s)).toBeNull();
    const s2 = load();
    const c = young(s2, 'K74', 30); c.activity = 0.2;
    expect(tanninOutlook(s2, c)!.penalty).toBeLessThan(RESERVE_TANNIN_WARN);
    expect(reserveTanninNote(s2)).toBeNull();
    const s3 = load();
    const m = young(s3, 'K74', 30); m.filledMonth = s3.month - 10; // 이 통에 10개월 — 앞 통에서 옮겨 왔다
    expect(reserveTanninNote(s3)).toBeNull();
  });
});
