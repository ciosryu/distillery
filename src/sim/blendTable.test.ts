import { describe, expect, it } from 'vitest';
import { houseBrand } from './brands';
import {
  SAMPLING, addTrendShift, appeal, applyAction, blenderOf, blendTargets, delegatePlan, estimateBlend, previewBlend, priceAtQuality, revealNotes, SIBLING_MIN_VOLUME_RATIO, findTarget, hexOf, knownRead, knownReads, matchScore, migrateSave, newGame, readCask, readSigma, samplingCapacity, trendFactor,
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
    expect(c.contents!.volumeL).toBeCloseTo(190 - SAMPLING.lossL, 6); // 190L 통에서 샘플 1회(0.1L, P-PROD-25)
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
    const run = (s0: GameState) => {
      // 블렌더는 맛본 원액만 섞는다 (#157) — 배치마다 1통씩 샘플, 나머지는 형제 기록을 빌린다
      const s = applyAction(s0, { type: 'sampleCask', caskIds: ['S', 'B', 'P'].map((b) => caskIdsOf(s0, b)[0]!) }).state;
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


describe('블렌딩 테이블은 샘플 기록만 읽는다 (#157, #143 정보 누수)', () => {
  const commission = (s: GameState) => {
    s.commerce.commissions.push({ id: 'Q9', client: '몰트 바 연합', label: '셰리', hex: hexOf(SHERRY), tolerance: 7, expiresMonth: 6, reward: { awareness: 0.02, appealBonus: 0.25, months: 24 } });
    return findTarget(s, 'Q9')!;
  };
  const allIds = (s: GameState) => s.inventory.casks.filter((c) => c.contents).map((c) => c.id);

  it('샘플이 없으면 모른다 — 위임은 실패하고, 한 통을 뜨면 같은 배치·같은 캐스크 종류의 형제가 그 기록을 빌린다', () => {
    let s = blender(withCasks(), 5, 70, 70, 50);
    expect(knownReads(s).size).toBe(0);
    expect('error' in delegatePlan(s, commission(s), allIds(s), 500, opts)).toBe(true);
    const [first, second] = caskIdsOf(s, 'S');
    s = applyAction(s, { type: 'sampleCask', caskIds: [first!] }).state;
    const own = knownRead(s, s.inventory.casks.find((c) => c.id === first)!)!;
    const borrowed = knownRead(s, s.inventory.casks.find((c) => c.id === second)!)!;
    expect(own.from).toBe('own');
    expect(borrowed.from).toBe('sibling');
    expect(borrowed.hex).toEqual(own.hex);
    expect(knownRead(s, s.inventory.casks.find((c) => c.id === caskIdsOf(s, 'B')[0])!)).toBeNull();
    // 기록을 아는 캐스크만 섞고, 모르는 통 수를 알려 준다
    const plan = delegatePlan(s, commission(s), allIds(s), 500, opts);
    expect('error' in plan).toBe(false);
    if (!('error' in plan)) {
      expect(plan.unknown).toBe(6);
      expect(plan.components.every((c) => caskIdsOf(s, 'S').includes(c.id))).toBe(true);
    }
  });

  it('샘플 뒤에 숙성으로 참 향미가 바뀌어도 아는 값·위임 계획은 그대로다 — 다시 떠야 바뀐다', () => {
    let s = blender(withCasks(), 5, 70, 70, 50);
    s = applyAction(s, { type: 'sampleCask', caskIds: allIds(s) }).state;
    const before = structuredClone(knownReads(s));
    const planBefore = delegatePlan(s, commission(structuredClone(s)), allIds(s), 500, opts);
    // 숙성이 셰리 캐스크를 더 우디하게 만들었다고 치자 (참값만 바뀐다)
    const t = structuredClone(s);
    for (const c of t.inventory.casks) if (c.contents?.batchId === 'S') c.contents.flavor = { ...c.contents.flavor, oak_tannin: 60, wood_spice: 45 };
    expect(knownReads(t)).toEqual(before);
    expect(delegatePlan(t, commission(structuredClone(t)), allIds(t), 500, opts)).toEqual(planBefore);
    // readCask(샘플 순간의 읽기)는 참값을 따라간다 — 그래서 화면·판단에는 쓰지 않는다
    const id = caskIdsOf(t, 'S')[0]!;
    expect(readCask(t, t.inventory.casks.find((c) => c.id === id)!)).not.toEqual(before.get(id)!.hex);
    // 다시 뜨면 바뀐 참값 쪽으로 기록이 움직인다
    const u = applyAction(t, { type: 'sampleCask', caskIds: [id] }).state;
    expect(knownRead(u, u.inventory.casks.find((c) => c.id === id)!)!.hex.woody).toBeGreaterThan(before.get(id)!.hex.woody);
  });

  it('실험실 분석은 시료를 떠 가서 분석한다 — 피트·우디가 정확한 기록이 남고, 샘플 횟수·월 여력은 쓰지 않는다', () => {
    let s = withCasks();
    const id = caskIdsOf(s, 'P')[0]!;
    s = applyAction(s, { type: 'labAnalyze', caskIds: [id] }).state;
    const c = s.inventory.casks.find((k) => k.id === id)!;
    const k = knownRead(s, c)!;
    expect(k.hex.peat).toBe(hexOf(c.contents!.flavor).peat);
    expect(k.hex.woody).toBe(hexOf(c.contents!.flavor).woody);
    expect(c.samples ?? 0).toBe(0);
    expect(s.inventory.samplesThisMonth).toBe(0);
  });

  it('결과 공개: 기록 없는 원액을 섞으면 그만큼 예상 밖이었다고 알린다', () => {
    const s = blender(withCasks(), 5, 70, 70, 50);
    const res = applyAction(s, { type: 'bottle', components: [{ source: 'cask', id: caskIdsOf(s, 'S')[0]!, liters: 100 }], options: opts });
    expect(res.error).toBeUndefined();
    expect(res.message).toMatch(/샘플 기록 없이 병입/);
  });
});

describe('병입 전 추정 (#136·#159, #162)', () => {
  it('샘플이 없으면 모르고, 샘플 뒤에는 기록의 추정 품질 — 참값이 바뀌어도 그대로다', () => {
    let s = withCasks();
    const id = caskIdsOf(s, 'S')[0]!;
    const comp = [{ source: 'cask' as const, id, liters: 50 }];
    const none = estimateBlend(s, comp);
    expect(none.quality).toBeNull();
    expect(none.unknownShare).toBe(1);
    expect(none.fromCasks).toBe(true);
    s = applyAction(s, { type: 'sampleCask', caskIds: [id] }).state;
    const rec = s.inventory.casks.find((c) => c.id === id)!.sampleLog!.at(-1)!;
    const e = estimateBlend(s, comp);
    expect(e.quality).toBe(rec.estQuality);
    expect(e.hex).toEqual(rec.hex);
    const t = structuredClone(s);
    t.inventory.casks.find((c) => c.id === id)!.contents!.flavor = { ...PEATED };
    expect(estimateBlend(t, comp)).toEqual(e);
  });

  it('탱크 원액은 우리가 막 만든 것이라 참 품질로 안다 — 캐스크가 없으면 숨길 것도 없다', () => {
    const s = newGame({ seed: 3 });
    s.inventory.lots.push({ id: 'T1', name: 'tank', kind: 'soju', volumeL: 300, abv: 0.45, flavor: { ...BOURBON }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 5000 });
    const e = estimateBlend(s, [{ source: 'lot', id: 'T1', liters: 100 }]);
    expect(e.fromCasks).toBe(false);
    expect(e.sigma).toBe(0);
    expect(e.quality).not.toBeNull();
  });

  it('형제 통 기록은 액량이 비슷할 때만 빌린다 — 일부만 채운 마지막 통은 따로 떠야 한다 (결정 대기 12)', () => {
    let s = withCasks();
    const [a, b, c] = caskIdsOf(s, 'B');
    s.inventory.casks.find((k) => k.id === c)!.contents!.volumeL = 190 * (SIBLING_MIN_VOLUME_RATIO - 0.1);
    s = applyAction(s, { type: 'sampleCask', caskIds: [a!] }).state;
    const known = knownReads(s);
    expect(known.get(b!)?.from).toBe('sibling');
    expect(known.has(c!)).toBe(false);
  });
});

describe('병입 전 추정 오차 (#162)', () => {
  it('같은 기록을 빌린 통들을 섞어도 오차가 줄지 않는다 — 한 번 읽은 값이다', () => {
    let s = withCasks();
    const ids = caskIdsOf(s, 'S');
    s = applyAction(s, { type: 'sampleCask', caskIds: [ids[0]!] }).state;
    const one = estimateBlend(s, [{ source: 'cask', id: ids[0]!, liters: 50 }]);
    const three = estimateBlend(s, ids.map((id) => ({ source: 'cask' as const, id, liters: 50 })));
    expect(three.sigma).toBeCloseTo(one.sigma, 6);
    // 따로 뜬 기록끼리는 독립이라 오차가 준다
    s = applyAction(s, { type: 'sampleCask', caskIds: [ids[1]!, ids[2]!] }).state;
    expect(estimateBlend(s, ids.map((id) => ({ source: 'cask' as const, id, liters: 50 }))).sigma).toBeLessThan(one.sigma);
  });
});

describe('병입 결과 공개 문구 (플레이 점검에서 발견)', () => {
  it('조사: 받침이 있으면 "이", 없으면 "가"', () => {
    const zero = { peat: 0, fruit: 0, floral: 0, spicy: 0, woody: 0, sweet: 0 };
    expect(revealNotes(zero, { ...zero, fruit: 20 })[0]).toMatch(/^과일이 예상보다 강했다/);
    expect(revealNotes(zero, { ...zero, floral: 20 })[0]).toMatch(/^플로럴이/);
    expect(revealNotes(zero, { ...zero, peat: 20 })[0]).toMatch(/^피트가/);
  });

  it('탱크 원액만 병입하면 예상 = 실제(막 만든 원액은 안다) — 소주에 위스키 육각형 문구를 붙이지 않는다', () => {
    const s = newGame({ seed: 3 });
    s.inventory.lots.push({ id: 'T1', name: 'tank', kind: 'soju', volumeL: 300, abv: 0.45, flavor: { ...BOURBON }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 5000 });
    const r = applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: 'T1', liters: 100 }], options: { ...opts, targetAbv: 0.25 } });
    expect(r.error).toBeUndefined();
    expect(r.message).not.toMatch(/예상보다/);
  });
});

describe('병입 전 예상 출고가 범위 (#172, 플레이테스트 2026-11-07)', () => {
  it('참 품질을 넣으면 권장 출고가와 같고, 품질이 높을수록 비싸다 — 범위는 같은 식에 추정 품질 ± 오차를 넣은 것', () => {
    const s = withCasks();
    const comps = [{ source: 'cask' as const, id: caskIdsOf(s, 'S')[0]!, liters: 100 }];
    const p = previewBlend(s, comps, opts);
    expect(priceAtQuality(s, p, opts, p.evaluation!.quality)).toBe(p.suggestedPrice);
    expect(priceAtQuality(s, p, opts, 70)!).toBeGreaterThan(priceAtQuality(s, p, opts, 50)!);
  });
});

describe('제품의 통 구성 기록 (#176)', () => {
  it('병입 때 캐스크 원액의 통 종류별 알코올 비중을 큰 순으로 남긴다 — 탱크 원액은 빠지고 나머지가 된다', () => {
    const s = withCasks();
    const [s1] = caskIdsOf(s, 'S');
    const [b1] = caskIdsOf(s, 'B');
    s.inventory.casks.find((c) => c.id === s1)!.typeId = 'oloroso_butt';
    s.inventory.lots.push({ id: 'T1', name: 'tank', kind: 'malt', volumeL: 300, abv: 0.6, flavor: { ...BOURBON }, createdMonth: 0, oakMonths: 48, sourced: false, costPerLPA: 5000 });
    const r = applyAction(s, { type: 'bottle', components: [{ source: 'cask', id: s1!, liters: 100 }, { source: 'cask', id: b1!, liters: 50 }, { source: 'lot', id: 'T1', liters: 50 }], options: opts });
    expect(r.error).toBeUndefined();
    const mix = r.state.commerce.products.at(-1)!.caskMix!;
    expect(mix.map((m) => m.typeId)).toEqual(['oloroso_butt', 'ex_bourbon_barrel']);
    expect(mix[0]!.share).toBeCloseTo(0.5, 3);
    expect(mix[1]!.share).toBeCloseTo(0.25, 3);
  });

  it('탱크 원액만 병입하면 통 구성이 없다', () => {
    const s = newGame({ seed: 3 });
    s.inventory.lots.push({ id: 'T1', name: 'tank', kind: 'soju', volumeL: 300, abv: 0.45, flavor: { ...BOURBON }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 5000 });
    const r = applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: 'T1', liters: 100 }], options: { ...opts, targetAbv: 0.25 } });
    expect(r.state.commerce.products.at(-1)!.caskMix).toBeUndefined();
  });
});
