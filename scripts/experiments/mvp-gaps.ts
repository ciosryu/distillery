// MVP 경제 진단 — 봇은 사는데 사람은 왜 파산하나 (MGT, 결정 대기 19 · mvp.md §7.6)
// 실행: npx tsx scripts/experiments/mvp-gaps.ts [시드수=20] [개월=180]
//   TIER=<micro|standard>  기본 micro (1·2차 플레이테스트 티어)
//   ONLY=<id,...>          이 변형만 (병렬 실행용)
//   YEARS=1                기준 봇(균형)의 연도별 매출·고정비·현금표도 찍는다 (시드 1)
//
// mvp-survival.ts의 "균형" 봇(소주 2 · 몰트 5배치, 비지터 센터 0개월, 수요 1.5개월치 병입)을 기준으로 두고,
// 1·2차 사람 플레이에서 봇과 달랐던 행동을 하나씩(또는 묶어서) 넣어 파산이 생기는지 본다. 게임 규칙·콘텐츠는 바꾸지 않는다
// (안동 입지만 실험 안에서 시나리오 입지를 바꾼다).
import { advanceMonth, applyAction, bulkValuePerLPA, MVP_KR, newScenarioGame, previewBlend, warehouseCapacity, type Action, type GameState, type ProductCategory } from '../../src/sim';
import { monthlyFixedCost } from '../../src/sim/loans';

const SEEDS = Number(process.argv[2] ?? 20);
const MONTHS = Number(process.argv[3] ?? 180);
const TIER = (process.env.TIER ?? 'micro') as 'micro' | 'standard';

/** 사람이 봇과 다르게 한 것 (출처: mvp.md §7.4 1차, STATUS·PRD §5.6 #185 2차) */
interface Gap {
  id: string; label: string;
  noVisitor?: boolean;      // 비지터 센터를 안 짓는다 (사람 판에서 지었는지는 기록에 없음 — 확인 불가)
  stopAt?: number;          // 이 달부터 모든 생산 0 (2차: 27개월째)
  cut?: [number, number];   // 이 기간 몰트 5 → 1배치 (1차: 2~5년 차에 몰트를 줄임)
  overBottle?: boolean;     // 소주를 재고와 상관없이 다 병입 (1차: 한 제품 186개월 치)
  andong?: boolean;         // 안동 입지 (1차)
  marketing?: number;       // 마케팅 월 예산 (봇 기준 500만, 게임 기본값 300만, 고정비를 줄이려는 사람의 첫 수 = 0)
}
const GAPS: Gap[] = [
  { id: 'base', label: '기준 봇(균형)' },
  { id: 'V', label: '비지터 센터 없음', noVisitor: true },
  { id: 'S27', label: '27개월째 생산 0 (2차)', stopAt: 27 },
  { id: 'C', label: '2~5년 차 몰트 1배치 (1차)', cut: [24, 60] },
  { id: 'O', label: '소주 과잉 병입 (1차)', overBottle: true },
  { id: 'A', label: '안동 입지', andong: true },
  { id: 'M3', label: '마케팅 300만 (게임 기본값)', marketing: 3_000_000 },
  { id: 'M1', label: '마케팅 100만', marketing: 1_000_000 },
  { id: 'M0', label: '마케팅 0', marketing: 0 },
  { id: 'M3+V', label: '마케팅 300만 + 비지터 없음', marketing: 3_000_000, noVisitor: true },
  { id: 'V+S27', label: '비지터 없음 + 27개월 생산 0', noVisitor: true, stopAt: 27 },
  { id: '1차', label: '안동 + 몰트 감축 + 과잉 병입', andong: true, cut: [24, 60], overBottle: true },
  { id: '1차+V', label: '1차 + 비지터 없음', andong: true, cut: [24, 60], overBottle: true, noVisitor: true },
];

const act = (s: GameState, a: Action) => applyAction(s, a).state;
const stockOf = (s: GameState, cat: ProductCategory) => s.commerce.products.filter((p) => p.category === cat).reduce((t, p) => t + p.stockBottles, 0);
const recipe = (s: GameState, kind: 'soju' | 'malt') => s.production.recipes.find((r) => r.kind === kind && !r.mashBill.some((m) => m.ingredientId === 'malt_peated'))?.id;
const demandLast = (s: GameState, cat: ProductCategory) => {
  const ids = new Set(s.commerce.products.filter((p) => p.category === cat).map((p) => p.id));
  return (s.history.reports.at(-1)?.sales ?? []).filter((x) => ids.has(x.productId)).reduce((t, x) => t + x.demandBottles, 0);
};
const setOrders = (s: GameState, soju: number, malt: number) => {
  s = act(s, { type: 'setOrder', recipeId: recipe(s, 'soju')!, batchesPerMonth: soju });
  return act(s, { type: 'setOrder', recipeId: recipe(s, 'malt')!, batchesPerMonth: malt });
};

function fill(s: GameState): GameState {
  const cap = warehouseCapacity(s);
  for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) {
    const need = Math.ceil((lot.volumeL * lot.abv) / (200 * 0.635));
    const room = cap - s.inventory.casks.filter((c) => c.contents).length;
    if (room <= 0) return s;
    const n = Math.min(need, room);
    const empty = s.inventory.casks.filter((c) => !c.contents && !c.contamination).length;
    if (empty < n && s.finance.cash > 60_000_000) s = act(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: n - empty });
    const ids = s.inventory.casks.filter((c) => !c.contents && !c.contamination).slice(0, n).map((c) => c.id);
    if (!ids.length) return s;
    s = act(s, { type: 'fillCasks', lotId: lot.id, caskIds: ids, entryAbv: 0.635 });
  }
  return s;
}

function bottle(s: GameState, g: Gap): GameState {
  for (const lot of [...s.inventory.lots]) {
    if (lot.kind === 'soju' && (g.overBottle || stockOf(s, 'soju_distilled') < 1500) && s.month - lot.createdMonth >= 1)
      s = act(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: lot.volumeL }], options: { name: `소주 ${s.month}`, targetAbv: 0.25, bottleMl: 375, chillFilter: true, packagingId: 'standard' } });
  }
  const stock = stockOf(s, 'whisky');
  const target = Math.max(600, demandLast(s, 'whisky') * 1.5);
  if (stock < target) {
    const n = Math.min(10, Math.max(1, Math.ceil((target - stock) / 330)));
    const ready = s.inventory.casks.filter((c) => c.contents?.kind === 'malt' && c.contents.oakMonths >= 12).sort((a, b) => b.contents!.oakMonths - a.contents!.oakMonths).slice(0, n);
    if (ready.length) {
      const comps = ready.map((c) => ({ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL }));
      const opts = { name: `싱글 몰트 ${s.month}`, targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };
      if (previewBlend(s, comps, opts).ok) s = act(s, { type: 'bottle', components: comps, options: opts });
    }
  }
  return s;
}

// mvp-survival.ts와 같은 대출 순서 (고금리 급전 #160은 쓰지 않는다 — 기준과 맞추려고)
function finance(s: GameState): GameState {
  const has = (id: string) => s.finance.loans.some((l) => l.offerId === id);
  if (s.finance.cash < 200_000_000 && !has('kr_regional')) s = act(s, { type: 'takeLoan', offerId: 'kr_regional', amount: 300_000_000 });
  if (s.finance.cash < 100_000_000 && !has('kr_startup')) s = act(s, { type: 'takeLoan', offerId: 'kr_startup', amount: 200_000_000 });
  if (s.finance.cash < 100_000_000 && !has('working')) s = act(s, { type: 'takeLoan', offerId: 'working', amount: 300_000_000 });
  if (s.finance.cash < 50_000_000 && !has('facility')) s = act(s, { type: 'takeLoan', offerId: 'facility', amount: 500_000_000 });
  if (s.production.flags.producedSoju && !has('policy') && s.finance.cash < 300_000_000) s = act(s, { type: 'takeLoan', offerId: 'policy', amount: 200_000_000 });
  if (s.finance.cash < 30_000_000) for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) s = act(s, { type: 'sellBulk', source: 'lot', id: lot.id });
  return s;
}

function netWorth(s: GameState): number {
  const stock = [...s.inventory.lots, ...s.inventory.casks.flatMap((c) => (c.contents ? [c.contents] : []))].reduce((t, l) => t + l.volumeL * l.abv * bulkValuePerLPA(s, l) * 0.85, 0);
  const products = s.commerce.products.reduce((t, p) => t + p.stockBottles * p.unitCost, 0);
  return s.finance.cash - s.finance.loans.reduce((t, l) => t + l.balance, 0) + stock + products + s.finance.receivables.reduce((t, r) => t + r.amount, 0);
}

interface Row { bankrupt: boolean; month: number; minCashMonth: number; goal: boolean; nw: number; loansMax: number; years: string[] }

function play(g: Gap, seed: number, wantYears: boolean): Row {
  const site = MVP_KR.site;
  if (g.andong) MVP_KR.site = 'andong';
  let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: TIER, loanAmount: 0, seed });
  MVP_KR.site = site;
  s = act(s, { type: 'setMarketing', amount: g.marketing ?? 5_000_000 });
  if (!g.noVisitor) s = act(s, { type: 'buyEquipment', catalogId: 'visitor_basic' });
  s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' });
  s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' });
  s = setOrders(s, 2, 5);
  let minCash = s.finance.cash, minCashMonth = 0, loansMax = 0;
  const reps: GameState['history']['reports'] = [];
  const fixed: number[] = [];
  for (let m = 0; m < MONTHS && s.status === 'running'; m++) {
    if (g.stopAt === m) s = setOrders(s, 0, 0);
    if (g.cut && m === g.cut[0]) s = setOrders(s, 2, 1);
    if (g.cut && m === g.cut[1]) s = setOrders(s, 2, 5);
    s = bottle(s, g);
    s = fill(s);
    s = finance(s);
    fixed.push(monthlyFixedCost(s));
    s = advanceMonth(s);
    const last = s.history.reports.at(-1);
    if (last) reps.push(last);
    if (s.finance.cash < minCash) { minCash = s.finance.cash; minCashMonth = s.month; }
    loansMax = Math.max(loansMax, s.finance.loans.reduce((x, l) => x + l.balance, 0));
  }
  const years: string[] = [];
  if (wantYears) {
    const cats = new Map([...s.commerce.products, ...s.commerce.productArchive].map((x) => [x.id, x.category]));
    for (let y = 0; y * 12 < reps.length && y < 8; y++) {
      const rs = reps.filter((r) => r.month >= y * 12 && r.month < y * 12 + 12);
      const rev = (cat: string) => rs.flatMap((r) => r.sales).filter((x) => cats.get(x.productId) === cat).reduce((a, x) => a + x.revenue, 0);
      const tour = rs.reduce((a, r) => a + (r.tourismRevenue ?? 0), 0);
      const exp = (k: string) => rs.reduce((a, r) => a + (r.expenses[k] ?? 0), 0);
      const fx = fixed.slice(y * 12, y * 12 + 12).reduce((a, b) => a + b, 0);
      const e = (v: number) => (v / 1e8).toFixed(2);
      years.push(`| ${y + 1} | ${e(rev('soju_distilled'))} | ${e(rev('whisky'))} | ${e(tour)} | ${e(exp('salaries'))} | ${e(exp('overhead'))} | ${e(exp('marketing'))} | ${e(exp('interest') + exp('principal'))} | ${e(fx)} | ${e(rs.at(-1)?.cashEnd ?? 0)} |`);
    }
  }
  const nw = s.status === 'bankrupt' ? NaN : netWorth(s);
  return { bankrupt: s.status === 'bankrupt', month: s.month, minCashMonth, goal: !!s.scenario && nw >= s.scenario.equity * s.scenario.goal.netWorthMultiple, nw, loansMax, years };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
if (!process.env.ONLY) console.log(`MVP 경제 진단 — MVP ${TIER}, ${SEEDS}시드 × ${MONTHS}개월, 균형 봇(소주 2 · 몰트 5) 기준, 시작 대출 0`);
if (!process.env.ONLY) console.log('| 변형 | 파산 | 평균 파산 월 | 최저 현금 달(중앙) | 목표 ×3 달성 | 최대 대출 잔액 평균 | 15년 순자산 평균(생존) |');
if (!process.env.ONLY) console.log('|---|---|---|---|---|---|---|');
let baseYears: string[] = [];
const ONLY = new Set((process.env.ONLY ?? '').split(',').filter(Boolean));
for (const g of GAPS.filter((x) => !ONLY.size || ONLY.has(x.id))) {
  const rows = Array.from({ length: SEEDS }, (_, i) => play(g, i + 1, process.env.YEARS === '1' && g.id === 'base' && i === 0));
  if (g.id === 'base') baseYears = rows[0]!.years;
  const br = rows.filter((r) => r.bankrupt);
  const mins = rows.map((r) => r.minCashMonth).sort((a, b) => a - b);
  console.log(`| ${g.label} | ${br.length}/${SEEDS} | ${br.length ? Math.round(avg(br.map((r) => r.month))) : '—'} | ${mins[Math.floor(mins.length / 2)]} | ${rows.filter((r) => r.goal).length}/${SEEDS} | ${(avg(rows.map((r) => r.loansMax)) / 1e8).toFixed(1)}억 | ${(avg(rows.filter((r) => !r.bankrupt).map((r) => r.nw)) / 1e8).toFixed(1)}억 |`);
}
if (baseYears.length) {
  console.log('\n기준 봇 시드 1 — 연도별 (억 원)');
  console.log('| 년 | 소주 매출 | 위스키 매출 | 관광 | 급여 | 관리비 | 마케팅 | 대출 원리금 | 월 고정비 예상 합 | 연말 현금 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const l of baseYears) console.log(l);
}
