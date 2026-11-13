import { isWhiskyCategory, lotCategory, suggestedPrice, whiskyMinMonths } from './blending';
import { lotQuality } from './bulk';
import { BOTTLING_LABOR_PER_BOTTLE, packagingCost } from './content/market';
import { regionOf } from './content/regions';
import { emptyCask, vesselMaterial } from './maturation';
import { ledgerOf, scaleLedger, splitLedger } from './ledger';
import { addLot, sellFromLots } from './lots';
import type { Cask, GameState, MonthReport, SpiritLot } from './types';

// ───────────── 핸드필 존 (#233, 2026-11-10 오너 요청 — 비지터 센터 확장 중 PROD 몫) ─────────────
// 숙성고 한쪽에 통 하나를 내놓고, 비지터 센터 방문객이 직접 병에 담아 이름·날짜를 적어 가는 한정판.
// 플레이어가 위스키 표기가 되는 자사 통 1개를 "핸드필 전용"으로 지정한다 → 매달 방문객의 일부가 500ml 캐스크 스트렝스로 사 간다.
// 값은 같은 통을 병입했을 때 권장 출고가의 약 2배(중간 유통 없음·한정판) — 대신 그 통은 플래그십·병입·IB 입찰에 쓸 수 없게 소진된다.
// 비지터 센터가 없으면 손님이 없다(설비도 베이직 투어가 있어야 지을 수 있다). 기프트 샵·판매 공식 확장은 MKT 몫

/** 수치 `[튜닝]` — 단계 T에서 본다 */
export const HANDFILL = {
  facilityId: 'handfill_zone',
  /** 방문객 중 핸드필 병을 사는 비율 */
  buyRate: 0.04,
  bottleMl: 500,
  /** 같은 통·같은 도수로 병입했을 때 권장 출고가(500ml) 대비 — 증류소 직판·한정판 */
  priceFactor: 2.0,
  expense: '핸드필 병·라벨',
} as const;

export const hasHandfillZone = (s: GameState) => s.production.equipment.some((e) => e.catalogId === HANDFILL.facilityId && e.readyMonth <= s.month);
export const handfillCask = (s: GameState): (Cask & { contents: SpiritLot }) | undefined =>
  s.inventory.casks.find((c): c is Cask & { contents: SpiritLot } => !!c.handfill && !!c.contents);

/** 이 통을 핸드필로 지정할 수 없는 이유 — 되면 null. 위스키 표기가 되는 자사 나무 통만 */
export function handfillBlocker(s: GameState, c: Cask): string | null {
  const l = c.contents;
  if (!l) return '빈 통입니다';
  if (vesselMaterial(c) !== 'wood') return '나무 통만 쓸 수 있습니다';
  if (l.kind !== 'malt' && l.kind !== 'grain') return '몰트·그레인 위스키 통만 쓸 수 있습니다';
  if (l.sourced) return '매입 원액 통은 증류소 한정판으로 낼 수 없습니다';
  if (c.owner) return '고객 소유 통입니다';
  if (c.contaminationKnown) return '오염이 확인된 통입니다';
  const min = whiskyMinMonths(regionOf(s).whisky);
  if (l.oakMonths < min) return `위스키 숙성 기간(${min}개월)을 채우지 않았습니다`;
  return null;
}

/** 핸드필 한 병 값(원, 순수입) — 이 통 그대로(캐스크 스트렝스) 500ml로 병입했을 때의 권장 출고가 × 배수. quality는 화면이면 추정 품질, 시뮬레이션이면 참값 */
export function handfillPrice(s: GameState, lot: SpiritLot, quality: number): number {
  const region = regionOf(s);
  const cat = lotCategory(lot, region.whisky);
  const base = suggestedPrice(region, isWhiskyCategory(cat) ? cat : 'whisky', HANDFILL.bottleMl, quality, lot.oakMonths, lot.abv);
  return Math.round((base * HANDFILL.priceFactor) / 100) * 100;
}

/** 한 병 원가(병·라벨·인건비) — 원액은 통에서 나간다 */
export const handfillBottleCost = () => packagingCost('standard', HANDFILL.bottleMl) + BOTTLING_LABOR_PER_BOTTLE;

/** 방문객 수 → 이번 달 핸드필 병 수(통에 남은 만큼) */
export function handfillBottles(visitors: number, lot: SpiritLot): number {
  return Math.max(0, Math.min(Math.round(visitors * HANDFILL.buyRate), Math.floor(lot.volumeL / (HANDFILL.bottleMl / 1000))));
}

/**
 * F3 판매 사건 6(MKT, 결정 #318): 담은 병을 그 통 하나로 된 로트로 만들고 바로 cellar_door 유상 출고로 기록한다 — 로트는 같은 호출에서 다 팔려 남지 않는다.
 * 제품이 없는 판매라 로트의 productId는 `handfill:<통 id>`(가상 제품 — F4 결과 화면이 접두로 구분). 원장은 담은 몫(splitLedger), 적격은 지금 통 기준(caskEligibility — F4가 로트 기준으로 바꾼다).
 * **가드(ARCH #487 사후 검토):** 양의 대가가 아니면(`price ≤ 0`) `sellFromLots`가 사건도 차감도 하지 않아 가상 제품 로트가 남고 "제품 없음" 불변식 오류가 된다 → 그때는 로트를 만들지 않는다
 */
export function recordHandfillSale(s: GameState, report: MonthReport, cask: Cask & { contents: SpiritLot }, bottles: number, price: number): void {
  if (!(bottles > 0) || !(price > 0)) return;
  const soldL = (bottles * HANDFILL.bottleMl) / 1000;
  const pid = `handfill:${cask.id}`;
  addLot(s, pid, bottles, { components: splitLedger(ledgerOf(s, cask.contents), Math.min(1, soldL / cask.contents.volumeL))[0], eligibleAtBottling: caskEligibility(s, cask).eligible });
  sellFromLots(s, report, pid, bottles, { kind: 'cellar_door', settlement: 'cash', unitPrice: price });
}

/** 틱 6단계(운영) — 관광(runTourism) 바로 뒤: 이번 달 방문객이 지정 통에서 담아 간다. 통이 비면 지정이 풀린다 */
export function runHandfill(s: GameState, report: MonthReport): void {
  if (!hasHandfillZone(s)) return;
  const cask = handfillCask(s);
  if (!cask) return;
  const bottles = handfillBottles(report.visitors ?? 0, cask.contents);
  if (bottles <= 0) return;
  const price = handfillPrice(s, cask.contents, lotQuality(cask.contents));
  const revenue = bottles * price;
<<<<<<< HEAD
  // F3 판매 사건 6(MKT, 결정 #318): 담은 병을 그 통 하나로 된 로트로 만들고 바로 cellar_door 유상 출고로 기록한다 — 로트는 같은 호출에서 다 팔려 남지 않는다.
  // 제품이 없는 판매라 로트의 productId는 `handfill:<통 id>`. 원장은 담은 몫(splitLedger), 적격은 addLot이 그 원장(로트 계보)으로 판정한다(F4)
  { const soldL = (bottles * HANDFILL.bottleMl) / 1000; const pid = `handfill:${cask.id}`;
    addLot(s, pid, bottles, { components: splitLedger(ledgerOf(s, cask.contents), Math.min(1, soldL / cask.contents.volumeL))[0] });
    sellFromLots(s, report, pid, bottles, { kind: 'cellar_door', settlement: 'cash', unitPrice: price }); }
=======
  recordHandfillSale(s, report, cask, bottles, price);
>>>>>>> origin/main
  const cost = bottles * handfillBottleCost();
  s.finance.cash += revenue - cost;
  report.tourismRevenue = (report.tourismRevenue ?? 0) + revenue;
  report.expenses[HANDFILL.expense] = (report.expenses[HANDFILL.expense] ?? 0) + cost;
  const remain = cask.contents.volumeL - (bottles * HANDFILL.bottleMl) / 1000;
  const idx = s.inventory.casks.indexOf(cask);
  if (remain < 1) {
    const empty = emptyCask(cask);
    delete empty.handfill;
    s.inventory.casks[idx] = empty;
    report.notes.push(`핸드필 ${bottles}병 (${revenue.toLocaleString()}원) — 통 ${cask.id}가 비었다. 다음 핸드필 통을 지정하세요`);
  } else {
    // F2 원장 지점 19(MKT): 담아 판 몫은 원가와 함께 나간다(R4 leak) — 원장이 있는 로트만, 비율은 남은 L ÷ 전체 L
    const lot = cask.contents;
    s.inventory.casks[idx] = { ...cask, contents: { ...lot, volumeL: remain, ...(lot.components?.length ? { components: scaleLedger(lot.components, remain / lot.volumeL, 'leak') } : {}) } };
    report.notes.push(`핸드필 ${bottles}병 (${revenue.toLocaleString()}원) — 통 ${cask.id} 남은 ${Math.round(remain)}L`);
  }
}
