import { capacityReport, coverage, inventoryLoanRoom, inventoryLtv, liveDutyFreeEditions, monthLabel, monthlyFixedCost, siteOverhead, warehouseCapacity, waterPermitCap } from '../../sim';
import { REGIONS, siteOf } from '../../sim/content/regions';
import { hasPremiumChannel, retailCapacityCases, visitorTiers } from '../../sim/ops';
import { useGame } from '../../store/game';
import { Sparkline } from '../charts';
import { won, pct, liters, num } from '../format';
import { Badge, Button, Card, Empty, Meter, Stat, Table, Td } from '../kit';
import { EventsCard } from './Events';

const EXPENSE_LABEL: Record<string, string> = {
  production: '생산(원재료·에너지)', distribution: '유통비(채널·물류)', penalty: '계약 위약금', salaries: '급여', overhead: '관리비', heating: '난방비', storage: '캐스크 보관비·보험', maintenance: '설비 유지비', marketing: '마케팅', interest: '이자', principal: '원금 상환',
};

export function Dashboard() {
  const s = useGame((g) => g.state);
  const last = s.history.reports.at(-1);
  const recent = s.history.reports.slice(-3);
  const avgNet = recent.length ? recent.reduce((t, r) => t + r.netCash, 0) / recent.length : 0;
  const runway = avgNet < 0 ? Math.floor(s.finance.cash / -avgNet) : null;
  const filled = s.inventory.casks.filter((c) => c.contents).length;
  const tankLPA = s.inventory.lots.reduce((t, l) => t + l.volumeL * l.abv, 0);
  const cap = capacityReport(s);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="현금" value={won(s.finance.cash)} tone={s.finance.cash < 0 ? 'bad' : undefined} hint={s.finance.negativeCashMonths ? `현금 부족 ${s.finance.negativeCashMonths}개월째` : undefined} />
        <Stat label="최근 3개월 평균 순현금" value={recent.length ? won(avgNet) : '—'} tone={!recent.length ? undefined : avgNet >= 0 ? 'good' : 'bad'} hint={!recent.length ? '기록 없음' : runway != null ? `이 속도면 약 ${runway}개월 버팀` : '현금 흐름 흑자'} />
        <Stat label="월 고정비(예상)" value={won(monthlyFixedCost(s))} hint="급여·관리비·유지비·마케팅·대출" />
        <Stat label="브랜드 인지도" value={pct(s.commerce.awareness)} hint={`유통 커버리지 ${pct(coverage(s))}`} />
        <Stat label="숙성 중 캐스크" value={`${filled} / ${warehouseCapacity(s)}`} hint={`빈 캐스크 ${s.inventory.casks.length - filled}개`} />
        <Stat label="탱크 원액" value={`${num(tankLPA)} LPA`} hint={`${s.inventory.lots.length}개 로트`} />
        <Stat label="판매 중 제품" value={s.commerce.products.filter((p) => p.stockBottles > 0).length} hint={`재고 ${num(s.commerce.products.reduce((t, p) => t + p.stockBottles, 0))}병`} />
        <Stat label="대출 잔액" value={won(s.finance.loans.reduce((t, l) => t + l.balance, 0))} hint={`${s.finance.loans.length}건`} />
        <Stat label="소매 처리 역량 (지난달)" value={last?.retailCapacityCases != null ? `${num(last.retailSoldCases ?? 0)} / ${num(last.retailCapacityCases)} 케이스` : `${num(retailCapacityCases(s))} 케이스/월`} tone={last?.overflowCases ? 'warn' : undefined} hint={last?.overflowCases ? `초과 ${num(last.overflowCases)}케이스 고비용 채널${last.lostSalesBottles ? ` · ${num(last.lostSalesBottles)}병 못 팔음` : ''}` : `영업 직원·네트워크로 늘어남${hasPremiumChannel(s) ? ' · 고급 유통망 확보' : ''}`} />
        <Stat label="기상 (지난달, 평년 대비)" value={last?.weather ? `${last.weather.tempAnom > 0 ? '+' : ''}${last.weather.tempAnom.toFixed(1)}°C · 습도 ${last.weather.humidAnom > 0 ? '+' : ''}${last.weather.humidAnom.toFixed(0)}%p` : '—'} tone={last?.weather && Math.abs(last.weather.tempAnom) >= 2.5 ? 'warn' : undefined} hint={last?.weather?.shocks.length ? `이상 기후: ${last.weather.shocks.join(', ')}` : '더우면 증발(엔젤스 셰어)·숙성이 빨라진다'} />
        <Stat label="비지터 센터 (지난달)" value={visitorTiers(s).length ? `${num(last?.visitors ?? 0)}명 · ${won(last?.tourismRevenue ?? 0)}` : '없음'} hint={`입소문 ${pct(s.commerce.localBuzz)} — 첫 위스키 출시 때 오픈런 확률`} />
      </div>

      <SiteCard />

      <EventsCard />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="현금 추이" className="lg:col-span-2">
          <Sparkline values={s.history.reports.map((r) => r.cashEnd)} label="월말 현금 추이" />
          <div className="mt-2 flex justify-between text-xs text-stone-500">
            <span>{s.history.reports.length ? monthLabel(s.startYear, s.history.reports[0]!.month) : ''}</span>
            <span>{last ? monthLabel(s.startYear, last.month) : ''}</span>
          </div>
        </Card>
        <Card title="이번 달 가동 계획">
          <div className="grid gap-3">
            {cap.stills.map((st) => <Meter key={st.id} label={st.name} value={st.used} max={st.cap} />)}
            <Meter label="발효조 가동일" value={cap.fermenterDaysUsed} max={cap.fermenterDaysCap} />
            <Meter label="디스틸러 운전 횟수" value={cap.distillerRunsUsed} max={cap.distillerRunsCap} />
          </div>
        </Card>
      </div>

      <Card title={last ? `지난달 결산 — ${monthLabel(s.startYear, last.month)}` : '지난달 결산'}>
        {!last ? (
          <Empty>아직 진행한 달이 없습니다. 상단의 "1개월 진행"을 눌러 시작하세요.</Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <h3 className="mb-1 text-xs font-semibold text-stone-500">현금 흐름</h3>
              <Table head={['항목', '금액']}>
                <tr><Td>제품 매출</Td><Td right>{won(last.revenue - (last.oemRevenue ?? 0) - (last.receivablesCollected ?? 0))}</Td></tr>
                {(last.oemRevenue ?? 0) > 0 && <tr><Td>위탁생산 가공비</Td><Td right>{won(last.oemRevenue!)}</Td></tr>}
                {(last.receivablesCollected ?? 0) > 0 && <tr><Td>납품 대금 입금</Td><Td right>{won(last.receivablesCollected!)}</Td></tr>}
                {last.bulkRevenue > 0 && <tr><Td>원액 계약 납품</Td><Td right>{won(last.bulkRevenue)}</Td></tr>}
                {Object.entries(last.expenses).map(([k, v]) => <tr key={k}><Td>{EXPENSE_LABEL[k] ?? k}</Td><Td right>−{won(v)}</Td></tr>)}
                <tr className="font-semibold"><Td>순현금</Td><Td right>{won(last.netCash)}</Td></tr>
              </Table>
              <p className="mt-2 text-xs text-stone-500">매출은 출고가 기준. 주세·교육세 {won(last.liquorTaxRemitted)}은 구매자에게 받아 그대로 납부한 것으로 처리합니다.</p>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold text-stone-500">판매</h3>
              {last.sales.length ? (
                <Table head={['제품', '판매/수요', '매출']}>
                  {last.sales.map((x) => <tr key={x.productId}><Td>{x.name}</Td><Td right>{num(x.bottles)} / {num(x.demandBottles)}</Td><Td right>{won(x.revenue)}</Td></tr>)}
                </Table>
              ) : <Empty>판매된 제품이 없습니다</Empty>}
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold text-stone-500">생산 · 숙성</h3>
              {last.production.length ? (
                <Table head={['레시피', '배치', 'LPA']}>
                  {last.production.map((x) => <tr key={x.recipeId}><Td>{x.name}</Td><Td right>{x.batches}</Td><Td right>{num(x.lpa, 1)}</Td></tr>)}
                </Table>
              ) : <Empty>생산 없음</Empty>}
              <p className="mt-2 text-xs text-stone-500">엔젤스 셰어 증발: {liters(last.angelsShareL)}</p>
              {last.notes.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-amber-800 dark:text-amber-300">
                  {last.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/** 입지 카드 (결정 #86~): 특성 요약 + 취수 허가·면세 매대·난방·담보대출 상태 */
function SiteCard() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const site = siteOf(s);
  const last = s.history.reports.at(-1);
  if (!site.traits?.length) return null;
  const wp = site.waterPermit;
  const app = s.site.permitApplication;
  const live = liveDutyFreeEditions(s)[0];
  const dfAw = (last?.dutyFreeAwareness ?? 0) * 100;
  return (
    <Card title={`입지 — ${REGIONS[s.regionId].nameKo.replace(/\s*\(.*\)$/, '')} · ${site.nameKo}${site.difficulty ? ` ${'★'.repeat(site.difficulty)}` : ''}`}>
      {site.tagline && <p className="mb-2 text-sm text-stone-600 dark:text-stone-300">{site.tagline}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <ul className="grid gap-1 text-sm">
          {site.traits.map((t) => <li key={t.text} className={t.tone === 'good' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>{t.tone === 'good' ? '+' : '−'} {t.text}</li>)}
        </ul>
        <div className="grid content-start gap-2 text-sm">
          <div className="text-stone-600 dark:text-stone-300">관리비 월 {won(siteOverhead(s))}{site.water && site.water !== 'medium' ? ` · 물 ${site.water === 'volcanic' ? '화산암반수' : '연수'}` : ''}</div>
          {wp && (
            <div>
              <b>취수 허가</b> — 월 발효 투입 {liters(waterPermitCap(s))} 상한
              <div className="mt-1">
                {app
                  ? <Badge tone="warn">증량 심사 중 · {monthLabel(s.startYear, app.decideMonth)} 결과 · 승인 확률 {pct(app.chance, 0)}</Badge>
                  : <Button small disabled={s.finance.cash < wp.cost} onClick={() => dispatch({ type: 'applyWaterPermit' })}>증량 신청 (+{liters(wp.stepL)}, {won(wp.cost)}, {wp.months[0]}~{wp.months[1]}개월, 승인 {pct(wp.chance, 0)})</Button>}
              </div>
            </div>
          )}
          {site.dutyFree && (
            <div>
              <b>지정면세점</b> — 지난달 면세 판매 {num(last?.dutyFreeBottles ?? 0)}병 (주세·부가세 없음) · 관광객 입소문 인지도 {dfAw > 0 && dfAw < 0.01 ? '+0.01%p 미만' : `+${dfAw.toFixed(2)}%p`}
              <div className="text-xs text-stone-500">면세 한정판 매대: {live?.dfEdition ? `Vol.${live.dfEdition.vol} ${live.name} — 출시 ${s.month - live.createdMonth + 1}개월째, 남은 ${num(live.stockBottles)}병` : '비어 있음'} · 연속 완판 {s.site.dfSeries?.streak ?? 0}회</div>
            </div>
          )}
          {site.heating && <div><b>겨울 난방</b> — {site.heating.months.join('·')}월 난방비 월 {won(site.heating.perMonth)}, 증류 에너지비 ×{site.heating.energyFactor}</div>}
          {inventoryLtv(s) > 0 && <div><b>재고 담보대출</b> — 담보 인정 {pct(inventoryLtv(s), 0)}, 지금 더 빌릴 수 있는 한도 {won(inventoryLoanRoom(s))} (재무 탭)</div>}
        </div>
      </div>
    </Card>
  );
}
