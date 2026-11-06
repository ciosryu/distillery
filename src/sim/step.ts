import { BULK, CASK_STORAGE, CASKS, EQUIPMENT, INGREDIENTS, ROLE_INFO } from './content/catalog';
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
import { batchEnergyCost, simulateBatch, stillDefOf, volumeDiscounts } from './production';
import { siteOf } from './content/regions';
import { collectReceivables, fulfillRetail, OEM, refreshDeals } from './deals';
import { hasLocalIngredient, heatingCost, inventoryMarginCall, resolveDutyFreeEditions, resolveWaterPermit, seasonalEnergyFactor, siteFreight, siteOverhead, waterPermitCap } from './sites';
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
  for (const e of s.production.equipment) {
    if (e.readyMonth > s.month) continue;
    const def = EQUIPMENT[e.catalogId];
    if (def?.kind === 'still') stillRuns.set(e.id, def.runsPerMonth);
    if (def?.kind === 'fermenter') fermenters.push({ id: e.id, type: def.fermenterType, capacityL: def.capacityL, daysLeft: 30 });
  }
  // 소주는 옹기 우선
  fermenters.sort((a, b) => (a.type === 'onggi' ? -1 : 0) - (b.type === 'onggi' ? -1 : 0));
  let runsUsed = 0;
  if (mod(s, 'production') === 0) { if (s.production.orders.length || s.b2b.oemContracts.length) report.notes.push('생산 중단 — 이번 달은 증류하지 못했습니다'); return { runsUsed, mashKg: 0 }; }
  // 원재료 가격 = 시세 지수 × 이벤트 보정 × 대량 구매 할인
  const prices = effectivePriceIndex(s, volumeDiscounts(s));
  const boughtKg: Record<string, number> = {};
  // 입지 특성 (결정 #86): 물·입고 운송 할증·겨울 에너지비, 취수 허가(제주) = 월 발효 투입 용량 상한
  const site = siteOf(s);
  const energyFactor = seasonalEnergyFactor(s, monthOfYear);
  let waterLeftL = waterPermitCap(s);
  let waterBlocked = false;

  // 위탁생산(OEM, 간토, 결정 #89) — 자사 생산보다 먼저 설비를 내준다. 원료는 위탁사 부담, 에너지비만 우리 몫
  const oemDone: string[] = [];
  for (const c of s.b2b.oemContracts) {
    if (s.month < c.startMonth) continue; // 전용 증류기 설치 중
    const stills = s.production.equipment
      .filter((e) => e.readyMonth <= s.month && EQUIPMENT[e.catalogId]?.kind === 'still' && (EQUIPMENT[e.catalogId] as { stillType: string }).stillType !== 'column')
      .sort((a, b) => (a.id === c.stillId ? -1 : 0) - (b.id === c.stillId ? -1 : 0));
    let done = 0;
    for (let b = 0; b < c.batchesPerMonth; b++) {
      const stillInst = stills.find((e) => (stillRuns.get(e.id) ?? 0) >= OEM.runs);
      const still = stillInst ? stillDefOf(s, stillInst.id) : null;
      if (!stillInst || !still || distillerRuns < OEM.runs || waterLeftL < still.chargeL) break;
      const need = fermentDaysAt(OEM.fermentDays, fermC) + 2;
      const ferm = fermenters.find((f) => f.capacityL >= still.chargeL && f.daysLeft >= need && f.type !== 'onggi');
      if (!ferm) break;
      ferm.daysLeft -= need;
      waterLeftL -= still.chargeL;
      stillRuns.set(stillInst.id, (stillRuns.get(stillInst.id) ?? 0) - OEM.runs);
      distillerRuns -= OEM.runs;
      runsUsed += OEM.runs;
      const energy = Math.round(batchEnergyCost(still, OEM.runs, prices.energy ?? 1, energyFactor));
      s.finance.cash -= energy;
      report.expenses.production = (report.expenses.production ?? 0) + energy;
      done++;
    }
    const missed = c.batchesPerMonth - done;
    const fee = done * c.feePerBatch;
    const penalty = missed * c.penaltyPerBatch;
    s.finance.cash += fee - penalty;
    report.oemRevenue = (report.oemRevenue ?? 0) + fee;
    report.revenue += fee;
    if (penalty > 0) { report.expenses.penalty = (report.expenses.penalty ?? 0) + penalty; report.notes.push(`${c.buyerName} 위탁생산 ${missed}배치 미이행 — 위약금`); }
    c.monthsDone += 1;
    c.missed += missed;
    if (c.missed >= 2 * c.batchesPerMonth) {
      // 전용 증류기 지원금은 남은 기간 비율만큼 돌려준다 (설비는 우리 것으로 남는다)
      const refund = Math.round(((c.capexSupport ?? 0) * Math.max(0, c.termMonths - c.monthsDone)) / c.termMonths);
      s.finance.cash -= refund;
      report.notes.push(`${c.buyerName} 위탁생산 계약 파기 — 누적 미이행 과다${refund ? `, 설비 지원금 ${refund.toLocaleString()}원 반환` : ''}`);
      oemDone.push(c.id);
    } else if (c.monthsDone >= c.termMonths) { report.notes.push(`${c.buyerName} 위탁생산 계약 만료`); oemDone.push(c.id); }
  }
  s.b2b.oemContracts = s.b2b.oemContracts.filter((c) => !oemDone.includes(c.id));

  for (const order of s.production.orders) {
    if (order.batchesPerMonth <= 0) continue;
    const recipe = s.production.recipes.find((r) => r.id === order.recipeId);
    if (!recipe) continue;
    const still = stillDefOf(s, recipe.stillId);
    const stillInst = s.production.equipment.find((e) => e.id === recipe.stillId);
    if (!still || !stillInst || stillInst.readyMonth > s.month) { report.notes.push(`${recipe.name}: 증류기가 준비되지 않아 생산 중단`); continue; }
    const parts: { lot: Omit<SpiritLot, 'id' | 'name'>; lpa: number; cost: number }[] = [];
    let blocked = '';
    for (let b = 0; b < order.batchesPerMonth; b++) {
      if ((stillRuns.get(stillInst.id) ?? 0) < recipe.runs) { blocked = '증류기 가동 한도'; break; }
      if (distillerRuns < recipe.runs) { blocked = distillers.length ? '디스틸러 운전 한도' : '디스틸러 없음'; break; }
      if (recipe.kind !== 'gin' && waterLeftL < still.chargeL) { blocked = '취수 허가량'; waterBlocked = true; break; }
      let ferm: FermenterSlot | undefined;
      if (recipe.kind !== 'gin') {
        // 발효실 온도에 따라 발효 기간이 늘거나 준다 (결정 #67)
        const need = fermentDaysAt(recipe.fermentDays, fermC) + 2;
        ferm = fermenters.find((f) => f.capacityL >= still.chargeL && f.daysLeft >= need && (recipe.kind === 'soju' || f.type !== 'onggi'))
          ?? fermenters.find((f) => f.capacityL >= still.chargeL && f.daysLeft >= need);
        if (!ferm) { blocked = '발효조 부족'; break; }
        ferm.daysLeft -= need;
        waterLeftL -= still.chargeL;
      }
      stillRuns.set(stillInst.id, (stillRuns.get(stillInst.id) ?? 0) - recipe.runs);
      distillerRuns -= recipe.runs;
      runsUsed += recipe.runs;
      const res = simulateBatch(recipe, still, ferm?.type ?? null, lead, prices, stillInst.feintsLPA ?? 0, { tempC: fermC, rng: prodRng, regionId: s.regionId, water: site.water, freight: siteFreight(s, 'ingredients'), energyFactor });
      stillInst.feintsLPA = res.feintsOutLPA;
      s.finance.cash -= res.cost;
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
    s.inventory.lots.push({
      ...parts[0]!.lot,
      id: nid(s, 'L'),
      name: `${recipe.name} · ${monthLabel(s.startYear, s.month)}`,
      volumeL,
      abv: lpa / volumeL,
      flavor: weightedAverage(parts.map((p) => ({ flavor: p.lot.flavor, weight: p.lpa }))),
      costPerLPA: cost / lpa,
      ...(hasLocalIngredient(site, recipe) ? { localIngredient: true } : {}),
    });
    if (recipe.kind === 'soju') s.production.flags.producedSoju = true;
    report.production.push({ recipeId: recipe.id, name: recipe.name, batches: parts.length, lpa, cost });
    report.expenses.production = (report.expenses.production ?? 0) + cost;
  }
  if (waterBlocked) report.notes.push(`취수 허가량(월 ${waterPermitCap(s).toLocaleString()}L)에 막혀 일부 배치를 못 만들었습니다 — 증량 신청을 검토하세요`);
  s.production.ingredientKgLastMonth = boughtKg;
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
  s.inventory.casks = s.inventory.casks.map((cask) => {
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
  s.inventory.lots = s.inventory.lots.map(restLot);
  runContamination(s, report, rngFor(s.seed, s.month, 'contamination'), monthOfYear);
  report.angelsShareL = lost;
}

function runFinance(s: GameState, report: MonthReport, monthOfYear: number): void {
  const pay = (key: string, amount: number) => {
    if (amount <= 0) return;
    s.finance.cash -= amount;
    report.expenses[key] = (report.expenses[key] ?? 0) + amount;
  };
  pay('salaries', s.hr.staff.reduce((t, x) => t + x.salary, 0));
  pay('overhead', siteOverhead(s));
  pay('heating', heatingCost(s, monthOfYear));
  pay('maintenance', s.production.equipment.reduce((t, e) => t + (e.readyMonth <= s.month ? (EQUIPMENT[e.catalogId]?.maintenance ?? 0) : 0), 0));
  pay('marketing', s.commerce.marketingBudget);
  pay('storage', caskStorageCost(s));
  for (const loan of s.finance.loans) {
    const interest = Math.round(loan.balance * (loan.annualRate / 12));
    const inGrace = s.month < loan.startMonth + loan.graceMonths;
    const principal = inGrace ? 0 : Math.min(loan.balance, loan.monthlyPayment - interest);
    loan.balance -= principal;
    pay('interest', interest);
    pay('principal', principal);
  }
  // 재고 담보대출(홋카이도, 결정 #90): 시가가 떨어지면 추가 상환 요구
  pay('principal', inventoryMarginCall(s, report));
  s.finance.loans = s.finance.loans.filter((l) => l.balance > 0);
}

/** 1개월 진행 (순수 함수) */
export function advanceMonth(prev: GameState): GameState {
  if (prev.status !== 'running') return prev;
  const s = clone(prev);
  const { monthOfYear } = calendar(s);
  const cashStart = s.finance.cash;
  const report: MonthReport = { month: s.month, revenue: 0, expenses: {}, netCash: 0, cashEnd: 0, sales: [], production: [], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] };

  pruneModifiers(s);
  s.inventory.rotatedThisMonth = 0;
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
  runEvents(s, report, monthOfYear);
  for (const e of s.production.equipment) if (e.readyMonth === s.month && s.month > 0) report.notes.push(`${EQUIPMENT[e.catalogId]?.nameKo ?? e.catalogId} 가동 시작`);

  const { runsUsed, mashKg } = runProduction(s, report, monthOfYear);
  runMaturation(s, report, monthOfYear);
  fulfillContracts(s, report);

  fulfillRetail(s, report);
  const { results: sales, retail } = runSales(s, rngFor(s.seed, s.month, 'sales'), monthOfYear);
  report.sales = sales.map(({ overflowBottles: _o, distribution: _d, ...x }) => x);
  report.retailCapacityCases = retail.capacityCases;
  report.retailSoldCases = retail.soldCases;
  report.overflowCases = retail.overflowCases;
  report.lostSalesBottles = retail.lostBottles;
  if (retail.overflowCases > 0) report.notes.push(`소매 처리 역량 초과 — ${retail.overflowCases}케이스를 고비용 채널로 판매${retail.lostBottles > 0 ? `, ${retail.lostBottles.toLocaleString()}병은 못 팔았다` : ''} (영업 직원을 늘리면 역량↑)`);
  report.revenue += sales.reduce((t, x) => t + x.revenue, 0);
  report.dutyFreeBottles = sales.reduce((t, x) => t + (x.dutyFree ?? 0), 0);
  // 주세 납부 — 전통주는 연 누적 출고량 구간별 경감 (한국 완화책 #73)
  const region = regionOf(s);
  if (monthOfYear === 1) { s.commerce.traditionalPrevYearL = s.commerce.traditionalReleasedL; s.commerce.traditionalReleasedL = 0; }
  let tax = 0;
  for (const x of sales) {
    const p = s.commerce.products.find((q) => q.id === x.productId);
    if (!p) continue;
    // 면세 판매분은 주세가 없고 전통주 경감 출고량에도 잡지 않는다 (결정 #87)
    const domestic = x.bottles - (x.dutyFree ?? 0);
    tax += domestic * liquorTaxPerBottle(region, p.price, p.bottleMl, p.abv, traditionalTaxFactor(region, p.traditional, s.commerce.traditionalReleasedL, s.commerce.traditionalPrevYearL));
    if (p.traditional) s.commerce.traditionalReleasedL += (domestic * p.bottleMl) / 1000;
  }
  report.liquorTaxRemitted = Math.round(tax);
  s.finance.cash += sales.reduce((t, x) => t + x.revenue, 0);
  const distribution = sales.reduce((t, x) => t + x.distribution, 0);
  if (distribution > 0) { s.finance.cash -= distribution; report.expenses.distribution = distribution; }
  report.dutyFreeAwareness = updateAwareness(s, sales);
  resolveDutyFreeEditions(s, report);
  collectReceivables(s, report);
  updateTrends(s, rngFor(s.seed, s.month, 'trend'));
  runTourism(s, report, monthOfYear);
  deliverOwnedCasks(s, report);
  runOffice(s, report, rngFor(s.seed, s.month, 'office'), mashKg);
  runStaffLifecycle(s, report, rngFor(s.seed, s.month, 'lifecycle'));

  runFinance(s, report, monthOfYear);

  const activity: Record<StaffRole, number> = {
    distiller: runsUsed / 2,
    warehouse: s.inventory.casks.filter((c) => c.contents).length / 5,
    sales: sales.reduce((t, x) => t + x.bottles, 0) / 200,
    office: 10,
  };
  report.notes.push(...gainXp(s, rngFor(s.seed, s.month, 'hr'), activity));
  if (s.month % 3 === 2) refreshCandidates(s, rngFor(s.seed, s.month, 'candidates'));
  refreshBroker(s, rngFor(s.seed, s.month, 'broker'));
  refreshContractOffers(s, rngFor(s.seed, s.month, 'contracts'));
  refreshCaskBids(s, rngFor(s.seed, s.month, 'caskbids'));
  updateBulkIndex(s, rngFor(s.seed, s.month, 'bulk'));
  refreshDeals(s, rngFor(s.seed, s.month, 'deals'));
  // 그레인 현물 시장이 물량을 소화한다 (#81)
  if (s.b2b.spotSoldLPA) s.b2b.spotSoldLPA = { grain: s.b2b.spotSoldLPA.grain * BULK.spotDecay };

  // 원재료 가격 변동 (평균 회귀 랜덤 워크)
  const prng = rngFor(s.seed, s.month, 'prices');
  for (const k of Object.keys(s.world.priceIndex)) {
    const v = s.world.priceIndex[k]!;
    s.world.priceIndex[k] = clamp(v * Math.exp(prng.normal(0, 0.02)) + 0.05 * (1 - v), 0.6, 1.8);
  }

  if (s.finance.cash < 0) {
    s.finance.negativeCashMonths += 1;
    report.notes.push(`현금 부족 ${s.finance.negativeCashMonths}개월째 — ${BANKRUPT_AFTER_MONTHS}개월 지속 시 파산`);
    if (s.finance.negativeCashMonths >= BANKRUPT_AFTER_MONTHS) { s.status = 'bankrupt'; report.notes.push('파산했습니다'); }
  } else s.finance.negativeCashMonths = 0;

  report.netCash = s.finance.cash - cashStart;
  report.cashEnd = s.finance.cash;
  s.history.reports = [...s.history.reports, report].slice(-REPORTS_KEPT);
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
  return Math.round(s.inventory.casks.reduce((t, c) => {
    if (!c.contents || c.owner) return t; // 오너십 캐스크는 고객이 보관비를 낸다
    const value = c.contents.volumeL * c.contents.abv * bulkValuePerLPA(s, c.contents);
    return t + CASK_STORAGE.perCaskPerMonth * labor + value * CASK_STORAGE.insuranceRatePerMonth;
  }, 0));
}

export function monthlyFixedCost(s: GameState): number {
  return s.hr.staff.reduce((t, x) => t + x.salary, 0) + siteOverhead(s) + s.commerce.marketingBudget + caskStorageCost(s) +
    s.production.equipment.reduce((t, e) => t + (EQUIPMENT[e.catalogId]?.maintenance ?? 0), 0) +
    s.finance.loans.reduce((t, l) => t + currentLoanPayment(s, l), 0);
}

export const roleName = (r: StaffRole) => ROLE_INFO[r].nameKo;

/** 이번 달 대출 납부액 (거치 기간에는 이자만) */
export function currentLoanPayment(s: GameState, l: GameState['finance']['loans'][number]): number {
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
  const stills = s.production.equipment
    .filter((e) => EQUIPMENT[e.catalogId]?.kind === 'still')
    .map((e) => {
      const def = EQUIPMENT[e.catalogId]!;
      return { id: e.id, name: def.nameKo + (e.readyMonth > s.month ? ` (설치 중, ${monthLabel(s.startYear, e.readyMonth)})` : ''), used: 0, cap: e.readyMonth <= s.month && def.kind === 'still' ? def.runsPerMonth : 0 };
    });
  let fermenterDaysUsed = 0;
  let distillerRunsUsed = 0;
  for (const o of s.production.orders) {
    const r = s.production.recipes.find((x) => x.id === o.recipeId);
    if (!r) continue;
    const st = stills.find((x) => x.id === r.stillId);
    if (st) st.used += o.batchesPerMonth * r.runs;
    distillerRunsUsed += o.batchesPerMonth * r.runs;
    if (r.kind !== 'gin') fermenterDaysUsed += o.batchesPerMonth * (r.fermentDays + 2);
  }
  const fermenterDaysCap = s.production.equipment.filter((e) => EQUIPMENT[e.catalogId]?.kind === 'fermenter' && e.readyMonth <= s.month).length * 30;
  const distillerRunsCap = staffOf(s, 'distiller').reduce((t, d) => t + distillerRunCapacity(d.stats.b), 0);
  return { stills, fermenterDaysUsed, fermenterDaysCap, distillerRunsUsed, distillerRunsCap: Math.floor(distillerRunsCap) };
}
