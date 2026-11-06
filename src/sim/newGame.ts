import { CASKS, INGREDIENTS } from './content/catalog';
import { refreshBroker } from './broker';
import { refreshContractOffers } from './bulk';
import { refreshCandidates, salaryFor } from './hr';
import { mulberry32 } from './rng';
import type { Cask, CaskTypeId, GameState, Recipe, RegionId } from './types';
import { regionOf, siteOf } from './content/regions';
import { nid } from './util';

export interface NewGameOptions {
  seed?: number;
  distilleryName?: string;
  startYear?: number;
  startingCash?: number;
  region?: RegionId;
  /** 지역 안의 입지 (예: 대만 진먼섬, 한국 안동). 없으면 지역 기본 입지 */
  site?: string;
}

export const DEFAULT_STARTING_CASH = 500_000_000;

export function presetRecipes(stillId: string, region: RegionId = 'KR', site?: string): Omit<Recipe, 'id'>[] {
  const base = { botanicals: [], botanicalMethod: 'steep' as const, pressure: 'atmospheric' as const, stillId };
  // 입지 원료 프리셋 (결정 #87): 제주 고소리술·청귤 진, 홋카이도 감자 쇼추
  const siteFirst: Omit<Recipe, 'id'>[] = [];
  if (site === 'jeju') siteFirst.push(
    { ...base, name: '고소리술 — 제주 차조', kind: 'soju', mashBill: [{ ingredientId: 'jeju_millet', ratio: 0.9 }, { ingredientId: 'nuruk', ratio: 0.1 }], yeast: 'nuruk_native', fermentDays: 14, runs: 1, cut: { c1: 0.12, c2: 0.7 } },
    { ...base, name: '제주 청귤 진', kind: 'gin', mashBill: [], botanicalMethod: 'vapor', botanicals: [{ botanicalId: 'juniper', gramsPerL: 18 }, { botanicalId: 'jeju_citrus', gramsPerL: 5 }, { botanicalId: 'coriander', gramsPerL: 4 }], yeast: 'distillers', fermentDays: 0, runs: 1, cut: { c1: 0.08, c2: 0.8 } },
  );
  if (site === 'hokkaido') siteFirst.push({ ...base, name: '본격 쇼추 — 홋카이도 감자', kind: 'soju', mashBill: [{ ingredientId: 'potato', ratio: 0.75 }, { ingredientId: 'rice_koji', ratio: 0.25 }], yeast: 'distillers', fermentDays: 12, runs: 1, cut: { c1: 0.12, c2: 0.7 } });
  return [...siteFirst, ...regionPresets(base, region)];
}

function regionPresets(base: Pick<Recipe, 'botanicals' | 'botanicalMethod' | 'pressure' | 'stillId'>, region: RegionId): Omit<Recipe, 'id'>[] {
  const londonDry: Omit<Recipe, 'id'> = { ...base, name: '런던 드라이 진', kind: 'gin', mashBill: [], botanicals: [
    { botanicalId: 'juniper', gramsPerL: 20 }, { botanicalId: 'coriander', gramsPerL: 8 }, { botanicalId: 'angelica', gramsPerL: 2 },
    { botanicalId: 'orris', gramsPerL: 1 }, { botanicalId: 'lemon_peel', gramsPerL: 3 }, { botanicalId: 'cassia', gramsPerL: 1 },
  ], yeast: 'distillers', fermentDays: 0, runs: 1, cut: { c1: 0.08, c2: 0.8 } };
  const malts: Omit<Recipe, 'id'>[] = [
    { ...base, name: '싱글 몰트 — 언피티드', kind: 'malt', mashBill: [{ ingredientId: 'malt_unpeated', ratio: 1 }], yeast: 'distillers', fermentDays: 4, runs: 2, cut: { c1: 0.15, c2: 0.72 } },
    { ...base, name: '싱글 몰트 — 피티드', kind: 'malt', mashBill: [{ ingredientId: 'malt_peated', ratio: 1 }], yeast: 'distillers', fermentDays: 4, runs: 2, cut: { c1: 0.15, c2: 0.78 } },
  ];
  const gin = (name: string, botanicals: Recipe['botanicals']): Omit<Recipe, 'id'> => ({ ...base, name, kind: 'gin', mashBill: [], botanicalMethod: 'vapor', botanicals, yeast: 'distillers', fermentDays: 0, runs: 1, cut: { c1: 0.08, c2: 0.8 } });
  if (region === 'JP') return [
    { ...base, name: '본격 쇼추 — 고구마(이모)', kind: 'soju', mashBill: [{ ingredientId: 'sweet_potato', ratio: 0.75 }, { ingredientId: 'rice_koji', ratio: 0.25 }], yeast: 'distillers', fermentDays: 14, runs: 1, cut: { c1: 0.12, c2: 0.7 } },
    { ...base, name: '본격 쇼추 — 보리(무기)', kind: 'soju', mashBill: [{ ingredientId: 'barley_raw', ratio: 0.7 }, { ingredientId: 'rice_koji', ratio: 0.3 }], yeast: 'distillers', fermentDays: 12, runs: 1, cut: { c1: 0.12, c2: 0.7 } },
    gin('재패니즈 보태니컬 진', [{ botanicalId: 'juniper', gramsPerL: 18 }, { botanicalId: 'yuzu', gramsPerL: 4 }, { botanicalId: 'sancho', gramsPerL: 2 }, { botanicalId: 'sakura', gramsPerL: 2 }, { botanicalId: 'green_tea', gramsPerL: 2 }, { botanicalId: 'coriander', gramsPerL: 3 }]),
    ...malts,
  ];
  if (region === 'TW') return [
    // 대만 특산물: 진먼섬 입지에서 진먼 고량 60% 이상 = 진먼 고량주 (결정 #58·#62)
    { ...base, name: '진먼 고량 — 청향', kind: 'baijiu', mashBill: [{ ingredientId: 'sorghum_kinmen', ratio: 0.85 }, { ingredientId: 'wheat_qu', ratio: 0.15 }], yeast: 'distillers', fermentDays: 21, runs: 1, cut: { c1: 0.1, c2: 0.72 } },
    gin('대만 보태니컬 진', [{ botanicalId: 'juniper', gramsPerL: 18 }, { botanicalId: 'maqaw', gramsPerL: 3 }, { botanicalId: 'oolong', gramsPerL: 3 }, { botanicalId: 'lemon_peel', gramsPerL: 3 }, { botanicalId: 'coriander', gramsPerL: 4 }]),
    londonDry,
    ...malts,
  ];
  return [
    { ...base, name: '증류식 소주 — 상압', kind: 'soju', mashBill: [{ ingredientId: 'rice_domestic', ratio: 0.92 }, { ingredientId: 'nuruk', ratio: 0.08 }], yeast: 'nuruk_native', fermentDays: 14, runs: 1, cut: { c1: 0.12, c2: 0.7 } },
    { ...base, name: '고량주 — 농향', kind: 'baijiu', mashBill: [{ ingredientId: 'sorghum', ratio: 0.85 }, { ingredientId: 'daqu', ratio: 0.15 }], yeast: 'nuruk_native', fermentDays: 28, runs: 1, cut: { c1: 0.1, c2: 0.75 } },
    londonDry,
    gin('한국 보태니컬 진', [{ botanicalId: 'juniper', gramsPerL: 18 }, { botanicalId: 'yuzu', gramsPerL: 4 }, { botanicalId: 'omija', gramsPerL: 3 }, { botanicalId: 'pine_needle', gramsPerL: 2 }, { botanicalId: 'coriander', gramsPerL: 4 }]),
    ...malts,
  ];
}

/** 지역 특산 캐스크는 싸고, 다른 지역 캐스크는 비싸다 × 입지 단가·운송 할증 (결정 #86) (+ 이벤트 보정은 호출 측에서) */
export function regionalCaskPrice(s: Pick<GameState, 'regionId' | 'siteId'>, typeId: CaskTypeId): number {
  const site = siteOf(s);
  return Math.round(CASKS[typeId].price * (regionOf(s).caskPriceFactor[typeId] ?? 1) * (site.caskPriceFactor?.[typeId] ?? 1) * (site.freight?.casks ?? 1));
}

const STARTER: Record<RegionId, { name: string; casks: CaskTypeId[]; distillery: string }> = {
  KR: { name: '윤도현', distillery: '한빛 증류소', casks: Array(10).fill('ex_bourbon_barrel') },
  JP: { name: '사토 겐타', distillery: '아카리 증류소', casks: [...Array(8).fill('ex_bourbon_barrel'), 'mizunara_hogshead', 'mizunara_hogshead'] },
  TW: { name: '린즈하오', distillery: '란양 증류소', casks: Array(10).fill('ex_bourbon_barrel') },
};

export function emptyCaskOf(s: GameState, typeId: keyof typeof CASKS): Cask {
  const def = CASKS[typeId];
  return { id: nid(s, 'K'), typeId, sizeL: def.sizeL, wood: def.wood, activity: def.activity, seasoning: def.seasoning, fills: 0, recharCount: 0, char: def.char };
}

export function newGame(opts: NewGameOptions = {}): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const s: GameState = {
    version: 8,
    seed,
    month: 0,
    startYear: opts.startYear ?? 2027,
    regionId: opts.region ?? 'KR',
    ...(opts.site ? { siteId: opts.site } : {}),
    distilleryName: opts.distilleryName ?? siteOf({ regionId: opts.region ?? 'KR', siteId: opts.site }).starter?.distillery ?? STARTER[opts.region ?? 'KR'].distillery,
    status: 'running',
    nextId: 1,
    world: {
      priceIndex: { ...Object.fromEntries(Object.keys(INGREDIENTS).map((k) => [k, 1])), gns: 1, energy: 1 },
      trend: { soju_distilled: 1, gin: 1, whisky: 1, grain_whisky: 1, blended_whisky: 1, baijiu: 1, malt_spirit: 1, flavored_spirit: 1 },
      modifiers: [],
      weather: { tempAnom: 0, humidAnom: 0, shocks: [] },
      flavorTrend: { shifts: [] },
    },
    finance: { cash: opts.startingCash ?? DEFAULT_STARTING_CASH, negativeCashMonths: 0, loans: [], investorShare: 0, investmentsTaken: [], receivables: [], pendingCash: {} },
    hr: { staff: [], candidates: [], houseStyle: 0 },
    production: { equipment: [], recipes: [], orders: [], ingredientKgLastMonth: {}, flags: { producedSoju: false }, wasteContractPerKg: 0 },
    inventory: { lots: [], casks: [], caskOrders: [], warehouseBase: 150, rotatedThisMonth: 0, samplesThisMonth: 0 },
    commerce: { products: [], productArchive: [], awareness: 0.01, localBuzz: 0, marketingBudget: 3_000_000, traditionalReleasedL: 0, traditionalPrevYearL: 0, retailOffers: [], retailContracts: [], exports: [], exportOffers: [], exportEntered: [], commissions: [], lines: {} },
    b2b: { trust: 50, bulkIndex: 1, spotSoldLPA: { grain: 0 }, contracts: [], contractOffers: [], brokerOffers: [], caskBids: [], oemOffers: [], oemContracts: [] },
    events: { pending: [], forecasts: [], log: [], lastFired: {} },
    research: { unlocked: [], active: [], slots: 1 },
    site: {},
    history: { reports: [], years: [] },
  };
  // 초기 설비: 단식 증류기 1기 + 스테인리스 발효조 2기
  const still = { id: nid(s, 'E'), catalogId: 'pot_onion_1000', readyMonth: 0, feintsLPA: 0 };
  s.production.equipment.push(still, { id: nid(s, 'E'), catalogId: 'ferm_steel_2000', readyMonth: 0 }, { id: nid(s, 'E'), catalogId: 'ferm_steel_2000', readyMonth: 0 });
  for (const r of presetRecipes(still.id, s.regionId, s.siteId)) s.production.recipes.push({ ...r, id: nid(s, 'R') });
  for (const t of STARTER[s.regionId].casks) s.inventory.casks.push(emptyCaskOf(s, t));
  // 창업 멤버: 디스틸러 1명
  const stats = { a: 50, b: 50, c: 45 };
  s.hr.staff.push({ id: nid(s, 'S'), name: siteOf(s).starter?.name ?? STARTER[s.regionId].name, role: 'distiller', level: 1, xp: 0, stats, salary: salaryFor('distiller', stats, 1, regionOf(s).laborCost), hiredMonth: 0, ageAtHire: 38 });
  const rng = mulberry32(seed ^ 0x9e3779b9);
  refreshCandidates(s, rng);
  refreshBroker(s, rng);
  refreshContractOffers(s, rng);
  return s;
}
