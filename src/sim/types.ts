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
export type CaskTypeId = 'ex_bourbon_barrel' | 'oloroso_butt' | 'korean_oak_quarter' | 'mizunara_hogshead';
export type WoodId = 'american_oak' | 'european_oak' | 'korean_oak' | 'mizunara';
export type StaffRole = 'distiller' | 'warehouse' | 'sales' | 'office';

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
  sourced: boolean;
  /** 누적 원가(원/LPA) — 원재료·에너지·매입가 */
  costPerLPA: number;
  recipeId?: string;
  /** 원재료 배합 비율(레시피 기준) — 특산물·버번 옥수수 51% 같은 원료 규정 판정용 */
  mashShare?: Record<string, number>;
  /** 입지 원료(제주 차조·청귤 등)를 쓴 원액 — 면세 기념품 매력도 (결정 #87) */
  localIngredient?: boolean;
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
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  ageYears: number | null;
  /** 최저 오크 숙성 개월 (어린 위스키 인식 할인용) */
  oakMonths?: number;
  abv: number;
  bottleMl: number;
  chillFiltered: boolean;
  packagingId: string;
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
  stockBottles: number;
  /** 출고가(세전) / 병 */
  price: number;
  /** 병당 생산 원가 = 원액 + 포장 + 병입 인건비 (유통비 제외) */
  unitCost: number;
  createdMonth: number;
  lastMonthSold: number;
  totalSold: number;
  /** 월 판매량 지수이동평균 — 재고 적체 판정 */
  salesEma?: number;
  /** 첫 위스키 출시 오픈런 효과 */
  launchBoost?: { factor: number; untilMonth: number };
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
  /** 직군별 스탯: distiller(후각, 공정, 직관) / warehouse(관찰, 환경통제, 성실) / sales(친화, 네트워크, 협상) */
  stats: StaffStats;
  salary: number;
  hiredMonth: number;
  /** 입사 시 나이 — 나이가 들면 스탯이 꺾이고 65세에 은퇴 (에이징 커브) */
  ageAtHire?: number;
  /** 부사수: 이 직원을 가르치는 마스터 디스틸러 id */
  apprenticeOf?: string;
}

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
  | 'spotBulk' | 'caskBid' | 'caskOwnership' | 'contractPrepay' | 'contractCancel' | 'bottling' | 'severance' | 'rotation' | 'event' | 'brokerCask' | 'export' | 'other'
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

export interface GameState {
  version: 5;
  seed: number;
  /** 시작부터의 경과 월. 0 = 시작 연도 1월 */
  month: number;
  startYear: number;
  regionId: RegionId;
  /** 지역 안의 증류소 입지 (없으면 지역 기본 입지) — 기후·특산물 자격이 달라진다 */
  siteId?: string;
  distilleryName: string;
  cash: number;
  status: 'running' | 'bankrupt';
  negativeCashMonths: number;
  equipment: EquipmentInstance[];
  /** 기본 숙성고 용량(캐스크 수). 증설분은 설비에서 계산 */
  warehouseBase: number;
  recipes: Recipe[];
  orders: ProductionOrder[];
  lots: SpiritLot[];
  casks: Cask[];
  products: Product[];
  staff: Staff[];
  candidates: Candidate[];
  loans: Loan[];
  brokerOffers: BrokerOffer[];
  contracts: Contract[];
  contractOffers: ContractOffer[];
  /** B2B 신뢰도 0~100 — 계약 조건·현물 단가에 영향 */
  b2bTrust: number;
  /** 벌크 원액 시세 지수 (1 = 기준) */
  bulkIndex: number;
  /** 최근 현물 판매량(LPA, 매달 감쇠) — 그레인 현물 시장 포화 (#81). 옛 저장에는 없을 수 있다 */
  spotSoldLPA?: { grain: number };
  marketingBudget: number;
  awareness: number;
  /** 원재료 가격 지수 (1 = 기준가) */
  priceIndex: Record<string, number>;
  /** 카테고리 트렌드 지수 */
  trend: Record<ProductCategory, number>;
  /** 정책자금 자격 등 플래그 */
  flags: { producedSoju: boolean };
  modifiers: Modifier[];
  pendingEvents: PendingEvent[];
  forecasts: Forecast[];
  eventLog: EventLogEntry[];
  /** 이벤트별 마지막 발생 월 (쿨다운) */
  eventLastMonth: Record<string, number>;
  caskBids: CaskBid[];
  /** 지난달 원재료별 실제 구매량(kg) — 대량 구매 할인 등급 */
  ingredientKgLastMonth: Record<string, number>;
  /** 쿠퍼리지 주문·시즈닝 계약으로 도착 예정인 캐스크 */
  caskOrders: CaskOrder[];
  /** 증류소 하우스 스타일 0~100 — 마스터 디스틸러가 쌓고, 부사수 없이 은퇴하면 초기화 */
  houseStyle: number;
  /** 외부 투자자 지분 (0~1) */
  investorShare: number;
  investmentsTaken: string[];
  /** 해외 명성 0~1 (#96) — 품평회·평론으로 오르고 매달 식는다 */
  acclaim?: number;
  /** 수출 시장 (#95) — 옛 저장에는 없을 수 있다 */
  exports?: ExportEntry[];
  /** 수입사 계약 제안 (#101) */
  exportOffers?: ExportOffer[];
  /** 한 번이라도 들어간 수출 시장 — 시장 개척비는 처음 한 번만 */
  exportEntered?: ExportMarketId[];
  /** 비지터 센터 입소문(로컬 인지도) 0~1 */
  localBuzz: number;
  /** 사무직이 타결한 폐기물(드래프·지게미) 유상 판매 단가(원/kg) */
  wasteContractPerKg: number;
  /** 이번 달 로테이션한 캐스크 수 */
  rotatedThisMonth: number;
  /** 올해 전통주 경감 대상 누적 출고량(L) — 1월에 초기화 */
  traditionalReleasedL: number;
  /** 작년 전통주 경감 대상 출고량(L) — 500㎘ 넘으면 올해 경감 없음 */
  traditionalPrevYearL: number;
  /** 입지 특성 (결정 #86~) — 옛 저장에는 없을 수 있다 → normalizeState가 채운다 */
  siteState: SiteState;
  retailOffers: RetailOffer[];
  retailContracts: RetailContract[];
  oemOffers: OemOffer[];
  oemContracts: OemContract[];
  receivables: Receivable[];
  /** 직전 결산 이후 턴 사이 행동으로 생긴 현금 흐름 — 다음 결산 보고서(offTurn)로 넘어가고 비워진다.
   *  구버전(v5 초기) 세이브에는 없을 수 있어 선택 필드로 둔다 */
  pendingCash?: CashFlows;
  reports: MonthReport[];
  nextId: number;
}
