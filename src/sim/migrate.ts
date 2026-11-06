import type { GameState } from './types';

// 세이브 마이그레이션 체인 (PRD §13.2, 결정 #96, docs/design/architecture.md §3.6)
// 옛 세이브는 버리지 않고 v5 → v6 → … 순서로 올린다. 각 단계는 순수 함수(입력을 바꾸지 않는다).
// 새 버전을 만들면: GameState.version을 올리고, MIGRATIONS에 `[이전 버전]: (s) => 다음 버전` 한 줄을 더한다.

export const SAVE_VERSION = 6 as const;

type AnySave = Record<string, any>;

/**
 * v5(평면) 필드 → v6 위치. 'root' = 루트 헤더 그대로, [슬라이스, 필드], [슬라이스] = 필드 자체가 슬라이스.
 * scripts/codemods/v6-slices.mjs의 V6_MAP과 같은 대응이다. v5의 모든 필드가 여기 있어야 한다 (테스트가 확인)
 */
export const V5_FIELD_MAP: Record<string, 'root' | [string, string?]> = {
  version: 'root', seed: 'root', month: 'root', startYear: 'root', regionId: 'root', siteId: 'root', distilleryName: 'root', status: 'root', nextId: 'root',
  priceIndex: ['world', 'priceIndex'], trend: ['world', 'trend'], modifiers: ['world', 'modifiers'],
  cash: ['finance', 'cash'], negativeCashMonths: ['finance', 'negativeCashMonths'], loans: ['finance', 'loans'],
  investorShare: ['finance', 'investorShare'], investmentsTaken: ['finance', 'investmentsTaken'], receivables: ['finance', 'receivables'],
  pendingCash: ['finance', 'pendingCash'],
  staff: ['hr', 'staff'], candidates: ['hr', 'candidates'], houseStyle: ['hr', 'houseStyle'],
  equipment: ['production', 'equipment'], recipes: ['production', 'recipes'], orders: ['production', 'orders'],
  ingredientKgLastMonth: ['production', 'ingredientKgLastMonth'], flags: ['production', 'flags'], wasteContractPerKg: ['production', 'wasteContractPerKg'],
  lots: ['inventory', 'lots'], casks: ['inventory', 'casks'], caskOrders: ['inventory', 'caskOrders'],
  warehouseBase: ['inventory', 'warehouseBase'], rotatedThisMonth: ['inventory', 'rotatedThisMonth'],
  products: ['commerce', 'products'], awareness: ['commerce', 'awareness'], localBuzz: ['commerce', 'localBuzz'],
  marketingBudget: ['commerce', 'marketingBudget'], traditionalReleasedL: ['commerce', 'traditionalReleasedL'],
  traditionalPrevYearL: ['commerce', 'traditionalPrevYearL'], retailOffers: ['commerce', 'retailOffers'], retailContracts: ['commerce', 'retailContracts'],
  exports: ['commerce', 'exports'],
  b2bTrust: ['b2b', 'trust'], bulkIndex: ['b2b', 'bulkIndex'], spotSoldLPA: ['b2b', 'spotSoldLPA'], contracts: ['b2b', 'contracts'],
  contractOffers: ['b2b', 'contractOffers'], brokerOffers: ['b2b', 'brokerOffers'], caskBids: ['b2b', 'caskBids'],
  oemOffers: ['b2b', 'oemOffers'], oemContracts: ['b2b', 'oemContracts'],
  pendingEvents: ['events', 'pending'], forecasts: ['events', 'forecasts'], eventLog: ['events', 'log'], eventLastMonth: ['events', 'lastFired'],
  siteState: ['site'],
  reports: ['history', 'reports'],
};

/** v6에서 새로 생긴 필드의 초기값 */
const V6_NEW = () => ({
  world: { weather: { tempAnom: 0, humidAnom: 0, shocks: [] } },
  commerce: { productArchive: [] },
  history: { years: [] },
  research: { unlocked: [], active: [], slots: 1 },
});

/** v5 안에서 생긴 필드 보충 (입지 특성 #86~ 이전 저장) — 옛 normalizeState */
function fillV5(s: AnySave): AnySave {
  return {
    ...s,
    siteState: s.siteState ?? {},
    retailOffers: s.retailOffers ?? [],
    retailContracts: s.retailContracts ?? [],
    oemOffers: s.oemOffers ?? [],
    oemContracts: s.oemContracts ?? [],
    receivables: s.receivables ?? [],
  };
}

/** v5(평면) → v6(도메인 슬라이스) */
function v5to6(raw: AnySave): AnySave {
  const s = fillV5(raw);
  const out: AnySave = {};
  for (const [k, slices] of Object.entries(V6_NEW())) out[k] = { ...slices };
  for (const [key, value] of Object.entries(s)) {
    const to = V5_FIELD_MAP[key];
    if (!to || value === undefined) continue;
    if (to === 'root') out[key] = value;
    else if (to.length === 1 || to[1] === undefined) out[to[0]] = value;
    else out[to[0]] = { ...(out[to[0]] ?? {}), [to[1]]: value };
  }
  out.version = 6;
  return out;
}

/** 버전 n 세이브 → 버전 n+1 */
const MIGRATIONS: Record<number, (s: AnySave) => AnySave> = {
  5: v5to6,
};

/**
 * 어떤 버전의 세이브든 현재 버전으로 올린다. 알 수 없는 형식·미래 버전이면 null.
 * 순수 함수 — 입력 객체는 바꾸지 않는다 (새 객체를 만든다).
 */
export function migrateSave(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  let s = raw as AnySave;
  let v = s.version;
  if (typeof v !== 'number' || v > SAVE_VERSION) return null;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) return null;
    s = step(s);
    v = s.version;
  }
  return s as GameState;
}
