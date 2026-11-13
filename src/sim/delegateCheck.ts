import { previewBlend, whiskyMinMonths, type BottleOptions } from './blending';
import type { BlendTarget } from './blendRadar';
import { delegatePlan } from './blendTable';
import { regionOf } from './content/regions';
import { campaignMinOakMonths } from './progress';
import { protectedCaskIds, reserveCaskIds } from './tags';
import type { Cask, GameState } from './types';

// ───────────── [블렌더에게 맡기기] 확인 (#238, 5차 MVP 플레이테스트 2026-11-10) ─────────────
// 5차 판: 맡기기가 바로 확정되는 줄 모르고 연달아 눌러 위스키 통이 모두 사라졌다(82개월째 판이 멈춤). 규칙은 그대로 두고,
// 화면이 두 번째 누름 전에 보일 내용을 계산한다 — 행동(delegateBlend)과 같은 계획(delegatePlan)을 쓰므로 미리 보기와 실제가 같다

export interface DelegateCheck {
  /** 쓸 통 — 쓰는 양, 쓰고 나서 비는지 */
  casks: { id: string; liters: number; oakMonths: number; empties: boolean; flagship: boolean }[];
  bottles: number;
  /** 샘플 기록이 없어 빠지는 통 수 */
  unknown: number;
  /** 맡긴 뒤 남는 위스키 통(위스키 숙성 기간을 채운 몰트·그레인, 고객 소유 제외) */
  whiskyLeft: number;
  whiskyBefore: number;
  /** 이번 달 같은 목표로 이미 맡긴 제품 */
  alreadyThisMonth: string[];
  /** 쓰는 통 중 보호 태그(플래그십 예비 포함) 통 — 플레이어가 직접 고른 묶음에만 들어올 수 있다(기본 후보는 뺀다, delegateDefaultIds) */
  protectedUsed: string[];
  warnings: string[];
}

const isWhiskyCask = (s: GameState, c: Cask) => !!c.contents && !c.owner && (c.contents.kind === 'malt' || c.contents.kind === 'grain') && c.contents.oakMonths >= whiskyMinMonths(regionOf(s).whisky);

// isFlagshipCandidate는 코어 `ledger.ts`로 옮겼다(F2, [결정 #323] — PM 조건 "delegateCheck 코어 이동"). 쓰는 쪽 호환을 위해 다시 내보낸다
import { isFlagshipCandidate } from './ledger';
export { isFlagshipCandidate };

/**
 * 맡기기 기본 후보 (#260·#249 ② — 2026-11-11, ARCH 진입 확인 #313 빈틈 ①): 플레이어가 묶음을 고르지 않으면 화면은 샘플 기록이 있는 통 전부를 넘긴다.
 * 그 기본 후보에서 보호 태그 통(플래그십 예비 + 플레이어 "보호")을 뺀다 — 보호 통은 자동으로 고르는 경로가 쓰지 않는다.
 * 플레이어가 직접 고른 묶음은 그대로 둔다(손 행동은 막지 않는다 — 확인 단계에서 경고, protectedUsed)
 */
export function delegateDefaultIds(s: GameState, caskIds: string[]): { ids: string[]; excluded: string[] } {
  const prot = protectedCaskIds(s);
  return { ids: caskIds.filter((id) => !prot.has(id)), excluded: caskIds.filter((id) => prot.has(id)) };
}

export function delegateCheck(s: GameState, target: BlendTarget, caskIds: string[], bottles: number, opts: BottleOptions): DelegateCheck | { error: string } {
  const plan = delegatePlan(s, target, caskIds, bottles, opts);
  if ('error' in plan) return plan;
  const p = previewBlend(s, plan.components, opts);
  const casks = plan.components.map((x) => {
    const c = s.inventory.casks.find((k) => k.id === x.id)!;
    return { id: x.id, liters: x.liters, oakMonths: c.contents!.oakMonths, empties: c.contents!.volumeL - x.liters < 1, flagship: isFlagshipCandidate(s, c) };
  });
  const emptied = new Set(casks.filter((x) => x.empties).map((x) => x.id));
  const whiskyBefore = s.inventory.casks.filter((c) => isWhiskyCask(s, c)).length;
  const whiskyLeft = s.inventory.casks.filter((c) => isWhiskyCask(s, c) && !emptied.has(c.id)).length;
  const alreadyThisMonth = s.commerce.products.filter((x) => x.createdMonth === s.month && x.blend?.delegated && x.blend.targetId === target.id).map((x) => x.name);
  const warnings: string[] = [];
  if (whiskyLeft === 0) warnings.push('맡기고 나면 위스키 통이 하나도 남지 않는다 — 다음 병입·재고 보충을 할 수 없다');
  const flag = casks.filter((x) => x.flagship);
  if (flag.length) warnings.push(`플래그십 후보 통 ${flag.length}개를 쓴다(${flag.map((x) => x.id).join(', ')}) — 판이 끝나기 전 ${campaignMinOakMonths(s) / 12}년 숙성을 채울 수 있는 통`);
  if (alreadyThisMonth.length) warnings.push(`이번 달 같은 목표로 이미 맡겼다: ${alreadyThisMonth.map((n) => `「${n}」`).join(', ')}`);
  // 보호 태그 통 (#260) — 직접 고른 묶음에 들어 있으면 알린다(막지 않는다)
  const prot = protectedCaskIds(s);
  const reserve = reserveCaskIds(s);
  const protectedUsed = casks.filter((x) => prot.has(x.id)).map((x) => x.id);
  if (protectedUsed.length) {
    const res = protectedUsed.filter((id) => reserve.has(id));
    warnings.push(`보호 태그 통 ${protectedUsed.length}개를 쓴다(${protectedUsed.join(', ')})${res.length ? ` — 그중 플래그십 예비 ${res.length}개` : ''}. 직접 고른 묶음이라 막지 않는다 — 남기려면 그 묶음을 빼고 고르세요`);
  }
  return { casks, bottles: p.bottles, unknown: plan.unknown, whiskyLeft, whiskyBefore, alreadyThisMonth, protectedUsed, warnings };
}
