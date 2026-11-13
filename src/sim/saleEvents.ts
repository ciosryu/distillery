// 판매 사건·병입 로트·FIFO 할당 — F3 MKT 몫 ([결정 #308] 승리 = 적격 로트의 최초 정상 유상 출하 · #318 핸드필 cellar_door 적격)
// 설계: core-integration.md §3(BottledLot · SaleEvent) · mkt-stage-t.md 「결정 #308·#311 대응」 §3 판매 지점 표.
//
// 이 파일은 순수 함수만 둔다 — GameState를 읽지 않고 상태 그릇(`commerce.lots` · `commerce.saleEvents`, v16)도 만들지 않는다.
// 그릇·마이그레이션·틱 연결은 F2 코어 계약(#477) 뒤 ARCH 주도 F3 PR에서 넣는다(MKT 커밋으로 합류). 그때까지 출력 불변.
// 타입 이름은 ARCH가 이 초안 그대로 쓰기로 했다(2026-11-13): cellar_door는 kind · eligibleAtBottling(로트)·eligibleAtSale(거래 시점) 둘 다 저장.
//
// 판매 지점(출고가 일어나는 자리 — 사건은 그 자리에서 쌓고, 9단계 updateProgress가 그 달 사건을 읽는다):
//   1 market.ts runSales 국내 소매(정상 + 초과 채널)   kind domestic · cash · p.price
//   2 market.ts 지정면세점(제주)                        kind dutyfree · cash · p.price
//   3 market.ts + sales.ts 수출(수입사)                  kind export · receivable(지급 기한 > 0) 아니면 cash · exportFob
//   4 deals.ts fulfillRetail 대형 유통 납품              kind domestic · channel retail_deal · receivable(2개월) · p.price × priceFactor
//   5 events.ts exportOrder 이벤트 「수출 주문」          kind export · channel event · cash · p.price × priceFactor (#321 새 캠페인 잠금)
//   6 handfill.ts runHandfill 핸드필                    kind cellar_door · cash · handfillPrice — 통 하나로 된 로트(#318)
// 승리 대상이 아닌 출고(기록만 또는 제외 — F3에서 ARCH 확인): 원액·통 B2B(kind b2b) · 기프트 샵 뉴메이크(기록 없음)

/** 판매 사건 종류 — #308 §2.2 거래 종류. `b2b`는 병입 로트가 아니라 승리 대상이 아니다 */
export type SaleKind = 'domestic' | 'dutyfree' | 'export' | 'b2b' | 'cellar_door';
/** 같은 종류 안의 채널 구분(표시·진단용 — 승리 판정은 kind만 본다) */
export type SaleChannel = 'retail' | 'overflow' | 'retail_deal' | 'event';
/** 대가 확정 방식 — 현금 또는 정상 확정 매출채권. 선수금만 받은 것은 사건이 아니다(§2.2) */
export type Settlement = 'cash' | 'receivable';

/**
 * 병입 로트 — 제품(SKU) 안에서 "언제 병입한 병"인지. 병입·보충(#186)마다 하나씩 생기고, 판매는 FIFO로 빠져나간다.
 * `components`(F2 ComponentLedger)는 여기 두지 않는다 — 적격성은 F4 `campaignEligibility`가 계보로 판정하고 결과만 `eligibleAtBottling`에 남는다.
 */
export interface BottledLot {
  id: string;
  productId: string;
  /** 남은 병 — 판매로 줄고 0이 되면 지운다 */
  bottles: number;
  bottledMonth: number;
  /** 병입 때 적격 판정(F4). 없으면 아직 판정 전(옛 세이브 origin unknown → false로 읽는다, 창작하지 않는다) */
  eligibleAtBottling?: boolean;
}

/** 판매 사건 — 로트 하나에서 나간 병 묶음 하나. 한 거래가 로트 둘에 걸치면 사건 둘 */
export interface SaleEvent {
  month: number;
  productId: string;
  lotId: string;
  bottles: number;
  /** 병당 대가(세전 출고가 기준 — 수출은 FOB, 납품은 출고가 × 비율, 핸드필은 handfillPrice) */
  unitPrice: number;
  settlement: Settlement;
  kind: SaleKind;
  channel?: SaleChannel;
  /** 거래 시점의 출고 로트 적격성(#308 — 거래 시점에 고정) */
  eligibleAtSale: boolean;
}

export interface SaleMeta {
  kind: SaleKind;
  settlement: Settlement;
  unitPrice: number;
  channel?: SaleChannel;
}

/** 로트를 FIFO 순으로 — 병입 달이 이른 것부터, 같은 달이면 들어온 순서 그대로(안정 정렬) */
export const fifoOrder = (lots: readonly BottledLot[]): BottledLot[] => [...lots].sort((a, b) => a.bottledMonth - b.bottledMonth);

export interface FifoTake { lotId: string; bottles: number }

/**
 * FIFO 할당 — 요청한 병 수를 가장 오래된 로트부터 뺀다. 로트는 바꾸지 않고 새 배열을 돌려준다(0이 된 로트는 지운다).
 * `short`는 로트 합이 모자라 못 뺀 병 수 — 호출부(판매 지점)가 `p.stockBottles`로 이미 상한을 잡으므로 정상이면 0이다.
 * 양의 대가가 아닌 출고(무료 샘플·폐기·이동)는 이 함수를 쓰되 사건은 만들지 않는다(recordSale을 부르지 않는다)
 */
export function allocateFifo(lots: readonly BottledLot[], bottles: number): { takes: FifoTake[]; lots: BottledLot[]; short: number } {
  const takes: FifoTake[] = [];
  let left = Math.max(0, Math.floor(bottles));
  const next: BottledLot[] = [];
  for (const lot of fifoOrder(lots)) {
    if (left <= 0 || lot.bottles <= 0) { if (lot.bottles > 0) next.push(lot); continue; }
    const take = Math.min(lot.bottles, left);
    takes.push({ lotId: lot.id, bottles: take });
    left -= take;
    if (lot.bottles - take > 0) next.push({ ...lot, bottles: lot.bottles - take });
  }
  return { takes, lots: next, short: left };
}

/**
 * 유상 출하 기록 — FIFO로 뺀 로트마다 사건 하나. `eligibleOf`가 없으면 로트의 `eligibleAtBottling`(F4가 채움)을 쓴다.
 * 승리 판정(F4 `progress.win`)은 돌려준 사건 중 `eligibleAtSale && bottles > 0 && unitPrice > 0`인 첫 사건을 쓴다 — 이 함수는 판정하지 않는다
 */
export function recordSale(
  lots: readonly BottledLot[],
  month: number,
  productId: string,
  bottles: number,
  meta: SaleMeta,
  eligibleOf: (lot: BottledLot) => boolean = (lot) => lot.eligibleAtBottling === true,
): { events: SaleEvent[]; lots: BottledLot[]; short: number } {
  if (!(meta.unitPrice > 0)) return { events: [], lots: [...lots], short: 0 }; // 양의 대가가 아니면 사건이 아니다(§2.2) — 재고도 건드리지 않는다
  const byId = new Map(lots.map((l) => [l.id, l]));
  const r = allocateFifo(lots, bottles);
  const events: SaleEvent[] = r.takes.map((t) => ({
    month, productId, lotId: t.lotId, bottles: t.bottles, unitPrice: meta.unitPrice, settlement: meta.settlement, kind: meta.kind,
    ...(meta.channel ? { channel: meta.channel } : {}),
    eligibleAtSale: eligibleOf(byId.get(t.lotId)!),
  }));
  return { events, lots: r.lots, short: r.short };
}

/** 승리 후보 사건 — 적격 로트의 양의 대가 실물 출고(§2.2). `b2b`는 병입 로트가 아니므로 제외. 가장 이른 달, 같은 달이면 먼저 쌓인 것 */
export function firstEligibleSale(events: readonly SaleEvent[]): SaleEvent | undefined {
  let best: SaleEvent | undefined;
  for (const e of events) {
    if (!e.eligibleAtSale || e.kind === 'b2b' || e.bottles <= 0 || !(e.unitPrice > 0)) continue;
    if (!best || e.month < best.month) best = e;
  }
  return best;
}

/**
 * 로트 id — 전역 `nid`가 아니라 **제품 안 순번**(ARCH F3 합의 2026-11-13): `${productId}:${bottledMonth}:${n}`.
 * 전역 카운터를 쓰지 않으므로 로트를 만들어도 `s.nextId`가 움직이지 않고, 다른 제품 id·판매 잡음 흐름(`sales:<id>`)이 바뀌지 않는다(출력 불변).
 * n은 같은 제품·같은 달의 몇 번째 로트인지(0부터) — 호출부가 그 제품의 기존 로트에서 센다(`nextLotIndex`)
 */
export const lotId = (productId: string, bottledMonth: number, n: number): string => `${productId}:${bottledMonth}:${n}`;
/** 같은 제품·같은 달에 이미 있는 로트 수 — 다음 로트의 n */
export const nextLotIndex = (lots: readonly BottledLot[], productId: string, bottledMonth: number): number =>
  lots.filter((l) => l.productId === productId && l.bottledMonth === bottledMonth).length;

/** 새 병입 로트 — 병입·보충이 부른다. id는 `lotId(productId, bottledMonth, nextLotIndex(...))`로(이 파일은 상태를 읽지 않는다) */
export const newLot = (id: string, productId: string, bottles: number, bottledMonth: number, eligibleAtBottling?: boolean): BottledLot =>
  ({ id, productId, bottles, bottledMonth, ...(eligibleAtBottling == null ? {} : { eligibleAtBottling }) });
