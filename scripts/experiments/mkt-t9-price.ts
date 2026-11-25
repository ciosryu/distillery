// T9 권장가 측정 · T11 캐스크 스트렝스 (MKT, docs/design/mkt-suggested-price.md) — 9차 159개월 세이브를 읽기만 한다. 실행: npx tsx scripts/experiments/mkt-t9-price.ts [제품 id…]
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../../src/store/playlog';
import { migrateSave } from '../../src/sim/migrate';
import { expectedPricePerL, productConsumerPrice, restockedDemand, knownView, markupFactor, appeal } from '../../src/sim/market';
import { currentSuggested, bestAutoPrice } from '../../src/sim/economics';
import { regionOf } from '../../src/sim/content/regions';
import { calendar } from '../../src/sim/util';
const s: any = migrateSave((parsePlayFile(readFileSync('docs/playtest/9/distillery-mvp-standard-y14m4-202611250055.json', 'utf8')) as any).save);
const region = regionOf(s); const moy = calendar(s).monthOfYear;
console.log('month', s.month, 'moy', moy, 'markupFactor', markupFactor(s).toFixed(3));
const k = (n: number) => `${Math.round(n / 1000)}k`;
const ids = process.argv.slice(2);
const pick = s.commerce.products.filter((p: any) => ids.length ? ids.includes(p.id) : /whisky/.test(p.category));
for (const p0 of pick) {
  const kp = knownView(s, p0);
  const sug = currentSuggested(s, p0);
  const E = expectedPricePerL(region, kp) * p0.bottleMl / 1000;
  const at = (price: number) => { const p = { ...p0, price, stockBottles: Math.max(1, p0.stockBottles) }; const t = { ...s, commerce: { ...s.commerce, products: s.commerce.products.map((x: any) => x.id === p0.id ? p : x) } }; const d = restockedDemand(t, p, moy); const c = productConsumerPrice(s, p, region); return { d: d.demandBottles, c, qpr: c / E, pf: d.priceFactor }; };
  const lastSold = s.history.reports.slice(-12).map((r: any) => r.sales.find((x: any) => x.productId === p0.id)).filter(Boolean);
  const avgPrice = lastSold.length ? lastSold.reduce((t: number, x: any) => t + x.revenue, 0) / Math.max(1, lastSold.reduce((t: number, x: any) => t + x.bottles, 0)) : p0.price;
  const sold12 = lastSold.reduce((t: number, x: any) => t + x.bottles, 0);
  console.log(`\n${p0.id} ${p0.name} | ${p0.category} oak ${p0.oakMonths} abv ${p0.abv} pkg ${p0.packagingId} | q참 ${p0.quality.toFixed(1)} q앎 ${kp.quality.toFixed(1)} | 재고 ${p0.stockBottles} | 12개월 판매 ${sold12}병 평균 출고가 ${k(avgPrice)} | 지금 값 ${k(p0.price)}`);
  console.log(`  권장 출고가 ${k(sug)} → 소비자가 ${k(at(sug).c)} | E(기대 소비자가) ${k(E)} | 권장의 소비자가/E ${(at(sug).c / E).toFixed(2)}`);
  for (const [lab, pr] of [['권장', sug], ['권장×2(자동 상한)', sug * 2], ['평균 판값', avgPrice], ['지금 값', p0.price]] as const) { const x = at(pr); console.log(`  ${lab.padEnd(12)} 출고가 ${k(pr).padStart(5)} 소비자가 ${k(x.c).padStart(6)} qpr ${x.qpr.toFixed(2)} 가격계수 ${x.pf.toFixed(3)} 수요 ${x.d.toFixed(0)}병/월`); }
  // 월 판매 목표(12개월 판매 평균)에서 수요가 맞는 값
  const target = Math.max(1, sold12 / Math.max(1, lastSold.length));
  let lo = 1000, hi = 5_000_000; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (at(m).d > target) lo = m; else hi = m; }
  console.log(`  수요 = 월 판매 평균(${target.toFixed(0)}병)이 되는 값: 출고가 ${k(lo)} (권장의 ${(lo / sug).toFixed(2)}배) qpr ${at(lo).qpr.toFixed(2)}`);
  const b = p0.stockBottles > 0 ? bestAutoPrice(s, p0, moy) : null; console.log(`  bestAutoPrice ${b ? k(b) : '-'}${b ? ` (권장의 ${(b / sug).toFixed(2)}배)` : ''}`);
}

// ── T11 캐스크 스트렝스: 12년(P1481) 도수 · 품질만 바꿔 같은 출고가에서 ──
const b: any = s.commerce.products.find((p: any) => p.id === 'P1481');
const row = (lab: string, o: any, price = 300_000) => {
  const p = { ...b, ...o, price, stockBottles: 100, qualityKnown: undefined };
  const t = { ...s, commerce: { ...s.commerce, products: s.commerce.products.map((x: any) => x.id === b.id ? p : x) } };
  const d = restockedDemand(t, p, moy); const E = expectedPricePerL(region, p) * p.bottleMl / 1000; const c = productConsumerPrice(s, p, region);
  console.log(`${lab.padEnd(26)} abv ${p.abv} q ${p.quality.toFixed(1)} | 권장 ${k(currentSuggested(s, p))} | E ${k(E)} | 출고가 ${k(price)} 소비자가 ${k(c)} qpr ${(c / E).toFixed(2)} | 매력 ${appeal(p, s).toFixed(3)} 가격계수 ${d.priceFactor.toFixed(3)} 수요 ${d.demandBottles.toFixed(0)}병/월`);
  return d.demandBottles;
};
const a = row('CS 58.3% (실제)', {});
const c = row('46% · 같은 품질', { abv: 0.46 });
const q = row('46% · 품질 +5.5', { abv: 0.46, quality: b.quality + 5.5 });
console.log(`수요 비: CS/46%같은품질 ${(a / c).toFixed(2)} · CS/46%+5.5 ${(a / q).toFixed(2)}`);
// 같은 수요가 되는 CS 값
for (const [lab, o] of [['46% 같은 품질', { abv: 0.46 }], ['46% +5.5', { abv: 0.46, quality: b.quality + 5.5 }]] as const) {
  let lo = 1000, hi = 3_000_000; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; const p = { ...b, ...o, price: m, stockBottles: 100, qualityKnown: undefined }; const t = { ...s, commerce: { ...s.commerce, products: s.commerce.products.map((x: any) => x.id === b.id ? p : x) } }; if (restockedDemand(t, p, moy).demandBottles > a) lo = m; else hi = m; }
  console.log(`CS 300k와 같은 수요가 되는 ${lab} 출고가 ${k(lo)}`);
}
