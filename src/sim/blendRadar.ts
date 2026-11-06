import { rngFor } from './rng';
import type { AxisId, Flavor, Hex, HexAxis, TargetSource } from './types';

// 블렌딩 레이더 미니게임 코어 — "The Art of Blending" (PRD 결정 #121, docs/design/blending-minigame.md)
//
// ① 육각형 6스탯은 36축 향미 모델의 "투영(view)"이다. 별도로 저장하는 스탯이 아니다 → 향미 수치의 출처는 하나로 유지된다.
// ② 투영은 선형이다 → 블렌드의 육각형 = 구성 원액 육각형의 알코올(LPA) 가중 평균.
//    그래서 만들 수 있는 맛은 "가진 캐스크 육각형들의 볼록 껍질(convex hull)" 안뿐이다 — 재고가 곧 전술 폭.
// ③ 실제 결과는 결정론이다(PRD #18 "확률은 결과가 아니라 정보에"). 불확실한 것은 블렌더가 "읽은" 원액 프로파일(지각)이다.
//    지각 오차는 캐스크·블렌더·샘플 횟수마다 고정 → 슬라이더를 움직여도 다시 굴려지지 않는다(세이브 스커밍 방지).
// 수치는 모두 [튜닝].

export const HEX_AXES: HexAxis[] = ['peat', 'fruit', 'floral', 'spicy', 'woody', 'sweet'];
export const HEX_LABEL: Record<HexAxis, string> = { peat: '피트', fruit: '과일', floral: '플로럴', spicy: '스파이시', woody: '우디', sweet: '스위트' };


/** 위스키 계열 투영 가중치 — 36축 → 6스탯. 진·소주는 주종별 육각형을 따로 둔다(설계 문서 §2.1 제안) */
export const HEX_PROJECTION: Record<HexAxis, Partial<Record<AxisId, number>>> = {
  peat: { peat_smoke: 1, earthy: 0.4 },
  fruit: { fresh_fruit: 0.6, tropical: 0.6, orchard: 0.6, dried_fruit: 0.7, citrus: 0.4, vinous: 0.5 },
  floral: { floral: 1, herbal: 0.5 },
  spicy: { wood_spice: 1, botanical_spice: 0.6 },
  woody: { oak_tannin: 0.8, incense: 0.8, nutty_rancio: 0.6 },
  sweet: { vanilla_caramel: 0.8, sweetness: 0.6 },
};

/** 36축 향미 → 육각형 (선형, 자르지 않음 — 화면에서만 0~100으로 자른다) */
export function hexOf(f: Flavor): Hex {
  const out = {} as Hex;
  for (const a of HEX_AXES) {
    let v = 0;
    for (const [axis, w] of Object.entries(HEX_PROJECTION[a]) as [AxisId, number][]) v += (f[axis] ?? 0) * w;
    out[a] = v;
  }
  return out;
}

/** 가중 평균 (가중치 = 알코올 LPA 비율). 투영이 선형이라 hexOf(블렌드 향미)와 같다 */
export function mixHex(parts: { hex: Hex; share: number }[]): Hex {
  const total = parts.reduce((t, p) => t + p.share, 0);
  const out = { peat: 0, fruit: 0, floral: 0, spicy: 0, woody: 0, sweet: 0 } as Hex;
  if (total <= 0) return out;
  for (const p of parts) for (const a of HEX_AXES) out[a] += (p.hex[a] * p.share) / total;
  return out;
}

// ───────────── 블렌더의 지각 (정보 불확실성, PRD §5.6) ─────────────

export interface BlenderSkill {
  /** 블렌더 id — 같은 캐스크라도 사람마다 읽는 값이 다르다 */
  id: string;
  level: number;
  /** 후각 스탯 0~100 */
  nose: number;
}

export const PERCEPTION = {
  /** 레벨 1·후각 0 블렌더의 축별 오차 표준편차(점) */
  baseSigma: 14,
  /** 레벨마다 오차가 줄어드는 비율 */
  perLevel: 0.15,
  minSigma: 1.5,
};

/** 캐스크 1개를 한 번 샘플링했을 때 축별 오차 σ — 레벨·후각이 높을수록 작다 */
export function perceptionSigma(b: BlenderSkill | null): number {
  if (!b) return PERCEPTION.baseSigma * 1.4; // 블렌더 없이 대표가 직접
  const sigma = (PERCEPTION.baseSigma * (1 - b.nose / 150)) / (1 + PERCEPTION.perLevel * (b.level - 1));
  return Math.max(PERCEPTION.minSigma, sigma);
}

/** 샘플을 더 뜰수록 오차가 1/√(1+n)로 준다 (샘플 비용·손실은 호출 측) */
export const sampledSigma = (b: BlenderSkill | null, samples: number) => perceptionSigma(b) / Math.sqrt(1 + Math.max(0, samples));

/**
 * 블렌더가 "읽은" 캐스크 육각형. 같은 (시드·캐스크·블렌더·샘플 수)면 항상 같은 값.
 * 샘플을 더 뜨면 새 값이 나오지만 오차 폭이 줄어든다.
 */
export function perceivedHex(actual: Hex, seed: number, caskId: string, blender: BlenderSkill | null, samples: number): Hex {
  const sd = sampledSigma(blender, samples);
  const r = rngFor(seed, 0, `perceive:${caskId}:${blender?.id ?? 'owner'}:${samples}`);
  const out = {} as Hex;
  for (const a of HEX_AXES) out[a] = Math.max(0, actual[a] + r.normal(0, sd));
  return out;
}

export interface VatComponent {
  /** 캐스크(또는 탱크 원액) id */
  id: string;
  /** 알코올(LPA) 기준 비율 — 합이 1이 아니어도 된다(정규화) */
  share: number;
  /** 실제 육각형 (숨김값) */
  actual: Hex;
  /** 지금까지 뜬 샘플 수 */
  samples: number;
}

export interface VatPreview {
  /** 블렌더가 예상하는 결과 */
  predicted: Hex;
  /** 예상의 축별 오차 폭(1σ) — 화면에 띠로 그린다. 섞는 캐스크가 많을수록 오차가 서로 상쇄돼 좁아진다 */
  band: number;
  /** 실제 결과 (확정 후 공개) */
  actual: Hex;
}

export function previewVat(parts: VatComponent[], seed: number, blender: BlenderSkill | null): VatPreview {
  const total = parts.reduce((t, p) => t + p.share, 0) || 1;
  const predicted = mixHex(parts.map((p) => ({ hex: perceivedHex(p.actual, seed, p.id, blender, p.samples), share: p.share })));
  const actual = mixHex(parts.map((p) => ({ hex: p.actual, share: p.share })));
  const band = Math.sqrt(parts.reduce((t, p) => t + ((p.share / total) * sampledSigma(blender, p.samples)) ** 2, 0));
  return { predicted, band, actual };
}

// ───────────── 목표 매칭 ─────────────


export interface BlendTarget {
  id: string;
  source: TargetSource;
  label: string;
  hex: Hex;
  /** 이 거리(가중 RMS, 점)에서 점수 약 61 — 작을수록 까다롭다. 평론가 의뢰는 좁고 트렌드는 넓다 */
  tolerance: number;
  /** 축별 중요도 (없으면 1) — "피트만큼은 정확히" 같은 의뢰 */
  weights?: Partial<Record<HexAxis, number>>;
  /** 이 달까지만 유효 (평론가 의뢰 마감) */
  expiresMonth?: number;
}

/** 가중 RMS 거리 */
export function hexDistance(a: Hex, b: Hex, weights: Partial<Record<HexAxis, number>> = {}): number {
  let sum = 0;
  let wsum = 0;
  for (const ax of HEX_AXES) {
    const w = weights[ax] ?? 1;
    sum += w * (a[ax] - b[ax]) ** 2;
    wsum += w;
  }
  return Math.sqrt(sum / (wsum || 1));
}

/** 일치 점수 0~100 = 100·exp(−½(d/허용)²) */
export function matchScore(hex: Hex, target: BlendTarget): number {
  const d = hexDistance(hex, target.hex, target.weights);
  return Math.round(100 * Math.exp(-0.5 * (d / target.tolerance) ** 2) * 10) / 10;
}
