// 틱 성능 측정 — 캐스크 수가 늘 때 월 처리·복제·세이브 크기가 어떻게 커지는지 본다 (docs/design/architecture.md §2)
// 실행: npm run bench [-- 250 1000 2000 5000]
// 실제 생산한 몰트 원액을 N개 캐스크에 복제해 넣고, 워밍업 2개월 뒤 6개월의 중앙값을 잰다.
// 브라우저(V8 같은 계열이라도 기기·탭 상태에 따라)와 Node의 수치는 다르다 — 추세 비교용이다.
import { advanceMonth, applyAction, newGame, type GameState } from '../src/sim';
import { emptyCaskOf } from '../src/sim/newGame';
import { assignSlot } from '../src/sim/ops';

const SIZES = process.argv.slice(2).map(Number).filter((n) => n > 0);
const ns = SIZES.length ? SIZES : [250, 1000, 2000, 5000];

function maltLot(): NonNullable<GameState['casks'][number]['contents']> {
  let s = newGame({ seed: 1, region: 'KR', startingCash: 50_000_000_000 });
  const r = s.recipes.find((x) => x.kind === 'malt');
  if (!r) throw new Error('몰트 레시피 프리셋이 없습니다');
  s = applyAction(s, { type: 'setOrder', recipeId: r.id, batchesPerMonth: 1 }).state;
  s = advanceMonth(s);
  const lot = s.lots.find((l) => l.kind === 'malt');
  if (!lot) throw new Error('몰트 원액이 생산되지 않았습니다');
  return { ...lot, volumeL: 200, abv: 0.635 };
}

function stateWith(n: number, lot: ReturnType<typeof maltLot>): { s: GameState; slotMs: number } {
  const s = newGame({ seed: 1, region: 'KR', startingCash: 1e15 });
  s.warehouseBase = n + 100;
  for (let i = 0; i < n; i++) {
    const c = emptyCaskOf(s, 'ex_bourbon_barrel');
    c.contents = { ...lot, id: `${lot.id}-${i}`, flavor: { ...lot.flavor } };
    c.filledMonth = 0;
    s.casks.push(c);
  }
  // 통입 시 자리 배정을 한꺼번에 한 것과 같다 — 캐스크마다 전체 점유를 다시 센다(O(n²))
  const t = performance.now();
  for (const c of s.casks) if (c.contents) assignSlot(s, c);
  return { s, slotMs: performance.now() - t };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const lot = maltLot();
console.log(`node ${process.version} · 원액 향미 축 ${Object.keys(lot.flavor).length}개`);
console.log('캐스크 |  월 처리(중앙값) | structuredClone | 세이브 JSON(백만 자) | 캐스크당 JSON(자) | 전체 자리 배정(O(n²))');
for (const n of ns) {
  let { s, slotMs } = stateWith(n, lot);
  for (let i = 0; i < 2; i++) s = advanceMonth(s);
  const months: number[] = [];
  for (let i = 0; i < 6; i++) { const t = performance.now(); s = advanceMonth(s); months.push(performance.now() - t); }
  let t = performance.now();
  for (let i = 0; i < 5; i++) structuredClone(s);
  const cloneMs = (performance.now() - t) / 5;
  const json = JSON.stringify(s);
  const filled = s.casks.find((c) => c.contents);
  console.log([
    String(n).padStart(6),
    `${median(months).toFixed(1).padStart(10)} ms`,
    `${cloneMs.toFixed(1).padStart(12)} ms`,
    `${(json.length / 1e6).toFixed(2).padStart(10)}`,
    `${String(filled ? JSON.stringify(filled).length : 0).padStart(10)}`,
    `${slotMs.toFixed(0).padStart(10)} ms`,
    s.status === 'running' ? '' : `(${s.status})`,
  ].join(' | '));
}
