// [P10-2 · 10차 70개월 오너 답 「12년 감점 약 19」를 "무슨 말인지 이해가 안 갔다"] 곧 12년이 되는 통의 12년 품질 어림 — 품질 점수로 말한다.
// 12년 조합 표(#410 T1-c `agedCombos`)는 이미 144개월이 넘은 통만 보였다. 10차 판(70개월): 첫 채움 버번 몰트 12년 약 76 · 두 번째 채움 버번 몰트 약 88인데 화면에 없었다(prod.md §1).
// **공개 값만 읽는다(I2)** — 원액 실제 맛 · 숨은 오염 · 레어는 읽지 않는다. 그 통 원액의 레시피 미리보기(`steadyBatch` — 생산 화면이 보이는 값) · 통 종류 · 활성도 · 시즈닝 ·
// 숙성고 칸의 평년 기후 · 원액의 증류기 형태(공개)로 「이 레시피를 이 통에 넣어 12년 두면」을 어림한다. 화면 함수 — 상태 · 규칙 · 난수 불변
import { CASKS } from './content/catalog';
import { bandCask } from './ageBand';
import { caskFamily, CASK_FAMILY_LABEL, type CaskFamily } from './agedCombos';
import { evaluate, lotEvalCtx } from './flavor';
import { matureCask, refillState } from './maturation';
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

// 화면이 통마다 부르므로 캐시한다 — 레시피 미리보기는 상태마다(WeakMap), 숙성 어림은 입력이 같으면 상태를 넘어 같은 값(입력 문자열 열쇠)
const batchCache = new WeakMap<GameState, Map<string, { flavor: Flavor; abv: number } | null>>();
const outlookCache = new Map<string, { q: number; woodLoss: number }>();
const OUTLOOK_CACHE_MAX = 4000;
function recipeBatch(s: GameState, recipeId: string): { flavor: Flavor; abv: number } | null {
  let m = batchCache.get(s);
  if (!m) { m = new Map(); batchCache.set(s, m); }
  if (!m.has(recipeId)) {
    const recipe = s.production.recipes.find((r) => r.id === recipeId);
    const b = recipe ? steadyBatch(s, recipe) : null;
    m.set(recipeId, b ? { flavor: b.flavor, abv: b.abv } : null);
  }
  return m.get(recipeId) ?? null;
}

/** 레시피 미리보기 원액을 이 통(종류 · 활성도 · 시즈닝 · 칸)에 넣어 `atMonths`까지 평년 기후로 숙성한 뒤 46%로 낸 품질 — 공개 값만 */
export function caskOutlookQuality(s: GameState, cask: Cask & { contents: Pick<SpiritLot, 'recipeId' | 'kind' | 'oakMonths' | 'sourced' | 'stillShape'> }, atMonths = campaignMinOakMonths(s)): { q: number; woodLoss: number } | null {
  if (!cask.contents.recipeId || cask.contents.sourced) return null;
  const b = recipeBatch(s, cask.contents.recipeId);
  if (!b) return null;
  const views = warehousesOf(s);
  const view = views.find((w) => w.id === cask.slot?.w) ?? views[0];
  if (!view) return null;
  const tier = cask.slot && view.id === cask.slot.w ? cask.slot.tier : 0;
  const start0 = (cask.filledMonth ?? s.month - cask.contents.oakMonths);
  const key = JSON.stringify([b, cask.contents.kind, cask.contents.stillShape ?? null, cask.typeId, cask.wood, cask.char, cask.sizeL, Math.round(cask.activity * 1e4), Math.round(cask.seasoning * 1e4),
    s.regionId, s.siteId ?? null, view.id, tier, ((start0 % 12) + 12) % 12, atMonths, s.hr.houseStyle, s.rulesVersion ?? null]);
  const hit = outlookCache.get(key);
  if (hit) return hit;
  const r = projectOutlook(s, cask, b, view, tier, start0, atMonths);
  if (outlookCache.size >= OUTLOOK_CACHE_MAX) outlookCache.clear();
  outlookCache.set(key, r);
  return r;
}

function projectOutlook(s: GameState, cask: Cask & { contents: Pick<SpiritLot, 'kind' | 'stillShape'> }, b: { flavor: Flavor; abv: number }, view: ReturnType<typeof warehousesOf>[number], tier: number, start: number, atMonths: number): { q: number; woodLoss: number } {
  const entry = Math.min(0.635, b.abv);
  const lot: SpiritLot = {
    id: 'outlook', name: 'outlook', kind: cask.contents.kind, volumeL: cask.sizeL, abv: entry, flavor: { ...b.flavor }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 0,
    ...(cask.contents.stillShape ? { stillShape: cask.contents.stillShape } : {}),
  };
  // 활성도 · 시즈닝은 통입 때 값(숙성 중에는 바뀌지 않는다). 숨은 값(오염 · 레어)은 지운다
  let c: Cask = { ...cask, contents: lot, rare: undefined, rareKnown: undefined, contamination: undefined, contaminationKnown: undefined };
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
 * [H1] 같은 원액을 **리필(한 번 쓴) 통**에 넣었다면 — 같은 통 종류에 활성도 × 0.6 · 시즈닝 × 0.35(채웠다 뺀 상태, `refillState`)로 어림한다.
 * 이미 두 번 이상 쓴 통이면 null(비교할 것이 없다)
 */
export function refillOutlookQuality(s: GameState, cask: Cask & { contents: Pick<SpiritLot, 'recipeId' | 'kind' | 'oakMonths' | 'sourced' | 'stillShape'> }, atMonths = campaignMinOakMonths(s)): { q: number; woodLoss: number } | null {
  const filledBefore = cask.contents ? cask.fills - 1 : cask.fills; // 원액이 든 통은 지금 채움을 센다
  if (filledBefore >= 1) return null;
  return caskOutlookQuality(s, { ...cask, ...refillState(cask), fills: cask.fills }, atMonths);
}

/**
 * [H1 · T1-a] 빈 통들에 이 원액을 지금 채우면 — 통마다 12년 품질 어림(최저 · 최고)과 나무 맛 손실, 첫 채움 통이면 리필 통 대안. 활성도를 모르는 통(스팟 6개월 전)은 센다만 한다
 */
export function fillOutlookQuality(s: GameState, casks: readonly Cask[], lot: Pick<SpiritLot, 'recipeId' | 'kind' | 'sourced' | 'stillShape'>, atMonths = campaignMinOakMonths(s)):
  { count: number; unknown: number; qMin: number; qMax: number; lossMin: number; lossMax: number; refill: { q: number; woodLoss: number } | null } | null {
  if (lot.kind !== 'malt' && lot.kind !== 'grain') return null;
  const wood = casks.filter((c) => !c.contents && (CASKS[c.typeId]?.material ?? 'wood') === 'wood');
  if (!wood.length) return null;
  const known = wood.filter((c) => c.activityKnown !== false);
  const outs = known.map((c) => ({ c, o: caskOutlookQuality(s, { ...c, contents: { ...lot, oakMonths: 0 }, filledMonth: s.month, fills: c.fills + 1 } as Cask & { contents: SpiritLot }, atMonths) }))
    .filter((x): x is { c: Cask; o: { q: number; woodLoss: number } } => !!x.o);
  if (!outs.length) return known.length ? null : { count: wood.length, unknown: wood.length, qMin: 0, qMax: 0, lossMin: 0, lossMax: 0, refill: null };
  const first = outs.find((x) => x.c.fills === 0);
  const refill = first ? caskOutlookQuality(s, { ...first.c, ...refillState(first.c), contents: { ...lot, oakMonths: 0 }, filledMonth: s.month, fills: 2 } as Cask & { contents: SpiritLot }, atMonths) : null;
  return {
    count: wood.length, unknown: wood.length - known.length,
    qMin: Math.min(...outs.map((x) => x.o.q)), qMax: Math.max(...outs.map((x) => x.o.q)),
    lossMin: Math.min(...outs.map((x) => x.o.woodLoss)), lossMax: Math.max(...outs.map((x) => x.o.woodLoss)),
    refill,
  };
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
