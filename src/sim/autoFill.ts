import { PROD_HANDLERS } from './actions.prod';
import { vesselMaterial } from './maturation';
import type { AutoFillSettings, Cask, GameState, MonthReport, SpiritLot } from './types';

// ───────────── 자동 통입 (#239, 5차 MVP 플레이테스트 2026-11-10) ─────────────
// 5차 판: 82개월째 숙성 중인 통이 51개 중 3개 — 오너 "통입을 잊었고 귀찮았다". 자동 납품(#206)·자동 샘플(#207)과 같은 설정 줄.
// 켜 두면 정한 달마다 틱 맨 앞(생산 전 — 플레이어가 진행을 누르기 전에 통입한 것과 같은 때)에 탱크의 자사 몰트·그레인을
// 빈 나무 통에 넣는다. 수동 통입(fillCasks)과 같은 처리(같은 원가 배분·레어 판정·자리 배정)를 그대로 쓴다.
// 통입은 현금이 들지 않는다(통은 이미 산 것) — 빈 통이 모자라면 있는 만큼 넣고 메모를 남긴다. 봇은 쓰지 않는다

export const AUTO_FILL = { defaultEntryAbv: 0.635, everyMonths: [1, 3, 6] as const, minLotL: 20 } as const;

export const autoFillOn = (s: GameState): AutoFillSettings | null => s.inventory.autoFill ?? null;

/** 이번 달이 자동 통입하는 달인가 (매달·3·6개월마다 — 달 번호로 맞춘다) */
export const autoFillDue = (s: GameState, cfg: AutoFillSettings) => s.month % Math.max(1, cfg.everyMonths ?? 1) === 0;

/** 자동 통입이 쓸 빈 통 — 나무 통·오염 아님, 설정 순서(새 통 먼저 / 재사용 먼저), 같은 순서 안에서는 활성도 높은 통 먼저 */
export function autoFillCasks(s: GameState, cfg: AutoFillSettings): Cask[] {
  const usedFirst = cfg.prefer === 'used';
  return s.inventory.casks.filter((c) => !c.contents && !c.contamination && vesselMaterial(c) === 'wood')
    .sort((a, b) => (usedFirst ? Number(b.fills > 0) - Number(a.fills > 0) : Number(a.fills > 0) - Number(b.fills > 0)) || b.activity - a.activity || a.id.localeCompare(b.id));
}

/** 자동 통입이 넣을 탱크 원액 — 자사 몰트·그레인, 오래된 것부터 */
export function autoFillLots(s: GameState, cfg: AutoFillSettings): SpiritLot[] {
  const kinds = cfg.kinds?.length ? cfg.kinds : ['malt', 'grain'];
  return s.inventory.lots.filter((l) => (kinds as string[]).includes(l.kind) && !l.sourced && l.volumeL >= AUTO_FILL.minLotL && l.abv >= 0.4)
    .sort((a, b) => a.createdMonth - b.createdMonth || a.id.localeCompare(b.id));
}

/** 미리 보기 — 지금 넣으면 몇 통, 남는 원액(L). 상태를 바꾸지 않는다 */
export function autoFillPreview(s: GameState, cfg: AutoFillSettings): { casks: number; leftL: number; tankL: number } {
  const entryCap = cfg.entryAbv ?? AUTO_FILL.defaultEntryAbv;
  const casks = autoFillCasks(s, cfg);
  let i = 0; let left = 0; let tank = 0;
  for (const l of autoFillLots(s, cfg)) {
    tank += l.volumeL;
    let lotL = l.volumeL;
    const entry = Math.min(entryCap, l.abv);
    while (lotL >= 1 && i < casks.length) { lotL -= Math.min(lotL, (casks[i]!.sizeL * entry) / l.abv); i++; }
    left += lotL;
  }
  return { casks: i, leftL: left, tankL: tank };
}

/** 틱 맨 앞(2단계 생산 전): 켜져 있고 정한 달이면 탱크 원액을 빈 통에 넣는다 */
export function applyAutoFill(s: GameState, report: MonthReport): void {
  const cfg = autoFillOn(s);
  if (!cfg || !autoFillDue(s, cfg)) return;
  const lots = autoFillLots(s, cfg);
  if (!lots.length) return;
  const entryAbv = cfg.entryAbv ?? AUTO_FILL.defaultEntryAbv;
  let filled = 0;
  for (const lot of lots) {
    const casks = autoFillCasks(s, cfg);
    if (!casks.length) break;
    const before = s.inventory.casks.filter((c) => c.contents).length;
    const r = PROD_HANDLERS.fillCasks(s, s, { type: 'fillCasks', lotId: lot.id, caskIds: casks.map((c) => c.id), entryAbv });
    if (r.error) continue;
    filled += s.inventory.casks.filter((c) => c.contents).length - before;
  }
  const leftL = autoFillLots(s, cfg).reduce((t, l) => t + l.volumeL, 0);
  if (filled) report.notes.push(`자동 통입 ${filled}통 (${(Math.min(entryAbv, 1) * 100).toFixed(1)}%)${leftL >= 1 ? ` — 빈 통이 모자라 탱크 원액 ${Math.round(leftL).toLocaleString()}L가 남았다. 통을 사거나 숙성고를 늘리세요` : ''}`);
  else if (leftL >= 1) report.notes.push(`자동 통입 못 함 — 빈 나무 통이 없다(탱크 원액 ${Math.round(leftL).toLocaleString()}L 대기). 통을 사거나 숙성고를 늘리세요`);
}
