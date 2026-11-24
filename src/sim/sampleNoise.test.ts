import { describe, expect, it } from 'vitest';
import { advanceMonths, applyAction, newGame, newScenarioGame, type Cask, type GameState } from './index';
import { readCask, recordSample } from './blendTable';
import { sampleNoiseId } from './rules';

// [결정 #351] 통을 다시 채우면 샘플 읽기 잡음을 새로 뽑는다 — v16 캠페인만. 같은 채움 안에서는 #201대로 고정, 옛 판 · 샌드박스는 키 그대로

/** 몰트 원액을 버번 통 하나에 채운 판 */
function filled(s0: GameState): { s: GameState; cask: Cask } {
  let s = s0;
  const malt = s.production.recipes.find((r) => r.kind === 'malt')!;
  s = applyAction(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: 1 }).state;
  s = advanceMonths(s, 1);
  s = applyAction(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: 1 }).state;
  const lot = s.inventory.lots.find((l) => l.kind === 'malt')!;
  const empty = s.inventory.casks.find((c) => !c.contents && c.typeId === 'ex_bourbon_barrel')!;
  s = applyAction(s, { type: 'fillCasks', lotId: lot.id, caskIds: [empty.id], entryAbv: 0.63 }).state;
  return { s, cask: s.inventory.casks.find((c) => c.id === empty.id)! };
}

/** 같은 내용물 · n번째 채움으로 본 통의 읽기(품질 오차 · 육각형). 상태를 바꾸지 않게 복사본에 기록한다 */
function readAt(s: GameState, cask: Cask, fills: number): { err: number; hex: string } {
  const c: Cask = { ...cask, fills, samples: undefined, sampleLog: undefined };
  const rec = recordSample(s, c, 50);
  return { err: rec.estQuality - 50, hex: JSON.stringify(rec.hex) };
}

describe('샘플 읽기 잡음과 채움 번호 ([결정 #351])', () => {
  const campaign = () => filled(newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 7, rules: 'v16' }));

  it('v16 캠페인: 같은 통을 다시 채우면 읽기 오차가 달라진다', () => {
    const { s, cask } = campaign();
    const reads = [0, 1, 2, 3, 4, 5].map((k) => readAt(s, cask, cask.fills + k));
    expect(new Set(reads.map((r) => r.hex)).size).toBe(reads.length); // 육각형 읽기는 채움마다 다르다
    expect(new Set(reads.map((r) => r.err)).size).toBeGreaterThan(1); // 품질 읽기(정수 반올림)도 한 값에 붙지 않는다
    expect(sampleNoiseId(s, cask)).toBe(`${cask.id}#f${cask.fills}`);
  });

  it('v16 캠페인: 같은 채움 안에서는 다시 떠도 같은 값이다(#201 — 자동 샘플이 참값으로 수렴하지 않음)', () => {
    const { s, cask } = campaign();
    expect(readAt(s, cask, cask.fills)).toEqual(readAt(s, cask, cask.fills));
    expect(readCask(s, cask)).toEqual(readCask(s, { ...cask }));
  });

  it('옛 판(legacy-v15) · 샌드박스: 키가 통 id 그대로라 채움 번호와 무관하다', () => {
    const legacy = filled(newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 7, rules: 'legacy-v15' }));
    expect(sampleNoiseId(legacy.s, legacy.cask)).toBe(legacy.cask.id);
    expect(readAt(legacy.s, legacy.cask, legacy.cask.fills + 1)).toEqual(readAt(legacy.s, legacy.cask, legacy.cask.fills));
    const sandbox = newGame({ seed: 7 }); // 샌드박스 새 판도 rulesVersion v16이지만 시나리오가 없다 — 결정 #351은 캠페인만
    expect(sandbox.rulesVersion).toBe('v16');
    expect(sampleNoiseId(sandbox, { id: 'K9', fills: 3 })).toBe('K9');
  });

  it('실제 판에서: 비우고 다시 채운 통의 자동 샘플은 앞 채움과 다른 오차로 읽힌다', () => {
    let { s, cask } = campaign();
    s = advanceMonths(s, 2); // 자동 샘플이 뜬다
    const first = s.inventory.casks.find((c) => c.id === cask.id)!.sampleLog!.at(-1)!;
    expect(first).toBeTruthy();
    // 같은 채움 안에서 다시 뜬 자동 샘플은 같은 오차 크기 · 같은 난수 — 육각형 차이는 숙성으로 바뀐 참 향미만큼
    const c = s.inventory.casks.find((x) => x.id === cask.id)!;
    const again = readAt(s, c, c.fills);
    const refill = readAt(s, c, c.fills + 1);
    expect(refill.hex).not.toBe(again.hex);
  });
});
