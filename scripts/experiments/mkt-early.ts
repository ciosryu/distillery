// T-MKT-7·11 측정 — 초반 생존: 비지터 센터(관광·기프트 샵)와 어린 위스키(3년 미만 할인 ×약 0.77) (docs/design/mkt-stage-t.md)
// 실행: npx tsx scripts/experiments/mkt-early.ts [시드=10] [개월=180]
//   MVP=micro|standard (기본 standard) · VISITORS=0,-1 비지터 센터 짓는 달(-1 = 안 지음) · MINAGES=12,24,36 위스키 병입 최소 숙성(개월)
//   (현금이 1억 아래면 봇은 최소 숙성과 상관없이 12개월짜리도 낸다 — mvp-survival.ts와 같은 비상 규칙)
// 판정(제안, 단계 T): T-MKT-7 비지터 센터 없이 소규모 파산률 ≤ 있을 때 + 20%p · T-MKT-11 1년 위스키로 3년 차까지 현금이 버틴다(36개월 최저 현금 > 0)
import { args, at, avg, eok, med, MODE, pct, runBot, type RunResult } from './mkt-lib';

const VISITORS = (process.env.VISITORS ?? '0,-1').split(',').map(Number);
const MINAGES = (process.env.MINAGES ?? '12,24,36').split(',').map(Number);

console.log(`T-MKT-7·11 초반 생존 — ${MODE}, ${args.seeds}시드 × ${args.months}개월, 이벤트 끔`);
console.log(`\n| 비지터 센터 | 위스키 최소 숙성 | 파산 (평균 월) | 현금 12 / 24 / 36 / 48개월 (중앙값) | 36개월 안 최저 현금 (중앙값) | 첫 위스키 병입 월 | 3년간 매출 중 관광·기프트 샵 | 순자산 ${args.months}개월(생존) |`);
console.log('|---|---|---|---|---|---|---|---|');
const res: Record<string, RunResult[]> = {};
for (const v of VISITORS) for (const age of MINAGES) {
  const rs = (res[`${v}:${age}`] = Array.from({ length: args.seeds }, (_, i) => runBot({ mode: MODE, seed: i + 1, months: args.months, visitorMonth: v, minAge: age })));
  const alive = rs.filter((r) => !r.bankrupt);
  const br = rs.filter((r) => r.bankrupt);
  const cash = (m: number) => eok(med(rs.map((r) => at(r, m)?.cash ?? NaN)));
  const tour = avg(rs.map((r) => {
    const r3 = r.reps.filter((x) => x.month < 36);
    const t = r3.reduce((a, x) => a + (x.tourismRevenue ?? 0), 0);
    // report.revenue에는 관광 매출이 들어가지 않는다 — 국내 판매 + 관광 + 현물로 분모를 만든다
    const all = t + r3.reduce((a, x) => a + x.sales.reduce((b, y) => b + y.revenue, 0) + (x.spotBulkRevenue ?? 0), 0);
    return all > 0 ? t / all : NaN;
  }));
  console.log(`| ${v < 0 ? '없음' : `${v}월`} | ${age}개월 | ${br.length}/${rs.length}${br.length ? ` (${Math.round(avg(br.map((r) => r.bankruptMonth)))}월)` : ''} | ${cash(12)} / ${cash(24)} / ${cash(36)} / ${cash(48)} | ${eok(med(rs.map((r) => Math.min(...r.curve.filter((c) => c.month <= 36).map((c) => c.cash)))))} | ${Math.round(med(rs.filter((r) => r.firstWhiskyMonth >= 0).map((r) => r.firstWhiskyMonth)))}월 | ${pct(tour)} | ${eok(avg(alive.map((r) => at(r, args.months)?.netWorth ?? NaN)))} |`);
}
const br = (k: string) => (res[k] ? res[k]!.filter((r) => r.bankrupt).length / res[k]!.length : NaN);
const out: string[] = [];
if (VISITORS.includes(0) && VISITORS.includes(-1)) out.push(`T-MKT-7 파산률 비지터 없음 ${pct(br(`-1:${MINAGES[0]}`))} 대 있음 ${pct(br(`0:${MINAGES[0]}`))} (기준 차이 ≤ 20%p: ${br(`-1:${MINAGES[0]}`) - br(`0:${MINAGES[0]}`) <= 0.2 ? '통과' : '미달'})`);
if (MINAGES.includes(12)) {
  const k = `${VISITORS[0]}:12`;
  const low = med(res[k]!.map((r) => Math.min(...r.curve.filter((c) => c.month <= 36).map((c) => c.cash))));
  out.push(`T-MKT-11 1년 위스키 36개월 최저 현금 중앙값 ${eok(low)} (기준 > 0: ${low > 0 ? '통과' : '미달'})`);
}
if (out.length) console.log(`\nSUMMARY | ${MODE} | ${out.join(' | ')}`);
