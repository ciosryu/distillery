import { isWhiskyCategory, whiskyMinMonths } from './blending';
import { regionOf } from './content/regions';
import { AUTO_RESTOCK_MONTHS, autoRestockSupported, bestAutoPrice } from './economics';
import { CASK_COST_SHARE_PER_FILL, CASK_MARKET, CASKS, EQUIPMENT, RECHAR_COST } from './content/catalog';
import { assignSlot, rotateWarehouse, SlotIndex } from './warehouse';
import { usedCaskPrice } from './casks';
import { isLocked, LOCKED_MESSAGE } from './scenario';
import { rngFor } from './rng';
import { lotQuality } from './bulk';
import { mod } from './modifiers';
import { executeBlend, type BlendComponent, type BlendReveal, type BottleOptions } from './blending';
import { blenderOf, delegatePlan, findTarget, LAB, RARE, recordSample, SAMPLING, samplingCapacity, takeSample } from './blendTable';
import { canFinishInto, emptyCask, FINISH, finishCount, finishLabel, historyAfterTransfer, MAX_RECHAR, recharCask, vesselMaterial } from './maturation';
import { emptyCaskOf, regionalCaskPrice } from './newGame';
import { validateRecipe } from './production';
import { equipmentCost } from './sites';
import { applyWaterPermit } from './waterPermit';
import { HANDFILL, handfillBlocker } from './handfill';
import type { AutoFillSettings, AutoSampleSettings, Cask, CaskTypeId, Product, Recipe } from './types';
import { nid, staffOf, warehouseCapacity } from './util';
import { fail, type CashKeys, type Handlers } from './actionKit';

// 플레이어 행동 — 생산·숙성·블렌딩 (PROD) (결정 #144 — 파일 쪼개기로 actions.ts에서 옮겨 왔다. 규칙 불변)
// 행동을 더할 때: 아래 타입·처리기·현금 분류 세 곳만 고친다. 코어(actions.ts)는 이 파일의 타입을 통째로 합친다

export type ProdAction =
  | { type: 'setOrder'; recipeId: string; batchesPerMonth: number }
  /** 이번 달 소주 생산 건너뛰기 (#249 ④ 별도 버튼) — on=false면 취소. 진행하면 저절로 풀린다 */
  | { type: 'skipSojuThisMonth'; on: boolean }
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
  /** 수출 (#95·#101): 수입사 제안 수락 / 계약 해지 */
  | { type: 'rechar'; caskId: string }
  | { type: 'bottle'; components: BlendComponent[]; options: BottleOptions }
  /** 블렌딩 테이블 (결정 #124): 샘플링(읽는 오차↓·레어 발견) · 실험실 분석(피트·우디 정확) · 블렌더에게 맡기기 */
  | { type: 'sampleCask'; caskIds: string[] }
  /** 피니싱 (S-10 자리) — 캐스크 원액을 빈 캐스크로 옮겨 마무리한다. 규칙은 단계 P(PROD): 지금은 항상 실패 */
  | { type: 'transferCask'; fromCaskId: string; toCaskId: string }
  | { type: 'labAnalyze'; caskIds: string[] }
  | { type: 'delegateBlend'; targetId: string; caskIds: string[]; bottles: number; options: BottleOptions }
  /** 입지 특성 (결정 #86~): 취수 증량 신청(제주), 대형 유통 납품(경기), 위탁생산(간토) */
  | { type: 'applyWaterPermit' }
  /** 품절 제품을 목록에서 지운다 (2026-11-09 오너 요청 — MVP는 품절 제품이 자동으로 사라지지 않는다). 재고가 남은 제품은 지울 수 없다 */
  | { type: 'archiveProduct'; productId: string }
  /** 통에서 원액을 빼서 탱크로 (2026-11-09 오너 요청 — 실수로 잘못 넣은 통). 통입한 달·샘플 전이면 통입 취소, 아니면 숙성을 지닌 채 탱크로 */
  | { type: 'unfillCask'; caskId: string }
  /** 자동 최적 가격 켜기·끄기 (#200) — 켜면 바로 한 번 값을 정한다 */
  | { type: 'setAutoPrice'; productId: string; on: boolean }
  /** 자동 납품 (#206) — months: 유지할 재고 개월분(1·2·3·6), null이면 끔 */
  | { type: 'setAutoRestock'; productId: string; months: number | null; minMonths?: number | null }
  /** 자동 샘플 설정 (#207) — 비운 칸은 기본값 */
  | { type: 'setAutoSample'; settings: AutoSampleSettings }
  /** 자동 통입 (#239) — settings null이면 끔, 비운 칸은 기본값 */
  | { type: 'setAutoFill'; settings: AutoFillSettings | null }
  /** 핸드필 존 전용 통 지정 (#233) — caskId null이면 해제. 한 번에 하나 */
  | { type: 'setHandfillCask'; caskId: string | null }
  /** 판매 중인 제품 이름 바꾸기 (#236, 2026-11-10 오너 요청) — 무료, 판매 기록·표기는 그대로 */
  | { type: 'renameProduct'; productId: string; name: string };

/** 제품 이름 최대 글자 수 (#236) */
export const PRODUCT_NAME_MAX = 40;

export const PROD_CASH_KEY: CashKeys<ProdAction> = {
  setOrder: null,
  skipSojuThisMonth: null,
  archiveProduct: null,
  unfillCask: null,
  setAutoPrice: null,
  setAutoRestock: null,
  setAutoSample: null,
  setAutoFill: null,
  setHandfillCask: null,
  renameProduct: null,
  saveRecipe: null,
  deleteRecipe: null,
  fillCasks: null,
  dumpCask: null,
  buyEquipment: 'equipment',
  buyCasks: 'casks',
  buySpotCasks: 'casks',
  orderSeasoning: 'casks',
  rechar: 'casks',
  sellUsedCask: 'usedCask',
  rotateWarehouse: 'rotation',
  bottle: 'bottling',
  // 입지 특성 (#86~): 취수 증량 신청비, 납품 계약 해지 비용, 위탁생산 설비 패키지(설치비 − 지원금)
  applyWaterPermit: 'other',
  // 블렌딩 테이블 (#124)
  sampleCask: 'blending',
  labAnalyze: 'blending',
  delegateBlend: 'bottling',
  // 피니싱 (S-10 자리)
  transferCask: null,
};

/** 병입 결과 문구 — 블렌딩 테이블 결과 공개(결정 #124 P6) 포함 */
function bottleMessage(p: Product, r?: BlendReveal): string {
  const parts = [`${p.name} ${p.stockBottles.toLocaleString()}병 병입`];
  if (r?.score != null) parts.push(`목표 일치 ${r.score}점 (${r.targetLabel})`);
  if (r?.notes.length) parts.push(r.notes.join(', '));
  if (p.rareSingleCask) parts.push('레어 싱글 캐스크');
  if (r?.rewardNote) parts.push(r.rewardNote);
  return parts.join(' · ');
}

export const PROD_HANDLERS: Handlers<ProdAction> = {
  skipSojuThisMonth: (s, _prev, a) => {
    if (a.on) { s.production.skipSojuMonth = s.month; return { state: s, message: '이번 달 소주 생산을 건너뛴다 — 다음 달부터 다시 만든다' }; }
    delete s.production.skipSojuMonth;
    return { state: s, message: '소주 생산 건너뛰기를 취소했다' };
  },
  archiveProduct: (s, prev, a) => {
    const i = s.commerce.products.findIndex((x) => x.id === a.productId);
    const p = s.commerce.products[i];
    if (!p) return fail(prev, '제품이 없습니다');
    if (p.stockBottles > 0) return fail(prev, `재고가 ${p.stockBottles.toLocaleString()}병 남아 있어 지울 수 없습니다 — 다 판 뒤에 지운다`);
    s.commerce.productArchive.push({ id: p.id, name: p.name, category: p.category, createdMonth: p.createdMonth, lastMonthSold: p.lastMonthSold, totalSold: p.totalSold, quality: p.quality, price: p.price });
    s.commerce.products.splice(i, 1);
    return { state: s, message: `판매 목록에서 지움 — 「${p.name}」 (판매 기록은 남는다)` };
  },
  unfillCask: (s, prev, a) => {
    const ci = s.inventory.casks.findIndex((c) => c.id === a.caskId);
    const cask = s.inventory.casks[ci];
    if (!cask?.contents) return fail(prev, '원액이 든 통이 없습니다');
    if (cask.owner) return fail(prev, '고객 소유 통입니다');
    const lot = cask.contents;
    // 통입한 달에 샘플도 안 떴으면 통입 취소 — 통은 넣기 전 그대로, 원액은 통 원가 배분만 되돌려 탱크로
    const sameMonth = cask.filledMonth === s.month && !cask.samples && !cask.sampleLog?.length;
    const lpa = lot.volumeL * lot.abv;
    const name = lot.name.split(' → ')[0]!;
    if (sameMonth) {
      const caskShare = CASKS[cask.typeId].price * CASK_COST_SHARE_PER_FILL;
      s.inventory.lots.push({ ...lot, id: nid(s, 'L'), name: `${name} (통입 취소 ${cask.id})`, costPerLPA: Math.max(0, lot.costPerLPA - (lpa > 0 ? caskShare / lpa : 0)) });
      const { contents: _c, filledMonth: _f, slot: _s, rare: _r, rareKnown: _k, ...rest } = cask;
      s.inventory.casks[ci] = { ...rest, fills: Math.max(0, cask.fills - 1) };
      return { state: s, message: `${cask.id} 통입 취소 — 원액 ${Math.round(lot.volumeL).toLocaleString()}L(${(lot.abv * 100).toFixed(1)}%, 물을 탄 도수)를 탱크로 되돌렸다. 통은 넣기 전 그대로` };
    }
    // 그 뒤에는 옮겨 붓는 것 — 손실 0.75%(피니싱 옮기기와 같다), 통은 한 번 쓴 통이 된다. 원액은 오크·옹기 개월을 지닌 채 탱크에(다시 통입하면 이어서 숙성)
    const kept = 1 - FINISH.lossShare;
    s.inventory.lots.push({ ...lot, id: nid(s, 'L'), name: `${name} (${cask.id}에서 뺌)`, volumeL: lot.volumeL * kept });
    s.inventory.casks[ci] = emptyCask(cask);
    return { state: s, message: `${cask.id}에서 원액 ${Math.round(lot.volumeL * kept).toLocaleString()}L를 빼 탱크로 옮겼다(손실 ${(FINISH.lossShare * 100).toFixed(2)}%) — 숙성 ${lot.oakMonths}개월은 원액에 남고, 통은 한 번 쓴 통이 된다` };
  },
  renameProduct: (s, prev, a) => {
    const p = s.commerce.products.find((x) => x.id === a.productId);
    if (!p) return fail(prev, '그런 제품이 없습니다');
    const name = a.name.replace(/\s+/g, ' ').trim();
    if (!name) return fail(prev, '이름을 입력하세요');
    if (name.length > PRODUCT_NAME_MAX) return fail(prev, `이름은 ${PRODUCT_NAME_MAX}자까지입니다`);
    if (name === p.name) return { state: s };
    if (s.commerce.products.some((x) => x.id !== p.id && x.name === name)) return fail(prev, `「${name}」은 이미 판매 목록에 있는 이름입니다`);
    const old = p.name;
    p.name = name;
    return { state: s, message: `「${old}」 → 「${name}」 이름을 바꿨다` };
  },
  setHandfillCask: (s, prev, a) => {
    if (!s.production.equipment.some((e) => e.catalogId === HANDFILL.facilityId)) return fail(prev, '핸드필 존부터 지어야 합니다(설비)');
    for (const c of s.inventory.casks) if (c.handfill) delete c.handfill;
    if (a.caskId == null) return { state: s, message: '핸드필 통 지정을 풀었다' };
    const c = s.inventory.casks.find((x) => x.id === a.caskId);
    if (!c) return fail(prev, '그런 통이 없습니다');
    const why = handfillBlocker(s, c);
    if (why) return fail(prev, why);
    c.handfill = true;
    return { state: s, message: `통 ${c.id}를 핸드필 전용으로 지정 — 다음 달부터 방문객이 담아 간다` };
  },
  setAutoFill: (s, _prev, a) => {
    if (!a.settings) { delete s.inventory.autoFill; return { state: s, message: '자동 통입을 껐다' }; }
    const x = a.settings;
    const clean: AutoFillSettings = {};
    if (x.everyMonths && [3, 6].includes(x.everyMonths)) clean.everyMonths = x.everyMonths;
    const kinds = [...new Set(x.kinds ?? [])].filter((k) => k === 'malt' || k === 'grain');
    if (kinds.length === 1) clean.kinds = kinds;
    if (x.prefer === 'used') clean.prefer = 'used';
    if (x.entryAbv != null && x.entryAbv >= 0.4 && x.entryAbv <= 0.75 && Math.abs(x.entryAbv - 0.635) > 1e-9) clean.entryAbv = Math.round(x.entryAbv * 1000) / 1000;
    s.inventory.autoFill = clean;
    return { state: s };
  },
  setAutoSample: (s, _prev, a) => {
    const x = a.settings;
    const clean: AutoSampleSettings = {};
    if (x.off) clean.off = true;
    if (x.groups?.length && x.groups.length < 3) clean.groups = [...new Set(x.groups)].filter((g) => g === 'whisky' || g === 'spirit' || g === 'soju');
    if (x.minAgeMonths && x.minAgeMonths > 0) clean.minAgeMonths = Math.floor(x.minAgeMonths);
    if (x.minGapMonths && x.minGapMonths > 0) clean.minGapMonths = Math.floor(x.minGapMonths);
    if (x.maxPerMonth && x.maxPerMonth > 0) clean.maxPerMonth = Math.floor(x.maxPerMonth);
    if (Object.keys(clean).length) s.inventory.autoSample = clean; else delete s.inventory.autoSample;
    return { state: s };
  },
  setAutoRestock: (s, prev, a) => {
    const p = s.commerce.products.find((x) => x.id === a.productId);
    if (!p) return fail(prev, '제품이 없습니다');
    if (a.months == null) { delete p.autoRestock; return { state: s, message: `${p.name} 자동 납품 끔` }; }
    if (!autoRestockSupported(p)) return fail(prev, '이 제품은 자동 납품을 쓸 수 없습니다 (소주·진·고량주·싱글 몰트·그레인 위스키만, 면세 한정판 제외)');
    if (!(AUTO_RESTOCK_MONTHS as readonly number[]).includes(a.months)) return fail(prev, '유지 개월분은 1·2·3·6 중에서 고른다');
    p.autoRestock = a.months;
    // 쓸 통의 최소 숙성 (P-PROD-41) — 위스키만, 법정 숙성 이상 · 표기 이하. null/표기와 같으면 기본(표기)
    if (a.minMonths !== undefined && isWhiskyCategory(p.category)) {
      const legal = whiskyMinMonths(regionOf(s).whisky);
      const label = p.ageYears ? p.ageYears * 12 : legal;
      if (a.minMonths == null || a.minMonths >= label) delete p.autoRestockMinMonths;
      else if (a.minMonths < legal) return fail(prev, `위스키 통은 법정 숙성 ${legal}개월 이상이어야 합니다`);
      else p.autoRestockMinMonths = Math.floor(a.minMonths);
    }
    if (p.autoRestockMinMonths != null) return { state: s, message: `${p.name} 자동 납품 — ${Math.floor(p.autoRestockMinMonths / 12)}년(${p.autoRestockMinMonths}개월) 이상 통부터 쓴다. 표기보다 어린 통이 섞이면 보충 때 표기가 그만큼 내려간다` };
    return { state: s, message: `${p.name} 자동 납품 켬 — 매달 판매 전에 재고를 약 ${a.months}개월분으로 채운다${p.ageYears ? ` (${p.ageYears}년 이상 숙성 통만, 표기에 가까운 통부터)` : isWhiskyCategory(p.category) ? ' (법정 숙성 이상 통만, 어린 통부터)' : ' (탱크 원액, 먼저 만든 것부터)'}` };
  },
  setAutoPrice: (s, prev, a) => {
    const p = s.commerce.products.find((x) => x.id === a.productId);
    if (!p) return fail(prev, '제품이 없습니다');
    if (p.dutyFreeOnly) return fail(prev, '면세 한정판은 자동 가격을 쓸 수 없습니다');
    if (!a.on) { delete p.autoPrice; return { state: s, message: `${p.name} 자동 가격 끔 — 지금 값 ${p.price.toLocaleString()}원 유지` }; }
    p.autoPrice = true;
    const v = bestAutoPrice(s, p);
    if (v != null) p.price = v;
    return { state: s, message: `${p.name} 자동 가격 켬 — 매달 이번 달 이익이 가장 큰 값으로 (지금 ${p.price.toLocaleString()}원)` };
  },
  setOrder: (s, prev, a) => {
    const recipe = s.production.recipes.find((r) => r.id === a.recipeId);
    if (!recipe) return fail(prev, '레시피가 없습니다');
    if (a.batchesPerMonth > 0 && isLocked(s, `kind:${recipe.kind}`)) return fail(prev, LOCKED_MESSAGE);
    const n = Math.max(0, Math.min(60, Math.floor(a.batchesPerMonth)));
    s.production.orders = s.production.orders.filter((o) => o.recipeId !== a.recipeId);
    if (n > 0) s.production.orders.push({ recipeId: a.recipeId, batchesPerMonth: n });
    return { state: s };
  },
  saveRecipe: (s, prev, a) => {
    if (isLocked(s, `kind:${a.recipe.kind}`)) return fail(prev, LOCKED_MESSAGE);
    const errs = validateRecipe(s, { ...a.recipe, id: a.recipe.id ?? 'new' } as Recipe);
    if (errs.length) return fail(prev, errs.join(' / '));
    if (a.recipe.id) {
      const idx = s.production.recipes.findIndex((r) => r.id === a.recipe.id);
      if (idx < 0) return fail(prev, '레시피가 없습니다');
      s.production.recipes[idx] = { ...(a.recipe as Recipe) };
    } else s.production.recipes.push({ ...a.recipe, id: nid(s, 'R') } as Recipe);
    return { state: s, message: '레시피를 저장했습니다' };
  },
  deleteRecipe: (s, _prev, a) => {
    s.production.recipes = s.production.recipes.filter((r) => r.id !== a.recipeId);
    s.production.orders = s.production.orders.filter((o) => o.recipeId !== a.recipeId);
    return { state: s };
  },
  buyEquipment: (s, prev, a) => {
    const def = EQUIPMENT[a.catalogId];
    if (!def) return fail(prev, '알 수 없는 설비');
    if (isLocked(s, `facility:${def.id}`)) return fail(prev, LOCKED_MESSAGE);
    if ((def.kind === 'visitor' || def.kind === 'facility') && def.requires && !s.production.equipment.some((e) => e.catalogId === def.requires)) return fail(prev, `${EQUIPMENT[def.requires]?.nameKo}부터 지어야 합니다`);
    if ((def.kind === 'visitor' || def.kind === 'facility') && s.production.equipment.some((e) => e.catalogId === def.id)) return fail(prev, '이미 있습니다');
    if (def.kind === 'facility' && def.regions && !def.regions.includes(s.regionId)) return fail(prev, '이 지역에서는 해당 없는 설비입니다');
    // 입지 건설비·땅값 반영 (결정 #86)
    const cost = equipmentCost(s, def);
    if (s.finance.cash < cost) return fail(prev, '현금이 부족합니다');
    s.finance.cash -= cost;
    s.production.equipment.push({ id: nid(s, 'E'), catalogId: def.id, readyMonth: s.month + def.leadMonths, ...(def.kind === 'still' ? { feintsLPA: 0 } : {}) });
    return { state: s, message: `${def.nameKo} 발주 — ${def.leadMonths}개월 후 설치` };
  },
  buyCasks: (s, prev, a) => {
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
  },
  buySpotCasks: (s, prev, a) => {
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
  },
  orderSeasoning: (s, prev, a) => {
    const def = CASKS[a.caskType];
    const qty = Math.max(1, Math.floor(a.qty));
    if (!def) return fail(prev, '알 수 없는 캐스크');
    if (def.seasoningType === 'none') return fail(prev, '시즈닝 계약은 버번·셰리 캐스크만 할 수 있습니다');
    const pending = s.inventory.caskOrders.reduce((t, o) => t + o.qty, 0);
    if (s.inventory.casks.length + pending + qty > warehouseCapacity(s)) return fail(prev, '숙성고 용량 부족');
    // 시즈닝 계약가는 시장가와 무관하게 계약 시점의 카탈로그가 기준 → 셰리통 파동 헤지
    const unit = Math.round(regionalCaskPrice(s, def.id) * CASK_MARKET.seasoningCostFactor);
    if (s.finance.cash < unit * qty) return fail(prev, '현금이 부족합니다');
    s.finance.cash -= unit * qty;
    s.inventory.caskOrders.push({ id: nid(s, 'O'), typeId: a.caskType, qty, arriveMonth: s.month + CASK_MARKET.seasoningMonths, source: 'seasoning' });
    return { state: s, message: `${a.caskType === 'oloroso_butt' ? '셰리 보데가' : '버번 증류소'}와 시즈닝 계약 ${qty}통 — ${CASK_MARKET.seasoningMonths}개월 뒤 최상급 캐스크로 도착 (개당 ${unit.toLocaleString()}원)` };
  },
  sellUsedCask: (s, prev, a) => {
    const ci = s.inventory.casks.findIndex((c) => c.id === a.caskId);
    const cask = s.inventory.casks[ci];
    if (!cask) return fail(prev, '캐스크가 없습니다');
    if (cask.contents) return fail(prev, '빈 캐스크만 팔 수 있습니다');
    if (vesselMaterial(cask) !== 'wood') return fail(prev, '옹기는 중고 캐스크 시장에 팔 수 없습니다');
    if (cask.fills < 1) return fail(prev, '한 번도 쓰지 않은 통은 중고로 팔 수 없습니다');
    const price = usedCaskPrice(cask);
    s.finance.cash += price;
    s.inventory.casks.splice(ci, 1);
    return { state: s, message: `중고 캐스크 ${cask.id}를 럼·테킬라·수제 맥주 양조장에 ${price.toLocaleString()}원에 매각` };
  },
  rotateWarehouse: (s, prev, a) => {
    const r = rotateWarehouse(s, a.warehouseId);
    if (r.error) return fail(prev, r.error);
    return { state: s, message: `캐스크 ${r.moved}개 로테이션 (상하단 교체)` };
  },
  dumpCask: (s, prev, a) => {
    const ci = s.inventory.casks.findIndex((c) => c.id === a.caskId);
    const cask = s.inventory.casks[ci];
    if (!cask?.contents) return fail(prev, '원액이 든 캐스크가 없습니다');
    if (cask.owner) return fail(prev, '고객 소유 캐스크입니다');
    const { contents: _c, contamination: _t, contaminationKnown: _k, slot: _s, ...rest } = cask;
    s.inventory.casks[ci] = { ...rest, activity: cask.contamination ? cask.activity * 0.5 : cask.activity };
    return { state: s, message: `캐스크 ${cask.id} 원액 폐기${cask.contamination ? ' — 오염 통은 활성도 절반' : ''}` };
  },
  fillCasks: (s, prev, a) => {
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
      // 레어 캐스크 (결정 #124 P8): 통입할 때 정해지는 숨김값 — 캐스크·회차마다 고정된 난수
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
  },
  rechar: (s, prev, a) => {
    const ci = s.inventory.casks.findIndex((c) => c.id === a.caskId);
    const cask = s.inventory.casks[ci];
    if (!cask) return fail(prev, '캐스크가 없습니다');
    if (cask.contents) return fail(prev, '빈 캐스크만 재탄화할 수 있습니다');
    if (vesselMaterial(cask) !== 'wood') return fail(prev, '나무 캐스크만 재탄화할 수 있습니다');
    if (cask.recharCount >= MAX_RECHAR) return fail(prev, `재탄화는 최대 ${MAX_RECHAR}회`);
    if (s.finance.cash < RECHAR_COST) return fail(prev, '현금이 부족합니다');
    s.finance.cash -= RECHAR_COST;
    s.inventory.casks[ci] = recharCask(cask);
    return { state: s, message: '재탄화 완료' };
  },
  bottle: (s, prev, a) => {
    const res = executeBlend(s, a.components, a.options);
    if (res.error) return fail(prev, res.error);
    // 기존 제품 재고 보충 (#186) — 몇 병을 더했고 품질이 어떻게 됐는지
    if (a.options.restockId) {
      const before = prev.commerce.products.find((x) => x.id === a.options.restockId)!;
      const added = res.product!.stockBottles - before.stockBottles;
      return { state: s, message: [`${res.product!.name} 재고 보충 +${added.toLocaleString()}병 (재고 ${res.product!.stockBottles.toLocaleString()}병) · 품질 ${before.quality} → ${res.product!.quality} (재고 가중 평균)`, ...(res.reveal?.notes ?? [])].join(' · ') };
    }
    return { state: s, message: bottleMessage(res.product!, res.reveal) };
  },
  sampleCask: (s, prev, a) => {
    const cap = samplingCapacity(s) - s.inventory.samplesThisMonth;
    const casks = a.caskIds.map((id) => s.inventory.casks.find((c) => c.id === id)).filter((c): c is Cask => !!c?.contents && (c.samples ?? 0) < SAMPLING.maxSamples);
    if (!casks.length) return fail(prev, '샘플을 뜰 캐스크가 없습니다 (빈 통이거나 이미 충분히 샘플링했다)');
    if (casks.length > cap) return fail(prev, `이번 달 샘플링 여력 부족 (${Math.max(0, cap)}회 남음) — 마스터 블렌더를 두면 늘어난다`);
    const blender = blenderOf(s);
    // 1통씩: 횟수·원액 손실·읽기 기록·레어 판정 (자동 샘플과 같은 함수)
    const found = casks.filter((c) => takeSample(s, c, blender, lotQuality)).map((c) => c.id);
    s.inventory.samplesThisMonth += casks.length;
    s.finance.cash -= casks.length * SAMPLING.cost;
    return { state: s, message: `캐스크 ${casks.length}개 샘플링${found.length ? ` — 레어 캐스크 발견: ${found.join(', ')}` : ''}` };
  },
  transferCask: (s, prev, a) => {
    // 피니싱 (PRD §5.2, #158) — 원액을 빈 시즈닝 캐스크로 옮긴다. 손실 0.75%, 숙성 연수는 최초 통입 기준
    const fi = s.inventory.casks.findIndex((c) => c.id === a.fromCaskId);
    const ti = s.inventory.casks.findIndex((c) => c.id === a.toCaskId);
    const from = s.inventory.casks[fi];
    const to = s.inventory.casks[ti];
    if (!from?.contents) return fail(prev, '옮길 원액이 든 캐스크가 없습니다');
    if (from.owner) return fail(prev, '고객 소유 캐스크입니다');
    if (!to || to.contents) return fail(prev, '빈 캐스크로만 옮길 수 있습니다');
    if (to.contamination) return fail(prev, '이 통은 쓸 수 없습니다 (오염 통은 재탄화해야 다시 쓸 수 있다)');
    if (!canFinishInto(to.typeId)) return fail(prev, '피니싱은 버번·셰리 시즈닝 캐스크로만 할 수 있습니다 (다른 캐스크는 테크 WHI-3 해금 후)');
    if (to.typeId === from.typeId) return fail(prev, '같은 종류의 캐스크로는 피니싱이 되지 않습니다');
    const lot = from.contents;
    if (finishCount(lot) >= FINISH.maxFinishes) return fail(prev, '피니싱은 한 번만 할 수 있습니다 (더블 캐스크는 테크 WHI-3 해금 후)');
    const keep = 1 - FINISH.lossShare;
    const volumeL = lot.volumeL * keep;
    if (volumeL > to.sizeL) return fail(prev, `원액 ${Math.round(volumeL)}L가 ${CASKS[to.typeId].nameKo}에 다 들어가지 않습니다`);
    const lpa = volumeL * lot.abv;
    // 원가: 손실만큼 LPA당 원가가 오르고, 통입처럼 캐스크 원가 일부를 배분한다
    const caskShare = CASKS[to.typeId].price * CASK_COST_SHARE_PER_FILL;
    s.inventory.casks[ti] = {
      ...to, fills: to.fills + 1, filledMonth: s.month, slot: from.slot, rare: undefined, rareKnown: undefined, samples: undefined, sampleLog: undefined, labAnalyzed: undefined,
      contents: { ...lot, name: `${lot.name} → ${to.id}`, volumeL, costPerLPA: lot.costPerLPA / keep + caskShare / lpa, caskHistory: historyAfterTransfer(lot, from.typeId, to.typeId, s.month) },
    };
    s.inventory.casks[fi] = emptyCask(from);
    return { state: s, message: `${from.id} → ${to.id} ${finishLabel(to.typeId)} 시작 (손실 ${(lot.volumeL - volumeL).toFixed(1)}L) — 권장 ${FINISH.recommendedMonths[0]}~${FINISH.recommendedMonths[1]}개월` };
  },
  labAnalyze: (s, prev, a) => {
    const casks = a.caskIds.map((id) => s.inventory.casks.find((c) => c.id === id)).filter((c): c is Cask => !!c?.contents && !c.labAnalyzed);
    if (!casks.length) return fail(prev, '분석할 캐스크가 없습니다');
    // 분석은 떠 간 시료로 한다 → 이번 읽기를 기록으로 남긴다(피트·우디는 정확, 나머지 축은 지금 샘플 횟수의 읽기 오차). 샘플 횟수·월 여력은 쓰지 않는다 (#157)
    for (const c of casks) { c.labAnalyzed = true; recordSample(s, c, lotQuality(c.contents!)); }
    s.finance.cash -= casks.length * LAB.cost;
    return { state: s, message: `실험실 분석 ${casks.length}건 — 피트·우디는 이제 정확히 안다(분석 결과를 샘플 기록에 남겼다)` };
  },
  delegateBlend: (s, prev, a) => {
    const target = findTarget(s, a.targetId);
    if (!target) return fail(prev, '목표가 없습니다');
    const plan = delegatePlan(s, target, a.caskIds, a.bottles, a.options);
    if ('error' in plan) return fail(prev, plan.error);
    const res = executeBlend(s, plan.components, { ...a.options, targetId: target.source === 'core' ? undefined : target.id, line: target.source === 'core' ? target.id.slice(5) : a.options.line, delegated: true });
    if (res.error) return fail(prev, res.error);
    return { state: s, message: `블렌더에게 맡김 — ${bottleMessage(res.product!, res.reveal)}${plan.unknown ? ` · 샘플 기록이 없는 ${plan.unknown}통은 뺐다` : ''}` };
  },
  applyWaterPermit: (s, prev, _a) => {
    const err = applyWaterPermit(s);
    if (err) return fail(prev, err);
    const app = s.site.permitApplication!;
    return { state: s, message: `취수 증량 신청 접수 — 약 ${app.decideMonth - s.month}개월 뒤 결과 (승인 확률 ${Math.round(app.chance * 100)}%)` };
  },
};
