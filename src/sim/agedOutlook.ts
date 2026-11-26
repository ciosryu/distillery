// [P10-2 · 10차 70개월 오너 답 「12년 감점 약 19」를 "무슨 말인지 이해가 안 갔다"] 곧 12년이 되는 통의 12년 품질 어림 — 품질 점수로 말한다.
// 12년 조합 표(#410 T1-c `agedCombos`)는 이미 144개월이 넘은 통만 보였다. 10차 판(70개월): 첫 채움 버번 몰트 12년 약 76 · 두 번째 채움 버번 몰트 약 88인데 화면에 없었다(prod.md §1).
// **공개 값만 읽는다(I2)** — 원액 실제 맛 · 숨은 오염 · 레어는 읽지 않는다. 그 통 원액의 레시피 미리보기(`steadyBatch` — 생산 화면이 보이는 값) · 통 종류 · 활성도 · 시즈닝 ·
// 숙성고 칸의 평년 기후 · 원액의 증류기 형태(공개)로 「이 레시피를 이 통에 넣어 12년 두면」을 어림한다. 화면 함수 — 상태 · 규칙 · 난수 불변
import { CASKS } from './content/catalog';
import { bandCask } from './ageBand';
import { caskFamily, CASK_FAMILY_LABEL, type CaskFamily } from './agedCombos';
import { evaluate, lotEvalCtx } from './flavor';
import { matureCask } from './maturation';
import { steadyBatch } from './production';
import { campaignMinOakMonths } from './rules';
import { slotClimateNormal, warehousesOf } from './warehouse';
import type { Cask, Flavor, GameState, SpiritLot } from './types';

/** 어림에 넣는 통 — 목재 이 개월부터(그보다 어린 통은 앞날이 멀어 줄이 길어진다) `[튜닝]` */
export const AGED_OUTLOOK_FROM_MONTHS = 24;
/** 어림 병입 도수(12년 조합 표의 가운데 칸과 같다) */
const OUTLOOK_ABV = 0.46;
/** 위스키 탄닌 상한 · 넘는 1점당 감점(`content/categories.ts` · `flavor.ts evaluate`와 같은 값) */
const TANNIN_CAP = 45;
const TANNIN_PER_POINT = 0.8;

export interface AgedOutlookRow {
  family: CaskFamily;
  familyLabel: string;
  kind: 'malt' | 'grain';
  /** 첫 채움(새 통) / 두 번째 채움 이상(리필 · 재사용) */
  refill: boolean;
  casks: number;
  liters: number;
  /** 가장 오래된 통이 12년이 되기까지 남은 개월 */
  monthsLeft: number;
  /** 12년 46% 품질 어림(점) — 레시피 미리보기를 이 통에 넣었을 때 */
  q: number;
  /** 그중 나무 맛(탄닌)이 넘쳐 깎이는 점수 */
  woodLoss: number;
}

/** 레시피 미리보기 원액을 이 통(종류 · 활성도 · 시즈닝 · 칸)에 넣어 `atMonths`까지 평년 기후로 숙성한 뒤 46%로 낸 품질 — 공개 값만 */
export function caskOutlookQuality(s: GameState, cask: Cask & { contents: SpiritLot }, atMonths = campaignMinOakMonths(s)): { q: number; woodLoss: number } | null {
  const recipe = cask.contents.recipeId ? s.production.recipes.find((r) => r.id === cask.contents.recipeId) : undefined;
  if (!recipe || cask.contents.sourced) return null;
  const b = steadyBatch(s, recipe);
  if (!b) return null;
  const views = warehousesOf(s);
  const view = views.find((w) => w.id === cask.slot?.w) ?? views[0];
  if (!view) return null;
  const tier = cask.slot && view.id === cask.slot.w ? cask.slot.tier : 0;
  const entry = Math.min(0.635, b.abv);
  const lot: SpiritLot = {
    id: 'outlook', name: 'outlook', kind: cask.contents.kind, volumeL: cask.sizeL, abv: entry, flavor: { ...b.flavor }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 0,
    ...(cask.contents.stillShape ? { stillShape: cask.contents.stillShape } : {}),
  };
  // 활성도 · 시즈닝은 통입 때 값(숙성 중에는 바뀌지 않는다). 숨은 값(오염 · 레어)은 지운다
  let c: Cask = { ...cask, contents: lot, rare: undefined, rareKnown: undefined, contamination: undefined, contaminationKnown: undefined };
  const start = (cask.filledMonth ?? s.month - cask.contents.oakMonths);
  for (let k = 0; k < atMonths; k++) {
    const moy = (((start + k) % 12) + 12) % 12 + 1;
    c = matureCask(c, slotClimateNormal(s, view, tier, moy), { control: 0 }).cask;
  }
  const out = c.contents!;
  const ratio = Math.min(1, OUTLOOK_ABV / Math.max(OUTLOOK_ABV, out.abv));
  const f: Flavor = {};
  for (const [k, v] of Object.entries(out.flavor) as [keyof Flavor, number][]) f[k] = k === 'harshness' ? v * Math.pow(ratio, 0.8) : k === 'integration' || k === 'color' ? v : v * Math.pow(ratio, 0.3);
  if (s.hr.houseStyle > 0) f.integration = (f.integration ?? 0) + s.hr.houseStyle / 25;
  const ev = evaluate(f, cask.contents.kind === 'grain' ? 'grain_whisky' : 'whisky', lotEvalCtx({ ...out, oakMonths: atMonths }));
  return { q: Math.round(ev.quality * 10) / 10, woodLoss: Math.round(Math.max(0, (f.oak_tannin ?? 0) - TANNIN_CAP) * TANNIN_PER_POINT * 10) / 10 };
}

/**
 * 곧 12년이 되는 위스키 통(목재 `AGED_OUTLOOK_FROM_MONTHS` ~ 기준 개월 미만)을 통 계열 · 원액 종류 · 첫 채움 / 두 번째 채움 이상으로 묶어,
 * 가장 오래된 통이 12년이 되기까지 남은 개월과 12년 품질 어림(그 묶음의 가장 오래된 통으로 어림)을 낸다. 아는 오염 · 고객 소유 · 핸드필 통은 뺀다
 */
export function agedOutlook(s: GameState, atMonths = campaignMinOakMonths(s), fromMonths = AGED_OUTLOOK_FROM_MONTHS): AgedOutlookRow[] {
  const casks = s.inventory.casks.filter((c): c is Cask & { contents: SpiritLot } =>
    bandCask(c) && !c.contaminationKnown && !c.handfill && c.contents.volumeL >= 1 && c.contents.oakMonths >= fromMonths && c.contents.oakMonths < atMonths);
  const groups = new Map<string, (Cask & { contents: SpiritLot })[]>();
  for (const c of casks) {
    const key = `${caskFamily(c)}:${c.contents.kind}:${c.fills >= 2 ? 'r' : 'f'}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const rows: AgedOutlookRow[] = [];
  for (const list of groups.values()) {
    const oldest = [...list].sort((a, b) => b.contents.oakMonths - a.contents.oakMonths || a.id.localeCompare(b.id))[0]!;
    const o = caskOutlookQuality(s, oldest, atMonths);
    if (!o) continue;
    const family = caskFamily(oldest);
    rows.push({
      family, familyLabel: CASK_FAMILY_LABEL[family], kind: oldest.contents.kind as 'malt' | 'grain', refill: oldest.fills >= 2,
      casks: list.length, liters: list.reduce((t, c) => t + c.contents.volumeL, 0), monthsLeft: atMonths - oldest.contents.oakMonths, q: o.q, woodLoss: o.woodLoss,
    });
  }
  return rows.sort((a, b) => b.q - a.q || a.monthsLeft - b.monthsLeft);
}

/** 통 종류 이름(줄 보조) — 가장 흔한 카탈로그 이름 */
export const outlookCaskName = (typeId: keyof typeof CASKS): string => CASKS[typeId]?.nameKo ?? String(typeId);
