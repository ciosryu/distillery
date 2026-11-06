// 수출 시장 (#95, PRD §16.25) — 수치는 전부 [튜닝]. 조사 근거는 PRD §16.25
// 수출 시장 (#95, PRD §16.25) + 확장 (#100~#108, PRD §17, docs/design/export.md): EU·중국·동남아·한일대 상호 수출, 수입사 계약, 인지도 후광은 면세점만
// 수입 프리미엄 위스키는 스카치·재패니즈와 경쟁해 가격 탄력성이 크다(2.0) — 1.1~1.2로 두면 수출가를 2배로 올려도 잘 팔려 순자산이 4배가 됐다
import type { ExportMarketId, ProductCategory, RegionId } from '../types';

export type { ExportMarketId };

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
  /** 현지 종가세 — (FOB + 운임) × (1 + 관세)에 붙는다 (한국 주세 72% × 교육세 1.3, 중국 소비세) (#100) */
  adValorem?: number;
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
  /** 수입사 계약 제안 조건 (#101): 매입가 = 출고가 × priceFactor 범위, 연 최소 물량.
   *  #106: 수입상 마진은 channelMultiple에 이미 들어 있으므로 매입가는 출고가와 거의 같다(신생 브랜드 할인만, 먼 시장 0.85~0.95 · 가까운 시장 0.88~1 · 면세점 0.9~1) */
  offer: { priceFactor: [number, number]; minBottlesPerYear: number };
  /** 수입사 이름 (가상) */
  partners: string[];
}

const KRW_PER_USD = 1_380;
const KRW_PER_GBP = 1_800;
// 확장 시장 환율 [가정]
const KRW_PER_EUR = 1_500;
const KRW_PER_CNY = 190;
const KRW_PER_SGD = 1_050;
const KRW_PER_TWD = 43;

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
    tariff: { KR: 0.125, JP: 0.125, TW: 0.1, UK: 0 }, // 영국산 위스키는 2026-04-30 관세 철폐, 2026-07-24 Section 301에서도 제외 (scotland.md §2)
    // 연방: 소규모 생산자 감면(CBMA) $2.70/proof gallon — 수입품도 해외 생산자가 수입상에 배정해 적용. 주세: 평균 약 $4/gal(제품) [추측]
    excisePerLPA: Math.round((2.7 / 1.8927) * KRW_PER_USD + (4 / (3.785 * 0.46)) * KRW_PER_USD),
    vat: 0.07, // 주별 판매세 0~10% [추측]
    // 3단계 유통: 수입상 ~24%·도매 ~33%·소매 ~33% 마진 → 소비자가 ≈ FOB × 4
    channelMultiple: 3.0,
    freightPerBottle: { KR: 2_700, JP: 2_700, TW: 2_800, UK: 2_000 }, // 소량 혼적 + 부대비용 병당 $1~3 [추측]
    entryCost: 20_000_000, // COLA(무료)·수입상 허가·FDA 등록, $5k~20k [추측]
    entryMonths: 5,
    monthlyCost: 4_000_000, // 현지 브랜드 앰배서더·판촉 지원 [추측]
    minWhiskyMonths: 0,
    // 신생 수입 브랜드는 묻힌다 — 수상·평론 없이 오르는 인지도는 낮다 (연 500~5,000병 → 자리 잡으면 1만~5만). 국내 인지도 후광 없음 (#102)
    awareness: { start: 0.02, perMonth: 0.006, domesticSpill: 0, max: 0.35 },
    offer: { priceFactor: [0.85, 0.95], minBottlesPerYear: 1_200 },
    partners: ['파이어니어 스피릿 임포츠', '노스스타 브랜즈', '하버라인 와인앤스피릿'],
  },
  UK: {
    id: 'UK',
    nameKo: '영국',
    descKo: '주세가 무겁고(순수 알코올 1L당 약 32파운드) 위스키는 3년 숙성 이상만 "위스키"다. 전문점·온라인 애호가 층이 두텁다',
    categories: {
      whisky: { baseCases: 60_000, baseSource: '월드·재패니즈 위스키 애호가 시장 — 신생 브랜드 연 300~3,000병이 되도록 (추정, §16.25)', refConsumerPricePerL: 110_000, refAbv: 0.46, elasticity: 2.0, shareCap: 0.03 },
      gin: { baseCases: 80_000, baseSource: '프리미엄 진 수입 틈새 (추정)', refConsumerPricePerL: 55_000, refAbv: 0.43, elasticity: 1.9, shareCap: 0.01 },
    },
    tariff: { KR: 0, JP: 0, TW: 0, UK: 0 }, // 위스키 제3국 관세 0% (진도 0% 추정)
    excisePerLPA: Math.round(33.99 * KRW_PER_GBP), // 2026-02부터 £33.99/LPA (2027-02 £35.54 예정)
    vat: 0.2,
    // 유통 5~40% + 소매 25~35% — 주세가 병당 고정이라 싼 병일수록 소비자가/FOB 배수가 커진다
    channelMultiple: 1.7,
    freightPerBottle: { KR: 3_600, JP: 3_600, TW: 3_700, UK: 0 }, // 병당 £1~3, 6~8주 [추측]
    entryCost: 10_000_000, // 수입상·보세창고·영국 표기 라벨, £2k~10k [추측]
    entryMonths: 3,
    monthlyCost: 3_000_000,
    minWhiskyMonths: 36,
    awareness: { start: 0.02, perMonth: 0.006, domesticSpill: 0, max: 0.35 },
    offer: { priceFactor: [0.85, 0.95], minBottlesPerYear: 600 },
    partners: ['스페이 앤 템스 임포터스', '오크하트 디스트리뷰션'],
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
    tariff: { KR: 0, JP: 0, TW: 0, UK: 0 },
    excisePerLPA: 0,
    vat: 0,
    // 운영사 매출총이익률 65%(Avolta 2024) + 공항 임대료 → 공급가는 소비자가의 35~50%
    channelMultiple: 2.5,
    freightPerBottle: { KR: 400, JP: 400, TW: 400, UK: 400 },
    entryCost: 30_000_000, // 입점비 — 대형 브랜드와 같은 금액이라 소형 브랜드에 불리 [추측]
    entryMonths: 3,
    monthlyCost: 2_000_000,
    minWhiskyMonths: 0,
    awareness: { start: 0, perMonth: 0, domesticSpill: 1, max: 0.95 },
    regionScale: { KR: 1.0, JP: 0.8, TW: 0.5, UK: 1.5 },
    // 면세 운영사 입점 계약 — 국내 여행객 시장이라 국내 인지도가 그대로 넘어온다 (#102)
    offer: { priceFactor: [0.9, 1], minBottlesPerYear: 600 },
    partners: ['게이트원 듀티프리', '스카이라운지 리테일'],
  },
  // ── 확장 시장 (#100) — 규모는 "신생 수입 브랜드가 들어갈 틈새"(§16.25 방식), 근거는 docs/design/export.md §9 ──
  EU: {
    id: 'EU',
    nameKo: 'EU (프랑스 기준)',
    descKo: '스카치 2위 수출 시장(프랑스 2024 £419m). 관세는 없지만 회원국 주세·부가세가 무겁다. 3년 숙성 이상만 위스키',
    categories: {
      whisky: { baseCases: 250_000, baseSource: '월드·재패니즈 위스키 수입 틈새 — 프랑스·독일·네덜란드 애호가 (추정)', refConsumerPricePerL: 100_000, refAbv: 0.46, elasticity: 2.0, shareCap: 0.03 },
      blended_whisky: { baseCases: 200_000, baseSource: '아시아 블렌디드 틈새 (추정)', refConsumerPricePerL: 50_000, refAbv: 0.4, elasticity: 1.6, shareCap: 0.01 },
      gin: { baseCases: 150_000, baseSource: '크래프트 수입 진 틈새 (추정)', refConsumerPricePerL: 50_000, refAbv: 0.43, elasticity: 1.8, shareCap: 0.01 },
    },
    // 한-EU FTA·일-EU EPA 0%, 대만산 위스키 MFN 0% [확인 필요]
    tariff: { KR: 0, JP: 0, TW: 0, UK: 0 },
    // 회원국 평균 약 €18/LPA (프랑스는 사회보장 부담금 포함 약 €25) [추정]
    excisePerLPA: Math.round(18 * KRW_PER_EUR),
    vat: 0.2,
    channelMultiple: 2.0,
    freightPerBottle: { KR: 3_600, JP: 3_600, TW: 3_700, UK: 1_500 },
    entryCost: 15_000_000,
    entryMonths: 4,
    monthlyCost: 3_000_000,
    minWhiskyMonths: 36,
    awareness: { start: 0.02, perMonth: 0.006, domesticSpill: 0, max: 0.35 },
    offer: { priceFactor: [0.85, 0.95], minBottlesPerYear: 900 },
    partners: ['메종 데 스피리튜', '라인 앤 론 임포트'],
  },
  CN: {
    id: 'CN',
    nameKo: '중국',
    descKo: '선물·연회 수요로 비싼 병이 팔린다. 2026년 2월부터 위스키 관세 잠정 5%, 소비세 20%. 경기·정책 변동이 크다',
    categories: {
      whisky: { baseCases: 150_000, baseSource: '수입 싱글몰트 시장 — 스카치 대중 수출 2024 −31.5% (추정)', refConsumerPricePerL: 190_000, refAbv: 0.43, elasticity: 2.0, shareCap: 0.02 },
      blended_whisky: { baseCases: 100_000, baseSource: '수입 블렌디드 틈새 (추정)', refConsumerPricePerL: 80_000, refAbv: 0.4, elasticity: 1.6, shareCap: 0.01 },
    },
    // 2026-02-02부터 잠정 5% (2025년 MFN 10%)
    tariff: { KR: 0.05, JP: 0.05, TW: 0.05, UK: 0.05 },
    // 소비세 20%(과세표준이 세금 포함 → 실효 25%) + 0.912위안/L [단순화: 종량분은 LPA로 환산]
    adValorem: 0.25,
    excisePerLPA: Math.round((0.912 / 0.43) * KRW_PER_CNY),
    vat: 0.13,
    channelMultiple: 2.5,
    freightPerBottle: { KR: 1_200, JP: 1_200, TW: 1_100, UK: 3_000 },
    entryCost: 20_000_000, // 수입 라벨 등록·CIQ [추측]
    entryMonths: 5,
    monthlyCost: 4_000_000,
    minWhiskyMonths: 0,
    awareness: { start: 0.01, perMonth: 0.006, domesticSpill: 0, max: 0.35 },
    offer: { priceFactor: [0.85, 0.95], minBottlesPerYear: 1_200 },
    partners: ['화하 진구 무역', '동방 주업 수입'],
  },
  SEA: {
    id: 'SEA',
    nameKo: '동남아 (싱가포르 허브)',
    descKo: '관세는 없지만 주세가 순수 알코올 1L당 88싱가포르달러로 무겁다. 재수출·면세 허브라 고급 병이 잘 팔린다',
    categories: {
      whisky: { baseCases: 50_000, baseSource: '싱가포르 허브 싱글몰트 틈새 — 스카치 수출 2024 £310m (추정)', refConsumerPricePerL: 195_000, refAbv: 0.43, elasticity: 2.0, shareCap: 0.03 },
      gin: { baseCases: 20_000, baseSource: '크래프트 진 틈새 (추정)', refConsumerPricePerL: 90_000, refAbv: 0.43, elasticity: 1.6, shareCap: 0.02 },
    },
    tariff: { KR: 0, JP: 0, TW: 0, UK: 0 },
    excisePerLPA: Math.round(88 * KRW_PER_SGD),
    vat: 0.09,
    channelMultiple: 1.8,
    freightPerBottle: { KR: 1_500, JP: 1_500, TW: 1_300, UK: 3_000 },
    entryCost: 10_000_000,
    entryMonths: 3,
    monthlyCost: 2_000_000,
    minWhiskyMonths: 0,
    awareness: { start: 0.02, perMonth: 0.006, domesticSpill: 0, max: 0.35 },
    offer: { priceFactor: [0.88, 1], minBottlesPerYear: 400 },
    partners: ['머라이언 셀러스', '스트레이츠 스피릿 하우스'],
  },
  // ── 한국·일본·대만 상호 수출 (#100) — 자국 시장은 국내 판매라 제외 ──
  KR: {
    id: 'KR',
    nameKo: '한국',
    descKo: '주세 72% + 교육세(주세의 30%) + 부가세 10%가 수입 신고가에 붙는다. 관세는 국제협력관세 20%, FTA 0%',
    categories: {
      whisky: { baseCases: 60_000, baseSource: '수입 싱글몰트 중 신생 아시아 브랜드 틈새 (추정)', refConsumerPricePerL: 170_000, refAbv: 0.43, elasticity: 2.0, shareCap: 0.02 },
      soju_distilled: { baseCases: 20_000, baseSource: '일본 본격 쇼추 등 수입 증류식 소주 틈새 (추정)', refConsumerPricePerL: 40_000, refAbv: 0.25, elasticity: 2.0, shareCap: 0.03 },
      gin: { baseCases: 20_000, baseSource: '크래프트 수입 진 틈새 (추정)', refConsumerPricePerL: 32_000, refAbv: 0.43, elasticity: 2.2, shareCap: 0.03 },
    },
    // 위스키: WTO 양허 30%, 국제협력관세 20%(일반 수입), FTA 0% (오너 확인). 일본(RCEP 양허 일정 미반영)·대만은 FTA 없음 → 20%
    tariff: { KR: 0, JP: 0.2, TW: 0.2, UK: 0 },
    adValorem: 0.72 * 1.3,
    excisePerLPA: 0,
    vat: 0.1,
    channelMultiple: 1.6,
    freightPerBottle: { KR: 0, JP: 900, TW: 1_100, UK: 3_500 },
    entryCost: 10_000_000,
    entryMonths: 3,
    monthlyCost: 2_000_000,
    minWhiskyMonths: 0,
    awareness: { start: 0.02, perMonth: 0.006, domesticSpill: 0, max: 0.35 },
    offer: { priceFactor: [0.88, 1], minBottlesPerYear: 600 },
    partners: ['한강 주류 수입', '새벽 리큐르'],
  },
  JP: {
    id: 'JP',
    nameKo: '일본',
    descKo: '위스키 관세 0%, 주세는 가볍다(LPA당 약 1,000엔). 증류소 100곳 이상이 경쟁하는 시장',
    categories: {
      whisky: { baseCases: 80_000, baseSource: '월드 위스키 수입 틈새 (추정)', refConsumerPricePerL: 120_000, refAbv: 0.43, elasticity: 2.0, shareCap: 0.02 },
      soju_distilled: { baseCases: 30_000, baseSource: '한국 소주 인기 — 수입 증류식 소주 틈새 (추정)', refConsumerPricePerL: 13_000, refAbv: 0.25, elasticity: 2.0, shareCap: 0.02 },
      gin: { baseCases: 20_000, baseSource: '크래프트 수입 진 틈새 (추정)', refConsumerPricePerL: 40_000, refAbv: 0.43, elasticity: 1.8, shareCap: 0.02 },
    },
    tariff: { KR: 0, JP: 0, TW: 0, UK: 0 },
    excisePerLPA: 9_000,
    vat: 0.1,
    channelMultiple: 1.8,
    freightPerBottle: { KR: 900, JP: 0, TW: 1_000, UK: 3_500 },
    entryCost: 10_000_000,
    entryMonths: 3,
    monthlyCost: 2_000_000,
    minWhiskyMonths: 0,
    awareness: { start: 0.02, perMonth: 0.006, domesticSpill: 0, max: 0.35 },
    offer: { priceFactor: [0.88, 1], minBottlesPerYear: 600 },
    partners: ['아사히야 양주 수입', '미나토 트레이딩'],
  },
  TW: {
    id: 'TW',
    nameKo: '대만',
    descKo: '증류주 관세 0%, 주세는 1L·도수 1%당 2.5대만달러, 영업세 5%. 싱글몰트 애호가와 한국 소주 팬이 두텁다',
    categories: {
      whisky: { baseCases: 100_000, baseSource: '싱글몰트 애호 시장 중 수입 아시아 브랜드 틈새 (추정)', refConsumerPricePerL: 110_000, refAbv: 0.46, elasticity: 2.0, shareCap: 0.02 },
      soju_distilled: { baseCases: 20_000, baseSource: '한국 소주 인기 — 증류식 틈새 (추정)', refConsumerPricePerL: 35_000, refAbv: 0.25, elasticity: 1.8, shareCap: 0.03 },
      gin: { baseCases: 10_000, baseSource: '크래프트 진 틈새 (추정)', refConsumerPricePerL: 45_000, refAbv: 0.43, elasticity: 1.8, shareCap: 0.03 },
    },
    // 증류주 관세 0% (발효주 10%·니혼슈 20%·맥주 0%), 주세 NT$2.5/L/도 = NT$250/LPA, 영업세 5% (오너 확인)
    tariff: { KR: 0, JP: 0, TW: 0, UK: 0 },
    excisePerLPA: Math.round(250 * KRW_PER_TWD),
    vat: 0.05,
    channelMultiple: 1.8,
    freightPerBottle: { KR: 1_100, JP: 1_000, TW: 0, UK: 3_500 },
    entryCost: 10_000_000,
    entryMonths: 3,
    monthlyCost: 2_000_000,
    minWhiskyMonths: 0,
    awareness: { start: 0.02, perMonth: 0.006, domesticSpill: 0, max: 0.35 },
    offer: { priceFactor: [0.88, 1], minBottlesPerYear: 600 },
    partners: ['북회귀선 주류', '단수이 수입상사'],
  },
};

export const EXPORT_MARKET_IDS = Object.keys(EXPORT_MARKETS) as ExportMarketId[];
/** 이 생산 지역이 수출할 수 있는 시장 — 자국 시장(한·일·대)은 국내 판매라 뺀다 (#100) */
export const exportMarketsFor = (regionId: RegionId): ExportMarketId[] => EXPORT_MARKET_IDS.filter((id) => id !== regionId);
/** 미국 추가 관세 등 관세 이벤트는 modifier 'tariff:<시장>'로 (1 + 관세)에 곱한다 (#103) */
export const tariffKey = (id: ExportMarketId) => `tariff:${id}`;
/** 재고가 모자랄 때 국내·수출 배분 — 'margin' = 병당 순수입(수출가 − 운임 / 출고가 − 유통비)이 높은 판로부터(#109, 기본),
 *  'domestic' = 국내 먼저(#105, 실험용), 'proportional' = 수요 비율(#95 원래 규칙, 실험용) */
export const EXPORT_SALES: { allocation: 'margin' | 'domestic' | 'proportional' } = { allocation: 'margin' };
export { KRW_PER_GBP, KRW_PER_USD };
