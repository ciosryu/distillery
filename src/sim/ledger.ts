import { campaignMinOakMonths, rulesVersionOf } from './rules';
import type { Cask, GameState, LedgerEntry, SpiritLot, SpiritOrigin } from './types';

// 구성 원액 원장 (코어 ARCH — F2, [결정 #308·#309·#323], core-integration §2.3·§3, PROD P-PROD-55 R1~R6).
// 원장은 **그림자**다(R1): 로트 필드가 게임 출력의 정본이고, 원장은 같은 사건에서 함께 갱신한다. 그래서 F2는 출력 불변이다.
// 이 파일은 상태를 바꾸지 않는 순수 함수만 둔다 — 27개 지점(PROD·MKT 파일)이 이 헬퍼로 `lot.components`를 갱신한다.
// 적격 판정(`caskEligibility`)과 후보 판정(`isCampaignCandidate`)만 원장을 읽는다 — 봇·화면·판정이 같은 함수를 쓴다(#320).

const EPS = 1e-9;
/** 순수 알코올 리터 */
export const lpaOf = (lot: Pick<SpiritLot, 'volumeL' | 'abv'>): number => lot.volumeL * lot.abv;
/** 외부 입지 — 매입 원액(브로커·스코틀랜드)의 `siteId`. 적격(같은 입지 자가 증류)과 절대 같지 않다 */
export const EXTERNAL_SITE_ID = 'external';
/** 입지 id — 없으면 지역 기본 입지 */
export const siteIdOf = (s: Pick<GameState, 'siteId'>): string => s.siteId ?? 'default';

/**
 * 로트의 원장 — 없으면 로트 하나를 구성 원액 하나로 본다(지점 26 "옛 세이브" + 아직 원장을 쓰지 않는 생성 경로).
 * 출처: 매입(`sourced`)이면 'sourced' · 새 판(v16)의 자가 원액은 'self'(이 판에서 자가 증류한 것만 `sourced`가 아니다) · 옛 판(`legacy-v15`)은 **'unknown'**(증거 창작 금지 — 적격 아님)
 */
export function ledgerOf(s: Pick<GameState, 'rulesVersion' | 'siteId'>, lot: SpiritLot): LedgerEntry[] {
  if (lot.components?.length) return lot.components;
  const origin: SpiritOrigin = lot.sourced ? 'sourced' : rulesVersionOf(s) === 'v16' ? 'self' : 'unknown';
  return [{ batchId: lot.batchId ?? lot.id, origin, siteId: siteIdOf(s), kindAtBirth: lot.kind, contribLPA: lpaOf(lot), costKRW: lot.costPerLPA * lpaOf(lot), woodMonths: lot.oakMonths }];
}

/** 새 원액의 원장 한 줄 (지점 1 생산 · 25 매입) */
export function newEntry(lot: Pick<SpiritLot, 'id' | 'kind' | 'volumeL' | 'abv' | 'costPerLPA' | 'oakMonths'>, origin: SpiritOrigin, siteId: string): LedgerEntry {
  return { batchId: lot.id, origin, siteId, kindAtBirth: lot.kind, contribLPA: lpaOf(lot), costKRW: lot.costPerLPA * lpaOf(lot), woodMonths: lot.oakMonths };
}

/**
 * 비율 k로 줄인다 (손실 — R4). 'preserve' = 원가는 남는다(증발·누수·피니싱 이동·사고 — `costPerLPA`가 오른다) · 'leak' = 원가도 같은 비율로 나간다(샘플·원액 빼기·판매).
 * 모든 구성 원액에 같은 비율(R2 — 한 통 안의 원액은 물리적으로 섞여 있다)
 */
export function scaleLedger(entries: readonly LedgerEntry[], k: number, mode: 'preserve' | 'leak'): LedgerEntry[] {
  return entries.map((e) => ({ ...e, contribLPA: e.contribLPA * k, costKRW: mode === 'leak' ? e.costKRW * k : e.costKRW }));
}

/** 비율 k만큼 떼어 낸다 (분할 — 통입 4 · 병입 17 · 보충 18). 원가는 LPA 비율대로 나뉜다(손실 아님). [뗀 것, 남은 것] */
export function splitLedger(entries: readonly LedgerEntry[], k: number): [LedgerEntry[], LedgerEntry[]] {
  const take = entries.map((e) => ({ ...e, contribLPA: e.contribLPA * k, costKRW: e.costKRW * k }));
  const rest = entries.map((e) => ({ ...e, contribLPA: e.contribLPA * (1 - k), costKRW: e.costKRW * (1 - k) }));
  return [take, rest];
}

/** 구성 원액에 원가를 더한다 (통값 배분 — LPA 비율, R4) */
export function addCost(entries: readonly LedgerEntry[], costKRW: number): LedgerEntry[] {
  const total = entries.reduce((t, e) => t + e.contribLPA, 0);
  if (total <= 0) return [...entries];
  return entries.map((e) => ({ ...e, costKRW: e.costKRW + costKRW * (e.contribLPA / total) }));
}

/** 나무 용기 1개월 (지점 7 `matureCask`만) — 모든 구성 원액 +1 (R3). 옹기·스테인리스·탱크·병은 부르지 않는다 */
export const advanceWood = (entries: readonly LedgerEntry[]): LedgerEntry[] => entries.map((e) => ({ ...e, woodMonths: e.woodMonths + 1 }));

const keyOf = (e: LedgerEntry) => `${e.origin}|${e.siteId}|${e.kindAtBirth}|${e.woodMonths}`;
const MAX_PARENTS = 8;

/**
 * 적격 판정에 필요한 키 `(origin, siteId, kindAtBirth, woodMonths)`가 같은 구성 원액을 하나로 합친다 (R6 상한). LPA·원가는 합,
 * `batchId`는 LPA 큰 쪽, 사라진 배치는 `parents`에(LPA 큰 순 8개 — 나머지는 버린다). 순서는 처음 나온 키 순(결정적)
 */
export function coalesce(entries: readonly LedgerEntry[]): LedgerEntry[] {
  const by = new Map<string, LedgerEntry[]>();
  for (const e of entries) { const k = keyOf(e); by.set(k, [...(by.get(k) ?? []), e]); }
  return [...by.values()].map((group) => {
    if (group.length === 1) return { ...group[0]! };
    const sorted = [...group].sort((a, b) => b.contribLPA - a.contribLPA || a.batchId.localeCompare(b.batchId));
    const head = sorted[0]!;
    const parents = [...(head.parents ?? []), ...sorted.slice(1).flatMap((e) => [{ batchId: e.batchId, shareLPA: e.contribLPA }, ...(e.parents ?? [])])]
      .sort((a, b) => b.shareLPA - a.shareLPA || a.batchId.localeCompare(b.batchId)).slice(0, MAX_PARENTS);
    return { ...head, contribLPA: group.reduce((t, e) => t + e.contribLPA, 0), costKRW: group.reduce((t, e) => t + e.costKRW, 0), parents };
  });
}

/** 두 원장을 이어 붙이고 합친다 (지점 2 탱크 합치기 — 명시적 혼합) */
export const mergeLedgers = (a: readonly LedgerEntry[], b: readonly LedgerEntry[]): LedgerEntry[] => coalesce([...a, ...b]);

/** R2 불변식 — 원장이 있는 로트에서 Σ contribLPA = volumeL × abv, Σ costKRW = costPerLPA × LPA (상대 1e-9). 어긋나면 문장, 아니면 null */
export function ledgerError(lot: SpiritLot): string | null {
  const c = lot.components;
  if (!c?.length) return null;
  const lpa = lpaOf(lot);
  const sumL = c.reduce((t, e) => t + e.contribLPA, 0);
  const sumC = c.reduce((t, e) => t + e.costKRW, 0);
  const rel = (a: number, b: number) => Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));
  if (!rel(sumL, lpa)) return `원장 Σ contribLPA ${sumL} ≠ LPA ${lpa}`;
  if (!rel(sumC, lot.costPerLPA * lpa)) return `원장 Σ costKRW ${sumC} ≠ 원가 ${lot.costPerLPA * lpa}`;
  if (c.some((e) => e.contribLPA < -EPS || e.woodMonths < 0)) return '원장 음수';
  // P-PROD-55 전제 2: 숙성이 시작된 원액은 병입 전에 섞이지 않으므로 min(woodMonths) = 로트의 oakMonths. 섞이는 새 행동이 들어오면 여기서 먼저 깨진다
  const minWood = Math.min(...c.map((e) => e.woodMonths));
  if (minWood !== lot.oakMonths) return `원장 min(woodMonths) ${minWood} ≠ oakMonths ${lot.oakMonths}`;
  return null;
}

// ───────────── 옛 후보 판정 (F2에서 코어로 옮김 — 동작 그대로, 정의 변경은 F4) ─────────────

/**
 * 후보 지평 — **용도별 두 값**(F4, [결정 #325] → **보정 [결정 대기 92]**, MGT 실측 2026-11-13: 지평 36 하나면 108개월 전에는 후보가 없어
 * 예비 태그·P8 보호가 아무것도 지키지 않고 오래된 통이 병입으로 다 나간다 → #319·#320 승리 성립 불가).
 * - `reserve`(예비 보호 — `tags.ts reserveCaskIds`·`economics.ts flagshipReserve`·P8 `keptCasks`): 출처·입지·소유가 맞는 자가 몰트 통이면 **처음부터** 후보,
 *   그중 목재 오래된 4통을 지킨다(main 동작 유지). 값 = A(144) → `woodMonths + 144 ≥ 144`는 늘 참. PM 권장, 오너 결정 대기 92
 * - `hint`("곧 적격" 안내 — `alerts`·후보 수·`reserve_casks` 판정·P8 핸드필 제외): 36개월 `[튜닝]`(144 − 36 = 108개월 선, #319와 맞춤)
 * 옛 판은 둘 다 `goal.months − month`(판 끝까지 채울 수 있는가). 샌드박스는 0(지금 적격만)
 */
export type CandidatePurpose = 'reserve' | 'hint';
export const RESERVE_HORIZON_MONTHS = 144;
export const HINT_HORIZON_MONTHS = 36;
export function candidateHorizon(s: Pick<GameState, 'scenario' | 'month' | 'rulesVersion'>, purpose: CandidatePurpose = 'hint'): number {
  if (!s.scenario) return 0;
  if (rulesVersionOf(s) === 'legacy-v15') return Math.max(0, s.scenario.goal.months - s.month);
  return purpose === 'reserve' ? RESERVE_HORIZON_MONTHS : HINT_HORIZON_MONTHS;
}

/**
 * 플래그십 후보 — 옛 판(`legacy-v15`): 판이 끝나기 전에 플래그십 숙성을 채울 수 있는 몰트·그레인 통(동작 그대로, 출력 불변).
 * 새 판(v16, F4): `isCampaignCandidate(s, c, candidateHorizon(s, purpose))` — 자가 몰트 · 같은 입지 · 고객 소유 아님 · 지평 안에 목재 A를 채우는 통(그레인·매입 제외).
 * `purpose`: 예비 보호는 'reserve', 안내·후보 수는 'hint'(기본)
 */
export function isFlagshipCandidate(s: GameState, c: Cask, purpose: CandidatePurpose = 'hint'): boolean {
  if (rulesVersionOf(s) !== 'legacy-v15') return isCampaignCandidate(s, c, candidateHorizon(s, purpose));
  const l = c.contents;
  if (!l || (l.kind !== 'malt' && l.kind !== 'grain')) return false;
  const need = campaignMinOakMonths(s);
  const left = s.scenario ? Math.max(0, s.scenario.goal.months - s.month) : 0;
  return l.oakMonths + left >= need;
}

/** 캠페인 승리를 이뤘는가 — 새 판은 `progress.win`(F4), 옛 판은 `flagship_sold` 마일스톤. 예비 통·알림·화면이 모두 이것으로 "판매 전/후"를 가른다 */
export const campaignWon = (s: Pick<GameState, 'progress' | 'rulesVersion'>): boolean =>
  rulesVersionOf(s) === 'legacy-v15' ? s.progress.milestones.some((m) => m.id === 'flagship_sold') : !!s.progress.win;

// ───────────── 승리 적격 (core-integration §2.3) ─────────────

export interface CaskEligibility {
  /** 지금 이 통의 원액이 승리 적격인가 — 구성 원액 **모두** 자가(self) · 같은 입지 · 몰트 · 목재 ≥ A, 고객 소유 아님 */
  eligible: boolean;
  /** 구성 원액의 최소 목재 숙성 개월 — 판정 기준(R3 min) */
  woodMonths: number;
  /** 구성 원액의 출처 — 섞였으면 가장 나쁜 쪽(unknown > sourced > self) */
  origin: SpiritOrigin;
  /** 적격이 아닌 이유(없으면 적격) — 화면·봇 안내용 */
  reasons: string[];
}

const ORIGIN_RANK: Record<SpiritOrigin, number> = { self: 0, sourced: 1, unknown: 2 };
const worstOrigin = (entries: readonly LedgerEntry[]): SpiritOrigin => entries.reduce<SpiritOrigin>((w, e) => (ORIGIN_RANK[e.origin] > ORIGIN_RANK[w] ? e.origin : w), 'self');

/**
 * 구성 원액 원장의 적격 — 핸드필(#318, 병입 로트를 거치지 않음)·병입 로트(F3)·통(아래)이 모두 이 한 함수를 쓴다.
 * `minWood`는 지금 개월에 더해 본다(후보 판정의 지평 — 0이면 지금 적격)
 */
export function ledgerEligibility(s: Pick<GameState, 'scenario' | 'siteId'>, entries: readonly LedgerEntry[], horizonMonths = 0): Omit<CaskEligibility, 'eligible'> & { eligible: boolean } {
  const A = campaignMinOakMonths(s);
  const reasons: string[] = [];
  if (!entries.length) return { eligible: false, woodMonths: 0, origin: 'unknown', reasons: ['원액 없음'] };
  const woodMonths = Math.min(...entries.map((e) => e.woodMonths));
  const origin = worstOrigin(entries);
  if (entries.some((e) => e.kindAtBirth !== 'malt')) reasons.push('몰트가 아닌 원액이 섞였다');
  if (origin === 'unknown') reasons.push('출처를 알 수 없는 원액(옛 세이브)');
  else if (origin === 'sourced') reasons.push('매입 원액이 섞였다');
  if (entries.some((e) => e.origin === 'self' && e.siteId !== siteIdOf(s))) reasons.push('다른 입지에서 증류한 원액');
  if (woodMonths + horizonMonths < A) reasons.push(`목재 숙성 ${woodMonths}개월 — ${A}개월까지 ${A - woodMonths}개월 남음`);
  return { eligible: reasons.length === 0, woodMonths, origin, reasons };
}

/** 통 하나의 승리 적격 — 지금 기준 (MGT·화면·판정 공용, #320) */
export function caskEligibility(s: Pick<GameState, 'scenario' | 'siteId' | 'rulesVersion'>, cask: Cask): CaskEligibility {
  if (!cask.contents) return { eligible: false, woodMonths: 0, origin: 'unknown', reasons: ['빈 통'] };
  const r = ledgerEligibility(s, ledgerOf(s, cask.contents));
  if (cask.owner) { r.reasons.push('고객 소유 통(캐스크 오너십)'); r.eligible = false; }
  return r;
}

/**
 * 후보 — `horizonMonths` 안에 적격이 될 수 있는 통(MGT 요청: 지평을 인자로. #308로 "판 끝"이 없어지면 상한 없는 후보는 모든 몰트 통이 되어
 * 예비 4통이 뜻을 잃는다). 출처·몰트·입지·소유는 지금 적격과 같은 조건, 개월만 지평을 더해 본다.
 * **F2에서는 `isFlagshipCandidate`(delegateCheck.ts)를 바꾸지 않는다** — 그쪽은 그레인 포함·`goal.months` 상한이라 집합이 다르고, 바꾸면 출력이 바뀐다(F4)
 */
export function isCampaignCandidate(s: Pick<GameState, 'scenario' | 'siteId' | 'rulesVersion'>, cask: Cask, horizonMonths: number): boolean {
  if (!cask.contents || cask.owner) return false;
  return ledgerEligibility(s, ledgerOf(s, cask.contents), Math.max(0, horizonMonths)).eligible;
}
