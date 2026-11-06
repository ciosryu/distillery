import { BULK, CASKS } from '../../sim/content/catalog';
import { regionOf, siteOf } from '../../sim/content/regions';
import { CATEGORY } from '../../sim/content/categories';
import { oemPackageCost, cancellationCost, capacityLPA, contractAgingImpact, contractTotalValue, domesticPremium, isNewMake, lotQuality, monthLabel, spotBidPerLPA, spotQuote, spotSaturation, type ContractAgingImpact, type GameState } from '../../sim';
import { useGame } from '../../store/game';
import { liters, months, num, pct, won } from '../format';
import { Badge, Button, Card, Empty, Stat, Table, Td } from '../kit';

const STYLE_LABEL = { any: '무관', unpeated: '논피트', peated: '피트' } as const;

/** 계약 종료 경고 (§16.16): 첫 위스키 출시 이후까지 납품이 이어지면 그만큼 3년 뒤 위스키가 빈다 */
function AgingImpact({ s, i }: { s: GameState; i: ContractAgingImpact }) {
  const safe = i.overlapMonths === 0;
  return (
    <div className="text-xs leading-snug">
      <div>납품 종료 <b>{monthLabel(s.startYear, i.endMonth)}</b> ({i.endMonth - s.month}개월 후)</div>
      <div className="text-stone-500">숙성고에 못 들어가는 원액 {num(i.divertedLPA)} LPA ≈ 위스키 {num(i.bottleEquivalent)}병</div>
      {safe
        ? <Badge tone="good">첫 위스키({monthLabel(s.startYear, i.firstWhiskyMonth)}) 전에 끝남</Badge>
        : <Badge tone="bad">첫 위스키 출시 뒤 {i.overlapMonths}개월 더 납품 → {monthLabel(s.startYear, i.whiskyGap[0])}~{monthLabel(s.startYear, i.whiskyGap[1])} 위스키 감소</Badge>}
    </div>
  );
}

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
        <Stat label="지난달 원액 매출" value={won((s.reports.at(-1)?.bulkRevenue ?? 0) + (s.reports.at(-1)?.spotBulkRevenue ?? 0))} hint={`계약 납품 ${won(s.reports.at(-1)?.bulkRevenue ?? 0)} + 현물·IB 매각 ${won(s.reports.at(-1)?.spotBulkRevenue ?? 0)} (현물 판매는 즉시 입금, 다음 결산에 집계)`} />
      </div>

      <SiteDeals />

      <Card title="공급 계약 제안 — 블렌디드 위스키 회사·브로커">
        {!s.contractOffers.length ? <Empty>제안이 없습니다</Empty> : (
          <Table head={['구매자', '원액', '스타일', '월 물량', '기간', '단가(LPA)', '최소 품질', '선급금', '총액', '미납 위약금', '숙성 영향', '']}>
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
                <Td><AgingImpact s={s} i={contractAgingImpact(s, o)} /></Td>
                <Td><Button small variant="primary" onClick={() => dispatch({ type: 'acceptContract', offerId: o.id })}>계약</Button></Td>
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-2 text-xs text-stone-500">계약하면 매달 말 생산이 끝난 뒤 조건에 맞는 탱크 뉴메이크가 오래된 것부터 자동 납품됩니다. 모자라면 위약금을 내고, 누적 미납이 두 달치가 되면 계약이 파기되며 신뢰도가 크게 떨어집니다. 계약 물량만큼 캐스크에 넣을 원액이 줄어듭니다 — LPA당 병입 위스키 가치는 현물 원액의 약 5배이므로, <b>뉴메이크 계약은 첫 위스키가 나오기 전에 끝나게</b> 잡는 것이 좋습니다(빨간 경고).</p>
      </Card>

      <Card title="진행 중 계약">
        {!s.contracts.length ? <Empty>진행 중인 계약이 없습니다</Empty> : (
          <Table head={['구매자', '스타일', '월 물량', '단가', '진행', '누적 납품', '누적 미납', '남은 선급금', '숙성 영향', '']}>
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
                <Td><AgingImpact s={s} i={contractAgingImpact(s, c)} /></Td>
                <Td><Button small variant="danger" onClick={() => dispatch({ type: 'cancelContract', contractId: c.id })}>해지 ({won(cancellationCost(c))})</Button></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="현물 벌크 판매 — 탱크 원액 (몰트·그레인)">
        {Number.isFinite(regionOf(s).grainSpotDepthLPA) && <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">이 지역은 그레인 현물 시장이 얕습니다(깊이 {num(regionOf(s).grainSpotDepthLPA)} LPA). 최근 판매량 {num(s.spotSoldLPA?.grain ?? 0)} LPA — 많이 팔수록 단가가 떨어지고 매달 {pct(1 - BULK.spotDecay, 0)}씩 회복합니다.</p>}
        {!maltLots.length ? <Empty>탱크에 몰트·그레인 원액이 없습니다</Empty> : (
          <Table head={['원액', '액량', '도수', 'LPA', '품질', '단가(LPA)', '판매 금액', 'LPA당 원가', '']}>
            {maltLots.map((l) => (
              <tr key={l.id}>
                <Td className="max-w-64 truncate text-xs font-medium">{l.name}{isNewMake(l) && <> <Badge>뉴메이크</Badge></>}</Td>
                <Td right>{liters(l.volumeL)}</Td>
                <Td right>{pct(l.abv)}</Td>
                <Td right>{num(l.volumeL * l.abv, 1)}</Td>
                <Td right>{lotQuality(l)}</Td>
                <Td right>{won(spotBidPerLPA(s, l))}{l.kind === 'grain' && spotSaturation(s, l, l.volumeL * l.abv) < 0.95 && <> <Badge tone="warn">전량 팔면 ×{spotSaturation(s, l, l.volumeL * l.abv).toFixed(2)}</Badge></>}</Td>
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

/** 입지 대표 거래 (결정 #88·#89): 경기 대형 유통 납품 / 간토 위탁생산 + 받을 대금 */
function SiteDeals() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const deals = siteOf(s).deals ?? [];
  if (!deals.length && !s.receivables.length) return null;
  return (
    <>
      {deals.includes('retail') && (
        <Card title="대형 유통 납품 — 큰 물량·출고가의 80%·대금 2개월 뒤, 계약 중 숙성 위스키 매력도 ×0.9·인지도 상승 ×1.2">
          <Table head={['유통사', '카테고리', '월 납품', '단가', '기간', '병당 위약금', '상태', '']}>
            {s.retailOffers.map((o) => (
              <tr key={o.id}>
                <Td className="font-medium">{o.partner}</Td><Td>{CATEGORY[o.category].nameKo}</Td><Td right>{num(o.bottlesPerMonth)}병</Td>
                <Td right>출고가 × {pct(o.priceFactor, 0)}</Td><Td right>{o.termMonths}개월</Td><Td right>{won(o.penaltyPerBottle)}</Td>
                <Td><Badge tone="info">제안 · {o.expiresMonth - s.month}개월 후 만료</Badge></Td>
                <Td><Button small variant="primary" onClick={() => dispatch({ type: 'acceptRetail', offerId: o.id })}>체결</Button></Td>
              </tr>
            ))}
            {s.retailContracts.map((c) => (
              <tr key={c.id}>
                <Td className="font-medium">{c.partner}</Td><Td>{CATEGORY[c.category].nameKo}</Td><Td right>{num(c.bottlesPerMonth)}병</Td>
                <Td right>출고가 × {pct(c.priceFactor, 0)}</Td><Td right>{c.monthsDone}/{c.termMonths}개월</Td><Td right>{won(c.penaltyPerBottle)}</Td>
                <Td><Badge tone={c.shortfall ? 'warn' : 'good'}>진행 중 · 누적 미납 {num(c.shortfall)}병</Badge></Td>
                <Td><Button small variant="danger" onClick={() => dispatch({ type: 'cancelRetail', contractId: c.id })}>해지</Button></Td>
              </tr>
            ))}
          </Table>
          {!s.retailOffers.length && !s.retailContracts.length && <Empty>제안이 없습니다 (가끔 들어옵니다)</Empty>}
        </Card>
      )}
      {deals.includes('oem') && (
        <Card title="위탁생산(OEM) — 원료는 위탁사 부담, 가공비를 받고 증류 설비를 먼저 내준다 (몰트 2회 증류 배치). 남는 설비가 없으면 위탁사가 전용 증류기 설치비 60% 지원">
          <Table head={['위탁사', '월 배치', '배치당 가공비', '기간', '배치당 위약금', '상태', '']}>
            {s.oemOffers.map((o) => (
              <tr key={o.id}>
                <Td className="font-medium">{o.buyerName}{o.dedicated && <div className="text-xs text-stone-500">전용 증류기 패키지: 설치비 {won(oemPackageCost(s))} 중 위탁사 지원 {won(o.capexSupport ?? 0)} → 우리 부담 {won(oemPackageCost(s) - (o.capexSupport ?? 0))}, 설치 후 시작</div>}</Td><Td right>{o.batchesPerMonth}</Td><Td right>{won(o.feePerBatch)}</Td><Td right>{o.termMonths}개월</Td><Td right>{won(o.penaltyPerBatch)}</Td>
                <Td><Badge tone="info">제안 · {o.expiresMonth - s.month}개월 후 만료</Badge></Td>
                <Td><Button small variant="primary" onClick={() => dispatch({ type: 'acceptOem', offerId: o.id })}>체결</Button></Td>
              </tr>
            ))}
            {s.oemContracts.map((c) => (
              <tr key={c.id}>
                <Td className="font-medium">{c.buyerName}</Td><Td right>{c.batchesPerMonth}</Td><Td right>{won(c.feePerBatch)}</Td><Td right>{c.monthsDone}/{c.termMonths}개월</Td><Td right>{won(c.penaltyPerBatch)}</Td>
                <Td><Badge tone={c.missed ? 'warn' : 'good'}>{s.month < c.startMonth ? `전용 증류기 설치 중 · ${monthLabel(s.startYear, c.startMonth)} 시작` : `진행 중 · 누적 미이행 ${c.missed}배치`}</Badge></Td><Td />
              </tr>
            ))}
          </Table>
          {!s.oemOffers.length && !s.oemContracts.length && <Empty>제안이 없습니다 (가끔 들어옵니다)</Empty>}
        </Card>
      )}
      {s.receivables.length > 0 && (
        <Card title="받을 대금 (매출채권)">
          <Table head={['내용', '입금 예정', '금액']}>
            {s.receivables.map((r, i) => <tr key={i}><Td>{r.label}</Td><Td right>{r.dueMonth - s.month}개월 후</Td><Td right>{won(r.amount)}</Td></tr>)}
          </Table>
        </Card>
      )}
    </>
  );
}
