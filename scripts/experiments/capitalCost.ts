// MGT-C 숙성 자본비용 (요구사항 감사 Phase B — docs/design/mgt-stage-t.md 「요구사항」 REQ-MGT-1~3). **측정 도구이고 게임 규칙이 아니다.**
// PROD-A(장기 숙성 투자 모델)가 숙성 경로 수익률을 같은 기준으로 내도록, 할인율·차입비용·유동성·원액 운전자본을 한 곳에서 정의한다.
// 게임 상태를 읽기만 한다(값을 바꾸지 않는다). 쓰는 법:
//   import { discountRate, spiritCapital, liquidity, npv, irr, holdMargin } from './capitalCost';
//   - 경로 비교(PROD-A): 경로마다 현금흐름 [{ month, amount }]을 만들고 npv(cfs, discountRate(s0, 'marginal'))·irr(cfs)를 같이 낸다
//   - 판 진단: 매달 spiritCapital(s)·liquidity(s)를 기록한다(묶인 돈 최고치·최저 런웨이)
// 기본값은 모두 게임 상수(LOAN_OFFERS·CASK_STORAGE·BULK)에서 읽는다 — 여기서 새 수치를 만들지 않는다.
// 게임에 넣을지(예: 재무 탭 "원액에 묶인 돈")는 [제안 P-MGT-30] — 넣으면 src/sim/capital.ts(MGT)로 옮기고 이 파일은 그것을 다시 내보낸다
import type { GameState, SpiritLot } from '../../src/sim';
import { LOAN_OFFERS } from '../../src/sim/content/finance';
import { CASK_STORAGE } from '../../src/sim/content/catalog';
import { bulkValuePerLPA, isBulkKind, spotBidPerLPA } from '../../src/sim/bulk';
import { BULK } from '../../src/sim/content/market';
import { monthlyFixedCost } from '../../src/sim/loans';
import { regionOf } from '../../src/sim/content/regions';
import { R0_EVAP } from '../../src/sim/maturation';

/** 원액 LPA (리터 × 도수) */
const lpa = (l: Pick<SpiritLot, 'volumeL' | 'abv'>) => l.volumeL * l.abv;

/** 연 이율 → 월 이율 (복리) */
export const monthlyRate = (annual: number) => Math.pow(1 + annual, 1 / 12) - 1;

/** 지금 이 판이 새로 빌릴 수 있는 대출 상품 (지역·요건·이미 받은 상품 제외) — 금리 낮은 순 */
export function availableOffers(s: GameState) {
  const taken = new Set(s.finance.loans.map((l) => l.offerId));
  return LOAN_OFFERS.filter((o) => !taken.has(o.id) && (!o.regions || o.regions.includes(s.regionId)) && (o.requires !== 'producedSoju' || s.production.flags.producedSoju) && !o.collateral)
    .sort((a, b) => a.annualRate - b.annualRate);
}

/**
 * 할인율 (연) — REQ-MGT-1. 이 게임에는 예금 이자가 없어 "현금을 놀리는 비용"이 0이므로, 자본비용은 **다음에 빌려야 할 돈의 금리**로 본다.
 *  'marginal' = 지금 새로 빌릴 수 있는 가장 싼 상품의 금리(한도가 남은 사다리의 다음 칸). 다 썼으면 급전 금리 — 기준값
 *  'debt'     = 지금 갚고 있는 대출의 잔액 가중 평균 금리(빚이 없으면 0) — 이미 진 빚의 평균 비용
 *  'zero'     = 0 (자본비용을 빼고 본 숙성 수익 — 비교용)
 *  숫자를 주면 그 값 (민감도: 0 · 정책자금 · 운전자금 · 급전)
 */
export function discountRate(s: GameState, basis: 'marginal' | 'debt' | 'zero' | number = 'marginal'): number {
  if (typeof basis === 'number') return basis;
  if (basis === 'zero') return 0;
  if (basis === 'debt') {
    const bal = s.finance.loans.reduce((t, l) => t + l.balance, 0);
    if (bal <= 0) return 0;
    return s.finance.loans.reduce((t, l) => t + l.balance * l.annualRate, 0) / bal;
  }
  const next = availableOffers(s)[0];
  return next ? next.annualRate : (LOAN_OFFERS.find((o) => o.emergency)?.annualRate ?? 0.2);
}

/** 민감도 띠 — 게임의 금리 사다리에서 읽는다: 0 · 가장 싼 정책자금 · 운전자금 · 급전 */
export function discountBands(): { label: string; annual: number }[] {
  const rate = (id: string) => LOAN_OFFERS.find((o) => o.id === id)?.annualRate ?? NaN;
  return [
    { label: '0 (자본비용 없음)', annual: 0 },
    { label: '정책자금(지자체)', annual: rate('kr_regional') },
    { label: '운전자금', annual: rate('working') },
    { label: '급전', annual: rate('emergency') },
  ];
}

/**
 * 원액 운전자본 — REQ-MGT-3. 원액(탱크·캐스크)에 묶인 돈.
 *  cost    = 장부 기준: LPA × 원액 원가(costPerLPA — 원재료·에너지·통 배분·보관비가 쌓인 값). "이미 쓴 돈"
 *  market  = 시가 기준: LPA × 지금 현물 매입가(progress.netWorth와 같은 식). "지금 팔면 받는 돈" = 계속 들고 있는 것의 기회비용
 *  casks·lpa = 원액이 든 자체 통 수·LPA 합 / burnMonths = 시가 ÷ 월 고정비(묶인 돈이 고정비 몇 달치인가)
 *  shareOfAssets = 시가 ÷ (현금 + 매출채권 + 시가) — 유동 자산 중 원액 비중
 *  고객 소유 통(캐스크 오너십)은 뺀다. 소주·진 원액은 현물 시장이 없어 시가 0(netWorth와 같다)
 */
export function spiritCapital(s: GameState) {
  const own = [...s.inventory.lots, ...s.inventory.casks.filter((c) => c.contents && !c.owner).map((c) => c.contents!)];
  let cost = 0, market = 0, lp = 0;
  for (const l of own) { cost += lpa(l) * l.costPerLPA; market += isBulkKind(l) ? lpa(l) * spotBidPerLPA(s, l) : 0; lp += lpa(l); }
  const casks = s.inventory.casks.filter((c) => c.contents && !c.owner).length;
  const fixed = monthlyFixedCost(s);
  const receivables = s.finance.receivables.reduce((t, r) => t + r.amount, 0);
  const liquid = Math.max(0, s.finance.cash) + receivables + market;
  return { cost: Math.round(cost), market: Math.round(market), casks, lpa: Math.round(lp), burnMonths: fixed > 0 ? market / fixed : Infinity, shareOfAssets: liquid > 0 ? market / liquid : 0 };
}

/**
 * 차입비용 — REQ-MGT-2. 원액에 묶인 돈 중 빚으로 댄 몫과 그 이자.
 *  debtFinanced = min(대출 잔액, 원액 장부가) — 빚이 원액보다 크면 원액 전부를 빚으로 댄 것으로 본다(보수적)
 *  interestPerMonth = debtFinanced × 지금 대출의 가중 평균 금리 ÷ 12 (게임 이자 계산 loans.ts runFinance와 같은 단리 월할)
 */
export function inventoryDebt(s: GameState) {
  const bal = s.finance.loans.reduce((t, l) => t + l.balance, 0);
  const debtFinanced = Math.min(bal, spiritCapital(s).cost);
  return { debtFinanced, interestPerMonth: Math.round((debtFinanced * discountRate(s, 'debt')) / 12) };
}

/**
 * 유동성 — REQ-MGT-2. 원액을 계획보다 일찍 팔게 될 위험의 선행 지표.
 *  runway       = 현금 ÷ 월 고정비 (화면 파산 배너와 같은 분모)
 *  runwayCredit = (현금 + 새로 빌릴 수 있는 싼 대출 한도(급전 제외)) ÷ 월 고정비 — 대출을 "정상 조달"로 볼 때의 런웨이
 *  forcedHaircut = 1 − 시가 ÷ 장부가 — 지금 원액을 전부 현물로 팔면 장부가 대비 잃는 비율(음수면 이익)
 */
export function liquidity(s: GameState) {
  const fixed = monthlyFixedCost(s);
  const credit = availableOffers(s).filter((o) => !o.emergency).reduce((t, o) => t + o.max, 0);
  const sc = spiritCapital(s);
  return { runway: fixed > 0 ? s.finance.cash / fixed : Infinity, runwayCredit: fixed > 0 ? (s.finance.cash + credit) / fixed : Infinity, undrawnCredit: credit, forcedHaircut: sc.cost > 0 ? 1 - sc.market / sc.cost : 0 };
}

/** 현금흐름 한 줄 — month는 기준 달(0)부터의 개월, amount는 들어오면 +, 나가면 − */
export interface CashFlow { month: number; amount: number }

/** 순현재가치 (연 할인율, 월 복리) — REQ-MGT-1 */
export const npv = (cfs: CashFlow[], annual: number) => { const r = monthlyRate(annual); return cfs.reduce((t, c) => t + c.amount / Math.pow(1 + r, c.month), 0); };

/** 내부수익률 (연) — 이분법. 부호가 한 번도 바뀌지 않으면 NaN */
export function irr(cfs: CashFlow[]): number {
  const f = (a: number) => npv(cfs, a);
  let lo = -0.99, hi = 10;
  if (Math.sign(f(lo)) === Math.sign(f(hi))) return NaN;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (Math.sign(f(mid)) === Math.sign(f(lo))) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/**
 * 지난 12개월 실제 증발률 (연, 액량 기준) — 월 리포트의 angelsShareL ÷ 그달 자체 통 원액 L. 기록이 없으면 모델 기준값(10°C 200L 배럴, 연 약 2% — 스코틀랜드형)
 * 지역·통 크기·숙성고 온도를 다 반영한 실제 값이라 PROD-A 경로 비교에는 이 값을 쓰거나 경로 시뮬레이션의 실제 증발을 쓴다
 */
export function measuredEvapPerYear(s: GameState): number {
  const rs = s.history.reports.slice(-12).filter((r) => r.angelsShareL > 0);
  const vol = s.inventory.casks.filter((c) => c.contents && !c.owner).reduce((t, c) => t + c.contents!.volumeL, 0);
  if (!rs.length || vol <= 0) return 1 - Math.pow(1 - R0_EVAP, 12);
  const monthly = rs.reduce((t, r) => t + r.angelsShareL, 0) / rs.length / vol;
  return 1 - Math.pow(1 - monthly, 12);
}

/**
 * 통 하나를 n개월 더 들고 있을 때의 한계 손익 (현물 기준) — REQ-MGT-1. PROD-A의 "더 둘까, 지금 쓸까" 기준선.
 *  gain     = 현물 기준 가치 상승(BULK.agePerYear — 숙성 1년당 가치 +20%) − 증발로 잃는 몫(evapPerYear — 주지 않으면 measuredEvapPerYear)
 *  carry    = 보관비(통당 월 5,000원 × 지역 인건비 배수) + 보험료(가치 × 월 0.1%)
 *  capital  = 지금 가치 × ((1 + 월 이율)^n − 1) — 지금 팔아 빚을 줄였으면 아꼈을 이자
 *  margin   = gain − carry − capital (> 0이면 들고 있는 편이 낫다 — 현물 기준. 병입 가치 기준은 PROD-A가 같은 틀에 병입 순수입을 넣는다)
 *  병입해 팔 때의 가치(숙성 프리미엄 #117·수요)는 PROD·MKT 함수라 여기서 다시 만들지 않는다 — value를 주면 그 값을 쓴다
 */
export function holdMargin(s: GameState, lot: SpiritLot, months: number, opts: { annual?: number; evapPerYear?: number; value?: (oakMonths: number, volumeL: number) => number } = {}) {
  const annual = opts.annual ?? discountRate(s, 'marginal');
  const evap = opts.evapPerYear ?? measuredEvapPerYear(s);
  const volNow = lot.volumeL, volLater = lot.volumeL * Math.pow(1 - evap, months / 12);
  const valueAt = opts.value ?? ((oak: number, vol: number) => vol * lot.abv * bulkValuePerLPA(s, { ...lot, oakMonths: oak }));
  const now = valueAt(lot.oakMonths, volNow);
  const later = valueAt(lot.oakMonths + months, volLater);
  const labor = regionOf(s).laborCost;
  const carry = months * (CASK_STORAGE.perCaskPerMonth * labor) + ((now + later) / 2) * CASK_STORAGE.insuranceRatePerMonth * months;
  const capital = now * (Math.pow(1 + monthlyRate(annual), months) - 1);
  return { now: Math.round(now), later: Math.round(later), gain: Math.round(later - now), carry: Math.round(carry), capital: Math.round(capital), margin: Math.round(later - now - carry - capital), annual };
}

/**
 * 손익분기 숙성 연수 (현물 기준 닫힌 식) — REQ-MGT-1. 가치 V(y) = V₀ × (1 + a·y) (a = BULK.agePerYear, #117 병 프리미엄도 같은 기울기)이면
 * 1년 더 둘 때 가치 증가율은 a / (1 + a·y)이다. 이것이 들고 있는 비용률(증발 e + 자본비용 r + 보관·보험 k)과 같아지는 연수:
 *   y* = 1 / (e + r + k) − 1 / a          (k = 연 보관비·보험료 ÷ 통 가치 — 통당 고정비라 비싼 통일수록 k가 작아 y*가 길다)
 * y*가 지금 연수보다 짧으면 현물 기준으로는 더 묵힐수록 손해다. 병입 순수입 기준(병당 고정비·수요)은 PROD-A가 같은 식의 a를 바꿔 넣는다
 */
export function breakEvenAge(s: GameState, lot: SpiritLot, annual = discountRate(s, 'marginal'), evapPerYear = measuredEvapPerYear(s)) {
  const a = BULK.agePerYear;
  const value = lpa(lot) * bulkValuePerLPA(s, lot);
  const k = value > 0 ? (12 * CASK_STORAGE.perCaskPerMonth * regionOf(s).laborCost) / value + 12 * CASK_STORAGE.insuranceRatePerMonth : Infinity;
  const hurdle = evapPerYear + annual + k;
  return { years: hurdle > 0 ? 1 / hurdle - 1 / a : Infinity, hurdle, e: evapPerYear, r: annual, k, growthNow: a / (1 + a * (lot.oakMonths / 12)) };
}
