import { logisticsCost } from './content/catalog';
import { CATEGORY } from './content/categories';
import { displayName, RETAILERS } from './content/names';
import { regionOf } from './content/regions';
import { siteOf } from './content/sites';
import { buyersFor } from './bulk';
import { suggestedPrice } from './blending';
import { addModifier } from './modifiers';
import { capacityReport } from './step';
import type { Rng } from './rng';
import type { GameState, MonthReport, OemContract, OemOffer, ProductCategory, RetailContract, RetailOffer } from './types';
import { nid } from './util';

// 산지 대표 거래 (결정 #65, regions.md §6.2) — 경기: 대형 유통 납품 / 간토: 대기업 위탁생산(OEM). 수치 [튜닝]

export const RETAIL = { priceFactor: 0.8, termMonths: 12, paymentDelay: 2, penaltyShare: 0.15, offerChance: 0.15, maxActive: 2, appealPremium: 0.9, awarenessGain: 1.2 };
/** 위탁생산: 남는 증류기 가동분이 있으면 제안이 자주(월 25%), 그 크기에 맞춰 들어온다 — 위탁사는 유휴 설비를 찾는다 */
export const OEM = { feePerBatch: 900_000, penaltyShare: 1, offerChance: 0.08, offerChanceSpare: 0.25, maxActive: 2, runs: 2, fermentDays: 4 };

/** 대형 유통 납품 규격 (카테고리별 대표 제품) */
const RETAIL_SPEC: Partial<Record<ProductCategory, { ml: number; abv: number; age: number | null }>> = {
  soju_distilled: { ml: 375, abv: 0.25, age: null },
  gin: { ml: 700, abv: 0.43, age: null },
  baijiu: { ml: 500, abv: 0.34, age: null },
  blended_whisky: { ml: 700, abv: 0.4, age: 3 },
  whisky: { ml: 700, abv: 0.46, age: 3 },
};

export function makeRetailOffer(s: GameState, rng: Rng): RetailOffer {
  const owned = [...new Set(s.products.filter((p) => p.stockBottles > 0 && !p.dutyFreeOnly && RETAIL_SPEC[p.category]).map((p) => p.category))];
  const category = owned.length ? rng.pick(owned) : 'soju_distilled';
  const spec = RETAIL_SPEC[category]!;
  const ref = suggestedPrice(regionOf(s), category, spec.ml, 60, spec.age, spec.abv);
  return {
    id: nid(s, 'U'), partner: displayName(rng.pick(RETAILERS)), category, bottlesPerMonth: rng.pick([300, 600, 1000]),
    priceFactor: RETAIL.priceFactor, termMonths: RETAIL.termMonths, paymentDelay: RETAIL.paymentDelay,
    penaltyPerBottle: Math.round((ref * RETAIL.penaltyShare) / 10) * 10, expiresMonth: s.month + 3,
  };
}

/** 위탁생산에 내줄 수 있는 월 배치 수 = (증류기 가동 여력 − 자사 생산 지시 − 기존 위탁) / 배치당 증류 횟수 */
export function oemSpareBatches(s: GameState): number {
  const cap = capacityReport(s);
  const runs = cap.stills.reduce((t, x) => t + x.cap - x.used, 0) - s.oemContracts.reduce((t, c) => t + c.batchesPerMonth * OEM.runs, 0);
  return Math.max(0, Math.floor(runs / OEM.runs));
}

export function makeOemOffer(s: GameState, rng: Rng): OemOffer | null {
  const domestic = buyersFor(s).filter((b) => b.domestic);
  if (!domestic.length) return null;
  const fee = OEM.feePerBatch;
  const spare = oemSpareBatches(s);
  const batchesPerMonth = spare >= 2 ? Math.max(2, Math.round(spare * rng.pick([0.5, 0.75, 1]))) : rng.pick([2, 4]);
  return {
    id: nid(s, 'W'), buyerName: rng.pick(domestic).nameKo, batchesPerMonth, feePerBatch: fee,
    termMonths: rng.pick([12, 24]), penaltyPerBatch: Math.round(fee * OEM.penaltyShare), expiresMonth: s.month + 3,
  };
}

/** 월말: 산지 대표 거래 제안 갱신 */
export function refreshDeals(s: GameState, rng: Rng): void {
  const deals = siteOf(s).deals ?? [];
  s.retailOffers = s.retailOffers.filter((o) => o.expiresMonth > s.month);
  s.oemOffers = s.oemOffers.filter((o) => o.expiresMonth > s.month);
  if (deals.includes('retail') && !s.retailOffers.length && s.retailContracts.length < RETAIL.maxActive && rng.chance(RETAIL.offerChance)) s.retailOffers.push(makeRetailOffer(s, rng));
  if (deals.includes('oem') && !s.oemOffers.length && s.oemContracts.length < OEM.maxActive && rng.chance(oemSpareBatches(s) >= 2 ? OEM.offerChanceSpare : OEM.offerChance)) {
    const o = makeOemOffer(s, rng);
    if (o) s.oemOffers.push(o);
  }
}

/** 대형 유통 계약 체결 — 입점 노출로 인지도는 빨리 오르지만, 숙성 위스키의 프리미엄 이미지는 깎인다 */
export function startRetail(s: GameState, o: RetailOffer): RetailContract {
  const { expiresMonth: _e, ...terms } = o;
  addModifier(s, 'appeal:premium', RETAIL.appealPremium, o.termMonths, `${o.partner} 입점 — 대중 브랜드 이미지`);
  addModifier(s, 'awareness_gain', RETAIL.awarenessGain, o.termMonths, `${o.partner} 입점 — 매대 노출`);
  return { ...terms, startMonth: s.month, monthsDone: 0, delivered: 0, shortfall: 0 };
}

export function startOem(s: GameState, o: OemOffer): OemContract {
  const { expiresMonth: _e, ...terms } = o;
  return { ...terms, startMonth: s.month, monthsDone: 0, missed: 0 };
}

/** 월간 대형 유통 납품 (일반 판매보다 먼저 재고를 가져간다). 대금은 paymentDelay개월 뒤 입금 */
export function fulfillRetail(s: GameState, report: MonthReport): void {
  const outbound = siteOf(s).outboundLogistics;
  const done: string[] = [];
  for (const c of s.retailContracts) {
    let need = c.bottlesPerMonth;
    let amount = 0;
    let logistics = 0;
    for (const p of s.products.filter((x) => x.category === c.category && x.stockBottles > 0 && !x.dutyFreeOnly).sort((a, b) => a.createdMonth - b.createdMonth)) {
      if (need <= 0) break;
      const take = Math.min(need, p.stockBottles);
      p.stockBottles -= take;
      p.totalSold += take;
      amount += take * p.price * c.priceFactor;
      logistics += take * logisticsCost(p.bottleMl) * outbound;
      need -= take;
    }
    const delivered = c.bottlesPerMonth - need;
    if (amount > 0) s.receivables.push({ dueMonth: s.month + c.paymentDelay, amount: Math.round(amount), label: `${c.partner} 납품 대금` });
    const penalty = need * c.penaltyPerBottle;
    s.cash -= Math.round(logistics + penalty);
    report.expenses.distribution = (report.expenses.distribution ?? 0) + Math.round(logistics);
    if (penalty > 0) {
      report.expenses.penalty = (report.expenses.penalty ?? 0) + penalty;
      report.notes.push(`${c.partner} 납품 부족 ${need}병 — 위약금`);
    }
    c.delivered += delivered;
    c.shortfall += need;
    c.monthsDone += 1;
    if (c.shortfall >= 2 * c.bottlesPerMonth) { report.notes.push(`${c.partner} 납품 계약 파기 — 누적 미납 과다`); done.push(c.id); }
    else if (c.monthsDone >= c.termMonths) { report.notes.push(`${c.partner} 납품 계약 만료 — 총 ${c.delivered.toLocaleString()}병 (${CATEGORY[c.category].nameKo})`); done.push(c.id); }
  }
  s.retailContracts = s.retailContracts.filter((c) => !done.includes(c.id));
}
