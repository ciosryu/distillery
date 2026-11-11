// 병당 손익 (파트 PROD — 플레이테스트 2026-11-07 오너 요청 "내가 만들 술의 원가와 판매가의 임팩트를 알기 쉽게", #173)
// 레시피 하나로 만든 술 한 병이 얼마에 만들어지고, 얼마에 팔리고, 얼마가 남고, 한 달에 몇 병 팔리는지.
// 실제 병입(previewBlend)·판매(demandFor·bottleMargin)와 **같은 식**을 쓴다 — 가상의 탱크 원액을 하나 끼워 넣은 상태 사본에서 계산한다.
// 위스키는 표준 조건(새 ex-버번 배럴·입지 연평균 기후)으로 숙성을 굴린 **예상**이다 — 실제 캐스크는 샘플로 확인한다. 게임 상태를 바꾸지 않는다.

import { CASK_COST_SHARE_PER_FILL, CASK_STORAGE, CASKS } from './content/catalog';
import { regionOf, siteOf, traditionalTaxFactor } from './content/regions';
import { agedWhiteLabel, agedWhiteLabelMonths, executeBlend, isCaskStrength, isWhiskyCategory, previewBlend, suggestedPrice, whiskyMinMonths, type BlendComponent, type BottleOptions } from './blending';
import { finishOf, matureCask, vesselMaterial } from './maturation';
import { capacityReport, previewBatch } from './production';
import { demandFor, distributionCostPerBottle, domesticDemands, priceOptions } from './market';
import { outboundLogistics } from './sites';
import { calendar, warehouseCapacity } from './util';
import { FLAGSHIP_RESERVE_TAG, preferredCaskIds, protectedCaskIds, reserveCaskIds, tagDef } from './tags';
import { spotBidPerLPA } from './bulk';
import type { Cask, GameState, MonthReport, Product, ProductCategory, Recipe, SpiritKind, SpiritLot } from './types';

/** 표준 병 — 소주는 대중 규격, 몰트는 위스키 규격 (봇·사전 점검과 같은 값) */
export const STANDARD_BOTTLE: Record<'soju' | 'whisky', { bottleMl: number; abv: number }> = {
  soju: { bottleMl: 375, abv: 0.25 },
  whisky: { bottleMl: 700, abv: 0.4 },
};

/** 숙성해서 파는 주종의 예상 시점(개월) */
export const AGING_HORIZONS = [12, 36] as const;
const ENTRY_ABV = 0.635;

export interface EconomicsRow {
  /** 0 = 바로 병입(숙성 안 함) */
  months: number;
  category: ProductCategory;
  quality: number;
  /** 배치 1회로 나오는 병 수 (숙성 증발 반영) */
  bottlesPerBatch: number;
  /** 병당 원액 원가(원재료·에너지 + 숙성 시 통 원가 배분·증발·보관비) */
  spiritCost: number;
  /** 병당 병·포장·병입 인건비 */
  packCost: number;
  /** 권장 출고가 (우리 매출) */
  price: number;
  /** 병당 유통비(채널 수수료 + 물류) */
  distribution: number;
  /** 병당 이익 = 출고가 − 원가 − 유통비 */
  margin: number;
  /** 지금 인지도·유통으로 한 달에 팔 수 있는 양(같은 종류 제품과 나눈 근사) */
  demandPerMonth: number;
}

/** 표준 조건 숙성 — 새 ex-버번 배럴, 입지 연평균 기후, 숙성고 매니저 없음 */
function ageStandard(s: GameState, lot: SpiritLot, months: number): { lot: SpiritLot; caskLPA: number } {
  const site = siteOf(s);
  const climate = { tempC: site.tempC.reduce((a, b) => a + b, 0) / 12, humidity: site.humidity.reduce((a, b) => a + b, 0) / 12 };
  const entry = Math.min(ENTRY_ABV, lot.abv);
  // emptyCaskOf는 id 카운터를 올린다(상태 변경) → 같은 값으로 통을 직접 만든다
  const def = CASKS.ex_bourbon_barrel;
  let cask: Cask & { contents: SpiritLot } = { id: '__econ', typeId: def.id, sizeL: def.sizeL, wood: def.wood, activity: def.activity, seasoning: def.seasoning, fills: 0, recharCount: 0, char: def.char, contents: { ...lot, abv: entry, volumeL: def.sizeL } };
  const caskLPA = cask.contents.volumeL * entry;
  for (let i = 0; i < months; i++) cask = matureCask(cask, climate, { control: 0 }).cask as typeof cask;
  return { lot: cask.contents, caskLPA };
}

/**
 * 레시피 한 병의 손익 — 소주·진·고량주는 바로 병입 한 줄, 몰트·그레인은 숙성 1년·3년 두 줄.
 * 증류기가 없거나 레시피가 틀리면 빈 배열
 */
export function recipeEconomics(s: GameState, recipe: Recipe): EconomicsRow[] {
  const b = previewBatch(s, recipe);
  if (!b || b.lpa <= 0) return [];
  const aged = recipe.kind === 'malt' || recipe.kind === 'grain';
  const fmt = aged ? STANDARD_BOTTLE.whisky : STANDARD_BOTTLE.soju;
  const newmake: SpiritLot = {
    id: '__econ', name: recipe.name, kind: recipe.kind, volumeL: b.volumeL, abv: b.abv, flavor: b.flavor, createdMonth: s.month, oakMonths: 0, sourced: false,
    costPerLPA: b.cost / b.lpa, recipeId: recipe.id, ...(recipe.mashBill.length ? { mashShare: Object.fromEntries(recipe.mashBill.map((m) => [m.ingredientId, m.ratio])) } : {}),
  };
  const labor = regionOf(s).laborCost;
  const rows: EconomicsRow[] = [];
  for (const months of aged ? AGING_HORIZONS : [0]) {
    let lot = newmake;
    let lpaKept = 1;
    if (months > 0) {
      const r = ageStandard(s, newmake, months);
      lpaKept = (r.lot.volumeL * r.lot.abv) / r.caskLPA;
      // 통 원가 배분(통입 1회분) + 증발로 줄어든 LPA + 월 보관비(인건비 배수) — 보험료는 작아서 뺀다
      const caskShare = CASKS.ex_bourbon_barrel.price * CASK_COST_SHARE_PER_FILL;
      const endLPA = r.lot.volumeL * r.lot.abv;
      const costPerLPA = (newmake.costPerLPA * r.caskLPA + caskShare) / endLPA + (CASK_STORAGE.perCaskPerMonth * labor * months) / endLPA;
      lot = { ...r.lot, oakMonths: months, costPerLPA, volumeL: r.lot.volumeL };
    }
    // 가상 탱크 원액 하나를 끼운 상태 사본에서 실제 병입 미리보기와 같은 식으로
    const t = { ...s, inventory: { ...s.inventory, lots: [...s.inventory.lots, lot] } } as GameState;
    const opts: BottleOptions = { name: '', targetAbv: fmt.abv, bottleMl: fmt.bottleMl, chillFilter: true, packagingId: 'standard' };
    const p = previewBlend(t, [{ source: 'lot', id: lot.id, liters: Math.min(lot.volumeL, 100) }], opts);
    if (!p.category || !p.evaluation || p.bottles <= 0) continue;
    const bottleLPA = (fmt.bottleMl / 1000) * p.finalAbv;
    const spiritCost = lot.costPerLPA * bottleLPA;
    const packCost = Math.max(0, p.unitCost - spiritCost);
    const distribution = distributionCostPerBottle(p.suggestedPrice, fmt.bottleMl, outboundLogistics(s));
    const product: Product = {
      id: '__econ', name: '', category: p.category, ageYears: p.ageYears, oakMonths: p.minOakMonths, abv: p.finalAbv, bottleMl: fmt.bottleMl, chillFiltered: true, packagingId: 'standard',
      flavor: p.flavor, quality: p.evaluation.quality, typicity: p.evaluation.typicity, style: p.evaluation.style, sourcedShare: 0, stockBottles: 1,
      price: p.suggestedPrice, unitCost: p.unitCost, createdMonth: s.month, lastMonthSold: 0, totalSold: 0, ...(p.traditional ? { traditional: true } : {}),
    };
    const same = s.commerce.products.filter((x) => x.category === p.category && x.stockBottles > 0 && !x.dutyFreeOnly).length + 1;
    rows.push({
      months, category: p.category, quality: p.evaluation.quality,
      bottlesPerBatch: Math.floor((b.lpa * lpaKept) / bottleLPA),
      spiritCost: Math.round(spiritCost), packCost: Math.round(packCost), price: p.suggestedPrice, distribution: Math.round(distribution),
      margin: Math.round(p.suggestedPrice - p.unitCost - distribution),
      demandPerMonth: Math.round(demandFor(s, product, same, calendar(s).monthOfYear).demandBottles),
    });
  }
  return rows;
}

// ───────────── 재고 개월 수 · 위스키 공급 전망 (#178, 1차 MVP 플레이테스트 2026-11-08) ─────────────
// 1차 플레이테스트: 소주 1제품을 15,271병(판매 186개월 치) 병입해 현금이 묶였고, 2~5년 차 생산을 줄여 7~8년 차 위스키가 끊겼다.
// 병입 전에 "이만큼이면 몇 개월 치인가", 생산 지시 옆에 "몇 년 뒤 위스키가 얼마나 나오나"를 보인다. 게임 상태를 바꾸지 않는다.

/** 이 범주의 최근 3개월 평균 판매(병/월) — 판매 기록이 없으면 null */
export function categoryMonthlySales(s: GameState, category: ProductCategory): number | null {
  const ids = new Set([...s.commerce.products, ...(s.commerce.productArchive ?? [])].filter((p) => p.category === category).map((p) => p.id));
  const recent = s.history.reports.slice(-3);
  if (!recent.length) return null;
  const sold = recent.reduce((t, r) => t + r.sales.filter((x) => ids.has(x.productId)).reduce((u, x) => u + x.bottles, 0), 0);
  return sold > 0 ? sold / recent.length : null;
}

/** 이 범주의 지금 재고(병, 국내 매대) */
export const categoryStock = (s: GameState, category: ProductCategory): number =>
  s.commerce.products.filter((p) => p.category === category && !p.dutyFreeOnly).reduce((t, p) => t + p.stockBottles, 0);

/**
 * 병입 뒤 그 범주의 재고가 몇 개월 치인가 — 최근 3개월 판매 속도로 나눈다. 판매 기록이 없으면 이번 달 수요 한도(근사)로.
 * monthly = 0이면(팔리지 않는다) Infinity
 */
export function stockMonthsAfter(s: GameState, category: ProductCategory, newBottles: number, demandGuess: number): { months: number; monthly: number; basis: 'sales' | 'demand' } {
  const sales = categoryMonthlySales(s, category);
  const monthly = sales ?? Math.max(0, demandGuess);
  const total = categoryStock(s, category) + newBottles;
  return { months: monthly > 0 ? total / monthly : Infinity, monthly, basis: sales != null ? 'sales' : 'demand' };
}

/** 병입 재고 경고 기준(개월) — 6개월 치를 넘으면 할인 이미지로 수요가 준다(#165 재고 경고와 같은 기준), 12개월은 강한 경고 */
export const STOCK_WARN_MONTHS = 6;
export const STOCK_STRONG_WARN_MONTHS = 12;

export interface SupplyYear {
  /** 0 = 앞으로 12개월, 1 = 그다음 12개월 … */
  year: number;
  /** 그 기간에 새로 위스키(법정 최소 숙성)가 되는 양 — 700ml·40% 병 기준 */
  bottles: number;
  /** 출처별 — 지금 숙성 중인 통 / 탱크 몰트(지금 통입한다고 보고) / 월 생산 지시 */
  fromCasks: number;
  fromTank: number;
  fromOrders: number;
}

/**
 * 위스키 공급 전망 — 앞으로 years년 동안 해마다 새로 위스키가 되는 양. 숙성 중인 몰트·그레인 통은 오크 개월로,
 * 탱크 몰트는 지금 통입한다고 보고, 생산 지시는 매달 만든 만큼 바로 통입한다고 본다(증발은 연 5%로 근사). 병입 시기는 플레이어 몫이라 "팔 수 있게 되는 양"만 센다
 */
export function whiskySupplyForecast(s: GameState, years = 5, minMonths = regionOf(s).whisky.minMonths): SupplyYear[] {
  const min = Math.max(1, minMonths);
  const bottleLPA = (STANDARD_BOTTLE.whisky.bottleMl / 1000) * STANDARD_BOTTLE.whisky.abv;
  const keep = (m: number) => Math.pow(0.95, m / 12);
  const out: SupplyYear[] = Array.from({ length: years }, (_, year) => ({ year, bottles: 0, fromCasks: 0, fromTank: 0, fromOrders: 0 }));
  const add = (monthFromNow: number, lpa: number, key: 'fromCasks' | 'fromTank' | 'fromOrders') => {
    const y = Math.floor(monthFromNow / 12);
    if (y < 0 || y >= years) return;
    out[y]![key] += lpa / bottleLPA;
  };
  for (const c of s.inventory.casks) {
    const l = c.contents;
    if (!l || c.owner || (l.kind !== 'malt' && l.kind !== 'grain') || l.oakMonths >= min) continue;
    const wait = min - l.oakMonths;
    add(wait - 1, l.volumeL * l.abv * keep(wait), 'fromCasks');
  }
  for (const l of s.inventory.lots) if ((l.kind === 'malt' || l.kind === 'grain') && !l.sourced) add(min - 1, l.volumeL * l.abv * keep(min), 'fromTank');
  // 생산 지시: 이번 달부터 매달 만든 원액이 min개월 뒤 위스키가 된다
  let perMonth = 0;
  for (const o of s.production.orders) {
    const r = s.production.recipes.find((x) => x.id === o.recipeId);
    if (!r || (r.kind !== 'malt' && r.kind !== 'grain') || o.batchesPerMonth <= 0) continue;
    const b = previewBatch(s, r);
    if (b) perMonth += b.lpa * o.batchesPerMonth;
  }
  for (let m = 0; m < years * 12; m++) add(m + min, perMonth * keep(min), 'fromOrders');
  for (const y of out) { y.fromCasks = Math.round(y.fromCasks); y.fromTank = Math.round(y.fromTank); y.fromOrders = Math.round(y.fromOrders); y.bottles = y.fromCasks + y.fromTank + y.fromOrders; }
  return out;
}

/**
 * 위스키 연 수요(병, 근사) — 이 판의 몰트 레시피로 만든 1년 숙성 위스키의 지금 한 달 수요 × 12 (병당 손익 표와 같은 계산).
 * 인지도·유통이 오르면 는다. 몰트 레시피가 없으면 null
 */
export function whiskyAnnualDemand(s: GameState): number | null {
  const r = s.production.recipes.find((x) => x.kind === 'malt');
  if (!r) return null;
  const row = recipeEconomics(s, r)[0];
  return row ? row.demandPerMonth * 12 : null;
}

/** 위스키 범주 — 몰트 위스키·그레인 위스키·블렌디드 (공급 전망의 몰트·그레인 통이 들어가는 곳) */
const WHISKY_CATEGORIES: ProductCategory[] = ['whisky', 'grain_whisky', 'blended_whisky'];

/** 위스키 연 판매 속도(병) — 위스키 범주들의 최근 3개월 판매가 있으면 그 속도 × 12, 없으면 수요 근사(whiskyAnnualDemand). 1차 플레이테스트에서 수요 근사(2,088)가 실제 판매(342/월 ≈ 4,100/년)와 달라 판매 기록을 먼저 쓴다 */
export function whiskyAnnualPace(s: GameState): { bottles: number; basis: 'sales' | 'demand' } | null {
  const per = WHISKY_CATEGORIES.map((c) => categoryMonthlySales(s, c)).filter((x): x is number => x != null);
  if (per.length) return { bottles: Math.round(per.reduce((a, b) => a + b, 0) * 12), basis: 'sales' };
  const d = whiskyAnnualDemand(s);
  return d != null ? { bottles: d, basis: 'demand' } : null;
}

/** 탱크의 몰트·그레인(직접 만든 것)을 통입하는 데 드는 200L 통 수와 숙성고 남은 자리 — 공급 전망은 "지금 통입한다"고 보므로 자리가 모자라면 그만큼 늦어진다 */
export function tankFillNeed(s: GameState): { liters: number; casks200: number; freeSlots: number } {
  const liters = s.inventory.lots.filter((l) => (l.kind === 'malt' || l.kind === 'grain') && !l.sourced).reduce((t, l) => t + l.volumeL, 0);
  return { liters: Math.round(liters), casks200: Math.ceil(liters / 200), freeSlots: Math.max(0, warehouseCapacity(s) - s.inventory.casks.length) };
}

// ───────────── 생산비 대 고정비 · 생산이 만드는 미래 위스키 (#185, 2차 MVP 플레이테스트 2026-11-08) ─────────────
// 2차 판: 현금이 줄자 생산을 0으로 했다(오너: "현금 아끼려고 + 경고의 '생산 지시 줄이기'를 보고"). 실제 생산비는 월 약 300만,
// 고정비는 월 2,000만~3,000만이라 아낀 돈은 작았고 3~5년 차에 팔 위스키가 사라졌다. 공급 전망은 "봤는데 의미를 몰랐다" —
// 병 수 대신 **돈**으로 보인다: 이 생산을 유지하면 월 얼마가 들고, 몇 년 뒤 해마다 위스키 몇 병(≈ 매출 얼마)이 생기는가. 상태를 바꾸지 않는다

export interface ProductionValue {
  /** 지금 생산 지시의 월 생산비(원재료·에너지 — 배치 원가 합) */
  costPerMonth: number;
  /** 그중 몰트·그레인 */
  whiskyCostPerMonth: number;
  /** 지금 몰트·그레인 지시가 법정 최소 숙성 뒤 해마다 만드는 위스키 병 수(700ml·40%, 증발 연 5% 근사) */
  whiskyBottlesPerYear: number;
  /** 1년 숙성 몰트 위스키 한 병의 권장 출고가·병당 이익 — 병당 손익 표(recipeEconomics)와 같은 값. 몰트 레시피가 없으면 null */
  pricePerBottle: number | null;
  marginPerBottle: number | null;
  /** 몰트·그레인 레시피별 "월 1배치"의 값 — 월 생산비, 해마다 생기는 위스키 병 수 */
  perBatch: { recipeId: string; name: string; costPerMonth: number; whiskyBottlesPerYear: number }[];
  /** 법정 최소 숙성(개월) — 이만큼 뒤부터 위스키가 된다 */
  minMonths: number;
}

export function productionValue(s: GameState, minMonths = regionOf(s).whisky.minMonths): ProductionValue {
  const min = Math.max(1, minMonths);
  const bottleLPA = (STANDARD_BOTTLE.whisky.bottleMl / 1000) * STANDARD_BOTTLE.whisky.abv;
  const keep = Math.pow(0.95, min / 12);
  const yearly = (lpaPerMonth: number) => Math.round((lpaPerMonth * 12 * keep) / bottleLPA);
  let cost = 0;
  let whiskyCost = 0;
  let whiskyLpa = 0;
  for (const o of s.production.orders) {
    const r = s.production.recipes.find((x) => x.id === o.recipeId);
    if (!r || o.batchesPerMonth <= 0) continue;
    const b = previewBatch(s, r);
    if (!b) continue;
    cost += b.cost * o.batchesPerMonth;
    if (r.kind === 'malt' || r.kind === 'grain') { whiskyCost += b.cost * o.batchesPerMonth; whiskyLpa += b.lpa * o.batchesPerMonth; }
  }
  const perBatch = s.production.recipes.filter((r) => r.kind === 'malt' || r.kind === 'grain').flatMap((r) => {
    const b = previewBatch(s, r);
    return b ? [{ recipeId: r.id, name: r.name, costPerMonth: Math.round(b.cost), whiskyBottlesPerYear: yearly(b.lpa) }] : [];
  });
  const malt = s.production.recipes.find((x) => x.kind === 'malt');
  const row = malt ? recipeEconomics(s, malt)[0] : undefined;
  return {
    costPerMonth: Math.round(cost), whiskyCostPerMonth: Math.round(whiskyCost), whiskyBottlesPerYear: yearly(whiskyLpa),
    pricePerBottle: row?.price ?? null, marginPerBottle: row?.margin ?? null, perBatch, minMonths: min,
  };
}


// ───────────── 증산 전망 (#271 단계 T 진입 조건 · #272 형태, 2026-11-11 — 후반 확인 판 오너 답 "늘려봐야 기다리려면 한참 걸려 소용없다(오판)") ─────────────
// P8 표준 규모 10시드: 120개월(판 끝 5년 전)에 몰트를 4 → 6배치로 늘려도 15년 순자산 +3.73억(현금 +2.47억), 처음부터면 +18.26억.
// 한계는 생산비가 아니라 숙성고 자리(8배치부터 150자리가 찬다)와 증류기다. 생산 지시 칸에 "얼마나 더 돌릴 수 있나 · 판 끝까지 얼마 · 언제까지 늘려도 회수되나"를 보인다.
// 새 경제 모델을 만들지 않는다 — 병당 이익·병 수는 recipeEconomics(1년·3년 숙성 손익표)를, 설비 여유는 capacityReport를 그대로 쓴다. 상태를 바꾸지 않는다

/** 증산 전망의 숙성 회전 가정 — 통 하나가 숙성고 자리를 차지하는 개월(3년 표기로 병입) */
export const RAMP_HOLD_MONTHS = 36;

export interface RampHorizon {
  /** 숙성 개월(병입 시점) — 12 = 1년 표기, 36 = 3년 표기 */
  months: number;
  bottlesPerBatch: number;
  /** 병당 이익(원액·통·보관·병입·유통 뺀 값, recipeEconomics) */
  margin: number;
  /** 지금부터 판 끝까지 매달 1배치를 더 만들 때 판 끝 전에 병입할 수 있는 병 수·이익(만든 만큼 판다고 볼 때). 판 끝이 없으면 null */
  bottlesToEnd: number | null;
  profitToEnd: number | null;
  /** 판 끝에 아직 숙성 중인 배치(마지막 months개월분)의 현물 평가액 — 순자산이 원액을 세는 방식(spotBidPerLPA)과 같다. 판 끝이 없으면 null */
  tailValue: number | null;
  /** 판 끝 이 개월 전까지 늘리면 판 안에 회수된다 — 팔린 병의 이익 ≥ 판 끝에 아직 숙성 중인 배치의 원가(평가액은 0으로 보수적).
   *  판 끝이 없는 판(샌드박스)에서는 같은 값이 "늘린 뒤 이 개월이면 누적 손익이 원가를 넘는다"는 뜻이다. 이익이 없으면 null */
  recoverMonths: number | null;
}

export interface RampOutlook {
  recipeId: string;
  name: string;
  /** 배치 1회 원료·에너지 */
  costPerBatch: number;
  /** 배치 1회를 63.5%로 통입할 때 200L 통 수 */
  casksPerBatch: number;
  /** 숙성고가 3년 회전으로 더 받을 수 있는 배치/월 — 지금 생산 지시와 위스키가 아닌 통(소주 숙성 등)을 뺀 자리 */
  warehouseBatches: number;
  /** 증류기·발효조·디스틸러가 더 받을 수 있는 배치/월 */
  equipmentBatches: number;
  /** 둘 중 작은 쪽 */
  headroomBatches: number;
  /** 지금 숙성고 빈 자리(통이 없는 자리)와 빈 통 수 — 빈 통도 자리를 차지하지만 새 원액을 담을 수 있다 */
  freeSlots: number;
  emptyCasks: number;
  /** 판 끝까지 남은 개월(시나리오만) */
  monthsLeft: number | null;
  /** 지금부터 판 끝까지 매달 1배치를 더 만들 때 원료·에너지 합계와 필요한 200L 통 수. 판 끝이 없으면 null */
  costToEnd: number | null;
  casksToEnd: number | null;
  horizons: RampHorizon[];
}

/** 몰트를 한 배치 더 돌릴 때의 전망 — 생산 지시가 있는 몰트 레시피(없으면 첫 몰트 레시피). 몰트 레시피·증류기가 없으면 null */
export function rampOutlook(s: GameState): RampOutlook | null {
  const malts = s.production.recipes.filter((r) => r.kind === 'malt');
  const r = malts.find((x) => s.production.orders.some((o) => o.recipeId === x.id && o.batchesPerMonth > 0)) ?? malts[0];
  if (!r) return null;
  const b = previewBatch(s, r);
  if (!b || b.lpa <= 0) return null;
  const sizeL = CASKS.ex_bourbon_barrel.sizeL;
  const casksPerBatch = b.lpa / ENTRY_ABV / sizeL;
  // 숙성고: 지금 생산 지시(몰트·그레인)가 3년 회전으로 차지할 자리 + 위스키가 아닌 원액이 든 통 → 남는 자리를 배치로
  let whiskyBatches = 0;
  for (const o of s.production.orders) {
    const x = s.production.recipes.find((y) => y.id === o.recipeId);
    if (!x || (x.kind !== 'malt' && x.kind !== 'grain') || o.batchesPerMonth <= 0) continue;
    const pb = previewBatch(s, x);
    if (pb) whiskyBatches += (o.batchesPerMonth * pb.lpa) / ENTRY_ABV / sizeL;
  }
  const capacity = warehouseCapacity(s);
  const otherCasks = s.inventory.casks.filter((c) => c.contents && c.contents.kind !== 'malt' && c.contents.kind !== 'grain').length;
  const slotsPerBatch = casksPerBatch * RAMP_HOLD_MONTHS;
  const warehouseBatches = Math.max(0, Math.floor((capacity - otherCasks - whiskyBatches * RAMP_HOLD_MONTHS) / slotsPerBatch));
  // 설비: 이 레시피의 증류기 회차 · 발효조 일수 · 디스틸러 회차
  const cap = capacityReport(s);
  const still = cap.stills.find((x) => x.id === r.stillId);
  const room = (free: number, per: number) => (per > 0 ? Math.max(0, Math.floor(free / per)) : Infinity);
  const equipmentBatches = Math.min(
    still ? room(still.cap - still.used, r.runs) : 0,
    room(cap.fermenterDaysCap - cap.fermenterDaysUsed, r.fermentDays + 2),
    room(cap.distillerRunsCap - cap.distillerRunsUsed, r.runs),
  );
  const monthsLeft = s.scenario ? Math.max(0, s.scenario.goal.months - s.month) : null;
  const allIn = b.cost + CASKS.ex_bourbon_barrel.price * CASK_COST_SHARE_PER_FILL * casksPerBatch;
  const rows = recipeEconomics(s, r).filter((row) => row.months > 0);
  // 판 끝 평가액: k개월 숙성한 1배치의 현물가(표준 조건 숙성 — 손익표와 같은 통·기후). 가장 긴 숙성까지 한 번만 숙성시키며 모은다
  const tailMonths = monthsLeft != null ? Math.min(monthsLeft, Math.max(0, ...rows.map((x) => x.months))) : 0;
  const batchValueAt = tailMonths > 0 ? agedBatchValues(s, r, b, tailMonths) : [];
  const horizons: RampHorizon[] = rows.map((row) => {
    const perBatch = row.bottlesPerBatch * row.margin;
    const sold = monthsLeft != null ? Math.max(0, monthsLeft - row.months) : null;
    const tail = monthsLeft != null ? Math.min(monthsLeft, row.months) : 0;
    return {
      months: row.months, bottlesPerBatch: row.bottlesPerBatch, margin: row.margin,
      bottlesToEnd: sold != null ? sold * row.bottlesPerBatch : null,
      profitToEnd: sold != null ? Math.round(sold * perBatch) : null,
      tailValue: monthsLeft != null ? Math.round(batchValueAt.slice(0, tail).reduce((a, v) => a + v, 0)) : null,
      recoverMonths: perBatch > 0 ? Math.ceil(row.months * (1 + allIn / perBatch)) : null,
    };
  });
  const eq = Number.isFinite(equipmentBatches) ? equipmentBatches : 0;
  return {
    recipeId: r.id, name: r.name, costPerBatch: Math.round(b.cost), casksPerBatch, warehouseBatches, equipmentBatches: eq, headroomBatches: Math.min(warehouseBatches, eq),
    freeSlots: Math.max(0, capacity - s.inventory.casks.length), emptyCasks: s.inventory.casks.filter((c) => !c.contents).length,
    monthsLeft, costToEnd: monthsLeft != null ? Math.round(monthsLeft * b.cost) : null, casksToEnd: monthsLeft != null ? Math.ceil(monthsLeft * casksPerBatch) : null, horizons,
  };
}

/** 1배치를 표준 조건(새 ex-버번 배럴·입지 연평균 기후)에서 0…n−1개월 숙성했을 때의 현물 평가액 — [k] = k개월 숙성. 상태를 바꾸지 않는다 */
function agedBatchValues(s: GameState, r: Recipe, b: { lpa: number; volumeL: number; abv: number; cost: number; flavor: SpiritLot['flavor'] }, n: number): number[] {
  const site = siteOf(s);
  const climate = { tempC: site.tempC.reduce((a, x) => a + x, 0) / 12, humidity: site.humidity.reduce((a, x) => a + x, 0) / 12 };
  const def = CASKS.ex_bourbon_barrel;
  const entry = Math.min(ENTRY_ABV, b.abv);
  const lot: SpiritLot = {
    id: '__ramp', name: r.name, kind: r.kind, volumeL: def.sizeL, abv: entry, flavor: b.flavor, createdMonth: s.month, oakMonths: 0, sourced: false, costPerLPA: b.cost / b.lpa, recipeId: r.id,
    ...(r.mashBill.length ? { mashShare: Object.fromEntries(r.mashBill.map((m) => [m.ingredientId, m.ratio])) } : {}),
  };
  let cask: Cask & { contents: SpiritLot } = { id: '__ramp', typeId: def.id, sizeL: def.sizeL, wood: def.wood, activity: def.activity, seasoning: def.seasoning, fills: 0, recharCount: 0, char: def.char, contents: lot };
  const caskLPA = def.sizeL * entry;
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const l = cask.contents;
    out.push(b.lpa * ((l.volumeL * l.abv) / caskLPA) * spotBidPerLPA(s, l));
    cask = matureCask(cask, climate, { control: 0 }).cask as typeof cask;
  }
  return out;
}

/** 위스키 수출 속도(병/년) — 최근 3개월 수출 판매와 수입사 수요(위스키 범주 제품). 수출 기록이 없으면 null */
export function whiskyExportPace(s: GameState): { bottles: number; demand: number } | null {
  const ids = new Set([...s.commerce.products, ...(s.commerce.productArchive ?? [])].filter((p) => WHISKY_CATEGORIES.includes(p.category)).map((p) => p.id));
  const recent = s.history.reports.slice(-3);
  const ex = recent.flatMap((x) => x.exports ?? []).filter((x) => ids.has(x.productId));
  if (!recent.length || !ex.length) return null;
  const per = (f: (x: (typeof ex)[number]) => number) => Math.round((ex.reduce((a, x) => a + f(x), 0) / recent.length) * 12);
  return { bottles: per((x) => x.bottles), demand: per((x) => Math.max(x.bottles, x.demandBottles)) };
}


// ───────────── 자동 최적 가격 (#200, 3차 MVP 플레이테스트 오너 요청·선택 "이번 달 이익 최대") ─────────────
// 토글을 켠 제품은 매달 판매 직전에 값을 정한다 — 판매 화면의 가격 비교(priceOptions)와 같은 식으로, 이번 달 **국내 진열 전체**의 공헌이익
// (각 제품 팔 수 있는 양 × 병당 공헌이익의 합, #220)이 가장 큰 값. 재고가 적으면 올리고 많으면 내린다. 병당 손해 나는 값은 고르지 않는다. 3차 판은 입력 실수로 위스키를 권장가의 1/3에 10개월 팔았다

/** 지금 권장 출고가 — 품질·숙성·주세 경감으로 정해진다(판매 화면의 "권장"과 같은 값) */
export function currentSuggested(s: GameState, p: Product): number {
  const region = regionOf(s);
  const oak = isWhiskyCategory(p.category) ? p.oakMonths ?? (p.ageYears ?? 0) * 12 : null;
  return suggestedPrice(region, p.category, p.bottleMl, p.quality, oak, p.abv, traditionalTaxFactor(region, p.traditional, s.commerce.traditionalReleasedL, s.commerce.traditionalPrevYearL), { oakMonths: p.oakMonths, restMonths: p.restMonths });
}

/** 자동 가격 후보 — 권장 출고가의 0.6~2배 + 지금 값 */
export const AUTO_PRICE_FACTORS = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.75, 2] as const;

/** 이번 달 이익이 가장 큰 출고가 — 이익이 나는 값이 없으면 null(지금 값을 그대로 둔다). 면세 한정판·재고 없는 제품은 null */
export function bestAutoPrice(s: GameState, p: Product, monthOfYear = calendar(s).monthOfYear): number | null {
  if (p.dutyFreeOnly || p.stockBottles <= 0 || p.price <= 0) return null;
  const base = currentSuggested(s, p);
  const prices = [...new Set([p.price, ...AUTO_PRICE_FACTORS.map((f) => Math.max(100, Math.round((base * f) / 100) * 100))])];
  const opts = priceOptions(s, p, monthOfYear, prices.map((x) => x / p.price));
  // 국내 진열 전체 공헌이 가장 큰 값 (#212 · #220, 4차 플레이테스트 MKT 분석): 같은 범주 제품끼리 손님을 나누므로
  // 한 제품 값을 내려 늘어난 판매의 상당 부분은 형제 제품에서 온다 — 제품 혼자의 공헌으로 고르면 값을 너무 내린다.
  // 이 제품 자신의 공헌이 0 이하인 값(병당 손해 · 하나도 안 팔림)은 고르지 않는다 — 형제를 위해 한 제품을 사실상 내리는 일을 막는다
  let best: (typeof opts)[number] | null = null;
  for (const o of opts) if (o.contribution > 0 && (!best || o.lineupContribution > best.lineupContribution)) best = o;
  return best?.price ?? null;
}

/** 판매 직전(틱 5단계 맨 앞): 자동 가격을 켠 제품의 값을 차례로 정한다 — 앞 제품의 새 값이 뒤 제품의 수요 나눔에 반영된다 */
export function applyAutoPrices(s: GameState, monthOfYear = calendar(s).monthOfYear): void {
  for (const p of s.commerce.products) {
    if (!p.autoPrice) continue;
    const v = bestAutoPrice(s, p, monthOfYear);
    if (v != null) p.price = v;
  }
}


// ───────────── 자동 납품(재고 자동 보충) (#206, 2026-11-09 오너 요청) ─────────────
// 토글을 켠 제품은 매달 판매 직전에 재고가 "n개월분" 아래면 원액을 골라 그 제품에 재고 보충(restock)한다 — 결품이 나지 않게.
// 소주·진·고량주: 탱크 원액, 오래된 것부터(먼저 만든 것부터). 위스키: 그 제품의 숙성 표기(n년)를 채운 통 중 **표기에 가장 가까운(어린) 통부터**
// (오너 선택 — 오래된 통은 플래그십 후보로 아낀다). 병·도수·포장·피니시는 제품 그대로이고, 품질·향은 재고 보충과 같은 가중 평균이다.
// 원액이 모자라면 있는 만큼, 현금이 모자라면 건너뛴다. 봇은 쓰지 않는다

/** 결산표 비용 항목 이름 */
export const AUTO_RESTOCK_EXPENSE = '자동 납품 병입';
/** 자동 납품 목표 — 몇 개월분 재고를 유지할지 */
export const AUTO_RESTOCK_MONTHS = [1, 2, 3, 6] as const;

/** 범주 → 원액 주종 (자동 납품을 지원하는 범주만). 블렌디드·몰트 스피릿·기타는 지원하지 않는다 */
const RESTOCK_KIND: Partial<Record<ProductCategory, SpiritKind>> = { soju_distilled: 'soju', gin: 'gin', baijiu: 'baijiu', whisky: 'malt', grain_whisky: 'grain' };
export const autoRestockSupported = (p: Product): boolean => !p.dutyFreeOnly && !!RESTOCK_KIND[p.category];

/** 이 제품의 한 달 판매 기대 — 이번 달 수요(같은 범주 나눔 반영, 품절이면 혼자일 때)와 최근 3개월 판매 중 큰 값 */
export function productMonthlyPace(s: GameState, p: Product, monthOfYear = calendar(s).monthOfYear): number {
  const d = domesticDemands(s, monthOfYear).get(p.id)?.demandBottles ?? demandFor(s, p, 1, monthOfYear).demandBottles;
  const rs = s.history.reports.slice(-3);
  const sold = rs.length ? rs.reduce((t, r) => t + r.sales.filter((x) => x.productId === p.id).reduce((u, x) => u + x.bottles, 0), 0) / rs.length : 0;
  return Math.max(d, sold);
}

/**
 * 자동 경로의 플래그십 후보 보호 (#252 → 캐스크 태그 #260·#249 ②, 2026-11-11). 후반 확인 판: 2·3년 표기 제품의 자동 납품이 "어린 통부터" 쓰다
 * 소비가 공급을 넘자 12년 후보 통까지 다 써 플래그십을 놓쳤다(오너 "몰랐다, 장기 숙성용 캐스크가 모두 소진되어 곤란").
 * 이제 보호는 **태그 한 곳**이다 — 숨은 "가장 오래된 4통" 대신 보이는 "플래그십 예비" 태그(`tags.ts reserveCaskIds`, 통 수 = `PROD_TUNING.flagshipReserve`)와
 * 플레이어가 붙인 "보호" 태그를 자동 납품이 쓰지 않는다. 플래그십 예비만은 #252처럼 **표기가 플래그십 숙성보다 짧은 제품**에만 건다 —
 * 플래그십 표기 제품의 보충은 예비 통이 바로 쓸 곳이다. 손으로 병입·맡기기는 그대로 쓸 수 있다(맡기기 태그 효과는 MKT 몫)
 */
export function flagshipGuard(s: GameState, p: Pick<Product, 'ageYears'>): boolean {
  if (!s.scenario) return false;
  if (s.progress.milestones.some((m) => m.id === 'flagship_sold')) return false;
  return (p.ageYears ?? 0) * 12 < s.scenario.goal.flagshipMinMonths;
}

/** 플래그십 예비 통 — `tags.ts reserveCaskIds`와 같다(보호 계산은 태그 한 곳). 옛 이름은 ARCH `tags.test.ts`(#260 "손대지 않으면 #252와 같다")가 쓴다 */
export const flagshipReserve = (s: GameState): Set<string> => reserveCaskIds(s);

/** 이 제품의 자동 납품이 쓰지 않는 통 — 보호 태그가 붙은 통(#249 ②). 플래그십 표기 제품이면 "플래그십 예비"만으로 보호된 통은 쓴다 */
export function autoRestockExcluded(s: GameState, p: Pick<Product, 'ageYears'>): Set<string> {
  const out = protectedCaskIds(s);
  if (flagshipGuard(s, p) || !out.size) return out;
  // 다른 보호 태그(플레이어가 붙인 것)가 없는 예비 통만 푼다
  for (const id of reserveCaskIds(s)) {
    const c = s.inventory.casks.find((x) => x.id === id);
    const own = (c?.contents?.tagIds ?? []).some((t) => t !== FLAGSHIP_RESERVE_TAG && tagDef(s, t)?.effect === 'protect');
    if (!own) out.delete(id);
  }
  return out;
}

/** 이 제품의 자동 납품에서 "플래그십 예비"로 보호 중인 통 수(표기 하한을 채운 통) — 할 일 문구용 */
export function guardedFlagshipCasks(s: GameState, p: Product): number {
  if (!isWhiskyCategory(p.category) || !flagshipGuard(s, p)) return 0;
  const minOak = autoRestockFloor(s, p);
  const reserve = reserveCaskIds(s);
  return s.inventory.casks.filter((c) => reserve.has(c.id) && c.contents!.oakMonths >= minOak).length;
}

/**
 * 자동 납품이 쓸 통의 최소 숙성(개월) — 플레이어가 정한 하한(#267), 없으면 제품 표기 연수(없으면 법정 숙성).
 * 표기 하한 함정(후반 확인 판 ARCH §7.21): 오래된 통으로 처음 병입한 제품(예: 6년 표기)은 하한이 표기와 같아 자동 납품이 가장 오래된 통만 가져갔다
 */
export function autoRestockFloor(s: GameState, p: Pick<Product, 'ageYears' | 'autoRestockMinMonths'>): number {
  const legal = whiskyMinMonths(regionOf(s).whisky);
  const label = p.ageYears ? p.ageYears * 12 : legal;
  return p.autoRestockMinMonths != null ? Math.max(legal, Math.min(label, p.autoRestockMinMonths)) : label;
}

/** 자동 납품 하한이 길어 오래된 통만 쓰는 제품인가 — 화면 경고용(5년 이상) */
export const AUTO_RESTOCK_LONG_FLOOR = 60;

/** 자동 납품 원액 후보 — 쓸 순서대로. 위스키는 숙성 표기를 채우고 피니시가 같고 도수가 충분한 나무 통, 보호 태그 통 빼고, "먼저 쓰기" 태그 통 먼저, 그다음 어린 통부터 */
export function autoRestockSources(s: GameState, p: Product): { comp: Omit<BlendComponent, 'liters'>; lot: SpiritLot }[] {
  const kind = RESTOCK_KIND[p.category];
  if (!kind) return [];
  if (!isWhiskyCategory(p.category)) {
    const minAbv = isCaskStrength(p) ? 0.4 : p.abv - 1e-9;
    // 숙성 소주 표기 제품 (#221) — 탱크 원액을 섞으면 표기가 빠지므로, 표기 개월 이상 쉰 같은 용기(옹기/오크)의 통에서 어린 통부터
    if (agedWhiteLabel(p.category, p.oakMonths, p.restMonths)) {
      const onggi = (p.restMonths ?? 0) >= (p.oakMonths ?? 0);
      const need = agedWhiteLabelMonths(Math.max(p.restMonths ?? 0, p.oakMonths ?? 0));
      const months = (l: SpiritLot) => (onggi ? l.restMonths ?? 0 : l.oakMonths);
      const excluded = autoRestockExcluded(s, p);
      const pref = preferredCaskIds(s);
      return s.inventory.casks.filter((c): c is Cask & { contents: SpiritLot } => !!c.contents && !c.owner && !c.handfill && !c.contaminationKnown && (vesselMaterial(c) === 'wood') !== onggi
          && c.contents.kind === kind && !c.contents.sourced && months(c.contents) >= need && c.contents.abv >= minAbv && (finishOf(c.contents)?.typeId ?? null) === (p.finish ?? null)
          && !excluded.has(c.id))
        .sort((a, b) => Number(pref.has(b.id)) - Number(pref.has(a.id)) || months(a.contents) - months(b.contents) || a.id.localeCompare(b.id))
        .map((c) => ({ comp: { source: 'cask' as const, id: c.id }, lot: c.contents }));
    }
    // 같은 레시피 탱크만 (#243) — 레시피 기록이 없는 옛 제품은 모든 탱크
    const rec = p.recipeIds?.length ? new Set(p.recipeIds) : null;
    return s.inventory.lots.filter((l) => l.kind === kind && l.abv >= minAbv && !l.sourced && l.oakMonths === 0 && (!rec || (!!l.recipeId && rec.has(l.recipeId))))
      .sort((a, b) => a.createdMonth - b.createdMonth || a.id.localeCompare(b.id))
      .map((l) => ({ comp: { source: 'lot' as const, id: l.id }, lot: l }));
  }
  const minOak = autoRestockFloor(s, p);
  const minAbv = isCaskStrength(p) ? 0.4 : p.abv - 1e-9; // 캐스크 스트렝스는 통 도수 그대로 병입한다
  const finish = p.finish ?? null;
  // 보호 태그 통은 빼고(#249 ② — 플래그십 예비 #260 포함), "먼저 쓰기" 태그 통을 먼저, 그다음 어린 통부터
  const excluded = autoRestockExcluded(s, p);
  const pref = preferredCaskIds(s);
  return s.inventory.casks.filter((c): c is Cask & { contents: SpiritLot } => !!c.contents && !c.owner && !c.handfill && !c.contaminationKnown && vesselMaterial(c) === 'wood'
      && c.contents.kind === kind && !c.contents.sourced && c.contents.oakMonths >= minOak && c.contents.abv >= minAbv && (finishOf(c.contents)?.typeId ?? null) === finish
      && !excluded.has(c.id))
    .sort((a, b) => Number(pref.has(b.id)) - Number(pref.has(a.id)) || a.contents.oakMonths - b.contents.oakMonths || a.id.localeCompare(b.id))
    .map((c) => ({ comp: { source: 'cask' as const, id: c.id }, lot: c.contents }));
}

/** 이번 달 자동 납품 계획 — 채울 병 수만큼 원액을 고른다. 필요 없거나 원액이 없으면 null */
export function autoRestockPlan(s: GameState, p: Product, monthOfYear = calendar(s).monthOfYear): { components: BlendComponent[]; opts: BottleOptions; target: number; need: number } | null {
  if (!p.autoRestock || !autoRestockSupported(p)) return null;
  const target = Math.ceil(productMonthlyPace(s, p, monthOfYear) * p.autoRestock);
  const need = target - p.stockBottles;
  if (need < 1) return null;
  const lpaNeed = (need + 1) * (p.bottleMl / 1000) * p.abv; // 병 수 내림을 생각해 1병 여유
  const components: BlendComponent[] = [];
  let got = 0;
  for (const x of autoRestockSources(s, p)) {
    if (got >= lpaNeed) break;
    const liters = Math.min(x.lot.volumeL, (lpaNeed - got) / x.lot.abv);
    if (liters < 0.5) continue;
    components.push({ ...x.comp, liters: Math.floor(liters * 10) / 10 });
    got += Math.floor(liters * 10) / 10 * x.lot.abv;
  }
  if (!components.length) return null;
  const opts: BottleOptions = { name: '', targetAbv: isCaskStrength(p) ? 'cask' : p.abv, bottleMl: p.bottleMl, chillFilter: p.chillFiltered, packagingId: p.packagingId, restockId: p.id , ...(p.packaging ? { packaging: p.packaging } : {}) };
  return { components, opts, target, need };
}

/** 판매 직전(틱 5단계 맨 앞): 자동 납품을 켠 제품을 차례로 채운다. 결과는 리포트 메모에 남는다 */
export function applyAutoRestock(s: GameState, report: MonthReport, monthOfYear = calendar(s).monthOfYear): void {
  for (const p0 of [...s.commerce.products]) {
    if (!p0.autoRestock) continue;
    const p = s.commerce.products.find((x) => x.id === p0.id);
    if (!p) continue;
    const plan = autoRestockPlan(s, p, monthOfYear);
    if (!plan) {
      if (p.stockBottles < Math.ceil(productMonthlyPace(s, p, monthOfYear) * (p.autoRestock ?? 0))) report.notes.push(`자동 납품 「${p.name}」 — 쓸 원액이 없어 못 채웠다${isWhiskyCategory(p.category) ? ` (${p.ageYears ? `${p.ageYears}년 이상` : '법정 숙성 이상'} 숙성·같은 피니시·도수 ${Math.round(p.abv * 1000) / 10}% 이상 통이 필요)` : ' (탱크 원액 필요)'}`);
      continue;
    }
    const pv = previewBlend(s, plan.components, plan.opts);
    if (!pv.ok) { report.notes.push(`자동 납품 「${p.name}」 건너뜀 — ${pv.errors.join(' / ')}`); continue; }
    // 병입 때 나가는 현금 = 포장·병입 인건비 (원액 원가는 이미 쓴 돈) — 병당 원가에서 원액 몫을 뺀다
    const spirit = plan.components.reduce((tot, c) => { const l = c.source === 'cask' ? s.inventory.casks.find((k) => k.id === c.id)?.contents : s.inventory.lots.find((k) => k.id === c.id); return tot + (l ? c.liters * l.abv * l.costPerLPA : 0); }, 0);
    const cost = Math.max(0, Math.round(pv.unitCost * pv.bottles - spirit));
    if (s.finance.cash < cost) { report.notes.push(`자동 납품 「${p.name}」 건너뜀 — 현금 부족(병입비 약 ${cost.toLocaleString()}원)`); continue; }
    const before = p.stockBottles;
    const res = executeBlend(s, plan.components, plan.opts);
    if (res.error || !res.product) { report.notes.push(`자동 납품 「${p.name}」 실패 — ${res.error ?? ''}`); continue; }
    const used = plan.components.map((c) => c.source === 'cask' ? c.id : '탱크').filter((v, i, a) => a.indexOf(v) === i).join(', ');
    const short = res.product.stockBottles < plan.target ? ` — 원액이 모자라 목표의 ${Math.round((res.product.stockBottles / plan.target) * 100)}%까지만` : '';
    report.notes.push(`자동 납품 「${res.product.name}」 +${(res.product.stockBottles - before).toLocaleString()}병 (목표 ${plan.target.toLocaleString()}병 = ${p0.autoRestock}개월분, 원액 ${used})${short}`);
    // 결산표에 보이게 — 현금은 executeBlend가 이미 뺐다(리포트 표시용)
    report.expenses[AUTO_RESTOCK_EXPENSE] = (report.expenses[AUTO_RESTOCK_EXPENSE] ?? 0) + cost;
  }
}
