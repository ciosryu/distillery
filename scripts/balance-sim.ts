// 헤드리스 밸런스 시뮬레이션 — 전략별 단순 정책으로 N개 시드를 돌려 파산률·흑자 전환 시점·매출 구성을 본다.
// 실행: npm run balance [-- 시드수 개월수 전략 지역]   전략 = brand | hybrid | expand | grain | all(기본)
//       지역 = 국가(KR | JP | TW → 표준 산지) 또는 산지(gyeonggi | andong | jeju | kanto | kansai | hokkaido | yilan)
import { advanceMonth, applyAction, bulkValuePerLPA, previewBlend, newGame, type Action, type ContractTerms, type GameState, type ProductCategory, type RegionId, type SiteId, type SpiritKind } from '../src/sim';
import { DEFAULT_SITE, SITES } from '../src/sim/content/sites';
import { REGIONS, setKrBaseDeduction } from '../src/sim/content/regions';
import { HOLDING } from '../src/sim/content/catalog';
import { OEM, oemPackageCost, oemSpareBatches } from '../src/sim/deals';

const SEEDS = Number(process.argv[2] ?? 12);
const MONTHS = Number(process.argv[3] ?? 120);
const WHICH = process.argv[4] ?? 'all';
const PLACE = process.argv[5] ?? 'KR';
const SITE: SiteId = PLACE in SITES ? (PLACE as SiteId) : DEFAULT_SITE[PLACE as RegionId] ?? 'gyeonggi';
const REGION = `${SITES[SITE].country}/${SITE}`;
const BRIDGE = process.env.NO_BRIDGE !== '1';
// 비교 실험용: KR_DEDUCTION=on|off 로 한국 세제 체계(기준판매비율 + 고세율 시장 보정, 결정 #61)를 덮어쓴다
if (process.env.KR_DEDUCTION === 'on' || process.env.KR_DEDUCTION === 'off') setKrBaseDeduction(process.env.KR_DEDUCTION === 'on');
// 비교 실험용: HOLDING_OFF=1 이면 숙성 재고 보유 비용(결정 #65)을 끈다, HOLDING_GRACE=개월 로 면제 기간 조정
if (process.env.HOLDING_OFF === '1') { HOLDING.perCaskMonth = 0; HOLDING.insuranceRateMonth = 0; }
if (process.env.HOLDING_GRACE) HOLDING.graceMonths = Number(process.env.HOLDING_GRACE);
if (process.env.OEM_FEE) OEM.feePerBatch = Number(process.env.OEM_FEE);
if (process.env.HOLDING_SCALE) { HOLDING.perCaskMonth *= Number(process.env.HOLDING_SCALE); HOLDING.insuranceRateMonth *= Number(process.env.HOLDING_SCALE); }

type Strategy = 'brand' | 'hybrid' | 'expand' | 'grain' | 'site';

/** 산지 전용 전략 (결정 #65 대표 결정) — 없는 산지는 site 전략을 돌리지 않는다 */
const SITE_STRATEGY: Partial<Record<SiteId, string>> = {
  andong: '브랜드 + 안동 쌀 계약재배 확대(감면 구간 넘어 소주 증산)',
  gyeonggi: '브랜드 + 대형 유통 납품 수락',
  jeju: '브랜드 + 위스키 일부를 면세 전용 한정판으로',
  kanto: '혼합 + 위탁생산(전용 증류기 지원형 포함) 수락',
  kansai: '브랜드 + 직판장 + 미즈나라 캐스크',
  hokkaido: '브랜드 + 재고 담보대출로 버티기',
  yilan: '브랜드 + 수집가 캐스크 매입 제안 수락',
};

const act = (s: GameState, a: Action) => applyAction(s, a).state;
/** 국내 판매용 재고 (면세 전용 한정판 제외) */
const stockOf = (s: GameState, cat: ProductCategory) => s.products.filter((p) => p.category === cat && !p.dutyFreeOnly).reduce((t, p) => t + p.stockBottles, 0);
/** 지역마다 프리셋 이름이 다르므로 kind(+피트 여부)로 첫 레시피를 찾는다 */
const recipeOf = (s: GameState, kind: SpiritKind) => s.recipes.find((r) => r.kind === kind && !r.mashBill.some((m) => m.ingredientId === 'malt_peated'));
const rid = (s: GameState, kind: SpiritKind) => recipeOf(s, kind)?.id;
const BIG_RECIPE = 'B2B 몰트';

function bottleCashProducts(s: GameState): GameState {
  for (const lot of [...s.lots]) {
    if (lot.kind === 'soju' && stockOf(s, 'soju_distilled') < 1500 + retailBuffer && s.month - lot.createdMonth >= 1)
      s = act(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: lot.volumeL }], options: { name: `소주 ${s.month}`, targetAbv: 0.25, bottleMl: 375, chillFilter: true, packagingId: 'standard' } });
    if (lot.kind === 'baijiu' && stockOf(s, 'baijiu') < 1500 && s.month - lot.createdMonth >= 1)
      s = act(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: lot.volumeL }], options: { name: `고량주 ${s.month}`, targetAbv: 0.34, bottleMl: 500, chillFilter: true, packagingId: 'standard' } });
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
    const empty = s.casks.filter((c) => !c.contents);
    if (empty.length < need && s.cash > 100_000_000) s = act(s, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: need - empty.length });
    s = act(s, { type: 'fillCasks', lotId: lot.id, caskIds: s.casks.filter((c) => !c.contents).slice(0, need).map((c) => c.id), entryAbv: 0.635 });
    budget -= lpa;
  }
  return s;
}

let dutyFreeEditions = false;
/** 대형 유통 납품으로 나갈 소주 병수 — 병입 기준 재고에 더한다 */
let retailBuffer = 0;

function bottleWhisky(s: GameState): GameState {
  if (stockOf(s, 'whisky') >= 800) return s;
  // 국가 최소 숙성(대만 24개월)을 따른다
  const ready = s.casks.filter((c) => c.contents && c.contents.oakMonths >= REGIONS[s.regionId].whiskyMinMonths && !c.contents.sourced).slice(0, 3);
  if (!ready.length) return s;
  const comps = ready.map((c) => ({ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL }));
  // 면세 전용 한정판은 일부만 (면세 전용 재고 400병 미만일 때) — 국내 판매를 통째로 포기하지 않는다
  const dfStock = s.products.filter((p) => p.dutyFreeOnly).reduce((t, p) => t + p.stockBottles, 0);
  const df = dutyFreeEditions && !!SITES[s.siteId].dutyFree && dfStock < 400;
  const opts = { name: `싱글 몰트 ${s.month}`, targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard', dutyFreeOnly: df };
  return previewBlend(s, comps, opts).ok ? act(s, { type: 'bottle', components: comps, options: opts }) : s;
}

/** 공백기 브리지(결정 #20): 자사 위스키가 나오기 전엔 브로커 숙성 원액을 사서 병입한다. 일본은 매입 원액 감점이 커서 효과가 작다 */
function bridgeSourced(s: GameState): GameState {
  if (s.month >= 42 || stockOf(s, 'whisky') >= 400 || s.cash < 150_000_000) return s;
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

/** 산지 전용 전략의 추가 행동 */
function siteActions(s: GameState): GameState {
  switch (s.siteId) {
    case 'gyeonggi': {
      // 납품 계약은 소주·고량주처럼 증산할 수 있는 카테고리만 받고, 받은 만큼 증산한다
      for (const o of [...s.retailOffers]) if (o.category === 'soju_distilled' || o.category === 'baijiu') s = act(s, { type: 'acceptRetail', offerId: o.id });
      const need = s.retailContracts.filter((c) => c.category === 'soju_distilled').reduce((t, c) => t + c.bottlesPerMonth, 0);
      const soju = rid(s, 'soju');
      if (soju) s = act(s, { type: 'setOrder', recipeId: soju, batchesPerMonth: 2 + Math.ceil(need / 1000) });
      retailBuffer = need;
      return s;
    }
    case 'andong': {
      // 계약재배를 늘려 안동 쌀 소주를 증산한다 (감면 구간 10kL를 넘어서는 선택)
      if (s.month % 12 === 0 && s.cash > 150_000_000) s = act(s, { type: 'expandLocalSupply' });
      const local = s.recipes.find((r) => r.mashBill.some((m) => m.ingredientId === 'andong_rice'));
      const batches = 2 + Math.floor((s.siteState.localSupplyKg ?? 0) / 400);
      if (local) s = act(s, { type: 'setOrder', recipeId: local.id, batchesPerMonth: batches });
      retailBuffer = (batches - 2) * 1100;
      return s;
    }
    case 'kanto': {
      // 위탁생산: 전용 증류기 지원형(결정 #66)은 자기 자금이 충분하면 받고, 일반형은 남는 가동분 안에서만 받는다
      const equity = s.cash - s.loans.reduce((t, l) => t + l.balance, 0);
      for (const o of [...s.oemOffers]) {
        if (o.dedicated ? equity - (oemPackageCost(s) - (o.capexSupport ?? 0)) > 150_000_000 : o.batchesPerMonth <= oemSpareBatches(s)) s = act(s, { type: 'acceptOem', offerId: o.id });
      }
      return s;
    }
    case 'kansai':
      // 위스키가 나온 뒤(3년 차), 대출을 뺀 자기 자금이 충분할 때 직판장. 미즈나라는 소량씩
      if (s.month >= 36 && s.cash - s.loans.reduce((t, l) => t + l.balance, 0) > 300_000_000 && !s.equipment.some((e) => e.catalogId === 'upg_visitor')) s = act(s, { type: 'buyEquipment', catalogId: 'upg_visitor' });
      if (s.month % 12 === 6 && s.cash > 200_000_000) s = act(s, { type: 'buyCasks', caskType: 'mizunara_hogshead', qty: 2 });
      return s;
    case 'hokkaido':
      if (s.cash < 150_000_000) s = act(s, { type: 'takeLoan', offerId: 'inventory', amount: 200_000_000 });
      return s;
    case 'yilan':
      for (const b of [...s.caskBids]) s = act(s, { type: 'acceptCaskBid', bidId: b.id });
      return s;
    default:
      return s;
  }
}

function finance(s: GameState): GameState {
  if (s.cash < 100_000_000 && !s.loans.some((l) => l.offerId === 'working')) s = act(s, { type: 'takeLoan', offerId: 'working', amount: 300_000_000 });
  if (s.cash < 50_000_000 && !s.loans.some((l) => l.offerId === 'facility')) s = act(s, { type: 'takeLoan', offerId: 'facility', amount: 500_000_000 });
  if (s.flags.producedSoju && !s.loans.some((l) => l.offerId === 'policy') && s.cash < 300_000_000) s = act(s, { type: 'takeLoan', offerId: 'policy', amount: 200_000_000 });
  return s;
}

function acceptContracts(s: GameState, maxCommittedLPA: number, spirit: ContractTerms['spirit'] = 'malt_newmake'): GameState {
  for (const o of [...s.contractOffers]) {
    if (o.spirit !== spirit) continue;
    const committed = s.contracts.filter((c) => c.spirit === spirit).reduce((t, c) => t + c.lpaPerMonth, 0);
    const qOk = spirit === 'grain_newmake' ? o.minQuality <= 36 : o.minQuality <= 42;
    if (o.style !== 'peated' && qOk && committed + o.lpaPerMonth <= maxCommittedLPA) s = act(s, { type: 'acceptContract', offerId: o.id });
  }
  return s;
}

const GRAIN_RECIPE = '그레인 B2B';

function start(s: GameState, strategy: Strategy): GameState {
  const sales = s.candidates.filter((c) => c.role === 'sales').sort((a, b) => b.stats.b - a.stats.b)[0];
  if (sales) s = act(s, { type: 'hire', candidateId: sales.id });
  s = act(s, { type: 'setMarketing', amount: 5_000_000 });
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
  if (strategy !== 'site') retailBuffer = 0;
  if (strategy === 'site') {
    dutyFreeEditions = true;
    // 산지 전용: 간토는 혼합형, 나머지는 브랜드형 위에 대표 결정을 얹는다
    s = siteActions(s);
    const out = policy(s, s.siteId === 'kanto' ? 'hybrid' : 'brand');
    dutyFreeEditions = false;
    return out;
  }
  if (s.month === 0) s = start(s, strategy);
  s = bottleCashProducts(s);
  if (strategy === 'brand') {
    s = fillMalt(s);
  } else if (strategy === 'hybrid') {
    // 몰트 생산의 일부만 계약, 나머지는 숙성. 위스키 재고가 쌓이면 오래된 캐스크를 현물 판매
    s = acceptContracts(s, 200);
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
  return finance(s);
}

const eok = (v: number) => (Number.isFinite(v) ? `${(v / 1e8).toFixed(2)}억` : '—');
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** 순자산 = 현금 − 대출 + 원액 재고(벌크 가치의 85%) + 제품 재고(원가) */
function netWorth(s: GameState): number {
  const stock = [...s.lots, ...s.casks.flatMap((c) => (c.contents ? [c.contents] : []))].reduce((t, l) => t + l.volumeL * l.abv * bulkValuePerLPA(s, l) * 0.85, 0);
  const products = s.products.reduce((t, p) => t + p.stockBottles * p.unitCost, 0);
  return s.cash - s.loans.reduce((t, l) => t + l.balance, 0) + stock + products + s.receivables.reduce((t, r) => t + r.amount, 0);
}

/** 보수적 순자산 = 원액 재고를 시가가 아닌 장부 원가로 평가 (회계상 재고 평가와 같음) */
function bookWorth(s: GameState): number {
  const stock = [...s.lots, ...s.casks.flatMap((c) => (c.contents ? [c.contents] : []))].reduce((t, l) => t + l.volumeL * l.abv * l.costPerLPA, 0);
  const products = s.products.reduce((t, p) => t + p.stockBottles * p.unitCost, 0);
  return s.cash - s.loans.reduce((t, l) => t + l.balance, 0) + stock + products;
}

interface Result { strategy: Strategy; bankrupt: boolean; minCash: number; netWorth: number; bookWorth: number; firstPositive: number; y5retail: number; y5bulk: number }

function play(strategy: Strategy, seed: number): Result {
  let s = newGame({ seed, site: SITE });
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

const list: Strategy[] = WHICH === 'all' ? ['brand', 'hybrid', 'expand', 'grain', ...(SITE_STRATEGY[SITE] ? ['site' as const] : [])] : [WHICH as Strategy];
const results: Record<Strategy, Result[]> = { brand: [], hybrid: [], expand: [], grain: [], site: [] };
if (SITE_STRATEGY[SITE]) console.log(`site 전략 = ${SITE_STRATEGY[SITE]}`);
const wins: Record<string, number> = {};
const bookWins: Record<string, number> = {};
/** 시드별 1위 집계 (결정 #67): 1위 순자산의 95% 이상인 전략은 공동 1위로 보고 1점을 나눠 갖는다 —
 *  "브랜드형 + 한 가지" 같은 변형 전략은 같은 시드에서 함께 움직여, 근소한 평균 우위만으로 대부분 1위가 되는 과장을 막는다 */
const TIE_BAND = 0.95;
const tally = (rs: Result[], by: 'netWorth' | 'bookWorth', into: Record<string, number>) => {
  const best = rs.reduce((a, b) => (b[by] > a[by] ? b : a));
  if (best.bankrupt || !Number.isFinite(best[by])) { into['전멸'] = (into['전멸'] ?? 0) + 1; return; }
  const winners = rs.filter((r) => !r.bankrupt && r[by] >= (best[by] >= 0 ? best[by] * TIE_BAND : best[by] / TIE_BAND));
  for (const w of winners) into[w.strategy] = (into[w.strategy] ?? 0) + 1 / winners.length;
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
  console.log(`${st.padEnd(7)} | 파산 ${rs.length - alive.length}/${rs.length} | 순자산(${MONTHS}m) 평균 ${eok(avg(nw))} ±${eok(sd)} · 원가기준 ${eok(avg(alive.map((r) => r.bookWorth)))} | 최저 현금 평균 ${eok(avg(rs.map((r) => r.minCash)))} | 흑자 전환 평균 ${Math.round(avg(fps))}개월 | 5년차 매출 병입 ${eok(avg(rs.map((r) => r.y5retail)))} + B2B ${eok(avg(rs.map((r) => r.y5bulk)))} | 1위 ${Number((wins[st] ?? 0).toFixed(1))}회`);
}
const dist = (w: Record<string, number>) => [...list, '전멸'].map((st) => `${st} ${Number((w[st] ?? 0).toFixed(1))}`).join(' · ');
console.log(`\n[${REGION}] 시드별 1위 분포(시가 평가): ${dist(wins)}`);
console.log(`[${REGION}] 시드별 1위 분포(원가 평가): ${dist(bookWins)}  (1위의 95% 이내는 공동 1위로 나눠 집계 — 한 전략이 60% 이상이면 지배 전략 의심)`);
