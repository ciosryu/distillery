// 병입 로트 상태 입구 (F3 코어 ARCH — [결정 #308·#318]) · core-integration §5 수용 테스트 중 로트·사건 몫
import { describe, expect, it } from 'vitest';
import { checkInvariants } from './invariants';
import { addLot, dropLots, lotBottles, lotsOf, productLots, sellFromLots } from './lots';
import { archiveSoldOutProducts } from './lifecycle';
import { migrateSave } from './migrate';
import { newGame } from './newGame';
import { newScenarioGame } from './newScenario';
import { firstEligibleSale } from './saleEvents';
import type { GameState, MonthReport, Product } from './types';
import fixture from './fixtures/save-v15.json';

const fresh = (): GameState => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
const product = (id: string, stockBottles: number): Product => ({ id, name: id, category: 'whisky', ageYears: 3, oakMonths: 36, abv: 0.4, bottleMl: 700, chillFiltered: true, packagingId: 'standard', flavor: {}, quality: 60, typicity: 70, style: null, sourcedShare: 0, stockBottles, price: 50_000, unitCost: 20_000, createdMonth: 0, lastMonthSold: 0, totalSold: 0 });
const report = (month: number): MonthReport => ({ month } as MonthReport);
const SALE = { kind: 'domestic', settlement: 'cash', unitPrice: 50_000 } as const;

describe('병입 로트 그릇 (commerce.lots)', () => {
  it('새 판·옛 세이브에는 로트가 없고, 만들기 전에는 그릇도 만들지 않는다 — 존재하지 않는 로트·판매 증거를 창작하지 않는다', () => {
    const s = fresh();
    expect(s.commerce.lots).toBeUndefined();
    expect(lotsOf(s)).toEqual([]);
    const old = migrateSave(JSON.parse(JSON.stringify(fixture.save)) as GameState);
    expect(old!.commerce.lots).toBeUndefined();
    expect(sellFromLots(s, report(3), 'none', 10, SALE)).toEqual([]);
    expect(s.commerce.lots).toBeUndefined();
  });

  it('addLot — id는 제품 안 순번(제품:달:n), 전역 nextId는 움직이지 않는다 · 병은 정수로 내리고 0 이하는 만들지 않는다', () => {
    const s = fresh();
    const nextId = s.nextId;
    s.month = 40;
    expect(addLot(s, 'A', 120.7)!.id).toBe('A:40:0');
    expect(addLot(s, 'A', 30, { eligibleAtBottling: true })!.id).toBe('A:40:1');
    expect(addLot(s, 'B', 10, { month: 12 })!.id).toBe('B:12:0');
    expect(addLot(s, 'A', 0)).toBeUndefined();
    expect(s.nextId).toBe(nextId);
    expect(productLots(s, 'A').map((l) => [l.id, l.bottles, l.eligibleAtBottling])).toEqual([['A:40:0', 120, undefined], ['A:40:1', 30, true]]);
    expect(lotBottles(s, 'A')).toBe(150);
    const comps = [{ batchId: 'b1', origin: 'self' as const, siteId: 'kr_andong', kindAtBirth: 'malt' as const, contribLPA: 10, costKRW: 1000, woodMonths: 150 }];
    expect(addLot(s, 'C', 5, { components: comps })!.components).toBe(comps);
  });

  it('sellFromLots — FIFO로 빼고 로트마다 사건 하나를 그달 결산에 쌓는다 · 다른 제품의 로트와 순서는 그대로 · 양의 대가가 아니면 아무것도 안 한다', () => {
    const s = fresh();
    addLot(s, 'A', 100, { month: 10 });
    addLot(s, 'B', 7, { month: 11 });
    addLot(s, 'A', 50, { month: 12, eligibleAtBottling: true });
    const r = report(20);
    expect(sellFromLots(s, r, 'A', 0, SALE)).toEqual([]);
    expect(sellFromLots(s, r, 'A', 10, { ...SALE, unitPrice: 0 })).toEqual([]);
    expect(r.saleEvents).toBeUndefined();
    const ev = sellFromLots(s, r, 'A', 120, { ...SALE, channel: 'retail' });
    expect(ev).toEqual([
      { month: 20, productId: 'A', lotId: 'A:10:0', bottles: 100, unitPrice: 50_000, settlement: 'cash', kind: 'domestic', channel: 'retail', eligibleAtSale: false },
      { month: 20, productId: 'A', lotId: 'A:12:0', bottles: 20, unitPrice: 50_000, settlement: 'cash', kind: 'domestic', channel: 'retail', eligibleAtSale: true },
    ]);
    expect(r.saleEvents).toEqual(ev);
    expect(lotsOf(s).map((l) => [l.id, l.bottles])).toEqual([['B:11:0', 7], ['A:12:0', 30]]);
    sellFromLots(s, r, 'B', 7, { kind: 'export', settlement: 'receivable', unitPrice: 70_000 });
    expect(r.saleEvents).toHaveLength(3);
    expect(lotsOf(s).map((l) => l.id)).toEqual(['A:12:0']);
    dropLots(s, 'A');
    expect(lotsOf(s)).toEqual([]);
  });

  it('win(F3 몫): 어린 제품 판매 + 적격 보충만으로 승리 후보 사건 0 — 먼저 병입한 어린 로트를 다 판 뒤에야 적격 병이 나간다 (#186 FIFO)', () => {
    const s = fresh();
    addLot(s, 'A', 100, { month: 10, eligibleAtBottling: false }); // 어린 위스키
    addLot(s, 'A', 50, { month: 150, eligibleAtBottling: true }); // 적격 보충(#186)
    const r1 = report(151);
    sellFromLots(s, r1, 'A', 80, SALE);
    expect(firstEligibleSale(r1.saleEvents ?? [])).toBeUndefined();
    const r2 = report(152);
    sellFromLots(s, r2, 'A', 30, SALE);
    expect(firstEligibleSale(r2.saleEvents ?? [])).toMatchObject({ month: 152, lotId: 'A:150:0', bottles: 10, eligibleAtSale: true });
  });

  it('수명 정리(lifecycle) — 샌드박스에서 품절 제품이 아카이브로 가면 그 로트도 사라진다', () => {
    const s = newGame({ seed: 3 });
    s.month = 12;
    s.commerce.products.push({ ...product('OLD', 0), createdMonth: 0, lastMonthSold: 0 });
    s.commerce.lots = [{ id: 'OLD:0:0', productId: 'OLD', bottles: 1, bottledMonth: 0 }, { id: 'K:0:0', productId: 'K', bottles: 2, bottledMonth: 0 }];
    expect(archiveSoldOutProducts(s)).toBe(1);
    expect(lotsOf(s).map((l) => l.id)).toEqual(['K:0:0']);
  });

  it('불변식 — 로트 병은 정수 > 0 · id 하나뿐 · 제품이 있어야 한다(오류) · 제품 재고와 다르면 경고(연결 중)', () => {
    const s = fresh();
    s.commerce.products.push(product('A', 100));
    addLot(s, 'A', 100, { month: 1 });
    expect(checkInvariants(s)).toEqual({ errors: [], warnings: [] });
    s.commerce.products[s.commerce.products.length - 1]!.stockBottles = 90;
    expect(checkInvariants(s).warnings.join('\n')).toContain('제품 A 로트 합 100 ≠ stockBottles 90');
    s.commerce.lots!.push({ id: 'A:1:0', productId: 'A', bottles: 2.5, bottledMonth: 1 }, { id: 'Z:1:0', productId: 'Z', bottles: 1, bottledMonth: 1 });
    const e = checkInvariants(s).errors.join('\n');
    for (const m of ['로트 A:1:0 bottles = 2.5', '로트 A:1:0 id 중복', '로트 Z:1:0 제품 Z 없음']) expect(e).toContain(m);
  });
});
