// ── 시뮬레이션 핵심 타입 ──
// 단위: 액량 L, 알코올 LPA(= L × ABV), ABV 0~1, 금액 KRW 정수, 시간 = 시작부터의 월 인덱스

export type AxisId =
  | 'fresh_fruit' | 'tropical' | 'citrus' | 'dried_fruit' | 'vinous' | 'orchard'
  | 'floral' | 'herbal' | 'juniper' | 'botanical_spice'
  | 'cereal' | 'cooked_agave' | 'nuruk_rice' | 'sorghum_grain' | 'cane' | 'toasted_grain'
  | 'peat_smoke' | 'earthy' | 'funk' | 'fermented_umami'
  | 'vanilla_caramel' | 'oak_tannin' | 'wood_spice' | 'nutty_rancio' | 'incense'
  | 'sulfur_meaty' | 'oily_waxy'
  | 'solvent' | 'feinty' | 'acetic' | 'musty'
  // 구조 속성
  | 'body' | 'sweetness' | 'harshness' | 'integration' | 'color';

export type Flavor = Partial<Record<AxisId, number>>;

/** 블렌딩 레이더 6스탯 (결정 #121) — 36축 향미의 선형 투영. 투영 가중치는 blendRadar.ts */
export type HexAxis = 'peat' | 'fruit' | 'floral' | 'spicy' | 'woody' | 'sweet';
export type Hex = Record<HexAxis, number>;

/** 생산 주종 (원액 기준) */
export type SpiritKind = 'soju' | 'gin' | 'malt' | 'grain' | 'baijiu';

/** 시작·운영 지역 */
export type RegionId = 'KR' | 'JP' | 'TW';

/** 판매 카테고리 (라벨 판정 결과) */
export type ProductCategory = 'soju_distilled' | 'gin' | 'whisky' | 'grain_whisky' | 'blended_whisky' | 'baijiu' | 'malt_spirit' | 'flavored_spirit';

export type YeastId = 'distillers' | 'ale' | 'nuruk_native';
export type FermenterType = 'stainless' | 'onggi';
export type StillType = 'pot_onion' | 'pot_lantern' | 'hybrid' | 'vacuum_pot' | 'column';
export type CondenserType = 'copper_shell' | 'worm_tub';
/** 숙성 용기 재질 (S-10, #143) — 나무 캐스크 외에 옹기·스테인리스 휴지. 재질은 콘텐츠(CaskDef.material)에 있고 캐스크 인스턴스는 typeId로 찾는다 */
export type VesselMaterial = 'wood' | 'onggi' | 'steel';
/** 숙성 용기 종류 — 나무 캐스크 + 비목재 용기(옹기, #161). 재질은 CaskDef.material */
export type CaskTypeId = 'ex_bourbon_barrel' | 'oloroso_butt' | 'korean_oak_quarter' | 'mizunara_hogshead' | 'onggi_jar';
/** 'none' = 나무가 아닌 용기(옹기 등) — 목재 추출이 없다. 용기 재질 판정은 CaskDef.material이 한다 */
export type WoodId = 'american_oak' | 'european_oak' | 'korean_oak' | 'mizunara' | 'none';
export type StaffRole = 'distiller' | 'warehouse' | 'sales' | 'office' | 'blender';

export interface Recipe {
  id: string;
  name: string;
  kind: SpiritKind;
  /** 원재료 배합 (kind = soju/malt). 비율 합 = 1 */
  mashBill: { ingredientId: string; ratio: number }[];
  /** 진 보태니컬 g/L(차지 기준) */
  botanicals: { botanicalId: string; gramsPerL: number }[];
  botanicalMethod: 'steep' | 'vapor';
  yeast: YeastId;
  fermentDays: number;
  runs: 1 | 2;
  /** 최종 회차의 컷 (0~1 진행축) */
  cut: { c1: number; c2: number };
  pressure: 'atmospheric' | 'vacuum';
  /** 사용할 증류기 인스턴스 */
  stillId: string;
}

export interface EquipmentInstance {
  id: string;
  catalogId: string;
  /** 설치 완료 월 (그 전에는 사용 불가) */
  readyMonth: number;
  /** 증류기: 재사용 페인츠(LPA) */
  feintsLPA?: number;
}

export interface SpiritLot {
  id: string;
  name: string;
  kind: SpiritKind;
  volumeL: number;
  abv: number;
  flavor: Flavor;
  createdMonth: number;
  /** 오크 숙성 개월 (탱크 원액은 0). 블렌딩 시 최저값이 숙성 연수 */
  oakMonths: number;
  /** 나무가 아닌 용기(옹기·스테인리스)에서 쉰 개월 — oakMonths와 따로 센다. 위스키 법정 숙성(나무통)에는 들어가지 않는다 (S-10) */
  restMonths?: number;
  /** 거쳐 온 숙성 용기 (피니싱 이력, S-10). 없으면 지금 캐스크 하나뿐 */
  caskHistory?: CaskStint[];
  sourced: boolean;
  /** 누적 원가(원/LPA) — 원재료·에너지·매입가 */
  costPerLPA: number;
  recipeId?: string;
  /** 생산 배치 id — 같은 배치에서 나눠 통입한 캐스크를 묶어(코호트) 보여 주는 키 (architecture §3.4). 옛 세이브·매입 원액은 없다 */
  batchId?: string;
  /** 원재료 배합 비율(레시피 기준) — 특산물·버번 옥수수 51% 같은 원료 규정 판정용 */
  mashShare?: Record<string, number>;
  /** 입지 원료(제주 차조·청귤 등)를 쓴 원액 — 면세 기념품 매력도 (결정 #87) */
  localIngredient?: boolean;
}

/** 원액이 거쳐 간 숙성 용기 한 구간 — 피니싱(다른 캐스크로 옮겨 마무리)의 이력 (S-10, #143). 원액이 들고 다닌다 */
export interface CaskStint {
  typeId: CaskTypeId;
  /** 이 용기에 들어간 달 */
  fromMonth: number;
  /** 이 용기에서 보낸 개월 (옮길 때 확정) */
  months: number;
}

/** 샘플 한 번으로 알게 된 것 (#136, S-10) — 참값이 아니라 그때 읽은 추정치를 **그대로 남긴다**. 다음 샘플 전까지 갱신되지 않는다 */
export interface SampleRecord {
  month: number;
  /** 읽은 육각형 (지각 오차 포함) */
  hex: Hex;
  /** 그 읽기의 오차(1σ, 육각형 점수) */
  sigma: number;
  /** 추정 품질 (참 품질 + 오차) */
  estQuality: number;
  /**
   * 위스키가 아닌 원액(소주·진·고량주)은 그 주종의 레이더 축으로도 읽는다 (지각 오차 포함) — 육각형은 위스키 축이라
   * 소주 그래프를 그릴 수 없었다(2차 플레이테스트 2026-11-08: 옹기 소주 샘플을 떠도 향미 그래프가 안 나옴). 옛 기록에는 없다
   */
  axes?: Partial<Record<AxisId, number>>;
}

export interface Cask {
  id: string;
  typeId: CaskTypeId;
  sizeL: number;
  wood: WoodId;
  /** 목재 추출 활성도 0~1.3 */
  activity: number;
  /** 시즈닝 향 잔존 0~1 */
  seasoning: number;
  fills: number;
  recharCount: number;
  char: number;
  contents?: SpiritLot;
  filledMonth?: number;
  /** 숙성고 위치: 숙성고 id + 단(0 = 맨 아래) */
  slot?: { w: string; tier: number };
  /** false면 활성도를 아직 모른다 (스팟 매입 통 — 골빈 통일 수 있음) */
  activityKnown?: boolean;
  /** 오염(TCA·곰팡이) — 숙성고 QC가 찾아내기 전까지는 모른다 */
  contamination?: 'tca' | 'mold';
  contaminationKnown?: boolean;
  /** 캐스크 오너십으로 판 통 — 고객 소유, 병입·판매 불가 */
  owner?: { name: string; soldMonth: number; deliverMonth: number };
  /** 블렌딩 테이블 (결정 #124): 블렌더가 이 캐스크에서 샘플을 뜬 횟수 — 읽는 오차가 1/√(1+n)로 준다 */
  samples?: number;
  /** 실험실(GC) 분석을 맡겼다 — 피트·우디 두 축은 정확히 안다 */
  labAnalyzed?: boolean;
  /** 레어 캐스크 (숨김값) — 추출이 남달리 강해 육각형의 꼭짓점이 된다. 통입 때 정해지고 샘플링·감정력으로 드러난다 */
  rare?: boolean;
  rareKnown?: boolean;
  /** 핸드필 존 전용 통 (#233) — 비지터 센터 방문객이 이 통에서 직접 병에 담아 간다. 한 번에 하나 */
  handfill?: boolean;
  /** 최근 샘플 기록 (최대 SAMPLE_LOG_KEPT개, 오래된 것부터) — MVP 숙성고 화면은 참값 대신 이것만 보여 준다 (#136) */
  sampleLog?: SampleRecord[];
}

/** 브랜드 라인 (S-2, PRD §11.2 ④) — 하우스(회사명)와 세컨드 브랜드. 대중 인지도와 브랜드 럭셔리를 라인별로 둔다 (#54) */
export interface BrandLine {
  id: string;
  name: string;
  /** 하우스 브랜드(회사명) — 정확히 1개, 삭제 불가 */
  isHouse: boolean;
  openedMonth: number;
  /** 국내 대중 인지도 0~1 (옛 commerce.awareness). 수출 시장 인지도는 아직 회사 단위(commerce.exports[].awareness) — 브랜드 × 시장은 단계 P(MKT) */
  awareness: number;
  /** 브랜드 럭셔리 B_brand 0~100 (PRD §11.2 ③) — #235로 매달 계산(brands.ts updateBrandLuxury) */
  luxury: number;
  /** 세컨드 브랜드의 월 마케팅비(원, PRD §11.2 ④ "브랜드별 집행"). 하우스는 쓰지 않는다 — 하우스 예산은 commerce.marketingBudget. 없으면 0 */
  marketingBudget?: number;
}

export interface Product {
  id: string;
  name: string;
  /** 브랜드 라인 id (S-2) — 없으면 하우스 브랜드 */
  brandId?: string;
  category: ProductCategory;
  ageYears: number | null;
  /** 최저 오크 숙성 개월 (어린 위스키 인식 할인용) */
  oakMonths?: number;
  /**
   * 최저 비목재 용기(옹기) 숙성 개월 — 섞은 원액의 `SpiritLot.restMonths` 중 가장 짧은 값. 숙성 소주 표기("옹기 N년 숙성")와
   * 그 판매 효과([결정 #217], PRD §9.2)에 쓴다. 병입이 채운다(PROD). 없으면 0으로 읽는다(옛 제품·탱크 원액) — 스키마 버전 그대로(#187)
   */
  restMonths?: number;
  abv: number;
  bottleMl: number;
  chillFiltered: boolean;
  packagingId: string;
  /** 패키징 부품·원가·럭셔리 (#248) — 병입 때 고정. 없으면(옛 제품) packagingId 프리셋으로 읽는다(packaging.ts productPackaging) */
  packaging?: ProductPackaging;
  flavor: Flavor;
  quality: number;
  typicity: number;
  style: string | null;
  sourcedShare: number;
  /** 매입 원액의 브랜드 가치 0~1 — 비싸게 사 온 원액일수록 높다 (매입 원액이 없으면 1) */
  sourcedPrestige?: number;
  /** 지역 특산물 표기 (예: 대만 진먼섬의 진먼 고량주) */
  specialty?: string;
  /** 지역 프리미엄 표기 충족 여부 (예: 재패니즈 위스키) */
  premiumLabel?: boolean;
  /** 전통주(지역특산주) 주세 경감 대상 */
  traditional?: boolean;
  /** 피니싱 캐스크 종류 — 라벨 "○○ 캐스크 피니시" (PRD §5.2). 없으면 피니싱 안 함. 병입 규칙은 PROD, 라벨의 판매 효과(럭셔리 라벨 항·매니아 선호, §11.2)는 MKT (v14) */
  finish?: CaskTypeId;
  /** 섞은 원액의 통 구성 — 마지막에 담겨 있던 통 종류별 알코올(LPA) 비중, 큰 순. 탱크 원액은 빠진다. 없으면 기록 전 제품(v15 이전)이거나 캐스크 원액이 없다. 표시용(동작 없음, #176) */
  caskMix?: { typeId: CaskTypeId; share: number }[];
  /** 섞은 원액의 레시피 (#243) — 자동 납품이 같은 레시피 원액만 쓰게 한다. 옛 제품은 없다(모든 원액) */
  recipeIds?: string[];
  stockBottles: number;
  /** 출고가(세전) / 병 */
  price: number;
  /** 자동 최적 가격 (#200) — 켜 두면 매달 판매 직전에 이번 달 이익이 가장 큰 값으로 바뀐다(economics.applyAutoPrices). 옛 세이브에는 없다 = 끔 */
  autoPrice?: boolean;
  /** 자동 납품 (#206) — 몇 개월분 재고를 유지할지(1·2·3·6). 켜 두면 매달 판매 직전에 모자란 만큼 원액을 골라 재고 보충(economics.applyAutoRestock). 없으면 끔 */
  autoRestock?: number;
  /** 자동 납품이 쓸 통의 최소 숙성(개월, #267) — 없으면 제품 표기 연수. 표기보다 낮추면 보충할 때 표기도 그만큼 내려갈 수 있다 */
  autoRestockMinMonths?: number;
  /** 수출 안 함 (#266) — 켜면 이 제품은 수출 시장(공항 면세점 포함)에 내지 않는다. 국내·지정면세점(제주) 판매는 그대로. 옛 세이브에는 없다 = 수출에 낸다 */
  noExport?: boolean;
  /** 병당 생산 원가 = 원액 + 포장 + 병입 인건비 (유통비 제외) */
  unitCost: number;
  createdMonth: number;
  lastMonthSold: number;
  totalSold: number;
  /** 월 판매량 지수이동평균 — 재고 적체 판정 */
  salesEma?: number;
  /** 첫 위스키 출시 오픈런 효과 */
  launchBoost?: { factor: number; untilMonth: number };
  /** 블렌딩 결과 육각형 (실제값, 결정 #124) */
  hex?: Hex;
  /** 목표 매칭 결과 — 트렌드·평론가 의뢰·코어 레인지 */
  blend?: { targetId: string; source: TargetSource; label: string; score: number; delegated: boolean; untilMonth?: number; appealBonus?: number };
  /** 코어 레인지 라인 이름 */
  line?: string;
  /** 레어 캐스크 싱글 캐스크 병입 */
  rareSingleCask?: boolean;
  /** 면세 전용 한정판 (제주, 결정 #87) — 국내 판매 없음 */
  dutyFreeOnly?: boolean;
  /** 입지 원료 제품 — 모든 구성 원액이 입지 원료 원액일 때 */
  localIngredient?: boolean;
  /** 면세 한정판 시리즈: 판 번호, 출시 시점 연속 완판 수, 판정 끝남 */
  dfEdition?: { vol: number; streak: number; done?: boolean };
  /** 지난달 판매 중 면세 채널 몫 */
  lastMonthDutyFree?: number;
}

export interface StaffStats { a: number; b: number; c: number }

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  level: number;
  xp: number;
  /** 직군별 스탯: distiller(후각, 공정, 직관) / warehouse(관찰, 환경통제, 성실) / sales(친화, 네트워크, 협상) / office(세무, 협상, 행정) / blender(후각, 미각, 감정력 — 결정 #123) */
  stats: StaffStats;
  salary: number;
  hiredMonth: number;
  /** 입사 시 나이 — 나이가 들면 스탯이 꺾이고 65세에 은퇴 (에이징 커브) */
  ageAtHire?: number;
  /** 부사수: 이 직원을 가르치는 마스터 디스틸러 id */
  apprenticeOf?: string;
  /** 사기 0~100 (#225). 없으면 70으로 읽는다 — 옛 세이브·창업 멤버·HR이 잠긴 시나리오 */
  morale?: number;
  /** 성격 특성 (#225). 없으면 없음 */
  traits?: StaffTrait[];
}

/** 성격 특성 (#225, 1단계는 MGT 효과만): 멘토 / 철새 / 토박이 / 협상가 */
export type StaffTrait = 'mentor' | 'drifter' | 'loyal' | 'negotiator';

export interface Candidate extends Staff { askSalary: number }

export interface Loan {
  id: string;
  offerId: string;
  name: string;
  principal: number;
  balance: number;
  annualRate: number;
  termMonths: number;
  /** 거치 기간 이후 원리금 균등 상환액 */
  monthlyPayment: number;
  graceMonths: number;
  startMonth: number;
}

export interface BrokerOffer {
  id: string;
  description: string;
  cask: Cask;
  price: number;
  expiresMonth: number;
}

export interface ProductionOrder { recipeId: string; batchesPerMonth: number }

/** 원액 공급 계약 조건 (블렌디드 위스키 회사·브로커) */
export interface ContractTerms {
  id: string;
  buyerId: string;
  buyerName: string;
  /** 납품 원액: 몰트·그레인 뉴메이크 (버번은 켄터키 지역과 함께) */
  spirit: 'malt_newmake' | 'grain_newmake';
  /** 크래프트 프리미엄 계약 — 소량·고단가 (독립 병입자·크래프트 블렌더) */
  craft?: boolean;
  /** 국내 블렌더 — 국산 원액 프리미엄 적용 */
  domestic: boolean;
  style: 'any' | 'unpeated' | 'peated';
  lpaPerMonth: number;
  termMonths: number;
  pricePerLPA: number;
  minQuality: number;
  /** 계약 총액 중 선급금 비율 (0이면 선급 없음) */
  prepayShare: number;
  penaltyPerLPA: number;
}
export interface ContractOffer extends ContractTerms { expiresMonth: number }
export interface Contract extends ContractTerms {
  startMonth: number;
  monthsDone: number;
  deliveredLPA: number;
  shortfallLPA: number;
  /** 아직 납품으로 상계되지 않은 선급금 */
  prepaidRemaining: number;
}

/** 턴 사이 행동(즉시 입출금)의 현금 흐름 항목 — 분류는 cashflow.ts의 CASH_FLOW_LINES */
export type CashFlowKey =
  | 'spotBulk' | 'caskBid' | 'caskOwnership' | 'contractPrepay' | 'contractCancel' | 'bottling' | 'blending' | 'severance' | 'rotation' | 'event' | 'brokerCask' | 'export' | 'other'
  | 'casks' | 'usedCask' | 'equipment'
  | 'loan' | 'loanRepay' | 'investment';
/** 항목별 현금 흐름. 부호: 입금 +, 출금 − */
export type CashFlows = Partial<Record<CashFlowKey, number>>;

export interface MonthReport {
  month: number;
  /** 제품(병입) 매출 */
  revenue: number;
  expenses: Record<string, number>;
  /** 직전 결산 이후 현금 변화 = 이번 결산 월말 현금 − 직전 결산 월말 현금 (턴 사이 행동 포함) */
  netCash: number;
  cashEnd: number;
  /** 월말 순자산 (#146, progress.netWorth) — MVP 화면의 현금·평가액 곡선(#138). 구버전 세이브의 보고서에는 없다 */
  netWorth?: number;
  sales: { productId: string; name: string; bottles: number; revenue: number; demandBottles: number }[];
  /** 원액 계약 납품 */
  bulk: { contractId: string; buyerName: string; deliveredLPA: number; revenue: number; penalty: number }[];
  /** 원액 계약 납품 매출 (현물 판매는 spotBulkRevenue) */
  bulkRevenue: number;
  /** 원액 현물 판매(탱크 로트·캐스크째, sellBulk) + 독립 병입자 캐스크 매각(acceptCaskBid). 구버전 세이브의 보고서에는 없다 */
  spotBulkRevenue?: number;
  /** 직전 결산 이후 턴 사이 행동으로 생긴 현금 흐름 (부호: 입금 +, 출금 −). 구버전 세이브의 보고서에는 없다 */
  offTurn?: CashFlows;
  /** 순현금 분해: 영업 + 투자 + 재무 = netCash. 투자 = 설비·빈 캐스크 매매, 재무 = 대출 실행·상환(정기 원금 포함)·투자 유치 */
  operatingCash?: number;
  investingCash?: number;
  financingCash?: number;
  /** 계약 납품 중 선급금으로 상계한 금액 (현금은 안 들어옴) — 영업에는 납품 매출로, 재무에는 선급금 상환으로 잡는다 */
  prepayApplied?: number;
  /** 계약 만료·파기 때 돌려준 남은 선급금 (재무) */
  prepayRefunded?: number;
  production: { recipeId: string; name: string; batches: number; lpa: number; cost: number }[];
  /** 위스키 원액 생산 건너뛰기 (#249 ④) — 월초 현금이 고정비 보름치 아래라 몰트·그레인을 만들지 않았다. 화면 맨 위 알림용 */
  whiskySkipped?: { cash: number; threshold: number };
  angelsShareL: number;
  liquorTaxRemitted: number;
  /** 이번 달 발생한 이벤트 제목 */
  events: string[];
  /** 소매 처리 역량(9L 케이스)과 실제 판매 — 초과분은 고비용 채널 */
  retailCapacityCases?: number;
  retailSoldCases?: number;
  overflowCases?: number;
  lostSalesBottles?: number;
  visitors?: number;
  /** 이번 달 평년 대비 외기 편차 (기상 이상치 + 이벤트 충격, 결정 #120) */
  weather?: { tempAnom: number; humidAnom: number; shocks: string[] };
  tourismRevenue?: number;
  /** 수출 판매 (#95) */
  exports?: ExportSale[];
  exportRevenue?: number;
  /** 입지 특성 (결정 #86~) */
  dutyFreeBottles?: number;
  /** 면세 판매 입소문으로 오른 인지도 */
  dutyFreeAwareness?: number;
  retailDealRevenue?: number;
  oemRevenue?: number;
  /** 매출채권 입금 (대형 유통 납품 대금) */
  receivablesCollected?: number;
  /** 매출이 아닌 입금 (MGT) — 보험금(재해 보상, #171)·선도계약 정산으로 받은 돈(#179). 낸 정산액은 expenses.hedge. 구버전 세이브의 보고서에는 없다 */
  otherIncome?: Partial<Record<'insurance' | 'hedge', number>>;
  notes: string[];
}

/** 대형 유통 납품 계약 (경기, 결정 #88) — 정해진 물량을 할인 단가에 납품, 대금은 몇 달 뒤 */
export interface RetailTerms {
  id: string;
  partner: string;
  category: ProductCategory;
  bottlesPerMonth: number;
  /** 납품 단가 = 제품 출고가 × priceFactor */
  priceFactor: number;
  termMonths: number;
  /** 대금 지급까지 개월 수 */
  paymentDelay: number;
  penaltyPerBottle: number;
}
export interface RetailOffer extends RetailTerms { expiresMonth: number }
export interface RetailContract extends RetailTerms { startMonth: number; monthsDone: number; delivered: number; shortfall: number }

/** 위탁생산(OEM) 계약 (간토, 결정 #89) — 원료는 위탁사 부담, 가공비를 받고 증류 설비를 내준다 */
export interface OemTerms {
  id: string; buyerName: string; batchesPerMonth: number; feePerBatch: number; termMonths: number; penaltyPerBatch: number;
  /** 전용 증류기 설치 지원형: 위탁사가 설비 패키지(증류기 + 발효조 2기) 설치비 일부를 체결 시 지원 */
  dedicated?: boolean;
  capexSupport?: number;
}
export interface OemOffer extends OemTerms { expiresMonth: number }
export interface OemContract extends OemTerms { startMonth: number; monthsDone: number; missed: number; /** 전용 증류기 설비 id */ stillId?: string }

/** 매출채권 — 결제 지연 대금 */
export interface Receivable { dueMonth: number; amount: number; label: string }

/** 입지 고유 상태 (결정 #86~) */
export interface SiteState {
  /** 취수 허가량 — 월 발효 투입 용량 상한(L). 제주 */
  waterPermitL?: number;
  /** 취수 증량 신청 — 결정 월에 승인 여부가 정해진다 */
  permitApplication?: { decideMonth: number; addL: number; chance: number };
  /** 면세 한정판 시리즈 — 마지막 판 번호와 연속 완판 수 (제주) */
  dfSeries?: { vol: number; streak: number };
}

/** 기간 한정 보정치 — 이벤트·시장 국면이 만든다. key 예: 'ingredient:malt_unpeated', 'demand:whisky', 'appeal:peated' */
export interface Modifier {
  id: string;
  key: string;
  factor: number;
  /** 적용 시작 월(포함) */
  fromMonth: number;
  /** 적용 종료 월(미포함) */
  untilMonth: number;
  label: string;
}

export interface EventChoiceView { label: string; detail: string }

/** 플레이어 선택을 기다리는 이벤트 (다음 턴까지 고르지 않으면 기본 선택지 적용) */
export interface PendingEvent {
  id: string;
  defId: string;
  title: string;
  text: string;
  month: number;
  choices: EventChoiceView[];
  defaultChoice: number;
}

/** 예보 — 이벤트가 몇 달 앞서 예고된다. 빗나갈 수 있다 */
export interface Forecast {
  id: string;
  defId: string;
  title: string;
  text: string;
  fireMonth: number;
  certainty: number;
}

export interface EventLogEntry { month: number; title: string; text: string }

/** 독립 병입자(IB)의 캐스크 매입 제안 */
export interface CaskOrder {
  id: string;
  typeId: CaskTypeId;
  qty: number;
  arriveMonth: number;
  source: 'cooperage' | 'seasoning';
}

export interface CaskBid { id: string; buyerName: string; caskId: string; price: number; expiresMonth: number }

// ───────────── 게임 상태 v6 — 도메인 슬라이스 (PRD 결정 #118, docs/design/architecture.md §3.3) ─────────────
// 권위 상태는 하나. 헤더(시간·지역·시드)는 루트에, 도메인 데이터는 슬라이스에 둔다.
// 한 슬라이스는 한 시스템 묶음이 "주로" 쓰지만, 월 틱은 슬라이스를 가로지르는 하나의 트랜잭션이다.

/** 월 기상 이상치 — 입지 평년값에 더한다 (AR(1), PRD 결정 #120). 이벤트 충격(폭염·한파)도 여기에 더해진다 */
export interface WeatherState {
  /** 이번 달 기온 이상치(°C) — 난수 성분 */
  tempAnom: number;
  /** 이번 달 상대습도 이상치(%p) — 난수 성분 */
  humidAnom: number;
  /** 이벤트 충격(°C·%p) — 기간 한정, 난수 성분과 별도로 더한다 */
  shocks: { id: string; label: string; tempC: number; humidity: number; fromMonth: number; untilMonth: number }[];
}

/** 연구 상태 (docs/design/tech-tree.md §7). Phase 1은 연구 시스템 없이 isUnlocked 조회 구조만 쓴다 */
export interface ResearchState {
  /** 완료한 테크 노드 id */
  unlocked: string[];
  /** 진행 중인 연구 (S-6). progress 0~1. 담당자가 없거나 일시정지면 진행·비용이 멈춘다 */
  active: { techId: string; progress: number; leadStaffId?: string; paused: boolean; startedMonth?: number; spent?: number }[];
  /** 동시 연구 슬롯 */
  slots: number;
}

/** 품절·단종 제품 요약 — 향미 객체 없이 이력만 남긴다 (데이터 수명 관리, architecture §3.7) */
export interface ProductArchiveEntry {
  id: string;
  name: string;
  category: ProductCategory;
  createdMonth: number;
  lastMonthSold: number;
  totalSold: number;
  quality: number;
  price: number;
}

/** 연 요약 — 상세 월 리포트가 잘려 나가도 장기 차트를 그릴 수 있게 */
export interface YearSummary {
  year: number;
  revenue: number;
  bulkRevenue: number;
  expenses: number;
  cashEnd: number;
  /** 연말 순자산 (#146). 구버전 세이브에는 없다 */
  netWorthEnd?: number;
  bottlesSold: number;
  lpaProduced: number;
  angelsShareL: number;
  filledCasksEnd: number;
}

/** 블렌딩 목표의 출처 (결정 #124) */
export type TargetSource = 'trend' | 'critic' | 'core';

/** 향미 트렌드 이동 — 시장 국면 이벤트가 만든다 (결정 #125: 옛 appeal:peated·appeal:sherried 보정치를 대체).
 *  제품 육각형의 axis 값이 lo 이하면 효과 없음, hi 이상이면 매력도 × (1 + strength), 사이는 선형 */
export interface TrendShift {
  id: string;
  label: string;
  axis: HexAxis;
  strength: number;
  lo: number;
  hi: number;
  fromMonth: number;
  untilMonth: number;
}

/** 평론가·바·매체의 블렌딩 의뢰 (결정 #124) — 가상 의뢰처만 쓴다(실존 인물 발언 금지, PRD §11.1) */
export interface BlendCommission {
  id: string;
  client: string;
  label: string;
  hex: Hex;
  /** 이 거리에서 약 61점 — 좁을수록 까다롭다 */
  tolerance: number;
  weights?: Partial<Record<HexAxis, number>>;
  expiresMonth: number;
  /** 보상: 인지도 + 그 제품의 매력도 가산(점수 비례, months개월) */
  reward: { awareness: number; appealBonus: number; months: number };
  /** 이 의뢰로 병입한 제품 */
  fulfilledBy?: string;
}

/** 코어 레인지 — 같은 라인의 다음 배치는 기준 육각형과의 일관성으로 평가된다 */
export interface CoreLine { refHex: Hex; batches: number; lastScore: number | null; createdMonth: number }

/** 경쟁 AI 증류소 (S-12, PRD §9.4) — 자리만. 지금은 배경 공급(시세 랜덤 워크)이 시장을 대신하고, 목록은 비어 있다 */
export interface RivalDistillery {
  id: string;
  name: string;
  regionId: RegionId;
  /** 이 카테고리 국내 시장에서 경쟁한다 */
  categories: ProductCategory[];
  /** 인지도 0~1 — 수요 공식에서 시장 몫을 나눈다(규칙은 단계 P) */
  awareness: number;
  quality: number;
}

/** 원재료 선도계약 (S-11, PRD §8.4) — 자리만. 지정 기간 동안 월 구매량을 고정 가격 지수로 산다(규칙은 단계 P, 틱 2단계 원가) */
export interface ForwardContract {
  id: string;
  ingredientId: string;
  kgPerMonth: number;
  /** 고정 가격 지수 (1 = 기준가) */
  priceIndex: number;
  fromMonth: number;
  untilMonth: number;
}

/** 보험 (S-11, PRD §8.4) — 자리만. 보험료는 틱 7단계, 보상은 사고(이벤트) 때(규칙은 단계 P) */
export interface InsurancePolicy {
  id: string;
  kind: 'property' | 'inventory' | 'business_interruption' | 'product_liability' | 'credit';
  premiumPerMonth: number;
  /** 보상 한도 (원) */
  coverage: number;
  fromMonth: number;
}

/** 이사회 (S-11, PRD §8.2) — 외부 지분 25%↑면 분기 목표, 50%↑면 미달 누적 시 해임(GameEnding 'dismissed'). 자리만 */
export interface BoardState {
  /** 이사회 신뢰 0~100 */
  confidence: number;
  demands: { id: string; label: string; dueMonth: number }[];
}

export interface WorldSlice {
  /** 원재료 가격 지수 (1 = 기준가) */
  priceIndex: Record<string, number>;
  /** 카테고리 트렌드 지수 */
  trend: Record<ProductCategory, number>;
  /** 기간 한정 보정치 — 이벤트·시장 국면이 만든다 */
  modifiers: Modifier[];
  weather: WeatherState;
  /** 향미 트렌드 이동 (결정 #125) */
  flavorTrend: { shifts: TrendShift[] };
  /** 경쟁 AI 증류소 (S-12, v13) — 비어 있다 */
  rivals: RivalDistillery[];
}

export interface FinanceSlice {
  cash: number;
  /** 연속 현금 부족 개월 — BANKRUPT_AFTER_MONTHS면 파산 */
  negativeCashMonths: number;
  loans: Loan[];
  /** 외부 투자자 지분 (0~1) */
  investorShare: number;
  investmentsTaken: string[];
  /** 매출채권 — 결제 지연 대금 */
  receivables: Receivable[];
  /** 직전 결산 이후 턴 사이 행동으로 생긴 현금 흐름 — 다음 결산 보고서(offTurn)로 넘어가고 비워진다 (§16.20) */
  pendingCash?: CashFlows;
  /** 원재료 선도계약 (S-11, v13) */
  hedges: ForwardContract[];
  /** 보험 (S-11, v13) */
  insurance: InsurancePolicy[];
  /** 이사회 — 외부 지분 25%↑일 때만 생긴다 (S-11) */
  board?: BoardState;
}

export interface HrSlice {
  staff: Staff[];
  candidates: Candidate[];
  /** 증류소 하우스 스타일 0~100 — 마스터 디스틸러가 쌓고, 부사수 없이 은퇴하면 초기화 */
  houseStyle: number;
}

export interface ProductionSlice {
  equipment: EquipmentInstance[];
  recipes: Recipe[];
  orders: ProductionOrder[];
  /** 지난달 원재료별 실제 구매량(kg) — 대량 구매 할인 등급 */
  ingredientKgLastMonth: Record<string, number>;
  /** 정책자금 자격 등 플래그 */
  flags: { producedSoju: boolean };
  /** 사무직이 타결한 폐기물(드래프·지게미) 유상 판매 단가(원/kg) */
  wasteContractPerKg: number;
  /** 이 달에는 소주 생산을 건너뛴다(별도 버튼, #249 ④ — 그 달 한 번만, 진행하면 풀린다) */
  skipSojuMonth?: number;
}

export interface InventorySlice {
  /** 탱크 원액 (뉴메이크·비숙성) */
  lots: SpiritLot[];
  casks: Cask[];
  /** 쿠퍼리지 주문·시즈닝 계약으로 도착 예정인 캐스크 */
  caskOrders: CaskOrder[];
  /** 기본 숙성고 용량(캐스크 수). 증설분은 설비에서 계산 */
  warehouseBase: number;
  /** 이번 달 로테이션한 캐스크 수 */
  rotatedThisMonth: number;
  /** 이번 달 샘플링 횟수 — 블렌더 여력 (결정 #124) */
  samplesThisMonth: number;
  /** 자동 샘플 설정 (#207) — 없으면 기본값(켬, 모든 원액, 나이·간격 제한 없음, 여력만큼) */
  autoSample?: AutoSampleSettings;
  /** 자동 통입 설정 (#239) — 없으면 끔 */
  autoFill?: AutoFillSettings;
}

/** 자동 통입 (#239, 5차 MVP 플레이테스트 — 통입을 "잊었고 귀찮았다") — 비운 칸은 기본값 */
export interface AutoFillSettings {
  /** 몇 개월마다 — 1·3·6, 없으면 1(매달) */
  everyMonths?: number;
  /** 통에 넣을 원액 — 없으면 몰트·그레인 모두 */
  kinds?: ('malt' | 'grain')[];
  /** 빈 통 순서 — 'new' 새 통(첫 통입) 먼저(기본) · 'used' 재사용 통 먼저 */
  prefer?: 'new' | 'used';
  /** 통입 도수 — 없으면 0.635 (원액이 더 낮으면 원액 그대로) */
  entryAbv?: number;
}

/** 자동 샘플이 고를 원액 묶음 — 위스키 표기 가능 통 / 숙성 중 몰트·그레인 스피릿 / 소주·진·고량주(옹기 등) */
export type AutoSampleGroup = 'whisky' | 'spirit' | 'soju';

/** 자동 샘플 설정 (#207, 2026-11-09 오너 요청) — 비운 칸은 기본값 */
export interface AutoSampleSettings {
  /** true면 자동 샘플을 하지 않는다 */
  off?: boolean;
  /** 고를 원액 묶음 — 없으면 모두 */
  groups?: AutoSampleGroup[];
  /** 이만큼 숙성한 통만(개월, 오크·옹기 중 긴 쪽) — 없으면 0 */
  minAgeMonths?: number;
  /** 자기 기록이 이만큼 지난 통만 다시 뜬다(개월) — 없으면 0(매 턴 오래 안 뜬 순) */
  minGapMonths?: number;
  /** 한 달 최대 통 수 — 없으면 샘플 여력만큼 */
  maxPerMonth?: number;
}

export interface CommerceSlice {
  products: Product[];
  /** 품절·단종 제품 이력 (architecture §3.7) */
  productArchive: ProductArchiveEntry[];
  /** 브랜드 라인 (S-2, 스키마 v11) — 하우스 브랜드 1개(항상 맨 앞) + 세컨드 브랜드. 인지도는 브랜드마다 (PRD §11.2 ④, #51~#55) */
  brands: BrandLine[];
  /** 비지터 센터 입소문(로컬 인지도) 0~1 */
  localBuzz: number;
  marketingBudget: number;
  /** 올해 전통주 경감 대상 누적 출고량(L) — 1월에 초기화 */
  traditionalReleasedL: number;
  /** 작년 전통주 경감 대상 출고량(L) — 500㎘ 넘으면 올해 경감 없음 */
  traditionalPrevYearL: number;
  retailOffers: RetailOffer[];
  retailContracts: RetailContract[];
  /** 진출한 수출 시장 (수출 결정 — PRD §16.25) */
  exports?: ExportEntry[];
  /** 해외 명성 0~1 (#96) — 품평회·평론으로 오르고 매달 식는다. 옛 저장에는 없을 수 있다 */
  acclaim?: number;
  /** 수입사 계약 제안 (#101) */
  exportOffers?: ExportOffer[];
  /** 한 번이라도 들어간 수출 시장 — 시장 개척비는 처음 한 번만 */
  exportEntered?: ExportMarketId[];
  /** 진행 중인 블렌딩 의뢰 (결정 #124) */
  commissions: BlendCommission[];
  /** 코어 레인지 — 라인 이름 → 기준 육각형 */
  lines: Record<string, CoreLine>;
}

export interface B2bSlice {
  /** B2B 신뢰도 0~100 — 계약 조건·현물 단가에 영향 */
  trust: number;
  /** 벌크 원액 시세 지수 (1 = 기준) */
  bulkIndex: number;
  /** 최근 현물 판매량(LPA, 매달 감쇠) — 그레인 현물 시장 포화 (#81) */
  spotSoldLPA?: { grain: number };
  contracts: Contract[];
  contractOffers: ContractOffer[];
  brokerOffers: BrokerOffer[];
  caskBids: CaskBid[];
  oemOffers: OemOffer[];
  oemContracts: OemContract[];
}

export interface EventsSlice {
  /** 플레이어 선택을 기다리는 이벤트 */
  pending: PendingEvent[];
  forecasts: Forecast[];
  log: EventLogEntry[];
  /** 이벤트별 마지막 발생 월 (쿨다운) */
  lastFired: Record<string, number>;
}

/** 게임이 끝나는 이유 (S-9, PRD §12.1). 파산만 규칙이 있고 면허 취소·해임은 자리만 — 규칙은 단계 P (해임은 재무 확장 S-11과 함께) */
export type GameEnding = 'bankrupt' | 'licenseRevoked' | 'dismissed';

/** 마일스톤 — 한 판의 연표와 업적의 원천 (S-9). 정의(이름·연표 표시)는 content/milestones.ts */
export type MilestoneId = 'first_distill' | 'first_fill' | 'first_loan' | 'first_soju_sale' | 'first_whisky_bottled' | 'first_whisky_sale' | 'first_cash_crisis' | 'flagship_bottled' | 'flagship_sold';
export interface Milestone {
  id: MilestoneId;
  /** 달성한 달 */
  month: number;
  /** 붙는 값 (플래그십 품질 등) */
  value?: number;
}

/** 목표 판정의 확인 항목 (MVP §3 — 파산하지 않음·12년 플래그십 판매·순자산 목표) */
export interface GoalCheck { id: 'survive' | 'flagship' | 'netWorth'; ok: boolean; value?: number; target?: number }

/** 목표 판정 — 시나리오 목표 기간이 끝나거나 게임이 끝나면 한 번 (S-9) */
export interface GoalVerdict {
  /** 판정한 시점 (경과 개월) */
  month: number;
  /** heritage = 목표 모두 달성 · missed = 버텼지만 일부 미달 · failed = 기간 전에 게임이 끝났다 */
  result: 'heritage' | 'missed' | 'failed';
  /** 등급 (failed면 null) */
  grade: 'S' | 'A' | 'B' | 'C' | null;
  checks: GoalCheck[];
  netWorth: number;
  flagshipQuality?: number;
  awareness: number;
  /** 플레이어가 결과 화면을 확인했다 — 그 뒤는 목표 없이 계속 운영(샌드박스) */
  acknowledged?: boolean;
}

/** 진행 (S-9, 스키마 v10) — 마일스톤·목표 판정·게임이 끝난 이유 */
export interface ProgressSlice {
  milestones: Milestone[];
  /** 중반 목표 결과 (content/scenarios.ts midGoals) — 이뤘거나(done) 기한이 지났다(missed). 아직이면 없다 */
  midGoals?: { id: string; month: number; result: 'done' | 'missed' }[];
  verdict?: GoalVerdict;
  ending?: { reason: GameEnding; month: number };
}

export interface HistorySlice {
  /** 최근 월 리포트 (상세) */
  reports: MonthReport[];
  /** 연 요약 (오래된 기간의 장기 차트용) */
  years: YearSummary[];
}
/** 진출한 수출 시장 (#95) */
/** 수출 시장 (#95, 확장 #100) */
export type ExportMarketId = 'US' | 'UK' | 'DF' | 'EU' | 'CN' | 'SEA' | 'KR' | 'JP' | 'TW';

/** 수입사 계약 조건 (#101) */
export interface ExportTerms {
  marketId: ExportMarketId;
  partner: string;
  /** 수입사 매입가 = 출고가 × priceFactor */
  priceFactor: number;
  /** 매달 우리가 내는 현지 마케팅 분담 — 많을수록 현지 인지도가 빨리 오른다 */
  marketingPerMonth: number;
  termMonths: number;
  /** 연 최소 물량 — 1년 단위로 못 채우면 수입사가 계약을 끝낸다 */
  minBottlesPerYear: number;
  /** 대금 지급까지 개월 */
  paymentDelay: number;
  /** 시장 개척비 (처음 들어가는 시장만) */
  entryCost: number;
}
export interface ExportOffer extends ExportTerms { id: string; expiresMonth: number }

export interface ExportEntry extends Partial<Omit<ExportTerms, 'marketId'>> {
  marketId: ExportMarketId;
  openedMonth: number;
  /** 이 달부터 판매 (라벨 승인·수입상 계약 기간) */
  readyMonth: number;
  /** 현지 인지도 0~1 */
  awareness: number;
  totalBottles: number;
  /** 수입사 계약 연차 집계 (#101): 이번 계약 연도 시작 월·판매 병수 */
  yearStartMonth?: number;
  bottlesThisYear?: number;
  /** 수출가 배수: FOB = 출고가 × 배수. 수입사 계약의 제안가로 시작하고(#101·#106), 플레이어가 조정한다(#108, 0.5~3).
   *  올리면 현지 소비자가가 올라 적게 팔리고 병당 많이 남는다 — 연 최소 물량 의무와 맞바꾼다 */
  priceFactor?: number;
}

export interface ExportSale { marketId: ExportMarketId; productId: string; name: string; bottles: number; revenue: number; demandBottles: number; freight: number }

/** 시나리오 (skeleton S-8, #140) — 새 게임 때 시나리오 정의를 복사해 둔다. 없으면 샌드박스(모든 시스템 켬) */
export interface ScenarioState {
  /** content/scenarios.ts의 id */
  id: string;
  /** 규모 티어 (micro·standard) */
  tierId: string;
  /** 잠긴 키 — 테크 게이트와 같은 규칙('action:'·'facility:') + 'system:<틱 시스템>'·'kind:<주종>' */
  locked: string[];
  /** 경제 값 덮어쓰기 */
  economy: { overheadPerMonth?: number };
  /** 시작 자기자본 — 순자산 목표의 기준 (#141) */
  equity: number;
  goal: { months: number; netWorthMultiple: number; flagshipMinMonths: number };
  /** 이미 연 단계 id (content/scenarios.ts stages) — 옛 세이브에는 없다 */
  stagesDone?: string[];
  /** 이 판을 시작한 빌드(커밋 짧은 해시, #241) — 화면이 새 판을 만들 때 남긴다. 시뮬레이션은 읽지 않는다. 옛 세이브에는 없다(플레이 기록의 첫 빌드로 대신한다) */
  startBuild?: string;
}

export interface GameState {
  version: 15;
  seed: number;
  /** 시작부터의 경과 월. 0 = 시작 연도 1월 */
  month: number;
  startYear: number;
  regionId: RegionId;
  /** 지역 안의 증류소 입지 (없으면 지역 기본 입지) — 기후·특산물 자격이 달라진다 */
  siteId?: string;
  distilleryName: string;
  /** running 또는 끝난 이유 (S-9) */
  status: 'running' | GameEnding;
  nextId: number;
  /** 시나리오 (v8). 없으면 샌드박스 — 옛 세이브·개발자 새 게임 */
  scenario?: ScenarioState;

  world: WorldSlice;
  finance: FinanceSlice;
  hr: HrSlice;
  production: ProductionSlice;
  inventory: InventorySlice;
  commerce: CommerceSlice;
  b2b: B2bSlice;
  events: EventsSlice;
  research: ResearchState;
  /** 입지 고유 상태 (결정 #86~) */
  site: SiteState;
  history: HistorySlice;
  /** 진행 — 마일스톤·목표 판정 (v10, S-9) */
  progress: ProgressSlice;
}

/** 제품에 고정한 패키징 (#248) — 부품 + 병입 때 정해진 럭셔리(0~30)·병당 포장 원가(이벤트·입지 할증 전) */
export interface ProductPackaging {
  bottle: 'standard' | 'decanter' | 'stoneware';
  closure: 'screw' | 'cork';
  wax?: boolean;
  label: 'paper' | 'embossed' | 'foil';
  box: 'none' | 'case' | 'wooden';
  labelColor?: 'ivory' | 'black' | 'navy' | 'burgundy' | 'forest' | 'gold';
  luxury: number;
  costPerBottle: number;
}
