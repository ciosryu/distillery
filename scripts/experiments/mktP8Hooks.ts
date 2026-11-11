// P8(mvp-human.ts, MGT) 위에 얹는 MKT 손잡이 — mkt-p8v.ts가 P8 원본에 끼워 부른다. 게임 규칙은 바꾸지 않는다 (docs/design/mkt-stage-t.md 「요구사항」)
//   price: 'suggest'  병입·재고 보충 때 그 제품 값을 지금 권장가로 (자동 가격을 끈 사람이 하는 최소한 — MKT-B "결함 수정판")
//   price: 'heur'     'suggest' + 분기마다 재고 개월(재고 ÷ 최근 3개월 국내+수출 판매)로 ±5%: 6개월치 넘게 쌓이면 내리고 1.5개월치 밑이면 올린다(권장가 × 0.8~1.5)
//   spot: { from, until, share }  그 기간 몰트 탱크 원액의 share만큼을 현물로 판다(원액 B2B 제한 매각 — MKT-D)
//   SNAP=<달> 이면 그 달 국내 진열의 SKU 분해(단독 수요 합·CES 총수요·최대 단독 수요)를 모아 끝에 표로 낸다(MKT-A)
import { applyAction, demandFor, skuSplit, type Action, type GameState, type Product } from '../../src/sim';
import { SKU } from '../../src/sim/content/market';
import { currentSuggested } from '../../src/sim/economics';
import { calendar } from '../../src/sim/util';

export interface MktPolicy { name: string; autoPrice?: boolean; price?: 'suggest' | 'heur'; spot?: { from: number; until: number; share: number } }

const act = (s: GameState, a: Action) => { const r = applyAction(s, a); return r.error ? s : r.state; };
const reprice = (s: GameState, p: Product, factor = 1) => act(s, { type: 'setPrice', productId: p.id, price: Math.round(currentSuggested(s, p) * factor) });

/** 병입 직후(P8 bottleAs) — 자동 가격을 끈 정책에서만 */
export function afterBottle(s: GameState, p: MktPolicy, opts: { name: string; restockId?: string }): GameState {
  if (p.autoPrice || !p.price) return s;
  const prod = opts.restockId ? s.commerce.products.find((x) => x.id === opts.restockId) : [...s.commerce.products].reverse().find((x) => x.name === opts.name);
  return prod ? reprice(s, prod) : s;
}

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
  if (p.spot && m >= p.spot.from && m < p.spot.until) {
    for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt' && l.volumeL > 1)) s = act(s, { type: 'sellBulk', source: 'lot', id: lot.id, liters: Math.floor(lot.volumeL * p.spot.share) });
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
  return s;
}

/** 끝에 — SNAP 분해 표 */
export function report(): void {
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
