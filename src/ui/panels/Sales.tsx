import { useState } from 'react';
import { CATEGORY } from '../../sim/content/categories';
import { categoryName, consumerPrice, regionOf, traditionalTaxFactor } from '../../sim/content/regions';
import { bottleMargin, calendar, coverage, demandFor, domesticDemands, DUTY_FREE, dutyFreeDemands, dutyFreeAgedAppeal, dutyFreeConsumerPrice, hasDutyFree, isWhiskyCategory, outboundLogistics, priceBreakdown, priceOptions, productConsumerPrice, retailCapacityCases, suggestedPrice, type GameState, type Product } from '../../sim';
import { awarenessOf } from '../../sim/brands';
import { useGame } from '../../store/game';
import { num, pct, won, wonFull } from '../format';
import { Badge, Button, Card, Empty, Meter, NumberField, Stat, Table, Td } from '../kit';

// 판매 화면 (파트 MKT) — MVP 판매 화면(mvp.md §1 ⑤: 가격 설정 · 수요 한도 · 한국 주세 내역)
// PriceDesk는 MVP 단일 화면(설계 세션)이 그대로 끼워 쓸 수 있게 따로 내보낸다

const sellingProducts = (s: GameState) => s.commerce.products.filter((p) => p.stockBottles > 0 || p.lastMonthSold > 0);
const lastReport = (s: GameState) => s.history.reports.at(-1);

/** 지금 조건(품질·숙성·주세 경감)으로 다시 계산한 권장 출고가 — 병입 때 값과 다를 수 있다 */
function currentSuggestedPrice(s: GameState, p: Product): number {
  const region = regionOf(s);
  const oak = isWhiskyCategory(p.category) ? p.oakMonths ?? (p.ageYears ?? 0) * 12 : null;
  return suggestedPrice(region, p.category, p.bottleMl, p.quality, oak, p.abv, traditionalTaxFactor(region, p.traditional, s.commerce.traditionalReleasedL, s.commerce.traditionalPrevYearL));
}

/** 가격·수요 표 + 고른 제품의 주세 내역·가격 비교. MVP 단일 화면에서도 쓴다 */
export function PriceDesk() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [picked, setPicked] = useState<string | null>(null);
  const { monthOfYear } = calendar(s);
  const region = regionOf(s);
  const active = sellingProducts(s);
  // 같은 카테고리 제품끼리 나눈 이번 달 수요 (P-MKT-1). 재고 없는 제품은 혼자일 때의 수요(다시 채우면)
  const domestic = domesticDemands(s, monthOfYear);
  const dutyFree = dutyFreeDemands(s, monthOfYear);
  const last = lastReport(s);
  const selected = active.find((p) => p.id === picked) ?? active[0];

  return (
    <div className="grid gap-4">
      <Card title="가격과 수요" actions={<span className="text-xs text-stone-500">한 달 판매 = min(재고, 수요 한도 ±10%, 소매 처리 역량)</span>}>
        {!active.length ? <Empty>판매 중인 제품이 없습니다. 블렌딩·병입 탭에서 병입하세요.</Empty> : (
          <Table head={['제품', '재고', '출고가(병)', '소비자가', '이번 달 수요 한도', '지난달 수요 → 판매', '예상 월 매출', '병당 공헌이익', '']}>
            {active.map((p) => {
              const d = domestic.get(p.id) ?? demandFor(s, p, 1, monthOfYear);
              // 면세 채널(제주, 결정 #87): 면세 전용 한정판은 국내 매대에 없다 → 면세가·면세 기준가로 보여 준다
              const df = dutyFree.get(p.id) ?? 0;
              const dfOnly = !!p.dutyFreeOnly;
              const consumer = dfOnly ? dutyFreeConsumerPrice(p) : productConsumerPrice(s, p);
              const ratio = dfOnly ? consumer / (p.bottleMl / 1000) / (d.refPricePerL * DUTY_FREE.refFactor) : d.consumerPricePerL / d.refPricePerL;
              const demand = (dfOnly ? 0 : d.demandBottles) + df;
              const sell = Math.min(p.stockBottles, Math.round(demand));
              const prev = last?.sales.find((x) => x.productId === p.id);
              const suggested = dfOnly ? null : currentSuggestedPrice(s, p);
              const m = bottleMargin(p, dfOnly ? 1 : outboundLogistics(s));
              const isPicked = selected?.id === p.id;
              return (
                <tr key={p.id} className={isPicked ? 'bg-amber-50/60 dark:bg-amber-950/30' : ''}>
                  <Td className="font-medium">
                    {p.name}
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      <Badge tone="info">{categoryName(region, p.category, CATEGORY[p.category].nameKo)}</Badge>
                      {p.ageYears != null && <Badge tone="good">{p.ageYears}년</Badge>}
                      {p.premiumLabel && region.whisky.premiumLabel && <Badge tone="good">{region.whisky.premiumLabel.name}</Badge>}
                      {p.specialty && <Badge tone="good">{region.specialties?.find((x) => x.id === p.specialty)?.label}</Badge>}
                      {p.traditional && <Badge tone="good">{region.traditionalRelief?.label}</Badge>}
                      {p.sourcedShare > 0 && <Badge tone="warn">매입 {pct(p.sourcedShare, 0)} · 브랜드 {Math.round((p.sourcedPrestige ?? 0) * 100)}</Badge>}
                      {dfOnly && p.localIngredient && <Badge tone="good">제주 원료</Badge>}
                      {dfOnly && !p.localIngredient && dutyFreeAgedAppeal(p.ageYears) > 1 && <Badge tone="good">숙성 한정 · 수요 ×{dutyFreeAgedAppeal(p.ageYears)}</Badge>}
                      {dfOnly && p.dfEdition && <Badge tone="warn">면세 Vol.{p.dfEdition.vol} · {s.month - p.createdMonth + 1}/{DUTY_FREE.sellOutMonths}개월</Badge>}
                    </div>
                    <div className="text-xs font-normal text-stone-500">{p.bottleMl}ml · {pct(p.abv)} · 품질 {p.quality}</div>
                  </Td>
                  <Td right>{num(p.stockBottles)}{p.stockBottles > 0 && sell > 0 && <div className="text-xs text-stone-500">약 {Math.max(1, Math.round(p.stockBottles / sell))}개월 치</div>}</Td>
                  <Td>
                    <NumberField value={p.price} min={100} step={100} width="w-24" onCommit={(v) => dispatch({ type: 'setPrice', productId: p.id, price: v })} />
                    {suggested != null && suggested !== p.price && (
                      <button className="mt-0.5 block text-xs text-amber-800 underline decoration-dotted dark:text-amber-300" onClick={() => dispatch({ type: 'setPrice', productId: p.id, price: suggested })} title="기준 소비자가 × √(품질/60) × 숙성 인식에 맞춘 출고가">권장 {won(suggested)}</button>
                    )}
                  </Td>
                  <Td right>
                    {wonFull(consumer)}
                    <div className={`text-xs ${ratio > 1.3 ? 'text-rose-700 dark:text-rose-400' : ratio < 0.8 ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-500'}`}>{dfOnly ? '면세가 · ' : ''}기준가의 {pct(ratio, 0)}</div>
                  </Td>
                  <Td right>
                    <span className="font-semibold">{num(demand)}병</span>
                    {df > 0 && !dfOnly && <div className="text-xs text-stone-500">면세 {num(df)}병 포함</div>}
                    {d.split < 0.995 && !dfOnly && <div className="text-xs text-stone-500" title="같은 카테고리 제품끼리 수요를 나눈다 — 단독 수요가 클수록 몫이 크다">같은 카테고리 나눔 ×{d.split.toFixed(2)}</div>}
                    {p.stockBottles > 0 && p.stockBottles < demand && <div className="text-xs text-rose-700 dark:text-rose-400">재고 부족 — 값을 올려도 된다</div>}
                  </Td>
                  <Td right>
                    {prev ? <>{num(prev.demandBottles)} → <span className="font-semibold">{num(prev.bottles)}</span></> : <span className="text-stone-400">—</span>}
                    {prev && prev.bottles < prev.demandBottles && <div className="text-xs text-stone-500">{p.stockBottles === 0 ? '품절' : '역량·재고로 못 판 수요'}</div>}
                  </Td>
                  <Td right>{won(sell * p.price)}<div className="text-xs text-stone-500">{num(sell)}병</div></Td>
                  <Td right><span className={m.rate < 0.15 ? 'text-rose-700 dark:text-rose-400' : m.rate > 0.5 ? 'text-emerald-700 dark:text-emerald-400' : ''}>{won(m.perBottle)}</span><div className="text-xs text-stone-500">{pct(m.rate, 0)}</div></Td>
                  <Td><Button small variant={isPicked ? 'primary' : 'ghost'} onClick={() => setPicked(p.id)}>내역</Button></Td>
                </tr>
              );
            })}
          </Table>
        )}
        <p className="mt-2 text-xs text-stone-500">
          수요 한도 = 시장 규모 × 계절·트렌드 × 도달률(인지도 × 유통 커버리지 × 점유 상한) × 제품 매력도 × 가격 계수. 값을 올리면 병당 이익은 늘고 한도는 줄어든다 — 재고가 한도보다 적으면 값을 올려도 다 팔린다.
          같은 카테고리 제품이 여러 개면 수요를 나눠 갖는다 — 총수요는 조금만 늘고(똑같은 제품 2개면 약 1.26배), 단독 수요가 큰 제품이 더 큰 몫을 가진다. 병당 공헌이익 = 출고가 − (원액·포장·병입 인건비) − 유통비(채널 수수료 + 물류).
          {hasDutyFree(s) && ' 지정면세점 판매분은 주세·부가세가 없고, 소매 처리 역량과 육지 출고 물류 할증을 쓰지 않습니다.'}
        </p>
      </Card>
      {selected && <ProductDetail p={selected} />}
    </div>
  );
}

/** 고른 제품: 소비자가가 어떻게 만들어지는지(주세 내역) · 수요 분해 · 가격을 바꾸면 */
function ProductDetail({ p }: { p: Product }) {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const { monthOfYear } = calendar(s);
  const region = regionOf(s);
  if (p.dutyFreeOnly) return <Card title={`${p.name} — 면세 전용`}><p className="text-sm text-stone-600 dark:text-stone-300">면세 전용 한정판은 주세·부가세가 없습니다. 면세가 = 출고가 × 면세점 마진 {DUTY_FREE.markup}.</p></Card>;
  const b = priceBreakdown(s, p, region);
  const d = domesticDemands(s, monthOfYear, region).get(p.id) ?? demandFor(s, p, 1, monthOfYear, region);
  const opts = priceOptions(s, p, monthOfYear);
  const best = opts.reduce((a, x) => (x.contribution > a.contribution ? x : a), opts[0]!);
  const t = region.tax;
  const rows: [string, number, string?][] = [
    ['출고가 (우리 매출)', b.price],
    ...(t.adValorem > 0 ? [[`주세 — 종가세 ${pct(t.adValorem, 0)}${b.reliefFactor < 1 ? ` × 경감 ${b.reliefFactor}` : ''}`, b.adValoremTax, '출고가 × 세율'] as [string, number, string]] : []),
    ...(t.education > 0 ? [[`교육세 — 주세의 ${pct(t.education, 0)}`, b.educationTax] as [string, number]] : []),
    ...(t.specificPerLPA > 0 ? [[`주세 — 종량세 LPA당 ${num(t.specificPerLPA)}원${b.reliefFactor < 1 ? ` × 경감 ${b.reliefFactor}` : ''}`, b.specificTax, `${((p.bottleMl / 1000) * p.abv).toFixed(2)} LPA`] as [string, number, string]] : []),
    [`부가세 ${pct(t.vat, 0)}`, b.vat, '(출고가 + 주세) × 세율'],
    ['도소매 마진', b.retail, `× ${region.retailMarkup}${b.retail / (b.consumer - b.retail) < region.retailMarkup - 1 - 0.005 ? ' (영업 협상으로 절감)' : ''}`],
  ];
  const taxTotal = b.adValoremTax + b.educationTax + b.specificTax;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={`${p.name} — 소비자가 내역 (병당)`}>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {rows.map(([label, v, hint]) => (
              <tr key={label}><td className="py-1">{label}{hint && <span className="ml-1 text-xs text-stone-500">{hint}</span>}</td><td className="py-1 text-right tabular-nums">{wonFull(v)}</td><td className="w-14 py-1 text-right text-xs tabular-nums text-stone-500">{pct(v / b.consumer, 0)}</td></tr>
            ))}
            <tr className="font-semibold"><td className="py-1">소비자가</td><td className="py-1 text-right tabular-nums">{wonFull(b.consumer)}</td><td className="py-1 text-right text-xs">100%</td></tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-stone-500">
          {t.label}. 주세·교육세(병당 {wonFull(taxTotal)})는 출고가 위에 붙어 구매자가 내고, 증류소는 받아서 그대로 납부한다 — 현금에는 출고가만 남는다.
          {region.traditionalRelief && (p.traditional
            ? ` ${region.traditionalRelief.label}: 올해 누적 경감 출고 ${num(s.commerce.traditionalReleasedL)}L — ${region.traditionalRelief.tiers.map((x) => `${num(x.upToL / 1000)}kL까지 ×${x.factor}`).join(', ')}, 그 위는 경감 없음.`
            : ` 이 제품은 ${region.traditionalRelief.label} 대상이 아니다(국산 원료 ${pct(region.traditionalRelief.nativeShare, 0)} 이상 + 농업경영체 등록 필요).`)}
        </p>
      </Card>
      <Card title="수요 한도 분해 · 가격을 바꾸면">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-stone-500">이번 달 시장 ({categoryName(region, p.category, CATEGORY[p.category].nameKo)})</dt><dd className="text-right tabular-nums">{num(d.marketL)}L</dd>
          <dt className="text-stone-500">도달률 (인지도 {pct(awarenessOf(s, p), 1)} × 커버리지 {pct(coverage(s), 0)} × 점유 상한)</dt><dd className="text-right tabular-nums">{pct(d.reach, 4)} → {num(d.marketL * d.reach, 1)}L</dd>
          {d.split < 0.995 && <><dt className="text-stone-500">같은 카테고리 제품끼리 나눔</dt><dd className="text-right tabular-nums">× {d.split.toFixed(2)}</dd></>}
          <dt className="text-stone-500">매력도 (품질·전형성·숙성·포장)</dt><dd className="text-right tabular-nums">× {d.appeal.toFixed(2)}</dd>
          <dt className="text-stone-500">가격 계수 (소비자가 / 기준가 {wonFull(d.refPricePerL * p.bottleMl / 1000)})</dt><dd className="text-right tabular-nums">× {d.priceFactor.toFixed(2)}</dd>
          <dt className="font-medium">수요 한도</dt><dd className="text-right font-medium tabular-nums">{num(d.demandBottles)}병</dd>
        </dl>
        <div className="mt-3">
          <Table head={['출고가', '소비자가', '수요 한도', '팔 수 있는 양', '월 매출', '월 공헌이익', '']}>
            {opts.map((o) => (
              <tr key={o.price} className={o.price === p.price ? 'font-semibold' : ''}>
                <Td right>{wonFull(o.price)}</Td>
                <Td right>{wonFull(o.consumer)}</Td>
                <Td right>{num(o.demandBottles)}</Td>
                <Td right>{num(o.sellBottles)}</Td>
                <Td right>{won(o.revenue)}</Td>
                <Td right className={o === best ? 'text-emerald-700 dark:text-emerald-400' : ''}>{won(o.contribution)}</Td>
                <Td>{o.price !== p.price && <Button small variant="ghost" onClick={() => dispatch({ type: 'setPrice', productId: p.id, price: o.price })}>적용</Button>}</Td>
              </tr>
            ))}
          </Table>
        </div>
        <p className="mt-2 text-xs text-stone-500">이번 달 기댓값이다(실제는 ±10%, 소매 처리 역량을 넘으면 고비용 채널). 재고가 적으면 비싸게 팔수록, 재고가 많으면 많이 팔수록 낫다 — 재고가 6개월 치를 넘게 쌓이면 할인 이미지로 수요가 준다.</p>
      </Card>
    </div>
  );
}

export function Sales() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const region = regionOf(s);
  const sample = consumerPrice(region, 10_000, 700, 0.4) / 10_000;
  const last = lastReport(s);
  const cap = retailCapacityCases(s);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="브랜드 인지도" value={pct(awarenessOf(s))} hint="마케팅·판매량·품질로 상승" />
        <Stat label="유통 커버리지" value={pct(coverage(s))} hint="영업 직원 네트워크" />
        <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-900">
          <Meter label="소매 처리 역량 (9L 케이스/월, 지난달)" value={last?.retailSoldCases ?? 0} max={last?.retailCapacityCases ?? cap} />
          <div className="mt-1 text-xs text-stone-500">{(last?.lostSalesBottles ?? 0) > 0 ? `지난달 ${num(last!.lostSalesBottles!)}병을 역량이 모자라 못 팔았다` : `출고가 → 소비자가 × ${sample.toFixed(2)} (700ml 40%)`}</div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-900">
          <div className="text-xs text-stone-500">월 마케팅 예산</div>
          <NumberField value={s.commerce.marketingBudget / 10_000} min={0} max={100_000} width="w-24" suffix="만 원" onCommit={(v) => dispatch({ type: 'setMarketing', amount: v * 10_000 })} />
        </div>
      </div>

      <PriceDesk />

      <Card title={`${region.nameKo} 시장 (연간 기본 수요)`}>
        <Table head={['카테고리', '연간 수요(9L 케이스)', '기준 소비자가(L)', '가격 탄력성', '단일 브랜드 점유 상한', '트렌드', '출처']}>
          {(Object.keys(region.market) as (keyof typeof region.market)[]).filter((k) => region.market[k].baseCases > 0).map((k) => {
            const m = region.market[k];
            return (
              <tr key={k}>
                <Td>{categoryName(region, k, CATEGORY[k].nameKo)}</Td>
                <Td right>{num(m.baseCases)}</Td>
                <Td right>{won(m.refConsumerPricePerL)}</Td>
                <Td right>{Number(m.elasticity.toFixed(2))}</Td>
                <Td right>{pct(m.shareCap, m.shareCap < 0.01 ? 1 : 0)}</Td>
                <Td right>{(s.world.trend[k] ?? 1).toFixed(2)}</Td>
                <Td className="text-xs text-stone-500">{m.baseSource}</Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </div>
  );
}
