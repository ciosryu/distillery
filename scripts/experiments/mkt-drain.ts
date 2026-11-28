// [결정 #441] ① 정책 D 「원액 소화」 시나리오 (MKT · 읽기 실험 — 게임 규칙 아님). 10차 70 · 153개월 세이브에서 고른 제품에 D를 켜고 12개월 진행해
// 값 · 가드 · 재고 · 판매 · 품절(T8) 달을 적는다. 비교: 같은 세이브를 아무것도 바꾸지 않고 12개월(오너 값 그대로).
// 쓰는 법: npx tsx scripts/experiments/mkt-drain.ts [기간=12] [개월=12]
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../../src/store/playlog';
import { applyAction, type GameState } from '../../src/sim';
import { advanceMonth } from '../../src/sim/step';
import { currentSuggested } from '../../src/sim/economics';
import { bottleMargin } from '../../src/sim/market';
import { outboundLogistics } from '../../src/sim/sites';
import { matchingCaskBottles } from '../../src/sim/pricePolicy';

const H = Number(process.argv[2] ?? 12), N = Number(process.argv[3] ?? 12);
const CASES: { file: string; label: string; names: string[] }[] = [
  { file: 'distillery-mvp-standard-y6m11-202611261003.json', label: '70개월', names: ['김포 소주', '김포 블렌디드', '김포 더 퍼스트'] },
  { file: 'distillery-mvp-standard-y13m10-202611270816.json', label: '153개월', names: ['김포 시그니처 블랜드', '김포 블렌디드', '김포 오크소주'] },
];
const load = (f: string): GameState => { const r = parsePlayFile(readFileSync(`docs/playtest/10/${f}`, 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };
const k = (v: number) => `${(v / 1000).toFixed(1)}k`;

function run(s0: GameState, names: string[], drain: boolean) {
  let s = structuredClone(s0);
  if (drain) for (const n of names) { const p = s.commerce.products.find((x) => x.name === n)!; const r = applyAction(s, { type: 'setPricePolicy', productId: p.id, mode: 'drain', horizon: H }); if (r.error) throw new Error(r.error); s = r.state; }
  const rows: Record<string, string[]> = Object.fromEntries(names.map((n) => [n, []]));
  const tot: Record<string, { sold: number; rev: number; con: number; stockout: number; so: number }> = Object.fromEntries(names.map((n) => [n, { sold: 0, rev: 0, con: 0, stockout: 0, so: 0 }]));
  for (let m = 0; m < N; m++) {
    s = advanceMonth(s);
    const r = s.history.reports.at(-1)!;
    for (const n of names) {
      const p = s.commerce.products.find((x) => x.name === n);
      if (!p) { rows[n]!.push('—'); continue; }
      const x = r.sales.filter((y) => y.productId === p.id);
      const sold = x.reduce((t, y) => t + y.bottles, 0), rev = x.reduce((t, y) => t + y.revenue, 0);
      const so = r.stockoutDemand?.find((y) => y.productId === p.id)?.bottles ?? 0;
      const sug = currentSuggested(s, p);
      const con = sold > 0 ? rev - sold * (p.price - bottleMargin(p, outboundLogistics(s)).perBottle) : 0; // 병당 비용 = 값 − 병당 공헌(그달 값 기준 · 어림)
      tot[n]!.sold += sold; tot[n]!.rev += rev; tot[n]!.con += con; tot[n]!.so += so; if (so > 0 || (p.stockBottles <= 0 && sold === 0)) tot[n]!.stockout++;
      rows[n]!.push(`${k(p.price)}(×${(p.price / sug).toFixed(2)}) 판${sold} 재${p.stockBottles} 원${matchingCaskBottles(s, p)}${so ? ` 품절${so}` : ''}`);
    }
  }
  return { rows, tot };
}

for (const c of CASES) {
  const s0 = load(c.file);
  console.log(`\n=== 10차 ${c.label} · D 기간 ${H}개월 · ${N}개월 진행 ===`);
  for (const n of c.names) {
    const p = s0.commerce.products.find((x) => x.name === n)!;
    console.log(`  ${n}: 시작 ${k(p.price)}(×${(p.price / currentSuggested(s0, p)).toFixed(2)}) · 병 ${p.stockBottles} · 맞는 원액 ${matchingCaskBottles(s0, p)}병 · 자동 납품 ${p.autoRestock ? '켬' : '끔'}`);
  }
  const base = run(s0, c.names, false), d = run(s0, c.names, true);
  for (const n of c.names) {
    console.log(`  [${n}]`);
    console.log(`    오너 값 그대로: 판매 ${base.tot[n]!.sold}병 · 매출 ${(base.tot[n]!.rev / 1e6).toFixed(1)}백만 · 공헌 ${(base.tot[n]!.con / 1e6).toFixed(1)}백만 · 품절 달 ${base.tot[n]!.stockout} · T8 못 판 ${base.tot[n]!.so}병`);
    console.log(`    D(${H}개월):     판매 ${d.tot[n]!.sold}병 · 매출 ${(d.tot[n]!.rev / 1e6).toFixed(1)}백만 · 공헌 ${(d.tot[n]!.con / 1e6).toFixed(1)}백만 · 품절 달 ${d.tot[n]!.stockout} · T8 못 판 ${d.tot[n]!.so}병`);
    d.rows[n]!.forEach((x, i) => console.log(`      +${i + 1} ${x}`));
  }
}
