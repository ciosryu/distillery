import { BULK, EQUIPMENT } from './content/catalog';
import { refreshBroker } from './broker';
import { sumCashFlows } from './cashflow';
import { fulfillContracts, refreshCaskBids, refreshContractOffers, updateBulkIndex } from './bulk';
import { clamp } from './flavor';
import { gainXp, refreshCandidates } from './hr';
import { deliverOwnedCasks } from './investment';
import { runOffice, runStaffLifecycle } from './hr';
import { runTourism } from './tourism';
import { runHandfill } from './handfill';
import { applyAutoFill } from './autoFill';
import { emptyCaskOf } from './newGame';
import { buildTickContext, type TickContext } from './tick';
import { updateWeather, weatherOffset } from './weather';
import { archiveSoldOutProducts, rollupYear } from './lifecycle';
import { pruneTrendsAndCommissions, refreshCommissions } from './blendTable';
import { systemOn, applyScenarioStages } from './scenario';
import { endGame, netWorth, updateProgress } from './progress';
import { runResearch } from './research';
import { runMaturation } from './warehouse';
import { monthlyInvariantHook } from './invariants';
import { runProduction } from './production';
import { runFinance } from './loans';
import { settleSales } from './sales';
import { runSales, updateTrends } from './market';
import { refreshExportOffers } from './exportDeals';
import { collectReceivables, fulfillRetail, refreshDeals } from './deals';
import { resolveDutyFreeEditions } from './dutyFree';
import { resolveWaterPermit } from './waterPermit';
import { pruneModifiers } from './modifiers';
import { runEvents } from './events';
import { rngFor } from './rng';
import type { CashFlows, GameState, MonthReport, StaffRole } from './types';
import { calendar, clone } from './util';
import { applyAutoRestock } from './economics';
import { runPricePolicies } from './priceEngine';
import { candidateVolumes, flagshipCandidateCount, noteCandidateUse } from './tags';

export const BANKRUPT_AFTER_MONTHS = 3;
const REPORTS_KEPT = 120;

// ───────────── 월 틱 파이프라인 (architecture §3.5, PRD §2.2) ─────────────
// 0 준비(기상 이상치 포함) → 1 이벤트 → [틱 컨텍스트] → 2 생산 → 3 숙성 → 4 계약 납품 → 5 판매·주세 → 6 운영 → 7 재무 → 8 성장 → 9 판정·리포트
// 각 단계는 같은 상태 사본(s)을 차례로 고친다. 난수는 단계마다 독립 스트림(rngFor(seed, month, 이름))이라 단계를 더해도 다른 단계 결과가 바뀌지 않는다.

/** 5 판매·주세 — 규칙 본문은 sales.ts(MKT). 판매 직전에 자동 가격을 켠 제품의 값을 정한다(#291 3정책 — priceEngine.ts, 정책 함수는 MKT pricePolicy.ts) */
const phaseSales: typeof settleSales = (s, report, ctx) => {
  // 자동 납품이 플래그십 후보 통을 쓰면 메모 (#261 — 기록만)
  const cand = candidateVolumes(s);
  const notesFrom = report.notes.length;
  applyAutoRestock(s, report, ctx.monthOfYear);
  noteCandidateUse(s, report, cand, notesFrom);
  runPricePolicies(s, report, ctx.monthOfYear); // 자동 가격 3정책 ([결정 #291] — 형제 동시 결정 S6)
  return settleSales(s, report, ctx);
};

const newReport = (s: GameState, offTurn: CashFlows): MonthReport => ({ month: s.month, revenue: 0, expenses: {}, netCash: 0, cashEnd: 0, sales: [], production: [], bulk: [], bulkRevenue: 0, prepayApplied: 0, prepayRefunded: 0, spotBulkRevenue: (offTurn.spotBulk ?? 0) + (offTurn.caskBid ?? 0), offTurn, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] });

/** 0 준비: 지난 보정치 정리, 주문 캐스크 도착, 입지 인허가 */
function phasePrepare(s: GameState, report: MonthReport): void {
  // 시나리오 단계 해금 (#215) — 이벤트·의뢰·수출 등이 그 달부터 돈다
  applyScenarioStages(s, report);
  pruneModifiers(s);
  s.inventory.rotatedThisMonth = 0;
  s.inventory.samplesThisMonth = 0;
  pruneTrendsAndCommissions(s, report);
  // 주문한 캐스크 도착 (쿠퍼리지·시즈닝 계약)
  for (const o of s.inventory.caskOrders.filter((x) => x.arriveMonth <= s.month)) {
    for (let i = 0; i < o.qty; i++) {
      const c = emptyCaskOf(s, o.typeId);
      if (o.source === 'seasoning') { c.seasoning = Math.min(1.3, c.seasoning * 1.2); c.activity = Math.min(1.2, c.activity * 1.1); }
      s.inventory.casks.push(c);
    }
    report.notes.push(`${o.source === 'seasoning' ? '시즈닝 계약' : '쿠퍼리지 주문'} 캐스크 ${o.qty}개 도착`);
  }
  s.inventory.caskOrders = s.inventory.caskOrders.filter((x) => x.arriveMonth > s.month);
  resolveWaterPermit(s, report);
  // 이번 달 기상 이상치 (AR(1), 결정 #120) — 이벤트 충격은 다음 단계에서 더해진다
  updateWeather(s);
}

/** 1 이벤트: 예보 → 발생 → 보정치 등록 (이번 달부터 적용), 설비 가동 시작 알림 */
function phaseEvents(s: GameState, report: MonthReport): void {
  if (systemOn(s, 'events')) runEvents(s, report, calendar(s).monthOfYear);
  for (const e of s.production.equipment) if (e.readyMonth === s.month && s.month > 0) report.notes.push(`${EQUIPMENT[e.catalogId]?.nameKo ?? e.catalogId} 가동 시작`);
}

/** 4 계약 납품: 원액 B2B 계약, 대형 유통 납품 */
function phaseContracts(s: GameState, report: MonthReport): void {
  fulfillContracts(s, report);
  fulfillRetail(s, report);
}

/** 6 운영: 면세 한정판·매출채권, 트렌드, 관광, 캐스크 오너십 인도, 사무직, 직원 생애주기(에이징 커브·은퇴), 품절 제품 아카이브 */
function phaseOperations(s: GameState, report: MonthReport, ctx: TickContext, mashKg: number): void {
  resolveDutyFreeEditions(s, report);
  collectReceivables(s, report);
  updateTrends(s, rngFor(s.seed, s.month, 'trend'));
  runTourism(s, report, ctx.monthOfYear);
  runHandfill(s, report); // 핸드필 존 (#233) — 이번 달 방문객이 지정 통에서 담아 간다
  deliverOwnedCasks(s, report);
  runOffice(s, report, rngFor(s.seed, s.month, 'office'), mashKg);
  runStaffLifecycle(s, report, rngFor(s.seed, s.month, 'lifecycle'));
  archiveSoldOutProducts(s);
}

/** 8 성장: XP, 후보·브로커·계약·입찰·거래 제안 갱신, 시세 랜덤 워크 */
function phaseGrowth(s: GameState, report: MonthReport, runsUsed: number, sales: ReturnType<typeof runSales>['results']): void {
  const activity: Record<StaffRole, number> = {
    distiller: runsUsed / 2,
    warehouse: s.inventory.casks.filter((c) => c.contents).length / 5,
    sales: sales.reduce((t, x) => t + x.bottles, 0) / 200,
    office: 10,
    // 블렌더: 이번 달 병입·샘플링 횟수만큼 배운다 (결정 #123)
    blender: s.commerce.products.filter((p) => p.createdMonth === s.month).length * 15 + s.inventory.samplesThisMonth * 2,
  };
  report.notes.push(...gainXp(s, rngFor(s.seed, s.month, 'hr'), activity));
  // 연구 진척 (S-6) — 진행 중인 연구가 없으면 아무 일도 없다
  if (systemOn(s, 'research')) runResearch(s, report);
  // 제안 갱신 — 시나리오가 끈 시스템은 제안을 만들지 않는다(S-8). 난수는 시스템마다 독립 스트림이라 끄더라도 다른 시스템 결과는 같다
  if (s.month % 3 === 2 && systemOn(s, 'hr')) refreshCandidates(s, rngFor(s.seed, s.month, 'candidates'));
  if (systemOn(s, 'broker')) refreshBroker(s, rngFor(s.seed, s.month, 'broker'));
  if (systemOn(s, 'contracts')) refreshContractOffers(s, rngFor(s.seed, s.month, 'contracts'));
  if (systemOn(s, 'caskBids')) refreshCaskBids(s, rngFor(s.seed, s.month, 'caskbids'), report); // 새 제안은 메모로 — 진행 뒤 소식 창(#253)
  updateBulkIndex(s, rngFor(s.seed, s.month, 'bulk'));
  if (systemOn(s, 'siteDeals')) refreshDeals(s, rngFor(s.seed, s.month, 'deals'));
  if (systemOn(s, 'commissions')) refreshCommissions(s, rngFor(s.seed, s.month, 'commissions'), report);
  if (systemOn(s, 'exports')) refreshExportOffers(s, rngFor(s.seed, s.month, 'export-offers'));
  // 그레인 현물 시장이 물량을 소화한다 (#81)
  if (s.b2b.spotSoldLPA) s.b2b.spotSoldLPA = { grain: s.b2b.spotSoldLPA.grain * BULK.spotDecay };
  // 원재료 가격 변동 (평균 회귀 랜덤 워크)
  const prng = rngFor(s.seed, s.month, 'prices');
  for (const k of Object.keys(s.world.priceIndex)) {
    const v = s.world.priceIndex[k]!;
    s.world.priceIndex[k] = clamp(v * Math.exp(prng.normal(0, 0.02)) + 0.05 * (1 - v), 0.6, 1.8);
  }
}

/** 9 판정·리포트: 지급 능력(연속 적자 → 파산), 리포트 기록, 월 넘김 */
function phaseSettle(s: GameState, report: MonthReport, cashStart: number, offTurn: CashFlows): void {
  if (s.finance.cash < 0) {
    s.finance.negativeCashMonths += 1;
    report.notes.push(`현금 부족 ${s.finance.negativeCashMonths}개월째 — ${BANKRUPT_AFTER_MONTHS}개월 지속 시 파산`);
    if (s.finance.negativeCashMonths >= BANKRUPT_AFTER_MONTHS) { endGame(s, 'bankrupt'); report.notes.push('파산했습니다'); }
  } else s.finance.negativeCashMonths = 0;
  // 마일스톤·목표 판정 (S-9) — 기록만, 돈·재고는 바꾸지 않는다
  updateProgress(s, report);
  const off = weatherOffset(s);
  report.weather = { tempAnom: Math.round(off.tempC * 10) / 10, humidAnom: Math.round(off.humidity * 10) / 10, shocks: s.world.weather.shocks.filter((x) => x.fromMonth <= s.month && s.month < x.untilMonth).map((x) => x.label) };
  // 순현금 = 이번 턴 안의 변화 + 턴 사이 행동 → 직전 결산 이후 현금 변화 전체 (§16.20)
  report.netCash = s.finance.cash - cashStart + sumCashFlows(offTurn);
  report.cashEnd = s.finance.cash;
  // 현금·평가액 곡선 (#138·#146) — 기록만 한다
  report.netWorth = netWorth(s);
  report.investingCash = sumCashFlows(offTurn, 'investing');
  // 선급금 상계분은 영업(납품 매출)으로 올리고 같은 금액을 재무(선급금 상환)로 뺀다
  report.financingCash = sumCashFlows(offTurn, 'financing') - (report.expenses.principal ?? 0) - (report.prepayApplied ?? 0) - (report.prepayRefunded ?? 0);
  report.operatingCash = report.netCash - report.investingCash - report.financingCash;
  s.history.reports = [...s.history.reports, report].slice(-REPORTS_KEPT);
  if (calendar(s).monthOfYear === 12) rollupYear(s, calendar(s).year);
  s.month += 1;
  // 다음 달 화면과 같은 시점의 플래그십 후보 수 (#261 — 줄어든 달을 소식 창에 알린다, 기록만)
  if (s.scenario) report.flagshipCandidates = flagshipCandidateCount(s);
}

/** 1개월 진행 (순수 함수 — 입력 상태를 바꾸지 않고 새 상태를 돌려준다) */
export function advanceMonth(prev: GameState): GameState {
  if (prev.status !== 'running') return prev;
  const s = clone(prev);
  const cashStart = s.finance.cash;
  // 직전 결산 이후 턴 사이 행동(현물 판매·대출·설비 구매 등)으로 움직인 현금 — 이번 보고서에 합치고 비운다 (§16.20)
  const offTurn: CashFlows = { ...(s.finance.pendingCash ?? {}) };
  s.finance.pendingCash = {};
  const report = newReport(s, offTurn);
  phasePrepare(s, report);                                   // 0
  phaseEvents(s, report);                                    // 1
  const ctx = buildTickContext(s);                           //   이번 달 조건 확정
  applyAutoFill(s, report);                                  // 2 앞: 자동 통입 (#239) — 진행 전에 통입한 것과 같은 때
  const { runsUsed, mashKg } = runProduction(s, report, ctx); // 2
  runMaturation(s, report, ctx);                             // 3 엔젤스 셰어·도수·향미
  phaseContracts(s, report);                                 // 4
  const sales = phaseSales(s, report, ctx);                  // 5
  phaseOperations(s, report, ctx, mashKg);                   // 6
  runFinance(s, report, ctx.monthOfYear);                    // 7
  phaseGrowth(s, report, runsUsed, sales);                   // 8
  phaseSettle(s, report, cashStart, offTurn);                // 9
  monthlyInvariantHook(s);                                   //   불변식(INV-ARCH-1) — 읽기만, 테스트·개발에서만 켠다
  return s;
}

export function advanceMonths(s: GameState, n: number): GameState {
  let cur = s;
  for (let i = 0; i < n && cur.status === 'running'; i++) cur = advanceMonth(cur);
  return cur;
}

