import { CASKS, EQUIPMENT, type WarehouseType } from './content/catalog';
import { siteOf } from './content/regions';
import { clamp } from './flavor';
import { type Climate, emptyCask, matureVessel, MIN_CASK_VOLUME_L, recordLoss, restLot, vesselMaterial } from './maturation';
import { advanceWood, lpaOf, scaleLedger } from './ledger';
import { rngFor } from './rng';
import type { Cask, GameState, MonthReport } from './types';
import { staffOf, ownsFacility } from './util';
import { weatherOffset } from './weather';
import { mod } from './modifiers';
import type { TickContext } from './tick';
import { autoSample } from './blendTable';
import { lotQuality } from './bulk';
import { protectedCaskIds } from './tags';
import { PROD_TUNING } from './prodTuning';

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
  // 외기 = 입지 평년값 + 이번 달 기상 이상치·이벤트 충격 (결정 #120)
  const w = warehousesOf(s).find((x) => x.id === cask?.slot?.w) ?? warehousesOf(s)[0]!;
  return climateIn(s, w, cask?.slot?.tier ?? 0, monthOfYear, weatherOffset(s));
}

/** 칸 기후 식 한 곳 — slotClimate(이번 달 기상 포함)와 slotMeanTempC(평년값만)가 함께 쓴다 */
function climateIn(s: GameState, w: WarehouseView, tier: number, monthOfYear: number, off: { tempC: number; humidity: number }): Climate {
  const site = siteOf(s);
  const to = site.tempC[monthOfYear - 1]! + off.tempC;
  const ho = clamp(site.humidity[monthOfYear - 1]! + off.humidity, 20, 100);
  const tm = site.tempC.reduce((a, b) => a + b, 0) / 12;
  const tierFrac = w.tiers > 1 ? clamp(tier / (w.tiers - 1), 0, 1) : 0;
  if (w.type === 'dunnage') return { tempC: tm + 0.6 * (to - tm) + 0.3 * tierFrac, humidity: Math.min(95, ho + 6) };
  const strat = 2 + 0.25 * Math.max(0, to - 10);
  return { tempC: tm + 0.95 * (to - tm) + 0.8 + (tierFrac - 0.3) * strat, humidity: clamp(ho + 4 - 14 * tierFrac, 30, 95) };
}

/** 칸의 연평균 온도 — 입지 평년값만(이번 달 기상 이상치 없음). "서늘한 칸" 순위는 이 값 하나로 정해 달마다 뒤집히지 않는다 (#290 B1-3) */
export function slotMeanTempC(s: GameState, w: WarehouseView, tier: number): number {
  let t = 0;
  for (let m = 1; m <= 12; m++) t += climateIn(s, w, tier, m, { tempC: 0, humidity: 0 }).tempC;
  return t / 12;
}

/**
 * 보호 태그 통은 서늘한 칸으로 (#290 B1-3, P-PROD-50 — 오너 2026-11-12: 대상 = 보호 태그 통 전체, 매달 빈 서늘한 칸으로 옮김).
 * 매달 숙성 전에 보호 통(플래그십 예비 포함)을 오크 긴 순으로 보며, 지금 칸보다 연평균이 낮은 칸 중 가장 서늘한 **빈 자리**로 옮긴다.
 * 다른 통을 밀어내지 않는다(빈 자리만). 한 달 `PROD_TUNING.coolSlotMovesPerMonth`통까지, 비용 없음. 칸이 아직 없는 보호 통은 여기서 칸을 받는다.
 * 보호 통이 없으면 아무것도 바꾸지 않는다(샌드박스 판·태그를 안 쓴 판의 출력 그대로). 숙성 연속성은 그대로 — 통은 같고 기후만 바뀐다
 */
export function moveProtectedToCoolSlots(s: GameState, report: MonthReport, index: SlotIndex = new SlotIndex(s)): number {
  const cap = PROD_TUNING.coolSlotMovesPerMonth;
  if (cap <= 0) return 0;
  const prot = protectedCaskIds(s);
  if (!prot.size) return 0;
  const ws = index.warehouses;
  const ranked = ws.flatMap((w) => Array.from({ length: w.tiers }, (_, tier) => ({ w, tier, t: slotMeanTempC(s, w, tier) })))
    .sort((a, b) => a.t - b.t || ws.indexOf(a.w) - ws.indexOf(b.w) || a.tier - b.tier);
  const tempOf = new Map(ranked.map((x) => [`${x.w.id}:${x.tier}`, x.t]));
  const casks = s.inventory.casks.filter((c) => c.contents && prot.has(c.id))
    .sort((a, b) => b.contents!.oakMonths - a.contents!.oakMonths || a.id.localeCompare(b.id));
  let moved = 0;
  for (const c of casks) {
    if (moved >= cap) break;
    const cur = c.slot ? tempOf.get(`${c.slot.w}:${c.slot.tier}`) : undefined;
    const to = ranked.find((x) => (cur === undefined || x.t < cur - 1e-9) && index.count(x.w.id, x.tier) < x.w.perTier);
    if (!to) continue;
    if (c.slot && cur !== undefined) index.add(c.slot.w, c.slot.tier, -1);
    c.slot = { w: to.w.id, tier: to.tier };
    index.add(to.w.id, to.tier, 1);
    moved++;
  }
  if (moved) report.notes.push(`보호 통 ${moved}개를 숙성고의 더 서늘한 칸으로 옮겼다(장기 숙성 — 증발이 줄고 천천히 익는다)`);
  return moved;
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

export function runContamination(s: GameState, report: MonthReport, monthOfYear: number, climateOf: (cask: Cask) => Climate = climateTable(s, monthOfYear)): void {
  const qc = staffOf(s, 'warehouse');
  const control = Math.max(0, ...qc.map((x) => x.stats.b));
  const observe = Math.max(0, ...qc.map((x) => x.stats.a));
  const dehumid = ownsFacility(s, 'facility_dehumid') ? 0.5 : 1;
  for (const c of s.inventory.casks) {
    if (!c.contents) continue;
    // 통 단위 난수 (#290 B1-8 S3) — 통 × 필 수. 통 배열 순서·다른 통의 유무가 이 통의 오염·발견을 바꾸지 않는다
    const rng = rngFor(s.seed, s.month, `contamination:${c.id}:${c.fills}`);
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
  // 자동 샘플 (#177) — 이번 달 직접 뜬 샘플이 없으면 숙성 전에 오래 안 뜬 통부터. 시나리오 게임만
  autoSample(s, report, lotQuality);
  // 보호 통 → 서늘한 칸 (#290 B1-3) — 숙성 전에 옮겨 이번 달 숙성부터 새 칸 기후를 쓴다
  moveProtectedToCoolSlots(s, report, ctx.slots);
  const { control, observe, diligence } = ctx.warehouse;
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
    // F2 원장 지점 7·8: 숙성 1개월 — 증발은 모든 구성 원액에 같은 비율로 줄고 원가는 남는다(보존). **나무 통만** 목재 개월 +1(R3 — 옹기·스테인리스는 그대로)
    const before = cask.contents;
    const oldLPA = lpaOf(before);
    const newLPA = lpaOf(next.contents!);
    if (before.components?.length) {
      const aged = vesselMaterial(cask) === 'wood' ? advanceWood(before.components) : before.components;
      next = { ...next, contents: { ...next.contents!, components: scaleLedger(aged, oldLPA > 0 ? newLPA / oldLPA : 0, 'preserve') } };
    }
    recordLoss(report, 'evaporation', oldLPA - newLPA); // F2 R5
    // 통 단위 난수 (#290 B1-8 S4) — 통 × 필 수. 누수 추첨이 통 배열 순서에 매이지 않는다
    const rng = rngFor(s.seed, s.month, `maturation:${cask.id}:${cask.fills}`);
    // 누수: 성실 스탯이 확률을, 관찰 스탯이 손실량을 줄임
    if (rng.chance(0.002 * (1 - diligence / 150) * (CASKS[cask.typeId].leakFactor ?? 1))) {
      const lossShare = rng.range(0.03, 0.08) * (1 - observe / 150);
      const c = next.contents!;
      lost += c.volumeL * lossShare;
      // F2 원장 지점 9: 누수 — 같은 비율로 줄고 원가는 남는다(보존)
      next = { ...next, contents: { ...c, volumeL: c.volumeL * (1 - lossShare), costPerLPA: c.costPerLPA / (1 - lossShare), ...(c.components?.length ? { components: scaleLedger(c.components, 1 - lossShare, 'preserve') } : {}) } };
      recordLoss(report, 'leak', lpaOf(c) * lossShare);
      report.notes.push(`캐스크 ${cask.id} 누수 — ${(lossShare * 100).toFixed(1)}% 손실`);
    }
    // 1L 아래로 줄어든 통은 비운다(C-PROD-1) — 병입·핸드필의 "1L 미만이면 비움"과 같은 기준. 샘플(0.1L/회)·누수·증발이 작은 잔량을 0L까지 깎으면
    // 증발식이 0÷0으로 도수 NaN을 냈다. 남은 원액은 잃는다(통값·숙성고 자리는 돌아온다)
    if (next.contents && next.contents.volumeL < MIN_CASK_VOLUME_L) {
      report.notes.push(`캐스크 ${cask.id} 원액이 ${next.contents.volumeL.toFixed(2)}L로 줄어 비웠다(1L 미만)`);
      lost += next.contents.volumeL;
      recordLoss(report, 'below_min', lpaOf(next.contents), next.contents.costPerLPA * lpaOf(next.contents)); // F2 원장 지점 10: 소멸(원장은 원액과 함께 사라진다)
      return emptyCask(next);
    }
    return next;
  });
  s.inventory.lots = s.inventory.lots.map(restLot);
  runContamination(s, report, ctx.monthOfYear, ctx.climateOf);
  report.angelsShareL = lost;
}
