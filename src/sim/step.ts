import { CASKS, EQUIPMENT, INGREDIENTS, ROLE_INFO } from './content/catalog';
import { siteIngredientFactor, siteOf } from './content/sites';
import { refreshBroker } from './broker';
import { fulfillContracts, refreshCaskBids, refreshContractOffers, updateBulkIndex } from './bulk';
import { clamp, weightedAverage } from './flavor';
import { gainXp, refreshCandidates } from './hr';
import { matureCask, restLot } from './maturation';
import { runSales, runVisitorSales, updateAwareness, updateTrends } from './market';
import { batchEnergyCost, simulateBatch, stillDefOf, volumeDiscounts } from './production';
import { fulfillRetail, OEM, refreshDeals } from './deals';
import { effectivePriceIndex, mod, pruneModifiers } from './modifiers';
import { runEvents } from './events';
import { holdingCost, inventoryMarginCall } from './holding';
import { applyTerroir, fermentCapacityFactor, heatingCost, ingredientSupplyCap, isTraditionalRecipe, resolveLocalSupply, resolveWaterPermit, seasonalEnergyFactor, waterPermitCap } from './sites';
import { rngFor } from './rng';
import type { FermenterType, GameState, MonthReport, SpiritLot, StaffRole } from './types';
import { bestBy, calendar, clone, monthLabel, nid, staffOf } from './util';

export const BANKRUPT_AFTER_MONTHS = 3;
const REPORTS_KEPT = 120;

/** 디스틸러 1인이 한 달에 운전할 수 있는 증류 횟수 */
export const distillerRunCapacity = (process: number) => 20 + process / 5;

interface FermenterSlot { id: string; type: FermenterType; capacityL: number; daysLeft: number }

function runProduction(s: GameState, report: MonthReport, monthOfYear: number): { runsUsed: number } {
  const site = siteOf(s);
  const distillers = staffOf(s, 'distiller');
  let distillerRuns = distillers.reduce((t, d) => t + distillerRunCapacity(d.stats.b), 0);
  const lead = bestBy(distillers, 'b');
  const stillRuns = new Map<string, number>();
  const fermenters: FermenterSlot[] = [];
  for (const e of s.equipment) {
    if (e.readyMonth > s.month) continue;
    const def = EQUIPMENT[e.catalogId];
    if (def?.kind === 'still') stillRuns.set(e.id, def.runsPerMonth);
    if (def?.kind === 'fermenter') fermenters.push({ id: e.id, type: def.fermenterType, capacityL: def.capacityL, daysLeft: 30 * fermentCapacityFactor(s, monthOfYear) });
  }
  // 취수 허가 (제주): 월 발효 투입 용량 상한
  let waterLeftL = waterPermitCap(s);
  // 소주는 옹기 우선
  fermenters.sort((a, b) => (a.type === 'onggi' ? -1 : 0) - (b.type === 'onggi' ? -1 : 0));
  let runsUsed = 0;
  if (mod(s, 'production') === 0) { if (s.orders.length) report.notes.push('생산 중단 — 이번 달은 증류하지 못했습니다'); return { runsUsed }; }
  // 원재료 가격 = 시세 지수 × 이벤트 보정 × 대량 구매 할인 × 산지(원료 단가·운송 할증·겨울 에너지)
  const prices = effectivePriceIndex(s, volumeDiscounts(s));
  for (const k of Object.keys(prices)) prices[k] = prices[k]! * (k === 'energy' ? seasonalEnergyFactor(s, monthOfYear) : siteIngredientFactor(site, k));
  const boughtKg: Record<string, number> = {};

  // 위탁생산(OEM, 간토) — 자사 생산보다 먼저 설비를 내준다. 원료는 위탁사 부담, 에너지비만 우리 몫
  const oemDone: string[] = [];
  for (const c of s.oemContracts) {
    if (s.month < c.startMonth) continue; // 전용 증류기 설치 중
    // 전용 증류기가 있으면 그것부터, 없으면 가동 여력이 남은 단식 증류기
    const stills = s.equipment
      .filter((e) => e.readyMonth <= s.month && EQUIPMENT[e.catalogId]?.kind === 'still' && (EQUIPMENT[e.catalogId] as { stillType: string }).stillType !== 'column')
      .sort((a, b) => (a.id === c.stillId ? -1 : 0) - (b.id === c.stillId ? -1 : 0));
    let done = 0;
    for (let b = 0; b < c.batchesPerMonth; b++) {
      const stillInst = stills.find((e) => (stillRuns.get(e.id) ?? 0) >= OEM.runs);
      const still = stillInst ? stillDefOf(s, stillInst.id) : null;
      if (!stillInst || !still || distillerRuns < OEM.runs || waterLeftL < still.chargeL) break;
      const ferm = fermenters.find((f) => f.capacityL >= still.chargeL && f.daysLeft >= OEM.fermentDays + 2 && f.type !== 'onggi');
      if (!ferm) break;
      ferm.daysLeft -= OEM.fermentDays + 2;
      waterLeftL -= still.chargeL;
      stillRuns.set(stillInst.id, (stillRuns.get(stillInst.id) ?? 0) - OEM.runs);
      distillerRuns -= OEM.runs;
      runsUsed += OEM.runs;
      const energy = Math.round(batchEnergyCost(still, OEM.runs, prices.energy ?? 1));
      s.cash -= energy;
      report.expenses.production = (report.expenses.production ?? 0) + energy;
      done++;
    }
    const missed = c.batchesPerMonth - done;
    const fee = done * c.feePerBatch;
    const penalty = missed * c.penaltyPerBatch;
    s.cash += fee - penalty;
    report.oemRevenue = (report.oemRevenue ?? 0) + fee;
    if (penalty > 0) { report.expenses.penalty = (report.expenses.penalty ?? 0) + penalty; report.notes.push(`${c.buyerName} 위탁생산 ${missed}배치 미이행 — 위약금`); }
    c.monthsDone += 1;
    c.missed += missed;
    if (c.missed >= 2 * c.batchesPerMonth) {
      // 전용 증류기 지원금은 남은 기간 비율만큼 돌려준다 (설비는 우리 것으로 남는다)
      const refund = Math.round((c.capexSupport ?? 0) * Math.max(0, c.termMonths - c.monthsDone) / c.termMonths);
      s.cash -= refund;
      report.notes.push(`${c.buyerName} 위탁생산 계약 파기 — 누적 미이행 과다${refund ? `, 설비 지원금 ${refund.toLocaleString()}원 반환` : ''}`);
      oemDone.push(c.id);
    }
    else if (c.monthsDone >= c.termMonths) { report.notes.push(`${c.buyerName} 위탁생산 계약 만료`); oemDone.push(c.id); }
  }
  s.oemContracts = s.oemContracts.filter((c) => !oemDone.includes(c.id));

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
        if (waterLeftL < still.chargeL) { blocked = '취수 허가량'; break; }
        const need = recipe.fermentDays + 2;
        ferm = fermenters.find((f) => f.capacityL >= still.chargeL && f.daysLeft >= need && (recipe.kind === 'soju' || f.type !== 'onggi'))
          ?? fermenters.find((f) => f.capacityL >= still.chargeL && f.daysLeft >= need);
        if (!ferm) { blocked = '발효조 부족'; break; }
      }
      const res = simulateBatch(recipe, still, ferm?.type ?? null, lead, prices, stillInst.feintsLPA ?? 0, site.water);
      // 원료 월 공급 한도 (지역 계약재배 물량 등)
      const short = Object.entries(res.ingredientsKg).find(([id, kg]) => {
        return (boughtKg[id] ?? 0) + kg > ingredientSupplyCap(s, id) + 1e-6;
      });
      if (short) { blocked = `${INGREDIENTS[short[0]]!.nameKo} 공급 한도(월 ${ingredientSupplyCap(s, short[0]).toLocaleString()}kg)`; break; }
      if (ferm) { ferm.daysLeft -= recipe.fermentDays + 2; waterLeftL -= still.chargeL; }
      stillRuns.set(stillInst.id, (stillRuns.get(stillInst.id) ?? 0) - recipe.runs);
      distillerRuns -= recipe.runs;
      runsUsed += recipe.runs;
      stillInst.feintsLPA = res.feintsOutLPA;
      s.cash -= res.cost;
      for (const [id, kg] of Object.entries(res.ingredientsKg)) boughtKg[id] = (boughtKg[id] ?? 0) + kg;
      parts.push({
        lpa: res.lpa, cost: res.cost,
        lot: { kind: recipe.kind, volumeL: res.volumeL, abv: res.abv, flavor: res.flavor, createdMonth: s.month, oakMonths: 0, sourced: false, costPerLPA: res.cost / res.lpa, recipeId: recipe.id },
      });
      for (const w of res.warnings) if (!report.notes.includes(w)) report.notes.push(w);
    }
    if (blocked) report.notes.push(`${recipe.name}: ${blocked}로 ${order.batchesPerMonth - parts.length}배치 생산 못 함`);
    if (!parts.length) continue;
    const lpa = parts.reduce((t, p) => t + p.lpa, 0);
    const volumeL = parts.reduce((t, p) => t + p.lot.volumeL, 0);
    const cost = parts.reduce((t, p) => t + p.cost, 0);
    const traditional = isTraditionalRecipe(site, recipe);
    s.lots.push({
      ...parts[0]!.lot,
      id: nid(s, 'L'),
      name: `${recipe.name} · ${monthLabel(s.startYear, s.month)}`,
      volumeL,
      abv: lpa / volumeL,
      flavor: weightedAverage(parts.map((p) => ({ flavor: p.lot.flavor, weight: p.lpa }))),
      costPerLPA: cost / lpa,
      ...(traditional ? { traditional: true } : {}),
    });
    if (recipe.kind === 'soju') s.flags.producedSoju = true;
    report.production.push({ recipeId: recipe.id, name: recipe.name, batches: parts.length, lpa, cost });
    report.expenses.production = (report.expenses.production ?? 0) + cost;
  }
  s.ingredientKgLastMonth = boughtKg;
  return { runsUsed };
}

function runMaturation(s: GameState, report: MonthReport, monthOfYear: number): void {
  const site = siteOf(s);
  const climate = { tempC: site.tempC[monthOfYear - 1]!, humidity: site.humidity[monthOfYear - 1]! };
  const wm = staffOf(s, 'warehouse');
  const control = Math.max(0, ...wm.map((x) => x.stats.b));
  const observe = Math.max(0, ...wm.map((x) => x.stats.a));
  const diligence = Math.max(0, ...wm.map((x) => x.stats.c));
  const rng = rngFor(s.seed, s.month, 'maturation');
  // 엔젤스 셰어 = 기후 모델 × 이벤트 보정 × 산지 보정 (regions.md §2.2)
  const evap = mod(s, 'evaporation') * site.angelShareFactor;
  let lost = 0;
  s.casks = s.casks.map((cask) => {
    if (!cask.contents) return cask;
    const res = matureCask(cask, climate, { control, evaporationFactor: evap });
    lost += res.lostL;
    let next = applyTerroir(site, res.cask, climate.tempC);
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
  report.angelsShareL = lost;
}

function runFinance(s: GameState, report: MonthReport, monthOfYear: number): void {
  const pay = (key: string, amount: number) => {
    if (amount <= 0) return;
    s.cash -= amount;
    report.expenses[key] = (report.expenses[key] ?? 0) + amount;
  };
  pay('salaries', s.staff.reduce((t, x) => t + x.salary, 0));
  pay('overhead', siteOf(s).overheadPerMonth);
  pay('heating', heatingCost(s, monthOfYear));
  // 숙성 재고 보유 비용 (결정 #65) — 시작 후 HOLDING.graceMonths 동안 면제
  const hold = holdingCost(s);
  pay('storage', hold.storage);
  pay('insurance', hold.insurance);
  // 결제 지연 대금(대형 유통 납품) 입금
  const due = s.receivables.filter((r) => r.dueMonth <= s.month);
  if (due.length) {
    const amount = due.reduce((t, r) => t + r.amount, 0);
    s.cash += amount;
    report.retailRevenue = (report.retailRevenue ?? 0) + amount;
    s.receivables = s.receivables.filter((r) => r.dueMonth > s.month);
  }
  pay('maintenance', s.equipment.reduce((t, e) => t + (e.readyMonth <= s.month ? (EQUIPMENT[e.catalogId]?.maintenance ?? 0) : 0), 0));
  pay('marketing', s.marketingBudget);
  for (const loan of s.loans) {
    const interest = Math.round(loan.balance * (loan.annualRate / 12));
    const inGrace = s.month < loan.startMonth + loan.graceMonths;
    const principal = inGrace ? 0 : Math.min(loan.balance, loan.monthlyPayment - interest);
    loan.balance -= principal;
    pay('interest', interest);
    pay('principal', principal);
  }
  pay('principal', inventoryMarginCall(s, report));
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
  resolveWaterPermit(s, report);
  resolveLocalSupply(s, report);
  runEvents(s, report, monthOfYear);
  for (const e of s.equipment) if (e.readyMonth === s.month && s.month > 0) report.notes.push(`${EQUIPMENT[e.catalogId]?.nameKo ?? e.catalogId} 가동 시작`);

  const { runsUsed } = runProduction(s, report, monthOfYear);
  runMaturation(s, report, monthOfYear);
  fulfillContracts(s, report);

  fulfillRetail(s, report);
  const sales = runSales(s, rngFor(s.seed, s.month, 'sales'), monthOfYear);
  report.sales = sales;
  report.revenue = sales.reduce((t, x) => t + x.revenue, 0);
  // 직판장 (판매 뒤 남은 재고에서)
  const visitor = runVisitorSales(s, monthOfYear);
  report.visitorBottles = visitor.reduce((t, x) => t + x.bottles, 0);
  report.visitorRevenue = visitor.reduce((t, x) => t + x.revenue, 0);
  report.revenue += report.visitorRevenue;
  report.liquorTaxRemitted = Math.round(sales.reduce((t, x) => t + x.tax, 0) + visitor.reduce((t, x) => t + x.tax, 0));
  report.taxRelief = Math.round(sales.reduce((t, x) => t + x.relief, 0));
  report.dutyFreeBottles = sales.reduce((t, x) => t + x.dutyFree, 0);
  s.cash += report.revenue;
  const distribution = sales.reduce((t, x) => t + x.distribution, 0);
  if (distribution > 0) { s.cash -= distribution; report.expenses.distribution = distribution; }
  updateAwareness(s, sales);
  updateTrends(s, rngFor(s.seed, s.month, 'trend'));

  runFinance(s, report, monthOfYear);

  const activity: Record<StaffRole, number> = {
    distiller: runsUsed / 2,
    warehouse: s.casks.filter((c) => c.contents).length / 5,
    sales: sales.reduce((t, x) => t + x.bottles, 0) / 200,
  };
  report.notes.push(...gainXp(s, rngFor(s.seed, s.month, 'hr'), activity));
  if (s.month % 3 === 2) refreshCandidates(s, rngFor(s.seed, s.month, 'candidates'));
  refreshBroker(s, rngFor(s.seed, s.month, 'broker'));
  refreshContractOffers(s, rngFor(s.seed, s.month, 'contracts'));
  refreshCaskBids(s, rngFor(s.seed, s.month, 'caskbids'));
  refreshDeals(s, rngFor(s.seed, s.month, 'deals'));
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

export function monthlyFixedCost(s: GameState): number {
  return s.staff.reduce((t, x) => t + x.salary, 0) + siteOf(s).overheadPerMonth + s.marketingBudget +
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
