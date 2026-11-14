// 골든 추적 (ARCH — TECH-04 준비, architecture §9.4 "분기 일치 골든" · §10.9 ⑦ 골든 대상 목록).
// 정해진 판(시나리오 · 티어 · 시드 · 정해진 행동 묶음)을 180개월 돌리며 매달 한 줄(JSONL)을 남긴다:
//   분기 칸(정확히 같아야 한다) — 상태 · 이벤트 id · 파산 카운트 · 판정 · 자동 가격 사유(priceLog 제품·정책·값) · 생산 배치 수 · 판매 병 수
//   연속 칸(허용 오차로 본다) — 현금 · 순자산 · 생산 LPA · 엔젤스 셰어
//   상태 해시(TS 회귀용 — FNV-1a 32비트, JSON 직렬화 순서에 기대므로 C# 비교에는 쓰지 않는다)
// 게임 규칙은 바꾸지 않는다(읽기만). 바이트 골든 테스트는 단계 G 전에 이 출력으로 만든다 — 지금은 단계 T 튜닝 중이라 테스트로 걸지 않는다.
// 사용: npx tsx scripts/experiments/golden-trace.ts [출력 폴더=golden-out] [개월=180]
//   비교: 두 폴더의 같은 파일을 diff — 분기 칸이 처음 갈라지는 달이 이식·회귀가 갈라진 곳이다
import { mkdirSync, writeFileSync } from 'node:fs';
import { advanceMonth, applyAction, warehouseCapacity, type Action, type GameState } from '../../src/sim';
import { newGame } from '../../src/sim/newGame';
import { newScenarioGame } from '../../src/sim/newScenario';
import { netWorth } from '../../src/sim/progress';
import type { RegionId } from '../../src/sim/types';

const OUT = process.argv[2] ?? 'golden-out';
const MONTHS = Number(process.argv[3] ?? 180);

/** FNV-1a 32비트 — rng.ts hashString과 같은 식 */
function fnv(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
const r2 = (x: number) => Math.round(x * 100) / 100;

interface Case { name: string; make: () => GameState; act: (s: GameState) => GameState }

const act = (s: GameState, a: Action) => { const r = applyAction(s, a); return r.error ? s : r.state; };

/**
 * 정해진 행동 묶음 — 몰트 3·소주 2배치 · 매달 탱크 몰트 통입(빈 통 모자라면 즉시 구매) · 1개월에 소주 병입 → 자동 납품 2개월분 + 자동 가격 A ·
 * 37개월에 36개월 넘은 몰트 통 3개로 위스키 병입 → 자동 납품 + 자동 가격 A. 사람·봇 판정과 무관한 "규칙을 고루 지나가는" 판이다
 */
function steadyBot(s: GameState): GameState {
  if (s.month === 0) {
    const recipe = (kind: 'soju' | 'malt') => s.production.recipes.find((r) => r.kind === kind && !r.mashBill.some((m) => m.ingredientId === 'malt_peated'))?.id;
    const m = recipe('malt'), j = recipe('soju');
    if (m) s = act(s, { type: 'setOrder', recipeId: m, batchesPerMonth: 3 });
    if (j) s = act(s, { type: 'setOrder', recipeId: j, batchesPerMonth: 2 });
  }
  const launch = (name: string, kind: 'soju' | 'whisky') => {
    const before = new Set(s.commerce.products.map((p) => p.id));
    const comps = kind === 'soju'
      ? s.inventory.lots.filter((l) => l.kind === 'soju').slice(0, 1).map((l) => ({ source: 'lot' as const, id: l.id, liters: Math.min(l.volumeL, 400) }))
      : s.inventory.casks.filter((c) => c.contents?.kind === 'malt' && c.contents.oakMonths >= 36 && !c.owner).slice(0, 3).map((c) => ({ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL }));
    if (!comps.length) return;
    s = act(s, { type: 'bottle', components: comps, options: { name, targetAbv: kind === 'soju' ? 0.25 : 0.4, bottleMl: kind === 'soju' ? 375 : 700, chillFilter: true, packagingId: 'standard' } });
    const id = s.commerce.products.find((p) => !before.has(p.id))?.id;
    if (!id) return;
    s = act(s, { type: 'setAutoRestock', productId: id, months: 2 });
    s = act(s, { type: 'setPricePolicy', productId: id, mode: 'turnover' });
  };
  if (s.month === 1) launch('골든 소주', 'soju');
  if (s.month === 37) launch('골든 3년', 'whisky');
  for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) {
    const need = Math.ceil((lot.volumeL * lot.abv) / (200 * 0.635));
    const empty = s.inventory.casks.filter((c) => !c.contents && !c.contamination).length;
    const room = warehouseCapacity(s) - s.inventory.casks.length;
    if (empty < need && room > 0 && s.finance.cash > 60_000_000) s = act(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: Math.min(need - empty, room) });
    const ids = s.inventory.casks.filter((c) => !c.contents && !c.contamination).slice(0, need).map((c) => c.id);
    if (ids.length) s = act(s, { type: 'fillCasks', lotId: lot.id, caskIds: ids, entryAbv: 0.635 });
  }
  return s;
}

const CASES: Case[] = [
  ...(['micro', 'standard'] as const).flatMap((tierId) => [1, 2].map((seed) => ({
    name: `mvp-${tierId}-s${seed}`,
    make: () => { const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId, loanAmount: 0, seed }); s.finance.cash += 2_000_000_000; return s; }, // 판정용이 아니라 180개월 규칙을 고루 지나가게 — 현금 +20억(시험 사본, #313 화면 점검과 같은 방식)
    act: steadyBot,
  }))),
  ...(['KR', 'JP', 'TW'] as RegionId[]).map((region) => ({
    name: `sandbox-${region}-s1`,
    make: () => newGame({ seed: 1, region, startingCash: 3_000_000_000 }),
    act: steadyBot,
  })),
];

mkdirSync(OUT, { recursive: true });
const summary: string[] = [];
for (const c of CASES) {
  let s = c.make();
  const lines: string[] = [];
  for (let m = 0; m < MONTHS && s.status === 'running'; m++) {
    s = c.act(s);
    s = advanceMonth(s);
    const r = s.history.reports.at(-1)!;
    lines.push(JSON.stringify({
      // 분기 칸 — 정확히 같아야 한다
      m: r.month, status: s.status, neg: s.finance.negativeCashMonths,
      events: r.events, verdict: s.progress.verdict ? `${s.progress.verdict.result}:${s.progress.verdict.grade ?? ''}` : null,
      win: s.progress.win ? `${s.progress.win.month}:${s.progress.win.kind}:${s.progress.win.lotId}` : null, // F4 캠페인 승리(새 판만)
      batches: r.production.reduce((t, p) => t + p.batches, 0),
      sold: r.sales.reduce((t, x) => t + x.bottles, 0),
      price: (r.priceLog ?? []).map((e) => `${e.productId}:${e.mode}:${e.to}`),
      casks: s.inventory.casks.filter((k) => k.contents).length,
      // 연속 칸 — 허용 오차
      cash: Math.round(s.finance.cash), nw: netWorth(s), lpa: r2(r.production.reduce((t, p) => t + p.lpa, 0)), angels: r2(r.angelsShareL),
      // TS 회귀용
      hash: fnv(JSON.stringify(s)),
    }));
  }
  writeFileSync(`${OUT}/${c.name}.jsonl`, lines.join('\n') + '\n');
  summary.push(`${c.name}\t${lines.length}개월\t${s.status}\t끝 해시 ${fnv(JSON.stringify(s))}\t전체 ${fnv(lines.join('\n'))}`);
}
writeFileSync(`${OUT}/SUMMARY.tsv`, summary.join('\n') + '\n');
console.log(summary.join('\n'));
