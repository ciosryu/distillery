// 병입 패키징 고르기 (P-PROD-38, 2026-11-10 오너 요청 — MVP는 프리셋 두 개 + "직접 고르기" 접기)
// 프리셋(스탠다드 / 디캔터+케이스)은 예전과 같다. 접기를 펼치면 병·마개·왁스·라벨·상자·라벨 색을 고르고 병당 포장 원가·패키징 럭셔리(0~30)를 바로 본다.
// 왁스 실링은 코르크에만(스크류 캡과 같이 못 씀). 재고 보충은 대상 제품과 같은 패키징이어야 해 고를 수 없게 잠근다
import { BOTTLES, BOXES, CLOSURES, LABEL_COLOR_KO, LABEL_COLORS, LABELS, PACKAGING_LUXURY_MAX, WAX, type PackagingChoice } from '../../sim/content/packaging';
import { PACKAGING, packagingCost } from '../../sim/content/catalog';
import { packagingError, packagingPartsCost, packagingPartsLuxury, presetChoice, type BottleOptions } from '../../sim';
import { won } from '../format';
import { Select } from '../kit';

export function PackagingPicker({ opts, setOpts, locked }: { opts: BottleOptions; setOpts: (o: BottleOptions) => void; locked?: string }) {
  const custom = !!opts.packaging;
  const c: PackagingChoice = opts.packaging ?? presetChoice(opts.packagingId);
  const set = (patch: Partial<PackagingChoice>) => { const next = { ...c, ...patch }; if (next.closure === 'screw') delete next.wax; setOpts({ ...opts, packaging: next }); };
  const err = packagingError(c, opts.bottleMl);
  const sel = 'rounded border border-stone-300 bg-white px-1 py-0.5 text-xs dark:border-stone-700 dark:bg-stone-800';
  const ml = opts.bottleMl as 700;
  if (locked) return <span className="text-xs text-stone-500">패키징: {locked}</span>;
  return (
    <div className="grid gap-1">
      <Select label="패키징" value={custom ? 'custom' : opts.packagingId}
        options={[...Object.entries(PACKAGING).map(([k, v]) => ({ value: k, label: `${v.nameKo} (${won(packagingCost(k, opts.bottleMl))}/병)` })), { value: 'custom', label: '직접 고르기…' }]}
        onChange={(v) => setOpts(v === 'custom' ? { ...opts, packaging: presetChoice(opts.packagingId) } : { ...opts, packagingId: v, packaging: undefined })} />
      <details open={custom} className="text-xs">
        <summary className="cursor-pointer text-stone-500">직접 고르기 — 병·마개·라벨·상자 · 원가 {won(packagingPartsCost(c, opts.bottleMl))}/병 · 패키징 럭셔리 {packagingPartsLuxury(c)}/{PACKAGING_LUXURY_MAX}</summary>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1">병 <select className={sel} aria-label="병 모양" value={c.bottle} onChange={(e) => set({ bottle: e.target.value as PackagingChoice['bottle'] })}>{Object.entries(BOTTLES).map(([k, v]) => <option key={k} value={k}>{v.nameKo} ({won(v.costBySize[ml])})</option>)}</select></label>
          <label className="inline-flex items-center gap-1">마개 <select className={sel} aria-label="마개" value={c.closure} onChange={(e) => set({ closure: e.target.value as PackagingChoice['closure'] })}>{Object.entries(CLOSURES).map(([k, v]) => <option key={k} value={k}>{v.nameKo} ({won(v.costBySize[ml])})</option>)}</select></label>
          <label className="inline-flex items-center gap-1" title={c.closure === 'screw' ? '왁스 실링은 코르크 마개에만 씌운다' : `+${won(WAX.costBySize[ml])}/병 · 럭셔리 +${WAX.luxury}`}><input type="checkbox" aria-label="왁스 실링" disabled={c.closure === 'screw'} checked={!!c.wax} onChange={(e) => set({ wax: e.target.checked || undefined })} className="accent-amber-700" /> 왁스 실링</label>
          <label className="inline-flex items-center gap-1">라벨 <select className={sel} aria-label="라벨" value={c.label} onChange={(e) => set({ label: e.target.value as PackagingChoice['label'] })}>{Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v.nameKo} ({won(v.costBySize[ml])})</option>)}</select></label>
          <label className="inline-flex items-center gap-1">라벨 색 <select className={sel} aria-label="라벨 색" value={c.labelColor ?? 'ivory'} onChange={(e) => set({ labelColor: e.target.value as PackagingChoice['labelColor'] })}>{LABEL_COLORS.map((k) => <option key={k} value={k}>{LABEL_COLOR_KO[k]}</option>)}</select></label>
          <label className="inline-flex items-center gap-1">상자 <select className={sel} aria-label="상자" value={c.box} onChange={(e) => set({ box: e.target.value as PackagingChoice['box'] })}>{Object.entries(BOXES).map(([k, v]) => <option key={k} value={k}>{v.nameKo}{v.costBySize[ml] ? ` (${won(v.costBySize[ml])})` : ''}</option>)}</select></label>
        </div>
        {err && <div className="mt-1 text-rose-700 dark:text-rose-400">{err}</div>}
        <div className="mt-1 text-stone-500">패키징 럭셔리는 브랜드 럭셔리와 판매 매력도에 들어간다(상한 {PACKAGING_LUXURY_MAX}점 — 디캔터+케이스가 30점). 라벨 색은 보기만. 같은 제품의 재고 보충은 같은 패키징이어야 한다.</div>
      </details>
    </div>
  );
}
