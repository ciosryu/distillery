// 헤드리스 밸런스 시뮬레이션 — 전략별 단순 정책으로 N개 시드를 돌려 파산률·흑자 전환 시점·매출 구성을 본다.
// 실행: npm run balance [-- 시드수 개월수 전략 지역 입지]   전략 = brand | hybrid | expand | grain | all(기본), 지역 = KR(기본) | JP | TW
import { advanceMonth, applyAction, bulkValuePerLPA, capacityLPA, spotBidPerLPA, lotQuality, monthlyFixedCost, previewBlend, newGame, warehouseCapacity, whiskyMinMonths, type Action, type ContractTerms, type GameState, type ProductCategory, type RegionId, type SpiritKind } from '../src/sim';
import { REGIONS, regionOf } from '../src/sim/content/regions';
import { EVENTS } from '../src/sim/content/events';
import { EQUIPMENT } from '../src/sim/content/catalog';
const EQUIPMENT_KIND = (id: string) => EQUIPMENT[id]?.kind;

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
// 튜닝 실험용: 그레인 현물 시장 깊이 덮어쓰기 (#81)
if (process.env.GRAIN_DEPTH) REGIONS[REGION].grainSpotDepthLPA = Number(process.env.GRAIN_DEPTH);

type Strategy = 'brand' | 'hybrid' | 'expand' | 'grain';

/** 현물 판매 수입 — 턴 사이 행동이라 월간 보고서에 안 잡히므로 따로 센다 (월 → 원) */
let spotIncome: number[] = [];
const act = (s: GameState, a: Action) => {
  const next = applyAction(s, a).state;
  if (a.type === 'sellBulk' || a.type === 'acceptCaskBid') spotIncome[s.month] = (spotIncome[s.month] ?? 0) + (next.cash - s.cash);
  return next;
};
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

/** v1.4(#82): 위스키 병입량은 수요를 따른다 — 지난달 위스키 수요의 1.5개월치까지 재고를 채운다(한 번에 최대 10캐스크, 제품 1개로).
 *  v1.3까지는 "재고 800병 미만이면 3캐스크"라서 월 약 1,100병이 상한이었고, 수요가 3~6배인데도 숙성 캐스크가 쌓였다.
 *  OLD_BOTTLE=1이면 옛 정책 */
const OLD_BOTTLE = process.env.OLD_BOTTLE === '1';
const OLD_GRAIN = process.env.OLD_GRAIN === '1';
const BOTTLES_PER_CASK = 330;
function whiskyDemandLastMonth(s: GameState): number {
  const ids = new Set(s.products.filter((p) => p.category === 'whisky').map((p) => p.id));
  return s.reports.at(-1)?.sales.filter((x) => ids.has(x.productId)).reduce((t, x) => t + x.demandBottles, 0) ?? 0;
}
function bottleWhisky(s: GameState): GameState {
  const stock = stockOf(s, 'whisky');
  const target = OLD_BOTTLE ? 800 : Math.max(800, whiskyDemandLastMonth(s) * 1.5);
  if (stock >= target) return s;
  const n = OLD_BOTTLE ? 3 : Math.min(10, Math.max(1, Math.ceil((target - stock) / BOTTLES_PER_CASK)));
  const ready = s.casks.filter((c) => c.contents && c.contents.oakMonths >= 36 && !c.contents.sourced).slice(0, n);
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
/** v1.4(#84): 블렌디드도 수요를 따라 병입한다 — 지난달 수요의 1.5개월치까지, 한 번에 그레인 2n + 몰트 n 캐스크(n ≤ 4). OLD_GRAIN=1이면 옛 정책 */
function blendedDemandLastMonth(s: GameState): number {
  const ids = new Set(s.products.filter((p) => p.category === 'blended_whisky').map((p) => p.id));
  return s.reports.at(-1)?.sales.filter((x) => ids.has(x.productId)).reduce((t, x) => t + x.demandBottles, 0) ?? 0;
}
function bottleBlended(s: GameState): GameState {
  const stock = stockOf(s, 'blended_whisky');
  const target = OLD_GRAIN ? 1500 : Math.max(1500, blendedDemandLastMonth(s) * 1.5);
  if (stock >= target) return s;
  // 그레인 2 + 몰트 1 캐스크 ≈ 40% 700ml 약 1,200병
  const n = OLD_GRAIN ? 1 : Math.min(4, Math.max(1, Math.ceil((target - stock) / 1200)));
  const aged = (k: 'malt' | 'grain') => s.casks.filter((c) => c.contents && c.contents.kind === k && c.contents.oakMonths >= 36 && !c.contents.sourced);
  const g = aged('grain').slice(0, 2 * n);
  const m = aged('malt').slice(0, n);
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

function acceptContracts(s: GameState, maxCommittedLPA: number, spirit: ContractTerms['spirit'] = 'malt_newmake', endBy = Infinity): GameState {
  for (const o of [...s.contractOffers]) {
    if (o.spirit !== spirit || s.month + o.termMonths > endBy) continue;
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
  if (strategy === 'hybrid' || strategy === 'brand' || (strategy === 'expand' && !OLD_EXPAND)) {
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
  // v1.4(#84): 그레인형도 몰트는 브랜드형과 같은 7배치(발효조 2기 추가) — 4배치면 #82 이후 위스키 판매에서 뒤처진다
  if (strategy === 'grain' && !OLD_GRAIN) {
    s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' });
    s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' });
    return act(s, { type: 'setOrder', recipeId: rid(s, 'malt')!, batchesPerMonth: 7 });
  }
  return act(s, { type: 'setOrder', recipeId: rid(s, 'malt')!, batchesPerMonth: 4 });
}

/** 확장형: 위스키 판매가 자리 잡은 뒤(48개월~, 현금 4억↑) 증류기 1기를 추가해 몰트 B2B 공급을 붙인다 */
/** v1.4(#83) 공격적 증설형: 브랜드형과 같이 시작해, 위스키 수요가 공급을 넘으면 증류기·발효조를 단계적으로 늘린다.
 *  늘린 원액은 전부 자사 위스키로 숙성한다(v1.3까지는 뉴메이크 B2B로 팔아 LPA당 가치가 1/5이었다).
 *  자금이 모자라면 시설자금을 끌어 쓴다 — 빚과 3년 숙성 대기가 위험이다. OLD_EXPAND=1이면 옛 정책 */
const OLD_EXPAND = process.env.OLD_EXPAND === '1';
const EXPAND_RECIPE = '증설 몰트';
const EXPAND_FROM = Number(process.env.EXPAND_FROM ?? 60);
const EXPAND_MAX_STAGES = Number(process.env.EXPAND_STAGES ?? 1);
/** 확장형 안전장치 (NO_EXP_SAFETY=1이면 끈다)
 *  ① 자유 현금흐름: 최근 12개월 월평균 자유 현금흐름이 EXPAND_FCF 이상일 때만 증설한다.
 *     증설하면 매달 시설자금 원리금(거치 후 약 630만) + 유지비·생산비·캐스크(약 800만)가 늘어난다 → 기본 1,500만.
 *     → 여유를 더해 기본 2,000만 (한국 20시드: 1,000만 파산 3 · 1,500만 2 · 2,000만 0).
 *     파산한 판은 브랜드 사업 자체가 약한 판(같은 시드 브랜드형 순자산 하위)이었고, 거치가 끝나는 84개월 무렵 원리금이 두 배가 돼 무너졌다
 *  ② 숙성고: 랙 숙성고는 증설 단계가 있을 때만, 짓고 나서도 월 고정비 3개월치가 남을 때만 짓는다
 *     (예전에는 증설이 없어도 숙성고가 85% 차면 지어서 1.5억이 그대로 묶였다) */
const EXP_SAFETY = process.env.NO_EXP_SAFETY !== '1';
const EXPAND_FCF = Number(process.env.EXPAND_FCF ?? 20_000_000);
/** 판마다 월별 (현금 − 대출 잔액) — 차입·상환에 흔들리지 않는 자유 현금흐름 계산용 */
const equityByMonth: number[] = [];
/** 최근 12개월 월평균 자유 현금흐름 = (현금 − 대출 잔액)의 12개월 변화 / 12. 병입비·캐스크·설비 지출까지 다 들어간다 */
function freeCashFlow12(s: GameState): number {
  const past = equityByMonth[s.month - 12];
  return past == null ? -Infinity : (s.cash - s.loans.reduce((t, l) => t + l.balance, 0) - past) / 12;
}
/** 증설 단계 = 증설 레시피가 쓰는 증류기 */
function expansionStills(s: GameState) {
  const ids = new Set(s.recipes.filter((r) => r.name.startsWith(EXPAND_RECIPE)).map((r) => r.stillId));
  return s.equipment.filter((e) => ids.has(e.id));
}
/** 숙성·증발 뒤 1 LPA에서 나오는 46%·700ml 병 수 (증발 약 15% 가정) */
const BOTTLES_PER_LPA_AGED = 0.85 / (0.46 * 0.7);
function maltLPALastMonth(s: GameState): number {
  const ids = new Set(s.recipes.filter((r) => r.kind === 'malt').map((r) => r.id));
  return s.reports.at(-1)?.production.filter((p) => ids.has(p.recipeId)).reduce((t, p) => t + p.lpa, 0) ?? 0;
}
function expandStaged(s: GameState): GameState {
  // 증설 단계 = 증설 레시피가 쓰는 증류기 (처음 증류기는 고장·수리로 readyMonth가 바뀌므로 readyMonth로 가리면 안 된다)
  const stages = expansionStills(s);
  // 지어 놓은 증설 단계는 다 돌린다
  for (const still of stages) {
    const r = s.recipes.find((x) => x.stillId === still.id && x.name.startsWith(EXPAND_RECIPE));
    if (r && !s.orders.some((o) => o.recipeId === r.id)) s = act(s, { type: 'setOrder', recipeId: r.id, batchesPerMonth: 7 });
  }
  if (s.month < EXPAND_FROM || stages.length >= EXPAND_MAX_STAGES) return s;
  if (stages.length && s.month - Math.max(...stages.map((e) => e.readyMonth)) < 12) return s; // 단계 사이 최소 12개월
  const demand = whiskyDemandLastMonth(s);
  const supply = maltLPALastMonth(s) * BOTTLES_PER_LPA_AGED;
  if (demand < supply * Number(process.env.EXPAND_TRIGGER ?? 1.3)) return s;
  const cost = 300_000_000 + 2 * 40_000_000;
  if (EXP_SAFETY && freeCashFlow12(s) < EXPAND_FCF) return s;
  if (s.cash < cost + 150_000_000 && !s.loans.some((l) => l.offerId === 'facility')) s = act(s, { type: 'takeLoan', offerId: 'facility', amount: 500_000_000 });
  if (s.cash < cost + 100_000_000) return s;
  s = act(s, { type: 'buyEquipment', catalogId: 'pot_onion_1000' });
  s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' });
  s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' });
  const still = s.equipment.filter((e) => e.catalogId === 'pot_onion_1000').at(-1)!;
  const { id: _id, ...rest } = recipeOf(s, 'malt')!;
  return act(s, { type: 'saveRecipe', recipe: { ...rest, name: `${EXPAND_RECIPE} ${stages.length + 1}`, stillId: still.id } });
}

/** 증설형만: 원액이 든 캐스크가 숙성고의 85%를 넘으면 빈 통부터 중고로 팔고, 그래도 차면 랙 숙성고(+100 캐스크)를 늘린다.
 *  고정 규모 전략(브랜드·혼합·그레인)에 넣으면 10년 안에 회수가 안 돼 순자산이 1.7~3억 줄었다 */
function growWarehouse(s: GameState): GameState {
  const filled = s.casks.filter((c) => c.contents).length;
  if (s.casks.length >= warehouseCapacity(s) - 2) for (const c of s.casks.filter((x) => !x.contents).slice(12)) s = act(s, { type: 'sellUsedCask', caskId: c.id });
  const building = s.equipment.some((e) => EQUIPMENT_KIND(e.catalogId) === 'warehouse' && e.readyMonth > s.month);
  const canBuild = EXP_SAFETY
    ? expansionStills(s).length > 0 && s.cash - EQUIPMENT.warehouse_rack_100!.cost >= 3 * monthlyFixedCost(s)
    : s.cash > 300_000_000;
  if (!building && filled >= warehouseCapacity(s) * 0.85 && canBuild) s = act(s, { type: 'buyEquipment', catalogId: 'warehouse_rack_100' });
  return s;
}

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

/** v1.4(#81): 그레인 현물은 시장이 포화되면 값이 떨어진다 — 한계 단가가 원가 × 1.5 아래로 내려가면 팔지 않고 탱크에 둔다.
 *  안 팔린 재고가 쌓이면 생산 배치를 줄이고, 비면 다시 늘린다 */
function sellGrainSmart(s: GameState, recipeId: string | undefined): GameState {
  const CHUNK_LPA = 500;
  for (const lot of s.lots.filter((l) => l.kind === 'grain')) {
    let left = lot.volumeL;
    while (left > 1) {
      const cur = s.lots.find((l) => l.id === lot.id);
      if (!cur) break;
      const liters = Math.min(cur.volumeL, CHUNK_LPA / cur.abv);
      if (spotBidPerLPA(s, cur, liters * cur.abv) < cur.costPerLPA * 1.5) break;
      s = act(s, { type: 'sellBulk', source: 'lot', id: cur.id, liters });
      left -= liters;
    }
  }
  const order = recipeId && s.orders.find((o) => o.recipeId === recipeId);
  if (order) {
    const unsold = s.lots.filter((l) => l.kind === 'grain').reduce((t, l) => t + l.volumeL * l.abv, 0);
    const lastLPA = s.reports.at(-1)?.production.find((p) => p.recipeId === recipeId)?.lpa ?? 0;
    const per = lastLPA / Math.max(1, order.batchesPerMonth);
    if (per > 0 && unsold > per * 3 && order.batchesPerMonth > 2) s = act(s, { type: 'setOrder', recipeId, batchesPerMonth: order.batchesPerMonth - 1 });
    else if (per > 0 && unsold < per && order.batchesPerMonth < 12) s = act(s, { type: 'setOrder', recipeId, batchesPerMonth: order.batchesPerMonth + 1 });
  }
  return s;
}

function policy(s: GameState, strategy: Strategy): GameState {
  equityByMonth[s.month] = s.cash - s.loans.reduce((t, l) => t + l.balance, 0);
  if (s.month === 0) s = start(s, strategy);
  s = bottleCashProducts(s);
  if (strategy === 'brand') {
    s = fillMalt(s);
  } else if (strategy === 'hybrid') {
    // 몰트 생산의 일부만 계약, 나머지는 숙성. 위스키 재고가 쌓이면 오래된 캐스크를 현물 판매
    // v1.3: 몰트 생산 능력의 절반까지 계약
    // v1.4: 혼합형은 '과도기 전략' — 위스키가 익기 전에만 계약으로 현금을 만든다.
    // 납품이 36개월 안에 끝나는 계약만 받는다: 36개월 뒤까지 이어지는 계약은 4~7년차 위스키를 깎아 먹어 파산을 부른다 (§16.16)
    // HYB_UNTIL = 수락 마감 월, HYB_END = 납품 종료 기한, HYB_CAP = 몰트 생산 능력 대비 계약 한도 (0.5 → 0.25: 일본 파산 15 → 3/40)
    if (s.month < Number(process.env.HYB_UNTIL ?? 36)) s = acceptContracts(s, capacityLPA(s, 'malt') * Number(process.env.HYB_CAP ?? 0.25), 'malt_newmake', Number(process.env.HYB_END ?? 36));
    s = fillMalt(s);
    if (stockOf(s, 'whisky') > 2000) {
      const old = s.casks.find((c) => c.contents && c.contents.oakMonths >= 48 && !c.contents.sourced);
      if (old) s = act(s, { type: 'sellBulk', source: 'cask', id: old.id });
    }
  } else if (strategy === 'grain') {
    const r = s.recipes.find((x) => x.name === GRAIN_RECIPE);
    const col = r && s.equipment.find((e) => e.id === r.stillId);
    if (r && col && col.readyMonth <= s.month && !s.orders.some((o) => o.recipeId === r.id)) s = act(s, { type: 'setOrder', recipeId: r.id, batchesPerMonth: 12 }); // 이후 배치는 sellGrainSmart가 조절
    if (col && col.readyMonth <= s.month + 3) s = acceptContracts(s, 6000, 'grain_newmake');
    // 그레인 일부(월 300 LPA)는 자사 블렌디드용으로 통입, 나머지는 현물 판매
    s = fillMalt(s, 300, 'grain');
    s = process.env.GRAIN_DUMB === '1' ? sellLots(s, 'grain') : sellGrainSmart(s, r?.id);
    s = fillMalt(s);
    s = bottleBlended(s);
  } else if (!OLD_EXPAND) {
    s = expandStaged(s);
    s = growWarehouse(s);
    s = fillMalt(s);
    if (process.env.DBG_EXP && s.month % 6 === 0) {
      const stills = s.equipment.filter((e) => e.catalogId === 'pot_onion_1000').map((e) => e.readyMonth).join(',');
      const tank = s.lots.filter((l) => l.kind === 'malt').reduce((t, l) => t + l.volumeL * l.abv, 0);
      const blocked = s.reports.at(-1)?.notes.filter((n) => n.includes('한도') || n.includes('없음')).slice(0, 1).join('') ?? '';
      console.error(`m${s.month} cash ${(s.cash / 1e8).toFixed(2)} loans ${s.loans.map((l) => l.offerId).join('/')} stills[${stills}] maltLPA/mo ${Math.round(maltLPALastMonth(s))} tank ${Math.round(tank)} filled ${s.casks.filter((c) => c.contents).length}/${warehouseCapacity(s)} empty ${s.casks.filter((c) => !c.contents).length} demand ${Math.round(whiskyDemandLastMonth(s))} supply ${Math.round(maltLPALastMonth(s) * BOTTLES_PER_LPA_AGED)} whiskyStock ${stockOf(s, 'whisky')} ${blocked}`);
    }
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

/** DIAG=1: 판마다 현금 흐름 진단을 stderr에 JSON 한 줄로 남긴다 (파산 원인 분석용) */
const DIAG = process.env.DIAG === '1';
function diag(strategy: Strategy, seed: number, s: GameState): void {
  const sumBy = (from: number, to: number) => {
    const rs = s.reports.filter((r) => r.month >= from && r.month < to);
    const exp: Record<string, number> = {};
    for (const r of rs) for (const [k, v] of Object.entries(r.expenses)) exp[k] = (exp[k] ?? 0) + v;
    return {
      retail: rs.reduce((t, r) => t + r.revenue, 0), bulk: rs.reduce((t, r) => t + r.bulkRevenue, 0), tourism: rs.reduce((t, r) => t + (r.tourismRevenue ?? 0), 0),
      penalty: rs.reduce((t, r) => t + r.bulk.reduce((u, b) => u + b.penalty, 0), 0), exp,
    };
  };
  const cash = s.reports.map((r) => Math.round(r.cashEnd / 1e6));
  const firstNeg = cash.findIndex((c) => c < 0);
  console.error(JSON.stringify({
    strategy, seed, region: REGION, site: SITE ?? null, bankrupt: s.status === 'bankrupt', endMonth: s.month, firstNeg,
    cash, rev: s.reports.map((r) => Math.round(r.revenue / 1e6)), spot: s.reports.map((r) => Math.round((spotIncome[r.month] ?? 0) / 1e6)), bulkRev: s.reports.map((r) => Math.round(r.bulkRevenue / 1e6)), debt: s.reports.map((r) => Math.round(((r.expenses.principal ?? 0) + (r.expenses.interest ?? 0)) / 1e6)),
    loans: s.loans.map((l) => ({ id: l.offerId, bal: Math.round(l.balance / 1e6), start: l.startMonth, pay: Math.round(l.monthlyPayment / 1e6), grace: l.graceMonths })), investorShare: s.investorShare,
    y1_3: sumBy(0, 36), y4_5: sumBy(36, 60), all: sumBy(0, s.month),
    events: s.reports.flatMap((r) => r.events.map((e) => `${r.month}:${e}`)),
    unit: (() => {
      const prod: Record<string, { lpa: number; cost: number }> = {};
      for (const r of s.reports) for (const p of r.production) { const x = (prod[p.name] ??= { lpa: 0, cost: 0 }); x.lpa += p.lpa; x.cost += p.cost; }
      const del = s.reports.flatMap((r) => r.bulk);
      const dl = del.reduce((t, b) => t + b.deliveredLPA, 0);
      return { prod: Object.fromEntries(Object.entries(prod).map(([k, v]) => [k, { lpa: Math.round(v.lpa), perLPA: Math.round(v.cost / Math.max(1, v.lpa)) }])), deliveredLPA: Math.round(dl), contractPerLPA: Math.round(del.reduce((t, b) => t + b.revenue, 0) / Math.max(1, dl)) };
    })(),
    contracts: s.contracts.length, casks: s.casks.filter((c) => c.contents).length,
    whisky: (() => {
      const cat = new Map(s.products.map((p) => [p.id, p.category]));
      return s.reports.map((r) => {
        const w = r.sales.filter((x) => cat.get(x.productId) === 'whisky');
        return [w.reduce((t, x) => t + x.demandBottles, 0), w.reduce((t, x) => t + x.bottles, 0)];
      });
    })(),
    agedMaltCasks: s.casks.filter((c) => c.contents?.kind === 'malt' && !c.contents.sourced && c.contents.oakMonths >= 36).length,
    retailCap: s.reports.slice(-12).map((r) => [r.retailCapacityCases ?? 0, r.retailSoldCases ?? 0, r.overflowCases ?? 0, r.lostSalesBottles ?? 0]),
    worth: (() => {
      const val = (l: { volumeL: number; abv: number; kind: string }) => l.volumeL * l.abv * bulkValuePerLPA(s, l as never) * 0.85;
      const inCasks = s.casks.flatMap((c) => (c.contents ? [c.contents] : []));
      return {
        cash: Math.round(s.cash / 1e6), loans: Math.round(s.loans.reduce((t, l) => t + l.balance, 0) / 1e6),
        maltStock: Math.round(inCasks.filter((l) => l.kind === 'malt').reduce((t, l) => t + val(l), 0) / 1e6),
        grainStock: Math.round(inCasks.filter((l) => l.kind === 'grain').reduce((t, l) => t + val(l), 0) / 1e6),
        lots: Math.round(s.lots.reduce((t, l) => t + val(l), 0) / 1e6),
        products: Math.round(s.products.reduce((t, p) => t + p.stockBottles * p.unitCost, 0) / 1e6),
      };
    })(),
  }));
}

interface Result { strategy: Strategy; bankrupt: boolean; minCash: number; netWorth: number; bookWorth: number; firstPositive: number; y5retail: number; y5bulk: number }

function play(strategy: Strategy, seed: number): Result {
  let s = newGame({ seed, region: REGION, site: SITE });
  equityByMonth.length = 0;
  spotIncome = [];
  let lo = s.cash;
  for (let m = 0; m < MONTHS && s.status === 'running'; m++) {
    s = advanceMonth(policy(s, strategy));
    lo = Math.min(lo, s.cash);
  }
  const net = s.reports.map((r) => r.netCash);
  let fp = -1;
  for (let i = 2; i < net.length; i++) if ((net[i]! + net[i - 1]! + net[i - 2]!) / 3 > 0) { fp = i; break; }
  const y5 = s.reports.filter((r) => r.month >= 48 && r.month < 60);
  if (DIAG) diag(strategy, seed, s);
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
