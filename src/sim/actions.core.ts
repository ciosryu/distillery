import { fail, type CashKeys, type Handlers } from './actionKit';
import { FLAGSHIP_RESERVE_TAG, planTag, reserveCaskIds, TAG_COLORS, TAG_LABEL_MAX, TAG_MAX } from './tags';
import { policyError, PRICE_MODE_LABEL, runPricePolicies } from './priceEngine';
import { PRICE_POLICY } from './pricePolicy';
import { resetFirstPriceOnAuto } from './content/market';
import { currentSuggested } from './economics';
import type { PricePolicy, TagColor, TagEffect } from './types';
import { calendar, nid } from './util';

// 플레이어 행동 — 코어(ARCH): 캐스크 태그 (#249 QoL ①, #260 플래그십 예비). 결정 #144의 처리기 표 구조를 따른다.
// 태그는 표시와 규칙 효과의 표지일 뿐 돈·원액을 움직이지 않는다 — 현금 분류 없음

export type CoreAction =
  /** 고른 통의 원액에 태그를 붙이거나 뗀다. 하나라도 못 하는 통이 있으면 아무것도 바꾸지 않는다(화면이 planTag로 먼저 거른다) */
  | { type: 'tagCasks'; caskIds: string[]; add?: string[]; remove?: string[] }
  /** 태그 만들기 */
  | { type: 'defineTag'; label: string; color: TagColor; effect?: TagEffect }
  /** 태그 이름·색·효과 바꾸기 (effect: null = 표시만) */
  | { type: 'editTag'; tagId: string; label?: string; color?: TagColor; effect?: TagEffect | null }
  /** 태그 지우기 — 모든 원액에서 함께 빠진다 */
  | { type: 'deleteTag'; tagId: string }
  /**
   * 자동 가격 정책 ([결정 #291], architecture §10.9 ②) — productId 'all'이면 국내 판매 제품 전부(면세 한정판 제외).
   * mode null = 끔(지금 값 유지, 정책 그릇은 남긴다). 고르면 그 제품만 바로 한 번 정한다(옛 setAutoPrice와 같다)
   */
  | { type: 'setPricePolicy'; productId: string; mode: PricePolicy['mode'] | null; target?: number; min?: number; max?: number };

export const CORE_CASH_KEY: CashKeys<CoreAction> = { tagCasks: null, defineTag: null, editTag: null, deleteTag: null, setPricePolicy: null };

const cleanLabel = (label: string) => label.trim().slice(0, TAG_LABEL_MAX);

export const CORE_HANDLERS: Handlers<CoreAction> = {
  setPricePolicy: (s, prev, a) => {
    const all = a.productId === 'all';
    const targets = all ? s.commerce.products.filter((p) => !p.dutyFreeOnly) : s.commerce.products.filter((p) => p.id === a.productId);
    if (!targets.length) return fail(prev, all ? '자동 가격을 걸 제품이 없습니다' : '제품이 없습니다');
    if (!all && targets[0]!.dutyFreeOnly) return fail(prev, '면세 한정판은 자동 가격을 쓸 수 없습니다');
    const who = all ? `제품 ${targets.length}개` : targets[0]!.name;
    if (a.mode === null) {
      for (const p of targets) delete p.autoPrice;
      return { state: s, message: `${who} 자동 가격 끔 — 지금 값 유지` };
    }
    for (const p of targets) {
      const q: PricePolicy = { ...(p.pricePolicy ?? {}), mode: a.mode };
      if (a.min !== undefined) q.min = a.min;
      if (a.max !== undefined) q.max = a.max;
      if (a.target !== undefined) q.target = a.target;
      else if (a.mode === 'premium' && q.target == null) q.target = PRICE_POLICY.n;
      if (p.pricePolicy?.mode !== a.mode) delete q.lastFactor; // 정책을 바꾸면 가드 기준을 새로 잡는다(지금 값 ÷ 기준가)
      const err = policyError(q);
      if (err) return fail(prev, `${p.name}: ${err}`);
      if (a.mode === 'turnover') resetFirstPriceOnAuto(p, currentSuggested(s, p)); // P-MKT-34 (나): A로 켤 때만 첫 출고가 → 기준가. B·C는 ×n 출발(P-PROD-53)
      p.autoPrice = true;
      p.pricePolicy = q;
    }
    runPricePolicies(s, null, calendar(s).monthOfYear, new Set(targets.map((p) => p.id)));
    const skipped = all ? s.commerce.products.length - targets.length : 0;
    return { state: s, message: `${who} 자동 가격 — ${PRICE_MODE_LABEL[a.mode]}${skipped ? ` (면세 한정판 ${skipped}개 제외)` : ''}` };
  },
  tagCasks: (s, prev, a) => {
    const plan = planTag(prev, a.caskIds, { add: a.add, remove: a.remove });
    if (plan.error) return fail(prev, plan.error);
    if (!plan.ok.length) return fail(prev, '태그를 바꿀 통이 없습니다');
    if (plan.skipped.length) return fail(prev, `태그를 바꿀 수 없는 통이 있습니다 — ${plan.skipped.map((x) => `${x.id}(${x.reason})`).join(', ')}`);
    const reserve = reserveCaskIds(prev);
    const optOut = new Set(s.inventory.reserveOptOut ?? []);
    for (const id of plan.ok) {
      const c = s.inventory.casks.find((x) => x.id === id)!;
      const lot = c.contents!;
      const tags = new Set(lot.tagIds ?? []);
      for (const t of a.add ?? []) {
        tags.add(t);
        if (t === FLAGSHIP_RESERVE_TAG) optOut.delete(lot.id);
      }
      for (const t of a.remove ?? []) {
        tags.delete(t);
        // 자동으로 보이던 예비 통에서 떼면 다시 붙이지 않는다 (#260 "플레이어가 떼거나 바꿀 수 있다")
        if (t === FLAGSHIP_RESERVE_TAG && reserve.has(id)) optOut.add(lot.id);
      }
      if (tags.size) lot.tagIds = [...tags];
      else delete lot.tagIds;
    }
    // 통에 없는 원액 id는 정리한다(병입·판매로 사라진 원액)
    const live = new Set(s.inventory.casks.flatMap((c) => (c.contents ? [c.contents.id] : [])));
    const kept = [...optOut].filter((id) => live.has(id));
    if (kept.length) s.inventory.reserveOptOut = kept;
    else delete s.inventory.reserveOptOut;
    return { state: s, message: `${plan.ok.length}통의 태그를 바꿨다` };
  },
  defineTag: (s, prev, a) => {
    const label = cleanLabel(a.label);
    if (!label) return fail(prev, '태그 이름을 적으세요');
    if (!TAG_COLORS.includes(a.color)) return fail(prev, '없는 색입니다');
    const defs = s.inventory.tagDefs ?? [];
    if (defs.length >= TAG_MAX) return fail(prev, `태그는 ${TAG_MAX}개까지 만들 수 있습니다`);
    if (defs.some((t) => t.label === label) || label === '플래그십 예비') return fail(prev, '같은 이름의 태그가 있습니다');
    s.inventory.tagDefs = [...defs, { id: nid(s, 'T'), label, color: a.color, ...(a.effect ? { effect: a.effect } : {}) }];
    return { state: s, message: `태그 「${label}」을 만들었다` };
  },
  editTag: (s, prev, a) => {
    const defs = s.inventory.tagDefs ?? [];
    const i = defs.findIndex((t) => t.id === a.tagId);
    if (i < 0) return fail(prev, a.tagId === FLAGSHIP_RESERVE_TAG ? '기본 태그는 바꿀 수 없습니다' : '없는 태그입니다');
    const t = { ...defs[i]! };
    if (a.label != null) {
      const label = cleanLabel(a.label);
      if (!label) return fail(prev, '태그 이름을 적으세요');
      if (defs.some((x, j) => j !== i && x.label === label) || label === '플래그십 예비') return fail(prev, '같은 이름의 태그가 있습니다');
      t.label = label;
    }
    if (a.color != null) {
      if (!TAG_COLORS.includes(a.color)) return fail(prev, '없는 색입니다');
      t.color = a.color;
    }
    if (a.effect === null) delete t.effect;
    else if (a.effect) t.effect = a.effect;
    s.inventory.tagDefs = defs.map((x, j) => (j === i ? t : x));
    return { state: s };
  },
  deleteTag: (s, prev, a) => {
    const defs = s.inventory.tagDefs ?? [];
    const t = defs.find((x) => x.id === a.tagId);
    if (!t) return fail(prev, a.tagId === FLAGSHIP_RESERVE_TAG ? '기본 태그는 지울 수 없습니다' : '없는 태그입니다');
    const left = defs.filter((x) => x.id !== a.tagId);
    if (left.length) s.inventory.tagDefs = left;
    else delete s.inventory.tagDefs;
    for (const lot of [...s.inventory.lots, ...s.inventory.casks.flatMap((c) => (c.contents ? [c.contents] : []))]) {
      if (!lot.tagIds?.includes(a.tagId)) continue;
      const rest = lot.tagIds.filter((x) => x !== a.tagId);
      if (rest.length) lot.tagIds = rest;
      else delete lot.tagIds;
    }
    return { state: s, message: `태그 「${t.label}」을 지웠다` };
  },
};
