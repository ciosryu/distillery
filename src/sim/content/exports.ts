// 수출 시장 (#95, PRD §16.25) — 수치는 전부 [튜닝]. 조사 근거는 PRD §16.25
// 수입 프리미엄 위스키는 스카치·재패니즈와 경쟁해 가격 탄력성이 크다(2.0) — 1.1~1.2로 두면 수출가를 2배로 올려도 잘 팔려 순자산이 4배가 됐다
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
      whisky: { baseCases: 400_000, baseSource: '재패니즈·월드 위스키 수입 틈새 — 신생 브랜드 연 500~5,000병, 자리 잡으면 1만~5만병이 되도록 (추정, §16.25)', refConsumerPricePerL: 95_000, refAbv: 0.46, elasticity: 2.0, shareCap: 0.03 },
      blended_whisky: { baseCases: 300_000, baseSource: '아시아 블렌디드 수입 틈새 (추정)', refConsumerPricePerL: 55_000, refAbv: 0.43, elasticity: 1.6, shareCap: 0.01 },
      gin: { baseCases: 150_000, baseSource: '크래프트 수입 진 틈새 (추정)', refConsumerPricePerL: 50_000, refAbv: 0.43, elasticity: 1.8, shareCap: 0.02 },
    },
    // 기본관세(MFN)는 위스키·진 무관세. 2026-07-24부터 Section 301 관세 한국·일본 12.5%, 대만 10% (주류 면제 여부 미확인)
    tariff: { KR: 0.125, JP: 0.125, TW: 0.1 },
    // 연방: 소규모 생산자 감면(CBMA) $2.70/proof gallon — 수입품도 해외 생산자가 수입상에 배정해 적용. 주세: 평균 약 $4/gal(제품) [추측]
    excisePerLPA: Math.round((2.7 / 1.8927) * KRW_PER_USD + (4 / (3.785 * 0.46)) * KRW_PER_USD),
    vat: 0.07, // 주별 판매세 0~10% [추측]
    // 3단계 유통: 수입상 ~24%·도매 ~33%·소매 ~33% 마진 → 소비자가 ≈ FOB × 4
    channelMultiple: 3.0,
    freightPerBottle: { KR: 2_700, JP: 2_700, TW: 2_800 }, // 소량 혼적 + 부대비용 병당 $1~3 [추측]
    entryCost: 20_000_000, // COLA(무료)·수입상 허가·FDA 등록, $5k~20k [추측]
    entryMonths: 5,
    monthlyCost: 4_000_000, // 현지 브랜드 앰배서더·판촉 지원 [추측]
    minWhiskyMonths: 0,
    // 신생 수입 브랜드는 묻힌다 — 수상·평론 없이 오르는 인지도는 낮다 (연 500~5,000병 → 자리 잡으면 1만~5만)
    awareness: { start: 0.02, perMonth: 0.006, domesticSpill: 0.05, max: 0.35 },
  },
  UK: {
    id: 'UK',
    nameKo: '영국',
    descKo: '주세가 무겁고(순수 알코올 1L당 약 32파운드) 위스키는 3년 숙성 이상만 "위스키"다. 전문점·온라인 애호가 층이 두텁다',
    categories: {
      whisky: { baseCases: 60_000, baseSource: '월드·재패니즈 위스키 애호가 시장 — 신생 브랜드 연 300~3,000병이 되도록 (추정, §16.25)', refConsumerPricePerL: 110_000, refAbv: 0.46, elasticity: 2.0, shareCap: 0.03 },
      gin: { baseCases: 80_000, baseSource: '프리미엄 진 수입 틈새 (추정)', refConsumerPricePerL: 55_000, refAbv: 0.43, elasticity: 1.9, shareCap: 0.01 },
    },
    tariff: { KR: 0, JP: 0, TW: 0 }, // 위스키 제3국 관세 0% (진도 0% 추정)
    excisePerLPA: Math.round(33.99 * KRW_PER_GBP), // 2026-02부터 £33.99/LPA (2027-02 £35.54 예정)
    vat: 0.2,
    // 유통 5~40% + 소매 25~35% — 주세가 병당 고정이라 싼 병일수록 소비자가/FOB 배수가 커진다
    channelMultiple: 1.7,
    freightPerBottle: { KR: 3_600, JP: 3_600, TW: 3_700 }, // 병당 £1~3, 6~8주 [추측]
    entryCost: 10_000_000, // 수입상·보세창고·영국 표기 라벨, £2k~10k [추측]
    entryMonths: 3,
    monthlyCost: 3_000_000,
    minWhiskyMonths: 36,
    awareness: { start: 0.02, perMonth: 0.006, domesticSpill: 0.05, max: 0.35 },
  },
  DF: {
    id: 'DF',
    nameKo: '공항 면세점',
    descKo: '자국 국제공항 출국 면세점(제주 지정면세점과 별개). 세금이 없지만 운영사 마진이 크고 입점비가 든다. 국내 인지도가 그대로 넘어온다',
    categories: {
      whisky: { baseCases: 25_000, baseSource: '공항 면세 싱글몰트 중 로컬 크래프트 몫 (추정, §16.25)', refConsumerPricePerL: 100_000, refAbv: 0.46, elasticity: 1.5, shareCap: 0.05 },
      gin: { baseCases: 8_000, baseSource: '공항 면세 진 중 로컬 몫 (추정)', refConsumerPricePerL: 45_000, refAbv: 0.43, elasticity: 1.6, shareCap: 0.05 },
      soju_distilled: { baseCases: 12_000, baseSource: '공항 면세 전통주·증류식 소주 (추정)', refConsumerPricePerL: 35_000, refAbv: 0.25, elasticity: 1.8, shareCap: 0.05 },
    },
    tariff: { KR: 0, JP: 0, TW: 0 },
    excisePerLPA: 0,
    vat: 0,
    // 운영사 매출총이익률 65%(Avolta 2024) + 공항 임대료 → 공급가는 소비자가의 35~50%
    channelMultiple: 2.5,
    freightPerBottle: { KR: 400, JP: 400, TW: 400 },
    entryCost: 30_000_000, // 입점비 — 대형 브랜드와 같은 금액이라 소형 브랜드에 불리 [추측]
    entryMonths: 3,
    monthlyCost: 2_000_000,
    minWhiskyMonths: 0,
    awareness: { start: 0, perMonth: 0, domesticSpill: 1, max: 0.95 },
    regionScale: { KR: 1.0, JP: 0.8, TW: 0.5 },
  },
};

export const EXPORT_MARKET_IDS = Object.keys(EXPORT_MARKETS) as ExportMarketId[];
export { KRW_PER_GBP, KRW_PER_USD };
