import { describe, expect, it } from 'vitest';
import { advanceMonth, applyAction, newScenarioGame, warehouseCapacity, type Action, type Cask, type GameState } from '../sim';
import { isBulkKind, lotQuality, spotBidPerLPA } from '../sim/bulk';
import { readSigma } from '../sim/blendTable';
import { netWorth } from '../sim/progress';
import { KPI_UNIT_WON, won, wonCoarse } from './format';

// 정보 계약 I3 — 공개 KPI(순자산·재고 평가액)의 표시 해상도가 한 배치의 참 품질을 샘플 1회 오차보다 촘촘하게 풀지 않는다
// ([결정 #310] 1단계 = architecture §11.4 안 A · §11.5 T2). `scripts/experiments/info-leak.ts`의 측정을 테스트로 옮겼다 — 게임 규칙은 읽기만 한다

const act = (s: GameState, a: Action) => applyAction(s, a).state;
/** 참 품질 1점당 이 통의 평가액 변화(원) — 같은 달·같은 시세 */
const slope = (s: GameState, c: Cask) => { const l = c.contents!; const q = lotQuality(l); return l.volumeL * l.abv * Math.abs(spotBidPerLPA(s, l, 0, q + 1) - spotBidPerLPA(s, l, 0, q)); };
/** 증류소 탭 "재고 평가액"과 같은 식 */
const inventoryShown = (s: GameState) => netWorth(s) - s.finance.cash + s.finance.loans.reduce((t, l) => t + l.balance, 0) - s.finance.receivables.reduce((t, r) => t + r.amount, 0);
/** 안 A 전의 won() 단위 — 1억 미만 만 원 */
const oldUnit = (v: number) => (Math.abs(v) >= 1e8 ? 1e6 : Math.abs(v) >= 1e4 ? 1e4 : 1);

function fill(s: GameState): GameState {
  for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) {
    const need = Math.ceil((lot.volumeL * lot.abv) / (200 * 0.635));
    const empty = s.inventory.casks.filter((c) => !c.contents && !c.contaminationKnown).length;
    const room = warehouseCapacity(s) - s.inventory.casks.length;
    if (empty < need && room > 0 && s.finance.cash > 60_000_000) s = act(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: Math.min(need - empty, room) });
    const ids = s.inventory.casks.filter((c) => !c.contents && !c.contaminationKnown).slice(0, need).map((c) => c.id);
    if (ids.length) s = act(s, { type: 'fillCasks', lotId: lot.id, caskIds: ids, entryAbv: 0.635 });
  }
  return s;
}

/** 달마다: 배치 묶음 해상도의 최솟값(가장 잘 드러나는 배치가 몇 점 바뀌어야 표시가 바뀌나) · 샘플 1회 오차 */
function measure(tier: 'micro' | 'standard', seed: number, months: number[], unitOf: (shown: number) => number) {
  let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: tier, loanAmount: 0, seed });
  const recipe = (kind: 'soju' | 'malt') => s.production.recipes.find((r) => r.kind === kind && !r.mashBill.some((m) => m.ingredientId === 'malt_peated'))!.id;
  s = act(s, { type: 'setOrder', recipeId: recipe('malt'), batchesPerMonth: 3 });
  s = act(s, { type: 'setOrder', recipeId: recipe('soju'), batchesPerMonth: 1 });
  const out: { month: number; minCohort: number; sigma1: number; shown: number }[] = [];
  for (let m = 0; m <= Math.max(...months) && s.status === 'running'; m++) {
    s = fill(s);
    if (months.includes(s.month)) {
      const filled = s.inventory.casks.filter((c) => c.contents && !c.owner && isBulkKind(c.contents));
      const shown = inventoryShown(s);
      const unit = unitOf(shown);
      const batches = new Map<string, Cask[]>();
      for (const c of filled) { const k = c.contents!.batchId ?? c.id; batches.set(k, [...(batches.get(k) ?? []), c]); }
      const cohort = [...batches.values()].map((cs) => unit / cs.reduce((t, c) => t + slope(s, c), 0));
      out.push({ month: s.month, minCohort: Math.min(...cohort), sigma1: readSigma(s, { ...filled[0]!, samples: 1, labAnalyzed: false }), shown });
    }
    s = advanceMonth(s);
  }
  return out;
}

describe('공개 KPI 표시 해상도 — I3 ([결정 #310] 1단계, 안 A)', () => {
  it('wonCoarse는 늘 100만 원 단위(0.01억) — 469만 → 0.05억, 1억 미만도 억으로', () => {
    expect(wonCoarse(4_690_000)).toBe('0.05억');
    expect(wonCoarse(123_456_789)).toBe('1.23억');
    expect(wonCoarse(-4_690_000)).toBe('−0.05억');
    expect(wonCoarse(400_000)).toBe('0.00억');
    expect(won(4_690_000)).toBe('469만'); // 현금·대출은 그대로 만 원 단위
  });

  it('100만 원 단위에서는 처음 2년 어느 달도 배치 묶음 해상도가 샘플 1회 오차(σ₁)보다 거칠다 — micro·standard 시드 1·2', () => {
    for (const tier of ['micro', 'standard'] as const) for (const seed of [1, 2]) {
      const rows = measure(tier, seed, [2, 3, 4, 6, 9, 12, 24], () => KPI_UNIT_WON);
      expect(rows.length).toBe(7);
      for (const r of rows) expect(r.minCohort, `${tier} 시드 ${seed} ${r.month}개월 해상도 ${r.minCohort.toFixed(1)}점 < σ₁ ${r.sigma1.toFixed(1)}`).toBeGreaterThanOrEqual(r.sigma1);
    }
  }, 60_000);

  it('옛 단위(1억 미만 만 원)에서는 초반 배치 해상도가 σ₁보다 훨씬 촘촘했다 — 안 A를 고른 이유 (2026-11-11 측정 0.2~0.3점 대 ±13.9)', () => {
    const rows = measure('micro', 1, [2, 6], oldUnit);
    for (const r of rows) {
      expect(r.shown).toBeLessThan(1e8); // 초반은 1억 미만 → 만 원 단위였다
      expect(r.minCohort).toBeLessThan(r.sigma1 / 10);
    }
  }, 30_000);
});
