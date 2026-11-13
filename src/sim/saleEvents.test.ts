// F3 판매 사건 · FIFO 로트 할당 (결정 #308 · #318) — core-integration §2.3 수용 테스트 중 로트·사건 몫
import { describe, expect, it } from 'vitest';
import { allocateFifo, firstEligibleSale, lotId, newLot, nextLotIndex, recordSale, type BottledLot } from './saleEvents';

const lots = (): BottledLot[] => [newLot('L2', 'P', 100, 24, true), newLot('L1', 'P', 50, 12, false)]; // 들어온 순서가 FIFO 순서와 다르다

describe('FIFO 로트 할당', () => {
  it('병입 달이 이른 로트부터 뺀다 — 로트 둘에 걸치면 둘로 나뉜다', () => {
    const r = allocateFifo(lots(), 70);
    expect(r.takes).toEqual([{ lotId: 'L1', bottles: 50 }, { lotId: 'L2', bottles: 20 }]);
    expect(r.lots).toEqual([{ id: 'L2', productId: 'P', bottles: 80, bottledMonth: 24, eligibleAtBottling: true }]);
    expect(r.short).toBe(0);
  });
  it('모자라면 short에 남기고 로트는 다 비운다 · 0 이하 요청은 아무것도 안 한다', () => {
    expect(allocateFifo(lots(), 200)).toEqual({ takes: [{ lotId: 'L1', bottles: 50 }, { lotId: 'L2', bottles: 100 }], lots: [], short: 50 });
    const z = allocateFifo(lots(), 0);
    expect(z.takes).toEqual([]);
    expect(z.lots.map((l) => l.id)).toEqual(['L1', 'L2']);
    expect(allocateFifo(lots(), 10).lots.find((l) => l.id === 'L1')!.bottles).toBe(40); // 원본은 바꾸지 않는다
  });
});

describe('유상 출하 기록', () => {
  it('로트마다 사건 하나 · 적격성은 거래 시점의 출고 로트에 고정', () => {
    const r = recordSale(lots(), 30, 'P', 70, { kind: 'domestic', settlement: 'cash', unitPrice: 50_000, channel: 'retail' });
    expect(r.events).toEqual([
      { month: 30, productId: 'P', lotId: 'L1', bottles: 50, unitPrice: 50_000, settlement: 'cash', kind: 'domestic', channel: 'retail', eligibleAtSale: false },
      { month: 30, productId: 'P', lotId: 'L2', bottles: 20, unitPrice: 50_000, settlement: 'cash', kind: 'domestic', channel: 'retail', eligibleAtSale: true },
    ]);
  });
  it('양의 대가가 아니면 사건이 아니다 — 무료·0원은 로트도 건드리지 않는다', () => {
    const r = recordSale(lots(), 30, 'P', 10, { kind: 'domestic', settlement: 'cash', unitPrice: 0 });
    expect(r.events).toEqual([]);
    expect(r.lots.map((l) => l.bottles)).toEqual([100, 50]);
  });
  it('매출채권(수출·납품)도 정상 확정 대가다 · 핸드필은 cellar_door로 적격(#318)', () => {
    const exp = recordSale(lots(), 40, 'P', 5, { kind: 'export', settlement: 'receivable', unitPrice: 60_000 });
    expect(exp.events[0]!.settlement).toBe('receivable');
    const cask = [newLot('L9', 'H', 20, 150, true)];
    const hf = recordSale(cask, 150, 'H', 3, { kind: 'cellar_door', settlement: 'cash', unitPrice: 290_000 });
    expect(firstEligibleSale(hf.events)?.kind).toBe('cellar_door');
  });
});

describe('승리 후보 사건 (F4가 읽는다)', () => {
  it('"어린 제품 과거 판매 + 적격 보충만" → 어린 로트를 다 팔기 전에는 적격 출고가 없다', () => {
    let cur: BottledLot[] = [newLot('Y', 'P', 100, 12, false)];
    const all = [] as ReturnType<typeof recordSale>['events'];
    const sell = (month: number, n: number) => { const r = recordSale(cur, month, 'P', n, { kind: 'domestic', settlement: 'cash', unitPrice: 50_000 }); cur = r.lots; all.push(...r.events); };
    sell(13, 30);
    cur = [...cur, newLot('E', 'P', 40, 150, true)]; // 적격 로트로 보충(#186) — 제품은 같다
    sell(150, 30); // 아직 어린 로트 40병 남음 → 적격 출고 0
    expect(firstEligibleSale(all)).toBeUndefined();
    sell(151, 50); // 어린 40 + 적격 10
    expect(firstEligibleSale(all)).toMatchObject({ month: 151, lotId: 'E', bottles: 10 });
  });
  it('b2b · 0병 · 0원은 승리 후보가 아니고, 같은 달이면 먼저 쌓인 사건', () => {
    const e = (month: number, kind: 'domestic' | 'b2b', bottles = 1, unitPrice = 1) => ({ month, productId: 'P', lotId: 'L', bottles, unitPrice, settlement: 'cash' as const, kind, eligibleAtSale: true });
    expect(firstEligibleSale([e(150, 'b2b'), e(160, 'domestic', 0), e(170, 'domestic', 1, 0)])).toBeUndefined();
    expect(firstEligibleSale([e(160, 'domestic'), { ...e(160, 'domestic'), lotId: 'M' }, e(150, 'domestic')])).toMatchObject({ month: 150 });
    expect(firstEligibleSale([e(160, 'domestic'), { ...e(160, 'domestic'), lotId: 'M' }])!.lotId).toBe('L');
  });
});

describe('로트 id — 제품 안 순번 (전역 nid를 쓰지 않는다)', () => {
  it('같은 제품·같은 달이면 n이 올라가고, 다른 달·다른 제품은 0부터', () => {
    const ls = [newLot(lotId('P', 12, 0), 'P', 10, 12), newLot(lotId('P', 12, 1), 'P', 10, 12), newLot(lotId('Q', 12, 0), 'Q', 10, 12)];
    expect(nextLotIndex(ls, 'P', 12)).toBe(2);
    expect(nextLotIndex(ls, 'P', 13)).toBe(0);
    expect(nextLotIndex(ls, 'Q', 12)).toBe(1);
    expect(lotId('P', 12, 2)).toBe('P:12:2');
    expect(new Set(ls.map((l) => l.id)).size).toBe(3);
  });
});
