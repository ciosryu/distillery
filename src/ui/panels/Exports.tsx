import { EXPORT_MARKETS, effectiveTariff, exportEligible, exportFob, exportFreightPerBottle, exportMarketsFor, exportShelfPrice, productConsumerPrice } from '../../sim';
import { useGame } from '../../store/game';
import { num, pct, won } from '../format';
import { Badge, Button, Card, Empty, Stat, Table, Td } from '../kit';

/** 수출 시장 (#95, 확장 #100~#104): 수입사 제안·계약·해지, 시장 조건, 제품별 현지 소비자가와 판매 */
export function Exports() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const last = s.reports.at(-1);
  const opened = s.exports ?? [];
  const offers = s.exportOffers ?? [];
  const markets = exportMarketsFor(s.regionId);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="계약 시장" value={`${opened.length} / ${markets.length}`} hint={offers.length ? `수입사 제안 ${offers.length}건` : '제안은 가끔 들어옵니다'} />
        <Stat label="지난달 수출 매출" value={won(last?.exportRevenue ?? 0)} hint="수입사 매입가(출고가 × 계약 비율) — 대금은 계약의 지급 기한 뒤 입금" />
        <Stat label="지난달 수출 운임" value={won(last?.expenses.export_freight ?? 0)} />
        <Stat label="월 현지 마케팅 분담" value={won(last?.expenses.export_fixed ?? 0)} hint="많이 낼수록 현지 인지도가 빨리 오른다" />
      </div>

      {markets.map((id) => {
        const m = EXPORT_MARKETS[id];
        const entry = opened.find((e) => e.marketId === id);
        const offer = offers.find((o) => o.marketId === id);
        const ready = !!entry && entry.readyMonth <= s.month;
        const sales = last?.exports?.filter((x) => x.marketId === id) ?? [];
        const products = s.products.filter((p) => p.stockBottles > 0 && !p.dutyFreeOnly && m.categories[p.category]);
        const factor = entry?.priceFactor ?? offer?.priceFactor ?? 1;
        const tariff = effectiveTariff(s, m);
        return (
          <Card
            key={id}
            title={<>{m.nameKo} {entry ? (ready ? <Badge tone="good">판매 중</Badge> : <Badge tone="warn">준비 중 — {entry.readyMonth - s.month}개월</Badge>) : offer ? <Badge tone="info">수입사 제안</Badge> : <Badge>계약 없음</Badge>}</>}
            actions={entry ? <Button small variant="danger" onClick={() => dispatch({ type: 'closeExport', marketId: id })}>해지 (위약금 {won((entry.marketingPerMonth ?? 0) * 3)})</Button> : undefined}
          >
            <p className="mb-2 text-xs text-stone-500">{m.descKo}</p>
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-6">
              <div>관세 <b>{pct(tariff, 1)}</b>{tariff !== m.tariff[s.regionId] && <span className="text-amber-700"> (이벤트)</span>}</div>
              <div>현지 주세 {m.adValorem ? <b>{pct(m.adValorem, 1)}</b> : <><b>{won(m.excisePerLPA)}</b>/LPA</>}</div>
              <div>부가세 <b>{pct(m.vat, 0)}</b></div>
              <div>유통 배수 <b>×{m.channelMultiple}</b></div>
              <div>운임 <b>{won(m.freightPerBottle[s.regionId])}</b>/병</div>
              <div>국내 인지도 후광 <b>{m.awareness.domesticSpill ? '있음' : '없음'}</b></div>
              {m.minWhiskyMonths > 0 && <div className="col-span-2">위스키는 <b>{m.minWhiskyMonths / 12}년 숙성 이상</b>만</div>}
              {entry && <div className="col-span-3">현지 인지도 <b>{pct(entry.awareness, 1)}</b> · 누적 {num(entry.totalBottles)}병{entry.minBottlesPerYear != null && <> · 올해 {num(entry.bottlesThisYear ?? 0)} / 최소 {num(entry.minBottlesPerYear)}병</>}</div>}
            </div>

            {offer && !entry && (
              <div className="mb-3 rounded-md border border-sky-200 bg-sky-50 p-2 text-xs dark:border-sky-900 dark:bg-sky-950/40">
                <b>{offer.partner}</b> 제안 — 매입가 출고가의 <b>{pct(offer.priceFactor, 0)}</b> · 마케팅 분담 월 <b>{won(offer.marketingPerMonth)}</b> · {offer.termMonths}개월 · 연 최소 <b>{num(offer.minBottlesPerYear)}병</b> · 대금 {offer.paymentDelay}개월 뒤
                {offer.entryCost > 0 && <> · 시장 개척비 <b>{won(offer.entryCost)}</b> ({m.entryMonths}개월 준비)</>} · {offer.expiresMonth - s.month}개월 후 만료
                <div className="mt-1"><Button small variant="primary" disabled={s.cash < offer.entryCost} onClick={() => dispatch({ type: 'acceptExportOffer', offerId: offer.id })}>계약</Button></div>
              </div>
            )}

            {!products.length ? <Empty>이 시장에 팔 수 있는 재고가 없습니다 ({Object.keys(m.categories).length}개 주종 취급)</Empty> : (
              <Table head={['제품', '출고가', '수입사 매입가', '국내 소비자가', '현지 소비자가', '병당 순수입', '지난달 수요', '지난달 판매']}>
                {products.map((p) => {
                  const ok = exportEligible(p, m);
                  const sale = sales.find((x) => x.productId === p.id);
                  return (
                    <tr key={p.id}>
                      <Td className="max-w-56 truncate text-xs font-medium">{p.name}{!ok && <> <Badge tone="bad">숙성 기준 미달</Badge></>}</Td>
                      <Td right>{won(p.price)}</Td>
                      <Td right>{won(exportFob(p, factor))}</Td>
                      <Td right>{won(productConsumerPrice(s, p))}</Td>
                      <Td right>{won(exportShelfPrice(s, p, m, factor))}</Td>
                      <Td right>{won(exportFob(p, factor) - exportFreightPerBottle(s, p, m))}</Td>
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
      <p className="text-xs text-stone-500">시장마다 수입사 1곳과 계약합니다. 수입사는 출고가의 일정 비율(매입가)로 사 가고, 대금은 지급 기한 뒤 들어옵니다. 1년 판매가 연 최소 물량에 못 미치면 수입사가 계약을 끝내고, 기간이 끝나면 자동 갱신됩니다. 재고가 모자라면 국내와 수출에 수요 비율대로 나눕니다(수출분은 국내 소매 처리 역량을 쓰지 않습니다). 현지 인지도는 0에서 시작해 마케팅 분담만큼 오르며, 공항 면세점만 국내 인지도가 그대로 넘어옵니다.</p>
    </div>
  );
}
