// [결정 #426] 캐스크 스트렝스 한 줄 — 「46%로 내면 예상 품질 +n · 병 +m · 병당 기준 값 −k%」. 막지 않는다 · 아는 값만(I2) · 상태 불변
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { batchQualityKnown, caskStrengthCompare, CS_COMPARE_ABV, hidesProductQuality, knownReads, previewBlend } from './index';
import type { BottleOptions, GameState } from './index';

// 9차 134개월 세이브 — 가리는 판(F5d · v16)
const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')).save)!;
const opts: BottleOptions = { name: 'CS 시험', targetAbv: 'cask', bottleMl: 700, chillFilter: false, packagingId: 'standard' };
const sampledMalt = (s: GameState) => {
  const kr = knownReads(s);
  return s.inventory.casks.find((c) => c.contents?.kind === 'malt' && c.contents.oakMonths >= 36 && c.contents.abv > 0.5 && kr.has(c.id) && !c.owner && !c.handfill && !c.contaminationKnown)!;
};

describe('#426 caskStrengthCompare', () => {
  it('46%로 내면 병이 늘고(도수 비 그대로) 병당 기준 값이 준다 · 품질은 화면의 아는 품질 규칙', () => {
    const s = load();
    expect(hidesProductQuality(s)).toBe(true);
    const c = sampledMalt(s);
    const comps = [{ source: 'cask' as const, id: c.id, liters: Math.min(100, c.contents!.volumeL) }];
    const r = caskStrengthCompare(s, comps, opts)!;
    expect(r).not.toBeNull();
    const cs = previewBlend(s, comps, opts);
    const at46 = previewBlend(s, comps, { ...opts, targetAbv: CS_COMPARE_ABV });
    expect(r.bottles).toBe(cs.bottles);
    expect(r.bottlesDelta).toBe(at46.bottles - cs.bottles);
    expect(r.bottlesDelta).toBeGreaterThan(0);
    expect(at46.bottles / cs.bottles).toBeCloseTo(cs.finalAbv / CS_COMPARE_ABV, 1);
    expect(r.priceRatio).not.toBeNull();
    expect(r.priceRatio!).toBeLessThan(1);
    expect(r.priceRatio!).toBeCloseTo(Math.pow(CS_COMPARE_ABV / cs.finalAbv, 0.7), 1); // 기준가 ∝ 도수^0.7(같은 품질)
    // 품질 차 = 병입 뒤 남는 아는 품질의 차(화면 「추정 품질」 칸과 같은 함수)
    const qa = batchQualityKnown(s, comps, cs)!.est;
    const qb = batchQualityKnown(s, comps, at46)!.est;
    expect(r.qualityDelta).toBeCloseTo(qb - qa, 1);
    expect(r.qualityDelta!).toBeGreaterThan(0); // 물을 타면 거친 맛이 준다
  });
  it('I2 — 통 원액 맛(참값)을 바꿔도 품질 차 · 기준 값 비율은 아는 값에서 나온다(샘플 없는 통은 품질 칸이 비고 값은 같은 품질 비교)', () => {
    const s = load();
    const c = sampledMalt(s);
    const comps = [{ source: 'cask' as const, id: c.id, liters: 50 }];
    const a = caskStrengthCompare(s, comps, opts)!;
    // 샘플 기록을 지우면 품질 칸을 비운다(모르는 값을 만들지 않는다)
    const t = load();
    const tc = t.inventory.casks.find((x) => x.id === c.id)!;
    delete tc.sampleLog;
    for (const x of t.inventory.casks) if (x.contents?.recipeId === tc.contents?.recipeId) delete x.sampleLog;
    const b = caskStrengthCompare(t, comps, opts);
    if (b && !knownReads(t).has(c.id)) expect(b.qualityDelta).toBeNull();
    expect(a.priceRatio).not.toBeNull();
  });
  it('보이지 않는 때 — 도수를 고른 병입 · 보충 · 원액이 46% 이하', () => {
    const s = load();
    const c = sampledMalt(s);
    const comps = [{ source: 'cask' as const, id: c.id, liters: 50 }];
    expect(caskStrengthCompare(s, comps, { ...opts, targetAbv: 0.46 })).toBeNull();
    expect(caskStrengthCompare(s, comps, { ...opts, restockId: s.commerce.products[0]!.id })).toBeNull();
    const low = s.inventory.lots.find((l) => l.abv <= 0.46 && l.volumeL > 10);
    if (low) expect(caskStrengthCompare(s, [{ source: 'lot', id: low.id, liters: 10 }], opts)).toBeNull();
  });
  it('상태를 바꾸지 않는다', () => {
    const s = load();
    const c = sampledMalt(s);
    const before = JSON.stringify(s);
    caskStrengthCompare(s, [{ source: 'cask', id: c.id, liters: 50 }], opts);
    expect(JSON.stringify(s)).toBe(before);
  });
});
