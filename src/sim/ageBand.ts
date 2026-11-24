// [결정 #380] 숙성 연령 띠 — 홈 숙성고 띠 줄(ARCH) · 병입 「숙성 사다리」 줄(PROD) · #386 자동 채우기 띠 정책이 같은 정의를 쓴다(PROD 잎 모듈 · 의존 최소).
// 공개 정보만 읽는다 — 목재 개월 · 통 종류 · 부피(원액 맛 · 품질은 읽지 않는다). 9차 판: 찬 통 54개 중 60 ~ 119개월 3통인데 이를 보이는 화면이 없었다(prod.md §9.1)
import { CASKS } from './content/catalog';
import type { Cask, GameState } from './types';

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

/** 얇은 띠 — 더 오래된 띠에 통이 있는데 이 띠가 `THIN_BAND_CASKS` 미만(가장 오래된 띠는 얇다고 하지 않는다) */
export function thinBands(counts: BandCounts, k = THIN_BAND_CASKS): AgeBandId[] {
  return AGE_BANDS.filter((b, i) => counts[b.id].casks < k && AGE_BANDS.slice(i + 1).some((o) => counts[o.id].casks > 0)).map((b) => b.id);
}
