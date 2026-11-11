// T-MKT-1·2·9 측정 — 수출이 후반을 끌고 가는 정도, 수출의 국내 잠식, 수출 위주 판의 인지도 (docs/design/mkt-stage-t.md)
// 실행: npx tsx scripts/experiments/mkt-export.ts [시드=10] [개월=180]
//   MVP=micro|standard|sandbox (기본 standard) · FROM=<달> 제안 수락 시작(기본 84 = MVP 수출 열림) · PRICE=<배수> 수출가(기본 0 = 제안가)
//   ALLOCS=margin,domestic,proportional 비교할 배분 방식(EXPORT_SALES.allocation — 실험 안에서만 바꾼다)
// 판정(제안, 단계 T): 수출은 후반 성장 엔진으로 의도(오너 2026-11-11). 대신 ① 수출 없이도 버틴다(파산률 차이 ≤ 10%p)
//   ② 수출 판에서도 국내가 의미 있다(수출 열림 뒤 국내 매출 비중 ≥ 25%) ③ 국내 미충족은 보이고 되돌릴 수 있다(T-MKT-2, mkt-replay.ts)
import { EXPORT_SALES } from '../../src/sim/content/exports';
import { MVP_KR } from '../../src/sim';
import { args, at, avg, domesticShare, eok, exportContribution, exportStarve, MODE, pct, runBot, type RunResult } from './mkt-lib';

const FROM = Number(process.env.FROM ?? 84);
const PRICE = Number(process.env.PRICE ?? 0);
const ALLOCS = (process.env.ALLOCS ?? 'margin,domestic,proportional').split(',') as (typeof EXPORT_SALES.allocation)[];
const ORIGINAL = EXPORT_SALES.allocation;

type Mode = { name: string; exportFrom: number; alloc: typeof EXPORT_SALES.allocation };
const MODES: Mode[] = [{ name: '수출 없음', exportFrom: -1, alloc: ORIGINAL }, ...ALLOCS.map((a) => ({ name: `수출(${a})`, exportFrom: FROM, alloc: a }))];

console.log(`T-MKT-1·2·9 수출 측정 — ${MODE}, ${args.seeds}시드 × ${args.months}개월, 제안 수락 ${FROM}개월~, 수출가 ${PRICE || '제안가'}${PRICE ? '배' : ''}, 이벤트 끔`);
const rows: Record<string, RunResult[]> = {};
for (const m of MODES) {
  EXPORT_SALES.allocation = m.alloc;
  rows[m.name] = Array.from({ length: args.seeds }, (_, i) => runBot({ mode: MODE, seed: i + 1, months: args.months, exportFrom: m.exportFrom, exportPrice: PRICE }));
}
EXPORT_SALES.allocation = ORIGINAL;

const END = args.months;
const goalOf = (r: RunResult) => (r.s.scenario ? r.s.scenario.equity * MVP_KR.goal.netWorthMultiple : NaN);
console.log(`\n| 방식 | 파산 | 순자산 ${FROM}개월 | 순자산 ${END}개월(생존) | ${FROM}→${END} 순자산 증가/년 | 수출 공헌(${FROM}~) | 수출 공헌 ÷ 순자산 증가 | 국내 매출 비중(${FROM}~) | 수출 제품 국내 미충족/년 (국내 수요 대비) | 하우스 인지도 ${END}개월 | 순자산 목표 달성 |`);
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const m of MODES) {
  const rs = rows[m.name]!;
  const alive = rs.filter((r) => !r.bankrupt);
  const nw0 = avg(rs.map((r) => at(r, FROM)?.netWorth ?? NaN));
  const nw1 = avg(alive.map((r) => at(r, END)?.netWorth ?? NaN));
  const gain = avg(alive.map((r) => (at(r, END)?.netWorth ?? NaN) - (at(r, FROM)?.netWorth ?? NaN)));
  const contrib = avg(alive.map((r) => exportContribution(r, FROM)));
  const starve = alive.map((r) => exportStarve(r, FROM));
  const unmet = avg(starve.map((x) => x.unmetPerYear)), dem = avg(starve.map((x) => x.demandPerYear));
  const goal = alive.filter((r) => (at(r, END)?.netWorth ?? -Infinity) >= goalOf(r)).length;
  console.log(`| ${m.name} | ${rs.length - alive.length}/${rs.length} | ${eok(nw0)} | ${eok(nw1)} | ${eok(gain / ((END - FROM) / 12))} | ${m.exportFrom < 0 ? '—' : eok(contrib)} | ${m.exportFrom < 0 ? '—' : pct(contrib / gain)} | ${pct(avg(alive.map((r) => domesticShare(r, FROM))))} | ${m.exportFrom < 0 ? '—' : `${Math.round(unmet).toLocaleString()}병 (${pct(unmet / dem)})`} | ${avg(alive.map((r) => at(r, END)?.awareness ?? NaN)).toFixed(3)} | ${Number.isFinite(goalOf(rs[0]!)) ? `${goal}/${rs.length}` : '—'} |`);
}

// 수출 시장 열고 닫은 기록 (첫 시드) — 봇이 무엇을 받았는지
for (const m of MODES.filter((x) => x.exportFrom >= 0)) {
  const r = rows[m.name]![0]!;
  console.log(`\n${m.name} 시드 1: 열림 ${r.exportOpened.map((x) => `${x.marketId}@${x.month}`).join(', ') || '없음'} · 닫음 ${r.exportClosed.map((x) => `${x.marketId}@${x.month}`).join(', ') || '없음'}`);
}

// 판정 기준(제안) 한 줄 — 단계 T에서 오너가 정한다
const none = rows['수출 없음']!;
const base = rows[MODES[1]?.name ?? '']!;
if (base) {
  const br = (rs: RunResult[]) => rs.filter((r) => r.bankrupt).length / rs.length;
  const share = avg(base.filter((r) => !r.bankrupt).map((r) => domesticShare(r, FROM)));
  console.log(`\nSUMMARY | ${MODE} | 파산률 수출 없음 ${pct(br(none))} 대 ${MODES[1]!.name} ${pct(br(base))} (기준 차이 ≤ 10%p: ${br(none) - br(base) <= 0.1 ? '통과' : '미달'}) | 국내 매출 비중 ${pct(share)} (기준 ≥ 25%: ${share >= 0.25 ? '통과' : '미달'})`);
}
