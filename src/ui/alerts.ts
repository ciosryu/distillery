// 위기 경고·이번 달 할 일·지난달 현금 흐름·대출 상환 예정 — 화면용 계산 (코어 UI, 1차 MVP 플레이테스트 2026-11-08 대응 ①~④)
// 게임 규칙·상태를 바꾸지 않는다. 시뮬레이션과 같은 식(step.ts 파산 판정, loans.ts runFinance 대출 납부)을 읽기만 한다.
// 1차 MVP 판: 117개월째 파산, 대출 누적 20억 실행(파산 때 잔액 약 7.2억) — 현금 부족을 몰랐고, 돈이 어디로 나가는지, 언제 상환이 몰리는지 보이지 않았다 (mvp.md §7.4)

import { isFlagshipCandidate } from '../sim/delegateCheck';
import { regionOf } from '../sim/content/regions';
import { calendar, campaignMinOakMonths, campaignWon, rulesVersionOf, domesticDemands, BANKRUPT_AFTER_MONTHS, CASH_FLOW_LINES, isBulkKind, selfFundedCash, spotQuote, warehouseCapacity, whiskyMinMonths, type Action, type CashFlowKey, type GameState, type MonthReport, type Product, stagesOf } from '../sim';
import { AUTO_SAMPLE_EXPENSE, AUTO_SAMPLE_MIN_AGE } from '../sim/blendTable';
import { EQUIPMENT } from '../sim/content/catalog';
import { isLocked } from '../sim/scenario';
import { undefendedDisasters } from '../sim/events';
import { handfillCask, hasHandfillZone } from '../sim/handfill';
import { exportShortfalls } from '../sim/market';
import { retailBreakRemaining, retailCancellationCost } from '../sim/deals';
import { ibAgedCaskCount } from '../sim/bulk';
import { autoFillPreview } from '../sim/autoFill';
import { autoRestockPlan, autoRestockSources, autoRestockSupported, guardedFlagshipCasks, productMonthlyPace } from '../sim/economics';
import { reserveCaskIds } from '../sim/tags';
import { caskEligibility } from '../sim/ledger';
import { specialistOffers, SPECIALIST_STAGE } from '../sim/hr';
import { AUTO_RESTOCK_EXPENSE, caskRunway, CUTBACK_HINT, productionCutback, productionValue, sojuSupply, SOJU_STOCK_WARN_MONTHS, tankLotWaitMonths, whiskySupplyForecast } from '../sim/economics';
import { monthlyFixedCost } from '../sim/loans';
import { FINISH, finishLabel, finishOf, vesselMaterial } from '../sim/maturation';

// ───────────── ① 파산 카운트다운 ─────────────

export interface CashAlert {
  level: 'danger' | 'warn';
  /** 연속 현금 부족 개월 (월말 기준, step.ts phaseSettle) */
  negativeMonths: number;
  /** 앞으로 월말이 몇 번 더 마이너스면 파산하는가 (1 = 이번 달 말) */
  monthEndsLeft: number;
  /** 최근 3개월 자체 현금 흐름(차입·투자·선급금·설비 구매 제외)으로 본 런웨이 — 흑자거나 기록이 없으면 null */
  runwayMonths: number | null;
  /** 최근 3개월 평균 자체 순현금 */
  avgSelfFunded: number | null;
  kind: 'negative' | 'belowZeroNow' | 'runway';
}

/** 런웨이 경고 기준(개월) — 이 속도로 이 안에 현금이 바닥나면 미리 경고한다 (화면 안내 기준, 게임 규칙 아님) */
/** 자동 통입 줄 앵커 — PROD `panels/AutoFill.tsx` `AUTOFILL_ANCHOR`와 같은 값(테스트가 묶는다). 그 파일을 import하면 store·React가 딸려 와 봇(mvp-human — cashAlert만 씀)이 node에서 깨진다 */
export const AUTOFILL_ROW_ANCHOR = 'autofill-row';
export const RUNWAY_WARN_MONTHS = 3;

/**
 * 런웨이에 넣는 한 달 현금 흐름 = 자체 현금 흐름(차입·투자 유치·선급금 제외)에서 **설비 구매를 뺀** 값.
 * 설비는 한 번 나가는 돈이라 "이 속도"가 아니다 — 시작하자마자 비지터 센터(8천만)를 지으면 첫 달에 "약 3개월 뒤 바닥" 경보가 떴다
 * (실제 런웨이 약 17개월, 다음 달 사라짐 — 결정 대기 19 실험에서 발견). 빈 통 구매는 매달 되풀이되므로 남긴다
 */
export const recurringCash = (r: MonthReport) => selfFundedCash(r) - (r.offTurn?.equipment ?? 0);

export function runway(s: GameState): { avg: number | null; months: number | null } {
  const recent = s.history.reports.slice(-3);
  if (!recent.length) return { avg: null, months: null };
  const avg = recent.reduce((t, r) => t + recurringCash(r), 0) / recent.length;
  return { avg, months: avg < 0 ? Math.floor(Math.max(0, s.finance.cash) / -avg) : null };
}

/**
 * 지금 보여야 할 현금 경고. 파산 = 월말 현금 마이너스가 BANKRUPT_AFTER_MONTHS번 이어질 때.
 * - 현금 부족 n개월째: 위험(빨강) — 월말이 (B − n)번 더 마이너스면 파산
 * - 지금 현금이 마이너스(턴 사이 지출): 이번 달 말까지 메우지 못하면 1개월째
 * - 흑자 아님 + 런웨이 RUNWAY_WARN_MONTHS개월 이하: 주의(노랑)
 */
export function cashAlert(s: GameState): CashAlert | null {
  if (s.status !== 'running') return null;
  const n = s.finance.negativeCashMonths;
  const r = runway(s);
  const base = { negativeMonths: n, monthEndsLeft: Math.max(1, BANKRUPT_AFTER_MONTHS - n), runwayMonths: r.months, avgSelfFunded: r.avg };
  if (n > 0) return { ...base, level: 'danger', kind: 'negative' };
  if (s.finance.cash < 0) return { ...base, level: 'danger', kind: 'belowZeroNow' };
  if (r.months != null && r.months <= RUNWAY_WARN_MONTHS) return { ...base, level: 'warn', kind: 'runway' };
  return null;
}

// ───────────── ② 대출 상환 예정 ─────────────

export interface LoanMonth { month: number; interest: number; principal: number; payment: number }

/**
 * 앞으로 months개월 대출 원리금 — loans.ts runFinance와 같은 식(거치 기간은 이자만, 그 뒤 원리금 균등, 잔액 한도).
 * 0 = 이번 달 말 결산에서 나갈 돈. 새 대출·조기 상환은 반영하지 않는다
 */
export function loanSchedule(s: GameState, months = 12): LoanMonth[] {
  const out: LoanMonth[] = Array.from({ length: months }, (_, i) => ({ month: s.month + i, interest: 0, principal: 0, payment: 0 }));
  for (const l of s.finance.loans) {
    let bal = l.balance;
    for (let i = 0; i < months && bal > 0; i++) {
      const m = s.month + i;
      const interest = Math.round(bal * (l.annualRate / 12));
      const principal = m < l.startMonth + l.graceMonths ? 0 : Math.min(bal, l.monthlyPayment - interest);
      bal -= principal;
      out[i]!.interest += interest;
      out[i]!.principal += principal;
      out[i]!.payment += interest + principal;
    }
  }
  return out;
}

/** 거치가 끝나 월 납부가 크게 뛰는 첫 달 — 이번 달보다 20% 넘게 오르는 달 (없으면 null) */
export function paymentJump(sched: LoanMonth[]): { month: number; from: number; to: number } | null {
  const first = sched[0]?.payment ?? 0;
  for (const m of sched.slice(1)) if (m.payment > first * 1.2 && m.payment - first >= 1_000_000) return { month: m.month, from: first, to: m.payment };
  return null;
}

// ───────────── ③ 이번 달 할 일 ─────────────

export type TodoTarget = { tab: string } | { anchor: string };
/** 할 일 줄에서 바로 실행하는 버튼(이동 대신) — 되돌릴 수 있는 설정만(#240 되돌릴 수 없는 버튼 원칙) */
export interface TodoQuick { label: string; action: Action; done: string }
export interface Todo { id: string; level: 'danger' | 'warn' | 'info'; text: string; action: string; target: TodoTarget; quick?: TodoQuick }

const SOJU = 'soju_distilled';
const WHISKY_CATS = new Set(['whisky', 'grain_whisky', 'blended_whisky']);

/** 범주 묶음의 재고 개월 수 — 최근 3개월 판매 기준. 판매가 없으면 재고가 있으면 Infinity, 없으면 0 */
function stockMonths(s: GameState, inCat: (c: string) => boolean): { stock: number; months: number } {
  // 면세 전용 한정판(제주)은 국내 재고가 아니다 — 재고와 판매 양쪽에서 같이 뺀다
  const domestic = s.commerce.products.filter((p) => inCat(p.category) && !p.dutyFreeOnly);
  const ids = new Set(domestic.map((p) => p.id));
  const stock = domestic.reduce((t, p) => t + p.stockBottles, 0);
  const recent = s.history.reports.slice(-3);
  const sold = recent.reduce((t, r) => t + r.sales.filter((x) => ids.has(x.productId)).reduce((u, x) => u + x.bottles, 0), 0);
  const per = recent.length ? sold / recent.length : 0;
  return { stock, months: per > 0 ? stock / per : stock > 0 ? Infinity : 0 };
}

/**
 * 결품 — 재고가 있지만 이번 달 수요(같은 범주 나눔 반영)보다 적어 다음 턴에 바닥날 제품, 이미 품절인 제품(면세 한정판 제외).
 * 판매 화면과 같은 수요 계산(domesticDemands)이다. 실제 판매는 ±10%·소매 역량에 따라 조금 다르다
 */
export function stockoutSoon(s: GameState): { soon: { id: string; name: string; stock: number; demand: number }[]; empty: { id: string; name: string }[] } {
  const d = domesticDemands(s, calendar(s).monthOfYear);
  const soon: { id: string; name: string; stock: number; demand: number }[] = [];
  const empty: { id: string; name: string }[] = [];
  for (const p of s.commerce.products) {
    if (p.dutyFreeOnly) continue;
    if (p.stockBottles <= 0) { empty.push({ id: p.id, name: p.name }); continue; }
    const dem = Math.round(d.get(p.id)?.demandBottles ?? 0);
    if (dem > 0 && p.stockBottles < dem) soon.push({ id: p.id, name: p.name, stock: p.stockBottles, demand: dem });
  }
  return { soon, empty };
}

/** 샘플 기록이 이만큼 오래된 통은 "샘플 시기" — 자동 샘플(#177)이 뜨는 기준과 같게 둔다 */
export const SAMPLE_STALE_MONTHS = AUTO_SAMPLE_MIN_AGE;
/** "샘플 시기"인 통 — 오크 숙성 SAMPLE_STALE_MONTHS개월 이상이고 자기 샘플 기록이 그만큼 오래됐거나 없다 (할 일·증류소 탭 숙성고 요약이 같이 쓴다) */
export const staleSampleCasks = (s: GameState) =>
  s.inventory.casks.filter((c) => c.contents && !c.owner && c.contents.oakMonths >= SAMPLE_STALE_MONTHS && s.month - (c.sampleLog?.at(-1)?.month ?? -Infinity) >= SAMPLE_STALE_MONTHS);

/** 재고가 이보다 적으면 "병입할 때" — 화면 안내 기준 */
export const RESTOCK_MONTHS = 2;
/** 핵심 전문가 할 일을 해금 소식 뒤 몇 개월 띄우나 (화면 안내 기준) — 7차 판 뒤 9 → 21개월(판정 무렵인 144개월까지) */
export const SPECIALIST_TODO_MONTHS = 21;

/**
 * 원액 현물 판매가 파는 것 (#203, 3차 MVP 플레이테스트 — "파산 경고를 보고 패닉에 몰트 원액을 8번(1.58억) 팔았다", mvp.md §7.9).
 * 새 식을 만들지 않는다: 지금 받는 돈 = B2B 현물 판매 화면과 같은 견적(`spotQuote`), 위스키 병 수 = 공급 전망(#178 `whiskySupplyForecast`)의
 * 탱크·숙성 중인 통 몫, 매출 = 생산 가치(#185 `productionValue`)의 1년 숙성 권장 출고가. 탱크 뉴메이크와 숙성 중인 통을 나눈다.
 * 이미 법정 숙성을 채운 통은 "지금 위스키"라 병 수 대신 통 수만 센다. 우리 원액(위탁 통·매입 원액 제외)이 없으면 null
 */
export interface SpiritStake { count: number; spotNow: number; bottles: number; revenue: number | null }
export function spotSaleStake(s: GameState): { tank: SpiritStake | null; casks: SpiritStake | null; ready: { count: number; spotNow: number } | null; minMonths: number } | null {
  const v = productionValue(s);
  const min = v.minMonths;
  const f = whiskySupplyForecast(s, Math.max(1, Math.ceil(min / 12)), min);
  const price = v.pricePerBottle;
  const mine = s.inventory.casks.filter((c) => c.contents && !c.owner && isBulkKind(c.contents) && !c.contents.sourced);
  const lots = s.inventory.lots.filter((l) => isBulkKind(l) && !l.sourced);
  const aging = mine.filter((c) => c.contents!.oakMonths < min);
  const ready = mine.filter((c) => c.contents!.oakMonths >= min);
  const stake = (count: number, spotNow: number, bottles: number): SpiritStake | null => (count ? { count, spotNow, bottles, revenue: price != null ? bottles * price : null } : null);
  const tank = stake(lots.length, lots.reduce((t, l) => t + spotQuote(s, l, l.volumeL), 0), f.reduce((t, y) => t + y.fromTank, 0));
  const casks = stake(aging.length, aging.reduce((t, c) => t + spotQuote(s, c.contents!, c.contents!.volumeL, c), 0), f.reduce((t, y) => t + y.fromCasks, 0));
  const r = ready.length ? { count: ready.length, spotNow: ready.reduce((t, c) => t + spotQuote(s, c.contents!, c.contents!.volumeL, c), 0) } : null;
  return tank || casks || r ? { tank, casks, ready: r, minMonths: min } : null;
}

/**
 * 12년 플래그십 후보 통 (#240) — 판이 끝나기 전에 플래그십 숙성(MVP 144개월)을 채울 수 있는 우리 몰트·그레인 통. 식은 #238의
 * `isFlagshipCandidate`(sim/delegateCheck.ts) 하나만 쓴다(같은 숫자를 두 식으로 만들지 않는다). 고객 소유(캐스크 오너십) 통은 뺀다.
 * 시나리오에서 이 수가 0이 되면 15년 목표(플래그십 판매)를 이룰 수 없다 — 5차 판이 70개월째 맡기기로 그렇게 됐다(mvp.md §7.16)
 */
export const flagshipCandidates = (s: GameState) => s.inventory.casks.filter((c) => !c.owner && isFlagshipCandidate(s, c));
/** 이 수 이하로 남으면 할 일 맨 위 (#261) `[튜닝]` */
/**
 * 새로 열린 단계가 가리키는 탭 — 할 일 "새로 열림"과 소식 창이 같은 것을 쓴다.
 * 7차 판: 11년 차 핵심 전문가(`action:pickSpecialist`만 연다)가 이 표에 없어 [판매] 탭으로 보냈다(오너 "못봤다") → 직원 탭
 */
export function stageTarget(st: { unlock: readonly string[] }): { tab: string; label: string } {
  const u = (k: string) => st.unlock.includes(k);
  if (u('system:commissions')) return { tab: 'blendlab', label: '블렌딩 테이블' };
  if (u('system:exports')) return { tab: 'exports', label: '수출' };
  if (u('system:caskBids') || u('system:siteDeals')) return { tab: 'b2b', label: '원액 B2B' };
  if (u('system:hr') || u('action:pickSpecialist')) return { tab: 'staff', label: '직원' };
  // #345 ② 피니싱(GAP-PROD-4): 홈 「숙성 중인 캐스크」 칸에서 고른다 — 숙성고 탭은 샌드박스만
  if (u('action:transferCask')) return { tab: 'home', label: '숙성 중인 캐스크' };
  return { tab: 'sales', label: '판매' };
}

export const FLAGSHIP_LOW = 3;

/** 핸드필 통이 빈 뒤 지난 개월과 비기 전 6개월 평균 핸드필 매출 — 결산 메모(`handfill.ts`)에서 읽는다. 빈 기록이 없으면(처음부터 미지정) null */
export function handfillIdle(s: GameState): { months: number; monthly: number } | null {
  const reps = s.history.reports;
  let i = reps.length - 1;
  while (i >= 0 && !reps[i]!.notes.some((n) => /^핸드필 .*비었다/.test(n))) i--;
  if (i < 0) return null;
  const won = (n: string) => Number(n.match(/^핸드필 \d[\d,]*병 \(([\d,]+)원\)/)?.[1]?.replace(/,/g, '') ?? 0);
  const before = reps.slice(Math.max(0, i - 5), i + 1).map((r) => r.notes.reduce((t, n) => t + won(n), 0));
  return { months: s.month - reps[i]!.month, monthly: before.length ? before.reduce((t, x) => t + x, 0) / before.length : 0 };
}

/**
 * 12년 승리 준비 (6차 판 — 146개월에 적격이 됐는데 화면이 "0개월 뒤 도달"만 보여 12개월 늦게 병입, `docs/playtest/6/arch.md` ①).
 * 새 캠페인(v16)·승리 전만. `casks` = 지금 승리 적격인 통(승리 판정과 같은 `caskEligibility` — 자가·같은 입지·몰트·목재 ≥ 기준, 고객 소유 아님),
 * `bottled` = 이미 병입해 재고가 남은 적격 로트의 제품(다음 판매가 승리). 화면만 읽는다
 */
export function flagshipReady(s: GameState): { casks: { id: string; woodMonths: number }[]; reserved: number; bottled: { name: string; stock: number } | null } | null {
  if (!s.scenario || rulesVersionOf(s) !== 'v16' || campaignWon(s)) return null;
  const reserve = reserveCaskIds(s);
  const casks = s.inventory.casks.flatMap((c) => { const e = caskEligibility(s, c); return e.eligible ? [{ id: c.id, woodMonths: e.woodMonths }] : []; });
  const lotProducts = new Set((s.commerce.lots ?? []).filter((l) => l.eligibleAtBottling).map((l) => l.productId));
  const p = s.commerce.products.find((x) => lotProducts.has(x.id) && x.stockBottles > 0);
  return { casks, reserved: casks.filter((c) => reserve.has(c.id)).length, bottled: p ? { name: p.name, stock: p.stockBottles } : null };
}
/**
 * 이 제품의 다음 자동 납품이 쓸 통 중 플래그십 후보 수 (#261 — 자동 납품 설정 표의 "이 제품은 지금 후보 통을 쓴다" 표시용, 화면은 판매 탭 소유 파트).
 * 플래그십을 팔았으면 0
 */
export function restockCandidateUse(s: GameState, p: Product): number {
  if (!s.scenario || campaignWon(s)) return 0;
  const plan = autoRestockPlan(s, p);
  if (!plan) return 0;
  return plan.components.filter((x) => { const c = x.source === 'cask' ? s.inventory.casks.find((k) => k.id === x.id) : undefined; return !!c && !c.owner && isFlagshipCandidate(s, c); }).length;
}

/** 고른 통 가운데 플래그십 후보가 몇 개이고, 쓰고 나면 몇 개 남는지 — 확인 미리보기(③ 남는 자원 경고)용 */
export function flagshipImpact(s: GameState, caskIds: string[]): { using: number; left: number; before: number; final: boolean } {
  const all = flagshipCandidates(s);
  const ids = new Set(caskIds);
  const using = all.filter((c) => ids.has(c.id)).length;
  // final: (옛 판) 목표까지 남은 달이 플래그십 숙성보다 짧아 새로 넣는 통은 후보가 될 수 없다 — 이때 후보 0은 15년 목표를 이룰 수 없다는 뜻.
  // 새 캠페인(v16)은 판 끝이 없어(#308) 새 통도 언젠가 적격이 된다 → 늘 false(MGT 지적 2026-11-14)
  const sc = s.scenario;
  const final = !!sc && rulesVersionOf(s) === 'legacy-v15' && sc.goal.months - s.month < campaignMinOakMonths(s);
  return { using, left: all.length - using, before: all.length, final };
}

/** 몰트·그레인을 마지막으로 만든 뒤 지난 개월 수 (월 결산의 실제 생산 기준). 이번 달에 멈췄으면 0 */
export function maltStoppedMonths(s: GameState): number {
  const kindOf = new Map(s.production.recipes.map((r) => [r.id, r.kind]));
  let n = 0;
  for (const r of [...s.history.reports].reverse()) {
    if (r.production.some((b) => b.lpa > 0 && (kindOf.get(b.recipeId) === 'malt' || kindOf.get(b.recipeId) === 'grain'))) break;
    n++;
  }
  return n;
}

/**
 * 이번 달 할 일 우선순위 (#203) — 위기 > 생산 멈춤 > 비지터 센터 > 결품 > 통입·병입 > 샘플. 목록에 없는 id는 병입 다음.
 * 결품(#204, 다음 달 매출을 잃는다)은 #203 뒤에 들어와 목록에 없었고 샘플 바로 위로 밀려 있었다 → 비지터 센터 다음
 */
// IB 입찰(#224)은 답할 기한이 있는 제안이라 결품 바로 다음으로 올렸다 — 후반 확인 판 오너: 제안이 왔는데 못 봐서 사라졌다(#253)
export const TODO_ORDER = ['flagship-low', 'flagship-ready', 'loan-jump', 'malt-stopped', 'cutback', 'visitor', 'stockout', 'retail-short', 'batch-short', 'casks-low', 'cask-bid', 'specialist', 'export-starve', 'restock-short', 'finish-long', 'handfill', 'fill', 'soju-glut', 'defense', 'whisky', 'soju', 'sample'];
// 꼬리 4개(defense·whisky·soju·sample)는 info만 낸다 — warn·danger를 낼 수 있는 새 id는 그 앞에 둔다(warn이 info 뒤에 묻히지 않게, PM 대조 7차 완료: soju-glut)
// 새로 열린 기능(#215, id `stage-<단계>`)은 "열린 뒤 3개월 할 일 맨 위" — 단계마다 id가 달라 목록에 없어 샘플 위로 밀려 있었다(5차 전 점검)
const todoRank = (id: string) => { if (id.startsWith('stage-')) return -1; const i = TODO_ORDER.indexOf(id); return i < 0 ? TODO_ORDER.indexOf('sample') - 0.5 : i; };
// danger 등급은 새 기능 바로 아래로 올린다(같은 danger끼리는 위 순서) — 6차 판: 오래 통입 대기(fill danger)가 할 일 3번째에 묻혔다
const todoKey = (t: Todo) => (t.level === 'danger' && !t.id.startsWith('stage-') ? -1 + todoRank(t.id) / 100 : todoRank(t.id));

/**
 * 이번 달 할 일 — 급한 순서. 시나리오 게임(MVP) 증류소 탭에 보인다. 규칙이 아니라 놓치기 쉬운 신호를 모은 안내다
 * (현금 위기는 화면 맨 위 경고가 따로 맡는다 — 여기서는 대출 거치 종료만)
 */
/**
 * 지금 병입할 수 있는 원액 — 할 일 '위스키 재고'(A7)와 '품절'(P-ARCH-66)이 **같은 셈**을 쓴다(PROD 요청 — 두 줄의 통 수가 달라 보이면 안 된다).
 * 위스키: 숙성 기준(지역 최소 개월)을 채운 자사·고객 소유 아닌 몰트·그레인 통, 플래그십 예비는 따로 센다 · 소주: 탱크 소주 L
 */
export function bottleableNow(s: GameState): { ready: number; readyReserved: number; tankSojuL: number } {
  const min = whiskyMinMonths(regionOf(s).whisky);
  const reserved = reserveCaskIds(s);
  const ripe = s.inventory.casks.filter((c) => c.contents && !c.owner && (c.contents.kind === 'malt' || c.contents.kind === 'grain') && c.contents.oakMonths >= min);
  const ready = ripe.filter((c) => !reserved.has(c.id)).length;
  const tankSojuL = s.inventory.lots.filter((l) => l.kind === 'soju').reduce((t, l) => t + l.volumeL, 0);
  return { ready, readyReserved: ripe.length - ready, tankSojuL };
}

/**
 * 피니싱이 권장 기간을 넘긴 통 (#345 ② GAP-PROD-4) — 마지막 통 구간(`finishOf`)이 권장 상한(`FINISH.recommendedMonths[1]`)을 넘은, 고객 소유가 아닌 통.
 * 숙성 개월 · 통 종류만 읽는다(원액 맛 · 품질을 읽지 않음 — 넘었다고 반드시 나빠지는 것이 아니라 "시즈닝 향이 덮을 수 있다"는 안내)
 */
export function finishOverdue(s: GameState): { id: string; months: number; label: string }[] {
  const hi = FINISH.recommendedMonths[1];
  return s.inventory.casks.flatMap((c) => {
    const f = c.contents && !c.owner ? finishOf(c.contents) : null;
    return f && f.months > hi ? [{ id: c.id, months: f.months, label: finishLabel(f.typeId) }] : [];
  });
}

export function monthTodos(s: GameState): Todo[] {
  const out: Todo[] = [];
  // 새로 열린 기능 (#215) — 연 뒤 3개월 동안 할 일 맨 위에 둔다
  for (const st of stagesOf(s)) { // F5a: 규칙 묶음별 단계
    if (!s.scenario?.stagesDone?.includes(st.id) || s.month - st.month >= 3) continue;
    const { tab, label } = stageTarget(st);
    // #259: IB 입찰 해금 안내에 나이 조건(3년↑)을 채운 통 수 — 0이면 제안이 오지 않는다(후반 확인 판)
    const ibNote = st.unlock.includes('system:caskBids') ? (() => { const n = ibAgedCaskCount(s); return n ? ` 지금 3년 이상 통 ${n}개.` : ' 지금 3년 이상 통이 없어 제안이 오지 않는다 — 통 일부를 남겨 두라.'; })() : '';
    out.push({ id: `stage-${st.id}`, level: 'warn', text: `새로 열림 — ${st.title}. ${st.text}${ibNote}`, action: label, target: { tab } });
  }
  // 남은 플래그십 후보가 적다 (#261) — 옛 판: 후보 집합이 닫힌 뒤(목표까지 남은 달 < 플래그십 숙성)에만. 새 캠페인(v16, F4): 판 끝이 없으니 후보(목재 108개월↑, 안내 지평) 수만 본다. 0통은 증류소 탭 KPI가 빨갛게 말한다
  const legacyRules = rulesVersionOf(s) === 'legacy-v15';
  if (s.scenario && !campaignWon(s) && (!legacyRules || s.scenario.goal.months - s.month < campaignMinOakMonths(s))) {
    const n = flagshipCandidates(s).length;
    const why = legacyRules ? '하나라도 남겨야 15년 안에 플래그십을 낸다' : '하나라도 남겨야 승리 출고(12년 싱글 몰트 첫 판매)를 할 수 있다';
    if (n > 0 && n <= FLAGSHIP_LOW) out.push({ id: 'flagship-low', level: 'danger', text: `남은 12년 플래그십 후보 ${n}통 — ${why}. 예비 ${reserveCaskIds(s).size}통 — 남길 통을 "플래그십 예비"로 묶으세요(자동 기능이 쓰지 않는다)`, action: '숙성고', target: { anchor: 'mvp-warehouse' } });
  }
  // 12년 승리 준비 (6차 판 arch.md ① — `[제안 P-ARCH-61]` (b)): 적격 통이 생긴 뒤 승리 전까지 늘 남는다. 이미 병입했으면 "다음 판매가 승리"
  const win12 = flagshipReady(s);
  if (win12?.bottled) out.push({ id: 'flagship-ready', level: 'info', text: `12년 싱글 몰트 「${win12.bottled.name}」 ${win12.bottled.stock.toLocaleString()}병 병입 완료 — 한 병이라도 팔리면 캠페인 승리(가격·판매 채널을 확인)`, action: '판매', target: { tab: 'sales' } });
  else if (win12 && win12.casks.length) out.push({ id: 'flagship-ready', level: 'warn', text: `12년 적격 통 ${win12.casks.length}개${win12.reserved ? `(플래그십 예비 ${win12.reserved}통 포함 — 예비는 이 병입을 위해 남긴 통이다)` : ''} — 이 통들로 싱글 몰트를 병입해 팔면 캠페인 승리(기한 없음 · 적격이 아닌 원액을 섞으면 적격이 깨진다)`, action: '블렌딩·병입', target: { tab: 'bottling' } });
  const min = whiskyMinMonths(regionOf(s).whisky); // 병입·표기와 같은 식 (blending.ts)
  // IB 캐스크 입찰 (10년 차 해금, #224) — 제안은 2개월 뒤 사라지고 원액 B2B 탭에만 보여서 할 일에 올린다
  if (s.scenario && s.b2b.caskBids.length) {
    const b = [...s.b2b.caskBids].sort((x, y) => x.expiresMonth - y.expiresMonth)[0]!;
    const c = s.inventory.casks.find((x) => x.id === b.caskId)?.contents;
    const more = s.b2b.caskBids.length > 1 ? ` 외 ${s.b2b.caskBids.length - 1}건` : '';
    out.push({ id: 'cask-bid', level: 'warn', text: `IB 입찰 제안 — ${b.buyerName}에서 통 ${b.caskId}${c ? `(숙성 ${Math.floor(c.oakMonths / 12)}년 ${c.oakMonths % 12}개월)` : ''}를 ${fmtWon(b.price)}에 사겠다고 한다${more} — ${b.expiresMonth - s.month <= 0 ? '이번 달까지' : '다음 달까지'} 답(안 하면 사라진다). 병입해 팔 때보다 싸다 — 다 못 팔 통이면 팔고, 12년 플래그십 후보면 남긴다`, action: '원액 B2B', target: { tab: 'b2b' } });
  }
  // 수출이 국내 재고를 먼저 가져갔다 (#257, 후반 확인 판 오너: 「더 퍼스트」 국내 품절을 몰랐다)
  if (s.scenario) {
    const short = exportShortfalls(s.history.reports.at(-1));
    if (short.length) {
      const unmet = short.reduce((t, x) => t + x.unmet, 0);
      out.push({ id: 'export-starve', level: 'warn', text: `수출이 국내 재고를 먼저 가져갔다 — 지난달 국내 ${unmet.toLocaleString()}병 품절(「${short[0]!.name}」${short.length > 1 ? ` 외 ${short.length - 1}개` : ''}). 국내 판매만 인지도를 키운다 — 재고를 늘리거나, 수출가 배수를 약 0.9 아래로 낮추거나, 그 제품을 「수출 안 함」(#266)으로 두면 국내가 먼저 채워진다`, action: '판매', target: { tab: 'sales' } });
    }
  }
  // 자동 납품이 원액을 못 찾는 제품 (#243, 5차 판: 「안성 소주」가 탱크를 다 써 「옹기소주」가 못 채워졌는데 이유를 몰랐다)
  if (s.scenario) {
    const short = s.commerce.products.filter((p) => p.autoRestock && autoRestockSupported(p) && p.stockBottles < productMonthlyPace(s, p) && !autoRestockSources(s, p).length);
    if (short.length) {
      const p = short[0]!;
      const recNames = (p.recipeIds ?? []).map((id) => s.production.recipes.find((r) => r.id === id)?.name ?? id);
      const whisky = WHISKY_CATS.has(p.category);
      const guarded = whisky ? guardedFlagshipCasks(s, p) : 0;
      const why = whisky ? `${p.ageYears ? `${p.ageYears}년 이상` : '위스키 숙성 기간을 채운'} 같은 피니시 통이 없다${guarded ? ` (플래그십 후보 ${guarded}통은 자동 납품이 쓰지 않게 보호 중 — 직접 병입하면 쓸 수 있다)` : ''}` : recNames.length ? `같은 레시피(${recNames.join(', ')}) 탱크 원액이 없다 — 그 레시피를 생산 지시에 넣거나 늘리세요` : '탱크에 같은 주종 원액이 없다 — 생산 지시를 늘리세요';
      out.push({ id: 'restock-short', level: 'warn', text: `자동 납품 — 「${p.name}」 채울 원액이 없다(재고 ${p.stockBottles.toLocaleString()}병) — ${why}${short.length > 1 ? ` · 외 ${short.length - 1}개 제품` : ''}`, action: whisky ? '통입·병입' : '생산 지시로', target: whisky ? { tab: 'bottling' } : { anchor: 'mvp-orders' } });
    }
  }
  // #345 ② 피니싱 권장 기간을 넘긴 통 — 병입하거나 계속 둘지. 피니싱은 한 번만이라 다른 통으로 다시 옮길 수 없다(FINISH.maxFinishes)
  const overdue = finishOverdue(s);
  if (overdue.length) {
    const o = overdue[0]!;
    out.push({ id: 'finish-long', level: 'warn', text: `피니싱 ${overdue.length}통이 권장 기간(최대 ${FINISH.recommendedMonths[1]}개월)을 넘었다 — ${o.id} ${o.label} ${o.months}개월째${overdue.length > 1 ? ` 외 ${overdue.length - 1}통` : ''}. 오래 두면 시즈닝 향이 원래 성격을 덮어 품질이 내려갈 수 있다 — 샘플을 다시 떠 보고 병입할지 정하라(피니싱은 한 번만이라 다른 통으로 옮길 수 없다)`, action: '숙성 중인 캐스크', target: { anchor: 'mvp-warehouse' } });
  }
  // 핸드필 존 (#233) — 지었는데 지정한 통이 없다(처음, 또는 통이 비어 풀림). 숙성 중인 캐스크 칸이 접혀 있어 놓치기 쉽다
  if (s.scenario && hasHandfillZone(s) && !handfillCask(s) && s.production.equipment.some((e) => EQUIPMENT[e.catalogId]?.kind === 'visitor' && e.readyMonth <= s.month)) {
    // 6차 판(PROD prod.md ⑥): 142개월에 통이 빈 뒤 16개월 미지정 — 빈 지 몇 달째인지와 그 전 매출을 붙여 같은 warn 사이에서 덜 묻히게
    const idle = handfillIdle(s);
    out.push({ id: 'handfill', level: 'warn', text: `핸드필 존에 통이 없다${idle ? ` — 통이 빈 지 ${idle.months}개월째${idle.monthly ? `(비기 전 월 약 ${fmtWon(idle.monthly)} — 그만큼 놓치는 중)` : ''}` : ''} — 숙성 중인 캐스크 칸에서 핸드필 전용 통을 고르면 방문객이 매달 500ml씩 담아 간다(병입 권장가의 약 2배)`, action: '통 고르기', target: { anchor: 'mvp-warehouse' } });
  }
  // 핵심 전문가를 아직 고르지 않았다 (MGT #610 남은 점 — 할 일에서 직원 탭 카드로 잇는 안내). 해금 소식(stage 할 일)이 내려간 뒤 SPECIALIST_TODO_MONTHS개월 — 안 고르는 것도 선택이라 끝없이 띄우지는 않는다.
  // 7차 판(오너 "못봤다"): 해금 소식 3턴을 0·0·10초에 넘겼고, 그 뒤 9개월 info는 다른 할 일 아래에 묻혔다 → warn으로 올리고 기간을 늘린다(화면만)
  {
    const opened = stagesOf(s).find((x) => x.id === SPECIALIST_STAGE)?.month;
    if (opened != null && s.month - opened >= 3 && s.month - opened < 3 + SPECIALIST_TODO_MONTHS && specialistOffers(s)) out.push({ id: 'specialist', level: 'warn', text: '핵심 전문가를 아직 고르지 않았다 — 직원 탭 카드에서 숙성고 매니저 · 마스터 블렌더 · 영업 중 한 사람(한 번만 · 안 골라도 된다)', action: '직원', target: { tab: 'staff' } });
  }
  // 비지터 센터가 없다 — 3차 MVP 판은 설비가 접힌 칸 안에 있어 "못 찾았다"(오너). 첫해 가장 큰 수입원(월 약 700만, 사람형 봇 실험)이라 할 일에 올린다
  const visitor = EQUIPMENT.visitor_basic;
  if (s.scenario && visitor && !isLocked(s, 'facility:visitor_basic') && !s.production.equipment.some((e) => EQUIPMENT[e.catalogId]?.kind === 'visitor')) {
    out.push({ id: 'visitor', level: s.month < 24 ? 'warn' : 'info', text: `비지터 센터(베이직 투어)가 없다 — ${fmtWon(visitor.cost)}, ${'leadMonths' in visitor ? visitor.leadMonths : 4}개월 뒤 문을 열면 관광 수입 월 약 600만~800만(유지비 월 ${fmtWon(visitor.maintenance)}). 첫해 소주보다 큰 수입원이다`, action: '설비에서 짓기', target: { anchor: 'mvp-equipment' } });
  }
  // 몰트 생산이 멈춰 있다 (#203 — 3차 판 "잠깐 멈추려다 다시 켜는 걸 잊었다"). 생산 지시 칸의 빨간 경고(#185)와 같은 조건·같은 말
  if (s.scenario && s.month > 0) {
    const v = productionValue(s);
    if (v.perBatch.length && v.whiskyBottlesPerYear === 0) {
      const n = maltStoppedMonths(s);
      const never = n >= s.history.reports.length; // 한 번도 만든 적이 없다 (새 판의 기본 생산 지시는 몰트 0) — "멈췄다"가 아니다
      const head = never ? '몰트 생산 지시가 없다 — 위스키가 될 원액을 아직 만들지 않았다' : `몰트 생산이 멈춰 있다 — ${n > 0 ? `${n}개월째` : '이번 달부터'}`;
      out.push({ id: 'malt-stopped', level: 'warn', text: `${head}. ${Math.ceil(v.minMonths / 12)}년 뒤부터 새로 팔 위스키가 없다 (${never ? '몰트 1배치 생산비는' : '생산을 멈춰 아끼는 돈은 몰트 1배치당'} 월 ${fmtWon(v.perBatch[0]!.costPerMonth)}뿐)`, action: '생산 지시로', target: { anchor: 'mvp-orders' } });
    }
  }
  // 결품 — 이번 달 수요보다 재고가 적어 다음 턴에 바닥난다 / 이미 품절 (2026-11-09 오너 요청: 다음 턴 재고 0 예정이면 미리 알려 달라)
  const sOut = stockoutSoon(s);
  if (sOut.soon.length || sOut.empty.length) {
    const names = (xs: { name: string }[]) => xs.slice(0, 3).map((x) => `「${x.name}」`).join(' · ') + (xs.length > 3 ? ` 외 ${xs.length - 3}개` : '');
    const parts = [
      sOut.soon.length ? `다음 달 결품 예상 ${names(sOut.soon)}(재고 ${sOut.soon[0]!.stock.toLocaleString()}병 < 수요 약 ${sOut.soon[0]!.demand.toLocaleString()}병${sOut.soon.length > 1 ? ' 등' : ''})` : '',
      sOut.empty.length ? `품절 ${names(sOut.empty)}` : '',
    ].filter(Boolean);
    // [제안 P-ARCH-66] 이미 품절인데 병입할 원액이 있으면 warn — 7차 끝: 전 제품 품절이 info(회색)로 가장 약하게 보였고 병입할 통 33개 · 탱크 소주 5,423L가 있었다.
    // "곧 품절"(soon)이 없으면 등급이 내려가던 규칙의 빈틈. 탱크 소주는 '병입 가능'으로만 짧게(생산을 줄이라는 소주 과잉 줄은 PROD 식 — 따로)
    const b = bottleableNow(s);
    const canFill = sOut.empty.length > 0 && (b.ready > 0 || b.tankSojuL >= 50);
    const fillParts = [b.ready ? `병입할 통 ${b.ready}개` : '', b.tankSojuL >= 50 ? `탱크 소주 ${Math.round(b.tankSojuL).toLocaleString()}L 병입 가능` : ''].filter(Boolean).join(' · ');
    out.push({ id: 'stockout', level: sOut.soon.length || canFill ? 'warn' : 'info', text: `${parts.join(' · ')}${canFill ? ` — ${fillParts}` : ''} — 병입하거나 [기존 제품 재고 보충]으로 채운다`, action: '블렌딩·병입', target: { tab: 'bottling' } });
  }
  // 대출 거치가 3개월 안에 끝나 납부가 뛴다
  const jump = paymentJump(loanSchedule(s, 4));
  if (jump) out.push({ id: 'loan-jump', level: 'warn', text: `${jump.month - s.month === 0 ? '이번 달' : `${jump.month - s.month}개월 뒤`} 대출 거치가 끝나 월 납부가 ${fmtWon(jump.from)} → ${fmtWon(jump.to)}로 뛴다`, action: '대출 보기', target: { tab: 'finance' } });
  // 대형 유통 납품 미달 ([결정 #334] · MKT [제안 P-MKT-42] ⓑ-2 — 6차 판: "납품 부족 n병 — 위약금"이 118~129개월 결산 메모에만 쌓이다 3건 파기).
  // 파기 기준은 MKT `retailBreakRemaining`(누적 미납이 두 달치) 한 함수. 한 달을 더 통째로 못 채우면 깨지는 계약이 있으면 danger.
  // 파기 불이익은 "계약이 끝남"뿐이다(신뢰 하락 같은 추가 효과 없음 — MKT #719 지적, 파기 불이익 규칙 P-MKT-43 ③은 오너 결정 전) → 문구를 사실대로
  {
    const short = s.commerce.retailContracts.filter((c) => c.shortfall > 0);
    if (short.length) {
      // MKT 확인(#719 a): 못 채울 계약은 해지가 파기보다 비쌀 수 있다(7차: 가온마트 해지 3,840만 대 파기까지 2,130만) → 두 값을 나란히, 더 싼 쪽을 고르게.
      // 파기까지 위약금 ≈ 남은 미납(파기까지 병) × 병당 — 파기 달에는 그 달 미납 전부를 물어 실제는 조금 더 클 수 있다 [추정]
      const lines = short.map((c) => `「${c.partner}」 누적 미납 ${c.shortfall.toLocaleString()}병 — ${retailBreakRemaining(c).toLocaleString()}병 더 못 채우면 파기(월 ${c.bottlesPerMonth.toLocaleString()}병 · 남은 ${Math.max(0, c.termMonths - c.monthsDone)}개월 · 파기까지 위약금 약 ${fmtWon(retailBreakRemaining(c) * c.penaltyPerBottle)} · 지금 해지하면 ${fmtWon(retailCancellationCost(c))})`);
      const critical = short.some((c) => retailBreakRemaining(c) <= c.bottlesPerMonth);
      out.push({ id: 'retail-short', level: critical ? 'danger' : 'warn', text: `납품 미달 — ${lines.join(' · ')}. 파기되면 계약이 끝나 남은 달의 납품 매출을 잃는다(이미 낸 위약금은 그대로) — 그 범주 재고(병입)를 늘리고, 늘릴 수 없다면 해지와 파기 중 더 싼 쪽을 고른다`, action: '납품 계약', target: { tab: 'b2b' } });
    }
  }
  // 줄인 생산 되돌리기 (PROD #725 productionCutback · P-PROD-61 — 7차 판 오너 "재고 쌓여서 생산 줄이고 그대로 깜빡했다": 62개월에 절반으로 줄인 채 155개월까지,
  // 현금 13억 · 위스키 전 품절). 조건은 PROD CUTBACK_HINT(줄인 지 3개월↑ · 현금 고정비 6개월 치↑ · 되돌리면 위스키가 는다), 재고 바닥이면 danger. 생산 탭 CutbackLine과 같은 값
  if (s.scenario) {
    const c = productionCutback(s, monthlyFixedCost(s));
    if (c && c.monthsSince >= CUTBACK_HINT.monthsSince && c.cashMonths != null && c.cashMonths >= CUTBACK_HINT.cashMonths && c.extraWhiskyBottlesPerYear > 0) {
      const stock = c.whiskyStock <= 0 ? '위스키 재고 0병' : c.whiskyMonths == null ? `위스키 재고 ${c.whiskyStock.toLocaleString()}병` : `위스키 재고 ${c.whiskyMonths.toFixed(1)}개월 치`;
      out.push({ id: 'cutback', level: c.stockLow ? 'danger' : 'warn', text: `몰트·그레인을 줄인 지 ${c.monthsSince}개월 — 지금 월 ${c.current}배치(줄이기 전 ${c.before}배치) · 현금은 고정비 ${Math.floor(c.cashMonths)}개월 치 · ${stock}${c.soldOut ? ` · 품절 ${c.soldOut}종` : ''}. 되돌리면 생산비 +${fmtWon(c.extraCostPerMonth)}/월 → 해마다 위스키 약 +${c.extraWhiskyBottlesPerYear.toLocaleString()}병`, action: '생산 지시', target: { anchor: 'mvp-orders' } });
    }
  }
  // A1(PROD 화면 메모, ARCH alerts): 지난달 지시한 배치를 다 못 만들었다 — 지금은 대시보드 결산 메모에만 있어 놓친다. 원인 문구는 생산 단계가 쓴 그대로(원재료·증류기·발효조·취수 허가)
  const lastRep = s.history.reports.at(-1);
  const shortNotes = (lastRep?.notes ?? []).filter((n) => /배치 생산 못 함|취수 허가량|증류기가 준비되지 않아/.test(n));
  if (shortNotes.length) out.push({ id: 'batch-short', level: 'warn', text: `지난달 생산 지시를 다 못 만들었다 — ${shortNotes.slice(0, 2).join(' · ')}${shortNotes.length > 2 ? ` 외 ${shortNotes.length - 2}건` : ''}`, action: '생산 지시', target: { anchor: 'mvp-orders' } });
  // A4(PROD 화면 메모): 빈 통이 곧 바닥난다 — 계산은 PROD `economics.ts caskRunway`(이번 달 가능 배치 · 탱크 적체 먼저 · 자동 통입 올림 반영)를 그대로 쓴다.
  // 자동 통입 줄(AutoFill)과 숫자가 같다. 쿠퍼리지 납기 + 1개월 안에 바닥나면 지금 주문해야 늦지 않는다 · 이미 모자라면(0개월) warn
  {
    const rw = caskRunway(s);
    if (rw && rw.casksPerMonth > 0 && rw.months < rw.leadMonths + 1) {
      out.push({ id: 'casks-low', level: rw.months < 1 ? 'warn' : 'info', text: `${rw.months < 1 ? '빈 통이 모자란다' : `빈 통이 약 ${rw.months}개월 뒤 바닥난다`} — 몰트·그레인에 달마다 약 ${Math.ceil(rw.casksPerMonth)}통이 드는데 빈 통 ${rw.empty}개 + 주문 ${rw.onOrder}개${rw.tankCasks >= 1 ? `(탱크 적체 몫 약 ${Math.ceil(rw.tankCasks)}통 먼저)` : ''}. 쿠퍼리지 주문은 ${rw.leadMonths}개월 뒤 도착하니 지금 주문한다`, action: '통 사기', target: { anchor: 'mvp-space' } });
    }
  }
  // 탱크 몰트·그레인 통입 대기 — 통에 넣어야 숙성이 시작된다
  const tankLots = s.inventory.lots.filter((l) => (l.kind === 'malt' || l.kind === 'grain') && !l.sourced);
  const tankMalt = tankLots.reduce((t, l) => t + l.volumeL, 0);
  // 대기 개월 = 남은 원액이 만들어진 달(PROD `tankLotWaitMonths` — FIFO 어림, #704). 첫 배치 달(createdMonth)은 탱크 합치기(#166)가 계속 들고 있어
  // 매달 통입해도 끝자리가 남으면 판 처음부터 늘어났다(7차 판 중간: 그레인 527L "20개월째" → 실제 약 6개월). 6차 판(PROD prod.md ②): 5,071L가 info로 묻혀 숙성 중 통 102 → 43.
  // PROD 문턱: 3개월 이상 warn · 12개월 이상 danger(빈 통 유무와 무관) · 그 아래 info
  const waits = tankLots.map((l) => ({ l, m: tankLotWaitMonths(s, l) }));
  const waitM = waits.length ? Math.max(...waits.map((x) => x.m)) : 0;
  const fillLevel: Todo['level'] = waitM >= 12 ? 'danger' : waitM >= 3 ? 'warn' : 'info';
  // [제안 P-ARCH-64]: 합계와 가장 긴 개월을 한 문장에 섞지 않고 로트별로 — 오래 기다린 순
  const lotText = waits.filter((x) => x.m >= 3).sort((a, b) => b.m - a.m).map((x) => `${x.l.name.split(' · ')[0]} ${Math.round(x.l.volumeL).toLocaleString()}L ${x.m}개월째`).join(' · ');
  const waitText = fillLevel === 'info' ? '' : ` — 통에 들어가지 않은 원액: ${lotText}. 통에 넣어야 숙성이 시작된다 — 3년 위스키·12년 후보가 그만큼 늦어진다`;
  // 자동 통입(#239)이 켜져 있으면 넣을 통이 있는 동안은 안내하지 않는다 — 빈 통이 모자랄 때만 "통을 사라"로 줄인다
  const af = s.inventory.autoFill;
  const afLeft = af && tankMalt >= 50 ? autoFillPreview(s, af).leftL : 0;
  if (tankMalt >= 50 && (!af || afLeft >= 50)) {
    // 몰트·그레인을 넣을 **나무** 통만 센다(P-ARCH-64 — 7차 판: 빈 통 26개 중 6개가 소주용 옹기). 아는 오염만 뺀다(F5b I1 — 숨은 값 직접 읽기 없음)
    const empties = s.inventory.casks.filter((c) => !c.contents && !c.contaminationKnown && vesselMaterial(c) === 'wood').length;
    const free = Math.max(0, warehouseCapacity(s) - s.inventory.casks.length);
    out.push(af
      ? { id: 'fill', level: fillLevel, text: `자동 통입이 켜져 있지만 빈 나무 통이 모자라 탱크 몰트·그레인 ${Math.round(afLeft).toLocaleString()}L가 남는다 — 빈 나무 통 ${empties}개 · 남은 자리 ${free}통. 통을 사거나 숙성고를 늘리세요${waitText}`, action: '통 사기', target: { anchor: 'mvp-space' } }
      : { id: 'fill', level: fillLevel, text: `탱크 몰트·그레인 ${Math.round(tankMalt).toLocaleString()}L 통입 대기 — 빈 나무 통 ${empties}개 · 남은 자리 ${free}통 (통에 넣어야 숙성이 시작된다 · 자동 통입을 켜 둘 수 있다)${waitText}`, action: empties > 0 ? '통입' : '통 사기', target: { anchor: empties > 0 ? 'mvp-fill' : 'mvp-space' } });
  }
  // [제안 P-ARCH-65] 확장 — 7차 판 오너 답 "자동 통입이 어딨는지 못찾았다"(155개월 · 손 통입 405번): 통입 대기 줄에서 **바로 켠다**. 끄기는 통입 카드에서(되돌릴 수 있는 설정)
  // PROD #729: 이동 버튼도 자동 통입 줄(AUTOFILL_ANCHOR)로 — 오너 "어딨는지 못찾았다". 손 통입은 그 줄 바로 아래 통입 카드라 같은 자리다
  // [결정 #372] (나) 켜는 순간의 약속 · (다) 켜면 무엇을 넣는지 — 9차 판 오너 "200L가 안 되는데 마음대로 통입해 통을 낭비한 사례(앞선 판)가 있어 불신 · 타이밍을 내가 조정하고 싶었다".
  // 설정 줄(PROD AutoFill)의 「n개월 뒤 진행 때 넣는다: 빈 통 k통」은 켜야만 보였다 → 켜기 전 할 일 줄에 같은 미리 보기(`autoFillPreview`, 기본 설정 = 버튼이 켜는 설정)
  if (!af) {
    const fill = out.find((t) => t.id === 'fill');
    if (fill) {
      const pv = autoFillPreview(s, {});
      fill.target = { anchor: AUTOFILL_ROW_ANCHOR };
      if (pv.casks > 0 || pv.heldL >= 1) fill.text += ` · 자동 통입을 켜면 이번 진행 때 꽉 차는 통 ${pv.casks}통에 넣는다${pv.heldL >= 1 ? `(통을 다 채우지 못하는 ${Math.round(pv.heldL).toLocaleString()}L는 탱크에 두고 다음에 합친다)` : ''}`;
      fill.quick = { label: '자동 통입 켜기', action: { type: 'setAutoFill', settings: {} }, done: '자동 통입을 켰다 — 꽉 차는 통만 넣는다(통 하나를 채울 만큼 모이기 전에는 넣지 않는다) · 간격(매달 · 3 · 6개월)은 통입 카드의 자동 통입 줄에서 정하고, 거기서 끌 수 있다' };
    }
  }
  // 위스키 재고가 떨어져 가는데 숙성을 채운 통이 있다
  // A7(PROD 화면 메모): 병입 권고는 플래그십 예비 통(#260)을 세지 않는다 — 예비 통을 권하면 "예비를 지켜라" 경고와 부딪친다. 남은 통이 예비뿐이면 그 사실과 대가를 한 줄로
  const { ready, readyReserved } = bottleableNow(s);
  const wh = stockMonths(s, (c) => WHISKY_CATS.has(c));
  if (wh.months < RESTOCK_MONTHS) {
    if (ready > 0) out.push({ id: 'whisky', level: 'info', text: `위스키 재고 ${wh.stock ? `${wh.months.toFixed(1)}개월 치` : '없음'} — 숙성 ${min}개월을 채운 통 ${ready}개를 병입할 수 있다${readyReserved ? ` (플래그십 예비 ${readyReserved}통은 빼고 셌다)` : ''}`, action: '블렌딩·병입', target: { tab: 'bottling' } });
    else if (readyReserved > 0) out.push({ id: 'whisky', level: 'info', text: `위스키 재고 ${wh.stock ? `${wh.months.toFixed(1)}개월 치` : '없음'} — 숙성 ${min}개월을 채운 통은 플래그십 예비 ${readyReserved}통뿐이다. 예비 통을 병입하면 12년 목표가 늦어진다 — 다음 통이 ${min}개월을 채울 때까지 기다리거나, 꼭 필요하면 예비를 풀고 쓴다`, action: '블렌딩·병입', target: { tab: 'bottling' } });
  }
  // 방재 설비가 있었으면 막았을 재해를 최근 2년에 겪었다 ([제안 P-MGT-61] — 7차 판: 폭설 3회·한파 1회로 생산 4개월 정지, 제설·난방을 짓지 않았다). 설비 값을 낼 현금이 있을 때만
  if (s.scenario) {
    const miss = undefendedDisasters(s, 24).filter((d) => s.finance.cash >= d.cost);
    if (miss.length) out.push({ id: 'defense', level: 'info', text: `최근 2년 ${miss.map((d) => `${d.title} ${d.count}회`).join(' · ')}를 방재 설비 없이 겪었다 — ${miss.map((d) => `「${d.facility}」 ${fmtWon(d.cost)}`).join(' · ')}이면 막는다`, action: '설비에서 짓기', target: { anchor: 'mvp-equipment' } });
  }
  // 소주 재고가 떨어져 가는데 탱크에 소주가 있다
  const tankSoju = bottleableNow(s).tankSojuL;
  const so = stockMonths(s, (c) => c === SOJU);
  if (tankSoju >= 50 && so.months < RESTOCK_MONTHS) out.push({ id: 'soju', level: 'info', text: `소주 재고 ${so.stock ? `${so.months.toFixed(1)}개월 치` : '없음'} — 탱크 소주 ${Math.round(tankSoju).toLocaleString()}L 병입 가능 (팔 만큼만)`, action: '블렌딩·병입', target: { tab: 'bottling' } });
  // 소주 과잉 (PROD #728 sojuSupply · P-PROD-62 — 7차 판: 탱크 소주까지 세면 62개월 25.6 · 155개월 43.9개월 치인데 할 일은 1.7 · 2.6개월 치로 보였다).
  // 'soju'(제품 재고가 떨어져 간다 → 병입)와 하라는 일이 반대라 줄을 나눈다(PROD 권장) — 이쪽은 생산을 줄이라는 신호
  {
    const ss = sojuSupply(s);
    if (ss.months != null && ss.months >= SOJU_STOCK_WARN_MONTHS && ss.tankBottles > 0) out.push({ id: 'soju-glut', level: 'warn', text: `병입하지 않은 소주까지 ${Math.round(ss.months)}개월 치 — 탱크 ${Math.round(ss.tankL).toLocaleString()}L + 제품 ${ss.productBottles.toLocaleString()}병 · 지금 지시는 매달 약 ${Math.round(ss.madeBottlesPerMonth).toLocaleString()}병을 더 만든다(원료·에너지 월 ${fmtWon(ss.costPerMonth)})${ss.costPerBatch ? ` — 소주 지시를 1 줄이면 월 ${fmtWon(ss.costPerBatch)} 아낀다` : ''}`, action: '생산 지시', target: { anchor: 'mvp-orders' } });
  }
  // 샘플 시기 — 기록이 없거나 오래된 통 (시나리오 게임만: 샌드박스는 참값을 본다)
  if (s.scenario) {
    const stale = staleSampleCasks(s).length;
    if (stale > 0) out.push({ id: 'sample', level: 'info', text: `샘플 기록이 ${SAMPLE_STALE_MONTHS}개월 넘은(또는 없는) 통 ${stale}개 — 병입 전에 맛을 확인한다`, action: '숙성 중인 캐스크', target: { anchor: 'mvp-warehouse' } });
  }
  // 위에서부터 급한 순서 (항목이 늘었다 — 3차 대응). 같은 순위는 넣은 순서 그대로(안정 정렬)
  return out.sort((a, b) => todoKey(a) - todoKey(b));
}

// ───────────── ④ 지난달 현금 흐름 한 줄 ─────────────

export interface FlowPart { label: string; amount: number }

const EXPENSE_GROUP: Record<string, string> = {
  production: '생산', distribution: '유통비', export_freight: '유통비', export_fixed: '유통비', penalty: '기타',
  salaries: '고정비', overhead: '고정비', heating: '고정비', maintenance: '고정비', marketing: '고정비', storage: '고정비', insurance: '고정비', research: '고정비',
  interest: '대출 상환', principal: '대출 상환',
  hedge: '선도계약 정산', [AUTO_SAMPLE_EXPENSE]: '샘플·분석',
  // 자동 납품(#206)은 틱 안에서 병입한다 — 턴 사이 병입(offTurn.bottling)과 같은 "병입"으로 묶는다 (사후 검토: "기타"로 빠졌다)
  [AUTO_RESTOCK_EXPENSE]: '병입',
};
const OFFTURN_GROUP: Partial<Record<CashFlowKey, string>> = {
  spotBulk: '원액 판매', caskBid: '원액 판매', caskOwnership: '원액 판매', bottling: '병입', blending: '샘플·분석',
  casks: '통·설비', usedCask: '통·설비', equipment: '통·설비', loan: '대출·투자 유입', investment: '대출·투자 유입', loanRepay: '대출 상환', contractPrepay: '대출·투자 유입',
};

/**
 * 지난달 결산의 현금 흐름을 큰 덩어리로 — 들어온 돈과 나간 돈, 합 = 순현금(netCash). 대시보드 결산표(cashFlowRows)와 같은 원천을 묶기만 한다
 */
export function lastMonthFlow(r: MonthReport): { inflow: FlowPart[]; outflow: FlowPart[]; net: number } {
  const g = new Map<string, number>();
  const add = (label: string, v: number) => { if (v) g.set(label, (g.get(label) ?? 0) + v); };
  add('제품 매출', r.revenue);
  add('원액 판매', r.bulkRevenue);
  add('수출', r.exportRevenue ?? 0);
  add('비지터 센터', r.tourismRevenue ?? 0);
  if (r.prepayRefunded) add('대출·투자 유입', -r.prepayRefunded);
  add('보험금', r.otherIncome?.insurance ?? 0);
  add('선도계약 정산', r.otherIncome?.hedge ?? 0);
  for (const [k, v] of Object.entries(r.offTurn ?? {}) as [CashFlowKey, number][]) add(OFFTURN_GROUP[k] ?? (CASH_FLOW_LINES[k]?.label ?? '기타'), v);
  for (const [k, v] of Object.entries(r.expenses)) add(EXPENSE_GROUP[k] ?? '기타', -v);
  const rest = r.netCash - [...g.values()].reduce((t, v) => t + v, 0);
  if (Math.abs(rest) >= 1) add('기타', rest);
  const parts = [...g].map(([label, amount]) => ({ label, amount: Math.round(amount) })).filter((p) => p.amount !== 0);
  return {
    inflow: parts.filter((p) => p.amount > 0).sort((a, b) => b.amount - a.amount),
    outflow: parts.filter((p) => p.amount < 0).sort((a, b) => a.amount - b.amount),
    net: r.netCash,
  };
}

/** 억·만 원 축약 (한 줄 표시용) */
export function fmtWon(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 100_000_000) return `${sign}${(a / 100_000_000).toFixed(a >= 1_000_000_000 ? 1 : 2)}억`;
  if (a >= 10_000) return `${sign}${Math.round(a / 10_000).toLocaleString()}만`;
  return `${sign}${Math.round(a).toLocaleString()}원`;
}
