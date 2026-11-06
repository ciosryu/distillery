import { useMemo, useState } from 'react';
import { BOTANICALS, EQUIPMENT, INGREDIENTS, YEASTS } from '../../sim/content/catalog';
import { CATEGORY } from '../../sim/content/categories';
import {
  bestBy, equipmentCost, evaluate, monthLabel, simulateBatch, staffOf, stillDefOf, validateRecipe,
  type FermenterType, type GameState, type ProductCategory, type Recipe, type SpiritKind, type YeastId,
} from '../../sim';
import { isLocked } from '../../sim/scenario';
import { useGame } from '../../store/game';
import { logisticsMultiplier, regionOf, REGIONS, siteOf } from '../../sim/content/regions';
import { Radar } from '../charts';
import { liters, num, pct, won } from '../format';
import { Badge, Button, Card, Empty, NumberField, Select, Table, Td, TextField } from '../kit';

const KIND_LABEL: Record<SpiritKind, string> = { soju: '증류식 소주·쇼추', gin: '진', malt: '몰트', grain: '그레인', baijiu: '백주(고량주)' };
const kindCategory = (k: SpiritKind): ProductCategory => (k === 'soju' ? 'soju_distilled' : k === 'gin' ? 'gin' : k === 'baijiu' ? 'baijiu' : 'malt_spirit');

function previewOf(s: GameState, r: Recipe) {
  const still = stillDefOf(s, r.stillId);
  if (!still) return null;
  const fermTypes = s.production.equipment.map((e) => EQUIPMENT[e.catalogId]).filter((d) => d?.kind === 'fermenter').map((d) => (d as { fermenterType: FermenterType }).fermenterType);
  const ferm: FermenterType | null = r.kind === 'gin' ? null : r.kind === 'soju' && fermTypes.includes('onggi') ? 'onggi' : fermTypes[0] ?? 'stainless';
  const b = simulateBatch(r, still, ferm, bestBy(staffOf(s, 'distiller'), 'b'), s.world.priceIndex, 0);
  return { ...b, evaluation: evaluate(b.flavor, kindCategory(r.kind)) };
}

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
          const p = previewOf(s, r);
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

function RecipeEditor() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [draft, setDraft] = useState<Draft>(() => ({ ...s.production.recipes[0]! }));
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const errs = validateRecipe(s, { ...draft, id: draft.id ?? 'new' } as Recipe);
  const preview = useMemo(() => (errs.length ? null : previewOf(s, { ...draft, id: 'preview' } as Recipe)), [s, draft, errs.length]);
  const stills = s.production.equipment.filter((e) => EQUIPMENT[e.catalogId]?.kind === 'still');
  // 입지 전용 원료(결정 #87)는 그 입지에서만 보인다
  const siteId = siteOf(s).id;
  const ingOptions = Object.values(INGREDIENTS).filter((i) => draft.kind !== 'gin' && (i.kinds as string[]).includes(draft.kind) && (!i.sites || i.sites.includes(siteId)));
  const ratioSum = draft.mashBill.reduce((t, m) => t + m.ratio, 0);

  return (
    <Card
      title="레시피 편집기"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Select
            label="불러오기" value={draft.id ?? ''}
            options={[{ value: '', label: '(새 레시피)' }, ...s.production.recipes.map((r) => ({ value: r.id, label: r.name }))]}
            onChange={(id) => { const r = s.production.recipes.find((x) => x.id === id); setDraft(r ? { ...r } : blankDraft(s, 'malt')); }}
          />
          {regionOf(s).allowedKinds.map((k) => <Button key={k} small onClick={() => setDraft(blankDraft(s, k))}>+ {KIND_LABEL[k]}</Button>)}
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-3">
            <TextField label="이름" value={draft.name} onChange={(v) => set({ name: v })} width="w-56" />
            <Badge tone="info">{KIND_LABEL[draft.kind]}</Badge>
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

          <div className="grid gap-1">
            <div className="text-xs font-semibold text-stone-500">컷 포인트 (최종 증류 회차) — 본류를 넓히면 수율·무게감↑, 이취 위험↑</div>
            <label className="flex items-center gap-2 text-sm">
              <span className="w-28 text-stone-600 dark:text-stone-300">초류→본류 {draft.cut.c1.toFixed(2)}</span>
              <input type="range" min={0} max={0.4} step={0.01} value={draft.cut.c1} onChange={(e) => set({ cut: { ...draft.cut, c1: Number(e.target.value) } })} className="w-56 accent-amber-700" aria-label="초류 컷" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="w-28 text-stone-600 dark:text-stone-300">본류→후류 {draft.cut.c2.toFixed(2)}</span>
              <input type="range" min={0.5} max={0.95} step={0.01} value={draft.cut.c2} onChange={(e) => set({ cut: { ...draft.cut, c2: Number(e.target.value) } })} className="w-56 accent-amber-700" aria-label="후류 컷" />
            </label>
          </div>

          {errs.length > 0 && <ul className="list-disc pl-4 text-xs text-rose-700 dark:text-rose-400">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
          <div className="flex gap-2">
            <Button variant="primary" disabled={errs.length > 0} onClick={() => {
              if (dispatch({ type: 'saveRecipe', recipe: draft }) && !draft.id) {
                const added = useGame.getState().state.production.recipes.at(-1);
                if (added) setDraft({ ...added });
              }
            }}>{draft.id ? '레시피 저장' : '새 레시피로 추가'}</Button>
            {draft.id && <Button variant="danger" onClick={() => { dispatch({ type: 'deleteRecipe', recipeId: draft.id! }); setDraft(blankDraft(s, draft.kind)); }}>삭제</Button>}
          </div>
        </div>

        <div className="w-full lg:w-64">
          <div className="text-xs font-semibold text-stone-500">배치 1회 예상 (뉴메이크)</div>
          {preview ? (
            <>
              <Radar flavor={preview.flavor} axes={CATEGORY[kindCategory(draft.kind)].radarAxes} size={230} />
              <dl className="grid grid-cols-2 gap-x-2 text-xs">
                <dt className="text-stone-500">산출</dt><dd className="text-right tabular-nums">{num(preview.lpa, 1)} LPA</dd>
                <dt className="text-stone-500">액량·도수</dt><dd className="text-right tabular-nums">{liters(preview.volumeL)} · {pct(preview.abv)}</dd>
                <dt className="text-stone-500">원가</dt><dd className="text-right tabular-nums">{won(preview.cost)}</dd>
                <dt className="text-stone-500">품질</dt><dd className="text-right tabular-nums">{preview.evaluation.quality}</dd>
                <dt className="text-stone-500">이취</dt><dd className="text-right tabular-nums">{preview.evaluation.offnotes}</dd>
                <dt className="text-stone-500">가까운 스타일</dt><dd className="text-right">{preview.evaluation.style ?? '—'}</dd>
              </dl>
            </>
          ) : <Empty>오류를 고치면 미리보기가 표시됩니다</Empty>}
        </div>
      </div>
    </Card>
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
