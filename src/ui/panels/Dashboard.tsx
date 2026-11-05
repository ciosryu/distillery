import { calendar, capacityReport, coverage, hasUpgrade, monthLabel, monthlyFixedCost, riskScale, traditionalReliefRate, warehouseCapacity, waterPermitCap } from '../../sim';
import { REGIONS } from '../../sim/content/regions';
import { siteOf } from '../../sim/content/sites';
import { useGame } from '../../store/game';
import { Sparkline } from '../charts';
import { won, pct, liters, num } from '../format';
import { Badge, Button, Card, Empty, Meter, Stat, Table, Td } from '../kit';
import { EventsCard } from './Events';

const EXPENSE_LABEL: Record<string, string> = {
  production: '생산(원재료·에너지)', distribution: '유통비(채널·물류)', penalty: '계약 위약금', salaries: '급여', overhead: '관리비', heating: '난방비', maintenance: '설비 유지비', marketing: '마케팅', interest: '이자', principal: '원금 상환',
};

/** 산지 특성과 산지 고유 상태 (regions.md Tier 1) */
function SiteCard() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const site = siteOf(s);
  const country = REGIONS[s.regionId];
  const wp = site.waterPermit;
  const app = s.siteState.permitApplication;
  const shipped = s.siteState.traditionalShipped;
  const thisYear = shipped && shipped.year === calendar(s).year ? shipped.liters : 0;
  const quake = riskScale(s, 'earthquake');
  return (
    <Card title={<>산지 — {country.nameKo} · {site.nameKo} <span className="text-xs font-normal text-stone-500">{'★'.repeat(site.difficulty)} · {site.tagline}</span></>}>
      <div className="grid gap-3 md:grid-cols-2">
        <ul className="grid gap-0.5 text-sm">
          {site.traits.map((x) => <li key={x.text} className={x.tone === 'good' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>{x.tone === 'good' ? '＋' : '－'} {x.text}</li>)}
        </ul>
        <div className="grid content-start gap-2 text-sm">
          <div className="text-stone-600 dark:text-stone-300">
            관리비 월 {won(site.overheadPerMonth)} · 엔젤스 셰어 보정 ×{site.angelShareFactor} · 물 {site.water === 'soft' ? '연수' : site.water === 'volcanic' ? '화산암반수' : '보통'}
          </div>
          {site.traditional && country.traditional && (
            <div>
              <b>전통주</b> — 올해 출고 {liters(thisYear)} · 현재 감면율 {pct(traditionalReliefRate(s, true), 0)}
              <div className="text-xs text-stone-500">{country.traditional.label}. 전년 출고 {liters(country.traditional.eligibleMaxLastYearL)} 초과 시 자격 상실</div>
            </div>
          )}
          {wp && (
            <div>
              <b>취수 허가</b> — 월 발효 투입 {liters(waterPermitCap(s))} 상한
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {app
                  ? <Badge tone="warn">증량 심사 중 · {monthLabel(s.startYear, app.decideMonth)} 결과 · 승인 확률 {pct(app.chance, 0)}</Badge>
                  : <Button small disabled={s.cash < wp.cost} onClick={() => dispatch({ type: 'applyWaterPermit' })}>증량 신청 (+{liters(wp.stepL)}, {won(wp.cost)}, {wp.months[0]}~{wp.months[1]}개월, 승인 {pct(wp.chance, 0)})</Button>}
              </div>
            </div>
          )}
          {site.dutyFree && <div><b>지정면세점</b> — 지난달 면세 판매 {num(s.reports.at(-1)?.dutyFreeBottles ?? 0)}병 (주세·부가세 없음)</div>}
          {site.winterFerment && <div><b>겨울 발효</b> — {site.winterFerment.months.join('·')}월 발효조 가동 {pct(site.winterFerment.capacity, 0)} {hasUpgrade(s, 'temp_control') ? <Badge tone="good">온도 제어 설비로 해소</Badge> : <span className="text-xs text-stone-500">(생산 탭에서 온도 제어 설비 발주)</span>}</div>}
          {quake < 1 && <div><b>지진 대비</b> — 피해 {pct(1 - quake, 0)} 경감</div>}
        </div>
      </div>
    </Card>
  );
}

export function Dashboard() {
  const s = useGame((g) => g.state);
  const last = s.reports.at(-1);
  const recent = s.reports.slice(-3);
  const avgNet = recent.length ? recent.reduce((t, r) => t + r.netCash, 0) / recent.length : 0;
  const runway = avgNet < 0 ? Math.floor(s.cash / -avgNet) : null;
  const filled = s.casks.filter((c) => c.contents).length;
  const tankLPA = s.lots.reduce((t, l) => t + l.volumeL * l.abv, 0);
  const cap = capacityReport(s);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="현금" value={won(s.cash)} tone={s.cash < 0 ? 'bad' : undefined} hint={s.negativeCashMonths ? `현금 부족 ${s.negativeCashMonths}개월째` : undefined} />
        <Stat label="최근 3개월 평균 순현금" value={recent.length ? won(avgNet) : '—'} tone={!recent.length ? undefined : avgNet >= 0 ? 'good' : 'bad'} hint={!recent.length ? '기록 없음' : runway != null ? `이 속도면 약 ${runway}개월 버팀` : '현금 흐름 흑자'} />
        <Stat label="월 고정비(예상)" value={won(monthlyFixedCost(s))} hint="급여·관리비·유지비·마케팅·대출" />
        <Stat label="브랜드 인지도" value={pct(s.awareness)} hint={`유통 커버리지 ${pct(coverage(s))}`} />
        <Stat label="숙성 중 캐스크" value={`${filled} / ${warehouseCapacity(s)}`} hint={`빈 캐스크 ${s.casks.length - filled}개`} />
        <Stat label="탱크 원액" value={`${num(tankLPA)} LPA`} hint={`${s.lots.length}개 로트`} />
        <Stat label="판매 중 제품" value={s.products.filter((p) => p.stockBottles > 0).length} hint={`재고 ${num(s.products.reduce((t, p) => t + p.stockBottles, 0))}병`} />
        <Stat label="대출 잔액" value={won(s.loans.reduce((t, l) => t + l.balance, 0))} hint={`${s.loans.length}건`} />
      </div>

      <EventsCard />

      <SiteCard />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="현금 추이" className="lg:col-span-2">
          <Sparkline values={s.reports.map((r) => r.cashEnd)} label="월말 현금 추이" />
          <div className="mt-2 flex justify-between text-xs text-stone-500">
            <span>{s.reports.length ? monthLabel(s.startYear, s.reports[0]!.month) : ''}</span>
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
                <tr><Td>제품 매출</Td><Td right>{won(last.revenue)}</Td></tr>
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
