import { BULK, CASKS } from '../../sim/content/catalog';
import { cancellationCost, capacityLPA, contractTotalValue, domesticPremium, isNewMake, lotQuality, spotBidPerLPA, spotQuote } from '../../sim';
import { useGame } from '../../store/game';
import { liters, months, num, pct, won } from '../format';
import { Badge, Button, Card, Empty, Stat, Table, Td } from '../kit';

const STYLE_LABEL = { any: '무관', unpeated: '논피트', peated: '피트' } as const;

export function B2B() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const committed = s.contracts.reduce((t, c) => t + c.lpaPerMonth, 0);
  const maltLots = s.lots.filter((l) => l.kind === 'malt' || l.kind === 'grain');
  const maltCasks = s.casks.filter((c) => c.contents?.kind === 'malt' || c.contents?.kind === 'grain');

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="벌크 원액 시세 지수" value={s.bulkIndex.toFixed(2)} hint="위스키 트렌드와 연동, 매달 변동" tone={s.bulkIndex >= 1 ? 'good' : 'warn'} />
        <Stat label="B2B 신뢰도" value={Math.round(s.b2bTrust)} hint="납품 실적이 좋으면 상승 → 계약 단가·물량↑" />
        <Stat label="월 계약 물량" value={`${num(committed)} LPA`} hint={`생산 여력: 몰트 약 ${num(capacityLPA(s, 'malt'))} · 그레인 약 ${num(capacityLPA(s, 'grain'))} LPA/월 · 국산 프리미엄 ${pct(domesticPremium(s), 0)}`} />
        <Stat label="지난달 원액 매출" value={won(s.reports.at(-1)?.bulkRevenue ?? 0)} hint="계약 납품분 (현물 판매는 즉시 입금)" />
      </div>

      <Card title="공급 계약 제안 — 블렌디드 위스키 회사·브로커">
        {!s.contractOffers.length ? <Empty>제안이 없습니다</Empty> : (
          <Table head={['구매자', '원액', '스타일', '월 물량', '기간', '단가(LPA)', '최소 품질', '선급금', '총액', '미납 위약금', '']}>
            {s.contractOffers.map((o) => (
              <tr key={o.id}>
                <Td className="font-medium">{o.buyerName}{o.domestic && <> <Badge tone="good">국산 프리미엄</Badge></>}{o.craft && <> <Badge tone="good">크래프트 ×{BULK.craftPriceFactor}</Badge></>}</Td>
                <Td>{o.spirit === 'grain_newmake' ? '그레인 뉴메이크' : '몰트 뉴메이크'}</Td>
                <Td><Badge>{STYLE_LABEL[o.style]}</Badge></Td>
                <Td right>{num(o.lpaPerMonth)} LPA</Td>
                <Td right>{o.termMonths}개월</Td>
                <Td right>{won(o.pricePerLPA)}</Td>
                <Td right>{o.minQuality}</Td>
                <Td right>{o.prepayShare ? <Badge tone="good">{pct(o.prepayShare, 0)} · {won(contractTotalValue(o) * o.prepayShare)}</Badge> : '—'}</Td>
                <Td right>{won(contractTotalValue(o))}</Td>
                <Td right>{won(o.penaltyPerLPA)}/LPA</Td>
                <Td><Button small variant="primary" onClick={() => dispatch({ type: 'acceptContract', offerId: o.id })}>계약</Button></Td>
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-2 text-xs text-stone-500">계약하면 매달 말 생산이 끝난 뒤 조건에 맞는 탱크 뉴메이크가 오래된 것부터 자동 납품됩니다. 모자라면 위약금을 내고, 누적 미납이 두 달치가 되면 계약이 파기되며 신뢰도가 크게 떨어집니다. 계약 물량만큼 캐스크에 넣을 원액이 줄어든다는 점을 기억하세요.</p>
      </Card>

      <Card title="진행 중 계약">
        {!s.contracts.length ? <Empty>진행 중인 계약이 없습니다</Empty> : (
          <Table head={['구매자', '스타일', '월 물량', '단가', '진행', '누적 납품', '누적 미납', '남은 선급금', '']}>
            {s.contracts.map((c) => (
              <tr key={c.id}>
                <Td className="font-medium">{c.buyerName}</Td>
                <Td><Badge>{STYLE_LABEL[c.style]}</Badge> q≥{c.minQuality}</Td>
                <Td right>{num(c.lpaPerMonth)} LPA</Td>
                <Td right>{won(c.pricePerLPA)}</Td>
                <Td right>{c.monthsDone} / {c.termMonths}개월</Td>
                <Td right>{num(c.deliveredLPA)} LPA</Td>
                <Td right className={c.shortfallLPA > 0 ? 'text-rose-700 dark:text-rose-400' : ''}>{num(c.shortfallLPA)} LPA</Td>
                <Td right>{won(c.prepaidRemaining)}</Td>
                <Td><Button small variant="danger" onClick={() => dispatch({ type: 'cancelContract', contractId: c.id })}>해지 ({won(cancellationCost(c))})</Button></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="현물 벌크 판매 — 탱크 원액 (몰트·그레인)">
        {!maltLots.length ? <Empty>탱크에 몰트·그레인 원액이 없습니다</Empty> : (
          <Table head={['원액', '액량', '도수', 'LPA', '품질', '단가(LPA)', '판매 금액', 'LPA당 원가', '']}>
            {maltLots.map((l) => (
              <tr key={l.id}>
                <Td className="max-w-64 truncate text-xs font-medium">{l.name}{isNewMake(l) && <> <Badge>뉴메이크</Badge></>}</Td>
                <Td right>{liters(l.volumeL)}</Td>
                <Td right>{pct(l.abv)}</Td>
                <Td right>{num(l.volumeL * l.abv, 1)}</Td>
                <Td right>{lotQuality(l)}</Td>
                <Td right>{won(spotBidPerLPA(s, l))}</Td>
                <Td right>{won(spotQuote(s, l, l.volumeL))}</Td>
                <Td right>{won(l.costPerLPA)}</Td>
                <Td><Button small onClick={() => dispatch({ type: 'sellBulk', source: 'lot', id: l.id })}>전량 판매</Button></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="독립 병입자(IB) 캐스크 매입 제안 — 5년 이상·품질 70 이상 캐스크">
        {!s.caskBids.length ? <Empty>제안이 없습니다 (조건에 맞는 캐스크가 있으면 가끔 들어옵니다)</Empty> : (
          <Table head={['병입자', '캐스크', '숙성', '품질', '제안가(현물가의 135%)', '만료', '']}>
            {s.caskBids.map((b) => {
              const c = s.casks.find((x) => x.id === b.caskId);
              return (
                <tr key={b.id}>
                  <Td className="font-medium">{b.buyerName}</Td>
                  <Td>{b.caskId}</Td>
                  <Td right>{c?.contents ? months(c.contents.oakMonths) : '—'}</Td>
                  <Td right>{c?.contents ? lotQuality(c.contents) : '—'}</Td>
                  <Td right>{won(b.price)}</Td>
                  <Td right>{b.expiresMonth - s.month}개월 후</Td>
                  <Td><Button small variant="primary" onClick={() => dispatch({ type: 'acceptCaskBid', bidId: b.id })}>판매</Button></Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Card title="현물 벌크 판매 — 숙성 캐스크 (캐스크째)">
        {!maltCasks.length ? <Empty>숙성 중인 몰트 캐스크가 없습니다</Empty> : (
          <Table head={['캐스크', '종류', '숙성', '액량', '도수', '품질', '단가(LPA)', '판매 금액(캐스크 포함)', 'LPA당 원가', '']}>
            {maltCasks.map((c) => {
              const l = c.contents!;
              return (
                <tr key={c.id}>
                  <Td>{c.id}{l.sourced && <> <Badge tone="info">매입</Badge></>}</Td>
                  <Td className="text-xs">{CASKS[c.typeId].nameKo}</Td>
                  <Td right>{months(l.oakMonths)}</Td>
                  <Td right>{liters(l.volumeL)}</Td>
                  <Td right>{pct(l.abv)}</Td>
                  <Td right>{lotQuality(l)}</Td>
                  <Td right>{won(spotBidPerLPA(s, l))}</Td>
                  <Td right>{won(spotQuote(s, l, l.volumeL, c))}</Td>
                  <Td right>{won(l.costPerLPA)}</Td>
                  <Td><Button small onClick={() => dispatch({ type: 'sellBulk', source: 'cask', id: c.id })}>판매</Button></Td>
                </tr>
              );
            })}
          </Table>
        )}
        <p className="mt-2 text-xs text-stone-500">벌크 단가 = 기준가 × 숙성 연수 × 품질 × 피트 × 시세 지수 × 현물 할인(85%). 같은 원액을 브로커에게 살 때는 125%를 내므로 사고팔기만으로는 차익이 나지 않습니다. 숙성할수록 벌크 가치가 오르지만, 자사 브랜드로 병입하면 LPA당 수익이 훨씬 큽니다(대신 판매량이 브랜드 인지도에 묶입니다).</p>
      </Card>
    </div>
  );
}
