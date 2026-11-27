// [결정 #438 묶음 ③] 한 화면 가격표 — 셈(MKT · 화면만). 10차 153개월 세이브. 읽기만 · 아는 품질로만(I2)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePlayFile } from '../store/playlog';
import { applyAction, calendar, domesticDemands, knownState, sellThroughPrice, type GameState } from '../sim';
import { priceTableRows, priceTableTotals } from './priceTableCalc';

const load = (): GameState => { const r = parsePlayFile(readFileSync('docs/playtest/10/distillery-mvp-standard-y13m10-202611270816.json', 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };
const idOf = (s: GameState, n: string) => s.commerce.products.find((p) => p.name === n)!.id;
const ctx = (s: GameState) => ({ ks: knownState(s), moy: calendar(s).monthOfYear });

describe('[#438 ③] 한 화면 가격표', () => {
  it('상태를 바꾸지 않는다 — 고치는 값을 넣어 세도', () => {
    const s = load();
    const before = structuredClone(s);
    const { ks, moy } = ctx(s);
    const drafts = { [idOf(s, '김포 옹기소주')]: 7000, [idOf(s, '김포 시그니처 블랜드')]: 140_000 };
    priceTableRows(s, ks, moy, drafts, 12, 'withCasks');
    priceTableTotals(s, ks, moy, drafts);
    expect(s).toEqual(before);
  });

  it('고친 값이 없으면 수요 = 아는 품질의 국내 수요 · 다 팔 값(6개월 · 병만) = 판매 화면 「다 팔 값」과 같은 셈', () => {
    const s = load();
    const { ks, moy } = ctx(s);
    const d = domesticDemands(ks, moy);
    for (const r of priceTableRows(s, ks, moy, {}, 6, 'bottles')) {
      if (r.stock <= 0) { expect(r.restocked).toBe(true); continue; }
      expect(r.demand).toBe(d.get(r.id)?.demandBottles ?? 0);
      expect(r.sellThrough).toBe(sellThroughPrice(ks, r.id, moy));
      expect(r.draft).toBe(r.price);
    }
    // 10차 끝: 「김포 시그니처 블랜드」 317병 · 월 109병 → 6개월에 다 팔 값이 지금 값(11만)보다 높다
    const sig = priceTableRows(s, ks, moy, {}, 6, 'bottles').find((r) => r.name === '김포 시그니처 블랜드')!;
    expect(sig.sellThrough!).toBeGreaterThan(sig.price);
  });

  it('병 + 맞는 원액: 병 재고 0인 「김포 소주」도 맞는 원액만큼 병입했다고 보고 다 팔 값을 센다 — 기간이 길면 값이 오른다', () => {
    const s = load();
    const { ks, moy } = ctx(s);
    const at = (h: number) => priceTableRows(s, ks, moy, {}, h, 'withCasks').find((r) => r.name === '김포 소주')!;
    const r6 = at(6);
    expect(r6.stock).toBe(0);
    expect(r6.caskBottles).toBeGreaterThan(0);
    expect(r6.restocked).toBe(true);
    expect(r6.demand).toBeGreaterThan(0);
    expect(r6.sellThrough).not.toBeNull();
    const r12 = at(12);
    // 공급이 같으면 기간이 길수록 천천히 팔아야 하므로 다 팔 값이 오른다(9,000원에 월 약 1,100병 · 원액 약 4,200병분)
    expect(r12.sellThrough!).toBeGreaterThan(r6.sellThrough!);
    expect(r6.sellThrough!).toBeGreaterThan(r6.price);
    expect(priceTableRows(s, ks, moy, {}, 6, 'bottles').find((r) => r.name === '김포 소주')!.sellThrough).toBeNull();
  });

  it('값을 올리면 그 제품 수요가 준다 · 합이 바뀐다 — 「한 번에 적용」(setPrice 줄마다) 뒤 지금 값 합 = 적용 전 고친 값 합', () => {
    const s = load();
    const { ks, moy } = ctx(s);
    const drafts = { [idOf(s, '김포 옹기소주')]: 12_000, [idOf(s, '김포 시그니처 블랜드')]: 140_000 };
    const before = priceTableTotals(s, ks, moy, {});
    const draft = priceTableTotals(s, ks, moy, drafts);
    expect(draft).not.toEqual(before);
    const row = priceTableRows(s, ks, moy, drafts, 6, 'bottles').find((r) => r.name === '김포 옹기소주')!;
    expect(row.draft).toBe(12_000);
    expect(row.demand).toBeLessThan(row.demandNow);
    // 다 팔 값은 고친 값에 끌려가지 않는다 — 「이 값으로」로 넣은 뒤에도 같은 값이 남는다
    const sig = (d: Record<string, number>) => priceTableRows(s, ks, moy, d, 6, 'bottles').find((r) => r.name === '김포 시그니처 블랜드')!.sellThrough;
    expect(sig({ [idOf(s, '김포 시그니처 블랜드')]: sig({})! })).toBe(sig({}));
    // 적용 뒤(지금 값 = 다 팔 값)에는 다 팔 값이 없고 「≈ 지금 값」 — 공급이 그 기간쯤 간다
    const applied = applyAction(s, { type: 'setPrice', productId: idOf(s, '김포 시그니처 블랜드'), price: sig({})! }).state;
    const a = priceTableRows(applied, knownState(applied), moy, {}, 6, 'bottles').find((r) => r.name === '김포 시그니처 블랜드')!;
    expect(a.sellThrough).toBeNull();
    expect(a.nearNow).toBe(true);
    expect(a.coverMonths!).toBeGreaterThan(5);
    expect(a.coverMonths!).toBeLessThan(7.5);
    // 넉넉한 제품(「김포 싱글몰트 5년」 1,432병 · 월 70병)은 「≈ 지금 값」이 아니다
    expect(priceTableRows(s, ks, moy, {}, 6, 'bottles').find((r) => r.name === '김포 싱글몰트 5년')!.nearNow).toBe(false);
    let t = s;
    for (const [productId, price] of Object.entries(drafts)) { const r = applyAction(t, { type: 'setPrice', productId, price }); expect(r.error).toBeUndefined(); t = r.state; }
    const c = ctx(t);
    expect(priceTableTotals(t, c.ks, c.moy, {})).toEqual(draft);
  });

  it('[P-MKT-52] 지난달 결산의 품절 손실 어림(T8)이 줄에 실린다', () => {
    const s = load();
    const id = idOf(s, '김포 싱글몰트 12년');
    s.history.reports.at(-1)!.stockoutDemand = [{ productId: id, bottles: 123 }];
    const { ks, moy } = ctx(s);
    const rows = priceTableRows(s, ks, moy, {}, 6, 'bottles');
    expect(rows.find((r) => r.id === id)!.stockoutLast).toBe(123);
    expect(rows.filter((r) => r.stockoutLast != null)).toHaveLength(1);
  });

  it('지난 3개월은 결산에서 — 판매 병과 그 달 판매 값', () => {
    const s = load();
    const { ks, moy } = ctx(s);
    const r = priceTableRows(s, ks, moy, {}, 6, 'bottles').find((x) => x.name === '김포 싱글몰트 12년')!;
    expect(r.last3.map((x) => x.sold)).toEqual([224, 106, 52]);
    expect(r.last3.map((x) => x.price)).toEqual([200_000, 250_000, 250_000]);
  });
});
