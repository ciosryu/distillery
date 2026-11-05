import demandData from '../../../data/market/base-demand.json';
import type { ProductCategory } from '../types';
import type { EventCategory } from './events';

// 한국(MVP 시작 지역). 기후는 경기 내륙 기준 근사치 [튜닝].

interface DemandRecord { id: string; cases9L: number | null }
const records = (demandData as { records: DemandRecord[] }).records;
function casesOf(id: string): number {
  const rec = records.find((r) => r.id === id);
  if (!rec || rec.cases9L == null) throw new Error(`base-demand record not found: ${id}`);
  return rec.cases9L;
}

export interface RegionDef {
  id: 'KR';
  nameKo: string;
  /** 월별 평균 기온(°C), 1월~12월 */
  tempC: number[];
  /** 월별 평균 상대습도(%) */
  humidity: number[];
  /** 주세: 종가세율, 교육세(주세 대비), 부가세 */
  tax: { liquorRate: number; educationRate: number; vat: number };
  /** 출고가 → 소비자가 유통 마진 배수 */
  retailMarkup: number;
  /** 월 고정비(임대·전기·보험 등) */
  overheadPerMonth: number;
  /** 카테고리별 시장 */
  market: Record<ProductCategory, {
    /** 연간 기본 수요 (9L 케이스) */
    baseCases: number;
    baseSource: string;
    /** 소비자가 기준(원/L) — refAbv 도수 기준 */
    refConsumerPricePerL: number;
    /** 기준가의 도수. 도수가 높을수록 기준가가 (abv/refAbv)^0.7 배로 오른다 */
    refAbv: number;
    elasticity: number;
    /** 단일 브랜드가 가져갈 수 있는 최대 점유율 */
    shareCap: number;
  }>;
  /** 월별 수요 계절 계수 (1월~12월) */
  seasonality: number[];
  /** 국산 원액 프리미엄: 국내 블렌더가 자국산 원액에 더 주는 비율 */
  domesticSpiritPremium: number;
  /** 원액 B2B 시장 깊이 — 계약 제안 물량 배수 */
  bulkMarketDepth: number;
  /** 이벤트 범주별 발생 가중치 — 국가마다 다른 변동 성격 */
  eventWeights: Partial<Record<EventCategory, number>>;
}

export const KOREA: RegionDef = {
  id: 'KR',
  nameKo: '대한민국 (경기 내륙)',
  tempC: [-3, 0, 6, 13, 18, 23, 26, 26, 21, 14, 6, -1],
  humidity: [60, 58, 58, 60, 65, 72, 82, 80, 74, 68, 65, 62],
  tax: { liquorRate: 0.72, educationRate: 0.3, vat: 0.1 },
  retailMarkup: 1.35,
  overheadPerMonth: 10_000_000,
  market: {
    soju_distilled: { baseCases: casesOf('KR.soju_distilled.domestic_release.2025'), baseSource: 'KR.soju_distilled (TASIS 2025)', refConsumerPricePerL: 40_000, refAbv: 0.25, elasticity: 1.6, shareCap: 0.2 },
    // 데이터 공백: 한국 진 시장 절대량 미확보 → 임시 추정 [튜닝]
    // 진은 가격 결정권이 낮은 저가·대중 카테고리 (PRD §9.5 마진 사다리)
    gin: { baseCases: 120_000, baseSource: '임시 추정 (PRD §15-8)', refConsumerPricePerL: 32_000, refAbv: 0.43, elasticity: 2.2, shareCap: 0.2 },
    // 신생 브랜드가 흡수할 수 있는 위스키 수요는 제한적 → 초과 생산분은 B2B 벌크로 (PRD §8.6)
    whisky: { baseCases: Math.round(casesOf('KR.whisky_total.imports.2024') * 0.4), baseSource: 'KR.whisky_total × 40% (싱글 몰트 몫, 추정)', refConsumerPricePerL: 170_000, refAbv: 0.43, elasticity: 1.1, shareCap: 0.01 },
    // 한국 위스키 시장은 블렌디드 비중이 큼 → 그레인+몰트 블렌디드는 대중 시장 [튜닝]
    blended_whisky: { baseCases: Math.round(casesOf('KR.whisky_total.imports.2024') * 0.5), baseSource: 'KR.whisky_total × 50% (블렌디드 몫, 추정)', refConsumerPricePerL: 90_000, refAbv: 0.4, elasticity: 1.5, shareCap: 0.012 },
    grain_whisky: { baseCases: Math.round(casesOf('KR.whisky_total.imports.2024') * 0.1), baseSource: 'KR.whisky_total × 10% (싱글 그레인 등, 추정)', refConsumerPricePerL: 100_000, refAbv: 0.43, elasticity: 1.3, shareCap: 0.02 },
    malt_spirit: { baseCases: 20_000, baseSource: '임시 추정 [튜닝]', refConsumerPricePerL: 70_000, refAbv: 0.46, elasticity: 1.3, shareCap: 0.3 },
    flavored_spirit: { baseCases: 50_000, baseSource: '임시 추정 [튜닝]', refConsumerPricePerL: 28_000, refAbv: 0.4, elasticity: 2.2, shareCap: 0.2 },
  },
  // 설·추석·연말 성수기
  seasonality: [1.2, 1.15, 0.9, 0.9, 0.95, 0.9, 0.85, 0.9, 1.2, 1.0, 0.95, 1.2],
  // 국내 블렌더는 "국산" 표기를 위해 국내 원액이 귀함 → 프리미엄. 대신 블렌더 수가 적어 시장이 얕다
  domesticSpiritPremium: 0.25,
  bulkMarketDepth: 0.8,
  // 한국: 여름 집중호우·폭염(재해), 잦은 주세·규제 논의(규제), 얕은 B2B 시장
  eventWeights: { market: 1.0, supply: 1.0, disaster: 1.2, regulation: 1.3, b2b: 0.8, opportunity: 1.0, people: 1.0 },
};

/** 도수 반영 기준 소비자가(원/L) */
export function refPricePerL(region: RegionDef, category: ProductCategory, abv: number): number {
  const m = region.market[category];
  return m.refConsumerPricePerL * Math.pow(abv / m.refAbv, 0.7);
}

/** 출고가(세전) → 소비자가 배수 */
export function consumerMultiplier(region: RegionDef): number {
  const { liquorRate, educationRate, vat } = region.tax;
  return (1 + liquorRate * (1 + educationRate)) * (1 + vat) * region.retailMarkup;
}

/** 출고가에 붙는 주세 + 교육세 */
export function liquorTaxPerWon(region: RegionDef): number {
  return region.tax.liquorRate * (1 + region.tax.educationRate);
}
