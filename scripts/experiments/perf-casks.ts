// 캐스크가 많을 때의 비용 측정 (QoL 스마트 인벤토리 설계 전, 오너 "먼저 통 2,500개 성능 측정부터" 2026-11-10)
// 실행: npx tsx scripts/experiments/perf-casks.ts <기록 파일 또는 세이브.json> [출력 폴더]
// 원액 든 통을 복제해 100·500·1,000·2,500통으로 늘린 상태에서 ① 상태 복사(행동 1회 = structuredClone) ② 행동 1회(applyAction)
// ③ 월 진행 1회(advanceMonth) ④ 저장 JSON 크기·직렬화 ⑤ 필터(나이·종류)를 잰다. 출력 폴더를 주면 2,500통 기록 파일을 떨군다(화면 측정용).
// 게임 규칙은 바꾸지 않는다 — 복제한 통은 같은 숙성고 슬롯 규칙(assignSlot)을 따르지 않고 원래 슬롯을 그대로 쓴다(측정용)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { advanceMonth, applyAction, type GameState } from '../../src/sim';
import { parsePlayFile } from '../../src/store/playlog';

const path = process.argv[2];
const outDir = process.argv[3];
if (!path) { console.error('사용: npx tsx scripts/experiments/perf-casks.ts <파일.json> [출력 폴더]'); process.exit(1); }
const parsed = parsePlayFile(readFileSync(path, 'utf8'));
if ('error' in parsed) { console.error(parsed.error); process.exit(1); }
const base = parsed.save;

function inflate(s0: GameState, n: number): GameState {
  const s = structuredClone(s0);
  const filled = s.inventory.casks.filter((c) => c.contents);
  const keep = s.inventory.casks.filter((c) => !c.contents).slice(0, 0);
  const out = [...keep];
  for (let i = 0; out.length < n; i++) { const c = structuredClone(filled[i % filled.length]!); c.id = `X${i}`; out.push(c); }
  s.inventory.casks = out;
  return s;
}
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const time = (k: number, f: () => void) => { const t: number[] = []; for (let i = 0; i < k; i++) { const a = performance.now(); f(); t.push(performance.now() - a); } return median(t); };

console.log(`# 캐스크 수에 따른 비용 — 기준 세이브 ${base.month}개월째 · 원래 통 ${base.inventory.casks.length}개(원액 든 통 ${base.inventory.casks.filter((c) => c.contents).length})`);
console.log('| 통 수 | 상태 복사 | 행동 1회(마케팅 예산) | 월 진행 1회 | 저장 JSON | 직렬화 | 필터(10년 이상 몰트) |');
console.log('|---|---|---|---|---|---|---|');
for (const n of [100, 500, 1000, 2500]) {
  const s = inflate(base, n);
  const tClone = time(9, () => structuredClone(s));
  const tAct = time(9, () => applyAction(s, { type: 'setMarketing', amount: s.commerce.marketingBudget + 100_000 }));
  const tStep = time(3, () => advanceMonth(s));
  let json = '';
  const tJson = time(5, () => { json = JSON.stringify(s); });
  const tFilter = time(21, () => s.inventory.casks.filter((c) => c.contents && c.contents.kind === 'malt' && c.contents.oakMonths >= 120).length);
  console.log(`| ${n.toLocaleString()} | ${tClone.toFixed(1)}ms | ${tAct.toFixed(1)}ms | ${tStep.toFixed(0)}ms | ${(json.length / 1e6).toFixed(2)}MB | ${tJson.toFixed(1)}ms | ${tFilter.toFixed(2)}ms |`);
  if (outDir && n === 2500) { mkdirSync(outDir, { recursive: true }); writeFileSync(`${outDir}/casks-2500.json`, JSON.stringify({ kind: 'distillery-playtest', v: 1, exportedAt: new Date(0).toISOString(), playlog: null, save: s })); }
}
