// [결정 #441] ① 정책 D 「원액 소화」 (MKT) — 10차 70 · 153개월 세이브. 봇은 D를 쓰지 않는다(출력 불변은 balance · P8 대조)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePlayFile } from '../store/playlog';
import { advanceMonth, applyAction, calendar, knownState, migrateSave, sellThroughPrice, type GameState } from './index';
import { autoRestockSources, currentSuggested } from './economics';
import { sellOutPrice } from './market';
import { decidePolicyPrice, drainBounds, drainTarget, matchingCaskBottles, PRICE_POLICY } from './pricePolicy';
import { normalizePolicy, policyError } from './priceEngine';
import { priceTableRows } from '../ui/priceTableCalc';
import { policyExplain } from '../ui/policyExplain';

const load = (f: string): GameState => { const r = parsePlayFile(readFileSync(`docs/playtest/10/${f}`, 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };
const S153 = 'distillery-mvp-standard-y13m10-202611270816.json';
const byName = (s: GameState, n: string) => s.commerce.products.find((p) => p.name === n)!;
const moy = (s: GameState) => calendar(s).monthOfYear;

describe('[결정 #441] D 원액 소화', () => {
  it('sellOutPrice는 양쪽으로 찾는다 — 위로는 sellThroughPrice와 같은 값(±100원), 범위 끝은 cap · floor', () => {
    const s = load(S153); const ks = knownState(s); const p = byName(s, '김포 시그니처 블랜드');
    const up = sellThroughPrice(ks, p.id, moy(s), 6)!;
    const r = sellOutPrice(ks, p.id, moy(s), 6, p.stockBottles, p.price * 0.5, p.price * 4)!;
    expect(r.at).toBeNull();
    expect(Math.abs(r.price - up)).toBeLessThanOrEqual(100);
    expect(sellOutPrice(ks, p.id, moy(s), 6, p.stockBottles, p.price * 0.5, p.price)!.at).toBe('cap');
    // 공급이 아주 많으면 바닥
    expect(sellOutPrice(ks, p.id, moy(s), 6, 1_000_000, p.price * 0.5, p.price * 4)!).toEqual({ price: Math.round(p.price * 0.5 / 100) * 100, at: 'floor' });
  });

  it('맞는 원액은 같은 원액을 쓰는 진열 제품 수로 나눈다 — 혼자 쓰는 원액은 그대로, 나눈 합은 원액 전체를 넘지 않는다', () => {
    const s = load(S153);
    const ps = s.commerce.products.filter((p) => !p.dutyFreeOnly);
    const lpa = new Map<string, number>();
    for (const p of ps) for (const x of autoRestockSources(s, p)) lpa.set(`${x.comp.source}:${x.comp.id}`, x.lot.volumeL * x.lot.abv);
    const totalLpa = [...lpa.values()].reduce((t, v) => t + v, 0);
    const splitLpa = ps.reduce((t, p) => t + matchingCaskBottles(s, p) * p.abv * (p.bottleMl / 1000), 0);
    expect(splitLpa).toBeLessThanOrEqual(totalLpa + 1);
    expect(matchingCaskBottles(s, byName(s, '김포 시그니처 블랜드'))).toBe(0);
    expect(matchingCaskBottles(s, byName(s, '김포 소주'))).toBeGreaterThan(0);
  });

  it('원액이 없는 「시그니처 블랜드」(병 317 · 11만 원 ×2.42)는 올린다 — 한 달 한 단계(+0.1), 목표는 ×2 위', () => {
    const s = load(S153); const ks = knownState(s); const p = byName(ks, '김포 시그니처 블랜드');
    const sug = currentSuggested(ks, p);
    const t = drainTarget(ks, p, moy(s), 12)!;
    expect(t.cask).toBe(0);
    expect(t.factor).toBeGreaterThan(2);
    const d = decidePolicyPrice(ks, p, { mode: 'drain' }, moy(s));
    expect(d.price!).toBe(Math.max(100, Math.round((sug * (p.price / sug + PRICE_POLICY.step)) / 100) * 100));
    // 12개월에 317병(월 약 26병)이면 상한 ×4에서도 다 팔린다 — 목표는 상한, 이번 달은 한 단계
    expect(t.at).toBe('cap');
    expect(d.why).toMatch(/원액 소화 — 병 317 \+ 맞는 원액 0병을 12개월에 팔 값 ×4\.00 — 상한 ×4\.00에서도 다 팔린다, 가드로 한 단계\(×\d\.\d\d\)/);
  });

  it('원액이 넉넉한 「김포 블렌디드」는 내린다(한 단계) · 바닥은 이익 나는 값', () => {
    const s = load(S153); const ks = knownState(s); const p = byName(ks, '김포 블렌디드');
    const sug = currentSuggested(ks, p);
    const t = drainTarget(ks, p, moy(s), 12)!;
    expect(t.factor).toBeLessThan(p.price / sug);
    const d = decidePolicyPrice(ks, p, { mode: 'drain' }, moy(s));
    expect(d.price!).toBeLessThan(p.price);
    expect(d.factor!).toBeGreaterThanOrEqual(p.price / sug - PRICE_POLICY.step - 0.01);
    expect(t.factor).toBeGreaterThanOrEqual(drainBounds(ks, p)!.lo / sug - 1e-9);
  });

  it('[같은 숫자] 한 화면 가격표(병 + 맞는 원액 · 같은 기간)의 다 팔 값 = D의 목표 값', () => {
    const s = load(S153); const ks = knownState(s);
    for (const h of [6, 12, 24]) {
      for (const r of priceTableRows(s, ks, moy(s), {}, h, 'withCasks')) {
        if (r.stock <= 0) continue;
        const t = drainTarget(ks, ks.commerce.products.find((x) => x.id === r.id)!, moy(s), h);
        expect(r.sellThrough).toBe(t?.price ?? null);
      }
    }
  });

  it('setPricePolicy — D로 켜고 기간을 적는다 · 고르기 밖 기간은 거절 · 불러올 때 지운다', () => {
    const s = load(S153); const p = byName(s, '김포 시그니처 블랜드');
    const r = applyAction(s, { type: 'setPricePolicy', productId: p.id, mode: 'drain', horizon: 24 });
    expect(r.error).toBeUndefined();
    const q = byName(r.state, '김포 시그니처 블랜드');
    expect(q.pricePolicy).toMatchObject({ mode: 'drain', horizon: 24 });
    expect(q.price).toBeGreaterThan(p.price); // 켠 순간 한 번 정한다(한 단계 위)
    expect(applyAction(s, { type: 'setPricePolicy', productId: p.id, mode: 'drain', horizon: 9 }).error).toMatch(/기간은 6 · 12 · 24 · 36개월/);
    expect(policyError({ mode: 'drain', horizon: 36 })).toBeNull();
    expect(normalizePolicy({ mode: 'drain', horizon: 9 }).horizon).toBeUndefined();
  });

  it('[코어 · 엔진] 막 켠 한 달 가드 정책(B · D)은 그 달에 한 단계만 움직인다 — 수렴 바퀴마다 「지금 값」이 기준이 되어 3단계까지 가던 것을 막는다', () => {
    for (const [name, mode] of [['김포 시그니처 블랜드', 'drain'], ['김포 싱글몰트 5년', 'profit']] as const) {
      const s = load(S153); const p = byName(s, name);
      const sug = currentSuggested(knownState(s), p);
      const q = byName(applyAction(s, { type: 'setPricePolicy', productId: p.id, mode }).state, name);
      expect(Math.abs(q.price / sug - p.price / sug)).toBeLessThanOrEqual(PRICE_POLICY.step + 0.005); // 범위 안 제품(블렌디드 ×2.42는 B 범위 ×2로 잘려 가드와 무관)
      expect(q.price).not.toBe(p.price);
    }
  });

  it('D는 다른 정책에서 남은 범위(min/max)를 쓰지 않는다 — 상한 ×2를 넘어 올라간다', () => {
    const s = load(S153); const ks = knownState(s); const p = byName(ks, '김포 시그니처 블랜드');
    const d = decidePolicyPrice(ks, p, { mode: 'drain', min: 0.6, max: 2 }, moy(s));
    expect(d.factor!).toBeGreaterThan(2);
  });

  it('정책 설명(#1216) — D 줄은 공급 · 기간 · 목표 · 한 단계를 말하고, 자동 납품이 꺼진 채 원액을 세면 경고한다(70개월 「김포 블렌디드」)', () => {
    const s = load(S153); const ks = knownState(s);
    const sig = byName(s, '김포 시그니처 블랜드'); sig.autoPrice = true; sig.pricePolicy = { mode: 'drain', horizon: 6 };
    const e = policyExplain(knownState(s), sig, moy(s))!;
    expect(e.line).toMatch(/병 317 \+ 맞는 원액 0병을 6개월에 팔 값 [\d,]+원\(기준가 ×\d\.\d\d\) · 한 달 한 단계 제한으로 이번 달/);
    expect(e.warn).toBeNull();
    const s70 = load('distillery-mvp-standard-y6m11-202611261003.json');
    const b = byName(s70, '김포 블렌디드'); b.autoPrice = true; b.pricePolicy = { mode: 'drain' }; delete b.autoRestock;
    expect(policyExplain(knownState(s70), b, moy(s70))!.warn).toMatch(/자동 납품이 꺼져 있다 — 병입하지 않으면 병 재고/);
    void ks;
  });

  it('[코어 · 명령] 켠 채 D 기간만 바꾸거나 같은 정책을 다시 고르면 이번 달 값은 그대로 — 고를 때마다 한 단계씩 더 가던 것을 막는다', () => {
    const s = load(S153); const id = byName(s, '김포 시그니처 블랜드').id;
    const on = applyAction(s, { type: 'setPricePolicy', productId: id, mode: 'drain', horizon: 12 }).state;
    const v = byName(on, '김포 시그니처 블랜드').price;
    const h6 = applyAction(on, { type: 'setPricePolicy', productId: id, mode: 'drain', horizon: 6 }).state;
    expect(byName(h6, '김포 시그니처 블랜드').price).toBe(v);
    expect(byName(h6, '김포 시그니처 블랜드').pricePolicy?.horizon).toBe(6);
    expect(byName(applyAction(h6, { type: 'setPricePolicy', productId: 'all', mode: 'drain' }).state, '김포 시그니처 블랜드').price).toBe(v);
    // 다른 정책으로 바꾸면 그 자리에서 한 번 정한다(지금과 같다) — A(현금회전)로
    expect(byName(applyAction(h6, { type: 'setPricePolicy', productId: id, mode: 'turnover' }).state, '김포 시그니처 블랜드').price).not.toBe(v);
  });

  it('[ARCH] D 그릇(mode · horizon · lastFactor)을 가진 세이브를 저장 → 불러와도 그대로 · 왕복 뒤 같은 달 결과가 바이트 동일 · 옛 min/max는 지우지 않고 D가 읽지 않는다', () => {
    let s = load(S153);
    const id = byName(s, '김포 시그니처 블랜드').id;
    s = applyAction(s, { type: 'setPricePolicy', productId: id, mode: 'profit', min: 0.8, max: 1.9 }).state;
    s = applyAction(s, { type: 'setPricePolicy', productId: id, mode: 'drain', horizon: 24 }).state;
    s = advanceMonth(s);
    const pol = byName(s, '김포 시그니처 블랜드').pricePolicy!;
    expect(pol).toMatchObject({ mode: 'drain', horizon: 24, min: 0.8, max: 1.9 });
    expect(pol.lastFactor! * currentSuggested(knownState(s), byName(s, '김포 시그니처 블랜드'))).toBeGreaterThan(1.9 * currentSuggested(knownState(s), byName(s, '김포 시그니처 블랜드'))); // 옛 max(1.9)를 넘었다 — D는 읽지 않는다
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(loaded.commerce.products.map((p) => p.pricePolicy)).toEqual(s.commerce.products.map((p) => p.pricePolicy));
    expect(JSON.stringify(advanceMonth(loaded))).toBe(JSON.stringify(advanceMonth(s)));
  });

  it('[ARCH] C로 켜며 horizon을 넘겨도 C 기본 목표(n)가 들어간다 — else if 짝', () => {
    const s = load(S153); const id = byName(s, '김포 블렌디드').id;
    const q = byName(applyAction(s, { type: 'setPricePolicy', productId: id, mode: 'premium', horizon: 12 }).state, '김포 블렌디드').pricePolicy!;
    expect(q.target).toBe(PRICE_POLICY.n);
    expect(q.horizon).toBe(12);
  });
});
