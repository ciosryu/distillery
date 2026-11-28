// [결정 #438 묶음 ③ · mkt-pricing-postrun.md §6.6 (ㄴ)] 한 화면 가격표 — 셈 (MKT · 화면만)
// 10차 판: 가격을 고친 93달이 199분(전체 268분의 74%). 목표는 손질 횟수가 아니라 한 번에 드는 시간 — 제품 · 병 재고 · 맞는 통 원액 · 지금 값 · 수요 ·
// 다 팔 값(기간 H · 공급 고르기) · 지난 3개월을 한 표에, 바꾼 값의 합(판매 · 매출 · 공헌)을 바로 보이고 한 번에 적용한다.
// **읽기만** — 수요 · 다 팔 값은 아는 품질 상태(`ks` = knownState)로만 센다(I2). 상태 · 규칙 · 봇 출력 그대로
import { bottleMargin, domesticDemands, restockedDemand, type GameState } from '../sim';
import { currentSuggested } from '../sim/economics';
import { sellOutPrice } from '../sim/market';
import { drainBounds, matchingCaskBottles } from '../sim/pricePolicy';
import { outboundLogistics } from '../sim/sites';

/** 다 팔 값의 기간 — 제품을 몇 개월 동안 팔 것인가 */
export const PRICE_TABLE_HORIZONS = [6, 12, 24, 36] as const;
export type SupplyMode = 'bottles' | 'withCasks';

export interface PriceRow {
  id: string;
  name: string;
  /** 숙성 표기(년) — 없으면 null */
  ageYears: number | null;
  autoPrice: boolean;
  autoRestock: boolean;
  stock: number;
  /** 「맞는 원액」을 병으로 — 자동 납품 후보와 같은 통 · 탱크(자동 납품을 켜지 않아도), 같은 원액을 쓰는 진열 제품 수로 나눔. 정책 D와 같은 셈(`matchingCaskBottles` · [결정 #441]) */
  caskBottles: number;
  price: number;
  /** 고치는 중인 값(없으면 지금 값) */
  draft: number;
  suggested: number;
  /** 이번 달 국내 수요(병) — 고치는 값들을 모두 넣은 진열로(같은 범주 나눔). 병 재고 0이면 「다시 채웠다면」 수요(`restockedDemand` — 품절 배지와 같은 셈) */
  demand: number;
  /** demand가 「다시 채웠다면」 수요인가(병 재고 0) */
  restocked: boolean;
  /** 지금 값들의 진열에서 이번 달 국내 수요(병) */
  demandNow: number;
  /**
   * 다 팔 값 — 이 기간 · 공급이 국내에서 팔리는 값을 **양쪽으로** 찾는다(정책 D와 같은 셈 · 같은 범위 [이익 나는 바닥, 기준가 × 4] · 다른 제품은 고친 값).
   * 공급이 0이거나 찾을 범위가 없으면 null
   */
  sellThrough: number | null;
  /** 다 팔 값이 범위 끝에 닿았나 — 'cap' 상한에서도 다 팔린다 · 'floor' 바닥 값에서도 남는다 */
  edge: 'cap' | 'floor' | null;
  /** edge가 'floor'일 때 — 바닥 값이면 공급이 몇 개월 가나(계절 없는 어림). 아니면 null */
  coverMonths: number | null;
  /** 다 팔 값이 지금 값의 ±5% 안이다 */
  nearNow: boolean;
  /** 지난 3개월(오래된 것부터) — 판매 병 · 판매 값 */
  last3: { month: number; sold: number; price: number | null }[];
  /** [P-MKT-52] 지난달 판매 전 재고 0이라 못 판 수요(T8 `stockoutDemand`) */
  stockoutLast: number | null;
}

const withStock = (st: GameState, id: string, bottles: number): GameState =>
  ({ ...st, commerce: { ...st.commerce, products: st.commerce.products.map((p) => (p.id === id ? { ...p, stockBottles: bottles } : p)) } });

const withPrices = (ks: GameState, drafts: Readonly<Record<string, number>>): GameState =>
  ({ ...ks, commerce: { ...ks.commerce, products: ks.commerce.products.map((p) => (drafts[p.id] != null && drafts[p.id] !== p.price ? { ...p, price: drafts[p.id]! } : p)) } });

/** 표의 줄 — 면세 전용 한정판은 뺀다(값 · 채널이 따로). s는 참 상태(재고 · 통 원액 수량 · 결산), ks는 knownState(s) */
export function priceTableRows(s: GameState, ks: GameState, monthOfYear: number, drafts: Readonly<Record<string, number>>, horizon: number, supply: SupplyMode): PriceRow[] {
  const now = domesticDemands(ks, monthOfYear);
  const draftState = withPrices(ks, drafts);
  const after = Object.keys(drafts).length ? domesticDemands(draftState, monthOfYear) : now;
  const reports = s.history.reports;
  const lastR = reports.at(-1);
  return s.commerce.products.filter((p) => !p.dutyFreeOnly).map((p) => {
    const kp = ks.commerce.products.find((x) => x.id === p.id) ?? p;
    const caskBottles = matchingCaskBottles(s, p);
    const sup = p.stockBottles + (supply === 'withCasks' ? caskBottles : 0);
    // 병 재고 0인데 맞는 원액을 공급으로 보면 — 그만큼 병입했다고 보고 센다(다 팔 값 셈은 진열에 재고가 있어야 돈다).
    // 양쪽으로 찾으니 이 제품의 지금 값 · 고친 값과 무관하다 — 「이 값으로」를 눌러도 값이 그대로 남는다
    const stState = p.stockBottles <= 0 && sup > 0 ? withStock(draftState, p.id, sup) : draftState;
    const b = drainBounds(ks, kp);
    const r = sup > 0 && b ? sellOutPrice(stState, p.id, monthOfYear, horizon, sup, b.lo, b.hi) : null;
    const sellThrough = r?.price ?? null;
    const edge = r?.at ?? null;
    const restocked = p.stockBottles <= 0;
    const ownAt = (st: GameState, price: number) => { const q = { ...st.commerce.products.find((x) => x.id === p.id)!, price }; const t = { ...st, commerce: { ...st.commerce, products: st.commerce.products.map((x) => (x.id === p.id ? q : x)) } }; return domesticDemands(t, monthOfYear).get(p.id)?.demandBottles ?? 0; };
    const nearNow = sellThrough != null && p.price > 0 && Math.abs(sellThrough - p.price) <= p.price * 0.05;
    const coverMonths = edge === 'floor' && sellThrough != null ? (() => { const d = ownAt(stState, sellThrough); return d > 0 ? sup / d : Infinity; })() : null;
    const kd = draftState.commerce.products.find((x) => x.id === p.id) ?? kp;
    const demand = restocked ? restockedDemand(draftState, kd, monthOfYear).demandBottles : after.get(p.id)?.demandBottles ?? 0;
    const demandNow = restocked ? restockedDemand(ks, kp, monthOfYear).demandBottles : now.get(p.id)?.demandBottles ?? 0;
    const last3 = reports.slice(-3).map((r) => { const x = r.sales.find((y) => y.productId === p.id); return { month: r.month, sold: x?.bottles ?? 0, price: x && x.bottles > 0 ? Math.round(x.revenue / x.bottles) : null }; });
    const so = lastR?.stockoutDemand?.find((x) => x.productId === p.id)?.bottles ?? null;
    return {
      id: p.id, name: p.name, ageYears: p.ageYears ?? null, autoPrice: !!p.autoPrice, autoRestock: !!p.autoRestock,
      stock: p.stockBottles, caskBottles, price: p.price, draft: drafts[p.id] ?? p.price, suggested: currentSuggested(ks, kp),
      demand, restocked, demandNow, sellThrough, edge, coverMonths, nearNow, last3, stockoutLast: so,
    };
  });
}

export interface Totals { bottles: number; revenue: number; contribution: number }
/** 이번 달 국내 판매 · 매출 · 공헌 합(어림 — 판매 = min(재고, 수요), 소매 처리 역량 · 잡음 · 면세 · 수출은 넣지 않는다). drafts가 비면 지금 값 */
export function priceTableTotals(s: GameState, ks: GameState, monthOfYear: number, drafts: Readonly<Record<string, number>>): Totals {
  const st = withPrices(ks, drafts);
  const d = domesticDemands(st, monthOfYear);
  const logistics = outboundLogistics(s);
  let bottles = 0, revenue = 0, contribution = 0;
  for (const p of st.commerce.products) {
    if (p.dutyFreeOnly || p.stockBottles <= 0) continue;
    const sell = Math.min(p.stockBottles, Math.round(d.get(p.id)?.demandBottles ?? 0));
    bottles += sell; revenue += sell * p.price; contribution += sell * bottleMargin(p, logistics).perBottle;
  }
  return { bottles, revenue, contribution };
}
