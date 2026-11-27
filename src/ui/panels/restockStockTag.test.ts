// [P-PROD-76] 보충할 제품 메뉴 — 결품 · 결품 예정 꼬리표가 할 일 `stockout`과 같은 기준인지 (10차 70개월 세이브)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from '../../sim/migrate';
import type { GameState } from '../../sim';
import { stockoutSoon } from '../alerts';
import { restockStockTags, sortByStockTag } from './restockStockTag';

const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/10/distillery-mvp-standard-y6m11-202611261003.json', 'utf8')).save)!;

describe('[P-PROD-76] 보충할 제품 — 결품 · 결품 예정', () => {
  it('10차 70개월 그대로: 결품 · 결품 예정이 없으면 꼬리표도 없다', () => {
    const s = load();
    expect(stockoutSoon(s).soon.length + stockoutSoon(s).empty.length).toBe(0);
    expect(restockStockTags(s).size).toBe(0);
  });
  it('재고 0 → ● 결품 · 재고 < 이번 달 수요 → ▲ 다음 달 결품(할 일과 같은 목록) · 결품이 맨 위', () => {
    const s = load();
    const [a, b, c] = s.commerce.products;
    a!.stockBottles = 1; // 수요보다 적다
    c!.stockBottles = 0;
    const tags = restockStockTags(s);
    expect(tags.get(c!.id)?.kind).toBe('empty');
    expect(tags.get(c!.id)?.mark).toBe('● 결품');
    expect(stockoutSoon(s).soon.map((x) => x.id)).toContain(a!.id);
    expect(tags.get(a!.id)?.kind).toBe('soon');
    expect(tags.get(a!.id)?.mark).toMatch(/^▲/);
    expect(tags.has(b!.id)).toBe(stockoutSoon(s).soon.some((x) => x.id === b!.id));
    for (const x of stockoutSoon(s).soon) expect(tags.get(x.id)?.kind).toBe('soon'); // 결품 예정은 할 일과 같은 목록
    expect(sortByStockTag([a!, b!, c!], tags).map((p) => p.id)).toEqual([c!.id, a!.id, b!.id]);
  });
  it('읽기만 — 상태를 바꾸지 않는다', () => {
    const s = load();
    s.commerce.products[0]!.stockBottles = 0;
    const before = JSON.stringify(s);
    restockStockTags(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});
