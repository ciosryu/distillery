import { EQUIPMENT, logisticsCost } from './content/catalog';
import { CATEGORY } from './content/categories';
import { displayName, RETAILERS } from './content/names';
import { regionOf, siteOf } from './content/regions';
import { buyersFor } from './bulk';
import { suggestedPrice } from './blending';
import { addModifier } from './modifiers';
import { equipmentCost, outboundLogistics } from './sites';
import type { Rng } from './rng';
import type { GameState, MonthReport, OemContract, OemOffer, ProductCategory, RetailContract, RetailOffer } from './types';
import { nid } from './util';
import { sellFromLots } from './lots';

// 입지 대표 거래 (결정 #88·#89, docs/design/regions.md §6.2) — 경기: 대형 유통 납품 / 간토: 위탁생산(OEM). 수치 [튜닝]

/** 대형 유통 납품: 출고가 80%, 12개월, 대금 2개월 뒤, 미납 위약금 15%. 계약 중 숙성 위스키 매력도 ×0.9, 인지도 상승 ×1.2 */
export const RETAIL_DEAL = { priceFactor: 0.8, termMonths: 12, paymentDelay: 2, penaltyShare: 0.15, offerChance: 0.15, maxActive: 2, appealPremium: 0.9, awarenessGain: 1.2 };

/** 위탁생산: 남는 증류기 가동분이 있으면 제안이 자주(월 25%), 그 크기에 맞춰 들어온다. 없으면 전용 증류기 설치 지원형 */
export const OEM = {
  feePerBatch: 900_000, penaltyShare: 1, offerChance: 0.08, offerChanceSpare: 0.25, maxActive: 2, runs: 2, fermentDays: 4,
  dedicated: { package: ['pot_onion_1000', 'ferm_steel_2000', 'ferm_steel_2000'], supportShare: 0.6, batchesPerMonth: 6, termMonths: 36 },
};

/** 대형 유통 납품 규격 (카테고리별 대표 제품) */
const RETAIL_SPEC: Partial<Record<ProductCategory, { ml: number; abv: number; oakMonths: number | null }>> = {
  soju_distilled: { ml: 375, abv: 0.25, oakMonths: null },
  gin: { ml: 700, abv: 0.43, oakMonths: null },
  baijiu: { ml: 500, abv: 0.34, oakMonths: null },
  blended_whisky: { ml: 700, abv: 0.4, oakMonths: 36 },
  whisky: { ml: 700, abv: 0.46, oakMonths: 36 },
};

export function makeRetailOffer(s: GameState, rng: Rng): RetailOffer {
  const owned = [...new Set(s.commerce.products.filter((p) => p.stockBottles > 0 && !p.dutyFreeOnly && RETAIL_SPEC[p.category]).map((p) => p.category))];
  const category = owned.length ? rng.pick(owned) : 'soju_distilled';
  const spec = RETAIL_SPEC[category]!;
  const ref = suggestedPrice(regionOf(s), category, spec.ml, 60, spec.oakMonths, spec.abv);
  return {
    id: nid(s, 'U'), partner: displayName(rng.pick(RETAILERS)), category, bottlesPerMonth: rng.pick([300, 600, 1000]),
    priceFactor: RETAIL_DEAL.priceFactor, termMonths: RETAIL_DEAL.termMonths, paymentDelay: RETAIL_DEAL.paymentDelay,
    penaltyPerBottle: Math.round((ref * RETAIL_DEAL.penaltyShare) / 10) * 10, expiresMonth: s.month + 3,
  };
}

/** 전용 증류기 설비 패키지 설치비 (입지 건설비 반영) */
/** 납품 계약을 우리가 해지할 때 내는 비용 — 남은 개월 × 월 물량 × 병당 위약금의 절반. 해지 명령과 확인 미리보기(#240)가 같이 쓴다 */
/** 미납이 이만큼 쌓이면 계약이 깨진다 — 월 물량 × 이 값(`fulfillRetail`). 화면의 "파기까지 n병"과 같은 기준 */
export const RETAIL_BREAK_MONTHS = 2;

/** 계약이 깨지기까지 남은 미납 병 수 — 이번 달 이만큼 더 못 채우면 파기 ([제안 P-MKT-42] ⓑ · 화면 계산만) */
export const retailBreakRemaining = (c: Pick<RetailContract, 'bottlesPerMonth' | 'shortfall'>): number => Math.max(0, RETAIL_BREAK_MONTHS * c.bottlesPerMonth - c.shortfall);

/**
 * 납품 제안을 받기 전에 보는 전망 ([제안 P-MKT-42] ⓐ — 6차 판: 두 번째 소주 계약을 원액 탱크가 빈 채로 받았다). 화면 계산만, 규칙 불변.
 * - stock: 그 범주 병 재고(면세 한정판 제외) — 납품은 이 재고에서 먼저 나간다
 * - recentSales: 최근 3개월 그 범주 국내 판매 월평균(병) — 리포트가 없으면 0
 * - coverMonths: 지금 재고로 이 계약을 몇 달 채우나(국내 판매는 빼지 않은 낙관값)
 * - penaltyPerMonth: 한 달을 통째로 못 채우면 무는 위약금
 */
export function retailOfferOutlook(s: Pick<GameState, 'commerce' | 'history'>, o: Pick<RetailOffer, 'category' | 'bottlesPerMonth' | 'penaltyPerBottle'>) {
  const ids = new Set(s.commerce.products.filter((p) => p.category === o.category && !p.dutyFreeOnly).map((p) => p.id));
  const stock = s.commerce.products.filter((p) => ids.has(p.id)).reduce((t, p) => t + p.stockBottles, 0);
  const recent = s.history.reports.slice(-3);
  const recentSales = recent.length ? recent.reduce((t, r) => t + r.sales.filter((x) => ids.has(x.productId)).reduce((u, x) => u + x.bottles, 0), 0) / recent.length : 0;
  return { stock, recentSales, coverMonths: o.bottlesPerMonth > 0 ? stock / o.bottlesPerMonth : Infinity, penaltyPerMonth: o.bottlesPerMonth * o.penaltyPerBottle };
}

export const retailCancellationCost = (c: Pick<RetailContract, 'termMonths' | 'monthsDone' | 'bottlesPerMonth' | 'penaltyPerBottle'>) =>
  Math.round((c.termMonths - c.monthsDone) * c.bottlesPerMonth * c.penaltyPerBottle * 0.5);

export function oemPackageCost(s: GameState): number {
  return OEM.dedicated.package.reduce((t, id) => t + equipmentCost(s, EQUIPMENT[id]!), 0);
}

/** 위탁생산에 내줄 수 있는 월 배치 수 = (증류기 가동 여력 − 자사 생산 지시 − 기존 위탁) / 배치당 증류 횟수 */
export function oemSpareBatches(s: GameState): number {
  let cap = 0;
  for (const e of s.production.equipment) {
    const d = EQUIPMENT[e.catalogId];
    if (d?.kind === 'still' && e.readyMonth <= s.month && d.stillType !== 'column') cap += d.runsPerMonth;
  }
  const own = s.production.orders.reduce((t, o) => t + o.batchesPerMonth * (s.production.recipes.find((r) => r.id === o.recipeId)?.runs ?? 1), 0);
  const runs = cap - own - s.b2b.oemContracts.filter((c) => !c.stillId).reduce((t, c) => t + c.batchesPerMonth * OEM.runs, 0);
  return Math.max(0, Math.floor(runs / OEM.runs));
}

export function makeOemOffer(s: GameState, rng: Rng): OemOffer | null {
  const domestic = buyersFor(s).filter((b) => b.domestic);
  if (!domestic.length) return null;
  const fee = OEM.feePerBatch;
  const spare = oemSpareBatches(s);
  const buyerName = rng.pick(domestic).nameKo;
  // 남는 설비가 없으면 위탁사가 전용 증류기 설치비 일부를 지원하는 제안을 한다
  if (spare < 2) {
    const d = OEM.dedicated;
    return {
      id: nid(s, 'W'), buyerName, batchesPerMonth: d.batchesPerMonth, feePerBatch: fee, termMonths: d.termMonths, penaltyPerBatch: Math.round(fee * OEM.penaltyShare),
      dedicated: true, capexSupport: Math.round((oemPackageCost(s) * d.supportShare) / 1_000_000) * 1_000_000, expiresMonth: s.month + 3,
    };
  }
  const batchesPerMonth = Math.max(2, Math.round(spare * rng.pick([0.5, 0.75, 1])));
  return { id: nid(s, 'W'), buyerName, batchesPerMonth, feePerBatch: fee, termMonths: rng.pick([12, 24]), penaltyPerBatch: Math.round(fee * OEM.penaltyShare), expiresMonth: s.month + 3 };
}

/** 월말: 입지 대표 거래 제안 갱신. report가 있으면 받지 않고 만료된 대형 유통 제안을 메모로 남긴다 — 거절도 기록으로 읽게(7차 판 관찰, 결정 #334 · 메모만, 숫자 불변) */
export function refreshDeals(s: GameState, rng: Rng, report?: MonthReport): void {
  const deals = siteOf(s).deals ?? [];
  for (const o of s.commerce.retailOffers) if (o.expiresMonth <= s.month) report?.notes.push(`${o.partner} 납품 제안 만료 — ${CATEGORY[o.category].nameKo} ${o.bottlesPerMonth.toLocaleString()}병/월 (받지 않음)`);
  s.commerce.retailOffers = s.commerce.retailOffers.filter((o) => o.expiresMonth > s.month);
  s.b2b.oemOffers = s.b2b.oemOffers.filter((o) => o.expiresMonth > s.month);
  if (deals.includes('retail') && !s.commerce.retailOffers.length && s.commerce.retailContracts.length < RETAIL_DEAL.maxActive && rng.chance(RETAIL_DEAL.offerChance)) s.commerce.retailOffers.push(makeRetailOffer(s, rng));
  if (deals.includes('oem') && !s.b2b.oemOffers.length && s.b2b.oemContracts.length < OEM.maxActive && rng.chance(oemSpareBatches(s) >= 2 ? OEM.offerChanceSpare : OEM.offerChance)) {
    const o = makeOemOffer(s, rng);
    if (o) s.b2b.oemOffers.push(o);
  }
}

/** 대형 유통 계약 체결 — 매대 노출로 인지도는 빨리 오르지만, 숙성 위스키의 프리미엄 이미지는 깎인다 */
export function startRetail(s: GameState, o: RetailOffer): RetailContract {
  const { expiresMonth: _e, ...terms } = o;
  addModifier(s, 'appeal:premium', RETAIL_DEAL.appealPremium, o.termMonths, `${o.partner} 입점 — 대중 브랜드 이미지`);
  addModifier(s, 'awareness_gain', RETAIL_DEAL.awarenessGain, o.termMonths, `${o.partner} 입점 — 매대 노출`);
  return { ...terms, startMonth: s.month, monthsDone: 0, delivered: 0, shortfall: 0 };
}

/** 위탁생산 계약 시작. 전용 증류기 지원형은 설비 패키지를 발주하고(설치비 − 지원금을 우리가 낸다) 설치가 끝나면 계약이 시작된다.
 *  s는 변경 가능한 복제본, 현금이 부족하면 null */
export function startOem(s: GameState, o: OemOffer): OemContract | null {
  const { expiresMonth: _e, ...terms } = o;
  if (!o.dedicated) return { ...terms, startMonth: s.month, monthsDone: 0, missed: 0 };
  const net = oemPackageCost(s) - (o.capexSupport ?? 0);
  if (s.finance.cash < net) return null;
  s.finance.cash -= net;
  let stillId: string | undefined;
  let ready = s.month;
  for (const id of OEM.dedicated.package) {
    const def = EQUIPMENT[id]!;
    const inst = { id: nid(s, 'E'), catalogId: id, readyMonth: s.month + def.leadMonths, ...(def.kind === 'still' ? { feintsLPA: 0 } : {}) };
    s.production.equipment.push(inst);
    if (def.kind === 'still') stillId = inst.id;
    ready = Math.max(ready, inst.readyMonth);
  }
  return { ...terms, startMonth: ready, monthsDone: 0, missed: 0, stillId };
}

/** 월간 대형 유통 납품 (일반 판매보다 먼저 재고를 가져간다 — 유통사 물류라 소매 처리 역량을 쓰지 않는다). 대금은 paymentDelay개월 뒤 */
export function fulfillRetail(s: GameState, report: MonthReport): void {
  const outbound = outboundLogistics(s);
  const done: string[] = [];
  for (const c of s.commerce.retailContracts) {
    let need = c.bottlesPerMonth;
    let amount = 0;
    let logistics = 0;
    for (const p of s.commerce.products.filter((x) => x.category === c.category && x.stockBottles > 0 && !x.dutyFreeOnly).sort((a, b) => a.createdMonth - b.createdMonth)) {
      if (need <= 0) break;
      const take = Math.min(need, p.stockBottles);
      p.stockBottles -= take;
      p.totalSold += take;
      sellFromLots(s, report, p.id, take, { kind: 'domestic', settlement: 'receivable', unitPrice: p.price * c.priceFactor, channel: 'retail_deal' }); // F3 판매 사건 4(MKT): 대형 유통 납품(대금 paymentDelay개월 뒤)
      amount += take * p.price * c.priceFactor;
      logistics += take * logisticsCost(p.bottleMl) * outbound;
      need -= take;
    }
    const delivered = c.bottlesPerMonth - need;
    if (amount > 0) {
      s.finance.receivables.push({ dueMonth: s.month + c.paymentDelay, amount: Math.round(amount), label: `${c.partner} 납품 대금` });
      report.retailDealRevenue = (report.retailDealRevenue ?? 0) + Math.round(amount);
    }
    const penalty = need * c.penaltyPerBottle;
    s.finance.cash -= Math.round(logistics + penalty);
    report.expenses.distribution = (report.expenses.distribution ?? 0) + Math.round(logistics);
    if (penalty > 0) {
      report.expenses.penalty = (report.expenses.penalty ?? 0) + penalty;
      report.notes.push(`${c.partner} 납품 부족 ${need}병 — 위약금`);
    }
    c.delivered += delivered;
    c.shortfall += need;
    c.monthsDone += 1;
    if (c.shortfall >= RETAIL_BREAK_MONTHS * c.bottlesPerMonth) { report.notes.push(`${c.partner} 납품 계약 파기 — 누적 미납 과다`); done.push(c.id); }
    else if (c.monthsDone >= c.termMonths) { report.notes.push(`${c.partner} 납품 계약 만료 — 총 ${c.delivered.toLocaleString()}병 (${CATEGORY[c.category].nameKo})`); done.push(c.id); }
  }
  s.commerce.retailContracts = s.commerce.retailContracts.filter((c) => !done.includes(c.id));
}

/** 월말: 만기 도래 매출채권 입금 */
export function collectReceivables(s: GameState, report: MonthReport): void {
  const due = s.finance.receivables.filter((r) => r.dueMonth <= s.month);
  if (!due.length) return;
  const amount = due.reduce((t, r) => t + r.amount, 0);
  s.finance.cash += amount;
  report.revenue += amount;
  report.receivablesCollected = (report.receivablesCollected ?? 0) + amount;
  s.finance.receivables = s.finance.receivables.filter((r) => r.dueMonth > s.month);
}
