import { BULK } from './content/catalog';
import { cancellationCost, isBulkKind, recordSpotSale, spotQuote, startContract } from './bulk';
import { acceptExportOffer, cancelExport } from './exportDeals';
import { recordPendingCash } from './cashflow';
import { EXPORT_MARKETS, type ExportMarketId } from './content/exports';
import { OEM, RETAIL_DEAL, retailCancellationCost, startOem, startRetail } from './deals';
import { warehouseCapacity } from './util';
import { BRANDS } from './content/market';
import { assignProductBrand, brandOf, closeSecondBrand, openSecondBrand } from './brands';
import { fail, type CashKeys, type Handlers } from './actionKit';

// 플레이어 행동 — 시장·판매·B2B·수출 (MKT) (결정 #144 — 파일 쪼개기로 actions.ts에서 옮겨 왔다. 규칙 불변)
// 행동을 더할 때: 아래 타입·처리기·현금 분류 세 곳만 고친다. 코어(actions.ts)는 이 파일의 타입을 통째로 합친다

export type MktAction =
  /** 브랜드 라인 (PRD §11.2 ④, 결정 #155) — 세컨드 브랜드 개설(개설비) / 제품을 브랜드에 배정(판 적 있으면 리브랜딩 비용) / 세컨드 브랜드 폐지 */
  | { type: 'openBrand'; name: string }
  | { type: 'setProductBrand'; productId: string; brandId: string }
  | { type: 'closeBrand'; brandId: string }
  /** 수출 (#95·#101): 수입사 제안 수락 / 계약 해지 */
  | { type: 'acceptExportOffer'; offerId: string }
  | { type: 'closeExport'; marketId: ExportMarketId }
  | { type: 'setExportPrice'; marketId: ExportMarketId; priceFactor: number }
  /** 피니싱 (S-10 자리) — 캐스크 원액을 빈 캐스크로 옮겨 마무리한다. 규칙은 단계 P(PROD): 지금은 항상 실패 */
  | { type: 'setPrice'; productId: string; price: number }
  /** 제품별 수출 안 함 (#266) — 수출이 국내를 굶길 때(#257) 플레이어가 고른다. 다음 달 판매부터 */
  | { type: 'setProductExport'; productId: string; noExport: boolean }
  /** 월 마케팅 예산 — brandId가 없거나 하우스면 하우스(commerce.marketingBudget), 세컨드 브랜드면 그 브랜드 */
  | { type: 'setMarketing'; amount: number; brandId?: string }
  | { type: 'buyBrokerCask'; offerId: string }
  | { type: 'sellBulk'; source: 'lot' | 'cask'; id: string; liters?: number }
  | { type: 'acceptContract'; offerId: string }
  | { type: 'cancelContract'; contractId: string }
  | { type: 'acceptCaskBid'; bidId: string }
  /** 입지 특성 (결정 #86~): 취수 증량 신청(제주), 대형 유통 납품(경기), 위탁생산(간토) */
  | { type: 'acceptRetail'; offerId: string }
  | { type: 'cancelRetail'; contractId: string }
  | { type: 'acceptOem'; offerId: string };

export const MKT_CASH_KEY: CashKeys<MktAction> = {
  // 브랜드 (#155): 개설비·리브랜딩 비용 — 전용 현금 흐름 항목이 없어 '기타'
  openBrand: 'other',
  setProductBrand: 'other',
  closeBrand: null,
  setPrice: null,
  setProductExport: null,
  setMarketing: null,
  buyBrokerCask: 'brokerCask',
  sellBulk: 'spotBulk',
  acceptContract: 'contractPrepay',
  cancelContract: 'contractCancel',
  acceptCaskBid: 'caskBid',
  // 입지 특성 (#86~): 취수 증량 신청비, 납품 계약 해지 비용, 위탁생산 설비 패키지(설치비 − 지원금)
  acceptRetail: null,
  cancelRetail: 'contractCancel',
  acceptOem: 'equipment',
  // 수출 (#95·#101): 수입사 계약 체결(시장 개척비)·해지(위약금)
  acceptExportOffer: 'export',
  closeExport: 'export',
  setExportPrice: null,
};

export const MKT_HANDLERS: Handlers<MktAction> = {
  openBrand: (s, prev, a) => {
    const b = openSecondBrand(s, a.name);
    if (typeof b === 'string') return fail(prev, b);
    return { state: s, message: `세컨드 브랜드 '${b.name}' 개설 — 개설비 ${BRANDS.openCost.toLocaleString()}원, 월 유지비 ${BRANDS.monthlyUpkeep.toLocaleString()}원. 인지도 ${Math.round(b.awareness * 1000) / 10}%(하우스의 ${Math.round(BRANDS.spillover * 100)}%)에서 시작` };
  },
  setProductBrand: (s, prev, a) => {
    const cost = assignProductBrand(s, a.productId, a.brandId);
    if (typeof cost === 'string') return fail(prev, cost);
    const p = s.commerce.products.find((x) => x.id === a.productId)!;
    return { state: s, message: `${p.name} → ${brandOf(s, p).name}${cost > 0 ? ` (리브랜딩 ${cost.toLocaleString()}원)` : ''}` };
  },
  closeBrand: (s, prev, a) => {
    const b = closeSecondBrand(s, a.brandId);
    if (typeof b === 'string') return fail(prev, b);
    return { state: s, message: `세컨드 브랜드 '${b.name}' 폐지 — 유지비가 더 나가지 않습니다` };
  },
  acceptExportOffer: (s, prev, a) => {
    const o = (s.commerce.exportOffers ?? []).find((x) => x.id === a.offerId);
    const err = acceptExportOffer(s, a.offerId);
    if (err || !o) return fail(prev, err ?? '수입사 제안이 없습니다');
    const e = s.commerce.exports!.find((x) => x.marketId === o.marketId)!;
    return { state: s, message: `${o.partner}(${EXPORT_MARKETS[o.marketId].nameKo}) 수입사 계약 — 매입가 출고가의 ${Math.round(o.priceFactor * 100)}%, ${e.readyMonth - s.month}개월 뒤 판매 시작` };
  },
  setExportPrice: (s, prev, a) => {
    const e = s.commerce.exports?.find((x) => x.marketId === a.marketId);
    if (!e) return fail(prev, '진출하지 않은 시장입니다');
    e.priceFactor = Math.max(0.5, Math.min(3, Math.round(a.priceFactor * 100) / 100));
    return { state: s, message: `${EXPORT_MARKETS[a.marketId].nameKo} 수출가를 출고가의 ×${e.priceFactor}로 정했습니다` };
  },
  closeExport: (s, prev, a) => {
    const fee = cancelExport(s, a.marketId);
    if (fee == null) return fail(prev, '계약한 시장이 아닙니다');
    return { state: s, message: `${EXPORT_MARKETS[a.marketId].nameKo} 수입사 계약 해지${fee ? ` — 위약금 ${fee.toLocaleString()}원` : ''} (시장 개척비는 돌려받지 못합니다)` };
  },
  setPrice: (s, prev, a) => {
    const p = s.commerce.products.find((x) => x.id === a.productId);
    if (!p) return fail(prev, '제품이 없습니다');
    p.price = Math.max(100, Math.round(a.price / 100) * 100);
    return { state: s };
  },
  setProductExport: (s, prev, a) => {
    const p = s.commerce.products.find((x) => x.id === a.productId);
    if (!p) return fail(prev, '제품이 없습니다');
    if (a.noExport) p.noExport = true;
    else delete p.noExport;
    return { state: s, message: a.noExport ? `「${p.name}」 수출 안 함 — 다음 달부터 국내에만 판다 (수출 계약의 연 최소 물량은 다른 제품으로 채워야 한다)` : `「${p.name}」 다시 수출에 낸다` };
  },
  setMarketing: (s, prev, a) => {
    const amount = Math.max(0, Math.round(a.amount / 100_000) * 100_000);
    const b = a.brandId ? s.commerce.brands.find((x) => x.id === a.brandId) : undefined;
    if (a.brandId && !b) return fail(prev, '브랜드가 없습니다');
    if (b && !b.isHouse) b.marketingBudget = amount;
    else s.commerce.marketingBudget = amount;
    return { state: s };
  },
  buyBrokerCask: (s, prev, a) => {
    const o = s.b2b.brokerOffers.find((x) => x.id === a.offerId);
    if (!o) return fail(prev, '매물이 없습니다');
    if (s.inventory.casks.length + 1 > warehouseCapacity(s)) return fail(prev, '숙성고 용량 부족');
    if (s.finance.cash < o.price) return fail(prev, '현금이 부족합니다');
    s.finance.cash -= o.price;
    s.inventory.casks.push(o.cask);
    s.b2b.brokerOffers = s.b2b.brokerOffers.filter((x) => x.id !== o.id);
    return { state: s, message: `${o.description} 매입` };
  },
  sellBulk: (s, prev, a) => {
    if (a.source === 'cask') {
      const ci = s.inventory.casks.findIndex((c) => c.id === a.id);
      const cask = s.inventory.casks[ci];
      if (!cask?.contents) return fail(prev, '원액이 든 캐스크가 없습니다');
      if (cask.owner) return fail(prev, '고객 소유 캐스크입니다');
      if (!isBulkKind(cask.contents)) return fail(prev, '벌크 판매는 몰트·그레인 원액만 가능합니다');
      const amount = spotQuote(s, cask.contents, cask.contents.volumeL, cask);
      recordSpotSale(s, cask.contents, cask.contents.volumeL * cask.contents.abv);
      s.finance.cash += amount;
      s.inventory.casks.splice(ci, 1);
      return { state: s, message: `캐스크 ${cask.id}를 원액째 ${amount.toLocaleString()}원에 판매` };
    }
    const li = s.inventory.lots.findIndex((l) => l.id === a.id);
    const lot = s.inventory.lots[li];
    if (!lot) return fail(prev, '원액이 없습니다');
    if (!isBulkKind(lot)) return fail(prev, '벌크 판매는 몰트·그레인 원액만 가능합니다');
    const liters = Math.min(lot.volumeL, Math.max(0, a.liters ?? lot.volumeL));
    if (liters <= 0) return fail(prev, '판매량을 입력하세요');
    const amount = spotQuote(s, lot, liters);
    recordSpotSale(s, lot, liters * lot.abv);
    s.finance.cash += amount;
    if (lot.volumeL - liters < 1) s.inventory.lots.splice(li, 1);
    else s.inventory.lots[li] = { ...lot, volumeL: lot.volumeL - liters };
    return { state: s, message: `원액 ${Math.round(liters)}L를 ${amount.toLocaleString()}원에 벌크 판매` };
  },
  acceptContract: (s, prev, a) => {
    const offer = s.b2b.contractOffers.find((o) => o.id === a.offerId);
    if (!offer) return fail(prev, '계약 제안이 없습니다');
    if (s.b2b.contracts.length >= BULK.maxActiveContracts) return fail(prev, `동시에 진행할 수 있는 계약은 ${BULK.maxActiveContracts}건까지입니다`);
    const c = startContract(s, offer);
    s.finance.cash += c.prepaidRemaining;
    s.b2b.contracts.push(c);
    s.b2b.contractOffers = s.b2b.contractOffers.filter((o) => o.id !== offer.id);
    return { state: s, message: `${offer.buyerName}와 공급 계약 체결${c.prepaidRemaining > 0 ? ` — 선급금 ${c.prepaidRemaining.toLocaleString()}원 입금` : ''}` };
  },
  acceptRetail: (s, prev, a) => {
    const o = s.commerce.retailOffers.find((x) => x.id === a.offerId);
    if (!o) return fail(prev, '납품 제안이 없습니다');
    if (s.commerce.retailContracts.length >= RETAIL_DEAL.maxActive) return fail(prev, `납품 계약은 ${RETAIL_DEAL.maxActive}건까지입니다`);
    s.commerce.retailContracts.push(startRetail(s, o));
    s.commerce.retailOffers = s.commerce.retailOffers.filter((x) => x.id !== o.id);
    return { state: s, message: `${o.partner} 납품 계약 체결 — 월 ${o.bottlesPerMonth.toLocaleString()}병, 대금은 ${o.paymentDelay}개월 뒤` };
  },
  cancelRetail: (s, prev, a) => {
    const c = s.commerce.retailContracts.find((x) => x.id === a.contractId);
    if (!c) return fail(prev, '계약이 없습니다');
    const cost = retailCancellationCost(c);
    s.finance.cash -= cost;
    s.commerce.retailContracts = s.commerce.retailContracts.filter((x) => x.id !== c.id);
    return { state: s, message: `${c.partner} 납품 계약 해지 — 해지 비용 ${cost.toLocaleString()}원` };
  },
  acceptOem: (s, prev, a) => {
    const o = s.b2b.oemOffers.find((x) => x.id === a.offerId);
    if (!o) return fail(prev, '위탁생산 제안이 없습니다');
    if (s.b2b.oemContracts.length >= OEM.maxActive) return fail(prev, `위탁생산 계약은 ${OEM.maxActive}건까지입니다`);
    const c = startOem(s, o);
    if (!c) return fail(prev, '현금이 부족합니다 (설비 패키지 설치비 − 지원금)');
    s.b2b.oemContracts.push(c);
    s.b2b.oemOffers = s.b2b.oemOffers.filter((x) => x.id !== o.id);
    return { state: s, message: `${o.buyerName} 위탁생산 계약 — 월 ${o.batchesPerMonth}배치, 배치당 ${o.feePerBatch.toLocaleString()}원${o.dedicated ? ` · 전용 증류기 설치 지원 ${(o.capexSupport ?? 0).toLocaleString()}원 (설치 후 시작)` : ''}` };
  },
  acceptCaskBid: (s, prev, a) => {
    const bid = s.b2b.caskBids.find((b) => b.id === a.bidId);
    const ci = bid ? s.inventory.casks.findIndex((c) => c.id === bid.caskId && c.contents && !c.owner) : -1;
    if (!bid || ci < 0) return fail(prev, '제안이 없거나 캐스크가 비었습니다');
    s.finance.cash += bid.price;
    s.inventory.casks.splice(ci, 1);
    s.b2b.caskBids = s.b2b.caskBids.filter((b) => b.id !== bid.id);
    s.b2b.trust = Math.min(100, s.b2b.trust + 2);
    return { state: s, message: `${bid.buyerName}에 캐스크 ${bid.caskId}를 ${bid.price.toLocaleString()}원에 판매` };
  },
  cancelContract: (s, prev, a) => {
    const c = s.b2b.contracts.find((x) => x.id === a.contractId);
    if (!c) return fail(prev, '계약이 없습니다');
    const cost = cancellationCost(c);
    s.finance.cash -= cost;
    // 해지 비용 = 위약금(영업) + 남은 선급금 반환(재무)
    recordPendingCash(s, 'contractPrepay', -Math.round(c.prepaidRemaining));
    s.b2b.trust = Math.max(0, s.b2b.trust - 10);
    s.b2b.contracts = s.b2b.contracts.filter((x) => x.id !== c.id);
    return { state: s, message: `${c.buyerName} 계약 해지 — 해지 비용 ${cost.toLocaleString()}원, 신뢰도 하락` };
  },
};
