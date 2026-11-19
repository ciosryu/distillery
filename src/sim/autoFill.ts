import { PROD_HANDLERS } from './actions.prod';
import { usesObservedValuation } from './valuation';
import { vesselMaterial } from './maturation';
import type { AutoFillSettings, Cask, GameState, MonthReport, SpiritLot } from './types';

// ───────────── 자동 통입 (#239, 5차 MVP 플레이테스트 2026-11-10) ─────────────
// 5차 판: 82개월째 숙성 중인 통이 51개 중 3개 — 오너 "통입을 잊었고 귀찮았다". 자동 납품(#206)·자동 샘플(#207)과 같은 설정 줄.
// 켜 두면 정한 달마다 틱 맨 앞(생산 전 — 플레이어가 진행을 누르기 전에 통입한 것과 같은 때)에 탱크의 자사 몰트·그레인을
// 빈 나무 통에 넣는다. 수동 통입(fillCasks)과 같은 처리(같은 원가 배분·레어 판정·자리 배정)를 그대로 쓴다.
// 통입은 현금이 들지 않는다(통은 이미 산 것) — 빈 통이 모자라면 있는 만큼 넣고 메모를 남긴다. 봇은 쓰지 않는다

export const AUTO_FILL = { defaultEntryAbv: 0.635, everyMonths: [1, 3, 6] as const, minLotL: 20, minLastFill: 1 } as const;
// minLastFill `[튜닝]` (플레이테스트 뒤 후보 ②, 2026-11-19): 마지막 통이 이 비율(통 크기 대비)에 못 미치면 그 몫은 탱크에 두고 다음 통입 때 합친다.
//   1 = 생산이 이어지는 동안은 꽉 차는 통만 넣는다. 0.5로 재 보니 남는 몫이 두세 달마다 절반을 넘어 52% 통이 계속 생겼다(12달 18통 중 반 찬 통 6개)
//   화면 진행 메모: 2배치/월(218L)을 매달 넣으면 200L + 52L로 통 2개를 써 빈 통이 설명보다 두 배 빨리 줄었다. 그 원액을 만드는 생산 지시가
//   켜져 있을 때만 둔다(탱크가 다음 달에 다시 찬다) — 지시가 꺼졌으면 남은 몫도 지금 다 넣는다(탱크에 영영 남지 않게)

export const autoFillOn = (s: GameState): AutoFillSettings | null => s.inventory.autoFill ?? null;

/** 이번 달이 자동 통입하는 달인가 (매달·3·6개월마다 — 달 번호로 맞춘다) */
export const autoFillDue = (s: GameState, cfg: AutoFillSettings) => s.month % Math.max(1, cfg.everyMonths ?? 1) === 0;

/** 자동 통입이 쓸 빈 통 — 나무 통·오염 아님, 설정 순서(새 통 먼저 / 재사용 먼저), 같은 순서 안에서는 활성도 높은 통 먼저 */
export function autoFillCasks(s: GameState, cfg: AutoFillSettings): Cask[] {
  const usedFirst = cfg.prefer === 'used';
  // F5b [결정 #310 2단계]: 자동 통입은 플레이어가 **아는** 오염만 피한다(`contaminationKnown`) — 모르는 오염 통에 넣는 것이 새 규칙의 뜻(QC로 알게 됨). 옛 판은 숨은 값을 읽던 식 그대로(바이트 동일)
  const hidden = (c: Cask) => (usesObservedValuation(s) ? !!c.contaminationKnown : !!c.contamination);
  return s.inventory.casks.filter((c) => !c.contents && !hidden(c) && vesselMaterial(c) === 'wood')
    .sort((a, b) => (usedFirst ? Number(b.fills > 0) - Number(a.fills > 0) : Number(a.fills > 0) - Number(b.fills > 0)) || b.activity - a.activity || a.id.localeCompare(b.id));
}

/** 자동 통입이 넣을 탱크 원액 — 자사 몰트·그레인, 오래된 것부터 */
export function autoFillLots(s: GameState, cfg: AutoFillSettings): SpiritLot[] {
  const kinds = cfg.kinds?.length ? cfg.kinds : ['malt', 'grain'];
  return s.inventory.lots.filter((l) => (kinds as string[]).includes(l.kind) && !l.sourced && l.volumeL >= AUTO_FILL.minLotL && l.abv >= 0.4)
    .sort((a, b) => a.createdMonth - b.createdMonth || a.id.localeCompare(b.id));
}

/** 이 주종을 만드는 생산 지시가 켜져 있는가 — 켜져 있으면 덜 찰 끝자리를 탱크에 둔다(다음 달에 다시 찬다) */
const stillMaking = (s: GameState, kind: string) =>
  s.production.orders.some((o) => o.batchesPerMonth > 0 && s.production.recipes.find((r) => r.id === o.recipeId)?.kind === kind);

/** 통입 계획 — 원액마다 넣을 통(순서대로)과 덜 찰 끝자리라 탱크에 둘 몫(L). 상태를 바꾸지 않는다. 미리 보기와 실제 통입이 같은 계획을 쓴다 */
export function autoFillPlan(s: GameState, cfg: AutoFillSettings): { lot: SpiritLot; caskIds: string[]; heldL: number; leftL: number }[] {
  const entryCap = cfg.entryAbv ?? AUTO_FILL.defaultEntryAbv;
  const casks = autoFillCasks(s, cfg);
  let i = 0;
  return autoFillLots(s, cfg).map((l) => {
    const entry = Math.min(entryCap, l.abv);
    const hold = stillMaking(s, l.kind);
    const ids: string[] = [];
    let lotL = l.volumeL;
    let heldL = 0;
    while (lotL >= 1 && i < casks.length) {
      const needL = (casks[i]!.sizeL * entry) / l.abv;
      if (lotL < needL && hold && lotL / needL < AUTO_FILL.minLastFill) { heldL = lotL; lotL = 0; break; }
      ids.push(casks[i]!.id);
      lotL -= Math.min(lotL, needL);
      i++;
    }
    return { lot: l, caskIds: ids, heldL, leftL: lotL };
  });
}

/** 미리 보기 — 지금 넣으면 몇 통, 빈 통이 모자라 남는 원액(L), 덜 찰 끝자리라 탱크에 두는 원액(L). 상태를 바꾸지 않는다 */
export function autoFillPreview(s: GameState, cfg: AutoFillSettings): { casks: number; leftL: number; heldL: number; tankL: number } {
  const plan = autoFillPlan(s, cfg);
  return {
    casks: plan.reduce((n, x) => n + x.caskIds.length, 0),
    leftL: plan.reduce((t, x) => t + x.leftL, 0),
    heldL: plan.reduce((t, x) => t + x.heldL, 0),
    tankL: plan.reduce((t, x) => t + x.lot.volumeL, 0),
  };
}

/** 틱 맨 앞(2단계 생산 전): 켜져 있고 정한 달이면 탱크 원액을 빈 통에 넣는다 */
export function applyAutoFill(s: GameState, report: MonthReport): void {
  const cfg = autoFillOn(s);
  if (!cfg || !autoFillDue(s, cfg)) return;
  const plan = autoFillPlan(s, cfg);
  if (!plan.length) return;
  const entryAbv = cfg.entryAbv ?? AUTO_FILL.defaultEntryAbv;
  let filled = 0;
  for (const x of plan) {
    if (!x.caskIds.length) continue;
    const before = s.inventory.casks.filter((c) => c.contents).length;
    const r = PROD_HANDLERS.fillCasks(s, s, { type: 'fillCasks', lotId: x.lot.id, caskIds: x.caskIds, entryAbv });
    if (r.error) continue;
    filled += s.inventory.casks.filter((c) => c.contents).length - before;
  }
  // 빈 통이 모자라 남은 몫만 "통을 사라"로 — 덜 찰 끝자리라 둔 몫은 다음 통입 때 합친다
  const leftL = plan.reduce((t, x) => t + x.leftL, 0);
  if (filled) report.notes.push(`자동 통입 ${filled}통 (${(Math.min(entryAbv, 1) * 100).toFixed(1)}%)${leftL >= 1 ? ` — 빈 통이 모자라 탱크 원액 ${Math.round(leftL).toLocaleString()}L가 남았다. 통을 사거나 숙성고를 늘리세요` : ''}`);
  else if (leftL >= 1) report.notes.push(`자동 통입 못 함 — 빈 나무 통이 없다(탱크 원액 ${Math.round(leftL).toLocaleString()}L 대기). 통을 사거나 숙성고를 늘리세요`);
}
