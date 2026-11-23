// 등급 분포 · F5d 전후 측정 래퍼 (MGT, [결정 #339] T1·T6 · F5d(#338) 전후 표 · ARCH architecture §10.10) — P8(mvp-human.ts) 위에 끼움 자리(p8Hooks)만 쓴다. 게임 규칙·봇 행동은 바꾸지 않는다(MODE가 정한 것만).
//   ONLY=X0,X0R0,X40,X41 TIER=standard GRADE_MODE=base npx tsx scripts/experiments/grade-dist.ts 40 180
// GRADE_MODE:
//   base     — 그대로(F5d 전 빌드면 기준, F5d 빌드면 「F5d」 행)
//   nosample — 판 시작 때 자동 샘플을 끈다(`inventory.autoSample = { off: true }`) — 「봇이 샘플을 안 떠서 생긴 몫」
//   oracle   — 매달 advance 직전·직후에 제품·보관 제품의 `qualityKnown`을 지운다(F5d의 「아는 품질 없음 = 공개」 길 — 정보를 가린 몫의 상한).
//              F5d 전 빌드에는 그 필드가 없어 base와 같다. 면세 전용 제품은 짝 일반 제품의 추정을 빌리므로 같이 지워진다(MKT 확인 2026-11-21)
// 판마다 `#G {…}` 한 줄(판정 달 verdict · 판정 달까지·끝까지 납품 매출 · 끝 순자산)과, 정책마다 요약 표를 낸다.
// 순자산은 `progress.ts netWorth`(처분 예상액 #317) — 등급 판정과 같은 함수. 성과 기준은 시나리오 자본금 × 배수(지금 규칙), S 순자산은 × GRADE.sNetWorthRatio
import { setP8Hooks } from './p8Hooks';
import { GRADE, netWorth } from '../../src/sim/progress';
import type { GameState } from '../../src/sim';

type Verdict = { month: number; nw: number; q?: number; aw: number; grade?: string };
interface Run { pol: string; seed: number; target: number; v?: Verdict; retail: number; retailAtVerdict?: number; nwEnd: number; months: number }

export const MODES = ['base', 'nosample', 'oracle'] as const;
export type Mode = (typeof MODES)[number];
const MODE = (process.env.GRADE_MODE ?? 'base') as Mode; // MODE는 Vite·Vitest가 쓰는 이름이라 피한다
if (!MODES.includes(MODE)) throw new Error(`MODE는 ${MODES.join('·')} 중 하나 — 받은 값 ${MODE}`);

/** 아는 품질을 지운다(오라클) — 제품과 보관 제품 모두. F5d 전 빌드에서는 지울 것이 없다 */
export function wipeKnown(s: GameState): void {
  for (const p of s.commerce.products as { qualityKnown?: unknown }[]) delete p.qualityKnown;
  for (const p of (s.commerce.productArchive ?? []) as { qualityKnown?: unknown }[]) delete p.qualityKnown;
}

const pct = (a: number[], p: number) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.round(p * (b.length - 1)))]!; };
const eok = (v: number) => (v / 1e8).toFixed(2);
const mean = (a: number[]) => (a.length ? a.reduce((t, x) => t + x, 0) / a.length : NaN);

/** 정책 하나의 판들을 표 한 줄로 */
export function summarize(rows: Run[]): Record<string, string | number> {
  const vs = rows.filter((r) => r.v).map((r) => r as Run & { v: Verdict });
  const nw = vs.map((r) => r.v.nw);
  const q = vs.map((r) => r.v.q ?? 0);
  const target = rows[0]?.target ?? 0;
  return {
    n: rows.length, wins: vs.length,
    verdictMonth: vs.length ? pct(vs.map((r) => r.v.month), 0.5) : '—',
    nwMean: vs.length ? eok(mean(nw)) : '—', nwP10: vs.length ? eok(pct(nw, 0.1)) : '—', nwP50: vs.length ? eok(pct(nw, 0.5)) : '—', nwP90: vs.length ? eok(pct(nw, 0.9)) : '—',
    geTarget: nw.filter((x) => x >= target).length, geS: nw.filter((x) => x >= target * GRADE.sNetWorthRatio).length,
    qP50: vs.length ? pct(q, 0.5).toFixed(1) : '—', qMax: vs.length ? Math.max(...q).toFixed(1) : '—', q80: q.filter((x) => x >= GRADE.sFlagshipQuality).length,
    gradeS: vs.filter((r) => r.v.grade === 'S').length,
    retailAtVerdict: vs.length ? eok(mean(vs.map((r) => r.retailAtVerdict ?? 0))) : '—', retailEnd: eok(mean(rows.map((r) => r.retail))),
    nwEnd: eok(mean(rows.map((r) => r.nwEnd))), endGeTarget: rows.filter((r) => r.nwEnd >= target).length,
  };
}

const runs = new Map<string, Run>();
setP8Hooks({
  afterCreate: (s: GameState) => { if (MODE === 'nosample') s.inventory.autoSample = { off: true }; return s; },
  beforeAdvance: (s: GameState) => { if (MODE === 'oracle') wipeKnown(s); },
  afterMonth: (s: GameState, p: { name: string }, m: number, seed: number) => {
    const pol = p.name.split(' ')[0]!;
    const k = `${pol}:${seed}`;
    const r = runs.get(k) ?? { pol, seed, target: (s.scenario?.equity ?? 0) * (s.scenario?.goal.netWorthMultiple ?? 0), retail: 0, nwEnd: 0, months: 0 };
    runs.set(k, r);
    r.retail += s.history.reports.at(-1)?.retailDealRevenue ?? 0;
    const v = s.progress.verdict;
    if (v && !r.v && v.result === 'heritage') { r.v = { month: v.month, nw: v.netWorth ?? netWorth(s), q: v.flagshipQuality, aw: v.awareness, grade: v.grade ?? undefined }; r.retailAtVerdict = r.retail; }
    r.nwEnd = netWorth(s);
    r.months = m + 1;
    if (MODE === 'oracle') wipeKnown(s);
  },
  atEnd: () => {
    const byPol = new Map<string, Run[]>();
    for (const r of runs.values()) { console.log('#G ' + JSON.stringify({ mode: MODE, tier: process.env.TIER, ...r })); byPol.set(r.pol, [...(byPol.get(r.pol) ?? []), r]); }
    const cols = ['n', 'wins', 'verdictMonth', 'nwMean', 'nwP10', 'nwP50', 'nwP90', 'geTarget', 'geS', 'qP50', 'qMax', 'q80', 'gradeS', 'retailAtVerdict', 'retailEnd', 'nwEnd', 'endGeTarget'];
    console.log(`\n## 등급 분포 — GRADE_MODE=${MODE} · TIER=${process.env.TIER} (판정 달 순자산·납품은 억, 성과 기준 = 자본금 × 배수)`);
    console.log(`| 정책 | ${cols.join(' | ')} |`);
    console.log(`|---|${cols.map(() => '---').join('|')}|`);
    for (const [pol, rows] of byPol) { const s = summarize(rows); console.log(`| ${pol} | ${cols.map((c) => s[c]).join(' | ')} |`); }
  },
});
if (!process.env.VITEST) {
  process.env.P8 = '1';
  process.env.TIER ??= 'standard';
  await import('./mvp-human');
}
