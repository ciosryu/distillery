// [결정 #419] 자동 납품 통 고르기에 품질 조건 — 아는 품질(샘플 기록 · 형제 기록)이 하한 이상인 통만 쓴다. 기록이 없는 통은 쓰지 않는다. 참값은 읽지 않는다(I2)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { advanceMonth, applyAction } from './index';
import { knownReads } from './blendTable';
import { autoRestockQualityChoices, autoRestockRangeChoices, autoRestockShortReason, autoRestockSources, AUTO_RESTOCK_QUALITY_STEPS } from './economics';
import type { GameState } from './types';

// 9차 134개월 세이브 — 「김포 싱글몰트 셰리 6년」(P926 · 표기 3년 · 하한 36개월)
const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')).save)!;
const P = 'P926';
const prod = (s: GameState) => s.commerce.products.find((x) => x.id === P)!;
const ids = (s: GameState) => autoRestockSources(s, prod(s)).map((x) => x.comp.id);

describe('#419 품질 하한 — 아는 품질만', () => {
  it('하한 70: 샘플 기록이 70 이상인 통만(기록 없는 통 빠짐) · 조건 없으면 지금 그대로', () => {
    let s = load();
    const before = ids(s);
    const r = applyAction(s, { type: 'setAutoRestock', productId: P, months: 2, source: { vessel: 'oak', months: 36, minKnownQuality: 70 } });
    expect(r.error).toBeUndefined();
    s = r.state;
    expect(prod(s).autoRestockSource?.minKnownQuality).toBe(70);
    const reads = knownReads(s);
    const after = ids(s);
    expect(after.length).toBeLessThan(before.length);
    for (const id of after) expect(reads.get(id)!.estQuality).toBeGreaterThanOrEqual(70);
    // 빠진 통은 기록이 없거나 70 미만
    for (const id of before.filter((x) => !after.includes(x))) expect((reads.get(id)?.estQuality ?? -1) < 70).toBe(true);
  });
  it('I2 — 통 원액 맛(참값)을 바꿔도 고르는 통이 같다(샘플 기록만 읽는다)', () => {
    let s = applyAction(load(), { type: 'setAutoRestock', productId: P, months: 2, source: { vessel: 'oak', months: 36, minKnownQuality: 70 } }).state;
    const a = ids(s);
    for (const c of s.inventory.casks) if (c.contents) c.contents = { ...c.contents, flavor: {} };
    expect(ids(s)).toEqual(a);
  });
  it('샘플 기록이 하나도 없으면 쓸 통이 없고 사유에 「샘플 기록이 없는 통 n개」 · 결산 메모도 같은 사유', () => {
    const s0 = load();
    for (const c of s0.inventory.casks) if (c.contents) delete c.sampleLog; // 9차 세이브엔 샘플 96 · 100 같은 잡음 값도 있다 — 기록 자체를 지워 「기록 없음」 길을 본다
    delete s0.inventory.autoSample;
    s0.inventory.autoSample = { off: true };
    const s = applyAction(s0, { type: 'setAutoRestock', productId: P, months: 2, source: { vessel: 'oak', months: 36, minKnownQuality: 60 } }).state;
    expect(ids(s)).toEqual([]);
    const why = autoRestockShortReason(s, prod(s))!;
    expect(why).toMatch(/통 품질 60 이상\(샘플 어림\)인 통이 없다 — 샘플 기록이 없는 통 \d+개/);
    const s2 = advanceMonth(s);
    expect(s2.history.reports.at(-1)!.notes.some((n) => n.includes('「김포 싱글몰트 셰리 6년」') && n.includes('통 품질 60 이상'))).toBe(true);
  });
  it('막는 입력 — 0 ~ 100 밖', () => {
    expect(applyAction(load(), { type: 'setAutoRestock', productId: P, months: 2, source: { vessel: 'oak', months: 36, minKnownQuality: 120 } }).error).toBeDefined();
  });
});

describe('#419 판매 줄 선택지', () => {
  it('autoRestockQualityChoices — 「조건 없음」 + 60 · 70 · 80, 쓸 수 있는 통은 하한이 오를수록 줄거나 같다 · 고른 값을 보내면 남는다', () => {
    const s = load();
    const c = autoRestockQualityChoices(s, prod(s));
    expect(c.map((x) => x.source.minKnownQuality ?? null)).toEqual([null, ...AUTO_RESTOCK_QUALITY_STEPS]);
    for (let i = 1; i < c.length; i++) expect(c[i]!.available).toBeLessThanOrEqual(c[i - 1]!.available);
    expect(c[0]!.available).toBe(ids(s).length);
    const r = applyAction(s, { type: 'setAutoRestock', productId: P, months: 2, source: c[2]!.source });
    expect(r.error).toBeUndefined();
    expect(prod(r.state).autoRestockSource?.minKnownQuality).toBe(70);
  });
  it('통 범위를 바꿔도 고른 품질 하한은 남는다(autoRestockRangeChoices)', () => {
    const s = applyAction(load(), { type: 'setAutoRestock', productId: P, months: 2, source: { vessel: 'oak', months: 36, minKnownQuality: 60 } }).state;
    const ranged = autoRestockRangeChoices(s, prod(s)).filter((x) => x.source);
    expect(ranged.length).toBeGreaterThan(0);
    for (const x of ranged) expect(x.source!.minKnownQuality).toBe(60);
  });
  it('소주 · 옛 판은 선택지가 없다', () => {
    const s = load();
    expect(autoRestockQualityChoices(s, s.commerce.products.find((x) => x.category === 'soju_distilled')!)).toEqual([]);
    s.rulesVersion = 'legacy-v15';
    expect(autoRestockQualityChoices(s, prod(s))).toEqual([]);
  });
});
