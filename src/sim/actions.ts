import { BULK, CASK_COST_SHARE_PER_FILL, CASK_MARKET, CASKS, EQUIPMENT, LOAN_OFFERS, RECHAR_COST } from './content/catalog';
import { assignSlot, handleDeparture, INVESTMENT_OFFERS, masterDistiller, OWNERSHIP, rotateWarehouse, SlotIndex, usedCaskPrice } from './ops';
import { isUnlocked, unlockingNodes } from './research';
import { rngFor } from './rng';
import { cancellationCost, isBulkKind, recordSpotSale, spotQuote, startContract } from './bulk';
import { resolvePending } from './events';
import { mod } from './modifiers';
import { executeBlend, type BlendComponent, type BlendReveal, type BottleOptions } from './blending';
import { blenderOf, delegatePlan, findTarget, LAB, RARE, SAMPLING, samplingCapacity } from './blendTable';
import { MAX_RECHAR, recharCask } from './maturation';
import { emptyCaskOf, regionalCaskPrice } from './newGame';
import { validateRecipe } from './production';
import { recordPendingCash, sumCashFlows } from './cashflow';
import { EXPORT_MARKETS, type ExportMarketId } from './content/exports';
import { applyWaterPermit, equipmentCost, inventoryLoanRoom, inventoryLtv } from './sites';
import { OEM, RETAIL_DEAL, startOem, startRetail } from './deals';
import type { Cask, CashFlowKey, CaskTypeId, GameState, Product, Recipe } from './types';
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
  | { type: 'setExportPrice'; marketId: ExportMarketId; priceFactor: number }
  | { type: 'sellCaskOwnership'; caskId: string }
  | { type: 'rechar'; caskId: string }
  | { type: 'bottle'; components: BlendComponent[]; options: BottleOptions }
  /** 블렌딩 테이블 (결정 #102): 샘플링(읽는 오차↓·레어 발견) · 실험실 분석(피트·우디 정확) · 블렌더에게 맡기기 */
  | { type: 'sampleCask'; caskIds: string[] }
  | { type: 'labAnalyze'; caskIds: string[] }
  | { type: 'delegateBlend'; targetId: string; caskIds: string[]; bottles: number; options: BottleOptions }
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
  | { type: 'acceptCaskBid'; bidId: string }
  /** 입지 특성 (결정 #86~): 취수 증량 신청(제주), 대형 유통 납품(경기), 위탁생산(간토) */
  | { type: 'applyWaterPermit' }
  | { type: 'acceptRetail'; offerId: string }
  | { type: 'cancelRetail'; contractId: string }
  | { type: 'acceptOem'; offerId: string };

export interface ActionResult { state: GameState; error?: string; message?: string }

const fail = (state: GameState, error: string): ActionResult => ({ state, error });

/** 행동별 현금 흐름 항목 — 턴 사이 입출금을 다음 결산 보고서에 싣기 위한 분류 (null = 현금이 움직이지 않는 행동) */
const ACTION_CASH_KEY: Record<Action['type'], CashFlowKey | null> = {
  setOrder: null, saveRecipe: null, deleteRecipe: null, fillCasks: null, dumpCask: null, setPrice: null, setMarketing: null, hire: null,
  buyEquipment: 'equipment', buyCasks: 'casks', buySpotCasks: 'casks', orderSeasoning: 'casks', rechar: 'casks', sellUsedCask: 'usedCask',
  rotateWarehouse: 'rotation', takeInvestment: 'investment', sellCaskOwnership: 'caskOwnership', bottle: 'bottling', fire: 'severance',
  takeLoan: 'loan', repayLoan: 'loanRepay', buyBrokerCask: 'brokerCask', sellBulk: 'spotBulk', acceptContract: 'contractPrepay',
  cancelContract: 'contractCancel', resolveEvent: 'event', acceptCaskBid: 'caskBid',
  // 입지 특성 (#86~): 취수 증량 신청비, 납품 계약 해지 비용, 위탁생산 설비 패키지(설치비 − 지원금)
  applyWaterPermit: 'other', acceptRetail: null, cancelRetail: 'contractCancel', acceptOem: 'equipment',
  // 수출 (#95): 시장 진출비·철수
  openExport: 'export', closeExport: 'export', setExportPrice: null,
  // 블렌딩 테이블 (#102)
  sampleCask: 'blending', labAnalyze: 'blending', delegateBlend: 'bottling',
};

/** 병입 결과 문구 — 블렌딩 테이블 결과 공개(결정 #102 P6) 포함 */
function bottleMessage(p: Product, r?: BlendReveal): string {
  const parts = [`${p.name} ${p.stockBottles.toLocaleString()}병 병입`];
  if (r?.score != null) parts.push(`목표 일치 ${r.score}점 (${r.targetLabel})`);
  if (r?.notes.length) parts.push(r.notes.join(', '));
  if (p.rareSingleCask) parts.push('레어 싱글 캐스크');
  if (r?.rewardNote) parts.push(r.rewardNote);
  return parts.join(' · ');
}

/** 행동 적용. 행동으로 움직인 현금은 pendingCash에 기록돼 다음 결산 보고서(offTurn·netCash)에 합쳐진다 */
export function applyAction(prev: GameState, a: Action): ActionResult {
  const res = applyActionRaw(prev, a);
  if (res.error) return res;
  // 행동 안에서 따로 기록한 몫(예: 계약 해지 비용 중 선급금 반환)을 뺀 나머지를 행동 항목으로 기록.
  // 분류가 없는 행동이 현금을 움직여도 순현금에서 빠지지 않도록 '기타'로 기록
  const recorded = sumCashFlows(res.state.finance.pendingCash ?? {}) - sumCashFlows(prev.finance.pendingCash ?? {});
  const rest = res.state.finance.cash - prev.finance.cash - recorded;
  if (Math.abs(rest) > 1e-6) recordPendingCash(res.state, ACTION_CASH_KEY[a.type] ?? 'other', rest);
  return res;
}

function applyActionRaw(prev: GameState, a: Action): ActionResult {
  if (prev.status !== 'running') return fail(prev, '게임이 종료되었습니다');
  // 테크 게이트 (tech-tree §7) — Phase 1은 TECH_GATING = false라 항상 통과
  if (!isUnlocked(prev, `action:${a.type}`)) return fail(prev, `연구가 필요합니다: ${unlockingNodes(`action:${a.type}`).map((n) => `${n.id} ${n.nameKo}`).join(' 또는 ')}`);
  const s = clone(prev);
  switch (a.type) {
    case 'setOrder': {
      if (!s.production.recipes.some((r) => r.id === a.recipeId)) return fail(prev, '레시피가 없습니다');
      const n = Math.max(0, Math.min(60, Math.floor(a.batchesPerMonth)));
      s.production.orders = s.production.orders.filter((o) => o.recipeId !== a.recipeId);
      if (n > 0) s.production.orders.push({ recipeId: a.recipeId, batchesPerMonth: n });
      return { state: s };
    }
    case 'saveRecipe': {
      const errs = validateRecipe(s, { ...a.recipe, id: a.recipe.id ?? 'new' } as Recipe);
      if (errs.length) return fail(prev, errs.join(' / '));
      if (a.recipe.id) {
        const idx = s.production.recipes.findIndex((r) => r.id === a.recipe.id);
        if (idx < 0) return fail(prev, '레시피가 없습니다');
        s.production.recipes[idx] = { ...(a.recipe as Recipe) };
      } else s.production.recipes.push({ ...a.recipe, id: nid(s, 'R') } as Recipe);
      return { state: s, message: '레시피를 저장했습니다' };
    }
    case 'deleteRecipe': {
      s.production.recipes = s.production.recipes.filter((r) => r.id !== a.recipeId);
      s.production.orders = s.production.orders.filter((o) => o.recipeId !== a.recipeId);
      return { state: s };
    }
    case 'buyEquipment': {
      const def = EQUIPMENT[a.catalogId];
      if (!def) return fail(prev, '알 수 없는 설비');
      if (def.kind === 'visitor' && def.requires && !s.production.equipment.some((e) => e.catalogId === def.requires)) return fail(prev, `${EQUIPMENT[def.requires]?.nameKo}부터 지어야 합니다`);
      if ((def.kind === 'visitor' || def.kind === 'facility') && s.production.equipment.some((e) => e.catalogId === def.id)) return fail(prev, '이미 있습니다');
      if (def.kind === 'facility' && def.regions && !def.regions.includes(s.regionId)) return fail(prev, '이 지역에서는 해당 없는 설비입니다');
      // 입지 건설비·땅값 반영 (결정 #86)
      const cost = equipmentCost(s, def);
      if (s.finance.cash < cost) return fail(prev, '현금이 부족합니다');
      s.finance.cash -= cost;
      s.production.equipment.push({ id: nid(s, 'E'), catalogId: def.id, readyMonth: s.month + def.leadMonths, ...(def.kind === 'still' ? { feintsLPA: 0 } : {}) });
      return { state: s, message: `${def.nameKo} 발주 — ${def.leadMonths}개월 후 설치` };
    }
    case 'buyCasks': {
      const def = CASKS[a.caskType];
      const qty = Math.max(1, Math.floor(a.qty));
      if (!def) return fail(prev, '알 수 없는 캐스크');
      const pending = s.inventory.caskOrders.reduce((t, o) => t + o.qty, 0);
      if (s.inventory.casks.length + pending + qty > warehouseCapacity(s)) return fail(prev, `숙성고 용량 부족 (${s.inventory.casks.length}+주문 ${pending}/${warehouseCapacity(s)})`);
      const unit = Math.round(regionalCaskPrice(s, def.id) * mod(s, `cask:${def.id}`));
      if (s.finance.cash < unit * qty) return fail(prev, '현금이 부족합니다');
      s.finance.cash -= unit * qty;
      // 쿠퍼리지 정상 주문: 카탈로그가, 2개월 뒤 도착 (결정 #66)
      s.inventory.caskOrders.push({ id: nid(s, 'O'), typeId: a.caskType, qty, arriveMonth: s.month + CASK_MARKET.cooperageLeadMonths, source: 'cooperage' });
      return { state: s, message: `${def.nameKo} ${qty}개 쿠퍼리지 주문 — ${CASK_MARKET.cooperageLeadMonths}개월 뒤 도착` };
    }
    case 'buySpotCasks': {
      const def = CASKS[a.caskType];
      const qty = Math.max(1, Math.floor(a.qty));
      if (!def) return fail(prev, '알 수 없는 캐스크');
      if (s.inventory.casks.length + qty > warehouseCapacity(s)) return fail(prev, `숙성고 용량 부족 (${s.inventory.casks.length}/${warehouseCapacity(s)})`);
      const unit = Math.round(regionalCaskPrice(s, def.id) * mod(s, `cask:${def.id}`) * CASK_MARKET.spotPremium);
      if (s.finance.cash < unit * qty) return fail(prev, '현금이 부족합니다');
      s.finance.cash -= unit * qty;
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
        s.inventory.casks.push(c);
      }
      return { state: s, message: `스팟 마켓에서 ${def.nameKo} ${qty}개 즉시 매입 (개당 ${unit.toLocaleString()}원)${duds && observe >= 60 ? ` — QC가 의심스러운 통 ${duds}개를 지적` : ''}` };
    }
    case 'orderSeasoning': {
      const def = CASKS[a.caskType];
      const qty = Math.max(1, Math.floor(a.qty));
      if (!def) return fail(prev, '알 수 없는 캐스크');
      const pending = s.inventory.caskOrders.reduce((t, o) => t + o.qty, 0);
      if (s.inventory.casks.length + pending + qty > warehouseCapacity(s)) return fail(prev, '숙성고 용량 부족');
      // 시즈닝 계약가는 시장가와 무관하게 계약 시점의 카탈로그가 기준 → 셰리통 파동 헤지
      const unit = Math.round(regionalCaskPrice(s, def.id) * CASK_MARKET.seasoningCostFactor);
      if (s.finance.cash < unit * qty) return fail(prev, '현금이 부족합니다');
      s.finance.cash -= unit * qty;
      s.inventory.caskOrders.push({ id: nid(s, 'O'), typeId: a.caskType, qty, arriveMonth: s.month + CASK_MARKET.seasoningMonths, source: 'seasoning' });
      return { state: s, message: `${a.caskType === 'oloroso_butt' ? '셰리 보데가' : '버번 증류소'}와 시즈닝 계약 ${qty}통 — ${CASK_MARKET.seasoningMonths}개월 뒤 최상급 캐스크로 도착 (개당 ${unit.toLocaleString()}원)` };
    }
    case 'sellUsedCask': {
      const ci = s.inventory.casks.findIndex((c) => c.id === a.caskId);
      const cask = s.inventory.casks[ci];
      if (!cask) return fail(prev, '캐스크가 없습니다');
      if (cask.contents) return fail(prev, '빈 캐스크만 팔 수 있습니다');
      if (cask.fills < 1) return fail(prev, '한 번도 쓰지 않은 통은 중고로 팔 수 없습니다');
      const price = usedCaskPrice(cask);
      s.finance.cash += price;
      s.inventory.casks.splice(ci, 1);
      return { state: s, message: `중고 캐스크 ${cask.id}를 럼·테킬라·수제 맥주 양조장에 ${price.toLocaleString()}원에 매각` };
    }
    case 'rotateWarehouse': {
      const r = rotateWarehouse(s, a.warehouseId);
      if (r.error) return fail(prev, r.error);
      return { state: s, message: `캐스크 ${r.moved}개 로테이션 (상하단 교체)` };
    }
    case 'dumpCask': {
      const ci = s.inventory.casks.findIndex((c) => c.id === a.caskId);
      const cask = s.inventory.casks[ci];
      if (!cask?.contents) return fail(prev, '원액이 든 캐스크가 없습니다');
      if (cask.owner) return fail(prev, '고객 소유 캐스크입니다');
      const { contents: _c, contamination: _t, contaminationKnown: _k, slot: _s, ...rest } = cask;
      s.inventory.casks[ci] = { ...rest, activity: cask.contamination ? cask.activity * 0.5 : cask.activity };
      return { state: s, message: `캐스크 ${cask.id} 원액 폐기${cask.contamination ? ' — 오염 통은 활성도 절반' : ''}` };
    }
    case 'openExport': {
      const m = EXPORT_MARKETS[a.marketId];
      if (!m) return fail(prev, '없는 시장입니다');
      s.commerce.exports ??= [];
      if (s.commerce.exports.some((e) => e.marketId === a.marketId)) return fail(prev, `이미 ${m.nameKo}에 진출했습니다`);
      if (s.finance.cash < m.entryCost) return fail(prev, '현금이 부족합니다');
      s.finance.cash -= m.entryCost;
      s.commerce.exports.push({ marketId: a.marketId, openedMonth: s.month, readyMonth: s.month + m.entryMonths, awareness: m.awareness.start, totalBottles: 0 });
      return { state: s, message: `${m.nameKo} 진출 준비 시작 — ${m.entryMonths}개월 뒤 판매` };
    }
    case 'setExportPrice': {
      const e = s.commerce.exports?.find((x) => x.marketId === a.marketId);
      if (!e) return fail(prev, '진출하지 않은 시장입니다');
      e.priceFactor = Math.max(0.5, Math.min(3, Math.round(a.priceFactor * 100) / 100));
      return { state: s, message: `${EXPORT_MARKETS[a.marketId].nameKo} 수출가를 출고가의 ×${e.priceFactor}로 정했습니다` };
    }
    case 'closeExport': {
      const before = s.commerce.exports?.length ?? 0;
      s.commerce.exports = (s.commerce.exports ?? []).filter((e) => e.marketId !== a.marketId);
      if (s.commerce.exports.length === before) return fail(prev, '진출하지 않은 시장입니다');
      return { state: s, message: `${EXPORT_MARKETS[a.marketId].nameKo}에서 철수했습니다 (진입 비용은 돌려받지 못합니다)` };
    }
    case 'takeInvestment': {
      const o = INVESTMENT_OFFERS.find((x) => x.id === a.offerId);
      if (!o) return fail(prev, '투자 제안이 없습니다');
      if (s.finance.investmentsTaken.includes(o.id)) return fail(prev, '이미 받은 투자입니다');
      if (s.month < o.minMonth || s.month > o.maxMonth) return fail(prev, '지금은 받을 수 없는 투자입니다');
      s.finance.cash += o.amount;
      s.finance.investorShare = 1 - (1 - s.finance.investorShare) * (1 - o.share);
      s.finance.investmentsTaken.push(o.id);
      return { state: s, message: `${o.nameKo} ${o.amount.toLocaleString()}원 유치 — 외부 지분 ${(s.finance.investorShare * 100).toFixed(1)}%` };
    }
    case 'sellCaskOwnership': {
      const cask = s.inventory.casks.find((c) => c.id === a.caskId);
      if (!cask?.contents) return fail(prev, '원액이 든 캐스크가 없습니다');
      if (cask.owner) return fail(prev, '이미 판매한 캐스크입니다');
      if (cask.contents.sourced) return fail(prev, '자사 증류 원액만 오너십으로 팔 수 있습니다');
      if (!isBulkKind(cask.contents)) return fail(prev, '몰트·그레인 캐스크만 가능합니다');
      const price = Math.round(spotQuote(s, cask.contents, cask.contents.volumeL, cask) * (OWNERSHIP.premiumBase + OWNERSHIP.premiumAwareness * s.commerce.awareness) * (0.9 + s.hr.houseStyle / 500));
      s.finance.cash += price;
      cask.owner = { name: `개인 고객 ${cask.id}`, soldMonth: s.month, deliverMonth: s.month + Math.max(OWNERSHIP.minDeliverWait, OWNERSHIP.deliverAtMonths - cask.contents.oakMonths) };
      return { state: s, message: `캐스크 ${cask.id} 오너십 판매 ${price.toLocaleString()}원 — ${cask.owner.deliverMonth - s.month}개월 뒤 인도` };
    }
    case 'fillCasks': {
      const lotIdx = s.inventory.lots.findIndex((l) => l.id === a.lotId);
      if (lotIdx < 0) return fail(prev, '원액이 없습니다');
      const lot = s.inventory.lots[lotIdx]!;
      const entry = Math.min(a.entryAbv, lot.abv);
      if (entry < 0.4) return fail(prev, '통입 도수는 40% 이상이어야 합니다');
      let lotLeftL = lot.volumeL;
      let filled = 0;
      const slots = new SlotIndex(s); // 연달아 자리 배정 — 한 번 세고 갱신 (O(n²) 방지)
      for (const id of a.caskIds) {
        const ci = s.inventory.casks.findIndex((c) => c.id === id);
        const cask = s.inventory.casks[ci];
        if (!cask || cask.contents || lotLeftL < 1) continue;
        if (cask.contamination) continue;
        const caskLPA = cask.sizeL * entry;
        const needL = caskLPA / lot.abv;
        const useL = Math.min(needL, lotLeftL);
        const lpa = useL * lot.abv;
        lotLeftL -= useL;
        // 캐스크 원가의 일부를 이번 회차 원액 원가에 배분
        const caskShare = CASKS[cask.typeId].price * CASK_COST_SHARE_PER_FILL;
        // 레어 캐스크 (결정 #102 P8): 통입할 때 정해지는 숨김값 — 캐스크·회차마다 고정된 난수
        const rare = rngFor(s.seed, 0, `rare:${cask.id}:${cask.fills + 1}`).chance(RARE.chance);
        s.inventory.casks[ci] = {
          ...cask, fills: cask.fills + 1, filledMonth: s.month, rare: rare || undefined, rareKnown: undefined, samples: undefined, labAnalyzed: undefined,
          contents: { ...lot, id: nid(s, 'L'), name: `${lot.name} → ${cask.id}`, volumeL: lpa / entry, abv: entry, costPerLPA: lot.costPerLPA + caskShare / lpa },
        };
        s.inventory.casks[ci]!.slot = undefined;
        assignSlot(s, s.inventory.casks[ci]!, a.warehouseId, slots);
        filled++;
      }
      if (!filled) return fail(prev, '채울 수 있는 빈 캐스크가 없습니다 (오염 통은 재탄화해야 다시 쓸 수 있다)');
      if (lotLeftL < 1) s.inventory.lots.splice(lotIdx, 1);
      else s.inventory.lots[lotIdx] = { ...lot, volumeL: lotLeftL };
      return { state: s, message: `캐스크 ${filled}개 통입 (${(entry * 100).toFixed(1)}%)` };
    }
    case 'rechar': {
      const ci = s.inventory.casks.findIndex((c) => c.id === a.caskId);
      const cask = s.inventory.casks[ci];
      if (!cask) return fail(prev, '캐스크가 없습니다');
      if (cask.contents) return fail(prev, '빈 캐스크만 재탄화할 수 있습니다');
      if (cask.recharCount >= MAX_RECHAR) return fail(prev, `재탄화는 최대 ${MAX_RECHAR}회`);
      if (s.finance.cash < RECHAR_COST) return fail(prev, '현금이 부족합니다');
      s.finance.cash -= RECHAR_COST;
      s.inventory.casks[ci] = recharCask(cask);
      return { state: s, message: '재탄화 완료' };
    }
    case 'bottle': {
      const res = executeBlend(s, a.components, a.options);
      if (res.error) return fail(prev, res.error);
      return { state: s, message: bottleMessage(res.product!, res.reveal) };
    }
    case 'sampleCask': {
      const cap = samplingCapacity(s) - s.inventory.samplesThisMonth;
      const casks = a.caskIds.map((id) => s.inventory.casks.find((c) => c.id === id)).filter((c): c is Cask => !!c?.contents && (c.samples ?? 0) < SAMPLING.maxSamples);
      if (!casks.length) return fail(prev, '샘플을 뜰 캐스크가 없습니다 (빈 통이거나 이미 충분히 샘플링했다)');
      if (casks.length > cap) return fail(prev, `이번 달 샘플링 여력 부족 (${Math.max(0, cap)}회 남음) — 마스터 블렌더를 두면 늘어난다`);
      const blender = blenderOf(s);
      const found: string[] = [];
      for (const c of casks) {
        const n = (c.samples ?? 0) + 1;
        c.samples = n;
        c.contents = { ...c.contents!, volumeL: Math.max(0, c.contents!.volumeL - SAMPLING.lossL) };
        // 레어 캐스크는 샘플을 뜰 때 드러날 수 있다 (감정력)
        if (c.rare && !c.rareKnown && rngFor(s.seed, s.month, `rarefind:${c.id}:${n}`).chance(blender ? RARE.findBase + RARE.findPerAppraisal * (blender.appraisal / 100) : RARE.findOwner)) {
          c.rareKnown = true;
          found.push(c.id);
        }
      }
      s.inventory.samplesThisMonth += casks.length;
      s.finance.cash -= casks.length * SAMPLING.cost;
      return { state: s, message: `캐스크 ${casks.length}개 샘플링${found.length ? ` — 레어 캐스크 발견: ${found.join(', ')}` : ''}` };
    }
    case 'labAnalyze': {
      const casks = a.caskIds.map((id) => s.inventory.casks.find((c) => c.id === id)).filter((c): c is Cask => !!c?.contents && !c.labAnalyzed);
      if (!casks.length) return fail(prev, '분석할 캐스크가 없습니다');
      for (const c of casks) c.labAnalyzed = true;
      s.finance.cash -= casks.length * LAB.cost;
      return { state: s, message: `실험실 분석 ${casks.length}건 — 피트·우디는 이제 정확히 안다` };
    }
    case 'delegateBlend': {
      const target = findTarget(s, a.targetId);
      if (!target) return fail(prev, '목표가 없습니다');
      const plan = delegatePlan(s, target, a.caskIds, a.bottles, a.options);
      if ('error' in plan) return fail(prev, plan.error);
      const res = executeBlend(s, plan.components, { ...a.options, targetId: target.source === 'core' ? undefined : target.id, line: target.source === 'core' ? target.id.slice(5) : a.options.line, delegated: true });
      if (res.error) return fail(prev, res.error);
      return { state: s, message: `블렌더에게 맡김 — ${bottleMessage(res.product!, res.reveal)}` };
    }
    case 'setPrice': {
      const p = s.commerce.products.find((x) => x.id === a.productId);
      if (!p) return fail(prev, '제품이 없습니다');
      p.price = Math.max(100, Math.round(a.price / 100) * 100);
      return { state: s };
    }
    case 'setMarketing': {
      s.commerce.marketingBudget = Math.max(0, Math.round(a.amount / 100_000) * 100_000);
      return { state: s };
    }
    case 'hire': {
      const c = s.hr.candidates.find((x) => x.id === a.candidateId);
      if (!c) return fail(prev, '후보가 없습니다');
      s.hr.candidates = s.hr.candidates.filter((x) => x.id !== c.id);
      const { askSalary: _ask, ...staff } = c;
      if (a.asApprentice) {
        const master = masterDistiller(s);
        if (c.role !== 'distiller') return fail(prev, '부사수는 디스틸러 후보만 가능합니다');
        if (!master) return fail(prev, '가르칠 마스터 디스틸러가 없습니다');
        // 부사수: 급여 60%, 마스터 곁에서 24개월 이상 배워야 하우스 스타일을 잇는다
        s.hr.staff.push({ ...staff, salary: Math.round(c.askSalary * 0.6), hiredMonth: s.month, apprenticeOf: master.id });
        return { state: s, message: `${c.name}을(를) ${master.name}의 부사수로 채용` };
      }
      s.hr.staff.push({ ...staff, salary: c.askSalary, hiredMonth: s.month });
      return { state: s, message: `${c.name} 채용` };
    }
    case 'fire': {
      const x = s.hr.staff.find((y) => y.id === a.staffId);
      if (!x) return fail(prev, '직원이 없습니다');
      s.finance.cash -= x.salary; // 퇴직 위로금 1개월분
      const notes: string[] = [];
      handleDeparture(s, x, notes);
      s.hr.staff = s.hr.staff.filter((y) => y.id !== x.id);
      return { state: s, message: [`${x.name} 퇴사 (위로금 1개월분 지급)`, ...notes].join(' — ') };
    }
    case 'takeLoan': {
      const offer = LOAN_OFFERS.find((o) => o.id === a.offerId);
      if (!offer) return fail(prev, '대출 상품이 없습니다');
      if (offer.requires === 'producedSoju' && !s.production.flags.producedSoju) return fail(prev, '전통주(증류식 소주) 생산 실적이 있어야 신청할 수 있습니다');
      if (offer.regions && !offer.regions.includes(s.regionId)) return fail(prev, '이 지역에서는 신청할 수 없는 정책자금입니다');
      if (s.finance.loans.some((l) => l.offerId === offer.id)) return fail(prev, '같은 상품을 이미 이용 중입니다');
      let max = offer.max;
      if (offer.collateral === 'inventory') {
        if (inventoryLtv(s) <= 0) return fail(prev, '이 입지에서는 재고 담보대출을 받을 수 없습니다');
        max = Math.min(max, inventoryLoanRoom(s));
        if (max < 10_000_000) return fail(prev, '담보로 잡을 숙성 재고가 부족합니다');
      }
      const amount = Math.min(max, Math.max(10_000_000, Math.round(a.amount / 1_000_000) * 1_000_000));
      s.finance.cash += amount;
      s.finance.loans.push({
        id: nid(s, 'D'), offerId: offer.id, name: offer.nameKo, principal: amount, balance: amount,
        annualRate: offer.annualRate, termMonths: offer.termMonths, monthlyPayment: annuityPayment(amount, offer.annualRate, offer.termMonths - offer.graceMonths), graceMonths: offer.graceMonths, startMonth: s.month,
      });
      return { state: s, message: `${offer.nameKo} ${amount.toLocaleString()}원 실행` };
    }
    case 'repayLoan': {
      const loan = s.finance.loans.find((l) => l.id === a.loanId);
      if (!loan) return fail(prev, '대출이 없습니다');
      if (s.finance.cash < loan.balance) return fail(prev, '현금이 부족합니다');
      s.finance.cash -= loan.balance;
      s.finance.loans = s.finance.loans.filter((l) => l.id !== loan.id);
      return { state: s, message: '대출 전액 상환' };
    }
    case 'buyBrokerCask': {
      const o = s.b2b.brokerOffers.find((x) => x.id === a.offerId);
      if (!o) return fail(prev, '매물이 없습니다');
      if (s.inventory.casks.length + 1 > warehouseCapacity(s)) return fail(prev, '숙성고 용량 부족');
      if (s.finance.cash < o.price) return fail(prev, '현금이 부족합니다');
      s.finance.cash -= o.price;
      s.inventory.casks.push(o.cask);
      s.b2b.brokerOffers = s.b2b.brokerOffers.filter((x) => x.id !== o.id);
      return { state: s, message: `${o.description} 매입` };
    }
    case 'sellBulk': {
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
    }
    case 'acceptContract': {
      const offer = s.b2b.contractOffers.find((o) => o.id === a.offerId);
      if (!offer) return fail(prev, '계약 제안이 없습니다');
      if (s.b2b.contracts.length >= BULK.maxActiveContracts) return fail(prev, `동시에 진행할 수 있는 계약은 ${BULK.maxActiveContracts}건까지입니다`);
      const c = startContract(s, offer);
      s.finance.cash += c.prepaidRemaining;
      s.b2b.contracts.push(c);
      s.b2b.contractOffers = s.b2b.contractOffers.filter((o) => o.id !== offer.id);
      return { state: s, message: `${offer.buyerName}와 공급 계약 체결${c.prepaidRemaining > 0 ? ` — 선급금 ${c.prepaidRemaining.toLocaleString()}원 입금` : ''}` };
    }
    case 'acceptRetail': {
      const o = s.commerce.retailOffers.find((x) => x.id === a.offerId);
      if (!o) return fail(prev, '납품 제안이 없습니다');
      if (s.commerce.retailContracts.length >= RETAIL_DEAL.maxActive) return fail(prev, `납품 계약은 ${RETAIL_DEAL.maxActive}건까지입니다`);
      s.commerce.retailContracts.push(startRetail(s, o));
      s.commerce.retailOffers = s.commerce.retailOffers.filter((x) => x.id !== o.id);
      return { state: s, message: `${o.partner} 납품 계약 체결 — 월 ${o.bottlesPerMonth.toLocaleString()}병, 대금은 ${o.paymentDelay}개월 뒤` };
    }
    case 'cancelRetail': {
      const c = s.commerce.retailContracts.find((x) => x.id === a.contractId);
      if (!c) return fail(prev, '계약이 없습니다');
      const cost = Math.round((c.termMonths - c.monthsDone) * c.bottlesPerMonth * c.penaltyPerBottle * 0.5);
      s.finance.cash -= cost;
      s.commerce.retailContracts = s.commerce.retailContracts.filter((x) => x.id !== c.id);
      return { state: s, message: `${c.partner} 납품 계약 해지 — 해지 비용 ${cost.toLocaleString()}원` };
    }
    case 'acceptOem': {
      const o = s.b2b.oemOffers.find((x) => x.id === a.offerId);
      if (!o) return fail(prev, '위탁생산 제안이 없습니다');
      if (s.b2b.oemContracts.length >= OEM.maxActive) return fail(prev, `위탁생산 계약은 ${OEM.maxActive}건까지입니다`);
      const c = startOem(s, o);
      if (!c) return fail(prev, '현금이 부족합니다 (설비 패키지 설치비 − 지원금)');
      s.b2b.oemContracts.push(c);
      s.b2b.oemOffers = s.b2b.oemOffers.filter((x) => x.id !== o.id);
      return { state: s, message: `${o.buyerName} 위탁생산 계약 — 월 ${o.batchesPerMonth}배치, 배치당 ${o.feePerBatch.toLocaleString()}원${o.dedicated ? ` · 전용 증류기 설치 지원 ${(o.capexSupport ?? 0).toLocaleString()}원 (설치 후 시작)` : ''}` };
    }
    case 'applyWaterPermit': {
      const err = applyWaterPermit(s);
      if (err) return fail(prev, err);
      const app = s.site.permitApplication!;
      return { state: s, message: `취수 증량 신청 접수 — 약 ${app.decideMonth - s.month}개월 뒤 결과 (승인 확률 ${Math.round(app.chance * 100)}%)` };
    }
    case 'acceptCaskBid': {
      const bid = s.b2b.caskBids.find((b) => b.id === a.bidId);
      const ci = bid ? s.inventory.casks.findIndex((c) => c.id === bid.caskId && c.contents && !c.owner) : -1;
      if (!bid || ci < 0) return fail(prev, '제안이 없거나 캐스크가 비었습니다');
      s.finance.cash += bid.price;
      s.inventory.casks.splice(ci, 1);
      s.b2b.caskBids = s.b2b.caskBids.filter((b) => b.id !== bid.id);
      s.b2b.trust = Math.min(100, s.b2b.trust + 2);
      return { state: s, message: `${bid.buyerName}에 캐스크 ${bid.caskId}를 ${bid.price.toLocaleString()}원에 판매` };
    }
    case 'resolveEvent': {
      const text = resolvePending(s, a.eventId, a.choice);
      if (!text) return fail(prev, '처리할 이벤트가 없습니다');
      return { state: s, message: text };
    }
    case 'cancelContract': {
      const c = s.b2b.contracts.find((x) => x.id === a.contractId);
      if (!c) return fail(prev, '계약이 없습니다');
      const cost = cancellationCost(c);
      s.finance.cash -= cost;
      // 해지 비용 = 위약금(영업) + 남은 선급금 반환(재무)
      recordPendingCash(s, 'contractPrepay', -Math.round(c.prepaidRemaining));
      s.b2b.trust = Math.max(0, s.b2b.trust - 10);
      s.b2b.contracts = s.b2b.contracts.filter((x) => x.id !== c.id);
      return { state: s, message: `${c.buyerName} 계약 해지 — 해지 비용 ${cost.toLocaleString()}원, 신뢰도 하락` };
    }
  }
}
