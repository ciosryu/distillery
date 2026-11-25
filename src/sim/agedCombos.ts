// [결정 #410 T1-c] 12년 병입 때 조합 비교 — 적격 통(목재 기준 개월 이상)을 통 계열 · 원액 종류로 묶어, 조합마다 도수(40 · 46% · 캐스크 도수)별 병 수 · 예상 품질을 보인다.
// 9차 판(159개월): 오너가 133개월에 버번 몰트 3통(샘플 77 · 약 250L)을 두고도 「버번통이 별로 없던데?」 — 벗 K74 위주로 병입해 판정 59.2. 같은 때 버번 3통 40%는 76.4였다(prod.md §10).
// 품질은 병입 미리보기 · 병입 행동과 같은 아는 품질(`batchQualityKnown` — 샘플 추정 + 병입 보정)만 쓴다. 참 품질은 품질을 가리지 않는 판(샌드박스 · 옛 판)에서만. 값 · 규칙 불변(화면 함수)
import { CASKS } from './content/catalog';
import { batchQualityKnown, previewBlend, type BlendComponent, type BottleOptions } from './blending';
import { bandCask } from './ageBand';
import { campaignMinOakMonths } from './rules';
import { hidesProductQuality } from './productView';
import type { Cask, GameState, ProductCategory } from './types';

/** 비교하는 도수 — 'cask' = 캐스크 도수(물을 타지 않음) */
export const AGED_COMBO_ABVS = [0.4, 0.46, 'cask'] as const;
export type AgedComboAbv = (typeof AGED_COMBO_ABVS)[number];

/** 통 계열 — 시즈닝 종류로 묶는다(버번 · 새 통 / 셰리 / 와인 · 포트) */
export type CaskFamily = 'bourbon' | 'sherry' | 'wine';
export const CASK_FAMILY_LABEL: Record<CaskFamily, string> = { bourbon: '버번 · 새 통 계열', sherry: '셰리 계열', wine: '와인 · 포트 계열' };
export function caskFamily(c: Pick<Cask, 'typeId'>): CaskFamily {
  const t = CASKS[c.typeId]?.seasoningType;
  return t === 'sherry' ? 'sherry' : t === 'wine' || t === 'port' ? 'wine' : 'bourbon';
}

export interface AgedComboCell { abv: AgedComboAbv; bottles: number; category: ProductCategory | null; ageYears: number | null; q: number | null; sigma: number; errors: string[] }
export interface AgedCombo { id: string; label: string; caskIds: string[]; liters: number; cells: AgedComboCell[] }
export interface AgedComboView {
  atMonths: number;
  /** 적격 통 — 계열 · 원액 종류별 통 수 · L */
  groups: { family: CaskFamily; kind: 'malt' | 'grain'; casks: number; liters: number }[];
  /** 아는 오염 · 고객 소유 · 핸드필이라 뺀 적격 통 수 */
  excluded: number;
  combos: AgedCombo[];
  /** 품질이 아는 값(샘플 추정)인가 — 가리는 판이면 true */
  known: boolean;
}

/**
 * 기준 개월(A, v16 144) 이상인 몰트 · 그레인 나무 통으로 낼 수 있는 조합과 도수별 병 수 · 예상 품질. 적격 통이 없으면 null.
 * 조합: 계열마다 싱글 몰트 · 싱글 그레인, 몰트 전부(계열이 둘 이상일 때), 몰트 + 그레인 전부(블렌디드 — 둘 다 있을 때). 통은 남은 양 전부를 쓴다
 */
export function agedCombos(s: GameState, atMonths = campaignMinOakMonths(s), base: Pick<BottleOptions, 'bottleMl' | 'chillFilter' | 'packagingId'> = { bottleMl: 700, chillFilter: false, packagingId: 'standard' }): AgedComboView | null {
  const all = s.inventory.casks.filter((c): c is Cask & { contents: NonNullable<Cask['contents']> } => bandCask(c) && c.contents.oakMonths >= atMonths && c.contents.volumeL >= 1);
  if (!all.length) return null;
  const usable = all.filter((c) => !c.contaminationKnown && !c.handfill);
  const known = hidesProductQuality(s);
  const groups = new Map<string, { family: CaskFamily; kind: 'malt' | 'grain'; casks: number; liters: number }>();
  for (const c of usable) {
    const kind = c.contents.kind as 'malt' | 'grain';
    const key = `${caskFamily(c)}:${kind}`;
    const g = groups.get(key) ?? { family: caskFamily(c), kind, casks: 0, liters: 0 };
    g.casks++;
    g.liters += c.contents.volumeL;
    groups.set(key, g);
  }
  const sets: { id: string; label: string; casks: typeof usable }[] = [];
  const fams = (['bourbon', 'sherry', 'wine'] as const);
  for (const kind of ['malt', 'grain'] as const) {
    const ofKind = usable.filter((c) => c.contents.kind === kind);
    const famsHere = fams.filter((f) => ofKind.some((c) => caskFamily(c) === f));
    for (const f of famsHere) sets.push({ id: `${kind}:${f}`, label: `${kind === 'malt' ? '싱글 몰트' : '싱글 그레인'} — ${CASK_FAMILY_LABEL[f]}만`, casks: ofKind.filter((c) => caskFamily(c) === f) });
    if (famsHere.length > 1) sets.push({ id: `${kind}:all`, label: `${kind === 'malt' ? '싱글 몰트' : '싱글 그레인'} — 계열 모두`, casks: ofKind });
  }
  if (usable.some((c) => c.contents.kind === 'malt') && usable.some((c) => c.contents.kind === 'grain')) sets.push({ id: 'blend:all', label: '블렌디드 — 몰트 + 그레인 모두', casks: usable });
  const combos: AgedCombo[] = sets.map((set) => {
    const comps: BlendComponent[] = set.casks.map((c) => ({ source: 'cask', id: c.id, liters: Math.floor(c.contents.volumeL * 10) / 10 }));
    const cells = AGED_COMBO_ABVS.map((abv): AgedComboCell => {
      const pv = previewBlend(s, comps, { ...base, name: '', targetAbv: abv });
      if (!pv.ok || !pv.evaluation) return { abv, bottles: pv.bottles, category: pv.category, ageYears: pv.ageYears, q: null, sigma: 0, errors: pv.errors };
      const k = known ? batchQualityKnown(s, comps, pv) : undefined;
      return { abv, bottles: pv.bottles, category: pv.category, ageYears: pv.ageYears, q: k ? k.est : Math.round(pv.evaluation.quality * 10) / 10, sigma: k?.sigma ?? 0, errors: [] };
    });
    return { id: set.id, label: set.label, caskIds: set.casks.map((c) => c.id), liters: set.casks.reduce((t, c) => t + c.contents.volumeL, 0), cells };
  });
  return { atMonths, groups: [...groups.values()], excluded: all.length - usable.length, combos, known };
}
