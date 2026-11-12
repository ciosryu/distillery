import { EXPORT_MARKETS, exportMarketsFor } from './content/exports';
import { exportDemands, exportEligible } from './market';
import type { Rng } from './rng';
import type { ExportEntry, ExportOffer, GameState, MonthReport } from './types';
import { nid } from './util';

// 수입사 계약 (#101, docs/design/export.md §3) — 시장마다 수입사 1곳(독점). 수치 [튜닝]

export const EXPORT_DEAL = {
  /** 시장별 월 제안 확률 (품질 70↑ 제품이 있으면 ×1.5) */
  offerChance: 0.04,
  offerMonths: 3,
  paymentDelay: 3,
  terms: [24, 36],
  marketingScale: [0.5, 1, 1.5],
  minScale: [0.75, 1, 1.5],
  /** 우리가 해지하면, 그리고 연 최소 물량 미달로 끝나면(B1-7) 마케팅 분담 몇 달 치를 위약금으로 */
  cancelMonths: 3,
};

/** 이 시장에 지금 팔 수 있는 제품이 있는가 (재고·주종·현지 숙성 규정) */
export function hasExportableProduct(s: GameState, marketId: ExportOffer['marketId']): boolean {
  const m = EXPORT_MARKETS[marketId];
  return s.commerce.products.some((p) => p.stockBottles > 0 && !p.dutyFreeOnly && exportEligible(p, m));
}

export function makeExportOffer(s: GameState, marketId: ExportOffer['marketId'], rng: Rng): ExportOffer {
  const m = EXPORT_MARKETS[marketId];
  const [lo, hi] = m.offer.priceFactor;
  // 품질이 좋을수록 매입가 비율이 높게 제안된다
  const bestQ = Math.max(0, ...s.commerce.products.filter((p) => p.stockBottles > 0 && exportEligible(p, m)).map((p) => p.quality));
  const q = Math.min(1, Math.max(0, (bestQ - 50) / 30));
  const priceFactor = Math.round((lo + (hi - lo) * (0.5 * q + 0.5 * rng.next())) * 100) / 100;
  return {
    id: nid(s, 'X'), marketId, partner: rng.pick(m.partners), priceFactor,
    marketingPerMonth: Math.round((m.monthlyCost * rng.pick(EXPORT_DEAL.marketingScale)) / 100_000) * 100_000,
    termMonths: rng.pick(EXPORT_DEAL.terms),
    minBottlesPerYear: Math.round((m.offer.minBottlesPerYear * rng.pick(EXPORT_DEAL.minScale)) / 50) * 50,
    paymentDelay: EXPORT_DEAL.paymentDelay,
    entryCost: (s.commerce.exportEntered ?? []).includes(marketId) ? 0 : m.entryCost,
    expiresMonth: s.month + EXPORT_DEAL.offerMonths,
  };
}

/** 월말: 계약이 없는 시장마다 가끔 수입사 제안이 들어온다 */
export function refreshExportOffers(s: GameState, rng: Rng): void {
  s.commerce.exportOffers = (s.commerce.exportOffers ?? []).filter((o) => o.expiresMonth > s.month);
  for (const id of exportMarketsFor(s.regionId)) {
    if ((s.commerce.exports ?? []).some((e) => e.marketId === id) || s.commerce.exportOffers.some((o) => o.marketId === id)) continue;
    if (!hasExportableProduct(s, id)) continue;
    const good = s.commerce.products.some((p) => p.stockBottles > 0 && p.quality >= 70 && exportEligible(p, EXPORT_MARKETS[id]));
    if (rng.chance(EXPORT_DEAL.offerChance * (good ? 1.5 : 1))) s.commerce.exportOffers.push(makeExportOffer(s, id, rng));
  }
}

/** 제안 수락 (s는 변경 가능한 복제본) — 오류 문구 또는 null */
export function acceptExportOffer(s: GameState, offerId: string): string | null {
  const o = (s.commerce.exportOffers ?? []).find((x) => x.id === offerId);
  if (!o) return '수입사 제안이 없습니다';
  if ((s.commerce.exports ?? []).some((e) => e.marketId === o.marketId)) return '이미 계약한 시장입니다 (시장당 수입사 1곳)';
  if (s.finance.cash < o.entryCost) return '현금이 부족합니다 (시장 개척비)';
  const m = EXPORT_MARKETS[o.marketId];
  s.finance.cash -= o.entryCost;
  const { id: _id, expiresMonth: _e, marketId, ...terms } = o;
  const ready = s.month + (o.entryCost > 0 ? m.entryMonths : 1);
  (s.commerce.exports ??= []).push({ marketId, ...terms, openedMonth: s.month, readyMonth: ready, awareness: m.awareness.start, totalBottles: 0, yearStartMonth: ready, bottlesThisYear: 0 });
  (s.commerce.exportEntered ??= []).includes(marketId) || s.commerce.exportEntered.push(marketId);
  s.commerce.exportOffers = (s.commerce.exportOffers ?? []).filter((x) => x.id !== offerId);
  return null;
}

/** 우리가 해지 — 마케팅 분담 몇 달 치 위약금. 반환: 위약금 */
export function cancelExport(s: GameState, marketId: ExportEntry['marketId']): number | null {
  const e = (s.commerce.exports ?? []).find((x) => x.marketId === marketId);
  if (!e) return null;
  const fee = Math.round((e.marketingPerMonth ?? 0) * EXPORT_DEAL.cancelMonths);
  s.finance.cash -= fee;
  s.commerce.exports = (s.commerce.exports ?? []).filter((x) => x.marketId !== marketId);
  return fee;
}

/** 연 최소 물량 미달로 끝날 때 내는 위약금 — 우리가 해지할 때와 같은 마케팅 분담 cancelMonths개월 치(B1-7). 분담이 없는 옛 계약은 시장 월 비용으로 */
export function shortfallFee(e: Pick<ExportEntry, 'marketId' | 'marketingPerMonth'>): number {
  return Math.round((e.marketingPerMonth ?? EXPORT_MARKETS[e.marketId].monthlyCost) * EXPORT_DEAL.cancelMonths);
}

/** 월말 계약 처리: 마케팅 분담 지출, 연 최소 물량 점검, 기간 만료 시 갱신. 반환: 이번 달 현지 비용 */
export function runExportContracts(s: GameState, report: MonthReport): number {
  let fixed = 0;
  const ended: string[] = [];
  for (const e of s.commerce.exports ?? []) {
    const m = EXPORT_MARKETS[e.marketId];
    fixed += e.marketingPerMonth ?? m.monthlyCost;
    if (e.readyMonth > s.month || e.minBottlesPerYear == null) continue;
    const start = e.yearStartMonth ?? e.readyMonth;
    if (s.month - start + 1 >= 12) {
      if ((e.bottlesThisYear ?? 0) < e.minBottlesPerYear) {
        // 미달로 끝난 계약의 대가 ([결정 #290] B1-7, P-MKT-27): 우리가 해지한 것과 같은 위약금(마케팅 분담 cancelMonths개월 치) + 다시 들어가려면 개척비.
        // 대가가 없으면 최소 물량은 "못 채우면 그냥 끝나는" 공짜 옵션이었다(P8 판당 3~3.8번 미달 해지)
        const fee = shortfallFee(e);
        fixed += fee;
        s.commerce.exportEntered = (s.commerce.exportEntered ?? []).filter((x) => x !== e.marketId);
        ended.push(e.marketId);
        report.events.push(`${m.nameKo} 수입사 계약 종료`);
        report.notes.push(`${e.partner}(${m.nameKo})가 계약을 끝냈습니다 — 연 판매 ${(e.bottlesThisYear ?? 0).toLocaleString()}병 < 최소 ${e.minBottlesPerYear.toLocaleString()}병 · 위약금 ${fee.toLocaleString()}원, 다시 들어가려면 개척비를 새로 낸다`);
        continue;
      }
      e.yearStartMonth = s.month + 1;
      e.bottlesThisYear = 0;
    }
    if (e.termMonths != null && s.month + 1 >= e.readyMonth + e.termMonths) {
      e.termMonths += e.termMonths >= 36 ? 36 : 24;
      report.notes.push(`${e.partner}(${m.nameKo}) 수입사 계약 갱신`);
    }
  }
  if (ended.length) s.commerce.exports = (s.commerce.exports ?? []).filter((e) => !ended.includes(e.marketId));
  return fixed;
}

/**
 * 수출 계약의 연 최소 물량 전망 ([결정 #284], 화면만) — 올해 판 병 + 남은 달 × 이번 달 수출 수요(재고 있는 제품, 「수출 안 함」 #266 제품은 빠진다).
 * 수요 기준이라 낙관적이다(재고가 모자라면 덜 판다). 계약 연도는 runExportContracts와 같다(yearStartMonth 또는 readyMonth부터 12개월, 마지막 달 판매 뒤 판정).
 * 반환: 전망이 최소에 못 미치는 계약만. noExport = 이 시장에 낼 수 있는데 「수출 안 함」으로 뺀 재고 제품 수(원인 안내용)
 */
export interface ContractOutlook { marketId: ExportEntry['marketId']; partner: string; min: number; soFar: number; projected: number; monthsLeft: number; noExport: number }
export function contractOutlook(s: GameState): ContractOutlook[] {
  const out: ContractOutlook[] = [];
  for (const e of s.commerce.exports ?? []) {
    if (e.readyMonth > s.month || e.minBottlesPerYear == null) continue;
    const start = e.yearStartMonth ?? e.readyMonth;
    const monthsLeft = Math.max(1, start + 12 - s.month);
    const monthly = [...exportDemands(s, e).values()].reduce((t, d) => t + d, 0);
    const soFar = e.bottlesThisYear ?? 0;
    const projected = Math.round(soFar + monthsLeft * monthly);
    if (projected >= e.minBottlesPerYear) continue;
    const m = EXPORT_MARKETS[e.marketId];
    const noExport = s.commerce.products.filter((p) => p.noExport && p.stockBottles > 0 && !p.dutyFreeOnly && exportEligible(p, m)).length;
    out.push({ marketId: e.marketId, partner: e.partner ?? m.nameKo, min: e.minBottlesPerYear, soFar, projected, monthsLeft, noExport });
  }
  return out;
}
