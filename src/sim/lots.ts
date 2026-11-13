// 병입 로트 상태 입구 (코어 ARCH — F3 [결정 #308·#318], architecture §10.10 · core-integration §3).
// 그릇은 `commerce.lots?`(남은 병이 있는 로트만) · 그달 사건은 `MonthReport.saleEvents?`. 순수 함수 몫(FIFO·사건 생성)은 MKT `saleEvents.ts`에 있고,
// 여기는 상태를 읽고 쓰는 세 입구만 둔다. 기록만 — 판 결과·RNG를 바꾸지 않는다(출력 불변).
//   병입·보충(PROD 지점 — `executeBlend` · `restockedProduct` · `economics.ts` 자동 납품) → `addLot`
//   유상 출고(판매 지점 1~6 — market.ts ×3 · deals.ts · events.ts · handfill.ts) → `sellFromLots`
//   제품이 사라질 때(단종 `actions.prod.ts` · 수명 정리 `lifecycle.ts`) → `dropLots`
// 로트가 없는 제품(옛 세이브·연결 전)은 사건을 만들지 않는다 — 존재하지 않는 유상 출하 증거를 창작하지 않는다(core-integration §3 Migration)
import { lotId, newLot, nextLotIndex, recordSale, type SaleMeta } from './saleEvents';
import type { BottledLot, GameState, LedgerEntry, MonthReport, SaleEvent } from './types';

export type { SaleMeta };

/** 모든 병입 로트 — 없으면 빈 배열(그릇을 만들지 않는다) */
export const lotsOf = (s: GameState): readonly BottledLot[] => s.commerce.lots ?? [];
/** 한 제품의 로트 — 들어온 순서 그대로(FIFO 정렬은 saleEvents.ts가 한다) */
export const productLots = (s: GameState, productId: string): BottledLot[] => lotsOf(s).filter((l) => l.productId === productId);
/** 한 제품의 로트 병 합 — 불변식(= `stockBottles`, 연결이 끝나면)·화면용 */
export const lotBottles = (s: GameState, productId: string): number => productLots(s, productId).reduce((t, l) => t + l.bottles, 0);

/**
 * 새 병입 로트 — 병입·보충이 부른다. id는 제품 안 순번(`lotId`)이라 전역 `nextId`를 움직이지 않는다.
 * `bottles`는 정수(병)로 내린다 · 0 이하면 만들지 않는다. `components`는 병입이 `splitLedger`로 떼어 낸 원장을 그대로(평균 안 냄, F2 지점 17·18)
 */
export function addLot(
  s: GameState,
  productId: string,
  bottles: number,
  opts: { components?: LedgerEntry[]; eligibleAtBottling?: boolean; month?: number } = {},
): BottledLot | undefined {
  const n = Math.floor(bottles);
  if (!(n > 0)) return undefined;
  const month = opts.month ?? s.month;
  const lots = s.commerce.lots ?? (s.commerce.lots = []);
  const lot = newLot(lotId(productId, month, nextLotIndex(lots, productId, month)), productId, n, month, opts.eligibleAtBottling);
  if (opts.components) lot.components = opts.components;
  lots.push(lot);
  return lot;
}

/**
 * 유상 출고 — 제품의 로트에서 FIFO로 빼고, 로트마다 사건 하나를 `report.saleEvents`에 쌓는다(출고가 일어난 그 자리에서 — MKT 판매 지점 표).
 * 돌려주는 값은 이번 호출로 생긴 사건. 로트가 없는 제품이면 아무것도 하지 않는다(옛 세이브·연결 전). 양의 대가가 아니면 사건도 차감도 없다(§2.2).
 * `p.stockBottles` 차감은 호출부가 지금처럼 한다 — 이 함수는 로트와 사건만 만진다
 */
export function sellFromLots(s: GameState, report: MonthReport, productId: string, bottles: number, meta: SaleMeta): SaleEvent[] {
  const mine = productLots(s, productId);
  if (!mine.length) return [];
  const r = recordSale(mine, report.month, productId, bottles, meta);
  if (!r.events.length) return [];
  const left = new Map(r.lots.map((l) => [l.id, l]));
  // 다른 제품의 로트와 들어온 순서는 그대로, 이 제품의 로트만 남은 것으로 바꾼다(0이 된 로트는 사라진다)
  s.commerce.lots = lotsOf(s).flatMap((l) => (l.productId !== productId ? [l] : left.has(l.id) ? [left.get(l.id)!] : []));
  (report.saleEvents ??= []).push(...r.events);
  return r.events;
}

/** 제품이 사라질 때(단종·수명 정리) 그 로트도 지운다 — 없는 제품의 로트는 불변식 오류다 */
export function dropLots(s: GameState, productId: string): void {
  if (!s.commerce.lots) return;
  s.commerce.lots = s.commerce.lots.filter((l) => l.productId !== productId);
}
