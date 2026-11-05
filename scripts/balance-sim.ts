// 헤드리스 밸런스 시뮬레이션 — 전략별 단순 정책으로 N개 시드를 돌려 파산률·흑자 전환 시점·매출 구성을 본다.
// 실행: npm run balance [-- 시드수 개월수 전략 지역 입지]   전략 = brand | hybrid | expand | grain | all(기본), 지역 = KR(기본) | JP | TW
import { advanceMonth, applyAction, bulkValuePerLPA, capacityLPA, lotQuality, previewBlend, newGame, whiskyMinMonths, type Action, type ContractTerms, type GameState, type ProductCategory, type RegionId, type SpiritKind } from '../src/sim';
import { regionOf } from '../src/sim/content/regions';
import { EVENTS } from '../src/sim/content/events';

const SEEDS = Number(process.argv[2] ?? 12);
const MONTHS = Number(process.argv[3] ?? 120);
const WHICH = process.argv[4] ?? 'all';
const REGION = (process.argv[5] ?? 'KR') as RegionId;
/** 지역 안의 입지 (예: TW kinmen, KR andong). 비우면 기본 입지 */
const SITE = process.argv[6];
const BRIDGE = process.env.NO_BRIDGE !== '1';
const YOUNG = process.env.NO_YOUNG !== '1';
const TOUR = process.env.NO_TOUR !== '1';
const DEFEND = process.env.NO_DEFEND !== '1';

type Strategy = 'brand' | 'hybrid' | 'expand' | 'grain';

const act = (s: GameState, a: Action) => applyAction(s, a).state;
const stockOf = (s: GameState, cat: ProductCategory) => s.products.filter((p) => p.category === cat).reduce((t, p) => t + p.stockBottles, 0);
/** 지역마다 프리셋 이름이 다르므로 kind(+피트 여부)로 첫 레시피를 찾는다 */
const recipeOf = (s: GameState, kind: SpiritKind) => s.recipes.find((r) => r.kind === kind && !r.mashBill.some((m) => m.ingredientId === 'malt_peated'));
const rid = (s: GameState, kind: SpiritKind) => recipeOf(s, kind)?.id;
const BIG_RECIPE = 'B2B 몰트';

function bottleCashProducts(s: GameState): GameState {
  for (const lot of [...s.lots]) {
    if (lot.kind === 'soju' && stockOf(s, 'soju_distilled') < 1500 && s.month - lot.createdMonth >= 1)
      s = act(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: lot.volumeL }], options: { name: `소주 ${s.month}`, targetAbv: 0.25, bottleMl: 375, chillFilter: true, packagingId: 'standard' } });
    // 한국은 중식당용 34%·500ml, 대만은 진먼식 58%·600ml
    if (lot.kind === 'baijiu' && stockOf(s, 'baijiu') < 1500 && s.month - lot.createdMonth >= 1)
      s = act(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: lot.volumeL }], options: { name: `고량주 ${s.month}`, targetAbv: s.regionId === 'TW' ? 0.58 : 0.34, bottleMl: s.regionId === 'TW' ? 600 : 500, chillFilter: true, packagingId: 'standard' } });
    if (lot.kind === 'gin' && stockOf(s, 'gin') < 1500)
      s = act(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: lot.volumeL }], options: { name: `진 ${s.month}`, targetAbv: 0.43, bottleMl: 700, chillFilter: true, packagingId: 'standard' } });
  }
  return s;
}

/** 몰트(또는 그레인) 원액을 최대 maxLPA만큼 캐스크에 통입 (빈 통 부족 시 구매) */
function fillMalt(s: GameState, maxLPA = Infinity, kind: 'malt' | 'grain' = 'malt'): GameState {
  let budget = maxLPA;
  for (const lot of s.lots.filter((l) => l.kind === kind)) {
    if (budget <= 0) break;
    const lpa = Math.min(budget, lot.volumeL * lot.abv);
    const need = Math.ceil(lpa / (200 * 0.635));
    const empty = s.casks.filter((c) => !c.contents && !c.contamination);
    // v1.0: 쿠퍼리지 주문은 2개월 걸리므로 모자라면 스팟으로 메운다(웃돈·골빈 통 위험)
    if (empty.length < need && s.cash > 100_000_000) s = act(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: need - empty.length });
    s = act(s, { type: 'fillCasks', lotId: lot.id, caskIds: s.casks.filter((c) => !c.contents && !c.contamination).slice(0, need).map((c) => c.id), entryAbv: 0.635 });
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

/** 공백기 브리지: ① 현금이 모자라면 법정 최소 숙성이 지난 자사 어린 위스키(12개월 이상)를 1캐스크 병입하거나
 *  ② 브로커 숙성 원액을 사서 병입한다(결정 #20). 매입 원액은 브랜드 가치가 낮아 한국 외에서는 잘 안 팔린다 (v0.8) */
function bridgeSourced(s: GameState): GameState {
  if (s.month >= 42 || stockOf(s, 'whisky') >= 400) return s;
  const minM = Math.max(12, whiskyMinMonths(regionOf(s).whisky));
  const young = s.casks.find((c) => c.contents && c.contents.kind === 'malt' && !c.contents.sourced && c.contents.oakMonths >= minM);
  // 어린 위스키 출시는 현금이 모자랄 때만 (숙성 재고를 헐값에 파는 셈이므로)
  if (YOUNG && young && s.cash < 200_000_000) {
    const comps = [{ source: 'cask' as const, id: young.id, liters: young.contents!.volumeL }];
    const opts = { name: `어린 싱글 몰트 ${s.month}`, targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };
    if (previewBlend(s, comps, opts).ok) return act(s, { type: 'bottle', components: comps, options: opts });
  }
  if (s.cash < 150_000_000) return s;
  const owned = s.casks.find((c) => c.contents?.sourced);
  if (!owned) {
    const o = [...s.brokerOffers].sort((a, b) => a.price - b.price)[0];
    if (o && o.price < s.cash - 120_000_000) s = act(s, { type: 'buyBrokerCask', offerId: o.id });
  }
  const c = s.casks.find((x) => x.contents?.sourced);
  if (!c) return s;
  const comps = [{ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL }];
  const opts = { name: `매입 원액 병입 ${s.month}`, targetAbv: 0.43, bottleMl: 700, chillFilter: true, packagingId: 'standard' };
  return previewBlend(s, comps, opts).ok ? act(s, { type: 'bottle', components: comps, options: opts }) : s;
}

/** 그레인 수직계열화: 36개월 이후 그레인 2 + 몰트 1 캐스크로 블렌디드 위스키를 병입 */
function bottleBlended(s: GameState): GameState {
  if (stockOf(s, 'blended_whisky') >= 1500) return s;
  const aged = (k: 'malt' | 'grain') => s.casks.filter((c) => c.contents && c.contents.kind === k && c.contents.oakMonths >= 36 && !c.contents.sourced);
  const g = aged('grain').slice(0, 2);
  const m = aged('malt').slice(0, 1);
  if (g.length < 2 || !m.length) return s;
  const comps = [...g, ...m].map((c) => ({ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL }));
  const opts = { name: `블렌디드 ${s.month}`, targetAbv: 0.4, bottleMl: 700, chillFilter: true, packagingId: 'standard' };
  return previewBlend(s, comps, opts).ok ? act(s, { type: 'bottle', components: comps, options: opts }) : s;
}

/** v1.0 운영: 빈 통을 미리 쿠퍼리지에 주문하고, 소매 역량이 넘치면 영업 직원을 늘린다 */
function operations(s: GameState, strategy: Strategy): GameState {
  // 비운 오염 통은 재탄화해서 다시 쓴다
  for (const c of s.casks.filter((x) => !x.contents && x.contamination && x.recharCount < 2)) if (s.cash > 100_000_000) s = act(s, { type: 'rechar', caskId: c.id });
  const empty = s.casks.filter((c) => !c.contents && !c.contamination).length + s.caskOrders.reduce((t, o) => t + o.qty, 0);
  if (empty < 12 && s.cash > 150_000_000) s = act(s, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: 12 });
  const last = s.reports.at(-1);
  const sales = s.staff.filter((x) => x.role === 'sales').length;
  if (last?.overflowCases && last.overflowCases > 20 && sales < 4 && s.cash > 150_000_000) {
    const c = s.candidates.filter((x) => x.role === 'sales').sort((a, b) => b.stats.b - a.stats.b)[0];
    if (c) s = act(s, { type: 'hire', candidateId: c.id });
  }
  // 방재: 이 지역에서 일어나는 재해의 방재 설비를 여유 현금으로 하나씩 갖춘다
  // 공백기 자금을 말리지 않도록 숙성 위스키가 나오기 시작한 뒤(36개월~), 현금 여유가 클 때만
  if (DEFEND && s.month >= 36 && s.cash > 500_000_000) {
    const need = EVENTS.filter((e) => e.defense && (!e.regions || e.regions.includes(s.regionId))).map((e) => e.defense!).find((id) => !s.equipment.some((x) => x.catalogId === id));
    if (need) s = act(s, { type: 'buyEquipment', catalogId: need });
  }
  void strategy;
  return s;
}

function finance(s: GameState): GameState {
  // 한국 완화책(#73): 저리 지역 정책자금을 먼저 쓴다
  if (s.regionId === 'KR' && s.cash < 200_000_000 && !s.loans.some((l) => l.offerId === 'kr_regional')) s = act(s, { type: 'takeLoan', offerId: 'kr_regional', amount: 300_000_000 });
  if (s.regionId === 'KR' && s.cash < 100_000_000 && !s.loans.some((l) => l.offerId === 'kr_startup')) s = act(s, { type: 'takeLoan', offerId: 'kr_startup', amount: 200_000_000 });
  if (s.cash < 100_000_000 && !s.loans.some((l) => l.offerId === 'working')) s = act(s, { type: 'takeLoan', offerId: 'working', amount: 300_000_000 });
  if (s.cash < 50_000_000 && !s.loans.some((l) => l.offerId === 'facility')) s = act(s, { type: 'takeLoan', offerId: 'facility', amount: 500_000_000 });
  if (s.flags.producedSoju && !s.loans.some((l) => l.offerId === 'policy') && s.cash < 300_000_000) s = act(s, { type: 'takeLoan', offerId: 'policy', amount: 200_000_000 });
  return s;
}

function acceptContracts(s: GameState, maxCommittedLPA: number, spirit: ContractTerms['spirit'] = 'malt_newmake'): GameState {
  for (const o of [...s.contractOffers]) {
    if (o.spirit !== spirit) continue;
    // 크래프트 계약(#78)은 일반 계약과 별도 한도(몰트 생산 능력의 25%)를 쓰고, 최근 몰트 뉴메이크 품질로 판단
    const craft = !!o.craft;
    const committed = s.contracts.filter((c) => c.spirit === spirit && !!c.craft === craft).reduce((t, c) => t + c.lpaPerMonth, 0);
    const cap = craft ? capacityLPA(s, 'malt') * 0.25 : maxCommittedLPA;
    const recent = s.lots.filter((l) => l.kind === 'malt').at(-1);
    const qOk = spirit === 'grain_newmake' ? o.minQuality <= 36 : craft ? !!recent && lotQuality(recent) >= o.minQuality + 0.5 : o.minQuality <= 42;
    if (o.style !== 'peated' && qOk && committed + o.lpaPerMonth <= cap) s = act(s, { type: 'acceptContract', offerId: o.id });
  }
  return s;
}

const GRAIN_RECIPE = '그레인 B2B';

function start(s: GameState, strategy: Strategy): GameState {
  const sales = s.candidates.filter((c) => c.role === 'sales').sort((a, b) => b.stats.b - a.stats.b)[0];
  if (sales) s = act(s, { type: 'hire', candidateId: sales.id });
  s = act(s, { type: 'setMarketing', amount: 5_000_000 });
  // v1.0: 모든 전략이 베이직 투어 비지터 센터로 초반 현금 흐름을 만든다
  if (TOUR) s = act(s, { type: 'buyEquipment', catalogId: 'visitor_basic' });
  // 한국: 전통주 요건(농업경영체 등록) — 국산 쌀·누룩 소주를 전통주로
  if (s.regionId === 'KR') s = act(s, { type: 'buyEquipment', catalogId: 'kr_farm_registration' });
  const soju = rid(s, 'soju');
  if (soju) s = act(s, { type: 'setOrder', recipeId: soju, batchesPerMonth: 2 });
  // 한국은 진 시장이 작으므로(결정 #45) 진 대신 고량주를 현금 제품으로 쓴다
  const baijiu = rid(s, 'baijiu');
  if (baijiu) s = act(s, { type: 'setOrder', recipeId: baijiu, batchesPerMonth: 1 });
  else s = act(s, { type: 'setOrder', recipeId: rid(s, 'gin')!, batchesPerMonth: soju ? 1 : 2 });
  if (strategy === 'hybrid' || strategy === 'brand') {
    // 브랜드형·혼합형은 같은 생산 능력(발효조 증설 + 몰트 7배치)으로 비교한다 — 차이는 B2B 계약 여부뿐
    // 혼합형: 브랜드가 소화 못 할 몫만 계약으로
    s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' });
    s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' });
    return act(s, { type: 'setOrder', recipeId: rid(s, 'malt')!, batchesPerMonth: 7 });
  }
  if (strategy === 'grain') {
    // 그레인 공급형: 시설자금으로 연속식 증류기를 들여 국내 블렌더에 그레인 원액을 대량 공급
    s = act(s, { type: 'takeLoan', offerId: 'facility', amount: 1_000_000_000 });
    s = act(s, { type: 'buyEquipment', catalogId: 'column_2' });
    s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_10000' });
    s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_10000' });
    const col = s.equipment.find((e) => e.catalogId === 'column_2')!;
    const base = recipeOf(s, 'malt')!;
    const { id: _id, ...rest } = base;
    s = act(s, { type: 'saveRecipe', recipe: { ...rest, name: GRAIN_RECIPE, kind: 'grain', stillId: col.id, mashBill: [{ ingredientId: 'corn', ratio: 0.9 }, { ingredientId: 'malt_unpeated', ratio: 0.1 }], fermentDays: 3, runs: 1 } });
  }
  return act(s, { type: 'setOrder', recipeId: rid(s, 'malt')!, batchesPerMonth: 4 });
}

/** 확장형: 위스키 판매가 자리 잡은 뒤(48개월~, 현금 4억↑) 증류기 1기를 추가해 몰트 B2B 공급을 붙인다 */
function expand(s: GameState): GameState {
  if (s.recipes.some((r) => r.name === BIG_RECIPE) || s.month < 48 || s.cash < 400_000_000) return s;
  s = act(s, { type: 'buyEquipment', catalogId: 'pot_onion_1000' });
  s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' });
  s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' });
  const still = s.equipment.filter((e) => e.catalogId === 'pot_onion_1000').at(-1)!;
  const base = recipeOf(s, 'malt')!;
  const { id: _id, ...rest } = base;
  return act(s, { type: 'saveRecipe', recipe: { ...rest, name: BIG_RECIPE, stillId: still.id } });
}

function sellLots(s: GameState, kind: 'malt' | 'grain'): GameState {
  for (const lot of s.lots.filter((l) => l.kind === kind)) s = act(s, { type: 'sellBulk', source: 'lot', id: lot.id });
  return s;
}

function policy(s: GameState, strategy: Strategy): GameState {
  if (s.month === 0) s = start(s, strategy);
  s = bottleCashProducts(s);
  if (strategy === 'brand') {
    s = fillMalt(s);
  } else if (strategy === 'hybrid') {
    // 몰트 생산의 일부만 계약, 나머지는 숙성. 위스키 재고가 쌓이면 오래된 캐스크를 현물 판매
    // v1.3: 몰트 생산 능력의 절반까지 계약
    // v1.4: 혼합형은 '과도기 전략' — 위스키가 익기 전 첫 36개월만 계약으로 현금을 만든다 (HYB_UNTIL로 바꿀 수 있음)
    if (s.month < Number(process.env.HYB_UNTIL ?? 36)) s = acceptContracts(s, capacityLPA(s, 'malt') * 0.5);
    s = fillMalt(s);
    if (stockOf(s, 'whisky') > 2000) {
      const old = s.casks.find((c) => c.contents && c.contents.oakMonths >= 48 && !c.contents.sourced);
      if (old) s = act(s, { type: 'sellBulk', source: 'cask', id: old.id });
    }
  } else if (strategy === 'grain') {
    const r = s.recipes.find((x) => x.name === GRAIN_RECIPE);
    const col = r && s.equipment.find((e) => e.id === r.stillId);
    if (r && col && col.readyMonth <= s.month && !s.orders.some((o) => o.recipeId === r.id)) s = act(s, { type: 'setOrder', recipeId: r.id, batchesPerMonth: 12 });
    if (col && col.readyMonth <= s.month + 3) s = acceptContracts(s, 6000, 'grain_newmake');
    // 그레인 일부(월 300 LPA)는 자사 블렌디드용으로 통입, 나머지는 현물 판매
    s = fillMalt(s, 300, 'grain');
    s = sellLots(s, 'grain');
    s = fillMalt(s);
    s = bottleBlended(s);
  } else {
    s = expand(s);
    const r = s.recipes.find((x) => x.name === BIG_RECIPE);
    const still = r && s.equipment.find((e) => e.id === r.stillId);
    const ready = !!still && still.readyMonth <= s.month;
    if (r && ready && !s.orders.some((o) => o.recipeId === r.id)) s = act(s, { type: 'setOrder', recipeId: r.id, batchesPerMonth: 10 });
    if (r && still && still.readyMonth <= s.month + 3) s = acceptContracts(s, 450);
    // 증설분은 계약 납품, 남는 원액 중 브랜드용 월 250 LPA만 통입하고 나머지는 현물 판매
    if (ready) { s = fillMalt(s, 250); s = sellLots(s, 'malt'); } else s = fillMalt(s);
  }
  s = bottleWhisky(s);
  if (BRIDGE) s = bridgeSourced(s);
  s = operations(s, strategy);
  return finance(s);
}

const eok = (v: number) => (Number.isFinite(v) ? `${(v / 1e8).toFixed(2)}억` : '—');
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** 순자산 = 현금 − 대출 + 원액 재고(벌크 가치의 85%) + 제품 재고(원가) */
function netWorth(s: GameState): number {
  const stock = [...s.lots, ...s.casks.flatMap((c) => (c.contents ? [c.contents] : []))].reduce((t, l) => t + l.volumeL * l.abv * bulkValuePerLPA(s, l) * 0.85, 0);
  const products = s.products.reduce((t, p) => t + p.stockBottles * p.unitCost, 0);
  return (s.cash - s.loans.reduce((t, l) => t + l.balance, 0) + stock + products) * (1 - s.investorShare);
}

/** 보수적 순자산 = 원액 재고를 시가가 아닌 장부 원가로 평가 (회계상 재고 평가와 같음) */
function bookWorth(s: GameState): number {
  const stock = [...s.lots, ...s.casks.flatMap((c) => (c.contents ? [c.contents] : []))].reduce((t, l) => t + l.volumeL * l.abv * l.costPerLPA, 0);
  const products = s.products.reduce((t, p) => t + p.stockBottles * p.unitCost, 0);
  return s.cash - s.loans.reduce((t, l) => t + l.balance, 0) + stock + products;
}

interface Result { strategy: Strategy; bankrupt: boolean; minCash: number; netWorth: number; bookWorth: number; firstPositive: number; y5retail: number; y5bulk: number }

function play(strategy: Strategy, seed: number): Result {
  let s = newGame({ seed, region: REGION, site: SITE });
  let lo = s.cash;
  for (let m = 0; m < MONTHS && s.status === 'running'; m++) {
    s = advanceMonth(policy(s, strategy));
    lo = Math.min(lo, s.cash);
  }
  const net = s.reports.map((r) => r.netCash);
  let fp = -1;
  for (let i = 2; i < net.length; i++) if ((net[i]! + net[i - 1]! + net[i - 2]!) / 3 > 0) { fp = i; break; }
  const y5 = s.reports.filter((r) => r.month >= 48 && r.month < 60);
  return {
    strategy, bankrupt: s.status === 'bankrupt', minCash: lo, netWorth: s.status === 'bankrupt' ? -Infinity : netWorth(s), bookWorth: s.status === 'bankrupt' ? -Infinity : bookWorth(s), firstPositive: fp,
    y5retail: y5.reduce((t, r) => t + r.revenue, 0), y5bulk: y5.reduce((t, r) => t + r.bulkRevenue, 0),
  };
}

const list: Strategy[] = WHICH === 'all' ? ['brand', 'hybrid', 'expand', 'grain'] : [WHICH as Strategy];
const results: Record<Strategy, Result[]> = { brand: [], hybrid: [], expand: [], grain: [] };
const wins: Record<string, number> = {};
const bookWins: Record<string, number> = {};
const tally = (rs: Result[], by: 'netWorth' | 'bookWorth', into: Record<string, number>) => {
  const best = rs.reduce((a, b) => (b[by] > a[by] ? b : a));
  const key = best.bankrupt ? '전멸' : best.strategy;
  into[key] = (into[key] ?? 0) + 1;
};
for (let seed = 1; seed <= SEEDS; seed++) {
  const rs = list.map((st) => play(st, seed));
  rs.forEach((r) => results[r.strategy].push(r));
  tally(rs, 'netWorth', wins);
  tally(rs, 'bookWorth', bookWins);
}
for (const st of list) {
  const rs = results[st];
  const alive = rs.filter((r) => !r.bankrupt);
  const nw = alive.map((r) => r.netWorth);
  const sd = Math.sqrt(avg(nw.map((v) => (v - avg(nw)) ** 2)));
  const fps = rs.filter((r) => r.firstPositive >= 0).map((r) => r.firstPositive);
  console.log(`${st.padEnd(7)} | 파산 ${rs.length - alive.length}/${rs.length} | 순자산(${MONTHS}m) 평균 ${eok(avg(nw))} ±${eok(sd)} · 원가기준 ${eok(avg(alive.map((r) => r.bookWorth)))} | 최저 현금 평균 ${eok(avg(rs.map((r) => r.minCash)))} | 흑자 전환 평균 ${Math.round(avg(fps))}개월 | 5년차 매출 병입 ${eok(avg(rs.map((r) => r.y5retail)))} + B2B ${eok(avg(rs.map((r) => r.y5bulk)))} | 1위 ${wins[st] ?? 0}회`);
}
const dist = (w: Record<string, number>) => [...list, '전멸'].map((st) => `${st} ${w[st] ?? 0}`).join(' · ');
console.log(`\n[${REGION}${SITE ? '/' + SITE : ''}] 시드별 1위 분포(시가 평가): ${dist(wins)}`);
console.log(`[${REGION}] 시드별 1위 분포(원가 평가): ${dist(bookWins)}  (한 전략이 60% 이상 이기면 지배 전략 의심)`);
