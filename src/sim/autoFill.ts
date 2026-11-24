import { PROD_HANDLERS } from './actions.prod';
import { usesObservedValuation } from './valuation';
import { vesselMaterial } from './maturation';
import { rulesVersionOf } from './rules';
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

/**
 * 손 통입 미리 보기 ([제안 P-PROD-60], 6차 판 — 숙성 중 43통 중 18통이 처음부터 60% 미만으로 찼고 손 통입에서도 생겼다).
 * 원액(L·도수)을 고른 통들에 차례로 넣을 때 통마다 몇 %가 차는지 — `fillCasks`와 같은 식(통 크기 × 통입 도수 ÷ 원액 도수). 상태를 바꾸지 않는다(화면 전용).
 * 정보만 준다 — 손 통입을 막거나 개수를 바꾸지 않는다
 */
export function fillShares(lotL: number, lotAbv: number, caskSizesL: number[], entryAbv: number): { shares: number[]; leftL: number } {
  const entry = Math.min(entryAbv, lotAbv);
  let left = lotL;
  const shares: number[] = [];
  for (const size of caskSizesL) {
    if (left < 1) break;
    const needL = (size * entry) / lotAbv;
    const use = Math.min(needL, left);
    shares.push(use / needL);
    left -= use;
  }
  return { shares, leftL: Math.max(0, left) };
}

/** 손 통입 끝자리 안내 문턱 — 마지막 통이 이 비율보다 덜 차면 "n%만 찬다"를 보인다 `[튜닝]` */
export const PARTIAL_FILL_HINT = 0.5;

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
  const used = new Set<string>();
  return autoFillLots(s, cfg).map((l) => {
    const entry = Math.min(entryCap, l.abv);
    // [결정 #372] v16: 생산 지시가 꺼져도 덜 찰 통에는 넣지 않는다(끝자리는 탱크에 두고 원액이 더 생기면 합친다) — 9차 판 사실 확인(PROD 2026-11-24):
    // 지시를 끈 달에는 마지막 통에 남은 몫을 다 넣어 덜 찬 통이 생겼다. 옛 판은 지시가 켜져 있을 때만(지금대로)
    const hold = rulesVersionOf(s) !== 'legacy-v15' || stillMaking(s, l.kind);
    const ids: string[] = [];
    let lotL = l.volumeL;
    let heldL = 0;
    // 빈 통을 설정 순서대로 본다. 생산 중(hold)이면 꽉 차지 않을 통은 **건너뛰고** 더 작은 통을 찾는다 — 섞인 크기(셰리 벗 500L가 앞에 오면
    // 남은 277L가 버번 200L 한 통을 꽉 채울 수 있는데도 통째로 멈추던 것, 7차 판 전 화면 점검 2026-11-19)
    for (const c of casks) {
      if (lotL < 1) break;
      if (used.has(c.id)) continue;
      const needL = (c.sizeL * entry) / l.abv;
      if (lotL < needL && hold && lotL / needL < AUTO_FILL.minLastFill) continue;
      ids.push(c.id);
      used.add(c.id);
      lotL -= Math.min(lotL, needL);
    }
    // 남은 몫 — 생산 중이고 아직 안 쓴 빈 통이 있으면 "꽉 차지 않아 둔 몫"(다음 통입 때 합친다), 아니면 빈 통이 모자란 몫
    if (lotL >= 1 && hold && casks.some((c) => !used.has(c.id))) { heldL = lotL; lotL = 0; }
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
