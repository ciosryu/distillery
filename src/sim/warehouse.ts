import { CASKS, EQUIPMENT, type WarehouseType } from './content/catalog';
import { siteOf } from './content/regions';
import { clamp } from './flavor';
import { type Climate, matureVessel, restLot } from './maturation';
import { type Rng, rngFor } from './rng';
import type { Cask, GameState, MonthReport } from './types';
import { staffOf, ownsFacility } from './util';
import { weatherOffset } from './weather';
import { mod } from './modifiers';
import type { TickContext } from './tick';
import { autoSample } from './blendTable';
import { lotQuality } from './bulk';

// 숙성고: 공간·칸 배정·내부 기후·로테이션·오염 QC·월 숙성 단계(틱 3) (파트 PROD, 결정 #144 — 파일 쪼개기로 옮겨 왔다. 규칙·수치 불변)

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


/** 3 숙성 (틱 단계 본문 — step.ts가 부른다) */
export function runMaturation(s: GameState, report: MonthReport, ctx: TickContext): void {
  // 자동 샘플 (P-PROD-11) — 이번 달 직접 뜬 샘플이 없으면 숙성 전에 오래 안 뜬 통부터. 시나리오 게임만
  autoSample(s, report, lotQuality);
  const { control, observe, diligence } = ctx.warehouse;
  const rng = rngFor(s.seed, s.month, 'maturation');
  const evap = mod(s, 'evaporation');
  let lost = 0;
  s.inventory.casks = s.inventory.casks.map((cask) => {
    if (!cask.contents) return cask;
    // 숙성고 내부 기후: 숙성고 종류·단에 따라 다르다 (결정 #65) — 칸별 기후표 조회
    if (!cask.slot) assignSlot(s, cask, undefined, ctx.slots);
    const res = matureVessel(cask, ctx.climateOf(cask), { control, evaporationFactor: evap });
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
  runContamination(s, report, rngFor(s.seed, s.month, 'contamination'), ctx.monthOfYear, ctx.climateOf);
  report.angelsShareL = lost;
}
