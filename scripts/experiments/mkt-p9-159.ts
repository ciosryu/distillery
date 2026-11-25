// MKT 9차 판 159개월 최종 기록 분석 (PM 2026-11-25 · docs/playtest/9/mkt.md 「159개월」) — 출력만, 상태를 바꾸지 않는다
// 실행: npx tsx scripts/experiments/mkt-p9-159.ts [세이브]
// ① 12년 제품의 기대 소비자가 · 수요를 품질 · 연수 · 포장 · 도수 · 값만 바꿔 다시 센다(같은 달 · 끝 상태 진열) ② 권장가 대 실제 값 ③ 12년 판매 기록 ④ 새 피드의 12년 글
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../../src/store/playlog';
import { agePerception } from '../../src/sim/blending';
import { demandFor, expectedPricePerL, productConsumerPrice, restockedDemand } from '../../src/sim/market';
import { regionOf } from '../../src/sim/content/regions';
import { currentSuggested } from '../../src/sim/economics';
import { knownView } from '../../src/sim';
import { feedFor, feedSignals, feedSituation, communityQuality } from '../../src/sim/feed';
import type { GameState, Product } from '../../src/sim/types';

const r = parsePlayFile(readFileSync(process.argv[2] ?? 'docs/playtest/9/distillery-mvp-standard-y14m4-202611250055.json', 'utf8'));
if ('error' in r) throw new Error(r.error);
const s: GameState = r.save;
const region = regionOf(s);
const ID = 'P1481'; // 김포 시그니처 12년
const base = s.commerce.products.find((p) => p.id === ID)!;
const moy = (152 % 12) + 1;
console.log('agePerception(위스키)', [36, 48, 72, 120, 144].map((m) => `${m}개월 ${agePerception(m, 'whisky').toFixed(3)}`).join(' · '));
console.log('\n① 12년 제품 — 하나만 바꿔 센 값(끝 상태 · 9월)');
const at = (o: Partial<Product>) => {
  const p = { ...base, stockBottles: 100, ...o } as Product;
  const s2 = { ...s, commerce: { ...s.commerce, products: s.commerce.products.map((x) => (x.id === p.id ? p : x)) } } as GameState;
  return { alone: demandFor(s2, p, 1, moy).demandBottles, split: restockedDemand(s2, p, moy).demandBottles, E: (expectedPricePerL(region, p) * p.bottleMl) / 1000, c: productConsumerPrice(s2, p, region) };
};
const rows: [string, Partial<Product>][] = [
  ['실제(품질 55.5 · 12년 · 58% · 프리미엄) 30만', { price: 300_000 }], ['품질 80', { price: 300_000, quality: 80 }], ['6년 표기(목재 72)', { price: 300_000, oakMonths: 72, ageYears: 6 }],
  ['3년 표기(목재 36)', { price: 300_000, oakMonths: 36, ageYears: 3 }], ['스탠다드 포장', { price: 300_000, packagingId: 'standard', packaging: undefined }], ['46% 병입', { price: 300_000, abv: 0.46 }],
  ['값 38만', { price: 380_000 }], ['품질 80 · 값 38만', { price: 380_000, quality: 80 }],
];
for (const [k, o] of rows) { const x = at(o); console.log(`${k.padEnd(30)} 혼자 ${x.alone.toFixed(0)}병/월 · 나눔 뒤 ${x.split.toFixed(0)}병/월 · 기대 소비자가 ${Math.round(x.E / 1000)}천 · 소비자가 ${Math.round(x.c / 1000)}천`); }
console.log('\n② 권장가(아는 품질) 대 실제 값');
for (const p of s.commerce.products.filter((x) => /whisky/.test(x.category))) console.log(`${p.name} — 표기 ${p.ageYears ?? '-'}년 · 품질 ${p.quality} · 값 ${p.price} · 권장 ${Math.round(currentSuggested(s, knownView(s, { ...p, stockBottles: 100 })))}`);
console.log('\n③ 12년 판매 기록(병 · 값 · 기록된 수요 · 리뷰 점수)');
for (const rep of s.history.reports.filter((x) => x.month >= 150)) { const x = rep.sales.find((y) => y.productId === ID); if (x) console.log(rep.month, x.bottles, Math.round(x.revenue / Math.max(1, x.bottles)), Math.round(x.demandBottles), JSON.stringify(rep.reviews?.find((v) => v.productId === ID)?.scores ?? [])); }
console.log('\n④ 새 피드 — 12년 글(최근 12달)');
const posts = feedFor(s, 12, 1000).filter((p) => p.productId === ID || p.productName.includes(base.name));
const tone: Record<string, number> = {}; for (const p of posts) tone[p.tone] = (tone[p.tone] ?? 0) + 1;
console.log(posts.length, tone);
for (const rep of s.history.reports.filter((x) => x.month >= 150 && x.month <= 155)) {
  const sale = rep.sales.find((x) => x.productId === ID); if (!sale) continue;
  const prev = s.history.reports.find((x) => x.month === rep.month - 1)?.sales.find((x) => x.productId === ID);
  const g = feedSignals(s, base, sale, prev, rep.month);
  console.log(rep.month, '상황', feedSituation(g), '가성비', g.qpr.toFixed(2), '커뮤니티 품질', communityQuality(s, base, rep.month).toFixed(1));
}
