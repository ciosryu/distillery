import { CASK_STORAGE, CASKS, EQUIPMENT, INGREDIENTS, ROLE_INFO } from './content/catalog';
import { liquorTaxPerBottle, regionOf, traditionalTaxFactor } from './content/regions';
import { refreshBroker } from './broker';
import { bulkValuePerLPA, fulfillContracts, refreshCaskBids, refreshContractOffers, updateBulkIndex } from './bulk';
import { clamp, weightedAverage } from './flavor';
import { gainXp, refreshCandidates } from './hr';
import { matureCask, restLot } from './maturation';
import { assignSlot, deliverOwnedCasks, runContamination, runOffice, runStaffLifecycle, runTourism, slotClimate } from './ops';
import { emptyCaskOf } from './newGame';
import { fermentationClimate, fermentDaysAt } from './production';
import { runSales, updateAwareness, updateTrends } from './market';
import { simulateBatch, stillDefOf, volumeDiscounts } from './production';
import { effectivePriceIndex, mod, pruneModifiers } from './modifiers';
import { runEvents } from './events';
import { rngFor } from './rng';
import type { FermenterType, GameState, MonthReport, SpiritLot, StaffRole } from './types';
import { bestBy, calendar, clone, monthLabel, nid, staffOf } from './util';

export const BANKRUPT_AFTER_MONTHS = 3;
const REPORTS_KEPT = 120;

/** 디스틸러 1인이 한 달에 운전할 수 있는 증류 횟수 */
export const distillerRunCapacity = (process: number) => 20 + process / 5;

interface FermenterSlot { id: string; type: FermenterType; capacityL: number; daysLeft: number }

function runProduction(s: GameState, report: MonthReport, monthOfYear: number): { runsUsed: number; mashKg: number } {
  const fermC = fermentationClimate(s, monthOfYear);
  const prodRng = rngFor(s.seed, s.month, 'production');
  const distillers = staffOf(s, 'distiller');
  let distillerRuns = distillers.reduce((t, d) => t + distillerRunCapacity(d.stats.b), 0);
  const lead = bestBy(distillers, 'b');
  const stillRuns = new Map<string, number>();
  const fermenters: FermenterSlot[] = [];
  for (const e of s.equipment) {
    if (e.readyMonth > s.month) continue;
    const def = EQUIPMENT[e.catalogId];
    if (def?.kind === 'still') stillRuns.set(e.id, def.runsPerMonth);
    if (def?.kind === 'fermenter') fermenters.push({ id: e.id, type: def.fermenterType, capacityL: def.capacityL, daysLeft: 30 });
  }
  // 소주는 옹기 우선
  fermenters.sort((a, b) => (a.type === 'onggi' ? -1 : 0) - (b.type === 'onggi' ? -1 : 0));
  let runsUsed = 0;
  if (mod(s, 'production') === 0) { if (s.orders.length) report.notes.push('생산 중단 — 이번 달은 증류하지 못했습니다'); return { runsUsed, mashKg: 0 }; }
  // 원재료 가격 = 시세 지수 × 이벤트 보정 × 대량 구매 할인
  const prices = effectivePriceIndex(s, volumeDiscounts(s));
  const boughtKg: Record<string, number> = {};

  for (const order of s.orders) {
    if (order.batchesPerMonth <= 0) continue;
    const recipe = s.recipes.find((r) => r.id === order.recipeId);
    if (!recipe) continue;
    const still = stillDefOf(s, recipe.stillId);
    const stillInst = s.equipment.find((e) => e.id === recipe.stillId);
    if (!still || !stillInst || stillInst.readyMonth > s.month) { report.notes.push(`${recipe.name}: 증류기가 준비되지 않아 생산 중단`); continue; }
    const parts: { lot: Omit<SpiritLot, 'id' | 'name'>; lpa: number; cost: number }[] = [];
    let blocked = '';
    for (let b = 0; b < order.batchesPerMonth; b++) {
      if ((stillRuns.get(stillInst.id) ?? 0) < recipe.runs) { blocked = '증류기 가동 한도'; break; }
      if (distillerRuns < recipe.runs) { blocked = distillers.length ? '디스틸러 운전 한도' : '디스틸러 없음'; break; }
      let ferm: FermenterSlot | undefined;
      if (recipe.kind !== 'gin') {
        // 발효실 온도에 따라 발효 기간이 늘거나 준다 (결정 #67)
        const need = fermentDaysAt(recipe.fermentDays, fermC) + 2;
        ferm = fermenters.find((f) => f.capacityL >= still.chargeL && f.daysLeft >= need && (recipe.kind === 'soju' || f.type !== 'onggi'))
          ?? fermenters.find((f) => f.capacityL >= still.chargeL && f.daysLeft >= need);
        if (!ferm) { blocked = '발효조 부족'; break; }
        ferm.daysLeft -= need;
      }
      stillRuns.set(stillInst.id, (stillRuns.get(stillInst.id) ?? 0) - recipe.runs);
      distillerRuns -= recipe.runs;
      runsUsed += recipe.runs;
      const res = simulateBatch(recipe, still, ferm?.type ?? null, lead, prices, stillInst.feintsLPA ?? 0, { tempC: fermC, rng: prodRng, regionId: s.regionId });
      stillInst.feintsLPA = res.feintsOutLPA;
      s.cash -= res.cost;
      for (const [id, kg] of Object.entries(res.ingredientsKg)) boughtKg[id] = (boughtKg[id] ?? 0) + kg;
      parts.push({
        lpa: res.lpa, cost: res.cost,
        lot: { kind: recipe.kind, volumeL: res.volumeL, abv: res.abv, flavor: res.flavor, createdMonth: s.month, oakMonths: 0, sourced: false, costPerLPA: res.cost / res.lpa, recipeId: recipe.id, ...(recipe.mashBill.length ? { mashShare: Object.fromEntries(recipe.mashBill.map((m) => [m.ingredientId, m.ratio])) } : {}) },
      });
      for (const w of res.warnings) if (!report.notes.includes(w)) report.notes.push(w);
    }
    if (blocked) report.notes.push(`${recipe.name}: ${blocked}로 ${order.batchesPerMonth - parts.length}배치 생산 못 함`);
    if (!parts.length) continue;
    const lpa = parts.reduce((t, p) => t + p.lpa, 0);
    const volumeL = parts.reduce((t, p) => t + p.lot.volumeL, 0);
    const cost = parts.reduce((t, p) => t + p.cost, 0);
    s.lots.push({
      ...parts[0]!.lot,
      id: nid(s, 'L'),
      name: `${recipe.name} · ${monthLabel(s.startYear, s.month)}`,
      volumeL,
      abv: lpa / volumeL,
      flavor: weightedAverage(parts.map((p) => ({ flavor: p.lot.flavor, weight: p.lpa }))),
      costPerLPA: cost / lpa,
    });
    if (recipe.kind === 'soju') s.flags.producedSoju = true;
    report.production.push({ recipeId: recipe.id, name: recipe.name, batches: parts.length, lpa, cost });
    report.expenses.production = (report.expenses.production ?? 0) + cost;
  }
  s.ingredientKgLastMonth = boughtKg;
  const mashKg = Object.entries(boughtKg).filter(([k]) => k !== 'gns' && INGREDIENTS[k]).reduce((t, [, v]) => t + v, 0);
  return { runsUsed, mashKg };
}

function runMaturation(s: GameState, report: MonthReport, monthOfYear: number): void {
  const wm = staffOf(s, 'warehouse');
  const control = Math.max(0, ...wm.map((x) => x.stats.b));
  const observe = Math.max(0, ...wm.map((x) => x.stats.a));
  const diligence = Math.max(0, ...wm.map((x) => x.stats.c));
  const rng = rngFor(s.seed, s.month, 'maturation');
  const evap = mod(s, 'evaporation');
  let lost = 0;
  s.casks = s.casks.map((cask) => {
    if (!cask.contents) return cask;
    // 숙성고 내부 기후: 숙성고 종류·단에 따라 다르다 (결정 #65)
    if (!cask.slot) assignSlot(s, cask);
    const res = matureCask(cask, slotClimate(s, cask, monthOfYear), { control, evaporationFactor: evap });
    // 스팟 매입 통의 활성도는 6개월 숙성하면 드러난다
    if (cask.activityKnown === false && cask.contents.oakMonths + 1 >= 6) res.cask.activityKnown = true;
    lost += res.lostL;
    let next = res.cask;
    // 누수: 성실 스탯이 확률을, 관찰 스탯이 손실량을 줄임
    if (rng.chance(0.002 * (1 - diligence / 150) * (CASKS[cask.typeId].leakFactor ?? 1))) {
      const lossShare = rng.range(0.03, 0.08) * (1 - observe / 150);
      const c = next.contents!;
      lost += c.volumeL * lossShare;
      next = { ...next, contents: { ...c, volumeL: c.volumeL * (1 - lossShare), costPerLPA: c.costPerLPA / (1 - lossShare) } };
      report.notes.push(`캐스크 ${cask.id} 누수 — ${(lossShare * 100).toFixed(1)}% 손실`);
    }
    return next;
  });
  s.lots = s.lots.map(restLot);
  runContamination(s, report, rngFor(s.seed, s.month, 'contamination'), monthOfYear);
  report.angelsShareL = lost;
}

function runFinance(s: GameState, report: MonthReport): void {
  const pay = (key: string, amount: number) => {
    if (amount <= 0) return;
    s.cash -= amount;
    report.expenses[key] = (report.expenses[key] ?? 0) + amount;
  };
  pay('salaries', s.staff.reduce((t, x) => t + x.salary, 0));
  pay('overhead', regionOf(s).overheadPerMonth);
  pay('maintenance', s.equipment.reduce((t, e) => t + (e.readyMonth <= s.month ? (EQUIPMENT[e.catalogId]?.maintenance ?? 0) : 0), 0));
  pay('marketing', s.marketingBudget);
  pay('storage', caskStorageCost(s));
  for (const loan of s.loans) {
    const interest = Math.round(loan.balance * (loan.annualRate / 12));
    const inGrace = s.month < loan.startMonth + loan.graceMonths;
    const principal = inGrace ? 0 : Math.min(loan.balance, loan.monthlyPayment - interest);
    loan.balance -= principal;
    pay('interest', interest);
    pay('principal', principal);
  }
  s.loans = s.loans.filter((l) => l.balance > 0);
}

/** 1개월 진행 (순수 함수) */
export function advanceMonth(prev: GameState): GameState {
  if (prev.status !== 'running') return prev;
  const s = clone(prev);
  const { monthOfYear } = calendar(s);
  const cashStart = s.cash;
  const report: MonthReport = { month: s.month, revenue: 0, expenses: {}, netCash: 0, cashEnd: 0, sales: [], production: [], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] };

  pruneModifiers(s);
  s.rotatedThisMonth = 0;
  // 주문한 캐스크 도착 (쿠퍼리지·시즈닝 계약)
  for (const o of s.caskOrders.filter((x) => x.arriveMonth <= s.month)) {
    for (let i = 0; i < o.qty; i++) {
      const c = emptyCaskOf(s, o.typeId);
      if (o.source === 'seasoning') { c.seasoning = Math.min(1.3, c.seasoning * 1.2); c.activity = Math.min(1.2, c.activity * 1.1); }
      s.casks.push(c);
    }
    report.notes.push(`${o.source === 'seasoning' ? '시즈닝 계약' : '쿠퍼리지 주문'} 캐스크 ${o.qty}개 도착`);
  }
  s.caskOrders = s.caskOrders.filter((x) => x.arriveMonth > s.month);
  runEvents(s, report, monthOfYear);
  for (const e of s.equipment) if (e.readyMonth === s.month && s.month > 0) report.notes.push(`${EQUIPMENT[e.catalogId]?.nameKo ?? e.catalogId} 가동 시작`);

  const { runsUsed, mashKg } = runProduction(s, report, monthOfYear);
  runMaturation(s, report, monthOfYear);
  fulfillContracts(s, report);

  const { results: sales, retail } = runSales(s, rngFor(s.seed, s.month, 'sales'), monthOfYear);
  report.sales = sales.map(({ overflowBottles: _o, distribution: _d, ...x }) => x);
  report.retailCapacityCases = retail.capacityCases;
  report.retailSoldCases = retail.soldCases;
  report.overflowCases = retail.overflowCases;
  report.lostSalesBottles = retail.lostBottles;
  if (retail.overflowCases > 0) report.notes.push(`소매 처리 역량 초과 — ${retail.overflowCases}케이스를 고비용 채널로 판매${retail.lostBottles > 0 ? `, ${retail.lostBottles.toLocaleString()}병은 못 팔았다` : ''} (영업 직원을 늘리면 역량↑)`);
  report.revenue = sales.reduce((t, x) => t + x.revenue, 0);
  // 주세 납부 — 전통주는 연 누적 출고량 구간별 경감 (한국 완화책 #73)
  const region = regionOf(s);
  if (monthOfYear === 1) s.traditionalReleasedL = 0;
  let tax = 0;
  for (const x of sales) {
    const p = s.products.find((q) => q.id === x.productId);
    if (!p) continue;
    tax += x.bottles * liquorTaxPerBottle(region, p.price, p.bottleMl, p.abv, traditionalTaxFactor(region, p.traditional, s.traditionalReleasedL));
    if (p.traditional) s.traditionalReleasedL += (x.bottles * p.bottleMl) / 1000;
  }
  report.liquorTaxRemitted = Math.round(tax);
  s.cash += report.revenue;
  const distribution = sales.reduce((t, x) => t + x.distribution, 0);
  if (distribution > 0) { s.cash -= distribution; report.expenses.distribution = distribution; }
  updateAwareness(s, sales);
  updateTrends(s, rngFor(s.seed, s.month, 'trend'));
  runTourism(s, report, monthOfYear);
  deliverOwnedCasks(s, report);
  runOffice(s, report, rngFor(s.seed, s.month, 'office'), mashKg);
  runStaffLifecycle(s, report, rngFor(s.seed, s.month, 'lifecycle'));

  runFinance(s, report);

  const activity: Record<StaffRole, number> = {
    distiller: runsUsed / 2,
    warehouse: s.casks.filter((c) => c.contents).length / 5,
    sales: sales.reduce((t, x) => t + x.bottles, 0) / 200,
    office: 10,
  };
  report.notes.push(...gainXp(s, rngFor(s.seed, s.month, 'hr'), activity));
  if (s.month % 3 === 2) refreshCandidates(s, rngFor(s.seed, s.month, 'candidates'));
  refreshBroker(s, rngFor(s.seed, s.month, 'broker'));
  refreshContractOffers(s, rngFor(s.seed, s.month, 'contracts'));
  refreshCaskBids(s, rngFor(s.seed, s.month, 'caskbids'));
  updateBulkIndex(s, rngFor(s.seed, s.month, 'bulk'));

  // 원재료 가격 변동 (평균 회귀 랜덤 워크)
  const prng = rngFor(s.seed, s.month, 'prices');
  for (const k of Object.keys(s.priceIndex)) {
    const v = s.priceIndex[k]!;
    s.priceIndex[k] = clamp(v * Math.exp(prng.normal(0, 0.02)) + 0.05 * (1 - v), 0.6, 1.8);
  }

  if (s.cash < 0) {
    s.negativeCashMonths += 1;
    report.notes.push(`현금 부족 ${s.negativeCashMonths}개월째 — ${BANKRUPT_AFTER_MONTHS}개월 지속 시 파산`);
    if (s.negativeCashMonths >= BANKRUPT_AFTER_MONTHS) { s.status = 'bankrupt'; report.notes.push('파산했습니다'); }
  } else s.negativeCashMonths = 0;

  report.netCash = s.cash - cashStart;
  report.cashEnd = s.cash;
  s.reports = [...s.reports, report].slice(-REPORTS_KEPT);
  s.month += 1;
  return s;
}

export function advanceMonths(s: GameState, n: number): GameState {
  let cur = s;
  for (let i = 0; i < n && cur.status === 'running'; i++) cur = advanceMonth(cur);
  return cur;
}

/** 원액이 든 캐스크의 월 보관비 + 보험료 */
export function caskStorageCost(s: GameState): number {
  const labor = regionOf(s).laborCost;
  return Math.round(s.casks.reduce((t, c) => {
    if (!c.contents || c.owner) return t; // 오너십 캐스크는 고객이 보관비를 낸다
    const value = c.contents.volumeL * c.contents.abv * bulkValuePerLPA(s, c.contents);
    return t + CASK_STORAGE.perCaskPerMonth * labor + value * CASK_STORAGE.insuranceRatePerMonth;
  }, 0));
}

export function monthlyFixedCost(s: GameState): number {
  return s.staff.reduce((t, x) => t + x.salary, 0) + regionOf(s).overheadPerMonth + s.marketingBudget + caskStorageCost(s) +
    s.equipment.reduce((t, e) => t + (EQUIPMENT[e.catalogId]?.maintenance ?? 0), 0) +
    s.loans.reduce((t, l) => t + currentLoanPayment(s, l), 0);
}

export const roleName = (r: StaffRole) => ROLE_INFO[r].nameKo;

/** 이번 달 대출 납부액 (거치 기간에는 이자만) */
export function currentLoanPayment(s: GameState, l: GameState['loans'][number]): number {
  return s.month < l.startMonth + l.graceMonths ? Math.round(l.balance * (l.annualRate / 12)) : l.monthlyPayment;
}

export interface CapacityReport {
  stills: { id: string; name: string; used: number; cap: number }[];
  fermenterDaysUsed: number;
  fermenterDaysCap: number;
  distillerRunsUsed: number;
  distillerRunsCap: number;
}

/** 현재 생산 지시 기준의 설비·인력 가동 예상 (UI 미리보기용) */
export function capacityReport(s: GameState): CapacityReport {
  const stills = s.equipment
    .filter((e) => EQUIPMENT[e.catalogId]?.kind === 'still')
    .map((e) => {
      const def = EQUIPMENT[e.catalogId]!;
      return { id: e.id, name: def.nameKo + (e.readyMonth > s.month ? ` (설치 중, ${monthLabel(s.startYear, e.readyMonth)})` : ''), used: 0, cap: e.readyMonth <= s.month && def.kind === 'still' ? def.runsPerMonth : 0 };
    });
  let fermenterDaysUsed = 0;
  let distillerRunsUsed = 0;
  for (const o of s.orders) {
    const r = s.recipes.find((x) => x.id === o.recipeId);
    if (!r) continue;
    const st = stills.find((x) => x.id === r.stillId);
    if (st) st.used += o.batchesPerMonth * r.runs;
    distillerRunsUsed += o.batchesPerMonth * r.runs;
    if (r.kind !== 'gin') fermenterDaysUsed += o.batchesPerMonth * (r.fermentDays + 2);
  }
  const fermenterDaysCap = s.equipment.filter((e) => EQUIPMENT[e.catalogId]?.kind === 'fermenter' && e.readyMonth <= s.month).length * 30;
  const distillerRunsCap = staffOf(s, 'distiller').reduce((t, d) => t + distillerRunCapacity(d.stats.b), 0);
  return { stills, fermenterDaysUsed, fermenterDaysCap, distillerRunsUsed, distillerRunsCap: Math.floor(distillerRunsCap) };
}
