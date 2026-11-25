// [결정 #424] 판매 화면 「재고를 6개월에 다 팔 값 ≈ X」 — market.ts sellThroughPrice (MKT · T9의 10차 전 최소 몫). 화면만 · 아는 품질로만(I2)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePlayFile } from '../store/playlog';
import { domesticDemands, knownState, sellThroughPrice, SELL_THROUGH_MONTHS } from './market';
import { hidesProductQuality } from './productView';
import { regionOf } from './content/regions';
import { calendar } from './util';
import type { GameState } from './types';

// 9차 159개월 세이브 — 「김포 퍼스트 배치」 재고 178병 · 70,000원(이 값이면 6개월 안에 바닥난다)
const load = (): GameState => { const r = parsePlayFile(readFileSync('docs/playtest/9/distillery-mvp-standard-y14m4-202611250055.json', 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };
const ID = 'P298';
/** 앞으로 n달 국내 수요 합(계절을 달마다 따로 — 함수의 「한 달 × Σ계절」 셈을 맞춰 보는 길) */
const demand6 = (ks: GameState, price: number, moy: number) => {
  const t = { ...ks, commerce: { ...ks.commerce, products: ks.commerce.products.map((x) => (x.id === ID ? { ...x, price } : x)) } };
  let sum = 0;
  for (let i = 0; i < SELL_THROUGH_MONTHS; i++) sum += domesticDemands(t, ((moy - 1 + i) % 12) + 1, regionOf(ks)).get(ID)!.demandBottles;
  return sum;
};

describe('[결정 #424] 재고를 6개월에 다 팔 값', () => {
  it('그 값에서 앞으로 6개월 국내 수요(달마다 계절을 따로 셈) ≈ 지금 재고 — 지금 값보다 높다', () => {
    const s = load();
    const ks = knownState(s);
    const moy = calendar(s).monthOfYear;
    const p = s.commerce.products.find((x) => x.id === ID)!;
    const x = sellThroughPrice(ks, ID, moy)!;
    expect(x).toBeGreaterThan(p.price);
    expect(demand6(ks, x, moy)).toBeLessThanOrEqual(p.stockBottles * 1.01);
    expect(demand6(ks, x - 1000, moy)).toBeGreaterThan(p.stockBottles * 0.99);
  });
  it('재고가 많으면 값이 내려가고, 지금 값으로 6개월 안에 다 못 팔 만큼 많으면 null(줄 없음)', () => {
    const s = load();
    const moy = calendar(s).monthOfYear;
    const base = sellThroughPrice(knownState(s), ID, moy)!;
    s.commerce.products.find((x) => x.id === ID)!.stockBottles = 300;
    const more = sellThroughPrice(knownState(s), ID, moy)!;
    expect(more).toBeLessThan(base);
    s.commerce.products.find((x) => x.id === ID)!.stockBottles = 1_000_000;
    expect(sellThroughPrice(knownState(s), ID, moy)).toBeNull();
  });
  it('재고 0 · 면세 전용 · 없는 제품은 null', () => {
    const s = load();
    const ks = knownState(s);
    const moy = calendar(s).monthOfYear;
    expect(sellThroughPrice(ks, 'P1481', moy)).toBeNull(); // 12년 — 재고 0
    expect(sellThroughPrice(ks, 'nope', moy)).toBeNull();
  });
  it('I2 — 품질을 가리는 판에서 참 품질만 바꾸면 값이 같다(아는 품질로만 센다) · 아는 품질을 바꾸면 달라진다', () => {
    const s = load();
    expect(hidesProductQuality(s)).toBe(true);
    const moy = calendar(s).monthOfYear;
    const ids = s.commerce.products.filter((p) => p.stockBottles > 0 && p.qualityKnown).map((p) => p.id);
    expect(ids).toContain(ID);
    const before = ids.map((id) => sellThroughPrice(knownState(s), id, moy));
    const t = structuredClone(s);
    for (const p of t.commerce.products) p.quality = p.quality >= 60 ? 20 : 95; // 참 품질을 크게 뒤집는다
    expect(ids.map((id) => sellThroughPrice(knownState(t), id, moy))).toEqual(before);
    const u = structuredClone(s);
    const k = u.commerce.products.find((p) => p.id === ID)!.qualityKnown!;
    u.commerce.products.find((p) => p.id === ID)!.qualityKnown = { ...k, est: k.est + 15 };
    const changed = sellThroughPrice(knownState(u), ID, moy);
    expect(typeof changed).toBe('number');
    expect(changed).toBeGreaterThan(before[ids.indexOf(ID)]!); // 아는 품질 ↑ → 매력 ↑ → 같은 재고를 비우는 값 ↑
  });
});
