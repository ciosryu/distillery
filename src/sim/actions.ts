import { BULK, CASK_COST_SHARE_PER_FILL, CASKS, EQUIPMENT, LOAN_OFFERS, RECHAR_COST } from './content/catalog';
import { cancellationCost, isBulkKind, spotQuote, startContract } from './bulk';
import { resolvePending } from './events';
import { mod } from './modifiers';
import { executeBlend, type BlendComponent, type BottleOptions } from './blending';
import { MAX_RECHAR, recharCask } from './maturation';
import { emptyCaskOf, regionalCaskPrice } from './newGame';
import { validateRecipe } from './production';
import { applyWaterPermit, equipmentBlocker, equipmentCost } from './sites';
import { inventoryLoanRoom } from './holding';
import { OEM, RETAIL, startOem, startRetail } from './deals';
import type { CaskTypeId, GameState, Recipe } from './types';
import { annuityPayment, clone, nid, warehouseCapacity } from './util';

export type Action =
  | { type: 'setOrder'; recipeId: string; batchesPerMonth: number }
  | { type: 'saveRecipe'; recipe: Omit<Recipe, 'id'> & { id?: string } }
  | { type: 'deleteRecipe'; recipeId: string }
  | { type: 'buyEquipment'; catalogId: string }
  | { type: 'buyCasks'; caskType: CaskTypeId; qty: number }
  | { type: 'fillCasks'; lotId: string; caskIds: string[]; entryAbv: number }
  | { type: 'rechar'; caskId: string }
  | { type: 'bottle'; components: BlendComponent[]; options: BottleOptions }
  | { type: 'setPrice'; productId: string; price: number }
  | { type: 'setMarketing'; amount: number }
  | { type: 'hire'; candidateId: string }
  | { type: 'fire'; staffId: string }
  | { type: 'takeLoan'; offerId: string; amount: number }
  | { type: 'repayLoan'; loanId: string }
  | { type: 'buyBrokerCask'; offerId: string }
  | { type: 'sellBulk'; source: 'lot' | 'cask'; id: string; liters?: number }
  | { type: 'acceptContract'; offerId: string }
  | { type: 'cancelContract'; contractId: string }
  | { type: 'resolveEvent'; eventId: string; choice: number }
  | { type: 'acceptCaskBid'; bidId: string }
  /** 취수 허가 증량 신청 (제주) */
  | { type: 'applyWaterPermit' }
  /** 산지 대표 거래 수락: 대형 유통 납품(경기) / 위탁생산(간토) */
  | { type: 'acceptRetail'; offerId: string }
  | { type: 'cancelRetail'; contractId: string }
  | { type: 'acceptOem'; offerId: string };

export interface ActionResult { state: GameState; error?: string; message?: string }

const fail = (state: GameState, error: string): ActionResult => ({ state, error });

export function applyAction(prev: GameState, a: Action): ActionResult {
  if (prev.status !== 'running') return fail(prev, '게임이 종료되었습니다');
  const s = clone(prev);
  switch (a.type) {
    case 'setOrder': {
      if (!s.recipes.some((r) => r.id === a.recipeId)) return fail(prev, '레시피가 없습니다');
      const n = Math.max(0, Math.min(60, Math.floor(a.batchesPerMonth)));
      s.orders = s.orders.filter((o) => o.recipeId !== a.recipeId);
      if (n > 0) s.orders.push({ recipeId: a.recipeId, batchesPerMonth: n });
      return { state: s };
    }
    case 'saveRecipe': {
      const errs = validateRecipe(s, { ...a.recipe, id: a.recipe.id ?? 'new' } as Recipe);
      if (errs.length) return fail(prev, errs.join(' / '));
      if (a.recipe.id) {
        const idx = s.recipes.findIndex((r) => r.id === a.recipe.id);
        if (idx < 0) return fail(prev, '레시피가 없습니다');
        s.recipes[idx] = { ...(a.recipe as Recipe) };
      } else s.recipes.push({ ...a.recipe, id: nid(s, 'R') } as Recipe);
      return { state: s, message: '레시피를 저장했습니다' };
    }
    case 'deleteRecipe': {
      s.recipes = s.recipes.filter((r) => r.id !== a.recipeId);
      s.orders = s.orders.filter((o) => o.recipeId !== a.recipeId);
      return { state: s };
    }
    case 'buyEquipment': {
      const def = EQUIPMENT[a.catalogId];
      if (!def) return fail(prev, '알 수 없는 설비');
      const blocker = equipmentBlocker(s, def);
      if (blocker) return fail(prev, blocker);
      const cost = equipmentCost(s, def);
      if (s.cash < cost) return fail(prev, '현금이 부족합니다');
      s.cash -= cost;
      s.equipment.push({ id: nid(s, 'E'), catalogId: def.id, readyMonth: s.month + def.leadMonths, ...(def.kind === 'still' ? { feintsLPA: 0 } : {}) });
      return { state: s, message: `${def.nameKo} 발주 — ${def.leadMonths}개월 후 설치` };
    }
    case 'buyCasks': {
      const def = CASKS[a.caskType];
      const qty = Math.max(1, Math.floor(a.qty));
      if (!def) return fail(prev, '알 수 없는 캐스크');
      if (s.casks.length + qty > warehouseCapacity(s)) return fail(prev, `숙성고 용량 부족 (${s.casks.length}/${warehouseCapacity(s)})`);
      const unit = Math.round(regionalCaskPrice(s, def.id) * mod(s, `cask:${def.id}`));
      if (s.cash < unit * qty) return fail(prev, '현금이 부족합니다');
      s.cash -= unit * qty;
      for (let i = 0; i < qty; i++) s.casks.push(emptyCaskOf(s, a.caskType));
      return { state: s, message: `${def.nameKo} ${qty}개 구매` };
    }
    case 'fillCasks': {
      const lotIdx = s.lots.findIndex((l) => l.id === a.lotId);
      if (lotIdx < 0) return fail(prev, '원액이 없습니다');
      const lot = s.lots[lotIdx]!;
      const entry = Math.min(a.entryAbv, lot.abv);
      if (entry < 0.4) return fail(prev, '통입 도수는 40% 이상이어야 합니다');
      let lotLeftL = lot.volumeL;
      let filled = 0;
      for (const id of a.caskIds) {
        const ci = s.casks.findIndex((c) => c.id === id);
        const cask = s.casks[ci];
        if (!cask || cask.contents || lotLeftL < 1) continue;
        const caskLPA = cask.sizeL * entry;
        const needL = caskLPA / lot.abv;
        const useL = Math.min(needL, lotLeftL);
        const lpa = useL * lot.abv;
        lotLeftL -= useL;
        // 캐스크 원가의 일부를 이번 회차 원액 원가에 배분
        const caskShare = CASKS[cask.typeId].price * CASK_COST_SHARE_PER_FILL;
        s.casks[ci] = {
          ...cask, fills: cask.fills + 1, filledMonth: s.month,
          contents: { ...lot, id: nid(s, 'L'), name: `${lot.name} → ${cask.id}`, volumeL: lpa / entry, abv: entry, costPerLPA: lot.costPerLPA + caskShare / lpa },
        };
        filled++;
      }
      if (!filled) return fail(prev, '채울 수 있는 빈 캐스크가 없습니다');
      if (lotLeftL < 1) s.lots.splice(lotIdx, 1);
      else s.lots[lotIdx] = { ...lot, volumeL: lotLeftL };
      return { state: s, message: `캐스크 ${filled}개 통입 (${(entry * 100).toFixed(1)}%)` };
    }
    case 'rechar': {
      const ci = s.casks.findIndex((c) => c.id === a.caskId);
      const cask = s.casks[ci];
      if (!cask) return fail(prev, '캐스크가 없습니다');
      if (cask.contents) return fail(prev, '빈 캐스크만 재탄화할 수 있습니다');
      if (cask.recharCount >= MAX_RECHAR) return fail(prev, `재탄화는 최대 ${MAX_RECHAR}회`);
      if (s.cash < RECHAR_COST) return fail(prev, '현금이 부족합니다');
      s.cash -= RECHAR_COST;
      s.casks[ci] = recharCask(cask);
      return { state: s, message: '재탄화 완료' };
    }
    case 'bottle': {
      const res = executeBlend(s, a.components, a.options);
      if (res.error) return fail(prev, res.error);
      return { state: s, message: `${res.product!.name} ${res.product!.stockBottles.toLocaleString()}병 병입` };
    }
    case 'setPrice': {
      const p = s.products.find((x) => x.id === a.productId);
      if (!p) return fail(prev, '제품이 없습니다');
      p.price = Math.max(100, Math.round(a.price / 100) * 100);
      return { state: s };
    }
    case 'setMarketing': {
      s.marketingBudget = Math.max(0, Math.round(a.amount / 100_000) * 100_000);
      return { state: s };
    }
    case 'hire': {
      const c = s.candidates.find((x) => x.id === a.candidateId);
      if (!c) return fail(prev, '후보가 없습니다');
      s.candidates = s.candidates.filter((x) => x.id !== c.id);
      const { askSalary: _ask, ...staff } = c;
      s.staff.push({ ...staff, salary: c.askSalary, hiredMonth: s.month });
      return { state: s, message: `${c.name} 채용` };
    }
    case 'fire': {
      const x = s.staff.find((y) => y.id === a.staffId);
      if (!x) return fail(prev, '직원이 없습니다');
      s.cash -= x.salary; // 퇴직 위로금 1개월분
      s.staff = s.staff.filter((y) => y.id !== x.id);
      return { state: s, message: `${x.name} 퇴사 (위로금 1개월분 지급)` };
    }
    case 'takeLoan': {
      const offer = LOAN_OFFERS.find((o) => o.id === a.offerId);
      if (!offer) return fail(prev, '대출 상품이 없습니다');
      if (offer.requires === 'producedSoju' && !s.flags.producedSoju) return fail(prev, '전통주(증류식 소주) 생산 실적이 있어야 신청할 수 있습니다');
      if (s.loans.some((l) => l.offerId === offer.id) && offer.collateral !== 'inventory') return fail(prev, '같은 상품을 이미 이용 중입니다');
      const max = offer.collateral === 'inventory' ? inventoryLoanRoom(s) : offer.max;
      if (max < 10_000_000) return fail(prev, '담보로 인정되는 숙성 재고가 부족합니다');
      const amount = Math.min(max, Math.max(10_000_000, Math.round(a.amount / 1_000_000) * 1_000_000));
      s.cash += amount;
      s.loans.push({
        id: nid(s, 'D'), offerId: offer.id, name: offer.nameKo, principal: amount, balance: amount,
        annualRate: offer.annualRate, termMonths: offer.termMonths, monthlyPayment: annuityPayment(amount, offer.annualRate, offer.termMonths - offer.graceMonths), graceMonths: offer.graceMonths, startMonth: s.month,
      });
      return { state: s, message: `${offer.nameKo} ${amount.toLocaleString()}원 실행` };
    }
    case 'repayLoan': {
      const loan = s.loans.find((l) => l.id === a.loanId);
      if (!loan) return fail(prev, '대출이 없습니다');
      if (s.cash < loan.balance) return fail(prev, '현금이 부족합니다');
      s.cash -= loan.balance;
      s.loans = s.loans.filter((l) => l.id !== loan.id);
      return { state: s, message: '대출 전액 상환' };
    }
    case 'buyBrokerCask': {
      const o = s.brokerOffers.find((x) => x.id === a.offerId);
      if (!o) return fail(prev, '매물이 없습니다');
      if (s.casks.length + 1 > warehouseCapacity(s)) return fail(prev, '숙성고 용량 부족');
      if (s.cash < o.price) return fail(prev, '현금이 부족합니다');
      s.cash -= o.price;
      s.casks.push(o.cask);
      s.brokerOffers = s.brokerOffers.filter((x) => x.id !== o.id);
      return { state: s, message: `${o.description} 매입` };
    }
    case 'sellBulk': {
      if (a.source === 'cask') {
        const ci = s.casks.findIndex((c) => c.id === a.id);
        const cask = s.casks[ci];
        if (!cask?.contents) return fail(prev, '원액이 든 캐스크가 없습니다');
        if (!isBulkKind(cask.contents)) return fail(prev, '벌크 판매는 몰트·그레인 원액만 가능합니다');
        const amount = spotQuote(s, cask.contents, cask.contents.volumeL, cask);
        s.cash += amount;
        s.casks.splice(ci, 1);
        return { state: s, message: `캐스크 ${cask.id}를 원액째 ${amount.toLocaleString()}원에 판매` };
      }
      const li = s.lots.findIndex((l) => l.id === a.id);
      const lot = s.lots[li];
      if (!lot) return fail(prev, '원액이 없습니다');
      if (!isBulkKind(lot)) return fail(prev, '벌크 판매는 몰트·그레인 원액만 가능합니다');
      const liters = Math.min(lot.volumeL, Math.max(0, a.liters ?? lot.volumeL));
      if (liters <= 0) return fail(prev, '판매량을 입력하세요');
      const amount = spotQuote(s, lot, liters);
      s.cash += amount;
      if (lot.volumeL - liters < 1) s.lots.splice(li, 1);
      else s.lots[li] = { ...lot, volumeL: lot.volumeL - liters };
      return { state: s, message: `원액 ${Math.round(liters)}L를 ${amount.toLocaleString()}원에 벌크 판매` };
    }
    case 'acceptContract': {
      const offer = s.contractOffers.find((o) => o.id === a.offerId);
      if (!offer) return fail(prev, '계약 제안이 없습니다');
      if (s.contracts.length >= BULK.maxActiveContracts) return fail(prev, `동시에 진행할 수 있는 계약은 ${BULK.maxActiveContracts}건까지입니다`);
      const c = startContract(s, offer);
      s.cash += c.prepaidRemaining;
      s.contracts.push(c);
      s.contractOffers = s.contractOffers.filter((o) => o.id !== offer.id);
      return { state: s, message: `${offer.buyerName}와 공급 계약 체결${c.prepaidRemaining > 0 ? ` — 선급금 ${c.prepaidRemaining.toLocaleString()}원 입금` : ''}` };
    }
    case 'acceptCaskBid': {
      const bid = s.caskBids.find((b) => b.id === a.bidId);
      const ci = bid ? s.casks.findIndex((c) => c.id === bid.caskId && c.contents) : -1;
      if (!bid || ci < 0) return fail(prev, '제안이 없거나 캐스크가 비었습니다');
      s.cash += bid.price;
      s.casks.splice(ci, 1);
      s.caskBids = s.caskBids.filter((b) => b.id !== bid.id);
      s.b2bTrust = Math.min(100, s.b2bTrust + 2);
      return { state: s, message: `${bid.buyerName}에 캐스크 ${bid.caskId}를 ${bid.price.toLocaleString()}원에 판매` };
    }
    case 'resolveEvent': {
      const text = resolvePending(s, a.eventId, a.choice);
      if (!text) return fail(prev, '처리할 이벤트가 없습니다');
      return { state: s, message: text };
    }
    case 'acceptRetail': {
      const o = s.retailOffers.find((x) => x.id === a.offerId);
      if (!o) return fail(prev, '납품 제안이 없습니다');
      if (s.retailContracts.length >= RETAIL.maxActive) return fail(prev, `납품 계약은 ${RETAIL.maxActive}건까지입니다`);
      s.retailContracts.push(startRetail(s, o));
      s.retailOffers = s.retailOffers.filter((x) => x.id !== o.id);
      return { state: s, message: `${o.partner} 납품 계약 체결 — 월 ${o.bottlesPerMonth.toLocaleString()}병, 대금은 ${o.paymentDelay}개월 뒤` };
    }
    case 'cancelRetail': {
      const c = s.retailContracts.find((x) => x.id === a.contractId);
      if (!c) return fail(prev, '계약이 없습니다');
      const cost = (c.termMonths - c.monthsDone) * c.bottlesPerMonth * c.penaltyPerBottle * 0.5;
      s.cash -= Math.round(cost);
      s.retailContracts = s.retailContracts.filter((x) => x.id !== c.id);
      return { state: s, message: `${c.partner} 납품 계약 해지 — 해지 비용 ${Math.round(cost).toLocaleString()}원` };
    }
    case 'acceptOem': {
      const o = s.oemOffers.find((x) => x.id === a.offerId);
      if (!o) return fail(prev, '위탁생산 제안이 없습니다');
      if (s.oemContracts.length >= OEM.maxActive) return fail(prev, `위탁생산 계약은 ${OEM.maxActive}건까지입니다`);
      s.oemContracts.push(startOem(s, o));
      s.oemOffers = s.oemOffers.filter((x) => x.id !== o.id);
      return { state: s, message: `${o.buyerName} 위탁생산 계약 — 월 ${o.batchesPerMonth}배치, 배치당 ${o.feePerBatch.toLocaleString()}원` };
    }
    case 'applyWaterPermit': {
      const err = applyWaterPermit(s);
      if (err) return fail(prev, err);
      const app = s.siteState.permitApplication!;
      return { state: s, message: `취수 증량 신청 접수 — 약 ${app.decideMonth - s.month}개월 뒤 결과 (승인 확률 ${Math.round(app.chance * 100)}%)` };
    }
    case 'cancelContract': {
      const c = s.contracts.find((x) => x.id === a.contractId);
      if (!c) return fail(prev, '계약이 없습니다');
      const cost = cancellationCost(c);
      s.cash -= cost;
      s.b2bTrust = Math.max(0, s.b2bTrust - 10);
      s.contracts = s.contracts.filter((x) => x.id !== c.id);
      return { state: s, message: `${c.buyerName} 계약 해지 — 해지 비용 ${cost.toLocaleString()}원, 신뢰도 하락` };
    }
  }
}
