// T-MKT-2·3 측정 — 사람 판 세이브에서 배분 규칙·수출가를 바꿔 N개월 굴린다 (docs/design/mkt-stage-t.md)
// 실행: npx tsx scripts/experiments/mkt-replay.ts <세이브.json> [개월=36]
//   ALLOCS=margin,domestic,proportional  수출 배분 방식(EXPORT_SALES.allocation, 실험 안에서만 바꾼다)
//   MOVES=keep,lower,raise,off  플레이어 대응 — keep 그대로 · lower 수출가 ×0.85(배분이 국내 먼저로 돈다) · raise ×1.3(현지 수요가 준다)
//                                · off 지난달 국내가 모자란 수출 제품을 「수출 끄기」(P-MKT-21)
//   SEEDS=1,2,3      굴림 난수 (세이브의 시드에 더한다 — 같은 세이브라도 다음 달 수요가 다르다)
// 플레이어 행동은 넣지 않는다: 세이브에 켜 둔 자동 납품·자동 가격·생산 주문만 돈다. 그래서 절대값이 아니라 방식 사이 비교로만 읽는다
// 판정(제안, 단계 T): 수출 위주는 의도(오너 2026-11-11). 국내 미충족은 보이고(#257) 「수출 끄기」(P-MKT-21, 오너 2026-11-11)로 되돌린다 —
//   여기서는 대응마다 국내 판매·인지도·현금이 얼마나 달라지는지(되돌리는 값)를 잰다
import { advanceMonth, applyAction, exportShortfalls, netWorth, type GameState, type MonthReport } from '../../src/sim';
import { houseBrand } from '../../src/sim/brands';
import { EXPORT_SALES } from '../../src/sim/content/exports';
import { avg, eok, loadSave } from './mkt-lib';

const path = process.argv[2];
if (!path) { console.error('사용: npx tsx scripts/experiments/mkt-replay.ts <세이브.json> [개월=36]'); process.exit(1); }
const MONTHS = Number(process.argv[3] ?? 36);
const ALLOCS = (process.env.ALLOCS ?? 'margin,domestic,proportional').split(',') as (typeof EXPORT_SALES.allocation)[];
type Move = 'keep' | 'lower' | 'raise' | 'off';
const MOVES = (process.env.MOVES ?? 'keep,lower,raise,off').split(',') as Move[];
const MOVE_LABEL: Record<Move, string> = { keep: '그대로', lower: '수출가 ×0.85', raise: '수출가 ×1.3', off: '수출 끄기(모자란 제품)' };
const SEEDS = (process.env.SEEDS ?? '1,2,3').split(',').map(Number);
const ORIGINAL = EXPORT_SALES.allocation;
const save = loadSave(path);

interface Out { domSold: number; domDemand: number; unmet: number; unmetFirst2: number; exported: number; cash: number; nw: number; aw: number; bankrupt: boolean }
function run(alloc: typeof EXPORT_SALES.allocation, move: Move, seed: number): Out {
  EXPORT_SALES.allocation = alloc;
  let s: GameState = structuredClone(save);
  s.seed = save.seed + seed * 7919;
  const price = move === 'lower' ? 0.85 : move === 'raise' ? 1.3 : 0;
  if (price > 0) for (const e of s.commerce.exports ?? []) { const r = applyAction(s, { type: 'setExportPrice', marketId: e.marketId, priceFactor: price }); if (!r.error) s = r.state; }
  if (move === 'off') for (const x of exportShortfalls(s.history.reports.at(-1))) { const r = applyAction(s, { type: 'setProductExport', productId: x.productId, noExport: true }); if (!r.error) s = r.state; }
  const reps: MonthReport[] = [];
  for (let m = 0; m < MONTHS && s.status === 'running'; m++) { s = advanceMonth(s); reps.push(s.history.reports.at(-1)!); }
  const sum = (f: (r: MonthReport) => number, rs = reps) => rs.reduce((t, r) => t + f(r), 0);
  const unmetOf = (r: MonthReport) => exportShortfalls(r).reduce((a, x) => a + x.unmet, 0);
  return {
    domSold: sum((r) => r.sales.reduce((a, x) => a + x.bottles, 0)), domDemand: sum((r) => r.sales.reduce((a, x) => a + x.demandBottles, 0)),
    unmet: sum(unmetOf), unmetFirst2: sum(unmetOf, reps.slice(0, 2)), exported: sum((r) => (r.exports ?? []).reduce((a, x) => a + x.bottles, 0)),
    cash: s.finance.cash, nw: netWorth(s), aw: houseBrand(s).awareness, bankrupt: s.status === 'bankrupt',
  };
}

console.log(`T-MKT-2·3 세이브 재생 — ${path} (${save.month}개월째부터 ${MONTHS}개월, 굴림 ${SEEDS.length}번 평균) · 수출 시장 ${(save.commerce.exports ?? []).map((e) => `${e.marketId} ×${e.priceFactor}`).join(', ') || '없음'} · 지금 방식 ${ORIGINAL}`);
console.log('\n| 배분 | 대응 | 국내 판매(병) | 국내 수요(병) | 수출 제품 국내 미충족(병) | 첫 2개월 미충족 | 수출(병) | 하우스 인지도 끝 | 현금 끝 | 순자산 끝 | 파산 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const a of ALLOCS) for (const p of MOVES) {
  const os = SEEDS.map((seed) => run(a, p, seed));
  const m = (k: keyof Out) => avg(os.map((o) => Number(o[k])));
  console.log(`| ${a} | ${MOVE_LABEL[p]} | ${Math.round(m('domSold')).toLocaleString()} | ${Math.round(m('domDemand')).toLocaleString()} | ${Math.round(m('unmet')).toLocaleString()} | ${Math.round(m('unmetFirst2')).toLocaleString()} | ${Math.round(m('exported')).toLocaleString()} | ${m('aw').toFixed(3)} | ${eok(m('cash'))} | ${eok(m('nw'))} | ${os.filter((o) => o.bankrupt).length}/${os.length} |`);
}
EXPORT_SALES.allocation = ORIGINAL;
