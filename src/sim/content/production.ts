import type { VesselMaterial, CaskTypeId, CondenserType, Flavor, FermenterType, RegionId, StillType, WoodId, YeastId } from '../types';

// 생산 콘텐츠 (파트 PROD, 결정 #144) — 원재료·보태니컬·효모·생산 설비·캐스크·캐스크 시장·보관비. 모든 수치 [튜닝]. 가격은 KRW.
// 설비 목록 EQUIPMENT는 content/catalog.ts가 파트별 항목을 원래 순서대로 조립한다

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
  /** 발효제(누룩·코지·곡) — 주원료가 아니라 당화·발효를 일으키는 재료. 생산 화면의 크래프팅 레버가 "주원료 + 발효제 비율"로 나눠 보여 준다(#156). 계산에는 쓰지 않는다 */
  starter?: boolean;
}

export const INGREDIENTS: Record<string, IngredientDef> = {
  malt_unpeated: { id: 'malt_unpeated', nameKo: '맥아(언피티드, 수입)', lpaPerKg: 0.42, pricePerKg: 1600, flavor: { cereal: 40, sweetness: 10 }, kinds: ['malt', 'grain'] },
  malt_peated: { id: 'malt_peated', nameKo: '피티드 맥아(40ppm, 수입)', lpaPerKg: 0.41, pricePerKg: 2200, flavor: { cereal: 35, sweetness: 8, peat_smoke: 70 }, kinds: ['malt'] },
  malt_korean: { id: 'malt_korean', nameKo: '국산 맥아(소량 생산)', lpaPerKg: 0.39, pricePerKg: 3000, flavor: { cereal: 45, sweetness: 12, fresh_fruit: 4 }, kinds: ['malt'], native: ['KR'] },
  corn: { id: 'corn', nameKo: '옥수수(수입)', lpaPerKg: 0.38, pricePerKg: 450, flavor: { sweetness: 25, cereal: 12 }, kinds: ['grain'] },
  wheat: { id: 'wheat', nameKo: '밀(수입)', lpaPerKg: 0.37, pricePerKg: 500, flavor: { sweetness: 15, cereal: 10, floral: 3 }, kinds: ['grain'] },
  // 일본 본격 쇼추용
  rice_koji: { id: 'rice_koji', nameKo: '쌀 코지(입국)', lpaPerKg: 0.4, pricePerKg: 4000, flavor: { nuruk_rice: 60, fresh_fruit: 8, floral: 6 }, kinds: ['soju'], native: ['JP'], starter: true },
  sweet_potato: { id: 'sweet_potato', nameKo: '고구마', lpaPerKg: 0.13, pricePerKg: 600, flavor: { earthy: 15, sweetness: 22, floral: 10, fresh_fruit: 4 }, kinds: ['soju'], native: ['JP', 'KR'] },
  barley_raw: { id: 'barley_raw', nameKo: '보리(비맥아)', lpaPerKg: 0.38, pricePerKg: 900, flavor: { cereal: 25, toasted_grain: 10 }, kinds: ['soju'] },
  // 백주(고량주)용
  sorghum: { id: 'sorghum', nameKo: '고량(수수)', lpaPerKg: 0.36, pricePerKg: 900, flavor: { sorghum_grain: 45, earthy: 8 }, kinds: ['baijiu'], native: ['CN'] },
  daqu: { id: 'daqu', nameKo: '대곡(밀 누룩, 曲)', lpaPerKg: 0.15, pricePerKg: 3000, flavor: { fermented_umami: 25, tropical: 20, earthy: 10, sorghum_grain: 5 }, kinds: ['baijiu'], native: ['CN'], starter: true },
  // 대만 특산: 진먼(금문) 계약재배 고량 + 보리·밀 곡 → 청향형 58도 (결정 #58)
  sorghum_kinmen: { id: 'sorghum_kinmen', nameKo: '진먼 고량(金門 계약재배)', lpaPerKg: 0.37, pricePerKg: 1600, flavor: { sorghum_grain: 50, floral: 10, fresh_fruit: 8 }, kinds: ['baijiu'], native: ['TW'] },
  wheat_qu: { id: 'wheat_qu', nameKo: '맥곡(麥麴, 청향용)', lpaPerKg: 0.15, pricePerKg: 2600, flavor: { floral: 22, fresh_fruit: 20, sorghum_grain: 4, fermented_umami: 3 }, kinds: ['baijiu'], native: ['CN', 'TW'], starter: true },
  rice_domestic: { id: 'rice_domestic', nameKo: '국산 쌀', lpaPerKg: 0.46, pricePerKg: 2600, flavor: { nuruk_rice: 25, floral: 8, fresh_fruit: 8, sweetness: 8 }, kinds: ['soju'], native: ['KR'] },
  rice_processing: { id: 'rice_processing', nameKo: '가공용 쌀', lpaPerKg: 0.44, pricePerKg: 1300, flavor: { nuruk_rice: 20, floral: 5, fresh_fruit: 5, sweetness: 6, cereal: 5 }, kinds: ['soju'], native: ['KR'] },
  nuruk: { id: 'nuruk', nameKo: '전통 누룩', lpaPerKg: 0.1, pricePerKg: 6000, flavor: { nuruk_rice: 40, earthy: 6, fresh_fruit: 6 }, kinds: ['soju'], native: ['KR'], starter: true },
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
  | { id: string; kind: 'facility'; nameKo: string; cost: number; leadMonths: number; maintenance: number; defends: string[]; note: string; regions?: RegionId[]; requires?: string }
  /** 비지터 센터 등급 — 상위 등급은 하위 등급이 있어야 지을 수 있다 */
  | { id: string; kind: 'visitor'; nameKo: string; cost: number; leadMonths: number; maintenance: number; tier: 1 | 2 | 3; visitorsPerMonth: number; spendPerVisitor: number; buzzQuality: number; requires?: string; /** 방문객 대신 다른 효과를 내는 설비(기프트 샵, #234)의 설명 — 구매 표의 사양 칸에 보인다 */ note?: string };

/** 더니지 = 흙바닥 3단 (안정·소용량), 랙 = 철골 다단 (대용량·상하단 격차 큼) */
export type WarehouseType = 'dunnage' | 'racked';

/** 생산 설비 — 증류기·발효조·숙성고 */
export const PRODUCTION_EQUIPMENT: Record<string, EquipmentDef> = {
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
  // 핸드필 존 (#233, 2026-11-10 오너 요청) — 숙성고 한쪽에 통 하나를 내놓고 방문객이 직접 병에 담아 간다. 비지터 센터가 있어야 손님이 온다
  handfill_zone: { id: 'handfill_zone', kind: 'facility', nameKo: '핸드필 존 (방문객이 통에서 직접 담는 한정판)', cost: 30_000_000, leadMonths: 2, maintenance: 500_000, defends: [], note: '통 1개를 핸드필 전용으로 지정 — 방문객이 500ml 캐스크 스트렝스로 담아 간다(병입 출고가의 약 2배)', requires: 'visitor_basic' },
};

// ── 캐스크 ──
export interface CaskDef {
  id: CaskTypeId; nameKo: string; sizeL: number; wood: WoodId; price: number;
  activity: number; seasoning: number; seasoningType: 'bourbon' | 'sherry' | 'none'; char: number;
  /** 누수 위험 배수 (미즈나라는 결이 성겨 잘 샌다) */
  leakFactor?: number;
  /** 용기 재질 (S-10). 없으면 나무 — 지금 콘텐츠는 모두 나무다. 옹기·스테인리스 용기는 단계 P(PROD)에서 향미 모델(flavor-model §4.5 확장)과 함께 넣는다 */
  material?: VesselMaterial;
}

/**
 * 나무가 아닌 용기의 숙성 (S-10 자리 → 모델 #161, flavor-model §4.5.1). 나무의 ②추출이 없고 ①제거·③반응만 있다(tech-tree ASN-3a 보충).
 * - evapFactor: 같은 크기 나무 캐스크 대비 증발 배수
 * - removal: 월 ①제거 계수(유황·거친 맛·용제·후류취) — 새 나무 캐스크(탄화 3·활성도 1)는 약 0.0105
 * - integration·fruit·floral: 월 ③반응(시간 비례, 크기와 무관)
 * 값은 모두 `[튜닝]`, 근거 없음 `[확인 불가]` — 옹기는 원안 "엔젤스 셰어 ×0.5"만 출처가 있다(tech-tree)
 */
export const NON_WOOD_VESSEL: Record<Exclude<VesselMaterial, 'wood'>, { evapFactor: number; removal: number; integration: number; fruit: number; floral: number }> = {
  /** 옹기: 미세 기공으로 숨을 쉰다 — 증발이 나무의 절반, 거친 맛·이취가 나무보다 천천히 풀리고 둥글어진다. 나무 향(바닐라·탄닌)은 없다 */
  onggi: { evapFactor: 0.5, removal: 0.02, integration: 1.0, fruit: 0.1, floral: 0.05 },
  /** 스테인리스 휴지: 증발 없음, 안정화만. 지금 콘텐츠에는 없다 — 스테인리스 휴지는 탱크 보관(restLot)이 맡는다 */
  steel: { evapFactor: 0, removal: 0.002, integration: 0.5, fruit: 0, floral: 0 },
};

export const CASKS: Record<CaskTypeId, CaskDef> = {
  ex_bourbon_barrel: { id: 'ex_bourbon_barrel', nameKo: 'ex-버번 배럴 200L', sizeL: 200, wood: 'american_oak', price: 350_000, activity: 1.0, seasoning: 1.0, seasoningType: 'bourbon', char: 3 },
  oloroso_butt: { id: 'oloroso_butt', nameKo: '올로로소 셰리 벗 500L', sizeL: 500, wood: 'european_oak', price: 1_800_000, activity: 1.0, seasoning: 1.0, seasoningType: 'sherry', char: 1 },
  korean_oak_quarter: { id: 'korean_oak_quarter', nameKo: '한국 참나무(신갈나무) 쿼터 125L, 신품', sizeL: 125, wood: 'korean_oak', price: 900_000, activity: 1.3, seasoning: 0, seasoningType: 'none', char: 3 },
  mizunara_hogshead: { id: 'mizunara_hogshead', nameKo: '미즈나라 혹스헤드 250L, 신품', sizeL: 250, wood: 'mizunara', price: 3_500_000, activity: 1.2, seasoning: 0, seasoningType: 'none', char: 2, leakFactor: 3 },
  // 옹기 항아리 (#161) — 나무 향 없이 미세 기공으로 숨 쉬며 부드러워진다. 화이트 스피릿(소주·백주) 숙성용. 오크 숙성 개월에 안 들어간다. 크기·가격 [튜닝]·[확인 불가]
  onggi_jar: { id: 'onggi_jar', nameKo: '옹기 항아리 200L (숨 쉬는 독)', sizeL: 200, wood: 'none', price: 400_000, activity: 0, seasoning: 0, seasoningType: 'none', char: 0, material: 'onggi' },
};

/** 목재별 월간 추출 기여 (activity·속도 1 기준) */
export const WOOD_EXTRACT: Record<WoodId, Flavor> = {
  american_oak: { vanilla_caramel: 1.6, oak_tannin: 0.6, wood_spice: 0.5, color: 1.2, sweetness: 0.4 },
  european_oak: { vanilla_caramel: 0.7, oak_tannin: 1.3, wood_spice: 0.8, color: 1.5 },
  korean_oak: { vanilla_caramel: 0.9, oak_tannin: 1.2, wood_spice: 1.0, color: 1.3 },
  mizunara: { vanilla_caramel: 0.6, oak_tannin: 1.0, wood_spice: 0.8, color: 1.0, sweetness: 0.2 },
  /** 나무가 아닌 용기 — 추출 없음 (matureVessel이 재질로 나눠 matureCask에 오지 않는다) */
  none: {},
};

/** 시즈닝 향 월간 기여 (seasoning 1 기준) */
export const SEASONING_EXTRACT: Record<'bourbon' | 'sherry' | 'none', Flavor> = {
  bourbon: { vanilla_caramel: 0.8, sweetness: 0.4, tropical: 0.2 },
  sherry: { dried_fruit: 2.0, nutty_rancio: 0.3, sweetness: 0.5, color: 1.0 },
  none: {},
};

export const RECHAR_COST = 150_000;

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

/** 캐스크 1회 사용에 배분하는 캐스크 원가 비율 (평균 3회 사용 가정) */
export const CASK_COST_SHARE_PER_FILL = 1 / 3;

/** 대량 구매 할인 (원재료별 월 구매량 kg 기준) */
export const VOLUME_DISCOUNT_TIERS: { minKg: number; factor: number }[] = [
  { minKg: 40_000, factor: 0.85 },
  { minKg: 15_000, factor: 0.9 },
  { minKg: 5_000, factor: 0.95 },
];
