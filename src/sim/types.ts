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

/** 국가 (세제·GI·내수 시장·채널). 역사적 이유로 이름이 RegionId (PRD §3.6, 결정 #58) */
export type RegionId = 'KR' | 'JP' | 'TW';
export type CountryId = RegionId;

/** 산지 (기후·물·원료·물류·고유 이벤트) — docs/design/regions.md Tier 1 */
export type SiteId = 'gyeonggi' | 'andong' | 'jeju' | 'kanto' | 'kansai' | 'hokkaido' | 'yilan';

/** 판매 카테고리 (라벨 판정 결과) */
export type ProductCategory = 'soju_distilled' | 'gin' | 'whisky' | 'grain_whisky' | 'blended_whisky' | 'baijiu' | 'malt_spirit' | 'flavored_spirit';

export type YeastId = 'distillers' | 'ale' | 'nuruk_native';
export type FermenterType = 'stainless' | 'onggi';
export type StillType = 'pot_onion' | 'pot_lantern' | 'hybrid' | 'vacuum_pot' | 'column';
export type CondenserType = 'copper_shell' | 'worm_tub';
export type CaskTypeId = 'ex_bourbon_barrel' | 'oloroso_butt' | 'korean_oak_quarter' | 'mizunara_hogshead';
export type WoodId = 'american_oak' | 'european_oak' | 'korean_oak' | 'mizunara';
export type StaffRole = 'distiller' | 'warehouse' | 'sales';

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
  /** 전통주(민속주·지역특산주) 자격으로 생산된 원액 — 한국 주세 감면·온라인 직판 대상 */
  traditional?: boolean;
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
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  ageYears: number | null;
  abv: number;
  bottleMl: number;
  chillFiltered: boolean;
  packagingId: string;
  flavor: Flavor;
  quality: number;
  typicity: number;
  style: string | null;
  sourcedShare: number;
  stockBottles: number;
  /** 출고가(세전) / 병 */
  price: number;
  /** 병당 생산 원가 = 원액 + 포장 + 병입 인건비 (유통비 제외) */
  unitCost: number;
  createdMonth: number;
  lastMonthSold: number;
  totalSold: number;
  /** 전통주 자격 — 모든 구성 원액이 전통주 원액일 때 */
  traditional?: boolean;
  /** 지난달 판매 중 면세 채널 몫 */
  lastMonthDutyFree?: number;
  /** 면세 전용 한정판 (제주) — 국내 판매 없음 */
  dutyFreeOnly?: boolean;
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

export interface MonthReport {
  month: number;
  revenue: number;
  expenses: Record<string, number>;
  netCash: number;
  cashEnd: number;
  sales: { productId: string; name: string; bottles: number; revenue: number; demandBottles: number }[];
  /** 원액 계약 납품 */
  bulk: { contractId: string; buyerName: string; deliveredLPA: number; revenue: number; penalty: number }[];
  bulkRevenue: number;
  production: { recipeId: string; name: string; batches: number; lpa: number; cost: number }[];
  angelsShareL: number;
  liquorTaxRemitted: number;
  /** 전통주 주세 감면액 */
  taxRelief?: number;
  /** 면세 채널 판매 병수 */
  dutyFreeBottles?: number;
  /** 직판장 판매 병수·순매출 */
  visitorBottles?: number;
  visitorRevenue?: number;
  /** 대형 유통 납품 대금 입금 / OEM 가공비 */
  retailRevenue?: number;
  oemRevenue?: number;
  /** 이번 달 발생한 이벤트 제목 */
  events: string[];
  notes: string[];
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
export interface CaskBid { id: string; buyerName: string; caskId: string; price: number; expiresMonth: number }

/** 대형 유통 납품 계약 (경기) — 큰 물량·낮은 단가·결제 지연 */
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

/** 대기업 위탁생산(OEM) 계약 (간토) — 원료는 위탁사 부담, 가공비를 받고 증류 설비를 내준다 */
export interface OemTerms {
  id: string; buyerName: string; batchesPerMonth: number; feePerBatch: number; termMonths: number; penaltyPerBatch: number;
  /** 전용 증류기 설치 지원형 (결정 #66): 위탁사가 설비 패키지(증류기 + 발효조 2기) 설치비 일부를 체결 시 지원 */
  dedicated?: boolean;
  capexSupport?: number;
}
export interface OemOffer extends OemTerms { expiresMonth: number }
export interface OemContract extends OemTerms { startMonth: number; monthsDone: number; missed: number; /** 전용 증류기 설비 id */ stillId?: string }

/** 매출채권 — 결제 지연 대금 */
export interface Receivable { dueMonth: number; amount: number; label: string }

/** 산지 고유 상태 */
export interface SiteState {
  /** 취수 허가량 — 월 발효 투입 용량 상한(L). 제주 */
  waterPermitL?: number;
  /** 취수 증량 신청 — 결정 월에 승인 여부가 정해진다 */
  permitApplication?: { decideMonth: number; addL: number; chance: number };
  /** 전통주 출고량(L) — 연도별 감면 구간 판정 */
  traditionalShipped?: { year: number; liters: number; lastYearLiters: number };
}

export interface GameState {
  version: 5;
  seed: number;
  /** 시작부터의 경과 월. 0 = 시작 연도 1월 */
  month: number;
  startYear: number;
  /** 국가 */
  regionId: RegionId;
  /** 산지 (국가의 하위) */
  siteId: SiteId;
  siteState: SiteState;
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
  retailOffers: RetailOffer[];
  retailContracts: RetailContract[];
  oemOffers: OemOffer[];
  oemContracts: OemContract[];
  receivables: Receivable[];
  /** 지난달 원재료별 실제 구매량(kg) — 대량 구매 할인 등급 */
  ingredientKgLastMonth: Record<string, number>;
  reports: MonthReport[];
  nextId: number;
}
