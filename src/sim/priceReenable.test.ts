import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import { applyAction, type GameState } from '.';

// 10차 판 뒤 묶음 ① — 자동 가격을 끈 뒤 같은 정책을 다시 켜면 지난번 배수(lastFactor)에서 출발했다(MKT #1216 경고 ①).
// 10차 70개월 세이브 「김포 소주」: 꺼짐 · 정책 B(이익) · lastFactor 1.76 · 지금 8,800원 → 다시 켜면 11,000원으로 뛰었다
const load = (): GameState => {
  const r = parsePlayFile(readFileSync('docs/playtest/10/distillery-mvp-standard-y6m11-202611261003.json', 'utf8')); if ('error' in r) throw new Error(r.error);
  return r.save;
};
const soju = (s: GameState) => s.commerce.products.find((x) => x.name === '김포 소주')!;

describe('자동 가격 다시 켜기 — 지난 배수에서 출발하지 않는다', () => {
  it('setPricePolicy: 꺼져 있던 같은 정책(B)을 켜면 지금 배수에서 출발 — 한 번에 뛰지 않는다', () => {
    const s = load();
    const p = soju(s);
    expect(p.autoPrice).toBeFalsy();
    expect(p.pricePolicy?.mode).toBe('profit');
    expect(p.pricePolicy?.lastFactor).toBeCloseTo(1.76, 2);
    const q = soju(applyAction(s, { type: 'setPricePolicy', productId: p.id, mode: 'profit' }).state);
    expect(q.autoPrice).toBe(true);
    expect(q.price).toBeLessThan(10_000); // 고치기 전 11,000원
    expect(q.price).toBeGreaterThanOrEqual(p.price);
  });
  it('setPricePolicy: 켜 둔 채 같은 정책을 다시 고르면 지난 배수를 그대로 둔다(범위 · 목표만 고칠 때)', () => {
    const s = load();
    const p = soju(s);
    const on = applyAction(s, { type: 'setPricePolicy', productId: p.id, mode: 'profit' }).state;
    const f = soju(on).pricePolicy?.lastFactor;
    const again = soju(applyAction(on, { type: 'setPricePolicy', productId: p.id, mode: 'profit', max: 3 }).state);
    expect(again.pricePolicy?.lastFactor).toBe(f);
  });
  it('옛 명령 setAutoPrice: 꺼져 있던 A(현금회전)를 다시 켜면 지난 배수를 버린다', () => {
    const s = load();
    const p = soju(s);
    p.pricePolicy = { ...p.pricePolicy!, mode: 'turnover', lastFactor: 1.9 };
    const q = soju(applyAction(s, { type: 'setAutoPrice', productId: p.id, on: true }).state);
    expect(q.autoPrice).toBe(true);
    expect(q.pricePolicy?.lastFactor).not.toBe(1.9);
  });
});
