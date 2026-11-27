// [결정 #437 ①] 재고 보충 「자동으로 골라 담기」 — 조건을 고르면 통 · L을 병입 칸에 담는다. 병입은 사람이 지금 「병입」으로 누른다(새 행동 없음 · 화면만)
import { useState } from 'react';
import type { Product } from '../../sim';
import { restockAutoPick, restockLabelMonths, restockPickDefaultBottles, restockPickFamilies, type RestockFlavor, type RestockPickResult } from '../../sim/restockAutoPick';
import { useGame } from '../../store/game';
import { num } from '../format';
import { Button, NumberField } from '../kit';

const METHOD: Record<RestockPickResult['method'], string> = {
  flavor: '블렌더가 이 제품의 병입 때 추정 향미에 가깝게 비율을 정했다(샘플 기록 기준 어림)',
  mix: '이 제품의 섞은 비율(통 구성 · 레시피 기록)대로 어린 통부터 담았다',
  youngest: '어린 통부터 담았다(이 제품의 추정 향미 기록이 없다)',
};

export function RestockAutoPick({ p, onPick }: { p: Product; onPick: (picked: Record<string, number>) => void }) {
  const s = useGame((g) => g.state);
  const label = restockLabelMonths(s, p);
  const [open, setOpen] = useState(false);
  const [minY, setMinY] = useState(label / 12);
  const [maxY, setMaxY] = useState(0); // 0 = 상한 없음
  const [minQ, setMinQ] = useState(0); // 0 = 품질 조건 없음
  const [flavorKey, setFlavorKey] = useState<string>('keep');
  const [bottles, setBottles] = useState(() => restockPickDefaultBottles(s, p));
  const [last, setLast] = useState<RestockPickResult | null>(null);
  const minMonths = Math.round(minY * 12);
  const maxMonths = maxY > 0 ? Math.round(maxY * 12) : undefined;
  const families = restockPickFamilies(s, p, { minMonths, maxMonths });
  const flavor: RestockFlavor = flavorKey === 'keep' || !families.some((f) => f.family === flavorKey) ? { kind: 'keep' } : { kind: 'family', family: flavorKey as Extract<RestockFlavor, { kind: 'family' }>['family'] };
  const yr = (m: number) => (m % 12 ? `${num(m / 12, 1)}년` : `${m / 12}년`);
  const pick = () => {
    const r = restockAutoPick(s, p, { minMonths, maxMonths, minKnownQuality: minQ > 0 ? minQ : undefined, flavor, bottles });
    setLast(r);
    if (r.components.length) onPick(Object.fromEntries(r.components.map((x) => [`cask:${x.caskId}`, x.liters])));
  };
  const heldText = (r: RestockPickResult) => [
    r.held.reserve ? `보호 · 플래그십 예비 ${r.held.reserve}통` : '',
    r.held.policy ? `띠 정책 ${r.held.policy}통` : '',
    r.held.lowQuality ? `품질 하한 미달 ${r.held.lowQuality}통` : '',
    r.held.noRead ? `샘플 기록 없음 ${r.held.noRead}통` : '',
    r.held.family ? `다른 계열 ${r.held.family}통` : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className="rounded-md border border-stone-200 p-2 text-xs dark:border-stone-700">
      <button type="button" className="text-left font-medium text-amber-800 dark:text-amber-300" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? '▾' : '▸'} 자동으로 골라 담기 — 숙성 · 품질 · 향미 방향을 고르면 쓸 통과 양을 아래 병입 칸에 담는다
      </button>
      {open && (
        <div className="mt-2 grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <NumberField label="숙성 최저(년)" value={minY} min={0} max={30} step={1} width="w-16" onCommit={setMinY} />
            <NumberField label="상한(년 · 0 = 없음)" value={maxY} min={0} max={30} step={1} width="w-16" onCommit={setMaxY} />
            <NumberField label="품질 하한(0 = 없음)" value={minQ} min={0} max={100} step={1} width="w-16" onCommit={setMinQ} />
            <NumberField label="병 수" value={bottles} min={10} max={20000} step={10} width="w-20" onCommit={setBottles} />
          </div>
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="향미 방향">
            <span className="text-stone-600 dark:text-stone-300">향미 방향</span>
            <label className="inline-flex items-center gap-1"><input type="radio" name={`rap-${p.id}`} className="accent-amber-700" checked={flavor.kind === 'keep'} onChange={() => setFlavorKey('keep')} />지금 제품 맛과 가장 비슷하게</label>
            {families.map((f) => (
              <label key={f.family} className="inline-flex items-center gap-1"><input type="radio" name={`rap-${p.id}`} className="accent-amber-700" checked={flavor.kind === 'family' && flavor.family === f.family} onChange={() => setFlavorKey(f.family)} />{f.label}만({f.casks}통)</label>
            ))}
            {p.finish && <span className="text-stone-500">피니시 제품 — 같은 피니시 통만 보충된다(계열은 고르지 않는다)</span>}
          </div>
          {minMonths < label && <p className="text-amber-700 dark:text-amber-400">숙성 최저 {yr(minMonths)}가 표기({yr(label)})보다 짧다 — 더 어린 통이 담기면 보충할 때 제품 표기가 내려간다</p>}
          <p className="text-stone-500">보호 태그 · 플래그십 예비(12년 후보) · 판매 탭 띠 정책 · 같은 레시피는 자동 납품과 같이 지킨다. 품질 하한은 샘플 기록의 아는 품질 — 기록 없는 통은 쓰지 않는다. 계열을 골라도 그 안에서는 지금 제품 맛에 가깝게 섞는다.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button small variant="primary" onClick={pick}>자동으로 골라 담기</Button>
            {last && (last.error
              ? <span className="text-red-700 dark:text-red-400">{last.error}{heldText(last) ? ` — 뺀 통: ${heldText(last)}` : ''}</span>
              : <span className="text-stone-600 dark:text-stone-300">{last.components.length}통 · 약 {num(last.bottles)}병{last.bottles < bottles * 0.97 ? `(원한 ${num(bottles)}병보다 적다 — 통이 모자라거나 한 통이 비율을 막았다)` : ''} 담음 — {METHOD[last.method]}{heldText(last) ? ` · 뺀 통: ${heldText(last)}` : ''}. 아래 미리보기를 보고 「병입」을 누른다</span>)}
          </div>
        </div>
      )}
    </div>
  );
}
