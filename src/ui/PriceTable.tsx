import { useMemo, useState } from 'react';
import { calendar, knownState } from '../sim';
import { useGame } from '../store/game';
import { Button, Card, NumberField, Table, Td } from './kit';
import { num, won, wonFull } from './format';
import { PRICE_TABLE_HORIZONS, priceTableRows, priceTableTotals, type SupplyMode } from './priceTableCalc';

// [결정 #438 묶음 ③] 한 화면 가격표 (MKT · 화면만 — mkt-pricing-postrun.md §6.6 (ㄴ)). 셈은 `priceTableCalc.ts`(아는 품질 상태만 · 읽기만).
// 값을 여러 줄 고친 뒤 합(판매 · 매출 · 공헌)을 보고 「한 번에 적용」 — 적용은 있는 행동 `setPrice`를 줄마다 보낸다. 자동 가격을 켠 제품은 고치지 않는다(정책이 정함)

const monthsOf = (n: number, perMonth: number) => (perMonth > 0 ? n / perMonth : Infinity);
const monthsText = (m: number) => (!Number.isFinite(m) ? '—' : m >= 60 ? '5년 치↑' : m < 1 ? '1개월 치 안' : `${Math.round(m)}개월 치`);
const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '±');

export function PriceTable() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [horizon, setHorizon] = useState<number>(6);
  const [supply, setSupply] = useState<SupplyMode>('bottles');
  // 「적용 전 값으로」 — 한 번에 적용 직전 값들(그 달 안에서만). 엔진 되돌리기 없이 같은 setPrice를 옛 값으로 다시 보낸다(ARCH 2026-11-27)
  const [undo, setUndo] = useState<{ month: number; prev: Record<string, number> } | null>(null);
  const moy = calendar(s).monthOfYear;
  const ks = useMemo(() => knownState(s), [s]);
  // 지금 값과 같은 초안은 지운다(상태가 바뀌어 지금 값이 따라온 경우)
  const live = useMemo(() => Object.fromEntries(Object.entries(drafts).filter(([id, v]) => s.commerce.products.some((p) => p.id === id && p.price !== v && !p.autoPrice))), [drafts, s]);
  const rows = useMemo(() => (open ? priceTableRows(s, ks, moy, live, horizon, supply) : []), [open, s, ks, moy, live, horizon, supply]);
  const before = useMemo(() => (open ? priceTableTotals(s, ks, moy, {}) : null), [open, s, ks, moy]);
  const after = useMemo(() => (open && Object.keys(live).length ? priceTableTotals(s, ks, moy, live) : null), [open, s, ks, moy, live]);
  const changed = Object.keys(live).length;
  const setDraft = (id: string, v: number) => setDrafts((d) => ({ ...d, [id]: Math.max(100, Math.round(v / 100) * 100) }));
  const apply = () => {
    const prev = Object.fromEntries(Object.keys(live).map((id) => [id, s.commerce.products.find((p) => p.id === id)!.price]));
    for (const [id, price] of Object.entries(live)) dispatch({ type: 'setPrice', productId: id, price });
    setDrafts({}); setUndo({ month: s.month, prev });
  };
  const undoable = undo && undo.month === s.month ? Object.entries(undo.prev).filter(([id, v]) => s.commerce.products.some((p) => p.id === id && !p.autoPrice && p.price !== v)) : [];
  const revert = () => { for (const [id, price] of undoable) dispatch({ type: 'setPrice', productId: id, price }); setUndo(null); };

  return (
    <Card title="한 화면 가격표" actions={<button type="button" className="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-stone-600 transition hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="price-table-body" title="제품 · 병 재고 · 맞는 통 원액 · 지금 값 · 수요 · 다 팔 값 · 지난 3개월을 한 표에서 보고, 여러 제품 값을 고친 뒤 한 번에 적용한다">{open ? '접기' : '펼치기'}</button>}>
      <div id="price-table-body">{!open ? <div className="text-xs text-stone-500">여러 제품 값을 한 표에서 고치고 합(판매 · 매출 · 공헌)을 본 뒤 한 번에 적용한다 — 펼쳐서 쓴다</div> : (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600 dark:text-stone-400">
            <label className="flex items-center gap-1" title="다 팔 값 = 공급이 이 기간에 꼭 다 팔리는 출고가 — 기간이 길수록 천천히 팔아야 하니 값이 오른다(국내 수요 · 같은 범주 나눔 · 계절 · 잡음 없는 어림 · 아는 품질)">공급을 팔 기간
              <select className="rounded border border-stone-300 bg-white px-1 py-0 dark:border-stone-700 dark:bg-stone-800" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} aria-label="다 팔 기간">
                {PRICE_TABLE_HORIZONS.map((h) => <option key={h} value={h}>{h}개월</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1" title="병 = 병입된 재고만 · 병 + 맞는 원액 = 자동 납품 후보와 같은 통 · 탱크 원액까지(다른 제품과 나눠 쓸 수 있어 넉넉하게 잡힐 수 있다)">공급
              <select className="rounded border border-stone-300 bg-white px-1 py-0 dark:border-stone-700 dark:bg-stone-800" value={supply} onChange={(e) => setSupply(e.target.value as SupplyMode)} aria-label="다 팔 값 공급">
                <option value="bottles">병 재고만</option>
                <option value="withCasks">병 + 맞는 원액</option>
              </select>
            </label>
            {before && (
              <span className="tabular-nums" aria-label="가격표 합">
                이번 달(국내 · 어림): 판매 {num(before.bottles)}병 · 매출 {won(before.revenue)} · 공헌 {won(before.contribution)}
                {after && <b className="ml-1 text-sky-800 dark:text-sky-300">→ {num(after.bottles)}병 · {won(after.revenue)} · 공헌 {won(after.contribution)} ({sign(after.contribution - before.contribution)}{won(Math.abs(after.contribution - before.contribution))})</b>}
              </span>
            )}
            <Button small variant="primary" disabled={!changed} onClick={apply} title="고친 값을 모두 적용한다(제품마다 출고가 변경)">{changed ? `${changed}개 값 한 번에 적용` : '고친 값 없음'}</Button>
            {changed > 0 && <Button small variant="ghost" onClick={() => setDrafts({})}>고친 값 지우기</Button>}
            {!changed && undoable.length > 0 && <Button small variant="ghost" onClick={revert} title="이번 달 「한 번에 적용」 직전 값으로 되돌린다(같은 출고가 변경을 옛 값으로 다시 보낸다)">적용 전 값으로({undoable.length}개)</Button>}
          </div>
          <Table head={['제품', '병 재고', '맞는 원액', '값(고치기)', '기준가 배수', '이번 달 수요', `${horizon}개월에 다 팔 값`, '지난 3개월(병 · 값)']}>
            {rows.map((r) => {
              const pm = r.demand;
              return (
                <tr key={r.id}>
                  <Td className="font-medium">{r.name}{r.ageYears ? <span className="ml-1 text-xs text-stone-500">{r.ageYears}년</span> : null}{r.autoPrice && <span className="ml-1 text-xs text-emerald-700 dark:text-emerald-400">자동 가격</span>}{r.autoRestock && <span className="ml-1 text-xs text-stone-500">자동 납품</span>}</Td>
                  <Td right>{num(r.stock)}<div className="text-xs text-stone-500">{r.stock > 0 ? monthsText(monthsOf(r.stock, pm)) : '품절'}</div>
                    {r.stockoutLast ? <div className="text-xs text-amber-700 dark:text-amber-400" title="지난달 판매 전 재고가 0이라 다시 채웠다면 팔렸을 국내 수요(어림 · T8) — 값이 낮았거나 공급이 모자랐을 수 있다">지난달 품절로 약 {num(r.stockoutLast)}병 못 팖</div> : null}</Td>
                  <Td right>{r.caskBottles > 0 ? <>{num(r.caskBottles)}병<div className="text-xs text-stone-500">{monthsText(monthsOf(r.caskBottles, pm))}</div></> : <span className="text-stone-400">—</span>}</Td>
                  <Td>{r.autoPrice ? <span className="tabular-nums">{wonFull(r.price)}</span> : (
                    <span className="inline-flex items-center gap-1">
                      <NumberField value={r.draft} min={100} step={100} width="w-24" onCommit={(v) => setDraft(r.id, v)} />
                      {r.draft !== r.price && <span className="text-xs text-sky-800 dark:text-sky-300">← {wonFull(r.price)}</span>}
                    </span>
                  )}</Td>
                  <Td right>{r.suggested > 0 ? `×${(r.draft / r.suggested).toFixed(2)}` : '—'}</Td>
                  <Td right>{r.restocked && <span className="text-xs text-stone-500" title="병 재고가 0 — 다시 채웠다면 이번 달 국내 수요(품절 배지와 같은 셈)">채우면 </span>}{num(Math.round(r.demand))}병{Math.round(r.demand) !== Math.round(r.demandNow) && <div className="text-xs text-stone-500">지금 {num(Math.round(r.demandNow))}병</div>}</Td>
                  <Td right>{r.sellThrough != null ? <>
                    {wonFull(r.sellThrough)}
                    {!r.autoPrice && r.sellThrough !== r.draft && <button className="ml-1 text-xs underline decoration-dotted" onClick={() => setDraft(r.id, r.sellThrough!)} aria-label={`${r.name} 다 팔 값을 고치는 값으로`}>이 값으로</button>}
                  </> : r.coverMonths == null ? <span className="text-stone-400">—</span>
                    : r.nearNow ? <span className="text-xs text-stone-600 dark:text-stone-400" title="지금 값이 이 기간에 공급을 거의 다 파는 값이다(5% 낮추면 다 팔린다)">≈ 지금 값</span>
                    : <span className="text-xs text-stone-500" title="지금 값으로는 이 기간에 공급을 다 못 판다 — 다 팔 값은 지금 값보다 낮다(계절 없는 어림)">넉넉 · {monthsText(r.coverMonths)}</span>}</Td>
                  <Td className="text-xs tabular-nums text-stone-600 dark:text-stone-400">{r.last3.map((x) => `${num(x.sold)}${x.price ? `·${Math.round(x.price / 1000)}k` : ''}`).join(' / ')}</Td>
                </tr>
              );
            })}
          </Table>
          <div className="text-xs text-stone-500">수요 · 다 팔 값은 아는 품질(리뷰 · 샘플 어림)로 센 국내 어림이다 — 수출 · 면세 · 소매 처리 역량 · 달마다의 잡음은 넣지 않는다. 합은 이번 달 한 달 — 다 팔 값으로 올리면 이번 달 판매는 줄고 재고가 그 기간 동안 간다. 「이 값으로」는 고치는 값에만 넣고, 「한 번에 적용」을 눌러야 바뀐다</div>
        </div>
      )}</div>
    </Card>
  );
}
