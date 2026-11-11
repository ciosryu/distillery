// T-MKT-12 측정 — 피니시가 지금 판매에 주는 효과 (docs/design/mkt-stage-t.md, PRD §5.2 · #158)
// 실행: npx tsx scripts/experiments/mkt-finish.ts [시드=3]
//   AT=<달> 샌드박스 봇을 몇 개월까지 굴린 뒤 통을 고를지(기본 72) · MONTHS=3,6,12,24 피니시 기간 · CASKS=<n> 비교할 통 수(기본 4)
// 같은 판에서 3년 이상 된 ex-버번 몰트 통 n개를 골라, ① 그대로 N개월 더 숙성 ② 올로로소 셰리 벗으로 옮겨 N개월 피니싱 — 둘을 병입해
// 품질·매력도·권장가를 비교한다. 라벨 효과가 없는 지금은 향미(셰리 시즈닝)를 통한 효과만 잡힌다.
// MVP는 피니싱(transferCask)이 잠겨 있어 샌드박스(newGame)에서만 잰다. 숙성고가 꽉 차면 고른 통이 아닌 통 몇 개를 실험 안에서만 뺀다
import { advanceMonth, applyAction, appeal, type Action, type GameState } from '../../src/sim';
import { CASKS } from '../../src/sim/content/production';
import { currentSuggested } from '../../src/sim/economics';
import { runBot } from './mkt-lib';

const SEEDS = Number(process.argv[2] ?? 3);
const AT = Number(process.env.AT ?? 72);
const MONTHS = (process.env.MONTHS ?? '3,6,12,24').split(',').map(Number);
const N = Number(process.env.CASKS ?? 4);
const act = (s: GameState, a: Action) => { const r = applyAction(s, a); if (r.error) throw new Error(r.error); return r.state; };

interface Out { q: number; appeal: number; price: number; bottles: number }
function run(base: GameState, pick: string[], months: number, finish: boolean): Out {
  let s: GameState = structuredClone(base);
  let ids = [...pick];
  if (finish) {
    const before = new Set(s.inventory.casks.map((c) => c.id));
    s = act(s, { type: 'buySpotCasks', caskType: 'oloroso_butt', qty: pick.length });
    const fresh = s.inventory.casks.filter((c) => !before.has(c.id)).map((c) => c.id);
    ids = pick.map((id, i) => { s = act(s, { type: 'transferCask', fromCaskId: id, toCaskId: fresh[i]! }); return fresh[i]!; });
  }
  for (let m = 0; m < months; m++) s = advanceMonth(s);
  const comps = ids.map((id) => ({ source: 'cask' as const, id, liters: s.inventory.casks.find((c) => c.id === id)!.contents!.volumeL }));
  const name = `${finish ? 'finish' : 'keep'}-${months}`;
  s = act(s, { type: 'bottle', components: comps, options: { name, targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' } });
  const p = s.commerce.products.find((x) => x.name === name)!;
  return { q: p.quality, appeal: appeal(p, s), price: currentSuggested(s, p), bottles: p.stockBottles };
}

console.log(`T-MKT-12 피니시 효과(라벨 효과 없음 — 향미만) — 샌드박스 ${SEEDS}시드, ${AT}개월째 3년↑ ex-버번 몰트 ${N}통, 올로로소 벗 1통 ${CASKS.oloroso_butt.price.toLocaleString()}원/통`);
console.log('\n| 시드 | 기간 | 품질 (그대로 → 피니시) | 매력도 차이 | 권장가 차이 | 매력도 × 권장가 차이 | 셰리 벗 값 ÷ 병 (원/병) |');
console.log('|---|---|---|---|---|---|---|');
const sum: Record<number, number[]> = {};
for (let seed = 1; seed <= SEEDS; seed++) {
  const base = runBot({ mode: 'sandbox', seed, months: AT }).s;
  base.finance.cash = 5e9;
  const pick = base.inventory.casks.filter((c) => c.contents?.kind === 'malt' && c.typeId === 'ex_bourbon_barrel' && c.contents.oakMonths >= 36).slice(0, N).map((c) => c.id);
  if (pick.length < N) { console.log(`| ${seed} | — | 3년↑ 통 ${pick.length}개뿐 | | | | |`); continue; }
  const keep = new Set(pick);
  let drop = N * 2;
  base.inventory.casks = base.inventory.casks.filter((c) => keep.has(c.id) || drop-- <= 0);
  for (const m of MONTHS) {
    const a = run(base, pick, m, false), b = run(base, pick, m, true);
    const v = (b.appeal * b.price) / (a.appeal * a.price) - 1;
    (sum[m] ??= []).push(v);
    console.log(`| ${seed} | ${m}개월 | ${a.q.toFixed(1)} → ${b.q.toFixed(1)} | ${((b.appeal / a.appeal - 1) * 100).toFixed(1)}% | ${((b.price / a.price - 1) * 100).toFixed(1)}% | ${(v * 100).toFixed(1)}% | ${Math.round((CASKS.oloroso_butt.price * N) / b.bottles).toLocaleString()} |`);
  }
}
console.log(`\nSUMMARY | 매력도 × 권장가 차이 평균 ${MONTHS.map((m) => `${m}개월 ${sum[m] ? ((sum[m]!.reduce((x, y) => x + y, 0) / sum[m]!.length) * 100).toFixed(1) : '—'}%`).join(' · ')} — 셰리 벗 값(첫 사용)은 병당 권장가의 약 9~10%`);
