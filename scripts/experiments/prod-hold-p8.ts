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
// 보유 규칙 패치는 prodHoldPatch.ts(다른 P8 래퍼도 쓴다)
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyHoldPatches, LONG_LINE_NAME } from './prodHoldPatch';

const here = dirname(fileURLToPath(import.meta.url));
let src = applyHoldPatches(readFileSync(join(here, 'mvp-human.ts'), 'utf8'), { paths: true, filterRun: true, stats: true });
// SUPPLY=1 — 장기 계열(「싱글 몰트 10년」)의 공급 지평(prodSupply.ts, [제안 P-PROD-54])을 매달 재서 경로별 평균을 낸다(진단 — 결과 불변)
if (process.env.SUPPLY) {
  const anchor = '    s = advanceMonth(s);\n';
  if (src.split(anchor).length !== 2) throw new Error('prod-hold-p8 SUPPLY: P8에서 advanceMonth 자리를 하나로 찾지 못했다');
  src = src.replace(anchor, `${anchor}    for (const x of s.commerce.products.filter((x) => x.name.startsWith('${LONG_LINE_NAME}') && x.stockBottles > 0)) { const h = __supply(s, x); const k = p.name.split(' ')[0]!; const b = SUPPLYSTAT.get(k) ?? { n: 0, months: 0, gap: 0, ready: 0, soon: 0 }; SUPPLYSTAT.set(k, { n: b.n + 1, months: b.months + Math.min(60, h.months), gap: b.gap + (h.refillGap ? 1 : 0), ready: b.ready + h.readyBottles, soon: b.soon + h.soonBottles }); }\n`);
  src = src.replace('const DUMP = process.env.DUMP;', "const DUMP = process.env.DUMP;\nimport { supplyHorizon as __supply } from './prodSupply';\nconst SUPPLYSTAT = new Map<string, { n: number; months: number; gap: number; ready: number; soon: number }>();");
  src += `\nconsole.log('SUPPLY ${LONG_LINE_NAME} 계열(재고 있는 제품·달 평균, 지평은 60개월에서 자름) ' + [...SUPPLYSTAT].map(([k, v]) => \`\${k} 지평 \${(v.months / v.n).toFixed(1)}개월 · 지금 채울 병 \${(v.ready / v.n).toFixed(0)} · 곧 닿는 병 \${(v.soon / v.n).toFixed(0)} · 보충 끊김 \${((100 * v.gap) / v.n).toFixed(0)}%\`).join(' | '));\n`;
}

process.env.P8 = '1';
process.env.TIER ??= 'standard';
const gen = join(here, `_gen-prod-hold-p8-${process.pid}.ts`); // 프로세스마다 따로 — 여러 개를 함께 돌려도 서로 지우지 않게
writeFileSync(gen, src);
try { await import(pathToFileURL(gen).href); } finally { unlinkSync(gen); } // 실행할 때 만든 파일이라 정적 경로로 가져오지 않는다(타입 검사)
