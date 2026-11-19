// F7-B 하네스 — 난이도 Easy·Hard 후보 값을 한 판정으로 (설계: docs/design/mgt-stage-t.md `[제안 P-MGT-55]`, PM 승인 2026-11-19)
// 측정 스크립트만이다 — 게임 코드·KNOBS 기본값은 그대로. 후보 값은 실험 안에서만 `KNOB_CAND`(mgtKnobs.ts)로 덮어쓴다.
//
// 실행
//   npx tsx scripts/experiments/f7b.ts rows                          난이도 설정 13개 · 전략 3개
//   KNOB_CAND=docs/baseline/f7b/candidates-mgt.json[,…] npx tsx scripts/experiments/f7b.ts run [시드=40] [개월=180]
//        TIER=standard|micro(기본 standard) · PARTS=4(동시 프로세스) · OUT=<폴더>(기본 <임시 폴더>/f7b-out/<TIER>-<개월>) · CFG=<설정 id,…>(줄여 돌리기)
//   npx tsx scripts/experiments/f7b.ts merge <파일|폴더> [<파일|폴더> …]   티어·개월별로 나눠 표를 낸다
// 설정 하나만 손으로: DIFF=custom:333333 F7B_CFG=H ONLY=X0,X12F,X0B KNOB_CAND=… npx tsx scripts/experiments/f7b-p8.ts 10 180
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const F7B_PREFIX = '#F7B ';
/** 전략 — X0(기준, 대출 cheap) · X12F(6배치 증산) · X0B(X0 + 대출 banner: 비싼 대출·급전까지 내려가는 사람) */
export const F7B_STRATS = [
  { id: 'X0', ko: 'X0 (4배치 · 싼 정책자금만)' },
  { id: 'X12F', ko: 'X12F (6배치 증산)' },
  { id: 'X0B', ko: 'X0B (X0 + 비싼 대출·급전까지)' },
  { id: 'X12FB', ko: 'X12FB (X12F + 비싼 대출·급전까지)' },
] as const;
export const X0B_NAME = 'X0B X0 + 대출 banner(경고 뒤 싼 것부터 시설·운전자금·급전까지)';
export const X12FB_NAME = 'X12FB X12F + 대출 banner(경고 뒤 싼 것부터 시설·운전자금·급전까지)';

/** 난이도 설정 — 자리 순서 = DIFFICULTY_DOMAINS(macro·competition·taste·supply·incidents·finance). competition은 #329 고정이라 늘 2(E·H 프리셋은 프리셋 그대로) */
export interface F7bCfg { id: string; code: string; ko: string; domain?: 'macro' | 'taste' | 'supply' | 'incidents' | 'finance'; level?: 1 | 3 }
const DOMAIN_POS = { macro: 0, taste: 2, supply: 3, incidents: 4, finance: 5 } as const;
export function f7bConfigs(): F7bCfg[] {
  const out: F7bCfg[] = [
    { id: 'N', code: '222222', ko: 'Normal(전 영역 2)' },
    { id: 'E', code: '111111', ko: 'Easy 프리셋(전 영역 1)' },
    { id: 'H', code: '333333', ko: 'Hard 프리셋(전 영역 3)' },
  ];
  for (const d of Object.keys(DOMAIN_POS) as (keyof typeof DOMAIN_POS)[]) for (const lv of [1, 3] as const) {
    const c = '222222'.split(''); c[DOMAIN_POS[d]] = String(lv);
    out.push({ id: `${d}${lv === 1 ? 'E' : 'H'}`, code: c.join(''), ko: `${d}만 ${lv === 1 ? 'Easy' : 'Hard'}`, domain: d, level: lv });
  }
  return out;
}

/** 판마다 한 줄 — f7b-p8.ts가 낸다 */
export interface F7bLine {
  cfg: string; strat: string; tier: string; months: number; seed: number;
  /** 순자산 ③(원) · 파산 달(−1 = 생존) · 승리 분류 · 승리 달 */
  nw: number; bankrupt: number; win: string; winMonth: number | null;
  /** 24~60개월 월말 현금 최저(Death Valley) · 현금 < 0 개월 · 72개월 안 최저 현금 */
  dv: number | null; negMonths: number; minCash72: number;
  /** 대출 사다리 깊이: 쓴 상품 수 · 상품 id · 최대 대출 잔액 · 이자 합계 · 급전을 썼나 */
  ladder: number; loanIds: string[]; loansMax: number; interest: number; emergency: boolean;
  /** 144개월 플래그십 후보 통 수(적격 통 0 판 근사 — PROD 정의 확인 전) · 15년 순자산 목표 */
  cands144: number | null; goal: boolean;
}

// ───────────── 통계 ─────────────
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const median = (a: number[]) => { if (!a.length) return NaN; const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m]! : (b[m - 1]! + b[m]!) / 2; };
/** 시드 간 표준편차 — MKT 요청: 현물 지수(bulk) 손잡이는 「어렵다」보다 「점수 잡음 ↑」로 나올 수 있다 */
const sdOf = (a: number[]) => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((t, x) => t + (x - m) ** 2, 0) / (a.length - 1)) : NaN; };
const pct = (a: number[], q: number) => { if (!a.length) return NaN; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]!; };
/** 같은 시드 짝 차이 — 평균 · t · 이긴 시드 수 · 짝 수 */
export function paired(a: Map<number, number>, b: Map<number, number>): { mean: number; t: number; wins: number; n: number } {
  const d: number[] = [];
  for (const [seed, x] of a) { const y = b.get(seed); if (y != null) d.push(x - y); }
  const n = d.length, m = mean(d);
  const sd = n > 1 ? Math.sqrt(d.reduce((t, x) => t + (x - m) ** 2, 0) / (n - 1)) : NaN;
  return { mean: m, t: sd > 0 ? m / (sd / Math.sqrt(n)) : m === 0 ? 0 : Infinity * Math.sign(m), wins: d.filter((x) => x > 0).length, n };
}
/** "이김" = t ≥ 2 · "짐" = t ≤ −2 · 그 사이 "비김"(판독 틀 §8) */
export const verdictOf = (t: number) => (t >= 2 ? '이김' : t <= -2 ? '짐' : '비김');
const eok = (x: number, d = 2) => (Number.isFinite(x) ? (x / 1e8).toFixed(d) : '—');
const pd = (p: { mean: number; t: number; wins: number; n: number }) => `${p.mean >= 0 ? '+' : ''}${eok(p.mean)} · t ${Number.isFinite(p.t) ? p.t.toFixed(1) : '∞'} · ${p.wins}/${p.n}`;

// ───────────── 합치기 ─────────────
export function parseLines(text: string): F7bLine[] {
  return text.split('\n').filter((l) => l.startsWith(F7B_PREFIX)).map((l) => JSON.parse(l.slice(F7B_PREFIX.length)) as F7bLine);
}
/** 티어·개월별 표(마크다운) — 합격 조건 후보 1~7(P-MGT-55 §6) 보조 지표 포함. 판정이 아니다 */
export function f7bReport(lines: F7bLine[]): string {
  const out: string[] = [];
  const frames = [...new Set(lines.map((l) => `${l.tier}·${l.months}`))].sort();
  const cfgs = f7bConfigs();
  for (const fr of frames) {
    const L = lines.filter((l) => `${l.tier}·${l.months}` === fr);
    const by = (cfg: string, strat: string) => L.filter((l) => l.cfg === cfg && l.strat === strat);
    const nwMap = (cfg: string, strat: string) => new Map(by(cfg, strat).map((l) => [l.seed, l.nw]));
    out.push(`\n## F7-B · ${fr} — ${L.length}판`);
    // 1. 행 요약
    out.push('\n### 1. 행 요약 (순자산 = 게임 netWorth 처분 예상액, 억 · 파산 판은 파산한 달의 값)');
    out.push('| 설정 | 전략 | 판 | 순자산 평균 · P10 · 시드 표준편차 | 파산 | 승리 · 승리 달 중앙 | 목표 달성 | 24~60개월 최저 현금 중앙 | 현금<0 개월 평균 | 대출 상품 수 · 최대 잔액 · 이자 | 급전 쓴 판 | 144개월 후보 0 판 |');
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const c of cfgs) for (const st of F7B_STRATS) {
      const r = by(c.id, st.id); if (!r.length) continue;
      const nws = r.map((x) => x.nw), wins = r.filter((x) => x.win === 'win');
      out.push(`| ${c.id} ${c.ko} | ${st.id} | ${r.length} | ${eok(mean(nws))} · ${eok(pct(nws, 0.1))} · ${eok(sdOf(nws))} | ${r.filter((x) => x.bankrupt >= 0).length}/${r.length} | ${wins.length}/${r.length} · ${wins.length ? median(wins.map((x) => x.winMonth ?? NaN)) : '—'} | ${r.filter((x) => x.goal).length}/${r.length} | ${eok(median(r.map((x) => x.dv ?? NaN)))} | ${mean(r.map((x) => x.negMonths)).toFixed(1)} | ${mean(r.map((x) => x.ladder)).toFixed(1)} · ${eok(mean(r.map((x) => x.loansMax)))} · ${eok(mean(r.map((x) => x.interest)))} | ${r.filter((x) => x.emergency).length}/${r.length} | ${r.filter((x) => x.cands144 === 0).length}/${r.length} |`);
    }
    // 2. Normal 대비 시드 짝 차이(영역 단독 · 프리셋)
    out.push('\n### 2. Normal 대비 같은 시드 짝 차이 (억 · t · 이긴 시드/짝) — 조건 4 방향 보존 · 조건 5 효과 미미');
    out.push(`| 설정 | ${F7B_STRATS.map((s) => s.id).join(' | ')} | 판독(X0) |`);
    out.push(`|---|${F7B_STRATS.map(() => '---').join('|')}|---|`);
    for (const c of cfgs.filter((x) => x.id !== 'N')) {
      const cells = F7B_STRATS.map((st) => { const p = paired(nwMap(c.id, st.id), nwMap('N', st.id)); return p.n ? pd(p) : '—'; });
      const p0 = paired(nwMap(c.id, 'X0'), nwMap('N', 'X0'));
      let note = '—';
      if (p0.n && c.level) {
        const wrong = (c.level === 1 && p0.t <= -2) || (c.level === 3 && p0.t >= 2);
        note = wrong ? '**방향 거꾸로(결함 후보)**' : Math.abs(p0.t) < 2 && Math.abs(p0.mean) < 0.5e8 ? '효과 미미' : verdictOf(p0.t);
      }
      out.push(`| ${c.id} ${c.ko} | ${cells.join(' | ')} | ${note} |`);
    }
    // 3. 합격 조건 후보 보조 지표
    out.push('\n### 3. 합격 조건 후보 (P-MGT-55 §6 — 봇 기준 하한, 판정 아님)');
    const H0 = by('H', 'X0'), HB = by('H', 'X0B');
    if (H0.length) out.push(`- 조건 1 Hard 생존: X0 파산 ${H0.filter((x) => x.bankrupt >= 0).length}/${H0.length}(후보 ≤ 2/40) · X0B ${HB.filter((x) => x.bankrupt >= 0).length}/${HB.length}(후보 ≤ 6/40)`);
    if (H0.length) out.push(`- 조건 2 Hard 승리: X0 ${H0.filter((x) => x.win === 'win').length}/${H0.length}(후보 ≥ 80%)`);
    for (const st of F7B_STRATS) {
      const e = paired(nwMap('E', st.id), nwMap('N', st.id)), h = paired(nwMap('N', st.id), nwMap('H', st.id));
      const nm = mean(by('N', st.id).map((x) => x.nw));
      if (e.n && h.n) out.push(`- 조건 3 간격(${st.id}): Easy − Normal ${pd(e)} · Normal − Hard ${pd(h)} · 비 ${(e.mean / h.mean).toFixed(2)}(후보 0.67~1.5) · Normal 대비 ${((e.mean / nm) * 100).toFixed(0)}% · ${((h.mean / nm) * 100).toFixed(0)}%(후보 각 ≥ 10%)`);
      const singles = cfgs.filter((c) => c.level === 3).map((c) => paired(nwMap(c.id, st.id), nwMap('N', st.id))).filter((p) => p.n);
      const hh = paired(nwMap('H', st.id), nwMap('N', st.id));
      if (singles.length === 5 && hh.n) { const sum = singles.reduce((t, p) => t + p.mean, 0); out.push(`- 조건 6 쌓임(${st.id}): Hard 프리셋 − N ${eok(hh.mean)} 대 영역 단독 Hard 합 ${eok(sum)} → 비 ${(hh.mean / sum).toFixed(2)}(후보 0.7~1.3)`); }
    }
    if (H0.length) {
      const N0 = by('N', 'X0'), E0 = by('E', 'X0');
      out.push(`- 조건 7 Death Valley(X0): Hard 24~60개월 최저 현금 중앙 ${eok(median(H0.map((x) => x.dv ?? NaN)))}억(후보 > 0) · 현금<0 개월 평균 ${mean(H0.map((x) => x.negMonths)).toFixed(1)}(후보 ≤ 1) · Easy 현금<0 ${E0.length ? mean(E0.map((x) => x.negMonths)).toFixed(1) : '—'} 대 Normal ${N0.length ? mean(N0.map((x) => x.negMonths)).toFixed(1) : '—'}`);
    }
  }
  return out.join('\n');
}

// ───────────── 실행 ─────────────
function collect(paths: string[]): F7bLine[] {
  const files: string[] = [];
  for (const p of paths) { if (statSync(p).isDirectory()) { for (const f of readdirSync(p)) if (f.endsWith('.txt')) files.push(join(p, f)); } else files.push(p); }
  return files.flatMap((f) => parseLines(readFileSync(f, 'utf8')));
}
async function run(seeds: number, months: number): Promise<void> {
  const tier = process.env.TIER ?? 'standard';
  const out = process.env.OUT ?? join(tmpdir(), 'f7b-out', `${tier}-${months}`);
  mkdirSync(out, { recursive: true });
  const want = process.env.CFG ? new Set(process.env.CFG.split(',')) : null;
  const queue = f7bConfigs().filter((c) => !want || want.has(c.id));
  const parts = Math.max(1, Number(process.env.PARTS ?? 4));
  const here = fileURLToPath(new URL('.', import.meta.url));
  console.log(`[f7b] ${tier} · ${seeds}시드 × ${months}개월 · 설정 ${queue.length}개 × 전략 ${F7B_STRATS.length} · 동시 ${parts} → ${out}${process.env.KNOB_CAND ? ` · KNOB_CAND=${process.env.KNOB_CAND}` : ' · ⚠ KNOB_CAND 없음 — KNOBS가 모두 1이라 E·H가 N과 같다'}`);
  const one = (c: F7bCfg) => new Promise<void>((done) => {
    const t0 = Date.now();
    const w = createWriteStream(join(out, `${c.id}.txt`));
    const ch = spawn('npx', ['tsx', join(here, 'f7b-p8.ts'), String(seeds), String(months)], { env: { ...process.env, METRICS: '1', TIER: tier, DIFF: `custom:${c.code}`, F7B_CFG: c.id, ONLY: F7B_STRATS.map((s) => s.id).join(',') }, stdio: ['ignore', 'pipe', 'pipe'] });
    ch.stdout.pipe(w); ch.stderr.pipe(w);
    ch.on('close', (code) => { w.end(); console.log(`[f7b] ${c.id} 끝(종료 ${code} · ${((Date.now() - t0) / 60000).toFixed(1)}분)`); done(); });
  });
  const workers = Array.from({ length: Math.min(parts, queue.length) }, async () => { for (let c = queue.shift(); c; c = queue.shift()) await one(c); });
  await Promise.all(workers);
  console.log(f7bReport(collect([out])));
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'rows') {
    for (const c of f7bConfigs()) console.log(`${c.id}\tcustom:${c.code}\t${c.ko}`);
    for (const s of F7B_STRATS) console.log(`전략 ${s.id}\t${s.ko}`);
  } else if (cmd === 'run') await run(Number(rest[0] ?? 40), Number(rest[1] ?? 180));
  else if (cmd === 'merge') { if (!rest.length || !rest.every(existsSync)) throw new Error('merge <파일|폴더> …'); console.log(f7bReport(collect(rest))); }
  else console.log('사용: f7b.ts rows | run [시드] [개월] | merge <파일|폴더> …');
}
