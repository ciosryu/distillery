// [제안 P-MKT-51] (가) 자동 가격 정책 설명 (MKT · 10차 70개월 · 오너 "무슨 기준인지도 모르겠고" · PM 2026-11-26 오너 「권장안대로」)
// 정책마다 「이번 달 왜 이 값인가」를 원 · 병으로, B가 형제 몫 때문에 이 제품 판매를 크게 줄이면 경고. **읽기만** — 엔진(`decidePolicyPrice`)이
// 다음 판매 직전에 정할 값을 아는 품질 상태(`ks` = knownState)로 미리 셀 뿐, 상태 · 규칙 · 봇 출력은 그대로다(I2: 아는 품질만)
import { priceModeOf, priceOptions, restockedDemand, type GameState, type Product } from '../sim';
import { currentSuggested } from '../sim/economics';
import { decidePolicyPrice, drainTarget, PRICE_POLICY, profitTarget, type PolicySpec } from '../sim/pricePolicy';

/** 정책마다 「무엇을 기준으로 값을 정하나」 한 줄 — 판매 카드 머리 · 정책 풀이가 같이 쓴다 */
export const POLICY_BASIS = {
  turnover: 'A 현금회전 — 이번 달 하나만 본다: 이번 달 판매 이익(같은 범주 제품 합)이 가장 큰 값',
  profit: `B 이익 — 앞으로 ${PRICE_POLICY.profitHorizon}개월 이익(같은 범주 형제 포함)이 가장 큰 값 근처(${Math.round(PRICE_POLICY.profitNearShare * 100)}% 안)에서 지금 값에 가장 가까운 값. 이 제품 판매를 ${Math.round((1 - PRICE_POLICY.profitOwnSalesFloor) * 100)}% 넘게 줄이는 값은 고르지 않는다. 「다 팔 값」도 후보다. 한 달에 기준가 × ${PRICE_POLICY.step}씩만 움직인다`,
  premium: `C 가격 유지 — 정한 배수(기본 기준가 × ${PRICE_POLICY.n})를 지킨다. 분기 첫 달에만 맞추고, 재고가 ${PRICE_POLICY.premiumOverstockMonths}개월치를 넘으면 분기에 한 단계 내린다`,
  drain: `D 원액 소화 — 병 재고 + 표기에 맞는 통 원액을 고른 기간(기본 ${PRICE_POLICY.drainHorizon}개월)에 나눠 팔 값. 원액이 적으면 올리고(기준가 × ${PRICE_POLICY.drainMax}까지) 넉넉하면 내린다(이익 나는 값까지). 한 달에 기준가 × ${PRICE_POLICY.step}씩만 움직인다`,
} as const;
/** 형제 합산 경고 문턱 — B가 값을 올려 이 제품의 이번 달 판매가 이만큼 아래로 줄면 `[튜닝]` */
export const POLICY_SIBLING_WARN = 0.7;

const won = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}원`;
const fx = (v: number) => `×${v.toFixed(2)}`;

export interface PolicyExplain {
  /** 이번 달 왜 이 값인가 — 한 줄 */
  line: string;
  /** B가 형제 몫 때문에 이 제품 판매를 크게 줄일 때 */
  warn: string | null;
  /** 다음 판매 직전에 정책이 정할 값(바꾸지 않으면 지금 값) */
  next: number;
  /** 재고 0 제품 — 재고가 들어오는 달에 정할 값(그대로면 null). 재고가 있으면 없음 */
  restock?: number | null;
}

/** 재고 0 제품을 1병 들인 진열 — 「재고가 들어오는 달」에 정책이 정할 값을 같은 함수로 미리 센다(어림 · 그달 보충 양은 모른다) */
const withOneBottle = (ks: GameState, id: string): GameState =>
  ({ ...ks, commerce: { ...ks.commerce, products: ks.commerce.products.map((x) => (x.id === id ? { ...x, stockBottles: 1 } : x)) } });

/** 정책이 켜진 제품의 설명. 꺼져 있거나 셀 수 없으면 null. ks는 knownState(s) */
export function policyExplain(ks: GameState, p0: Product, monthOfYear: number): PolicyExplain | null {
  const mode = priceModeOf(p0);
  if (!mode || p0.dutyFreeOnly || p0.price <= 0) return null;
  const p = ks.commerce.products.find((x) => x.id === p0.id) ?? p0;
  const sug = currentSuggested(ks, p);
  if (sug <= 0) return null;
  const spec = { ...(p.pricePolicy ?? {}), mode } as PolicySpec;
  // 재고 0 — 정책은 건너뛴다. 「예상 판매」(재고를 보지 않는 수요)는 틀린 신호라 「채우면 월 n병」(품절 배지 · 가격표와 같은 셈)으로, 재고가 들어오는 달의 값을 미리 보인다(PM 2026-11-28)
  if (p.stockBottles <= 0) {
    const ks1 = withOneBottle(ks, p.id);
    const q = ks1.commerce.products.find((x) => x.id === p.id)!;
    const r = decidePolicyPrice(ks1, q, { ...spec, ...(spec.lastFactor == null && mode !== 'premium' ? { lastFactor: p.price / sug } : {}) }, monthOfYear).price;
    const refill = `채우면 월 ${Math.round(restockedDemand(ks, p, monthOfYear).demandBottles).toLocaleString()}병`;
    const when = r != null && r !== p.price ? `재고가 들어오는 달에 ${won(r)}(기준가 ${fx(r / sug)} · 지금 대비 ${r > p.price ? '+' : '−'}${Math.abs(Math.round((r / p.price - 1) * 100))}%)으로 정한다` : '재고가 들어와도 지금 값 그대로일 것이다';
    return { line: `재고 없음 — ${when} · ${refill}`, warn: null, next: p.price, restock: r != null && r !== p.price ? r : null };
  }
  const d = decidePolicyPrice(ks, p, spec, monthOfYear);
  const next = d.price ?? p.price;
  const t = mode === 'profit' ? profitTarget(ks, p, monthOfYear) : null;
  const [atNext, atNow, atTarget] = priceOptions(ks, p, monthOfYear, [next / p.price, 1, (t ?? p.price) / p.price]);
  const sells = (n: number) => `이 제품 예상 판매 월 ${Math.round(n).toLocaleString()}병`;
  const salesPart = next !== p.price ? `${sells(atNext!.demandBottles)}(지금 값이면 ${Math.round(atNow!.demandBottles).toLocaleString()}병)` : sells(atNow!.demandBottles);
  let line: string;
  if (mode === 'premium' && d.price == null && d.why.includes('분기 경계까지')) line = `정한 배수 ${fx(p.pricePolicy?.lastFactor ?? spec.target ?? PRICE_POLICY.n)} 유지 — 분기 첫 달에만 다시 맞추고 그때까지 지금 값 그대로 · ${salesPart}`;
  else if (d.price == null) line = `${d.why} · ${salesPart}`;
  else if (mode === 'profit') {
    line = t != null && Math.abs(t - next) >= 100
      ? `목표 ${won(t)}(기준가 ${fx(t / sug)}) · 한 달 한 단계 제한으로 이번 달 ${won(next)} · ${salesPart}`
      : `${PRICE_POLICY.profitHorizon}개월 이익(형제 포함) 최대 근처에서 지금 값에 가장 가까운 ${won(next)}(기준가 ${fx(next / sug)}) · ${salesPart}`;
  } else if (mode === 'drain') {
    const h = spec.horizon ?? PRICE_POLICY.drainHorizon;
    const dt = drainTarget(ks, p, monthOfYear, h);
    const supply = dt ? `병 ${dt.stock.toLocaleString()} + 맞는 원액 ${dt.cask.toLocaleString()}병을 ${h}개월에` : `${h}개월에`;
    const edge = dt?.at === 'cap' ? `(상한 — 그래도 다 팔린다)` : dt?.at === 'floor' ? `(바닥 — 그래도 남는다)` : '';
    line = dt && Math.abs(dt.price - next) >= 100
      ? `${supply} 팔 값 ${won(dt.price)}(기준가 ${fx(dt.factor)})${edge} · 한 달 한 단계 제한으로 이번 달 ${won(next)} · ${salesPart}`
      : `${supply} 팔 값 ${won(next)}(기준가 ${fx(next / sug)})${edge} · ${salesPart}`;
  } else if (mode === 'turnover') line = `이번 달 판매 이익(같은 범주 합) 최대 ${won(next)}(기준가 ${fx(next / sug)}) · ${salesPart}`;
  else line = `정한 배수 ${fx(next / sug)} = ${won(next)} · ${salesPart}`;
  let warn: string | null = null;
  if (mode === 'profit' && t != null && d.price != null) {
    const stray = next < Math.min(p.price, t) - 50 || next > Math.max(p.price, t) + 50; // 지금 값과 목표 사이를 벗어남(반대쪽 · 목표 너머)
    // ① 가드 기준이 지난번 정책 배수(lastFactor)라 지금 값과 목표 사이를 벗어날 때. 엔진은 [결정 #438 ①](#1266)부터 끈 뒤 다시 켜면 배수를 버린다 —
    //    그래서 지금 이 경고가 뜨는 것은 그 전에 다시 켠 채로 저장된 세이브뿐이다. 경고 자체는 남긴다(버전이 다른 세이브 대비 · mkt-pricing-postrun §1)
    if (stray) warn = `지난번 정책 배수(${fx(spec.lastFactor ?? next / sug)})에서 한 달 한 단계씩 움직여, 목표(${won(t)})를 벗어난 값으로 간다 — 예전 빌드에서 남은 배수다. 자동 가격을 한 번 껐다 켜면 지금 값에서 다시 시작한다`;
    // ② 목표가 이 제품 판매를 크게 줄이는데, 형제 쪽 이익 때문일 때
    else if (t > p.price && atNow!.demandBottles > 0 && atTarget!.demandBottles < atNow!.demandBottles * POLICY_SIBLING_WARN
      && (atTarget!.lineupContribution - atTarget!.contribution) > (atNow!.lineupContribution - atNow!.contribution))
      warn = `같은 범주 형제 제품 쪽 이익을 키우려고 이 제품 값을 올린다 — 목표 값이면 이 제품 판매 월 ${Math.round(atNow!.demandBottles).toLocaleString()} → ${Math.round(atTarget!.demandBottles).toLocaleString()}병. 이 제품만 보려면 손 가격이나 C를 쓴다`;
  }
  // [결정 #441] D — 맞는 원액을 공급으로 세는데 자동 납품이 꺼져 있으면, 손으로 병입하지 않는 한 병 재고만 팔린다(70개월 시나리오: 원액 넉넉 → 값 내림 → 병이 2개월에 바닥)
  if (mode === 'drain' && !p.autoRestock) {
    const dt = drainTarget(ks, p, monthOfYear, spec.horizon ?? PRICE_POLICY.drainHorizon);
    if (dt && dt.cask > 0 && atNext!.demandBottles > 0) {
      const m = p.stockBottles / atNext!.demandBottles;
      if (m < (spec.horizon ?? PRICE_POLICY.drainHorizon)) warn = `맞는 원액 ${dt.cask.toLocaleString()}병을 공급으로 셌는데 자동 납품이 꺼져 있다 — 병입하지 않으면 병 재고 ${p.stockBottles.toLocaleString()}병은 이 값으로 약 ${m < 1 ? '1개월 안' : `${Math.round(m)}개월`}에 바닥난다. 자동 납품을 켜거나 병입한다`;
    }
  }
  return { line, warn, next };
}

/**
 * [제안 P-MKT-54 · PM 2026-11-28] 꺼진 제품을 B · C로 켜면 그 자리에서 정할 값 — 지금 값이 B · C 범위(플레이어가 고친 범위, 없으면 기준가 × 0.6 ~ 2) 밖일 때만.
 * 켜는 순간 범위로 잘려 값이 크게 움직이는 것(153 「김포 블렌디드」 ×2.42 → B ×2.00, −19%)을 켜기 전에 보인다. 엔진과 같은 함수(`decidePolicyPrice`)로 센다 —
 * B는 막 켠 달의 가드 기준 = 지금 배수(엔진 #1295), C는 「처음 켠 달」(목표 배수로). **읽기만** · 아는 품질(ks). A · D는 범위 밖 값도 쓰니 보이지 않는다
 */
export function enablePreview(ks0: GameState, p0: Product, monthOfYear: number): { min: number; max: number; factor: number; profit: number | null; premium: number | null; restock: boolean } | null {
  if (p0.autoPrice || p0.dutyFreeOnly || p0.price <= 0) return null;
  // 재고 0 — 켜도 정책은 건너뛰고, 재고가 들어오는 달에 정한다 → 그 달 값을 1병 들인 진열로 센다(「켜면 바로」라고 하지 않는다)
  const restock = p0.stockBottles <= 0;
  const ks = restock ? withOneBottle(ks0, p0.id) : ks0;
  const p = ks.commerce.products.find((x) => x.id === p0.id) ?? p0;
  const sug = currentSuggested(ks, p);
  if (sug <= 0) return null;
  const min = p.pricePolicy?.min ?? PRICE_POLICY.min, max = p.pricePolicy?.max ?? PRICE_POLICY.max;
  const factor = p.price / sug;
  if (factor >= min - 1e-9 && factor <= max + 1e-9) return null;
  const { lastFactor: _drop, ...rest } = p.pricePolicy ?? { mode: 'profit' as const };
  void _drop;
  const at = (mode: 'profit' | 'premium', lastFactor?: number) => decidePolicyPrice(ks, p, { ...rest, mode, ...(lastFactor != null ? { lastFactor } : {}) } as PolicySpec, monthOfYear).price;
  const keep = (v: number | null) => (v != null && v !== p.price ? v : null); // 켜도 값이 그대로면 보이지 않는다
  const profit = keep(at('profit', factor)), premium = keep(at('premium'));
  return profit == null && premium == null ? null : { min, max, factor, profit, premium, restock };
}

