// [결정 #374] 옮긴 원액(원액 빼기 → 다시 통입 · 피니싱)의 「12년 감점」 — 앞 통 활성도를 몰라 절대값이 너무 작게 나오던 표시 오류.
// tanninOutlook이 moved(이 통에 머문 개월 · 이 통에서 더해질 탄닌)를 돌려주고, 화면은 감점을 감춘다. 원액 맛(숨김 값)은 읽지 않는다
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { advanceMonth, applyAction } from './index';
import { migrateSave } from './migrate';
import { finishTanninOutlook, tanninOutlook } from './warehouse';
import type { GameState } from './types';

const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y6m5-202611240759.json', 'utf8')).save)!;

describe('#374 옮긴 원액의 12년 전망', () => {
  it('처음 채운 통은 moved가 없다(지금 값 그대로)', () => {
    const s = load();
    const k10 = s.inventory.casks.find((c) => c.id === 'K10')!;
    expect(k10.contents!.oakMonths).toBeGreaterThan(40);
    expect(tanninOutlook(s, k10)!.moved).toBeUndefined();
  });
  it('원액 빼기 → 재사용 버번에 다시 통입하면 moved — 머문 개월 · 이 통에서 더해질 탄닌, 원액 맛을 바꿔도 같다', () => {
    let s = load();
    const oak = s.inventory.casks.find((c) => c.id === 'K10')!.contents!.oakMonths;
    let r = applyAction(s, { type: 'unfillCask', caskId: 'K10' });
    expect(r.error).toBeUndefined();
    s = r.state;
    const lot = s.inventory.lots.find((l) => l.oakMonths === oak && l.kind === 'malt')!;
    const reuse = s.inventory.casks.find((c) => !c.contents && c.typeId === 'ex_bourbon_barrel' && c.fills > 0 && !c.contaminationKnown && c.id !== 'K10')!;
    r = applyAction(s, { type: 'fillCasks', lotId: lot.id, caskIds: [reuse.id], entryAbv: 0.635 });
    expect(r.error).toBeUndefined();
    s = advanceMonth(advanceMonth(r.state));
    const c = s.inventory.casks.find((x) => x.id === reuse.id)!;
    const o = tanninOutlook(s, c)!;
    expect(o.moved).toBeDefined();
    expect(o.moved!.monthsHere).toBe(2);
    expect(o.moved!.addHere).toBeCloseTo(Math.max(0, o.tannin - o.now), 1);
    // 숨김 값을 읽지 않는다 — 원액 맛을 지워도 같다
    c.contents!.flavor = {};
    expect(tanninOutlook(s, c)).toEqual(o);
  });
  it('피니싱 어림 — 옮겨 온 원액에서 다시 옮길 때 moved', () => {
    const s = load();
    const from = s.inventory.casks.find((c) => c.id === 'K10')!;
    const to = s.inventory.casks.find((c) => !c.contents && c.typeId === 'oloroso_butt' && !c.contaminationKnown)!;
    expect(finishTanninOutlook(s, from, to, 12)!.moved).toBeUndefined();
    from.filledMonth = s.month - 3; // 3개월 전에 이 통으로 옮겨 온 원액
    expect(finishTanninOutlook(s, from, to, 12)!.moved).toBe(true);
  });
});
