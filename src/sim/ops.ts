import { CASK_MARKET, CASKS, EQUIPMENT, type WarehouseType } from './content/catalog';
import { regionOf, siteOf } from './content/regions';
import { clamp } from './flavor';
import type { Climate } from './maturation';
import type { Rng } from './rng';
import type { Cask, GameState, MonthReport, Staff } from './types';
import { staffOf } from './util';
import { weatherOffset } from './weather';

// 운영 시스템 (PRD v1.0): 숙성고 공간·내부 기후, 소매 처리 역량, 비지터 센터, 인사 생애주기, 캐스크 오염, 사무직, 투자. 수치 [튜닝]

// ───────────── 숙성고 공간 ─────────────

export interface WarehouseView { id: string; nameKo: string; type: WarehouseType; tiers: number; capacity: number; perTier: number }

/** 기본 숙성고(랙 6단) + 완공된 증설 숙성고 */
export function warehousesOf(s: GameState): WarehouseView[] {
  const list: WarehouseView[] = [{ id: 'W0', nameKo: '기본 숙성고 (랙 6단)', type: 'racked', tiers: 6, capacity: s.inventory.warehouseBase, perTier: Math.ceil(s.inventory.warehouseBase / 6) }];
  for (const e of s.production.equipment) {
    const d = EQUIPMENT[e.catalogId];
    if (d?.kind === 'warehouse' && e.readyMonth <= s.month) list.push({ id: e.id, nameKo: d.nameKo, type: d.warehouseType, tiers: d.tiers, capacity: d.casks, perTier: Math.ceil(d.casks / d.tiers) });
  }
  return list;
}

export function slotOccupancy(s: GameState, wId: string, tier: number): number {
  return s.inventory.casks.filter((c) => c.contents && c.slot?.w === wId && c.slot.tier === tier).length;
}

/**
 * 숙성고 칸(숙성고 × 단) 점유 인덱스 — 자리 배정을 캐스크마다 전체 재계산(O(n))하지 않게 한 번 세어 두고 갱신한다 (architecture P1).
 * 원액이 든 캐스크만 센다(slotOccupancy와 같은 기준)
 */
export class SlotIndex {
  readonly warehouses: WarehouseView[];
  private readonly counts = new Map<string, number>();
  constructor(s: GameState) {
    this.warehouses = warehousesOf(s);
    for (const c of s.inventory.casks) if (c.contents && c.slot) this.add(c.slot.w, c.slot.tier, 1);
  }
  count(w: string, tier: number): number { return this.counts.get(`${w}:${tier}`) ?? 0; }
  add(w: string, tier: number, d: number): void { const k = `${w}:${tier}`; this.counts.set(k, (this.counts.get(k) ?? 0) + d); }
}

/** 통입한 캐스크의 자리를 정한다: 지정한 숙성고(없으면 더니지 우선) → 아래 단부터.
 *  여러 캐스크를 연달아 배정할 때는 같은 index를 넘겨 O(1)로 (넘기지 않으면 매번 새로 센다) */
export function assignSlot(s: GameState, cask: Cask, preferW?: string, index: SlotIndex = new SlotIndex(s)): void {
  const ws = index.warehouses;
  if (cask.slot && ws.some((w) => w.id === cask.slot!.w)) return;
  const order = [...ws].sort((a, b) => (a.id === preferW ? -1 : b.id === preferW ? 1 : 0) || (a.type === 'dunnage' ? -1 : 0) - (b.type === 'dunnage' ? -1 : 0));
  for (const w of order) for (let t = 0; t < w.tiers; t++) {
    if (index.count(w.id, t) < w.perTier) { cask.slot = { w: w.id, tier: t }; if (cask.contents) index.add(w.id, t, 1); return; }
  }
  cask.slot = { w: 'W0', tier: 5 };
  if (cask.contents) index.add('W0', 5, 1);
}

/**
 * 숙성고 내부 기후 (결정 #65 내부 온도 보정)
 * - 더니지: 두꺼운 석벽·흙바닥 → 연교차가 외기의 60%로 줄고, 단 차이가 거의 없으며 습하다
 * - 랙: 철골·얇은 외벽 → 연평균 +0.8°C, 위로 갈수록 덥고 건조하다. 성층 = 2 + 0.25 × max(0, 외기 − 10)°C
 */
export function slotClimate(s: GameState, cask: Cask | null, monthOfYear: number): Climate {
  const site = siteOf(s);
  // 외기 = 입지 평년값 + 이번 달 기상 이상치·이벤트 충격 (결정 #120)
  const off = weatherOffset(s);
  const to = site.tempC[monthOfYear - 1]! + off.tempC;
  const ho = clamp(site.humidity[monthOfYear - 1]! + off.humidity, 20, 100);
  const tm = site.tempC.reduce((a, b) => a + b, 0) / 12;
  const w = warehousesOf(s).find((x) => x.id === cask?.slot?.w) ?? warehousesOf(s)[0]!;
  const tierFrac = w.tiers > 1 ? clamp((cask?.slot?.tier ?? 0) / (w.tiers - 1), 0, 1) : 0;
  if (w.type === 'dunnage') return { tempC: tm + 0.6 * (to - tm) + 0.3 * tierFrac, humidity: Math.min(95, ho + 6) };
  const strat = 2 + 0.25 * Math.max(0, to - 10);
  return { tempC: tm + 0.95 * (to - tm) + 0.8 + (tierFrac - 0.3) * strat, humidity: clamp(ho + 4 - 14 * tierFrac, 30, 95) };
}

/**
 * 이번 달 숙성고 기후표 — 칸(숙성고 × 단)마다 한 번만 계산하고 캐스크는 조회만 한다 (architecture P4, 틱 컨텍스트).
 * 값은 slotClimate와 똑같다(같은 함수로 계산). 표에 없는 칸은 slotClimate로 바로 계산한다
 */
export function climateTable(s: GameState, monthOfYear: number): (cask: Cask) => Climate {
  const table = new Map<string, Climate>();
  for (const w of warehousesOf(s)) for (let t = 0; t < w.tiers; t++) table.set(`${w.id}:${t}`, slotClimate(s, { slot: { w: w.id, tier: t } } as Cask, monthOfYear));
  return (cask) => (cask.slot && table.get(`${cask.slot.w}:${cask.slot.tier}`)) || slotClimate(s, cask, monthOfYear);
}

/** 숙성고 매니저(QC) 1명이 한 달에 옮길 수 있는 캐스크 수 */
export const rotationCapacity = (s: GameState) => staffOf(s, 'warehouse').reduce((t, x) => t + Math.round(40 * (0.5 + x.stats.c / 100)), 0);
export const ROTATION_COST_PER_CASK = 15_000;

/** 로테이션: 최상단 ↔ 최하단처럼 단을 뒤집는다 (원액이 든 캐스크만, QC 노동 소모) */
export function rotateWarehouse(s: GameState, wId: string): { moved: number; error?: string } {
  const w = warehousesOf(s).find((x) => x.id === wId);
  if (!w) return { moved: 0, error: '숙성고가 없습니다' };
  if (w.tiers < 2) return { moved: 0, error: '단이 하나뿐입니다' };
  const casks = s.inventory.casks.filter((c) => c.contents && c.slot?.w === wId);
  if (!casks.length) return { moved: 0, error: '옮길 캐스크가 없습니다' };
  const cap = rotationCapacity(s) - s.inventory.rotatedThisMonth;
  if (!staffOf(s, 'warehouse').length) return { moved: 0, error: '숙성고 매니저(QC)가 없습니다' };
  if (casks.length > cap) return { moved: 0, error: `이번 달 로테이션 여력 부족 (${cap}개 남음, 필요 ${casks.length}개)` };
  for (const c of casks) c.slot = { w: wId, tier: w.tiers - 1 - c.slot!.tier };
  s.inventory.rotatedThisMonth += casks.length;
  s.finance.cash -= casks.length * ROTATION_COST_PER_CASK;
  return { moved: casks.length };
}

// ───────────── 소매 처리 역량 (결정 #65) ─────────────

export const RETAIL = {
  /** 직원 없이도 처리하는 월 9L 케이스 */
  baseCases: 60,
  /** 영업 직원 1명당 + 네트워크 스탯 1당 — 네트워크 60이면 1명당 약 100케이스 (#72) */
  perSalesCases: 40,
  perNetworkCase: 1.0,
  /** 관리 효율 저하(#76): 영업 직원을 늘릴수록 추가 1명의 기여가 직전의 60%로 준다 (네트워크 높은 순으로 1.0, 0.6, 0.36, 0.22…) */
  staffEfficiencyDecay: 0.6,
  /** 네트워크 70↑ 영업 직원이 있으면 고급 유통망(B2B 온트레이드) 확보 → 역량 +30% */
  premiumNetwork: 70,
  premiumBonus: 0.3,
  /** 역량 초과분(최대 역량의 100%까지)은 할인·추가 수수료 채널 — 출고가 대비 수수료 */
  overflowFeeRate: 0.3,
  /** 고비용 채널로 팔 수 있는 양 = 역량 × 이 비율 (그 너머는 못 판다) */
  overflowShare: 1,
};

export const hasPremiumChannel = (s: GameState) => staffOf(s, 'sales').some((x) => x.stats.b >= RETAIL.premiumNetwork);

export function retailCapacityCases(s: GameState): number {
  const sales = [...staffOf(s, 'sales')].sort((a, b) => b.stats.b - a.stats.b);
  const base = RETAIL.baseCases + sales.reduce((t, x, i) => t + (RETAIL.perSalesCases + RETAIL.perNetworkCase * x.stats.b) * Math.pow(RETAIL.staffEfficiencyDecay, i), 0);
  return Math.round(base * (hasPremiumChannel(s) ? 1 + RETAIL.premiumBonus : 1));
}

/** 재고 적체: 6개월 넘게 팔 재고가 쌓이면 할인 이미지로 매력도가 떨어진다 (출시 6개월 후부터) */
export function overhangFactor(p: { stockBottles: number; salesEma?: number; createdMonth: number }, month: number): number {
  if (month - p.createdMonth < 6 || p.salesEma == null) return 1;
  const months = p.stockBottles / Math.max(1, p.salesEma);
  return months > 6 ? Math.max(0.6, Math.sqrt(6 / months)) : 1;
}

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
  const draw = TOUR_SEASON[monthOfYear - 1]! * tourismFactor(s) * clamp(0.6 + 0.8 * s.commerce.awareness + s.commerce.localBuzz, 0.4, 2);
  let visitors = 0;
  let revenue = 0;
  let buzz = 0;
  for (const t of tiers) {
    const v = Math.round(t.visitorsPerMonth * draw);
    visitors += v;
    revenue += v * t.spendPerVisitor;
    buzz += v * t.buzzQuality;
  }
  // 뉴메이크 한정판: 탱크의 몰트·그레인 원액을 쓴다
  let nmBottles = Math.floor(visitors * NEW_MAKE_BOTTLE.buyRate);
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
  s.commerce.awareness = clamp(s.commerce.awareness + 0.004 * s.commerce.localBuzz * (1 - s.commerce.awareness), 0.001, 0.95);
  report.visitors = visitors;
  report.tourismRevenue = revenue;
}

// ───────────── 인사: 에이징 커브·은퇴·부사수 ─────────────

export const RETIRE_AGE = 65;
export const ageOf = (x: Staff, month: number) => (x.ageAtHire ?? 40) + (month - x.hiredMonth) / 12;
/** 에이징 커브는 근속 기준 (#74): 근속 20년부터 스탯이 꺾이고 25년부터 더 빨라진다. 은퇴는 65세 */
export const AGING_TENURE_MONTHS = 240;
export const AGING_FAST_TENURE_MONTHS = 300;
export const tenureOf = (x: Staff, month: number) => Math.max(0, month - x.hiredMonth);

/** 마스터 디스틸러 = 부사수가 아닌 디스틸러 중 레벨이 가장 높고 가장 오래된 사람 */
export function masterDistiller(s: GameState): Staff | undefined {
  return staffOf(s, 'distiller').filter((x) => !x.apprenticeOf).sort((a, b) => b.level - a.level || a.hiredMonth - b.hiredMonth)[0];
}

/** 부사수가 하우스 스타일을 이어받으려면 최소 24개월 함께 일해야 한다 */
export const APPRENTICE_MONTHS = 24;

export function handleDeparture(s: GameState, leaving: Staff, notes: string[]): void {
  const master = masterDistiller(s);
  if (leaving.role !== 'distiller' || master?.id !== leaving.id) return;
  const heir = s.hr.staff.find((x) => x.apprenticeOf === leaving.id && s.month - x.hiredMonth >= APPRENTICE_MONTHS);
  if (heir) {
    heir.apprenticeOf = undefined;
    s.hr.houseStyle = Math.round(s.hr.houseStyle * 0.9);
    notes.push(`부사수 ${heir.name}이(가) 하우스 스타일을 이어받았습니다 (${s.hr.houseStyle})`);
  } else {
    if (s.hr.houseStyle > 0) notes.push(`부사수 없이 마스터 디스틸러가 떠나 하우스 스타일이 초기화됐습니다 (${Math.round(s.hr.houseStyle)} → 0)`);
    s.hr.houseStyle = 0;
  }
  for (const x of s.hr.staff) if (x.apprenticeOf === leaving.id) x.apprenticeOf = undefined;
}

export function runStaffLifecycle(s: GameState, report: MonthReport, rng: Rng): void {
  const master = masterDistiller(s);
  if (master) s.hr.houseStyle = clamp(s.hr.houseStyle + 0.4 * (master.stats.c / 60), 0, 100);
  for (const x of [...s.hr.staff]) {
    const age = ageOf(x, s.month);
    if (age >= RETIRE_AGE) {
      const notes: string[] = [];
      handleDeparture(s, x, notes);
      s.hr.staff = s.hr.staff.filter((y) => y.id !== x.id);
      report.notes.push(`${x.name} 은퇴 (${Math.floor(age)}세)`, ...notes);
      continue;
    }
    // 에이징 커브(근속 기준): 근속 20년부터 매달 12%, 25년부터 25% 확률로 스탯 1~2 하락
    const tenure = tenureOf(x, s.month);
    if (tenure >= AGING_TENURE_MONTHS && rng.chance(tenure >= AGING_FAST_TENURE_MONTHS ? 0.25 : 0.12)) {
      const k = rng.pick(['a', 'b', 'c'] as const);
      x.stats[k] = Math.max(10, x.stats[k] - rng.int(1, 2));
    }
  }
}

// ───────────── 숙성고 QC: 캐스크 오염 (TCA·곰팡이) ─────────────

export function runContamination(s: GameState, report: MonthReport, rng: Rng, monthOfYear: number, climateOf: (cask: Cask) => Climate = climateTable(s, monthOfYear)): void {
  const qc = staffOf(s, 'warehouse');
  const control = Math.max(0, ...qc.map((x) => x.stats.b));
  const observe = Math.max(0, ...qc.map((x) => x.stats.a));
  const dehumid = ownsFacility(s, 'facility_dehumid') ? 0.5 : 1;
  for (const c of s.inventory.casks) {
    if (!c.contents) continue;
    if (!c.contamination) {
      const h = climateOf(c).humidity;
      const pTca = 0.0005;
      const pMold = 0.002 * Math.max(0, h - 75) / 10 * dehumid;
      const k = 1 - 0.4 * (control / 100);
      if (rng.chance(pTca * k)) c.contamination = 'tca';
      else if (rng.chance(pMold * k)) c.contamination = 'mold';
      continue;
    }
    c.contents.flavor.musty = Math.min(40, (c.contents.flavor.musty ?? 0) + (c.contamination === 'tca' ? 1.5 : 1));
    if (!c.contaminationKnown && rng.chance(qc.length ? 0.25 + 0.5 * (observe / 100) : 0.03)) {
      c.contaminationKnown = true;
      report.notes.push(`QC: 캐스크 ${c.id}에서 ${c.contamination === 'tca' ? 'TCA(코르크·곰팡내)' : '곰팡이'} 오염 발견`);
    }
  }
}

export const ownsFacility = (s: GameState, id: string) => s.production.equipment.some((e) => e.catalogId === id && e.readyMonth <= s.month);

// ───────────── 사무직: 폐기물 유상 판매 계약 ─────────────

/** 사무직이 있으면 매달 확률로 농장 사료용 드래프·지게미 판매 계약을 맺는다. 단가 = 20 + 협상 × 0.4 (원/kg 원재료) */
export function runOffice(s: GameState, report: MonthReport, rng: Rng, mashKg: number): void {
  const office = staffOf(s, 'office');
  if (s.production.wasteContractPerKg === 0 && office.length && rng.chance(0.3)) {
    const best = Math.max(...office.map((x) => x.stats.b));
    s.production.wasteContractPerKg = Math.round(20 + best * 0.4);
    report.notes.push(`사무: 농장과 드래프·지게미 사료 판매 계약 체결 (원재료 kg당 ${s.production.wasteContractPerKg}원)`);
  }
  if (s.production.wasteContractPerKg > 0 && mashKg > 0) s.finance.cash += Math.round(mashKg * s.production.wasteContractPerKg);
}

/** 세무조사 방어율 = 사무직 세무 스탯 (최대 70% 감면) */
export const taxAuditDefense = (s: GameState) => 0.7 * (Math.max(0, ...staffOf(s, 'office').map((x) => x.stats.a)) / 100);

// ───────────── 자금 조달: 투자·캐스크 오너십 ─────────────

export interface InvestmentOffer { id: string; nameKo: string; amount: number; share: number; minMonth: number; maxMonth: number; note: string }
export const INVESTMENT_OFFERS: InvestmentOffer[] = [
  { id: 'angel', nameKo: '엔젤 투자', amount: 200_000_000, share: 0.1, minMonth: 0, maxMonth: 48, note: '초기 런웨이용. 지분 10%' },
  { id: 'seed_vc', nameKo: '시드 투자 (VC)', amount: 500_000_000, share: 0.25, minMonth: 12, maxMonth: 84, note: '지분 25%. 엑시트 압박은 후속(이사회 §8.2)' },
];

/** 캐스크 오너십 판매가 = 현물가 × (1.3 + 0.8 × 인지도) × (0.9 + 하우스 스타일/500). 고객은 8년 숙성 시점에 인도받는다 */
export const OWNERSHIP = { premiumBase: 1.3, premiumAwareness: 0.8, deliverAtMonths: 96, minDeliverWait: 12, oversellShare: 0.25, oversellAppeal: 0.9 };

export function ownershipOversold(s: GameState): boolean {
  const filled = s.inventory.casks.filter((c) => c.contents);
  return filled.length > 0 && filled.filter((c) => c.owner).length / filled.length > OWNERSHIP.oversellShare;
}

export function deliverOwnedCasks(s: GameState, report: MonthReport): void {
  const due = s.inventory.casks.filter((c) => c.owner && c.owner.deliverMonth <= s.month);
  for (const c of due) report.notes.push(`캐스크 오너십: ${c.owner!.name} 고객에게 캐스크 ${c.id} 인도`);
  if (due.length) s.inventory.casks = s.inventory.casks.filter((c) => !due.includes(c));
}

// ───────────── 캐스크 시장 ─────────────

export function usedCaskPrice(c: Cask): number {
  const def = CASKS[c.typeId];
  return Math.round(def.price * (CASK_MARKET.usedSaleBase + CASK_MARKET.usedSalePerActivity * Math.min(1, c.activity)) * (c.seasoning > 0.3 ? 1.2 : 1) / 1000) * 1000;
}
