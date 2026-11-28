// [결정 #424 · #441] 「6개월에 다 팔 값」 — 10차 70개월 U7(PM 2026-11-26): 자동 납품 제품에도 보인다. PM 2026-11-28: 한 화면 가격표 · 정책 D와 같은 셈. 화면만 · 아는 품질로만(I2)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePlayFile } from '../store/playlog';
import { knownState, sellThroughPrice, calendar, type GameState } from '../sim';
import { matchingCaskBottles } from '../sim/pricePolicy';
import { SELL_THROUGH_MONTHS } from '../sim/market';
import { sellThroughView } from './SellThroughNote';
import { priceTableRows } from './priceTableCalc';

const load = (f: string): GameState => { const r = parsePlayFile(readFileSync(`docs/playtest/${f}`, 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };
const p10 = () => load('10/distillery-mvp-standard-y6m11-202611261003.json');
const p153 = () => load('10/distillery-mvp-standard-y13m10-202611270816.json');
const byName = (s: GameState, n: string) => s.commerce.products.find((p) => p.name === n)!;
const view = (s: GameState, n: string) => sellThroughView(s, knownState(s), byName(s, n), calendar(s).monthOfYear);

describe('[결정 #424 · #441] 다 팔 값 — 가격표 · D와 같은 셈', () => {
  it('자동 납품 · 공급이 빠듯한 「오크소주」: 올릴 값 · 공급 = 병 + 맞는 원액(나눔)', () => {
    const s = p10();
    const v = view(s, '김포 오크소주')!;
    expect(v.kind).toBe('up');
    expect(v.refill).toBe(matchingCaskBottles(s, byName(s, '김포 오크소주')));
    expect(v.refill).toBeGreaterThan(0);
    expect(v.price).toBeGreaterThan(byName(s, '김포 오크소주').price);
  });
  it('자동 납품 · 공급이 넉넉한 「더 퍼스트」: 줄이 사라지지 않고 내릴 값을 보인다', () => {
    const s = p10();
    const v = view(s, '김포 더 퍼스트')!;
    expect(v.kind).toBe('down');
    expect(v.price).toBeLessThan(byName(s, '김포 더 퍼스트').price);
  });
  it('손 가격 · 자동 납품 끈 제품은 병 재고만으로 센다 — 위로만 찾던 옛 값과 ±100원(양쪽 찾기의 반올림 차)', () => {
    const s = p10();
    const p = byName(s, '김포 싱글몰트 5년');
    const v = view(s, '김포 싱글몰트 5년')!;
    expect(v.kind).toBe('up');
    expect(v.refill).toBe(0);
    if (v.edge !== 'cap') expect(Math.abs(v.price - sellThroughPrice(knownState(s), p.id, calendar(s).monthOfYear)!)).toBeLessThanOrEqual(100);
  });
  it('자동 납품을 끈 제품은 공급이 넉넉해도 내릴 값을 보이지 않는다(9차 159개월 「김포 소주」 재고 5,022)', () => {
    const s = load('9/distillery-mvp-standard-y14m4-202611250055.json');
    expect(view(s, '김포 소주')).toBeNull();
  });
  it('[같은 숫자] 가격표에서 같은 기간(6개월) · 같은 공급(자동 납품이면 병 + 맞는 원액, 아니면 병만)을 고르면 같은 값', () => {
    for (const s of [p10(), p153()]) {
      const ks = knownState(s); const moy = calendar(s).monthOfYear;
      const rows = { bottles: priceTableRows(s, ks, moy, {}, SELL_THROUGH_MONTHS, 'bottles'), withCasks: priceTableRows(s, ks, moy, {}, SELL_THROUGH_MONTHS, 'withCasks') };
      let n = 0;
      for (const p of s.commerce.products) {
        const v = sellThroughView(s, ks, p, moy);
        if (!v) continue;
        const r = (p.autoRestock ? rows.withCasks : rows.bottles).find((x) => x.id === p.id)!;
        expect(v.price).toBe(r.sellThrough);
        expect(v.refill).toBe(p.autoRestock ? r.caskBottles : 0);
        n++;
      }
      expect(n).toBeGreaterThan(0);
    }
  });
  it('D를 켠 제품은 줄을 숨긴다(정책 설명이 D 기간으로 같은 숫자를 말한다)', () => {
    const s = p153();
    const p = byName(s, '김포 시그니처 블랜드');
    expect(view(s, '김포 시그니처 블랜드')).not.toBeNull();
    p.autoPrice = true; p.pricePolicy = { mode: 'drain' };
    expect(view(s, '김포 시그니처 블랜드')).toBeNull();
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
