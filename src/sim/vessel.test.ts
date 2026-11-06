import { describe, expect, it } from 'vitest';
import { advanceMonth, advanceMonths, applyAction, lastSample, lotQuality, matureCask, matureNonWood, matureVessel, migrateSave, newGame, newScenarioGame, readCask, SAMPLE_LOG_KEPT, SAVE_VERSION, vesselMaterial, emptyCask, type GameState } from '.';
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
    expect({ month: t.month, cash: t.finance.cash }).toEqual(fixture.expectedAfter3);
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
