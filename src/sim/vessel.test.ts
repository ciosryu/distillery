import { describe, expect, it } from 'vitest';
import { AUTO_SAMPLE_MIN_AGE, autoSample, samplingCapacity, SAMPLING, stalestCasks, evaluate, lotCategory, previewBatch, restLot, type Cask, type SpiritLot, emptyCaskOf, FINISH, finishOf, advanceMonth, advanceMonths, applyAction, lastSample, lotQuality, matureCask, matureNonWood, matureVessel, migrateSave, newGame, newScenarioGame, readCask, SAMPLE_LOG_KEPT, SAVE_VERSION, vesselMaterial, emptyCask, type GameState, AUTO_SAMPLE_EXPENSE } from '.';
import fixture from './fixtures/save-v8.json';

/** 몰트 원액을 캐스크 1통에 넣은 게임 */
function withFilledCask(seed = 5): { s: GameState; caskId: string } {
  let s = newGame({ seed });
  const malt = s.production.recipes.find((r) => r.kind === 'malt')!;
  s = applyAction(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: 2 }).state;
  s = advanceMonth(s);
  s = applyAction(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: 0 }).state;
  const lot = s.inventory.lots.find((l) => l.kind === 'malt')!;
  const caskId = s.inventory.casks.find((c) => !c.contents)!.id;
  s = applyAction(s, { type: 'fillCasks', lotId: lot.id, caskIds: [caskId], entryAbv: 0.635 }).state;
  return { s, caskId };
}
const caskOf = (s: GameState, id: string) => s.inventory.casks.find((c) => c.id === id)!;
const sample = (s: GameState, id: string) => { const r = applyAction(s, { type: 'sampleCask', caskIds: [id] }); expect(r.error).toBeUndefined(); return r.state; };

describe('세이브 v8 → v9 (S-10)', () => {
  it('v8 세이브는 그대로 이어지고, 진행 결과가 v8 코드와 같다. 옛 샘플은 횟수만 있고 기록은 없다', () => {
    const s = migrateSave(structuredClone(fixture.save))!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.scenario?.tierId).toBe('micro');
    const sampled = s.inventory.casks.find((c) => (c.samples ?? 0) > 0)!;
    expect(sampled.sampleLog).toBeUndefined();
    expect(lastSample(sampled)).toBeNull();
    const t = advanceMonths(s, 3);
    // 자동 샘플(#177)은 이 세이브 뒤에 생긴 시나리오 규칙이다 — 그 비용을 되돌리면 옛 코드의 결과와 같아야 한다
    const autoCost = t.history.reports.slice(-3).reduce((sum, r) => sum + (r.expenses[AUTO_SAMPLE_EXPENSE] ?? 0), 0);
    // 샘플로 원액이 조금 줄면 원액 가치에 비례하는 보관 보험료도 아주 조금 준다(수십 원) — 그만큼은 허용한다
    expect(t.month).toBe(fixture.expectedAfter3.month);
    expect(Math.abs(t.finance.cash + autoCost - fixture.expectedAfter3.cash)).toBeLessThan(10_000);
  });
});

describe('샘플 기록 — 아는 값 대 참값 (S-10, #136)', () => {
  it('샘플을 뜨면 그 순간의 읽기(육각형·오차·추정 품질)를 남기고, 최근 기록만 유지한다', () => {
    let { s, caskId } = withFilledCask();
    s = advanceMonths(s, 2);
    s = sample(s, caskId);
    const first = lastSample(caskOf(s, caskId))!;
    expect(first.last.month).toBe(s.month);
    expect(first.delta).toBeNull();
    expect(first.last.sigma).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) { s = advanceMonth(s); s = sample(s, caskId); }
    expect(caskOf(s, caskId).sampleLog).toHaveLength(SAMPLE_LOG_KEPT);
    const later = lastSample(caskOf(s, caskId))!;
    expect(later.delta).not.toBeNull();
    const log = caskOf(s, caskId).sampleLog!;
    expect(later.delta!.quality).toBe(log[1]!.estQuality - log[0]!.estQuality);
  });

  it('다음 샘플 전까지 기록은 움직이지 않는다 — 참값을 따라가는 readCask와 다르다(정보 누수 방지)', () => {
    let { s, caskId } = withFilledCask();
    s = sample(advanceMonths(s, 2), caskId);
    const rec = structuredClone(lastSample(caskOf(s, caskId))!.last);
    const liveBefore = readCask(s, caskOf(s, caskId))!;
    const t = advanceMonths(s, 12);
    expect(lastSample(caskOf(t, caskId))!.last).toEqual(rec);
    expect(readCask(t, caskOf(t, caskId))).not.toEqual(liveBefore);
  });

  it('추정 품질은 참 품질 근처(4σ 안)이고 결정론이다', () => {
    let { s, caskId } = withFilledCask(11);
    s = advanceMonths(s, 3);
    const a = sample(s, caskId);
    const b = sample(s, caskId);
    const rec = lastSample(caskOf(a, caskId))!.last;
    expect(rec).toEqual(lastSample(caskOf(b, caskId))!.last);
    expect(Math.abs(rec.estQuality - lotQuality(caskOf(a, caskId).contents!))).toBeLessThan(4 * rec.sigma + 1);
  });

  it('캐스크를 비우면 기록도 지운다', () => {
    let { s, caskId } = withFilledCask();
    s = sample(advanceMonths(s, 2), caskId);
    expect(emptyCask(caskOf(s, caskId)).sampleLog).toBeUndefined();
  });
});

describe('숙성 용기 일반화 (S-10 자리)', () => {
  it('지금 콘텐츠는 모두 나무이고, 나무 용기는 기존 matureCask와 결과가 같다', () => {
    const { s, caskId } = withFilledCask();
    const c = caskOf(s, caskId);
    expect(vesselMaterial(c)).toBe('wood');
    const climate = { tempC: 18, humidity: 70 };
    expect(matureVessel(c, climate, { control: 50 })).toEqual(matureCask(c, climate, { control: 50 }));
  });

  it('나무가 아닌 용기 스텁: 추출 없음, oakMonths 대신 restMonths가 늘고, 스테인리스는 증발이 없다', () => {
    const { s, caskId } = withFilledCask();
    const c = caskOf(s, caskId);
    const climate = { tempC: 25, humidity: 70 };
    const onggi = matureNonWood(c, 'onggi', climate, { control: 0 });
    const steel = matureNonWood(c, 'steel', climate, { control: 0 });
    for (const r of [onggi, steel]) {
      expect(r.cask.contents!.oakMonths).toBe(c.contents!.oakMonths);
      expect(r.cask.contents!.restMonths).toBe(1);
      expect(r.cask.contents!.flavor.vanilla_caramel ?? 0).toBe(c.contents!.flavor.vanilla_caramel ?? 0);
    }
    expect(steel.lostL).toBe(0);
    expect(onggi.lostL).toBeGreaterThan(0);
    expect(onggi.lostL).toBeLessThan(matureCask(c, climate, { control: 0 }).lostL);
  });
});

describe('피니싱 (S-10 자리)', () => {
  it('행동 타입은 있지만 아직 실패한다. MVP 시나리오에서는 잠겨 있다', () => {
    const { s, caskId } = withFilledCask();
    const to = s.inventory.casks.find((c) => !c.contents)!.id;
    expect(applyAction(s, { type: 'transferCask', fromCaskId: caskId, toCaskId: to }).error).toMatch(/피니싱/);
    const mvp = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    expect(applyAction(mvp, { type: 'transferCask', fromCaskId: 'x', toCaskId: 'y' }).error).toMatch(/시나리오/);
  });
});

describe('피니싱 (PRD §5.2, #158)', () => {
  /** withFilledCask + 숙성 n개월 + 빈 올로로소 벗·버번 배럴 1통씩 */
  function ready(monthsAged = 12) {
    const { s: s0, caskId } = withFilledCask();
    let s = advanceMonths(s0, monthsAged);
    const sherry = emptyCaskOf(s, 'oloroso_butt');
    const bourbon = emptyCaskOf(s, 'ex_bourbon_barrel');
    const quarter = emptyCaskOf(s, 'korean_oak_quarter');
    s.inventory.casks.push(sherry, bourbon, quarter);
    return { s, caskId, sherry: sherry.id, bourbon: bourbon.id, quarter: quarter.id };
  }

  it('셰리 벗으로 옮기면 이력이 생기고, 숙성 연수는 그대로, 손실은 0.75%, 원래 통은 비고 자리는 이어받는다', () => {
    const { s, caskId, sherry } = ready();
    const from = caskOf(s, caskId);
    const before = from.contents!;
    expect(caskOf(s, caskId).typeId).not.toBe('oloroso_butt');
    const r = applyAction(s, { type: 'transferCask', fromCaskId: caskId, toCaskId: sherry });
    expect(r.error).toBeUndefined();
    const t = r.state;
    const lot = caskOf(t, sherry).contents!;
    expect(lot.oakMonths).toBe(before.oakMonths);
    expect(lot.volumeL).toBeCloseTo(before.volumeL * (1 - FINISH.lossShare), 6);
    expect(lot.caskHistory).toEqual([
      { typeId: from.typeId, fromMonth: t.month - before.oakMonths, months: before.oakMonths },
      { typeId: 'oloroso_butt', fromMonth: t.month, months: 0 },
    ]);
    expect(caskOf(t, caskId).contents).toBeUndefined();
    expect(caskOf(t, sherry).slot).toEqual(from.slot);
    expect(finishOf(lot)).toEqual({ typeId: 'oloroso_butt', months: 0 });
  });

  it('규칙: 시즈닝 없는 통·같은 종류·작은 통·두 번째 피니싱은 안 되고, MVP에서는 잠겨 있다', () => {
    const { s, caskId, sherry, quarter } = ready();
    expect(applyAction(s, { type: 'transferCask', fromCaskId: caskId, toCaskId: quarter }).error).toMatch(/버번·셰리/);
    const same = emptyCaskOf(s, caskOf(s, caskId).typeId);
    s.inventory.casks.push(same);
    expect(applyAction(s, { type: 'transferCask', fromCaskId: caskId, toCaskId: same.id }).error).toMatch(/같은 종류/);
    const t = applyAction(s, { type: 'transferCask', fromCaskId: caskId, toCaskId: sherry }).state;
    const back = emptyCaskOf(t, 'ex_bourbon_barrel');
    t.inventory.casks.push(back);
    expect(applyAction(t, { type: 'transferCask', fromCaskId: sherry, toCaskId: back.id }).error).toMatch(/한 번만|들어가지/);
    // 500L 벗을 가득 채운 원액은 200L 배럴에 안 들어간다
    const big = structuredClone(t);
    caskOf(big, sherry).contents!.caskHistory = undefined;
    caskOf(big, sherry).contents!.volumeL = 480;
    expect(applyAction(big, { type: 'transferCask', fromCaskId: sherry, toCaskId: back.id }).error).toMatch(/들어가지/);
    const mvp = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    expect(applyAction(mvp, { type: 'transferCask', fromCaskId: 'x', toCaskId: 'y' }).error).toBeDefined();
  });

  it('시즈닝 향은 처음에 빠르게 옮겨 오고 점점 느려진다 — 같은 통에 처음 통입했을 때보다 첫 달이 빠르다', () => {
    const { s, caskId, sherry } = ready();
    const t = applyAction(s, { type: 'transferCask', fromCaskId: caskId, toCaskId: sherry }).state;
    const cask = caskOf(t, sherry);
    const climate = { tempC: 15, humidity: 70 };
    const opts = { control: 0 };
    const gain = (c: typeof cask) => { const r = matureCask(c, climate, opts).cask; return (r.contents!.flavor.dried_fruit ?? 0) - (c.contents!.flavor.dried_fruit ?? 0); };
    const first = gain(cask);
    // 같은 원액이 처음부터 이 통에 있었다면(피니싱 아님)
    const plain = { ...cask, contents: { ...cask.contents!, caskHistory: undefined } };
    expect(first).toBeGreaterThan(gain(plain) * 2);
    // 12개월 피니싱 뒤에는 처음 통입보다 느리다
    const late = { ...cask, contents: { ...cask.contents!, oakMonths: cask.contents!.oakMonths + 12 } };
    expect(gain(late)).toBeLessThan(gain(plain));
  });

  it('병입: 모두 같은 피니싱이면 제품에 피니시 라벨, 피니싱 안 한 원액이 섞이면 라벨 없음', () => {
    const { s, caskId, sherry } = ready(13);
    let t = applyAction(s, { type: 'transferCask', fromCaskId: caskId, toCaskId: sherry }).state;
    t = advanceMonths(t, 4);
    const opts = { name: '', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };
    const alone = applyAction(t, { type: 'bottle', components: [{ source: 'cask', id: sherry, liters: 20 }], options: opts });
    expect(alone.error).toBeUndefined();
    const p = alone.state.commerce.products.at(-1)!;
    expect(p.finish).toBe('oloroso_butt');
    expect(p.name).toContain('셰리 캐스크 피니시');
    // 피니싱 안 한 원액(탱크 몰트를 다른 통에)과 섞으면 라벨 없음
    const lot = { ...caskOf(t, sherry).contents!, id: 'PLAIN', caskHistory: undefined };
    t.inventory.lots.push(lot);
    const mixed = applyAction(t, { type: 'bottle', components: [{ source: 'cask', id: sherry, liters: 20 }, { source: 'lot', id: 'PLAIN', liters: 20 }], options: opts });
    expect(mixed.error).toBeUndefined();
    expect(mixed.state.commerce.products.at(-1)!.finish).toBeUndefined();
  });
});

describe('옹기 숙성 (#161, flavor-model §4.5.1)', () => {
  const climate = { tempC: 13, humidity: 70 };
  const opts = { control: 0 };
  /** MVP 판 + 소주 뉴메이크를 담은 옹기·버번 캐스크 */
  function sojuIn(type: 'onggi_jar' | 'ex_bourbon_barrel'): Cask & { contents: SpiritLot } {
    const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const r = s.production.recipes.find((x) => x.kind === 'soju')!;
    const b = previewBatch(s, r)!;
    return { ...emptyCaskOf(s, type), contents: { id: 'L', name: 'soju', kind: 'soju', volumeL: 190, abv: 0.45, flavor: b.flavor, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 10_000 } };
  }
  const age = (c: Cask, n: number) => { let x = c; for (let i = 0; i < n; i++) x = matureVessel(x, climate, opts).cask; return x; };
  const q = (l: SpiritLot) => evaluate(l.flavor, lotCategory(l)).quality;

  it('옹기는 나무 향 없이 부드러워지고, 오크 개월이 아니라 휴지 개월이 늘며, 증발은 나무의 절반 수준이다', () => {
    const c = sojuIn('onggi_jar');
    expect(vesselMaterial(c)).toBe('onggi');
    const a = age(c, 24).contents!;
    expect(a.oakMonths).toBe(0);
    expect(a.restMonths).toBe(24);
    expect(a.flavor.vanilla_caramel ?? 0).toBe(0);
    expect(a.flavor.oak_tannin ?? 0).toBe(0);
    expect(a.flavor.harshness!).toBeLessThan(c.contents.flavor.harshness!);
    const oak = age(sojuIn('ex_bourbon_barrel'), 24).contents!;
    expect(190 - a.volumeL).toBeLessThan((190 - oak.volumeL) * 0.6);
  });

  it('품질 순서: 탱크 보관 < 옹기 (돈 내고 살 이유가 있다). 오크는 바닐라·탄닌이 붙는 다른 스타일', () => {
    const c = sojuIn('onggi_jar');
    let tank: SpiritLot = { ...c.contents };
    for (let i = 0; i < 24; i++) tank = restLot(tank);
    expect(q(age(c, 24).contents!)).toBeGreaterThan(q(tank));
    expect(age(sojuIn('ex_bourbon_barrel'), 24).contents!.flavor.vanilla_caramel!).toBeGreaterThan(20);
  });

  it('MVP에서 옹기를 사서 소주를 통입하고 한 달이 지나면 옹기 숙성이 된다. 재탄화·중고 매각은 안 된다', () => {
    let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const soju = s.production.recipes.find((r) => r.kind === 'soju')!;
    s = applyAction(s, { type: 'setOrder', recipeId: soju.id, batchesPerMonth: 1 }).state;
    s = advanceMonth(s);
    const bought = applyAction(s, { type: 'buySpotCasks', caskType: 'onggi_jar', qty: 1 });
    expect(bought.error).toBeUndefined();
    s = bought.state;
    const jar = s.inventory.casks.find((c) => c.typeId === 'onggi_jar')!;
    expect(applyAction(s, { type: 'rechar', caskId: jar.id }).error).toBeDefined();
    expect(applyAction(s, { type: 'sellUsedCask', caskId: jar.id }).error).toBeDefined();
    const lot = s.inventory.lots.find((l) => l.kind === 'soju')!;
    s = applyAction(s, { type: 'fillCasks', lotId: lot.id, caskIds: [jar.id], entryAbv: 0.45 }).state;
    s = advanceMonth(s);
    const filled = s.inventory.casks.find((c) => c.id === jar.id)!;
    expect(filled.contents!.restMonths).toBe(1);
    expect(filled.contents!.oakMonths).toBe(0);
  });
});

describe('자동 샘플 (#177, 오너 요청 2026-11-08)', () => {
  /** MVP 판 + 몰트 원액을 버번 배럴 n통에 */
  function mvpWithCasks(n = 8): GameState {
    let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 2 });
    for (let i = 0; i < n; i++) {
      const c = emptyCaskOf(s, 'ex_bourbon_barrel');
      c.contents = { id: `L${i}`, name: 'm', kind: 'malt', volumeL: 190, abv: 0.63, flavor: { cereal: 30, vanilla_caramel: 20 }, createdMonth: 0, oakMonths: 6, sourced: false, costPerLPA: 10_000, batchId: `B${i}` };
      c.filledMonth = 0;
      s.inventory.casks.push(c);
    }
    return s;
  }
  const sampledIn = (s: GameState, month: number) => s.inventory.casks.filter((c) => c.sampleLog?.at(-1)?.month === month).map((c) => c.id);

  it('그 달에 직접 뜬 샘플이 없으면, 달이 넘어갈 때 오래 안 뜬 통부터 여력만큼 뜨고 비용을 결산표에 남긴다', () => {
    const s = mvpWithCasks();
    const m = s.month;
    const cap = samplingCapacity(s);
    const t = advanceMonth(s);
    const got = sampledIn(t, m);
    expect(got).toHaveLength(Math.min(cap, 8));
    const r = t.history.reports.at(-1)!;
    expect(r.expenses[AUTO_SAMPLE_EXPENSE]).toBe(got.length * SAMPLING.cost);
    expect(r.notes.some((n) => n.startsWith('자동 샘플'))).toBe(true);
    // #201: 매 턴 여력만큼 — 다음 달에는 아직 안 뜬 통부터, 남는 여력은 가장 오래전에 뜬 통으로
    const u = advanceMonth(t);
    const next = sampledIn(u, t.month);
    expect(next).toHaveLength(Math.min(cap, 8));
    for (const id of t.inventory.casks.filter((c) => c.contents && !got.includes(c.id)).map((c) => c.id)) expect(next).toContain(id);
    // 자동 샘플은 통당 횟수를 쓰지 않는다 — 몇 달을 돌아도 0, 직접 뜰 몫(최대 횟수)은 그대로 남는다
    let v = u;
    for (let i = 0; i < AUTO_SAMPLE_MIN_AGE; i++) v = advanceMonth(v);
    expect(v.inventory.casks.filter((c) => c.contents).every((c) => (c.samples ?? 0) === 0)).toBe(true);
    expect(v.inventory.casks.filter((c) => c.contents).every((c) => (c.sampleLog?.length ?? 0) > 0)).toBe(true);
  });

  it('자동 샘플은 오차를 줄이지 않고 같은 오차로 다시 읽는다 — 매달 떠도 참값으로 수렴하지 않는다', () => {
    let s = mvpWithCasks(1);
    for (let i = 0; i < 6; i++) s = advanceMonth(s);
    const c = s.inventory.casks.find((x) => x.contents)!;
    const log = c.sampleLog!;
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(log.at(-1)!.sigma).toBeCloseTo(log.at(-2)!.sigma, 9);
    expect(c.samples ?? 0).toBe(0);
  });

  it('한 통이라도 직접 뜬 달에는 자동 샘플이 없다', () => {
    const s = mvpWithCasks();
    const m = s.month;
    const one = applyAction(s, { type: 'sampleCask', caskIds: [s.inventory.casks.find((c) => c.contents)!.id] }).state;
    const t = advanceMonth(one);
    expect(sampledIn(t, m)).toHaveLength(1);
    expect(t.history.reports.at(-1)!.expenses[AUTO_SAMPLE_EXPENSE]).toBeUndefined();
  });

  it('샌드박스에는 없고, 현금이 모자라면 낼 수 있는 만큼만 뜬다', () => {
    const { s: sb } = withFilledCask();
    const t = advanceMonth(sb);
    expect(t.history.reports.at(-1)!.expenses[AUTO_SAMPLE_EXPENSE]).toBeUndefined();
    const poor = mvpWithCasks();
    const report = { expenses: {}, notes: [] } as unknown as Parameters<typeof autoSample>[1];
    poor.finance.cash = SAMPLING.cost * 2 + 1;
    expect(autoSample(poor, report, lotQuality)).toBe(2);
    expect(poor.finance.cash).toBe(1);
  });

  it('고르는 순서: 아무 기록 없는 통 → 형제 통 기록만 → 자기 기록이 오래된 통', () => {
    const s = mvpWithCasks(3);
    const [a, b, c] = s.inventory.casks.filter((x) => x.contents);
    a!.sampleLog = [{ month: 0, hex: { peat: 0, fruit: 0, floral: 0, spicy: 0, woody: 0, sweet: 0 }, sigma: 5, estQuality: 50 }];
    a!.samples = 1;
    expect(stalestCasks(s, 3).map((x) => x.id)).toEqual([b!.id, c!.id, a!.id].sort((x, y) => (x === a!.id ? 1 : y === a!.id ? -1 : x.localeCompare(y))));
  });
});
