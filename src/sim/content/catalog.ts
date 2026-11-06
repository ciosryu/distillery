import type { CaskTypeId, CondenserType, Flavor, FermenterType, ProductCategory, RegionId, StillType, WoodId, YeastId } from '../types';

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
  /** 자생지(현지 조달 지역). 다른 지역에서 쓰면 물류 배수가 붙는다. 없으면 세계 상품 (결정 #67) */
  native?: string[];
  /** 입지 전용 원료 — 이 입지에서만 레시피에 쓸 수 있다 (결정 #87, 제주 차조·홋카이도 감자) */
  sites?: string[];
}

export const INGREDIENTS: Record<string, IngredientDef> = {
  malt_unpeated: { id: 'malt_unpeated', nameKo: '맥아(언피티드, 수입)', lpaPerKg: 0.42, pricePerKg: 1600, flavor: { cereal: 40, sweetness: 10 }, kinds: ['malt', 'grain'] },
  malt_peated: { id: 'malt_peated', nameKo: '피티드 맥아(40ppm, 수입)', lpaPerKg: 0.41, pricePerKg: 2200, flavor: { cereal: 35, sweetness: 8, peat_smoke: 70 }, kinds: ['malt'] },
  malt_korean: { id: 'malt_korean', nameKo: '국산 맥아(소량 생산)', lpaPerKg: 0.39, pricePerKg: 3000, flavor: { cereal: 45, sweetness: 12, fresh_fruit: 4 }, kinds: ['malt'], native: ['KR'] },
  corn: { id: 'corn', nameKo: '옥수수(수입)', lpaPerKg: 0.38, pricePerKg: 450, flavor: { sweetness: 25, cereal: 12 }, kinds: ['grain'] },
  wheat: { id: 'wheat', nameKo: '밀(수입)', lpaPerKg: 0.37, pricePerKg: 500, flavor: { sweetness: 15, cereal: 10, floral: 3 }, kinds: ['grain'] },
  // 일본 본격 쇼추용
  rice_koji: { id: 'rice_koji', nameKo: '쌀 코지(입국)', lpaPerKg: 0.4, pricePerKg: 4000, flavor: { nuruk_rice: 60, fresh_fruit: 8, floral: 6 }, kinds: ['soju'], native: ['JP'] },
  sweet_potato: { id: 'sweet_potato', nameKo: '고구마', lpaPerKg: 0.13, pricePerKg: 600, flavor: { earthy: 15, sweetness: 22, floral: 10, fresh_fruit: 4 }, kinds: ['soju'], native: ['JP', 'KR'] },
  barley_raw: { id: 'barley_raw', nameKo: '보리(비맥아)', lpaPerKg: 0.38, pricePerKg: 900, flavor: { cereal: 25, toasted_grain: 10 }, kinds: ['soju'] },
  // 백주(고량주)용
  sorghum: { id: 'sorghum', nameKo: '고량(수수)', lpaPerKg: 0.36, pricePerKg: 900, flavor: { sorghum_grain: 45, earthy: 8 }, kinds: ['baijiu'], native: ['CN'] },
  daqu: { id: 'daqu', nameKo: '대곡(밀 누룩, 曲)', lpaPerKg: 0.15, pricePerKg: 3000, flavor: { fermented_umami: 25, tropical: 20, earthy: 10, sorghum_grain: 5 }, kinds: ['baijiu'], native: ['CN'] },
  // 대만 특산: 진먼(금문) 계약재배 고량 + 보리·밀 곡 → 청향형 58도 (결정 #58)
  sorghum_kinmen: { id: 'sorghum_kinmen', nameKo: '진먼 고량(金門 계약재배)', lpaPerKg: 0.37, pricePerKg: 1600, flavor: { sorghum_grain: 50, floral: 10, fresh_fruit: 8 }, kinds: ['baijiu'], native: ['TW'] },
  wheat_qu: { id: 'wheat_qu', nameKo: '맥곡(麥麴, 청향용)', lpaPerKg: 0.15, pricePerKg: 2600, flavor: { floral: 22, fresh_fruit: 20, sorghum_grain: 4, fermented_umami: 3 }, kinds: ['baijiu'], native: ['CN', 'TW'] },
  rice_domestic: { id: 'rice_domestic', nameKo: '국산 쌀', lpaPerKg: 0.46, pricePerKg: 2600, flavor: { nuruk_rice: 25, floral: 8, fresh_fruit: 8, sweetness: 8 }, kinds: ['soju'], native: ['KR'] },
  rice_processing: { id: 'rice_processing', nameKo: '가공용 쌀', lpaPerKg: 0.44, pricePerKg: 1300, flavor: { nuruk_rice: 20, floral: 5, fresh_fruit: 5, sweetness: 6, cereal: 5 }, kinds: ['soju'], native: ['KR'] },
  nuruk: { id: 'nuruk', nameKo: '전통 누룩', lpaPerKg: 0.1, pricePerKg: 6000, flavor: { nuruk_rice: 40, earthy: 6, fresh_fruit: 6 }, kinds: ['soju'], native: ['KR'] },
  // 입지 전용 원료 (결정 #87)
  jeju_millet: { id: 'jeju_millet', nameKo: '제주 차조(좁쌀) — 고소리술 원료', lpaPerKg: 0.42, pricePerKg: 4500, flavor: { nuruk_rice: 15, cereal: 18, earthy: 6, toasted_grain: 6, sweetness: 6 }, kinds: ['soju'], native: ['KR'], sites: ['jeju'] },
  potato: { id: 'potato', nameKo: '홋카이도 감자', lpaPerKg: 0.11, pricePerKg: 450, flavor: { earthy: 10, sweetness: 8, floral: 6, fresh_fruit: 4 }, kinds: ['soju'], native: ['JP'], sites: ['hokkaido'] },
};

/** 진 베이스 중성 스피릿(주정 95%) — L당 가격 */
export const GNS = { nameKo: '주정(95%)', abv: 0.95, pricePerL: 2300, flavor: { harshness: 35, solvent: 8, feinty: 8 } as Flavor };

/** native = 자생지. 다른 지역에서는 수입(물류 배수). 없으면 세계 상품 */
export interface BotanicalDef { id: string; nameKo: string; pricePerKg: number; perGram: Flavor; native?: string[]; /** 입지 전용 (결정 #87) */ sites?: string[] }

export const BOTANICALS: Record<string, BotanicalDef> = {
  juniper: { id: 'juniper', nameKo: '주니퍼', pricePerKg: 32000, perGram: { juniper: 2.0, herbal: 0.3 } },
  coriander: { id: 'coriander', nameKo: '고수씨', pricePerKg: 12000, perGram: { botanical_spice: 2.0, citrus: 1.0, floral: 0.5 } },
  angelica: { id: 'angelica', nameKo: '안젤리카 뿌리', pricePerKg: 60000, perGram: { herbal: 4.0, earthy: 1.0, body: 1.0 } },
  orris: { id: 'orris', nameKo: '오리스 뿌리', pricePerKg: 80000, perGram: { floral: 5.0, body: 1.0 } },
  lemon_peel: { id: 'lemon_peel', nameKo: '레몬 껍질', pricePerKg: 20000, perGram: { citrus: 4.0 } },
  cassia: { id: 'cassia', nameKo: '카시아', pricePerKg: 25000, perGram: { botanical_spice: 3.5, sweetness: 0.5 } },
  yuzu: { id: 'yuzu', nameKo: '유자 껍질', pricePerKg: 40000, perGram: { citrus: 4.5, floral: 1.5 }, native: ['KR', 'JP'] },
  omija: { id: 'omija', nameKo: '오미자', pricePerKg: 50000, perGram: { fresh_fruit: 2.5, botanical_spice: 2.0, sweetness: 0.5 }, native: ['KR'] },
  pine_needle: { id: 'pine_needle', nameKo: '솔잎', pricePerKg: 15000, perGram: { herbal: 3.0, juniper: 0.8 }, native: ['KR'] },
  sancho: { id: 'sancho', nameKo: '산초', pricePerKg: 70000, perGram: { botanical_spice: 4.0, citrus: 1.0 }, native: ['KR', 'JP'] },
  green_tea: { id: 'green_tea', nameKo: '녹차', pricePerKg: 60000, perGram: { herbal: 3.0, floral: 1.0 }, native: ['KR', 'JP', 'TW'] },
  sakura: { id: 'sakura', nameKo: '벚꽃(사쿠라)', pricePerKg: 90000, perGram: { floral: 5.0, sweetness: 0.5 }, native: ['JP'] },
  hinoki: { id: 'hinoki', nameKo: '히노키', pricePerKg: 40000, perGram: { herbal: 2.5, earthy: 1.0, juniper: 0.5 }, native: ['JP'] },
  maqaw: { id: 'maqaw', nameKo: '마고(산후추, 馬告)', pricePerKg: 80000, perGram: { citrus: 3.0, botanical_spice: 2.0 }, native: ['TW'] },
  oolong: { id: 'oolong', nameKo: '우롱차', pricePerKg: 70000, perGram: { floral: 2.0, herbal: 2.0, toasted_grain: 0.5 }, native: ['TW'] },
  jeju_citrus: { id: 'jeju_citrus', nameKo: '제주 청귤 껍질', pricePerKg: 35000, perGram: { citrus: 4.5, fresh_fruit: 1.0, floral: 0.5 }, native: ['KR'], sites: ['jeju'] },
};

export const YEASTS: Record<YeastId, { nameKo: string; yieldFactor: number; ester: number; tropical: number; acetic: number }> = {
  distillers: { nameKo: '증류용 효모', yieldFactor: 1.0, ester: 1.0, tropical: 0, acetic: 0 },
  ale: { nameKo: '에일 효모', yieldFactor: 0.97, ester: 1.4, tropical: 10, acetic: 0 },
  nuruk_native: { nameKo: '누룩 자연 발효', yieldFactor: 0.94, ester: 1.2, tropical: 3, acetic: 6 },
};

// ── 설비 ──
export type EquipmentDef =
  | { id: string; kind: 'still'; nameKo: string; cost: number; leadMonths: number; maintenance: number; stillType: StillType; condenser: CondenserType; chargeL: number; runsPerMonth: number; reflux: number; copperContact: number; vacuum: boolean; ginBasket: boolean }
  | { id: string; kind: 'fermenter'; nameKo: string; cost: number; leadMonths: number; maintenance: number; fermenterType: FermenterType; capacityL: number }
  | { id: string; kind: 'warehouse'; nameKo: string; cost: number; leadMonths: number; maintenance: number; casks: number; warehouseType: WarehouseType; tiers: number }
  /** 방재 설비 — 해당 재해의 피해를 막는다 (테크트리 도입 전 대체) */
  | { id: string; kind: 'facility'; nameKo: string; cost: number; leadMonths: number; maintenance: number; defends: string[]; note: string; regions?: RegionId[] }
  /** 비지터 센터 등급 — 상위 등급은 하위 등급이 있어야 지을 수 있다 */
  | { id: string; kind: 'visitor'; nameKo: string; cost: number; leadMonths: number; maintenance: number; tier: 1 | 2 | 3; visitorsPerMonth: number; spendPerVisitor: number; buzzQuality: number; requires?: string };

/** 더니지 = 흙바닥 3단 (안정·소용량), 랙 = 철골 다단 (대용량·상하단 격차 큼) */
export type WarehouseType = 'dunnage' | 'racked';

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
  warehouse_rack_100: { id: 'warehouse_rack_100', kind: 'warehouse', nameKo: '랙 숙성고 10단 (+100 캐스크)', cost: 150_000_000, leadMonths: 6, maintenance: 800_000, casks: 100, warehouseType: 'racked', tiers: 10 },
  warehouse_dunnage_45: { id: 'warehouse_dunnage_45', kind: 'warehouse', nameKo: '더니지 숙성고 3단 (+45 캐스크, 흙바닥·두꺼운 석벽)', cost: 120_000_000, leadMonths: 8, maintenance: 500_000, casks: 45, warehouseType: 'dunnage', tiers: 3 },
  // ── 방재 설비 ──
  facility_storm: { id: 'facility_storm', kind: 'facility', nameKo: '태풍·침수 방재 (방수문·배수 펌프)', cost: 60_000_000, leadMonths: 2, maintenance: 200_000, defends: ['typhoon', 'flood'], note: '태풍·집중호우 피해를 막는다' },
  facility_snow: { id: 'facility_snow', kind: 'facility', nameKo: '내설 지붕 보강', cost: 40_000_000, leadMonths: 2, maintenance: 100_000, defends: ['snowstorm'], note: '폭설로 지붕이 무너지는 것을 막는다' },
  facility_heating: { id: 'facility_heating', kind: 'facility', nameKo: '동파 방지·보온 설비', cost: 35_000_000, leadMonths: 1, maintenance: 300_000, defends: ['cold_wave'], note: '한파로 배관이 얼어 생산이 멈추는 것을 막는다' },
  facility_dehumid: { id: 'facility_dehumid', kind: 'facility', nameKo: '제습·환기 설비', cost: 45_000_000, leadMonths: 1, maintenance: 400_000, defends: ['mold_outbreak'], note: '곰팡이 증식을 막고 평소 캐스크 오염 확률을 절반으로' },
  kr_farm_registration: { id: 'kr_farm_registration', kind: 'facility', nameKo: '농업경영체 등록·원료 계약재배 (전통주 요건)', cost: 50_000_000, leadMonths: 6, maintenance: 1_000_000, defends: [], note: '지역특산주 자격 — 국산 원료 70%↑ 제품이 전통주 주세 경감 대상', regions: ['KR'] },
  facility_seismic: { id: 'facility_seismic', kind: 'facility', nameKo: '내진 랙 보강', cost: 80_000_000, leadMonths: 3, maintenance: 200_000, defends: ['earthquake'], note: '지진에 랙이 무너지는 것을 막는다' },
  // ── 비지터 센터 ──
  visitor_basic: { id: 'visitor_basic', kind: 'visitor', nameKo: '비지터 센터 — 베이직 투어', cost: 80_000_000, leadMonths: 4, maintenance: 3_000_000, tier: 1, visitorsPerMonth: 600, spendPerVisitor: 15_000, buzzQuality: 0.6 },
  // 결정 #92: VIP·레스토랑은 소수 고객 상품 — v1.4 수치(VIP 월 400명 × 6만 원)는 관광 배수가 높은 입지에서 본업보다 많이 벌어(오사카·교토 순자산 54억) 방문객·객단가를 낮췄다 [튜닝]
  visitor_vip: { id: 'visitor_vip', kind: 'visitor', nameKo: '비지터 센터 — VIP 테이스팅 라운지', cost: 200_000_000, leadMonths: 6, maintenance: 4_000_000, tier: 2, visitorsPerMonth: 150, spendPerVisitor: 50_000, buzzQuality: 1.2, requires: 'visitor_basic' },
  visitor_restaurant: { id: 'visitor_restaurant', kind: 'visitor', nameKo: '비지터 센터 — 레스토랑 결합형', cost: 500_000_000, leadMonths: 9, maintenance: 8_000_000, tier: 3, visitorsPerMonth: 300, spendPerVisitor: 40_000, buzzQuality: 1.5, requires: 'visitor_vip' },
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
/** 600ml = 대만 고량주 표준 병 */
export const BOTTLE_SIZES = [375, 500, 600, 700] as const;
export type BottleMl = (typeof BOTTLE_SIZES)[number];

export const PACKAGING: Record<string, { nameKo: string; costBySize: Record<BottleMl, number>; luxury: number }> = {
  standard: { nameKo: '스탠다드 병 + 코르크', costBySize: { 375: 1500, 500: 2000, 600: 2400, 700: 2800 }, luxury: 1.0 },
  premium: { nameKo: '디캔터 + 케이스', costBySize: { 375: 6000, 500: 8000, 600: 9500, 700: 11000 }, luxury: 1.15 },
};

export function packagingCost(packagingId: string, bottleMl: number): number {
  const p = PACKAGING[packagingId];
  if (!p) return 0;
  return p.costBySize[bottleMl as BottleMl] ?? Math.round(p.costBySize[700] * (bottleMl / 700));
}

// ── 캐스크 시장 (결정 #66) [튜닝] ──
export const CASK_MARKET = {
  /** 쿠퍼리지 정상 주문: 카탈로그가, 2개월 뒤 도착 */
  cooperageLeadMonths: 2,
  /** 스팟 마켓: 즉시 입고, 웃돈 */
  spotPremium: 1.3,
  /** 스팟 매입 통이 '골빈 통'(3필 이상·활성도 바닥)일 확률 */
  spotDudChance: 0.2,
  /** 시즈닝 계약: 새 통을 보데가·버번 증류소에 보내 시즈닝 — 기간과 통당 총비용(카탈로그가 대비) */
  seasoningMonths: 24,
  seasoningCostFactor: 0.65,
  /** 중고 통 매각가 = 카탈로그가 × (base + perActivity × 활성도) — 럼·테킬라·수제 맥주 양조장 */
  usedSaleBase: 0.1,
  usedSalePerActivity: 0.4,
};

// ── 캐스크 보관비·보험료 (PRD §5.5, 결정 #61) — 숙성 재고를 묵히는 데도 돈이 든다 [튜닝]
export const CASK_STORAGE = {
  /** 원액이 든 캐스크 1개당 월 보관비(랙·공간·관리) — 지역 인건비 배수를 곱한다 */
  perCaskPerMonth: 5_000,
  /** 월 보험료 = 캐스크 원액 벌크 가치 × 이 비율 (연 1.2%) */
  insuranceRatePerMonth: 0.001,
};

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
  /** v1.3(#77): 0.9 → 1.1 — 장기 계약은 물량 보장 대가로 현물 기준가보다 비싸다 */
  contract: 1.1,
  /** 계약 기간 프리미엄: 24개월 +4%, 36개월 +8% */
  termPremiumPer12: 0.04,
  /** 선급금을 받으면 단가 할인 */
  prepayDiscount: 0.05,
  /** 미납 1 LPA당 위약금 = 계약가 × penaltyRate */
  penaltyRate: 0.3,
  maxActiveContracts: 5,
  /** 크래프트 프리미엄 계약(#78): 생산 능력의 10~20%, 단가 ×1.5, 최소 품질 40~46 */
  craftPriceFactor: 1.5,
  craftChance: 0.3,
  /** 그레인 뉴메이크 기준가(원/LPA) — 대량·저가 */
  grainNewMakeBase: 7_000,
  grainAgePerYear: 0.12,
  /** 그레인 현물 시장 포화(#81) — 깊이는 지역별(RegionDef.grainSpotDepthLPA). 그레인 원액은 대형 블렌더가 자체 증류소에서
   *  만들어 외부 구매자가 적다. 몰트 현물(브로커) 시장은 깊어서 포화 없음.
   *  현물 판매량 기억의 월 감쇠 — 시장이 물량을 소화하는 속도 */
  spotDecay: 0.6,
};

/**
 * 병 가격·매력도의 숙성 프리미엄 (결정 #95) [튜닝]. 3년(×1.18)까지는 그대로(`agePerception`의 어린 위스키 구간),
 * 그 뒤로는 캐스크 원액의 벌크 기준가치(BULK.agePerYear·grainAgePerYear)와 같은 비율로 오른다 —
 * 오래 묵힌 원액을 병에 담아도 캐스크로 두는 것보다 가치가 덜 오르지 않게. 몰트 6년 ×1.62, 10년 ×2.21, 12년 ×2.51 (이전 연 6%·12년 상한: ×1.36·×1.60·×1.72).
 * capYears 이후로는 오르지 않는다 (게임 10년 안에는 닿지 않는 상한)
 */
export const AGE_PREMIUM = {
  baseYears: 3,
  base: 1.18,
  capYears: 18,
  /** 3년 이후 연 상승률 = 같은 원액의 벌크 숙성 상승률. 블렌디드는 몰트와 그레인의 중간. 그 밖(카테고리 미지정)은 몰트 */
  perYear: { whisky: BULK.agePerYear, grain_whisky: BULK.grainAgePerYear, blended_whisky: (BULK.agePerYear + BULK.grainAgePerYear) / 2 } as Partial<Record<ProductCategory, number>>,
  /** 3년 이후 상승률 배수 — 1이면 벌크와 같은 비율 [튜닝] */
  rateScale: 1,
  /** 실험용: true면 결정 #95 이전 공식(3년 1.18, 이후 연 +0.06, 12년 상한) */
  legacy: false,
};

/** 대량 구매 할인 (원재료별 월 구매량 kg 기준) */
export const VOLUME_DISCOUNT_TIERS: { minKg: number; factor: number }[] = [
  { minKg: 40_000, factor: 0.85 },
  { minKg: 15_000, factor: 0.9 },
  { minKg: 5_000, factor: 0.95 },
];

// 원액 구매자 목록은 content/names.ts (BUYERS)로 이동 — 실명/가상명 전환 지원


// ── 대출 상품 ──
export interface LoanOfferDef { id: string; nameKo: string; annualRate: number; termMonths: number; max: number; requires?: 'producedSoju'; /** 원금 거치 기간(이자만 납부) */ graceMonths: number; /** 이 지역에서만 신청 가능 */ regions?: RegionId[]; note?: string; /** 숙성 재고 담보 — 담보 인정 비율이 있는 입지에서만, 한도 = 재고 시가 × 비율 (결정 #90) */ collateral?: 'inventory' }

export const LOAN_OFFERS: LoanOfferDef[] = [
  { id: 'facility', nameKo: '시설자금 대출', annualRate: 0.05, termMonths: 120, max: 1_000_000_000, graceMonths: 24 },
  { id: 'working', nameKo: '운전자금 대출', annualRate: 0.075, termMonths: 36, max: 300_000_000, graceMonths: 0 },
  { id: 'policy', nameKo: '전통주 육성 정책자금', annualRate: 0.025, termMonths: 60, max: 200_000_000, requires: 'producedSoju', graceMonths: 12 },
  // 한국 완화책(#73) — 고난도 지역은 유지하되 정책 융자로 버틸 길을 준다. 금리·조건은 게임 단순화 [확인 필요]
  { id: 'kr_regional', nameKo: 'K-위스키 지역 특화 산업 육성자금 (지자체)', annualRate: 0.02, termMonths: 96, max: 300_000_000, graceMonths: 24, regions: ['KR'], note: '경북 등 지자체의 K-위스키 산업 육성 기조를 단순화' },
  { id: 'kr_startup', nameKo: '창업기반지원자금 (중소벤처기업진흥공단)', annualRate: 0.025, termMonths: 72, max: 200_000_000, graceMonths: 18, regions: ['KR'], note: '창업 7년 이내 중소기업 정책 융자를 단순화' },
  // 재고 담보대출 (결정 #90, 홋카이도) — 숙성 원액 시가를 담보로. 시가가 떨어지면 추가 상환 요구 [튜닝]
  { id: 'inventory', nameKo: '숙성 재고 담보대출', annualRate: 0.06, termMonths: 60, max: 2_000_000_000, graceMonths: 12, collateral: 'inventory', note: '담보 인정 비율이 있는 입지(홋카이도)에서만' },
];

// ── 직원 ──
export const ROLE_INFO: Record<'distiller' | 'warehouse' | 'sales' | 'office', { nameKo: string; stats: [string, string, string]; baseSalary: number }> = {
  office: { nameKo: '사무(백오피스)', stats: ['세무', '협상', '행정'], baseSalary: 3_200_000 },
  distiller: { nameKo: '마스터 디스틸러', stats: ['후각', '공정', '직관'], baseSalary: 4_500_000 },
  warehouse: { nameKo: '숙성고 매니저', stats: ['관찰', '환경통제', '성실'], baseSalary: 3_500_000 },
  sales: { nameKo: '영업', stats: ['친화', '네트워크', '협상'], baseSalary: 3_800_000 },
};

export const NAME_POOLS: Record<'KR' | 'JP' | 'TW', { surnames: string[]; given: string[] }> = {
  KR: { surnames: ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황'], given: ['민준', '서연', '도윤', '지우', '하준', '서윤', '은우', '하은', '지호', '수아', '현우', '지민', '예준', '채원', '건우', '다은'] },
  JP: { surnames: ['사토 ', '스즈키 ', '다카하시 ', '다나카 ', '와타나베 ', '이토 ', '야마모토 ', '나카무라 '], given: ['하루토', '유이', '소타', '미오', '렌', '히나', '유토', '사쿠라'] },
  TW: { surnames: ['천', '린', '황', '장', '리', '왕', '우', '류'], given: ['즈하오', '이팅', '젠훙', '샤오웨이', '자오', '옌쥔', '이린', '웨이훙'] },
};
export const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황'];
export const GIVEN_NAMES = ['민준', '서연', '도윤', '지우', '하준', '서윤', '은우', '하은', '지호', '수아', '현우', '지민', '예준', '채원', '건우', '다은', '우진', '소율', '선우', '윤서'];
