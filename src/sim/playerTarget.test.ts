// [결정 #371] 블렌딩 테이블 「내 조건」 — 숙성 범위 · 향미 목표(위주/밸런스). 샘플 기록만 읽는다
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyAction, HEX_AXES, knownReads } from './index';
import { migrateSave } from './migrate';
import { casksInAgeRange, inAgeRange, PLAYER_FOCUS_WEIGHT, playerTarget, playerTargetFor } from './blendTable';
import type { GameState, Hex } from './types';

const h = (o: Partial<Hex>): Hex => ({ peat: 10, fruit: 10, floral: 10, spicy: 10, woody: 10, sweet: 10, ...o });

describe('playerTarget — 순수 함수', () => {
  it('「○○ 위주」: 그 축은 기록이 닿는 최대, 나머지는 기록 평균 · 그 축 가중치 3', () => {
    const t = playerTarget([h({ sweet: 20, woody: 30 }), h({ sweet: 40, woody: 10 })], 'sweet')!;
    expect(t.hex.sweet).toBe(40);
    expect(t.hex.woody).toBe(20);
    expect(t.weights).toEqual({ sweet: PLAYER_FOCUS_WEIGHT });
    expect(t.id).toBe('player:sweet');
  });
  it('「밸런스」: 여섯 축이 같은 높이(기록 평균의 평균) · 가중치 없음', () => {
    const t = playerTarget([h({ peat: 40 }), h({ peat: 4 })], 'balance')!;
    const level = (22 + 10 * 5) / 6;
    for (const a of HEX_AXES) expect(t.hex[a]).toBeCloseTo(level, 9);
    expect(t.weights).toBeUndefined();
  });
  it('기록이 없으면 null', () => {
    expect(playerTarget([], 'peat')).toBeNull();
  });
  it('숙성 범위 — 없는 쪽은 열림', () => {
    expect(inAgeRange(30, { minMonths: 24 })).toBe(true);
    expect(inAgeRange(30, { minMonths: 24, maxMonths: 29 })).toBe(false);
    expect(inAgeRange(30)).toBe(true);
  });
});

describe('9차 세이브 — 숙성 범위 · 맡기기 행동', () => {
  const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y6m5-202611240759.json', 'utf8')).save)!;
  it('범위 안 통만 · 목표는 그 통들의 샘플 기록만으로(참 향미를 읽지 않는다)', () => {
    const s = load();
    const all = s.inventory.casks.filter((c) => c.contents && (c.contents.kind === 'malt' || c.contents.kind === 'grain') && !c.owner).map((c) => c.id);
    const range = { minMonths: 36, maxMonths: 60 };
    const ids = casksInAgeRange(s, all, range);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(inAgeRange(s.inventory.casks.find((c) => c.id === id)!.contents!.oakMonths, range)).toBe(true);
    const known = knownReads(s);
    const t = playerTargetFor(s, ids, 'sweet')!;
    const reads = ids.flatMap((id) => (known.get(id) ? [known.get(id)!.hex] : []));
    expect(t.hex.sweet).toBeCloseTo(Math.max(...reads.map((r) => r.sweet)), 9);
    // 참 향미를 바꿔도 목표는 그대로 — 샘플 기록만 읽는다
    for (const id of ids) s.inventory.casks.find((c) => c.id === id)!.contents!.flavor = {};
    expect(playerTargetFor(s, ids, 'sweet')).toEqual(t);
  });
  it('delegateBlend player — 범위 안 통만 쓰고 채점 목표가 없다 · 범위가 거꾸로면 막는다', () => {
    const s = load();
    const all = s.inventory.casks.filter((c) => c.contents && c.contents.kind === 'malt' && !c.owner && knownReads(s).has(c.id)).map((c) => c.id);
    const options = { name: '내 조건 시험', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };
    const bad = applyAction(s, { type: 'delegateBlend', targetId: 'player:sweet', caskIds: all, bottles: 300, options, player: { focus: 'sweet', minMonths: 60, maxMonths: 24 } });
    expect(bad.error).toBeDefined();
    const r = applyAction(s, { type: 'delegateBlend', targetId: 'player:sweet', caskIds: all, bottles: 300, options, player: { focus: 'sweet', minMonths: 36, maxMonths: 60 } });
    expect(r.error).toBeUndefined();
    const p = r.state.commerce.products.at(-1)!;
    expect(p.name).toBe('내 조건 시험');
    expect(p.blend).toBeUndefined(); // 블렌딩 목표 채점(#124) 없음
    expect(p.oakMonths).toBeGreaterThanOrEqual(36);
  });
});
