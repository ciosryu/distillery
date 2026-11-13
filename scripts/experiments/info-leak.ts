// 정보 비대칭 역산 점검 (ARCH-C, requirements-audit.md §2.6 · #167 반론 "초반 통 1~2개면 합계 ≈ 그 통") — 게임 규칙은 바꾸지 않는다.
// 증류소 탭 "재고 평가액"(= 순자산 − 현금 + 대출 − 매출채권, MvpHome Headline)은 원액을 **참 품질** 현물가로 더한다(#167).
// 화면 표시 단위(won(): 1억 미만 만 원 · 1억 이상 100만 원)에서, 참 품질이 몇 점 바뀌어야 표시가 바뀌는지(= 역산 해상도)를
// 샘플 1회의 오차(readSigma)와 견준다. 한 통 단위와 같은 배치(코호트) 묶음 단위 둘 다 — 같은 배치 통은 참 품질이 거의 같다.
// 실행: npx tsx scripts/experiments/info-leak.ts [시드수=3]   TIER=<micro|standard>
import { advanceMonth, applyAction, newScenarioGame, warehouseCapacity, type Action, type Cask, type GameState } from '../../src/sim';
import { isBulkKind, lotQuality, spotBidPerLPA } from '../../src/sim/bulk';
import { readSigma } from '../../src/sim/blendTable';
import { netWorth } from '../../src/sim/progress';
import { KPI_UNIT_WON } from '../../src/ui/format';

const SEEDS = Number(process.argv[2] ?? 3);
const TIER = (process.env.TIER ?? 'micro') as 'micro' | 'standard';
const CHECK = [2, 3, 4, 6, 9, 12, 24, 36, 60];
const act = (s: GameState, a: Action) => applyAction(s, a).state;

/** 증류소 탭과 같은 식 — 재고 평가액 */
const inventoryShown = (s: GameState) => netWorth(s) - s.finance.cash + s.finance.loans.reduce((t, l) => t + l.balance, 0) - s.finance.receivables.reduce((t, r) => t + r.amount, 0);
/** 화면 표시 단위 — [결정 #310] 1단계(안 A) 뒤 순자산·재고 평가액은 늘 100만 원. OLD=1 이면 안 A 전의 won() 단위(1억 미만 만 원)로 재서 비교한다 */
const unitOf = (v: number) => (process.env.OLD === '1' ? (Math.abs(v) >= 1e8 ? 1e6 : Math.abs(v) >= 1e4 ? 1e4 : 1) : KPI_UNIT_WON);
/** 참 품질 1점당 이 통의 평가액 변화(원) — 같은 달·같은 시세에서 */
const slope = (s: GameState, c: Cask) => { const l = c.contents!; const q = lotQuality(l); return l.volumeL * l.abv * Math.abs(spotBidPerLPA(s, l, 0, q + 1) - spotBidPerLPA(s, l, 0, q)); };

function fill(s: GameState): GameState {
  const cap = warehouseCapacity(s);
  for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) {
    const need = Math.ceil((lot.volumeL * lot.abv) / (200 * 0.635));
    const empty = s.inventory.casks.filter((c) => !c.contents && !c.contamination).length;
    const room = cap - s.inventory.casks.length;
    if (empty < need && room > 0 && s.finance.cash > 60_000_000) s = act(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: Math.min(need - empty, room) });
    const ids = s.inventory.casks.filter((c) => !c.contents && !c.contamination).slice(0, need).map((c) => c.id);
    if (ids.length) s = act(s, { type: 'fillCasks', lotId: lot.id, caskIds: ids, entryAbv: 0.635 });
  }
  return s;
}

const med = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)]! : NaN; };
console.log(`정보 비대칭 역산 점검 — 한국 경기 MVP ${TIER}, ${SEEDS}시드, 몰트 3·소주 1배치, 매달 통입, 이벤트 그대로`);
console.log('| 시드 | 개월 | 원액 든 통 | 배치 수 | 재고 평가액 | 표시 단위 | 한 통: 참 품질 몇 점이면 표시가 바뀌나 (중앙) | 배치 묶음: 몇 점 (중앙) | 같은 배치 참 품질 폭 (중앙) | 샘플 1회 오차 ±1σ |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (let seed = 1; seed <= SEEDS; seed++) {
  let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: TIER, loanAmount: 0, seed });
  const recipe = (kind: 'soju' | 'malt') => s.production.recipes.find((r) => r.kind === kind && !r.mashBill.some((m) => m.ingredientId === 'malt_peated'))?.id;
  s = act(s, { type: 'setOrder', recipeId: recipe('malt')!, batchesPerMonth: 3 });
  s = act(s, { type: 'setOrder', recipeId: recipe('soju')!, batchesPerMonth: 1 });
  for (let m = 0; m <= Math.max(...CHECK); m++) {
    s = fill(s);
    if (CHECK.includes(s.month)) {
      const filled = s.inventory.casks.filter((c) => c.contents && !c.owner && isBulkKind(c.contents));
      const inv = inventoryShown(s);
      const unit = unitOf(inv);
      const one = filled.map((c) => unit / slope(s, c));
      const batches = new Map<string, Cask[]>();
      for (const c of filled) { const k = c.contents!.batchId ?? c.id; batches.set(k, [...(batches.get(k) ?? []), c]); }
      const cohort = [...batches.values()].map((cs) => unit / cs.reduce((t, c) => t + slope(s, c), 0));
      const spread = [...batches.values()].map((cs) => { const q = cs.map((c) => lotQuality(c.contents!)); return Math.max(...q) - Math.min(...q); });
      const sigma1 = filled.length ? readSigma(s, { ...filled[0]!, samples: 1, labAnalyzed: false }) : NaN;
      console.log(`| ${seed} | ${s.month} | ${filled.length} | ${batches.size} | ${Math.round(inv / 1e4).toLocaleString()}만 | ${unit >= 1e6 ? '100만' : '1만'} | ${med(one).toFixed(2)}점 | ${med(cohort).toFixed(2)}점 | ${med(spread).toFixed(1)}점 | ±${sigma1.toFixed(1)}점 |`);
    }
    s = advanceMonth(s);
    if (s.status !== 'running') break;
  }
}
console.log('\n읽는 법: "몇 점"이 샘플 1회 오차보다 훨씬 작으면, 그 단위(한 통·배치 묶음)의 참 품질 변화가 화면 합계에 샘플보다 촘촘하게 드러난다.');
console.log('합계에서 한 통·한 배치를 떼어 내려면 다른 항(다른 통·탱크·제품 원가·시세 지수)을 알아야 한다 — 초반(통이 한두 배치뿐)일수록 쉽다.');
