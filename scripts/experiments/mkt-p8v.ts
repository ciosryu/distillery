// MKT 변형을 판정용 봇 P8 위에서 (#265, docs/design/mkt-stage-t.md 「요구사항」 검증 매트릭스) — P8 파일(mvp-human.ts, MGT 소유)은 고치지 않는다.
// P8 원본을 읽어 MKT 손잡이(mktP8Hooks.ts)를 네 곳에 끼운 임시 사본을 같은 폴더에 숨김 파일로 쓰고 돌린 뒤 지운다. 끼울 자리가 바뀌면 멈춘다(조용히 틀리지 않게).
// 같은 폴더에 두는 까닭: 다른 폴더(OS 임시 폴더)에 두면 모듈이 따로 로드돼 RHO 같은 콘텐츠 값 바꾸기가 P8에 닿지 않는다
// 실행: SET=<B|A|D> npx tsx scripts/experiments/mkt-p8v.ts [시드=10] [개월=180]
//   SET=B  MKT-B 가격: 자동 가격(X0) / 자동 가격 끔(X5 — 보충 뒤 값 고정 결함 그대로) / 수동 권장가 / 수동 휴리스틱
//   SET=B2 MKT-B 추가: 분기마다 가격표 최선 값을 손으로 / 권장가 × 1.3 — P8에 X21·X22로 들어갔다(MGT #289·#292). 머지 뒤에는 패처 없이 P8 ONLY=X21,X22가 같다
//   SET=A  MKT-A SKU: 계열당 3·2·1제품(자동 가격) — RHO=<ρ>로 SKU.rho를, MARKET=<배수>로 국내 점유 상한을 실험 안에서만 바꾼다. SNAP=<달>이면 그 달 SKU 분해 표, DIAG=1이면 위스키 진열 원인 나누기
//   SET=D  MKT-D 생존 대안: 비지터 센터·소주·뉴메이크·조기 위스키·원액 현물 제한 매각을 하나씩 빼거나 바꾼다
//   TIER(기본 standard)·YEARLY·SPLIT 등 mvp-human.ts의 다른 환경 변수는 그대로
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKU } from '../../src/sim/content/market';
import { REGIONS } from '../../src/sim/content/regions';

const here = dirname(fileURLToPath(import.meta.url));
const SET = process.env.SET ?? 'B';

// 변형 묶음 — P8(name, 덮어쓸 정책) 식 그대로. 새 필드(price·spot)는 mktP8Hooks.ts가 읽는다
const SETS: Record<string, string> = {
  B: `[
    P8('B0 자동 가격(X0)', {}),
    P8('B1 자동 가격 끔(P8 X5 — #289 전: 보충 뒤 값 고정 결함 · 뒤: B2와 같음)', { autoPrice: false }),
    P8('B2 수동: 병입·보충 때 권장가', { autoPrice: false, price: 'suggest' }),
    P8('B3 수동: B2 + 분기마다 재고 개월로 ±5%', { autoPrice: false, price: 'heur' }),
  ]`,
  B2: `[
    P8('B4 수동: 분기마다 가격표 최선 값(손으로)', { autoPrice: false, price: 'table' }),
    P8('B5 수동: 권장가 × 1.3(병입·보충·분기)', { autoPrice: false, price: 'markup', markup: 1.3 }),
  ]`,
  A: `[
    P8('A3 계열당 3제품(X0)', {}),
    P8('A2 계열당 2제품', { lineup: 2 }),
    P8('A1 계열당 1제품', { lineup: 1 }),
  ]`,
  D: `[
    P8('M-D0 X0(비지터·소주 2·뉴메이크·조기 위스키)', {}),
    P8('M-D1 비지터 센터 없음(기프트 샵·핸드필도 없음)', { visitor: false, giftshopAt: undefined, handfillAt: undefined }),
    P8('M-D2 소주 없음', { sojuB: 0 }),
    P8('M-D3 소주 3배치', { sojuB: 3 }),
    P8('M-D4 뉴메이크 제품 없음', { newMake: undefined }),
    P8('M-D5 조기 위스키 없음(36개월부터)', { labelFrom: [0, 36] }),
    P8('M-D6 원액 현물 제한 매각(12~48개월 탱크 30%)', { spot: { from: 12, until: 48, share: 0.3 } }),
    P8('M-D7 비지터 없음 + 소주 3 + 현물 제한', { visitor: false, giftshopAt: undefined, handfillAt: undefined, sojuB: 3, spot: { from: 12, until: 48, share: 0.3 } }),
  ]`,
};
if (!SETS[SET]) throw new Error(`SET=${SET} 없음 — ${Object.keys(SETS).join('·')}`);
if (process.env.RHO) SKU.rho = Number(process.env.RHO);
// MARKET=<배수>: 국내(한국) 주종별 점유 상한(shareCap)을 실험 안에서만 곱한다 — ρ를 올릴 때 줄어드는 총수요를 시장 크기로 되돌리는 안(P-MKT-24 (a))을 잰다
if (process.env.MARKET) for (const m of Object.values(REGIONS.KR.market)) if (m) m.shareCap *= Number(process.env.MARKET);

let code = readFileSync(join(here, 'mvp-human.ts'), 'utf8');
const patch = (from: string | RegExp, to: string) => {
  const before = code;
  code = code.replace(from, to);
  if (code === before) throw new Error(`mvp-human.ts에서 끼울 자리를 못 찾았다: ${String(from).slice(0, 80)} — P8이 바뀌었으면 mkt-p8v.ts를 맞춘다`);
};
// ① 병입 직후: 자동 가격을 끈 정책의 값 처리
patch(/(\n  if \(p\.autoPrice\) for \(const x of s\.commerce\.products[^\n]*\n)/, `$1  else s = __mkt.afterBottle(s, p as never, opts);\n`);
// ② 매달 병입 직전: 분기 가격·현물 매각
patch('    s = bottle(s, p, t);', '    s = __mkt.monthly(s, p as never, m);\n    s = bottle(s, p, t);');
// ②' 병입·통입 뒤: SKU 분해 기록(병입 전에 찍으면 품절 제품이 빠진다)
patch('    s = fill(s, p);', '    s = fill(s, p);\n    __mkt.snap(s, p as never, m);');
// ③ P8 정책 목록을 MKT 변형 묶음으로
patch(/const P8_POLICIES: Policy\[\] = \[[\s\S]*?\n\];/, `const P8_POLICIES: Policy[] = ${SETS[SET]} as Policy[];`);
code = `import * as __mkt from './mktP8Hooks';\n${code}\n__mkt.report();\n`;
const out = join(here, `.mkt-p8v-${process.pid}.tmp.ts`);
writeFileSync(out, code);
process.env.P8 = '1';
process.env.TIER ??= 'standard';
console.log(`[mkt-p8v] SET=${SET} · ρ = ${SKU.rho} · 국내 점유 상한 ×${process.env.MARKET ?? 1} · P8 원본 mvp-human.ts + MKT 손잡이(mktP8Hooks.ts)`);
try { await import(out); } finally { rmSync(out, { force: true }); }
