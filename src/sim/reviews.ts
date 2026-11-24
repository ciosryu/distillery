// F5d-2 (MKT) — 위스키베이스 리뷰로 병입 제품의 "아는 품질"을 좁힌다 (결정 #328 · #338, architecture §10.10 P-ARCH-59).
//
// 그릇(`Product.qualityKnown`)과 읽기(`knownProductQuality`)는 코어 `productView.ts`(ARCH F5d-1). 이 파일은 갱신만 한다.
// 리뷰는 **틱에서** 만든다(결정론) — 그달 팔린 제품마다 독립 스트림에서 글 수 · 커뮤니티를 뽑고, 위스키베이스 글의 점수를 참 품질 + 잡음으로 그린다.
// 점수 하나의 품질 읽기 = (점수 − 60) / 0.38. 갱신은 역분산 가중. 피드 화면의 위스키베이스 점수는 이 결과를 다시 보여 준다(어긋나지 않게)
import { rngFor } from './rng';
import { feedSignals, pickStyle, postCount, styleWeights } from './feed';
import { hidesProductQuality } from './productView';
import type { GameState, MonthReport, Product, QualityKnown } from './types';

/** 위스키베이스 점수 식 — `feed.ts writePost`와 같은 값(리뷰어 오차 ±3점, 50~98점) */
export const WB_SCORE = { base: 60, perQuality: 0.38, noise: 3, min: 50, max: 98 } as const;

/**
 * 리뷰 하나의 품질 읽기 오차(1σ) — 잡음은 정수 −3~3 균등(분산 4) + 반올림(분산 1/12) → 점수 sd ≈ 2.02 → 품질로 ÷ 0.38 ≈ 5.3.
 * (명세 초안의 4.6은 연속 균등으로 본 값 — 실제 식은 정수 잡음이라 조금 넓다)
 */
export const REVIEW_READ_SIGMA = Math.sqrt(4 + 1 / 12) / WB_SCORE.perQuality;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const round1 = (x: number) => Math.round(x * 10) / 10;

/** 참 품질과 잡음(정수)으로 위스키베이스 점수 */
export const wbScore = (quality: number, noise: number): number => clamp(Math.round(WB_SCORE.base + quality * WB_SCORE.perQuality + noise), WB_SCORE.min, WB_SCORE.max);
/** 점수 하나가 말해 주는 품질 */
export const reviewReading = (score: number): number => (score - WB_SCORE.base) / WB_SCORE.perQuality;

/** 리뷰 난수 스트림 키 — 제품 순번(`seq`, #504 원칙: 다른 id가 밀려도 안 바뀐다). 옛 제품은 id */
export const reviewStream = (p: Pick<Product, 'id' | 'seq'>): string => `review:${p.seq != null ? `#${p.seq}` : p.id}`;

/**
 * 한 제품 · 한 달의 위스키베이스 리뷰 점수들 — 글 수는 피드와 같은 식(`postCount`), 커뮤니티는 같은 비율(`styleWeights`)로 뽑고
 * 위스키베이스 글만 점수를 그린다. 상태 불변 · 같은 (seed, month, 제품)이면 같은 값
 */
export function drawWhiskybaseScores(s: Pick<GameState, 'seed'>, p: Product, g: Parameters<typeof postCount>[2], month: number): number[] {
  const rng = rngFor(s.seed, month, reviewStream(p));
  const n = postCount(rng, p, g, month);
  const w = styleWeights(p, g);
  const scores: number[] = [];
  for (let i = 0; i < n; i++) if (pickStyle(rng, w) === 'whiskybase') scores.push(wbScore(p.quality, rng.int(-WB_SCORE.noise, WB_SCORE.noise)));
  return scores;
}

/** 아는 품질에 리뷰 점수들을 더한다 — 역분산 가중. 오차가 0(참값을 앎)이면 값은 그대로, 리뷰 수만 센다 */
export function applyReviews(k: QualityKnown, scores: readonly number[], month: number): QualityKnown {
  if (!scores.length) return k;
  const reviews = k.reviews + scores.length;
  if (k.sigma <= 0) return { ...k, reviews, month };
  const p0 = 1 / k.sigma ** 2;
  const pr = 1 / REVIEW_READ_SIGMA ** 2;
  const prec = p0 + scores.length * pr;
  const est = (k.est * p0 + scores.reduce((t, sc) => t + reviewReading(sc), 0) * pr) / prec;
  return { ...k, est: round1(est), sigma: round1(1 / Math.sqrt(prec)), reviews, month };
}

/**
 * 틱 5(판매) 뒤 — 이번 달 팔린 제품의 위스키베이스 리뷰로 아는 품질을 좁힌다. 옛 판 · 아는 품질이 없는 제품(F5d 전, 공개) · 면세 전용(피드에 안 나옴 —
 * 짝 일반 제품의 추정을 읽기 함수가 빌려 온다)은 건너뛴다. `prev`는 지난달 결산(가격 변동 신호). 반환: 그달 점수(피드가 다시 보여 줄 것)
 */
export function updateProductKnowledge(s: GameState, report: Pick<MonthReport, 'sales'>, prev?: Pick<MonthReport, 'sales'>): { productId: string; scores: number[] }[] {
  if (!hidesProductQuality(s)) return [];
  const out: { productId: string; scores: number[] }[] = [];
  for (const sale of report.sales) {
    if (sale.bottles <= 0) continue;
    const p = s.commerce.products.find((x) => x.id === sale.productId);
    if (!p || p.dutyFreeOnly || !p.qualityKnown) continue;
    const g = feedSignals(s, p, sale, prev?.sales.find((x) => x.productId === p.id), s.month);
    const scores = drawWhiskybaseScores(s, p, g, s.month);
    if (!scores.length) continue;
    p.qualityKnown = applyReviews(p.qualityKnown, scores, s.month);
    out.push({ productId: p.id, scores });
  }
  return out;
}
