import { CASK_COST_SHARE_PER_FILL, CASK_MARKET, CASKS, EQUIPMENT, RECHAR_COST } from './content/catalog';
import { assignSlot, rotateWarehouse, SlotIndex } from './warehouse';
import { usedCaskPrice } from './casks';
import { isLocked, LOCKED_MESSAGE } from './scenario';
import { rngFor } from './rng';
import { lotQuality } from './bulk';
import { mod } from './modifiers';
import { executeBlend, type BlendComponent, type BlendReveal, type BottleOptions } from './blending';
import { blenderOf, delegatePlan, findTarget, LAB, RARE, recordSample, SAMPLING, samplingCapacity } from './blendTable';
import { MAX_RECHAR, recharCask } from './maturation';
import { emptyCaskOf, regionalCaskPrice } from './newGame';
import { validateRecipe } from './production';
import { equipmentCost } from './sites';
import { applyWaterPermit } from './waterPermit';
import type { Cask, CaskTypeId, Product, Recipe } from './types';
import { nid, staffOf, warehouseCapacity } from './util';
import { fail, type CashKeys, type Handlers } from './actionKit';

// 플레이어 행동 — 생산·숙성·블렌딩 (PROD) (결정 #144 — 파일 쪼개기로 actions.ts에서 옮겨 왔다. 규칙 불변)
// 행동을 더할 때: 아래 타입·처리기·현금 분류 세 곳만 고친다. 코어(actions.ts)는 이 파일의 타입을 통째로 합친다

export type ProdAction =
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
  | { type: 'applyWaterPermit' };

export const PROD_CASH_KEY: CashKeys<ProdAction> = {
  setOrder: null,
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
    if (def.kind === 'visitor' && def.requires && !s.production.equipment.some((e) => e.catalogId === def.requires)) return fail(prev, `${EQUIPMENT[def.requires]?.nameKo}부터 지어야 합니다`);
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
    if (cask.recharCount >= MAX_RECHAR) return fail(prev, `재탄화는 최대 ${MAX_RECHAR}회`);
    if (s.finance.cash < RECHAR_COST) return fail(prev, '현금이 부족합니다');
    s.finance.cash -= RECHAR_COST;
    s.inventory.casks[ci] = recharCask(cask);
    return { state: s, message: '재탄화 완료' };
  },
  bottle: (s, prev, a) => {
    const res = executeBlend(s, a.components, a.options);
    if (res.error) return fail(prev, res.error);
    return { state: s, message: bottleMessage(res.product!, res.reveal) };
  },
  sampleCask: (s, prev, a) => {
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
      // 이번 읽기를 남긴다 — 다음 샘플 전까지 화면의 추정치는 이 값이다 (S-10, #136)
      recordSample(s, c, lotQuality(c.contents));
      // 레어 캐스크는 샘플을 뜰 때 드러날 수 있다 (감정력)
      if (c.rare && !c.rareKnown && rngFor(s.seed, s.month, `rarefind:${c.id}:${n}`).chance(blender ? RARE.findBase + RARE.findPerAppraisal * (blender.appraisal / 100) : RARE.findOwner)) {
        c.rareKnown = true;
        found.push(c.id);
      }
    }
    s.inventory.samplesThisMonth += casks.length;
    s.finance.cash -= casks.length * SAMPLING.cost;
    return { state: s, message: `캐스크 ${casks.length}개 샘플링${found.length ? ` — 레어 캐스크 발견: ${found.join(', ')}` : ''}` };
  },
  transferCask: (_s, prev, _a) => {
    // 자리만 있다 — 원액의 caskHistory에 지금 캐스크 구간을 닫고 새 캐스크 구간을 여는 규칙은 단계 P(PROD), PRD §5.2
    return fail(prev, '피니싱은 아직 없습니다 (다음 단계)');
  },
  labAnalyze: (s, prev, a) => {
    const casks = a.caskIds.map((id) => s.inventory.casks.find((c) => c.id === id)).filter((c): c is Cask => !!c?.contents && !c.labAnalyzed);
    if (!casks.length) return fail(prev, '분석할 캐스크가 없습니다');
    for (const c of casks) c.labAnalyzed = true;
    s.finance.cash -= casks.length * LAB.cost;
    return { state: s, message: `실험실 분석 ${casks.length}건 — 피트·우디는 이제 정확히 안다` };
  },
  delegateBlend: (s, prev, a) => {
    const target = findTarget(s, a.targetId);
    if (!target) return fail(prev, '목표가 없습니다');
    const plan = delegatePlan(s, target, a.caskIds, a.bottles, a.options);
    if ('error' in plan) return fail(prev, plan.error);
    const res = executeBlend(s, plan.components, { ...a.options, targetId: target.source === 'core' ? undefined : target.id, line: target.source === 'core' ? target.id.slice(5) : a.options.line, delegated: true });
    if (res.error) return fail(prev, res.error);
    return { state: s, message: `블렌더에게 맡김 — ${bottleMessage(res.product!, res.reveal)}` };
  },
  applyWaterPermit: (s, prev, _a) => {
    const err = applyWaterPermit(s);
    if (err) return fail(prev, err);
    const app = s.site.permitApplication!;
    return { state: s, message: `취수 증량 신청 접수 — 약 ${app.decideMonth - s.month}개월 뒤 결과 (승인 확률 ${Math.round(app.chance * 100)}%)` };
  },
};
