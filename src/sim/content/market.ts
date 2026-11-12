import type { EquipmentDef } from './production';
import type { ProductCategory } from '../types';

// 시장 콘텐츠 (파트 MKT, 결정 #144) — 패키징·마진 구조(병입 인건비·유통)·원액 B2B·비지터 센터 설비. 모든 수치 [튜닝]

// ── 패키징 ──
/** 600ml = 대만 고량주 표준 병 */
export const BOTTLE_SIZES = [375, 500, 600, 700] as const;
export type BottleMl = (typeof BOTTLE_SIZES)[number];

export const PACKAGING: Record<string, { nameKo: string; costBySize: Record<BottleMl, number>; luxury: number }> = {
  standard: { nameKo: '스탠다드 병 + 코르크', costBySize: { 375: 1500, 500: 2000, 600: 2400, 700: 2800 }, luxury: 1.0 },
  premium: { nameKo: '디캔터 + 케이스', costBySize: { 375: 6000, 500: 8000, 600: 9500, 700: 11000 }, luxury: 1.15 },
};

export function packagingCost(packagingId: string, bottleMl: number): number {
  const p = PACKAGING[packagingId];
  if (!p) return 0;
  return p.costBySize[bottleMl as BottleMl] ?? Math.round(p.costBySize[700] * (bottleMl / 700));
}

// ── 마진 구조 (PRD §9.5) — 병당 고정비가 저가 제품의 마진을 깎는다 [튜닝] ──
/** 병입 인건비·라인 비용 (병당) */
export const BOTTLING_LABOR_PER_BOTTLE = 500;
/** 유통: 채널 수수료(출고가 대비)와 병당 물류비 */
export const DISTRIBUTION = {
  channelFeeRate: 0.12,
  logisticsBySize: { 375: 300, 500: 350, 700: 400 } as Record<BottleMl, number>,
};
export function logisticsCost(bottleMl: number): number {
  return DISTRIBUTION.logisticsBySize[bottleMl as BottleMl] ?? Math.round(400 * (bottleMl / 700));
}

// ── 원액 B2B (PRD §8.6) [튜닝] ──
// 원액 구매자 목록은 content/names.ts (BUYERS)로 이동 — 실명/가상명 전환 지원
export const BULK = {
  /** 뉴메이크 몰트 기준가(원/LPA) */
  newMakeBase: 12_500,
  /** 숙성 1년당 가치 상승 */
  agePerYear: 0.2,
  /** 피트 원액 프리미엄 */
  peatPremium: 0.15,
  /** 현물 매입가(우리가 팔 때) = 기준가치 × bid, 브로커 판매가(우리가 살 때) = × ask */
  bid: 0.85,
  ask: 1.25,
  /** 계약가 = 기준가치 × contract (현물보다 높지만 고정) */
  /** v1.3(#77): 0.9 → 1.1 — 장기 계약은 물량 보장 대가로 현물 기준가보다 비싸다 */
  contract: 1.1,
  /** 계약 기간 프리미엄: 24개월 +4%, 36개월 +8% */
  termPremiumPer12: 0.04,
  /** 선급금을 받으면 단가 할인 */
  prepayDiscount: 0.05,
  /** 미납 1 LPA당 위약금 = 계약가 × penaltyRate */
  penaltyRate: 0.3,
  maxActiveContracts: 5,
  /** 크래프트 프리미엄 계약(#78): 생산 능력의 10~20%, 단가 ×1.5, 최소 품질 40~46 */
  craftPriceFactor: 1.5,
  craftChance: 0.3,
  /** 그레인 뉴메이크 기준가(원/LPA) — 대량·저가 */
  grainNewMakeBase: 7_000,
  grainAgePerYear: 0.12,
  /** 그레인 현물 시장 포화(#81) — 깊이는 지역별(RegionDef.grainSpotDepthLPA). 그레인 원액은 대형 블렌더가 자체 증류소에서
   *  만들어 외부 구매자가 적다. 몰트 현물(브로커) 시장은 깊어서 포화 없음.
   *  현물 판매량 기억의 월 감쇠 — 시장이 물량을 소화하는 속도 */
  spotDecay: 0.6,
};

/** 비지터 센터 설비 (EQUIPMENT 항목) */
export const VISITOR_EQUIPMENT: Record<string, EquipmentDef> = {
  // ── 비지터 센터 ──
  visitor_basic: { id: 'visitor_basic', kind: 'visitor', nameKo: '비지터 센터 — 베이직 투어', cost: 80_000_000, leadMonths: 4, maintenance: 3_000_000, tier: 1, visitorsPerMonth: 600, spendPerVisitor: 15_000, buzzQuality: 0.6 },
  // 결정 #92: VIP·레스토랑은 소수 고객 상품 — v1.4 수치(VIP 월 400명 × 6만 원)는 관광 배수가 높은 입지에서 본업보다 많이 벌어(오사카·교토 순자산 54억) 방문객·객단가를 낮췄다 [튜닝]
  visitor_vip: { id: 'visitor_vip', kind: 'visitor', nameKo: '비지터 센터 — VIP 테이스팅 라운지', cost: 200_000_000, leadMonths: 6, maintenance: 4_000_000, tier: 2, visitorsPerMonth: 150, spendPerVisitor: 50_000, buzzQuality: 1.2, requires: 'visitor_basic' },
  visitor_restaurant: { id: 'visitor_restaurant', kind: 'visitor', nameKo: '비지터 센터 — 레스토랑 결합형', cost: 500_000_000, leadMonths: 9, maintenance: 8_000_000, tier: 3, visitorsPerMonth: 300, spendPerVisitor: 40_000, buzzQuality: 1.5, requires: 'visitor_vip' },
  // 기프트 샵 ([결정 #234], 오너 승인 2026-11-10 — B안): 방문객은 늘지 않는다. 뉴메이크 소포장 구매율을 올리고 굿즈 수입을 더한다(tourism.ts)
  visitor_giftshop: { id: 'visitor_giftshop', kind: 'visitor', nameKo: '비지터 센터 — 기프트 샵', cost: 20_000_000, leadMonths: 1, maintenance: 500_000, tier: 1, visitorsPerMonth: 0, spendPerVisitor: 0, buzzQuality: 0, requires: 'visitor_basic', note: '뉴메이크 소포장(방문객 구매율 10% → 25%, 탱크 몰트·그레인 원액을 쓴다) · 티셔츠·로고 글렌캐런 잔(방문객 1인 순수입 4,000원) — 방문객은 늘지 않는다' },
};

/** 기프트 샵 효과 ([결정 #234]) [튜닝] — 뉴메이크 소포장 구매율(기본 NEW_MAKE_BOTTLE.buyRate 10%를 대체)과 굿즈 1인 순수입 */
export const GIFT_SHOP = { id: 'visitor_giftshop', newMakeBuyRate: 0.25, merchPerVisitor: 4_000 };

// ── 같은 카테고리 제품끼리 수요 나눔 (PRD §9.2, §15.3 #12 → 결정 #154) [튜닝] ──
/**
 * CES 지수 ρ — 같은 카테고리 제품들의 총수요 = (Σ 단독 수요^ρ)^(1/ρ).
 * 똑같은 제품 n개면 총수요 n^(1/ρ)배: ρ = 2 → √n(옛 공식과 같음), ρ = 3 → ∛n, ρ → ∞ → 늘지 않음.
 * 약한 제품을 하나 더 내도 총수요가 거의 늘지 않고 강한 제품의 몫도 거의 안 깎인다(몫 ∝ 단독 수요^ρ)
 */
export const SKU = {
  /** ρ = 3 ([결정 #154]). B1-6의 3 → 4는 넣지 않는다([결정 #307] — 10시드 샌드박스에서 다 SKU 판 파산을 늘렸다. KR 9 → 16) */
  rho: 3,
  /** 브랜드 라인 사이 ρ ([결정 #235] B, PRD §11.2.1) — ρ_in(=rho)보다 작아야 브랜드끼리 덜 뺏는다 */
  rhoBrand: 2,
  /**
   * 국내 점유 상한 배수 ([결정 #290] B1-6, [결정 #307] — ×1.08만, ρ는 3 그대로) — 모든 국내 수요에 곱한다. 1 SKU 판의 생존을 받친다
   * (계열당 1제품 파산 standard 10 → 4/10 · micro 2 → 0/10). 1.08 시작값 `[튜닝]`. 모든 지역 국내 시장에 같이 건다. 수출·면세는 그대로
   */
  domesticShareCap: 1.08,
};

// ── 기본 정책 배수 n ([결정 #290] B1-4 · [결정 #291] ④, P-PROD-53) [튜닝] ──
/** 세 가격 정책의 시작 배수 = C(가격 유지) 기본 목표. 기준가(권장가 식 suggestedPrice — 기대가 기반) 대비 */
export const DEFAULT_POLICY_N = 1.3;
/**
 * 기본 정책 가격 = 기준가 × n, 100원 단위 — 판매 화면 "권장" 버튼 · 새 제품 첫 값(executeBlend의 firstPriceFactor) · 병입 미리보기 · 생산 경제성 표가 이것만 부른다(한 함수).
 * 면세 한정판(dutyFreeSuggestedPrice)은 n을 걸지 않는다 — 정책·자동 가격이 건너뛰고 채널·수요 식이 따로다
 */
export const defaultPolicyPrice = (base: number, n: number = DEFAULT_POLICY_N): number => Math.max(100, Math.round((base * n) / 100) * 100);

// ── 향미 방향 항 f2 "스타일 = 플레이어 선택" ([결정 #290] B1-9, GAME-01 · mkt-stage-t.md 「B1-MKT-1」) [가설] ──
/**
 * 몰트 위스키 매력도 × 피트 배수 × 통 배수 — 시장(국내 지역·수출 시장)마다 가중.
 * 피트 배수 = 1 + peatShare × (peat − 1) · 통 배수 = Σ 통 계열 비중 × 가중 + 나머지(ex-버번·탱크) × 1.
 * **기본 레시피(언피트 × ex-버번) = 모든 시장 ×1** — 표에 없는 통·시장은 1. 결정 #290은 방향과 구조만 승인, 수치는 `[가설]` 시작값(조사·단계 T 튜닝).
 * 시장마다 1보다 큰 칸이 하나 이상, 이기는 조합이 갈리게 골랐다(PROD 조건). JP 미즈나라 1.10은 인센스 프리미엄과 겹치면 큰 쪽 하나만 쓴다(STYLE.capWithTrend 옆 규칙)
 */
export const STYLE_WEIGHTS: Record<string, { peat: number; casks: Partial<Record<string, number>> }> = {
  KR: { peat: 0.92, casks: { oloroso_butt: 1.04, korean_oak_quarter: 1.08, mizunara_hogshead: 1.0 } },
  JP: { peat: 1.0, casks: { oloroso_butt: 1.05, korean_oak_quarter: 0.95, mizunara_hogshead: 1.1 } },
  TW: { peat: 0.93, casks: { oloroso_butt: 1.12, korean_oak_quarter: 0.95, mizunara_hogshead: 1.03 } },
  UK: { peat: 1.12, casks: { oloroso_butt: 1.04, korean_oak_quarter: 0.92, mizunara_hogshead: 1.0 } },
  EU: { peat: 1.08, casks: { oloroso_butt: 1.06, korean_oak_quarter: 0.93, mizunara_hogshead: 1.02 } },
  US: { peat: 0.97, casks: { oloroso_butt: 1.0, korean_oak_quarter: 1.06, mizunara_hogshead: 1.03 } },
  CN: { peat: 0.9, casks: { oloroso_butt: 1.1, korean_oak_quarter: 1.0, mizunara_hogshead: 1.04 } },
  DF: { peat: 0.97, casks: { oloroso_butt: 1.05, korean_oak_quarter: 1.02, mizunara_hogshead: 1.06 } },
  SEA: { peat: 0.94, casks: { oloroso_butt: 1.08, korean_oak_quarter: 0.98, mizunara_hogshead: 1.03 } },
};
/** 구조 규칙(결정 #290 B1-9): 스타일 보너스 × 향미 트렌드 ≤ capWithTrend — 트렌드만으로 넘는 몫은 그대로 두고, 스타일 보너스(>1)만 줄인다 */
export const STYLE = { capWithTrend: 1.5 };

// ── 럭셔리 지수 · 브랜드 방패 ([결정 #235] A, PRD §11.2 ①~③ 최소 구현 · §11.2.1) [튜닝] ──
/**
 * 제품 럭셔리 L_p(0~100) = 패키징(packaging.ts packagingLuxury 0~30, #248) + 숙성 표기 + 희소성 (라벨 속성은 연구 — 아직 0), 품질 게이트 L_p ≤ 품질.
 * 브랜드 B_b = alpha × 최근 windowMonths개월 판매 병수 가중 평균 L_p + (1 − alpha) × 같은 기간 최고 L_p.
 * 매력도 ×= 1 + kappa × beta × (B_b − L_p) / 100 — 세컨드 브랜드가 열리는 모드에서만(MVP는 #219로 잠겨 피할 수단이 없다)
 */
export const BRAND_LUXURY = {
  /** 프리셋별 패키징 점수 — 참고값. 계산은 packaging.ts packagingLuxury(#248)가 하고, production.test가 두 값이 같은지 맞춰 본다 */
  packaging: { standard: 0, premium: 30 } as Record<string, number>,
  whiskyPerYear: 5, whiskyCap: 25,
  agedWhitePerYear: 5, agedWhiteCap: 15,
  rare: 15,
  alpha: 0.6, beta: 0.3, kappa: 1, windowMonths: 12,
};

// ── 브랜드 라인 — 세컨드 브랜드 (PRD §11.2 ④, 결정 #51~#55 → 결정 #155) [튜닝] ──
export const BRANDS = {
  /** 개설비 — 상표 출원·브랜드 디자인 (원) */
  openCost: 20_000_000,
  /** 세컨드 브랜드 월 유지비 — 브랜드 관리·별도 판촉물 (원). 마케팅비는 따로 */
  monthlyUpkeep: 500_000,
  /** 브랜드 연계 계수 s — 개설 시 하우스 인지도의 s배에서 시작, 성장도 서로 s만큼 나눠 받는다 (#52·#53) */
  spillover: 0.5,
  /** 이미 판 제품을 다른 브랜드로 옮길 때 — 고정비 + 남은 재고 병당 라벨 교체 (아직 안 판 제품은 무료) */
  rebrandFixed: 2_000_000,
  rebrandPerBottle: 300,
  maxNameLength: 20,
};

// ── 가격 반응 곡선 (PRD §9.2 → 결정 #198) [튜닝] ──
/**
 * k — 국소 탄력성이 (소비자가 / 기대 소비자가)^k로 변한다. k = 1이면 기대가의 2배에서 탄력성 2배, 절반에서 절반.
 * 기대가에서는 옛 공식과 값·기울기가 같다. k = 0이면 옛 공식(어디서나 같은 탄력성)
 */
export const PRICE_CURVE = { k: 1 };

// ── 숙성 소주 표기 ([결정 #217], 오너 승인 2026-11-09 — A안: 매력도·기대가 모두, 최대 3년, 6개월 이상) [튜닝] ──
/**
 * 옹기·오크에서 숙성한 화이트 스피릿(증류식 소주·고량주)의 숙성 표기 효과 — 위스키 숙성 인식(agePerception)과 같은 자리에 곱한다.
 * 섞은 원액이 모두 같은 용기에서 minMonths 이상 숙성했을 때만(제품의 최저 오크 개월·최저 옹기 개월 중 큰 쪽). 진은 제외
 */
export const AGED_WHITE = { categories: ['soju_distilled', 'baijiu'] as readonly ProductCategory[], minMonths: 6, ratePerYear: 0.08, capYears: 3 };

/** 숙성 소주 표기 배수 — 대상이 아니거나 minMonths 미만이면 1, 그 위로 1 + 0.08 × 연수(개월/12, 최대 3년 → 1.24) */
export function agedWhitePerception(category: ProductCategory, oakMonths: number | undefined, restMonths: number | undefined): number {
  if (!AGED_WHITE.categories.includes(category)) return 1;
  const months = Math.max(oakMonths ?? 0, restMonths ?? 0);
  if (months < AGED_WHITE.minMonths) return 1;
  return 1 + AGED_WHITE.ratePerYear * Math.min(months / 12, AGED_WHITE.capYears);
}
