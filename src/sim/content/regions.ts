import demandData from '../../../data/market/base-demand.json';
import type { CaskTypeId, GameState, ProductCategory, RegionId, SpiritKind } from '../types';
import type { EventCategory } from './events';

// 국가 정의 (PRD §3.5 국가별 전략 정체성, §3.6 국가/산지 2단 구조 — 결정 #58).
// 국가 = 세제·GI·내수 시장·채널·B2B. 기후·물·원료·물류·고정비는 산지(content/sites.ts)에 있다.
// 세율·시장 규모는 [튜닝]·[확인 필요]. 게임 통화는 원화(KRW)로 통일한다.

interface DemandRecord { id: string; cases9L: number | null }
const records = (demandData as { records: DemandRecord[] }).records;
function casesOf(id: string): number {
  const rec = records.find((r) => r.id === id);
  if (!rec || rec.cases9L == null) throw new Error(`base-demand record not found: ${id}`);
  return rec.cases9L;
}

export interface MarketDef {
  /** 연간 기본 수요 (9L 케이스). 0이면 이 지역에서 팔 수 없음 */
  baseCases: number;
  baseSource: string;
  /** 소비자가 기준(원/L) — refAbv 도수 기준 */
  refConsumerPricePerL: number;
  /** 기준가의 도수. 도수가 높을수록 기준가가 (abv/refAbv)^0.7 배 */
  refAbv: number;
  elasticity: number;
  /** 단일 브랜드가 가져갈 수 있는 최대 점유율 */
  shareCap: number;
}

/** 전통주 주세 감면 (한국: 민속주·지역특산주) — 출고량 구간별 감면율 */
export interface TraditionalRelief {
  /** 연간 누적 출고량(L)이 uptoL 미만인 동안 relief 비율만큼 주세 감면 */
  tiers: { uptoL: number; relief: number }[];
  /** 전년 출고량이 이 값을 넘으면 감면 자격 상실 */
  eligibleMaxLastYearL: number;
  /** 온라인 직판(통신판매) 허용 → 유통 커버리지 가산 */
  onlineCoverage: number;
  label: string;
}

export interface CountryDef {
  id: RegionId;
  nameKo: string;
  /** 주세: 종가세율(출고가 대비) + 교육세(주세 대비), 종량세(원/LPA), 부가세.
   *  baseDeduction = 기준판매비율(한국) — 국산 주류 과세표준(출고가)에서 차감하는 비율, 카테고리별 */
  tax: { adValorem: number; education: number; specificPerLPA: number; vat: number; label: string; baseDeduction?: Partial<Record<ProductCategory, number>> };
  traditional?: TraditionalRelief;
  retailMarkup: number;
  /** 인건비 배수 (한국 = 1) */
  laborCost: number;
  /** 이 지역에서 생산 가능한 주종 (지리적 표시·문화권 규칙) */
  allowedKinds: SpiritKind[];
  market: Record<ProductCategory, MarketDef>;
  /** 카테고리 표시 이름 (지역 관용 명칭) */
  categoryNames?: Partial<Record<ProductCategory, string>>;
  seasonality: number[];
  /** 국내 블렌더가 자국산 원액에 더 주는 비율 */
  domesticSpiritPremium: number;
  /** 원액 B2B 시장 깊이 — 계약 제안 물량 배수 */
  bulkMarketDepth: number;
  eventWeights: Partial<Record<EventCategory, number>>;
  /** 매입(수입) 원액 비중에 대한 매력도 감점 계수 (일본: 재패니즈 위스키 표기 기준) */
  sourcedPenalty: number;
  /** 지역 특산 캐스크는 싸고, 다른 지역 캐스크는 비싸다 (산지 배수가 추가로 곱해진다) */
  caskPriceFactor: Partial<Record<CaskTypeId, number>>;
}

/** 호환용 별칭 — 기존 코드의 RegionDef는 이제 국가 정의다 */
export type RegionDef = CountryDef;

/**
 * 한국 기준판매비율 — 국세청 고시 제2026-23호 (소주 23.2%, 위스키 28.0%, 일반증류주 21.3%, 리큐르 22.7%, 브랜디 11.2%).
 * 국산 주류는 유통 이윤이 붙은 출고가에, 수입 주류는 그 전의 신고가에 과세돼 생기는 역차별을 줄이려고 과세표준에서 뺀다.
 * 게임 카테고리 매핑: 진·고량주·3년 미만 곡물 스피릿·기타 증류주 = 일반증류주 [튜닝]
 */
export const KR_BASE_DEDUCTION_2026: Partial<Record<ProductCategory, number>> = {
  soju_distilled: 0.232, whisky: 0.28, blended_whisky: 0.28, grain_whisky: 0.28, gin: 0.213, baijiu: 0.213, malt_spirit: 0.213, flavored_spirit: 0.213,
};
/**
 * 한국 세제 체계 스위치 — 결정 #61: 기준판매비율을 켜되, 한국은 "높은 주세 때문에 마진이 얇고 비싼 만큼 덜 팔리는" 시장으로 둔다.
 * 켜면 setKrBaseDeduction(true)가 ① 기준판매비율 ② 수입 주류 가격 경쟁 보정 ③ 고세율 시장 가격 민감도를 함께 적용한다.
 */
export const APPLY_KR_BASE_DEDUCTION = true;
/** 고세율 시장의 가격 민감도 — 한국 카테고리별 가격 탄력성 가산 [튜닝] */
export const KR_HIGH_TAX_ELASTICITY_ADD = 0.2;

const zero = (src: string): MarketDef => ({ baseCases: 0, baseSource: src, refConsumerPricePerL: 50_000, refAbv: 0.4, elasticity: 1.5, shareCap: 0 });

const krWhisky = casesOf('KR.whisky_total.imports.2024');
const jpWhisky = casesOf('JP.whisky_total.tax_volume.FY2024?');
const twWhisky = casesOf('TW.whisky_total.imports.2023');

export const REGIONS: Record<RegionId, CountryDef> = {
  KR: {
    id: 'KR',
    nameKo: '대한민국',
    tax: {
      adValorem: 0.72, education: 0.3, specificPerLPA: 0, vat: 0.1,
      label: '종가세 72% + 교육세(주세의 30%) + 부가세 10%',
      // baseDeduction(기준판매비율)·시장 보정은 아래 setKrBaseDeduction()이 적용한다
    },
    // 전통주 주세 감면 (2025년 시행령 개정): 증류주 전년 출고 500kL 이하면 자격, 처음 100kL 50%·100~200kL 30% 감면.
    // 전통주는 온라인 통신판매 허용 (일반 증류주는 택배 판매 불가)
    traditional: { tiers: [{ uptoL: 100_000, relief: 0.5 }, { uptoL: 200_000, relief: 0.3 }], eligibleMaxLastYearL: 500_000, onlineCoverage: 0.15, label: '전통주 주세 감면(100kL까지 50%·200kL까지 30%) + 온라인 직판' },
    retailMarkup: 1.35,
    laborCost: 1,
    allowedKinds: ['soju', 'gin', 'malt', 'grain', 'baijiu'],
    market: {
      soju_distilled: { baseCases: casesOf('KR.soju_distilled.domestic_release.2025'), baseSource: 'KR.soju_distilled (TASIS 2025)', refConsumerPricePerL: 40_000, refAbv: 0.25, elasticity: 1.6, shareCap: 0.2 },
      // 한국 진 시장은 작다 — 칵테일 바에서 제한적으로 쓰이는 정도 [결정 #45, 수치 튜닝]
      gin: { baseCases: 15_000, baseSource: '추정: 칵테일용 소규모 시장', refConsumerPricePerL: 32_000, refAbv: 0.43, elasticity: 2.2, shareCap: 0.2 },
      whisky: { baseCases: Math.round(krWhisky * 0.4), baseSource: 'KR.whisky_total × 40% (싱글 몰트 몫, 추정)', refConsumerPricePerL: 170_000, refAbv: 0.43, elasticity: 1.1, shareCap: 0.01 },
      blended_whisky: { baseCases: Math.round(krWhisky * 0.5), baseSource: 'KR.whisky_total × 50% (블렌디드 몫, 추정)', refConsumerPricePerL: 90_000, refAbv: 0.4, elasticity: 1.5, shareCap: 0.012 },
      grain_whisky: { baseCases: Math.round(krWhisky * 0.1), baseSource: 'KR.whisky_total × 10% (추정)', refConsumerPricePerL: 100_000, refAbv: 0.43, elasticity: 1.3, shareCap: 0.02 },
      // 중식당 중심의 고량주 시장 (수입 고량주 중심) [추정]
      baijiu: { baseCases: 350_000, baseSource: '추정: 고량주(중식당 중심)', refConsumerPricePerL: 25_000, refAbv: 0.34, elasticity: 1.8, shareCap: 0.05 },
      malt_spirit: { baseCases: 20_000, baseSource: '추정', refConsumerPricePerL: 70_000, refAbv: 0.46, elasticity: 1.3, shareCap: 0.3 },
      flavored_spirit: { baseCases: 50_000, baseSource: '추정', refConsumerPricePerL: 28_000, refAbv: 0.4, elasticity: 2.2, shareCap: 0.2 },
    },
    categoryNames: { baijiu: '고량주(백주)' },
    seasonality: [1.2, 1.15, 0.9, 0.9, 0.95, 0.9, 0.85, 0.9, 1.2, 1.0, 0.95, 1.2],
    domesticSpiritPremium: 0.25,
    bulkMarketDepth: 0.8,
    eventWeights: { market: 1.0, supply: 1.0, disaster: 1.2, regulation: 1.3, b2b: 0.8, opportunity: 1.0, people: 1.0 },
    sourcedPenalty: 0.15,
    caskPriceFactor: { korean_oak_quarter: 1.0, mizunara_hogshead: 1.6 },
  },
  JP: {
    id: 'JP',
    nameKo: '일본',
    // 증류주 20% 이상: kl당 20만 엔 + 1%마다 1만 엔 ≒ LPA당 1,000엔 [확인 필요]
    tax: { adValorem: 0, education: 0, specificPerLPA: 9_000, vat: 0.1, label: '종량세 약 9,000원/LPA (LPA당 약 1,000엔) + 소비세 10%' },
    retailMarkup: 1.3,
    laborCost: 1.25,
    allowedKinds: ['soju', 'gin', 'malt', 'grain'],
    market: {
      // 본격 쇼추: 거대하지만 저가·파편화 시장
      soju_distilled: { baseCases: casesOf('JP.shochu_honkaku.tax_volume.FY2024'), baseSource: 'JP.shochu_honkaku (국세청 과세수량 FY2024)', refConsumerPricePerL: 13_000, refAbv: 0.25, elasticity: 2.0, shareCap: 0.004 },
      // 크래프트 진이 이미 포화 — 신규 브랜드 점유 상한이 낮다 [추정]
      gin: { baseCases: 400_000, baseSource: '추정: 크래프트 진 붐 이후 시장(포화)', refConsumerPricePerL: 40_000, refAbv: 0.43, elasticity: 1.8, shareCap: 0.02 },
      // 재패니즈 싱글 몰트는 프리미엄이지만 물량은 작다(대부분 하이볼용 블렌디드). 크래프트 증류소 다수가 경쟁 [추정]
      // 일본은 세금이 가벼워 같은 술의 소비자가가 한국보다 훨씬 낮다 — 크래프트 3년 숙성 700ml ≒ ¥6,000~10,000 [추정]
      whisky: { baseCases: Math.round(jpWhisky * 0.04), baseSource: 'JP.whisky_total × 4% (싱글 몰트 몫, 추정)', refConsumerPricePerL: 110_000, refAbv: 0.43, elasticity: 1.0, shareCap: 0.01 },
      blended_whisky: { baseCases: Math.round(jpWhisky * 0.78), baseSource: 'JP.whisky_total × 78% (블렌디드·하이볼용, 추정)', refConsumerPricePerL: 28_000, refAbv: 0.4, elasticity: 2.0, shareCap: 0.003 },
      grain_whisky: { baseCases: Math.round(jpWhisky * 0.1), baseSource: 'JP.whisky_total × 10% (추정)', refConsumerPricePerL: 70_000, refAbv: 0.43, elasticity: 1.5, shareCap: 0.01 },
      baijiu: zero('일본에서는 생산 불가'),
      malt_spirit: { baseCases: 50_000, baseSource: '추정', refConsumerPricePerL: 60_000, refAbv: 0.46, elasticity: 1.3, shareCap: 0.3 },
      flavored_spirit: { baseCases: 200_000, baseSource: '추정', refConsumerPricePerL: 30_000, refAbv: 0.4, elasticity: 2.0, shareCap: 0.1 },
    },
    categoryNames: { soju_distilled: '본격 쇼추', whisky: '재패니즈 싱글 몰트' },
    seasonality: [1.05, 0.95, 1.0, 1.0, 1.0, 1.05, 1.15, 1.15, 0.95, 0.95, 1.0, 1.25],
    // 재패니즈 위스키 표기 기준(일본 내 증류·숙성) 이후 국산 원액이 귀하다
    domesticSpiritPremium: 0.35,
    bulkMarketDepth: 1.0,
    eventWeights: { market: 1.1, supply: 1.0, disaster: 1.4, regulation: 0.8, b2b: 1.1, opportunity: 1.0, people: 1.0 },
    sourcedPenalty: 0.5,
    caskPriceFactor: { mizunara_hogshead: 0.6, korean_oak_quarter: 1.6 },
  },
  TW: {
    id: 'TW',
    nameKo: '대만',
    // 증류주: 리터·도수당 NT$2.5 ≒ LPA당 NT$250 [확인 필요]
    tax: { adValorem: 0, education: 0, specificPerLPA: 10_750, vat: 0.05, label: '종량세 약 10,750원/LPA (LPA당 NT$250) + 영업세 5%' },
    retailMarkup: 1.35,
    laborCost: 0.8,
    allowedKinds: ['gin', 'malt', 'grain'],
    market: {
      soju_distilled: zero('대만에서는 생산 불가'),
      gin: { baseCases: 40_000, baseSource: '추정: 소규모 칵테일 시장', refConsumerPricePerL: 45_000, refAbv: 0.43, elasticity: 1.8, shareCap: 0.1 },
      // 싱글 몰트 애호 시장 — 자국 브랜드 수용도가 높다(카발란 선례). 점유 상한은 한국보다 약간 높게
      // 세금이 낮아 소비자가는 한국보다 낮다 — 카발란 클래식 700ml ≒ NT$1,500~2,000 [추정]
      whisky: { baseCases: Math.round(twWhisky * 0.6), baseSource: 'TW.whisky_total(2023) × 60% (싱글 몰트 몫, 추정)', refConsumerPricePerL: 110_000, refAbv: 0.46, elasticity: 1.0, shareCap: 0.012 },
      blended_whisky: { baseCases: Math.round(twWhisky * 0.35), baseSource: 'TW.whisky_total(2023) × 35% (추정)', refConsumerPricePerL: 40_000, refAbv: 0.4, elasticity: 1.6, shareCap: 0.01 },
      grain_whisky: { baseCases: Math.round(twWhisky * 0.05), baseSource: 'TW.whisky_total(2023) × 5% (추정)', refConsumerPricePerL: 70_000, refAbv: 0.43, elasticity: 1.3, shareCap: 0.02 },
      baijiu: zero('대만에서는 생산 불가 (결정 #41)'),
      malt_spirit: { baseCases: 20_000, baseSource: '추정', refConsumerPricePerL: 70_000, refAbv: 0.46, elasticity: 1.3, shareCap: 0.3 },
      flavored_spirit: { baseCases: 50_000, baseSource: '추정', refConsumerPricePerL: 35_000, refAbv: 0.4, elasticity: 1.8, shareCap: 0.15 },
    },
    seasonality: [1.25, 1.2, 0.9, 0.9, 0.95, 0.9, 0.85, 0.9, 1.15, 1.0, 0.95, 1.15],
    domesticSpiritPremium: 0.1,
    bulkMarketDepth: 0.5,
    eventWeights: { market: 1.3, supply: 1.0, disaster: 1.5, regulation: 0.7, b2b: 0.6, opportunity: 1.1, people: 1.0 },
    sourcedPenalty: 0.2,
    caskPriceFactor: { korean_oak_quarter: 1.6, mizunara_hogshead: 1.4 },
  },
};

// ── 한국 세제 체계 (결정 #61) ──
/** 보정 전 한국 시장 (기준판매비율 없이 v0.6에서 맞춘 값) */
const KR_MARKET_BASE: Record<ProductCategory, MarketDef> = structuredClone(REGIONS.KR.market);

/**
 * 수입 주류 가격 경쟁 보정 = 기준판매비율이 만든 출고가 여유를 소비자 기준가에서 되돌리는 배수.
 * 국산은 기준판매비율로 세 부담이 줄지만, 수입 주류는 여전히 유통 이윤이 빠진 신고가에 과세돼 매대 가격이 낮다
 * → 같은 소비자가에서 국산 출고가가 늘어나는 몫을 상쇄한다. 위스키 ×0.865, 소주 ×0.888, 일반증류주 ×0.897
 */
export function krImportCompetitionFactor(category: ProductCategory): number {
  const k = REGIONS.KR.tax.adValorem * (1 + REGIONS.KR.tax.education);
  return (1 + k * (1 - (KR_BASE_DEDUCTION_2026[category] ?? 0))) / (1 + k);
}

/** 한국 세제 체계 전환 — on: 기준판매비율 + 수입 경쟁 기준가 + 가격 민감도↑ / off: v0.6 체계 (밸런스 비교용) */
export function setKrBaseDeduction(on: boolean): void {
  const kr = REGIONS.KR;
  kr.tax.baseDeduction = on ? { ...KR_BASE_DEDUCTION_2026 } : undefined;
  kr.tax.label = on ? '종가세 72%(기준판매비율 차감 후 과세) + 교육세(주세의 30%) + 부가세 10%' : '종가세 72% + 교육세(주세의 30%) + 부가세 10%';
  for (const c of Object.keys(KR_MARKET_BASE) as ProductCategory[]) {
    const base = KR_MARKET_BASE[c];
    kr.market[c] = on
      ? { ...base, refConsumerPricePerL: Math.round(base.refConsumerPricePerL * krImportCompetitionFactor(c)), elasticity: base.elasticity + KR_HIGH_TAX_ELASTICITY_ADD }
      : { ...base };
  }
}
setKrBaseDeduction(APPLY_KR_BASE_DEDUCTION);

export const KOREA = REGIONS.KR;
export const COUNTRIES = REGIONS;

export function regionOf(s: Pick<GameState, 'regionId'>): CountryDef {
  return REGIONS[s.regionId] ?? REGIONS.KR;
}
export const countryOf = regionOf;

/** 도수 반영 기준 소비자가(원/L) */
export function refPricePerL(region: CountryDef, category: ProductCategory, abv: number): number {
  const m = region.market[category];
  return m.refConsumerPricePerL * Math.pow(abv / m.refAbv, 0.7);
}

/** 세금 계산 옵션: 카테고리(기준판매비율 적용), 전통주 감면율 */
export interface TaxOptions { category?: ProductCategory; relief?: number }

/** 과세표준 비율 = 1 − 기준판매비율 (카테고리를 모르면 차감 없음) */
export function taxBaseRatio(region: CountryDef, category?: ProductCategory): number {
  return 1 - (category ? region.tax.baseDeduction?.[category] ?? 0 : 0);
}

/** 병당 주세 (종가세 + 교육세 + 종량세) × (1 − 전통주 감면율) */
export function liquorTaxPerBottle(region: CountryDef, price: number, bottleMl: number, abv: number, opts: TaxOptions = {}): number {
  const lpa = (bottleMl / 1000) * abv;
  const gross = price * taxBaseRatio(region, opts.category) * region.tax.adValorem * (1 + region.tax.education) + region.tax.specificPerLPA * lpa;
  return gross * (1 - (opts.relief ?? 0));
}

/** 출고가 → 병당 소비자가 */
export function consumerPrice(region: CountryDef, price: number, bottleMl: number, abv: number, markupFactor = 1, opts: TaxOptions = {}): number {
  return (price + liquorTaxPerBottle(region, price, bottleMl, abv, opts)) * (1 + region.tax.vat) * region.retailMarkup * markupFactor;
}

/** 병당 소비자가 → 그 소비자가가 되는 출고가 (권장가 계산용) */
export function priceForConsumer(region: CountryDef, consumer: number, bottleMl: number, abv: number, opts: TaxOptions = {}): number {
  const lpa = (bottleMl / 1000) * abv;
  const keep = 1 - (opts.relief ?? 0);
  const beforeTax = consumer / ((1 + region.tax.vat) * region.retailMarkup) - region.tax.specificPerLPA * lpa * keep;
  return Math.max(100, beforeTax / (1 + taxBaseRatio(region, opts.category) * region.tax.adValorem * (1 + region.tax.education) * keep));
}

export function categoryName(region: CountryDef, category: ProductCategory, fallback: string): string {
  return region.categoryNames?.[category] ?? fallback;
}
