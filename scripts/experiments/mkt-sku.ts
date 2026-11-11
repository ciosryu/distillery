// T-MKT-5 측정 — 같은 주종 제품 수와 SKU.rho (docs/design/mkt-stage-t.md, STATUS 24 · #154)
// 실행: npx tsx scripts/experiments/mkt-sku.ts [시드=10] [개월=180]
//   MVP=micro|standard|sandbox (기본 standard) · RHOS=3,4,5 · SKUS=1,2,3 (0 = 병입마다 새 제품, 기본 봇과 같음)
// 봇은 소주·위스키를 각각 SKUS개 제품으로만 낸다(그 뒤는 재고가 가장 적은 제품을 보충). SKU.rho는 실험 안에서만 바꾼다.
// 판정(제안, 단계 T): 주종당 1개로도 버틸 수 있고(파산률이 2~3개보다 20%p 넘게 높지 않음), 2~3개가 유리하되 필수는 아니다
import { SKU } from '../../src/sim/content/market';
import { args, at, avg, eok, med, MODE, pct, runBot, type RunResult } from './mkt-lib';

const RHOS = (process.env.RHOS ?? '3,4,5').split(',').map(Number);
const SKUS = (process.env.SKUS ?? '1,2,3').split(',').map(Number);
const ORIGINAL = SKU.rho;

console.log(`T-MKT-5 제품 수 × ρ — ${MODE}, ${args.seeds}시드 × ${args.months}개월 (현재 ρ = ${ORIGINAL}, 브랜드 사이 ρ_out = ${SKU.rhoBrand})`);
console.log(`\n| ρ | 주종당 제품 | 파산 (평균 월) | 최저 현금 중앙값 | 위스키 국내 판매/년 (5년 차~) | 국내 수요/년 (5년 차~) | 순자산 ${args.months}개월(생존) |`);
console.log('|---|---|---|---|---|---|---|');
const summary: string[] = [];
for (const rho of RHOS) {
  SKU.rho = rho;
  const byN: Record<number, RunResult[]> = {};
  for (const n of SKUS) {
    const rs = (byN[n] = Array.from({ length: args.seeds }, (_, i) => runBot({ mode: MODE, seed: i + 1, months: args.months, skus: n })));
    const alive = rs.filter((r) => !r.bankrupt);
    const br = rs.filter((r) => r.bankrupt);
    const whisky = (r: RunResult, key: 'bottles' | 'demandBottles') => {
      const cats = new Map([...r.s.commerce.productArchive, ...r.s.commerce.products].map((p) => [p.id, p.category]));
      const rs2 = r.reps.filter((x) => x.month >= 48);
      return rs2.flatMap((x) => x.sales).filter((x) => cats.get(x.productId) === 'whisky').reduce((a, x) => a + x[key], 0) / Math.max(1, rs2.length / 12);
    };
    console.log(`| ${rho} | ${n || '매번 새 제품'} | ${br.length}/${rs.length}${br.length ? ` (${Math.round(avg(br.map((r) => r.bankruptMonth)))}월)` : ''} | ${eok(med(rs.map((r) => Math.min(...r.curve.map((c) => c.cash)))))} | ${Math.round(avg(rs.map((r) => whisky(r, 'bottles')))).toLocaleString()} | ${Math.round(avg(rs.map((r) => whisky(r, 'demandBottles')))).toLocaleString()} | ${eok(avg(alive.map((r) => at(r, args.months)?.netWorth ?? NaN)))} |`);
  }
  const brOf = (n: number) => (byN[n] ? byN[n]!.filter((r) => r.bankrupt).length / byN[n]!.length : NaN);
  const many = Math.min(...SKUS.filter((n) => n >= 2).map(brOf));
  if (SKUS.includes(1) && Number.isFinite(many)) summary.push(`ρ ${rho}: 1개 파산률 ${pct(brOf(1))} 대 2~3개 최저 ${pct(many)} (기준 차이 ≤ 20%p: ${brOf(1) - many <= 0.2 ? '통과' : '미달'})`);
}
SKU.rho = ORIGINAL;
if (summary.length) console.log(`\nSUMMARY | ${MODE} | ${summary.join(' | ')}`);
