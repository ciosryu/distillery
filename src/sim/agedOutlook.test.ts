// [P10-2 · P10-5] 곧 12년이 되는 통의 12년 품질 어림(공개 값 — I2) · 소주 생산 < 수요 — 10차 판 70개월 세이브
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { agedOutlook, AGED_OUTLOOK_FROM_MONTHS, caskOutlookQuality, fillOutlookQuality, refillOutlookQuality } from './agedOutlook';
import { emptyCaskOf } from './newGame';
import { sojuSupply, SOJU_SHORT_RATIO } from './economics';
import type { GameState } from './types';

const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/10/distillery-mvp-standard-y6m11-202611261003.json', 'utf8')).save)!;

describe('[P10-2] 곧 12년이 되는 통 — 12년 품질 어림', () => {
  it('10차 70개월: 두 번째 채움 버번 몰트가 첫 채움보다 높다(재구성 참값 88 대 76과 같은 쪽) · 남은 개월 · 나무 맛 손실', () => {
    const s = load();
    const rows = agedOutlook(s);
    const refill = rows.find((r) => r.family === 'bourbon' && r.kind === 'malt' && r.refill)!;
    const first = rows.find((r) => r.family === 'bourbon' && r.kind === 'malt' && !r.refill)!;
    expect(refill.q).toBeGreaterThan(85);
    expect(first.q).toBeGreaterThan(72);
    expect(first.q).toBeLessThan(79);
    expect(first.woodLoss).toBeGreaterThan(10);
    expect(refill.woodLoss).toBeLessThan(5);
    expect(first.monthsLeft).toBe(144 - 68);
    expect(rows[0]!.q).toBeGreaterThanOrEqual(rows.at(-1)!.q); // 높은 순
  });
  it('I2 — 원액 실제 맛 · 숨은 오염을 바꿔도 어림이 같다 · 상태를 바꾸지 않는다', () => {
    const s = load();
    const before = JSON.stringify(s);
    const a = agedOutlook(s);
    expect(JSON.stringify(s)).toBe(before);
    for (const c of s.inventory.casks) if (c.contents) { c.contents = { ...c.contents, flavor: { musty: 30, oak_tannin: 99 } }; c.contamination = 'tca'; }
    expect(agedOutlook(s)).toEqual(a);
  });
  it('어린 통(목재 24개월 미만)과 12년이 된 통은 넣지 않는다', () => {
    const s = load();
    for (const c of s.inventory.casks) if (c.contents) c.contents.oakMonths = Math.min(c.contents.oakMonths, AGED_OUTLOOK_FROM_MONTHS - 1);
    expect(agedOutlook(s)).toEqual([]);
    for (const c of s.inventory.casks) if (c.contents) c.contents.oakMonths = 150;
    expect(agedOutlook(s)).toEqual([]);
  });
});

describe('[P10-5] 소주 생산 < 판매 수요', () => {
  it('10차 70개월 지금: 소주 지시(월 1배치)가 최근 3개월 수요를 대므로 알리지 않는다 · 53 ~ 57개월처럼 지시를 멈추면 알린다', () => {
    const s = load();
    const v = sojuSupply(s);
    expect(v.demandPerMonth).toBeGreaterThan(0);
    expect(v.demandPerMonth).toBeGreaterThanOrEqual(v.perMonth);
    expect(v.madeBottlesPerMonth).toBeGreaterThanOrEqual(v.demandPerMonth * SOJU_SHORT_RATIO);
    s.production.orders = s.production.orders.filter((o) => s.production.recipes.find((r) => r.id === o.recipeId)?.kind !== 'soju');
    const w = sojuSupply(s);
    expect(w.madeBottlesPerMonth).toBe(0);
    expect(w.madeBottlesPerMonth).toBeLessThan(w.demandPerMonth * SOJU_SHORT_RATIO);
  });
});

describe('[H1] 할 일 · 통입 칸 · 숙성 표가 같은 숫자 — 12년 전망과 어긋나지 않는다', () => {
  it('10차 70개월: 첫 채움 예비 통 K10 = 첫 채움 묶음 · 리필이었다면 = 두 번째 채움 묶음(±1) · 이미 두 번째 채움이면 리필 대안 없음', () => {
    const s = load();
    const rows = agedOutlook(s);
    const first = rows.find((r) => r.family === 'bourbon' && r.kind === 'malt' && !r.refill)!;
    const second = rows.find((r) => r.family === 'bourbon' && r.kind === 'malt' && r.refill)!;
    const k10 = s.inventory.casks.find((c) => c.id === 'K10')! as Parameters<typeof caskOutlookQuality>[1];
    expect(Math.abs(caskOutlookQuality(s, k10)!.q - first.q)).toBeLessThanOrEqual(1);
    expect(Math.abs(refillOutlookQuality(s, k10)!.q - second.q)).toBeLessThanOrEqual(1);
    const k19 = s.inventory.casks.find((c) => c.id === 'K19')! as Parameters<typeof caskOutlookQuality>[1];
    expect(refillOutlookQuality(s, k19)).toBeNull();
  });
  it('T1-a: 새 버번에 몰트 원액을 지금 채우면 첫 채움 어림 · 리필 대안 — 소주 · 옹기는 없음', () => {
    const s = load();
    const lot = s.inventory.lots.find((l) => l.kind === 'malt')!;
    const f = fillOutlookQuality(s, [emptyCaskOf(s, 'ex_bourbon_barrel')], lot)!;
    expect(f.qMax).toBeGreaterThan(72);
    expect(f.qMax).toBeLessThan(79);
    expect(f.lossMax).toBeGreaterThan(10);
    expect(f.refill!.q).toBeGreaterThan(f.qMax + 8);
    expect(fillOutlookQuality(s, [emptyCaskOf(s, 'ex_bourbon_barrel')], { ...lot, kind: 'soju' })).toBeNull();
  });
});
