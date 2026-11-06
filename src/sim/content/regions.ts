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

/** 위스키 표기 규칙. 법정 최소 숙성 규정이 없으면 minMonths = 0 → 바로 상품화 가능 (결정 #60) */
export interface WhiskyRules {
  /** "위스키"로 팔 수 있는 최소 오크 숙성 개월 */
  minMonths: number;
  /** 나무통 저장 자체가 요건인지 (true면 최소 1개월은 캐스크에 있어야 한다) */
  requiresOak: boolean;
  /** 근거와 확인 상태 */
  basis: string;
  /** 지역 프리미엄 표기(예: 재패니즈 위스키) — 못 채우면 매력도 × appealWithout */
  premiumLabel?: { name: string; minMonths: number; appealWithout: number };
}

/** 지역 특산물: 특정 원재료를 일정 비율 이상 쓰면 특산물 표기와 매력도 보너스 */
export interface SpecialtyDef {
  id: string;
  label: string;
  category: ProductCategory;
  ingredientId: string;
  minShare: number;
  appealBonus: number;
  /** 이 입지에서 만든 것만 특산물 표기 (지리적 표시) */
  siteOnly?: string;
}

/** 물: 연수 = 과일·플로럴↑·이취↓, 화산암반수 = 이취↓·수율 소폭↑ (결정 #86) */
export type WaterId = 'medium' | 'soft' | 'volcanic';

/**
 * 지역 안의 증류소 입지. 세제·시장·인건비는 지역과 같고 기후·특산물 자격이 다르다 (v0.9 #62).
 * 산지 특성(결정 #86~, docs/design/regions.md): 물·고정비·건설비·물류·수요·난방·취수 허가·면세 채널·대표 결정. 모두 선택 항목 [튜닝]
 */
export interface SiteDef {
  id: string;
  nameKo: string;
  tempC: number[];
  humidity: number[];
  basis: string;
  /** 관광 잠재력 배수 (지역 배수에 곱한다) */
  tourism?: number;
  /** 한 줄 정체성·난이도(★)·화면 표시용 특성 요약 */
  tagline?: string;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  traits?: { tone: 'good' | 'bad'; text: string }[];
  water?: WaterId;
  /** 지역 관리비 배수 */
  overheadFactor?: number;
  /** 설비 건설비 배수 / 숙성고 증설비 추가 배수 */
  buildCostFactor?: number;
  warehouseCostFactor?: number;
  /** 입고 운송 할증: 원재료·포장재·캐스크 */
  freight?: { ingredients?: number; packaging?: number; casks?: number };
  /** 국내 출고 물류비 배수 */
  outboundLogistics?: number;
  /** 국내 수요 배수 (관광·인바운드) */
  demandFactor?: number;
  /** 겨울 난방: 해당 월 난방비(원/월) + 증류 에너지비 배수 */
  heating?: { months: number[]; perMonth: number; energyFactor: number };
  /** 취수 허가(제주): 월 발효 투입 용량 상한(L) + 증량 신청 */
  waterPermit?: { baseL: number; stepL: number; cost: number; months: [number, number]; chance: number };
  /** 지정면세점 채널(제주) — 월별 관광 계절성 */
  dutyFree?: { seasonality: number[] };
  /** 숙성 재고 담보대출 담보 인정 비율 (없으면 담보대출 없음) */
  inventoryLtv?: number;
  /** 원액 B2B 운송비 — 섬·원거리 입지는 블렌더 매입 단가(현물·계약)가 깎인다 */
  bulkFreight?: number;
  /** 입지 대표 거래: 대형 유통 납품 / 위탁생산 */
  deals?: ('retail' | 'oem' | 'filling')[];
  /** 쿠퍼리지 주문 납품 개월 (없으면 시장 기본) — 스페이사이드 쿠퍼리지 클러스터 (#113) */
  cooperageLeadMonths?: number;
  /** 이벤트별 가중치 배수 (이벤트 id → 배수) */
  eventBoost?: Partial<Record<string, number>>;
  /** 입지 캐스크 단가 배수 (지역 배수에 곱한다) */
  caskPriceFactor?: Partial<Record<CaskTypeId, number>>;
  /** 창업 멤버·증류소 이름 (없으면 지역 기본) */
  starter?: { name: string; distillery: string };
}

/** 스코틀랜드·EU식 3년 규정 — 지역 정의가 없을 때의 기본값 */
export const DEFAULT_WHISKY_RULES: WhiskyRules = { minMonths: 36, requiresOak: true, basis: '스코틀랜드·EU식 3년 규정' };

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
  /** 그레인 현물 시장 깊이(LPA, #81) — 최근 현물 판매량이 이만큼이면 현물 단가가 절반이 된다 */
  grainSpotDepthLPA: number;
  eventWeights: Partial<Record<EventCategory, number>>;
  /** 매입 원액 병입의 브랜드 가치 감점 계수 — 싸게 사 온 원액일수록 감점이 그대로 적용된다 (v0.8)
   *  매력도 × (1 − sourcedPenalty × 매입 비중 × (1 − 매입 원액 브랜드 가치)) */
  sourcedPenalty: number;
  whisky: WhiskyRules;
  specialties?: SpecialtyDef[];
  /** 기본 입지(위 tempC·humidity) 외의 선택 입지 */
  sites?: SiteDef[];
  /** 기본 입지의 산지 특성 (기후는 지역 값을 쓴다) */
  defaultSite?: Omit<Partial<SiteDef>, 'id' | 'tempC' | 'humidity'>;
  /** 일본 미즈나라 백단·인센스 향(incense ≥ 8) 매력도 배수 (결정 #86) */
  incensePremium?: number;
  /** 비지터 센터 관광 잠재력 (한국 = 1) */
  tourism?: number;
  /** 전통주(지역특산주) 주세 경감: 자국 자생 원재료 비율이 nativeShare 이상인 자사 제품. 연 누적 출고량(L) 구간별 세율 배수 */
  traditionalRelief?: { nativeShare: number; tiers: { upToL: number; factor: number }[]; label: string; basis: string; requiresFacility: string; maxPrevYearL: number };
  /** 지역 특산 캐스크는 싸고, 다른 지역 캐스크는 비싸다 */
  /** 지역 원료 단가 배수 (원료 id → 배수). 스코틀랜드 맥아처럼 현지 산업이 큰 원료 (#110) */
  ingredientPriceFactor?: Partial<Record<string, number>>;
  caskPriceFactor: Partial<Record<CaskTypeId, number>>;
}

const ALL_KINDS: SpiritKind[] = ['soju', 'gin', 'malt', 'grain', 'baijiu'];


const krWhisky = casesOf('KR.whisky_total.imports.2024');
const jpWhisky = casesOf('JP.whisky_total.tax_volume.FY2024');
const twWhisky = casesOf('TW.whisky_total.imports.2023');
// 영국: 증류주 출고(HMRC 2024, 40% 환산 3,622만 케이스)의 25%를 위스키로 가정 [추정, scotland.md §2]
const ukWhisky = casesOf('UK.spirits_total.domestic_release.2024') * 0.25;

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
    allowedKinds: ALL_KINDS,
    tourism: 1.0,
    market: {
      // 한국 소주 시장은 희석식이 절대 우위(2024 출고 81.6만㎘ vs 증류식 0.46만㎘ = 0.6%) — 증류식은 작은 프리미엄 틈새, 화요·일품진로 등 기존 강자 → 신규 점유 상한 3%, 희석식과 가격 비교돼 탄력성↑ (#75)
      soju_distilled: { baseCases: casesOf('KR.soju_distilled.domestic_release.2025'), baseSource: 'KR.soju_distilled (TASIS 2025) — 희석식(81.6만㎘)의 0.6%', refConsumerPricePerL: 40_000, refAbv: 0.25, elasticity: 2.0, shareCap: 0.03 },
      // 한국 진 시장은 작다 — 칵테일 바에서 제한적으로 쓰이는 정도 [결정 #45]. 규모는 관세청 원표 진 수입 576.7t(4차) — 수입 브랜드 중심이라 점유 상한 낮음
      gin: { baseCases: casesOf('KR.gin.imports.2024'), baseSource: 'KR.gin 수입 576.7t (관세청 원표 2024, 750L/톤 가정)', refConsumerPricePerL: 32_000, refAbv: 0.43, elasticity: 2.2, shareCap: 0.1 },
      whisky: { baseCases: Math.round(krWhisky * 0.4), baseSource: 'KR.whisky_total × 40% (싱글 몰트 몫, 추정)', refConsumerPricePerL: 170_000, refAbv: 0.43, elasticity: 1.1, shareCap: 0.0055 }, // #85: 0.01 → 0.0055 — 크래프트 싱글몰트 4~10년차 국내 판매 현실 범위 0.8만~2.5만 병/년 (§16.22)
      blended_whisky: { baseCases: Math.round(krWhisky * 0.5), baseSource: 'KR.whisky_total × 50% (블렌디드 몫, 추정)', refConsumerPricePerL: 90_000, refAbv: 0.4, elasticity: 1.5, shareCap: 0.012 },
      grain_whisky: { baseCases: Math.round(krWhisky * 0.1), baseSource: 'KR.whisky_total × 10% (추정)', refConsumerPricePerL: 100_000, refAbv: 0.43, elasticity: 1.3, shareCap: 0.02 },
      // 중식당 중심의 고량주 시장 — 중국산 기타 증류주 수입 7,915t(관세청 원표, 4차)을 대리값으로
      baijiu: { baseCases: casesOf('KR.baijiu.imports_proxy.2024'), baseSource: 'KR.baijiu 대리값: HS 2208.90 중국산 7,915t (750L/톤 가정)', refConsumerPricePerL: 25_000, refAbv: 0.34, elasticity: 1.8, shareCap: 0.03 },
      malt_spirit: { baseCases: 20_000, baseSource: '추정', refConsumerPricePerL: 70_000, refAbv: 0.46, elasticity: 1.3, shareCap: 0.3 },
      flavored_spirit: { baseCases: 50_000, baseSource: '추정', refConsumerPricePerL: 28_000, refAbv: 0.4, elasticity: 2.2, shareCap: 0.2 },
    },
    categoryNames: { baijiu: '고량주(백주)' },
    seasonality: [1.2, 1.15, 0.9, 0.9, 0.95, 0.9, 0.85, 0.9, 1.2, 1.0, 0.95, 1.2],
    domesticSpiritPremium: 0.25,
    bulkMarketDepth: 0.8,
    // 포화 없음(무한) — 한국 국내 그레인 수요 근거 없음 `[확인 필요]`. 일본과 함께 밸런스가 경계선이라 보류 (§16.18)
    grainSpotDepthLPA: Infinity,
    eventWeights: { market: 1.0, supply: 1.0, disaster: 1.2, regulation: 1.3, b2b: 0.8, opportunity: 1.0, people: 1.0 },
    // 종가세라 수입 완제품은 브랜드 값까지 세금이 붙어 비싸다 → 국내 병입 매입 원액이 가격으로 경쟁할 여지가 크다 (골든블루식 국내 병입)
    sourcedPenalty: 0.4,
    // 나무통 1년 이상 (v0.8 웹 확인: 나무위키 '코리안 위스키'·국세청 관련 보도 — 법령 원문은 미열람) [확인 필요: 조문]
    whisky: { minMonths: 12, requiresOak: true, basis: '주세법 시행령: 나무통 1년 이상 저장 (2차 자료 2건 일치, 조문 미열람)' },
    // 완화책(#73): 전통주 주세 경감 — 증류주 연 100㎘까지 50%, 100~200㎘ 30% (2025 시행령 개정안 보도 기준) [확인 필요: 최종 조문]
    // 요건 강화(#75): 지역 농산물 70% 이상 + 농업경영체 등록(원료 계약재배) + 전년 경감 대상 출고 500㎘ 이하
    traditionalRelief: { nativeShare: 0.7, tiers: [{ upToL: 100_000, factor: 0.5 }, { upToL: 200_000, factor: 0.7 }], label: '전통주 주세 경감', basis: '주세법: 전통주 세율 100분의 50 범위 경감, 시행령 개정안: 증류주 100㎘ 이하 50%·100~200㎘ 30%, 대상 출고량 500㎘ 이하. 지역특산주는 농업경영체·생산자단체 요건', requiresFacility: 'kr_farm_registration', maxPrevYearL: 500_000 },
    // 경기 내륙 (기본 입지) — 수도권 시장 접근, 대표 결정: 대형 유통 납품 (결정 #86)
    defaultSite: {
      tagline: '수도권 시장 접근 — 균형형·튜토리얼', difficulty: 2, outboundLogistics: 0.9, deals: ['retail'],
      traits: [
        { tone: 'good', text: '수도권 시장: 국내 출고 물류비 −10%' },
        { tone: 'good', text: '대형 유통 납품 제안 — 물량을 출고가 80%에 넘기고 대금은 2개월 뒤 (매대 노출로 인지도↑, 숙성 위스키 매력도 ×0.9)' },
        { tone: 'bad', text: '전통주 경감을 받으려면 국산 원료 70%↑ + 농업경영체 등록' },
      ],
    },
    sites: [{
      id: 'andong', nameKo: '경북 안동',
      tagline: '전통주 경감을 노리는 소주·위스키 겸업', difficulty: 2,
      traits: [
        { tone: 'good', text: '관광 잠재력 ×1.2 (하회마을·탈춤축제)' },
        { tone: 'good', text: '전통주 주세 경감 — 국산 원료 70%↑ + 농업경영체 등록' },
        { tone: 'bad', text: '내륙 대륙성 기후: 겨울이 춥다 (발효가 느려진다)' },
      ],
      // 안동 ASOS 평년(1991~2020) 연평균 12.2°C·여름 23.9°C·겨울 −0.3°C에 맞춘 월별 근사치. 습도는 추정 [확인 필요: 기상청 월별 평년값]
      tempC: [-1.9, 0.6, 6.3, 12.4, 17.6, 22.0, 24.9, 24.9, 20.0, 13.4, 6.6, 0.4],
      humidity: [60, 57, 56, 56, 62, 70, 78, 78, 75, 71, 67, 63],
      basis: '안동 ASOS 평년값(연·계절 평균) 기반 근사. 김창수위스키 제2증류소(2026-07 준공) 소재지',
      tourism: 1.2,
    }, {
      // 제주 (결정 #86): 화산암반수·지정면세점, 대신 취수 허가·해운 물류
      id: 'jeju', nameKo: '제주',
      tagline: '화산암반수와 면세점, 대신 물을 마음대로 퍼 올릴 수 없다', difficulty: 3,
      // 제주 평년값 근사 [확인 필요: 기상청 월별 평년값]
      tempC: [6, 7, 10, 14, 18, 21.5, 26, 27, 23.5, 18.5, 13, 8.5],
      humidity: [68, 67, 67, 70, 75, 81, 84, 82, 76, 70, 68, 67],
      basis: '제주 평년값 근사(추정)',
      tourism: 1.6, water: 'volcanic', overheadFactor: 0.9, buildCostFactor: 1.2,
      freight: { ingredients: 1.08, packaging: 1.15, casks: 1.1 }, outboundLogistics: 2, bulkFreight: 0.85,
      // 공정용수 월 15,000L — 실제 허가량(t/일)을 게임 규모로 단순화 [게임적 단순화]
      waterPermit: { baseL: 15_000, stepL: 10_000, cost: 20_000_000, months: [6, 12], chance: 0.6 },
      dutyFree: { seasonality: [1.15, 1.0, 0.75, 0.85, 1.0, 0.9, 1.4, 1.5, 0.9, 1.15, 0.75, 0.95] },
      eventBoost: { typhoon: 1.3 },
      starter: { name: '고은별', distillery: '오름 증류소' },
      traits: [
        { tone: 'good', text: '화산암반수: 발효 이취 −20%, 과일향↑, 수율 +3%' },
        { tone: 'good', text: '지정면세점 채널: 출도 관광객에게 주세·부가세 없이 판매 (주류 2L·미화 400달러 한도), 면세 한정판 시리즈' },
        { tone: 'good', text: '제주 차조 고소리술·청귤 보태니컬, 관광 잠재력 ×1.6' },
        { tone: 'bad', text: '지하수 취수 허가: 월 발효 투입 15,000L 상한 (증량 신청 가능)' },
        { tone: 'bad', text: '해운 물류: 국내 출고 물류비 ×2, 원료·포장재·캐스크 운송 할증, 건설비 +20%, 원액 B2B 단가 ×0.85' },
        { tone: 'bad', text: '태풍 가중 ×1.3' },
      ],
    }],
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
    allowedKinds: ALL_KINDS,
    tourism: 1.3,
    market: {
      // 본격 쇼추: 거대하지만 저가·파편화 시장
      soju_distilled: { baseCases: casesOf('JP.shochu_honkaku.tax_volume.FY2024'), baseSource: 'JP.shochu_honkaku (국세청 과세수량 FY2024)', refConsumerPricePerL: 13_000, refAbv: 0.25, elasticity: 2.0, shareCap: 0.004 },
      // 수입 진 295만 L(재무성 원표 CY2024) + 국산 진(수이·로쿠 등)이 수입과 비슷하다고 가정 [추정]. 크래프트 진 포화 → 점유 상한 낮음
      gin: { baseCases: Math.round(casesOf('JP.gin.imports.CY2024') * 2), baseSource: 'JP.gin 수입(CY2024) × 2 (국산 ≈ 수입 가정)', refConsumerPricePerL: 40_000, refAbv: 0.43, elasticity: 1.8, shareCap: 0.015 },
      // 재패니즈 싱글 몰트는 프리미엄이지만 물량은 작다(대부분 하이볼용 블렌디드). 크래프트 증류소 다수가 경쟁 [추정]
      // 일본은 세금이 가벼워 같은 술의 소비자가가 한국보다 낮다 — 크래프트 3년 700ml ≒ ¥6,000~10,000, 주요 브랜드 12년급은 그 이상 → 카테고리 평균 12만 원/L [추정]
      whisky: { baseCases: Math.round(jpWhisky * 0.04), baseSource: 'JP.whisky_total × 4% (싱글 몰트 몫, 추정)', refConsumerPricePerL: 120_000, refAbv: 0.43, elasticity: 1.0, shareCap: 0.008 }, // #85: 0.01 → 0.008 — 현실 범위 1.5만~5만 병/년, 증류소 101곳 경쟁 (§16.22)
      blended_whisky: { baseCases: Math.round(jpWhisky * 0.78), baseSource: 'JP.whisky_total × 78% (블렌디드·하이볼용, 추정)', refConsumerPricePerL: 28_000, refAbv: 0.4, elasticity: 2.0, shareCap: 0.003 },
      grain_whisky: { baseCases: Math.round(jpWhisky * 0.1), baseSource: 'JP.whisky_total × 10% (추정)', refConsumerPricePerL: 70_000, refAbv: 0.43, elasticity: 1.5, shareCap: 0.01 },
      // 교차 생산(#67): 중화요리점 중심의 작은 시장 [추정]
      baijiu: { baseCases: 40_000, baseSource: '추정: 중화요리점 중심 소규모', refConsumerPricePerL: 30_000, refAbv: 0.42, elasticity: 1.8, shareCap: 0.02 },
      malt_spirit: { baseCases: 50_000, baseSource: '추정', refConsumerPricePerL: 60_000, refAbv: 0.46, elasticity: 1.3, shareCap: 0.3 },
      flavored_spirit: { baseCases: 200_000, baseSource: '추정', refConsumerPricePerL: 30_000, refAbv: 0.4, elasticity: 2.0, shareCap: 0.1 },
    },
    categoryNames: { soju_distilled: '본격 쇼추' },
    seasonality: [1.05, 0.95, 1.0, 1.0, 1.0, 1.05, 1.15, 1.15, 0.95, 0.95, 1.0, 1.25],
    // 재패니즈 위스키 표기 기준(일본 내 증류·숙성) 이후 국산 원액이 귀하다
    domesticSpiritPremium: 0.35,
    // #79(계약 물량 1.5배)는 철회 — 40시드에서 순자산 변화 없이 그레인형 파산만 늘었다 (§16.16)
    bulkMarketDepth: 1.0,
    // 포화 없음(무한) — 재패니즈 위스키 표기 기준(일본 내 증류) 이후 국산 그레인이 귀하다.
    // 깊이 80,000만 줘도 그레인형 파산이 8 → 13/20으로 늘 만큼 일본 그레인은 경계선이다 (§16.18)
    grainSpotDepthLPA: Infinity,
    eventWeights: { market: 1.1, supply: 1.0, disaster: 1.4, regulation: 0.8, b2b: 1.1, opportunity: 1.0, people: 1.0 },
    // 수입 원액 병입은 "재패니즈 위스키"가 될 수 없고 하이볼용 저가 위스키로 소비된다
    sourcedPenalty: 0.85,
    // 미즈나라 백단·인센스 향은 일본 시장 프리미엄 (결정 #86)
    incensePremium: 1.25,
    // 간토 내륙 (기본 입지) — 대표 결정: 위탁생산(OEM) (결정 #86)
    defaultSite: {
      tagline: '원액 공급 계약·위탁생산으로 버티는 표준형', difficulty: 3, deals: ['oem'],
      traits: [
        { tone: 'good', text: '위탁생산(OEM) 제안 — 남는 설비로 다른 브랜드 원액을 증류, 설비가 없으면 위탁사가 전용 증류기 설치비 60% 지원' },
        { tone: 'good', text: '원액 B2B 시장이 깊다(지역 공통)' },
        { tone: 'bad', text: '지진·태풍' },
      ],
    },
    sites: [{
      // 오사카·교토 (결정 #86): 명수·미즈나라·관광, 대신 지진과 땅값
      id: 'kansai', nameKo: '오사카·교토',
      tagline: '명수·미즈나라·관광의 땅, 대신 지진과 땅값', difficulty: 3,
      tempC: [4.8, 5.4, 8.8, 14.4, 19.5, 23.2, 27.3, 28.5, 24.4, 18.4, 12.5, 7.2],
      humidity: [66, 65, 63, 63, 66, 72, 76, 72, 73, 72, 70, 68],
      basis: '오사카·교토 평년값 근사(추정)',
      tourism: 1.15, water: 'soft', overheadFactor: 1.0, warehouseCostFactor: 1.3, demandFactor: 1.1,
      caskPriceFactor: { mizunara_hogshead: 0.8 }, eventBoost: { earthquake: 1.5 },
      starter: { name: '야마다 유키', distillery: '미오 증류소' },
      traits: [
        { tone: 'good', text: '연수 명수: 발효 이취 −30%, 과일·플로럴 +10%' },
        { tone: 'good', text: '미즈나라 캐스크 추가 −20%, 인센스 향 일본 프리미엄 ×1.25(지역 공통)' },
        { tone: 'good', text: '간사이 인바운드: 국내 수요 +10%, 관광 잠재력 ×1.15' },
        { tone: 'bad', text: '지진 가중 ×1.5 — 내진 랙 보강이 사실상 필수' },
        { tone: 'bad', text: '땅값: 숙성고 증설비 ×1.3, 기후가 따뜻해 증발이 간토보다 많다' },
      ],
    }, {
      // 홋카이도 (결정 #86): 싸고 느린 땅, 재고 담보대출로 버티는 장기 숙성
      id: 'hokkaido', nameKo: '홋카이도',
      tagline: '싸고 느린 땅에 오래 묵히는 재고전', difficulty: 3,
      tempC: [-3.5, -3, 0.5, 6, 11, 15, 19.5, 21, 17, 10.5, 4, -1],
      humidity: [76, 74, 70, 68, 72, 78, 82, 81, 78, 74, 74, 76],
      basis: '홋카이도 내륙 평년값 근사(추정)',
      tourism: 1.0, overheadFactor: 0.9, warehouseCostFactor: 0.7, outboundLogistics: 1.3, inventoryLtv: 0.6,
      heating: { months: [11, 12, 1, 2, 3], perMonth: 4_000_000, energyFactor: 1.6 },
      eventBoost: { snowstorm: 1.5, cold_wave: 1.3 },
      starter: { name: '오노 다이치', distillery: '시라카바 증류소' },
      traits: [
        { tone: 'good', text: '싼 땅: 관리비 ×0.9, 숙성고 증설비 ×0.7' },
        { tone: 'good', text: '재고 담보대출: 숙성 재고 시가의 60%까지 빌린다(시가가 떨어지면 추가 상환)' },
        { tone: 'good', text: '감자 쇼추, 서늘해서 증발이 적다' },
        { tone: 'bad', text: '난방: 11~3월 난방비 월 400만 원 + 증류 에너지비 ×1.6' },
        { tone: 'bad', text: '본토 출고 물류비 +30%, 숙성이 느리다' },
        { tone: 'bad', text: '폭설·한파 가중' },
      ],
    }],
    // 주세법(酒税法)은 숙성 규정이 없다 → 바로 "위스키" 판매 가능. 일본양주주조조합 자율 기준: 일본 내 나무통 3년 이상 → "재패니즈 위스키" (3차 검색 확인)
    whisky: { minMonths: 0, requiresOak: false, basis: '주세법: 숙성 규정 없음. 재패니즈 위스키 표기는 업계 자율 기준 3년', premiumLabel: { name: '재패니즈 위스키', minMonths: 36, appealWithout: 0.7 } },
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
    allowedKinds: ALL_KINDS,
    tourism: 1.1,
    market: {
      // 교차 생산(#67): 한국 소주 인기로 생긴 작은 시장 [추정]
      soju_distilled: { baseCases: 30_000, baseSource: '추정: 한국 소주 인기(수입 희석식 중심)', refConsumerPricePerL: 35_000, refAbv: 0.25, elasticity: 1.8, shareCap: 0.03 },
      gin: { baseCases: 40_000, baseSource: '추정: 소규모 칵테일 시장', refConsumerPricePerL: 45_000, refAbv: 0.43, elasticity: 1.8, shareCap: 0.1 },
      // 싱글 몰트 애호 시장 — 자국 브랜드 수용도가 높다(카발란 선례). 점유 상한은 한국보다 약간 높게
      // 세금이 낮아 소비자가는 한국보다 낮다 — 카발란 클래식 700ml ≒ NT$1,500~2,000 [추정]
      whisky: { baseCases: Math.round(twWhisky * 0.6), baseSource: 'TW.whisky_total(2023) × 60% (싱글 몰트 몫, 추정)', refConsumerPricePerL: 110_000, refAbv: 0.46, elasticity: 1.0, shareCap: 0.005 }, // #85: 0.012 → 0.005 — 카발란이 국내 시장 장악, 현실 범위 0.5만~1.5만 병/년 (§16.22)
      blended_whisky: { baseCases: Math.round(twWhisky * 0.35), baseSource: 'TW.whisky_total(2023) × 35% (추정)', refConsumerPricePerL: 40_000, refAbv: 0.4, elasticity: 1.6, shareCap: 0.01 },
      grain_whisky: { baseCases: Math.round(twWhisky * 0.05), baseSource: 'TW.whisky_total(2023) × 5% (추정)', refConsumerPricePerL: 70_000, refAbv: 0.43, elasticity: 1.3, shareCap: 0.02 },
      // 금문주창(金門酒廠)이 약 80%를 쥔 고량주 시장 — 매출로 역산한 추정치. 진먼식 고량주는 특산물(아래 specialties)
      baijiu: { baseCases: casesOf('TW.baijiu.sales_proxy.2024'), baseSource: 'TW.baijiu 추정: 금문주창 매출 121억 대만달러 ÷ 평균가, 점유율 80%', refConsumerPricePerL: 32_000, refAbv: 0.58, elasticity: 1.4, shareCap: 0.008 },
      malt_spirit: { baseCases: 20_000, baseSource: '추정', refConsumerPricePerL: 70_000, refAbv: 0.46, elasticity: 1.3, shareCap: 0.3 },
      flavored_spirit: { baseCases: 50_000, baseSource: '추정', refConsumerPricePerL: 35_000, refAbv: 0.4, elasticity: 1.8, shareCap: 0.15 },
    },
    categoryNames: { baijiu: '고량주(백주)' },
    seasonality: [1.25, 1.2, 0.9, 0.9, 0.95, 0.9, 0.85, 0.9, 1.15, 1.0, 0.95, 1.15],
    domesticSpiritPremium: 0.1,
    bulkMarketDepth: 0.5,
    // 국내 블렌디드 위스키 산업이 거의 없다 → 그레인은 수출해야 하고, 스코틀랜드 대형 그레인 증류소와 경쟁한다 (#81)
    // 12,000·20,000 둘 다 지배 전략 기준 통과 → 그레인 강세 정체성을 남기는 20,000 (§16.18)
    grainSpotDepthLPA: 20_000,
    eventWeights: { market: 1.3, supply: 1.0, disaster: 1.5, regulation: 0.7, b2b: 0.6, opportunity: 1.1, people: 1.0 },
    // 싱글 몰트 애호 시장이라 매입 원액 병입은 저가 시장에만 머문다
    sourcedPenalty: 0.7,
    // 菸酒管理法施行細則 第3條: 威士忌 = 곡류 원료, 당화·발효·증류 후 나무통 2년 이상 저장, 40% 이상 (v0.8 웹 확인, 법규 전재 사이트)
    whisky: { minMonths: 24, requiresOak: true, basis: '菸酒管理法施行細則 第3條: 木桶貯存兩年以上, 酒精成分 40% 이상' },
    // 진먼 고량주는 진먼섬(金門) 입지에서 만든 것만 (결정 #62)
    specialties: [{ id: 'kinmen', label: '진먼 고량주', category: 'baijiu', ingredientId: 'sorghum_kinmen', minShare: 0.6, appealBonus: 1.35, siteOnly: 'kinmen' }],
    defaultSite: {
      tagline: '2년에 출시하는 빠른 싱글 몰트, 대신 증발이 크다', difficulty: 3,
      traits: [
        { tone: 'good', text: '빠른 숙성 — 위스키는 2년부터' },
        { tone: 'bad', text: '증발 연 약 10%, 태풍·지진' },
      ],
    },
    sites: [{
      id: 'kinmen', nameKo: '진먼섬(金門)',
      tagline: '진먼 고량주 특산물의 섬', difficulty: 3,
      traits: [
        { tone: 'good', text: '진먼 고량주 특산물 표기(진먼 고량 60%↑) — 대만 시장 매력도 ×1.35' },
        { tone: 'good', text: '이란보다 증발이 적다, 관광 ×1.3' },
      ],
      // 샤먼 앞바다의 섬 — 이란보다 겨울이 서늘하고 바람이 강하다. 월별 근사치 [추정]
      tempC: [13.0, 13.3, 15.4, 19.4, 23.3, 26.4, 28.4, 28.2, 26.9, 23.6, 19.6, 15.1],
      humidity: [73, 78, 80, 82, 83, 85, 82, 81, 76, 70, 70, 70],
      basis: '진먼현 기후 근사치(추정). 금문주창 소재지',
      tourism: 1.3,
    }],
    caskPriceFactor: { korean_oak_quarter: 1.6, mizunara_hogshead: 1.4 },
  },
  // 영국 (#110, docs/design/scotland.md) — 기본 입지 스페이사이드, 아일라는 다음 PR. 런던(진)은 Tier 3
  UK: {
    id: 'UK',
    nameKo: '영국 (스코틀랜드 스페이사이드)',
    // 기온: Met Office 로시머스 평년값(1991~2020, (최고+최저)/2). 습도: 엘긴 두 자료(NASA POWER 82~94%, climate-data 75~82%)의 중간 [추정]
    tempC: [3.8, 4.2, 5.7, 7.8, 10.1, 12.7, 14.8, 14.5, 12.6, 9.4, 6.2, 3.8],
    humidity: [87, 86, 83, 80, 78, 79, 80, 81, 83, 85, 87, 88],
    // 종량세 £33.99/LPA(2026-02-01, 22% 초과) × 1,800원/£ + 부가세 20% — 기준 브랜치 수출 시장 '영국'과 같은 값
    tax: { adValorem: 0, education: 0, specificPerLPA: 61_200, vat: 0.2, label: '종량세 약 61,200원/LPA (£33.99) + 부가세 20%' },
    retailMarkup: 1.35,
    overheadPerMonth: 14_000_000,
    laborCost: 1.4,
    allowedKinds: ALL_KINDS,
    // 증류소 방문 연 200만 명(SWA 2018) — 위스키 관광이 가장 큰 나라
    tourism: 1.3,
    market: {
      // 영국 내수 위스키 물량은 공식 수치를 못 찾았다(HMRC 위스키 출고 표 미열람) → 증류주 출고(HMRC 2024, 130.4M LPA)의 25%를 위스키로 [추정],
      // 그중 싱글몰트 12%(펍 매출의 31.8%가 몰트 — CGA 2023, 물량 비중은 더 낮다), 블렌디드 85%, 그레인 3% [추정]
      // 소비자가: 신생 크래프트 싱글몰트 £50~68·12년 £37~43 → 평균 £45/70cl ≈ 11.6만 원/L, 블렌디드 £16~18.5 ≈ 4.4만 원/L, 진 £28~45(크래프트)·대중 진 포함 ≈ 5.5만 원/L
      whisky: { baseCases: Math.round(ukWhisky * 0.12), baseSource: 'UK.spirits_total(HMRC 2024) × 위스키 25% × 싱글몰트 12% (추정)', refConsumerPricePerL: 116_000, refAbv: 0.43, elasticity: 1.3, shareCap: 0.004 },
      blended_whisky: { baseCases: Math.round(ukWhisky * 0.85), baseSource: 'UK.spirits_total × 위스키 25% × 블렌디드 85% (추정)', refConsumerPricePerL: 44_000, refAbv: 0.4, elasticity: 2.0, shareCap: 0.002 },
      grain_whisky: { baseCases: Math.round(ukWhisky * 0.03), baseSource: 'UK.spirits_total × 위스키 25% × 그레인 3% (추정)', refConsumerPricePerL: 70_000, refAbv: 0.43, elasticity: 1.5, shareCap: 0.01 },
      // 진: 2019년 정점 약 8,300만 병(WSTA) → 2025년 정점의 약 60%(IWSR −40%) ≈ 5,000만 병 = 390만 케이스 [추정]
      gin: { baseCases: 3_900_000, baseSource: 'WSTA 2019 정점 8,300만 병 × 0.6 (IWSR 2025 −40%) (추정)', refConsumerPricePerL: 55_000, refAbv: 0.4, elasticity: 2.0, shareCap: 0.003 },
      soju_distilled: { baseCases: 5_000, baseSource: '추정: K-주류 틈새', refConsumerPricePerL: 30_000, refAbv: 0.25, elasticity: 2.0, shareCap: 0.05 },
      baijiu: { baseCases: 10_000, baseSource: '추정: 중식당 중심 소규모', refConsumerPricePerL: 45_000, refAbv: 0.45, elasticity: 1.8, shareCap: 0.02 },
      malt_spirit: { baseCases: 20_000, baseSource: '추정', refConsumerPricePerL: 70_000, refAbv: 0.46, elasticity: 1.3, shareCap: 0.2 },
      flavored_spirit: { baseCases: 300_000, baseSource: '추정', refConsumerPricePerL: 35_000, refAbv: 0.37, elasticity: 2.0, shareCap: 0.05 },
    },
    categoryNames: { whisky: '스카치 싱글 몰트', blended_whisky: '블렌디드 스카치', grain_whisky: '싱글 그레인 스카치' },
    // 크리스마스 성수기, 1월 번스 나이트 뒤 비수기 [추정]
    seasonality: [0.85, 0.85, 0.95, 0.95, 1.0, 1.05, 0.95, 0.95, 0.95, 1.0, 1.15, 1.4],
    // 원액이 넘친다 — 국산 원액 프리미엄 없음 (regions.md §4.4)
    domesticSpiritPremium: 0,
    // 블렌더 생태계가 세계에서 가장 깊다 (스페이사이드 블렌더 밀집 ×1.5, regions.md §4.4.2)
    bulkMarketDepth: 1.5,
    grainSpotDepthLPA: Infinity,
    // 공급 과잉·관세 같은 시장 이벤트와 블렌더 거래가 잦고, 태풍·지진은 없다
    eventWeights: { market: 1.2, supply: 1.0, disaster: 0.6, regulation: 1.0, b2b: 1.3, opportunity: 1.0, people: 1.2 },
    // 독립 병입자가 매입 스카치를 병입하는 문화 — 매입 원액 병입의 브랜드 감점이 작다
    sourcedPenalty: 0.3,
    // Scotch Whisky Regulations 2009: 스코틀랜드에서 700L 이하 오크통 3년 이상, 병입 40% 이상(전역 규칙 MIN_BOTTLING_ABV와 같다)
    whisky: { minMonths: 36, requiresOak: true, basis: 'Scotch Whisky Regulations 2009: 스코틀랜드 오크통(700L 이하) 3년 이상, 병입 40% 이상' },
    // 스페이사이드 (기본 입지, #110) — 대표 결정: 필링 계약(#112), 인재 쟁탈·쿠퍼리지 클러스터(#113)
    defaultSite: {
      tagline: '블렌더가 줄 선 동네 — 원액은 잘 팔리지만 브랜드로 튀기는 어렵다', difficulty: 2, water: 'soft',
      deals: ['filling'],
      // 블렌더 밀집: 운송이 짧아 원액 B2B 단가 +5% (bulkFreight는 B2B 단가 배수)
      bulkFreight: 1.05,
      // 쿠퍼리지 클러스터: 캐스크 −20%, 쿠퍼리지 주문 1개월 만에 도착 (#113)
      caskPriceFactor: { ex_bourbon_barrel: 0.8, oloroso_butt: 0.8, mizunara_hogshead: 0.8, korean_oak_quarter: 0.8 },
      cooperageLeadMonths: 1,
      // 공급 과잉(#116)·인재 쟁탈(#113)
      eventBoost: { whisky_glut: 2, staff_poaching: 1.5, rival_scout: 3 },
      starter: { name: '이언 매커디', distillery: '킬도니 증류소' },
      traits: [
        { tone: 'good', text: '필링 계약: 블렌더가 빈 캐스크를 대고, 우리 원액을 채운 블렌더 캐스크를 맡아 월 보관료를 받는다 (숙성고 자리를 내준다)' },
        { tone: 'good', text: '블렌더 밀집: 원액 B2B 시장 깊이 ×1.5, 단가 +5%' },
        { tone: 'good', text: '쿠퍼리지 클러스터: 캐스크 −20%, 쿠퍼리지 주문 1개월 만에 도착' },
        { tone: 'good', text: '스카치 후광: 해외 위스키 시장 ×2, 해외 인지도 0.05에서 시작 · 연수(스페이 강) · 위스키 관광' },
        { tone: 'bad', text: '경쟁 과밀: 내수 점유 상한이 낮다 · 주세 £33.99/LPA(싼 술일수록 세금 비중↑)' },
        { tone: 'bad', text: '공급 과잉 이벤트 ×2 · 이웃 증류소가 직원을 빼 간다(대신 빼 올 기회도 있다)' },
      ],
    },
    // 버번 배럴 £237(2024, 켄터키 출고)·셰리 벗 약 £1,200 — 기본 단가와 비슷해 배수 1. 미즈나라·한국 참나무는 멀다
    caskPriceFactor: { ex_bourbon_barrel: 1.0, oloroso_butt: 1.0, mizunara_hogshead: 1.8, korean_oak_quarter: 1.8 },
    // 스코틀랜드 몰팅 산업: 맥아용 보리 £157~185/t(2025~26, 과잉으로 프리미엄 £5~15) — 수입 맥아 단가의 약 60% [추정]
    ingredientPriceFactor: { malt_unpeated: 0.6, malt_peated: 0.65 },
  },
};

export const KOREA = REGIONS.KR;

/** 원산지 표기 잠금(AOC·GI) — 이 주종은 여기서만 그 이름으로 생산 (스카치·버번·코냑·테킬라는 지역 추가 때) */
export const GI_LOCK: Partial<Record<SpiritKind, string[]>> = {};

/** 물류망 페널티 (결정 #67): 원재료 자생지 → 생산지 운송 배수. 표에 없는 먼 거리는 FAR */
const DISTANCE: Record<string, Record<string, number>> = {
  KR: { JP: 1.2, TW: 1.3, CN: 1.15, US: 1.5, MX: 1.8, UK: 1.6 },
  JP: { KR: 1.2, TW: 1.3, CN: 1.3, US: 1.5, MX: 1.8, UK: 1.6 },
  TW: { KR: 1.3, JP: 1.3, CN: 1.15, US: 1.5, MX: 1.8, UK: 1.6 },
  UK: { KR: 1.6, JP: 1.6, TW: 1.6, CN: 1.6, US: 1.3, MX: 1.5 },
};
export const FAR_LOGISTICS = 1.8;

/** 원재료 가격 배수 = baseMaterialCost × logisticsMultiplier. 자생지가 없으면(세계 상품) 1 */
export function logisticsMultiplier(native: string[] | undefined, at: RegionId): number {
  if (!native?.length || native.includes(at)) return 1;
  return Math.min(...native.map((n) => DISTANCE[at]?.[n] ?? FAR_LOGISTICS));
}

export function regionOf(s: Pick<GameState, 'regionId'>): RegionDef {
  return REGIONS[s.regionId] ?? REGIONS.KR;
}

/** 현재 증류소 입지 (기본 입지는 지역의 tempC·humidity) */
export function siteOf(s: Pick<GameState, 'regionId' | 'siteId'>): SiteDef {
  const r = regionOf(s);
  return r.sites?.find((x) => x.id === s.siteId) ?? { nameKo: r.nameKo.replace(/^.*\((.*)\)$/, '$1'), basis: '지역 기본 입지', ...r.defaultSite, id: 'default', tempC: r.tempC, humidity: r.humidity };
}

/** 입지 목록 (기본 입지 포함) — 새 게임 화면·밸런스 스크립트용 */
export function sitesOfRegion(regionId: RegionId): SiteDef[] {
  return [siteOf({ regionId }), ...(REGIONS[regionId].sites ?? [])];
}

/** 도수 반영 기준 소비자가(원/L) */
export function refPricePerL(region: RegionDef, category: ProductCategory, abv: number): number {
  const m = region.market[category];
  return m.refConsumerPricePerL * Math.pow(abv / m.refAbv, 0.7);
}

/** 병당 주세 (종가세 + 교육세 + 종량세) × 경감 배수 */
export function liquorTaxPerBottle(region: RegionDef, price: number, bottleMl: number, abv: number, taxFactor = 1): number {
  const lpa = (bottleMl / 1000) * abv;
  return (price * region.tax.adValorem * (1 + region.tax.education) + region.tax.specificPerLPA * lpa) * taxFactor;
}

/** 출고가 → 병당 소비자가 */
export function consumerPrice(region: RegionDef, price: number, bottleMl: number, abv: number, markupFactor = 1, taxFactor = 1): number {
  return (price + liquorTaxPerBottle(region, price, bottleMl, abv, taxFactor)) * (1 + region.tax.vat) * region.retailMarkup * markupFactor;
}

/** 병당 소비자가 → 그 소비자가가 되는 출고가 (권장가 계산용) */
export function priceForConsumer(region: RegionDef, consumer: number, bottleMl: number, abv: number, taxFactor = 1): number {
  const lpa = (bottleMl / 1000) * abv;
  const beforeTax = consumer / ((1 + region.tax.vat) * region.retailMarkup) - region.tax.specificPerLPA * lpa * taxFactor;
  return Math.max(100, beforeTax / (1 + region.tax.adValorem * (1 + region.tax.education) * taxFactor));
}

/** 전통주 주세 경감 배수 — 올해 누적 경감 대상 출고량(L) 구간별 */
export function traditionalTaxFactor(region: RegionDef, traditional: boolean | undefined, releasedThisYearL: number, prevYearL = 0): number {
  if (!traditional || !region.traditionalRelief) return 1;
  if (prevYearL > region.traditionalRelief.maxPrevYearL) return 1;
  return region.traditionalRelief.tiers.find((t) => releasedThisYearL < t.upToL)?.factor ?? 1;
}

export function categoryName(region: RegionDef, category: ProductCategory, fallback: string): string {
  return region.categoryNames?.[category] ?? fallback;
}
