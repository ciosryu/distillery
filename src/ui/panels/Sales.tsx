import { CATEGORY } from '../../sim/content/categories';
import { categoryName, consumerPrice, regionOf } from '../../sim/content/regions';
import { bottleMargin, calendar, coverage, demandFor, dutyFreeDemand, productConsumerPrice } from '../../sim';
import { DUTY_FREE, siteOf } from '../../sim/content/sites';
import { useGame } from '../../store/game';
import { num, pct, won } from '../format';
import { Badge, Card, Empty, NumberField, Stat, Table, Td } from '../kit';

export function Sales() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const { monthOfYear } = calendar(s);
  const region = regionOf(s);
  const site = siteOf(s);
  // 위스키 기준 예시 (기준판매비율은 카테고리별로 다르다)
  const sample = consumerPrice(region, 10_000, 700, 0.4, 1, { category: 'whisky' }) / 10_000;
  const deduction = region.tax.baseDeduction;
  const active = s.products.filter((p) => p.stockBottles > 0 || p.lastMonthSold > 0);
  const counts = active.reduce<Record<string, number>>((m, p) => { if (p.stockBottles > 0) m[p.category] = (m[p.category] ?? 0) + 1; return m; }, {});

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="브랜드 인지도" value={pct(s.awareness)} hint="마케팅·판매량·품질로 상승" />
        <Stat label="유통 커버리지" value={pct(coverage(s))} hint="영업 직원 네트워크" />
        <Stat label="출고가 → 소비자가 (위스키 700ml 40%, 출고가 1만 원 기준)" value={`× ${sample.toFixed(2)}`} hint={<>{region.tax.label}{deduction && <> · 기준판매비율 소주 {pct(deduction.soju_distilled ?? 0)} · 위스키 {pct(deduction.whisky ?? 0)} · 진·고량주 {pct(deduction.gin ?? 0)}</>}{site.outboundLogistics !== 1 && <> · 출고 물류 ×{site.outboundLogistics}</>}</>} />
        <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-900">
          <div className="text-xs text-stone-500">월 마케팅 예산</div>
          <NumberField value={s.marketingBudget / 10_000} min={0} max={100_000} width="w-24" suffix="만 원" onCommit={(v) => dispatch({ type: 'setMarketing', amount: v * 10_000 })} />
        </div>
      </div>

      <Card title="제품">
        {!active.length ? <Empty>판매 중인 제품이 없습니다. 블렌딩·병입 탭에서 병입하세요.</Empty> : (
          <Table head={['제품', '카테고리', '규격', '품질', '재고', '출고가(병)', '소비자가', '기준가 대비', '이번 달 예상 수요', '지난달 판매', '누적', '병당 공헌이익']}>
            {active.map((p) => {
              const d = demandFor(s, p, counts[p.category] ?? 1, monthOfYear);
              const df = site.dutyFree ? dutyFreeDemand(s, p, counts[p.category] ?? 1, monthOfYear) : 0;
              const ratio = d.consumerPricePerL / d.refPricePerL;
              return (
                <tr key={p.id}>
                  <Td className="font-medium">{p.name}</Td>
                  <Td><Badge tone="info">{categoryName(region, p.category, CATEGORY[p.category].nameKo)}</Badge>{p.ageYears != null && <> <Badge tone="good">{p.ageYears}년</Badge></>}{p.traditional && <> <Badge tone="good">전통주</Badge></>}{p.dutyFreeOnly && p.localIngredient && <> <Badge tone="good">제주 원료</Badge></>}{p.dutyFreeOnly && p.dfEdition && <> <Badge tone="warn">면세 Vol.{p.dfEdition.vol} · {s.month - p.createdMonth + 1}/{DUTY_FREE.sellOutMonths}개월</Badge></>}</Td>
                  <Td className="text-xs">{p.bottleMl}ml · {pct(p.abv)}</Td>
                  <Td right>{p.quality}</Td>
                  <Td right>{num(p.stockBottles)}</Td>
                  <Td><NumberField value={p.price} min={100} step={100} width="w-24" onCommit={(v) => dispatch({ type: 'setPrice', productId: p.id, price: v })} /></Td>
                  <Td right>{won(productConsumerPrice(s, p))}</Td>
                  <Td right className={ratio > 1.3 ? 'text-rose-700 dark:text-rose-400' : ratio < 0.8 ? 'text-emerald-700 dark:text-emerald-400' : ''}>{pct(ratio, 0)}</Td>
                  <Td right>{num(d.demandBottles)}병{df > 0 && <div className="text-xs text-stone-500">+ 면세 {num(df)}병</div>}</Td>
                  <Td right>{num(p.lastMonthSold)}{(p.lastMonthDutyFree ?? 0) > 0 && <div className="text-xs text-stone-500">면세 {num(p.lastMonthDutyFree!)}</div>}</Td>
                  <Td right>{num(p.totalSold)}</Td>
                  <Td right>{(() => { const m = bottleMargin(p, site.outboundLogistics); return <span className={m.rate < 0.15 ? 'text-rose-700 dark:text-rose-400' : m.rate > 0.5 ? 'text-emerald-700 dark:text-emerald-400' : ''}>{won(m.perBottle)} ({pct(m.rate, 0)})</span>; })()}</Td>
                </tr>
              );
            })}
          </Table>
        )}
        <p className="mt-2 text-xs text-stone-500">병당 공헌이익 = 출고가 − (원액·포장·병입 인건비) − 유통비(채널 수수료 12% + 물류). 진·저가 제품은 가격 결정권이 낮아 마진이 얇고, 숙성 위스키는 두껍습니다. 예상 수요 = 시장 규모 × 계절·트렌드 × 도달률(인지도 × 커버리지 × 점유 상한) × 제품 매력도 × 가격 탄력성. 같은 카테고리 제품이 여러 개면 서로 수요를 나눠 갖습니다. 전통주는 주세 감면과 온라인 직판(커버리지 가산)을 받습니다.{site.dutyFree && ' 지정면세점 판매분은 주세·부가세가 없고 육지 출고 물류 할증도 없습니다.'}</p>
      </Card>

      <Card title={`${region.nameKo} 시장 (연간 기본 수요)`}>
        <Table head={['카테고리', '연간 수요(9L 케이스)', '기준 소비자가(L)', '가격 탄력성', '단일 브랜드 점유 상한', '트렌드', '출처']}>
          {(Object.keys(region.market) as (keyof typeof region.market)[]).filter((k) => region.market[k].baseCases > 0).map((k) => {
            const m = region.market[k];
            return (
              <tr key={k}>
                <Td>{categoryName(region, k, CATEGORY[k].nameKo)}</Td>
                <Td right>{num(m.baseCases)}</Td>
                <Td right>{won(m.refConsumerPricePerL)}</Td>
                <Td right>{m.elasticity}</Td>
                <Td right>{pct(m.shareCap, m.shareCap < 0.01 ? 1 : 0)}</Td>
                <Td right>{(s.trend[k] ?? 1).toFixed(2)}</Td>
                <Td className="text-xs text-stone-500">{m.baseSource}</Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </div>
  );
}
