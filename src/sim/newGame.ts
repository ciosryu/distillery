import { CASKS, INGREDIENTS } from './content/catalog';
import { refreshBroker } from './broker';
import { refreshContractOffers } from './bulk';
import { refreshCandidates, salaryFor } from './hr';
import { mulberry32 } from './rng';
import type { Cask, GameState, Recipe } from './types';
import { nid } from './util';

export interface NewGameOptions {
  seed?: number;
  distilleryName?: string;
  startYear?: number;
  startingCash?: number;
}

export const DEFAULT_STARTING_CASH = 500_000_000;

export function presetRecipes(stillId: string): Omit<Recipe, 'id'>[] {
  const base = { botanicals: [], botanicalMethod: 'steep' as const, pressure: 'atmospheric' as const, stillId };
  return [
    { ...base, name: '증류식 소주 — 상압', kind: 'soju', mashBill: [{ ingredientId: 'rice_domestic', ratio: 0.92 }, { ingredientId: 'nuruk', ratio: 0.08 }], yeast: 'nuruk_native', fermentDays: 14, runs: 1, cut: { c1: 0.12, c2: 0.7 } },
    { ...base, name: '런던 드라이 진', kind: 'gin', mashBill: [], botanicals: [
      { botanicalId: 'juniper', gramsPerL: 20 }, { botanicalId: 'coriander', gramsPerL: 8 }, { botanicalId: 'angelica', gramsPerL: 2 },
      { botanicalId: 'orris', gramsPerL: 1 }, { botanicalId: 'lemon_peel', gramsPerL: 3 }, { botanicalId: 'cassia', gramsPerL: 1 },
    ], yeast: 'distillers', fermentDays: 0, runs: 1, cut: { c1: 0.08, c2: 0.8 } },
    { ...base, name: '한국 보태니컬 진', kind: 'gin', mashBill: [], botanicalMethod: 'vapor', botanicals: [
      { botanicalId: 'juniper', gramsPerL: 18 }, { botanicalId: 'yuzu', gramsPerL: 4 }, { botanicalId: 'omija', gramsPerL: 3 },
      { botanicalId: 'pine_needle', gramsPerL: 2 }, { botanicalId: 'coriander', gramsPerL: 4 },
    ], yeast: 'distillers', fermentDays: 0, runs: 1, cut: { c1: 0.08, c2: 0.8 } },
    { ...base, name: '싱글 몰트 — 언피티드', kind: 'malt', mashBill: [{ ingredientId: 'malt_unpeated', ratio: 1 }], yeast: 'distillers', fermentDays: 4, runs: 2, cut: { c1: 0.15, c2: 0.72 } },
    { ...base, name: '싱글 몰트 — 피티드', kind: 'malt', mashBill: [{ ingredientId: 'malt_peated', ratio: 1 }], yeast: 'distillers', fermentDays: 4, runs: 2, cut: { c1: 0.15, c2: 0.78 } },
  ];
}

export function emptyCaskOf(s: GameState, typeId: keyof typeof CASKS): Cask {
  const def = CASKS[typeId];
  return { id: nid(s, 'K'), typeId, sizeL: def.sizeL, wood: def.wood, activity: def.activity, seasoning: def.seasoning, fills: 0, recharCount: 0, char: def.char };
}

export function newGame(opts: NewGameOptions = {}): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const s: GameState = {
    version: 3,
    seed,
    month: 0,
    startYear: opts.startYear ?? 2027,
    regionId: 'KR',
    distilleryName: opts.distilleryName ?? '한빛 증류소',
    cash: opts.startingCash ?? DEFAULT_STARTING_CASH,
    status: 'running',
    negativeCashMonths: 0,
    equipment: [],
    warehouseBase: 150,
    recipes: [],
    orders: [],
    lots: [],
    casks: [],
    products: [],
    staff: [],
    candidates: [],
    loans: [],
    brokerOffers: [],
    contracts: [],
    contractOffers: [],
    b2bTrust: 50,
    bulkIndex: 1,
    marketingBudget: 3_000_000,
    awareness: 0.01,
    priceIndex: { ...Object.fromEntries(Object.keys(INGREDIENTS).map((k) => [k, 1])), gns: 1, energy: 1 },
    trend: { soju_distilled: 1, gin: 1, whisky: 1, grain_whisky: 1, blended_whisky: 1, malt_spirit: 1, flavored_spirit: 1 },
    flags: { producedSoju: false },
    modifiers: [],
    pendingEvents: [],
    forecasts: [],
    eventLog: [],
    eventLastMonth: {},
    ingredientKgLastMonth: {},
    reports: [],
    nextId: 1,
  };
  // 초기 설비: 단식 증류기 1기 + 스테인리스 발효조 2기
  const still = { id: nid(s, 'E'), catalogId: 'pot_onion_1000', readyMonth: 0, feintsLPA: 0 };
  s.equipment.push(still, { id: nid(s, 'E'), catalogId: 'ferm_steel_2000', readyMonth: 0 }, { id: nid(s, 'E'), catalogId: 'ferm_steel_2000', readyMonth: 0 });
  for (const r of presetRecipes(still.id)) s.recipes.push({ ...r, id: nid(s, 'R') });
  for (let i = 0; i < 10; i++) s.casks.push(emptyCaskOf(s, 'ex_bourbon_barrel'));
  // 창업 멤버: 디스틸러 1명
  const stats = { a: 50, b: 50, c: 45 };
  s.staff.push({ id: nid(s, 'S'), name: '윤도현', role: 'distiller', level: 1, xp: 0, stats, salary: salaryFor('distiller', stats, 1), hiredMonth: 0 });
  const rng = mulberry32(seed ^ 0x9e3779b9);
  refreshCandidates(s, rng);
  refreshBroker(s, rng);
  refreshContractOffers(s, rng);
  return s;
}
