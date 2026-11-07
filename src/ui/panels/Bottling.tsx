import { useEffect, useMemo, useRef, useState } from 'react';
import { BOTTLE_SIZES, CASKS, PACKAGING, packagingCost } from '../../sim/content/catalog';
import { CATEGORY } from '../../sim/content/categories';
import { AXIS } from '../../sim/content/axes';
import { agePerception, calendar, estimateBlend, finishOf, type Cask, type CaskTypeId, hexOf, whiskyMinMonths, type ProfileAxis, type SpiritLot, priceAtQuality, weightedAverage, finishLabel, HEX_AXES, HEX_LABEL, knownReads, type Hex, DUTY_FREE, isWhiskyCategory, dutyFreeAgedAppeal, dutyFreeSlotBlocker, hasDutyFree, nextDutyFreeEdition, previewBlend, productDutyFreeDemand, topNotes, type BlendComponent, type BottleOptions, type Product, type SpiritKind } from '../../sim';
import { regionOf } from '../../sim/content/regions';
import { useGame } from '../../store/game';
import { Radar } from '../charts';
import { ProfileRadar } from './Production';
import { liters, months, num, pct, won } from '../format';
import { Badge, Button, Card, Empty, NumberField, Select, Table, Td, TextField } from '../kit';

const KIND_LABEL: Record<SpiritKind, string> = { soju: '소주', gin: '진', malt: '몰트', grain: '그레인', baijiu: '백주' };
/** 육각형 상위 축 이름 (샘플 기록 표시용) */
const topHex = (h: Hex, n = 3) => HEX_AXES.filter((a) => h[a] >= 1).sort((a, b) => h[b] - h[a]).slice(0, n).map((a) => HEX_LABEL[a]).join(' · ') || '뚜렷한 향 없음';

/** 원액 분류 — 주종 + 위스키 표기 가능 여부 (플레이테스트 2026-11-07: 주종이 다 섞여 보여 블렌딩이 불편하다) */
function sourceCategory(lot: SpiritLot, minMonths: number): string {
  if (lot.kind === 'malt') return lot.oakMonths >= minMonths ? '몰트 위스키' : '몰트 스피릿(숙성 중)';
  if (lot.kind === 'grain') return lot.oakMonths >= minMonths ? '그레인 위스키' : '그레인 스피릿(숙성 중)';
  return KIND_LABEL[lot.kind];
}
const CATEGORY_ORDER = ['몰트 위스키', '몰트 스피릿(숙성 중)', '그레인 위스키', '그레인 스피릿(숙성 중)', '소주', '진', '백주'];

/** 캐스크 종류 짧은 이름과 색 (플레이테스트 2026-11-07: 버번 캐스크인지 올로로소 캐스크인지 구분이 안 된다) */
const CASK_SHORT: Record<CaskTypeId, { name: string; cls: string }> = {
  ex_bourbon_barrel: { name: '버번 배럴', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200' },
  oloroso_butt: { name: '올로로소 셰리 벗', cls: 'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-200' },
  korean_oak_quarter: { name: '한국 참나무', cls: 'bg-lime-100 text-lime-900 dark:bg-lime-900/50 dark:text-lime-200' },
  mizunara_hogshead: { name: '미즈나라', cls: 'bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-200' },
  onggi_jar: { name: '옹기', cls: 'bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-100' },
};
const caskShort = (t: CaskTypeId) => CASK_SHORT[t]?.name ?? CASKS[t]?.nameKo ?? t;
/** 통 표시: 종류 · 회차(1필 = 새 통, 숫자가 클수록 향이 약하다) · 피니시 */
function CaskTag({ c }: { c: Cask }) {
  const f = c.contents ? finishOf(c.contents) : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`rounded px-1 py-px text-[11px] font-medium ${CASK_SHORT[c.typeId]?.cls ?? ''}`}>{caskShort(c.typeId)}</span>
      <span className="text-stone-500">{c.fills}필{f ? ` · ${finishLabel(f.typeId)} ${months(f.months)}` : ''}</span>
    </span>
  );
}

/** 블렌딩 그래프의 원액 색 — 밝은·어두운 화면 모두에서 보이는 중간 톤 */
const LAYER_COLORS = ['#0ea5e9', '#10b981', '#a855f7', '#ef4444', '#eab308', '#14b8a6', '#f97316', '#6366f1'];

const ABV_PRESETS = ['cask', '0.25', '0.3', '0.34', '0.38', '0.4', '0.43', '0.46', '0.58'] as const;

export function Bottling() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [opts, setOpts] = useState<BottleOptions>({ name: '', targetAbv: 0.4, bottleMl: 700, chillFilter: true, packagingId: 'standard' });

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
      const lot = { ...newest, name: lots.length > 1 ? `${newest.name.split(' · ')[0]} — 탱크 ${lots.length}개 배치` : newest.name, volumeL: vol, abv: lpa / vol, flavor: weightedAverage(lots.map((l) => ({ flavor: l.flavor, weight: l.volumeL * l.abv }))) };
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
  // 시나리오 게임(MVP)은 캐스크의 참 향미·품질을 숨긴다 (#136·#159) — 샘플 기록으로 추정한 값만 보여 주고, 병입하면 공개된다. 샌드박스는 개발용으로 참값을 보여 준다
  const hide = !!s.scenario;
  const known = useMemo(() => (hide ? knownReads(s) : null), [hide, s]);
  const est = hide && preview ? estimateBlend(s, components) : null;
  const masked = !!est?.fromCasks;
  // 면세 한정판 예상 판매 (결정 #87) — 이번 달 면세 수요(권장 출고가)로 완판 기한 안에 몇 병 팔릴지
  const dfForecast = (() => {
    if (masked || !preview?.ok || !preview.dfEdition || !preview.category || !preview.evaluation) return null;
    const p: Product = {
      id: 'preview', name: '', category: preview.category, ageYears: preview.ageYears, oakMonths: preview.minOakMonths, abv: preview.finalAbv, bottleMl: opts.bottleMl, chillFiltered: opts.chillFilter, packagingId: opts.packagingId,
      flavor: preview.flavor, quality: preview.evaluation.quality, typicity: preview.evaluation.typicity, style: preview.evaluation.style, sourcedShare: preview.sourcedShare,
      stockBottles: preview.bottles, price: preview.suggestedPrice, unitCost: preview.unitCost, createdMonth: s.month, lastMonthSold: 0, totalSold: 0,
      dutyFreeOnly: true, localIngredient: preview.localIngredient, dfEdition: preview.dfEdition,
    };
    const same = s.commerce.products.filter((x) => x.stockBottles > 0 && x.category === p.category).length + 1;
    const perMonth = productDutyFreeDemand(s, p, same, calendar(s).monthOfYear);
    return { perMonth, window: perMonth * DUTY_FREE.sellOutMonths };
  })();
  const toggle = (key: string, vol: number) => {
    // 첫 원액을 고르면 그 분류만 보이게
    if (cat === '전체' && !Object.keys(picked).length) { const x = sources.find((y) => y.key === key); if (x) setCat(sourceCategory(x.lot, minMonths)); }
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
        axes = k && hexMode ? HEX_AXES.map((a) => ({ id: a, label: HEX_LABEL[a], value: k.hex[a] })) : null;
      } else axes = axesOf(x.lot.flavor);
      return [{ axes, color: LAYER_COLORS[i % LAYER_COLORS.length]!, label, share }];
    });
    const blend: ProfileAxis[] | null = masked
      ? (est?.hex && hexMode ? HEX_AXES.map((a) => ({ id: a, label: HEX_LABEL[a], value: est.hex![a] })) : null)
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

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
      <Card title="원액 선택 (같은 주종끼리만 블렌딩)">
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
              <tr key={x.key} className={picked[x.key] != null ? 'bg-amber-50 dark:bg-amber-950/30' : ''}>
                <Td><input type="checkbox" checked={picked[x.key] != null} onChange={() => toggle(x.key, x.lot.volumeL)} aria-label={`${x.lot.name} 선택`} className="accent-amber-700" /></Td>
                <Td className="text-xs font-medium"><div className="w-44 truncate" title={x.lot.name}>{x.lot.name.split(' → ')[0]}</div><div className="w-44 whitespace-normal font-normal text-stone-500">{x.cask ? <span className="inline-flex flex-wrap items-center gap-1">{x.where} <CaskTag c={x.cask} /></span> : x.where}</div></Td>
                <Td><Badge>{sourceCategory(x.lot, minMonths)}</Badge></Td>
                <Td right>{liters(x.lot.volumeL)}</Td>
                <Td right>{pct(x.lot.abv)}</Td>
                <Td right>{months(x.lot.oakMonths)}</Td>
                {/* 표가 옆으로 넘쳐 체크박스·이름이 밀려나지 않게 너비를 묶고 두 줄로 (플레이테스트 2026-11-07) */}
                <Td className="text-xs"><div className="w-40 whitespace-normal">{hide && x.source === 'cask' ? (() => {
                  const k = known?.get(x.id);
                  return k ? <span className={k.from === 'sibling' ? 'opacity-70' : ''}>{topHex(k.hex)}<span className="block text-stone-500">추정 {k.estQuality} · {s.month - k.month > 0 ? `${months(s.month - k.month)} 전` : '이번 달'}{k.from === 'sibling' ? ' 형제 통' : ''} 샘플</span></span> : <span className="text-stone-500">샘플 없음 — 모른다</span>;
                })() : topNotes(x.lot.flavor).map((n) => n.nameKo).join(' · ')}</div></Td>
                <Td>{picked[x.key] != null && <NumberField value={picked[x.key]!} min={0} max={Math.floor(x.lot.volumeL * 10) / 10} step={0.1} width="w-20" onCommit={(v) => setPicked((p) => ({ ...p, [x.key]: v }))} />}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="병입">
        <div className="grid gap-2">
          <TextField label="제품명" value={opts.name} onChange={(v) => setOpts({ ...opts, name: v })} width="w-full" />
          <div className="flex flex-wrap gap-2">
            <Select label="도수" value={abvValue} options={ABV_PRESETS.map((v) => ({ value: v, label: v === 'cask' ? '캐스크 스트렝스' : `${Math.round(Number(v) * 100)}%` }))} onChange={(v) => setOpts({ ...opts, targetAbv: v === 'cask' ? 'cask' : Number(v) })} />
            <Select label="병" value={String(opts.bottleMl)} options={BOTTLE_SIZES.map((v) => ({ value: String(v), label: `${v}ml` }))} onChange={(v) => setOpts({ ...opts, bottleMl: Number(v) })} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={opts.chillFilter} onChange={(e) => setOpts({ ...opts, chillFilter: e.target.checked })} className="accent-amber-700" /> 칠 필터링</label>
            {hasDutyFree(s) && <label className="inline-flex items-center gap-1 text-sm" title={`국내 판매 없이 지정면세점 전용 매대(${DUTY_FREE.slots}칸)에서만 판매. 제주 원료(차조·청귤) 기념품은 매력도 ×${DUTY_FREE.localAppeal}, 위스키는 숙성 ${DUTY_FREE.agedTiers.map((t) => `${t.years}년 ×${t.appeal}`).join(' · ')}. ${DUTY_FREE.sellOutMonths}개월 안에 완판하면 다음 판 매력도 +${Math.round(DUTY_FREE.streakAppeal * 100)}%(최대 ${DUTY_FREE.maxStreak}연속), ${DUTY_FREE.returnMonths}개월 안에 못 팔면 국내 매대로 넘어갑니다`}><input type="checkbox" checked={!!opts.dutyFreeOnly} onChange={(e) => setOpts({ ...opts, dutyFreeOnly: e.target.checked })} className="accent-amber-700" /> 면세 전용 한정판</label>}
            <Select label="패키징" value={opts.packagingId} options={Object.entries(PACKAGING).map(([k, v]) => ({ value: k, label: `${v.nameKo} (${won(packagingCost(k, opts.bottleMl))}/병)` }))} onChange={(v) => setOpts({ ...opts, packagingId: v })} />
          </div>

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
                  ? <Empty>고른 캐스크에 샘플 기록이 없다 — 증류소 탭 아래쪽 "숙성 중인 캐스크"에서 통을 골라 샘플을 떠야 향·품질을 안다</Empty>
                  : preview.category && <Radar flavor={preview.flavor} axes={CATEGORY[preview.category].radarAxes} size={240} />}
              {masked && <p className="text-xs text-stone-500">샘플 기록으로 추정한 육각형·품질·출고가 범위다{est && est.unknownShare >= 0.05 ? ` — 기록 없는 원액 ${pct(est.unknownShare, 0)}는 추정에서 빠졌다` : ''}. 실제 향·품질·권장 출고가는 병입하면 공개된다.{est && est.unknownShare >= 0.05 ? ' 샘플은 증류소 탭 아래쪽 "숙성 중인 캐스크"에서 뜬다(통 골라 샘플, 1회 3만 원).' : ''}</p>}
              <div className="flex flex-wrap gap-1">
                {preview.category && <Badge tone="info">{CATEGORY[preview.category].nameKo}</Badge>}
                {preview.ageYears != null && <Badge tone="good">{preview.ageYears}년</Badge>}
                {!masked && preview.evaluation?.style && <Badge>{preview.evaluation.style}</Badge>}
                {preview.finish && <Badge tone="good">{finishLabel(preview.finish)}</Badge>}
                {preview.sourcedShare > 0 && <Badge tone="warn">매입 원액 {pct(preview.sourcedShare, 0)} · 브랜드 가치 {Math.round(preview.sourcedPrestige * 100)}</Badge>}
                {preview.premiumLabel && <Badge tone="good">{regionOf(s).whisky.premiumLabel?.name}</Badge>}
                {preview.traditional && <Badge tone="good">{regionOf(s).traditionalRelief?.label}</Badge>}
                {preview.specialty && <Badge tone="good">{regionOf(s).specialties?.find((x) => x.id === preview.specialty)?.label}</Badge>}
                {preview.localIngredient && hasDutyFree(s) && <Badge tone="good">제주 원료</Badge>}
                {preview.dfEdition && !preview.localIngredient && dutyFreeAgedAppeal(preview.ageYears) > 1 && <Badge tone="good">숙성 한정 · 수요 ×{dutyFreeAgedAppeal(preview.ageYears)}</Badge>}
                {preview.dfEdition && <Badge tone="info">면세 한정판 Vol.{preview.dfEdition.vol}</Badge>}
              </div>
              <dl className="grid grid-cols-2 gap-x-2 text-sm">
                <dt className="text-stone-500">병 수</dt><dd className="text-right tabular-nums">{num(preview.bottles)}병</dd>
                <dt className="text-stone-500">도수</dt><dd className="text-right tabular-nums">{pct(preview.finalAbv)} (원액 {pct(preview.mixAbv)})</dd>
                {masked
                  ? <><dt className="text-stone-500">추정 품질</dt><dd className="text-right tabular-nums">{est?.quality != null ? `${est.quality} ±${num(est.sigma, 1)}` : '모른다'}</dd></>
                  : <><dt className="text-stone-500">품질 / 전형성</dt><dd className="text-right tabular-nums">{preview.evaluation?.quality ?? '—'} / {preview.evaluation?.typicity ?? '—'}</dd></>}
                <dt className="text-stone-500">병당 원가</dt><dd className="text-right tabular-nums">{won(preview.unitCost)}</dd>
                <dt className="text-stone-500">{masked ? '예상 출고가' : '권장 출고가'}</dt><dd className="text-right tabular-nums">{masked ? (() => {
                  // 추정 품질 ± 오차로 매긴 범위 (#172) — 참 출고가는 병입하면 정해진다
                  if (est?.quality == null) return '모른다 — 샘플 필요';
                  const lo = priceAtQuality(s, preview, opts, Math.max(0, est.quality - est.sigma));
                  const hi = priceAtQuality(s, preview, opts, Math.min(100, est.quality + est.sigma));
                  return lo != null && hi != null ? `${won(lo)} ~ ${won(hi)}` : '병입 후 공개';
                })() : <>{won(preview.suggestedPrice)}{preview.dfEdition ? ' (면세 기준)' : ''}</>}</dd>
                {preview.category && isWhiskyCategory(preview.category) && <><dt className="text-stone-500" title="권장 출고가와 매력도에 같이 곱한다. 3년 = ×1.18, 그 뒤는 원액 시가와 같은 속도로 오른다(18년 상한)">숙성 프리미엄</dt><dd className="text-right tabular-nums">×{agePerception(preview.minOakMonths, preview.category).toFixed(2)}</dd></>}
                {dfForecast && <><dt className="text-stone-500">예상 면세 판매</dt><dd className={`text-right tabular-nums ${dfForecast.window < preview.bottles ? 'text-amber-800 dark:text-amber-300' : ''}`}>월 {num(dfForecast.perMonth)}병 · {DUTY_FREE.sellOutMonths}개월 {num(dfForecast.window)}병</dd></>}
              </dl>
              {preview.dfEdition && !preview.localIngredient && dutyFreeAgedAppeal(preview.ageYears) > 1 && <p className="text-xs text-stone-500">숙성 한정판 보너스는 수요만 올립니다. 숙성 연수에 따른 값은 권장 출고가의 숙성 프리미엄에 이미 들어 있습니다</p>}
              {dfForecast && dfForecast.window < preview.bottles && <p className="text-xs text-amber-800 dark:text-amber-300">⚠ 이번 달 수요(계절·인지도 반영)로는 {DUTY_FREE.sellOutMonths}개월 안에 {num(preview.bottles)}병을 다 팔기 어렵습니다 — 사용량을 줄이면 완판 보너스를 노릴 수 있습니다</p>}
              {preview.warnings.map((w) => <p key={w} className="text-xs text-amber-800 dark:text-amber-300">⚠ {w}</p>)}
              {preview.errors.map((e) => <p key={e} className="text-xs text-rose-700 dark:text-rose-400">✕ {e}</p>)}
              <Button variant="primary" disabled={!preview.ok} onClick={() => { if (dispatch({ type: 'bottle', components, options: opts })) { setPicked({}); setOpts({ ...opts, name: '' }); } }}>병입하기</Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
