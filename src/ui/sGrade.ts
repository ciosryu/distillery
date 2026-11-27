// [결정 #439] S 등급 세 조건을 승리 전에 보인다 — 목표 칸 · ⏳ 줄 · 승리 병입 확인 창이 이 한 곳을 읽는다(P-ARCH-92 · P-PROD-82 · P-MGT-70).
// 10차 판: S 품질 조건(80)은 승리 전 어느 화면에도 없었고 ⏳ 줄은 순자산만 말했다(docs/playtest/10/arch.md 153개월 ①).
// 지킬 것(#439): 화면이 이미 보이는 추정만 — 품질은 병입 탭 「12년 병입 — 적격 통과 조합 비교」(agedCombos — 샘플로 어림한 아는 값)나 그 병입의 미리보기 값.
// 「n개월 기다리면 S · 그때 문턱 n억」 문장은 넣지 않는다(오너 결정 — S 드묾 #393). 판정 규칙은 MGT `progress.ts judgeWin` 그대로 읽는다
import { campaignWon, GRADE, netWorth, rulesVersionOf, sNetWorthTarget, type BlendComponent, type GameState } from '../sim';
import { ledgerEligibility, ledgerOf } from '../sim/ledger';
import { agedCombos } from '../sim/agedCombos';
import { awarenessOf } from '../sim/brands';
import { monthlyFixedCost } from '../sim/loans';

export interface SGradeRow {
  id: 'quality' | 'netWorth' | 'awareness';
  label: string;
  /** 조건 문구(「80」 · 「21.0억」 · 「20%」) */
  target: string;
  /** 지금 값 문구 — 알 수 없으면 null(적격 원액이 아직 없다 등) */
  now: string | null;
  /** 채웠나 — 알 수 없으면 null */
  ok: boolean | null;
  /** 채웠지만 문턱에 가깝다(여유 < 월 고정비) — 판정은 이번 달 결산 뒤 값이라 바뀔 수 있다(MGT 확인) */
  close?: boolean;
}

const eok = (n: number) => `${(n / 1e8).toFixed(1)}억`;

/**
 * 지금 적격 원액으로 낼 수 있는 12년 싱글 몰트의 예상 품질(가장 높은 조합 · 도수) — 병입 탭 조합 비교와 같은 값. 적격 몰트가 없으면 null.
 * 조합은 몰트 계열별 · 몰트 전부(`malt:*`)만 본다 — 그레인 · 블렌디드는 승리 제품이 아니다
 */
export function bestEligibleMaltQuality(s: GameState): number | null {
  const v = agedCombos(s);
  if (!v) return null;
  const qs = v.combos.filter((c) => c.id.startsWith('malt:')).flatMap((c) => c.cells.map((x) => x.q)).filter((q): q is number => q != null);
  return qs.length ? Math.max(...qs) : null;
}

/**
 * S 세 조건과 지금 값 — 새 캠페인(v16) · 시나리오 · 승리 전만(아니면 null). 이번 달에 팔면 다음 달 판정이라 순자산 문턱은 `sNetWorthTarget(s)`(다음 달 판정 기준).
 * `quality`를 주면(승리 병입 확인 창 — 그 병입의 미리보기 값) 그 값으로, 안 주면 지금 적격 원액의 가장 좋은 예상으로 본다.
 * `grade`는 셋이 모두 ✓이면 S, 하나라도 ✗이면 A — 승리 판정(`judgeWin`)과 같은 식. 품질을 모르면 null
 */
export function sGradeNow(s: GameState, quality?: number | null): { rows: SGradeRow[]; grade: 'S' | 'A' | null } | null {
  if (!s.scenario || rulesVersionOf(s) === 'legacy-v15' || campaignWon(s)) return null;
  const target = sNetWorthTarget(s);
  if (target == null) return null;
  const q = quality !== undefined ? quality : bestEligibleMaltQuality(s);
  const nw = netWorth(s);
  const aw = awarenessOf(s);
  const rows: SGradeRow[] = [
    { id: 'quality', label: '12년 싱글 몰트 품질(어림 · 샘플 기준)', target: `${GRADE.sFlagshipQuality}`, now: q != null ? `${Math.round(q)}` : null, ok: q != null ? q >= GRADE.sFlagshipQuality : null },
    // 화면 순자산은 직전 결산 값, 판정은 이번 달 결산 뒤 값 — 한 달 손익 · 감가만큼 다르다(MGT). 여유가 월 고정비보다 작으면 「아슬아슬」
    { id: 'netWorth', label: '순자산', target: eok(target), now: eok(nw), ok: nw >= target, ...(nw >= target && nw - target < monthlyFixedCost(s) ? { close: true } : {}) },
    { id: 'awareness', label: '인지도', target: `${Math.round(GRADE.sAwareness * 100)}%`, now: `${Math.round(aw * 100)}%`, ok: aw >= GRADE.sAwareness },
  ];
  const grade = rows.some((r) => r.ok === false) ? 'A' : rows.every((r) => r.ok) ? 'S' : null;
  return { rows, grade };
}

/** 한 줄 꼴 — 「12년 싱글 몰트 품질 80 (지금 77 ✗) · 순자산 21.0억 (지금 31.0억 ✓) · 인지도 20% (지금 74% ✓)」 */
export const sGradeRowText = (r: SGradeRow): string => `${r.label} ${r.target}${r.now != null ? ` (지금 ${r.now} ${r.ok ? '✓' : '✗'}${r.close ? ' 아슬아슬 — 판정은 이번 달 결산 뒤 값' : ''})` : ' (지금 — 12년 적격 원액 없음)'}`;

/**
 * 이 병입이 팔리면 캠페인 승리가 되는가 — 고른 원액의 구성 원장이 승리 적격(`ledgerEligibility`, 병입 로트 `eligibleAtBottling`과 같은 판정)이면 true.
 * 새 캠페인(v16) · 시나리오 · 승리 전만. 승리 병입 확인 창(#439)이 읽는다
 */
export function isWinBottling(s: GameState, components: readonly BlendComponent[]): boolean {
  if (!s.scenario || rulesVersionOf(s) === 'legacy-v15' || campaignWon(s) || !components.length) return false;
  const entries = components.flatMap((c) => {
    const lot = c.source === 'cask' ? s.inventory.casks.find((x) => x.id === c.id)?.contents : s.inventory.lots.find((x) => x.id === c.id);
    return lot ? ledgerOf(s, lot) : [];
  });
  return entries.length > 0 && ledgerEligibility(s, entries).eligible;
}
