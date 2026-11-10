import { previewBlend, whiskyMinMonths, type BottleOptions } from './blending';
import type { BlendTarget } from './blendRadar';
import { delegatePlan } from './blendTable';
import { regionOf } from './content/regions';
import { DEFAULT_FLAGSHIP_MONTHS } from './progress';
import type { Cask, GameState } from './types';

// ───────────── [블렌더에게 맡기기] 확인 (P-PROD-33, 5차 MVP 플레이테스트 2026-11-10) ─────────────
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
  warnings: string[];
}

const isWhiskyCask = (s: GameState, c: Cask) => !!c.contents && !c.owner && (c.contents.kind === 'malt' || c.contents.kind === 'grain') && c.contents.oakMonths >= whiskyMinMonths(regionOf(s).whisky);

/** 플래그십 후보 — 판이 끝나기 전에 플래그십 숙성(MVP 144개월)을 채울 수 있는 통. 목표 기한이 없는 판(샌드박스)은 이미 그 숙성을 넘긴 통 */
export function isFlagshipCandidate(s: GameState, c: Cask): boolean {
  const l = c.contents;
  if (!l || (l.kind !== 'malt' && l.kind !== 'grain')) return false;
  const need = s.scenario?.goal.flagshipMinMonths ?? DEFAULT_FLAGSHIP_MONTHS;
  const left = s.scenario ? Math.max(0, s.scenario.goal.months - s.month) : 0;
  return l.oakMonths + left >= need;
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
  if (flag.length) warnings.push(`플래그십 후보 통 ${flag.length}개를 쓴다(${flag.map((x) => x.id).join(', ')}) — 판이 끝나기 전 ${(s.scenario?.goal.flagshipMinMonths ?? DEFAULT_FLAGSHIP_MONTHS) / 12}년 숙성을 채울 수 있는 통`);
  if (alreadyThisMonth.length) warnings.push(`이번 달 같은 목표로 이미 맡겼다: ${alreadyThisMonth.map((n) => `「${n}」`).join(', ')}`);
  return { casks, bottles: p.bottles, unknown: plan.unknown, whiskyLeft, whiskyBefore, alreadyThisMonth, warnings };
}
