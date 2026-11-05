import { useMemo, useState } from 'react';
import { BOTTLE_SIZES, PACKAGING, packagingCost } from '../../sim/content/catalog';
import { CATEGORY } from '../../sim/content/categories';
import { previewBlend, topNotes, type BlendComponent, type BottleOptions, type SpiritKind } from '../../sim';
import { useGame } from '../../store/game';
import { Radar } from '../charts';
import { liters, months, num, pct, won } from '../format';
import { Badge, Button, Card, Empty, NumberField, Select, Table, Td, TextField } from '../kit';

const KIND_LABEL: Record<SpiritKind, string> = { soju: '소주', gin: '진', malt: '몰트', grain: '그레인' };
const ABV_PRESETS = ['cask', '0.25', '0.3', '0.4', '0.43', '0.46'] as const;

export function Bottling() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [opts, setOpts] = useState<BottleOptions>({ name: '', targetAbv: 0.4, bottleMl: 700, chillFilter: true, packagingId: 'standard' });

  const sources = useMemo(() => [
    ...s.lots.map((l) => ({ key: `lot:${l.id}`, source: 'lot' as const, id: l.id, lot: l, where: '탱크' })),
    ...s.casks.filter((c) => c.contents).map((c) => ({ key: `cask:${c.id}`, source: 'cask' as const, id: c.id, lot: c.contents!, where: `캐스크 ${c.id}` })),
  ], [s.lots, s.casks]);

  const components: BlendComponent[] = Object.entries(picked).map(([key, l]) => {
    const [source, id] = key.split(':') as ['lot' | 'cask', string];
    return { source, id, liters: l };
  });
  const preview = components.length ? previewBlend(s, components, opts) : null;
  const toggle = (key: string, vol: number) => setPicked((p) => { const n = { ...p }; if (n[key] != null) delete n[key]; else n[key] = Math.floor(vol * 10) / 10; return n; });
  const abvValue = opts.targetAbv === 'cask' ? 'cask' : String(opts.targetAbv);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Card title="원액 선택 (같은 주종끼리만 블렌딩)">
        {!sources.length ? <Empty>병입할 원액이 없습니다</Empty> : (
          <Table head={['', '원액', '위치', '주종', '보유', '도수', '오크 숙성', '주요 향', '사용량(L)']}>
            {sources.map((x) => (
              <tr key={x.key} className={picked[x.key] != null ? 'bg-amber-50 dark:bg-amber-950/30' : ''}>
                <Td><input type="checkbox" checked={picked[x.key] != null} onChange={() => toggle(x.key, x.lot.volumeL)} aria-label={`${x.lot.name} 선택`} className="accent-amber-700" /></Td>
                <Td className="max-w-64 truncate text-xs font-medium">{x.lot.name}</Td>
                <Td className="text-xs">{x.where}</Td>
                <Td><Badge>{KIND_LABEL[x.lot.kind]}</Badge></Td>
                <Td right>{liters(x.lot.volumeL)}</Td>
                <Td right>{pct(x.lot.abv)}</Td>
                <Td right>{months(x.lot.oakMonths)}</Td>
                <Td className="text-xs">{topNotes(x.lot.flavor).map((n) => n.nameKo).join(' · ')}</Td>
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
            <Select label="패키징" value={opts.packagingId} options={Object.entries(PACKAGING).map(([k, v]) => ({ value: k, label: `${v.nameKo} (${won(packagingCost(k, opts.bottleMl))}/병)` }))} onChange={(v) => setOpts({ ...opts, packagingId: v })} />
          </div>

          {!preview ? <Empty>왼쪽에서 원액을 선택하세요</Empty> : (
            <div className="grid gap-2">
              {preview.category && <Radar flavor={preview.flavor} axes={CATEGORY[preview.category].radarAxes} size={240} />}
              <div className="flex flex-wrap gap-1">
                {preview.category && <Badge tone="info">{CATEGORY[preview.category].nameKo}</Badge>}
                {preview.ageYears != null && <Badge tone="good">{preview.ageYears}년</Badge>}
                {preview.evaluation?.style && <Badge>{preview.evaluation.style}</Badge>}
                {preview.sourcedShare > 0 && <Badge tone="warn">매입 원액 {pct(preview.sourcedShare, 0)}</Badge>}
              </div>
              <dl className="grid grid-cols-2 gap-x-2 text-sm">
                <dt className="text-stone-500">병 수</dt><dd className="text-right tabular-nums">{num(preview.bottles)}병</dd>
                <dt className="text-stone-500">도수</dt><dd className="text-right tabular-nums">{pct(preview.finalAbv)} (원액 {pct(preview.mixAbv)})</dd>
                <dt className="text-stone-500">품질 / 전형성</dt><dd className="text-right tabular-nums">{preview.evaluation?.quality ?? '—'} / {preview.evaluation?.typicity ?? '—'}</dd>
                <dt className="text-stone-500">병당 원가</dt><dd className="text-right tabular-nums">{won(preview.unitCost)}</dd>
                <dt className="text-stone-500">권장 출고가</dt><dd className="text-right tabular-nums">{won(preview.suggestedPrice)}</dd>
              </dl>
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
