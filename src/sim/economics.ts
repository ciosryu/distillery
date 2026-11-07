// 병당 손익 (파트 PROD — 플레이테스트 2026-11-07 오너 요청 "내가 만들 술의 원가와 판매가의 임팩트를 알기 쉽게", P-PROD-8)
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
import { calendar } from './util';
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
