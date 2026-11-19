// F7-B 래퍼 (P-MGT-55) — P8(mvp-human.ts) 위에 X0B 행(X0 + 대출 banner)을 더하고, 판마다 `#F7B {…}` 한 줄을 낸다. f7b.ts가 설정마다 이 파일을 돌린다.
// 끼움 자리(p8Hooks)만 쓴다 — P8 소스는 그대로. 난이도는 DIFF=, 후보 값은 KNOB_CAND=(mgtKnobs.ts)로 받는다.
import { F7B_PREFIX, X0B_NAME, X12FB_NAME, type F7bLine } from './f7b';
import { setP8Hooks } from './p8Hooks';

/** P8 Row 중 이 래퍼가 읽는 몫 */
interface P8Row { bankrupt3: number; loansMax: number; goal: boolean; cands: number[]; outcome: { netWorth: number }; cap: { minCash72: number; negMonths: number; interest: number }; win: { cls: string; winMonth?: number } }
/** 판마다 쌓는 값 — 24~60개월 최저 현금 · 써 본 대출 상품 */
const track = new Map<string, Map<number, { dv: number; loans: Set<string> }>>();

setP8Hooks({
  // X0 다음에 X0B를 더한다 — 첫 항목은 X0 그대로(비교 표 기준, p8Hooks 규칙)
  // X12FB(2차 판, 증산 꼬리 확인): X12F(6배치)에 대출 banner — 증산 판 파산이 「싼 정책자금만」 정책 탓인지 가른다
  policies: (list, make, base) => [...list, make(X0B_NAME, { ...(base as object), loans: 'banner' }), make(X12FB_NAME, { ...(base as object), maltB: 6, loans: 'banner' })],
  afterMonth: (s, p, m, seed) => {
    const byName = track.get(p.name) ?? new Map();
    track.set(p.name, byName);
    const t = byName.get(seed) ?? { dv: Infinity, loans: new Set<string>() };
    byName.set(seed, t);
    if (m >= 24 && m <= 60 && s.finance.cash < t.dv) t.dv = s.finance.cash;
    for (const l of s.finance.loans) t.loans.add(l.offerId);
  },
  atEnd: (all) => {
    for (const [name, rows] of all as Map<string, P8Row[]>) {
      const strat = name.split(' ')[0]!;
      rows.forEach((x, i) => {
        const seed = i + 1, t = track.get(name)?.get(seed);
        const loanIds = t ? [...t.loans].sort() : [];
        const line: F7bLine = {
          cfg: process.env.F7B_CFG ?? '?', strat, tier: process.env.TIER!, months: MONTHS, seed,
          nw: x.outcome.netWorth, bankrupt: x.bankrupt3, win: x.win.cls, winMonth: x.win.winMonth ?? null,
          dv: t && Number.isFinite(t.dv) ? t.dv : null, negMonths: x.cap.negMonths, minCash72: x.cap.minCash72,
          ladder: loanIds.length, loanIds, loansMax: x.loansMax, interest: x.cap.interest, emergency: loanIds.includes('emergency'),
          cands144: x.cands[3] ?? null, goal: x.goal,
        };
        console.log(F7B_PREFIX + JSON.stringify(line));
      });
    }
  },
});
/** 측정 개월 — P8과 같은 자리 인수(시드, 개월) */
const MONTHS = Number(process.argv[3] ?? 180);
process.env.P8 = '1';
process.env.TIER ??= 'standard';
await import('./mvp-human');
