import { BULK, BULK_BUYERS, CASKS, EQUIPMENT } from './content/catalog';
import { clamp, evaluate } from './flavor';
import { lotCategory } from './blending';
import type { Rng } from './rng';
import type { Cask, Contract, ContractOffer, ContractTerms, GameState, MonthReport, SpiritLot } from './types';
import { nid } from './util';

// 원액 B2B 판매 (PRD §8.6): 블렌디드 위스키 회사·브로커에 현물 벌크 판매 또는 정기 공급 계약.
// 원칙: 현물 매입가(bid) < 기준가치 < 브로커 판매가(ask) → 사고팔기만으로 차익을 낼 수 없다.

export const isNewMake = (lot: SpiritLot) => lot.kind === 'malt' && lot.oakMonths === 0;
export const isPeated = (lot: SpiritLot) => (lot.flavor.peat_smoke ?? 0) >= 25;

export function matchesStyle(lot: SpiritLot, style: ContractTerms['style']): boolean {
  if (style === 'any') return true;
  return style === 'peated' ? isPeated(lot) : (lot.flavor.peat_smoke ?? 0) < 10;
}

export function lotQuality(lot: SpiritLot): number {
  return evaluate(lot.flavor, lotCategory(lot)).quality;
}

/** 품질 계수: 35점 → 0.7, 75점 이상 → 1.3 */
export const qualityFactor = (q: number) => 0.7 + 0.6 * clamp((q - 35) / 40, 0, 1);

/** 벌크 기준가치(원/LPA): 몰트 원액만 거래 */
export function bulkValuePerLPA(s: Pick<GameState, 'bulkIndex'>, lot: SpiritLot): number {
  if (lot.kind !== 'malt') return 0;
  const years = lot.oakMonths / 12;
  return BULK.newMakeBase * (1 + BULK.agePerYear * years) * qualityFactor(lotQuality(lot)) * (isPeated(lot) ? 1 + BULK.peatPremium : 1) * s.bulkIndex;
}

/** B2B 신뢰도 보정: 0 → −5%, 100 → +5% */
const trustAdj = (trust: number) => 0.95 + 0.1 * (trust / 100);

/** 현물로 팔 때 받는 단가 */
export function spotBidPerLPA(s: GameState, lot: SpiritLot): number {
  return bulkValuePerLPA(s, lot) * BULK.bid * trustAdj(s.b2bTrust);
}

/** 브로커에게 살 때 내는 단가 */
export function brokerAskPerLPA(s: Pick<GameState, 'bulkIndex'>, lot: SpiritLot): number {
  return bulkValuePerLPA(s, lot) * BULK.ask;
}

/** 캐스크째 팔 때 캐스크 잔존가치 */
export function caskResidual(cask: Cask): number {
  return Math.round(CASKS[cask.typeId].price * Math.min(1, cask.activity) * 0.4);
}

export function spotQuote(s: GameState, lot: SpiritLot, liters: number, cask?: Cask): number {
  const lpa = Math.min(liters, lot.volumeL) * lot.abv;
  return Math.round(lpa * spotBidPerLPA(s, lot) + (cask ? caskResidual(cask) : 0));
}

// ── 계약 ──

/** 설치(또는 설치 중)된 증류기 기준 월 몰트 생산 여력(LPA) — 계약 물량 규모를 정하는 데 사용 */
export function maltCapacityLPA(s: GameState): number {
  return s.equipment.reduce((t, e) => {
    const d = EQUIPMENT[e.catalogId];
    // 2회 증류, 워시 8%, 페인츠 재투입 포함 회수율 약 75%
    return t + (d?.kind === 'still' ? (d.runsPerMonth / 2) * d.chargeL * 0.08 * 0.75 : 0);
  }, 0);
}

export function makeContractOffer(s: GameState, rng: Rng): ContractOffer {
  const buyer = rng.pick(BULK_BUYERS);
  const style = rng.pick(['any', 'any', 'unpeated', 'peated'] as const);
  const cap = maltCapacityLPA(s);
  const lpaPerMonth = Math.max(40, Math.round((cap * rng.pick([0.15, 0.25, 0.35, 0.5]) * (0.8 + 0.4 * s.b2bTrust / 100)) / 10) * 10);
  const termMonths = rng.pick([12, 24, 36]);
  const minQuality = rng.int(35, 46);
  const prepay = rng.chance(0.35);
  // 블렌더는 최소 품질보다 약간 높은 원액을 기준으로 값을 매긴다
  const ref = BULK.newMakeBase * qualityFactor(minQuality + 8) * (style === 'peated' ? 1 + BULK.peatPremium : 1) * s.bulkIndex;
  const pricePerLPA = Math.round((ref * BULK.contract * trustAdj(s.b2bTrust) * (prepay ? 1 - BULK.prepayDiscount : 1)) / 100) * 100;
  return {
    id: nid(s, 'O'), buyerId: buyer.id, buyerName: buyer.nameKo, spirit: 'malt_newmake', style,
    lpaPerMonth, termMonths, pricePerLPA, minQuality, prepayShare: prepay ? 0.3 : 0,
    penaltyPerLPA: Math.round(pricePerLPA * BULK.penaltyRate), expiresMonth: s.month + 3,
  };
}

export function refreshContractOffers(s: GameState, rng: Rng): void {
  s.contractOffers = s.contractOffers.filter((o) => o.expiresMonth > s.month);
  while (s.contractOffers.length < 2) s.contractOffers.push(makeContractOffer(s, rng));
}

export const contractTotalValue = (c: ContractTerms) => c.lpaPerMonth * c.termMonths * c.pricePerLPA;

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
      .filter((l) => isNewMake(l) && !l.sourced && matchesStyle(l, c.style) && lotQuality(l) >= c.minQuality)
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
