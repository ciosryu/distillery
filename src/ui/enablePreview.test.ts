// [제안 P-MKT-54 · PM 2026-11-28] 꺼진 제품을 B · C로 켜면 그 자리에서 정할 값 — 지금 값이 B · C 범위 밖일 때만. 엔진과 같은 값 · 읽기만 · 아는 품질(I2)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePlayFile } from '../store/playlog';
import { applyAction, calendar, knownState, type GameState } from '../sim';
import { currentSuggested } from '../sim/economics';
import { enablePreview } from './policyExplain';

const load = (): GameState => { const r = parsePlayFile(readFileSync('docs/playtest/10/distillery-mvp-standard-y13m10-202611270816.json', 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };
const byName = (s: GameState, n: string) => s.commerce.products.find((p) => p.name === n)!;
const pre = (s: GameState, n: string) => enablePreview(knownState(s), byName(s, n), calendar(s).monthOfYear);

describe('[P-MKT-54] 켜면 바로 — 범위 밖 손 값', () => {
  it('「김포 블렌디드」(손 값 ×2.42 > 2): B · C로 켰을 때 엔진이 정하는 값과 같다(그대로인 정책은 보이지 않음)', () => {
    const s = load();
    const p = byName(s, '김포 블렌디드');
    const v = pre(s, '김포 블렌디드')!;
    expect(v.factor).toBeGreaterThan(2);
    for (const mode of ['profit', 'premium'] as const) {
      const after = byName(applyAction(s, { type: 'setPricePolicy', productId: p.id, mode }).state, '김포 블렌디드').price;
      expect((mode === 'profit' ? v.profit : v.premium) ?? p.price).toBe(after); // 그대로면 null(보이지 않음)
    }
    expect(v.premium!).toBeLessThan(p.price); // C는 정한 배수(×1.3)로 바로
  });
  it('범위 안 값 · 자동 가격을 켠 제품에는 보이지 않는다', () => {
    const s = load();
    expect(pre(s, '김포 오크소주')).toBeNull(); // ×1.64 — 범위 안
    const p = byName(s, '김포 블렌디드'); p.autoPrice = true; p.pricePolicy = { mode: 'turnover' };
    expect(pre(s, '김포 블렌디드')).toBeNull();
  });
  it('플레이어가 고친 범위로 센다 · 하한 아래 값은 올라간다', () => {
    const s = load();
    const p = byName(s, '김포 오크소주');
    p.pricePolicy = { mode: 'profit', min: 1.8, max: 2 }; // 꺼진 채 그릇에 남은 범위
    const v = pre(s, '김포 오크소주')!;
    expect(v.min).toBe(1.8);
    expect(v.factor).toBeLessThan(1.8);
    expect(v.profit!).toBeGreaterThan(p.price);
    const sug = currentSuggested(knownState(s), byName(knownState(s), '김포 오크소주'));
    expect(v.profit! / sug).toBeGreaterThanOrEqual(1.8 - 0.01);
  });
});
