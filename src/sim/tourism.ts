import { EQUIPMENT } from './content/catalog';
import { awarenessOf, houseBrand } from './brands';
import { regionOf, siteOf } from './content/regions';
import { clamp } from './flavor';
import { GIFT_SHOP } from './content/market';
import type { GameState, MonthReport } from './types';

// 비지터 센터·관광 (파트 MKT, 결정 #144 — 파일 쪼개기로 옮겨 왔다. 규칙·수치 불변)

// ───────────── 비지터 센터·관광 ─────────────

const TOUR_SEASON = [0.7, 0.7, 0.9, 1.0, 1.1, 1.0, 1.2, 1.3, 1.0, 1.2, 1.0, 0.9];
/** 비지터 센터에서 뉴메이크 1병(500ml)에 쓰는 원액과 실수령액 */
export const NEW_MAKE_BOTTLE = { lpa: 0.32, netPrice: 20_000, buyRate: 0.1 };

export function visitorTiers(s: GameState) {
  return s.production.equipment.filter((e) => e.readyMonth <= s.month).map((e) => EQUIPMENT[e.catalogId]).filter((d): d is Extract<NonNullable<typeof d>, { kind: 'visitor' }> => d?.kind === 'visitor');
}

export const tourismFactor = (s: GameState) => (regionOf(s).tourism ?? 1) * (siteOf(s).tourism ?? 1);

export function runTourism(s: GameState, report: MonthReport, monthOfYear: number): void {
  const tiers = visitorTiers(s);
  s.commerce.localBuzz = clamp(s.commerce.localBuzz * (1 - 0.015), 0, 1);
  if (!tiers.length) return;
  const draw = TOUR_SEASON[monthOfYear - 1]! * tourismFactor(s) * clamp(0.6 + 0.8 * awarenessOf(s) + s.commerce.localBuzz, 0.4, 2);
  let visitors = 0;
  let revenue = 0;
  let buzz = 0;
  for (const t of tiers) {
    const v = Math.round(t.visitorsPerMonth * draw);
    visitors += v;
    revenue += v * t.spendPerVisitor;
    buzz += v * t.buzzQuality;
  }
  // 기프트 샵(#234): 굿즈 수입 + 뉴메이크 소포장 구매율 상승
  const giftShop = tiers.some((t) => t.id === GIFT_SHOP.id);
  if (giftShop) revenue += visitors * GIFT_SHOP.merchPerVisitor;
  // 뉴메이크 한정판: 탱크의 몰트·그레인 원액을 쓴다 — 숙성에 넣을 원액을 당겨 쓰는 대가
  let nmBottles = Math.floor(visitors * (giftShop ? GIFT_SHOP.newMakeBuyRate : NEW_MAKE_BOTTLE.buyRate));
  for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt' || l.kind === 'grain')) {
    if (nmBottles <= 0) break;
    const take = Math.min(nmBottles, Math.floor((lot.volumeL * lot.abv) / NEW_MAKE_BOTTLE.lpa));
    lot.volumeL -= (take * NEW_MAKE_BOTTLE.lpa) / lot.abv;
    revenue += take * NEW_MAKE_BOTTLE.netPrice;
    nmBottles -= take;
  }
  s.inventory.lots = s.inventory.lots.filter((l) => l.volumeL > 1);
  s.finance.cash += revenue;
  s.commerce.localBuzz = clamp(s.commerce.localBuzz + buzz / 200_000, 0, 1);
  const house = houseBrand(s);
  house.awareness = clamp(house.awareness + 0.004 * s.commerce.localBuzz * (1 - house.awareness), 0.001, 0.95);
  report.visitors = visitors;
  report.tourismRevenue = revenue;
}
