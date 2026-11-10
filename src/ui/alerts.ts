// 위기 경고·이번 달 할 일·지난달 현금 흐름·대출 상환 예정 — 화면용 계산 (코어 UI, 1차 MVP 플레이테스트 2026-11-08 대응 ①~④)
// 게임 규칙·상태를 바꾸지 않는다. 시뮬레이션과 같은 식(step.ts 파산 판정, loans.ts runFinance 대출 납부)을 읽기만 한다.
// 1차 MVP 판: 117개월째 파산, 대출 누적 20억 실행(파산 때 잔액 약 7.2억) — 현금 부족을 몰랐고, 돈이 어디로 나가는지, 언제 상환이 몰리는지 보이지 않았다 (mvp.md §7.4)

import { isFlagshipCandidate } from '../sim/delegateCheck';
import { regionOf } from '../sim/content/regions';
import { SCENARIOS } from '../sim/content/scenarios';
import { calendar, domesticDemands, BANKRUPT_AFTER_MONTHS, CASH_FLOW_LINES, isBulkKind, selfFundedCash, spotQuote, warehouseCapacity, whiskyMinMonths, type CashFlowKey, type GameState, type MonthReport } from '../sim';
import { AUTO_SAMPLE_EXPENSE, AUTO_SAMPLE_MIN_AGE } from '../sim/blendTable';
import { EQUIPMENT } from '../sim/content/catalog';
import { isLocked } from '../sim/scenario';
import { handfillCask, hasHandfillZone } from '../sim/handfill';
import { exportShortfalls } from '../sim/market';
import { ibAgedCaskCount } from '../sim/bulk';
import { autoFillPreview } from '../sim/autoFill';
import { autoRestockSources, autoRestockSupported, guardedFlagshipCasks, productMonthlyPace } from '../sim/economics';
import { AUTO_RESTOCK_EXPENSE, productionValue, whiskySupplyForecast } from '../sim/economics';

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
export interface Todo { id: string; level: 'danger' | 'warn' | 'info'; text: string; action: string; target: TodoTarget }

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

/** 고른 통 가운데 플래그십 후보가 몇 개이고, 쓰고 나면 몇 개 남는지 — 확인 미리보기(③ 남는 자원 경고)용 */
export function flagshipImpact(s: GameState, caskIds: string[]): { using: number; left: number; before: number; final: boolean } {
  const all = flagshipCandidates(s);
  const ids = new Set(caskIds);
  const using = all.filter((c) => ids.has(c.id)).length;
  // final: 목표까지 남은 달이 플래그십 숙성보다 짧아 새로 넣는 통은 후보가 될 수 없다 — 이때 후보 0은 15년 목표를 이룰 수 없다는 뜻
  const sc = s.scenario;
  const final = !!sc && sc.goal.months - s.month < sc.goal.flagshipMinMonths;
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
// IB 입찰(#224)은 답할 기한이 있는 제안이라 결품 바로 다음으로 올렸다 — 후반 확인 판 오너: 제안이 왔는데 못 봐서 사라졌다(P-MKT-19)
export const TODO_ORDER = ['loan-jump', 'malt-stopped', 'visitor', 'stockout', 'cask-bid', 'export-starve', 'restock-short', 'handfill', 'fill', 'whisky', 'soju', 'sample'];
// 새로 열린 기능(#215, id `stage-<단계>`)은 "열린 뒤 3개월 할 일 맨 위" — 단계마다 id가 달라 목록에 없어 샘플 위로 밀려 있었다(5차 전 점검)
const todoRank = (id: string) => { if (id.startsWith('stage-')) return -1; const i = TODO_ORDER.indexOf(id); return i < 0 ? TODO_ORDER.indexOf('sample') - 0.5 : i; };

/**
 * 이번 달 할 일 — 급한 순서. 시나리오 게임(MVP) 증류소 탭에 보인다. 규칙이 아니라 놓치기 쉬운 신호를 모은 안내다
 * (현금 위기는 화면 맨 위 경고가 따로 맡는다 — 여기서는 대출 거치 종료만)
 */
export function monthTodos(s: GameState): Todo[] {
  const out: Todo[] = [];
  // 새로 열린 기능 (#215) — 연 뒤 3개월 동안 할 일 맨 위에 둔다
  const def = s.scenario ? SCENARIOS[s.scenario.id] : undefined;
  for (const st of def?.stages ?? []) {
    if (!s.scenario?.stagesDone?.includes(st.id) || s.month - st.month >= 3) continue;
    const tab = st.unlock.includes('system:commissions') ? 'blendlab' : st.unlock.includes('system:exports') ? 'exports' : st.unlock.includes('system:caskBids') ? 'b2b' : st.unlock.includes('system:hr') ? 'staff' : 'sales';
    // P-MKT-18: IB 입찰 해금 안내에 나이 조건(3년↑)을 채운 통 수 — 0이면 제안이 오지 않는다(후반 확인 판)
    const ibNote = st.unlock.includes('system:caskBids') ? (() => { const n = ibAgedCaskCount(s); return n ? ` 지금 3년 이상 통 ${n}개.` : ' 지금 3년 이상 통이 없어 제안이 오지 않는다 — 통 일부를 남겨 두라.'; })() : '';
    out.push({ id: `stage-${st.id}`, level: 'warn', text: `새로 열림 — ${st.title}. ${st.text}${ibNote}`, action: tab === 'blendlab' ? '블렌딩 테이블' : tab === 'exports' ? '수출' : tab === 'b2b' ? '원액 B2B' : tab === 'staff' ? '직원' : '판매', target: { tab } });
  }
  const min = whiskyMinMonths(regionOf(s).whisky); // 병입·표기와 같은 식 (blending.ts)
  // IB 캐스크 입찰 (10년 차 해금, #224) — 제안은 2개월 뒤 사라지고 원액 B2B 탭에만 보여서 할 일에 올린다
  if (s.scenario && s.b2b.caskBids.length) {
    const b = [...s.b2b.caskBids].sort((x, y) => x.expiresMonth - y.expiresMonth)[0]!;
    const c = s.inventory.casks.find((x) => x.id === b.caskId)?.contents;
    const more = s.b2b.caskBids.length > 1 ? ` 외 ${s.b2b.caskBids.length - 1}건` : '';
    out.push({ id: 'cask-bid', level: 'warn', text: `IB 입찰 제안 — ${b.buyerName}에서 통 ${b.caskId}${c ? `(숙성 ${Math.floor(c.oakMonths / 12)}년 ${c.oakMonths % 12}개월)` : ''}를 ${fmtWon(b.price)}에 사겠다고 한다${more} — ${b.expiresMonth - s.month <= 0 ? '이번 달까지' : '다음 달까지'} 답(안 하면 사라진다). 병입해 팔 때보다 싸다 — 다 못 팔 통이면 팔고, 12년 플래그십 후보면 남긴다`, action: '원액 B2B', target: { tab: 'b2b' } });
  }
  // 수출이 국내 재고를 먼저 가져갔다 (P-MKT-16, 후반 확인 판 오너: 「더 퍼스트」 국내 품절을 몰랐다)
  if (s.scenario) {
    const short = exportShortfalls(s.history.reports.at(-1));
    if (short.length) {
      const unmet = short.reduce((t, x) => t + x.unmet, 0);
      out.push({ id: 'export-starve', level: 'warn', text: `수출이 국내 재고를 먼저 가져갔다 — 지난달 국내 ${unmet.toLocaleString()}병 품절(「${short[0]!.name}」${short.length > 1 ? ` 외 ${short.length - 1}개` : ''}). 국내 판매만 인지도를 키운다 — 재고를 늘리거나 수출가 배수를 약 0.9 아래로 낮추면 국내가 먼저 채워진다`, action: '판매', target: { tab: 'sales' } });
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
  // 핸드필 존 (#233) — 지었는데 지정한 통이 없다(처음, 또는 통이 비어 풀림). 숙성 중인 캐스크 칸이 접혀 있어 놓치기 쉽다
  if (s.scenario && hasHandfillZone(s) && !handfillCask(s) && s.production.equipment.some((e) => EQUIPMENT[e.catalogId]?.kind === 'visitor' && e.readyMonth <= s.month)) {
    out.push({ id: 'handfill', level: 'warn', text: '핸드필 존에 통이 없다 — 숙성 중인 캐스크 칸에서 핸드필 전용 통을 고르면 방문객이 매달 500ml씩 담아 간다(병입 권장가의 약 2배)', action: '통 고르기', target: { anchor: 'mvp-warehouse' } });
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
    out.push({ id: 'stockout', level: sOut.soon.length ? 'warn' : 'info', text: `${parts.join(' · ')} — 병입하거나 [기존 제품 재고 보충]으로 채운다`, action: '블렌딩·병입', target: { tab: 'bottling' } });
  }
  // 대출 거치가 3개월 안에 끝나 납부가 뛴다
  const jump = paymentJump(loanSchedule(s, 4));
  if (jump) out.push({ id: 'loan-jump', level: 'warn', text: `${jump.month - s.month === 0 ? '이번 달' : `${jump.month - s.month}개월 뒤`} 대출 거치가 끝나 월 납부가 ${fmtWon(jump.from)} → ${fmtWon(jump.to)}로 뛴다`, action: '대출 보기', target: { tab: 'finance' } });
  // 탱크 몰트·그레인 통입 대기 — 통에 넣어야 숙성이 시작된다
  const tankMalt = s.inventory.lots.filter((l) => (l.kind === 'malt' || l.kind === 'grain') && !l.sourced).reduce((t, l) => t + l.volumeL, 0);
  // 자동 통입(#239)이 켜져 있으면 넣을 통이 있는 동안은 안내하지 않는다 — 빈 통이 모자랄 때만 "통을 사라"로 줄인다
  const af = s.inventory.autoFill;
  const afLeft = af && tankMalt >= 50 ? autoFillPreview(s, af).leftL : 0;
  if (tankMalt >= 50 && (!af || afLeft >= 50)) {
    const empties = s.inventory.casks.filter((c) => !c.contents && !(c.contamination && c.contaminationKnown)).length;
    const free = Math.max(0, warehouseCapacity(s) - s.inventory.casks.length);
    out.push(af
      ? { id: 'fill', level: 'info', text: `자동 통입이 켜져 있지만 빈 나무 통이 모자라 탱크 몰트·그레인 ${Math.round(afLeft).toLocaleString()}L가 남는다 — 빈 통 ${empties}개 · 남은 자리 ${free}통. 통을 사거나 숙성고를 늘리세요`, action: '통 사기', target: { anchor: 'mvp-space' } }
      : { id: 'fill', level: 'info', text: `탱크 몰트·그레인 ${Math.round(tankMalt).toLocaleString()}L 통입 대기 — 빈 통 ${empties}개 · 남은 자리 ${free}통 (통에 넣어야 숙성이 시작된다 · 자동 통입을 켜 둘 수 있다)`, action: '통입', target: { anchor: 'mvp-fill' } });
  }
  // 위스키 재고가 떨어져 가는데 숙성을 채운 통이 있다
  const ready = s.inventory.casks.filter((c) => c.contents && !c.owner && (c.contents.kind === 'malt' || c.contents.kind === 'grain') && c.contents.oakMonths >= min).length;
  const wh = stockMonths(s, (c) => WHISKY_CATS.has(c));
  if (ready > 0 && wh.months < RESTOCK_MONTHS) out.push({ id: 'whisky', level: 'info', text: `위스키 재고 ${wh.stock ? `${wh.months.toFixed(1)}개월 치` : '없음'} — 숙성 ${min}개월을 채운 통 ${ready}개를 병입할 수 있다`, action: '블렌딩·병입', target: { tab: 'bottling' } });
  // 소주 재고가 떨어져 가는데 탱크에 소주가 있다
  const tankSoju = s.inventory.lots.filter((l) => l.kind === 'soju').reduce((t, l) => t + l.volumeL, 0);
  const so = stockMonths(s, (c) => c === SOJU);
  if (tankSoju >= 50 && so.months < RESTOCK_MONTHS) out.push({ id: 'soju', level: 'info', text: `소주 재고 ${so.stock ? `${so.months.toFixed(1)}개월 치` : '없음'} — 탱크 소주 ${Math.round(tankSoju).toLocaleString()}L 병입 가능 (팔 만큼만)`, action: '블렌딩·병입', target: { tab: 'bottling' } });
  // 샘플 시기 — 기록이 없거나 오래된 통 (시나리오 게임만: 샌드박스는 참값을 본다)
  if (s.scenario) {
    const stale = staleSampleCasks(s).length;
    if (stale > 0) out.push({ id: 'sample', level: 'info', text: `샘플 기록이 ${SAMPLE_STALE_MONTHS}개월 넘은(또는 없는) 통 ${stale}개 — 병입 전에 맛을 확인한다`, action: '숙성 중인 캐스크', target: { anchor: 'mvp-warehouse' } });
  }
  // 위에서부터 급한 순서 (항목이 늘었다 — 3차 대응). 같은 순위는 넣은 순서 그대로(안정 정렬)
  return out.sort((a, b) => todoRank(a.id) - todoRank(b.id));
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
