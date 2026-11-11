// P8(mvp-human.ts, MGT) 위에 얹는 MKT 손잡이 — mkt-p8v.ts가 P8 원본에 끼워 부른다. 게임 규칙은 바꾸지 않는다 (docs/design/mkt-stage-t.md 「요구사항」)
//   price: 'suggest'  병입·재고 보충 때 그 제품 값을 지금 권장가로 (자동 가격을 끈 사람이 하는 최소한 — MKT-B "결함 수정판")
//   price: 'heur'     'suggest' + 분기마다 재고 개월(재고 ÷ 최근 3개월 국내+수출 판매)로 ±5%: 6개월치 넘게 쌓이면 내리고 1.5개월치 밑이면 올린다(권장가 × 0.8~1.5)
//   price: 'markup'   병입·보충·분기마다 권장가 × markup(기본 1.3)
//   clear: { above, min }  ('markup'과 같이) 재고 소진 스위치 — ARCH §10.8 `clearAboveMonths`(P-MKT-28 ⓒ). 매달 재고 개월(재고 ÷ 판매 EMA — retail.overhangFactor와 같은 잣대)이
//                     above를 넘으면 자동 가격 후보 사다리(AUTO_PRICE_FACTORS)에서 한 단계 내린다(권장가 × min 아래로는 안 내림). 적체 중에는 분기 재설정(markup)을 건너뛴다 — 오르내림 방지
//                     step을 주면 사다리 대신 기준가 배수에서 step씩 내린다(목표가의 일정 비율 — 예: 목표 ×1.3, step 0.13, min 1.04 = 목표의 10%씩·80%까지)
//   AUTO-PRICE-3 (#288, AP3-MKT-1 — mkt-stage-t.md 「AUTO-PRICE-3」 절). 배수는 모두 기준가(suggestedPrice 그대로) 대비 한 가지 뜻:
//   price: 'turnover' A 현금회전 — 목표 배수 anchor(기본 1.3)를 지키되 재고 개월(재고 ÷ 판매 EMA)이 band[1](기본 6)을 넘거나 현금 위기(현금 < 지난달 비용 × 2)면
//                     매달 step(기본 0.1)씩 내린다(하한 = anchor × floor(기본 0.8), 병당 공헌 > 0). band[0](기본 2) 밑이면 곧바로 anchor로(공급 부족에 할인 안 함), 그 사이는 유지
//   price: 'profit2'  B′ 다기간 이익 — 후보 격자(기준가 × 0.6~2)마다 h개월(기본 6) 누적 공헌 = min(재고 + 판매 EMA × h, 월 수요 × h) × 병당 공헌 + 형제 공헌 변화 × h 가 최대인 값(매달). B는 자동 가격(#200) 그대로
//   price: 'premium'  C 프리미엄 — anchor(기본 1.5) 유지, 병입·보충·분기마다 맞춘다. 분기에 적체(재고 개월 > band[1], 기본 9)면 한 단계만 내림(하한 anchor × floor, 기본 0.9).
//                     국내 판매 0이 3개월 이어지면 하한을 anchor × 0.8까지 낮춰 한 단계 허용(판매 0 고착 방지)
//   guard: <배수>  ('profit2'와 같이) 한 달에 기준가 배수 ±guard까지만 움직인다(예: 0.1 = 한 단계) — B′ + 가드(결정 대기 66, AP3 2차)
//   switchA: true  ('profit2'와 같이) 현금 < 월 비용 × 3이면 A(이번 달 공헌 최대)로, > × 6이면 B′로 — 위기 배너 전환 규칙 검증(MGT COUNTER)
//   raise: true  (A와 같이) 재고 개월 < band[0]이면 목표 위로도 한 단계씩 올린다(최대 ×2) — A2: 재고 개월 목표를 양쪽으로 따라감
//   AP3=1 이면 정책별 지표 표(국내·수출 매출·병, 미충족 국내 수요, 재고 개월, 품절 제품·달, 평균 배수·가격 변동성)를 낸다
//   price: 'table'    분기마다 판매 화면 가격표(priceOptions — 플레이어에게 보이는 값)의 최선 값(economics.bestAutoPrice와 같은 기준)을 손으로 고른다 — 자동 가격을 분기 1번 손으로 하는 것
//   spot: { from, until, share }  그 기간 몰트 탱크 원액의 share만큼을 현물로 판다(원액 B2B 제한 매각 — MKT-D)
//   DIAG=1 이면 24~96개월 매달 위스키 진열의 CES 총수요 배수·재고 적체 배수(retail.overhangFactor)·재고 있는 제품 수 평균을 낸다(MKT-A 원인 나누기)
//   SKUCOST=<원> 이면 매달 재고 있는 제품 1개당 그만큼 현금을 뺀다(면세 한정판 제외) — SKU 운영비 안 P-MKT-25 (d)를 잰다(게임 규칙이 아니라 실험 안에서만)
//   PERSEED=1 이면 정책·시드별 마지막 순자산(파산이면 그 달)과 하위 3시드 평균을 낸다(G04-MKT-1 — 운 나쁜 판에서도 이기나)
//   CONTRACTS=1 이면 수출 계약이 연 최소 물량 미달로 끝난 횟수·그 시장에 낸 현지 분담 합을 정책별로 센다(G07-MKT-1)
//   SNAP=<달> 이면 그 달(병입 뒤) 국내 진열의 SKU 분해(단독 수요 합·CES 총수요·최대 단독 수요)를 모아 끝에 표로 낸다(MKT-A)
import { applyAction, demandFor, skuSplit, type Action, type GameState, type Product } from '../../src/sim';
import { SKU } from '../../src/sim/content/market';
import { AUTO_PRICE_FACTORS, bestAutoPrice, currentSuggested } from '../../src/sim/economics';
import { calendar } from '../../src/sim/util';
import { overhangFactor } from '../../src/sim/retail';
import { bottleMargin, priceOptions } from '../../src/sim/market';
import { outboundLogistics } from '../../src/sim/sites';
import { netWorth } from '../../src/sim/progress';

export interface MktPolicy { name: string; autoPrice?: boolean; price?: 'suggest' | 'heur' | 'markup' | 'table' | 'turnover' | 'profit2' | 'premium'; markup?: number; clear?: { above: number; min: number; step?: number }; anchor?: number; band?: [number, number]; step?: number; floor?: number; horizon?: number; raise?: boolean; guard?: number; switchA?: boolean; spot?: { from: number; until: number; share: number } }

const act = (s: GameState, a: Action) => { const r = applyAction(s, a); return r.error ? s : r.state; };
const reprice = (s: GameState, p: Product, factor = 1) => act(s, { type: 'setPrice', productId: p.id, price: Math.round(currentSuggested(s, p) * factor) });

/** 병입 직후(P8 bottleAs) — 자동 가격을 끈 정책에서만 */
export function afterBottle(s: GameState, p: MktPolicy, opts: { name: string; restockId?: string }): GameState {
  if (p.autoPrice || !p.price) return s;
  const prod = opts.restockId ? s.commerce.products.find((x) => x.id === opts.restockId) : [...s.commerce.products].reverse().find((x) => x.name === opts.name);
  if (!prod) return s;
  if (p.price === 'table') { const best = bestAutoPrice(s, prod); return best ? act(s, { type: 'setPrice', productId: prod.id, price: best }) : reprice(s, prod); }
  if (p.price === 'turnover' || p.price === 'premium') return reprice(s, prod, anchorOf(p));
  if (p.price === 'profit2') {
    let v = bestMultiPeriod(s, prod, p);
    // 보충(restock)이면 가드를 지킨다 — 새 제품의 첫 값만 가드 없이
    const sug = currentSuggested(s, prod);
    if (v && p.guard && opts.restockId) { const g = guardBase(p, s, prod, prod.price / sug); v = Math.round(Math.min(sug * (g + p.guard), Math.max(sug * (g - p.guard), v))); }
    if (v && sug > 0) lastFactor[`${p.name}:${s.seed}:${prod.id}`] = v / sug;
    return v ? act(s, { type: 'setPrice', productId: prod.id, price: v }) : reprice(s, prod, 1.3);
  }
  return reprice(s, prod, p.price === 'markup' ? p.markup ?? 1.3 : 1);
}

// ── AUTO-PRICE-3 정책 ──
const anchorOf = (p: MktPolicy) => p.anchor ?? (p.price === 'premium' ? 1.5 : 1.3);
const monthlyCost = (s: GameState) => Object.values(s.history.reports.at(-1)?.expenses ?? {}).reduce((a, b) => a + (b ?? 0), 0);
/** 병당 공헌 > 0인 값만 — 원가 아래로 내리지 않는다 */
const profitable = (s: GameState, prod: Product, price: number) => bottleMargin({ ...prod, price }, outboundLogistics(s)).perBottle > 0;
/** B′ — 후보 격자마다 h개월 누적 공헌(재고 한도) + 형제 공헌 변화 × h */
function bestMultiPeriod(s: GameState, prod: Product, p: MktPolicy): number | null {
  if (prod.dutyFreeOnly || prod.stockBottles <= 0 || prod.price <= 0) return null;
  const sug = currentSuggested(s, prod);
  if (sug <= 0) return null;
  const h = p.horizon ?? 6;
  const factors = AUTO_PRICE_FACTORS.map((f) => (sug * f) / prod.price);
  const opts = priceOptions(s, prod, calendar(s).monthOfYear, factors);
  let best: { price: number; v: number } | null = null;
  for (const o of opts) {
    const per = bottleMargin({ ...prod, price: o.price }, outboundLogistics(s)).perBottle;
    if (per <= 0) continue;
    // 팔 수 있는 양 = 재고 + h개월 보충(지금 판매 속도로 들어온다고 봄 — 리드타임 근사)
    const v = Math.min(prod.stockBottles + (prod.salesEma ?? 0) * h, o.demandBottles * h) * per + (o.lineupContribution - o.contribution) * h;
    if (!best || v > best.v) best = { price: o.price, v };
  }
  return best?.price ?? null;
}
const zeroRun: Record<string, number> = {};
/** 가드 기준 = 정책이 마지막으로 정한 배수 — P8은 보충할 때 값을 기준가로 되돌리므로(#289) 지금 값을 기준으로 하면 가드가 ×1 근처에 묶인다 */
const lastFactor: Record<string, number> = {};
const guardBase = (p: MktPolicy, s: GameState, prod: Product, f: number) => lastFactor[`${p.name}:${s.seed}:${prod.id}`] ?? f;
/** B′ + 위기 전환(switchA): 현금 < 월 비용 × 3이면 A(이번 달 공헌 최대 = #200 식)로, 현금 > 월 비용 × 6이면 B′로 되돌린다 — MGT COUNTER(#337) 검증용 */
const modeA: Record<string, boolean> = {};
export const switchStats: Record<string, { months: number; aMonths: number; flips: number }> = {};
function ap3Monthly(s: GameState, p: MktPolicy, m: number): GameState {
  const crisis = s.finance.cash < 2 * monthlyCost(s);
  if (p.switchA) {
    const k = `${p.name}:${s.seed}`, cost = monthlyCost(s), was = !!modeA[k];
    if (!was && s.finance.cash < 3 * cost) modeA[k] = true;
    else if (was && s.finance.cash > 6 * cost) modeA[k] = false;
    const st = (switchStats[p.name] ??= { months: 0, aMonths: 0, flips: 0 });
    st.months++; if (modeA[k]) st.aMonths++; if (!!modeA[k] !== was) st.flips++;
  }
  for (const prod of [...s.commerce.products]) {
    if (prod.stockBottles <= 0 || prod.autoPrice || prod.dutyFreeOnly) continue;
    const sug = currentSuggested(s, prod);
    if (sug <= 0) continue;
    const f = prod.price / sug, a = anchorOf(p), months = stockMonths(prod);
    if (p.price === 'turnover') {
      const [lo, hi] = p.band ?? [2, 6];
      if (prod.salesEma != null && months < lo && f < a - 1e-6) { s = reprice(s, prod, a); continue; } // 부족 — 할인 멈추고 목표로
      // A2(raise): 목표 위에서도 부족하면 한 단계씩 올린다(최대 ×2) — 재고 개월 목표를 양쪽으로 따라간다
      if (p.raise && prod.salesEma != null && months < lo) { const up = Math.min(2, f + (p.step ?? 0.1)); if (up > f + 1e-6) s = reprice(s, prod, up); continue; }
      if ((months > hi || (crisis && months > lo)) && prod.salesEma != null) {
        const nf = Math.max(a * (p.floor ?? 0.8), f - (p.step ?? 0.1));
        if (nf < f - 1e-6 && profitable(s, prod, sug * nf)) { s = reprice(s, prod, nf); clears[p.name] = (clears[p.name] ?? 0) + 1; }
      }
      continue;
    }
    if (p.price === 'profit2') {
      if (p.switchA && modeA[`${p.name}:${s.seed}`]) { const b = bestAutoPrice(s, prod); if (b && b !== prod.price) s = act(s, { type: 'setPrice', productId: prod.id, price: b }); if (b) lastFactor[`${p.name}:${s.seed}:${prod.id}`] = b / sug; continue; }
      let v = bestMultiPeriod(s, prod, p);
      // 가드: 한 달에 기준가 배수 ±guard까지만 움직인다(진동 ⑤ · 정책 바꾼 달 한 단계 — REQ-MKT-9 불변식 ④)
      if (v && p.guard) { const g = guardBase(p, s, prod, f); v = Math.round(Math.min(sug * (g + p.guard), Math.max(sug * (g - p.guard), v))); }
      if (v && v !== prod.price && profitable(s, prod, v)) s = act(s, { type: 'setPrice', productId: prod.id, price: v });
      if (v) lastFactor[`${p.name}:${s.seed}:${prod.id}`] = v / sug;
      continue;
    }
    if (p.price === 'premium') {
      const r = s.history.reports.at(-1);
      const sold = r?.sales.filter((x) => x.productId === prod.id).reduce((t, x) => t + x.bottles, 0) ?? 0;
      const k = `${p.name}:${s.seed}:${prod.id}`;
      zeroRun[k] = sold > 0 ? 0 : (zeroRun[k] ?? 0) + 1;
      if (m % 3 !== 0) continue;
      const [, hi] = p.band ?? [2, 9];
      const stuck = (zeroRun[k] ?? 0) >= 3;
      if (months > hi || stuck) {
        const nf = Math.max(a * (stuck ? 0.8 : p.floor ?? 0.9), f - (p.step ?? 0.1));
        if (nf < f - 1e-6 && profitable(s, prod, sug * nf)) { s = reprice(s, prod, nf); clears[p.name] = (clears[p.name] ?? 0) + 1; }
      } else if (Math.abs(f - a) > 1e-6) s = reprice(s, prod, a);
    }
  }
  return s;
}

/** 재고 개월 — retail.overhangFactor와 같은 잣대(재고 ÷ 판매 EMA). EMA가 아직 없으면 0(적체 아님) */
const stockMonths = (p: Product) => (p.salesEma == null ? 0 : p.stockBottles / Math.max(1, p.salesEma));
const overstocked = (p: MktPolicy, prod: Product) => !!p.clear && stockMonths(prod) > p.clear.above;

const soldLast3 = (s: GameState, id: string) => s.history.reports.slice(-3).reduce((t, r) => t + r.sales.filter((x) => x.productId === id).reduce((a, x) => a + x.bottles, 0) + (r.exports ?? []).filter((x) => x.productId === id).reduce((a, x) => a + x.bottles, 0), 0) / 3;

interface Snap { cat: string; n: number; sumStandalone: number; cesTotal: number; maxStandalone: number }
const snaps: Record<string, Snap[]> = {};

/** 매달(P8 play 루프에서 bottle 직전) */
export function monthly(s: GameState, p: MktPolicy, m: number): GameState {
  if (!p.autoPrice && p.price === 'heur' && m > 0 && m % 3 === 0) {
    for (const prod of [...s.commerce.products]) {
      if (prod.stockBottles <= 0 || prod.autoPrice || prod.dutyFreeOnly) continue;
      const sug = currentSuggested(s, prod);
      if (sug <= 0) continue;
      let f = prod.price / sug;
      const months = prod.stockBottles / Math.max(1, soldLast3(s, prod.id));
      if (months > 6) f -= 0.05;
      else if (months < 1.5) f += 0.05;
      s = reprice(s, prod, Math.min(1.5, Math.max(0.8, f)));
    }
  }
  if (!p.autoPrice && (p.price === 'markup' || p.price === 'table') && m > 0 && m % 3 === 0) {
    for (const prod of [...s.commerce.products]) {
      if (prod.stockBottles <= 0 || prod.autoPrice || prod.dutyFreeOnly) continue;
      if (p.price === 'markup') { if (!overstocked(p, prod)) s = reprice(s, prod, p.markup ?? 1.3); continue; }
      const best = bestAutoPrice(s, prod);
      if (best) s = act(s, { type: 'setPrice', productId: prod.id, price: best });
    }
  }
  if (!p.autoPrice && (p.price === 'turnover' || p.price === 'profit2' || p.price === 'premium') && m > 0) s = ap3Monthly(s, p, m);
  // 재고 소진 스위치(clear) — 매달, 적체면 사다리 한 단계 아래로(하한까지)
  if (!p.autoPrice && p.clear) {
    for (const prod of [...s.commerce.products]) {
      if (prod.stockBottles <= 0 || prod.autoPrice || prod.dutyFreeOnly || !overstocked(p, prod)) continue;
      const sug = currentSuggested(s, prod);
      if (sug <= 0) continue;
      const f = prod.price / sug;
      // step이 있으면 기준가 배수에서 step씩(예: 목표 ×1.3의 10% = 0.13), 없으면 자동 가격 후보 사다리 한 칸
      const next = p.clear.step ? f - p.clear.step : [...AUTO_PRICE_FACTORS].reverse().find((x) => x < f - 1e-6) ?? p.clear.min;
      const nf = Math.max(p.clear.min, next);
      if (nf < f - 1e-6) { s = reprice(s, prod, nf); clears[p.name] = (clears[p.name] ?? 0) + 1; }
    }
  }
  if (process.env.SKUCOST) s.finance.cash -= Number(process.env.SKUCOST) * s.commerce.products.filter((x) => x.stockBottles > 0 && !x.dutyFreeOnly).length;
  if (p.spot && m >= p.spot.from && m < p.spot.until) {
    for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt' && l.volumeL > 1)) s = act(s, { type: 'sellBulk', source: 'lot', id: lot.id, liters: Math.floor(lot.volumeL * p.spot.share) });
  }
  return s;
}

const clears: Record<string, number> = {};
const perSeed: Record<string, Record<number, { nw: number; month: number; cash: number }>> = {};
const contracts: Record<string, { games: Set<number>; ended: number; opened: number; seen: Set<string> }> = {};
interface Diag { months: number; ces: number; overhang: number; n: number; overhangHit: number; stockMonths: number }
const diags: Record<string, Diag> = {};

/** 매달 병입·통입 뒤 — SNAP=<달>이면 그 달 국내 진열의 SKU 분해를 기록, DIAG=1이면 위스키 진열 원인 나누기 */
interface Ap3 { games: Set<number>; domRev: number; expRev: number; domBtl: number; expBtl: number; unmet: number; smSum: number; smN: number; stockout: number; fSum: number; fN: number; vol: number; volN: number }
const ap3: Record<string, Ap3> = {};
const lastPrice: Record<string, number> = {};
export function snap(s: GameState, p: MktPolicy, m: number): void {
  if (process.env.AP3 === '1') {
    const a = (ap3[p.name] ??= { games: new Set(), domRev: 0, expRev: 0, domBtl: 0, expBtl: 0, unmet: 0, smSum: 0, smN: 0, stockout: 0, fSum: 0, fN: 0, vol: 0, volN: 0 });
    a.games.add(s.seed);
    const r = s.history.reports.at(-1);
    if (r && r.month === s.month - 1) {
      for (const x of r.sales) { a.domRev += x.revenue; a.domBtl += x.bottles; a.unmet += Math.max(0, Math.round(x.demandBottles) - x.bottles); }
      for (const x of r.exports ?? []) { a.expRev += x.revenue; a.expBtl += x.bottles; }
    }
    if (m >= 24) {
      const ws = s.commerce.products.filter((x) => x.category === 'whisky' && !x.dutyFreeOnly);
      const live = ws.filter((x) => x.stockBottles > 0);
      if (live.length) { a.smSum += live.reduce((t, x) => t + x.stockBottles, 0) / Math.max(1, live.reduce((t, x) => t + (x.salesEma ?? 0), 0)); a.smN++; }
      a.stockout += ws.filter((x) => x.stockBottles <= 0 && (x.salesEma ?? 0) > 0).length;
      for (const x of live) {
        const sug = currentSuggested(s, x);
        if (sug > 0) { a.fSum += x.price / sug; a.fN++; }
        const k = `${p.name}:${s.seed}:${x.id}`;
        if (lastPrice[k]) { a.vol += Math.abs(x.price - lastPrice[k]!) / lastPrice[k]!; a.volN++; }
        lastPrice[k] = x.price;
      }
    }
  }
  if (process.env.PERSEED === '1') ((perSeed[p.name] ??= {})[s.seed] = { nw: netWorth(s), month: s.month, cash: s.finance.cash });
  if (process.env.CONTRACTS === '1') {
    const r = s.history.reports.at(-1);
    const c = (contracts[p.name] ??= { games: new Set(), ended: 0, opened: 0, seen: new Set() });
    c.games.add(s.seed);
    for (const e of s.commerce.exports ?? []) { const k = `${s.seed}:${e.marketId}:${e.openedMonth}`; if (!c.seen.has(k)) { c.seen.add(k); c.opened++; } }
    if (r && r.month === s.month - 1) c.ended += r.notes.filter((n) => n.includes('계약을 끝냈습니다')).length;
  }
  if (process.env.DIAG === '1' && m >= 24 && m < 96) {
    const ws = s.commerce.products.filter((x) => x.category === 'whisky' && x.stockBottles > 0 && !x.dutyFreeOnly);
    if (ws.length) {
      const moy = calendar(s).monthOfYear;
      const litres = ws.map((x) => (demandFor(s, x, 1, moy).demandBottles * x.bottleMl) / 1000);
      const ces = Math.pow(litres.reduce((t, l) => t + (l > 0 ? Math.pow(l, SKU.rho) : 0), 0), 1 / SKU.rho) / Math.max(1e-9, Math.max(...litres));
      const oh = ws.map((x) => overhangFactor(x, s.month));
      const d = (diags[p.name] ??= { months: 0, ces: 0, overhang: 0, n: 0, overhangHit: 0, stockMonths: 0 });
      d.months++; d.ces += ces; d.n += ws.length;
      d.overhang += ws.reduce((t, x, i) => t + oh[i]! * x.stockBottles, 0) / Math.max(1, ws.reduce((t, x) => t + x.stockBottles, 0));
      if (oh.some((f) => f < 1)) d.overhangHit++;
      d.stockMonths += ws.reduce((t, x) => t + x.stockBottles, 0) / Math.max(1, ws.reduce((t, x) => t + (x.salesEma ?? 0), 0));
    }
  }
  const at = Number(process.env.SNAP ?? -1);
  if (m === at) {
    const moy = calendar(s).monthOfYear;
    const byCat = new Map<string, Product[]>();
    for (const x of s.commerce.products.filter((y) => y.stockBottles > 0 && !y.dutyFreeOnly)) byCat.set(x.category, [...(byCat.get(x.category) ?? []), x]);
    for (const [cat, ps] of byCat) {
      const litres = ps.map((x) => (demandFor(s, x, 1, moy).demandBottles * x.bottleMl) / 1000);
      const ces = Math.pow(litres.reduce((t, l) => t + (l > 0 ? Math.pow(l, SKU.rho) : 0), 0), 1 / SKU.rho);
      void skuSplit; // 같은 식(market.ts skuSplit) — 총수요 = (Σ단독^ρ)^(1/ρ)
      (snaps[p.name] ??= []).push({ cat, n: ps.length, sumStandalone: litres.reduce((a, b) => a + b, 0), cesTotal: ces, maxStandalone: Math.max(...litres) });
    }
  }
}

/** 끝에 — SNAP 분해 표 */
export function report(): void {
  if (Object.keys(perSeed).length) {
    const months = Math.max(...Object.values(perSeed).flatMap((x) => Object.values(x).map((y) => y.month)));
    console.log(`\n### 시드별 마지막 순자산 (억, 끝까지 못 간 판은 *그 달) — 하위 3시드 = 순자산 낮은 3판 평균(파산 판 포함)`);
    const names = Object.keys(perSeed);
    const seeds = [...new Set(names.flatMap((n) => Object.keys(perSeed[n]!).map(Number)))].sort((a, b) => a - b);
    console.log(`| 정책 | ${seeds.map((x) => `s${x}`).join(' | ')} | 평균 | 하위 3 평균 |\n|---|${seeds.map(() => '---').join('|')}|---|---|`);
    for (const n of names) {
      const v = seeds.map((x) => perSeed[n]![x]);
      const nw = v.map((x) => (x ? x.nw / 1e8 : NaN));
      const low3 = [...nw].filter(Number.isFinite).sort((a, b) => a - b).slice(0, 3);
      console.log(`| ${n} | ${v.map((x) => (x ? `${(x.nw / 1e8).toFixed(1)}${x.month < months ? `*${x.month}` : ''}` : '—')).join(' | ')} | ${(nw.filter(Number.isFinite).reduce((a, b) => a + b, 0) / nw.filter(Number.isFinite).length).toFixed(2)} | ${(low3.reduce((a, b) => a + b, 0) / low3.length).toFixed(2)} |`);
    }
  }
  if (Object.keys(ap3).length) {
    console.log('\n### AUTO-PRICE-3 지표 (판 평균 — 매출·병은 180개월 누계, 재고 개월·배수·변동성은 24개월부터 위스키) — 억 = 1e8원');
    console.log('| 정책 | 국내 매출 | 수출 매출 | 국내 병 | 수출 병 | 미충족 국내 수요(병) | 재고 개월 | 품절 제품·달 | 평균 배수(기준가 대비) | 월 가격 변동(평균 |Δ|) |\n|---|---|---|---|---|---|---|---|---|---|');
    for (const [n, a] of Object.entries(ap3)) {
      const g = Math.max(1, a.games.size);
      console.log(`| ${n} | ${(a.domRev / g / 1e8).toFixed(2)} | ${(a.expRev / g / 1e8).toFixed(2)} | ${Math.round(a.domBtl / g).toLocaleString()} | ${Math.round(a.expBtl / g).toLocaleString()} | ${Math.round(a.unmet / g).toLocaleString()} | ${(a.smSum / Math.max(1, a.smN)).toFixed(1)} | ${(a.stockout / g).toFixed(1)} | ×${(a.fSum / Math.max(1, a.fN)).toFixed(2)} | ${((a.vol / Math.max(1, a.volN)) * 100).toFixed(1)}% |`);
    }
  }
  if (Object.keys(switchStats).length) {
    console.log('\n### B′ + 위기 전환(switchA) — A로 지낸 달 비율 · 전환 횟수/판');
    console.log('| 정책 | A 달 비율 | 전환/판 |\n|---|---|---|');
    for (const [n, x] of Object.entries(switchStats)) console.log(`| ${n} | ${((x.aMonths / Math.max(1, x.months)) * 100).toFixed(0)}% | ${(x.flips / Math.max(1, Object.keys(perSeed[n] ?? {}).length || 10)).toFixed(1)} |`);
  }
  if (Object.keys(clears).length) {
    const games = (n: string) => Math.max(1, Object.keys(perSeed[n] ?? {}).length || 10);
    console.log('\n### 재고 소진 스위치(clear) — 한 단계 내린 횟수(제품·달, 판 평균 — PERSEED=1일 때 판 수로 나눔)');
    console.log('| 정책 | 내림 횟수/판 |\n|---|---|');
    for (const [n, c] of Object.entries(clears)) console.log(`| ${n} | ${(c / games(n)).toFixed(1)} |`);
  }
  if (Object.keys(contracts).length) {
    console.log('\n### 수출 계약 (G07) — 판 평균: 연 최소 물량 미달로 수입사가 끝낸 횟수(위약금 0·재진입비 0)');
    console.log('| 정책 | 판 수 | 연 계약 수(진출) | 미달 해지 |\n|---|---|---|---|');
    for (const [name, c] of Object.entries(contracts)) console.log(`| ${name} | ${c.games.size} | ${(c.opened / c.games.size).toFixed(1)} | ${(c.ended / c.games.size).toFixed(2)} |`);
  }
  if (Object.keys(diags).length) {
    console.log(`\n### 위스키 진열 원인 나누기 (24~96개월 매달, ρ = ${SKU.rho}, 판·달 평균) — CES 배수 = 총수요 ÷ 최대 단독 수요, 적체 배수 = 재고 가중 overhangFactor(6개월치 넘으면 √(6/개월), 바닥 0.6)`);
    console.log('| 정책 | 관측 달 | 재고 있는 위스키 제품 수 | CES 총수요 배수 | 재고 적체 배수 | 적체에 걸린 달 비율 | 재고 개월(재고 ÷ 판매 EMA) |');
    console.log('|---|---|---|---|---|---|---|');
    for (const [name, d] of Object.entries(diags)) console.log(`| ${name} | ${d.months} | ${(d.n / d.months).toFixed(2)} | ×${(d.ces / d.months).toFixed(3)} | ×${(d.overhang / d.months).toFixed(3)} | ${((d.overhangHit / d.months) * 100).toFixed(0)}% | ${(d.stockMonths / d.months).toFixed(1)} |`);
  }
  if (!Object.keys(snaps).length) return;
  console.log(`\n### SKU 분해 (${process.env.SNAP}개월째 국내 진열, ρ = ${SKU.rho}, 판 평균, L/월) — 총수요 증가 = CES 총수요 ÷ 최대 단독 수요, 재배분 = 그 총수요를 제품끼리 나누는 것`);
  console.log('| 정책 | 주종 | 판 수 | 제품 수 평균 | 단독 수요 합 | CES 총수요 | 최대 단독 | 총수요 증가 배수 |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const [name, list] of Object.entries(snaps)) {
    const cats = [...new Set(list.map((x) => x.cat))];
    for (const cat of cats) {
      const xs = list.filter((x) => x.cat === cat);
      const a = (f: (x: Snap) => number) => xs.reduce((t, x) => t + f(x), 0) / xs.length;
      console.log(`| ${name} | ${cat} | ${xs.length} | ${a((x) => x.n).toFixed(1)} | ${a((x) => x.sumStandalone).toFixed(0)} | ${a((x) => x.cesTotal).toFixed(0)} | ${a((x) => x.maxStandalone).toFixed(0)} | ×${a((x) => x.cesTotal / Math.max(1e-9, x.maxStandalone)).toFixed(2)} |`);
    }
  }
}
