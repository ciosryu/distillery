// 판매 잡음 키 = 제품 생성 순번 (S5 난수 빈틈 메움 — ARCH F4 창 단독 PR). 전역 `nid`가 밀려도 같은 순번의 제품은 같은 잡음을 받는다
import { describe, expect, it } from 'vitest';
import { advanceMonth, applyAction, newGame, type GameState } from './index';
import { noiseKeyOf } from './market';
import { newScenarioGame } from './newScenario';

const orderSoju = (s: GameState): GameState => {
  const r = applyAction(s, { type: 'setOrder', recipeId: s.production.recipes.find((x) => x.kind === 'soju')!.id, batchesPerMonth: 2 });
  if (r.error) throw new Error(r.error);
  return r.state;
};
const bottleSoju = (s: GameState): GameState => {
  const lot = s.inventory.lots.find((l) => l.kind === 'soju')!;
  const r = applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: Math.min(lot.volumeL, 300) }], options: { name: '소주', targetAbv: 0.25, bottleMl: 375, chillFilter: true, packagingId: 'standard' } });
  if (r.error) throw new Error(r.error);
  return r.state;
};

describe('판매 잡음 키 — 제품 생성 순번', () => {
  it('새 제품은 seq = 지금까지 만든 제품 수 + 1(아카이브 포함) · 키는 #seq, 옛 제품(seq 없음)은 id', () => {
    let s = orderSoju(newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 }));
    for (let i = 0; i < 2; i++) s = advanceMonth(s);
    s = bottleSoju(s);
    const p = s.commerce.products.at(-1)!;
    expect(p.seq).toBe(1);
    expect(noiseKeyOf(p)).toBe('#1');
    expect(noiseKeyOf({ id: 'P9' })).toBe('P9');
    s.commerce.productArchive.push({ id: 'old', name: 'x', category: 'soju_distilled', createdMonth: 0, lastMonthSold: 0, totalSold: 0, quality: 50, price: 1000 });
    s = bottleSoju(s);
    expect(s.commerce.products.at(-1)!.seq).toBe(3);
  });

  it('전역 nid가 밀려도(제안 거절 등으로 다른 id가 소비돼도) 같은 순번 제품의 판매 잡음은 같다 — 판매 병 수가 같다', () => {
    let a = orderSoju(newGame({ seed: 11, region: 'KR', startingCash: 3_000_000_000 }));
    for (let i = 0; i < 2; i++) a = advanceMonth(a);
    let b = structuredClone(a);
    b.nextId += 7; // 다른 id를 쓴 흔적 — 제품 id는 달라지지만 seq는 같다
    a = bottleSoju(a); b = bottleSoju(b);
    expect(a.commerce.products.at(-1)!.id).not.toBe(b.commerce.products.at(-1)!.id);
    expect(a.commerce.products.at(-1)!.seq).toBe(b.commerce.products.at(-1)!.seq);
    const ra = advanceMonth(a).history.reports.at(-1)!.sales.at(-1)!;
    const rb = advanceMonth(b).history.reports.at(-1)!.sales.at(-1)!;
    expect(ra.bottles).toBeGreaterThan(0);
    expect(ra.bottles).toBe(rb.bottles);
  });
});
