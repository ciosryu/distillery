// 피니시 표기의 판매 효과 판정 ([결정 #270] · [결정 #362], MKT) — market.ts(매력도 · 기대 가격)와 brands.ts(럭셔리)가 같이 읽는다. 둘 사이 순환을 피해 따로 둔다
import { FINISH_LABEL } from './content/market';
import type { GameState, Product } from './types';
import { usesObservedValuation } from './valuation';

/**
 * 피니시 통에 머문 개월(근사) — `caskMonthsMix`(개월 가중 통 구성)의 피니시 통 몫 ÷ 통 몫 합 × 최저 오크 개월. 한 통 원액이면 정확하고,
 * 나이가 다른 원액을 섞으면 알코올 가중 평균에 가깝다 `[근사]`. 기록이 없는 피니시 제품(옛 세이브 — 마지막 통만 안다)은 0 → 표기 효과 중립
 * (`styleFit`이 그 제품의 피니시 몫을 ×1로 두는 것과 같은 규칙)
 */
export function finishMonthsOf(p: Pick<Product, 'finish' | 'caskMonthsMix' | 'oakMonths' | 'ageYears'>): number {
  if (!p.finish || !p.caskMonthsMix?.length) return 0;
  const total = p.caskMonthsMix.reduce((t, c) => t + c.share, 0);
  const fin = p.caskMonthsMix.filter((c) => c.typeId === p.finish).reduce((t, c) => t + c.share, 0);
  return total > 0 ? (fin / total) * (p.oakMonths ?? (p.ageYears ?? 0) * 12) : 0;
}
/**
 * 피니시 표기 효과가 켜지는가 ([결정 #362]) — v16 규칙 묶음의 판(옛 판 `legacy-v15` 아님 — F5d와 같은 판 가름 `usesObservedValuation`, 샌드박스 새 판 포함)에서,
 * 표기가 있고 피니시 통에 FINISH_LABEL.minMonths 이상. 옛 판은 생성 때 규칙을 고정한다(#308 · #343 — PM 2026-11-24). 판을 모르면(s 없음) 끈다
 */
export const finishLabelOn = (p: Pick<Product, 'finish' | 'caskMonthsMix' | 'oakMonths' | 'ageYears'>, s: Pick<GameState, 'rulesVersion'> | undefined): boolean =>
  !!s && usesObservedValuation(s) && !!p.finish && finishMonthsOf(p) >= FINISH_LABEL.minMonths - 1e-9;
