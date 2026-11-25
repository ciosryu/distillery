// [결정 #380] 숙성 연령 띠 — 홈 숙성고 띠 줄(ARCH) · 병입 「숙성 사다리」 줄(PROD) · #386 자동 채우기 띠 정책이 같은 정의를 쓴다(PROD 잎 모듈 · 의존 최소).
// 공개 정보만 읽는다 — 목재 개월 · 통 종류 · 부피(원액 맛 · 품질은 읽지 않는다). 9차 판: 찬 통 54개 중 60 ~ 119개월 3통인데 이를 보이는 화면이 없었다(prod.md §9.1)
import { CASKS } from './content/catalog';
import { rulesVersionOf } from './rules';
import type { AgePolicy, AgePolicyRule, Cask, GameState } from './types';

/** 연령 띠 — 목재 개월 [lo, hi]. 문턱 `[튜닝]` (#380: 0 ~ 2 · 3 ~ 4 · 5 ~ 9 · 10년 이상) */
export const AGE_BANDS = [
  { id: '0-2', label: '0 ~ 2년', lo: 0, hi: 35 },
  { id: '3-4', label: '3 ~ 4년', lo: 36, hi: 59 },
  { id: '5-9', label: '5 ~ 9년', lo: 60, hi: 119 },
  { id: '10+', label: '10년 이상', lo: 120, hi: Infinity },
] as const;
export type AgeBandId = (typeof AGE_BANDS)[number]['id'];

/** 얇은 띠 — 더 오래된 띠에 통이 있는데 이 띠가 이 통 수 미만이면 강조 `[튜닝]` */
export const THIN_BAND_CASKS = 6; // #386 띠 정책 기본 「5 ~ 9년 6통 남김」과 같은 값

/** 「숙성 사다리」 줄 — 이 병입의 표기(가장 어린 원액)보다 이만큼 넘게 묵은 통을 쓰면 알린다 `[튜닝]` (#380 · prod.md §9.1) */
export const LADDER_SLACK_MONTHS = 24;

/** 목재 개월 → 띠 */
export function ageBand(oakMonths: number): AgeBandId {
  return (AGE_BANDS.find((b) => oakMonths >= b.lo && oakMonths <= b.hi) ?? AGE_BANDS[0]).id;
}

/** 띠에 세는 통 — 나무 통 · 몰트 · 그레인 원액 · 고객 소유 아님 (옹기 · 소주 · 진은 뺀다) */
export const bandCask = (c: Cask): c is Cask & { contents: NonNullable<Cask['contents']> } =>
  !!c.contents && !c.owner && (CASKS[c.typeId]?.material ?? 'wood') === 'wood' && (c.contents.kind === 'malt' || c.contents.kind === 'grain');

export type BandCounts = Record<AgeBandId, { casks: number; liters: number }>;

/** 띠별 통 수 · L — `drawL`(통 id → 이번에 뽑을 L)을 주면 뽑은 뒤(1L 미만이 되면 빈 통)로 센다 */
export function bandCounts(s: Pick<GameState, 'inventory'>, drawL?: ReadonlyMap<string, number>): BandCounts {
  const out = Object.fromEntries(AGE_BANDS.map((b) => [b.id, { casks: 0, liters: 0 }])) as BandCounts;
  for (const c of s.inventory.casks) {
    if (!bandCask(c)) continue;
    const left = c.contents.volumeL - (drawL?.get(c.id) ?? 0);
    if (left < 1) continue;
    const b = out[ageBand(c.contents.oakMonths)];
    b.casks++;
    b.liters += left;
  }
  return out;
}

/**
 * [결정 #410 T2-a] 손 병입이 띠를 얇게 만드는가 — `drawL`(통 id → 뽑을 L)로 통이 비어 통 수가 줄고, 병입 뒤 그 띠가 얇은 띠(`thinBands`)인 띠들.
 * 표기와 무관하다(#380 「숙성 사다리」는 표기 + 2년 넘게 묵은 통을 쓸 때만 떴다). 공개 값(목재 개월 · 통 수)만 읽는다
 */
export function bandThinning(s: Pick<GameState, 'inventory'>, drawL: ReadonlyMap<string, number>): { before: BandCounts; after: BandCounts; thinning: AgeBandId[] } {
  const before = bandCounts(s);
  const after = bandCounts(s, drawL);
  const thin = new Set(thinBands(after));
  return { before, after, thinning: AGE_BANDS.filter((b) => after[b.id].casks < before[b.id].casks && thin.has(b.id)).map((b) => b.id) };
}

/** 얇은 띠 — 더 오래된 띠에 통이 있는데 이 띠가 `THIN_BAND_CASKS` 미만(가장 오래된 띠는 얇다고 하지 않는다) */
export function thinBands(counts: BandCounts, k = THIN_BAND_CASKS): AgeBandId[] {
  return AGE_BANDS.filter((b, i) => counts[b.id].casks < k && AGE_BANDS.slice(i + 1).some((o) => counts[o.id].casks > 0)).map((b) => b.id);
}

// ───────────── [결정 #399 · #386] 연령 띠 정책 — 자동 납품(위스키)이 띠를 지킨다 ─────────────
// 「고연수 캐스크를 막 빨아먹지 않게」(오너). 공개 값(목재 개월 · 통 수)만 읽는다. 자동 납품만 읽는다 — 손 병입 · 블렌더 맡기기 · IB 입찰은 읽지 않는다(#399 B)

/** 띠 id가 코어 타입(`types.ts AgePolicy`)과 같은지 — 다르면 타입 검사에서 걸린다 */
type _SameIds = [AgeBandId] extends [keyof AgePolicy] ? ([keyof AgePolicy] extends [AgeBandId] ? true : never) : never;
const _sameIds: _SameIds = true;
void _sameIds;

/** 띠 정책 기본값 `[튜닝]` (#399 A — 새 판에만): 10년 이상은 자동이 쓰지 않는다(12년 후보 · 플래그십 예비 — 손 병입만) · 5 ~ 9년은 6통 아래로 줄이지 않는다(9차 허리 3통) */
export const defaultAgePolicy = (): AgePolicy => ({ '10+': { auto: 'off' }, '5-9': { auto: 'keep', keep: THIN_BAND_CASKS } });

/** 이 판의 띠 정책 — 옛 판(legacy-v15)은 없음 */
export const agePolicyOf = (s: Pick<GameState, 'inventory' | 'rulesVersion'>): AgePolicy | undefined =>
  rulesVersionOf(s) === 'legacy-v15' ? undefined : s.inventory.agePolicy;

/** 띠 규칙 문구 — 「쓰지 않음」 · 「6통 남김」 · 「제한 없음」 */
export const agePolicyRuleText = (r: AgePolicyRule | undefined): string => (!r ? '제한 없음' : r.auto === 'off' ? '자동이 쓰지 않음' : `${r.keep}통 남김`);

/**
 * 띠 정책 거르기 — 자동 납품 후보(쓸 순서대로 줄 세운 통)에서 정책이 허락하는 통만 순서 그대로 남긴다.
 * `off` 띠의 통은 뺀다. `keep k` 띠는 그 띠의 통 수(`bandCounts` — 이 제품 후보가 아닌 통도 센다)에서 k를 뺀 만큼만, 앞에서부터 쓴다 —
 * 자동이 손대는 통(조금이라도 뽑는 통)은 「쓴 통」으로 세므로 남기는 k통은 그대로 남는다. `held`는 정책 때문에 뺀 통 수(띠별 — 못 채운 사유 메모용)
 */
export function agePolicyFilter<C extends Cask & { contents: NonNullable<Cask['contents']> }>(s: Pick<GameState, 'inventory' | 'rulesVersion'>, ordered: readonly C[]): { allowed: C[]; held: Partial<Record<AgeBandId, number>> } {
  const policy = agePolicyOf(s);
  if (!policy || !Object.keys(policy).length) return { allowed: [...ordered], held: {} };
  const counts = bandCounts(s);
  const used: Partial<Record<AgeBandId, number>> = {};
  const held: Partial<Record<AgeBandId, number>> = {};
  const allowed: C[] = [];
  for (const c of ordered) {
    const band = ageBand(c.contents.oakMonths);
    const rule = policy[band];
    const ok = !rule || (rule.auto === 'keep' && (used[band] ?? 0) < counts[band].casks - rule.keep);
    if (ok) { allowed.push(c); used[band] = (used[band] ?? 0) + 1; }
    else held[band] = (held[band] ?? 0) + 1;
  }
  return { allowed, held };
}

/** [결정 #399] 띠 정책 표 한 줄 — 화면(`AgePolicyRow` · ARCH 홈 띠 줄 자물쇠)이 같이 읽는다. `autoUsable` = 자동 납품이 이 띠에서 지금 손댈 수 있는 통 수(제품 거름 전 상한) */
export interface AgePolicyRowView { id: AgeBandId; label: string; casks: number; liters: number; rule: AgePolicyRule | undefined; autoUsable: number; locked: boolean }
export function agePolicyRows(s: Pick<GameState, 'inventory' | 'rulesVersion'>): AgePolicyRowView[] {
  const counts = bandCounts(s);
  const policy = agePolicyOf(s);
  return AGE_BANDS.map((b) => {
    const rule = policy?.[b.id];
    const n = counts[b.id].casks;
    const autoUsable = !rule ? n : rule.auto === 'off' ? 0 : Math.max(0, n - rule.keep);
    return { id: b.id, label: b.label, casks: n, liters: counts[b.id].liters, rule, autoUsable, locked: !!rule };
  });
}
