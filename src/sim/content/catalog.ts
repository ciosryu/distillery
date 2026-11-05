import type { CaskTypeId, CondenserType, Flavor, FermenterType, RegionId, SiteId, StillType, WoodId, YeastId } from '../types';

// 콘텐츠 카탈로그 — 모든 수치 [튜닝]. 가격은 KRW.

export interface IngredientDef {
  id: string;
  nameKo: string;
  /** 원료 1kg(또는 1L)이 발효로 만드는 알코올 LPA */
  lpaPerKg: number;
  pricePerKg: number;
  flavor: Flavor;
  /** 매시에 쓰는 주종 */
  kinds: ('soju' | 'malt' | 'grain' | 'baijiu')[];
  /** 산지 한정 원료 (없으면 어디서나) */
  sites?: SiteId[];
  /** 원산지 — 지역 농산물 / 국산 / 수입 (생산 국가 기준, 결정 #64) */
  origin: IngredientOrigin;
  /** 월 공급 한도(kg) — 지역 계약재배 물량 등 */
  monthlySupplyKg?: number;
}

export type IngredientOrigin = 'local' | 'domestic' | 'imported';
export const ORIGIN_LABEL: Record<IngredientOrigin, string> = { local: '지역 농산물', domestic: '국산', imported: '수입' };

export const INGREDIENTS: Record<string, IngredientDef> = {
  malt_unpeated: { id: 'malt_unpeated', nameKo: '맥아(언피티드, 수입)', lpaPerKg: 0.42, pricePerKg: 1600, flavor: { cereal: 40, sweetness: 10 }, kinds: ['malt', 'grain'], origin: 'imported' },
  malt_peated: { id: 'malt_peated', nameKo: '피티드 맥아(40ppm, 수입)', lpaPerKg: 0.41, pricePerKg: 2200, flavor: { cereal: 35, sweetness: 8, peat_smoke: 70 }, kinds: ['malt'], origin: 'imported' },
  malt_korean: { id: 'malt_korean', nameKo: '국산 맥아(소량 생산)', lpaPerKg: 0.39, pricePerKg: 3000, flavor: { cereal: 45, sweetness: 12, fresh_fruit: 4 }, kinds: ['malt'], origin: 'domestic' },
  corn: { id: 'corn', nameKo: '옥수수(수입)', lpaPerKg: 0.38, pricePerKg: 450, flavor: { sweetness: 25, cereal: 12 }, kinds: ['grain'], origin: 'imported' },
  wheat: { id: 'wheat', nameKo: '밀(수입)', lpaPerKg: 0.37, pricePerKg: 500, flavor: { sweetness: 15, cereal: 10, floral: 3 }, kinds: ['grain'], origin: 'imported' },
  // 일본 본격 쇼추용
  rice_koji: { id: 'rice_koji', nameKo: '쌀 코지(입국)', lpaPerKg: 0.4, pricePerKg: 4000, flavor: { nuruk_rice: 60, fresh_fruit: 8, floral: 6 }, kinds: ['soju'], origin: 'domestic' },
  sweet_potato: { id: 'sweet_potato', nameKo: '고구마', lpaPerKg: 0.13, pricePerKg: 600, flavor: { earthy: 15, sweetness: 22, floral: 10, fresh_fruit: 4 }, kinds: ['soju'], origin: 'domestic' },
  barley_raw: { id: 'barley_raw', nameKo: '보리(비맥아)', lpaPerKg: 0.38, pricePerKg: 900, flavor: { cereal: 25, toasted_grain: 10 }, kinds: ['soju'], origin: 'domestic' },
  // 백주(고량주)용
  sorghum: { id: 'sorghum', nameKo: '고량(수수)', lpaPerKg: 0.36, pricePerKg: 900, flavor: { sorghum_grain: 45, earthy: 8 }, kinds: ['baijiu'], origin: 'imported' },
  daqu: { id: 'daqu', nameKo: '대곡(밀 누룩, 曲)', lpaPerKg: 0.15, pricePerKg: 3000, flavor: { fermented_umami: 25, tropical: 20, earthy: 10, sorghum_grain: 5 }, kinds: ['baijiu'], origin: 'imported' },
  rice_domestic: { id: 'rice_domestic', nameKo: '국산 쌀(타지역)', lpaPerKg: 0.46, pricePerKg: 2600, flavor: { nuruk_rice: 25, floral: 8, fresh_fruit: 8, sweetness: 8 }, kinds: ['soju'], origin: 'domestic' },
  rice_processing: { id: 'rice_processing', nameKo: '국산 가공용 쌀(정부 할인 공급)', lpaPerKg: 0.44, pricePerKg: 1300, flavor: { nuruk_rice: 20, floral: 5, fresh_fruit: 5, sweetness: 6, cereal: 5 }, kinds: ['soju'], origin: 'domestic' },
  rice_imported: { id: 'rice_imported', nameKo: '수입 쌀(가공용)', lpaPerKg: 0.44, pricePerKg: 1000, flavor: { nuruk_rice: 17, floral: 4, fresh_fruit: 4, sweetness: 5, cereal: 6 }, kinds: ['soju'], origin: 'imported' },
  nuruk: { id: 'nuruk', nameKo: '전통 누룩', lpaPerKg: 0.1, pricePerKg: 6000, flavor: { nuruk_rice: 40, earthy: 6, fresh_fruit: 6 }, kinds: ['soju'], origin: 'domestic' },
  // 산지 한정 (regions.md §4)
  andong_rice: { id: 'andong_rice', nameKo: '안동 쌀 — 지역 농산물(계약재배)', lpaPerKg: 0.46, pricePerKg: 3200, flavor: { nuruk_rice: 27, floral: 9, fresh_fruit: 9, sweetness: 8 }, kinds: ['soju'], sites: ['andong'], origin: 'local', monthlySupplyKg: 800 },
  jeju_millet: { id: 'jeju_millet', nameKo: '제주 차조(좁쌀) — 고소리술 원료', lpaPerKg: 0.42, pricePerKg: 4500, flavor: { nuruk_rice: 15, cereal: 18, earthy: 6, toasted_grain: 6, sweetness: 6 }, kinds: ['soju'], sites: ['jeju'], origin: 'local' },
  potato: { id: 'potato', nameKo: '홋카이도 감자', lpaPerKg: 0.11, pricePerKg: 450, flavor: { earthy: 10, sweetness: 8, floral: 6, fresh_fruit: 4 }, kinds: ['soju'], sites: ['hokkaido'], origin: 'local' },
};

/** 발효제 — 전통주 자격 판정에서 주원료로 치지 않는다 */
export const FERMENTATION_STARTERS = ['nuruk', 'daqu', 'rice_koji'];

/** 진 베이스 중성 스피릿(주정 95%) — L당 가격 */
export const GNS = { nameKo: '주정(95%)', abv: 0.95, pricePerL: 2300, flavor: { harshness: 35, solvent: 8, feinty: 8 } as Flavor };

/** regions(국가)·sites(산지)가 없으면 모든 곳에서 구할 수 있다 */
export interface BotanicalDef { id: string; nameKo: string; pricePerKg: number; perGram: Flavor; regions?: RegionId[]; sites?: SiteId[] }

export const BOTANICALS: Record<string, BotanicalDef> = {
  juniper: { id: 'juniper', nameKo: '주니퍼', pricePerKg: 32000, perGram: { juniper: 2.0, herbal: 0.3 } },
  coriander: { id: 'coriander', nameKo: '고수씨', pricePerKg: 12000, perGram: { botanical_spice: 2.0, citrus: 1.0, floral: 0.5 } },
  angelica: { id: 'angelica', nameKo: '안젤리카 뿌리', pricePerKg: 60000, perGram: { herbal: 4.0, earthy: 1.0, body: 1.0 } },
  orris: { id: 'orris', nameKo: '오리스 뿌리', pricePerKg: 80000, perGram: { floral: 5.0, body: 1.0 } },
  lemon_peel: { id: 'lemon_peel', nameKo: '레몬 껍질', pricePerKg: 20000, perGram: { citrus: 4.0 } },
  cassia: { id: 'cassia', nameKo: '카시아', pricePerKg: 25000, perGram: { botanical_spice: 3.5, sweetness: 0.5 } },
  yuzu: { id: 'yuzu', nameKo: '유자 껍질', pricePerKg: 40000, perGram: { citrus: 4.5, floral: 1.5 }, regions: ['KR', 'JP'] },
  omija: { id: 'omija', nameKo: '오미자', pricePerKg: 50000, perGram: { fresh_fruit: 2.5, botanical_spice: 2.0, sweetness: 0.5 }, regions: ['KR'] },
  pine_needle: { id: 'pine_needle', nameKo: '솔잎', pricePerKg: 15000, perGram: { herbal: 3.0, juniper: 0.8 }, regions: ['KR'] },
  sancho: { id: 'sancho', nameKo: '산초', pricePerKg: 70000, perGram: { botanical_spice: 4.0, citrus: 1.0 }, regions: ['KR', 'JP'] },
  green_tea: { id: 'green_tea', nameKo: '녹차', pricePerKg: 60000, perGram: { herbal: 3.0, floral: 1.0 }, regions: ['KR', 'JP', 'TW'] },
  sakura: { id: 'sakura', nameKo: '벚꽃(사쿠라)', pricePerKg: 90000, perGram: { floral: 5.0, sweetness: 0.5 }, regions: ['JP'] },
  hinoki: { id: 'hinoki', nameKo: '히노키', pricePerKg: 40000, perGram: { herbal: 2.5, earthy: 1.0, juniper: 0.5 }, regions: ['JP'] },
  maqaw: { id: 'maqaw', nameKo: '마고(산후추, 馬告)', pricePerKg: 80000, perGram: { citrus: 3.0, botanical_spice: 2.0 }, regions: ['TW'] },
  oolong: { id: 'oolong', nameKo: '우롱차', pricePerKg: 70000, perGram: { floral: 2.0, herbal: 2.0, toasted_grain: 0.5 }, regions: ['TW'] },
  jeju_citrus: { id: 'jeju_citrus', nameKo: '제주 청귤 껍질', pricePerKg: 35000, perGram: { citrus: 4.5, fresh_fruit: 1.0, floral: 0.5 }, sites: ['jeju'] },
};

export const YEASTS: Record<YeastId, { nameKo: string; yieldFactor: number; ester: number; tropical: number; acetic: number }> = {
  distillers: { nameKo: '증류용 효모', yieldFactor: 1.0, ester: 1.0, tropical: 0, acetic: 0 },
  ale: { nameKo: '에일 효모', yieldFactor: 0.97, ester: 1.4, tropical: 10, acetic: 0 },
  nuruk_native: { nameKo: '누룩 자연 발효', yieldFactor: 0.94, ester: 1.2, tropical: 3, acetic: 6 },
};

// ── 설비 ──
/** 부지 개량 (regions.md §3.2) — 산지 리스크를 줄이는 1회성 투자 */
export type UpgradeId = 'seismic_1' | 'seismic_2' | 'temp_control' | 'visitor';

/** sites가 있으면 그 산지에서만 발주할 수 있다 */
interface EquipmentBase { id: string; nameKo: string; cost: number; leadMonths: number; maintenance: number; sites?: SiteId[]; /** 숙성고 캐스크 자리를 차지하는 수 */ warehouseSlots?: number }
export type EquipmentDef =
  | (EquipmentBase & { kind: 'still'; stillType: StillType; condenser: CondenserType; chargeL: number; runsPerMonth: number; reflux: number; copperContact: number; vacuum: boolean; ginBasket: boolean; /** 석탄 직화 — 바디·오일리↑, 숙련 요구 */ directFire?: boolean })
  | (EquipmentBase & { kind: 'fermenter'; fermenterType: FermenterType; capacityL: number })
  | (EquipmentBase & { kind: 'warehouse'; casks: number })
  | (EquipmentBase & { kind: 'upgrade'; upgrade: UpgradeId; description: string; /** 먼저 설치돼 있어야 하는 설비 */ requires?: string });

/** 지진 위험이 있는 산지 */
export const SEISMIC_SITES: SiteId[] = ['kanto', 'kansai', 'hokkaido', 'yilan'];

export const EQUIPMENT: Record<string, EquipmentDef> = {
  pot_onion_1000: { id: 'pot_onion_1000', kind: 'still', nameKo: '단식 증류기 1,000L (양파형)', cost: 300_000_000, leadMonths: 4, maintenance: 1_500_000, stillType: 'pot_onion', condenser: 'copper_shell', chargeL: 1000, runsPerMonth: 20, reflux: 0.4, copperContact: 1.0, vacuum: false, ginBasket: true },
  pot_lantern_1000: { id: 'pot_lantern_1000', kind: 'still', nameKo: '단식 증류기 1,000L (랜턴형)', cost: 330_000_000, leadMonths: 4, maintenance: 1_500_000, stillType: 'pot_lantern', condenser: 'copper_shell', chargeL: 1000, runsPerMonth: 20, reflux: 0.6, copperContact: 1.0, vacuum: false, ginBasket: true },
  pot_worm_1000: { id: 'pot_worm_1000', kind: 'still', nameKo: '단식 증류기 1,000L (스트레이트형 + 웜텁)', cost: 360_000_000, leadMonths: 5, maintenance: 1_800_000, stillType: 'pot_onion', condenser: 'worm_tub', chargeL: 1000, runsPerMonth: 18, reflux: 0.2, copperContact: 0.4, vacuum: false, ginBasket: false },
  hybrid_600: { id: 'hybrid_600', kind: 'still', nameKo: '하이브리드 증류기 600L (포트+컬럼)', cost: 280_000_000, leadMonths: 3, maintenance: 1_300_000, stillType: 'hybrid', condenser: 'copper_shell', chargeL: 600, runsPerMonth: 24, reflux: 0.85, copperContact: 0.9, vacuum: false, ginBasket: true },
  vacuum_1000: { id: 'vacuum_1000', kind: 'still', nameKo: '감압 증류기 1,000L (소주용)', cost: 350_000_000, leadMonths: 4, maintenance: 1_700_000, stillType: 'vacuum_pot', condenser: 'copper_shell', chargeL: 1000, runsPerMonth: 20, reflux: 0.3, copperContact: 0.8, vacuum: true, ginBasket: false },
  pot_large_5000: { id: 'pot_large_5000', kind: 'still', nameKo: '대형 단식 증류기 5,000L (양파형, B2B 대량 생산용)', cost: 600_000_000, leadMonths: 6, maintenance: 4_000_000, stillType: 'pot_onion', condenser: 'copper_shell', chargeL: 5000, runsPerMonth: 20, reflux: 0.4, copperContact: 1.0, vacuum: false, ginBasket: false },
  column_2: { id: 'column_2', kind: 'still', nameKo: '연속식 증류기 (2컬럼, 그레인 위스키용)', cost: 700_000_000, leadMonths: 8, maintenance: 3_500_000, stillType: 'column', condenser: 'copper_shell', chargeL: 8000, runsPerMonth: 25, reflux: 0.95, copperContact: 0.8, vacuum: false, ginBasket: false },
  ferm_steel_10000: { id: 'ferm_steel_10000', kind: 'fermenter', nameKo: '대형 스테인리스 발효조 10,000L', cost: 120_000_000, leadMonths: 2, maintenance: 600_000, fermenterType: 'stainless', capacityL: 10000 },
  ferm_steel_2000: { id: 'ferm_steel_2000', kind: 'fermenter', nameKo: '스테인리스 발효조 2,000L', cost: 40_000_000, leadMonths: 1, maintenance: 200_000, fermenterType: 'stainless', capacityL: 2000 },
  ferm_onggi_set: { id: 'ferm_onggi_set', kind: 'fermenter', nameKo: '옹기 발효 세트 (1,200L 상당)', cost: 30_000_000, leadMonths: 1, maintenance: 300_000, fermenterType: 'onggi', capacityL: 1200 },
  warehouse_rack_100: { id: 'warehouse_rack_100', kind: 'warehouse', nameKo: '랙 숙성고 증설 (+100 캐스크)', cost: 150_000_000, leadMonths: 6, maintenance: 800_000, casks: 100 },
  // 홋카이도 — 석탄 직화 단식 증류기 (요이치형)
  pot_coal_1000: { id: 'pot_coal_1000', kind: 'still', nameKo: '석탄 직화 단식 증류기 1,000L (스트레이트형)', cost: 340_000_000, leadMonths: 5, maintenance: 2_000_000, stillType: 'pot_onion', condenser: 'copper_shell', chargeL: 1000, runsPerMonth: 18, reflux: 0.25, copperContact: 1.0, vacuum: false, ginBasket: false, directFire: true, sites: ['hokkaido'] },
  // 부지 개량 [튜닝]
  upg_seismic_1: { id: 'upg_seismic_1', kind: 'upgrade', upgrade: 'seismic_1', nameKo: '내진 랙·증류기 고정 (1단계)', description: '지진 피해 −50%', cost: 80_000_000, leadMonths: 2, maintenance: 100_000, sites: SEISMIC_SITES },
  upg_seismic_2: { id: 'upg_seismic_2', kind: 'upgrade', upgrade: 'seismic_2', nameKo: '면진 숙성고·배관 보강 (2단계)', description: '지진 피해 −85% (1단계 필요)', cost: 250_000_000, leadMonths: 4, maintenance: 300_000, sites: SEISMIC_SITES, requires: 'upg_seismic_1' },
  // 증류소 투어·직판장 (결정 #65) — 관광객 직판으로 소매 마진을 가져오지만 숙성고 40자리를 차지한다
  upg_visitor: { id: 'upg_visitor', kind: 'upgrade', upgrade: 'visitor', nameKo: '증류소 투어·직판장', description: '관광객 직판(소매 마진 확보) — 숙성고 40자리 사용', cost: 200_000_000, leadMonths: 4, maintenance: 1_500_000, warehouseSlots: 40 },
  upg_temp_control: { id: 'upg_temp_control', kind: 'upgrade', upgrade: 'temp_control', nameKo: '발효실 온도 제어 설비', description: '겨울 발효 지연 해소', cost: 60_000_000, leadMonths: 2, maintenance: 300_000, sites: ['andong'] },
};

/** 부지 개량별 리스크 경감률 */
export const UPGRADE_RISK_REDUCTION: Partial<Record<UpgradeId, { risk: 'earthquake'; reduce: number }>> = {
  seismic_1: { risk: 'earthquake', reduce: 0.5 },
  seismic_2: { risk: 'earthquake', reduce: 0.85 },
};

// ── 캐스크 ──
export interface CaskDef {
  id: CaskTypeId; nameKo: string; sizeL: number; wood: WoodId; price: number;
  activity: number; seasoning: number; seasoningType: 'bourbon' | 'sherry' | 'none'; char: number;
  /** 누수 위험 배수 (미즈나라는 결이 성겨 잘 샌다) */
  leakFactor?: number;
}

export const CASKS: Record<CaskTypeId, CaskDef> = {
  ex_bourbon_barrel: { id: 'ex_bourbon_barrel', nameKo: 'ex-버번 배럴 200L', sizeL: 200, wood: 'american_oak', price: 350_000, activity: 1.0, seasoning: 1.0, seasoningType: 'bourbon', char: 3 },
  oloroso_butt: { id: 'oloroso_butt', nameKo: '올로로소 셰리 벗 500L', sizeL: 500, wood: 'european_oak', price: 1_800_000, activity: 1.0, seasoning: 1.0, seasoningType: 'sherry', char: 1 },
  korean_oak_quarter: { id: 'korean_oak_quarter', nameKo: '한국 참나무(신갈나무) 쿼터 125L, 신품', sizeL: 125, wood: 'korean_oak', price: 900_000, activity: 1.3, seasoning: 0, seasoningType: 'none', char: 3 },
  mizunara_hogshead: { id: 'mizunara_hogshead', nameKo: '미즈나라 혹스헤드 250L, 신품', sizeL: 250, wood: 'mizunara', price: 3_500_000, activity: 1.2, seasoning: 0, seasoningType: 'none', char: 2, leakFactor: 3 },
};

/** 목재별 월간 추출 기여 (activity·속도 1 기준) */
export const WOOD_EXTRACT: Record<WoodId, Flavor> = {
  american_oak: { vanilla_caramel: 1.6, oak_tannin: 0.6, wood_spice: 0.5, color: 1.2, sweetness: 0.4 },
  european_oak: { vanilla_caramel: 0.7, oak_tannin: 1.3, wood_spice: 0.8, color: 1.5 },
  korean_oak: { vanilla_caramel: 0.9, oak_tannin: 1.2, wood_spice: 1.0, color: 1.3 },
  mizunara: { vanilla_caramel: 0.6, oak_tannin: 1.0, wood_spice: 0.8, color: 1.0, sweetness: 0.2 },
};

/** 시즈닝 향 월간 기여 (seasoning 1 기준) */
export const SEASONING_EXTRACT: Record<'bourbon' | 'sherry' | 'none', Flavor> = {
  bourbon: { vanilla_caramel: 0.8, sweetness: 0.4, tropical: 0.2 },
  sherry: { dried_fruit: 2.0, nutty_rancio: 0.3, sweetness: 0.5, color: 1.0 },
  none: {},
};

export const RECHAR_COST = 150_000;

// ── 패키징 ──
export const BOTTLE_SIZES = [375, 500, 700] as const;
export type BottleMl = (typeof BOTTLE_SIZES)[number];

export const PACKAGING: Record<string, { nameKo: string; costBySize: Record<BottleMl, number>; luxury: number }> = {
  standard: { nameKo: '스탠다드 병 + 코르크', costBySize: { 375: 1500, 500: 2000, 700: 2800 }, luxury: 1.0 },
  premium: { nameKo: '디캔터 + 케이스', costBySize: { 375: 6000, 500: 8000, 700: 11000 }, luxury: 1.15 },
};

export function packagingCost(packagingId: string, bottleMl: number): number {
  const p = PACKAGING[packagingId];
  if (!p) return 0;
  return p.costBySize[bottleMl as BottleMl] ?? Math.round(p.costBySize[700] * (bottleMl / 700));
}

// ── 마진 구조 (PRD §9.5) — 병당 고정비가 저가 제품의 마진을 깎는다 [튜닝] ──
/** 병입 인건비·라인 비용 (병당) */
export const BOTTLING_LABOR_PER_BOTTLE = 500;
/** 유통: 채널 수수료(출고가 대비)와 병당 물류비 */
export const DISTRIBUTION = {
  channelFeeRate: 0.12,
  logisticsBySize: { 375: 300, 500: 350, 700: 400 } as Record<BottleMl, number>,
};
export function logisticsCost(bottleMl: number): number {
  return DISTRIBUTION.logisticsBySize[bottleMl as BottleMl] ?? Math.round(400 * (bottleMl / 700));
}
/** 캐스크 1회 사용에 배분하는 캐스크 원가 비율 (평균 3회 사용 가정) */
export const CASK_COST_SHARE_PER_FILL = 1 / 3;

// ── 원액 B2B (PRD §8.6) [튜닝] ──
export const BULK = {
  /** 뉴메이크 몰트 기준가(원/LPA) */
  newMakeBase: 12_500,
  /** 숙성 1년당 가치 상승 */
  agePerYear: 0.2,
  /** 피트 원액 프리미엄 */
  peatPremium: 0.15,
  /** 현물 매입가(우리가 팔 때) = 기준가치 × bid, 브로커 판매가(우리가 살 때) = × ask */
  bid: 0.85,
  ask: 1.25,
  /** 계약가 = 기준가치 × contract (현물보다 높지만 고정) */
  contract: 0.9,
  /** 선급금을 받으면 단가 할인 */
  prepayDiscount: 0.05,
  /** 미납 1 LPA당 위약금 = 계약가 × penaltyRate */
  penaltyRate: 0.3,
  maxActiveContracts: 3,
  /** 그레인 뉴메이크 기준가(원/LPA) — 대량·저가 */
  grainNewMakeBase: 7_000,
  grainAgePerYear: 0.12,
};

/** 대량 구매 할인 (원재료별 월 구매량 kg 기준) */
export const VOLUME_DISCOUNT_TIERS: { minKg: number; factor: number }[] = [
  { minKg: 40_000, factor: 0.85 },
  { minKg: 15_000, factor: 0.9 },
  { minKg: 5_000, factor: 0.95 },
];

// 원액 구매자 목록은 content/names.ts (BUYERS)로 이동 — 실명/가상명 전환 지원


// ── 대출 상품 ──
export interface LoanOfferDef { id: string; nameKo: string; annualRate: number; termMonths: number; max: number; requires?: 'producedSoju'; /** 원금 거치 기간(이자만 납부) */ graceMonths: number; /** 숙성 재고 담보 — 한도 = 재고 시가 × 담보 인정 비율, 시가가 떨어지면 추가 상환 요구 */ collateral?: 'inventory' }

/** 숙성 재고 보유 비용 (결정 #65) — 숙성 중 캐스크당 보관료 × 산지 땅값(숙성고 증설비 배수) + 재고 시가의 보험료.
 *  게임 시작 후 graceMonths 동안 면제 (데스밸리 완화, 조정 가능) [튜닝] */
export const HOLDING = { perCaskMonth: 3_000, insuranceRateMonth: 0.001, graceMonths: 36 };

/** 직판장: 관광객 1인당 구매 병수, 직판 가격 = 소비자가(부가세·주세 제외 몫을 증류소가 가져감) [튜닝] */
export const VISITOR = { bottlesPerVisitor: 0.12 };

export const LOAN_OFFERS: LoanOfferDef[] = [
  { id: 'facility', nameKo: '시설자금 대출', annualRate: 0.05, termMonths: 120, max: 1_000_000_000, graceMonths: 24 },
  { id: 'working', nameKo: '운전자금 대출', annualRate: 0.075, termMonths: 36, max: 300_000_000, graceMonths: 0 },
  { id: 'inventory', nameKo: '숙성 재고 담보대출', annualRate: 0.06, termMonths: 60, max: 0, graceMonths: 12, collateral: 'inventory' },
  { id: 'policy', nameKo: '전통주 육성 정책자금', annualRate: 0.025, termMonths: 60, max: 200_000_000, requires: 'producedSoju', graceMonths: 12 },
];

// ── 직원 ──
export const ROLE_INFO: Record<'distiller' | 'warehouse' | 'sales', { nameKo: string; stats: [string, string, string]; baseSalary: number }> = {
  distiller: { nameKo: '마스터 디스틸러', stats: ['후각', '공정', '직관'], baseSalary: 4_500_000 },
  warehouse: { nameKo: '숙성고 매니저', stats: ['관찰', '환경통제', '성실'], baseSalary: 3_500_000 },
  sales: { nameKo: '영업', stats: ['친화', '네트워크', '협상'], baseSalary: 3_800_000 },
};

export const NAME_POOLS: Record<RegionId, { surnames: string[]; given: string[] }> = {
  KR: { surnames: ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황'], given: ['민준', '서연', '도윤', '지우', '하준', '서윤', '은우', '하은', '지호', '수아', '현우', '지민', '예준', '채원', '건우', '다은'] },
  JP: { surnames: ['사토 ', '스즈키 ', '다카하시 ', '다나카 ', '와타나베 ', '이토 ', '야마모토 ', '나카무라 '], given: ['하루토', '유이', '소타', '미오', '렌', '히나', '유토', '사쿠라'] },
  TW: { surnames: ['천', '린', '황', '장', '리', '왕', '우', '류'], given: ['즈하오', '이팅', '젠훙', '샤오웨이', '자오', '옌쥔', '이린', '웨이훙'] },
};
export const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황'];
export const GIVEN_NAMES = ['민준', '서연', '도윤', '지우', '하준', '서윤', '은우', '하은', '지호', '수아', '현우', '지민', '예준', '채원', '건우', '다은', '우진', '소율', '선우', '윤서'];
