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

/** 지역 안의 증류소 입지. 세제·시장·인건비는 지역과 같고 기후·특산물 자격만 다르다 */
export interface SiteDef {
  id: string;
  nameKo: string;
  tempC: number[];
  humidity: number[];
  basis: string;
  /** 관광 잠재력 배수 (지역 배수에 곱한다) */
  tourism?: number;
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
  /** 비지터 센터 관광 잠재력 (한국 = 1) */
  tourism?: number;
  /** 전통주(지역특산주) 주세 경감: 자국 자생 원재료 비율이 nativeShare 이상인 자사 제품. 연 누적 출고량(L) 구간별 세율 배수 */
  traditionalRelief?: { nativeShare: number; tiers: { upToL: number; factor: number }[]; label: string; basis: string; requiresFacility: string; maxPrevYearL: number };
  /** 지역 특산 캐스크는 싸고, 다른 지역 캐스크는 비싸다 */
  caskPriceFactor: Partial<Record<CaskTypeId, number>>;
}

const ALL_KINDS: SpiritKind[] = ['soju', 'gin', 'malt', 'grain', 'baijiu'];


const krWhisky = casesOf('KR.whisky_total.imports.2024');
const jpWhisky = casesOf('JP.whisky_total.tax_volume.FY2024');
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
    allowedKinds: ALL_KINDS,
    tourism: 1.0,
    market: {
      // 한국 소주 시장은 희석식이 절대 우위(2024 출고 81.6만㎘ vs 증류식 0.46만㎘ = 0.6%) — 증류식은 작은 프리미엄 틈새, 화요·일품진로 등 기존 강자 → 신규 점유 상한 3%, 희석식과 가격 비교돼 탄력성↑ (#75)
      soju_distilled: { baseCases: casesOf('KR.soju_distilled.domestic_release.2025'), baseSource: 'KR.soju_distilled (TASIS 2025) — 희석식(81.6만㎘)의 0.6%', refConsumerPricePerL: 40_000, refAbv: 0.25, elasticity: 2.0, shareCap: 0.03 },
      // 한국 진 시장은 작다 — 칵테일 바에서 제한적으로 쓰이는 정도 [결정 #45]. 규모는 관세청 원표 진 수입 576.7t(4차) — 수입 브랜드 중심이라 점유 상한 낮음
      gin: { baseCases: casesOf('KR.gin.imports.2024'), baseSource: 'KR.gin 수입 576.7t (관세청 원표 2024, 750L/톤 가정)', refConsumerPricePerL: 32_000, refAbv: 0.43, elasticity: 2.2, shareCap: 0.1 },
      whisky: { baseCases: Math.round(krWhisky * 0.4), baseSource: 'KR.whisky_total × 40% (싱글 몰트 몫, 추정)', refConsumerPricePerL: 170_000, refAbv: 0.43, elasticity: 1.1, shareCap: 0.01 },
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
    sites: [{
      id: 'andong', nameKo: '경북 안동',
      // 안동 ASOS 평년(1991~2020) 연평균 12.2°C·여름 23.9°C·겨울 −0.3°C에 맞춘 월별 근사치. 습도는 추정 [확인 필요: 기상청 월별 평년값]
      tempC: [-1.9, 0.6, 6.3, 12.4, 17.6, 22.0, 24.9, 24.9, 20.0, 13.4, 6.6, 0.4],
      humidity: [60, 57, 56, 56, 62, 70, 78, 78, 75, 71, 67, 63],
      basis: '안동 ASOS 평년값(연·계절 평균) 기반 근사. 김창수위스키 제2증류소(2026-07 준공) 소재지',
      tourism: 1.2,
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
      whisky: { baseCases: Math.round(jpWhisky * 0.04), baseSource: 'JP.whisky_total × 4% (싱글 몰트 몫, 추정)', refConsumerPricePerL: 120_000, refAbv: 0.43, elasticity: 1.0, shareCap: 0.01 },
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
      whisky: { baseCases: Math.round(twWhisky * 0.6), baseSource: 'TW.whisky_total(2023) × 60% (싱글 몰트 몫, 추정)', refConsumerPricePerL: 110_000, refAbv: 0.46, elasticity: 1.0, shareCap: 0.012 },
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
    sites: [{
      id: 'kinmen', nameKo: '진먼섬(金門)',
      // 샤먼 앞바다의 섬 — 이란보다 겨울이 서늘하고 바람이 강하다. 월별 근사치 [추정]
      tempC: [13.0, 13.3, 15.4, 19.4, 23.3, 26.4, 28.4, 28.2, 26.9, 23.6, 19.6, 15.1],
      humidity: [73, 78, 80, 82, 83, 85, 82, 81, 76, 70, 70, 70],
      basis: '진먼현 기후 근사치(추정). 금문주창 소재지',
      tourism: 1.3,
    }],
    caskPriceFactor: { korean_oak_quarter: 1.6, mizunara_hogshead: 1.4 },
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
  return r.sites?.find((x) => x.id === s.siteId) ?? { id: 'default', nameKo: r.nameKo.replace(/^.*\((.*)\)$/, '$1'), tempC: r.tempC, humidity: r.humidity, basis: '지역 기본 입지' };
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
