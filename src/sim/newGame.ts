import { CASKS, INGREDIENTS } from './content/catalog';
import { refreshBroker } from './broker';
import { refreshContractOffers } from './bulk';
import { refreshCandidates, salaryFor } from './hr';
import { mulberry32 } from './rng';
import type { Cask, CaskTypeId, GameState, Recipe, RegionId } from './types';
import { REGIONS, regionOf, siteOf } from './content/regions';
import { nid } from './util';
import { HOUSE_BRAND_ID } from './brands';

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

/** 새 게임 프리셋 레시피 = 입지 원료 프리셋 + 지역 프리셋 (데이터: content/regions.ts·presets.ts, S-3). 깊은 복사 — 콘텐츠 상수를 공유하지 않는다 */
export function presetRecipes(stillId: string, region: RegionId = 'KR', site?: string): Omit<Recipe, 'id'>[] {
  const list = [...(siteOf({ regionId: region, siteId: site }).presets ?? []), ...REGIONS[region].presets];
  return list.map((p) => ({ ...structuredClone(p), stillId }));
}

/** 지역 특산 캐스크는 싸고, 다른 지역 캐스크는 비싸다 × 입지 단가·운송 할증 (결정 #86) (+ 이벤트 보정은 호출 측에서) */
export function regionalCaskPrice(s: Pick<GameState, 'regionId' | 'siteId'>, typeId: CaskTypeId): number {
  const site = siteOf(s);
  return Math.round(CASKS[typeId].price * (regionOf(s).caskPriceFactor[typeId] ?? 1) * (site.caskPriceFactor?.[typeId] ?? 1) * (site.freight?.casks ?? 1));
}


export function emptyCaskOf(s: GameState, typeId: keyof typeof CASKS): Cask {
  const def = CASKS[typeId];
  return { id: nid(s, 'K'), typeId, sizeL: def.sizeL, wood: def.wood, activity: def.activity, seasoning: def.seasoning, fills: 0, recharCount: 0, char: def.char };
}

export function newGame(opts: NewGameOptions = {}): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const s: GameState = {
    version: 16,
    rulesVersion: 'v16',
    seed,
    month: 0,
    startYear: opts.startYear ?? 2027,
    regionId: opts.region ?? 'KR',
    ...(opts.site ? { siteId: opts.site } : {}),
    distilleryName: opts.distilleryName ?? siteOf({ regionId: opts.region ?? 'KR', siteId: opts.site }).starter?.distillery ?? REGIONS[opts.region ?? 'KR'].starter.distillery,
    status: 'running',
    nextId: 1,
    world: {
      priceIndex: { ...Object.fromEntries(Object.keys(INGREDIENTS).map((k) => [k, 1])), gns: 1, energy: 1 },
      trend: { soju_distilled: 1, gin: 1, whisky: 1, grain_whisky: 1, blended_whisky: 1, baijiu: 1, malt_spirit: 1, flavored_spirit: 1 },
      modifiers: [],
      weather: { tempAnom: 0, humidAnom: 0, shocks: [] },
      flavorTrend: { shifts: [] },
      rivals: [],
    },
    finance: { cash: opts.startingCash ?? DEFAULT_STARTING_CASH, negativeCashMonths: 0, loans: [], investorShare: 0, investmentsTaken: [], receivables: [], pendingCash: {}, hedges: [], insurance: [] },
    hr: { staff: [], candidates: [], houseStyle: 0 },
    production: { equipment: [], recipes: [], orders: [], ingredientKgLastMonth: {}, flags: { producedSoju: false }, wasteContractPerKg: 0 },
    inventory: { lots: [], casks: [], caskOrders: [], warehouseBase: 150, rotatedThisMonth: 0, samplesThisMonth: 0 },
    commerce: { products: [], productArchive: [], brands: [{ id: HOUSE_BRAND_ID, name: '', isHouse: true, openedMonth: 0, awareness: 0.01, luxury: 0 }], localBuzz: 0, marketingBudget: 3_000_000, traditionalReleasedL: 0, traditionalPrevYearL: 0, retailOffers: [], retailContracts: [], exports: [], exportOffers: [], exportEntered: [], commissions: [], lines: {} },
    b2b: { trust: 50, bulkIndex: 1, spotSoldLPA: { grain: 0 }, contracts: [], contractOffers: [], brokerOffers: [], caskBids: [], oemOffers: [], oemContracts: [] },
    events: { pending: [], forecasts: [], log: [], lastFired: {} },
    research: { unlocked: [], active: [], slots: 1 },
    site: {},
    history: { reports: [], years: [] },
    progress: { milestones: [] },
  };
  // 하우스 브랜드 = 회사명 (S-2)
  s.commerce.brands[0]!.name = s.distilleryName;
  // 초기 설비: 단식 증류기 1기 + 스테인리스 발효조 2기
  const still = { id: nid(s, 'E'), catalogId: 'pot_onion_1000', readyMonth: 0, feintsLPA: 0 };
  s.production.equipment.push(still, { id: nid(s, 'E'), catalogId: 'ferm_steel_2000', readyMonth: 0 }, { id: nid(s, 'E'), catalogId: 'ferm_steel_2000', readyMonth: 0 });
  for (const r of presetRecipes(still.id, s.regionId, s.siteId)) s.production.recipes.push({ ...r, id: nid(s, 'R') });
  for (const t of regionOf(s).starter.casks) s.inventory.casks.push(emptyCaskOf(s, t));
  // 창업 멤버: 디스틸러 1명
  const stats = { a: 50, b: 50, c: 45 };
  s.hr.staff.push({ id: nid(s, 'S'), name: siteOf(s).starter?.name ?? regionOf(s).starter.name, role: 'distiller', level: 1, xp: 0, stats, salary: salaryFor('distiller', stats, 1, regionOf(s).laborCost), hiredMonth: 0, ageAtHire: 38 });
  const rng = mulberry32(seed ^ 0x9e3779b9);
  refreshCandidates(s, rng);
  refreshBroker(s, rng);
  refreshContractOffers(s, rng);
  return s;
}
