// T4(9차 판 뒤 PM 2026-11-25) — 통 종류 · 활성도별 12 · 15 · 18년 단일 통 품질 (MGT, 읽기 전용 측정 — 게임 규칙 함수 그대로)
//   npx tsx scripts/experiments/mgt-aged-quality.ts [시드 수=20]
// 판마다: v16 표준 판을 만들고 현금을 크게 둔 뒤(파산 · 돈 걱정 빼기) 몰트를 1배치 증류해 아래 통에 하나씩 넣고 생산을 멈춘다.
//   새 ex-버번(활성도 1.0) · 리필 ex-버번(#408 주문, 0.6) · 새 올로로소 벗 500L(1.0) · 셰리 혹스헤드 250L(1.0) · 2차 올로로소 벗(채웠다 뺀 상태로 놓음, 0.6)
//   → 매달 넘기며 목재 144 · 180 · 216개월째에 그 통 하나만 46%로 병입했을 때의 참 품질(`previewBlend` evaluation.quality)과 탄닌 · 감점(`tanninOutlook`)을 적는다
// 한계: 통 하나 · 첫 숙성고 맨 아래 칸 그대로 · 사건 끔(화재 · 붕괴로 통이 사라지지 않게). 통의 숨은 오염 · 레어는 판 난수 그대로 — 판마다 섞여 나온다
import { newScenarioGame } from '../../src/sim/newScenario';
import { advanceMonth, applyAction, type GameState } from '../../src/sim';
import { previewBlend } from '../../src/sim/blending';
import { tanninOutlook } from '../../src/sim/warehouse';
import { EVENTS } from '../../src/sim/content/events';
import { refillState } from '../../src/sim/maturation';

EVENTS.splice(0); // 사건 끔(화재 · 붕괴로 통이 사라지면 숙성만 볼 수 없다 — P8 옛 묶음과 같은 방식)

const N = Number(process.argv[2] ?? 20);
const KINDS = [
  { key: '새 버번', buy: { caskType: 'ex_bourbon_barrel', refill: false } },
  { key: '리필 버번', buy: { caskType: 'ex_bourbon_barrel', refill: true } },
  { key: '새 올로로소 벗', buy: { caskType: 'oloroso_butt', refill: false } },
  { key: '셰리 혹스헤드', buy: { caskType: 'sherry_hogshead', refill: false } },
  { key: '2차 올로로소 벗', buy: { caskType: 'oloroso_butt', refill: false }, second: true },
] as { key: string; buy: { caskType: 'ex_bourbon_barrel' | 'oloroso_butt' | 'sherry_hogshead'; refill: boolean }; second?: boolean }[];
const AT = [144, 180, 216];
const act = (s: GameState, a: Parameters<typeof applyAction>[1]) => { const r = applyAction(s, a); if (r.error) throw new Error(`${a.type}: ${r.error}`); return r.state; };
const out: Record<string, Record<number, { q: number[]; tan: number[]; pen: number[] }>> = {};
for (const k of KINDS) out[k.key] = Object.fromEntries(AT.map((m) => [m, { q: [], tan: [], pen: [] }]));

for (let seed = 1; seed <= N; seed++) {
  let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed });
  s.finance.cash = 1e13;
  const before = new Set(s.inventory.casks.map((c) => c.id));
  for (const k of KINDS) s = act(s, { type: 'buyCasks', caskType: k.buy.caskType, qty: 1, ...(k.buy.refill ? { refill: true } : {}) } as never);
  const malt = s.production.recipes.find((r) => r.kind === 'malt' && !r.mashBill.some((m) => m.ingredientId === 'malt_peated'))!.id;
  s = act(s, { type: 'setOrder', recipeId: malt, batchesPerMonth: 3 });
  for (const r of s.production.recipes.filter((x) => x.kind !== 'malt')) { const a = applyAction(s, { type: 'setOrder', recipeId: r.id, batchesPerMonth: 0 }); if (!a.error) s = a.state; }
  while (s.inventory.caskOrders.length || !s.inventory.lots.some((l) => l.kind === 'malt' && l.volumeL > 1500)) s = advanceMonth(s);
  const arrived = s.inventory.casks.filter((c) => !before.has(c.id));
  const used = new Set<string>();
  const pick = (k: (typeof KINDS)[number]) => { const c = arrived.find((x) => !used.has(x.id) && x.typeId === k.buy.caskType && (k.buy.refill ? x.activity < 0.99 : x.activity >= 0.99) && !x.contents); if (c) used.add(c.id); return c; };
  const ids = new Map<string, string>();
  for (const k of KINDS) {
    const c = pick(k);
    const lot = s.inventory.lots.filter((l) => l.kind === 'malt').sort((a, b) => b.volumeL - a.volumeL)[0];
    if (!c || !lot) continue;
    if (k.second) { const cur = s.inventory.casks.find((x) => x.id === c.id)!; Object.assign(cur, refillState(cur)); } // 채웠다 뺀 벗과 같은 상태(활성도 ×0.6 · 시즈닝 ×0.35 · 1회 사용) — 사람은 원액 빼기(unfillCask)로 만든다. 측정용으로 상태만 맞춘다
    s = act(s, { type: 'fillCasks', lotId: lot.id, caskIds: [c.id], entryAbv: 0.635 });
    ids.set(k.key, c.id);
  }
  for (const r of s.production.recipes) { const a = applyAction(s, { type: 'setOrder', recipeId: r.id, batchesPerMonth: 0 }); if (!a.error) s = a.state; }
  const start = s.month;
  while (s.month - start <= Math.max(...AT) + 1) {
    s = advanceMonth(s);
    s.finance.cash = Math.max(s.finance.cash, 1e12);
    for (const k of KINDS) {
      const c = s.inventory.casks.find((x) => x.id === ids.get(k.key));
      if (!c?.contents) continue;
      const m = c.contents.oakMonths;
      if (!AT.includes(m) || out[k.key]![m]!.q.length >= seed) continue;
      const p = previewBlend(s, [{ source: 'cask', id: c.id, liters: c.contents.volumeL }], { name: 't', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' });
      const t = tanninOutlook(s, c, m);
      if (p.evaluation) { out[k.key]![m]!.q.push(p.evaluation.quality); out[k.key]![m]!.tan.push(t?.tannin ?? NaN); out[k.key]![m]!.pen.push(t?.penalty ?? NaN); }
    }
  }
}
const med = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)]! : NaN; };
const f = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '—');
console.log(`| 통 | ${AT.map((m) => `${m / 12}년 품질 중앙 (P10 · P90) · n`).join(' | ')} | ${AT.map((m) => `${m / 12}년 탄닌 · 감점`).join(' | ')} |`);
console.log(`|---|${AT.map(() => '---').join('|')}|${AT.map(() => '---').join('|')}|`);
for (const k of KINDS) {
  const row = AT.map((m) => { const q = [...out[k.key]![m]!.q].sort((a, b) => a - b); return q.length ? `${f(med(q))} (${f(q[Math.floor(q.length * 0.1)]!)} · ${f(q[Math.min(q.length - 1, Math.floor(q.length * 0.9))]!)}) · ${q.length}` : '—'; });
  const tan = AT.map((m) => `${f(med(out[k.key]![m]!.tan))} · ${f(med(out[k.key]![m]!.pen))}`);
  console.log(`| ${k.key} | ${row.join(' | ')} | ${tan.join(' | ')} |`);
}
