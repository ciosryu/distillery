import { regionOf, liquorTaxPerBottle, traditionalTaxFactor } from './content/regions';
import { rngFor } from './rng';
import type { GameState, MonthReport } from './types';
import type { TickContext } from './tick';
import { runSales, updateAwareness, updateExportAwareness } from './market';
import { EXPORT_MARKETS } from './content/exports';
import { runExportContracts } from './exportDeals';
import { secondBrandMonthlyCost } from './brands';

// 판매·주세 단계(틱 5) 본문 (파트 MKT, 결정 #144 — 파일 쪼개기로 옮겨 왔다. 규칙·수치 불변)

/** 5 판매·주세 — 이번 달 판매 결과를 돌려준다(성장 단계의 XP에 쓰임). step.ts가 부른다 */
export function settleSales(s: GameState, report: MonthReport, ctx: TickContext): ReturnType<typeof runSales>['results'] {
  updateExportAwareness(s); // 판매 전에 갱신 — 면세는 국내 인지도가 첫 달부터 넘어온다
  const { results: sales, retail, exports } = runSales(s, rngFor(s.seed, s.month, 'sales'), ctx.monthOfYear);
  // 수출 (#95·#101): 수입사 매입가(출고가 × 계약 비율)가 대금 지급 기한 뒤 들어오고(국내 주세 면세), 운임은 우리가, 마케팅 분담은 매달 낸다
  if (s.commerce.exports?.length) {
    report.exports = exports;
    report.exportRevenue = exports.reduce((t, x) => t + x.revenue, 0);
    for (const m of new Set(exports.map((x) => x.marketId))) {
      const e = s.commerce.exports.find((x) => x.marketId === m);
      const amount = exports.filter((x) => x.marketId === m).reduce((t, x) => t + x.revenue, 0);
      if (amount <= 0) continue;
      if (e?.paymentDelay) s.finance.receivables.push({ dueMonth: s.month + e.paymentDelay, amount, label: `${e.partner ?? EXPORT_MARKETS[m].nameKo} 수출 대금` });
      else s.finance.cash += amount;
    }
    const freight = exports.reduce((t, x) => t + x.freight, 0);
    if (freight > 0) { s.finance.cash -= freight; report.expenses.export_freight = freight; }
    const fixed = runExportContracts(s, report);
    if (fixed > 0) { s.finance.cash -= fixed; report.expenses.export_fixed = fixed; }
  }
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
  if (ctx.monthOfYear === 1) { s.commerce.traditionalPrevYearL = s.commerce.traditionalReleasedL; s.commerce.traditionalReleasedL = 0; }
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
  // 세컨드 브랜드 유지비 + 브랜드별 마케팅비 (P-MKT-2) — 결산표 '마케팅' 줄에 합친다. 하우스 마케팅비는 재무 단계가 같은 줄에 더한다
  const brandCost = secondBrandMonthlyCost(s);
  if (brandCost > 0) { s.finance.cash -= brandCost; report.expenses.marketing = (report.expenses.marketing ?? 0) + brandCost; }
  report.dutyFreeAwareness = updateAwareness(s, sales);
  return sales;
}
