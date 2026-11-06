import type { AxisId, CaskTypeId, GameState, ProductCategory, RegionId, SiteId } from '../types';
import type { EventCategory } from './events';

// 산지 정의 — docs/design/regions.md (PRD §3.6, 결정 #57~#60). Tier 1 = 기존 주종·국가 안의 산지.
// 국가(content/regions.ts)는 세제·시장·법규, 산지는 기후·물·원료 단가·물류·고정비·고유 이벤트·생산 상한.
// 수치는 모두 [튜닝]. 기온·습도는 대표 관측소 평년값 근사치 [확인 필요].

/** 물: 연수 = 과일·플로럴↑·이취↓, 화산암반수 = 이취↓·수율 소폭↑ */
export type WaterId = 'medium' | 'soft' | 'volcanic';

export interface SiteDef {
  id: SiteId;
  country: RegionId;
  nameKo: string;
  /** 한 줄 정체성 */
  tagline: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** 국가의 표준 산지 (기존 v0.6 지역과 같은 수치) */
  standard?: boolean;
  /** 월별 평균 기온(°C)·상대습도(%), 1월~12월 */
  tempC: number[];
  humidity: number[];
  /** 엔젤스 셰어 보정 — 기후 모델이 고온 지역 증발을 과소 추정하는 것을 교정 (regions.md §2.2) */
  angelShareFactor: number;
  water: WaterId;
  overheadPerMonth: number;
  /** 설비 건설비 배수 / 숙성고 증설비 추가 배수 */
  buildCostFactor: number;
  warehouseCostFactor: number;
  /** 입고 운송 할증: 원재료·포장재·캐스크 */
  freight: { ingredients: number; packaging: number; casks: number };
  /** 국내 출고 물류비 배수 */
  outboundLogistics: number;
  /** 산지 원료 단가 배수 (원재료 id → 배수) */
  ingredientPrice: Partial<Record<string, number>>;
  /** 산지 캐스크 단가 배수 (국가 배수에 곱한다) */
  caskPriceFactor: Partial<Record<CaskTypeId, number>>;
  /** 이벤트 분류 가중치 배수 (국가 가중치에 곱한다) */
  eventWeights: Partial<Record<EventCategory, number>>;
  /** 이벤트별 가중치 배수 (이벤트 id → 배수) */
  eventBoost: Partial<Record<string, number>>;
  /** 관광·방문객 수요 — 국내 수요 배수 */
  demandFactor: number;
  /** 채용 후보 추가 인원 (인력 풀) */
  extraCandidates: number;
  /** 겨울 난방: 해당 월 난방비(원/월) + 증류 에너지비 배수 */
  heating?: { months: number[]; perMonth: number; energyFactor: number };
  /** 겨울 발효 지연: 해당 월 발효조 가동 일수 배수 (온도 제어 설비로 해소) */
  winterFerment?: { months: number[]; capacity: number };
  /**
   * 한국 전통주 자격 (주세 감면·온라인 직판) — 주원료가 모두 mainIngredients 안에 있고, 발효제는 starters만 허용.
   * 주종은 가리지 않는다. minShare = 특정 지역 원료의 최소 비중
   */
  traditional?: { label: string; mainIngredients: string[]; starters: string[]; minShare?: { ingredient: string; share: number } };
  /** 지정면세점 채널 (제주) */
  dutyFree?: boolean;
  /** 취수 허가: 월 발효 투입 용량 상한(L) + 증량 신청 */
  waterPermit?: { baseL: number; stepL: number; cost: number; months: [number, number]; chance: number };
  /** 직판장 월 기본 방문객 수 (관광 잠재력) */
  tourism: number;
  /** 산지 대표 거래: 대형 유통 납품(경기) / 위탁생산(간토) */
  deals?: ('retail' | 'oem')[];
  /** 면세 채널 월별 계절성 (관광 성수기·비수기) */
  dutyFreeSeasonality?: number[];
  /** 숙성 재고 담보대출 담보 인정 비율 (기본 0.4) */
  inventoryLtv?: number;
  /** 원액 B2B 운송비 — 섬·원거리 산지는 블렌더 매입 단가(현물·계약)가 깎인다 (결정 #68) */
  bulkFreight?: number;
  /** 지역 원료 계약재배 확대 (결정 #68): 비용을 내면 leadMonths 뒤 월 공급 한도 +stepKg, 최대 maxSteps회 */
  localSupply?: { ingredient: string; stepKg: number; cost: number; leadMonths: number; maxSteps: number };
  /** 숙성 테루아: 월평균 기온이 minTempC 이상인 달마다 축이 쌓인다 */
  terroir?: { axis: AxisId; perMonth: number; cap: number; minTempC: number }[];
  starter: { name: string; distillery: string; casks: CaskTypeId[] };
  /** 화면 표시용 특성 요약 */
  traits: { tone: 'good' | 'bad'; text: string }[];
}

const NO_FREIGHT = { ingredients: 1, packaging: 1, casks: 1 };
const bourbon = (n: number): CaskTypeId[] => Array(n).fill('ex_bourbon_barrel');

export const SITES: Record<SiteId, SiteDef> = {
  // ── 한국 ──
  gyeonggi: {
    id: 'gyeonggi', country: 'KR', nameKo: '경기', tagline: '수도권 시장 접근 — 균형형·튜토리얼', difficulty: 2, standard: true,
    tempC: [-3, 0, 6, 13, 18, 23, 26, 26, 21, 14, 6, -1],
    humidity: [60, 58, 58, 60, 65, 72, 82, 80, 74, 68, 65, 62],
    angelShareFactor: 1, water: 'medium', overheadPerMonth: 10_000_000, buildCostFactor: 1, warehouseCostFactor: 1,
    freight: NO_FREIGHT, outboundLogistics: 0.9, ingredientPrice: {}, caskPriceFactor: {}, eventWeights: {}, eventBoost: {},
    demandFactor: 1, extraCandidates: 2,
    tourism: 1000, deals: ['retail'],
    starter: { name: '윤도현', distillery: '한빛 증류소', casks: bourbon(10) },
    traits: [
      { tone: 'good', text: '국내 출고 물류비 −10%' },
      { tone: 'good', text: '채용 후보 +2명 (인력 풀이 넓다)' },
      { tone: 'bad', text: '부지·관리비가 지방보다 비싸다' },
    ],
  },
  andong: {
    id: 'andong', country: 'KR', nameKo: '안동', tagline: '전통주 감면 한도 안에서 작고 진하게', difficulty: 2,
    tempC: [-2.5, 0, 5.5, 12, 17.5, 22, 25, 25.5, 20.5, 13.5, 6.5, 0],
    humidity: [60, 57, 56, 56, 62, 70, 80, 80, 77, 72, 67, 63],
    angelShareFactor: 1, water: 'medium', overheadPerMonth: 8_000_000, buildCostFactor: 1, warehouseCostFactor: 1,
    freight: NO_FREIGHT, outboundLogistics: 1.15, ingredientPrice: { rice_domestic: 0.85 }, caskPriceFactor: {}, eventWeights: {},
    eventBoost: { competition_medal: 1.5 },
    demandFactor: 1, extraCandidates: 0,
    heating: { months: [12, 1, 2], perMonth: 800_000, energyFactor: 1.2 },
    winterFerment: { months: [12, 1, 2], capacity: 0.85 },
    // 결정 #62: 감면은 지역 농산물(안동 쌀)만 원료로 쓴 술에만. 수입 맥아·타지역 원료가 들어가면 감면 없음
    traditional: { label: '민속주 헤리티지 — 안동 쌀(지역 농산물)만 원료로 빚은 술은 전통주. 수입 맥아·타지역 원료를 쓰면 감면 없음', mainIngredients: ['andong_rice'], starters: ['nuruk'] },
    tourism: 1200,
    localSupply: { ingredient: 'andong_rice', stepKg: 400, cost: 20_000_000, leadMonths: 6, maxSteps: 3 },
    starter: { name: '권태호', distillery: '낙강 증류소', casks: [...bourbon(8), 'korean_oak_quarter', 'korean_oak_quarter'] },
    traits: [
      { tone: 'good', text: '전통주 자격: 안동 쌀(지역 농산물)로만 빚으면 주세 감면(연 5kL까지 50%·10kL까지 30%) + 온라인 직판' },
      { tone: 'good', text: '국산 쌀 계약재배 −15%, 관리비 낮음' },
      { tone: 'bad', text: '감면은 지역 농산물만: 안동 쌀은 비싸고(3,200원/kg) 계약재배 물량이 월 800kg(소주 약 2배치)뿐. 국산·수입 쌀이나 수입 맥아를 쓰면 감면 없음' },
      { tone: 'bad', text: '감면 구간이 작다: 연 10kL를 넘으면 감면 없음, 전년 25kL 초과 시 자격 상실' },
      { tone: 'good', text: '안동 쌀 계약재배 확대: 2,000만 원·6개월 뒤 월 +400kg (최대 3회) — 감면 구간을 넘어 키울지 선택' },
      { tone: 'good', text: '우리술 품평회 수상 기회 ×1.5, 가을 탈춤축제' },
      { tone: 'bad', text: '전년 출고 500kL를 넘으면 감면 자격 상실' },
      { tone: 'bad', text: '대륙성 겨울: 12~2월 발효 효율 −15%(온도 제어 설비로 해소)·난방비' },
      { tone: 'bad', text: '내륙 물류: 국내 출고 물류비 +15%' },
    ],
  },
  jeju: {
    id: 'jeju', country: 'KR', nameKo: '제주', tagline: '화산암반수와 면세점, 대신 물을 마음대로 퍼 올릴 수 없다', difficulty: 3,
    tempC: [6, 7, 10, 14, 18, 21.5, 26, 27, 23.5, 18.5, 13, 8.5],
    humidity: [68, 67, 67, 70, 75, 81, 84, 82, 76, 70, 68, 67],
    angelShareFactor: 1, water: 'volcanic', overheadPerMonth: 9_000_000, buildCostFactor: 1.2, warehouseCostFactor: 1,
    freight: { ingredients: 1.08, packaging: 1.15, casks: 1.1 }, outboundLogistics: 2, ingredientPrice: {}, caskPriceFactor: {}, eventWeights: {},
    eventBoost: { typhoon: 1.3 },
    demandFactor: 1, extraCandidates: 0,
    traditional: { label: '지역특산주 — 제주 차조 50% 이상 + 나머지 국산 쌀로 빚은 술(고소리술)은 전통주', mainIngredients: ['jeju_millet', 'rice_domestic', 'rice_processing'], starters: ['nuruk'], minShare: { ingredient: 'jeju_millet', share: 0.5 } },
    dutyFree: true,
    // 공정용수 월 15,000L — 실제 허가량(t/일)을 게임 규모로 단순화 [게임적 단순화]
    waterPermit: { baseL: 15_000, stepL: 10_000, cost: 20_000_000, months: [6, 12], chance: 0.6 },
    tourism: 2000, dutyFreeSeasonality: [1.15, 1.0, 0.75, 0.85, 1.0, 0.9, 1.4, 1.5, 0.9, 1.15, 0.75, 0.95],
    bulkFreight: 0.85,
    starter: { name: '고은별', distillery: '오름 증류소', casks: bourbon(10) },
    traits: [
      { tone: 'good', text: '화산암반수: 발효 이취 −20%, 과일향↑, 수율 +3%' },
      { tone: 'good', text: '지정면세점 채널: 관광객에게 주세·부가세 없이 판매 (1인 2L·미화 400달러 한도)' },
      { tone: 'good', text: '고소리술(제주 차조) 지역특산주 감면, 청귤 보태니컬' },
      { tone: 'bad', text: '지하수 취수 허가: 월 발효 투입 15,000L 상한 (증량 신청 가능)' },
      { tone: 'bad', text: '원액 B2B 운송비: 블렌더 매입 단가 ×0.85' },
      { tone: 'bad', text: '해운 물류: 국내 출고 물류비 ×2, 원료·포장재·캐스크 운송 할증, 건설비 +20%' },
      { tone: 'bad', text: '태풍 가중 ×1.3' },
    ],
  },
  // ── 일본 ──
  kanto: {
    id: 'kanto', country: 'JP', nameKo: '간토', tagline: '원액 공급 계약으로 버티는 표준형', difficulty: 3, standard: true,
    tempC: [3, 4, 8, 13, 18, 21, 25, 26, 22, 16, 10, 5],
    humidity: [52, 52, 58, 63, 68, 76, 78, 76, 76, 72, 66, 56],
    angelShareFactor: 1, water: 'medium', overheadPerMonth: 12_000_000, buildCostFactor: 1, warehouseCostFactor: 1,
    freight: NO_FREIGHT, outboundLogistics: 1, ingredientPrice: {}, caskPriceFactor: {}, eventWeights: {}, eventBoost: {},
    demandFactor: 1, extraCandidates: 0,
    tourism: 800, deals: ['oem'],
    starter: { name: '사토 겐타', distillery: '아카리 증류소', casks: [...bourbon(8), 'mizunara_hogshead', 'mizunara_hogshead'] },
    traits: [
      { tone: 'good', text: '일본 표준 산지 — 원액 B2B 시장이 가장 깊다(국가 공통)' },
      { tone: 'bad', text: '지진·태풍' },
    ],
  },
  kansai: {
    id: 'kansai', country: 'JP', nameKo: '오사카·교토', tagline: '명수·미즈나라·관광의 땅, 대신 지진과 땅값', difficulty: 3,
    tempC: [4.8, 5.4, 8.8, 14.4, 19.5, 23.2, 27.3, 28.5, 24.4, 18.4, 12.5, 7.2],
    humidity: [66, 65, 63, 63, 66, 72, 76, 72, 73, 72, 70, 68],
    angelShareFactor: 0.92, water: 'soft', overheadPerMonth: 13_200_000, buildCostFactor: 1, warehouseCostFactor: 1.3,
    freight: NO_FREIGHT, outboundLogistics: 1, ingredientPrice: {}, caskPriceFactor: { mizunara_hogshead: 0.8 }, eventWeights: {},
    eventBoost: { earthquake: 1.5, critic_visit: 1.3 },
    demandFactor: 1.1, extraCandidates: 0,
    tourism: 3000,
    starter: { name: '야마다 유키', distillery: '미오 증류소', casks: [...bourbon(8), 'mizunara_hogshead', 'mizunara_hogshead'] },
    traits: [
      { tone: 'good', text: '연수 명수: 발효 이취 −30%, 과일·플로럴 +10%' },
      { tone: 'good', text: '미즈나라 캐스크 추가 −20%, 세 강의 안개로 증발이 약간 적다' },
      { tone: 'good', text: '간사이 인바운드 관광: 국내 수요 +10%, 평론가 방문 ×1.3' },
      { tone: 'bad', text: '지진 가중 ×1.5 — 내진 개량 없으면 피해 100%' },
      { tone: 'bad', text: '땅값: 관리비 ×1.1, 숙성고 증설비 ×1.3' },
    ],
  },
  hokkaido: {
    id: 'hokkaido', country: 'JP', nameKo: '홋카이도', tagline: '싸고 느린 땅에 오래 묵히는 재고전', difficulty: 4,
    tempC: [-3.5, -3, 0.5, 6, 11, 15, 19.5, 21, 17, 10.5, 4, -1],
    humidity: [76, 74, 70, 68, 72, 78, 82, 81, 78, 74, 74, 76],
    angelShareFactor: 0.74, water: 'medium', overheadPerMonth: 10_800_000, buildCostFactor: 1, warehouseCostFactor: 0.7,
    freight: NO_FREIGHT, outboundLogistics: 1.25, ingredientPrice: {}, caskPriceFactor: {}, eventWeights: {}, eventBoost: {},
    demandFactor: 1, extraCandidates: 0,
    heating: { months: [11, 12, 1, 2, 3], perMonth: 4_000_000, energyFactor: 1.6 },
    tourism: 900, inventoryLtv: 0.6,
    starter: { name: '오노 다이치', distillery: '시라카바 증류소', casks: bourbon(10) },
    traits: [
      { tone: 'good', text: '싼 땅: 관리비 ×0.9, 숙성고 증설비 ×0.7' },
      { tone: 'good', text: '낮은 증발(연 약 1.5%) — 장기 숙성 손실이 가장 적다' },
      { tone: 'good', text: '감자 쇼추, 석탄 직화 증류기(바디·오일리↑, 숙련 요구)' },
      { tone: 'bad', text: '난방: 11~3월 난방비 월 400만 원 + 증류 에너지비 ×1.6' },
      { tone: 'bad', text: '본토 출고 물류비 +25% (해협 운송)' },
      { tone: 'bad', text: '숙성이 느리다 (간토의 약 70%) — 데스밸리가 길다' },
      { tone: 'bad', text: '폭설: 1~2월 생산 중단 위험' },
    ],
  },
  // ── 대만 ──
  yilan: {
    id: 'yilan', country: 'TW', nameKo: '이란', tagline: '4~6년에 완성되는 빠른 싱글 몰트, 오래 두면 통이 비어 간다', difficulty: 3, standard: true,
    tempC: [16, 16, 18, 21, 25, 27, 29, 29, 27, 24, 21, 17],
    humidity: [83, 84, 83, 82, 82, 82, 78, 79, 80, 82, 83, 82],
    // 카발란 창립자 발언 기준 연 10~12% → 모델 4.37% × 2.29 ≒ 10%
    angelShareFactor: 2.29, water: 'medium', overheadPerMonth: 7_000_000, buildCostFactor: 1, warehouseCostFactor: 1,
    freight: NO_FREIGHT, outboundLogistics: 1, ingredientPrice: {}, caskPriceFactor: {}, eventWeights: {}, eventBoost: {},
    demandFactor: 1, extraCandidates: 0,
    terroir: [{ axis: 'tropical', perMonth: 0.1, cap: 30, minTempC: 25 }],
    tourism: 1500,
    starter: { name: '린즈하오', distillery: '란양 증류소', casks: bourbon(10) },
    traits: [
      { tone: 'good', text: '빠른 숙성: 스페이사이드의 약 2.4배' },
      { tone: 'good', text: '열대 테루아: 더운 달마다 열대과일향이 쌓인다' },
      { tone: 'bad', text: '증발 연 약 10% — 10년 뒤 잔량 약 36%' },
      { tone: 'bad', text: '고온 오버오크: 장기 숙성은 리필 캐스크로' },
      { tone: 'bad', text: '태풍·지진' },
    ],
  },
};

/** 국가별 표준 산지 */
export const DEFAULT_SITE: Record<RegionId, SiteId> = { KR: 'gyeonggi', JP: 'kanto', TW: 'yilan' };

export function siteOf(s: Pick<GameState, 'siteId' | 'regionId'>): SiteDef {
  return SITES[s.siteId] ?? SITES[DEFAULT_SITE[s.regionId] ?? 'gyeonggi'];
}

export function sitesOf(country: RegionId): SiteDef[] {
  return Object.values(SITES).filter((x) => x.country === country);
}

/** 원재료 가격 배수 = 산지 원료 단가 × 입고 운송 할증 (에너지는 제외) */
export function siteIngredientFactor(site: SiteDef, ingredientId: string): number {
  if (ingredientId === 'energy') return 1;
  return (site.ingredientPrice[ingredientId] ?? 1) * site.freight.ingredients;
}

// ── 지정면세점 채널 (제주) [추정] ──
// JDC 지정면세점 주류 매출을 연 약 24만 케이스로 추정 (관광객 내국인 1인 2L·미화 400달러 한도)
export const DUTY_FREE = {
  market: { whisky: 120_000, blended_whisky: 60_000, grain_whisky: 10_000, soju_distilled: 25_000, gin: 10_000, malt_spirit: 5_000, flavored_spirit: 10_000, baijiu: 0 } as Record<ProductCategory, number>,
  /** 단일 브랜드 점유 상한 — 지역 상품 진열 */
  shareCap: 0.02,
  /** 면세 소비자가 = 출고가 × 면세점 마진 (주세·부가세 없음) */
  markup: 1.6,
  /** 면세 기준가 = 국내 기준 소비자가 × 이 비율 */
  refFactor: 0.6,
  /** 1인 구매 한도 미화 400달러 ≒ 55만 원 [환율 가정] — 이보다 비싼 병은 팔 수 없다 */
  maxBottlePrice: 550_000,
  /** 면세 전용 한정판(결정 #65): 전용 매대 점유 상한 배수 [튜닝] — 첫 밸런스(×2) 20/20 지배라 보너스 없음 (결정 #68) */
  limitedShareCap: 1,
  /** 한정판 시리즈 (결정 #70) [튜닝] — 전용 매대 1칸, 산지 원료 기념품만 매력도 보너스(위스키 한정판은 없음),
   *  출시 6개월 안에 완판하면 다음 판 매력도 +3%(최대 3연속 +9%)·인지도 +0.5%p, 12개월 안에 못 팔면 국내 매대로 넘어가고 연속 기록 초기화 */
  slots: 1,
  localAppeal: 1.1,
  /** 숙성 한정판 (결정 #72) [튜닝]: 제주 원료가 아닌 위스키 한정판은 숙성 연수로 매력도 보너스 — 면세점은 연수 표기 한정판이 주력. 높은 구간 하나만 */
  agedTiers: [{ years: 10, appeal: 1.15 }, { years: 8, appeal: 1.1 }, { years: 6, appeal: 1.05 }] as { years: number; appeal: number }[],
  sellOutMonths: 6,
  returnMonths: 12,
  streakAppeal: 0.03,
  maxStreak: 3,
  sellOutAwareness: 0.005,
  /** 관광객 입소문 (결정 #70): 면세 판매 1병을 입소문 계산에서 이 배수로 친다 — 출도 관광객이 육지로 가져간다 */
  wordOfMouthWeight: 2,
};
