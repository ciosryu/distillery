// [결정 #441] ① D 「원액 소화」 죽은 띠 측정 (MKT · 읽기 실험 — 게임 규칙 아님). 10차 70 · 153개월 세이브에서 국내 제품 모두 D(기본 12개월)로 켜고 N개월:
// 값 바뀜(재고 있는 제품-달 가운데 값이 바뀐 달) · 국내 판매 · 공헌 · 품절로 못 판 병(T8 stockoutDemand 합 + 판매 중 모자란 수요). 죽은 띠 앞뒤를 같은 스크립트로 잰다
// 쓰는 법: npx tsx scripts/experiments/mkt-drain-band.ts [개월=24]
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../../src/store/playlog';
import { applyAction, type GameState } from '../../src/sim';
import { advanceMonth } from '../../src/sim/step';
import { bottleMargin } from '../../src/sim/market';
import { outboundLogistics } from '../../src/sim/sites';

const N = Number(process.argv[2] ?? 24);
for (const [label, f] of [['70개월', 'distillery-mvp-standard-y6m11-202611261003.json'], ['153개월', 'distillery-mvp-standard-y13m10-202611270816.json']] as const) {
  const r = parsePlayFile(readFileSync(`docs/playtest/10/${f}`, 'utf8')); if ('error' in r) throw new Error(r.error);
  let s: GameState = r.save;
  const ids = s.commerce.products.filter((p) => !p.dutyFreeOnly).map((p) => p.id);
  for (const id of ids) s = applyAction(s, { type: 'setPricePolicy', productId: id, mode: 'drain' }).state;
  let stocked = 0, changed = 0, bottles = 0, con = 0, lost = 0;
  for (let m = 0; m < N; m++) {
    const before = new Map(s.commerce.products.map((p) => [p.id, p.price]));
    s = advanceMonth(s);
    const rep = s.history.reports.at(-1)!;
    for (const id of ids) {
      const p = s.commerce.products.find((x) => x.id === id); if (!p) continue;
      const x = rep.sales.filter((y) => y.productId === id);
      const b = x.reduce((t, y) => t + y.bottles, 0), rev = x.reduce((t, y) => t + y.revenue, 0);
      lost += x.reduce((t, y) => t + Math.max(0, Math.round(y.demandBottles) - y.bottles), 0) + (rep.stockoutDemand?.find((y) => y.productId === id)?.bottles ?? 0);
      bottles += b; con += b > 0 ? rev - b * (p.price - bottleMargin(p, outboundLogistics(s)).perBottle) : 0;
      if (b > 0 || p.stockBottles > 0) { stocked++; if (p.price !== before.get(id)) changed++; }
    }
  }
  console.log(`${label} · 제품 ${ids.length} · ${N}개월 · 모두 D: 값 바뀜 ${changed} / 재고 있는 제품-달 ${stocked} · 국내 판매 ${bottles}병 · 공헌 ${(con / 1e8).toFixed(2)}억 · 못 판 병 ${lost}`);
}
