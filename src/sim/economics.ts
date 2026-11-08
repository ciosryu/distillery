// 병당 손익 (파트 PROD — 플레이테스트 2026-11-07 오너 요청 "내가 만들 술의 원가와 판매가의 임팩트를 알기 쉽게", #173)
// 레시피 하나로 만든 술 한 병이 얼마에 만들어지고, 얼마에 팔리고, 얼마가 남고, 한 달에 몇 병 팔리는지.
// 실제 병입(previewBlend)·판매(demandFor·bottleMargin)와 **같은 식**을 쓴다 — 가상의 탱크 원액을 하나 끼워 넣은 상태 사본에서 계산한다.
// 위스키는 표준 조건(새 ex-버번 배럴·입지 연평균 기후)으로 숙성을 굴린 **예상**이다 — 실제 캐스크는 샘플로 확인한다. 게임 상태를 바꾸지 않는다.

import { CASK_COST_SHARE_PER_FILL, CASK_STORAGE, CASKS } from './content/catalog';
import { regionOf, siteOf } from './content/regions';
import { previewBlend, type BottleOptions } from './blending';
import { matureCask } from './maturation';
import { previewBatch } from './production';
import { demandFor, distributionCostPerBottle } from './market';
import { outboundLogistics } from './sites';
import { calendar, warehouseCapacity } from './util';
import type { Cask, GameState, Product, ProductCategory, Recipe, SpiritLot } from './types';

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
