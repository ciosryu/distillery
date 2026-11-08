import { useState } from 'react';
import { CATEGORY } from '../../sim/content/categories';
import { AXIS } from '../../sim/content/axes';
import { ProfileRadar } from './Production';
import { caskShort } from './Bottling';
import { categoryName, consumerPrice, regionOf, traditionalTaxFactor } from '../../sim/content/regions';
import { finishLabel, hexOf, HEX_AXES, HEX_LABEL, topNotes, type ProductCategory, type ProfileAxis, bottleMargin, calendar, coverage, demandFor, domesticDemands, DUTY_FREE, dutyFreeDemands, dutyFreeAgedAppeal, dutyFreeConsumerPrice, hasDutyFree, isWhiskyCategory, outboundLogistics, priceBreakdown, priceOptions, productConsumerPrice, retailCapacityCases, suggestedPrice, type GameState, type Product } from '../../sim';
import { awarenessOf, brandMarketing, brandOf, rebrandCost, secondBrands } from '../../sim/brands';
import { BRANDS } from '../../sim/content/market';
import { isLocked } from '../../sim/scenario';
import { useGame } from '../../store/game';
import { num, pct, won, wonFull } from '../format';
import { Badge, Button, Card, Empty, Meter, NumberField, Select, Stat, Table, Td, TextField } from '../kit';

// 판매 화면 (파트 MKT → MKT 종료 뒤 PROD가 임시로 맡음, 오너 2026-11-07) — MVP 판매 화면(mvp.md §1 ⑤: 가격 설정 · 수요 한도 · 한국 주세 내역)
// PriceDesk는 MVP 단일 화면(설계 세션)이 그대로 끼워 쓸 수 있게 따로 내보낸다

const sellingProducts = (s: GameState) => s.commerce.products.filter((p) => p.stockBottles > 0 || p.lastMonthSold > 0);
const lastReport = (s: GameState) => s.history.reports.at(-1);

/** 지금 조건(품질·숙성·주세 경감)으로 다시 계산한 권장 출고가 — 병입 때 값과 다를 수 있다 */
function currentSuggestedPrice(s: GameState, p: Product): number {
  const region = regionOf(s);
  const oak = isWhiskyCategory(p.category) ? p.oakMonths ?? (p.ageYears ?? 0) * 12 : null;
  return suggestedPrice(region, p.category, p.bottleMl, p.quality, oak, p.abv, traditionalTaxFactor(region, p.traditional, s.commerce.traditionalReleasedL, s.commerce.traditionalPrevYearL));
}

/**
 * 판매가 어떻게 되는지 세 줄 (#173, 플레이테스트 2026-11-07 "판매 시스템이 알기 힘들다") — 표의 숫자가 무엇을 뜻하는지 먼저 말한다
 */
function SalesPrimer() {
  return (
    <ol className="mb-3 grid gap-1 rounded-md bg-stone-50 p-3 text-xs text-stone-700 dark:bg-stone-800/50 dark:text-stone-200 sm:grid-cols-3">
      <li><b>① 손님이 내는 값</b> = 출고가 + 주세·교육세·부가세 + 도소매 마진. <b>세금은 손님이 낸다</b> — 우리 현금에는 출고가만 남는다(제품의 "내역").</li>
      <li><b>② 한 달에 팔리는 양</b>은 <b>수요 한도</b>까지다 = 시장 × 인지도·유통 × 품질 매력 × 가격. 재고가 많아도 이 이상은 안 팔린다 — 많이 병입하면 병·포장비만 먼저 나간다.</li>
      <li><b>③ 한 병 팔면 남는 돈</b> = 출고가 − 병당 원가 − 유통비. <b>값을 올리면</b> 한 병 이익은 늘고 팔리는 양은 준다 — 재고가 적으면 올리고, 많으면 내린다.</li>
    </ol>
  );
}

/** 제품 한 줄 요약과 할 일 — 수요·재고·병당 이익으로 */
function salesStory(stock: number, demand: number, margin: number): string {
  const d = Math.max(0, Math.round(demand));
  const months = d > 0 ? stock / d : Infinity;
  const head = `한 달에 약 ${d.toLocaleString()}병 팔린다 · 재고 ${stock.toLocaleString()}병${stock > 0 ? (Number.isFinite(months) ? `(≈ ${months < 1 ? '1개월 미만' : `${Math.round(months)}개월`} 치)` : '(팔리지 않는다)') : ''} · 한 병 팔면 ${margin.toLocaleString()}원 ${margin >= 0 ? '남는다' : '손해다'}`;
  const todo =
    margin < 0 ? '→ 팔수록 손해다: 출고가를 올리자'
    : stock === 0 ? '→ 품절이다: 병입하자'
    : months > 6 ? '→ 재고가 6개월 치를 넘는다: 병입을 멈추고, 값을 조금 내리거나 마케팅으로 수요를 늘리자'
    : stock < d ? '→ 재고가 수요보다 적다: 값을 올려도 다 팔린다'
    : '→ 적당하다';
  return `${head} ${todo}`;
}

/** 병입 회차를 뗀 제품 이름 — "한빛 소주 13" → "한빛 소주" (증류소 탭 묶음 줄, #182) */
export const productStem = (name: string) => name.replace(/\s*(#|No\.?\s*)?\d+\s*(호|차)?\s*$/i, '').trim() || name;

/**
 * 가격·수요 표 + 고른 제품의 주세 내역·가격 비교. MVP 단일 화면에서도 쓴다.
 * compact(증류소 탭, [#182]): 재고 있는 제품만 · 같은 술(범주·병·도수·병입 회차 뗀 이름)은 한 줄로 묶고 ▸로 제품별 줄을 펼친다 ·
 * 설명·각주는 판매 탭에 두고 · 제품 상세(향미·내역)는 "내역"을 눌렀을 때만. 묶음 줄에서 값을 바꾸면 묶인 제품 모두 같은 값(오너 결정)
 */
export function PriceDesk({ compact = false }: { compact?: boolean }) {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [picked, setPicked] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const { monthOfYear } = calendar(s);
  const region = regionOf(s);
  const active = compact ? sellingProducts(s).filter((p) => p.stockBottles > 0) : sellingProducts(s);
  // 같은 카테고리 제품끼리 나눈 이번 달 수요 (#154). 재고 없는 제품은 혼자일 때의 수요(다시 채우면)
  const domestic = domesticDemands(s, monthOfYear);
  const dutyFree = dutyFreeDemands(s, monthOfYear);
  const last = lastReport(s);
  const selected = compact ? active.find((p) => p.id === picked) : active.find((p) => p.id === picked) ?? active[0];
  const brandPick = secondBrands(s).length > 0 && !isLocked(s, 'action:setProductBrand');

  /** 제품 한 줄의 숫자 — 표 줄과 묶음 줄이 같이 쓴다 */
  const metrics = (p: Product) => {
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
    return { d, df, dfOnly, consumer, ratio, demand, sell, prev, suggested, m };
  };
  const rowsFor = (p: Product) => {
    const { d, df, dfOnly, consumer, ratio, demand, sell, prev, suggested, m } = metrics(p);
    const isPicked = selected?.id === p.id;
    return [
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
          {brandPick && (
            <div className="mt-1" title={rebrandCost(p) > 0 ? `이미 판 제품 — 옮기면 리브랜딩 ${rebrandCost(p).toLocaleString()}원` : '아직 안 판 제품 — 무료로 고른다'}>
              <Select label="브랜드" value={brandOf(s, p).id} onChange={(v) => dispatch({ type: 'setProductBrand', productId: p.id, brandId: v })} options={s.commerce.brands.map((b) => ({ value: b.id, label: b.isHouse ? `${b.name || '하우스'} (하우스)` : b.name }))} />
            </div>
          )}
        </Td>
        <Td right>{num(p.stockBottles)}{p.stockBottles > 0 && sell > 0 && <div className="text-xs text-stone-500">{p.stockBottles / sell > 60 ? '5년 치 넘게' : `약 ${Math.max(1, Math.round(p.stockBottles / sell))}개월 치`}</div>}</Td>
        <Td>
          <NumberField value={p.price} min={100} step={100} width="w-24" onCommit={(v) => dispatch({ type: 'setPrice', productId: p.id, price: v })} />
          {suggested != null && suggested !== p.price && (
            <button className="mt-0.5 block text-xs text-amber-800 underline decoration-dotted dark:text-amber-300" onClick={() => dispatch({ type: 'setPrice', productId: p.id, price: suggested })} title="기준 소비자가 × √(품질/60) × 숙성 인식에 맞춘 출고가">권장 {wonFull(suggested)}</button>
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
        <Td><Button small variant={isPicked ? 'primary' : 'ghost'} onClick={() => setPicked(compact && isPicked ? null : p.id)}>내역</Button></Td>
      </tr>,
      <tr key={`${p.id}:story`} className={isPicked ? 'bg-amber-50/60 dark:bg-amber-950/30' : ''}>
        <td colSpan={9} className="px-2 pb-2 text-xs text-stone-600 dark:text-stone-300">{salesStory(p.stockBottles, demand, m.perBottle)}</td>
      </tr>,
    ];
  };

  /** 묶음 줄 (compact) — 합계와 범위, 값은 묶인 제품 모두에 */
  const groupRows = (key: string, items: Product[]) => {
    const ms = items.map(metrics);
    const sum = (f: (x: (typeof ms)[number], i: number) => number) => ms.reduce((t, x, i) => t + f(x, i), 0);
    const stock = items.reduce((t, p) => t + p.stockBottles, 0);
    const demand = sum((x) => x.demand);
    const sell = sum((x) => x.sell);
    const prevDemand = sum((x) => x.prev?.demandBottles ?? 0);
    const prevSold = sum((x) => x.prev?.bottles ?? 0);
    const revenue = sum((x, i) => x.sell * items[i]!.price);
    const prices = items.map((p) => p.price);
    const lo = Math.min(...prices), hi = Math.max(...prices);
    const margins = ms.map((x) => x.m.perBottle);
    const avgMargin = Math.round(stock > 0 ? sum((x, i) => x.m.perBottle * items[i]!.stockBottles) / stock : margins[0]!);
    const marginLo = won(Math.min(...margins)), marginHi = won(Math.max(...margins));
    const open = openGroups.includes(key);
    const p0 = items[0]!;
    return [
      <tr key={`g:${key}`}>
        <Td className="font-medium">
          {productStem(p0.name)} <span className="text-xs font-normal text-stone-500">· 제품 {items.length}개 묶음</span>
          <div className="mt-0.5 flex flex-wrap gap-1"><Badge tone="info">{categoryName(region, p0.category, CATEGORY[p0.category].nameKo)}</Badge></div>
          <div className="text-xs font-normal text-stone-500">{p0.bottleMl}ml · {pct(p0.abv)} · 품질 {Math.min(...items.map((p) => p.quality))}~{Math.max(...items.map((p) => p.quality))}</div>
        </Td>
        <Td right>{num(stock)}{sell > 0 && <div className="text-xs text-stone-500">{stock / sell > 60 ? '5년 치 넘게' : `약 ${Math.max(1, Math.round(stock / sell))}개월 치`}</div>}</Td>
        <Td>
          <NumberField value={lo} min={100} step={100} width="w-24" onCommit={(v) => { for (const p of items) if (p.price !== v) dispatch({ type: 'setPrice', productId: p.id, price: v }); }} />
          <div className="mt-0.5 text-xs text-stone-500" title="묶음 줄에서 값을 바꾸면 묶인 제품 모두 같은 값이 된다">{lo === hi ? '묶인 제품 모두 같은 값' : <>제품마다 {num(lo)}~{num(hi)}원 — 바꾸면 모두 같게 · <button className="underline decoration-dotted" onClick={() => { for (const p of items) if (p.price !== lo) dispatch({ type: 'setPrice', productId: p.id, price: lo }); }}>모두 {num(lo)}원으로</button></>}</div>
        </Td>
        <Td right>{wonFull(ms[0]!.consumer)}{lo !== hi && <div className="text-xs text-stone-500">첫 제품 기준</div>}</Td>
        <Td right><span className="font-semibold">{num(demand)}병</span></Td>
        <Td right>{prevDemand || prevSold ? <>{num(prevDemand)} → <span className="font-semibold">{num(prevSold)}</span></> : <span className="text-stone-400">—</span>}</Td>
        <Td right>{won(revenue)}<div className="text-xs text-stone-500">{num(sell)}병</div></Td>
        <Td right>{marginLo === marginHi ? marginLo : `${marginLo}~${marginHi}`}</Td>
        <Td><Button small variant="ghost" onClick={() => setOpenGroups((g) => (open ? g.filter((k) => k !== key) : [...g, key]))}>{open ? '▾ 접기' : `▸ 제품 ${items.length}개`}</Button></Td>
      </tr>,
      <tr key={`g:${key}:story`}>
        <td colSpan={9} className="px-2 pb-2 text-xs text-stone-600 dark:text-stone-300">{salesStory(stock, demand, avgMargin)}</td>
      </tr>,
    ];
  };
  const groups = new Map<string, Product[]>();
  if (compact) for (const p of active) { const k = `${p.category}|${p.bottleMl}|${p.abv}|${productStem(p.name)}|${p.dutyFreeOnly ? 'df' : ''}`; groups.set(k, [...(groups.get(k) ?? []), p]); }
  const body = compact
    ? [...groups].flatMap(([k, items]) => (items.length === 1 ? rowsFor(items[0]!) : [...groupRows(k, items), ...(openGroups.includes(k) ? items.flatMap(rowsFor) : [])]))
    : active.flatMap(rowsFor);

  return (
    <div className="grid gap-4">
      <Card title="가격과 수요" actions={<span className="text-xs text-stone-500">한 달 판매 = min(재고, 수요 한도 ±10%, 소매 처리 역량)</span>}>
        {!compact && <SalesPrimer />}
        {!active.length ? <Empty>{compact ? '재고가 있는 제품이 없습니다 — 블렌딩·병입 탭에서 병입하세요. 품절 제품은 판매 탭에서 본다.' : '판매 중인 제품이 없습니다. 블렌딩·병입 탭에서 병입하세요.'}</Empty> : (
          <Table head={['제품', '재고', '출고가(병)', '소비자가', '이번 달 수요 한도', '지난달 수요 → 판매', '예상 월 매출', '병당 공헌이익', '']}>
            {body}
          </Table>
        )}
        {compact
          ? <p className="mt-2 text-xs text-stone-500">재고 있는 제품만 · 같은 술은 한 줄로 묶었다(▸ 펼치면 제품별) · 향미·소비자가 내역은 "내역" · 품절 제품과 판매 설명은 <b>판매</b> 탭.</p>
          : (
          <p className="mt-2 text-xs text-stone-500">
            수요 한도 = 시장 규모 × 계절·트렌드 × 도달률(인지도 × 유통 커버리지 × 점유 상한) × 제품 매력도 × 가격 계수. 값을 올리면 병당 이익은 늘고 한도는 줄어든다 — 재고가 한도보다 적으면 값을 올려도 다 팔린다.
            같은 카테고리 제품이 여러 개면 수요를 나눠 갖는다 — 총수요는 조금만 늘고(똑같은 제품 2개면 약 1.26배), 단독 수요가 큰 제품이 더 큰 몫을 가진다. 병당 공헌이익 = 출고가 − (원액·포장·병입 인건비) − 유통비(채널 수수료 + 물류).
            {hasDutyFree(s) && ' 지정면세점 판매분은 주세·부가세가 없고, 소매 처리 역량과 육지 출고 물류 할증을 쓰지 않습니다.'}
          </p>
          )}
      </Card>
      {selected && <ProductFlavor p={selected} />}
      {selected && <ProductDetail p={selected} />}
    </div>
  );
}

/** 위스키 육각형으로 보는 범주 — 몰트·그레인 계열 (#156과 같은 축 규칙) */
const HEX_CATEGORIES: ReadonlySet<ProductCategory> = new Set<ProductCategory>(['whisky', 'grain_whisky', 'blended_whisky', 'malt_spirit']);

/** 제품의 향미 프로필 — 몰트·그레인 계열은 위스키 육각형, 그 밖은 주종 레이더 축 */
function productProfile(p: Pick<Product, 'category' | 'flavor'>): ProfileAxis[] {
  if (HEX_CATEGORIES.has(p.category)) {
    const h = hexOf(p.flavor);
    return HEX_AXES.map((a) => ({ id: a, label: HEX_LABEL[a], value: h[a] }));
  }
  return CATEGORY[p.category].radarAxes.map((a) => ({ id: a, label: AXIS[a].nameKo, value: p.flavor[a] ?? 0 }));
}
const sameAxes = (a: Pick<Product, 'category'>, b: Pick<Product, 'category'>) =>
  HEX_CATEGORIES.has(a.category) ? HEX_CATEGORIES.has(b.category) : a.category === b.category;

/**
 * 판매 중인 제품의 향미 (#175, 오너 요청 2026-11-08) — 병입 때 확정된 참 향미·품질. 병입하면 참값이 공개되는 규칙(#162)이라 MVP에서도 보인다.
 * 같은 축의 다른 제품을 골라 겹쳐 비교한다(점선)
 */
function ProductFlavor({ p }: { p: Product }) {
  const s = useGame((g) => g.state);
  const region = regionOf(s);
  const [cmpId, setCmpId] = useState('');
  const others = s.commerce.products.filter((x) => x.id !== p.id && sameAxes(p, x));
  const cmp = others.find((x) => x.id === cmpId);
  const profile = productProfile(p);
  const notes = topNotes(p.flavor);
  const facts = (x: Product) => [
    categoryName(region, x.category, CATEGORY[x.category].nameKo),
    x.ageYears != null ? `${x.ageYears}년` : null,
    x.finish ? finishLabel(x.finish) : null,
    // 통 구성 (#176) — 병입 때 기록. 기록 전 제품은 없다
    x.caskMix?.length ? `통: ${x.caskMix.map((m) => `${caskShort(m.typeId)} ${pct(m.share, 0)}`).join(' · ')}${(() => { const rest = 1 - x.caskMix!.reduce((t, m) => t + m.share, 0); return rest >= 0.005 ? ` · 탱크 ${pct(rest, 0)}` : ''; })()}` : null,
    x.style ? `스타일: ${x.style}` : null,
    `${x.bottleMl}ml · ${pct(x.abv)}`,
  ].filter(Boolean).join(' · ');
  return (
    <Card title={`${p.name} — 향미`} actions={others.length > 0 && (
      <Select label="비교" value={cmp ? cmp.id : ''} onChange={setCmpId} options={[{ value: '', label: '(비교 안 함)' }, ...others.map((x) => ({ value: x.id, label: `${x.name} · 품질 ${x.quality}` }))]} />
    )}>
      <div className="flex flex-wrap items-start gap-4">
        <ProfileRadar draft={profile} base={cmp ? productProfile(cmp) : undefined} size={260} />
        <div className="grid min-w-56 flex-1 gap-2 text-sm">
          <div>
            <div className="flex items-baseline gap-2"><span className="inline-block h-3 w-3 rounded-sm bg-amber-500/60" /><b>{p.name}</b> <span className="tabular-nums">품질 {p.quality}</span></div>
            <div className="text-xs text-stone-500">{facts(p)}</div>
            <div className="mt-1 text-xs">주요 향: {notes.length ? notes.map((n) => `${n.nameKo} ${n.value}`).join(' · ') : '뚜렷한 향 없음'}</div>
            {p.sourcedShare > 0 && <div className="text-xs text-stone-500">매입 원액 {pct(p.sourcedShare, 0)}</div>}
          </div>
          {cmp && (
            <div className="border-t border-stone-200 pt-2 dark:border-stone-700">
              <div className="flex items-baseline gap-2"><span className="inline-block w-3 border-t-2 border-dashed border-stone-500" /><b>{cmp.name}</b> <span className="tabular-nums">품질 {cmp.quality}</span> <span className={`text-xs tabular-nums ${p.quality - cmp.quality >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>({p.quality - cmp.quality >= 0 ? '+' : '−'}{Math.abs(p.quality - cmp.quality).toFixed(1)})</span></div>
              <div className="text-xs text-stone-500">{facts(cmp)}</div>
              <div className="mt-1 text-xs">주요 향: {topNotes(cmp.flavor).map((n) => `${n.nameKo} ${n.value}`).join(' · ') || '뚜렷한 향 없음'}</div>
              {(() => {
                // 많이 다른 축 3개 — 지금 제품 기준
                const c = productProfile(cmp);
                const diff = profile.map((a, i) => ({ label: a.label, d: a.value - c[i]!.value })).filter((x) => Math.abs(x.d) >= 1).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3);
                return diff.length ? <div className="mt-1 text-xs">차이: {diff.map((x) => <span key={x.label} className={`mr-2 font-medium ${x.d > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>{x.label} {x.d > 0 ? '+' : '−'}{Math.abs(x.d).toFixed(0)}</span>)}</div> : null;
              })()}
            </div>
          )}
          <p className="text-xs text-stone-500">병입 때 확정된 향미다(병 안에서는 변하지 않는다). {HEX_CATEGORIES.has(p.category) ? '위스키 육각형 — 숙성고 샘플·블렌딩 그래프와 같은 축.' : '주종 레이더 축.'}{others.length === 0 ? ' 같은 축의 다른 제품이 생기면 겹쳐 비교할 수 있다.' : ''}</p>
        </div>
      </div>
    </Card>
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
        <Stat label={secondBrands(s).length ? '하우스 브랜드 인지도' : '브랜드 인지도'} value={pct(awarenessOf(s))} hint="마케팅·판매량·품질로 상승" />
        <Stat label="유통 커버리지" value={pct(coverage(s))} hint="영업 직원 네트워크" />
        <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-900">
          <Meter label="소매 처리 역량 (9L 케이스/월, 지난달)" value={last?.retailSoldCases ?? 0} max={last?.retailCapacityCases ?? cap} />
          <div className="mt-1 text-xs text-stone-500">{(last?.lostSalesBottles ?? 0) > 0 ? `지난달 ${num(last!.lostSalesBottles!)}병을 역량이 모자라 못 팔았다` : `출고가 → 소비자가 × ${sample.toFixed(2)} (700ml 40%)`}</div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-900">
          <div className="text-xs text-stone-500">월 마케팅 예산{secondBrands(s).length ? ' (하우스)' : ''}</div>
          <NumberField value={s.commerce.marketingBudget / 10_000} min={0} max={100_000} width="w-24" suffix="만 원" onCommit={(v) => dispatch({ type: 'setMarketing', amount: v * 10_000 })} />
        </div>
      </div>

      <PriceDesk />
      {!isLocked(s, 'action:openBrand') && <BrandLines />}

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

/** 브랜드 라인 (PRD §11.2 ④, #155) — 세컨드 브랜드 개설·브랜드별 마케팅·폐지 */
function BrandLines() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [name, setName] = useState('');
  const productsOf = (id: string) => s.commerce.products.filter((p) => brandOf(s, p).id === id && p.stockBottles > 0);
  return (
    <Card title="브랜드 라인" actions={<span className="text-xs text-stone-500">세컨드 브랜드: 개설비 {won(BRANDS.openCost)} · 월 유지비 {won(BRANDS.monthlyUpkeep)} + 마케팅비</span>}>
      <Table head={['브랜드', '인지도', '판매 중 제품', '월 마케팅비', '']}>
        {s.commerce.brands.map((b) => (
          <tr key={b.id}>
            <Td className="font-medium">{b.isHouse ? <>{b.name || s.distilleryName} <Badge tone="info">하우스</Badge></> : b.name}</Td>
            <Td right>{pct(b.awareness)}</Td>
            <Td className="text-xs">{productsOf(b.id).map((p) => p.name).join(', ') || '—'}</Td>
            <Td><NumberField value={brandMarketing(s, b) / 10_000} min={0} max={100_000} width="w-24" suffix="만 원" onCommit={(v) => dispatch({ type: 'setMarketing', brandId: b.id, amount: v * 10_000 })} /></Td>
            <Td>{!b.isHouse && <Button small variant="ghost" disabled={productsOf(b.id).length > 0} title={productsOf(b.id).length ? '재고가 남은 제품을 다 팔거나 옮겨야 폐지할 수 있다' : '유지비가 멈춘다. 이 브랜드의 남은 제품 기록은 하우스로 돌아간다'} onClick={() => dispatch({ type: 'closeBrand', brandId: b.id })}>폐지</Button>}</Td>
          </tr>
        ))}
      </Table>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TextField label="새 세컨드 브랜드" value={name} onChange={setName} width="w-40" />
        <Button small variant="primary" disabled={!name.trim() || s.finance.cash < BRANDS.openCost} onClick={() => { dispatch({ type: 'openBrand', name }); setName(''); }}>개설 ({won(BRANDS.openCost)})</Button>
      </div>
      <p className="mt-2 text-xs text-stone-500">
        현금용 저가 제품을 따로 떼어 하우스 브랜드의 이미지를 지키는 수단이다. 세컨드 브랜드는 하우스 인지도의 {pct(BRANDS.spillover, 0)}에서 시작하고, 성장은 서로 {pct(BRANDS.spillover, 0)}씩만 나눠 받는다 —
        같은 돈을 쓰면 하우스를 따라붙되 넘지 못하고, 더 쓰면 넘을 수 있다. 제품의 수요는 그 제품 브랜드의 인지도로 계산한다. 아직 안 판 제품은 무료로 브랜드를 고르고, 이미 판 제품을 옮기면 {won(BRANDS.rebrandFixed)} + 남은 재고 병당 {won(BRANDS.rebrandPerBottle)}의 라벨 교체 비용이 든다.
        {' 수출 시장 인지도는 아직 회사 단위다.'}
      </p>
    </Card>
  );
}
