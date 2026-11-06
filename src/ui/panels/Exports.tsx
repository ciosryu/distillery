import { EXPORT_MARKET_IDS, EXPORT_MARKETS, exportEligible, exportFob, exportFreightPerBottle, exportShelfPrice, productConsumerPrice } from '../../sim';
import { useGame } from '../../store/game';
import { num, pct, won } from '../format';
import { Badge, Button, Card, Empty, Stat, Table, Td } from '../kit';

/** 수출 시장 (#95): 진출·철수, 시장 조건, 제품별 현지 소비자가와 판매 */
export function Exports() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const last = s.reports.at(-1);
  const opened = s.exports ?? [];

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="진출 시장" value={`${opened.length} / ${EXPORT_MARKET_IDS.length}`} />
        <Stat label="지난달 수출 매출" value={won(last?.exportRevenue ?? 0)} hint="출고가 그대로 — 국내 주세는 수출 면세" />
        <Stat label="지난달 수출 운임" value={won(last?.expenses.export_freight ?? 0)} />
        <Stat label="월 현지 비용" value={won(last?.expenses.export_fixed ?? 0)} hint="현지 브랜드 담당·수입상 지원비" />
      </div>

      {EXPORT_MARKET_IDS.map((id) => {
        const m = EXPORT_MARKETS[id];
        const entry = opened.find((e) => e.marketId === id);
        const ready = !!entry && entry.readyMonth <= s.month;
        const sales = last?.exports?.filter((x) => x.marketId === id) ?? [];
        const products = s.products.filter((p) => p.stockBottles > 0 && m.categories[p.category]);
        return (
          <Card
            key={id}
            title={<>{m.nameKo} {entry ? (ready ? <Badge tone="good">판매 중</Badge> : <Badge tone="warn">준비 중 — {entry.readyMonth - s.month}개월</Badge>) : <Badge>미진출</Badge>}</>}
            actions={entry
              ? <Button small variant="danger" onClick={() => dispatch({ type: 'closeExport', marketId: id })}>철수</Button>
              : <Button small variant="primary" disabled={s.cash < m.entryCost} onClick={() => dispatch({ type: 'openExport', marketId: id })}>진출 ({won(m.entryCost)}, {m.entryMonths}개월)</Button>}
          >
            <p className="mb-2 text-xs text-stone-500">{m.descKo}</p>
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-6">
              <div>관세 <b>{pct(m.tariff[s.regionId], 0)}</b></div>
              <div>현지 주세 <b>{won(m.excisePerLPA)}</b>/LPA</div>
              <div>부가세 <b>{pct(m.vat, 0)}</b></div>
              <div>유통 배수 <b>×{m.channelMultiple}</b></div>
              <div>운임 <b>{won(m.freightPerBottle[s.regionId])}</b>/병</div>
              <div>월 비용 <b>{won(m.monthlyCost)}</b></div>
              {m.minWhiskyMonths > 0 && <div className="col-span-2">위스키는 <b>{m.minWhiskyMonths / 12}년 숙성 이상</b>만</div>}
              {entry && <div className="col-span-2">현지 인지도 <b>{pct(entry.awareness, 1)}</b> · 누적 {num(entry.totalBottles)}병</div>}
              {entry && (
                <div className="col-span-2 flex items-center gap-1">
                  수출가 ×<b>{(entry.priceFactor ?? 1).toFixed(2)}</b>
                  <Button small onClick={() => dispatch({ type: 'setExportPrice', marketId: id, priceFactor: (entry.priceFactor ?? 1) - 0.1 })}>−</Button>
                  <Button small onClick={() => dispatch({ type: 'setExportPrice', marketId: id, priceFactor: (entry.priceFactor ?? 1) + 0.1 })}>+</Button>
                </div>
              )}
            </div>
            {!products.length ? <Empty>이 시장에 팔 수 있는 재고가 없습니다 ({Object.keys(m.categories).length}개 주종 취급)</Empty> : (
              <Table head={['제품', '출고가', '국내 소비자가', '수출가(FOB)', '현지 소비자가', '병당 순수입', '지난달 수요', '지난달 판매']}>
                {products.map((p) => {
                  const ok = exportEligible(p, m);
                  const sale = sales.find((x) => x.productId === p.id);
                  return (
                    <tr key={p.id}>
                      <Td className="max-w-56 truncate text-xs font-medium">{p.name}{!ok && <> <Badge tone="bad">숙성 기준 미달</Badge></>}</Td>
                      <Td right>{won(p.price)}</Td>
                      <Td right>{won(productConsumerPrice(s, p))}</Td>
                      <Td right>{won(exportFob(p, entry?.priceFactor ?? 1))}</Td>
                      <Td right>{won(exportShelfPrice(s, p, m, entry?.priceFactor ?? 1))}</Td>
                      <Td right>{won(exportFob(p, entry?.priceFactor ?? 1) - exportFreightPerBottle(s, p, m))}</Td>
                      <Td right>{sale ? num(sale.demandBottles) : '—'}</Td>
                      <Td right>{sale ? num(sale.bottles) : '—'}</Td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
        );
      })}
      <p className="text-xs text-stone-500">재고가 모자라면 국내와 수출에 수요 비율대로 나눕니다. 수출분은 수입상이 받아 가므로 국내 소매 처리 역량을 쓰지 않습니다. 현지 인지도는 진출 뒤 매달 오르고, 국내 인지도 일부가 넘어옵니다(면세점은 국내 인지도 그대로).</p>
    </div>
  );
}
