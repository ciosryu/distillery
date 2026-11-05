import demandData from '../../../data/market/base-demand.json';
import type { ProductCategory } from '../types';

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
    /** 소비자가 기준(원/L) */
    refConsumerPricePerL: number;
    elasticity: number;
    /** 단일 브랜드가 가져갈 수 있는 최대 점유율 */
    shareCap: number;
  }>;
  /** 월별 수요 계절 계수 (1월~12월) */
  seasonality: number[];
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
    soju_distilled: { baseCases: casesOf('KR.soju_distilled.domestic_release.2025'), baseSource: 'KR.soju_distilled (TASIS 2025)', refConsumerPricePerL: 40_000, elasticity: 1.6, shareCap: 0.2 },
    // 데이터 공백: 한국 진 시장 절대량 미확보 → 임시 추정 [튜닝]
    gin: { baseCases: 120_000, baseSource: '임시 추정 (PRD §15-8)', refConsumerPricePerL: 75_000, elasticity: 1.4, shareCap: 0.2 },
    whisky: { baseCases: casesOf('KR.whisky_total.imports.2024'), baseSource: 'KR.whisky_total (관세청 수입 2024)', refConsumerPricePerL: 170_000, elasticity: 1.1, shareCap: 0.05 },
    malt_spirit: { baseCases: 20_000, baseSource: '임시 추정 [튜닝]', refConsumerPricePerL: 70_000, elasticity: 1.3, shareCap: 0.3 },
    flavored_spirit: { baseCases: 50_000, baseSource: '임시 추정 [튜닝]', refConsumerPricePerL: 50_000, elasticity: 1.5, shareCap: 0.2 },
  },
  // 설·추석·연말 성수기
  seasonality: [1.2, 1.15, 0.9, 0.9, 0.95, 0.9, 0.85, 0.9, 1.2, 1.0, 0.95, 1.2],
};

/** 출고가(세전) → 소비자가 배수 */
export function consumerMultiplier(region: RegionDef): number {
  const { liquorRate, educationRate, vat } = region.tax;
  return (1 + liquorRate * (1 + educationRate)) * (1 + vat) * region.retailMarkup;
}

/** 출고가에 붙는 주세 + 교육세 */
export function liquorTaxPerWon(region: RegionDef): number {
  return region.tax.liquorRate * (1 + region.tax.educationRate);
}
