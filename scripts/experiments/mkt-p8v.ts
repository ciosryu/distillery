// MKT 변형을 판정용 봇 P8 위에서 (#265, docs/design/mkt-stage-t.md 「요구사항」 검증 매트릭스) — P8 파일(mvp-human.ts, MGT 소유)은 고치지 않는다.
// P8 원본을 읽어 MKT 손잡이(mktP8Hooks.ts)를 세 곳에 끼운 임시 사본을 OS 임시 폴더에 쓰고 그것을 돌린다. 끼울 자리가 바뀌면 멈춘다(조용히 틀리지 않게).
// 실행: SET=<B|A|D> npx tsx scripts/experiments/mkt-p8v.ts [시드=10] [개월=180]
//   SET=B  MKT-B 가격: 자동 가격(X0) / 자동 가격 끔(X5 — 보충 뒤 값 고정 결함 그대로) / 수동 권장가 / 수동 휴리스틱
//   SET=A  MKT-A SKU: 계열당 3·2·1제품(자동 가격) — RHO=<ρ>로 SKU.rho를 실험 안에서만 바꾼다, SNAP=<달>이면 그 달 SKU 분해 표
//   SET=D  MKT-D 생존 대안: 비지터 센터·소주·뉴메이크·조기 위스키·원액 현물 제한 매각을 하나씩 빼거나 바꾼다
//   TIER(기본 standard)·YEARLY·SPLIT 등 mvp-human.ts의 다른 환경 변수는 그대로
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKU } from '../../src/sim/content/market';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../src');
const SET = process.env.SET ?? 'B';

// 변형 묶음 — P8(name, 덮어쓸 정책) 식 그대로. 새 필드(price·spot)는 mktP8Hooks.ts가 읽는다
const SETS: Record<string, string> = {
  B: `[
    P8('B0 자동 가격(X0)', {}),
    P8('B1 자동 가격 끔 — 보충 뒤 값 고정(X5 그대로)', { autoPrice: false }),
    P8('B2 수동: 병입·보충 때 권장가', { autoPrice: false, price: 'suggest' }),
    P8('B3 수동: B2 + 분기마다 재고 개월로 ±5%', { autoPrice: false, price: 'heur' }),
  ]`,
  A: `[
    P8('A3 계열당 3제품(X0)', {}),
    P8('A2 계열당 2제품', { lineup: 2 }),
    P8('A1 계열당 1제품', { lineup: 1 }),
  ]`,
  D: `[
    P8('D0 X0(비지터·소주 2·뉴메이크·조기 위스키)', {}),
    P8('D1 비지터 센터 없음(기프트 샵·핸드필도 없음)', { visitor: false, giftshopAt: undefined, handfillAt: undefined }),
    P8('D2 소주 없음', { sojuB: 0 }),
    P8('D3 소주 3배치', { sojuB: 3 }),
    P8('D4 뉴메이크 제품 없음', { newMake: undefined }),
    P8('D5 조기 위스키 없음(36개월부터)', { labelFrom: [0, 36] }),
    P8('D6 원액 현물 제한 매각(12~48개월 탱크 30%)', { spot: { from: 12, until: 48, share: 0.3 } }),
    P8('D7 비지터 없음 + 소주 3 + 현물 제한', { visitor: false, giftshopAt: undefined, handfillAt: undefined, sojuB: 3, spot: { from: 12, until: 48, share: 0.3 } }),
  ]`,
};
if (!SETS[SET]) throw new Error(`SET=${SET} 없음 — ${Object.keys(SETS).join('·')}`);
if (process.env.RHO) SKU.rho = Number(process.env.RHO);

let code = readFileSync(join(here, 'mvp-human.ts'), 'utf8');
const patch = (from: string | RegExp, to: string) => {
  const before = code;
  code = code.replace(from, to);
  if (code === before) throw new Error(`mvp-human.ts에서 끼울 자리를 못 찾았다: ${String(from).slice(0, 80)} — P8이 바뀌었으면 mkt-p8v.ts를 맞춘다`);
};
// ① 병입 직후: 자동 가격을 끈 정책의 값 처리
patch(/(\n  if \(p\.autoPrice\) for \(const x of s\.commerce\.products[^\n]*\n)/, `$1  else s = __mkt.afterBottle(s, p as never, opts);\n`);
// ② 매달 병입 직전: 분기 가격·현물 매각·SKU 분해
patch('    s = bottle(s, p, t);', '    s = __mkt.monthly(s, p as never, m);\n    s = bottle(s, p, t);');
// ③ P8 정책 목록을 MKT 변형 묶음으로
patch(/const P8_POLICIES: Policy\[\] = \[[\s\S]*?\n\];/, `const P8_POLICIES: Policy[] = ${SETS[SET]} as Policy[];`);
// 상대 경로 → 절대 경로(임시 폴더에서 돌린다)
code = code.replaceAll("from '../../src/", `from '${src}/`).replaceAll("from './", `from '${here}/`);
code = `import * as __mkt from '${here}/mktP8Hooks';\n${code}\n__mkt.report();\n`;
const out = join(tmpdir(), `mkt-p8v-${process.pid}.ts`);
writeFileSync(out, code);
process.env.P8 = '1';
process.env.TIER ??= 'standard';
console.log(`[mkt-p8v] SET=${SET} · ρ = ${SKU.rho} · P8 원본 mvp-human.ts + MKT 손잡이(mktP8Hooks.ts)`);
await import(out);
