// B1-MKT-1 시장·가치 식 v1 통합안 측정 (결정 #281, game-program.md §4) — 게임 코드(src/)는 고치지 않는다.
// src/와 P8(mvp-human.ts와 같은 폴더의 실험 도우미)을 이 폴더 아래 숨김 폴더(.b1-<프로세스 번호>)에 복사하고, 그 사본의 식만 고친 뒤 P8을 돌리고 지운다.
// 숨김 폴더라 typecheck·vitest가 잡지 않는다(점으로 시작하는 폴더는 둘 다 건너뛴다 — 확인함). 고칠 문자열을 못 찾으면 멈춘다(조용히 틀리지 않게).
// 실행: V=<변형[,변형…]> npx tsx scripts/experiments/mkt-b1.ts [시드=10] [개월=180]  (P8 환경 변수 — TIER·ONLY·METRICS·YEARLY — 그대로)
//       SCRIPT=prod-aging.ts CLIMATE=game TIER=0,2,5 V=base,a npx tsx scripts/experiments/mkt-b1.ts — P8 대신 다른 실험 스크립트를 같은 사본 위에서
//   변형 토큰(조합은 +):
//     base       아무것도 안 고침 — 변경 전 기준(balance-spec.md §7)과 같은 시드로 비교
//     c          매력도(appeal)의 위스키 숙성 배수 제거 — 숙성 가치는 권장가·기대가 한 곳만(P-PROD-45 c, REQ-PROD-3)
//     cp         매력도에서 숙성 "프리미엄 부분"만 뺀다 = min(1, agePerception) — 어린 위스키 할인(×1 미만)은 남는다(PROD 요청 c-premium-only, 2026-11-11). c는 PROD 말로 c-all
//     c3         매력도의 위스키 배수를 3년 값(×1.18)에서 자른다 = min(agePerception(36), agePerception) — 어린 할인도 3년 수준도 남고 3년 넘는 기울기만 빠진다(MKT 비교안)
//     a          3년 이후 숙성 프리미엄 기울기 × clamp((품질 − 55)/25, 0, 1)(P-PROD-45 a — PROD: "재측정 뒤", 변형 하나로만)
//     s<ρ>m<배수> SKU.rho = ρ, 국내(한국) 점유 상한 × 배수 — P-MKT-25 (a) (예: s5m1.12)
//     h          권장가(suggestedPrice) × 1.3 — 권장가 정직화(#283의 다음 단계, CP-PM-4 ⓐ). 기대가(수요 기준)는 그대로, 핸드필 값도 따라 오른다
//     f          향미 방향 항(P-MKT-30 v2): 몰트 위스키 매력도 × 시장 취향 스타일 배수 — 가장 가까운 스타일(육각형 코사인)·fit, 국내 = 지역 id, 수출 = 시장 id 가중(PROD 초안). 끝에 시장별 평균 배수·스타일 분포 표
//     k          수출 계약 미달 해지 = 자진 해지 위약금(현지 분담 3개월) + 재진입 개척비 다시(P-MKT-27)
//   예: V=base,c,c+a,c+s5m1.12,c+a+s5m1.12+k ONLY=X0,X7,X21,X22,X12 METRICS=1
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const variants = (process.env.V ?? 'base').split(',');
// SCRIPT=<실험 파일>: P8(mvp-human.ts) 대신 같은 사본 위에서 돌릴 스크립트 — 예: SCRIPT=prod-aging.ts CLIMATE=game TIER=0,2,5(PROD 요청, 전후 표). 그 스크립트의 인자는 이 스크립트 인자 뒤에 그대로
const SCRIPT = process.env.SCRIPT ?? 'mvp-human.ts';

interface Patch { file: string; from: string | RegExp; to: string; all?: boolean }
const PATCH: Record<string, Patch[]> = {
  c: [
    { file: 'src/sim/market.ts', from: '  const ageBonus = aged ? agePerception(p.oakMonths ?? (p.ageYears ?? 0) * 12, p.category) : agedWhitePerception(p.category, p.oakMonths, p.restMonths); // 숙성 소주 표기 #217', to: '  const ageBonus = aged ? 1 : agedWhitePerception(p.category, p.oakMonths, p.restMonths); // [B1 c] 위스키 숙성 가치는 기대가·권장가 한 곳만' },
  ],
  cp: [
    { file: 'src/sim/market.ts', from: '  const ageBonus = aged ? agePerception(p.oakMonths ?? (p.ageYears ?? 0) * 12, p.category) : agedWhitePerception(p.category, p.oakMonths, p.restMonths); // 숙성 소주 표기 #217', to: '  const ageBonus = aged ? Math.min(1, agePerception(p.oakMonths ?? (p.ageYears ?? 0) * 12, p.category)) : agedWhitePerception(p.category, p.oakMonths, p.restMonths); // [B1 cp] 프리미엄 부분만 뺀다(어린 할인은 남김)' },
  ],
  c3: [
    { file: 'src/sim/market.ts', from: '  const ageBonus = aged ? agePerception(p.oakMonths ?? (p.ageYears ?? 0) * 12, p.category) : agedWhitePerception(p.category, p.oakMonths, p.restMonths); // 숙성 소주 표기 #217', to: '  const ageBonus = aged ? Math.min(agePerception(36, p.category), agePerception(p.oakMonths ?? (p.ageYears ?? 0) * 12, p.category)) : agedWhitePerception(p.category, p.oakMonths, p.restMonths); // [B1 c3] 3년 넘는 기울기만 뺀다(어린 할인·3년 수준은 남김)' },
  ],
  a: [
    { file: 'src/sim/blending.ts', from: 'export function agePerception(oakMonths: number, category: ProductCategory = \'whisky\'): number {', to: 'export function agePerception(oakMonths: number, category: ProductCategory = \'whisky\', quality?: number): number {' },
    { file: 'src/sim/blending.ts', from: '  const r = agePremiumRate(category);\n', to: '  const r = agePremiumRate(category) * (quality == null ? 1 : Math.min(1, Math.max(0, (quality - 55) / 25))); // [B1 a]\n' },
    { file: 'src/sim/blending.ts', from: 'agePerception(oakMonths, category) : 1) * (aged ?', to: 'agePerception(oakMonths, category, quality) : 1) * (aged ?' },
    { file: 'src/sim/blending.ts', from: 'agePerception(minOakMonths, category) : 1, finalAbv)', to: 'agePerception(minOakMonths, category, evaluation.quality) : 1, finalAbv)' },
    { file: 'src/sim/market.ts', from: 'agePerception(p.oakMonths ?? (p.ageYears ?? 0) * 12, p.category)', to: 'agePerception(p.oakMonths ?? (p.ageYears ?? 0) * 12, p.category, p.quality)', all: true },
  ],
  h: [
    { file: 'src/sim/blending.ts', from: '  const p = priceForConsumer(region, consumer, bottleMl, abv, taxFactor);\n  return Math.round(p / 100) * 100;', to: '  const p = priceForConsumer(region, consumer, bottleMl, abv, taxFactor) * 1.3; // [B1 h] 권장가 정직화 — 가격표 최선 근처로(#283 다음 단계)\n  return Math.round(p / 100) * 100;' },
  ],
  f: [
    { file: 'src/sim/market.ts', from: "import { hexOf } from './blendRadar';\n", to: "import { hexOf } from './blendRadar';\nimport { CATEGORY } from './content/categories';\n" },
    { file: 'src/sim/market.ts', from: 'export function appeal(', to: '// [B1 f] 시장 취향 × 스타일 적합(P-MKT-30 v2 · CP-MKT-1 v2 — 가중은 PROD 초안 2026-11-11, 모두 가설). 몰트 위스키만\nconst B1F_W: Record<string, Record<string, number>> = {\n  KR: { peated: 0.85, sherried: 1.05, bourbon_fruity: 1.1, korean_oak: 1.0 }, JP: { peated: 1.0, sherried: 1.05, bourbon_fruity: 1.0, korean_oak: 0.95 },\n  TW: { peated: 0.93, sherried: 1.12, bourbon_fruity: 1.0, korean_oak: 0.95 }, UK: { peated: 1.12, sherried: 1.03, bourbon_fruity: 0.95, korean_oak: 0.9 },\n  EU: { peated: 1.12, sherried: 1.03, bourbon_fruity: 0.95, korean_oak: 0.9 }, US: { peated: 0.95, sherried: 1.0, bourbon_fruity: 1.1, korean_oak: 0.95 },\n  CN: { peated: 0.92, sherried: 1.1, bourbon_fruity: 0.98, korean_oak: 1.0 }, DF: { peated: 0.95, sherried: 1.05, bourbon_fruity: 1.05, korean_oak: 0.95 },\n  SEA: { peated: 0.92, sherried: 1.08, bourbon_fruity: 1.02, korean_oak: 0.98 },\n};\nconst B1F_T = CATEGORY.whisky.styles.map((st) => ({ id: st.id, hex: hexOf(st.target) }));\n/** 가장 가까운 스타일(육각형 코사인 — 세기와 분리)·적합도 fit = clamp((cos − 0.6)/0.3, 0, 1) */\nexport function b1Style(p: Pick<Product, \'category\' | \'hex\' | \'flavor\'>): { id: string; cos: number; fit: number } | null {\n  if (p.category !== \'whisky\') return null;\n  const h = p.hex ?? hexOf(p.flavor);\n  const ks = Object.keys(h) as (keyof typeof h)[];\n  const n = Math.sqrt(ks.reduce((t, k) => t + h[k] ** 2, 0));\n  if (n < 1e-6) return null;\n  let id = \'\', cos = -1;\n  for (const t of B1F_T) { const m = Math.sqrt(ks.reduce((a, k) => a + t.hex[k] ** 2, 0)); const c = ks.reduce((a, k) => a + h[k] * t.hex[k], 0) / (n * Math.max(1e-9, m)); if (c > cos) { cos = c; id = t.id; } }\n  return { id, cos, fit: clamp((cos - 0.6) / 0.3, 0, 1) };\n}\n/** 시장 key(지역 id 또는 수출 시장 id)의 스타일 배수 = 1 + (w − 1) × fit. 시장마다 네 가중 평균 1 */\nexport function b1StyleFit(p: Pick<Product, \'category\' | \'hex\' | \'flavor\'>, key: string): number {\n  const w = B1F_W[key];\n  const st = w ? b1Style(p) : null;\n  const r = st ? 1 + ((w![st.id] ?? 1) - 1) * st.fit : 1;\n  const g = (globalThis as { __b1f?: Record<string, { n: number; r: number; fit: number; by: Record<string, number> }> }).__b1f;\n  if (g && st) { const x = (g[key] ??= { n: 0, r: 0, fit: 0, by: {} }); x.n++; x.r += r; x.fit += st.fit; x.by[st.id] = (x.by[st.id] ?? 0) + 1; }\n  return r;\n}\n\nexport function appeal(' },
    { file: 'src/sim/market.ts', from: ' * blendBonus * rare * shield;\n', to: ' * blendBonus * rare * shield * (s ? b1StyleFit(p, s.regionId) : 1); // [B1 f]\n' },
    { file: 'src/sim/market.ts', from: 'return (marketL * reach * appeal(p, s) * priceFactor * overhangFactor(p, s.month)) / bottleL;', to: 'return (marketL * reach * (appeal(p, s) / b1StyleFit(p, s.regionId)) * b1StyleFit(p, m.id) * priceFactor * overhangFactor(p, s.month)) / bottleL; // [B1 f] 수출은 그 시장 취향' },
  ],
  k: [
    { file: 'src/sim/exportDeals.ts', from: '      if ((e.bottlesThisYear ?? 0) < e.minBottlesPerYear) {\n        ended.push(e.marketId);\n', to: '      if ((e.bottlesThisYear ?? 0) < e.minBottlesPerYear) {\n        ended.push(e.marketId);\n        fixed += Math.round((e.marketingPerMonth ?? m.monthlyCost) * EXPORT_DEAL.cancelMonths); s.commerce.exportEntered = (s.commerce.exportEntered ?? []).filter((x) => x !== e.marketId); // [B1 k]\n' },
  ],
};

function applyPatch(root: string, p: Patch): void {
  const f = join(root, p.file);
  const code = readFileSync(f, 'utf8');
  const next = p.all && typeof p.from === 'string' ? code.replaceAll(p.from, p.to) : code.replace(p.from, p.to);
  if (next === code) throw new Error(`[mkt-b1] ${p.file}에서 고칠 자리를 못 찾았다: ${String(p.from).slice(0, 90)} — 식이 바뀌었으면 mkt-b1.ts를 맞춘다`);
  writeFileSync(f, next);
}

const results: { v: string; out: string }[] = [];
for (const v of variants) {
  const tokens = v.split('+').filter((t) => t !== 'base');
  const root = join(here, `.b1-${process.pid}-${results.length}`);
  try {
    cpSync(join(repo, 'src'), join(root, 'src'), { recursive: true, filter: (p) => !p.endsWith('.test.ts') && !p.endsWith('.test.tsx') });
    cpSync(join(repo, 'data'), join(root, 'data'), { recursive: true }); // src가 ../../data/…를 읽는다(수요 기초 자료)
    // P8과 그 도우미(mgtKnobs·prodKnobs …)를 통째로 — 숨김 파일·폴더는 빼고. 도우미가 늘어나도 따로 고칠 필요가 없다
    for (const f of readdirSync(here)) if (f.endsWith('.ts') && !f.startsWith('.')) cpSync(join(here, f), join(root, 'scripts/experiments', f));
    let sku: { rho: number; market: number } | null = null;
    for (const t of tokens) {
      const m = /^s(\d+(?:\.\d+)?)m(\d+(?:\.\d+)?)$/.exec(t);
      if (m) { sku = { rho: Number(m[1]), market: Number(m[2]) }; continue; }
      if (!PATCH[t]) throw new Error(`[mkt-b1] 모르는 변형 토큰: ${t} — ${Object.keys(PATCH).join('·')}·s<ρ>m<배수>`);
      for (const p of PATCH[t]!) applyPatch(root, p);
    }
    // SKU·시장 크기는 콘텐츠 값 — 사본의 콘텐츠 모듈을 먼저 불러 바꾼 뒤 P8을 부른다(같은 모듈이 P8에 닿는다)
    if (sku) {
      const mk = await import(join(root, 'src/sim/content/market.ts'));
      const rg = await import(join(root, 'src/sim/content/regions.ts'));
      mk.SKU.rho = sku.rho;
      for (const mdef of Object.values(rg.REGIONS.KR.market) as { shareCap: number }[]) if (mdef) mdef.shareCap *= sku.market;
    }
    const target = join(root, 'scripts/experiments', SCRIPT);
    if (SCRIPT === 'mvp-human.ts') { process.env.P8 = '1'; process.env.TIER ??= 'standard'; }
    process.argv[1] = target; // "직접 실행일 때만" 도는 스크립트(prod-aging.ts 등)가 사본을 직접 실행으로 알게
    const log: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => { log.push(a.map(String).join(' ')); };
    const g = globalThis as { __b1f?: Record<string, { n: number; r: number; fit: number; by: Record<string, number> }> };
    if (tokens.includes('f')) g.__b1f = {};
    try { await import(target); } finally { console.log = orig; }
    if (g.__b1f) {
      log.push('\n### [B1 f] 시장별 스타일 배수(호출 가중 평균 — 매력도 계산마다 1번) · 가장 가까운 스타일 분포');
      log.push('| 시장 | 호출 | 평균 배수 | 평균 fit | 스타일 분포 |\n|---|---|---|---|---|');
      for (const [k, x] of Object.entries(g.__b1f)) log.push(`| ${k} | ${x.n} | ×${(x.r / x.n).toFixed(4)} | ${(x.fit / x.n).toFixed(2)} | ${Object.entries(x.by).map(([id, c]) => `${id} ${((c / x.n) * 100).toFixed(0)}%`).join(' · ')} |`);
      delete g.__b1f;
    }
    results.push({ v, out: log.join('\n') });
    console.log(`\n=== 변형 ${v} (${tokens.length ? tokens.join(' + ') : '고침 없음'}) ===\n${log.join('\n')}`);
  } finally {
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  }
}
