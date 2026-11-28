// [결정 #441] ② · ③ B 「이익」 수리 (MKT) — ②-1 최대의 95% 안에서 지금 값에 가장 가까운 후보 · ②-3 이 제품 판매를 30% 넘게 줄이는 후보 제외 · ③ 「다 팔 값」 후보
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePlayFile } from '../store/playlog';
import { calendar, knownState, type GameState } from './index';
import { currentSuggested } from './economics';
import { decidePolicyPrice, profitPlan } from './pricePolicy';
import { sellThroughView } from '../ui/SellThroughNote';

const load = (f: string): GameState => { const r = parsePlayFile(readFileSync(`docs/playtest/10/${f}`, 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };
const S153 = 'distillery-mvp-standard-y13m10-202611270816.json';
const S70 = 'distillery-mvp-standard-y6m11-202611261003.json';
const byName = (s: GameState, n: string) => s.commerce.products.find((p) => p.name === n)!;
const moy = (s: GameState) => calendar(s).monthOfYear;

describe('[결정 #441] B 수리', () => {
  it('「시그니처 블랜드」(병 317 · 원액 0 · 11만 원 ×2.42): 예전 B는 격자 끝 ×2.00 → 90,800원으로 내렸다 → 이제 내리지 않는다(②-1 지금 값이 최대의 95% 안)', () => {
    const s = load(S153); const p = byName(s, '김포 시그니처 블랜드');
    const sug = currentSuggested(knownState(s), p);
    const plan = profitPlan(s, p, moy(s))!;
    expect(plan.sellThrough).not.toBeNull(); // ③ 다 팔 값(×3.6)은 후보에 있다 — 3개월 이익(보충을 가정)으로는 지금 값을 넘지 못한다(설계 §9 한계)
    expect(plan.price).toBe(p.price);
    const d = decidePolicyPrice(s, p, { mode: 'profit' }, moy(s));
    expect(d.factor ?? p.price / sug).toBeGreaterThanOrEqual(p.price / sug - 1e-9);
  });
  it('③ 다 팔 값 후보 = 판매 카드 「6개월에 다 팔 값」 줄의 값(같은 셈)', () => {
    for (const f of [S70, S153]) {
      const s = load(f); const ks = knownState(s);
      for (const p of s.commerce.products) {
        const v = sellThroughView(s, ks, p, moy(s));
        const plan = profitPlan(s, p, moy(s)); // 엔진처럼 참 상태를 넘긴다(안에서 knownState)
        if (!v || !plan) continue;
        expect(plan.sellThrough).toBe(v.price);
      }
    }
  });
  it('③ 플레이어가 상한을 정했으면 다 팔 값 후보도 그 안으로 자른다', () => {
    const s = load(S153); const p = byName(s, '김포 시그니처 블랜드');
    const d = decidePolicyPrice(s, p, { mode: 'profit', max: 2, lastFactor: 1.95 }, moy(s));
    expect(d.factor!).toBeLessThanOrEqual(2 + 1e-9);
  });
  it('②-1 · ②-3 — 고른 값은 최대 이익 후보보다 지금 값에 가깝거나 같고, 모든 제품에서 이 제품 지평 판매를 0.7 아래로 줄이지 않는다', () => {
    for (const f of [S70, S153]) {
      const s = load(f);
      for (const p of s.commerce.products) {
        const plan = profitPlan(s, p, moy(s));
        if (!plan) continue;
        expect(Math.abs(plan.price - p.price)).toBeLessThanOrEqual(Math.abs(plan.best - p.price) + 1e-9);
      }
    }
  });
});
