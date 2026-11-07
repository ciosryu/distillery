import type { GameState } from './types';

// 세이브 마이그레이션 체인 (PRD §13.2, 결정 #118, docs/design/architecture.md §3.6)
// 옛 세이브는 버리지 않고 v5 → v6 → … 순서로 올린다. 각 단계는 순수 함수(입력을 바꾸지 않는다).
// 새 버전을 만들면: GameState.version을 올리고, MIGRATIONS에 `[이전 버전]: (s) => 다음 버전` 한 줄을 더한다.

export const SAVE_VERSION = 14 as const;

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
  exports: ['commerce', 'exports'], acclaim: ['commerce', 'acclaim'], exportOffers: ['commerce', 'exportOffers'], exportEntered: ['commerce', 'exportEntered'],
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

/** v6 → v7: 블렌딩 테이블(결정 #124)·향미 트렌드(#125) 필드 추가. 옛 피트·셰리 유행 보정치는 남은 기간만큼 트렌드 이동으로 옮긴다 */
function v6to7(s: AnySave): AnySave {
  const legacy: Record<string, { axis: string; lo: number; hi: number }> = {
    'appeal:peated': { axis: 'peat', lo: 15, hi: 25 },
    'appeal:sherried': { axis: 'spicy', lo: 15, hi: 30 },
  };
  const mods = (s.world?.modifiers ?? []) as { id: string; key: string; factor: number; fromMonth: number; untilMonth: number; label: string }[];
  const shifts = mods.filter((m) => legacy[m.key]).map((m) => ({ id: m.id, label: m.label, axis: legacy[m.key]!.axis, strength: m.factor - 1, lo: legacy[m.key]!.lo, hi: legacy[m.key]!.hi, fromMonth: m.fromMonth, untilMonth: m.untilMonth }));
  return {
    ...s,
    version: 7,
    world: { ...s.world, modifiers: mods.filter((m) => !legacy[m.key]), flavorTrend: { shifts } },
    inventory: { ...s.inventory, samplesThisMonth: 0 },
    commerce: { ...s.commerce, commissions: [], lines: {} },
  };
}

/** v7 → v8: 시나리오(skeleton S-8, #140) 헤더 필드. 옛 세이브는 시나리오가 없는 샌드박스로 이어진다 — 필드를 만들지 않는다 */
function v7to8(s: AnySave): AnySave {
  return { ...s, version: 8 };
}

/** v8 → v9: 숙성 용기 일반화·피니싱 이력·샘플 기록의 자리(S-10, #143). 새 필드는 모두 선택값이라 옛 세이브는 그대로 — 버전만 올린다.
 *  옛 캐스크의 샘플 횟수(samples)는 남고 기록(sampleLog)은 없다 → 화면은 "기록 없음"으로 보이고 다음 샘플부터 쌓인다 */
function v8to9(s: AnySave): AnySave {
  return { ...s, version: 9 };
}

/** v9 → v10: 진행 슬라이스(S-9). 옛 세이브는 마일스톤 기록이 없는 채로 시작한다 — 이미 지난 일(첫 증류 등)은 다음 달 판정 때 그 달 날짜로 잡힌다.
 *  옛 파산 세이브는 끝난 이유를 채운다 */
function v9to10(s: AnySave): AnySave {
  return { ...s, version: 10, progress: { milestones: [], ...(s.status === 'bankrupt' ? { ending: { reason: 'bankrupt', month: s.month } } : {}) } };
}

/** v10 → v11: 브랜드 라인(S-2). 회사 인지도 하나(commerce.awareness)가 하우스 브랜드의 인지도가 된다. 제품은 brandId가 없으면 하우스 */
function v10to11(s: AnySave): AnySave {
  const { awareness, ...commerce } = s.commerce ?? {};
  return { ...s, version: 11, commerce: { ...commerce, brands: [{ id: 'house', name: s.distilleryName ?? '', isHouse: true, openedMonth: 0, awareness: awareness ?? 0.01, luxury: 0 }] } };
}

/** v11 → v12: 연구 진행(S-6) — 진행 중 연구에 시작 달·누적 연구비(선택값)가 생겼다. 옛 세이브는 연구가 없으므로 버전만 올린다 */
function v11to12(s: AnySave): AnySave {
  return { ...s, version: 12 };
}

/** v12 → v13: 재무 확장(S-11 — 선도계약·보험)·경쟁 AI(S-12)의 자리. 빈 목록으로 채운다 */
function v12to13(s: AnySave): AnySave {
  return { ...s, version: 13, finance: { ...s.finance, hedges: [], insurance: [] }, world: { ...s.world, rivals: [] } };
}

/** v13 → v14: 제품 피니싱 표기(Product.finish, 선택값) 자리. 옛 제품은 피니싱이 없으므로 버전만 올린다 */
function v13to14(s: AnySave): AnySave {
  return { ...s, version: 14 };
}

/** 버전 n 세이브 → 버전 n+1 */
const MIGRATIONS: Record<number, (s: AnySave) => AnySave> = {
  5: v5to6,
  6: v6to7,
  7: v7to8,
  8: v8to9,
  9: v9to10,
  10: v10to11,
  11: v11to12,
  12: v12to13,
  13: v13to14,
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
