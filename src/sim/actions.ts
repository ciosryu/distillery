import { BULK, CASK_COST_SHARE_PER_FILL, CASK_MARKET, CASKS, EQUIPMENT, LOAN_OFFERS, RECHAR_COST } from './content/catalog';
import { assignSlot, handleDeparture, INVESTMENT_OFFERS, masterDistiller, OWNERSHIP, rotateWarehouse, usedCaskPrice } from './ops';
import { rngFor } from './rng';
import { cancellationCost, isBulkKind, recordSpotSale, spotQuote, startContract } from './bulk';
import { resolvePending } from './events';
import { mod } from './modifiers';
import { executeBlend, type BlendComponent, type BottleOptions } from './blending';
import { MAX_RECHAR, recharCask } from './maturation';
import { emptyCaskOf, regionalCaskPrice } from './newGame';
import { validateRecipe } from './production';
import { EXPORT_MARKETS, type ExportMarketId } from './content/exports';
import type { CaskTypeId, GameState, Recipe } from './types';
import { annuityPayment, clone, nid, staffOf, warehouseCapacity } from './util';

export type Action =
  | { type: 'setOrder'; recipeId: string; batchesPerMonth: number }
  | { type: 'saveRecipe'; recipe: Omit<Recipe, 'id'> & { id?: string } }
  | { type: 'deleteRecipe'; recipeId: string }
  | { type: 'buyEquipment'; catalogId: string }
  | { type: 'buyCasks'; caskType: CaskTypeId; qty: number }
  | { type: 'fillCasks'; lotId: string; caskIds: string[]; entryAbv: number; warehouseId?: string }
  /** 스팟 마켓: 즉시 입고·웃돈·골빈 통 위험 */
  | { type: 'buySpotCasks'; caskType: CaskTypeId; qty: number }
  /** 시즈닝 계약: 새 통을 셰리 보데가(올로로소 벗)나 버번 증류소(배럴)에 보내 24개월 시즈닝 */
  | { type: 'orderSeasoning'; caskType: 'oloroso_butt' | 'ex_bourbon_barrel'; qty: number }
  | { type: 'sellUsedCask'; caskId: string }
  | { type: 'rotateWarehouse'; warehouseId: string }
  /** 오염 캐스크 원액 폐기 */
  | { type: 'dumpCask'; caskId: string }
  | { type: 'takeInvestment'; offerId: string }
  | { type: 'openExport'; marketId: ExportMarketId }
  | { type: 'closeExport'; marketId: ExportMarketId }
  | { type: 'sellCaskOwnership'; caskId: string }
  | { type: 'rechar'; caskId: string }
  | { type: 'bottle'; components: BlendComponent[]; options: BottleOptions }
  | { type: 'setPrice'; productId: string; price: number }
  | { type: 'setMarketing'; amount: number }
  | { type: 'hire'; candidateId: string; asApprentice?: boolean }
  | { type: 'fire'; staffId: string }
  | { type: 'takeLoan'; offerId: string; amount: number }
  | { type: 'repayLoan'; loanId: string }
  | { type: 'buyBrokerCask'; offerId: string }
  | { type: 'sellBulk'; source: 'lot' | 'cask'; id: string; liters?: number }
  | { type: 'acceptContract'; offerId: string }
  | { type: 'cancelContract'; contractId: string }
  | { type: 'resolveEvent'; eventId: string; choice: number }
  | { type: 'acceptCaskBid'; bidId: string };

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
      if (def.kind === 'visitor' && def.requires && !s.equipment.some((e) => e.catalogId === def.requires)) return fail(prev, `${EQUIPMENT[def.requires]?.nameKo}부터 지어야 합니다`);
      if ((def.kind === 'visitor' || def.kind === 'facility') && s.equipment.some((e) => e.catalogId === def.id)) return fail(prev, '이미 있습니다');
      if (def.kind === 'facility' && def.regions && !def.regions.includes(s.regionId)) return fail(prev, '이 지역에서는 해당 없는 설비입니다');
      if (s.cash < def.cost) return fail(prev, '현금이 부족합니다');
      s.cash -= def.cost;
      s.equipment.push({ id: nid(s, 'E'), catalogId: def.id, readyMonth: s.month + def.leadMonths, ...(def.kind === 'still' ? { feintsLPA: 0 } : {}) });
      return { state: s, message: `${def.nameKo} 발주 — ${def.leadMonths}개월 후 설치` };
    }
    case 'buyCasks': {
      const def = CASKS[a.caskType];
      const qty = Math.max(1, Math.floor(a.qty));
      if (!def) return fail(prev, '알 수 없는 캐스크');
      const pending = s.caskOrders.reduce((t, o) => t + o.qty, 0);
      if (s.casks.length + pending + qty > warehouseCapacity(s)) return fail(prev, `숙성고 용량 부족 (${s.casks.length}+주문 ${pending}/${warehouseCapacity(s)})`);
      const unit = Math.round(regionalCaskPrice(s, def.id) * mod(s, `cask:${def.id}`));
      if (s.cash < unit * qty) return fail(prev, '현금이 부족합니다');
      s.cash -= unit * qty;
      // 쿠퍼리지 정상 주문: 카탈로그가, 2개월 뒤 도착 (결정 #66)
      s.caskOrders.push({ id: nid(s, 'O'), typeId: a.caskType, qty, arriveMonth: s.month + CASK_MARKET.cooperageLeadMonths, source: 'cooperage' });
      return { state: s, message: `${def.nameKo} ${qty}개 쿠퍼리지 주문 — ${CASK_MARKET.cooperageLeadMonths}개월 뒤 도착` };
    }
    case 'buySpotCasks': {
      const def = CASKS[a.caskType];
      const qty = Math.max(1, Math.floor(a.qty));
      if (!def) return fail(prev, '알 수 없는 캐스크');
      if (s.casks.length + qty > warehouseCapacity(s)) return fail(prev, `숙성고 용량 부족 (${s.casks.length}/${warehouseCapacity(s)})`);
      const unit = Math.round(regionalCaskPrice(s, def.id) * mod(s, `cask:${def.id}`) * CASK_MARKET.spotPremium);
      if (s.cash < unit * qty) return fail(prev, '현금이 부족합니다');
      s.cash -= unit * qty;
      const rng = rngFor(s.seed, s.month, `spot:${s.nextId}`);
      const observe = Math.max(0, ...staffOf(s, 'warehouse').map((x) => x.stats.a));
      let duds = 0;
      for (let i = 0; i < qty; i++) {
        const c = emptyCaskOf(s, a.caskType);
        if (rng.chance(CASK_MARKET.spotDudChance)) {
          // 골빈 통: 3~4필, 활성도 바닥
          c.fills = rng.int(3, 4); c.activity = rng.range(0.15, 0.35); c.seasoning *= 0.3; duds++;
        } else { c.fills = 1; c.activity = def.activity * rng.range(0.8, 0.95); c.seasoning *= 0.8; }
        // 숙성고 QC의 관찰 스탯이 높으면 입고 때 상태를 알아본다
        c.activityKnown = rng.chance(observe / 120);
        s.casks.push(c);
      }
      return { state: s, message: `스팟 마켓에서 ${def.nameKo} ${qty}개 즉시 매입 (개당 ${unit.toLocaleString()}원)${duds && observe >= 60 ? ` — QC가 의심스러운 통 ${duds}개를 지적` : ''}` };
    }
    case 'orderSeasoning': {
      const def = CASKS[a.caskType];
      const qty = Math.max(1, Math.floor(a.qty));
      if (!def) return fail(prev, '알 수 없는 캐스크');
      const pending = s.caskOrders.reduce((t, o) => t + o.qty, 0);
      if (s.casks.length + pending + qty > warehouseCapacity(s)) return fail(prev, '숙성고 용량 부족');
      // 시즈닝 계약가는 시장가와 무관하게 계약 시점의 카탈로그가 기준 → 셰리통 파동 헤지
      const unit = Math.round(regionalCaskPrice(s, def.id) * CASK_MARKET.seasoningCostFactor);
      if (s.cash < unit * qty) return fail(prev, '현금이 부족합니다');
      s.cash -= unit * qty;
      s.caskOrders.push({ id: nid(s, 'O'), typeId: a.caskType, qty, arriveMonth: s.month + CASK_MARKET.seasoningMonths, source: 'seasoning' });
      return { state: s, message: `${a.caskType === 'oloroso_butt' ? '셰리 보데가' : '버번 증류소'}와 시즈닝 계약 ${qty}통 — ${CASK_MARKET.seasoningMonths}개월 뒤 최상급 캐스크로 도착 (개당 ${unit.toLocaleString()}원)` };
    }
    case 'sellUsedCask': {
      const ci = s.casks.findIndex((c) => c.id === a.caskId);
      const cask = s.casks[ci];
      if (!cask) return fail(prev, '캐스크가 없습니다');
      if (cask.contents) return fail(prev, '빈 캐스크만 팔 수 있습니다');
      if (cask.fills < 1) return fail(prev, '한 번도 쓰지 않은 통은 중고로 팔 수 없습니다');
      const price = usedCaskPrice(cask);
      s.cash += price;
      s.casks.splice(ci, 1);
      return { state: s, message: `중고 캐스크 ${cask.id}를 럼·테킬라·수제 맥주 양조장에 ${price.toLocaleString()}원에 매각` };
    }
    case 'rotateWarehouse': {
      const r = rotateWarehouse(s, a.warehouseId);
      if (r.error) return fail(prev, r.error);
      return { state: s, message: `캐스크 ${r.moved}개 로테이션 (상하단 교체)` };
    }
    case 'dumpCask': {
      const ci = s.casks.findIndex((c) => c.id === a.caskId);
      const cask = s.casks[ci];
      if (!cask?.contents) return fail(prev, '원액이 든 캐스크가 없습니다');
      if (cask.owner) return fail(prev, '고객 소유 캐스크입니다');
      const { contents: _c, contamination: _t, contaminationKnown: _k, slot: _s, ...rest } = cask;
      s.casks[ci] = { ...rest, activity: cask.contamination ? cask.activity * 0.5 : cask.activity };
      return { state: s, message: `캐스크 ${cask.id} 원액 폐기${cask.contamination ? ' — 오염 통은 활성도 절반' : ''}` };
    }
    case 'openExport': {
      const m = EXPORT_MARKETS[a.marketId];
      if (!m) return fail(prev, '없는 시장입니다');
      s.exports ??= [];
      if (s.exports.some((e) => e.marketId === a.marketId)) return fail(prev, `이미 ${m.nameKo}에 진출했습니다`);
      if (s.cash < m.entryCost) return fail(prev, '현금이 부족합니다');
      s.cash -= m.entryCost;
      s.exports.push({ marketId: a.marketId, openedMonth: s.month, readyMonth: s.month + m.entryMonths, awareness: m.awareness.start, totalBottles: 0 });
      return { state: s, message: `${m.nameKo} 진출 준비 시작 — ${m.entryMonths}개월 뒤 판매` };
    }
    case 'closeExport': {
      const before = s.exports?.length ?? 0;
      s.exports = (s.exports ?? []).filter((e) => e.marketId !== a.marketId);
      if (s.exports.length === before) return fail(prev, '진출하지 않은 시장입니다');
      return { state: s, message: `${EXPORT_MARKETS[a.marketId].nameKo}에서 철수했습니다 (진입 비용은 돌려받지 못합니다)` };
    }
    case 'takeInvestment': {
      const o = INVESTMENT_OFFERS.find((x) => x.id === a.offerId);
      if (!o) return fail(prev, '투자 제안이 없습니다');
      if (s.investmentsTaken.includes(o.id)) return fail(prev, '이미 받은 투자입니다');
      if (s.month < o.minMonth || s.month > o.maxMonth) return fail(prev, '지금은 받을 수 없는 투자입니다');
      s.cash += o.amount;
      s.investorShare = 1 - (1 - s.investorShare) * (1 - o.share);
      s.investmentsTaken.push(o.id);
      return { state: s, message: `${o.nameKo} ${o.amount.toLocaleString()}원 유치 — 외부 지분 ${(s.investorShare * 100).toFixed(1)}%` };
    }
    case 'sellCaskOwnership': {
      const cask = s.casks.find((c) => c.id === a.caskId);
      if (!cask?.contents) return fail(prev, '원액이 든 캐스크가 없습니다');
      if (cask.owner) return fail(prev, '이미 판매한 캐스크입니다');
      if (cask.contents.sourced) return fail(prev, '자사 증류 원액만 오너십으로 팔 수 있습니다');
      if (!isBulkKind(cask.contents)) return fail(prev, '몰트·그레인 캐스크만 가능합니다');
      const price = Math.round(spotQuote(s, cask.contents, cask.contents.volumeL, cask) * (OWNERSHIP.premiumBase + OWNERSHIP.premiumAwareness * s.awareness) * (0.9 + s.houseStyle / 500));
      s.cash += price;
      cask.owner = { name: `개인 고객 ${cask.id}`, soldMonth: s.month, deliverMonth: s.month + Math.max(OWNERSHIP.minDeliverWait, OWNERSHIP.deliverAtMonths - cask.contents.oakMonths) };
      return { state: s, message: `캐스크 ${cask.id} 오너십 판매 ${price.toLocaleString()}원 — ${cask.owner.deliverMonth - s.month}개월 뒤 인도` };
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
        if (cask.contamination) continue;
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
        s.casks[ci]!.slot = undefined;
        assignSlot(s, s.casks[ci]!, a.warehouseId);
        filled++;
      }
      if (!filled) return fail(prev, '채울 수 있는 빈 캐스크가 없습니다 (오염 통은 재탄화해야 다시 쓸 수 있다)');
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
      if (a.asApprentice) {
        const master = masterDistiller(s);
        if (c.role !== 'distiller') return fail(prev, '부사수는 디스틸러 후보만 가능합니다');
        if (!master) return fail(prev, '가르칠 마스터 디스틸러가 없습니다');
        // 부사수: 급여 60%, 마스터 곁에서 24개월 이상 배워야 하우스 스타일을 잇는다
        s.staff.push({ ...staff, salary: Math.round(c.askSalary * 0.6), hiredMonth: s.month, apprenticeOf: master.id });
        return { state: s, message: `${c.name}을(를) ${master.name}의 부사수로 채용` };
      }
      s.staff.push({ ...staff, salary: c.askSalary, hiredMonth: s.month });
      return { state: s, message: `${c.name} 채용` };
    }
    case 'fire': {
      const x = s.staff.find((y) => y.id === a.staffId);
      if (!x) return fail(prev, '직원이 없습니다');
      s.cash -= x.salary; // 퇴직 위로금 1개월분
      const notes: string[] = [];
      handleDeparture(s, x, notes);
      s.staff = s.staff.filter((y) => y.id !== x.id);
      return { state: s, message: [`${x.name} 퇴사 (위로금 1개월분 지급)`, ...notes].join(' — ') };
    }
    case 'takeLoan': {
      const offer = LOAN_OFFERS.find((o) => o.id === a.offerId);
      if (!offer) return fail(prev, '대출 상품이 없습니다');
      if (offer.requires === 'producedSoju' && !s.flags.producedSoju) return fail(prev, '전통주(증류식 소주) 생산 실적이 있어야 신청할 수 있습니다');
      if (offer.regions && !offer.regions.includes(s.regionId)) return fail(prev, '이 지역에서는 신청할 수 없는 정책자금입니다');
      if (s.loans.some((l) => l.offerId === offer.id)) return fail(prev, '같은 상품을 이미 이용 중입니다');
      const amount = Math.min(offer.max, Math.max(10_000_000, Math.round(a.amount / 1_000_000) * 1_000_000));
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
        if (cask.owner) return fail(prev, '고객 소유 캐스크입니다');
        if (!isBulkKind(cask.contents)) return fail(prev, '벌크 판매는 몰트·그레인 원액만 가능합니다');
        const amount = spotQuote(s, cask.contents, cask.contents.volumeL, cask);
        recordSpotSale(s, cask.contents, cask.contents.volumeL * cask.contents.abv);
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
      recordSpotSale(s, lot, liters * lot.abv);
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
      const ci = bid ? s.casks.findIndex((c) => c.id === bid.caskId && c.contents && !c.owner) : -1;
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
