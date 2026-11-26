// [결정 #424] 「재고를 6개월에 다 팔 값」 — 10차 70개월 U7(PM 2026-11-26): 자동 납품 제품에도 보인다(공급 = 재고 + 채울 원액). 화면만 · 아는 품질로만(I2)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePlayFile } from '../store/playlog';
import { knownState, sellThroughPrice, calendar, type GameState } from '../sim';
import { autoRestockSupplyBottles, sellThroughView } from './SellThroughNote';

const load = (f: string): GameState => { const r = parsePlayFile(readFileSync(`docs/playtest/${f}`, 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };
const p10 = () => load('10/distillery-mvp-standard-y6m11-202611261003.json');
const byName = (s: GameState, n: string) => s.commerce.products.find((p) => p.name === n)!;
const view = (s: GameState, n: string) => sellThroughView(s, knownState(s), byName(s, n), calendar(s).monthOfYear);

describe('[결정 #424] 다 팔 값 — 자동 납품 제품(10차 70개월 U7)', () => {
  it('자동 납품 · 공급이 빠듯한 「오크소주」(재고 1,004 + 채울 원액): 값이 나오고 공급에 채울 원액이 든다', () => {
    const s = p10();
    const v = view(s, '김포 오크소주')!;
    expect(v.kind).toBe('price');
    if (v.kind !== 'price') return;
    expect(v.refill).toBe(autoRestockSupplyBottles(s, byName(s, '김포 오크소주')));
    expect(v.refill).toBeGreaterThan(0);
    expect(v.price).toBeGreaterThan(byName(s, '김포 오크소주').price);
  });
  it('자동 납품 · 공급이 넉넉한 「더 퍼스트」: 줄이 사라지지 않고 「공급이 넉넉하다」(몇 개월 치)로 보인다', () => {
    const v = view(p10(), '김포 더 퍼스트')!;
    expect(v.kind).toBe('ample');
    if (v.kind === 'ample') expect(v.months).toBeGreaterThan(6);
  });
  it('손 가격 · 자동 납품 끈 제품은 지금과 같은 값(재고만으로 셈)', () => {
    const s = p10();
    const p = byName(s, '김포 싱글몰트 5년');
    const v = view(s, '김포 싱글몰트 5년')!;
    expect(v.kind).toBe('price');
    if (v.kind === 'price') { expect(v.refill).toBe(0); expect(v.price).toBe(sellThroughPrice(knownState(s), p.id, calendar(s).monthOfYear)); }
  });
  it('자동 납품을 끈 제품은 공급이 넉넉해도 「넉넉하다」 줄을 보이지 않는다(9차 159개월 「김포 소주」 재고 5,022)', () => {
    const s = load('9/distillery-mvp-standard-y14m4-202611250055.json');
    expect(view(s, '김포 소주')).toBeNull();
  });
  it('I2 — 품질을 가리는 판에서 참 품질만 뒤집어도 모든 제품의 줄이 같다', () => {
    const s = p10();
    const names = s.commerce.products.map((p) => p.name);
    const before = names.map((n) => view(s, n));
    const t = structuredClone(s);
    for (const p of t.commerce.products) p.quality = p.quality >= 60 ? 25 : 95;
    for (const c of t.inventory.casks) if (c.contents) c.contents = { ...c.contents, flavor: {} };
    expect(names.map((n) => view(t, n))).toEqual(before);
  });
});
