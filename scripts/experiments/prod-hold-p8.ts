// PROD-A 장기 숙성 투자 모델 — 2층: 판 단위 5경로 (requirements-audit.md §5 PROD-A, 결정 #273 · docs/design/prod-stage-t.md 「요구사항」 REQ-PROD-1·3)
// 판정용 봇 P8(`mvp-human.ts`, MGT 소유)을 **고치지 않는다.** 실행할 때 P8 원본을 읽어 "통 보유 규칙"만 덧붙인 사본을 만들어 돌리고 지운다.
// MGT가 P8에 보유 훅(hold)을 넣으면 이 래퍼는 지운다(prod-stage-t.md 「MGT에 요청」). P8 원본이 바뀌어 붙일 자리가 없으면 바로 멈춘다(조용히 틀린 값을 내지 않는다).
//
// 보유 규칙(hold): 통이 at개월(기본 36)이 되면 그달 같은 나이가 된 통 묶음에서 share만큼을 "장기"로 정한다(몫은 소수까지 다음 달로 넘겨 경로끼리 같은 수).
//   select 'any' = 통 번호 순(품질 무관) · 'sample' = 묶음을 모두 샘플(통당 3만 원)해 추정 품질 높은 순 · 'cool' = 숙성고 칸이 서늘한(아래 단) 순(CP-MGT-1). 장기 통은 age개월(기본 120)이 되면
//   「싱글 몰트 10년」 계열로 병입(그 계열 재고 600병 밑일 때 한 달 3통까지). 장기 통은 일반 병입(3년 계열)에서 빠진다. 나머지는 P8 X0 그대로.
//
// 실행: npx tsx scripts/experiments/prod-hold-p8.ts [시드=10] [개월=180]   (TIER 기본 standard, 이벤트 켬 — P8과 같다)
//   ONLY=HA,HC,...   돌릴 경로(기본 아래 표 전부) · SPLIT=1 순자산 나누기 표(P8 그대로)
//   끝에 PAIRED 줄: 같은 시드끼리 순자산 차이 평균·t·이긴 시드 수, HELD 줄: 경로별 장기 지정 통 수(판 평균)
//   SUPPLY=1  장기 계열의 공급 지평(prodSupply.ts) 경로별 평균 — 진단만(판 결과 불변)
//   DCF=1     실험 A 할인값(MGT-C capitalCost.ts — 같은 시드 짝 증분 현금흐름의 NPV 띠·marginal·IRR)과 경로별 증발 리터·LPA
//   PRICE=1   AUTO-PRICE-3 장기 숙성 조건 — 보유 3종(HC·HS·HSF) × 가격 정책(#200·B′+가드·C 1.3·C 1.5), 장기 계열만 정책을 거는 「-L」 경로 포함. MKT 손잡이(mktP8Hooks.ts, PR #324) 필요
//             식 v1 위에서: SCRIPT=prod-hold-p8.ts PRICE=1 V=c3+s4m1.08+k npx tsx scripts/experiments/mkt-b1.ts 10 180
// 보유 규칙 패치는 prodHoldPatch.ts(다른 P8 래퍼도 쓴다)
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyHoldPatches, LONG_LINE_NAME } from './prodHoldPatch';

const here = dirname(fileURLToPath(import.meta.url));
const PRICE = !!process.env.PRICE;
let src = applyHoldPatches(readFileSync(join(here, 'mvp-human.ts'), 'utf8'), { paths: !PRICE, filterRun: !PRICE, stats: !PRICE });
// PRICE=1 — AUTO-PRICE-3 장기 숙성 조건(MKT 요청, 결정 대기 66 (d)): MKT 가격 손잡이(mktP8Hooks.ts — 정책 'profit2'·'premium'은 PR #324)를 mkt-p8v.ts와 같은 네 자리에 끼우고,
//   장기 보유 3종 × 가격 정책 4종 경로로 바꾼다. 「…-L…」 경로는 장기 계열(「싱글 몰트 10년」)에만 그 정책을 걸고 나머지 제품은 #200 그대로
//   (P8 정책 longPrice — 장기 계열 제품의 자동 가격을 끄고, mktP8Hooks의 월 처리는 자동 가격 켠 제품을 건너뛰므로 장기 계열만 탄다)
//   보유: HC 품질 무관 · HS 서늘한 칸 · HSF 서늘한 칸 + 48개월부터 장기 지정 중단(유한 재고형 — 보충이 끊긴다)
//   정책: A = #200(P-MKT-31 A) · B2g = B′ + 가드 0.1 · C13 = C 목표 1.3 · C15 = C 목표 1.5 · B2 = 가드 없는 B′ · B2g3 = 가드 + 지평 3개월
if (PRICE) {
  const patch = (from: string | RegExp, to: string) => { const before = src; src = src.replace(from, to); if (src === before) throw new Error(`prod-hold-p8 PRICE: P8에서 끼울 자리를 못 찾았다 — ${String(from).slice(0, 60)}`); };
  const longPol = "{ ...p, ...(p as { longPrice?: object }).longPrice, autoPrice: false }";
  // ① 병입 직후 — 자동 가격을 끈 정책은 MKT 처리, longPrice 정책은 장기 계열 자동 가격을 끄고 장기 계열만 MKT 처리
  patch(/(\n  if \(p\.autoPrice\) for \(const x of s\.commerce\.products[^\n]*\n)/, `$1  else s = __mkt.afterBottle(s, p as never, opts);
  if ((p as { longPrice?: object }).longPrice) {
    for (const x of s.commerce.products.filter((y) => y.name.startsWith('${LONG_LINE_NAME}') && y.autoPrice)) s = act(s, { type: 'setAutoPrice', productId: x.id, on: false });
    if (opts.name.startsWith('${LONG_LINE_NAME}')) s = __mkt.afterBottle(s, ${longPol} as never, opts);
  }
`);
  // ② 매달 병입 직전 · ②' 통입 뒤 기록
  patch('    s = bottle(s, p, t);', `    s = __mkt.monthly(s, ((p as { longPrice?: object }).longPrice ? ${longPol} : p) as never, m);\n    s = bottle(s, p, t);`);
  patch('    s = fill(s, p);', '    s = fill(s, p);\n    __mkt.snap(s, p as never, m);');
  // ③ 경로
  const HOLDS: [string, string][] = [['HC', "{ age: 120, share: 0.25, select: 'any' }"], ['HS', "{ age: 120, share: 0.25, select: 'cool' }"], ['HSF', "{ age: 120, share: 0.25, select: 'cool', stopAt: 48 }"]];
  const POLS: [string, string][] = [['A', ''], ['B2g', "autoPrice: false, price: 'profit2', guard: 0.1"], ['C13', "autoPrice: false, price: 'premium', anchor: 1.3"], ['C15', "autoPrice: false, price: 'premium', anchor: 1.5"],
    // B′ 변형(MKT AP3 2차와 같은 이름): B2 가드 없음 · B2g3 가드 + 지평 3개월 — 현금이 묶인 판에서 지평이 길면 지는지 본다
    ['B2', "autoPrice: false, price: 'profit2'"], ['B2g3', "autoPrice: false, price: 'profit2', guard: 0.1, horizon: 3"]];
  const rows: string[] = [];
  for (const [hk, h] of HOLDS) {
    for (const [pk, pv] of POLS) rows.push(`P8('${hk}-${pk} 장기 25%(${hk}) · 전체 ${pk}', { hold: ${h}${pv ? `, ...({ ${pv} } as object)` : ''} })`);
    if (hk !== 'HC') for (const [pk, pv] of POLS.slice(1)) rows.push(`P8('${hk}-L${pk} 장기 25%(${hk}) · 장기 계열만 ${pk}', { hold: ${h}, ...({ longPrice: { ${pv.replace('autoPrice: false, ', '')} } } as object) })`);
  }
  patch(/(const P8_POLICIES: Policy\[\] = \[\n)/, `$1  ${rows.join(',\n  ')},\n`);
  const names = rows.map((r) => r.match(/P8\('([^ ]+) /)![1]!);
  patch(/const RUN = ONLY \? ALL_RUN\.filter\(\(p\) => ONLY\.has\(p\.name\.split\(' '\)\[0\]!\)\) : ALL_RUN;/, `const RUN = ALL_RUN.filter((p) => ${JSON.stringify(names)}.includes(p.name.split(' ')[0]!) && (!ONLY || ONLY.has(p.name.split(' ')[0]!)));`);
  src = `import * as __mkt from './mktP8Hooks';\n${src}\n__mkt.report();\n`;
  // 끝 — 같은 보유끼리 #200(A) 대비 짝 비교
  src += `
{
  const nw = new Map<string, number[]>();
  for (const [k, rows] of ALL) nw.set(k.split(' ')[0]!, rows.map((r) => r.nw));
  for (const [k, x] of nw) {
    const base = nw.get(k.split('-')[0] + '-A');
    if (!base || k.endsWith('-A')) continue;
    const d = x.map((v, i) => v - base[i]!).filter(Number.isFinite);
    if (d.length < 2) { console.log(\`PAIRED \${k} − A: 생존 판 부족\`); continue; }
    const mm = d.reduce((t, v) => t + v, 0) / d.length, sd = Math.sqrt(d.reduce((t, v) => t + (v - mm) ** 2, 0) / (d.length - 1));
    console.log(\`PAIRED \${k} − \${k.split('-')[0]}-A: \${(mm / 1e8).toFixed(2)}억 · t \${(mm / (sd / Math.sqrt(d.length))).toFixed(1)} · 이긴 시드 \${d.filter((v) => v > 0).length}/\${d.length}\`);
  }
}
`;
}
// SUPPLY=1 — 장기 계열(「싱글 몰트 10년」)의 공급 지평(prodSupply.ts, [제안 P-PROD-54])을 매달 재서 경로별 평균을 낸다(진단 — 결과 불변)
if (process.env.SUPPLY) {
  const anchor = '    s = advanceMonth(s);\n';
  if (src.split(anchor).length !== 2) throw new Error('prod-hold-p8 SUPPLY: P8에서 advanceMonth 자리를 하나로 찾지 못했다');
  src = src.replace(anchor, `${anchor}    for (const x of s.commerce.products.filter((x) => x.name.startsWith('${LONG_LINE_NAME}') && x.stockBottles > 0)) { const h = __supply(s, x); const k = p.name.split(' ')[0]!; const b = SUPPLYSTAT.get(k) ?? { n: 0, months: 0, gap: 0, ready: 0, soon: 0 }; SUPPLYSTAT.set(k, { n: b.n + 1, months: b.months + Math.min(60, h.months), gap: b.gap + (h.refillGap ? 1 : 0), ready: b.ready + h.readyBottles, soon: b.soon + h.soonBottles }); }\n`);
  src = src.replace('const DUMP = process.env.DUMP;', "const DUMP = process.env.DUMP;\nimport { supplyHorizon as __supply } from './prodSupply';\nconst SUPPLYSTAT = new Map<string, { n: number; months: number; gap: number; ready: number; soon: number }>();");
  src += `\nconsole.log('SUPPLY ${LONG_LINE_NAME} 계열(재고 있는 제품·달 평균, 지평은 60개월에서 자름) ' + [...SUPPLYSTAT].map(([k, v]) => \`\${k} 지평 \${(v.months / v.n).toFixed(1)}개월 · 지금 채울 병 \${(v.ready / v.n).toFixed(0)} · 곧 닿는 병 \${(v.soon / v.n).toFixed(0)} · 보충 끊김 \${((100 * v.gap) / v.n).toFixed(0)}%\`).join(' | '));\n`;
}

// DCF=1 — 실험 A 할인값(REQ-PROD-1 · MGT-C P-MGT-30): 같은 시드 짝의 **증분 현금흐름**을 할인한다.
//   월 흐름 = (현금 − 대출)의 월 변화 차이(경로 − 기준), 끝 = (순자산 − (현금 − 대출)) 차이 = 원액·제품 평가액 차이. 할인율 0이면 순자산 차이와 같다(검산).
//   할인율: MGT-C capitalCost.ts — 'marginal'(경로 쪽 판의 그달 "다음에 빌릴 돈의 금리", 달마다 바뀐다)과 민감도 띠(discountBands: 0 · 정책자금 · 운전자금 · 급전). IRR도 낸다
//   증발: 경로별 판 평균 증발 리터(MonthReport.angelsShareL)와 LPA(그달 통 원액의 LPA 가중 평균 도수로 환산 — 근사)
if (process.env.DCF) {
  const anchor = '    s = advanceMonth(s);\n';
  if (src.split(anchor).length !== 2) throw new Error('prod-hold-p8 DCF: P8에서 advanceMonth 자리를 하나로 찾지 못했다');
  src = src.replace(anchor, `    const __abv = (() => { let l = 0, a = 0; for (const c of s.inventory.casks) if (c.contents) { l += c.contents.volumeL; a += c.contents.volumeL * c.contents.abv; } return l > 0 ? a / l : 0; })();
${anchor}    { const k = \`\${p.name}|\${seed}\`; const d = DCFS.get(k) ?? { e: [s.scenario ? s.scenario.equity : 0], nw: 0, r: [] as number[], evapL: 0, evapLPA: 0 }; const ev = s.history.reports.at(-1)?.angelsShareL ?? 0; d.e.push(s.finance.cash - s.finance.loans.reduce((t, l) => t + l.balance, 0)); d.nw = netWorth(s); d.r.push(__dcf.discountRate(s, 'marginal')); d.evapL += ev; d.evapLPA += ev * __abv; DCFS.set(k, d); }
`);
  src = src.replace('const DUMP = process.env.DUMP;', "const DUMP = process.env.DUMP;\nimport * as __dcf from './capitalCost';\nconst DCFS = new Map<string, { e: number[]; nw: number; r: number[]; evapL: number; evapLPA: number }>();");
  src += `
{
  const runs = new Map<string, Map<number, { e: number[]; nw: number; r: number[]; evapL: number; evapLPA: number }>>();
  for (const [k, v] of DCFS) { const [name, seed] = k.split('|'); const id = name!.split(' ')[0]!; if (!runs.has(id)) runs.set(id, new Map()); runs.get(id)!.set(Number(seed), v); }
  const full = Math.max(...[...DCFS.values()].map((v) => v.e.length));
  const bands = __dcf.discountBands();
  const pv = (flows: number[], rates: number[]) => { let df = 1, t = 0; for (let i = 0; i < flows.length; i++) { df /= 1 + __dcf.monthlyRate(rates[i] ?? rates.at(-1) ?? 0); t += flows[i]! * df; } return t; };
  console.log('\\n### 실험 A 할인값 — 같은 시드 짝 증분 현금흐름의 NPV(억, 판 평균) · IRR(중앙) · 증분 흐름 = (현금 − 대출) 월 변화 차이 + 끝의 원액·제품 평가액 차이');
  console.log(\`| 비교 | 짝 | \${bands.map((b) => \`NPV \${(b.annual * 100).toFixed(1)}%\`).join(' | ')} | NPV marginal(경로 판) | IRR 중앙(연) |\`);
  console.log(\`|---|---|\${bands.map(() => '---|').join('')}---|---|\`);
  const pairsDcf: [string, string][] = ${JSON.stringify([['HC','HA'],['HD','HC'],['HS','HC'],['HC72','HA'],['HC6','HA6'],['HS6','HC6'],['HC672','HA6'],['HS672','HC672'],['HD672','HC672']])};
  for (const [a, b] of pairsDcf) {
    const A = runs.get(a), B = runs.get(b);
    if (!A || !B) continue;
    const npvs = bands.map(() => [] as number[]); const marg: number[] = []; const irrs: number[] = [];
    for (const [seed, x] of A) {
      const y = B.get(seed);
      if (!y || x.e.length !== full || y.e.length !== full) continue; // 파산 판은 뺀다
      const flows = x.e.slice(1).map((v, i) => (v - x.e[i]!) - (y.e[i + 1]! - y.e[i]!));
      flows[flows.length - 1] = flows[flows.length - 1]! + (x.nw - x.e.at(-1)!) - (y.nw - y.e.at(-1)!);
      bands.forEach((bd, j) => npvs[j]!.push(pv(flows, [bd.annual])));
      marg.push(pv(flows, x.r));
      const r = __dcf.irr(flows.map((amount, i) => ({ month: i + 1, amount })));
      if (Number.isFinite(r)) irrs.push(r);
    }
    if (!marg.length) continue;
    const avg = (v: number[]) => v.reduce((t, z) => t + z, 0) / v.length / 1e8;
    const med = (v: number[]) => { const q = [...v].sort((m, n) => m - n); return q.length ? q[Math.floor(q.length / 2)]! : NaN; };
    console.log(\`| \${a} − \${b} | \${marg.length} | \${npvs.map((v) => avg(v).toFixed(2)).join(' | ')} | \${avg(marg).toFixed(2)} | \${irrs.length ? \`\${(med(irrs) * 100).toFixed(1)}% (\${irrs.length}판)\` : '—'} |\`);
  }
  console.log('\\n### 증발 — 경로별 판 평균(파산 판 포함, 판이 끝난 달까지)');
  console.log('| 경로 | 증발 리터 | 증발 LPA(근사) |\\n|---|---|---|');
  for (const [id, m] of runs) { const v = [...m.values()]; console.log(\`| \${id} | \${Math.round(v.reduce((t, z) => t + z.evapL, 0) / v.length).toLocaleString()} | \${Math.round(v.reduce((t, z) => t + z.evapLPA, 0) / v.length).toLocaleString()} |\`); }
}
`;
}

process.env.P8 = '1';
process.env.TIER ??= 'standard';
const gen = join(here, `_gen-prod-hold-p8-${process.pid}.ts`); // 프로세스마다 따로 — 여러 개를 함께 돌려도 서로 지우지 않게
writeFileSync(gen, src);
try { await import(pathToFileURL(gen).href); } finally { unlinkSync(gen); } // 실행할 때 만든 파일이라 정적 경로로 가져오지 않는다(타입 검사)
