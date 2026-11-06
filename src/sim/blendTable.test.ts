import { describe, expect, it } from 'vitest';
import { houseBrand } from './brands';
import {
  addTrendShift, appeal, applyAction, blenderOf, blendTargets, hexOf, matchScore, migrateSave, newGame, readCask, readSigma, samplingCapacity, trendFactor,
  type Flavor, type GameState, type Staff,
} from '.';
import { emptyCaskOf } from './newGame';
import fixture from './fixtures/save-v5.json';

// 블렌딩 테이블 (결정 #123~#125)

const SHERRY: Flavor = { dried_fruit: 45, wood_spice: 30, vanilla_caramel: 20, nutty_rancio: 10, oak_tannin: 25, integration: 40 };
const BOURBON: Flavor = { fresh_fruit: 35, vanilla_caramel: 40, floral: 25, cereal: 15, sweetness: 10, integration: 40 };
const PEATED: Flavor = { peat_smoke: 50, cereal: 20, vanilla_caramel: 25, oily_waxy: 15, integration: 40 };

function withCasks(seed = 3): GameState {
  const s = newGame({ seed, startingCash: 50_000_000_000 });
  const add = (flavor: Flavor, n: number, batch: string) => {
    for (let i = 0; i < n; i++) {
      const c = emptyCaskOf(s, 'ex_bourbon_barrel');
      c.contents = { id: `${batch}-${i}`, name: batch, kind: 'malt', volumeL: 190, abv: 0.6, flavor: { ...flavor }, createdMonth: 0, oakMonths: 48, sourced: false, costPerLPA: 10_000, batchId: batch };
      c.filledMonth = 0;
      s.inventory.casks.push(c);
    }
  };
  add(SHERRY, 3, 'S');
  add(BOURBON, 3, 'B');
  add(PEATED, 3, 'P');
  return s;
}

const blender = (s: GameState, level: number, a: number, b: number, c: number): GameState => {
  const st: Staff = { id: 'BL', name: '블렌더', role: 'blender', level, xp: 0, stats: { a, b, c }, salary: 5_000_000, hiredMonth: 0, ageAtHire: 40 };
  return { ...s, hr: { ...s.hr, staff: [...s.hr.staff, st] } };
};

const caskIdsOf = (s: GameState, batch: string) => s.inventory.casks.filter((c) => c.contents?.batchId === batch).map((c) => c.id);
const opts = { name: 't', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };

describe('마스터 블렌더 직군 (결정 #123)', () => {
  it('후보 목록에 블렌더가 있고, 블렌더가 있으면 읽는 오차·샘플링 여력이 달라진다', () => {
    const s = withCasks();
    expect(s.hr.candidates.some((c) => c.role === 'blender')).toBe(true);
    expect(blenderOf(s)).toBeNull();
    expect(samplingCapacity(s)).toBe(6);
    const b = blender(s, 6, 80, 80, 60);
    expect(blenderOf(b)!.nose).toBe(80);
    expect(samplingCapacity(b)).toBe(32);
    expect(readSigma(b, b.inventory.casks.at(-1)!)).toBeLessThan(readSigma(s, s.inventory.casks.at(-1)!) / 2);
  });
});

describe('향미 트렌드 (결정 #125)', () => {
  it('유행이 없으면 1, 피트 열풍이면 피트 25↑ ×1.4 · 15↓ ×1 · 사이는 선형', () => {
    const s = withCasks();
    expect(trendFactor(s, hexOf(PEATED))).toBe(1);
    addTrendShift(s, '피트 열풍', 'peat', 0.4, 15, 25, 18);
    expect(trendFactor(s, hexOf(PEATED))).toBeCloseTo(1.4, 6);
    expect(trendFactor(s, hexOf(BOURBON))).toBe(1);
    expect(trendFactor(s, { ...hexOf(BOURBON), peat: 20 })).toBeCloseTo(1.2, 6);
    const t = blendTargets(s)[0]!;
    expect(t.source).toBe('trend');
    expect(t.hex.peat).toBe(25);
    s.month = 18;
    expect(trendFactor(s, hexOf(PEATED))).toBe(1);
  });

  it('v6 세이브의 옛 피트·셰리 보정치는 남은 기간만큼 트렌드 이동으로 옮겨진다', () => {
    const v5 = structuredClone(fixture.save) as Record<string, unknown> & { modifiers: unknown[] };
    v5.modifiers = [...v5.modifiers, { id: 'MX', key: 'appeal:peated', factor: 1.4, fromMonth: 10, untilMonth: 30, label: '피트 열풍' }];
    const s = migrateSave(v5)!;
    expect(s.world.modifiers.some((m) => m.key === 'appeal:peated')).toBe(false);
    expect(s.world.flavorTrend.shifts).toContainEqual(expect.objectContaining({ axis: 'peat', strength: expect.closeTo(0.4, 6), untilMonth: 30 }));
  });
});

describe('정보 구매 — 샘플링·실험실 분석 (P1)', () => {
  it('샘플을 뜨면 오차가 줄고 원액·현금이 빠지며, 대표는 한 달 6회까지', () => {
    let s = withCasks();
    const ids = caskIdsOf(s, 'S');
    const sigma0 = readSigma(s, s.inventory.casks.find((c) => c.id === ids[0])!);
    const cash0 = s.finance.cash;
    s = applyAction(s, { type: 'sampleCask', caskIds: ids }).state;
    const c = s.inventory.casks.find((k) => k.id === ids[0])!;
    expect(c.samples).toBe(1);
    expect(readSigma(s, c)).toBeCloseTo(sigma0 / Math.SQRT2, 6);
    expect(c.contents!.volumeL).toBeCloseTo(189.5, 6);
    expect(cash0 - s.finance.cash).toBe(3 * 30_000);
    expect(applyAction(s, { type: 'sampleCask', caskIds: [...caskIdsOf(s, 'B'), ...caskIdsOf(s, 'P'), ...ids] }).error).toMatch(/여력/);
  });

  it('실험실 분석은 피트·우디를 정확히 알려 준다', () => {
    let s = withCasks();
    const id = caskIdsOf(s, 'P')[0]!;
    s = applyAction(s, { type: 'labAnalyze', caskIds: [id] }).state;
    const c = s.inventory.casks.find((k) => k.id === id)!;
    const actual = hexOf(c.contents!.flavor);
    const seen = readCask(s, c)!;
    expect(seen.peat).toBe(actual.peat);
    expect(seen.woody).toBe(actual.woody);
  });
});

describe('레어 캐스크 (P8)', () => {
  it('통입 때 약 2%가 레어 — 캐스크·회차로 고정, 샘플링으로 드러나고 싱글 캐스크면 매력도 ×1.3', () => {
    let s = newGame({ seed: 5, startingCash: 50_000_000_000 });
    const malt = s.production.recipes.find((r) => r.kind === 'malt')!;
    s = applyAction(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: 6 }).state;
    let rare = 0;
    let filled = 0;
    for (let m = 0; m < 12; m++) {
      s = applyAction(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: 6 }).state;
      s = { ...s, month: s.month + 1 };
      const lot = applyAction(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: 6 }).state.inventory.lots.find((l) => l.kind === 'malt');
      if (!lot) { s = { ...s, inventory: { ...s.inventory, lots: [{ id: `X${m}`, name: 'x', kind: 'malt', volumeL: 1200, abv: 0.68, flavor: { ...BOURBON }, createdMonth: s.month, oakMonths: 0, sourced: false, costPerLPA: 9000 }] } }; }
      const lotId = s.inventory.lots.find((l) => l.kind === 'malt')!.id;
      const empty = s.inventory.casks.filter((c) => !c.contents).map((c) => c.id);
      s = applyAction(s, { type: 'fillCasks', lotId, caskIds: empty, entryAbv: 0.635 }).state;
    }
    for (const c of s.inventory.casks) if (c.contents) { filled++; if (c.rare) rare++; }
    expect(filled).toBeGreaterThan(40);
    expect(rare / filled).toBeLessThan(0.1);
    // 레어 캐스크를 강제로 만들어 샘플링으로 찾고 싱글 캐스크로 병입
    let t = blender(withCasks(), 8, 85, 85, 95);
    const id = caskIdsOf(t, 'S')[0]!;
    t = { ...t, inventory: { ...t.inventory, casks: t.inventory.casks.map((c) => (c.id === id ? { ...c, rare: true } : c)) } };
    for (let i = 0; i < 6 && !t.inventory.casks.find((c) => c.id === id)!.rareKnown; i++) t = applyAction(t, { type: 'sampleCask', caskIds: [id] }).state;
    expect(t.inventory.casks.find((c) => c.id === id)!.rareKnown).toBe(true);
    t = applyAction(t, { type: 'bottle', components: [{ source: 'cask', id, liters: 150 }], options: opts }).state;
    const p = t.commerce.products.at(-1)!;
    expect(p.rareSingleCask).toBe(true);
    expect(appeal(p, t) / appeal({ ...p, rareSingleCask: false }, t)).toBeCloseTo(1.3, 6);
  });
});

describe('목표 3종·결과 공개·위임 (P5·P6·P7)', () => {
  it('평론가 의뢰: 50점 이상이면 받아들여지고 인지도·기간 한정 매력도 가산', () => {
    let s = withCasks();
    const hex = hexOf(SHERRY);
    s.commerce.commissions.push({ id: 'Q1', client: '위스키 매거진 편집부', label: '셰리 중심', hex, tolerance: 7, expiresMonth: 6, reward: { awareness: 0.02, appealBonus: 0.25, months: 24 } });
    const aw0 = houseBrand(s).awareness;
    const res = applyAction(s, { type: 'bottle', components: caskIdsOf(s, 'S').map((id) => ({ source: 'cask' as const, id, liters: 150 })), options: { ...opts, targetId: 'Q1' } });
    expect(res.message).toMatch(/목표 일치 \d+/);
    s = res.state;
    const p = s.commerce.products.at(-1)!;
    expect(p.blend!.source).toBe('critic');
    expect(p.blend!.score).toBeGreaterThan(80);
    expect(s.commerce.commissions[0]!.fulfilledBy).toBe(p.id);
    expect(houseBrand(s).awareness).toBeGreaterThan(aw0);
    expect(appeal(p, s) / appeal({ ...p, blend: undefined }, s)).toBeCloseTo(1 + p.blend!.appealBonus!, 6);
  });

  it('코어 레인지: 첫 배치가 기준, 다음 배치는 일관성 점수(0.9~1.1 배수)', () => {
    let s = withCasks();
    const [b0, b1] = caskIdsOf(s, 'B');
    s = applyAction(s, { type: 'bottle', components: [{ source: 'cask', id: b0!, liters: 150 }], options: { ...opts, line: '하우스 클래식' } }).state;
    expect(s.commerce.lines['하우스 클래식']!.batches).toBe(1);
    expect(s.commerce.products.at(-1)!.blend).toBeUndefined();
    // 두 번째 배치는 셰리를 섞어 맛이 바뀐다
    const sh = caskIdsOf(s, 'S')[0]!;
    s = applyAction(s, { type: 'bottle', components: [{ source: 'cask', id: b1!, liters: 150 }, { source: 'cask', id: sh, liters: 100 }], options: { ...opts, line: '하우스 클래식' } }).state;
    const p = s.commerce.products.at(-1)!;
    expect(p.blend!.source).toBe('core');
    expect(p.blend!.score).toBeLessThan(90);
    expect(s.commerce.lines['하우스 클래식']!.batches).toBe(2);
    expect(appeal(p, s) / appeal({ ...p, blend: undefined }, s)).toBeCloseTo(0.9 + 0.2 * p.blend!.score / 100, 6);
  });

  it('위임: 노련한 블렌더는 목표에 가깝게, 결과는 공개 문구와 함께 남는다', () => {
    const target = { ...hexOf(SHERRY) };
    for (const a of Object.keys(target) as (keyof typeof target)[]) target[a] = 0.5 * hexOf(SHERRY)[a] + 0.3 * hexOf(BOURBON)[a] + 0.2 * hexOf(PEATED)[a];
    const run = (s: GameState) => {
      s.commerce.commissions.push({ id: 'Q2', client: '몰트 바 연합', label: '혼합', hex: target, tolerance: 7, expiresMonth: 6, reward: { awareness: 0.02, appealBonus: 0.25, months: 24 } });
      const res = applyAction(s, { type: 'delegateBlend', targetId: 'Q2', caskIds: s.inventory.casks.filter((c) => c.contents).map((c) => c.id), bottles: 1000, options: opts });
      expect(res.error).toBeUndefined();
      return res.state.commerce.products.at(-1)!;
    };
    const master = run(blender(withCasks(7), 10, 90, 90, 70));
    expect(master.blend!.delegated).toBe(true);
    expect(master.blend!.score).toBeGreaterThan(85);
    expect(matchScore(master.hex!, { id: 'x', source: 'critic', label: '', hex: target, tolerance: 7 })).toBe(master.blend!.score);
  });
});

