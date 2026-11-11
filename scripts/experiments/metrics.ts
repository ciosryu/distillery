// MGT-D 판정 지표 (요구사항 감사 Phase B — docs/design/mgt-stage-t.md 「요구사항」 REQ-MGT-4). **측정 도구이고 게임 규칙이 아니다.**
// 봇마다 "목표 달성"·순자산을 따로 세던 것을 한 정의로 맞춘다. 정본은 게임의 판정(progress.ts judgeGoal·netWorth·마일스톤) —
// 여기서는 그것을 읽어 판 하나의 결과(outcomeOf)를 만들고, 여러 판을 묶어 지표(summarize)를 낸다.
// 판정용 봇(mvp-human.ts P8)이 METRICS=1이면 이 표를 낸다. mvp-survival.ts(ARCH)는 아직 자기 순자산 식을 쓴다 → REQ-MGT-4 엣지 ①
import type { GameState } from '../../src/sim';
import { awarenessOf } from '../../src/sim/brands';
import { GRADE, netWorth } from '../../src/sim/progress';

/** 판 하나의 결과 — 판정 달(기본 180개월) 또는 파산한 달의 상태로 만든다 */
export interface RunOutcome {
  /** 판정 달까지 파산하지 않았다 (게임 규칙: 월말 현금 < 0이 3개월 연속이면 파산 — step.ts) */
  survived: boolean;
  /** progress.netWorth — 파산한 판은 파산한 달의 값 */
  netWorth: number;
  /** 순자산 목표 = 시작 자기자본 × 목표 배수 (#141) */
  target: number;
  /** 플래그십(최소 숙성 이상 위스키)을 판 적이 있다 — 마일스톤 flagship_sold */
  flagshipSold: boolean;
  flagshipQuality?: number;
  awareness: number;
}

/** 게임 상태에서 판 하나의 결과를 읽는다. survived는 부르는 쪽이 안다(P8은 3개월 규칙을 스크립트가 센다) */
export function outcomeOf(s: GameState, survived: boolean): RunOutcome {
  const flag = s.progress.milestones.find((m) => m.id === 'flagship_sold');
  return {
    survived,
    netWorth: netWorth(s),
    target: s.scenario ? s.scenario.equity * s.scenario.goal.netWorthMultiple : NaN,
    flagshipSold: !!flag,
    ...(flag?.value != null ? { flagshipQuality: flag.value } : {}),
    awareness: awarenessOf(s),
  };
}

/** 순자산 목표 달성 (#264 "목표 달성" = #263 ①안의 "달성") — 생존 ∧ 순자산 ≥ 목표. 플래그십은 묻지 않는다 */
export const achieved = (o: RunOutcome) => o.survived && o.netWorth >= o.target;

/**
 * 등급 (#263 ①안 — 등급표는 그대로, 결과 이름만): 파산 F ·
 * 생존 + 순자산 + 플래그십 → A, 그중 순자산 ≥ 목표 × GRADE.sNetWorthRatio ∧ 플래그십 품질 ≥ GRADE.sFlagshipQuality ∧ 인지도 ≥ GRADE.sAwareness → S ·
 * 생존 + (순자산 또는 플래그십 하나) → B · 생존만 → C.
 * B에는 "순자산 달성·플래그십 없음"(①안의 '달성')과 "플래그십만·순자산 미달"(결과 '놓침')이 함께 든다 → B↑ 비율 ≠ 달성률 (REQ-MGT-4 엣지 ③)
 */
export function grade(o: RunOutcome): 'S' | 'A' | 'B' | 'C' | 'F' {
  if (!o.survived) return 'F';
  const nw = o.netWorth >= o.target;
  if (nw && o.flagshipSold) return o.netWorth >= o.target * GRADE.sNetWorthRatio && (o.flagshipQuality ?? 0) >= GRADE.sFlagshipQuality && o.awareness >= GRADE.sAwareness ? 'S' : 'A';
  return nw || o.flagshipSold ? 'B' : 'C';
}

/** 비율의 95% 신뢰구간 (Wilson) — 40시드 판정의 표본 오차를 같이 적는다 */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n <= 0) return [NaN, NaN];
  const p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
/** 분위수 (최근접 순위, 0~1) */
export const quantile = (xs: number[], q: number) => { const a = sorted(xs); return a.length ? a[Math.min(a.length - 1, Math.max(0, Math.ceil(q * a.length) - 1))]! : NaN; };

/** 여러 판(같은 정책·티어·시드 목록)을 묶은 지표 — 순자산 통계는 **파산 판도 넣는다**(파산한 달의 순자산). 생존 판만의 평균은 생존 편향이라 따로 적는다 */
export function summarize(os: RunOutcome[]) {
  const n = os.length;
  const k = (f: (o: RunOutcome) => boolean) => os.filter(f).length;
  const g = os.map(grade);
  const nws = os.map((o) => o.netWorth);
  const worst = sorted(nws).slice(0, Math.max(1, Math.ceil(n * 0.2)));
  const alive = os.filter((o) => o.survived).map((o) => o.netWorth);
  return {
    n,
    survival: k((o) => o.survived) / n,
    goal: k(achieved) / n,
    goalCI: wilson(k(achieved), n),
    flagship: k((o) => o.survived && o.flagshipSold) / n,
    grades: { S: g.filter((x) => x === 'S').length, A: g.filter((x) => x === 'A').length, B: g.filter((x) => x === 'B').length, C: g.filter((x) => x === 'C').length, F: g.filter((x) => x === 'F').length },
    bPlus: g.filter((x) => x === 'S' || x === 'A' || x === 'B').length / n,
    aPlus: g.filter((x) => x === 'S' || x === 'A').length / n,
    sRate: g.filter((x) => x === 'S').length / n,
    nwMean: nws.reduce((a, b) => a + b, 0) / n,
    nwMedian: quantile(nws, 0.5),
    nwP10: quantile(nws, 0.1),
    /** 하위 20% 판 평균(CVaR 20%) — 나쁜 시드에서 얼마나 무너지나 */
    nwCVaR20: worst.reduce((a, b) => a + b, 0) / worst.length,
    nwAliveMean: alive.length ? alive.reduce((a, b) => a + b, 0) / alive.length : NaN,
    target: os[0]?.target ?? NaN,
  };
}

/**
 * 달마다 보는 지표 (BALANCE-SPEC §9 열린 문제 4 — MGT) — 봇이 매달 advanceMonth 뒤 observe(s)를 부르면 판 끝에 summary()로 낸다.
 *  월 영업 현금흐름(결산 operatingCash — 투자·차입 제외) · 현금 부족 최대 연속 개월 · 12년↑(플래그십 최소 숙성) 통의 보유·병입·판매
 *  게임 리포트는 최근 24개월만 자세히 남으므로(lifecycle) 판 전체 지표는 이렇게 달마다 모은다
 */
export class MonthTracker {
  private op: number[] = [];
  private negRun = 0;
  maxNegRun = 0;
  /** 12년↑ 자체 원액 통 수 — 144·168·180개월(판정 달) 시점 */
  oldCasks: Record<number, number> = {};
  /** 플래그십 최소 숙성 이상으로 병입된 위스키 병 수(제품 재고 + 판매 누계, 판 끝) · 판 병 수 */
  oldBottled = 0;
  oldSold = 0;
  private oldIds = new Set<string>();
  observe(s: GameState): void {
    const r = s.history.reports.at(-1);
    if (r) this.op.push(r.operatingCash ?? r.netCash);
    this.negRun = s.finance.cash < 0 ? this.negRun + 1 : 0;
    this.maxNegRun = Math.max(this.maxNegRun, this.negRun);
    const min = s.scenario?.goal.flagshipMinMonths ?? 144;
    if ([144, 168, 180].includes(s.month)) this.oldCasks[s.month] = s.inventory.casks.filter((c) => c.contents && !c.owner && c.contents.oakMonths >= min && (c.contents.kind === 'malt' || c.contents.kind === 'grain')).length;
    // 보관된 옛 제품(productArchive)에는 숙성 정보가 없다 → 살아 있을 때 본 12년↑ 제품 id를 기억해 둔다
    for (const p of s.commerce.products) if ((p.oakMonths ?? (p.ageYears ?? 0) * 12) >= min) this.oldIds.add(p.id);
    const live = s.commerce.products.filter((p) => this.oldIds.has(p.id)), gone = s.commerce.productArchive.filter((p) => this.oldIds.has(p.id));
    this.oldSold = [...live, ...gone].reduce((t, p) => t + p.totalSold, 0);
    this.oldBottled = this.oldSold + live.reduce((t, p) => t + p.stockBottles, 0);
  }
  summary() {
    const op = this.op;
    // 영업 흑자 전환 달: 그 달부터 12개월 이동 합이 처음으로 0 이상이 되는 달(한 달 반짝 흑자는 세지 않는다)
    let breakEven = NaN;
    for (let i = 0; i + 12 <= op.length; i++) if (op.slice(i, i + 12).reduce((a, b) => a + b, 0) >= 0) { breakEven = i + 1; break; }
    return { opMin: op.length ? Math.min(...op) : NaN, opMean: op.length ? op.reduce((a, b) => a + b, 0) / op.length : NaN, breakEven, maxNegRun: this.maxNegRun, oldCasks: this.oldCasks, oldBottled: this.oldBottled, oldSold: this.oldSold };
  }
}
