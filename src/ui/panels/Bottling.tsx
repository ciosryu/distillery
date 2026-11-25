import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_POLICY_N, defaultPolicyPrice } from '../../sim/content/market'; // 기본 정책 가격 (B1-4, MKT 대행)
import { PackagingPicker } from './PackagingPicker';
import { bottleWithHeritage, HeritageReveal, type HeritageRevealData } from './HeritageReveal';
import { BOTTLE_SIZES, CASKS, PACKAGING } from '../../sim/content/catalog';
import { CATEGORY } from '../../sim/content/categories';
import { AXIS } from '../../sim/content/axes';
import { agePerception, calendar, estimateBlend, finishOf, type Cask, type CaskTypeId, hexOf, whiskyMinMonths, type ProfileAxis, type SpiritLot, priceAtQuality, weightedAverage, finishLabel, HEX_AXES, HEX_LABEL, knownReads, type Hex, DUTY_FREE, isWhiskyCategory, dutyFreeAgedAppeal, dutyFreeSlotBlocker, hasDutyFree, nextDutyFreeEdition, previewBlend, productDutyFreeDemand, demandFor, topNotes, type BlendComponent, type BottleOptions, type Product, type SpiritKind, type AxisId, type KnownRead, vesselMaterial, sampleAxesOf, restockable, monthLabel, skuSplitEqual, isCaskStrength, knownProductQuality, restockMix, restockPrior, recipeSharesOf, RESTOCK_PRIOR_SIGMA_FLOOR, batchQualityKnown, hidesProductQuality, newFinishShort, restockFinishOff, caskStrengthCompare, CS_COMPARE_ABV } from '../../sim';
import { agedWhitePerception } from '../../sim/content/market';
import { regionOf } from '../../sim/content/regions';
import { autoRestockCeiling, autoRestockFloor, autoRestockHint, handRestockCount, STANDARD_BOTTLE, stockMonthsAfter, STOCK_STRONG_WARN_MONTHS, STOCK_WARN_MONTHS } from '../../sim/economics';
import { overhangFactor } from '../../sim/retail'; // 제품 재고 적체 → 수요 배수(시장이 쓰는 그 함수 — 9차 중간 기록: 오크소주 31.8개월 ×0.60이 어느 화면에도 없었다)
import { protectedCaskIds, reserveCaskIds } from '../../sim/tags';
import { campaignMinOakMonths, campaignWon, isFlagshipCandidate, rulesVersionOf } from '../../sim';
import { CaskTagChips } from '../CaskTags';
import { mixTaint, taintShown } from '../../sim/taint'; // [결정 #382] 오염 원액 꼬리표(코어 · ARCH 화면)
import { AGE_BANDS, bandCask, bandThinning, LADDER_SLACK_MONTHS, thinBands, THIN_BAND_CASKS } from '../../sim/ageBand'; // [결정 #380] 숙성 연령 띠 (PROD 잎)
import { AGED_COMBO_ABVS, agedCombos, CASK_FAMILY_LABEL } from '../../sim/agedCombos'; // [결정 #410 T1-c] 12년 조합 비교
import { useGame } from '../../store/game';
import { Radar } from '../charts';
import { ProfileRadar } from './Production';
import { liters, months, num, pct, won } from '../format';
import { Badge, Button, Card, Empty, NumberField, Select, Table, Td, TextField } from '../kit';

const KIND_LABEL: Record<SpiritKind, string> = { soju: '소주', gin: '진', malt: '몰트', grain: '그레인', baijiu: '백주' };
/** 육각형 상위 축 이름 (샘플 기록 표시용) */
const topHex = (h: Hex, n = 3) => HEX_AXES.filter((a) => h[a] >= 1).sort((a, b) => h[b] - h[a]).slice(0, n).map((a) => HEX_LABEL[a]).join(' · ') || '뚜렷한 향 없음';
/** 소주·진·고량주 샘플 기록의 강한 향 — 그 주종 레이더 축 (#183). 육각형(위스키 축)으로 보이면 소주에 "피트"가 떴다 */
const topAxes = (ax: Partial<Record<AxisId, number>>, n = 3) => (Object.entries(ax) as [AxisId, number][]).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, n).map(([a]) => AXIS[a].nameKo).join(' · ') || '뚜렷한 향 없음';
/** 샘플 기록의 강한 향 — 레이더 축 읽기가 있으면 그것, 없으면 육각형 */
const topKnown = (k: KnownRead, kind: SpiritKind) => (k.axes ? topAxes(k.axes) : sampleAxesOf(kind) ? '향은 다시 샘플(이전 버전 기록)' : topHex(k.hex));

/** 원액 분류 — 주종 + 위스키 표기 가능 여부 (플레이테스트 2026-11-07: 주종이 다 섞여 보여 블렌딩이 불편하다) */
export function sourceCategory(lot: SpiritLot, minMonths: number): string {
  if (lot.kind === 'malt') return lot.oakMonths >= minMonths ? '몰트 위스키' : '몰트 스피릿(숙성 중)';
  if (lot.kind === 'grain') return lot.oakMonths >= minMonths ? '그레인 위스키' : '그레인 스피릿(숙성 중)';
  return KIND_LABEL[lot.kind];
}
export const CATEGORY_ORDER = ['몰트 위스키', '몰트 스피릿(숙성 중)', '그레인 위스키', '그레인 스피릿(숙성 중)', '소주', '진', '백주'];

/** 캐스크 종류 짧은 이름과 색 (플레이테스트 2026-11-07: 버번 캐스크인지 올로로소 캐스크인지 구분이 안 된다) */
const CASK_SHORT: Record<CaskTypeId, { name: string; cls: string }> = {
  ex_bourbon_barrel: { name: '버번 배럴', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200' },
  oloroso_butt: { name: '올로로소 셰리 벗', cls: 'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-200' },
  korean_oak_quarter: { name: '한국 참나무', cls: 'bg-lime-100 text-lime-900 dark:bg-lime-900/50 dark:text-lime-200' },
  mizunara_hogshead: { name: '미즈나라', cls: 'bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-200' },
  onggi_jar: { name: '옹기', cls: 'bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-100' },
  // #355 일반 4종 — 14색은 구분이 안 돼 계열별 색(셰리 · 포트 = 장미, 와인 = 보라, 새 통 = 연두)
  sherry_hogshead: { name: '셰리 혹스헤드', cls: 'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-200' },
  port_pipe: { name: '포트 파이프', cls: 'bg-rose-200 text-rose-950 dark:bg-rose-800/60 dark:text-rose-100' },
  wine_barrique: { name: '와인 바리끄', cls: 'bg-purple-100 text-purple-900 dark:bg-purple-900/50 dark:text-purple-200' },
  virgin_oak_barrel: { name: '버진 오크', cls: 'bg-lime-100 text-lime-900 dark:bg-lime-900/50 dark:text-lime-200' },
};
export const caskShort = (t: CaskTypeId) => CASK_SHORT[t]?.name ?? CASKS[t]?.nameKo ?? t;
/** 덜 채운 통 (화면 진행 메모 B2 — 218L를 통입하면 200L + 52L 두 통이 되는데 표시가 없었다) — 통 크기의 60% 미만이면 채운 비율(%), 아니면 null. 증발로 준 것과는 구별하지 않는다 */
export function partialFill(c: Cask): number | null {
  if (!c.contents) return null;
  const share = c.contents.volumeL / CASKS[c.typeId].sizeL;
  return share < 0.6 ? Math.round(share * 100) : null;
}
/** [결정 #382] 오염 원액 표시 — 아는 오염 통에서 꺼낸 원액이 5% 이상 섞였다(통 자체는 깨끗할 수 있다). 몫(참값 아님 — 아는 오염 · 부피로 센 것)만 쓰고 오염 종류는 보이지 않는다 */
function TaintChip() {
  return <span className="rounded border border-rose-400 px-1 py-px text-[11px] font-semibold text-rose-700 dark:border-rose-600 dark:text-rose-300" title="아는 오염 통에서 꺼낸 원액이 섞여 있다 — 이미 밴 결점 향(곰팡내)은 옮겨도 빠지지 않아 병입하면 제품에 섞인다">오염 원액</span>;
}
/** 통 표시: 종류 · 회차(1필 = 새 통, 숫자가 클수록 향이 약하다) · 피니시 */
function CaskTag({ c }: { c: Cask }) {
  const f = c.contents ? finishOf(c.contents) : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`rounded px-1 py-px text-[11px] font-medium ${CASK_SHORT[c.typeId]?.cls ?? ''}`}>{caskShort(c.typeId)}</span>
      <span className="text-stone-500">{c.fills}필{f ? ` · ${finishLabel(f.typeId)} ${months(f.months)}` : ''}</span>
      {/* [결정 #365] 아는 오염만(F5b — 모르는 오염은 QC 전까지 보이지 않는다). 종류(곰팡이 · TCA)와 양은 참값이라 보이지 않는다 */}
      {!c.contaminationKnown && taintShown(c.contents) && <TaintChip />}
      {c.contaminationKnown && <span className="rounded bg-rose-600 px-1 py-px text-[11px] font-semibold text-white dark:bg-rose-500" title="오염된 통 — 섞으면 결점 향(곰팡내)이 제품에 섞여 품질이 내려간다. 통에 둔 동안 결점 향이 매달 더 밴다">오염</span>}
      {/* 핸드필 지정 통 (9차 중간 기록: 지정 통 K306을 병입에 써서 핸드필이 메모 없이 끝났다 — 표에 표시가 없었다) */}
      {c.handfill && <span className="rounded bg-amber-100 px-1 py-px text-[11px] font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-200" title="핸드필 존에 내놓은 통 — 방문객이 이 통에서 직접 담아 간다">핸드필</span>}
      {partialFill(c) != null && <span className="rounded bg-stone-100 px-1 py-px text-[11px] text-stone-700 dark:bg-stone-800 dark:text-stone-300" title="통 크기보다 원액이 많이 적다 — 통입할 때 원액이 모자라 덜 채운 통이다. 숙성·증발은 같은 규칙으로 돈다">{partialFill(c)}% 채움</span>}
    </span>
  );
}

/** 블렌딩 그래프의 원액 색 — 밝은·어두운 화면 모두에서 보이는 중간 톤 */
const LAYER_COLORS = ['#0ea5e9', '#10b981', '#a855f7', '#ef4444', '#eab308', '#14b8a6', '#f97316', '#6366f1'];

const ABV_PRESETS = ['cask', '0.25', '0.3', '0.34', '0.38', '0.4', '0.43', '0.46', '0.58'] as const;

export function Bottling() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [reveal, setReveal] = useState<HeritageRevealData | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [opts, setOpts] = useState<BottleOptions>({ name: '', targetAbv: 0.4, bottleMl: 700, chillFilter: true, packagingId: 'standard' });
  /** 플레이어가 병·도수를 손으로 바꿨는가 — 바꿨으면 표준 병으로 되돌리지 않는다(A5) */
  const touched = useRef(false);

  // 캐스크를 먼저(오래 숙성한 순), 탱크 원액은 레시피별로 한 줄 — 생산 지시가 달마다 배치를 하나씩 쌓아 탱크 줄이 수십 개가 되던 것을 묶는다.
  // 묶음에 넣은 사용량은 배치별 액량에 비례해 나눠 쓴다 (화면만의 묶음 — 원액 자체는 그대로다)
  const sources = useMemo(() => {
    const casks = s.inventory.casks.filter((c) => c.contents)
      .sort((a, b) => Math.max(b.contents!.oakMonths, b.contents!.restMonths ?? 0) - Math.max(a.contents!.oakMonths, a.contents!.restMonths ?? 0))
      .map((c) => ({ key: `cask:${c.id}`, source: 'cask' as const, id: c.id, ids: [c.id], lot: c.contents!, where: `캐스크 ${c.id}`, cask: c as Cask | undefined }));
    const groups = new Map<string, typeof s.inventory.lots>();
    for (const l of s.inventory.lots) { const g = `${l.kind}:${l.recipeId ?? l.name.split(' · ')[0]}:${l.sourced ? 's' : ''}`; groups.set(g, [...(groups.get(g) ?? []), l]); }
    const tanks = [...groups.entries()].map(([g, lots]) => {
      const vol = lots.reduce((t, l) => t + l.volumeL, 0);
      const lpa = lots.reduce((t, l) => t + l.volumeL * l.abv, 0);
      const newest = [...lots].sort((a, b) => b.createdMonth - a.createdMonth)[0]!;
      const lot = { ...newest, name: lots.length > 1 ? `${newest.name.split(' · ')[0]} — 탱크 ${lots.length}개 배치` : newest.name, volumeL: vol, abv: lpa / vol, flavor: weightedAverage(lots.map((l) => ({ flavor: l.flavor, weight: l.volumeL * l.abv }))), knownTaint: mixTaint(lots.map((l) => ({ taint: l.knownTaint, lpa: l.volumeL * l.abv }))) }; // #382 탱크 묶음 꼬리표 = 배치 LPA 몫
      return { key: `tank:${g}`, source: 'lot' as const, id: newest.id, ids: lots.map((l) => l.id), lot, where: '탱크', cask: undefined as Cask | undefined };
    });
    return [...casks, ...tanks];
  }, [s.inventory.lots, s.inventory.casks]);

  // 주종별 보기 — 처음 원액을 고르면 그 분류로 바뀐다(다른 주종은 어차피 섞을 수 없다). 고른 원액은 분류와 상관없이 늘 보인다
  const minMonths = whiskyMinMonths(regionOf(s).whisky);
  const [cat, setCat] = useState<string>('전체');
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of sources) { const k = sourceCategory(x.lot, minMonths); m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]));
  }, [sources, minMonths]);
  const [caskType, setCaskType] = useState<CaskTypeId | '전체'>('전체');
  const byCat = cat === '전체' ? sources : sources.filter((x) => sourceCategory(x.lot, minMonths) === cat || picked[x.key] != null);
  // 통 종류로 한 번 더 거르기 — 보이는 원액에 통 종류가 둘 이상일 때만 버튼을 낸다
  const caskTypes = [...new Set(byCat.flatMap((x) => (x.cask ? [x.cask.typeId] : [])))];
  const shown = caskType === '전체' || !caskTypes.includes(caskType) ? byCat : byCat.filter((x) => x.cask?.typeId === caskType || picked[x.key] != null);

  const components: BlendComponent[] = Object.entries(picked).flatMap(([key, l]): BlendComponent[] => {
    const src = sources.find((x) => x.key === key);
    if (!src) return [];
    if (src.source === 'cask') return [{ source: 'cask', id: src.id, liters: l }];
    // 탱크 묶음: 배치별 액량에 비례해 나눈다
    return src.ids.map((id) => { const lot = s.inventory.lots.find((x) => x.id === id)!; return { source: 'lot' as const, id, liters: Math.floor(((l * lot.volumeL) / src.lot.volumeL) * 10) / 10 }; }).filter((c) => c.liters > 0);
  });
  const preview = components.length ? previewBlend(s, components, opts) : null;
  // 태그 (#260·#249 ②) — 손 병입은 막지 않고, 플래그십 예비·보호 통을 쓰면 버튼 위에 알린다(자동 납품은 이 통을 쓰지 않는다)
  const reserve = useMemo(() => reserveCaskIds(s), [s]);
  const guardedPicked = useMemo(() => {
    const prot = protectedCaskIds(s);
    const ids = components.filter((c) => c.source === 'cask').map((c) => c.id);
    // 승리 전 12년 후보(예비가 아닌 것) — 7차 판: 139·141개월 10·11년 제품에 후보 5통(목재 126~133개월)을 경고 없이 썼다(후보 12 → 7). 막지 않고 알린다 (P-PROD-65)
    const hintOn = rulesVersionOf(s) !== 'legacy-v15' && !campaignWon(s);
    const isCand = (c: Cask) => hintOn && isFlagshipCandidate(s, c, 'hint');
    const picked = new Set(ids);
    const candidate = hintOn ? ids.flatMap((id) => { const c = s.inventory.casks.find((x) => x.id === id); return c && !reserve.has(id) && !prot.has(id) && isCand(c) ? [{ id, oak: c.contents!.oakMonths }] : []; }) : [];
    const candidatesLeft = hintOn ? s.inventory.casks.filter((c) => !picked.has(c.id) && isCand(c)).length : 0;
    // [결정 #365] 아는 오염 통 — 손 병입은 막지 않고 눈에 띄게 알리며 두 번 눌러야 병입된다(자동 납품 · 블렌더 위임은 이미 뺀다)
    const contaminated = ids.filter((id) => s.inventory.casks.find((x) => x.id === id)?.contaminationKnown);
    return { reserve: ids.filter((id) => reserve.has(id)), other: ids.filter((id) => prot.has(id) && !reserve.has(id)), candidate, candidatesLeft, contaminated };
  }, [s, reserve, components]);
  // [결정 #382] 오염 원액이 섞인 원액(아는 오염 통이 아닌 통 · 탱크) — #365와 같이 막지 않고 알리며 두 번 눌러야 병입된다
  const taintedPicked = Object.keys(picked).flatMap((k) => { const x = sources.find((y) => y.key === k); return x && !x.cask?.contaminationKnown && taintShown(x.lot) ? [x.cask ? x.cask.id : x.where] : []; });
  // 시나리오 게임(MVP)은 캐스크의 참 향미·품질을 숨긴다 (#136·#159) — 샘플 기록으로 추정한 값만 보여 주고, 병입하면 공개된다. 샌드박스는 개발용으로 참값을 보여 준다
  const hide = !!s.scenario;
  const known = useMemo(() => (hide ? knownReads(s) : null), [hide, s]);
  const est = hide && preview ? estimateBlend(s, components) : null;
  const masked = !!est?.fromCasks;
  // 병입하면 제품에 남는 아는 품질(F5d — 모르는 몫은 사전값·큰 오차로 섞음). 첫 출고가·기준가 미리 보기가 병입 행동(executeBlend)과 같은 값을 쓰게 한다
  const restockTarget = opts.restockId ? s.commerce.products.find((p) => p.id === opts.restockId) : undefined;
  // [결정 #346 → #377] 레시피가 겹치는 보충이면 이 제품의 추정을 잇는다(목록에 없던 원액이 섞이면 오차를 넓혀) — 이을 추정(carried)이 있으면 샘플이 없어도 보충 줄이 "모른다" 대신 값을 보인다
  const carried = hide && restockTarget ? restockPrior(s, restockTarget, recipeSharesOf(s, components)) : undefined;
  // 이번 배치의 아는 품질 — 병입 행동(executeBlend)과 같은 한 함수(샘플 추정 + 병입 보정량 · #346 잇기). 첫 출고가 · 보충 줄이 함께 쓴다
  const knownBatch = masked && preview?.ok ? batchQualityKnown(s, components, preview, restockTarget?.id) : undefined;
  const knownEst = knownBatch?.est ?? null;
  // 품질을 가리는 판(F5d)인가 — 옛 판 시나리오는 병입하면 공개된다. 화면의 "추정 품질"은 병입 뒤 제품에 남는 값(knownBatch)과 같게 보인다
  const hideBottled = hidesProductQuality(s);
  const shownQ = !masked ? null : hideBottled ? (knownBatch && !(est?.quality == null && !carried) ? { q: knownBatch.est, sigma: knownBatch.sigma } : null) : est?.quality != null ? { q: est.quality, sigma: est.sigma } : null;
  // 면세 한정판 예상 판매 (결정 #87) — 이번 달 면세 수요(권장 출고가)로 완판 기한 안에 몇 병 팔릴지
  const dfForecast = (() => {
    if (masked || !preview?.ok || !preview.dfEdition || !preview.category || !preview.evaluation) return null;
    const p: Product = {
      id: 'preview', name: '', category: preview.category, ageYears: preview.ageYears, oakMonths: preview.minOakMonths, restMonths: preview.minRestMonths, abv: preview.finalAbv, bottleMl: opts.bottleMl, chillFiltered: opts.chillFilter, packagingId: opts.packagingId,
      flavor: preview.flavor, quality: preview.evaluation.quality, typicity: preview.evaluation.typicity, style: preview.evaluation.style, sourcedShare: preview.sourcedShare,
      stockBottles: preview.bottles, price: preview.suggestedPrice, unitCost: preview.unitCost, createdMonth: s.month, lastMonthSold: 0, totalSold: 0,
      dutyFreeOnly: true, localIngredient: preview.localIngredient, dfEdition: preview.dfEdition,
    };
    const same = s.commerce.products.filter((x) => x.stockBottles > 0 && x.category === p.category).length + 1;
    const perMonth = productDutyFreeDemand(s, p, same, calendar(s).monthOfYear);
    return { perMonth, window: perMonth * DUTY_FREE.sellOutMonths };
  })();
  // 병입 재고 경고 (#178, 1차 MVP 플레이테스트: 소주 15,271병 = 판매 186개월 치를 병입해 현금이 묶였다) —
  // 병입 뒤 그 분류 재고가 최근 판매(없으면 이번 달 수요 근사)로 몇 개월 치인가. 12개월 넘으면 한 번 더 눌러야 병입된다. 면세 한정판은 위 예상 면세 판매로 따로 본다
  const stock = (() => {
    if (!preview?.ok || !preview.category || preview.dfEdition) return null;
    const quality = masked ? (est?.quality ?? 50) : (preview.evaluation?.quality ?? 50);
    // 새 제품 첫 값 = 기준가 × 기본 정책 배수 n (B1-4) — 병입하면 이 값으로 나온다
    const price = defaultPolicyPrice(masked ? (priceAtQuality(s, preview, opts, knownEst ?? quality) ?? preview.suggestedPrice) : preview.suggestedPrice);
    const p: Product = {
      id: 'preview', name: '', category: preview.category, ageYears: preview.ageYears, oakMonths: preview.minOakMonths, restMonths: preview.minRestMonths, abv: preview.finalAbv, bottleMl: opts.bottleMl, chillFiltered: opts.chillFilter, packagingId: opts.packagingId,
      flavor: preview.flavor, quality, typicity: preview.evaluation?.typicity ?? 50, style: preview.evaluation?.style ?? null, sourcedShare: preview.sourcedShare,
      stockBottles: preview.bottles, price, unitCost: preview.unitCost, createdMonth: s.month, lastMonthSold: 0, totalSold: 0, localIngredient: preview.localIngredient,
    };
    const same = s.commerce.products.filter((x) => x.stockBottles > 0 && x.category === p.category).length + 1;
    const guess = demandFor(s, p, same, calendar(s).monthOfYear).demandBottles;
    return stockMonthsAfter(s, preview.category, preview.bottles, guess);
  })();
  // 보충할 제품의 재고 적체 (9차 64개월 중간 기록 — PM 2026-11-24): 분류 재고 줄은 오크소주 3,767병 보충을 "증류식 소주 4.7개월 치"로만 보였다.
  // 시장은 제품마다 재고 ÷ 판매 속도(salesEma)가 6개월을 넘으면 수요를 줄인다(overhangFactor, 하한 ×0.6) → 같은 함수로 지금 · 보충 뒤 배수를 보인다(판매 셈과 같은 값)
  const restockStock = (() => {
    if (!restockTarget || !preview?.ok || !(restockTarget.salesEma && restockTarget.salesEma > 0)) return null;
    const rate = restockTarget.salesEma;
    const after = { ...restockTarget, stockBottles: restockTarget.stockBottles + preview.bottles };
    return { rate, before: restockTarget.stockBottles / rate, after: after.stockBottles / rate, fNow: overhangFactor(restockTarget, s.month), fAfter: overhangFactor(after, s.month) };
  })();
  const strongStock = (!!stock && stock.months > STOCK_STRONG_WARN_MONTHS) || (!!restockStock && restockStock.after > STOCK_STRONG_WARN_MONTHS);
  /** 두 번 눌러야 병입하는가 — 재고 과다 또는 아는 오염 통(#365) */
  const confirmNeeded = strongStock || guardedPicked.contaminated.length > 0 || taintedPicked.length > 0;
  // 두 번 눌러 확인 — 고른 원액·옵션이 바뀌면 다시 묻는다
  const blendKey = JSON.stringify([components, opts]);
  const [armed, setArmed] = useState<string | null>(null);
  const isArmed = armed === blendKey;
  const toggle = (key: string, vol: number) => {
    // 첫 원액을 고르면 그 분류만 보이게
    if (cat === '전체' && !Object.keys(picked).length) { const x = sources.find((y) => y.key === key); if (x) setCat(sourceCategory(x.lot, minMonths)); }
    // 첫 원액을 고를 때 병·도수를 그 주종의 표준 병으로 (화면 진행 메모 A5 — 레시피 화면 "한 병에 얼마 남나"·봇과 같은 STANDARD_BOTTLE).
    // 소주는 375ml·25%, 그 밖(위스키 등)은 700ml·40%. 손으로 바꾼 뒤(touched)나 재고 보충 중이면 건드리지 않는다
    if (!Object.keys(picked).length && !opts.restockId && !touched.current) {
      const x = sources.find((y) => y.key === key);
      const std = x?.lot.kind === 'soju' ? STANDARD_BOTTLE.soju : STANDARD_BOTTLE.whisky;
      if (x && (opts.bottleMl !== std.bottleMl || opts.targetAbv !== std.abv)) setOpts({ ...opts, bottleMl: std.bottleMl, targetAbv: std.abv });
    }
    setPicked((p) => { const n = { ...p }; if (n[key] != null) delete n[key]; else n[key] = Math.floor(vol * 10) / 10; return n; });
  };

  // ── 블렌딩 그래프: 지금 블렌드(채움) · 직전 선택(점선) · 원액별 선 (플레이테스트 2026-11-07: 선택에 따른 향미 변동을 그래프로) ──
  // 몰트·그레인은 위스키 육각형, 그 밖은 주종 레이더 축. 시나리오 게임의 캐스크는 샘플 기록(모르면 선이 없다)
  const chart = useMemo(() => {
    if (!preview?.category) return null;
    const pickedRows = sources.filter((x) => picked[x.key] != null && picked[x.key]! > 0);
    const hexMode = pickedRows.every((x) => x.lot.kind === 'malt' || x.lot.kind === 'grain');
    const axesOf = (f: Parameters<typeof hexOf>[0]): ProfileAxis[] => hexMode
      ? (() => { const h = hexOf(f); return HEX_AXES.map((a) => ({ id: a, label: HEX_LABEL[a], value: h[a] })); })()
      : CATEGORY[preview.category!].radarAxes.map((a) => ({ id: a, label: AXIS[a].nameKo, value: f[a] ?? 0 }));
    const total = pickedRows.reduce((t, x) => t + picked[x.key]! * x.lot.abv, 0) || 1;
    const layers = pickedRows.flatMap((x, i) => {
      const share = (picked[x.key]! * x.lot.abv) / total;
      const label = `${x.lot.name.split(' → ')[0]}${x.cask ? ` · ${caskShort(x.cask.typeId)} ${x.cask.fills}필 (${x.id})` : ''}`;
      let axes: ProfileAxis[] | null;
      if (hide && x.source === 'cask') {
        const k = known?.get(x.id);
        axes = !k ? null
          : hexMode ? HEX_AXES.map((a) => ({ id: a, label: HEX_LABEL[a], value: k.hex[a] }))
          // 소주·진·고량주: 샘플 기록의 레이더 축 읽기 (#183). 옛 기록(축 없음)은 선을 못 그린다
          : k.axes ? CATEGORY[preview.category!].radarAxes.map((a) => ({ id: a, label: AXIS[a].nameKo, value: k.axes![a] ?? 0 })) : null;
      } else axes = axesOf(x.lot.flavor);
      return [{ axes, color: LAYER_COLORS[i % LAYER_COLORS.length]!, label, share }];
    });
    const blend: ProfileAxis[] | null = masked
      ? (hexMode
        ? (est?.hex ? HEX_AXES.map((a) => ({ id: a, label: HEX_LABEL[a], value: est.hex![a] })) : null)
        : (est?.axes ? CATEGORY[preview.category!].radarAxes.map((a) => ({ id: a, label: AXIS[a].nameKo, value: est.axes![a] ?? 0 })) : null))
      : axesOf(preview.flavor);
    const sig = pickedRows.map((x) => `${x.key}:${picked[x.key]}`).join('|');
    return { blend, layers, sig };
  }, [preview, sources, picked, hide, known, masked, est]);
  // 직전 선택의 블렌드 — 고른 원액·양이 바뀔 때마다 한 칸 밀린다
  const lastRef = useRef<{ sig: string; blend: ProfileAxis[] | null }>({ sig: '', blend: null });
  const [prevBlend, setPrevBlend] = useState<ProfileAxis[] | null>(null);
  useEffect(() => {
    if (!chart || chart.sig === lastRef.current.sig) return;
    setPrevBlend(lastRef.current.blend);
    lastRef.current = { sig: chart.sig, blend: chart.blend };
  }, [chart]);
  const delta = chart?.blend && prevBlend && prevBlend.length === chart.blend.length
    ? chart.blend.map((a, i) => ({ label: a.label, d: a.value - prevBlend[i]!.value })).filter((x) => Math.abs(x.d) >= 1).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3)
    : [];
  const abvValue = opts.targetAbv === 'cask' ? 'cask' : String(opts.targetAbv);
  // 재고 보충 대상 (#186) — 고른 원액과 같은 범주 제품을 앞에
  // 보충 대상이 판매 목록에서 빠졌으면(보관 처리) 새 제품으로 돌아간다
  useEffect(() => { if (opts.restockId && !restockTarget) setOpts((o) => ({ ...o, restockId: undefined })); }, [opts.restockId, restockTarget]);
  const restockChoices = restockable(s).filter((p) => !preview?.category || p.category === preview.category);
  // 캐스크 스트렝스 제품은 도수를 맞추지 않고 "캐스크 스트렝스"로 병입한다 (통마다 도수가 다르다)
  const pickRestock = (p: Product) => setOpts({ ...opts, packaging: p.packaging, restockId: p.id, name: '', bottleMl: p.bottleMl, targetAbv: isCaskStrength(p) ? 'cask' : p.abv, chillFilter: p.chillFiltered, packagingId: p.packagingId, dutyFreeOnly: false, targetId: undefined, line: undefined });
  // 보충 뒤 품질 예상 — 남은 재고와 새 병의 가중 평균(코어 `restockMix` — 병입 행동의 합치기와 같은 가중, F5d PROD 요청). 시나리오 게임은 새 원액을 병입 때 추정
  // (`bottledQualityKnown` — 기록 없는 몫은 사전값)으로, 남은 재고는 화면이 아는 품질(`knownProductQuality` — F5d 전 제품은 참값)로 섞는다
  // 남은 재고를 숨길지는 판(시나리오 = hide)으로 가른다 — masked는 "이번 원액이 통 샘플 추정인가"라 탱크 원액 보충 때 참값이 샜다(PROD 검토)
  const restockBefore = restockTarget ? (hide ? knownProductQuality(s, restockTarget) : { q: restockTarget.quality, sigma: 0 }) : null;
  const restockAfter = (() => {
    if (!restockTarget || !restockBefore || !preview?.ok || !preview.evaluation) return null;
    // 병입 행동과 같은 한 함수(batchQualityKnown — 샘플 추정 + 병입 보정량 · #346 잇기). 샘플도 이을 추정도 없으면 "모른다"
    const batch = masked ? (knownBatch && !(est?.quality == null && !carried) ? { q: knownBatch.est, sigma: knownBatch.sigma } : null) : { q: preview.evaluation.quality, sigma: 0 };
    const m = restockMix(restockBefore, restockTarget.stockBottles, batch ?? { q: 0, sigma: 0 }, preview.bottles);
    return { stock: m.stock, w: m.w, quality: batch ? m.q : null, sigma: hide ? m.sigma : 0 };
  })();

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
      {reveal && <HeritageReveal data={reveal} onClose={() => setReveal(null)} />}
      <Card title="원액 선택 (같은 주종끼리만 블렌딩)">
        {/* [결정 #410 T1-c] 12년 병입 — 적격 통과 조합 · 도수별 병 수 · 예상 품질(아는 값). 고르면 아래 원액 표와 도수가 그 조합으로 바뀐다 */}
        <AgedComboPanel onPick={(caskIds, abv) => {
          touched.current = true;
          setPicked(Object.fromEntries(caskIds.map((id) => { const c = s.inventory.casks.find((k) => k.id === id); return [`cask:${id}`, Math.floor((c?.contents?.volumeL ?? 0) * 10) / 10]; })));
          setOpts((o) => ({ ...o, targetAbv: abv, restockId: undefined }));
          setCat('전체');
        }} />
        {!!sources.length && (
          <div className="mb-2 flex flex-wrap items-center gap-1">
            {[['전체', sources.length] as [string, number], ...counts].map(([k, n]) => (
              <Button key={k} small variant={cat === k ? 'primary' : 'secondary'} onClick={() => setCat(k)}>{k} {n}</Button>
            ))}
            {caskTypes.length > 1 && (
              <span className="ml-2 inline-flex flex-wrap items-center gap-1 border-l border-stone-300 pl-2 dark:border-stone-700">
                <span className="text-xs text-stone-500">통</span>
                {(['전체', ...caskTypes] as (CaskTypeId | '전체')[]).map((t) => (
                  <Button key={t} small variant={caskType === t ? 'primary' : 'secondary'} onClick={() => setCaskType(t)}>{t === '전체' ? '전체' : `${caskShort(t)} ${byCat.filter((x) => x.cask?.typeId === t).length}`}</Button>
                ))}
              </span>
            )}
            <span className="ml-1 text-xs text-stone-500">같은 주종끼리만 섞인다 — 몰트·그레인은 섞으면 블렌디드. 숙성 중인 몰트를 섞으면 가장 어린 원액 기준으로 표기된다</span>
          </div>
        )}
        {!sources.length ? <Empty>병입할 원액이 없습니다</Empty> : (
          <Table head={['', '원액 · 위치', '주종', '보유', '도수', '숙성', '주요 향', '사용량(L)']}>
            {shown.map((x) => (
              <tr key={x.key} className={x.cask?.contaminationKnown || taintShown(x.lot) ? (picked[x.key] != null ? 'bg-rose-100 dark:bg-rose-950/50' : 'bg-rose-50 dark:bg-rose-950/20') : picked[x.key] != null ? 'bg-amber-50 dark:bg-amber-950/30' : ''}>
                <Td><input type="checkbox" checked={picked[x.key] != null} onChange={() => toggle(x.key, x.lot.volumeL)} aria-label={`${x.lot.name} 선택`} className="accent-amber-700" /></Td>
                <Td className="text-xs font-medium"><div className="w-44 truncate" title={x.lot.name}>{x.lot.name.split(' → ')[0]}</div><div className="w-44 whitespace-normal font-normal text-stone-500">{x.cask ? <span className="inline-flex flex-wrap items-center gap-1">{x.where} <CaskTag c={x.cask} /><CaskTagChips s={s} c={x.cask} reserve={reserve} /></span> : taintShown(x.lot) ? <span className="inline-flex flex-wrap items-center gap-1">{x.where} <TaintChip /></span> : x.where}</div></Td>
                <Td><Badge>{sourceCategory(x.lot, minMonths)}</Badge></Td>
                <Td right>{liters(x.lot.volumeL)}</Td>
                <Td right>{pct(x.lot.abv)}</Td>
                {/* 옹기는 오크 개월이 아니라 옹기에서 쉰 개월 (2차 플레이테스트: 옹기 소주가 "0개월"로 보였다) */}
                <Td right>{x.cask && vesselMaterial(x.cask) !== 'wood' ? `옹기 ${months(x.lot.restMonths ?? 0)}` : months(x.lot.oakMonths)}</Td>
                {/* 표가 옆으로 넘쳐 체크박스·이름이 밀려나지 않게 너비를 묶고 두 줄로 (플레이테스트 2026-11-07) */}
                <Td className="text-xs"><div className="w-40 whitespace-normal">{hide && x.source === 'cask' ? (() => {
                  const k = known?.get(x.id);
                  return k ? <span className={k.from === 'sibling' ? 'opacity-70' : ''}>{topKnown(k, x.lot.kind)}<span className="block text-stone-500">추정 {k.estQuality} · {s.month - k.month > 0 ? `${months(s.month - k.month)} 전` : '이번 달'}{k.from === 'sibling' ? ' 형제 통' : ''} 샘플</span></span> : <span className="text-stone-500">샘플 없음 — 모른다</span>;
                })() : topNotes(x.lot.flavor).map((n) => n.nameKo).join(' · ')}</div></Td>
                <Td>{picked[x.key] != null && <NumberField value={picked[x.key]!} min={0} max={Math.floor(x.lot.volumeL * 10) / 10} step={0.1} width="w-20" onCommit={(v) => setPicked((p) => ({ ...p, [x.key]: v }))} />}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="병입">
        <div className="grid gap-2">
          {/* 새 제품 / 기존 제품 재고 보충 (#186, 2차 플레이테스트 오너 요청) */}
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <Button small variant={!restockTarget ? 'primary' : 'ghost'} onClick={() => setOpts({ ...opts, restockId: undefined })}>새 제품</Button>
            <Button small variant={restockTarget ? 'primary' : 'ghost'} disabled={!restockable(s).length} title={restockable(s).length ? '이미 파는 제품의 재고에 더한다 — 이름·출고가·판매 기록을 이어 가고, 같은 범주 제품이 늘어 수요를 나눠 갖지 않는다' : '판매 중인 제품이 없다'} onClick={() => { const t0 = restockChoices[0] ?? restockable(s)[0]; if (t0) pickRestock(t0); }}>기존 제품 재고 보충</Button>
          </div>
          {restockTarget ? (
            <div className="grid gap-1">
              <Select label="보충할 제품" value={restockTarget.id} options={(restockChoices.some((p) => p.id === restockTarget.id) ? restockChoices : [restockTarget, ...restockChoices]).map((p) => ({ value: p.id, label: `${p.name} · ${p.bottleMl}ml ${Math.round(p.abv * 1000) / 10}% · 재고 ${num(p.stockBottles)}병 · 품질 ${(() => { const k = knownProductQuality(s, p); return k.public ? p.quality : `추정 ${num(k.q, 1)}${k.sigma >= 0.5 ? ` ±${num(k.sigma, 1)}` : ''}`; })()} · ${monthLabel(s.startYear, p.createdMonth)} 출시` }))} onChange={(id) => { const t1 = s.commerce.products.find((p) => p.id === id); if (t1) pickRestock(t1); }} />
              <p className="text-xs text-stone-500">병·도수·포장은 「{restockTarget.name}」과 같게 맞춘다: {restockTarget.bottleMl}ml · {isCaskStrength(restockTarget) ? `캐스크 스트렝스(지금 ${Math.round(restockTarget.abv * 1000) / 10}% — 통마다 달라 병 수로 평균)` : `${Math.round(restockTarget.abv * 1000) / 10}%`} · {restockTarget.chillFiltered ? '칠 필터링' : '논칠필터'} · {PACKAGING[restockTarget.packagingId]?.nameKo ?? restockTarget.packagingId}. 이름·출고가({won(restockTarget.price)})·판매 기록은 그대로, 품질·향·원가는 남은 재고와 새 병 수로 평균 낸다.</p>
              {/* [결정 #399 · #386 ④] 손 보충이 잦은 위스키 — 자동 납품이 있다는 것을 알린다(판매 탭 제품 줄에서 켠다 · 통 범위 · 띠 정책을 지킨다) */}
              {autoRestockHint(s, restockTarget) && (() => {
                const lo = autoRestockFloor(s, restockTarget);
                const hi = autoRestockCeiling(s, restockTarget);
                const yr = (m: number) => (m % 12 ? `${m}개월` : `${m / 12}년`);
                return <p className="text-xs text-sky-700 dark:text-sky-400">최근 12개월 손으로 {handRestockCount(s, restockTarget)}번 보충했다 — 판매 탭 이 제품 줄에서 <b>자동 납품</b>을 켜면 매달 판매 전에 {yr(lo)} 이상{hi < Infinity ? ` ~ ${yr(hi)} 이하` : ''} 통으로 알아서 채운다(어린 통부터 · 띠 정책 · 보호 태그는 지킨다).</p>;
              })()}
            </div>
          ) : (
            <>
          <TextField label="제품명" value={opts.name} onChange={(v) => setOpts({ ...opts, name: v })} width="w-full" />
          <div className="flex flex-wrap gap-2">
            <Select label="도수" value={abvValue} options={ABV_PRESETS.map((v) => ({ value: v, label: v === 'cask' ? '캐스크 스트렝스' : `${Math.round(Number(v) * 100)}%` }))} onChange={(v) => { touched.current = true; setOpts({ ...opts, targetAbv: v === 'cask' ? 'cask' : Number(v) }); }} />
            <Select label="병" value={String(opts.bottleMl)} options={BOTTLE_SIZES.map((v) => ({ value: String(v), label: `${v}ml` }))} onChange={(v) => { touched.current = true; setOpts({ ...opts, bottleMl: Number(v) }); }} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={opts.chillFilter} onChange={(e) => setOpts({ ...opts, chillFilter: e.target.checked })} className="accent-amber-700" /> 칠 필터링</label>
            {hasDutyFree(s) && <label className="inline-flex items-center gap-1 text-sm" title={`국내 판매 없이 지정면세점 전용 매대(${DUTY_FREE.slots}칸)에서만 판매. 제주 원료(차조·청귤) 기념품은 매력도 ×${DUTY_FREE.localAppeal}, 위스키는 숙성 ${DUTY_FREE.agedTiers.map((t) => `${t.years}년 ×${t.appeal}`).join(' · ')}. ${DUTY_FREE.sellOutMonths}개월 안에 완판하면 다음 판 매력도 +${Math.round(DUTY_FREE.streakAppeal * 100)}%(최대 ${DUTY_FREE.maxStreak}연속), ${DUTY_FREE.returnMonths}개월 안에 못 팔면 국내 매대로 넘어갑니다`}><input type="checkbox" checked={!!opts.dutyFreeOnly} onChange={(e) => setOpts({ ...opts, dutyFreeOnly: e.target.checked })} className="accent-amber-700" /> 면세 전용 한정판</label>}
            {/* 패키징 — 프리셋 두 개 + 직접 고르기 (#248). 재고 보충 때는 이 칸이 없고 대상 제품 패키징을 그대로 쓴다(pickRestock) */}
            <PackagingPicker opts={opts} setOpts={setOpts} />
          </div>
            </>
          )}

          {hasDutyFree(s) && opts.dutyFreeOnly && (() => {
            const blocker = dutyFreeSlotBlocker(s);
            const next = nextDutyFreeEdition(s);
            return <p className="text-xs text-stone-500">{blocker ?? `다음 판: Vol.${next.vol} · 연속 완판 ${next.streak}회 → 매력도 +${Math.round(Math.min(next.streak, DUTY_FREE.maxStreak) * DUTY_FREE.streakAppeal * 100)}% · ${DUTY_FREE.sellOutMonths}개월 안에 다 팔 수 있는 수량으로 내세요`}</p>;
          })()}
          {!preview ? <Empty>왼쪽에서 원액을 선택하세요</Empty> : (
            <div className="grid gap-2">
              {chart?.blend
                ? (
                  <div>
                    <div className="flex justify-center"><ProfileRadar draft={chart.blend} base={prevBlend ?? undefined} layers={chart.layers.filter((l) => l.axes).map((l) => ({ axes: l.axes!, color: l.color, label: l.label }))} size={300} /></div>
                    <div className="text-xs text-stone-500">채움 = 지금 블렌드 · 점선 = 직전 선택 · 색 선 = 고른 원액</div>
                    {delta.length > 0 && <div className="text-xs">직전 대비: {delta.map((x) => <span key={x.label} className={`mr-2 font-medium ${x.d > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>{x.label} {x.d > 0 ? '+' : '−'}{Math.abs(x.d).toFixed(0)}</span>)}</div>}
                    <ul className="mt-1 grid gap-0.5 text-xs">
                      {chart.layers.map((l) => (
                        <li key={l.label} className="flex items-center gap-1.5">
                          <span className="inline-block h-0.5 w-4 shrink-0" style={{ background: l.color }} />
                          <span className="min-w-0 flex-1 truncate">{l.label}</span>
                          <span className="tabular-nums text-stone-500">{pct(l.share, 0)}{!l.axes ? ' · 샘플 없음' : ''}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
                : masked
                  ? <Empty>{est?.quality != null
                    // 기록은 있는데 그래프 축이 없다 = 소주·진의 옛 샘플 기록(위스키 육각형만 남았다)
                    ? '이 원액의 샘플 기록에 향 그래프용 읽기가 없다(이전 버전에서 뜬 기록) — 다시 샘플을 뜨면 그래프가 나온다. 추정 품질은 아래에 있다'
                    : '고른 캐스크에 샘플 기록이 없다 — 증류소 탭 아래쪽 "숙성 중인 캐스크"에서 통을 골라 샘플을 떠야 향·품질을 안다'}</Empty>
                  : preview.category && <Radar flavor={preview.flavor} axes={CATEGORY[preview.category].radarAxes} size={240} />}
              {masked && <p className="text-xs text-stone-500">샘플 기록으로 추정한 향·품질·출고가{hideBottled ? '' : ' 범위'}다{est && est.unknownShare >= 0.05 ? ` — 기록 없는 원액 ${pct(est.unknownShare, 0)}는 ${hideBottled ? '사전값(큰 오차)으로 섞었다' : '추정에서 빠졌다'}` : ''}. {hideBottled ? '병입해도 참 품질은 보이지 않는다 — 제품 품질은 이 추정으로 시작해 팔린 뒤 리뷰로 좁혀진다.' : '실제 향·품질·권장 출고가는 병입하면 공개된다.'}{est && est.unknownShare >= 0.05 ? ' 샘플은 증류소 탭 아래쪽 "숙성 중인 캐스크"에서 뜬다(통 골라 샘플, 1회 3만 원).' : ''}</p>}
              <div className="flex flex-wrap gap-1">
                {preview.category && <Badge tone="info">{CATEGORY[preview.category].nameKo}</Badge>}
                {preview.ageYears != null && <Badge tone="good">{preview.ageYears}년</Badge>}
                {preview.agedLabel && <Badge tone="good">{preview.agedLabel}</Badge>}
                {!masked && preview.evaluation?.style && <Badge>{preview.evaluation.style}</Badge>}
                {preview.finish && <Badge tone={newFinishShort(s, preview) ? 'warn' : 'good'}>{finishLabel(preview.finish)}{preview.finishMonths != null ? ` ${preview.finishMonths}개월` : ''}</Badge>}
                {preview.sourcedShare > 0 && <Badge tone="warn">매입 원액 {pct(preview.sourcedShare, 0)} · 브랜드 가치 {Math.round(preview.sourcedPrestige * 100)}</Badge>}
                {preview.premiumLabel && <Badge tone="good">{regionOf(s).whisky.premiumLabel?.name}</Badge>}
                {preview.traditional && <Badge tone="good">{regionOf(s).traditionalRelief?.label}</Badge>}
                {preview.specialty && <Badge tone="good">{regionOf(s).specialties?.find((x) => x.id === preview.specialty)?.label}</Badge>}
                {preview.localIngredient && hasDutyFree(s) && <Badge tone="good">제주 원료</Badge>}
                {preview.dfEdition && !preview.localIngredient && dutyFreeAgedAppeal(preview.ageYears) > 1 && <Badge tone="good">숙성 한정 · 수요 ×{dutyFreeAgedAppeal(preview.ageYears)}</Badge>}
                {preview.dfEdition && <Badge tone="info">면세 한정판 Vol.{preview.dfEdition.vol}</Badge>}
              </div>
              {/* [결정 #362] 새 제품 — 피니시 표기는 붙지만 피니시 통에 3개월(MKT 문턱) 미만 머물러 표기 효과가 없다(보충 쪽 경고는 보충 줄) */}
              {!restockTarget && (() => {
                const short = newFinishShort(s, preview);
                return short ? <p className="text-xs text-amber-800 dark:text-amber-300">⚠ 피니시 통에서 {short.months}개월 — {short.min}개월 미만이라 「{finishLabel(preview.finish!)}」 표기는 붙지만 표기 효과(매력도 · 기대 가격)는 없다. 피니시 통에 {short.min}개월 이상 둔 뒤 병입하면 켜진다</p> : null;
              })()}
              <dl className="grid grid-cols-2 gap-x-2 text-sm">
                <dt className="text-stone-500">병 수</dt><dd className="text-right tabular-nums">{num(preview.bottles)}병</dd>
                <dt className="text-stone-500">도수</dt><dd className="text-right tabular-nums">{pct(preview.finalAbv)} (원액 {pct(preview.mixAbv)})</dd>
                {masked
                  ? <><dt className="text-stone-500" title={hideBottled ? '병입하면 제품에 남는 추정 — 샘플 추정에 병입 공정(희석·여과) 몫을 더하고, 기록 없는 원액은 사전값으로 섞는다' : undefined}>추정 품질</dt><dd className="text-right tabular-nums">{shownQ ? `${num(shownQ.q, 1)} ±${num(shownQ.sigma, 1)}` : '모른다'}</dd></>
                  : <><dt className="text-stone-500">품질 / 전형성</dt><dd className="text-right tabular-nums">{preview.evaluation?.quality ?? '—'} / {preview.evaluation?.typicity ?? '—'}</dd></>}
                <dt className="text-stone-500">병당 원가</dt><dd className="text-right tabular-nums">{won(preview.unitCost)}</dd>
                <dt className="text-stone-500" title={`병입하면 이 값으로 나온다 = 기준가(기대 소비자가에 맞춘 출고가) × ${DEFAULT_POLICY_N}(기본 정책). 면세 한정판은 기준가 그대로`}>{masked ? '예상 첫 출고가' : '첫 출고가'}</dt><dd className="text-right tabular-nums">{masked ? (() => {
                  // F5d: 첫 출고가는 병입 행동(executeBlend firstBase)과 같은 한 값 — 아는 품질 추정의 기준가 × 기본 정책
                  if (hideBottled && knownEst != null) {
                    const base = priceAtQuality(s, preview, opts, knownEst);
                    return base != null ? <>{won(defaultPolicyPrice(base))}{est?.quality == null && !carried && <span className="block text-xs text-stone-500">샘플 없음 — 사전값 추정 기준</span>}</> : '병입 후 정해짐';
                  }
                  // 옛 판: 추정 품질 ± 오차로 매긴 범위 (#172) — 참 출고가는 병입하면 정해진다
                  if (est?.quality == null) return '모른다 — 샘플 필요';
                  const lo = priceAtQuality(s, preview, opts, Math.max(0, est.quality - est.sigma));
                  const hi = priceAtQuality(s, preview, opts, Math.min(100, est.quality + est.sigma));
                  return lo != null && hi != null ? `${won(defaultPolicyPrice(lo))} ~ ${won(defaultPolicyPrice(hi))}` : '병입 후 공개';
                })() : preview.dfEdition ? <>{won(preview.suggestedPrice)} (면세 기준)</> : <>{won(defaultPolicyPrice(preview.suggestedPrice))}<span className="block text-xs text-stone-500">기준가 {won(preview.suggestedPrice)} × {DEFAULT_POLICY_N}(기본 정책)</span></>}</dd>
                {preview.category && isWhiskyCategory(preview.category) && <><dt className="text-stone-500" title="권장 출고가와 매력도에 같이 곱한다. 3년 = ×1.18, 그 뒤는 원액 시가와 같은 속도로 오른다(18년 상한)">숙성 프리미엄</dt><dd className="text-right tabular-nums">×{agePerception(preview.minOakMonths, preview.category).toFixed(2)}</dd></>}
                {preview.agedLabel && preview.category && <><dt className="text-stone-500" title="옹기·오크에서 6개월 이상 쉰 증류식 소주·고량주 — 권장 출고가와 매력도에 같이 곱한다. 1년 +0.08, 3년 상한 ×1.24 (#217)">숙성 표기 프리미엄</dt><dd className="text-right tabular-nums">×{agedWhitePerception(preview.category, preview.minOakMonths, preview.minRestMonths).toFixed(2)}</dd></>}
                {dfForecast && <><dt className="text-stone-500">예상 면세 판매</dt><dd className={`text-right tabular-nums ${dfForecast.window < preview.bottles ? 'text-amber-800 dark:text-amber-300' : ''}`}>월 {num(dfForecast.perMonth)}병 · {DUTY_FREE.sellOutMonths}개월 {num(dfForecast.window)}병</dd></>}
              </dl>
              {/* [결정 #426] 캐스크 스트렝스 — 46%로 냈다면(막지 않음 · 아는 값만: 품질은 위 품질 칸과 같은 규칙, 기준 값은 같은 품질로 견준다) */}
              {opts.targetAbv === 'cask' && (() => {
                const r = caskStrengthCompare(s, components, opts);
                if (!r) return null;
                const sign = (x: number, d = 0) => `${x >= 0 ? '+' : '−'}${num(Math.abs(x), d)}`;
                const parts = [
                  r.qualityDelta != null ? `${masked ? '추정 ' : ''}품질 ${sign(r.qualityDelta, 1)}` : null,
                  `병 ${sign(r.bottlesDelta)}(${num(r.bottles)} → ${num(r.bottles + r.bottlesDelta)}병)`,
                  r.priceRatio != null ? `병당 기준 값 ${sign((r.priceRatio - 1) * 100)}%` : null,
                ].filter(Boolean);
                return <p className="text-xs text-stone-600 dark:text-stone-400" title="캐스크 스트렝스는 물을 타지 않아 거친 맛이 남고(품질 ↓) 병 수가 적다(도수 비만큼). 병당 기준 값은 도수에 따라 오르지만 캐스크 스트렝스 표기 자체에 붙는 값 보상은 없다">캐스크 스트렝스 {pct(r.abv)} — {Math.round(CS_COMPARE_ABV * 100)}%로 내면 {parts.join(' · ')}</p>;
              })()}
              {preview.dfEdition && !preview.localIngredient && dutyFreeAgedAppeal(preview.ageYears) > 1 && <p className="text-xs text-stone-500">숙성 한정판 보너스는 수요만 올립니다. 숙성 연수에 따른 값은 권장 출고가의 숙성 프리미엄에 이미 들어 있습니다</p>}
              {dfForecast && dfForecast.window < preview.bottles && <p className="text-xs text-amber-800 dark:text-amber-300">⚠ 이번 달 수요(계절·인지도 반영)로는 {DUTY_FREE.sellOutMonths}개월 안에 {num(preview.bottles)}병을 다 팔기 어렵습니다 — 사용량을 줄이면 완판 보너스를 노릴 수 있습니다</p>}
              {preview.warnings.map((w) => <p key={w} className="text-xs text-amber-800 dark:text-amber-300">⚠ {w}</p>)}
              {preview.errors.map((e) => <p key={e} className="text-xs text-rose-700 dark:text-rose-400">✕ {e}</p>)}
              {/* 같은 주종 제품 수 — 제품이 하나뿐이면 그 주종 수요가 가장 작다(1개 1.00 · 2개 1.26 · 3개 1.44배). 한 제품만 계속 보충하면
                  사람형 봇 8/8 파산, 2~3개로 나누면 0/8 (2026-11-08 실험). 4개부터는 거의 안 는다 */}
              {preview.category && !preview.dfEdition && (() => {
                const n = s.commerce.products.filter((p) => p.category === preview.category && p.stockBottles > 0 && !p.dutyFreeOnly).length;
                const after = restockTarget || n >= 3 ? n : n + 1;
                const tot = (k: number) => (k * skuSplitEqual(k)).toFixed(2);
                if (restockTarget && n <= 1) return <p className="text-xs text-amber-800 dark:text-amber-300">⚠ 판매 중인 {CATEGORY[preview.category].nameKo} 제품이 이것 하나뿐입니다 — 제품이 하나면 그 주종 수요가 가장 작습니다. 이번 원액을 <b>새 제품</b>으로 내면 주종 전체 수요가 ×{tot(1)} → ×{tot(2)}가 됩니다(2~3개가 적당, 4개부터는 거의 안 는다)</p>;
                if (!restockTarget && n < 3) return <p className="text-xs text-stone-500">판매 중인 {CATEGORY[preview.category].nameKo} 제품 {n}개 → {after}개: 주종 전체 수요 ×{tot(Math.max(1, n))} → ×{tot(after)} (같은 주종은 2~3개가 적당)</p>;
                if (!restockTarget && n >= 3) return <p className="text-xs text-stone-500">판매 중인 {CATEGORY[preview.category].nameKo} 제품이 이미 {n}개 — 더 늘려도 수요가 거의 안 는다(×{tot(n)} → ×{tot(n + 1)}). <b>기존 제품 재고 보충</b>을 권한다</p>;
                return null;
              })()}
              {restockTarget && restockAfter && (
                <p className="rounded-md bg-sky-50 px-2 py-1 text-xs text-sky-900 dark:bg-sky-950 dark:text-sky-100">
                  보충 뒤 「{restockTarget.name}」: 재고 {num(restockTarget.stockBottles)} → <b>{num(restockAfter.stock)}병</b> · 품질 {num(restockBefore!.q, 1)}{restockBefore!.sigma >= 0.5 ? ` ±${num(restockBefore!.sigma, 1)}` : ''} → <b>{restockAfter.quality == null ? '모른다(샘플 필요)' : `${num(restockAfter.quality, 1)}${restockAfter.sigma >= 0.5 ? ` ±${num(restockAfter.sigma, 1)}` : ''}`}</b> (새 병 비중 {pct(restockAfter.w, 0)}) · 출고가 {won(restockTarget.price)} 그대로
                  {(() => {
                    // 출고가는 자동으로 안 바뀐다 — 새 배치가 더 비싸게 팔릴 술이면 알려 준다 (숙성 연수·품질이 오르면 권장가가 오른다)
                    const base = masked ? (knownEst != null ? priceAtQuality(s, preview, opts, knownEst) : null) : preview.suggestedPrice;
                    const sug = base != null ? defaultPolicyPrice(base) : null; // 기본 정책 가격(B1-4)과 비교
                    return sug != null && sug > restockTarget.price * 1.1
                      ? <span className="block font-medium">새 배치 {masked ? '예상' : '권장'} 출고가 ≈ {won(sug)} — 지금 출고가보다 높다. 보충 뒤 판매 화면에서 값을 올리세요{preview.ageYears != null && restockTarget.ageYears != null && preview.ageYears > restockTarget.ageYears ? ` (숙성 ${restockTarget.ageYears}년 → ${preview.ageYears}년)` : ''}</span>
                      : null;
                  })()}
                  {/* [P-ARCH-84 → 결정 #377] 보충 잇기 — 겹치는 레시피가 없으면 리뷰로 좁힌 추정을 잇지 않고, 목록에 없던 원액이 섞이면 잇되 오차를 넓힌다는 것을 미리 알린다
                      (9차: 「블랜디드 퍼스트 배치」가 레시피 일부만 같은 보충 뒤 리뷰 0 · ±12.4 — #377로 부분집합은 잇는다) */}
                  {hideBottled && masked && restockBefore && (() => {
                    const k = knownProductQuality(s, restockTarget);
                    if (k.reviews <= 0) return null;
                    if (!carried) return <span className="block text-amber-800 dark:text-amber-300">이 제품과 겹치는 원액 레시피가 없어 리뷰 {k.reviews}건으로 좁힌 추정을 잇지 않는다 — 보충 뒤 새 병 몫은 「병입 때」 추정{knownBatch ? `(±${num(knownBatch.sigma, 1)})` : ''}으로 다시 시작</span>;
                    if (carried.newShare <= 0) return null;
                    return <span className="block text-stone-600 dark:text-stone-400" title="새 몫은 샘플 없는 원액과 같은 오차로 본다 — 추정값은 그대로, 리뷰 수도 잇는다. 리뷰가 쌓이면 다시 좁혀진다">이 제품 목록에 없던 원액 레시피가 {num(carried.newShare * 100, 0)}% 섞인다 — 리뷰 {k.reviews}건 추정을 잇되 오차를 넓힌다(±{num(Math.max(k.sigma, RESTOCK_PRIOR_SIGMA_FLOOR), 1)} → ±{num(carried.sigma, 1)})</span>;
                  })()}
                  {/* [결정 #362] 보충하면 피니시 표기 효과(매력도 · 기대 가격 ×1.08 · 럭셔리)가 꺼지는가 — 보충 뒤 피니시 개월은 매대에 섞이는 병 중 짧은 쪽(MKT 문턱 FINISH_EFFECT_MIN_MONTHS) */}
                  {(() => {
                    const off = restockFinishOff(restockTarget, preview.finishMonths);
                    return off ? <span className="block font-medium text-amber-800 dark:text-amber-300">⚠ 보충 뒤 피니시 {off.before}개월 → <b>{off.after}개월</b> — {off.min}개월 미만이라 「{finishLabel(restockTarget.finish!)}」 표기 효과(매력도 · 기대 가격)가 꺼진다. 피니시 통에서 {off.min}개월 이상 쉰 원액으로 보충하세요(새 배치가 {off.min}개월 미만이면 재고를 다 판 뒤에도 꺼진다)</span> : null;
                  })()}
                  {restockStock && (
                    <span title="판매 평균의 6개월 치를 넘게 쌓이면 할인 이미지로 수요가 줄어든다(최저 ×0.6). 재고를 줄이면 돌아온다 — 판매 화면 「재고 n개월 치 · 수요 ×f」와 같은 셈(MKT)" className={`block ${restockStock.after > STOCK_STRONG_WARN_MONTHS ? 'font-medium text-rose-700 dark:text-rose-400' : restockStock.after > STOCK_WARN_MONTHS ? 'text-amber-800 dark:text-amber-300' : ''}`}>
                      {restockStock.after > STOCK_WARN_MONTHS ? '⚠ ' : ''}이 제품 재고 {num(restockStock.before, 1)}개월 치 → 보충 뒤 <b>{num(restockStock.after, 1)}개월 치</b>(이 제품 판매 속도 월 {num(restockStock.rate)}병)
                      {restockStock.fAfter < 1 || restockStock.fNow < 1
                        ? <> · {STOCK_WARN_MONTHS}개월 치를 넘게 쌓이면 이 제품 수요가 줄어든다 — 지금 ×{restockStock.fNow.toFixed(2)} → 보충 뒤 <b>×{restockStock.fAfter.toFixed(2)}</b></>
                        : <> · {STOCK_WARN_MONTHS}개월 치를 넘게 쌓이면 이 제품 수요가 줄어든다</>}
                    </span>
                  )}
                  {restockStock && restockStock.after > STOCK_WARN_MONTHS && preview.bottles > 0 && (() => {
                    // 보충도 "n개월 치만" — 분류가 아니라 이 제품 판매 속도로 맞춘다(분류 맞추기 줄은 보충일 때 숨는다). 고른 원액의 사용량을 같은 비율로 줄인다
                    const fit = (n: number) => {
                      const k = Math.max(0, n * restockStock.rate - restockTarget.stockBottles) / preview.bottles;
                      setPicked((p) => Object.fromEntries(Object.entries(p).map(([key, l]) => [key, Math.floor(l * k * 10) / 10])));
                    };
                    return (
                      <span className="mt-0.5 flex flex-wrap items-center gap-1">
                        보충 뒤 이 제품 재고를
                        {[3, 6].map((n) => {
                          const full = restockTarget.stockBottles >= n * restockStock.rate;
                          return <Button key={n} small variant="ghost" disabled={full} title={full ? `이미 ${n}개월 치 넘게 재고가 있다 — 지금은 보충하지 않아도 된다` : `사용량을 줄여 보충 뒤 이 제품 재고가 ${n}개월 치가 되게`} onClick={() => fit(n)}>{n}개월 치</Button>;
                        })}
                        로 맞추기
                      </span>
                    );
                  })()}
                </p>
              )}
              {stock && (
                <p className={`text-xs ${stock.months > STOCK_STRONG_WARN_MONTHS ? 'font-medium text-rose-700 dark:text-rose-400' : stock.months > STOCK_WARN_MONTHS ? 'text-amber-800 dark:text-amber-300' : 'text-stone-500'}`}>
                  {stock.months > STOCK_WARN_MONTHS ? '⚠ ' : ''}병입 뒤 {CATEGORY[preview.category!].nameKo} 재고 ≈ <b>{Number.isFinite(stock.months) ? `${num(stock.months, 1)}개월 치` : '팔리지 않음'}</b>
                  {' '}({stock.basis === 'sales' ? `최근 수요 월 ${num(stock.monthly)}병 기준(재고가 있던 달 — 못 판 몫 포함)` : `아직 판매 기록 없음 — 이번 달 수요 근사 월 ${num(stock.monthly)}병 기준`})
                  {stock.months > STOCK_STRONG_WARN_MONTHS
                    ? ` — 1년 넘게 팔아야 하는 양입니다. 병값·병입 인건비가 지금 나가고 재고 ${STOCK_WARN_MONTHS}개월 치를 넘으면 할인 이미지로 수요가 줄어듭니다. 사용량을 줄여 나눠 병입하세요`
                    : stock.months > STOCK_WARN_MONTHS ? ` — ${STOCK_WARN_MONTHS}개월 치를 넘으면 할인 이미지로 수요가 줄어듭니다` : ''}
                </p>
              )}
              {stock && stock.monthly > 0 && preview.bottles > 0 && !opts.restockId && (() => {
                // n개월 치만 병입 (화면 진행 메모 A6) — 경고는 개월·병인데 입력은 L라 환산을 플레이어가 했다. 고른 원액의 사용량을 같은 비율로 줄여
                // 병입 뒤 그 분류 재고가 n개월 치가 되게 맞춘다(병 수는 사용량에 비례 — 원액 보유량을 넘지 않는다)
                const existing = Math.max(0, stock.months * stock.monthly - preview.bottles);
                const fit = (n: number) => {
                  const want = Math.max(0, n * stock.monthly - existing);
                  const k = want / preview.bottles;
                  setPicked((p) => Object.fromEntries(Object.entries(p).map(([key, l]) => {
                    const src = sources.find((x) => x.key === key);
                    return [key, Math.min(Math.floor(l * k * 10) / 10, src ? Math.floor(src.lot.volumeL * 10) / 10 : l)];
                  })));
                };
                return (
                  <p className="flex flex-wrap items-center gap-1 text-xs text-stone-600 dark:text-stone-400">
                    병입 뒤 재고를
                    {[3, 6].map((n) => (
                      <Button key={n} small variant="ghost" disabled={existing >= n * stock.monthly} title={existing >= n * stock.monthly ? `이미 ${n}개월 치 넘게 재고가 있다` : `사용량을 줄이거나 늘려 병입 뒤 재고가 약 ${n}개월 치(월 ${num(stock.monthly)}병 기준)가 되게 맞춘다`} onClick={() => fit(n)}>{n}개월 치</Button>
                    ))}
                    로 맞추기 — 사용량(L)을 바꾼다
                  </p>
                );
              })()}
              {/* 이 병입 자체가 12년(가장 어린 원액도 목재 A 이상)이면 후보를 제대로 쓰는 것이라 알리지 않는다 */}
              {/* [결정 #380] 숙성 사다리 — 표기보다 한참 묵은 통을 쓰면 그 띠가 얼마나 비는지 보인다(9차: 3년 미만 통 39개 중 36개를 1 ~ 3년 표기 제품에 써 5 ~ 9년 띠가 3통이 됐다). 공개 값(목재 개월 · 통 수)만 · 막지 않는다 */}
              {preview.ok && (() => {
                const caskComps = components.filter((c) => c.source === 'cask' && c.liters > 0);
                const labelM = Math.floor(preview.minOakMonths / 12) * 12;
                const old = caskComps.map((c) => s.inventory.casks.find((k) => k.id === c.id)).filter((k): k is Cask & { contents: SpiritLot } => !!k && bandCask(k) && k.contents.oakMonths > labelM + LADDER_SLACK_MONTHS);
                // [결정 #410 T2-a] 표기와 무관하게 — 이 병입이 띠를 얇은 쪽(THIN_BAND_CASKS 미만)으로 만들거나 이미 얇은 띠에서 통을 비우면 알린다(9차: 「셰리 6년」이 5 ~ 9년 띠를 비웠는데 표기 + 2년 안쪽 통이라 줄이 뜨지 않았다)
                const { before, after, thinning: thinIds } = bandThinning(s, new Map(caskComps.map((c) => [c.id, c.liters])));
                const changed = AGE_BANDS.filter((b) => after[b.id].casks < before[b.id].casks);
                const thin = new Set(thinBands(after));
                const thinning = AGE_BANDS.filter((b) => thinIds.includes(b.id));
                if (!old.length && !thinning.length) return null;
                if (!old.length) return (
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300" title={`숙성 연령 띠(목재 개월): 0 ~ 2 · 3 ~ 4 · 5 ~ 9 · 10년 이상 — 더 오래된 띠에 통이 있는데 ${THIN_BAND_CASKS}통 미만이면 얇은 띠(뒤를 이을 원액이 모자란다). 통 수 · 목재 개월만 센다. 막지 않는다`}>
                    숙성 사다리 — 병입 뒤 {thinning.map((b) => `${b.label} ${before[b.id].casks} → ${after[b.id].casks}통`).join(' · ')} — {THIN_BAND_CASKS}통 아래로 얇아진다(뒤를 이을 원액)
                  </p>
                );
                const oldest = Math.max(...old.map((k) => k.contents.oakMonths));
                return (
                  <p className={`text-xs ${changed.some((b) => thin.has(b.id)) ? 'font-medium text-amber-800 dark:text-amber-300' : 'text-stone-600 dark:text-stone-400'}`} title="숙성 연령 띠(목재 개월): 0 ~ 2 · 3 ~ 4 · 5 ~ 9 · 10년 이상 — 어린 표기 제품에 오래된 통을 쓰면 값은 오르지만, 그 띠가 비면 몇 년 뒤 이을 원액이 없다. 막지는 않는다">
                    숙성 사다리 — 표기 {labelM >= 12 ? `${labelM / 12}년` : '1년 미만'} 제품에 그보다 2년 넘게 묵은 통 {old.length}개(가장 오래된 {months(oldest)})를 쓴다
                    {changed.length ? <> · 병입 뒤 {changed.map((b) => `${b.label} ${before[b.id].casks} → ${after[b.id].casks}통`).join(' · ')}</> : <> · 띠 통 수는 그대로(통이 다 비지 않는다)</>}
                    {changed.some((b) => thin.has(b.id)) && ' — 이 띠가 얇아진다(뒤를 이을 원액)'}
                  </p>
                );
              })()}
              {(() => {
                // 핸드필 지정 통을 병입에 쓰면 핸드필이 빈다 — 다음 통을 지정해야 다시 판다(9차 중간 기록 · PM 2026-11-24)
                const hf = sources.filter((x) => picked[x.key] != null && (picked[x.key] ?? 0) > 0 && x.cask?.handfill);
                if (!hf.length) return null;
                const all = hf.filter((x) => (picked[x.key] ?? 0) >= x.lot.volumeL - 0.05);
                return (
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                    ⚠ 핸드필 통 {hf.map((x) => x.id).join(' · ')}을 쓴다{all.length ? ` — ${all.map((x) => x.id).join(' · ')}은 다 써서 핸드필이 빈다. 핸드필 존에 다음 통을 지정해야 방문객 판매가 이어진다` : ' — 남은 양이 줄어 핸드필이 일찍 빈다'}
                  </p>
                );
              })()}
              {guardedPicked.candidate.length > 0 && !(preview && preview.minOakMonths >= campaignMinOakMonths(s)) && (() => {
                const need = campaignMinOakMonths(s);
                const list = guardedPicked.candidate.map((c) => `${c.id}(${c.oak >= need ? '이미 12년' : `${need - c.oak}개월 뒤 12년`})`);
                return (
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                    ⚠ 12년 후보 통 {guardedPicked.candidate.length}개를 쓴다 — {list.slice(0, 4).join(', ')}{list.length > 4 ? ` 외 ${list.length - 4}개` : ''}.
                    아직 승리(12년 싱글 몰트 첫 판매) 전이다 — 지금 쓰면 12년으로 병입할 수 있는 통이 그만큼 준다(이 병입 뒤 남는 후보 {guardedPicked.candidatesLeft}통). 막지는 않는다
                  </p>
                );
              })()}
              {(guardedPicked.reserve.length > 0 || guardedPicked.other.length > 0) && (
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                  ⚠ {guardedPicked.reserve.length ? `플래그십 예비 통 ${guardedPicked.reserve.length}개(${guardedPicked.reserve.join(', ')})` : ''}{guardedPicked.reserve.length && guardedPicked.other.length ? ' · ' : ''}{guardedPicked.other.length ? `「보호」 태그 통 ${guardedPicked.other.length}개(${guardedPicked.other.join(', ')})` : ''}를 쓴다
                  — 손으로 병입하는 것은 막지 않는다(자동 납품은 이 통을 쓰지 않는다).{guardedPicked.reserve.length ? ' 예비 통이 비면 다음으로 오래된 12년 후보가 예비가 된다' : ''}
                </p>
              )}
              {guardedPicked.contaminated.length > 0 && (
                <p role="alert" className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                  ⚠ 오염된 통 {guardedPicked.contaminated.join(', ')}을 섞는다 — 결점 향(곰팡내)이 제품에 섞여 품질이 내려간다. 막지는 않는다(한 번 더 눌러야 병입된다)
                </p>
              )}
              {taintedPicked.length > 0 && (
                <p role="alert" className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                  ⚠ 오염 원액이 섞인 원액({taintedPicked.join(', ')})을 쓴다 — 아는 오염 통에서 꺼낸 원액이라 이미 밴 결점 향(곰팡내)이 제품에 섞여 품질이 내려간다. 막지는 않는다(한 번 더 눌러야 병입된다)
                </p>
              )}
              <Button variant="primary" disabled={!preview.ok} onClick={() => {
                if (confirmNeeded && !isArmed) { setArmed(blendKey); return; }
                setArmed(null);
                const r = bottleWithHeritage(s, dispatch, components, opts); // 10년 이상·플래그십이면 연표 창 (#244)
                if (r !== false) { setPicked({}); setOpts({ ...opts, name: '' }); if (r) setReveal(r); }
              }}>{confirmNeeded ? (isArmed ? `정말 ${num(preview.bottles)}병 병입 — 한 번 더 누르면 병입합니다` : `${restockTarget ? '재고 보충' : '병입하기'} (${[guardedPicked.contaminated.length ? '오염 통' : '', taintedPicked.length ? '오염 원액' : '', strongStock ? '재고 과다' : ''].filter(Boolean).join(' · ')} — 확인 필요)`) : restockTarget ? `「${restockTarget.name}」 재고 보충` : '병입하기'}</Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

/**
 * [결정 #410 T1-c] 12년 병입 조합 비교 — 9차 판 오너: 「12년 버번 원액이 없어서」 · 「버번통이 별로 없던데?」(133개월에 버번 몰트 3통 · 샘플 77이 있었다).
 * 적격 통(목재 기준 개월 이상)을 계열 · 원액 종류로 묶어, 조합마다 도수별 병 수 · 예상 품질(병입 미리보기와 같은 아는 값)을 한눈에 보인다. 고르기만 한다 — 병입은 아래에서
 */
function AgedComboPanel({ onPick }: { onPick: (caskIds: string[], abv: number | 'cask') => void }) {
  const s = useGame((g) => g.state);
  const [open, setOpen] = useState(false);
  const v = useMemo(() => (open ? agedCombos(s) : null), [open, s]);
  const any = useMemo(() => s.inventory.casks.some((c) => bandCask(c) && c.contents.oakMonths >= campaignMinOakMonths(s) && c.contents.volumeL >= 1), [s]);
  if (!any) return null;
  const yrs = Math.floor(campaignMinOakMonths(s) / 12);
  const abvLabel = (a: number | 'cask') => (a === 'cask' ? '캐스크 도수' : `${Math.round(a * 100)}%`);
  // 물 타기 효과 — 같은 조합에서 캐스크 도수보다 40%가 몇 점 높은가(가장 큰 차). 규칙: 독한 맛(harshness)이 도수와 함께 준다
  const water = v ? Math.max(0, ...v.combos.map((c) => { const a = c.cells.find((x) => x.abv === 0.4)?.q; const b = c.cells.find((x) => x.abv === 'cask')?.q; return a != null && b != null ? a - b : 0; })) : 0;
  return (
    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs dark:border-amber-900 dark:bg-amber-950/30">
      <button type="button" className="flex w-full items-center justify-between text-left font-medium text-amber-900 dark:text-amber-200" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>{yrs}년 병입 — 적격 통과 조합 비교{!open && ' (눌러서 펼치기)'}</span><span>{open ? '▲' : '▼'}</span>
      </button>
      {open && v && (
        <div className="mt-2 grid gap-2">
          <p className="text-stone-700 dark:text-stone-300">
            목재 {v.atMonths}개월 이상 통: {v.groups.map((g) => `${CASK_FAMILY_LABEL[g.family]} ${g.kind === 'malt' ? '몰트' : '그레인'} ${g.casks}통 · ${liters(g.liters)}`).join(' / ')}
            {v.excluded > 0 && <span className="text-stone-500"> · 아는 오염 · 핸드필 통 {v.excluded}개는 뺐다</span>}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left tabular-nums">
              <thead className="text-stone-500"><tr><th className="py-0.5 pr-2 font-normal">조합</th>{AGED_COMBO_ABVS.map((a) => <th key={String(a)} className="py-0.5 pr-2 font-normal">{abvLabel(a)}</th>)}</tr></thead>
              <tbody>
                {v.combos.map((c) => (
                  <tr key={c.id} className="border-t border-amber-100 dark:border-amber-900/60">
                    <td className="py-1 pr-2">{c.label}<div className="text-stone-500">{c.caskIds.length}통 · {liters(c.liters)}</div></td>
                    {c.cells.map((x) => (
                      <td key={String(x.abv)} className="py-1 pr-2">
                        {x.q != null ? <>{x.bottles.toLocaleString()}병 · {v.known ? '예상 ' : ''}{num(x.q, 1)}{x.sigma >= 0.5 ? ` ±${num(x.sigma, 1)}` : ''}{x.ageYears != null && x.ageYears < yrs ? <span className="text-amber-800 dark:text-amber-300"> · {x.ageYears}년 표기</span> : null}</> : <span className="text-stone-400">—</span>}
                        {x.q != null && <div><Button small variant="ghost" onClick={() => onPick(c.caskIds, x.abv)} title="이 통들을 남은 양 전부 고르고 도수를 맞춘다 — 병입은 아래 병입 칸에서">고르기</Button></div>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-stone-600 dark:text-stone-400">
            {v.known ? '예상 품질은 샘플 기록으로 어림한 값(병입 미리보기와 같은 값)이다 — 샘플이 오래됐거나 없으면 오차가 크다. ' : ''}
            {water >= 1 && <>같은 통도 물을 타면 독한 맛이 줄어 예상 품질이 오른다(캐스크 도수 → 40%에서 최대 약 {Math.round(water)}점). 캐스크 도수는 병도 적다. </>}
            계열을 섞으면 맛이 평균 쪽으로 간다 — 탄닌이 센 통(「12년 감점」이 큰 통)을 많이 넣을수록 품질이 내려간다.
          </p>
        </div>
      )}
    </div>
  );
}
