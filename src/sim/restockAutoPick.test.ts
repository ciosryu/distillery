// [결정 #437 ①] 재고 보충 「자동으로 골라 담기」 — 10차 70개월 세이브 시나리오 (봇이 쓰지 않는 화면 기능)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { applyAction } from './actions';
import { agePolicyFilter } from './ageBand';
import { caskFamily } from './agedCombos';
import { knownReads } from './blendTable';
import { reserveCaskIds } from './tags';
import { productFamilyShares, RESTOCK_FAMILY_NOTE_SHARE, restockFamilyNote, restockAutoPick, restockAutoPickSupported, restockBottleOptions, restockLabelMonths, restockPickDefaultBottles, restockPickFamilies, type RestockPickCond } from './restockAutoPick';
import type { GameState, Product } from './types';

const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/10/distillery-mvp-standard-y6m11-202611261003.json', 'utf8')).save)!;
const prod = (s: GameState, name: string): Product => s.commerce.products.find((p) => p.name === name)!;
const keep = (s: GameState, p: Product, over: Partial<RestockPickCond> = {}): RestockPickCond => ({ minMonths: restockLabelMonths(s, p), flavor: { kind: 'keep' }, bottles: restockPickDefaultBottles(s, p), ...over });
const bottle = (s: GameState, p: Product, comps: { caskId: string; liters: number }[]) =>
  applyAction(s, { type: 'bottle', components: comps.map((x) => ({ source: 'cask' as const, id: x.caskId, liters: x.liters })), options: restockBottleOptions(p) });

describe('[결정 #437 ①] 자동으로 골라 담기', () => {
  it('더 퍼스트(1년 표기) — 지금 맛 유지: 블렌더 계획 · 원한 병 수 · 담은 그대로 병입하면 그 제품 재고에 더한다(새 제품 없음)', () => {
    const s = load();
    const p = prod(s, '김포 더 퍼스트');
    const cond = keep(s, p, { bottles: 210 });
    const r = restockAutoPick(s, p, cond);
    expect(r.error).toBeUndefined();
    expect(r.method).toBe('flavor');
    expect(r.bottles).toBeGreaterThanOrEqual(205);
    expect(r.bottles).toBeLessThanOrEqual(210);
    const n = s.commerce.products.length;
    const before = p.stockBottles;
    const res = bottle(s, p, r.components);
    expect(res.state.commerce.products.length).toBe(n);
    const after = res.state.commerce.products.find((x) => x.id === p.id)!.stockBottles;
    expect(Math.abs(after - before - r.bottles)).toBeLessThanOrEqual(2);
  });
  it('플래그십 예비(12년 후보) · 띠 정책이 빼는 통은 어떤 위스키 제품 · 어떤 조건에도 담지 않는다', () => {
    const s = load();
    const reserve = reserveCaskIds(s);
    expect(reserve.size).toBeGreaterThan(0);
    for (const p of s.commerce.products.filter((x) => restockAutoPickSupported(s, x))) {
      for (const cond of [keep(s, p), keep(s, p, { minMonths: 0 }), keep(s, p, { minMonths: 0, bottles: 5000 })]) {
        const r = restockAutoPick(s, p, cond);
        for (const x of r.components) expect(reserve.has(x.caskId)).toBe(false);
        // 담은 통은 띠 정책이 허락한 통이다(자동 납품과 같은 함수)
        const casks = r.components.map((x) => s.inventory.casks.find((c) => c.id === x.caskId)!) as Parameters<typeof agePolicyFilter>[1][number][];
        if (casks.length) expect(agePolicyFilter(s, casks).allowed.length).toBe(casks.length);
      }
    }
  });
  it('싱글몰트 5년 — 5년 넘은 통은 예비 · 띠 정책이 지켜 담지 않고 왜 비었는지 센다', () => {
    const s = load();
    const r = restockAutoPick(s, prod(s, '김포 싱글몰트 5년'), keep(s, prod(s, '김포 싱글몰트 5년')));
    expect(r.components).toEqual([]);
    expect(r.error).toBeTruthy();
    expect(r.held.reserve).toBeGreaterThan(0);
    expect(r.held.policy).toBeGreaterThan(0);
  });
  it('(A) 통 계열 — 고른 계열 통만 · 품질 하한 — 아는 품질이 하한 이상인 통만 · 숙성 범위', () => {
    const s = load();
    const p = prod(s, '김포 더 퍼스트');
    const fams = restockPickFamilies(s, p, { minMonths: 12 });
    expect(fams.map((f) => f.family).sort()).toEqual(['bourbon', 'sherry', 'wine']);
    for (const f of fams) {
      const r = restockAutoPick(s, p, keep(s, p, { flavor: { kind: 'family', family: f.family } }));
      for (const x of r.components) expect(caskFamily(s.inventory.casks.find((c) => c.id === x.caskId)!)).toBe(f.family);
    }
    const reads = knownReads(s);
    const q = restockAutoPick(s, p, keep(s, p, { minKnownQuality: 70 }));
    for (const x of q.components) expect(reads.get(x.caskId)!.estQuality).toBeGreaterThanOrEqual(70);
    expect(restockAutoPick(s, p, keep(s, p, { minKnownQuality: 101 })).components).toEqual([]);
    const band = restockAutoPick(s, p, keep(s, p, { minMonths: 24, maxMonths: 48 }));
    for (const x of band.components) { const m = s.inventory.casks.find((c) => c.id === x.caskId)!.contents!.oakMonths; expect(m).toBeGreaterThanOrEqual(24); expect(m).toBeLessThanOrEqual(48); }
    expect(restockAutoPick(s, p, keep(s, p, { minMonths: 48, maxMonths: 24 })).error).toMatch(/거꾸로/);
  });
  it('I2 — 통 원액 실제 맛 · 제품 참 품질 · 참 향미를 바꿔도 고른 통 · L이 같다 · 상태를 바꾸지 않는다', () => {
    const s = load();
    const p = prod(s, '김포 더 퍼스트');
    const before = JSON.stringify(s);
    const a = restockAutoPick(s, p, keep(s, p));
    expect(JSON.stringify(s)).toBe(before);
    for (const c of s.inventory.casks) if (c.contents) c.contents = { ...c.contents, flavor: { musty: 30, oak_tannin: 99 } };
    p.quality = 99;
    p.flavor = { musty: 50 } as Product['flavor'];
    expect(restockAutoPick(s, p, keep(s, p))).toEqual(a);
  });
  it('블렌디드 — 첫 병입 레시피 비율대로 · 소주 · 뉴본은 대상이 아니다', () => {
    const s = load();
    const b = prod(s, '김포 블렌디드');
    const r = restockAutoPick(s, b, keep(s, b));
    expect(r.method).toBe('mix');
    expect(r.components.length).toBeGreaterThan(0);
    expect(restockAutoPickSupported(s, prod(s, '김포 소주'))).toBe(false);
    expect(restockAutoPickSupported(s, prod(s, '김포 뉴본 그레인'))).toBe(false);
  });
  it('[P-PROD-78] 계열 다름 알림 — 통 구성 기록(공개)의 20% 미만 계열만 알린다 · 이름이 아니라 기록 기준', () => {
    const s = load();
    const wine = prod(s, '김포 와인 바리끄'); // 이름과 달리 기록은 올로로소 98%(셰리 계열)
    const sh = productFamilyShares(wine)!;
    expect(sh.get('sherry')!).toBeGreaterThan(0.9);
    expect([...sh.values()].reduce((t, x) => t + x, 0)).toBeCloseTo(1, 6);
    expect(restockFamilyNote(wine, 'sherry')).toBeNull();
    const nb = restockFamilyNote(wine, 'bourbon')!;
    expect(nb.share).toBeLessThan(RESTOCK_FAMILY_NOTE_SHARE);
    expect(nb.top.family).toBe('sherry');
    expect(restockFamilyNote(wine, 'wine')!.share).toBe(0);
    const virgin = prod(s, '김포 버진오크'); // 버번 77 · 셰리 21 · 버진 2 → 버번 · 새 통 계열 약 79%
    expect(restockFamilyNote(virgin, 'bourbon')).toBeNull();
    expect(restockFamilyNote(virgin, 'sherry')).toBeNull(); // 21% — 20% 이상이라 알리지 않는다
    expect(restockFamilyNote(virgin, 'wine')).not.toBeNull();
    expect(restockFamilyNote({ caskMix: undefined }, 'bourbon')).toBeNull(); // 기록 없으면 알리지 않는다
  });
});
