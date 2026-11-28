// [결정 #441] ② · ③ B 수리 시나리오 (MKT · 읽기 실험). 10차 70 · 153개월 세이브에서 국내 제품 모두 B로 켜고 12개월:
// 값이 방향을 바꾼 횟수(지그재그) · 한 달에 이 제품 판매가 전달의 30% 아래로 꺼진 횟수 · 국내 판매 · 공헌 합. main(옛 B)과 이 PR(새 B)을 같은 스크립트로 돌린다
// 쓰는 법: npx tsx scripts/experiments/mkt-bfix.ts [개월=12]
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../../src/store/playlog';
import { applyAction, type GameState } from '../../src/sim';
import { advanceMonth } from '../../src/sim/step';
import { bottleMargin } from '../../src/sim/market';
import { outboundLogistics } from '../../src/sim/sites';

const N = Number(process.argv[2] ?? 12);
const FILES = [['70개월', 'distillery-mvp-standard-y6m11-202611261003.json'], ['153개월', 'distillery-mvp-standard-y13m10-202611270816.json']] as const;
for (const [label, f] of FILES) {
  const r = parsePlayFile(readFileSync(`docs/playtest/10/${f}`, 'utf8')); if ('error' in r) throw new Error(r.error);
  let s: GameState = r.save;
  const ids = s.commerce.products.filter((p) => !p.dutyFreeOnly).map((p) => p.id);
  for (const id of ids) s = applyAction(s, { type: 'setPricePolicy', productId: id, mode: 'profit' }).state;
  const prices = new Map(ids.map((id) => [id, [s.commerce.products.find((p) => p.id === id)!.price]]));
  const sold = new Map(ids.map((id) => [id, [] as number[]]));
  let bottles = 0, con = 0;
  for (let m = 0; m < N; m++) {
    s = advanceMonth(s);
    const rep = s.history.reports.at(-1)!;
    for (const id of ids) {
      const p = s.commerce.products.find((x) => x.id === id); if (!p) continue;
      prices.get(id)!.push(p.price);
      const x = rep.sales.filter((y) => y.productId === id);
      const b = x.reduce((t, y) => t + y.bottles, 0), rev = x.reduce((t, y) => t + y.revenue, 0);
      sold.get(id)!.push(b); bottles += b; con += b > 0 ? rev - b * (p.price - bottleMargin(p, outboundLogistics(s)).perBottle) : 0;
    }
  }
  let zig = 0, crash = 0, moves = 0;
  for (const id of ids) {
    const ps = prices.get(id)!; let dir = 0;
    for (let i = 1; i < ps.length; i++) { const d = Math.sign(ps[i]! - ps[i - 1]!); if (d !== 0) { moves++; if (dir !== 0 && d !== dir) zig++; dir = d; } }
    const ss = sold.get(id)!; for (let i = 1; i < ss.length; i++) if (ss[i - 1]! >= 50 && ss[i]! < ss[i - 1]! * 0.3 && (s.commerce.products.find((x) => x.id === id)?.stockBottles ?? 0) > 0) crash++;
  }
  console.log(`${label} · 제품 ${ids.length} · ${N}개월: 값 바뀜 ${moves} · 방향 뒤집힘(지그재그) ${zig} · 판매 꺼짐(전달 30% 아래, 재고 있음) ${crash} · 국내 판매 ${bottles}병 · 공헌 ${(con / 1e8).toFixed(2)}억`);
}
