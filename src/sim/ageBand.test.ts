// [결정 #380] 숙성 연령 띠 — 9차 134개월 세이브(찬 통 54: 0 ~ 11 · 12 ~ 35 · 36 ~ 59 · 60 ~ 119 · 120+ = 12 · 17 · 13 · 3 · 9, prod.md §9.1)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { ageBand, bandCounts, thinBands } from './ageBand';
import type { GameState } from './types';

const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')).save)!;

describe('ageBand', () => {
  it('문턱 — 0 ~ 35 · 36 ~ 59 · 60 ~ 119 · 120+', () => {
    expect([0, 35, 36, 59, 60, 119, 120, 200].map(ageBand)).toEqual(['0-2', '0-2', '3-4', '3-4', '5-9', '5-9', '10+', '10+']);
  });
  it('9차 134개월: 띠별 통 수 · 5 ~ 9년 띠가 얇다', () => {
    const s = load();
    const c = bandCounts(s);
    expect([c['0-2'].casks, c['3-4'].casks, c['5-9'].casks, c['10+'].casks]).toEqual([29, 13, 3, 9]);
    expect(thinBands(c)).toEqual(['5-9']);
  });
  it('뽑을 L를 주면 뽑은 뒤로 센다 — 통을 다 비우면 그 띠에서 빠진다', () => {
    const s = load();
    const k609 = s.inventory.casks.find((x) => x.id === 'K609')!; // 몰트 벗 62개월
    expect(bandCounts(s, new Map([['K609', k609.contents!.volumeL]]))['5-9'].casks).toBe(2);
    expect(bandCounts(s, new Map([['K609', 10]]))['5-9'].casks).toBe(3);
  });
  it('원액 맛을 읽지 않는다 — 향미를 지워도 같다', () => {
    const s = load();
    const a = bandCounts(s);
    for (const c of s.inventory.casks) if (c.contents) c.contents.flavor = {};
    expect(bandCounts(s)).toEqual(a);
  });
});
