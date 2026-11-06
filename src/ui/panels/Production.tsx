import { useMemo, useState } from 'react';
import { BOTANICALS, EQUIPMENT, INGREDIENTS, YEASTS } from '../../sim/content/catalog';
import {
  basePresetOf, craftPresets, equipmentCost, flavorProfile, leverEffects, leverSummary, describeLeverEffect, monthLabel, presetAsRecipe, previewBatch, stillDefOf, validateRecipe,
  type GameState, type ProfileAxis, type Recipe, type SpiritKind, type YeastId,
} from '../../sim';
import type { PresetRecipe } from '../../sim/content/presets';
import { isLocked } from '../../sim/scenario';
import { useGame } from '../../store/game';
import { logisticsMultiplier, regionOf, REGIONS, siteOf } from '../../sim/content/regions';
import { liters, num, pct, won } from '../format';
import { Badge, Button, Card, Empty, NumberField, Select, Table, Td, TextField } from '../kit';

const KIND_LABEL: Record<SpiritKind, string> = { soju: '증류식 소주·쇼추', gin: '진', malt: '몰트', grain: '그레인', baijiu: '백주(고량주)' };

export function Production() {
  return (
    <div className="grid gap-4">
      <Orders />
      <RecipeEditor />
      <Equipment />
    </div>
  );
}

function Orders() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  return (
    <Card title="월 생산 지시 (상시 — 바꿀 때까지 매달 반복)">
      <Table head={['레시피', '주종', '증류기', '배치당 산출', '배치당 원가', '원액 품질', '월 배치 수']}>
        {s.production.recipes.map((r) => {
          const p = previewBatch(s, r);
          const order = s.production.orders.find((o) => o.recipeId === r.id)?.batchesPerMonth ?? 0;
          return (
            <tr key={r.id}>
              <Td className="font-medium">{r.name}</Td>
              <Td><Badge>{KIND_LABEL[r.kind]}</Badge></Td>
              <Td className="text-xs">{stillDefOf(s, r.stillId)?.nameKo ?? '—'}</Td>
              <Td right>{p ? `${num(p.lpa, 1)} LPA · ${liters(p.volumeL)} @ ${pct(p.abv)}` : '—'}</Td>
              <Td right>{p ? won(p.cost) : '—'}</Td>
              <Td right>{p ? `${p.evaluation.quality}` : '—'}</Td>
              <Td><NumberField value={order} min={0} max={60} width="w-16" onCommit={(v) => dispatch({ type: 'setOrder', recipeId: r.id, batchesPerMonth: v })} /></Td>
            </tr>
          );
        })}
      </Table>
      <p className="mt-2 text-xs text-stone-500">원액은 매달 말 탱크에 쌓입니다. 비숙성 주종(소주·진·고량주 등)은 바로 병입할 수 있고, 몰트는 {(() => { const w = regionOf(s).whisky; return w.minMonths > 0 ? `캐스크에 통입해 ${w.minMonths}개월 이상 숙성해야 "위스키"로 판매할 수 있습니다` : w.requiresOak ? '캐스크에 넣기만 하면 바로 "위스키"로 팔 수 있지만(법정 최소 숙성 없음) 3년 미만은 어린 위스키라 값을 덜 받습니다' : '숙성 없이도 "위스키"로 팔 수 있지만(법정 최소 숙성 없음) 3년 미만은 어린 위스키라 값을 덜 받습니다'; })()} 설비·인력 한도는 대시보드의 가동 계획에서 확인하세요.</p>
    </Card>
  );
}

type Draft = Omit<Recipe, 'id'> & { id?: string };

function blankDraft(s: GameState, kind: SpiritKind): Draft {
  const stillId = s.production.equipment.find((e) => EQUIPMENT[e.catalogId]?.kind === 'still')?.id ?? '';
  const base: Draft = { name: `새 ${KIND_LABEL[kind]} 레시피`, kind, mashBill: [], botanicals: [], botanicalMethod: 'steep', yeast: 'distillers', fermentDays: 4, runs: 1, cut: { c1: 0.12, c2: 0.72 }, pressure: 'atmospheric', stillId };
  // 지역 첫 소주 프리셋의 원료·효모·발효 기간 (지역 데이터, S-3). 소주 프리셋이 없는 지역은 한국식 기본값
  if (kind === 'soju') {
    const p = regionOf(s).presets.find((x) => x.kind === 'soju') ?? REGIONS.KR.presets.find((x) => x.kind === 'soju')!;
    return { ...base, mashBill: p.mashBill.map((m) => ({ ...m })), yeast: p.yeast, fermentDays: p.fermentDays };
  }
  if (kind === 'baijiu') return { ...base, mashBill: [{ ingredientId: 'sorghum', ratio: 0.85 }, { ingredientId: 'daqu', ratio: 0.15 }], yeast: 'nuruk_native', fermentDays: 28, cut: { c1: 0.1, c2: 0.75 } };
  if (kind === 'gin') return { ...base, botanicals: [{ botanicalId: 'juniper', gramsPerL: 20 }, { botanicalId: 'coriander', gramsPerL: 6 }], fermentDays: 0, cut: { c1: 0.08, c2: 0.8 } };
  if (kind === 'grain') {
    const column = s.production.equipment.find((e) => EQUIPMENT[e.catalogId]?.kind === 'still' && (EQUIPMENT[e.catalogId] as { stillType: string }).stillType === 'column');
    return { ...base, stillId: column?.id ?? stillId, mashBill: [{ ingredientId: 'corn', ratio: 0.9 }, { ingredientId: 'malt_unpeated', ratio: 0.1 }], fermentDays: 3, runs: 1, cut: { c1: 0.05, c2: 0.95 } };
  }
  return { ...base, mashBill: [{ ingredientId: 'malt_unpeated', ratio: 1 }], runs: 2, cut: { c1: 0.15, c2: 0.72 } };
}

/** 프리셋 → 편집 초안. 증류기는 첫 증류기 (새 게임 프리셋과 같은 규칙) */
function presetDraft(s: GameState, p: PresetRecipe): Draft {
  const stillId = s.production.equipment.find((e) => EQUIPMENT[e.catalogId]?.kind === 'still')?.id ?? '';
  return { ...structuredClone(p), stillId };
}

/** 감압 증류기 / 상압(그 밖의 단식) 증류기 인스턴스 */
const stillsOf = (s: GameState) => s.production.equipment.filter((e) => EQUIPMENT[e.catalogId]?.kind === 'still');
const vacuumStillOf = (s: GameState) => stillsOf(s).find((e) => stillDefOf(s, e.id)?.vacuum);
const plainStillOf = (s: GameState) => stillsOf(s).find((e) => { const d = stillDefOf(s, e.id); return d && !d.vacuum && d.stillType !== 'column'; });

/** 향미 프로필 레이더 — 기준 프리셋(점선)과 지금 초안(채움). 뉴메이크는 값이 작아 눈금을 최댓값에 맞춘다(25 단위) */
function ProfileRadar({ base, draft, size = 230 }: { base?: ProfileAxis[]; draft: ProfileAxis[]; size?: number }) {
  const c = size / 2;
  const r = c - 34;
  const n = draft.length;
  const top = Math.min(100, Math.max(25, Math.ceil(Math.max(...draft.map((a) => a.value), ...(base ?? []).map((a) => a.value)) / 25) * 25));
  const pt = (i: number, v: number) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const k = Math.max(0, Math.min(top, v)) / top;
    return [c + Math.cos(ang) * r * k, c + Math.sin(ang) * r * k] as const;
  };
  const poly = (axes: ProfileAxis[]) => axes.map((a, i) => pt(i, a.value).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`향미 프로필 (눈금 최대 ${top})`} className="text-stone-400 dark:text-stone-600">
      {[0.25, 0.5, 0.75, 1].map((g) => <polygon key={g} points={draft.map((_, i) => pt(i, g * top).join(',')).join(' ')} fill="none" stroke="currentColor" strokeOpacity={0.35} />)}
      {draft.map((a, i) => {
        const [x, y] = pt(i, top);
        const [lx, ly] = pt(i, top * 1.28);
        return (
          <g key={a.id}>
            <line x1={c} y1={c} x2={x} y2={y} stroke="currentColor" strokeOpacity={0.3} />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-stone-600 text-[9px] dark:fill-stone-300">{a.label}</text>
          </g>
        );
      })}
      {base && <polygon points={poly(base)} className="fill-none stroke-stone-500 dark:stroke-stone-400" strokeWidth={1.2} strokeDasharray="4 3" />}
      <polygon points={poly(draft)} className="fill-amber-500/30 stroke-amber-600 dark:stroke-amber-400" strokeWidth={1.5} />
      <text x={size - 4} y={size - 4} textAnchor="end" className="fill-stone-500 text-[9px]">눈금 {top}</text>
    </svg>
  );
}

const delta = (v: number, digits = 1) => (Math.abs(v) < 0.05 ? '' : ` (${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)})`);

/**
 * 레시피 · 크래프팅 (mvp.md §1.2, 결정 #134 — P-PROD-1)
 * 프리셋으로 시작한다. "고급 설정"을 열면 주종별 레버가 보이고, 결과는 향미 프로필 + 품질 + "무엇이 무엇을 바꿨나" 한 줄.
 * 몰트·소주는 레버 화면, 그 밖의 주종(샌드박스)은 자유 편집기
 */
function RecipeEditor() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [draft, setDraft] = useState<Draft>(() => ({ ...s.production.recipes[0]! }));
  const [advanced, setAdvanced] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const errs = validateRecipe(s, { ...draft, id: draft.id ?? 'new' } as Recipe);
  const presets = useMemo(() => craftPresets(s), [s]);
  const basePreset = useMemo(() => basePresetOf(s, draft), [s, draft]);
  const result = useMemo(() => {
    if (errs.length) return null;
    const r = { ...draft, id: 'preview' } as Recipe;
    const v = previewBatch(s, r);
    if (!v) return null;
    const base = basePreset ? presetAsRecipe(s, basePreset, r) : null;
    const b = base && !validateRecipe(s, base).length ? previewBatch(s, base) : null;
    const effects = base && b ? leverEffects(s, base, r) : [];
    return { v, b, effects, profile: flavorProfile(r.kind, v.flavor), baseProfile: b ? flavorProfile(r.kind, b.flavor) : undefined };
  }, [s, draft, errs.length, basePreset]);
  const lever = draft.kind === 'malt' || draft.kind === 'soju';

  return (
    <Card
      title="레시피 · 크래프팅"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Select
            label="내 레시피" value={draft.id ?? ''}
            options={[{ value: '', label: '(새 레시피)' }, ...s.production.recipes.map((r) => ({ value: r.id, label: r.name }))]}
            onChange={(id) => { const r = s.production.recipes.find((x) => x.id === id); setDraft(r ? { ...r } : blankDraft(s, 'malt')); }}
          />
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-semibold text-stone-500">프리셋으로 시작</span>
        {presets.map((p) => <Button key={p.name} small onClick={() => setDraft(presetDraft(s, p))}>{p.name}</Button>)}
        {!s.scenario && regionOf(s).allowedKinds.map((k) => <Button key={k} small variant="ghost" onClick={() => { setDraft(blankDraft(s, k)); setAdvanced(true); }}>+ 빈 {KIND_LABEL[k]}</Button>)}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid content-start gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <TextField label="이름" value={draft.name} onChange={(v) => set({ name: v })} width="w-56" />
            <Badge tone="info">{KIND_LABEL[draft.kind]}</Badge>
            {basePreset && <span className="text-xs text-stone-500">기준 프리셋: {basePreset.name}</span>}
          </div>

          <div>
            <Button small variant={advanced ? 'secondary' : 'ghost'} onClick={() => setAdvanced((v) => !v)}>{advanced ? '▾ 고급 설정 닫기' : '▸ 고급 설정 — 원료·효모·발효·증류·컷'}</Button>
          </div>

          {advanced && (lever ? <LeverControls s={s} draft={draft} set={set} /> : <FreeControls s={s} draft={draft} set={set} />)}

          {errs.length > 0 && <ul className="list-disc pl-4 text-xs text-rose-700 dark:text-rose-400">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={errs.length > 0} onClick={() => {
              if (dispatch({ type: 'saveRecipe', recipe: draft }) && !draft.id) {
                const added = useGame.getState().state.production.recipes.at(-1);
                if (added) setDraft({ ...added });
              }
            }}>{draft.id ? '레시피 저장' : '새 레시피로 추가'}</Button>
            {draft.id && <Button onClick={() => set({ id: undefined, name: `${draft.name} (변형)` })}>복제해서 새로</Button>}
            {draft.id && <Button variant="danger" onClick={() => { dispatch({ type: 'deleteRecipe', recipeId: draft.id! }); setDraft(blankDraft(s, draft.kind)); }}>삭제</Button>}
          </div>
          {draft.id && <p className="text-xs text-stone-500">저장하면 다음 달 배치부터 바뀐 레시피로 만든다. 이미 만든 원액은 그대로다.</p>}
        </div>

        <div className="w-full lg:w-72">
          <div className="text-xs font-semibold text-stone-500">배치 1회 예상 (뉴메이크){result?.baseProfile ? ' — 점선 = 기준 프리셋' : ''}</div>
          {result ? (
            <>
              <ProfileRadar base={result.baseProfile} draft={result.profile} />
              <dl className="grid grid-cols-2 gap-x-2 text-xs">
                <dt className="text-stone-500">품질</dt><dd className="text-right font-semibold tabular-nums">{result.v.evaluation.quality}{result.b ? delta(result.v.evaluation.quality - result.b.evaluation.quality) : ''}</dd>
                <dt className="text-stone-500">이취</dt><dd className="text-right tabular-nums">{result.v.evaluation.offnotes}{result.b ? delta(result.v.evaluation.offnotes - result.b.evaluation.offnotes) : ''}</dd>
                <dt className="text-stone-500">산출</dt><dd className="text-right tabular-nums">{num(result.v.lpa, 1)} LPA{result.b && result.b.lpa > 0 ? delta((result.v.lpa / result.b.lpa - 1) * 100, 0).replace(')', '%)') : ''}</dd>
                <dt className="text-stone-500">액량·도수</dt><dd className="text-right tabular-nums">{liters(result.v.volumeL)} · {pct(result.v.abv)}</dd>
                <dt className="text-stone-500">원가</dt><dd className="text-right tabular-nums">{won(result.v.cost)}</dd>
                <dt className="text-stone-500">가까운 스타일</dt><dd className="text-right">{result.v.evaluation.style ?? '—'}</dd>
              </dl>
              {(draft.kind === 'malt' || draft.kind === 'grain') && <p className="mt-1 text-[11px] text-stone-500">위스키 육각형으로 본다 — 우디·스위트는 캐스크 숙성이 채운다. 숙성고의 샘플도 같은 여섯 축이다.</p>}
            </>
          ) : <Empty>오류를 고치면 미리보기가 표시됩니다</Empty>}
        </div>
      </div>

      {result && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100" aria-live="polite">
          <b>무엇이 무엇을 바꿨나</b> — {leverSummary(result.effects)}
          {advanced && result.effects.length > 2 && (
            <ul className="mt-1 list-disc pl-5 text-xs">{result.effects.map((e) => <li key={e.lever}>{describeLeverEffect(e)}</li>)}</ul>
          )}
          {result.effects.length > 1 && <div className="mt-1 text-[11px] opacity-80">레버마다 그것 하나만 바꿨을 때의 효과다. 레버끼리 영향을 주고받아(예: 컷 × 증류 횟수) 합이 전체 변화와 다를 수 있다.</div>}
        </div>
      )}
    </Card>
  );
}

type SetDraft = (patch: Partial<Draft>) => void;

/** 컷 포인트 — 최종 증류 회차 */
function CutSliders({ draft, set }: { draft: Draft; set: SetDraft }) {
  return (
    <div className="grid gap-1">
      <div className="text-xs font-semibold text-stone-500">컷 포인트 (최종 증류 회차) — 본류를 넓히면 수율·무게감↑, 이취↑ / 좁히면 깔끔하지만 수율↓</div>
      <label className="flex items-center gap-2 text-sm">
        <span className="w-28 text-stone-600 dark:text-stone-300">초류→본류 {draft.cut.c1.toFixed(2)}</span>
        <input type="range" min={0} max={0.4} step={0.01} value={draft.cut.c1} onChange={(e) => set({ cut: { ...draft.cut, c1: Number(e.target.value) } })} className="w-56 accent-amber-700" aria-label="초류 컷" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <span className="w-28 text-stone-600 dark:text-stone-300">본류→후류 {draft.cut.c2.toFixed(2)}</span>
        <input type="range" min={0.5} max={0.95} step={0.01} value={draft.cut.c2} onChange={(e) => set({ cut: { ...draft.cut, c2: Number(e.target.value) } })} className="w-56 accent-amber-700" aria-label="후류 컷" />
      </label>
    </div>
  );
}

/** MVP 크래프팅 레버 — 몰트: 맥아·효모·발효 기간·증류 횟수·컷 / 소주: 주원료·발효제 비율·효모·발효 기간·상압/감압·컷 (mvp.md §1.2) */
function LeverControls({ s, draft, set }: { s: GameState; draft: Draft; set: SetDraft }) {
  const siteId = siteOf(s).id;
  const usable = Object.values(INGREDIENTS).filter((i) => (i.kinds as string[]).includes(draft.kind) && (!i.sites || i.sites.includes(siteId)));
  const yeast = <Select label="효모" value={draft.yeast} options={(Object.keys(YEASTS) as YeastId[]).map((y) => ({ value: y, label: YEASTS[y].nameKo }))} onChange={(v) => set({ yeast: v })} />;
  const ferment = <NumberField label="발효 기간" value={draft.fermentDays} min={2} max={28} width="w-16" suffix="일" onCommit={(v) => set({ fermentDays: v })} />;
  const stills = stillsOf(s);
  const stillPick = stills.length > 1 && draft.pressure !== 'vacuum' && (
    <Select label="증류기" value={draft.stillId} options={stills.map((e) => ({ value: e.id, label: `${EQUIPMENT[e.catalogId]!.nameKo}${e.readyMonth > s.month ? ' (설치 중)' : ''}` }))} onChange={(v) => set({ stillId: v })} />
  );

  if (draft.kind === 'malt') {
    const mixed = draft.mashBill.length !== 1;
    const malts = usable.filter((i) => !i.starter);
    return (
      <div className="grid gap-3 rounded-md border border-stone-200 p-3 dark:border-stone-700">
        <div className="flex flex-wrap items-end gap-3">
          <Select label="맥아" value={mixed ? '__mix' : draft.mashBill[0]!.ingredientId}
            options={[...(mixed ? [{ value: '__mix', label: `직접 배합 (${draft.mashBill.length}종)` }] : []), ...malts.map((o) => ({ value: o.id, label: `${o.nameKo} — ${won(o.pricePerKg)}/kg` }))]}
            onChange={(v) => { if (v !== '__mix') set({ mashBill: [{ ingredientId: v, ratio: 1 }] }); }} />
          {yeast}
          {ferment}
          <Select label="증류 횟수" value={String(draft.runs) as '1' | '2'} options={[{ value: '1', label: '1회 (무겁고 수율↑)' }, { value: '2', label: '2회 (깔끔)' }]} onChange={(v) => set({ runs: Number(v) as 1 | 2 })} />
          {stillPick}
        </div>
        <p className="text-xs text-stone-500">맥아 = 향의 바탕(피티드는 피트, 국산은 곡물·과일). 효모·발효 기간 = 과일 에스테르(몰트는 6일을 넘기면 산미가 올라온다). 증류 횟수·컷 = 무게감과 이취의 저울.</p>
        <CutSliders draft={draft} set={set} />
      </div>
    );
  }

  // 소주: 주원료 + 발효제(누룩) 비율. 배합이 이 모양이 아니면(3종 이상) 첫 두 항목으로 읽는다
  const bases = usable.filter((i) => !i.starter);
  const starters = usable.filter((i) => i.starter);
  const main = draft.mashBill.find((m) => !INGREDIENTS[m.ingredientId]?.starter) ?? draft.mashBill[0];
  const starter = draft.mashBill.find((m) => INGREDIENTS[m.ingredientId]?.starter);
  const starterRatio = starter?.ratio ?? 0;
  const setMash = (mainId: string, starterId: string | undefined, ratio: number) =>
    set({ mashBill: starterId && ratio > 0 ? [{ ingredientId: mainId, ratio: 1 - ratio }, { ingredientId: starterId, ratio }] : [{ ingredientId: mainId, ratio: 1 }] });
  const vac = vacuumStillOf(s);
  const plain = plainStillOf(s);
  return (
    <div className="grid gap-3 rounded-md border border-stone-200 p-3 dark:border-stone-700">
      <div className="flex flex-wrap items-end gap-3">
        <Select label="주원료" value={main?.ingredientId ?? ''} options={bases.map((o) => ({ value: o.id, label: `${o.nameKo} — ${won(o.pricePerKg)}/kg` }))} onChange={(v) => setMash(v, starter?.ingredientId ?? starters[0]?.id, starterRatio)} />
        {starters.length > 0 && <Select label="발효제" value={starter?.ingredientId ?? starters[0]!.id} options={starters.map((o) => ({ value: o.id, label: o.nameKo }))} onChange={(v) => setMash(main!.ingredientId, v, starterRatio || 0.08)} />}
        {starters.length > 0 && <NumberField label="발효제 비율" value={Math.round(starterRatio * 100)} min={0} max={40} width="w-16" suffix="%" onCommit={(v) => setMash(main!.ingredientId, starter?.ingredientId ?? starters[0]!.id, v / 100)} />}
        {yeast}
        {ferment}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-semibold text-stone-500">증류 방식</span>
        <Button small variant={draft.pressure === 'atmospheric' ? 'primary' : 'secondary'} onClick={() => set({ pressure: 'atmospheric', ...(stillDefOf(s, draft.stillId)?.vacuum && plain ? { stillId: plain.id } : {}) })}>상압 — 구수함·무게감</Button>
        <Button small variant={draft.pressure === 'vacuum' ? 'primary' : 'secondary'} disabled={!vac} title={vac ? undefined : '감압 증류기가 필요합니다 — 아래 설비에서 살 수 있습니다'} onClick={() => vac && set({ pressure: 'vacuum', stillId: vac.id })}>감압 — 깔끔·과일·플로럴</Button>
        {!vac && <span className="text-xs text-stone-500">감압은 감압 증류기(설비)가 있어야 고를 수 있다</span>}
        {stillPick}
      </div>
      <p className="text-xs text-stone-500">주원료 = 향의 바탕(국산 쌀은 섬세, 가공용 쌀은 싸고 곡물 향, 고구마·보리는 개성). 누룩 비율↑ = 누룩 향↑·수율↓. 상압은 누룽지 같은 구수함, 감압은 깔끔한 과일·꽃 향.</p>
      <CutSliders draft={draft} set={set} />
    </div>
  );
}

/** 자유 편집기 (샌드박스의 진·그레인·고량주, 또는 직접 배합) — 이전 레시피 편집기 */
function FreeControls({ s, draft, set }: { s: GameState; draft: Draft; set: SetDraft }) {
  const stills = stillsOf(s);
  // 입지 전용 원료(결정 #87)는 그 입지에서만 보인다
  const siteId = siteOf(s).id;
  const ingOptions = Object.values(INGREDIENTS).filter((i) => draft.kind !== 'gin' && (i.kinds as string[]).includes(draft.kind) && (!i.sites || i.sites.includes(siteId)));
  const ratioSum = draft.mashBill.reduce((t, m) => t + m.ratio, 0);
  return (
    <div className="grid gap-3 rounded-md border border-stone-200 p-3 dark:border-stone-700">
      <div className="flex flex-wrap gap-3">
        <Select label="증류기" value={draft.stillId} options={stills.map((e) => ({ value: e.id, label: `${EQUIPMENT[e.catalogId]!.nameKo}${e.readyMonth > s.month ? ' (설치 중)' : ''}` }))} onChange={(v) => set({ stillId: v })} />
      </div>
      {draft.kind !== 'gin' ? (
        <div className="grid gap-2">
          <div className="text-xs font-semibold text-stone-500">원재료 배합 (합계 {pct(ratioSum, 0)})</div>
          {draft.mashBill.map((m, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Select value={m.ingredientId} options={ingOptions.map((o) => ({ value: o.id, label: `${o.nameKo} (${won(o.pricePerKg)}/kg)` }))} onChange={(v) => set({ mashBill: draft.mashBill.map((x, j) => (j === i ? { ...x, ingredientId: v } : x)) })} />
              <NumberField value={Math.round(m.ratio * 100)} min={0} max={100} width="w-16" suffix="%" onCommit={(v) => set({ mashBill: draft.mashBill.map((x, j) => (j === i ? { ...x, ratio: v / 100 } : x)) })} />
              <Button small variant="ghost" onClick={() => set({ mashBill: draft.mashBill.filter((_, j) => j !== i) })}>삭제</Button>
            </div>
          ))}
          <div><Button small onClick={() => set({ mashBill: [...draft.mashBill, { ingredientId: ingOptions[0]!.id, ratio: 0 }] })}>+ 원재료</Button></div>
          <div className="flex flex-wrap gap-3">
            <Select label="효모" value={draft.yeast} options={(Object.keys(YEASTS) as YeastId[]).map((y) => ({ value: y, label: YEASTS[y].nameKo }))} onChange={(v) => set({ yeast: v })} />
            <NumberField label="발효 기간" value={draft.fermentDays} min={2} max={28} width="w-16" suffix="일" onCommit={(v) => set({ fermentDays: v })} />
            <Select label="증류 횟수" value={String(draft.runs) as '1' | '2'} options={[{ value: '1', label: '1회' }, { value: '2', label: '2회' }]} onChange={(v) => set({ runs: Number(v) as 1 | 2 })} />
            {draft.kind === 'soju' && <Select label="증류 방식" value={draft.pressure} options={[{ value: 'atmospheric', label: '상압(구수)' }, { value: 'vacuum', label: '감압(깔끔)' }]} onChange={(v) => set({ pressure: v })} />}
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="text-xs font-semibold text-stone-500">보태니컬 (g/L — 주니퍼 필수, 주니퍼가 가장 강해야 "진" 표기 가능)</div>
          {draft.botanicals.map((b, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Select value={b.botanicalId} options={Object.values(BOTANICALS).filter((o) => !o.sites || o.sites.includes(siteId)).map((o) => { const k = logisticsMultiplier(o.native, s.regionId); return { value: o.id, label: `${o.nameKo}${o.native ? (k > 1 ? ` (수입 ×${k})` : ' (지역 특산)') : ''}` }; })} onChange={(v) => set({ botanicals: draft.botanicals.map((x, j) => (j === i ? { ...x, botanicalId: v } : x)) })} />
              <NumberField value={b.gramsPerL} min={0} max={60} step={0.5} width="w-16" suffix="g/L" onCommit={(v) => set({ botanicals: draft.botanicals.map((x, j) => (j === i ? { ...x, gramsPerL: v } : x)) })} />
              <Button small variant="ghost" onClick={() => set({ botanicals: draft.botanicals.filter((_, j) => j !== i) })}>삭제</Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-3">
            <Button small onClick={() => set({ botanicals: [...draft.botanicals, { botanicalId: 'lemon_peel', gramsPerL: 2 }] })}>+ 보태니컬</Button>
            <Select label="추출" value={draft.botanicalMethod} options={[{ value: 'steep', label: '침지(무게감)' }, { value: 'vapor', label: '증기 바스켓(섬세)' }]} onChange={(v) => set({ botanicalMethod: v })} />
          </div>
        </div>
      )}
      <CutSliders draft={draft} set={set} />
    </div>
  );
}

function Equipment() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  return (
    <Card title="설비">
      <div className="grid gap-4">
        <div>
          <h3 className="mb-1 text-xs font-semibold text-stone-500">보유 설비</h3>
          <Table head={['설비', '상태', '월 유지비']}>
            {s.production.equipment.map((e) => {
              const d = EQUIPMENT[e.catalogId]!;
              return (
                <tr key={e.id}>
                  <Td>{d.nameKo}</Td>
                  <Td>{e.readyMonth <= s.month ? <Badge tone="good">가동</Badge> : <Badge tone="warn">설치 중 · {monthLabel(s.startYear, e.readyMonth)}</Badge>}</Td>
                  <Td right>{won(d.maintenance)}</Td>
                </tr>
              );
            })}
          </Table>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold text-stone-500">구매</h3>
          <Table head={['설비', '사양', '가격', '설치 기간', '']}>
            {Object.values(EQUIPMENT).filter((d) => !(d.kind === 'facility' && d.regions && !d.regions.includes(s.regionId)) && !isLocked(s, `facility:${d.id}`)).map((d) => (
              <tr key={d.id}>
                <Td>{d.nameKo}</Td>
                <Td className="text-xs text-stone-500">
                  {d.kind === 'still' ? `월 ${d.runsPerMonth}회 · 환류 ${d.reflux}${d.vacuum ? ' · 감압' : ''}${d.ginBasket ? ' · 진 바스켓' : ''}` : d.kind === 'fermenter' ? `${d.capacityL.toLocaleString()}L` : d.kind === 'warehouse' ? `+${d.casks} 캐스크 · ${d.warehouseType === 'dunnage' ? '더니지' : '랙'} ${d.tiers}단` : d.kind === 'facility' ? d.note : `방문객 월 ${d.visitorsPerMonth}명 · 1인 ${won(d.spendPerVisitor)}${d.requires ? ` · ${EQUIPMENT[d.requires]?.nameKo} 필요` : ''}`}
                </Td>
                <Td right>{won(equipmentCost(s, d))}{equipmentCost(s, d) !== d.cost && <div className="text-xs text-stone-500">입지 반영 (기준 {won(d.cost)})</div>}</Td>
                <Td right>{d.leadMonths}개월</Td>
                <Td><Button small disabled={s.finance.cash < equipmentCost(s, d)} onClick={() => dispatch({ type: 'buyEquipment', catalogId: d.id })}>발주</Button></Td>
              </tr>
            ))}
          </Table>
        </div>
      </div>
    </Card>
  );
}
