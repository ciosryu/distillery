// [결정 #399 C] 블렌디드 위스키 자동 납품 — 첫 병입의 레시피별 LPA 비율(`restockMix`)을 남기고, 자동 납품이 그 비율대로 몰트 · 그레인 통을 함께 고른다(v16)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { advanceMonth, applyAction } from './index';
import { recipeSharesOf, restockMixOf } from './blending';
import { autoRestockPlan, autoRestockRangeChoices, autoRestockShortReason, autoRestockSources, autoRestockSupported, blendedRestock } from './economics';
import type { GameState } from './types';

// 9차 134개월 세이브 — 「김포 블랜디드 3년」(P906, 표기 2년 · R8 · R9 · R94 · 섞는 비율 기록 없음 — 옛 제품)
const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')).save)!;
const BL = 'P906';
const opts = { name: '', targetAbv: 0.4, bottleMl: 700, chillFilter: false, packagingId: 'standard' } as const;
const cask = (s: GameState, recipeId: string, minOak: number) => s.inventory.casks.filter((c) => c.contents?.recipeId === recipeId && c.contents.oakMonths >= minOak && !c.contaminationKnown && !c.owner && !c.handfill).sort((a, b) => a.contents!.oakMonths - b.contents!.oakMonths)[0]!;

describe('#399 C restockMixOf — 순수', () => {
  it('레시피별 LPA → 합 1 비율 · 레시피 없는 몫이 있거나 레시피가 하나면 없음', () => {
    expect(restockMixOf([{ recipeId: 'R8', lpa: 30 }, { recipeId: 'R94', lpa: 10 }])).toEqual([{ recipeId: 'R8', share: 0.75 }, { recipeId: 'R94', share: 0.25 }]);
    expect(restockMixOf([{ recipeId: '', lpa: 1 }, { recipeId: 'R8', lpa: 3 }])).toBeUndefined();
    expect(restockMixOf([{ recipeId: 'R8', lpa: 3 }])).toBeUndefined();
  });
});

describe('#399 C 9차 134 세이브 — 블렌디드', () => {
  it('비율 기록이 없는 옛 블렌디드는 지금처럼 자동 납품을 쓸 수 없다', () => {
    const s = load();
    const p = s.commerce.products.find((x) => x.id === BL)!;
    expect(p.restockMix).toBeUndefined();
    expect(autoRestockSupported(p, s)).toBe(false);
    expect(applyAction(s, { type: 'setAutoRestock', productId: BL, months: 2 }).error).toBeDefined();
  });
  it('한 번 손으로 보충하면 그 비율을 남기고 · 자동 납품을 켤 수 있다', () => {
    let s = load();
    const comps = [{ source: 'cask' as const, id: cask(s, 'R8', 24).id, liters: 30 }, { source: 'cask' as const, id: cask(s, 'R94', 24).id, liters: 10 }];
    const want = restockMixOf(recipeSharesOf(s, comps));
    const p0 = s.commerce.products.find((x) => x.id === BL)!;
    const r = applyAction(s, { type: 'bottle', components: comps, options: { ...opts, targetAbv: p0.abv, bottleMl: p0.bottleMl, chillFilter: p0.chillFiltered, packagingId: p0.packagingId, ...(p0.packaging ? { packaging: p0.packaging } : {}), restockId: BL } });
    expect(r.error).toBeUndefined();
    s = r.state;
    const p = s.commerce.products.find((x) => x.id === BL)!;
    expect(p.restockMix).toEqual(want);
    expect(blendedRestock(p, s)).toBe(true);
    expect(applyAction(s, { type: 'setAutoRestock', productId: BL, months: 2 }).error).toBeUndefined();
    // 통 범위 고르기(#1048 · MKT 판매 줄)도 비율이 있는 블렌디드에 열린다 — 비율이 없던 때는 빈 목록
    expect(autoRestockRangeChoices(s, p).length).toBeGreaterThan(1);
    const before = load();
    expect(autoRestockRangeChoices(before, before.commerce.products.find((x) => x.id === BL)!)).toEqual([]);
  });
  it('자동 납품은 그 비율대로 섞는다(±2%p) — 비율에 든 레시피의 통만 · 한 달 진행해 채운다', () => {
    let s = load();
    const p0 = s.commerce.products.find((x) => x.id === BL)!;
    p0.restockMix = [{ recipeId: 'R8', share: 0.7 }, { recipeId: 'R94', share: 0.3 }];
    p0.stockBottles = 0;
    p0.autoRestock = 2;
    const plan = autoRestockPlan(s, p0)!;
    expect(plan).not.toBeNull();
    const shares = recipeSharesOf(s, plan.components);
    const total = shares.reduce((t, x) => t + x.lpa, 0);
    expect(shares.map((x) => x.recipeId)).toEqual(['R8', 'R94']); // R9(피티드)는 비율에 없어 쓰지 않는다
    expect(shares.find((x) => x.recipeId === 'R8')!.lpa / total).toBeCloseTo(0.7, 1);
    expect(Math.abs(shares.find((x) => x.recipeId === 'R8')!.lpa / total - 0.7)).toBeLessThan(0.02);
    s = advanceMonth(s);
    const note = s.history.reports.at(-1)!.notes.find((n) => n.includes('「김포 블랜디드 3년」'))!;
    expect(note).toMatch(/\+[\d,]+병/);
    const p = s.commerce.products.find((x) => x.id === BL)!;
    expect(p.category).toBe('blended_whisky');
    expect(p.restockMix).toEqual([{ recipeId: 'R8', share: 0.7 }, { recipeId: 'R94', share: 0.3 }]); // 처음 남긴 비율을 지킨다
  });
  it('한 레시피의 통이 없으면 채우지 않고 사유를 메모한다', () => {
    let s = load();
    const p0 = s.commerce.products.find((x) => x.id === BL)!;
    p0.restockMix = [{ recipeId: 'R8', share: 0.7 }, { recipeId: 'R94', share: 0.3 }];
    p0.stockBottles = 0;
    p0.autoRestock = 2;
    for (const c of s.inventory.casks) if (c.contents?.recipeId === 'R94') c.contaminationKnown = true; // 그레인 통을 모두 못 쓰게
    expect(autoRestockSources(s, p0).length).toBeGreaterThan(0);
    expect(autoRestockPlan(s, p0)).toBeNull();
    expect(autoRestockShortReason(s, p0)).toContain('「그레인 — 옥수수」 통이 없다');
    s = advanceMonth(s);
    const note = s.history.reports.at(-1)!.notes.find((n) => n.includes('「김포 블랜디드 3년」'))!;
    expect(note).toContain('쓸 원액이 없어 못 채웠다');
    expect(note).toContain('그레인 — 옥수수');
    expect(s.commerce.products.find((x) => x.id === BL)!.stockBottles).toBe(0);
  });
  it('새 블렌디드 제품은 첫 병입 때 비율을 남긴다(v16) · 옛 판은 남기지 않는다', () => {
    const s = load();
    const comps = [{ source: 'cask' as const, id: cask(s, 'R9', 24).id, liters: 20 }, { source: 'cask' as const, id: cask(s, 'R94', 24).id, liters: 20 }];
    const r = applyAction(s, { type: 'bottle', components: comps, options: { ...opts, name: '새 블렌디드' } });
    expect(r.error).toBeUndefined();
    const p = r.state.commerce.products.at(-1)!;
    expect(p.category).toBe('blended_whisky');
    expect(p.restockMix?.map((x) => x.recipeId)).toEqual(['R9', 'R94']);
    const old = load();
    old.rulesVersion = 'legacy-v15';
    const r2 = applyAction(old, { type: 'bottle', components: comps, options: { ...opts, name: '옛 블렌디드' } });
    expect(r2.state.commerce.products.at(-1)!.restockMix).toBeUndefined();
  });
});
