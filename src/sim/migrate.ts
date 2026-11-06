import type { GameState } from './types';

// 세이브 마이그레이션 체인 (PRD §13.2, 결정 #95, docs/design/architecture.md §3.6)
// 옛 세이브는 버리지 않고 v5 → v6 → … 순서로 올린다. 각 단계는 순수 함수(입력을 바꾸지 않는다).
// 새 버전을 만들면: GameState.version을 올리고, 여기에 `[이전 버전]: (s) => 다음 버전` 한 줄을 더한다.

export const SAVE_VERSION = 6 as const;

type AnySave = Record<string, any>;

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

/** v5(평면) → v6(도메인 슬라이스). 필드 대응은 scripts/codemods/v6-slices.mjs의 V6_MAP과 같다 */
function v5to6(raw: AnySave): AnySave {
  const s = fillV5(raw);
  return {
    version: 6,
    seed: s.seed, month: s.month, startYear: s.startYear, regionId: s.regionId,
    ...(s.siteId ? { siteId: s.siteId } : {}),
    distilleryName: s.distilleryName, status: s.status, nextId: s.nextId,
    world: { priceIndex: s.priceIndex, trend: s.trend, modifiers: s.modifiers, weather: { tempAnom: 0, humidAnom: 0, shocks: [] } },
    finance: { cash: s.cash, negativeCashMonths: s.negativeCashMonths, loans: s.loans, investorShare: s.investorShare, investmentsTaken: s.investmentsTaken, receivables: s.receivables },
    hr: { staff: s.staff, candidates: s.candidates, houseStyle: s.houseStyle },
    production: { equipment: s.equipment, recipes: s.recipes, orders: s.orders, ingredientKgLastMonth: s.ingredientKgLastMonth, flags: s.flags, wasteContractPerKg: s.wasteContractPerKg },
    inventory: { lots: s.lots, casks: s.casks, caskOrders: s.caskOrders, warehouseBase: s.warehouseBase, rotatedThisMonth: s.rotatedThisMonth },
    commerce: {
      products: s.products, productArchive: [], awareness: s.awareness, localBuzz: s.localBuzz, marketingBudget: s.marketingBudget,
      traditionalReleasedL: s.traditionalReleasedL, traditionalPrevYearL: s.traditionalPrevYearL, retailOffers: s.retailOffers, retailContracts: s.retailContracts,
    },
    b2b: {
      trust: s.b2bTrust, bulkIndex: s.bulkIndex, spotSoldLPA: s.spotSoldLPA, contracts: s.contracts, contractOffers: s.contractOffers,
      brokerOffers: s.brokerOffers, caskBids: s.caskBids, oemOffers: s.oemOffers, oemContracts: s.oemContracts,
    },
    events: { pending: s.pendingEvents, forecasts: s.forecasts, log: s.eventLog, lastFired: s.eventLastMonth },
    research: { unlocked: [], active: [], slots: 1 },
    site: s.siteState,
    history: { reports: s.reports, years: [] },
  };
}

/** 버전 n 세이브 → 버전 n+1 */
const MIGRATIONS: Record<number, (s: AnySave) => AnySave> = {
  5: v5to6,
};

/**
 * 어떤 버전의 세이브든 현재 버전으로 올린다. 알 수 없는 형식·미래 버전이면 null.
 * 순수 함수 — 입력 객체는 바꾸지 않는다 (얕은 복사로 새 객체를 만든다).
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
