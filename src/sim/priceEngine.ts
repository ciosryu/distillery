import { AUTO_PRICE_MAX_ROUNDS } from './economics';
import { decidePolicyPrice, PRICE_POLICY, type PolicySpec } from './pricePolicy';
import type { GameState, MonthReport, PriceLogEntry, PricePolicy, Product } from './types';

// 자동 가격 3정책 실행 엔진 (코어 ARCH — [결정 #291], architecture §10.9 ④). 정책 함수(목표함수·정책 가드·범위)는 MKT `pricePolicy.ts`.
// 흐름: 플레이어 정책(Product.autoPrice + pricePolicy?) → 판매 직전(틱 5단계) **공유 스냅샷**으로 모든 제품의 결정을 먼저 구한다(S6)
//   → 한꺼번에 적용 → lastFactor 저장(그릇이 있을 때만) → 사유 한 줄(MonthReport.priceLog). 정책을 켜지 않은 판은 아무것도 바꾸지 않는다

export type PriceModeId = PricePolicy['mode'];
export const PRICE_MODE_IDS: readonly PriceModeId[] = ['turnover', 'profit', 'premium'];
export const PRICE_MODE_LABEL: Record<PriceModeId, string> = { turnover: 'A 현금회전', profit: 'B 이익', premium: 'C 가격 유지' };
/** 플레이어가 정할 수 있는 배수의 바깥 한계 — MKT 범위 기본값과 같다 */
export const POLICY_FACTOR_LIMITS = { min: PRICE_POLICY.min, max: PRICE_POLICY.max } as const;

/** 이 제품의 정책 — 꺼져 있으면 null. 옛 세이브(autoPrice만)·알 수 없는 mode는 A로 읽는다(엣지 ⑧ — 그릇의 값은 지우지 않는다) */
export function priceModeOf(p: Product): PriceModeId | null {
  if (!p.autoPrice) return null;
  const m = p.pricePolicy?.mode;
  return m && PRICE_MODE_IDS.includes(m) ? m : 'turnover';
}

/** 정책 검사 — 명령(setPricePolicy)이 쓴다. 오류 문장 또는 null */
export function policyError(q: Partial<PricePolicy>): string | null {
  const { min, max, target } = q;
  for (const [k, v] of [['최소', min], ['최대', max], ['목표', target]] as const) {
    if (v != null && !(Number.isFinite(v) && v >= POLICY_FACTOR_LIMITS.min && v <= POLICY_FACTOR_LIMITS.max)) return `${k} 배수는 ${POLICY_FACTOR_LIMITS.min}~${POLICY_FACTOR_LIMITS.max} 사이여야 합니다`;
  }
  if (min != null && max != null && min > max) return '최소 배수가 최대 배수보다 큽니다';
  if (target != null && ((min != null && target < min) || (max != null && target > max))) return '목표 배수가 범위 밖입니다';
  return null;
}

/**
 * 판매 직전 실행 (틱 5단계 — step.ts phaseSales). 수렴([결정 #298]) — 한 회차 = 켠 제품 모두가 같은 진열(앞 회차 결과)을 보고
 * `decidePolicyPrice`로 정한 뒤 한꺼번에 적용(공유 스냅샷, S6). 값이 더 바뀌지 않을 때까지 최대 `AUTO_PRICE_MAX_ROUNDS`(3)회,
 * 3회째에도 바뀌면 3회째 값으로 끝낸다(economics.applyAutoPrices와 같은 틀 — 옛 판 A는 그것과 바이트 동일).
 * **가드 기준은 회차 사이에 고정한다** — 모든 회차가 그달 시작의 `lastFactor`를 쓰고, 확정된 값으로만 `lastFactor`를 갱신한다(B 한 달 한 단계가 회차마다 쌓이지 않게).
 * `only`가 있으면 그 제품만(정책을 고른 순간 한 번 정할 때 — 다른 제품 값은 그대로).
 * 옛 판(autoPrice만, 그릇 없음)은 상태에 새 값을 쓰지 않는다 — 사유(priceLog)만 결산에 남는다
 */
export function runPricePolicies(s: GameState, report: MonthReport | null, monthOfYear: number, only?: Set<string>): void {
  const live = s.commerce.products.filter((p) => { const m = priceModeOf(p); return m && (!only || only.has(p.id)); });
  if (!live.length) return;
  const start = new Map(live.map((p) => [p.id, p.price]));
  const specs = new Map(live.map((p) => [p.id, { ...(p.pricePolicy ?? {}), mode: priceModeOf(p)! } as PolicySpec])); // 그달 시작의 lastFactor로 고정
  const last = new Map<string, { factor: number | null; why: string }>();
  for (let round = 1; round <= AUTO_PRICE_MAX_ROUNDS; round++) {
    const picks = live.map((p) => [p, decidePolicyPrice(s, p, specs.get(p.id)!, monthOfYear)] as const);
    let changed = false;
    for (const [p, d] of picks) {
      last.set(p.id, { factor: d.factor ?? last.get(p.id)?.factor ?? null, why: d.why }); // 값을 안 바꾼 회차는 앞 회차의 배수를 이어 쓴다
      if (d.price != null && d.price !== p.price) { p.price = d.price; changed = true; }
    }
    if (!changed) break;
  }
  const log: PriceLogEntry[] = [];
  for (const p of live) {
    const mode = priceModeOf(p)!;
    const raw = p.pricePolicy?.mode;
    const d = last.get(p.id)!;
    const why = raw && raw !== mode ? `알 수 없는 정책 '${raw}' — 현금회전으로 처리 · ${d.why}` : d.why;
    const from = start.get(p.id)!;
    if (p.price !== from) log.push({ productId: p.id, mode, from, to: p.price, why });
    if (p.pricePolicy && d.factor != null) p.pricePolicy = { ...p.pricePolicy, lastFactor: d.factor };
  }
  if (report && log.length) report.priceLog = [...(report.priceLog ?? []), ...log];
}

/** 불러올 때 정책 값 정리(엣지 ⑧) — 범위·목표 배수가 한계 밖이면 자르고, 유한하지 않으면 지운다. mode는 그대로 둔다. 고친 것이 없으면 같은 객체 */
export function normalizePolicy(q: PricePolicy): PricePolicy {
  const clip = (v: number | undefined) => (v == null || !Number.isFinite(v) ? undefined : Math.min(POLICY_FACTOR_LIMITS.max, Math.max(POLICY_FACTOR_LIMITS.min, v)));
  const next: PricePolicy = { ...q };
  for (const k of ['min', 'max', 'target'] as const) { const v = clip(q[k]); if (v == null) delete next[k]; else next[k] = v; }
  // lastFactor는 자르지 않는다 — A는 범위가 없으면 [0.6, 2] 밖 값(지금 값 후보)도 고르고 그 배수를 적는다. 유한하지 않을 때만 지운다
  if (q.lastFactor != null && !Number.isFinite(q.lastFactor)) delete next.lastFactor;
  if (next.min != null && next.max != null && next.min > next.max) [next.min, next.max] = [next.max, next.min];
  return JSON.stringify(next) === JSON.stringify(q) ? q : next;
}
