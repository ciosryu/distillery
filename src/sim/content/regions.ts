import demandData from '../../../data/market/base-demand.json';
import type { CaskTypeId, GameState, ProductCategory, RegionId, SpiritKind } from '../types';
import type { EventCategory } from './events';

// 지역 정의 (PRD §3.5 국가별 전략 정체성). 기후는 대표 산지 근사치, 세율·시장 규모는 [튜닝]·[확인 필요].
// 게임 통화는 원화(KRW)로 통일한다.

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

export interface RegionDef {
  id: RegionId;
  nameKo: string;
  /** 월별 평균 기온(°C)·상대습도(%), 1월~12월 */
  tempC: number[];
  humidity: number[];
  /** 주세: 종가세율(출고가 대비) + 교육세(주세 대비), 종량세(원/LPA), 부가세 */
  tax: { adValorem: number; education: number; specificPerLPA: number; vat: number; label: string };
  retailMarkup: number;
  overheadPerMonth: number;
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
  /** 지역 특산 캐스크는 싸고, 다른 지역 캐스크는 비싸다 */
  caskPriceFactor: Partial<Record<CaskTypeId, number>>;
}

const zero = (src: string): MarketDef => ({ baseCases: 0, baseSource: src, refConsumerPricePerL: 50_000, refAbv: 0.4, elasticity: 1.5, shareCap: 0 });

const krWhisky = casesOf('KR.whisky_total.imports.2024');
const jpWhisky = casesOf('JP.whisky_total.tax_volume.FY2024?');
const twWhisky = casesOf('TW.whisky_total.imports.2023');

export const REGIONS: Record<RegionId, RegionDef> = {
  KR: {
    id: 'KR',
    nameKo: '대한민국 (경기 내륙)',
    tempC: [-3, 0, 6, 13, 18, 23, 26, 26, 21, 14, 6, -1],
    humidity: [60, 58, 58, 60, 65, 72, 82, 80, 74, 68, 65, 62],
    tax: { adValorem: 0.72, education: 0.3, specificPerLPA: 0, vat: 0.1, label: '종가세 72% + 교육세(주세의 30%) + 부가세 10%' },
    retailMarkup: 1.35,
    overheadPerMonth: 10_000_000,
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
    nameKo: '일본 (간토 내륙)',
    tempC: [3, 4, 8, 13, 18, 21, 25, 26, 22, 16, 10, 5],
    humidity: [52, 52, 58, 63, 68, 76, 78, 76, 76, 72, 66, 56],
    // 증류주 20% 이상: kl당 20만 엔 + 1%마다 1만 엔 ≒ LPA당 1,000엔 [확인 필요]
    tax: { adValorem: 0, education: 0, specificPerLPA: 9_000, vat: 0.1, label: '종량세 약 9,000원/LPA (LPA당 약 1,000엔) + 소비세 10%' },
    retailMarkup: 1.3,
    overheadPerMonth: 12_000_000,
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
    nameKo: '대만 (이란현)',
    tempC: [16, 16, 18, 21, 25, 27, 29, 29, 27, 24, 21, 17],
    humidity: [83, 84, 83, 82, 82, 82, 78, 79, 80, 82, 83, 82],
    // 증류주: 리터·도수당 NT$2.5 ≒ LPA당 NT$250 [확인 필요]
    tax: { adValorem: 0, education: 0, specificPerLPA: 10_750, vat: 0.05, label: '종량세 약 10,750원/LPA (LPA당 NT$250) + 영업세 5%' },
    retailMarkup: 1.35,
    overheadPerMonth: 7_000_000,
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

export const KOREA = REGIONS.KR;

export function regionOf(s: Pick<GameState, 'regionId'>): RegionDef {
  return REGIONS[s.regionId] ?? REGIONS.KR;
}

/** 도수 반영 기준 소비자가(원/L) */
export function refPricePerL(region: RegionDef, category: ProductCategory, abv: number): number {
  const m = region.market[category];
  return m.refConsumerPricePerL * Math.pow(abv / m.refAbv, 0.7);
}

/** 병당 주세 (종가세 + 교육세 + 종량세) */
export function liquorTaxPerBottle(region: RegionDef, price: number, bottleMl: number, abv: number): number {
  const lpa = (bottleMl / 1000) * abv;
  return price * region.tax.adValorem * (1 + region.tax.education) + region.tax.specificPerLPA * lpa;
}

/** 출고가 → 병당 소비자가 */
export function consumerPrice(region: RegionDef, price: number, bottleMl: number, abv: number, markupFactor = 1): number {
  return (price + liquorTaxPerBottle(region, price, bottleMl, abv)) * (1 + region.tax.vat) * region.retailMarkup * markupFactor;
}

/** 병당 소비자가 → 그 소비자가가 되는 출고가 (권장가 계산용) */
export function priceForConsumer(region: RegionDef, consumer: number, bottleMl: number, abv: number): number {
  const lpa = (bottleMl / 1000) * abv;
  const beforeTax = consumer / ((1 + region.tax.vat) * region.retailMarkup) - region.tax.specificPerLPA * lpa;
  return Math.max(100, beforeTax / (1 + region.tax.adValorem * (1 + region.tax.education)));
}

export function categoryName(region: RegionDef, category: ProductCategory, fallback: string): string {
  return region.categoryNames?.[category] ?? fallback;
}
