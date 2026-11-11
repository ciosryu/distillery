// G01 향미 방향 레버 — 판 단위 스타일 경로 (game-program.md §4 PROD G01 · docs/design/prod-stage-t.md 「스타일 분류 v2」)
// 판정용 봇 P8(`mvp-human.ts`, MGT 소유)을 **고치지 않는다.** 실행할 때 P8 원본을 읽어 "레시피·통 종류"만 바꾼 사본을 만들어 돌리고 지운다(prod-hold-p8.ts와 같은 방식).
// P8 원본이 바뀌어 붙일 자리가 없으면 바로 멈춘다(조용히 틀린 값을 내지 않는다).
//
// 경로: X0와 같고 몰트 레시피(피트 여부)와 새로 사는·채우는 통 종류만 다르다. 통은 그 종류만 사고 그 종류에만 채운다(계열 비중 1 — 섞이지 않게).
//   통 수는 통 크기로 센다(P8 원본은 200L 기준). 숙성고 칸은 통 크기와 무관하게 1통 = 1칸이다(게임 규칙 그대로 — 큰 통이 칸당 리터가 많다)
//
// 실행: npx tsx scripts/experiments/prod-style-p8.ts [시드=10] [개월=180]   (TIER 기본 standard, 이벤트 켬 — P8과 같다)
//   MKT 시장 식 변형 위에서: SCRIPT=prod-style-p8.ts V=base,f2 npx tsx scripts/experiments/mkt-b1.ts [시드] [개월]  (mkt-b1이 이 폴더를 사본으로 복사해 그 위에서 돌린다)
//   ONLY=S0,SP,...   돌릴 경로(기본 아래 표 전부) · P8 환경 변수(METRICS·SPLIT 등) 그대로
//   DROP_EVENTS=peat_craze,…   진단용 — 그 이벤트를 모든 경로에서 뺀다(이벤트 추첨이 바뀌어 순자산 절대값은 기준 판과 다르다. 짝 비교만 본다)
//   끝에 PAIRED 줄: 같은 시드끼리 S0(기준) 대비 순자산 차이 평균·t·이긴 시드 수, CASKS 줄: 경로별 산 통 수·통값(판 평균)
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let src = readFileSync(join(here, 'mvp-human.ts'), 'utf8');
/** from이 P8에 정확히 한 번 있어야 붙인다 */
const patch = (from: string | RegExp, to: string) => {
  const n = typeof from === 'string' ? src.split(from).length - 1 : (src.match(new RegExp(from.source, from.flags.includes('g') ? from.flags : from.flags + 'g')) ?? []).length;
  if (n !== 1) throw new Error(`prod-style-p8: P8(mvp-human.ts)에서 붙일 자리가 ${n}곳이다(1곳이어야 한다) — ${String(from).slice(0, 60)}…  P8이 바뀌었으면 이 래퍼를 고친다`);
  src = src.replace(from, to);
};

// 1) 정책 필드 · 지금 도는 경로의 스타일 · 통 정의
patch('interface Policy { name: string;', "interface Policy { style?: { peat?: boolean; cask?: 'ex_bourbon_barrel' | 'oloroso_butt' | 'korean_oak_quarter' | 'mizunara_hogshead' }; name: string;");
patch('const DUMP = process.env.DUMP;', "const DUMP = process.env.DUMP;\nimport { CASKS as STYLE_CASKS } from '../../src/sim/content/production';\nlet STYLE: Policy['style'] = undefined; let STYLE_KEY = '';\nconst STYLE_BOUGHT = new Map<string, { n: number; won: number }>(); const STYLE_REV = new Map<string, Record<string, number>>();\n" +
  // 진단: DROP_EVENTS=peat_craze,… 이면 그 이벤트를 뺀다(모든 경로에 같이 — 이벤트 추첨이 바뀌므로 짝 비교만 본다)
  "for (const id of (process.env.DROP_EVENTS ?? '').split(',').filter(Boolean)) { const i = EVENTS.findIndex((e) => e.id === id); if (i < 0) throw new Error(`DROP_EVENTS: 없는 이벤트 ${id}`); EVENTS.splice(i, 1); }");
patch('function play(p: Policy, seed: number): Row {\n', 'function play(p: Policy, seed: number): Row {\n  STYLE = p.style; STYLE_KEY = `${p.name}|${seed}`;\n');
// 2) 레시피 — 피트 경로는 피티드 몰트 레시피로 주문한다
patch(
  "const recipe = (s: GameState, kind: 'soju' | 'malt') => s.production.recipes.find((r) => r.kind === kind && !r.mashBill.some((m) => m.ingredientId === 'malt_peated'))?.id;",
  "const recipe = (s: GameState, kind: 'soju' | 'malt') => s.production.recipes.find((r) => r.kind === kind && (kind === 'malt' && STYLE?.peat ? r.mashBill.some((m) => m.ingredientId === 'malt_peated') : !r.mashBill.some((m) => m.ingredientId === 'malt_peated')))?.id;",
);
// 3) 통입 — 그 경로의 통 종류만 사고 그 종류에만 채운다. 필요한 통 수는 통 크기로
patch('    const need = Math.ceil((lot.volumeL * lot.abv) / (200 * 0.635));\n', "    const CT = STYLE?.cask ?? 'ex_bourbon_barrel';\n    const need = Math.ceil((lot.volumeL * lot.abv) / (STYLE_CASKS[CT].sizeL * 0.635));\n");
patch('    const empty = s.inventory.casks.filter((c) => !c.contents && !c.contamination).length;\n', '    const empty = s.inventory.casks.filter((c) => !c.contents && !c.contamination && c.typeId === CT).length;\n');
patch(
  "s = act(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: Math.min(need - empty, room) });",
  "{ const before = s.finance.cash, n0 = s.inventory.casks.length; s = act(s, { type: 'buySpotCasks', caskType: CT, qty: Math.min(need - empty, room) }); const b = STYLE_BOUGHT.get(STYLE_KEY) ?? { n: 0, won: 0 }; STYLE_BOUGHT.set(STYLE_KEY, { n: b.n + s.inventory.casks.length - n0, won: b.won + before - s.finance.cash }); }",
);
patch('    const ids = s.inventory.casks.filter((c) => !c.contents && !c.contamination).slice(0, need).map((c) => c.id);\n', '    const ids = s.inventory.casks.filter((c) => !c.contents && !c.contamination && c.typeId === CT).slice(0, need).map((c) => c.id);\n');
// 진단: REV=1 이면 경로별로 매출 항목(국내 위스키·그 밖 국내 판매·수출(위스키는 시장별)·원액 계약·현물)과 지출 항목 상위를 판 평균으로 낸다
patch('    s = advanceMonth(s);\n', "    s = advanceMonth(s);\n    if (process.env.REV) { const r = s.history.reports.at(-1); if (r) { const b = STYLE_REV.get(STYLE_KEY) ?? {} as Record<string, number>; const cat = new Map(s.commerce.products.map((x) => [x.id, x.category])); const q = new Map(s.commerce.products.map((x) => [x.id, x.quality])); for (const x of r.sales) { const k = cat.get(x.productId) === 'whisky' ? '국내 위스키' : '국내 기타'; b[k] = (b[k] ?? 0) + x.revenue; if (k === '국내 위스키') { b['국내 위스키 병(만)'] = (b['국내 위스키 병(만)'] ?? 0) + x.bottles * 1e4; b['국내 위스키 수요(만)'] = (b['국내 위스키 수요(만)'] ?? 0) + x.demandBottles * 1e4; b['q×병'] = (b['q×병'] ?? 0) + (q.get(x.productId) ?? 0) * x.bottles; } } for (const x of r.exports ?? []) { b['수출 병(만)'] = (b['수출 병(만)'] ?? 0) + x.bottles * 1e4; b['수출 수요(만)'] = (b['수출 수요(만)'] ?? 0) + x.demandBottles * 1e4; if (cat.get(x.productId) === 'whisky') b[`위스키 수출:${x.marketId}`] = (b[`위스키 수출:${x.marketId}`] ?? 0) + x.revenue; } b['수출'] = (b['수출'] ?? 0) + (r.exportRevenue ?? 0); b['원액 계약'] = (b['원액 계약'] ?? 0) + r.bulkRevenue; b['현물'] = (b['현물'] ?? 0) + (r.spotBulkRevenue ?? 0); b['매출 합'] = (b['매출 합'] ?? 0) + r.revenue; for (const [k, v] of Object.entries(r.expenses)) b[`지출:${k}`] = (b[`지출:${k}`] ?? 0) + v; STYLE_REV.set(STYLE_KEY, b); } }\n");
// 4) 경로 — P8 정책 목록 앞에 붙인다
patch(/(const P8_POLICIES: Policy\[\] = \[\n)/, `$1  P8('S0 기준(언피트 × ex-버번 = X0)', {}),
  P8('SP 피트 × ex-버번', { style: { peat: true } }),
  P8('SS 언피트 × 올로로소 셰리 벗', { style: { cask: 'oloroso_butt' } }),
  P8('SK 언피트 × 한국 참나무 쿼터', { style: { cask: 'korean_oak_quarter' } }),
  P8('SM 언피트 × 미즈나라 혹스헤드', { style: { cask: 'mizunara_hogshead' } }),
  P8('SPS 피트 × 올로로소 셰리 벗', { style: { peat: true, cask: 'oloroso_butt' } }),
`);
// 5) 이 경로들만 돈다 — P8의 ONLY 필터(#289)는 그대로
patch(
  /const RUN = ONLY \? ALL_RUN\.filter\(\(p\) => ONLY\.has\(p\.name\.split\(' '\)\[0\]!\)\) : ALL_RUN;/,
  "const RUN = ALL_RUN.filter((p) => ['S0', 'SP', 'SS', 'SK', 'SM', 'SPS'].includes(p.name.split(' ')[0]!) && (!ONLY || ONLY.has(p.name.split(' ')[0]!)));",
);
// 6) 끝 — 같은 시드 짝 비교와 산 통
src += `
{
  const nw = new Map<string, number[]>();
  for (const [k, rows] of ALL) nw.set(k.split(' ')[0]!, rows.map((r) => r.nw));
  const pair = (a: string, b: string) => {
    const x = nw.get(a), y = nw.get(b);
    if (!x || !y) return;
    const d = x.map((v, i) => v - y[i]!).filter(Number.isFinite);
    if (d.length < 2) { console.log(\`PAIRED \${a} − \${b}: 생존 판 부족\`); return; }
    const m = d.reduce((t, v) => t + v, 0) / d.length, sd = Math.sqrt(d.reduce((t, v) => t + (v - m) ** 2, 0) / (d.length - 1));
    console.log(\`PAIRED \${a} − \${b}: \${(m / 1e8).toFixed(2)}억 · t \${(m / (sd / Math.sqrt(d.length))).toFixed(1)} · 이긴 시드 \${d.filter((v) => v > 0).length}/\${d.length}\`);
  };
  for (const a of ['SP', 'SS', 'SK', 'SM', 'SPS']) pair(a, 'S0');
  const bought = new Map<string, { n: number; won: number }[]>();
  for (const [k, v] of STYLE_BOUGHT) { const n = k.split('|')[0]!.split(' ')[0]!; bought.set(n, [...(bought.get(n) ?? []), v]); }
  if (process.env.REV) {
    const by = new Map<string, Record<string, number>[]>();
    for (const [k, v] of STYLE_REV) { const n = k.split('|')[0]!.split(' ')[0]!; by.set(n, [...(by.get(n) ?? []), v]); }
    const avg = (rows: Record<string, number>[], key: string) => rows.reduce((t, r) => t + (r[key] ?? 0), 0) / rows.length / 1e8;
    const keys = [...new Set([...by.values()].flat().flatMap((r) => Object.keys(r)))];
    const base = by.get('S0');
    const shown = keys.filter((k) => !k.startsWith('지출:') || (base && [...by.values()].some((rows) => Math.abs(avg(rows, k) - avg(base, k)) >= 0.05)));
    console.log(\`REV (판 평균, 억 — 지출은 S0와 0.05억 이상 다른 항목만) | 경로 | \${shown.join(' | ')} |\`);
    for (const [n, rows] of by) console.log(\`REV | \${n} | \${shown.map((k) => (k === 'q×병' ? (rows.reduce((t, r) => t + (r['q×병'] ?? 0), 0) / Math.max(1, rows.reduce((t, r) => t + (r['국내 위스키 병(만)'] ?? 0) / 1e4, 0))).toFixed(1) + '(품질)' : avg(rows, k).toFixed(2))).join(' | ')} |\`);
  }
  console.log('CASKS ' + [...bought].map(([n, v]) => \`\${n} \${(v.reduce((a, b) => a + b.n, 0) / v.length).toFixed(0)}통 \${(v.reduce((a, b) => a + b.won, 0) / v.length / 1e8).toFixed(2)}억\`).join(' · '));
}
`;

process.env.P8 = '1';
process.env.TIER ??= 'standard';
const gen = join(here, `_gen-prod-style-p8-${process.pid}.ts`); // 프로세스마다 따로 — 여러 개를 함께 돌려도 서로 지우지 않게
writeFileSync(gen, src);
try { await import(pathToFileURL(gen).href); } finally { unlinkSync(gen); } // 실행할 때 만든 파일이라 정적 경로로 가져오지 않는다(타입 검사)
