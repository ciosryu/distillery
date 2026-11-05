// 헤드리스 밸런스 시뮬레이션 — 전략별 단순 정책으로 N개 시드를 돌려 파산률·흑자 전환 시점·매출 구성을 본다.
// 실행: npm run balance [-- 시드수 개월수 전략]   전략 = brand | hybrid | expand | stock | all(기본)
import { advanceMonth, applyAction, previewBlend, newGame, type Action, type GameState, type ProductCategory } from '../src/sim';

const SEEDS = Number(process.argv[2] ?? 12);
const MONTHS = Number(process.argv[3] ?? 120);
const WHICH = process.argv[4] ?? 'all';

type Strategy = 'brand' | 'hybrid' | 'expand' | 'stock';

const act = (s: GameState, a: Action) => applyAction(s, a).state;
const stockOf = (s: GameState, cat: ProductCategory) => s.products.filter((p) => p.category === cat).reduce((t, p) => t + p.stockBottles, 0);
const rid = (s: GameState, prefix: string) => s.recipes.find((r) => r.name.startsWith(prefix))?.id;
const BIG_RECIPE = 'B2B 몰트';

function bottleCashProducts(s: GameState): GameState {
  for (const lot of [...s.lots]) {
    if (lot.kind === 'soju' && stockOf(s, 'soju_distilled') < 1500 && s.month - lot.createdMonth >= 1)
      s = act(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: lot.volumeL }], options: { name: `소주 ${s.month}`, targetAbv: 0.25, bottleMl: 375, chillFilter: true, packagingId: 'standard' } });
    if (lot.kind === 'gin' && stockOf(s, 'gin') < 1500)
      s = act(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: lot.volumeL }], options: { name: `진 ${s.month}`, targetAbv: 0.43, bottleMl: 700, chillFilter: true, packagingId: 'standard' } });
  }
  return s;
}

/** 몰트 원액을 최대 maxLPA만큼 캐스크에 통입 (빈 통 부족 시 구매) */
function fillMalt(s: GameState, maxLPA = Infinity): GameState {
  let budget = maxLPA;
  for (const lot of s.lots.filter((l) => l.kind === 'malt')) {
    if (budget <= 0) break;
    const lpa = Math.min(budget, lot.volumeL * lot.abv);
    const need = Math.ceil(lpa / (200 * 0.635));
    const empty = s.casks.filter((c) => !c.contents);
    if (empty.length < need && s.cash > 100_000_000) s = act(s, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: need - empty.length });
    s = act(s, { type: 'fillCasks', lotId: lot.id, caskIds: s.casks.filter((c) => !c.contents).slice(0, need).map((c) => c.id), entryAbv: 0.635 });
    budget -= lpa;
  }
  return s;
}

function bottleWhisky(s: GameState): GameState {
  if (stockOf(s, 'whisky') >= 800) return s;
  const ready = s.casks.filter((c) => c.contents && c.contents.oakMonths >= 36 && !c.contents.sourced).slice(0, 3);
  if (!ready.length) return s;
  const comps = ready.map((c) => ({ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL }));
  const opts = { name: `싱글 몰트 ${s.month}`, targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };
  return previewBlend(s, comps, opts).ok ? act(s, { type: 'bottle', components: comps, options: opts }) : s;
}

function finance(s: GameState): GameState {
  if (s.cash < 100_000_000 && !s.loans.some((l) => l.offerId === 'working')) s = act(s, { type: 'takeLoan', offerId: 'working', amount: 300_000_000 });
  if (s.cash < 50_000_000 && !s.loans.some((l) => l.offerId === 'facility')) s = act(s, { type: 'takeLoan', offerId: 'facility', amount: 500_000_000 });
  if (s.flags.producedSoju && !s.loans.some((l) => l.offerId === 'policy') && s.cash < 300_000_000) s = act(s, { type: 'takeLoan', offerId: 'policy', amount: 200_000_000 });
  return s;
}

function acceptContracts(s: GameState, maxCommittedLPA: number): GameState {
  for (const o of [...s.contractOffers]) {
    const committed = s.contracts.reduce((t, c) => t + c.lpaPerMonth, 0);
    if (o.style !== 'peated' && o.minQuality <= 42 && committed + o.lpaPerMonth <= maxCommittedLPA) s = act(s, { type: 'acceptContract', offerId: o.id });
  }
  return s;
}

function start(s: GameState, strategy: Strategy): GameState {
  const sales = s.candidates.filter((c) => c.role === 'sales').sort((a, b) => b.stats.b - a.stats.b)[0];
  if (sales) s = act(s, { type: 'hire', candidateId: sales.id });
  s = act(s, { type: 'setMarketing', amount: 5_000_000 });
  s = act(s, { type: 'setOrder', recipeId: rid(s, '증류식')!, batchesPerMonth: 2 });
  s = act(s, { type: 'setOrder', recipeId: rid(s, '런던')!, batchesPerMonth: 1 });
  if (strategy === 'hybrid') {
    // 혼합형: 발효조 증설로 몰트 생산을 늘리고, 브랜드가 소화 못 할 몫만 계약으로
    s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' });
    s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' });
    return act(s, { type: 'setOrder', recipeId: rid(s, '싱글 몰트 — 언')!, batchesPerMonth: 7 });
  }
  return act(s, { type: 'setOrder', recipeId: rid(s, '싱글 몰트 — 언')!, batchesPerMonth: 4 });
}

/** 확장형: 위스키 판매가 자리 잡은 뒤(48개월~, 현금 4억↑) 증류기 1기를 추가해 B2B 공급을 붙인다 */
function expand(s: GameState): GameState {
  if (s.recipes.some((r) => r.name === BIG_RECIPE) || s.month < 48 || s.cash < 400_000_000) return s;
  s = act(s, { type: 'buyEquipment', catalogId: 'pot_onion_1000' });
  s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' });
  s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' });
  const still = s.equipment.filter((e) => e.catalogId === 'pot_onion_1000').at(-1)!;
  const base = s.recipes.find((r) => r.name.startsWith('싱글 몰트 — 언'))!;
  const { id: _id, ...rest } = base;
  return act(s, { type: 'saveRecipe', recipe: { ...rest, name: BIG_RECIPE, stillId: still.id } });
}

function policy(s: GameState, strategy: Strategy): GameState {
  if (s.month === 0) s = start(s, strategy);
  s = bottleCashProducts(s);
  if (strategy === 'brand') {
    s = fillMalt(s);
  } else if (strategy === 'hybrid') {
    // 몰트 생산의 약 30%까지만 계약, 나머지는 숙성. 위스키 재고가 쌓이면 오래된 캐스크를 현물 판매
    s = acceptContracts(s, 200);
    s = fillMalt(s);
    if (stockOf(s, 'whisky') > 2000) {
      const old = s.casks.find((c) => c.contents && c.contents.oakMonths >= 48 && !c.contents.sourced);
      if (old) s = act(s, { type: 'sellBulk', source: 'cask', id: old.id });
    }
  } else if (strategy === 'stock') {
    // 숙성 재고형: 증설분까지 전부 통입해 숙성하고, 48개월 이상 캐스크 중 브랜드가 쓰고 남는 몫을 블렌더에 판매
    s = expand(s);
    const r = s.recipes.find((x) => x.name === BIG_RECIPE);
    const still = r && s.equipment.find((e) => e.id === r.stillId);
    if (r && still && still.readyMonth <= s.month && !s.orders.some((o) => o.recipeId === r.id)) s = act(s, { type: 'setOrder', recipeId: r.id, batchesPerMonth: 10 });
    s = fillMalt(s);
    const aged = s.casks.filter((c) => c.contents && c.contents.oakMonths >= 48 && !c.contents.sourced);
    const keep = 12; // 브랜드 병입용으로 남겨 둘 캐스크 수
    for (const c of aged.slice(0, Math.max(0, Math.min(6, aged.length - keep)))) s = act(s, { type: 'sellBulk', source: 'cask', id: c.id });
    if (s.casks.length > 140 && !s.equipment.some((e) => e.catalogId === 'warehouse_rack_100') && s.cash > 200_000_000) s = act(s, { type: 'buyEquipment', catalogId: 'warehouse_rack_100' });
  } else {
    s = expand(s);
    const r = s.recipes.find((x) => x.name === BIG_RECIPE);
    const still = r && s.equipment.find((e) => e.id === r.stillId);
    const ready = !!still && still.readyMonth <= s.month;
    if (r && ready && !s.orders.some((o) => o.recipeId === r.id)) s = act(s, { type: 'setOrder', recipeId: r.id, batchesPerMonth: 10 });
    if (r && still && still.readyMonth <= s.month + 3) s = acceptContracts(s, 450);
    // 증설분은 계약 납품, 남는 원액 중 브랜드용 월 250 LPA만 통입하고 나머지는 현물 판매
    if (ready) {
      s = fillMalt(s, 250);
      for (const lot of s.lots.filter((l) => l.kind === 'malt')) s = act(s, { type: 'sellBulk', source: 'lot', id: lot.id });
    } else s = fillMalt(s);
  }
  s = bottleWhisky(s);
  return finance(s);
}

const eok = (v: number) => (Number.isFinite(v) ? `${(v / 1e8).toFixed(2)}억` : '—');
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

function run(strategy: Strategy) {
  let bankrupt = 0;
  const fp: number[] = [];
  const minCash: number[] = [];
  const cash60: number[] = [];
  const cash120: number[] = [];
  const y5retail: number[] = [];
  const y5bulk: number[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    let s = newGame({ seed });
    let lo = s.cash;
    for (let m = 0; m < MONTHS && s.status === 'running'; m++) {
      s = advanceMonth(policy(s, strategy));
      lo = Math.min(lo, s.cash);
      if (s.month === 60) cash60.push(s.cash);
      if (s.month === 120) cash120.push(s.cash);
    }
    minCash.push(lo);
    if (s.status === 'bankrupt') bankrupt++;
    const net = s.reports.map((r) => r.netCash);
    for (let i = 2; i < net.length; i++) if ((net[i]! + net[i - 1]! + net[i - 2]!) / 3 > 0) { fp.push(i); break; }
    const y5 = s.reports.filter((r) => r.month >= 48 && r.month < 60);
    y5retail.push(y5.reduce((t, r) => t + r.revenue, 0));
    y5bulk.push(y5.reduce((t, r) => t + r.bulkRevenue, 0));
  }
  console.log(`${strategy.padEnd(9)} | 파산 ${bankrupt}/${SEEDS} | 흑자 전환 ${fp.length}/${SEEDS} 평균 ${Math.round(avg(fp))}개월 | 최저 현금 평균 ${eok(avg(minCash))} | 60m ${eok(avg(cash60))} | 120m ${eok(avg(cash120))} | 5년차 매출: 병입 ${eok(avg(y5retail))} + 원액 B2B ${eok(avg(y5bulk))}`);
}

const list: Strategy[] = WHICH === 'all' ? ['brand', 'hybrid', 'expand', 'stock'] : [WHICH as Strategy];
for (const st of list) run(st);
