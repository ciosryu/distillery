import { BOTANICALS, EQUIPMENT, INGREDIENTS, LOAN_OFFERS, type EquipmentDef } from './content/catalog';
import { refPricePerL, regionOf, siteOf, type RegionDef, type SiteDef } from './content/regions';
import { bulkValuePerLPA, isBulkKind } from './bulk';
import { clamp } from './flavor';
import { mod } from './modifiers';
import { rngFor } from './rng';
import type { GameState, MonthReport, Product, ProductCategory, Recipe } from './types';

// 입지 특성 규칙 (결정 #86~, docs/design/regions.md) — 기후·특산물(v0.9 #62) 위에 얹는 물·고정비·물류·취수·면세·담보대출

// ───────────── 고정비·건설비·물류 ─────────────

/** 이 입지의 월 관리비 = 지역 관리비 × 입지 배수 */
export const siteOverhead = (s: Pick<GameState, 'regionId' | 'siteId'>) => Math.round(regionOf(s).overheadPerMonth * (siteOf(s).overheadFactor ?? 1));

/** 입지 건설비 반영 설비 단가 (숙성고는 땅값 배수를 한 번 더) */
export function equipmentCost(s: Pick<GameState, 'regionId' | 'siteId'>, def: EquipmentDef): number {
  const site = siteOf(s);
  return Math.round(def.cost * (site.buildCostFactor ?? 1) * (def.kind === 'warehouse' ? site.warehouseCostFactor ?? 1 : 1));
}

/** 입고 운송 할증 */
export const siteFreight = (s: Pick<GameState, 'regionId' | 'siteId'>, k: 'ingredients' | 'packaging' | 'casks') => siteOf(s).freight?.[k] ?? 1;

/** 국내 출고 물류비 배수 */
export const outboundLogistics = (s: Pick<GameState, 'regionId' | 'siteId'>) => siteOf(s).outboundLogistics ?? 1;

/** 원액 B2B 운송비 배수 (블렌더 매입 단가) */
export const bulkFreight = (s: Pick<GameState, 'regionId' | 'siteId'>) => siteOf(s).bulkFreight ?? 1;

/** 이번 달 난방비 / 증류 에너지비 배수 */
export function heatingCost(s: Pick<GameState, 'regionId' | 'siteId'>, monthOfYear: number): number {
  const h = siteOf(s).heating;
  return h && h.months.includes(monthOfYear) ? h.perMonth : 0;
}
export function seasonalEnergyFactor(s: Pick<GameState, 'regionId' | 'siteId'>, monthOfYear: number): number {
  const h = siteOf(s).heating;
  return h && h.months.includes(monthOfYear) ? h.energyFactor : 1;
}

/** 발주 목록에서 숨길 설비가 생기면 여기서 거른다 (지금은 전부 허용) */
export const equipmentAvailable = (): EquipmentDef[] => Object.values(EQUIPMENT);

// ───────────── 입지 원료 (결정 #87) ─────────────

/** 레시피가 이 입지의 원료(입지 전용 원재료·보태니컬)를 쓰는가 — 제주 차조 고소리술, 청귤 진 */
export function hasLocalIngredient(site: Pick<SiteDef, 'id'>, r: Pick<Recipe, 'mashBill'> & Partial<Pick<Recipe, 'botanicals'>>): boolean {
  const local = (sites?: string[]) => !!sites?.includes(site.id);
  if (r.mashBill.some((m) => m.ratio > 0 && local(INGREDIENTS[m.ingredientId]?.sites))) return true;
  return (r.botanicals ?? []).some((b) => b.gramsPerL > 0 && local(BOTANICALS[b.botanicalId]?.sites));
}

// ───────────── 취수 허가 (제주) ─────────────

/** 월 발효 투입 용량 상한(L). 없으면 Infinity */
export function waterPermitCap(s: GameState): number {
  const wp = siteOf(s).waterPermit;
  return wp ? s.site.waterPermitL ?? wp.baseL : Infinity;
}

/** 취수 증량 신청 (s는 변경 가능한 복제본) — 오류 문구 또는 null */
export function applyWaterPermit(s: GameState): string | null {
  const wp = siteOf(s).waterPermit;
  if (!wp) return '이 입지에는 취수 허가 제도가 없습니다';
  if (s.site.permitApplication) return '이미 심사 중인 신청이 있습니다';
  if (s.finance.cash < wp.cost) return '현금이 부족합니다';
  s.finance.cash -= wp.cost;
  const rng = rngFor(s.seed, s.month, 'permit');
  s.site.permitApplication = { decideMonth: s.month + rng.int(wp.months[0], wp.months[1]), addL: wp.stepL, chance: wp.chance };
  return null;
}

/** 월초: 심사 결과 확정 */
export function resolveWaterPermit(s: GameState, report: MonthReport): void {
  const app = s.site.permitApplication;
  if (!app || s.month < app.decideMonth) return;
  s.site.permitApplication = undefined;
  if (rngFor(s.seed, s.month, 'permit-decide').chance(app.chance)) {
    s.site.waterPermitL = waterPermitCap(s) + app.addL;
    report.events.push('취수 증량 승인');
    report.notes.push(`취수 허가 증량 승인 — 월 ${waterPermitCap(s).toLocaleString()}L`);
  } else {
    report.events.push('취수 증량 불허');
    report.notes.push('취수 허가 증량 신청이 불허됐습니다 (다시 신청할 수 있습니다)');
  }
}

// ───────────── 지정면세점 채널·면세 한정판 시리즈 (제주, 결정 #87) ─────────────

/**
 * 지정면세점 [추정·튜닝]: JDC 지정면세점 주류 매출을 연 약 24만 케이스로 추정. 출도 내국인 대상, 주류 2L·미화 400달러 한도.
 * 한정판 시리즈: 전용 매대 1칸, 6개월 안 완판 시 다음 판 매력도 +3%(최대 3연속)·인지도 +0.5%p, 12개월 미판매 시 국내 이관.
 * 제주 원료 기념품 매력도 ×1.1, 위스키 한정판은 숙성 연수 보너스. 면세 판매 1병은 입소문 2병
 */
export const DUTY_FREE = {
  market: { whisky: 120_000, blended_whisky: 60_000, grain_whisky: 10_000, soju_distilled: 25_000, gin: 10_000, malt_spirit: 5_000, flavored_spirit: 10_000, baijiu: 0 } as Record<ProductCategory, number>,
  /** 단일 브랜드 점유 상한 — 지역 상품 진열 */
  shareCap: 0.02,
  /** 면세 소비자가 = 출고가 × 면세점 마진 (주세·부가세 없음).
   *  v1.6(#126): 1.6 → 1.9 — 면세 기념품 한정판(site)이 40·60시드에서 1위 70~75%를 차지하는 지배 전략이었다.
   *  1.9에서 60시드 57%(통과). 공항 면세 수출 유통 배수 2.5(§16.25)와도 방향이 맞다. 실제 지정면세점 마진은 확인 못 함 [튜닝] */
  markup: 1.9,
  /** 면세 기준가 = 국내 기준 소비자가 × 이 비율 */
  refFactor: 0.6,
  /** 1인 구매 한도 미화 400달러 ≒ 55만 원 [환율 가정] */
  maxBottlePrice: 550_000,
  slots: 1,
  localAppeal: 1.1,
  agedTiers: [{ years: 10, appeal: 1.15 }, { years: 8, appeal: 1.1 }, { years: 6, appeal: 1.05 }] as { years: number; appeal: number }[],
  sellOutMonths: 6,
  returnMonths: 12,
  streakAppeal: 0.03,
  maxStreak: 3,
  sellOutAwareness: 0.005,
  wordOfMouthWeight: 2,
};

export const hasDutyFree = (s: Pick<GameState, 'regionId' | 'siteId'>) => !!siteOf(s).dutyFree;

/** 면세 채널 병당 소비자가 — 주세·부가세 없음 */
export const dutyFreeConsumerPrice = (p: Pick<Product, 'price'>) => p.price * DUTY_FREE.markup;

/** 숙성 한정판 보너스 — 숙성 연수 구간별, 연수 표기가 없는 제품은 1 */
export function dutyFreeAgedAppeal(ageYears: number | null | undefined): number {
  if (ageYears == null) return 1;
  return DUTY_FREE.agedTiers.find((t) => ageYears >= t.years)?.appeal ?? 1;
}

/** 면세 한정판 매력도 배수 = (입지 원료 기념품 보너스 또는 숙성 한정판 보너스) × 연속 완판 보너스 */
export function dutyFreeEditionAppeal(p: Pick<Product, 'dutyFreeOnly' | 'localIngredient' | 'dfEdition' | 'ageYears'>): number {
  if (!p.dutyFreeOnly) return 1;
  const streak = Math.min(p.dfEdition?.streak ?? 0, DUTY_FREE.maxStreak);
  const base = p.localIngredient ? DUTY_FREE.localAppeal : dutyFreeAgedAppeal(p.ageYears);
  return base * (1 + DUTY_FREE.streakAppeal * streak);
}

/** 면세 전용 한정판 권장 출고가 — 면세 기준가에 맞춘 면세 소비자가 ÷ 면세점 마진 */
export function dutyFreeSuggestedPrice(region: RegionDef, category: ProductCategory, bottleMl: number, quality: number, ageFactor: number, abv: number): number {
  const consumer = refPricePerL(region, category, abv) * DUTY_FREE.refFactor * (bottleMl / 1000) * Math.sqrt(Math.max(quality, 20) / 60) * ageFactor;
  return Math.round(Math.min(consumer, DUTY_FREE.maxBottlePrice) / DUTY_FREE.markup / 100) * 100;
}

/**
 * 면세 채널 수요(병) — 국내 기준가의 60%를 기준으로, 주세·부가세 없이. appealOf는 market.appeal (순환 참조를 피하려고 주입)
 */
export function dutyFreeDemand(s: GameState, p: Product, sameCategoryCount: number, monthOfYear: number, appealOf: (p: Product) => number, coverage: number): number {
  const site = siteOf(s);
  if (!site.dutyFree) return 0;
  const region = regionOf(s);
  const base = DUTY_FREE.market[p.category] ?? 0;
  const consumer = dutyFreeConsumerPrice(p);
  if (base <= 0 || consumer > DUTY_FREE.maxBottlePrice) return 0;
  const marketL = (base * 9 / 12) * site.dutyFree.seasonality[monthOfYear - 1]! * (s.world.trend[p.category] ?? 1) * mod(s, 'dutyfree');
  // 면세점 입점은 지역 상품 진열이 기본 → 영업 커버리지의 영향이 작다
  const reach = (s.commerce.awareness * (0.3 + 0.5 * coverage) * DUTY_FREE.shareCap) / Math.sqrt(Math.max(1, sameCategoryCount));
  const bottleL = p.bottleMl / 1000;
  const ref = refPricePerL(region, p.category, p.abv) * DUTY_FREE.refFactor;
  const priceFactor = Math.pow(consumer / bottleL / ref, -region.market[p.category].elasticity);
  return (marketL * reach * appealOf(p) * priceFactor) / bottleL;
}

export const liveDutyFreeEditions = (s: GameState) => s.commerce.products.filter((p) => p.dutyFreeOnly && p.stockBottles > 0);

/** 면세 한정판을 새로 낼 수 없는 사유 (전용 매대 1칸) — 없으면 null */
export function dutyFreeSlotBlocker(s: GameState): string | null {
  const live = liveDutyFreeEditions(s);
  if (live.length < DUTY_FREE.slots) return null;
  const p = live[0]!;
  return `면세 전용 매대는 ${DUTY_FREE.slots}칸입니다 — 지금 판(${p.dfEdition ? `Vol.${p.dfEdition.vol} ` : ''}${p.name})이 다 팔리거나 국내 매대로 넘어간 뒤 낼 수 있습니다`;
}

/** 다음에 낼 면세 한정판의 판 번호와 연속 완판 수 */
export function nextDutyFreeEdition(s: GameState): { vol: number; streak: number } {
  const d = s.site.dfSeries;
  return { vol: (d?.vol ?? 0) + 1, streak: d?.streak ?? 0 };
}

/** 월말: 면세 한정판 완판·국내 이관 판정 */
export function resolveDutyFreeEditions(s: GameState, report: MonthReport): void {
  for (const p of s.commerce.products) {
    const ed = p.dfEdition;
    if (!ed || ed.done) continue;
    const months = s.month - p.createdMonth + 1;
    const series = (s.site.dfSeries ??= { vol: ed.vol, streak: 0 });
    if (p.stockBottles <= 0) {
      ed.done = true;
      if (months <= DUTY_FREE.sellOutMonths) {
        series.streak = Math.min(series.streak + 1, DUTY_FREE.maxStreak);
        s.commerce.awareness = clamp(s.commerce.awareness + DUTY_FREE.sellOutAwareness, 0.001, 0.95);
        report.events.push(`면세 한정판 Vol.${ed.vol} 완판`);
        report.notes.push(`면세 한정판 Vol.${ed.vol} ${months}개월 만에 완판 — 인지도 +${(DUTY_FREE.sellOutAwareness * 100).toFixed(1)}%p, 다음 판 매력도 +${Math.round(series.streak * DUTY_FREE.streakAppeal * 100)}% (연속 ${series.streak}회)`);
      } else {
        report.notes.push(`면세 한정판 Vol.${ed.vol} 판매 종료 (${months}개월) — ${DUTY_FREE.sellOutMonths}개월을 넘겨 완판 보너스 없음`);
      }
    } else if (p.dutyFreeOnly && months >= DUTY_FREE.returnMonths) {
      ed.done = true;
      p.dutyFreeOnly = false;
      series.streak = 0;
      report.events.push(`면세 한정판 Vol.${ed.vol} 국내 이관`);
      report.notes.push(`면세 한정판 Vol.${ed.vol}이 ${DUTY_FREE.returnMonths}개월 안에 다 팔리지 않아 국내 매대로 넘어갔습니다 (남은 ${p.stockBottles.toLocaleString()}병, 연속 완판 기록 초기화 — 국내 출고가를 확인하세요)`);
    }
  }
}

// ───────────── 재고 담보대출 (홋카이도, 결정 #90) ─────────────

/** 담보 가치 = 숙성 중인 몰트·그레인 원액의 현물 시가 (오너십 캐스크 제외) */
export function inventoryCollateral(s: GameState): number {
  return s.inventory.casks.reduce((t, c) => t + (c.contents && !c.owner && isBulkKind(c.contents) ? c.contents.volumeL * c.contents.abv * bulkValuePerLPA(s, c.contents) : 0), 0);
}

export const inventoryLtv = (s: Pick<GameState, 'regionId' | 'siteId'>) => siteOf(s).inventoryLtv ?? 0;

const isInventoryLoan = (offerId: string) => LOAN_OFFERS.find((o) => o.id === offerId)?.collateral === 'inventory';

/** 지금 더 빌릴 수 있는 재고 담보대출 한도 */
export function inventoryLoanRoom(s: GameState): number {
  const used = s.finance.loans.filter((l) => isInventoryLoan(l.offerId)).reduce((t, l) => t + l.balance, 0);
  return Math.max(0, Math.floor((inventoryCollateral(s) * inventoryLtv(s) - used) / 1_000_000) * 1_000_000);
}

/** 월말: 재고 시가가 떨어져 대출 잔액이 담보 한도의 110%를 넘으면 초과분을 즉시 상환 (추가 담보 요구) */
export function inventoryMarginCall(s: GameState, report: MonthReport): number {
  const loans = s.finance.loans.filter((l) => isInventoryLoan(l.offerId));
  if (!loans.length) return 0;
  const limit = inventoryCollateral(s) * inventoryLtv(s);
  const balance = loans.reduce((t, l) => t + l.balance, 0);
  if (balance <= limit * 1.1) return 0;
  let excess = Math.round(balance - limit);
  for (const l of loans) {
    const pay = Math.min(l.balance, excess);
    l.balance -= pay;
    excess -= pay;
  }
  const paid = Math.round(balance - limit) - excess;
  report.notes.push(`재고 시가 하락 — 담보대출 추가 상환 요구 ${paid.toLocaleString()}원`);
  return paid;
}
