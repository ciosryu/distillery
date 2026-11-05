// 헤드리스 밸런스 시뮬레이션 — 단순 정책으로 N개 시드를 10년간 돌려 파산률과 흑자 전환 시점을 본다.
// 실행: npm run balance [-- 시드수 개월수]
import { advanceMonth, applyAction, type Action, type GameState, newGame, previewBlend, type ProductCategory } from '../src/sim';

const SEEDS = Number(process.argv[2] ?? 20);
const MONTHS = Number(process.argv[3] ?? 120);

function act(s: GameState, a: Action): GameState {
  return applyAction(s, a).state;
}

const stockOf = (s: GameState, cat: ProductCategory) => s.products.filter((p) => p.category === cat).reduce((t, p) => t + p.stockBottles, 0);

/** 단순 정책: 현금흐름 제품은 재고가 줄면 병입, 몰트는 통입, 36개월 지난 캐스크는 위스키로 병입 */
function policy(s: GameState): GameState {
  if (s.month === 0) {
    const sales = s.candidates.filter((c) => c.role === 'sales').sort((a, b) => b.stats.b - a.stats.b)[0];
    if (sales) s = act(s, { type: 'hire', candidateId: sales.id });
    s = act(s, { type: 'setMarketing', amount: 5_000_000 });
    const rid = (prefix: string) => s.recipes.find((r) => r.name.startsWith(prefix))!.id;
    s = act(s, { type: 'setOrder', recipeId: rid('증류식'), batchesPerMonth: 2 });
    s = act(s, { type: 'setOrder', recipeId: rid('런던'), batchesPerMonth: 1 });
    s = act(s, { type: 'setOrder', recipeId: rid('싱글 몰트 — 언'), batchesPerMonth: 4 });
  }
  // 소주·진 병입 (재고가 낮을 때만)
  for (const lot of [...s.lots]) {
    if (lot.kind === 'soju' && stockOf(s, 'soju_distilled') < 1500 && s.month - lot.createdMonth >= 1) {
      s = act(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: lot.volumeL }], options: { name: `소주 ${s.month}`, targetAbv: 0.25, bottleMl: 375, chillFilter: true, packagingId: 'standard' } });
    }
    if (lot.kind === 'gin' && stockOf(s, 'gin') < 1000) {
      s = act(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: lot.volumeL }], options: { name: `진 ${s.month}`, targetAbv: 0.43, bottleMl: 700, chillFilter: true, packagingId: 'standard' } });
    }
  }
  // 몰트 통입 (빈 캐스크가 모자라면 구매)
  for (const lot of s.lots.filter((l) => l.kind === 'malt')) {
    const need = Math.ceil((lot.volumeL * lot.abv) / (200 * 0.635));
    const empty = s.casks.filter((c) => !c.contents).length;
    if (empty < need && s.cash > 100_000_000) s = act(s, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: need - empty });
    s = act(s, { type: 'fillCasks', lotId: lot.id, caskIds: s.casks.filter((c) => !c.contents).map((c) => c.id), entryAbv: 0.635 });
  }
  // 위스키 병입: 36개월 이상 캐스크를 재고가 낮을 때 3개씩
  if (stockOf(s, 'whisky') < 800) {
    const ready = s.casks.filter((c) => c.contents && c.contents.oakMonths >= 36 && !c.contents.sourced).slice(0, 3);
    if (ready.length) {
      const comps = ready.map((c) => ({ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL }));
      const opts = { name: `싱글 몰트 ${s.month}`, targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };
      if (previewBlend(s, comps, opts).ok) s = act(s, { type: 'bottle', components: comps, options: opts });
    }
  }
  // 자금 조달
  if (s.cash < 100_000_000 && !s.loans.some((l) => l.offerId === 'working')) s = act(s, { type: 'takeLoan', offerId: 'working', amount: 300_000_000 });
  if (s.cash < 50_000_000 && !s.loans.some((l) => l.offerId === 'facility')) s = act(s, { type: 'takeLoan', offerId: 'facility', amount: 500_000_000 });
  if (s.flags.producedSoju && !s.loans.some((l) => l.offerId === 'policy') && s.cash < 300_000_000) s = act(s, { type: 'takeLoan', offerId: 'policy', amount: 200_000_000 });
  return s;
}

const eok = (v: number) => `${(v / 1e8).toFixed(2)}억`;
const rows: string[] = [];
let bankrupt = 0;
const firstPositive: number[] = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  let s = newGame({ seed });
  let minCash = s.cash;
  const checkpoints: Record<number, number> = {};
  for (let m = 0; m < MONTHS && s.status === 'running'; m++) {
    s = advanceMonth(policy(s));
    minCash = Math.min(minCash, s.cash);
    if ([36, 60, 120].includes(s.month)) checkpoints[s.month] = s.cash;
  }
  const net = s.reports.map((r) => r.netCash);
  let fp = -1;
  for (let i = 2; i < net.length; i++) if ((net[i]! + net[i - 1]! + net[i - 2]!) / 3 > 0) { fp = i; break; }
  if (fp >= 0) firstPositive.push(fp);
  if (s.status === 'bankrupt') bankrupt++;
  const y5 = s.reports.filter((r) => r.month >= 48 && r.month < 60).reduce((t, r) => t + r.revenue, 0);
  rows.push(`seed ${String(seed).padStart(2)} | ${s.status.padEnd(8)} @${String(s.month).padStart(3)}m | 최저 현금 ${eok(minCash).padStart(8)} | 36m ${eok(checkpoints[36] ?? NaN).padStart(8)} | 60m ${eok(checkpoints[60] ?? NaN).padStart(8)} | 120m ${eok(checkpoints[120] ?? NaN).padStart(8)} | 5년차 매출 ${eok(y5).padStart(7)} | 첫 흑자(3개월 평균) ${fp >= 0 ? `${fp}m` : '없음'}`);
}
console.log(rows.join('\n'));
const avg = firstPositive.length ? Math.round(firstPositive.reduce((a, b) => a + b, 0) / firstPositive.length) : NaN;
console.log(`\n파산 ${bankrupt}/${SEEDS} · 흑자 전환 ${firstPositive.length}/${SEEDS} (평균 ${avg}개월)`);
