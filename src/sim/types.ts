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
export type SpiritKind = 'soju' | 'gin' | 'malt';

/** 판매 카테고리 (라벨 판정 결과) */
export type ProductCategory = 'soju_distilled' | 'gin' | 'whisky' | 'malt_spirit' | 'flavored_spirit';

export type YeastId = 'distillers' | 'ale' | 'nuruk_native';
export type FermenterType = 'stainless' | 'onggi';
export type StillType = 'pot_onion' | 'pot_lantern' | 'hybrid' | 'vacuum_pot';
export type CondenserType = 'copper_shell' | 'worm_tub';
export type CaskTypeId = 'ex_bourbon_barrel' | 'oloroso_butt' | 'korean_oak_quarter';
export type WoodId = 'american_oak' | 'european_oak' | 'korean_oak';
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
  unitCost: number;
  createdMonth: number;
  lastMonthSold: number;
  totalSold: number;
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
  monthlyPayment: number;
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

export interface MonthReport {
  month: number;
  revenue: number;
  expenses: Record<string, number>;
  netCash: number;
  cashEnd: number;
  sales: { productId: string; name: string; bottles: number; revenue: number; demandBottles: number }[];
  production: { recipeId: string; name: string; batches: number; lpa: number; cost: number }[];
  angelsShareL: number;
  liquorTaxRemitted: number;
  notes: string[];
}

export interface GameState {
  version: 1;
  seed: number;
  /** 시작부터의 경과 월. 0 = 시작 연도 1월 */
  month: number;
  startYear: number;
  regionId: 'KR';
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
  marketingBudget: number;
  awareness: number;
  /** 원재료 가격 지수 (1 = 기준가) */
  priceIndex: Record<string, number>;
  /** 카테고리 트렌드 지수 */
  trend: Record<ProductCategory, number>;
  /** 정책자금 자격 등 플래그 */
  flags: { producedSoju: boolean };
  reports: MonthReport[];
  nextId: number;
}
