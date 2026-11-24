// F5d — 병입 제품의 "아는 품질" (결정 #328 · #338, architecture §10.10 P-ARCH-59). 코어 · 순수 함수.
//
// 참 품질(`Product.quality`)은 시장 결과 엔진(market.ts)·판정(judgeWin)만 읽는다. 플레이어가 보는 값·추천·자동 가격은
// `knownProductQuality` **한 함수**만 읽는다(통 쪽 `knownReads`와 짝). 이 파일은 블렌딩을 불러오지 않는다(blending.ts가 이 파일을 부른다 — 순환 없음).
//
// #338 확인 3건: ① F5d 전에 병입한 제품(`qualityKnown` 없음)은 그대로 공개 ② 향미 카드는 병입 때 추정 육각형(`qualityKnown.hex`) — 없으면 "모름"
// ③ 핸드필은 그대로(가상 제품 — 이 파일과 무관) · 면세 전용 제품은 같은 달·같은 원액으로 만든 일반 제품의 추정을 함께 쓴다(짝이 없으면 자기 병입 추정)
import { mixHex } from './blendRadar';
import { usesObservedValuation, QHAT_PRIOR } from './valuation';
import type { GameState, Hex, Product, QualityKnown, SpiritKind } from './types';

/** 샘플 기록이 없는 몫의 품질 오차(1σ) `[튜닝]` — "모르고 병입했다"를 숫자로(명세 `[튜닝 15]`). 값은 단계 T */
export const UNKNOWN_QUALITY_SIGMA = 15;
/** [결정 #346] 같은 레시피 보충에서 이어받는 추정의 오차 하한 `[튜닝]` — 보충 원액이 이전과 조금 달라도 이 안(PROD 측정: 같은 제품 보충의 참 품질 변화 평균 3.0 · 중앙 2.4점) */
export const RESTOCK_PRIOR_SIGMA_FLOOR = 4;
/**
 * [결정 #377] 보충 원액에 제품 레시피 목록에 없던 원액이 섞이면 이어 받는 추정의 오차를 넓힌다 — 새 몫은 "모르는 원액"과 같은 오차로 본다 `[튜닝]`
 * (MKT 제안 2026-11-24: σ' = √(max(σ, 하한)² + (새 몫 × 이 값)²), 평균은 그대로)
 */
export const RESTOCK_NEW_RECIPE_SIGMA = UNKNOWN_QUALITY_SIGMA;
/** 보충 원액의 레시피별 알코올(LPA) — 레시피 기록이 없는 원액(매입 등)은 `recipeId` ''(어느 제품 목록에도 없다) */
export interface RecipeShare { recipeId: string; lpa: number }

/** 화면·추천·자동 가격이 읽는 품질 — `public`이면 참값(옛 판·F5d 전 제품), 아니면 추정 */
export interface KnownQuality {
  q: number;
  sigma: number;
  reviews: number;
  public: boolean;
  /** 향미 카드에 그릴 육각형 — 공개 제품은 참 육각형(`Product.hex`), 추정 제품은 병입 때 추정(없으면 "모름") */
  hex: Hex | null;
}

/** 이 판이 F5d(제품 품질 가리기)를 쓰는가 — 통·순자산의 관측 평가(F5b)와 같은 가드: 옛 판(legacy-v15)은 아니다 */
export const hidesProductQuality = (s: Pick<GameState, 'rulesVersion'>): boolean => usesObservedValuation(s);

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * 병입 한 배치의 아는 품질 — `estimateBlend` 결과(아는 원액만의 가중 평균 · 오차 · 모르는 몫)에 **모르는 몫은 사전값**(F5b `QHAT_PRIOR`, P25 자리)과
 * 큰 오차(`UNKNOWN_QUALITY_SIGMA`)를 섞는다. 아는 원액이 하나도 없으면 사전값 그대로. 탱크 원액은 참값을 안다(estimateBlend 규칙 — 오차 0)
 */
export function bottledQualityKnown(
  est: { quality: number | null; sigma: number; hex: Hex | null; unknownShare: number },
  kind: SpiritKind,
  month: number,
  /** [결정 #346] 같은 레시피 보충이면 그 제품의 지금 아는 품질(`restockPrior`) — 모르는 몫은 이것으로 채우고, 아는 몫은 이것과 정밀도 가중으로 결합한다 */
  carried?: { est: number; sigma: number },
  /**
   * 병입 단계 보정(희석 · 여과 · 섞을 때의 향미 상호작용)만큼의 차 — 샘플 · 사전값은 통 원액 하나의 품질이라, 병입 평가와 늘 어긋난다(통 블렌드 약 −3점,
   * MKT F5d 전후 표: 샘플을 켠 판이 끈 판보다 나빠짐). `bottlingOffset`(blending.ts)이 센다. 이어받은 추정(carried)은 이미 제품 품질이라 더하지 않는다
   */
  offset = 0,
): QualityKnown {
  const prior = carried ? carried.est : (QHAT_PRIOR[kind] ?? 45) + offset;
  const priorSd = carried ? Math.max(carried.sigma, RESTOCK_PRIOR_SIGMA_FLOOR) : UNKNOWN_QUALITY_SIGMA;
  if (est.quality == null) return { est: round1(prior), sigma: round1(priorSd), reviews: 0, month };
  const u = Math.min(1, Math.max(0, est.unknownShare));
  const k = 1 - u;
  // 아는 몫(샘플 추정 + 병입 보정량). [결정 #346 보완 — PM 2026-11-23] 같은 레시피 보충이면 샘플 있는 몫도 바꿔치기하지 않고
  // 이어 온 제품 추정과 정밀도(1/σ²) 가중으로 결합한다 — 샘플을 뜰수록 정보가 늘기만 하게(MKT 10시드: 덮어쓰면 샘플 켠 판이 끈 판보다 흔들렸다)
  let known = est.quality + offset;
  let knownSd = est.sigma;
  if (carried && knownSd > 0) {
    const wK = 1 / knownSd ** 2;
    const wC = 1 / priorSd ** 2;
    known = (known * wK + prior * wC) / (wK + wC);
    knownSd = Math.sqrt(1 / (wK + wC));
  }
  return {
    est: round1(k * known + u * prior),
    sigma: round1(Math.sqrt((k * knownSd) ** 2 + (u * priorSd) ** 2)),
    reviews: 0,
    month,
    ...(est.hex ? { hex: est.hex } : {}),
  };
}

/**
 * 재고 보충(수동·자동 납품) — 남은 재고와 새 배치를 **병 수로 가중**해 합친다(`restockedProduct`의 참 품질 평균과 같은 가중).
 * 남은 재고가 F5d 전 제품(아는 품질 없음 = 공개)이면 그 몫은 참값을 오차 0으로 안다. 오차는 두 몫이 독립이라고 보고 합친다.
 * 리뷰 수는 남은 재고 몫만큼 이어 간다(새 배치는 리뷰 0) — 리뷰 갱신(MKT F5d-2)이 이 값을 다시 좁힌다
 */
export function mergeQualityKnown(old: Pick<Product, 'quality' | 'qualityKnown' | 'stockBottles' | 'hex'>, batch: QualityKnown, batchBottles: number, month: number, sameRecipe = false): QualityKnown {
  const a = Math.max(0, old.stockBottles);
  const b = Math.max(0, batchBottles);
  const w = a + b > 0 ? b / (a + b) : 1;
  // [결정 #346] 같은 레시피 보충이면 리뷰 수는 "이 제품에 쌓인 리뷰"로 잇는다(재고가 바닥이어도) — 아니면 남은 재고 몫만큼
  const carriedReviews = sameRecipe ? (old.qualityKnown?.reviews ?? 0) : 0;
  if (w >= 1) return { ...batch, reviews: batch.reviews + carriedReviews, month };
  const o: QualityKnown = old.qualityKnown ?? { est: old.quality, sigma: 0, reviews: 0, month, ...(old.hex ? { hex: old.hex } : {}) };
  const hex = o.hex && batch.hex ? mixHex([{ hex: o.hex, share: 1 - w }, { hex: batch.hex, share: w }]) : undefined;
  return {
    est: round1((1 - w) * o.est + w * batch.est),
    sigma: round1(Math.sqrt(((1 - w) * o.sigma) ** 2 + (w * batch.sigma) ** 2)),
    reviews: sameRecipe ? o.reviews + batch.reviews : Math.round(o.reviews * (1 - w)),
    month,
    ...(hex ? { hex } : {}),
  };
}

/**
 * 보충 뒤 품질 미리보기 (PROD 요청 — `Bottling.tsx` 보충 줄의 혼합 식을 코어로) — 남은 재고의 품질(화면이 아는 값)과 새 배치(병입 때 추정 또는 참값)를
 * 병 수로 가중한다. 병입 행동의 실제 합치기(`mergeQualityKnown` · `restockedProduct`)와 같은 가중이라 미리보기와 결과가 어긋나지 않는다
 */
export function restockMix(before: { q: number; sigma: number }, beforeBottles: number, batch: { q: number; sigma: number }, batchBottles: number): { stock: number; w: number; q: number; sigma: number } {
  const a = Math.max(0, beforeBottles);
  const b = Math.max(0, batchBottles);
  const w = a + b > 0 ? b / (a + b) : 1;
  return { stock: a + b, w, q: before.q + (batch.q - before.q) * w, sigma: Math.sqrt(((1 - w) * before.sigma) ** 2 + (w * batch.sigma) ** 2) };
}

const sameList = (a?: readonly string[], b?: readonly string[]) => (a ?? []).join('|') === (b ?? []).join('|');

/**
 * 보충 원액 가운데 제품 레시피 목록에 없던 몫(LPA 비율 0~1) — 겹치는 레시피가 하나도 없거나 제품 목록이 비면 null(잇지 않는다).
 * 문자열 목록이면 레시피마다 같은 무게로 센다(옛 호출 · 시험 호환)
 */
export function newRecipeShare(target: Pick<Product, 'recipeIds'>, recipes: readonly string[] | readonly RecipeShare[]): number | null {
  const own = new Set(target.recipeIds ?? []);
  const shares = (recipes as readonly (string | RecipeShare)[]).map((r) => (typeof r === 'string' ? { recipeId: r, lpa: 1 } : r)).filter((x) => x.lpa > 0);
  const total = shares.reduce((t, x) => t + x.lpa, 0);
  if (!own.size || total <= 0) return null;
  const fresh = shares.reduce((t, x) => t + (own.has(x.recipeId) ? 0 : x.lpa), 0);
  return fresh >= total - 1e-12 ? null : fresh / total;
}

/**
 * [결정 #346 → #377] 보충에서 그 제품의 지금 아는 품질을 잇는다. `bottledQualityKnown`의 모르는 몫 사전값 · `mergeQualityKnown`의 리뷰 잇기에 쓴다.
 * (1) 보충 원액의 레시피가 제품 목록 안(부분집합)이면 그대로 잇는다(#346 — 오차 하한은 `bottledQualityKnown`이 건다)
 * (2) 겹치는 레시피가 있고 목록에 없던 원액도 섞이면 잇되 오차를 새 몫만큼 넓힌다(`RESTOCK_NEW_RECIPE_SIGMA` — 평균은 그대로)
 * (3) 겹치는 레시피가 없거나 제품에 레시피 기록이 없으면 undefined(전역 사전값 — 통 구성이 다른 술)
 */
export function restockPrior(s: Pick<GameState, 'rulesVersion' | 'commerce'>, target: Product, recipes: readonly string[] | readonly RecipeShare[]): { est: number; sigma: number; newShare: number } | undefined {
  const n = newRecipeShare(target, recipes);
  if (n == null) return undefined;
  const k = knownProductQuality(s, target);
  if (n <= 0) return { est: k.q, sigma: k.sigma, newShare: 0 };
  return { est: k.q, sigma: Math.sqrt(Math.max(k.sigma, RESTOCK_PRIOR_SIGMA_FLOOR) ** 2 + (n * RESTOCK_NEW_RECIPE_SIGMA) ** 2), newShare: n };
}

/**
 * 면세 전용 제품의 짝 (#338 ③(가)) — 같은 달에 같은 범주·같은 레시피 원액으로 병입한 **일반 제품**(면세 전용 아님) 중 아는 품질이 있는 것.
 * 여럿이면 리뷰가 많은 것 → id 순. 면세 전용 제품은 커뮤니티 피드에 나오지 않아 리뷰가 붙지 않으므로, 짝의 리뷰 추정을 빌린다
 */
export function dutyFreePair(s: Pick<GameState, 'commerce'>, p: Product): Product | null {
  if (!p.dutyFreeOnly) return null;
  const cands = s.commerce.products.filter((x) => x.id !== p.id && !x.dutyFreeOnly && x.qualityKnown && x.createdMonth === p.createdMonth && x.category === p.category && sameList(x.recipeIds, p.recipeIds));
  cands.sort((x, y) => (y.qualityKnown!.reviews - x.qualityKnown!.reviews) || x.id.localeCompare(y.id));
  return cands[0] ?? null;
}

/**
 * **화면·추천·자동 가격이 읽는 품질 — 이 함수 하나만** (F5d 읽기 계약). 옛 판이거나 아는 품질이 없으면(F5d 전 제품, #338 ①(가)) 참값을 공개.
 * 면세 전용 제품은 짝 일반 제품의 리뷰가 더 많으면 그 추정을 쓴다(#338 ③(가)) — 육각형은 자기 병입 추정 그대로
 */
export function knownProductQuality(s: Pick<GameState, 'rulesVersion' | 'commerce'>, p: Product): KnownQuality {
  if (!hidesProductQuality(s) || !p.qualityKnown) return { q: p.quality, sigma: 0, reviews: 0, public: true, hex: p.hex ?? null };
  const own = p.qualityKnown;
  const pair = dutyFreePair(s, p)?.qualityKnown;
  const k = pair && pair.reviews > own.reviews ? pair : own;
  return { q: k.est, sigma: k.sigma, reviews: k.reviews, public: false, hex: own.hex ?? null };
}
