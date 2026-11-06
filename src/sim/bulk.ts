import { BULK, CASKS, EQUIPMENT } from './content/catalog';
import { BUYERS, displayName, INDEPENDENT_BOTTLERS } from './content/names';
import { regionOf, siteOf } from './content/regions';
import { mod } from './modifiers';
import { clamp, evaluate } from './flavor';
import { lotCategory } from './blending';
import type { Rng } from './rng';
import type { Cask, Contract, ContractOffer, ContractTerms, GameState, MonthReport, SpiritLot } from './types';
import { nid } from './util';

// 원액 B2B 판매 (PRD §8.6): 블렌디드 위스키 회사·브로커에 현물 벌크 판매 또는 정기 공급 계약.
// 원칙: 현물 매입가(bid) < 기준가치 < 브로커 판매가(ask) → 사고팔기만으로 차익을 낼 수 없다.

export const isNewMake = (lot: SpiritLot) => (lot.kind === 'malt' || lot.kind === 'grain') && lot.oakMonths === 0;
export const isPeated = (lot: SpiritLot) => (lot.flavor.peat_smoke ?? 0) >= 25;
export const isBulkKind = (lot: SpiritLot) => lot.kind === 'malt' || lot.kind === 'grain';

export function matchesStyle(lot: SpiritLot, style: ContractTerms['style']): boolean {
  if (style === 'any') return true;
  return style === 'peated' ? isPeated(lot) : (lot.flavor.peat_smoke ?? 0) < 10;
}

export function lotQuality(lot: SpiritLot): number {
  return evaluate(lot.flavor, lotCategory(lot)).quality;
}

/** 품질 계수: 35점 → 0.7, 75점 이상 → 1.3 */
export const qualityFactor = (q: number) => 0.7 + 0.6 * clamp((q - 35) / 40, 0, 1);

/** 국산 원액 프리미엄 비율 (지역 기본값 × 이벤트 보정) */
export function domesticPremium(s: Pick<GameState, 'modifiers' | 'month' | 'regionId'>): number {
  return regionOf(s).domesticSpiritPremium * mod(s, 'domestic_premium');
}

/** 벌크 기준가치(원/LPA): 몰트·그레인 원액만 거래 */
export function bulkValuePerLPA(s: Pick<GameState, 'bulkIndex' | 'modifiers' | 'month'>, lot: SpiritLot): number {
  if (!isBulkKind(lot)) return 0;
  const years = lot.oakMonths / 12;
  const grain = lot.kind === 'grain';
  const base = grain ? BULK.grainNewMakeBase : BULK.newMakeBase;
  const age = 1 + (grain ? BULK.grainAgePerYear : BULK.agePerYear) * years;
  const peat = isPeated(lot) ? (1 + BULK.peatPremium) * mod(s, 'bulk:peated') : 1;
  return base * age * qualityFactor(lotQuality(lot)) * peat * s.bulkIndex * mod(s, 'bulk');
}

/** B2B 신뢰도 보정: 0 → −5%, 100 → +5% */
const trustAdj = (trust: number) => 0.95 + 0.1 * (trust / 100);

/** 그레인 현물 시장 포화 계수 (#81): 1 / (1 + (최근 판매량 + 이번 판매량의 절반) / 시장 깊이). 몰트는 항상 1 */
export function spotSaturation(s: Pick<GameState, 'spotSoldLPA' | 'regionId'>, lot: SpiritLot, lpa = 0): number {
  if (lot.kind !== 'grain') return 1;
  const depth = regionOf(s).grainSpotDepthLPA;
  return 1 / (1 + ((s.spotSoldLPA?.grain ?? 0) + lpa / 2) / depth);
}

/** 현물로 팔 때 받는 단가 — 현물 시장의 절반은 국내 블렌더로 보고 국산 프리미엄의 절반을 반영. lpa = 이번에 팔 물량(포화 반영) */
export function spotBidPerLPA(s: GameState, lot: SpiritLot, lpa = 0): number {
  // 입지 원액 운송비 (제주 섬 운송, 결정 #86)
  return bulkValuePerLPA(s, lot) * BULK.bid * trustAdj(s.b2bTrust) * (lot.sourced ? 1 : 1 + domesticPremium(s) * 0.5) * spotSaturation(s, lot, lpa) * (siteOf(s).bulkFreight ?? 1);
}

/** 현물 판매를 시장에 기록 (포화 누적) */
export function recordSpotSale(s: GameState, lot: SpiritLot, lpa: number): void {
  if (lot.kind !== 'grain') return;
  s.spotSoldLPA = { grain: (s.spotSoldLPA?.grain ?? 0) + lpa };
}

/** 브로커에게 살 때 내는 단가 (수입 원액 — 국산 프리미엄 없음) */
export function brokerAskPerLPA(s: Pick<GameState, 'bulkIndex' | 'modifiers' | 'month'>, lot: SpiritLot): number {
  return bulkValuePerLPA(s, lot) * BULK.ask;
}

/** 캐스크째 팔 때 캐스크 잔존가치 */
export function caskResidual(cask: Cask): number {
  return Math.round(CASKS[cask.typeId].price * Math.min(1, cask.activity) * 0.4);
}

export function spotQuote(s: GameState, lot: SpiritLot, liters: number, cask?: Cask): number {
  const lpa = Math.min(liters, lot.volumeL) * lot.abv;
  return Math.round(lpa * spotBidPerLPA(s, lot, lpa) + (cask ? caskResidual(cask) : 0));
}

// ── 계약 ──

/** 증류기·발효조 기준 월 원액 생산 여력(LPA) — 계약 물량 규모를 정하는 데 사용 */
export function capacityLPA(s: GameState, kind: 'malt' | 'grain'): number {
  const fermenters = s.equipment.map((e) => EQUIPMENT[e.catalogId]).filter((d) => d?.kind === 'fermenter') as { capacityL: number }[];
  return s.equipment.reduce((t, e) => {
    const d = EQUIPMENT[e.catalogId];
    if (d?.kind !== 'still') return t;
    const column = d.stillType === 'column';
    if (column !== (kind === 'grain')) return t;
    // 발효조 한도: 그레인 3일+2, 몰트 4일+2
    const slots = fermenters.filter((f) => f.capacityL >= d.chargeL).length * Math.floor(30 / (column ? 5 : 6));
    const batches = Math.min(column ? d.runsPerMonth : d.runsPerMonth / 2, slots);
    // 그레인: 워시 9%, 회수율 약 85% / 몰트: 워시 8%, 2회 증류·페인츠 재투입 포함 약 75%
    return t + batches * d.chargeL * (column ? 0.09 * 0.85 : 0.08 * 0.75);
  }, 0);
}
export const maltCapacityLPA = (s: GameState) => capacityLPA(s, 'malt');

function contractPrice(s: GameState, spirit: ContractTerms['spirit'], style: ContractTerms['style'], minQuality: number, domestic: boolean, prepay: boolean, priceFactor = 1, termMonths = 12): number {
  const base = spirit === 'grain_newmake' ? BULK.grainNewMakeBase : BULK.newMakeBase;
  // 블렌더는 최소 품질보다 약간 높은 원액을 기준으로 값을 매긴다
  const ref = base * qualityFactor(minQuality + 8) * (style === 'peated' ? 1 + BULK.peatPremium : 1) * s.bulkIndex * mod(s, 'bulk');
  const p = ref * BULK.contract * (1 + BULK.termPremiumPer12 * Math.max(0, termMonths / 12 - 1)) * trustAdj(s.b2bTrust) * (prepay ? 1 - BULK.prepayDiscount : 1) * (domestic ? 1 + domesticPremium(s) : 1) * priceFactor;
  // 입지 원액 운송비 (제주 섬 운송, 결정 #86)
  return Math.round((p * (siteOf(s).bulkFreight ?? 1)) / 100) * 100;
}

/** 이 지역에서 원액을 사는 회사: 현지 회사(국산 프리미엄) + 글로벌 회사. 가상 회사는 부정적 이벤트용으로 섞여 있다 */
export function buyersFor(s: GameState) {
  return BUYERS.filter((b) => b.country === s.regionId || b.country === 'GLOBAL').map((b) => ({ id: b.id, nameKo: displayName(b), domestic: b.country === s.regionId, canDefault: !!b.canDefault }));
}

function buildOffer(s: GameState, rng: Rng, spirit: ContractTerms['spirit'], lpaPerMonth: number, termMonths: number, prepayShare: number, priceFactor = 1, buyerFilter?: (b: { canDefault: boolean }) => boolean): ContractOffer {
  const pool = buyersFor(s).filter((b) => (buyerFilter ? buyerFilter(b) : true));
  const buyer = rng.pick(pool.length ? pool : buyersFor(s));
  const style = spirit === 'grain_newmake' ? 'any' : rng.pick(['any', 'any', 'unpeated', 'peated'] as const);
  const minQuality = spirit === 'grain_newmake' ? rng.int(30, 38) : rng.int(35, 46);
  const pricePerLPA = contractPrice(s, spirit, style, minQuality, buyer.domestic, prepayShare > 0, priceFactor, termMonths);
  return {
    id: nid(s, 'O'), buyerId: buyer.id, buyerName: buyer.nameKo, spirit, domestic: buyer.domestic, style,
    lpaPerMonth, termMonths, pricePerLPA, minQuality, prepayShare,
    penaltyPerLPA: Math.round(pricePerLPA * BULK.penaltyRate), expiresMonth: s.month + 3,
  };
}

export function makeContractOffer(s: GameState, rng: Rng): ContractOffer {
  const grainCap = capacityLPA(s, 'grain');
  const spirit: ContractTerms['spirit'] = grainCap > 0 && rng.chance(0.5) ? 'grain_newmake' : 'malt_newmake';
  const cap = spirit === 'grain_newmake' ? grainCap : capacityLPA(s, 'malt');
  const lpaPerMonth = Math.max(40, Math.round((cap * rng.pick([0.25, 0.35, 0.5, 0.7]) * (0.8 + 0.4 * s.b2bTrust / 100) * regionOf(s).bulkMarketDepth) / 10) * 10);
  return buildOffer(s, rng, spirit, lpaPerMonth, rng.pick([12, 24, 36]), rng.chance(0.35) ? 0.3 : 0);
}

/** 이벤트용 특별 계약 (대형 블렌더 장기 계약) */
export function makeSpecialContractOffer(s: GameState, rng: Rng, e: { capacityShare: number; prepayShare: number; priceFactor: number; termMonths: number }): ContractOffer | null {
  const grainCap = capacityLPA(s, 'grain');
  const spirit: ContractTerms['spirit'] = grainCap > 0 ? 'grain_newmake' : 'malt_newmake';
  const cap = spirit === 'grain_newmake' ? grainCap : capacityLPA(s, 'malt');
  if (cap <= 0) return null;
  const lpa = Math.round((cap * e.capacityShare) / 10) * 10;
  // 대형 장기 계약은 실존 대형 블렌더가 제안한다
  const offer = buildOffer(s, rng, spirit, lpa, e.termMonths, e.prepayShare, e.priceFactor, (b) => !b.canDefault);
  return { ...offer, expiresMonth: s.month + 2 };
}

/** 크래프트 프리미엄 계약 (#78): 독립 병입자·크래프트 블렌더가 소규모 증류소의 개성 있는 몰트 뉴메이크를 소량·고단가로 산다 */
export function makeCraftContractOffer(s: GameState, rng: Rng): ContractOffer | null {
  const cap = capacityLPA(s, 'malt');
  if (cap <= 0) return null;
  const ib = rng.pick(INDEPENDENT_BOTTLERS);
  const style = rng.pick(['any', 'unpeated', 'peated'] as const);
  const minQuality = rng.int(40, 46);
  const termMonths = rng.pick([24, 36]);
  const prepayShare = rng.chance(0.5) ? 0.3 : 0;
  const lpaPerMonth = Math.max(20, Math.round((cap * rng.pick([0.1, 0.15, 0.2])) / 10) * 10);
  const pricePerLPA = Math.round(contractPrice(s, 'malt_newmake', style, minQuality, false, prepayShare > 0, BULK.craftPriceFactor, termMonths) / 100) * 100;
  return {
    id: nid(s, 'Q'), buyerId: ib.id, buyerName: `${displayName(ib)} (크래프트)`, spirit: 'malt_newmake', domestic: false, style, craft: true,
    lpaPerMonth, termMonths, pricePerLPA, minQuality, prepayShare, penaltyPerLPA: Math.round(pricePerLPA * BULK.penaltyRate), expiresMonth: s.month + 3,
  };
}

export function refreshContractOffers(s: GameState, rng: Rng): void {
  s.contractOffers = s.contractOffers.filter((o) => o.expiresMonth > s.month);
  while (s.contractOffers.filter((o) => !o.craft).length < 2) s.contractOffers.push(makeContractOffer(s, rng));
  if (!s.contractOffers.some((o) => o.craft) && rng.chance(BULK.craftChance)) {
    const o = makeCraftContractOffer(s, rng);
    if (o) s.contractOffers.push(o);
  }
}

export const contractTotalValue = (c: ContractTerms) => c.lpaPerMonth * c.termMonths * c.pricePerLPA;

/** 계약 경고 기준 숙성 기간 — 봇·플레이어가 싱글 몰트를 처음 내는 3년 */
export const CONTRACT_AGING_REF_MONTHS = 36;

export interface ContractAgingImpact {
  /** 납품이 끝나는 게임 월 */
  endMonth: number;
  /** 남은 기간 동안 숙성고에 못 들어가는 원액 */
  divertedLPA: number;
  /** 그 원액을 46%·700ml로 병입했을 때의 병 수 (증발 전) */
  bottleEquivalent: number;
  /** 첫 자사 위스키가 3년 숙성되는 게임 월 */
  firstWhiskyMonth: number;
  /** 첫 위스키 출시 이후에도 계속 납품하는 개월 수 (0이면 안전) */
  overlapMonths: number;
  /** 계약 때문에 줄어드는 3년 숙성 위스키의 출시 구간 [from, to) */
  whiskyGap: [number, number];
}

/** 계약 경고 (§16.16): 뉴메이크 계약은 첫 위스키가 나오기 전에 끝나야 한다.
 *  더 길게 이어지면 그만큼의 원액이 3년 뒤 위스키 재고에서 빠진다 — LPA당 병입 가치는 현물의 약 5배 */
export function contractAgingImpact(s: GameState, c: Pick<ContractTerms, 'lpaPerMonth' | 'termMonths' | 'spirit'> & { monthsDone?: number }): ContractAgingImpact {
  const remaining = Math.max(0, c.termMonths - (c.monthsDone ?? 0));
  const endMonth = s.month + remaining;
  const kind = c.spirit === 'grain_newmake' ? 'grain' : 'malt';
  const filled = s.casks.filter((k) => k.contents && k.contents.kind === kind && !k.contents.sourced).map((k) => k.filledMonth ?? k.contents!.createdMonth);
  const firstWhiskyMonth = (filled.length ? Math.min(...filled) : s.month) + CONTRACT_AGING_REF_MONTHS;
  const divertedLPA = c.lpaPerMonth * remaining;
  return {
    endMonth, divertedLPA, bottleEquivalent: Math.round(divertedLPA / (0.46 * 0.7)), firstWhiskyMonth,
    overlapMonths: Math.max(0, endMonth - Math.max(s.month, firstWhiskyMonth)),
    whiskyGap: [s.month + CONTRACT_AGING_REF_MONTHS, endMonth + CONTRACT_AGING_REF_MONTHS],
  };
}

export function startContract(s: GameState, offer: ContractOffer): Contract {
  const prepaid = Math.round(contractTotalValue(offer) * offer.prepayShare);
  const { expiresMonth: _e, ...terms } = offer;
  return { ...terms, startMonth: s.month, monthsDone: 0, deliveredLPA: 0, shortfallLPA: 0, prepaidRemaining: prepaid };
}

/** 계약 해지 비용: 남은 물량 위약금의 절반 + 미상계 선급금 반환 */
export function cancellationCost(c: Contract): number {
  const remainingLPA = c.lpaPerMonth * (c.termMonths - c.monthsDone);
  return Math.round(remainingLPA * c.penaltyPerLPA * 0.5 + c.prepaidRemaining);
}

/** 월말 자동 납품: 조건에 맞는 탱크 뉴메이크를 오래된 것부터 출하 */
export function fulfillContracts(s: GameState, report: MonthReport): void {
  const done: string[] = [];
  for (const c of s.contracts) {
    let need = c.lpaPerMonth;
    const eligible = s.lots
      .filter((l) => isNewMake(l) && !l.sourced && l.kind === (c.spirit === 'grain_newmake' ? 'grain' : 'malt') && matchesStyle(l, c.style) && lotQuality(l) >= c.minQuality)
      .sort((a, b) => a.createdMonth - b.createdMonth);
    for (const lot of eligible) {
      if (need <= 1e-6) break;
      const lotLPA = lot.volumeL * lot.abv;
      const take = Math.min(need, lotLPA);
      lot.volumeL -= take / lot.abv;
      need -= take;
    }
    s.lots = s.lots.filter((l) => l.volumeL >= 1);
    const delivered = c.lpaPerMonth - need;
    const gross = delivered * c.pricePerLPA;
    const offset = Math.min(c.prepaidRemaining, gross * c.prepayShare);
    const cashIn = Math.round(gross - offset);
    c.prepaidRemaining -= offset;
    const penalty = Math.round(need * c.penaltyPerLPA);
    s.cash += cashIn - penalty;
    c.deliveredLPA += delivered;
    c.shortfallLPA += need;
    c.monthsDone += 1;
    report.bulk.push({ contractId: c.id, buyerName: c.buyerName, deliveredLPA: delivered, revenue: cashIn, penalty });
    report.bulkRevenue += cashIn;
    if (penalty > 0) {
      report.expenses.penalty = (report.expenses.penalty ?? 0) + penalty;
      s.b2bTrust = clamp(s.b2bTrust - 2, 0, 100);
      report.notes.push(`${c.buyerName} 납품 부족 ${need.toFixed(0)} LPA — 위약금 지급`);
    } else s.b2bTrust = clamp(s.b2bTrust + 0.5, 0, 100);

    if (c.shortfallLPA >= 2 * c.lpaPerMonth) {
      s.cash -= Math.round(c.prepaidRemaining);
      s.b2bTrust = clamp(s.b2bTrust - 15, 0, 100);
      report.notes.push(`${c.buyerName} 계약 파기 — 누적 미납 과다. 남은 선급금 반환, 신뢰도 하락`);
      done.push(c.id);
    } else if (c.monthsDone >= c.termMonths) {
      if (c.prepaidRemaining > 0) s.cash -= Math.round(c.prepaidRemaining);
      s.b2bTrust = clamp(s.b2bTrust + 5, 0, 100);
      report.notes.push(`${c.buyerName} 공급 계약 만료 — 총 ${Math.round(c.deliveredLPA)} LPA 납품`);
      done.push(c.id);
    }
  }
  s.contracts = s.contracts.filter((c) => !done.includes(c.id));
}

/** 벌크 시세: 평균 회귀 랜덤 워크 + 위스키 트렌드 연동 */
export function updateBulkIndex(s: GameState, rng: Rng): void {
  const v = s.bulkIndex;
  const target = 0.5 + 0.5 * (s.trend.whisky ?? 1);
  s.bulkIndex = clamp(v * Math.exp(rng.normal(0, 0.03)) + 0.08 * (target - v), 0.6, 1.5);
}

// ── 독립 병입자(IB) 캐스크 매입 제안 ──

/** 3년 이상·품질 65 이상인 자사 캐스크가 있으면 IB가 현물가의 135%에 캐스크째 사겠다고 제안한다 (초기 런웨이 — 통떼기 매각) */
export function refreshCaskBids(s: GameState, rng: Rng): void {
  s.caskBids = s.caskBids.filter((b) => b.expiresMonth > s.month && s.casks.some((c) => c.id === b.caskId && c.contents));
  if (s.caskBids.length >= 2 || !rng.chance(0.25)) return;
  const candidates = s.casks.filter((c) => c.contents && !c.owner && isBulkKind(c.contents) && !c.contents.sourced && c.contents.oakMonths >= 36 && lotQuality(c.contents) >= 65 && !s.caskBids.some((b) => b.caskId === c.id));
  if (!candidates.length) return;
  const cask = rng.pick(candidates);
  const ib = rng.pick(INDEPENDENT_BOTTLERS);
  s.caskBids.push({ id: nid(s, 'I'), buyerName: displayName(ib), caskId: cask.id, price: Math.round(spotQuote(s, cask.contents!, cask.contents!.volumeL, cask) * 1.35), expiresMonth: s.month + 2 });
}

