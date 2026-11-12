import { bestAutoPrice, currentSuggested } from './economics';
import type { GameState, MonthReport, PriceLogEntry, PriceMode, PricePolicy, Product } from './types';

// 자동 가격 3정책의 그릇과 실행 (코어 ARCH — [결정 #291], architecture §10.9). 정책 함수(목표함수)는 MKT 몫 — 여기에 등록한다.
// 흐름: 플레이어 정책(Product.autoPrice + pricePolicy?) → 판매 직전(틱 5단계) 공유 스냅샷으로 모든 제품의 결정을 먼저 구한다(S6)
//   → 공통 가드(범위 ⑦) → 한꺼번에 적용 → 사유 한 줄(MonthReport.priceLog). 정책을 켜지 않은 판은 아무것도 바꾸지 않는다

export const PRICE_MODES: readonly PriceMode[] = ['turnover', 'profit', 'premium'];
export const PRICE_MODE_LABEL: Record<PriceMode, string> = { turnover: 'A 현금회전', profit: 'B 이익', premium: 'C 가격 유지' };
/** C의 목표 배수 기본값 n (P-PROD-53 — 세 정책의 시작 배수가 같다) */
export const DEFAULT_POLICY_FACTOR = 1.3;
/** 플레이어가 정할 수 있는 범위의 바깥 한계(기준가 배수) — 지금 자동 가격 후보 격자(AUTO_PRICE_FACTORS)와 같다 */
export const POLICY_FACTOR_LIMITS = { min: 0.6, max: 2 } as const;

/**
 * 정책 함수 계약 (MKT가 B·C를 등록한다):
 * - 입력 `snap`은 판매 전 상태(모든 제품이 같은 진열을 본다) — **바꾸지 않는다**
 * - 돌려줄 것: 값(원, 100원 단위)과 사유 한 줄. 바꾸지 않으려면 null
 * - 병당 공헌 > 0 같은 정책 고유 가드는 함수 안에서, 범위(min·max)는 공통 가드가 마지막에 자른다
 * - 지난 결정 배수가 필요하면 `p.pricePolicy?.lastFactor`를 읽는다(재고 보충으로 값이 기준가 ×1로 돌아간 달에도 같은 뜻 — MKT `0a182d1`의 교훈)
 */
export type PricePolicyFn = (snap: GameState, p: Product, monthOfYear: number) => { price: number; why: string } | null;

const REGISTRY: Partial<Record<PriceMode, PricePolicyFn>> = {
  // A 현금회전 = #200 그대로 (결정 #291 ②) — 이번 달 국내 진열 공헌 최대
  turnover: (snap, p, moy) => {
    const v = bestAutoPrice(snap, p, moy);
    return v == null ? null : { price: v, why: '이번 달 진열 공헌 최대' };
  },
};

/** MKT가 정책 함수를 등록한다(B·C). 등록되지 않은 정책은 명령이 거절한다 */
export function registerPricePolicy(mode: PriceMode, fn: PricePolicyFn | null): void { if (fn) REGISTRY[mode] = fn; else if (mode !== 'turnover') delete REGISTRY[mode]; }
export const isPolicyAvailable = (mode: PriceMode): boolean => !!REGISTRY[mode];

/** 이 제품의 정책 — 꺼져 있으면 null. 옛 세이브(autoPrice만)·알 수 없는 mode는 A로 읽는다(⑧ — 값은 지우지 않는다) */
export function priceModeOf(p: Product): PriceMode | null {
  if (!p.autoPrice) return null;
  const m = p.pricePolicy?.mode;
  return m && PRICE_MODES.includes(m) && REGISTRY[m] ? m : 'turnover';
}

/** 범위(기준가 배수) — 정책에 적힌 값, 없으면 null(가드 없음 = #200 그대로) */
export function policyRange(p: Product): { min: number; max: number } | null {
  const q = p.pricePolicy;
  if (q?.min == null && q?.max == null) return null;
  return { min: q?.min ?? POLICY_FACTOR_LIMITS.min, max: q?.max ?? POLICY_FACTOR_LIMITS.max };
}

/** 정책 검사 — 명령(setPricePolicy)과 불러오기가 같은 규칙을 쓴다. 오류 문장 또는 null */
export function policyError(q: Partial<PricePolicy>): string | null {
  const { min, max, target } = q;
  for (const [k, v] of [['최소', min], ['최대', max], ['목표', target]] as const) {
    if (v != null && !(Number.isFinite(v) && v >= POLICY_FACTOR_LIMITS.min && v <= POLICY_FACTOR_LIMITS.max)) return `${k} 배수는 ${POLICY_FACTOR_LIMITS.min}~${POLICY_FACTOR_LIMITS.max} 사이여야 합니다`;
  }
  if (min != null && max != null && min > max) return '최소 배수가 최대 배수보다 큽니다';
  if (target != null && ((min != null && target < min) || (max != null && target > max))) return '목표 배수가 범위 밖입니다';
  return null;
}

const round100 = (x: number) => Math.max(100, Math.round(x / 100) * 100);

/**
 * 판매 직전 실행 (틱 5단계 — step.ts phaseSales). 공유 스냅샷: 모든 결정을 먼저 구하고 한꺼번에 적용한다(S6).
 * `only`가 있으면 그 제품만(정책을 고른 순간 한 번 정할 때 — 다른 제품 값은 그대로).
 * 옛 판(autoPrice만, pricePolicy 없음)은 #200과 같은 값이 나오고 상태에 새 값을 쓰지 않는다 — 사유 기록(priceLog)만 결산에 남는다
 */
export function runPricePolicies(s: GameState, report: MonthReport | null, monthOfYear: number, only?: Set<string>): void {
  const picks: { p: Product; mode: PriceMode; d: { price: number; why: string } | null; unknown?: string }[] = [];
  for (const p of s.commerce.products) {
    const mode = priceModeOf(p);
    if (!mode || p.dutyFreeOnly || (only && !only.has(p.id))) continue;
    const raw = p.pricePolicy?.mode;
    picks.push({ p, mode, d: REGISTRY[mode]!(s, p, monthOfYear), ...(raw && raw !== mode ? { unknown: raw } : {}) });
  }
  const log: PriceLogEntry[] = [];
  for (const { p, mode, d, unknown } of picks) {
    if (!d) continue;
    let price = d.price;
    let why = d.why;
    const range = policyRange(p);
    const base = range || p.pricePolicy ? currentSuggested(s, p) : 0;
    if (range && base > 0) {
      const lo = round100(base * range.min), hi = round100(base * range.max);
      if (price < lo) { price = lo; why += ` · 범위 하한 ×${range.min}로 올림`; }
      if (price > hi) { price = hi; why += ` · 범위 상한 ×${range.max}로 내림`; }
    }
    if (unknown) why = `알 수 없는 정책 '${unknown}' — 현금회전으로 처리 · ${why}`;
    if (price !== p.price) log.push({ productId: p.id, mode, from: p.price, to: price, why });
    p.price = price;
    if (p.pricePolicy && base > 0) p.pricePolicy = { ...p.pricePolicy, lastFactor: Math.round((price / base) * 1000) / 1000 };
  }
  if (report && log.length) report.priceLog = [...(report.priceLog ?? []), ...log];
}

/** 불러올 때 정책 값 정리(⑧) — 범위 밖 배수는 한계로 자르고 mode는 그대로 둔다. 고친 것이 없으면 같은 객체 */
export function normalizePolicy(q: PricePolicy): PricePolicy {
  const clip = (v: number | undefined) => (v == null || !Number.isFinite(v) ? undefined : Math.min(POLICY_FACTOR_LIMITS.max, Math.max(POLICY_FACTOR_LIMITS.min, v)));
  const next: PricePolicy = { ...q };
  for (const k of ['min', 'max', 'target', 'lastFactor'] as const) { const v = clip(q[k]); if (v == null) delete next[k]; else next[k] = v; }
  if (next.min != null && next.max != null && next.min > next.max) [next.min, next.max] = [next.max, next.min];
  return JSON.stringify(next) === JSON.stringify(q) ? q : next;
}
