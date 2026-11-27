// [제안 P-MKT-51] (가) 자동 가격 정책 설명 — 10차 70개월 세이브(오너 "무슨 기준인지도 모르겠고"). 읽기만 · 아는 품질로만(I2)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePlayFile } from '../store/playlog';
import { applyAction, calendar, knownState, type GameState, type Product } from '../sim';
import { policyExplain } from './policyExplain';

const load = (): GameState => { const r = parsePlayFile(readFileSync('docs/playtest/10/distillery-mvp-standard-y6m11-202611261003.json', 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };
const byName = (s: GameState, n: string) => s.commerce.products.find((p) => p.name === n)!;
const on = (s: GameState, n: string, pol: Product['pricePolicy']) => { const p = byName(s, n); p.autoPrice = true; p.pricePolicy = pol; return p; };
const ex = (s: GameState, p: Product) => policyExplain(knownState(s), p, calendar(s).monthOfYear);

describe('[P-MKT-51 (가)] 자동 가격 정책 — 이번 달 왜 이 값', () => {
  it('꺼진 제품은 설명이 없다', () => {
    const s = load();
    expect(ex(s, byName(s, '김포 블렌디드'))).toBeNull();
  });
  it('설명의 값 = 그 정책을 켰을 때 엔진이 실제로 정하는 값(B · 새로 켬)', () => {
    const s = load();
    const name = '김포 오크소주';
    const t = structuredClone(s);
    const e = ex(t, on(t, name, { mode: 'profit' }))!;
    expect(e.line).toMatch(/이익\(형제 포함\) 최대|목표 .*한 달 한 단계 제한/);
    expect(e.line).toMatch(/이 제품 예상 판매 월 [\d,]+병/);
    const r = applyAction(s, { type: 'setPricePolicy', productId: byName(s, name).id, mode: 'profit' });
    expect(r.error).toBeUndefined();
    expect(byName(r.state, name).price).toBe(e.next);
  });
  it('예전 빌드에서 다시 켠 채 지난 배수(×1.76)가 남은 「김포 소주」: 목표를 벗어난 값으로 간다는 경고 · 껐다 켜라는 안내', () => {
    const s = load();
    const p = on(s, '김포 소주', { ...byName(s, '김포 소주').pricePolicy!, mode: 'profit' });
    const e = ex(s, p)!;
    expect(e.warn).toMatch(/지난번 정책 배수\(×1\.76\)/);
    expect(e.warn).toMatch(/한 번 껐다 켜면/);
    expect(e.warn).not.toMatch(/다른 정책으로/);
    expect(e.next).toBeGreaterThan(p.price);
  });
  it('[결정 #438 ①] 지금 엔진으로 끈 「김포 소주」를 다시 켜면 배수가 지워져 경고 ①이 없다', () => {
    const s = load();
    const r = applyAction(s, { type: 'setPricePolicy', productId: byName(s, '김포 소주').id, mode: 'profit' });
    expect(r.error).toBeUndefined();
    const p = byName(r.state, '김포 소주');
    expect(p.pricePolicy?.lastFactor ?? 0).not.toBeCloseTo(1.76, 2); // 지난 배수는 버리고 지금 값에서 새로 잡는다
    expect(ex(r.state, p)?.warn ?? '').not.toMatch(/지난번 정책 배수/);
  });
  it('B 목표가 이 제품 판매를 크게 줄이고 형제 쪽 이익을 키울 때 형제 합산 경고(「김포 더 퍼스트」)', () => {
    const s = load();
    const e = ex(s, on(s, '김포 더 퍼스트', { mode: 'profit' }))!;
    expect(e.warn).toMatch(/같은 범주 형제 제품 쪽 이익/);
  });
  it('A · C도 한 줄 — C는 분기 사이면 「분기 첫 달에만 다시 맞춘다」', () => {
    const s = load();
    expect(ex(s, on(s, '김포 와인 바리끄', { mode: 'turnover' }))!.line).toMatch(/이번 달 판매 이익\(같은 범주 합\) 최대/);
    const c = ex(s, on(s, '김포 옹기소주', { mode: 'premium', target: 1.3, lastFactor: 1.3 }))!;
    expect(c.line).toMatch(s.month % 3 === 0 ? /정한 배수/ : /분기 첫 달에만 다시 맞추고/);
  });
  it('읽기만 — 상태를 바꾸지 않는다 · I2: 참 품질 · 통 맛을 뒤집어도 설명이 같다', () => {
    const s = load();
    for (const n of ['김포 소주', '김포 더 퍼스트', '김포 싱글몰트 5년']) on(s, n, { mode: 'profit' });
    const before = JSON.stringify(s);
    const a = s.commerce.products.map((p) => ex(s, p));
    expect(JSON.stringify(s)).toBe(before);
    const t = structuredClone(s);
    for (const p of t.commerce.products) p.quality = p.quality >= 60 ? 25 : 95;
    for (const c of t.inventory.casks) if (c.contents) c.contents = { ...c.contents, flavor: {} };
    expect(t.commerce.products.map((p) => ex(t, p))).toEqual(a);
  });
});
