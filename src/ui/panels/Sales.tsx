import { CATEGORY } from '../../sim/content/categories';
import { KOREA } from '../../sim/content/korea';
import { calendar, coverage, demandFor, effectiveConsumerMultiplier } from '../../sim';
import { useGame } from '../../store/game';
import { num, pct, won } from '../format';
import { Badge, Card, Empty, NumberField, Stat, Table, Td } from '../kit';

export function Sales() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const { monthOfYear } = calendar(s);
  const mult = effectiveConsumerMultiplier(s);
  const active = s.products.filter((p) => p.stockBottles > 0 || p.lastMonthSold > 0);
  const counts = active.reduce<Record<string, number>>((m, p) => { if (p.stockBottles > 0) m[p.category] = (m[p.category] ?? 0) + 1; return m; }, {});

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="브랜드 인지도" value={pct(s.awareness)} hint="마케팅·판매량·품질로 상승" />
        <Stat label="유통 커버리지" value={pct(coverage(s))} hint="영업 직원 네트워크" />
        <Stat label="출고가 → 소비자가" value={`× ${mult.toFixed(2)}`} hint="주세 72%·교육세·부가세·유통 마진" />
        <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-900">
          <div className="text-xs text-stone-500">월 마케팅 예산</div>
          <NumberField value={s.marketingBudget / 10_000} min={0} max={100_000} width="w-24" suffix="만 원" onCommit={(v) => dispatch({ type: 'setMarketing', amount: v * 10_000 })} />
        </div>
      </div>

      <Card title="제품">
        {!active.length ? <Empty>판매 중인 제품이 없습니다. 블렌딩·병입 탭에서 병입하세요.</Empty> : (
          <Table head={['제품', '카테고리', '규격', '품질', '재고', '출고가(병)', '소비자가', '기준가 대비', '이번 달 예상 수요', '지난달 판매', '누적', '병당 마진']}>
            {active.map((p) => {
              const d = demandFor(s, p, counts[p.category] ?? 1, monthOfYear);
              const ratio = d.consumerPricePerL / d.refPricePerL;
              return (
                <tr key={p.id}>
                  <Td className="font-medium">{p.name}</Td>
                  <Td><Badge tone="info">{CATEGORY[p.category].nameKo}</Badge>{p.ageYears != null && <> <Badge tone="good">{p.ageYears}년</Badge></>}</Td>
                  <Td className="text-xs">{p.bottleMl}ml · {pct(p.abv)}</Td>
                  <Td right>{p.quality}</Td>
                  <Td right>{num(p.stockBottles)}</Td>
                  <Td><NumberField value={p.price} min={100} step={100} width="w-24" onCommit={(v) => dispatch({ type: 'setPrice', productId: p.id, price: v })} /></Td>
                  <Td right>{won(p.price * mult)}</Td>
                  <Td right className={ratio > 1.3 ? 'text-rose-700 dark:text-rose-400' : ratio < 0.8 ? 'text-emerald-700 dark:text-emerald-400' : ''}>{pct(ratio, 0)}</Td>
                  <Td right>{num(d.demandBottles)}병</Td>
                  <Td right>{num(p.lastMonthSold)}</Td>
                  <Td right>{num(p.totalSold)}</Td>
                  <Td right>{won(p.price - p.unitCost)}</Td>
                </tr>
              );
            })}
          </Table>
        )}
        <p className="mt-2 text-xs text-stone-500">예상 수요 = 시장 규모 × 계절·트렌드 × 도달률(인지도 × 커버리지 × 점유 상한) × 제품 매력도 × 가격 탄력성. 같은 카테고리 제품이 여러 개면 서로 수요를 나눠 갖습니다.</p>
      </Card>

      <Card title="한국 시장 (연간 기본 수요)">
        <Table head={['카테고리', '연간 수요(9L 케이스)', '기준 소비자가(L)', '가격 탄력성', '단일 브랜드 점유 상한', '트렌드', '출처']}>
          {(Object.keys(KOREA.market) as (keyof typeof KOREA.market)[]).map((k) => {
            const m = KOREA.market[k];
            return (
              <tr key={k}>
                <Td>{CATEGORY[k].nameKo}</Td>
                <Td right>{num(m.baseCases)}</Td>
                <Td right>{won(m.refConsumerPricePerL)}</Td>
                <Td right>{m.elasticity}</Td>
                <Td right>{pct(m.shareCap, 0)}</Td>
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
