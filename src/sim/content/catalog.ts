import type { CaskTypeId, CondenserType, Flavor, FermenterType, StillType, WoodId, YeastId } from '../types';

// 콘텐츠 카탈로그 — 모든 수치 [튜닝]. 가격은 KRW.

export interface IngredientDef {
  id: string;
  nameKo: string;
  /** 원료 1kg(또는 1L)이 발효로 만드는 알코올 LPA */
  lpaPerKg: number;
  pricePerKg: number;
  flavor: Flavor;
  /** 매시에 쓰는 주종 */
  kinds: ('soju' | 'malt')[];
}

export const INGREDIENTS: Record<string, IngredientDef> = {
  malt_unpeated: { id: 'malt_unpeated', nameKo: '맥아(언피티드, 수입)', lpaPerKg: 0.42, pricePerKg: 1900, flavor: { cereal: 40, sweetness: 10 }, kinds: ['malt'] },
  malt_peated: { id: 'malt_peated', nameKo: '피티드 맥아(40ppm, 수입)', lpaPerKg: 0.41, pricePerKg: 2600, flavor: { cereal: 35, sweetness: 8, peat_smoke: 70 }, kinds: ['malt'] },
  malt_korean: { id: 'malt_korean', nameKo: '국산 맥아(소량 생산)', lpaPerKg: 0.39, pricePerKg: 3400, flavor: { cereal: 45, sweetness: 12, fresh_fruit: 4 }, kinds: ['malt'] },
  rice_domestic: { id: 'rice_domestic', nameKo: '국산 쌀', lpaPerKg: 0.46, pricePerKg: 2600, flavor: { nuruk_rice: 25, floral: 8, fresh_fruit: 8, sweetness: 8 }, kinds: ['soju'] },
  rice_processing: { id: 'rice_processing', nameKo: '가공용 쌀', lpaPerKg: 0.44, pricePerKg: 1300, flavor: { nuruk_rice: 20, floral: 5, fresh_fruit: 5, sweetness: 6, cereal: 5 }, kinds: ['soju'] },
  nuruk: { id: 'nuruk', nameKo: '전통 누룩', lpaPerKg: 0.1, pricePerKg: 6000, flavor: { nuruk_rice: 40, earthy: 6, fresh_fruit: 6 }, kinds: ['soju'] },
};

/** 진 베이스 중성 스피릿(주정 95%) — L당 가격 */
export const GNS = { nameKo: '주정(95%)', abv: 0.95, pricePerL: 2300, flavor: { harshness: 35, solvent: 8, feinty: 8 } as Flavor };

export interface BotanicalDef { id: string; nameKo: string; pricePerKg: number; perGram: Flavor; region: 'base' | 'KR' }

export const BOTANICALS: Record<string, BotanicalDef> = {
  juniper: { id: 'juniper', nameKo: '주니퍼', pricePerKg: 32000, perGram: { juniper: 2.0, herbal: 0.3 }, region: 'base' },
  coriander: { id: 'coriander', nameKo: '고수씨', pricePerKg: 12000, perGram: { botanical_spice: 2.0, citrus: 1.0, floral: 0.5 }, region: 'base' },
  angelica: { id: 'angelica', nameKo: '안젤리카 뿌리', pricePerKg: 60000, perGram: { herbal: 4.0, earthy: 1.0, body: 1.0 }, region: 'base' },
  orris: { id: 'orris', nameKo: '오리스 뿌리', pricePerKg: 80000, perGram: { floral: 5.0, body: 1.0 }, region: 'base' },
  lemon_peel: { id: 'lemon_peel', nameKo: '레몬 껍질', pricePerKg: 20000, perGram: { citrus: 4.0 }, region: 'base' },
  cassia: { id: 'cassia', nameKo: '카시아', pricePerKg: 25000, perGram: { botanical_spice: 3.5, sweetness: 0.5 }, region: 'base' },
  yuzu: { id: 'yuzu', nameKo: '유자 껍질', pricePerKg: 40000, perGram: { citrus: 4.5, floral: 1.5 }, region: 'KR' },
  omija: { id: 'omija', nameKo: '오미자', pricePerKg: 50000, perGram: { fresh_fruit: 2.5, botanical_spice: 2.0, sweetness: 0.5 }, region: 'KR' },
  pine_needle: { id: 'pine_needle', nameKo: '솔잎', pricePerKg: 15000, perGram: { herbal: 3.0, juniper: 0.8 }, region: 'KR' },
  sancho: { id: 'sancho', nameKo: '산초', pricePerKg: 70000, perGram: { botanical_spice: 4.0, citrus: 1.0 }, region: 'KR' },
  green_tea: { id: 'green_tea', nameKo: '녹차', pricePerKg: 60000, perGram: { herbal: 3.0, floral: 1.0 }, region: 'KR' },
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
  | { id: string; kind: 'warehouse'; nameKo: string; cost: number; leadMonths: number; maintenance: number; casks: number };

export const EQUIPMENT: Record<string, EquipmentDef> = {
  pot_onion_1000: { id: 'pot_onion_1000', kind: 'still', nameKo: '단식 증류기 1,000L (양파형)', cost: 300_000_000, leadMonths: 4, maintenance: 1_500_000, stillType: 'pot_onion', condenser: 'copper_shell', chargeL: 1000, runsPerMonth: 20, reflux: 0.4, copperContact: 1.0, vacuum: false, ginBasket: true },
  pot_lantern_1000: { id: 'pot_lantern_1000', kind: 'still', nameKo: '단식 증류기 1,000L (랜턴형)', cost: 330_000_000, leadMonths: 4, maintenance: 1_500_000, stillType: 'pot_lantern', condenser: 'copper_shell', chargeL: 1000, runsPerMonth: 20, reflux: 0.6, copperContact: 1.0, vacuum: false, ginBasket: true },
  pot_worm_1000: { id: 'pot_worm_1000', kind: 'still', nameKo: '단식 증류기 1,000L (스트레이트형 + 웜텁)', cost: 360_000_000, leadMonths: 5, maintenance: 1_800_000, stillType: 'pot_onion', condenser: 'worm_tub', chargeL: 1000, runsPerMonth: 18, reflux: 0.2, copperContact: 0.4, vacuum: false, ginBasket: false },
  hybrid_600: { id: 'hybrid_600', kind: 'still', nameKo: '하이브리드 증류기 600L (포트+컬럼)', cost: 280_000_000, leadMonths: 3, maintenance: 1_300_000, stillType: 'hybrid', condenser: 'copper_shell', chargeL: 600, runsPerMonth: 24, reflux: 0.85, copperContact: 0.9, vacuum: false, ginBasket: true },
  vacuum_1000: { id: 'vacuum_1000', kind: 'still', nameKo: '감압 증류기 1,000L (소주용)', cost: 350_000_000, leadMonths: 4, maintenance: 1_700_000, stillType: 'vacuum_pot', condenser: 'copper_shell', chargeL: 1000, runsPerMonth: 20, reflux: 0.3, copperContact: 0.8, vacuum: true, ginBasket: false },
  ferm_steel_2000: { id: 'ferm_steel_2000', kind: 'fermenter', nameKo: '스테인리스 발효조 2,000L', cost: 40_000_000, leadMonths: 1, maintenance: 200_000, fermenterType: 'stainless', capacityL: 2000 },
  ferm_onggi_set: { id: 'ferm_onggi_set', kind: 'fermenter', nameKo: '옹기 발효 세트 (1,200L 상당)', cost: 30_000_000, leadMonths: 1, maintenance: 300_000, fermenterType: 'onggi', capacityL: 1200 },
  warehouse_rack_100: { id: 'warehouse_rack_100', kind: 'warehouse', nameKo: '랙 숙성고 증설 (+100 캐스크)', cost: 150_000_000, leadMonths: 6, maintenance: 800_000, casks: 100 },
};

// ── 캐스크 ──
export interface CaskDef {
  id: CaskTypeId; nameKo: string; sizeL: number; wood: WoodId; price: number;
  activity: number; seasoning: number; seasoningType: 'bourbon' | 'sherry' | 'none'; char: number;
}

export const CASKS: Record<CaskTypeId, CaskDef> = {
  ex_bourbon_barrel: { id: 'ex_bourbon_barrel', nameKo: 'ex-버번 배럴 200L', sizeL: 200, wood: 'american_oak', price: 350_000, activity: 1.0, seasoning: 1.0, seasoningType: 'bourbon', char: 3 },
  oloroso_butt: { id: 'oloroso_butt', nameKo: '올로로소 셰리 벗 500L', sizeL: 500, wood: 'european_oak', price: 1_800_000, activity: 1.0, seasoning: 1.0, seasoningType: 'sherry', char: 1 },
  korean_oak_quarter: { id: 'korean_oak_quarter', nameKo: '한국 참나무(신갈나무) 쿼터 125L, 신품', sizeL: 125, wood: 'korean_oak', price: 900_000, activity: 1.3, seasoning: 0, seasoningType: 'none', char: 3 },
};

/** 목재별 월간 추출 기여 (activity·속도 1 기준) */
export const WOOD_EXTRACT: Record<WoodId, Flavor> = {
  american_oak: { vanilla_caramel: 1.6, oak_tannin: 0.6, wood_spice: 0.5, color: 1.2, sweetness: 0.4 },
  european_oak: { vanilla_caramel: 0.7, oak_tannin: 1.3, wood_spice: 0.8, color: 1.5 },
  korean_oak: { vanilla_caramel: 0.9, oak_tannin: 1.2, wood_spice: 1.0, color: 1.3 },
};

/** 시즈닝 향 월간 기여 (seasoning 1 기준) */
export const SEASONING_EXTRACT: Record<'bourbon' | 'sherry' | 'none', Flavor> = {
  bourbon: { vanilla_caramel: 0.8, sweetness: 0.4, tropical: 0.2 },
  sherry: { dried_fruit: 2.0, nutty_rancio: 0.3, sweetness: 0.5, color: 1.0 },
  none: {},
};

export const RECHAR_COST = 150_000;

// ── 패키징 ──
export const PACKAGING: Record<string, { nameKo: string; costPerBottle: number; luxury: number }> = {
  standard: { nameKo: '스탠다드 병 + 코르크', costPerBottle: 3000, luxury: 1.0 },
  premium: { nameKo: '디캔터 + 케이스', costPerBottle: 12000, luxury: 1.15 },
};

export const BOTTLE_SIZES = [375, 500, 700] as const;

// ── 대출 상품 ──
export interface LoanOfferDef { id: string; nameKo: string; annualRate: number; termMonths: number; max: number; requires?: 'producedSoju' }

export const LOAN_OFFERS: LoanOfferDef[] = [
  { id: 'facility', nameKo: '시설자금 대출', annualRate: 0.05, termMonths: 120, max: 1_000_000_000 },
  { id: 'working', nameKo: '운전자금 대출', annualRate: 0.075, termMonths: 36, max: 300_000_000 },
  { id: 'policy', nameKo: '전통주 육성 정책자금', annualRate: 0.025, termMonths: 60, max: 200_000_000, requires: 'producedSoju' },
];

// ── 직원 ──
export const ROLE_INFO: Record<'distiller' | 'warehouse' | 'sales', { nameKo: string; stats: [string, string, string]; baseSalary: number }> = {
  distiller: { nameKo: '마스터 디스틸러', stats: ['후각', '공정', '직관'], baseSalary: 4_500_000 },
  warehouse: { nameKo: '숙성고 매니저', stats: ['관찰', '환경통제', '성실'], baseSalary: 3_500_000 },
  sales: { nameKo: '영업', stats: ['친화', '네트워크', '협상'], baseSalary: 3_800_000 },
};

export const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황'];
export const GIVEN_NAMES = ['민준', '서연', '도윤', '지우', '하준', '서윤', '은우', '하은', '지호', '수아', '현우', '지민', '예준', '채원', '건우', '다은', '우진', '소율', '선우', '윤서'];
