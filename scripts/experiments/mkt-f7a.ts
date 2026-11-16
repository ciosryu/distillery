// F7-A 하네스 — 국내 대량 판로 · 증산 · 핵심 전문가를 한 판정으로 (설계: docs/design/mgt-stage-t.md `[제안 P-MGT-53]` §2~§6, 결정 #327 뒤 구현)
// 측정 스크립트만이다 — 게임 코드·기본 출력은 그대로. 행은 `mkt-p8v.ts SET=F7A`가 P8(mvp-human.ts) 위에서 돈다.
//
// 이 파일이 하는 일
//   ① 행 목록 `f7aRows()` — 블록 A(납품 × 규모 × 위약금 30행) · B(전문가 × 전략군, 겹침 빼고 10행) · C(같은 판본 수출 짝, 겹침 빼고 6행) = 46행
//   ② `run`   — 행을 PARTS(기본 4)묶음으로 나눠 프로세스 여럿으로 돌리고(`ONLY`), 묶음마다 출력 파일을 남긴 뒤 합친다
//   ③ `merge` — 출력 파일들의 시드별 줄(`#F7A {…}` — mkt-p8v가 판마다 한 줄)을 모아 행 요약 · 시드 짝 차이 · 합격 조건 보조 지표 표를 낸다
//
// 실행
//   npx tsx scripts/experiments/mkt-f7a.ts run [시드=40] [개월=180]      TIER=standard|micro(기본 standard) · PARTS=4 · OUT=<폴더>(기본 <임시 폴더>/f7a-out/<TIER>-<개월> — 남길 출력은 OUT을 준다) · ONLY=<행,…>(줄여 돌리기)
//   npx tsx scripts/experiments/mkt-f7a.ts merge <파일|폴더> [<파일|폴더> …]   티어·개월이 다른 출력을 함께 주면 티어·개월별로 나눠 표를 낸다
//   npx tsx scripts/experiments/mkt-f7a.ts rows                          행 목록만 본다
// 행 하나만 손으로: SET=F7A ONLY=A4·b15,A4·0 npx tsx scripts/experiments/mkt-p8v.ts 10 180
//
// 행 이름(첫 낱말 = ID)
//   A<배치>·<납품><위약금%>   납품: 0 끔 · b 봇 규칙(= X0F `retailFrom: 84` — 위스키 제안은 늘) · m 중간 계약(위스키 600병/월 이하) · s 작은 계약(위스키 300병/월만)
//                            예: A4·b15 = X0(첫 행) · A8·b15 = X13F · A6·s100 = 6배치 · 작은 계약 · 위약금 100%
//   B<전략군>·<전문가>        전략군: 4 · 8(배치) · P(장기 보유 X0P — 96개월부터 8통 보호) · 전문가: sales · none · wh(숙성고 매니저) · bl(마스터 블렌더). 납품 = 봇 규칙 · 15%
//                            (4·sales = A4·b15, 8·sales = A8·b15 — 한 번만 돈다)
//   C<배치>·<납품>x           수출 잠금을 84개월에 실험으로 푼 짝(x) — 잠긴 짝은 블록 A의 A<배치>·0 · A<배치>·b15
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface F7Row {
  id: string; name: string; block: 'A' | 'B' | 'C';
  /** 전략군: 몰트 배치 수 또는 장기 보유(P) */ group: 4 | 6 | 8 | 'P';
  /** 납품 정책 */ retail: '0' | 'b' | 'm' | 's';
  /** 미납 위약금(범주 기준가 대비 %) — 지금 게임 값 15 */ penalty: 15 | 50 | 100;
  specialist: 'sales' | 'none' | 'warehouse' | 'blender';
  /** 84개월에 수출 잠금을 실험으로 푼다(블록 C) */ exportUnlock: boolean;
  /** P8 생성기에 넘길 덮어쓰기 — base = P8의 새 X0 묶음(X0F) */ over(base: Record<string, unknown>): Record<string, unknown>;
}

const RETAIL_KO = { '0': '납품 끔', b: '봇 규칙', m: '중간 계약(600병↓)', s: '작은 계약(300병)' } as const;
const SPEC_KO = { sales: '영업', none: '안 고름', warehouse: '숙성고 매니저', blender: '마스터 블렌더' } as const;
const SPEC_ID = { sales: 'sales', none: 'none', warehouse: 'wh', blender: 'bl' } as const;
export const GAME_PENALTY = 15;

function row(block: F7Row['block'], id: string, x: Pick<F7Row, 'group' | 'retail' | 'penalty' | 'specialist' | 'exportUnlock'>): F7Row {
  const g = x.group === 'P' ? '장기 보유(X0P)' : `${x.group}배치`;
  const name = `${id} ${g} · ${RETAIL_KO[x.retail]}${x.retail === '0' ? '' : ` · 위약금 ${x.penalty}%`}${x.specialist === 'sales' ? '' : ` · 전문가 ${SPEC_KO[x.specialist]}`}${x.exportUnlock ? ' · 수출 84개월 실험 해제' : ''}`;
  return {
    id, name, block, ...x,
    over: (base) => {
      const ext: Record<string, unknown> = {};
      if (x.penalty !== GAME_PENALTY) ext.retail = { penaltyShare: x.penalty / 100 };
      if (x.exportUnlock) ext.exportUnlock = true;
      return {
        ...base,
        // 4배치는 P8 기본(X0)이라 maltB를 쓰지 않는다 — X0와 같은 정책 객체
        ...(x.group === 6 || x.group === 8 ? { maltB: x.group } : {}),
        ...(x.group === 'P' ? { protectFrom: [96, 8] } : {}),
        // 납품: 봇 규칙(b)은 X0F의 retailFrom 84 그대로. 나머지는 봇 규칙을 끄고 MKT 손잡이(mktP8Hooks retailMode)가 받는다
        ...(x.retail === 'b' ? {} : { retailFrom: undefined }),
        ...(x.retail === 'm' ? { retailMode: 'mid' } : x.retail === 's' ? { retailMode: 'small' } : {}),
        ...(x.specialist === 'sales' ? {} : { specialist: x.specialist }),
        ...(Object.keys(ext).length ? { ext } : {}),
      };
    },
  };
}

/** F7-A 46행 — 첫 행은 X0(A4·b15). P8의 「X0 대비」 표가 첫 항목을 기준으로 읽는다 */
export function f7aRows(): F7Row[] {
  const rows: F7Row[] = [];
  const base = { specialist: 'sales', exportUnlock: false } as const;
  for (const b of [4, 6, 8] as const) {
    for (const r of ['b', 'm', 's'] as const) for (const p of [15, 50, 100] as const) rows.push(row('A', `A${b}·${r}${p}`, { ...base, group: b, retail: r, penalty: p }));
    rows.push(row('A', `A${b}·0`, { ...base, group: b, retail: '0', penalty: GAME_PENALTY }));
  }
  for (const g of [4, 8, 'P'] as const) for (const sp of ['sales', 'none', 'warehouse', 'blender'] as const) {
    if (sp === 'sales' && g !== 'P') continue; // = A4·b15 · A8·b15
    rows.push(row('B', `B${g}·${SPEC_ID[sp]}`, { group: g, retail: 'b', penalty: GAME_PENALTY, specialist: sp, exportUnlock: false }));
  }
  for (const b of [4, 6, 8] as const) for (const r of ['0', 'b'] as const) rows.push(row('C', `C${b}·${r}x`, { group: b, retail: r, penalty: GAME_PENALTY, specialist: 'sales', exportUnlock: true }));
  return rows;
}

// ── 시드별 줄 (mkt-p8v가 판마다 낸다) ──
export interface F7Line {
  id: string; tier: string; months: number; seed: number;
  /** 게임 순자산(#317 처분 예상액) · 옛 식 */ nw: number; nwLegacy: number;
  survived: boolean; /** 파산한 달(없으면 -1) */ bankrupt: number;
  /** 승리 분류(metrics.ts WinClass) · 승리 달 */ win: string; winMonth?: number;
  /** P8의 6년 안 최저 현금 · 판 전체 최저 현금과 그 달 */ minCash72: number; minCash: number; minCashMonth: number;
  /** 24~60개월 월말 현금 최저(Death Valley)와 그 달 · 83개월 결산 뒤 현금·순자산(합격 조건 4 — 84개월 전은 같은 전략군끼리 같아야 한다). 판이 그 전에 끝났으면 null */
  dv?: number | null; dvMonth?: number; cash83?: number | null; nw83?: number | null;
  /** 납품(mktP8Hooks f7Seeds) */ contracts: number; retailRev: number; penalty: number; shortBottles: number; shortMonths: number; broken: number; domRev: number;
  /** MGT 수출 열 등 — 있으면 그대로 실린다 */ [k: string]: unknown;
}
export const F7_PREFIX = '#F7A ';

// ── 통계 ──
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v: number[]) => { const m = mean(v); return v.length > 1 ? Math.sqrt(v.reduce((t, x) => t + (x - m) ** 2, 0) / (v.length - 1)) : NaN; };
const quant = (v: number[], q: number) => { const s = [...v].sort((a, b) => a - b); if (!s.length) return NaN; const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo]! + (s[hi]! - s[lo]!) * (i - lo); };
/** Wilson 95% 구간 */
export function wilson(k: number, n: number): [number, number] {
  if (!n) return [NaN, NaN];
  const z = 1.96, p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - h) / d, (c + h) / d];
}
const eok = (x: number, d = 2) => (Number.isFinite(x) ? (x / 1e8).toFixed(d) : '—');
const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '—');

/** 같은 시드끼리 a − b (둘 다 있는 시드만) */
export function paired(a: Map<number, F7Line> | undefined, b: Map<number, F7Line> | undefined) {
  const d: number[] = [];
  if (a && b) for (const [seed, x] of a) { const y = b.get(seed); if (y) d.push(x.nw - y.nw); }
  const m = mean(d), s = sd(d), n = d.length, wins = d.filter((x) => x > 0).length, ties = d.filter((x) => x === 0).length;
  return { n, mean: m, t: n > 1 && s > 0 ? m / (s / Math.sqrt(n)) : NaN, wins, ties, ci: wilson(wins, n) };
}
const pairCell = (p: ReturnType<typeof paired>) => (p.n ? `${p.mean >= 0 ? '+' : ''}${eok(p.mean)} · t ${Number.isFinite(p.t) ? p.t.toFixed(1) : '—'} · ${p.wins}/${p.n}${p.ties ? `(같음 ${p.ties})` : ''} · ${pct(p.ci[0])}~${pct(p.ci[1])}` : '—');

export function readLines(paths: string[]): F7Line[] {
  const files: string[] = [];
  for (const p of paths) {
    if (!existsSync(p)) throw new Error(`merge: ${p} 없음`);
    if (statSync(p).isDirectory()) files.push(...readdirSync(p).filter((f) => f.endsWith('.txt')).sort().map((f) => join(p, f)));
    else files.push(p);
  }
  const out: F7Line[] = [];
  for (const f of files) for (const l of readFileSync(f, 'utf8').split('\n')) if (l.startsWith(F7_PREFIX)) out.push(JSON.parse(l.slice(F7_PREFIX.length)) as F7Line);
  return out;
}

export function report(lines: F7Line[], log: (s: string) => void = console.log): void {
  const rows = f7aRows();
  const frames = new Map<string, Map<string, Map<number, F7Line>>>();
  for (const l of lines) {
    const k = `${l.tier}·${l.months}개월`;
    const f = frames.get(k) ?? new Map<string, Map<number, F7Line>>(); frames.set(k, f);
    const m = f.get(l.id) ?? new Map<number, F7Line>(); f.set(l.id, m);
    if (m.has(l.seed)) throw new Error(`merge: ${k} ${l.id} 시드 ${l.seed}가 두 번 나온다 — 같은 행을 두 묶음이 돌았다`);
    m.set(l.seed, l);
  }
  for (const [frame, f] of frames) {
    const get = (id: string) => f.get(id);
    const have = rows.filter((r) => f.has(r.id));
    const seedsOf = (id: string) => [...(get(id)?.keys() ?? [])].sort((a, b) => a - b);
    const all = [...new Set(have.flatMap((r) => seedsOf(r.id)))].sort((a, b) => a - b);
    log(`\n## F7-A · ${frame} — ${have.length}/${rows.length}행 · 시드 ${all.length ? `${all[0]}~${all.at(-1)} (${all.length})` : '없음'}`);
    const missing = rows.filter((r) => !f.has(r.id)).map((r) => r.id);
    if (missing.length) log(`- 없는 행: ${missing.join(' · ')}`);
    const uneven = have.filter((r) => seedsOf(r.id).length !== all.length).map((r) => `${r.id}(${seedsOf(r.id).length})`);
    if (uneven.length) log(`- **시드 수가 다른 행: ${uneven.join(' · ')}** — 짝 비교는 둘 다 있는 시드만 쓴다`);

    // 1. 행 요약
    log('\n### 1. 행 요약 (순자산 = 게임 `netWorth` 처분 예상액, 억 · 파산 판은 파산한 달의 값)');
    log('| 행 | 판 | 순자산 평균 | P10 | 하위 20% 평균 | 옛 식 평균 | 파산 | 승리 | 승리 달 중앙값 | 계약(건) | 납품 매출 | 미납 병 | 위약금 | 파기 | 24~60개월 최저 현금 평균 |');
    log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of have) {
      const v = [...get(r.id)!.values()], nw = v.map((x) => x.nw), n = v.length;
      const low = [...nw].sort((a, b) => a - b).slice(0, Math.max(1, Math.round(n * 0.2)));
      const wins = v.filter((x) => x.win === 'win'), wm = wins.map((x) => x.winMonth ?? NaN).filter(Number.isFinite);
      const cls = [...new Set(v.map((x) => x.win))].filter((c) => c !== 'win').map((c) => `${c} ${v.filter((x) => x.win === c).length}`).join(' · ');
      log(`| ${r.name} | ${n} | ${eok(mean(nw))} | ${eok(quant(nw, 0.1))} | ${eok(mean(low))} | ${eok(mean(v.map((x) => x.nwLegacy)))} | ${v.filter((x) => !x.survived).length}/${n} | ${wins.length}/${n}${cls ? ` (${cls})` : ''} | ${wm.length ? quant(wm, 0.5).toFixed(0) : '—'} | ${mean(v.map((x) => x.contracts)).toFixed(1)} | ${eok(mean(v.map((x) => x.retailRev)))} | ${Math.round(mean(v.map((x) => x.shortBottles))).toLocaleString()} | ${eok(mean(v.map((x) => x.penalty)), 3)} | ${mean(v.map((x) => x.broken)).toFixed(2)} | ${eok(mean(v.map((x) => x.dv ?? NaN).filter(Number.isFinite)))} |`);
    }
    const cell = (a: string, b: string) => pairCell(paired(get(a), get(b)));
    const note = '(칸 = 같은 시드 짝 차이 평균(억) · t · 이긴 시드/짝 수 · 이긴 비율의 Wilson 95% 구간)';

    // 2. 블록 A — 납품 끔 대비
    log(`\n### 2. 블록 A — 「납품 끔」(A<배치>·0) 대비 ${note}`);
    log('| 규모 | 납품 정책 | 위약금 15%(지금) | 50% | 100% |\n|---|---|---|---|---|');
    for (const b of [4, 6, 8]) for (const r of ['b', 'm', 's'] as const) log(`| ${b}배치 | ${RETAIL_KO[r]} | ${[15, 50, 100].map((p) => cell(`A${b}·${r}${p}`, `A${b}·0`)).join(' | ')} |`);

    // 3. 합격 조건 1 + 보조 지표 — 봇 규칙 대 작은 계약
    log(`\n### 3. 합격 조건 1 — 「봇 규칙」 − 「작은 계약」 · 「봇 규칙」 − 「중간 계약」 ${note}`);
    log('보조 지표(#581 §5-1): 이긴 비율이 30~70%인 칸 = 실제로 갈리는 선택(★)');
    log('| 규모 | 위약금 | 봇 규칙 − 작은 계약 | 봇 규칙 − 중간 계약 | 중간 − 작은 계약 |\n|---|---|---|---|---|');
    for (const b of [4, 6, 8]) for (const p of [15, 50, 100]) {
      const bs = paired(get(`A${b}·b${p}`), get(`A${b}·s${p}`));
      const star = bs.n && bs.wins / bs.n >= 0.3 && bs.wins / bs.n <= 0.7 ? ' ★' : '';
      log(`| ${b}배치 | ${p}% | ${pairCell(bs)}${star} | ${cell(`A${b}·b${p}`, `A${b}·m${p}`)} | ${cell(`A${b}·m${p}`, `A${b}·s${p}`)} |`);
    }

    // 4. 합격 조건 2 — 증산 이득: 잠긴 판 대 수출 실험 해제 판
    log(`\n### 4. 합격 조건 2 — 증산 이득(8배치 − 4배치 · 6배치 − 4배치) ${note}`);
    log('| 판 | 납품 | 위약금 | 6배치 − 4배치 | 8배치 − 4배치 |\n|---|---|---|---|---|');
    log(`| 수출 잠김(게임) | 납품 끔 | — | ${cell('A6·0', 'A4·0')} | ${cell('A8·0', 'A4·0')} |`);
    for (const r of ['b', 'm', 's'] as const) for (const p of [15, 50, 100]) log(`| 수출 잠김(게임) | ${RETAIL_KO[r]} | ${p}% | ${cell(`A6·${r}${p}`, `A4·${r}${p}`)} | ${cell(`A8·${r}${p}`, `A4·${r}${p}`)} |`);
    log(`| **수출 실험 해제** | 납품 끔 | — | ${cell('C6·0x', 'C4·0x')} | ${cell('C8·0x', 'C4·0x')} |`);
    log(`| **수출 실험 해제** | 봇 규칙 | 15% | ${cell('C6·bx', 'C4·bx')} | ${cell('C8·bx', 'C4·bx')} |`);

    // 5. 블록 C — 같은 판본 수출 짝
    log(`\n### 5. 블록 C — 수출 실험 해제 − 잠김(같은 판본 · 같은 시드) ${note}`);
    log('| 규모 | 납품 끔 | 봇 규칙(15%) | 잠긴 판에서 납품이 메운 몫 |\n|---|---|---|---|');
    for (const b of [4, 6, 8]) {
      const lost = paired(get(`C${b}·0x`), get(`A${b}·0`)), fill = paired(get(`A${b}·b15`), get(`A${b}·0`));
      log(`| ${b}배치 | ${pairCell(lost)} | ${cell(`C${b}·bx`, `A${b}·b15`)} | ${lost.n && fill.n && lost.mean > 0 ? pct(fill.mean / lost.mean) : '—'} |`);
    }
    log('(메운 몫 = (봇 규칙 − 납품 끔) ÷ (수출 해제 · 납품 끔 − 잠김 · 납품 끔). 수출 잠금 손실이 0 이하면 —)');

    // 6. 블록 B — 전문가 × 전략군
    log(`\n### 6. 블록 B — 전문가(영업 대비) ${note}`);
    log('| 전략군 | 안 고름 − 영업 | 숙성고 매니저 − 영업 | 마스터 블렌더 − 영업 | 평균 1위 |\n|---|---|---|---|---|');
    for (const g of [4, 8, 'P'] as const) {
      const sales = g === 'P' ? 'BP·sales' : `A${g}·b15`;
      const ids: [string, string][] = [['영업', sales], ['안 고름', `B${g}·none`], ['숙성고 매니저', `B${g}·wh`], ['마스터 블렌더', `B${g}·bl`]];
      const rank = ids.filter(([, id]) => f.has(id)).map(([k, id]) => [k, mean([...get(id)!.values()].map((x) => x.nw))] as const).sort((a, b) => b[1] - a[1]);
      log(`| ${g === 'P' ? '장기 보유(X0P)' : `${g}배치`} | ${cell(`B${g}·none`, sales)} | ${cell(`B${g}·wh`, sales)} | ${cell(`B${g}·bl`, sales)} | ${rank.length ? `${rank[0]![0]} ${eok(rank[0]![1])}` : '—'} |`);
    }

    // 7. 합격 조건 4 — 파산 · 초반 불변
    log('\n### 7. 합격 조건 4 — 파산 · 84개월 전이 같은 전략군의 기준 행과 같은가');
    log('납품(84개월) · 수출 해제(84개월) · 전문가(120개월)는 모두 84개월 뒤 요소다. 24~60개월 최저 현금이나 83개월 결산 뒤 현금·순자산이 기준 행과 다른 시드가 있으면 측정 틀이 초반에 닿은 것이다');
    const bad: string[] = [];
    let bankrupt = 0, compared = 0;
    for (const r of have) {
      const ref = r.group === 'P' ? 'BP·sales' : `A${r.group}·0`;
      const a = get(r.id)!, b = get(ref);
      bankrupt += [...a.values()].filter((x) => !x.survived).length;
      if (!b || r.id === ref) continue;
      compared++;
      const diff = [...a].filter(([seed, x]) => { const y = b.get(seed); return y && (y.dv !== x.dv || y.cash83 !== x.cash83 || y.nw83 !== x.nw83); }).length;
      if (diff) bad.push(`${r.id} ↔ ${ref}: ${diff}시드`);
    }
    log(`- 파산: ${bankrupt}판 / ${have.reduce((t, r) => t + get(r.id)!.size, 0)}판`);
    log(`- 84개월 전(24~60개월 최저 현금 · 83개월 현금·순자산)이 기준 행과 다른 행: ${bad.length ? `**${bad.join(' · ')}**` : `없음(${compared}행 견줌)`}`);
    const extra = [...new Set(lines.flatMap((l) => Object.keys(l)))].filter((k) => k.startsWith('x_'));
    if (extra.length) {
      // 이름이 Rev로 끝나는 열은 원 → 억
      const fmt = (k: string, x: number) => (k.endsWith('Rev') ? eok(x) : x.toLocaleString(undefined, { maximumFractionDigits: 1 }));
      log('\n### 8. 덧붙은 열 — 수출(MGT f7Exports, 판 평균 · Rev = 억)');
      log(`| 행 | ${extra.map((k) => k.slice(2)).join(' | ')} |\n|---|${extra.map(() => '---').join('|')}|`);
      for (const r of have) log(`| ${r.id} | ${extra.map((k) => { const v = [...get(r.id)!.values()].map((x) => x[k]).filter((y) => y != null).map(Number).filter(Number.isFinite); return v.length ? fmt(k, mean(v)) : '—'; }).join(' | ')} |`);
    }
  }
}

// ── 실행 ──
async function run(seeds: number, months: number): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const tier = process.env.TIER ?? 'standard';
  const parts = Math.max(1, Number(process.env.PARTS ?? 4));
  const out = process.env.OUT ?? join(tmpdir(), 'f7a-out', `${tier}-${months}`);
  mkdirSync(out, { recursive: true });
  const only = process.env.ONLY?.split(',');
  const ids = f7aRows().map((r) => r.id).filter((id) => !only || only.includes(id));
  if (!ids.length) throw new Error(`run: ONLY=${process.env.ONLY}에 맞는 행이 없다`);
  // 돌아가며 나눈다 — 8배치 행(판이 길다)이 한 묶음에 몰리지 않게
  const chunks = Array.from({ length: Math.min(parts, ids.length) }, (_, i) => ids.filter((_, j) => j % Math.min(parts, ids.length) === i));
  console.log(`[mkt-f7a] ${tier} · ${seeds}시드 × ${months}개월 · ${ids.length}행을 ${chunks.length}묶음으로 → ${out}`);
  const t0 = Date.now();
  const files = await Promise.all(chunks.map((chunk, i) => new Promise<string>((resolve, reject) => {
    const file = join(out, `part-${i + 1}.txt`);
    const ws = createWriteStream(file);
    const child = spawn('npx', ['tsx', join(here, 'mkt-p8v.ts'), String(seeds), String(months)], { env: { ...process.env, SET: 'F7A', TIER: tier, ONLY: chunk.join(','), METRICS: process.env.METRICS ?? '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(ws); child.stderr.pipe(ws, { end: false });
    child.on('error', reject);
    child.on('close', (code) => { console.log(`[mkt-f7a] 묶음 ${i + 1}/${chunks.length} 끝(${chunk.length}행 · 종료 ${code} · ${((Date.now() - t0) / 60000).toFixed(1)}분)`); if (code === 0) resolve(file); else reject(new Error(`묶음 ${i + 1} 실패(종료 ${code}) — ${file}`)); });
  })));
  const ws = createWriteStream(join(out, 'merged.md'));
  report(readLines(files), (s) => { console.log(s); ws.write(`${s}\n`); });
  ws.end();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === 'run') await run(Number(rest[0] ?? 40), Number(rest[1] ?? 180));
  else if (mode === 'merge' && rest.length) report(readLines(rest));
  else if (mode === 'rows') { for (const r of f7aRows()) console.log(`${r.block} | ${r.name} | ${JSON.stringify(r.over({ '…X0F': 1 }))}`); console.log(`${f7aRows().length}행`); }
  else { console.error('쓰는 법: mkt-f7a.ts run [시드=40] [개월=180] | merge <파일|폴더>… | rows'); process.exit(1); }
}
