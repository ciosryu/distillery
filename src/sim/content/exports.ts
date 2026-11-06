// 수출 시장 (#86, PRD §16.23) — 수치는 전부 [튜닝]. 조사 근거는 PRD §16.23
import type { ProductCategory, RegionId } from '../types';

export type ExportMarketId = 'US' | 'UK' | 'DF';

export interface ExportCategoryDef {
  /** 우리가 들어갈 틈새 시장 크기 (9L 케이스/년) */
  baseCases: number;
  baseSource: string;
  /** 기준 소비자가 (원/L, refAbv 기준) */
  refConsumerPricePerL: number;
  refAbv: number;
  elasticity: number;
  /** 신생 수입 브랜드 하나가 차지할 수 있는 최대 점유 */
  shareCap: number;
}

export interface ExportMarketDef {
  id: ExportMarketId;
  nameKo: string;
  descKo: string;
  categories: Partial<Record<ProductCategory, ExportCategoryDef>>;
  /** 수입 관세율 — (FOB + 운임) 대비, 생산 지역별 */
  tariff: Record<RegionId, number>;
  /** 현지 주세 (원/LPA) */
  excisePerLPA: number;
  /** 부가세·판매세 */
  vat: number;
  /** 수입상·도매·소매 마진 배수: (세후 원가) × 배수 = 세전 소비자가 */
  channelMultiple: number;
  /** 700ml 1병 해상 운임·보험 (원), 생산 지역별 */
  freightPerBottle: Record<RegionId, number>;
  /** 진입 비용 (라벨 승인·수입상 계약·출시 마케팅) */
  entryCost: number;
  /** 진입까지 걸리는 개월 */
  entryMonths: number;
  /** 매달 드는 비용 (현지 브랜드 담당·수입상 지원비) */
  monthlyCost: number;
  /** 위스키 최소 숙성 (영국·EU는 3년) — 0이면 생산국 규정만 */
  minWhiskyMonths: number;
  /** 현지 인지도: 진입 시 시작값, 월 상승, 국내 인지도가 넘어오는 비율, 상한 */
  awareness: { start: number; perMonth: number; domesticSpill: number; max: number };
  /** 면세: 생산 지역 공항 이용객 규모 배수 (시장 크기 × 배수) */
  regionScale?: Partial<Record<RegionId, number>>;
}

const KRW_PER_USD = 1_380;
const KRW_PER_GBP = 1_800;

export const EXPORT_MARKETS: Record<ExportMarketId, ExportMarketDef> = {
  US: {
    id: 'US',
    nameKo: '미국',
    descKo: '3단계 유통(수입상·도매·소매)이라 마진이 두껍다. 연방 주세는 낮고 시장은 크지만 신생 브랜드는 묻히기 쉽다',
    categories: {
      whisky: { baseCases: 400_000, baseSource: '재패니즈·월드 위스키 수입 틈새 (추정, §16.23)', refConsumerPricePerL: 95_000, refAbv: 0.46, elasticity: 1.2, shareCap: 0.03 },
      blended_whisky: { baseCases: 300_000, baseSource: '아시아 블렌디드 수입 틈새 (추정)', refConsumerPricePerL: 55_000, refAbv: 0.43, elasticity: 1.6, shareCap: 0.01 },
      gin: { baseCases: 150_000, baseSource: '크래프트 수입 진 틈새 (추정)', refConsumerPricePerL: 50_000, refAbv: 0.43, elasticity: 1.8, shareCap: 0.02 },
    },
    tariff: { KR: 0, JP: 0, TW: 0 },
    excisePerLPA: Math.round((13.5 / 1.8927) * KRW_PER_USD + 3_000),
    vat: 0.07,
    channelMultiple: 2.3,
    freightPerBottle: { KR: 1_300, JP: 1_300, TW: 1_400 },
    entryCost: 60_000_000,
    entryMonths: 6,
    monthlyCost: 5_000_000,
    minWhiskyMonths: 0,
    awareness: { start: 0.02, perMonth: 0.01, domesticSpill: 0.1, max: 0.6 },
  },
  UK: {
    id: 'UK',
    nameKo: '영국',
    descKo: '주세가 무겁고(순수 알코올 1L당 약 32파운드) 위스키는 3년 숙성 이상만 "위스키"다. 전문점·온라인 애호가 층이 두텁다',
    categories: {
      whisky: { baseCases: 150_000, baseSource: '월드·재패니즈 위스키 애호가 시장 (추정, §16.23)', refConsumerPricePerL: 110_000, refAbv: 0.46, elasticity: 1.1, shareCap: 0.03 },
      gin: { baseCases: 200_000, baseSource: '프리미엄 진 수입 틈새 (추정)', refConsumerPricePerL: 55_000, refAbv: 0.43, elasticity: 1.9, shareCap: 0.01 },
    },
    tariff: { KR: 0, JP: 0, TW: 0 },
    excisePerLPA: Math.round(32.79 * KRW_PER_GBP),
    vat: 0.2,
    channelMultiple: 1.7,
    freightPerBottle: { KR: 1_500, JP: 1_500, TW: 1_600 },
    entryCost: 40_000_000,
    entryMonths: 4,
    monthlyCost: 3_000_000,
    minWhiskyMonths: 36,
    awareness: { start: 0.03, perMonth: 0.012, domesticSpill: 0.1, max: 0.6 },
  },
  DF: {
    id: 'DF',
    nameKo: '면세점',
    descKo: '자국 공항 면세점. 세금이 없지만 운영사 마진이 크고 입점비가 든다. 국내 인지도가 그대로 넘어온다',
    categories: {
      whisky: { baseCases: 60_000, baseSource: '공항 면세 싱글몰트 중 로컬 크래프트 몫 (추정, §16.23)', refConsumerPricePerL: 100_000, refAbv: 0.46, elasticity: 1.0, shareCap: 0.05 },
      gin: { baseCases: 20_000, baseSource: '공항 면세 진 중 로컬 몫 (추정)', refConsumerPricePerL: 45_000, refAbv: 0.43, elasticity: 1.6, shareCap: 0.05 },
      soju_distilled: { baseCases: 30_000, baseSource: '공항 면세 전통주·증류식 소주 (추정)', refConsumerPricePerL: 35_000, refAbv: 0.25, elasticity: 1.8, shareCap: 0.05 },
    },
    tariff: { KR: 0, JP: 0, TW: 0 },
    excisePerLPA: 0,
    vat: 0,
    channelMultiple: 2.2,
    freightPerBottle: { KR: 400, JP: 400, TW: 400 },
    entryCost: 20_000_000,
    entryMonths: 3,
    monthlyCost: 2_000_000,
    minWhiskyMonths: 0,
    awareness: { start: 0, perMonth: 0, domesticSpill: 1, max: 0.95 },
    regionScale: { KR: 1.0, JP: 0.8, TW: 0.5 },
  },
};

export const EXPORT_MARKET_IDS = Object.keys(EXPORT_MARKETS) as ExportMarketId[];
export { KRW_PER_GBP, KRW_PER_USD };
