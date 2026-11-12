// 실험 B — 샘플링의 가치 (REQ-PROD-4, docs/design/prod-stage-t.md 「요구사항」 실험 명세 B · G08-PROD-1)
// 판정용 봇 P8(`mvp-human.ts`, MGT 소유)을 **고치지 않는다.** 실행할 때 P8 원본을 읽어 "샘플 정보를 쓰는 결정"만 덧붙인 사본을 만들어 돌리고 지운다(prod-hold-p8.ts와 같은 방식).
// P8 원본이 바뀌어 붙일 자리가 없으면 바로 멈춘다(조용히 틀린 값을 내지 않는다).
//
// 기준: P8 X19(X0 + 플래그십 병입) — 시나리오 게임은 자동 샘플이 기본으로 켜져 있다(매 턴 여력만큼, #201). P8은 샘플 정보를 어떤 결정에도 쓰지 않는다(통을 숙성 연수로만 고른다).
// 경로(정책 필드 samp):
//   BS1 = X19 그대로(자동 샘플 기본 — 정보는 쌓이지만 결정에 쓰지 않는다)
//   BS0 = 자동 샘플 끔 — "필수 클릭" 실패 모드: 샘플 없이도 같은 판이 되는가
//   BF  = 플래그십 예비(보호) 통과 플래그십 병입 통을 추정 품질 높은 순으로(기록 없으면 −1 → 숙성 연수 순)
//   BR  = 알려진 레어 통(rareKnown)을 36개월이 차면 단독 병입(「레어 싱글 캐스크」 — 게임이 rareSingleCask 표기를 붙인다)
//   BH  = 핸드필 통을 추정 품질 높은 순으로(지금은 가장 어린 통)
//   BA  = BF + BR + BH
//   BA0 = BA + 자동 샘플 끔 — 같은 규칙을 정보 없이(정보의 값 = BA − BA0)
// 실행: npx tsx scripts/experiments/prod-sample-p8.ts [시드=10] [개월=180]   (TIER 기본 standard, 이벤트 켬 — P8과 같다)
//   METRICS=1 이면 P8 판정 지표(플래그십·등급 S/A/B/C/F)를 같이 낸다 · ONLY=BS1,BF,…
//   끝에 PAIRED(같은 시드 순자산 짝 비교)와 SAMPLE 표(레어 발견·레어 단독 병입·그 매출·핸드필 매출·자동 샘플 비용)
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let src = readFileSync(join(here, 'mvp-human.ts'), 'utf8');
/** from이 P8에 정확히 한 번 있어야 붙인다 */
const patch = (from: string | RegExp, to: string) => {
  const n = typeof from === 'string' ? src.split(from).length - 1 : (src.match(new RegExp(from.source, from.flags.includes('g') ? from.flags : from.flags + 'g')) ?? []).length;
  if (n !== 1) throw new Error(`prod-sample-p8: P8(mvp-human.ts)에서 붙일 자리가 ${n}곳이다(1곳이어야 한다) — ${String(from).slice(0, 60)}…  P8이 바뀌었으면 이 래퍼를 고친다`);
  src = src.replace(from, to);
};

// 1) 정책 필드 · 추정 품질 읽기 · 기록
patch('interface Policy { name: string;', 'interface Policy { samp?: { off?: boolean; flag?: boolean; rare?: boolean; hand?: boolean }; name: string;');
patch("import { isFlagshipCandidate } from '../../src/sim/delegateCheck';", "import { isFlagshipCandidate } from '../../src/sim/delegateCheck';\nimport { knownReads as __reads } from '../../src/sim/blendTable';");
patch('const DUMP = process.env.DUMP;', `const DUMP = process.env.DUMP;
/** 추정 품질(샘플 기록 — 자기 기록 → 형제 기록), 기록이 없으면 −1 */
const __est = (s: GameState) => { const k = __reads(s); return (c: { id: string }) => k.get(c.id)?.estQuality ?? -1; };
const SAMPSTAT = new Map<string, { rare: Set<string>; rareBottled: number; rareRev: number; handRev: number; sampleCost: number }>();
let SAMPKEY = '';`);
// 2) 판 시작 — 자동 샘플 끄기
patch("  let s = applyTierKnobs(newScenarioGame({ scenarioId: 'mvp_kr', tierId: TIER, loanAmount: LOAN, seed }));\n",
  "  let s = applyTierKnobs(newScenarioGame({ scenarioId: 'mvp_kr', tierId: TIER, loanAmount: LOAN, seed }));\n  SAMPKEY = `${p.name}|${seed}`;\n  if (p.samp?.off) s = act(s, { type: 'setAutoSample', settings: { off: true } });\n");
// 3) 플래그십 — 예비(보호) 통과 병입 통을 추정 품질 순으로
const byAgeDesc = '(a, b) => b.contents!.oakMonths - a.contents!.oakMonths';
const byEstThenAge = `((e) => (a: { id: string; contents?: { oakMonths: number } | null }, b: { id: string; contents?: { oakMonths: number } | null }) => e(b) - e(a) || b.contents!.oakMonths - a.contents!.oakMonths)(__est(s))`;
patch(`.sort(${byAgeDesc}).slice(0, n).map((c) => c.id) : [];`, `.sort(p.samp?.flag ? ${byEstThenAge} : ${byAgeDesc}).slice(0, n).map((c) => c.id) : [];`);
patch(`.sort(${byAgeDesc}).slice(0, p.protect || 2);`, `.sort(p.samp?.flag ? ${byEstThenAge} : ${byAgeDesc}).slice(0, p.protect || 2);`);
// 4) 핸드필 — 추정 품질 높은 통
patch('.sort((a, b) => a.contents!.oakMonths - b.contents!.oakMonths)[0];\n  return c ? act(s, { type: \'setHandfillCask\', caskId: c.id }) : s;',
  ".sort(p.samp?.hand ? ((e) => (a: { id: string; contents?: { oakMonths: number } | null }, b: { id: string; contents?: { oakMonths: number } | null }) => e(b) - e(a) || a.contents!.oakMonths - b.contents!.oakMonths)(__est(s)) : (a, b) => a.contents!.oakMonths - b.contents!.oakMonths)[0];\n  return c ? act(s, { type: 'setHandfillCask', caskId: c.id }) : s;");
// 5) 레어 — 알려진 레어 통을 36개월이 차면 단독 병입(위스키 병입 앞)
patch("  const stock = stockOf(s, 'whisky');\n", `  if (p.samp?.rare) {
    const keep = keptCasks(s, p);
    for (const c of s.inventory.casks.filter((x) => x.contents && !x.owner && !x.handfill && x.rare && x.rareKnown && x.contents.kind === 'malt' && x.contents.oakMonths >= 36 && !keep.has(x.id))) {
      const before = s.commerce.products.length;
      s = bottleAs(s, { ...p, lineup: undefined }, [{ source: 'cask', id: c.id, liters: c.contents!.volumeL }], { name: \`레어 싱글 캐스크 \${c.id}\`, targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' }, 'whisky');
      if (s.commerce.products.length > before) { const b = SAMPSTAT.get(SAMPKEY); if (b) b.rareBottled++; }
    }
  }
  const stock = stockOf(s, 'whisky');
`);
// 6) 매달 기록 — 레어 발견(통), 레어 단독 제품 매출, 핸드필 매출(결산 메모), 자동 샘플 비용
patch('    s = advanceMonth(s);\n', `    s = advanceMonth(s);
    { const b = SAMPSTAT.get(SAMPKEY) ?? { rare: new Set<string>(), rareBottled: 0, rareRev: 0, handRev: 0, sampleCost: 0 }; const r = s.history.reports.at(-1);
      for (const c of s.inventory.casks) if (c.rare && c.rareKnown) b.rare.add(\`\${c.id}|\${c.filledMonth ?? -1}\`);
      if (r) { const rareIds = new Set(s.commerce.products.filter((x) => x.rareSingleCask).map((x) => x.id)); for (const x of r.sales) if (rareIds.has(x.productId)) b.rareRev += x.revenue;
        for (const n of r.notes) { const mm = n.match(/^핸드필 \\d+병 \\(([\\d,]+)원\\)/); if (mm) b.handRev += Number(mm[1]!.replace(/,/g, '')); }
        b.sampleCost += r.expenses['자동 샘플'] ?? 0; }
      SAMPSTAT.set(SAMPKEY, b); }
`);
// 7) 경로 — P8 정책 목록 앞에, 이 경로들만 돈다
const BASE = "flagship: true";
patch(/(const P8_POLICIES: Policy\[\] = \[\n)/, `$1  P8('BS1 X19 그대로(자동 샘플 기본)', { ${BASE} }),
  P8('BS0 자동 샘플 끔', { ${BASE}, samp: { off: true } }),
  P8('BF 플래그십 통을 추정 품질로', { ${BASE}, samp: { flag: true } }),
  P8('BR 알려진 레어 통 단독 병입', { ${BASE}, samp: { rare: true } }),
  P8('BH 핸드필 통을 추정 품질로', { ${BASE}, samp: { hand: true } }),
  P8('BA BF + BR + BH', { ${BASE}, samp: { flag: true, rare: true, hand: true } }),
  P8('BA0 BA + 자동 샘플 끔(정보 없이 같은 규칙)', { ${BASE}, samp: { off: true, flag: true, rare: true, hand: true } }),
`);
patch(/const RUN = ONLY \? ALL_RUN\.filter\(\(p\) => ONLY\.has\(p\.name\.split\(' '\)\[0\]!\)\) : ALL_RUN;/,
  "const RUN = ALL_RUN.filter((p) => ['BS1', 'BS0', 'BF', 'BR', 'BH', 'BA', 'BA0'].includes(p.name.split(' ')[0]!) && (!ONLY || ONLY.has(p.name.split(' ')[0]!)));");
// 8) 끝 — 짝 비교와 샘플 표
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
    console.log(\`PAIRED \${a} − \${b}: \${(m / 1e8).toFixed(2)}억 · t \${sd > 0 ? (m / (sd / Math.sqrt(d.length))).toFixed(1) : '—'} · 이긴 시드 \${d.filter((v) => v > 0).length}/\${d.length}\`);
  };
  for (const a of ['BS0', 'BF', 'BR', 'BH', 'BA']) pair(a, 'BS1');
  pair('BA', 'BA0');
  const by = new Map<string, { rare: Set<string>; rareBottled: number; rareRev: number; handRev: number; sampleCost: number }[]>();
  for (const [k, v] of SAMPSTAT) { const n = k.split('|')[0]!.split(' ')[0]!; by.set(n, [...(by.get(n) ?? []), v]); }
  console.log('\\n### SAMPLE — 경로별 판 평균');
  console.log('| 경로 | 레어 발견(통) | 레어 단독 병입(제품) | 레어 단독 매출 | 핸드필 매출 | 자동 샘플 비용 |\\n|---|---|---|---|---|---|');
  const av = (v: number[]) => v.reduce((t, x) => t + x, 0) / Math.max(1, v.length);
  for (const [n, v] of by) console.log(\`| \${n} | \${av(v.map((x) => x.rare.size)).toFixed(1)} | \${av(v.map((x) => x.rareBottled)).toFixed(1)} | \${(av(v.map((x) => x.rareRev)) / 1e8).toFixed(2)}억 | \${(av(v.map((x) => x.handRev)) / 1e8).toFixed(2)}억 | \${(av(v.map((x) => x.sampleCost)) / 1e8).toFixed(2)}억 |\`);
}
`;

process.env.P8 = '1';
process.env.TIER ??= 'standard';
const gen = join(here, `_gen-prod-sample-p8-${process.pid}.ts`); // 프로세스마다 따로 — 여러 개를 함께 돌려도 서로 지우지 않게
writeFileSync(gen, src);
try { await import(pathToFileURL(gen).href); } finally { unlinkSync(gen); } // 실행할 때 만든 파일이라 정적 경로로 가져오지 않는다(타입 검사)
