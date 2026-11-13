// MGT-D 판정 지표 (요구사항 감사 Phase B — docs/design/mgt-stage-t.md 「요구사항」 REQ-MGT-4). **측정 도구이고 게임 규칙이 아니다.**
// 봇마다 "목표 달성"·순자산을 따로 세던 것을 한 정의로 맞춘다. 정본은 게임의 판정(progress.ts judgeGoal·netWorth·마일스톤) —
// 여기서는 그것을 읽어 판 하나의 결과(outcomeOf)를 만들고, 여러 판을 묶어 지표(summarize)를 낸다.
// 판정용 봇(mvp-human.ts P8)이 METRICS=1이면 이 표를 낸다. mvp-survival.ts(ARCH)는 아직 자기 순자산 식을 쓴다 → REQ-MGT-4 엣지 ①
import type { GameState } from '../../src/sim';
import { awarenessOf } from '../../src/sim/brands';
import { campaignMinOakMonths, GRADE, netWorth } from '../../src/sim/progress';
import { monthlyFixedCost } from '../../src/sim/loans';
import { currentSuggested } from '../../src/sim/economics';

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
  // ── 가격 정책 지표 (AP3-MGT-1 — 자동 가격 3정책 #288, MKT AP3-MKT-1과 같은 정의) ──
  /** 최저 현금 · 위기 개월(현금 < 월 고정비 × 3 — 화면 파산 배너 "주의"와 같은 잣대) · 현금 < 0 개월 */
  minCash = Infinity;
  crisisMonths = 0;
  negMonths = 0;
  /** 재고 개월(판매 진열 재고 ÷ 판매 EMA — retail.overhangFactor·MKT 소진 스위치와 같은 잣대), 범주별 달마다 — 24개월부터 */
  private stockMonths: Record<string, number[]> = { whisky: [], soju_distilled: [] };
  /** 국내 수요 대비 못 판 병(품절·한도) — 범주별 [수요, 판매] 누계 · 수요를 못 채운 제품·월 수 · 판매가 있던 제품·월 수 */
  private demand: Record<string, [number, number]> = {};
  shortMonths = 0;
  sellMonths = 0;
  /** 위스키 국내 평균 실현가(매출 ÷ 병) 누계 · 출고가 변동(제품마다 지난달 대비 |Δ값|/값, 재고 있는 위스키 제품·월 평균) */
  private whiskyRev = 0;
  private whiskyBottles = 0;
  private priceMoves: number[] = [];
  private lastPrice = new Map<string, number>();
  /** MKT AP3=1 표와 같은 정의(mktP8Hooks.ts snap) — 24개월부터, 재고 있는 위스키 제품 기준
   *  stockMonthsLive: 달마다 (재고 있는 위스키 제품의 재고 합 ÷ 그 제품들의 판매 EMA 합)의 판 평균 — "팔고 있는 제품의 재고가 몇 달치인가"
   *  (위 stockMonths는 품절 제품의 판매 EMA도 분모에 넣은 범주 전체 값의 중앙값 — "범주 수요 대비 재고". 공급 부족 판에서는 둘이 크게 다르다)
   *  stockoutProductMonths: 재고 0인데 판매 EMA > 0인 위스키 제품·월 수 · avgMultiple: 값 ÷ 기준가(currentSuggested) 평균
   *  unmetBottles: Σ max(0, 국내 수요 − 판매) 병(전 범주, 판 누계) */
  private liveMonths: number[] = [];
  stockoutProductMonths = 0;
  private multiples: number[] = [];
  unmetBottles = 0;
  /** 채널 — 국내·수출 매출·병 누계 */
  domRevenue = 0; domBottles = 0; expRevenue = 0; expBottles = 0;
  /** 제품 재고 장부가(재고 × 병당 원가) 달마다 — 가격 정책이 묶는 운전자본(REQ-MGT-3과 같은 뜻, 제품 쪽) */
  private productCapital: number[] = [];
  observe(s: GameState): void {
    const r = s.history.reports.at(-1);
    if (r) this.op.push(r.operatingCash ?? r.netCash);
    this.minCash = Math.min(this.minCash, s.finance.cash);
    if (s.finance.cash < 0) this.negMonths++;
    if (s.finance.cash < 3 * monthlyFixedCost(s)) this.crisisMonths++;
    const live = s.commerce.products.filter((p) => !p.dutyFreeOnly);
    const cat = new Map<string, string>([...s.commerce.productArchive.map((p) => [p.id, p.category] as const), ...s.commerce.products.map((p) => [p.id, p.category] as const)]);
    if (s.month >= 24) for (const c of Object.keys(this.stockMonths)) {
      const ps = live.filter((p) => p.category === c);
      const ema = ps.reduce((t, p) => t + (p.salesEma ?? 0), 0);
      if (ps.length && ema > 0) this.stockMonths[c]!.push(ps.reduce((t, p) => t + p.stockBottles, 0) / ema);
    }
    if (r) {
      for (const x of r.sales) {
        const c = cat.get(x.productId) ?? '?';
        const d = (this.demand[c] ??= [0, 0]);
        d[0] += x.demandBottles; d[1] += x.bottles;
        this.unmetBottles += Math.max(0, Math.round(x.demandBottles) - x.bottles);
        if (x.demandBottles > 0) { this.sellMonths++; if (x.bottles < x.demandBottles - 0.5) this.shortMonths++; }
        this.domRevenue += x.revenue; this.domBottles += x.bottles;
        if (c === 'whisky') { this.whiskyRev += x.revenue; this.whiskyBottles += x.bottles; }
      }
      for (const x of r.exports ?? []) { this.expRevenue += x.revenue; this.expBottles += x.bottles; }
    }
    // 가격 변동·배수·재고 있는 제품 재고 개월·품절 — MKT와 같이 24개월부터(초반 출시 달의 큰 변화를 빼고)
    if (s.month >= 24) {
      const ws = live.filter((x) => x.category === 'whisky'), stocked = ws.filter((x) => x.stockBottles > 0);
      if (stocked.length) this.liveMonths.push(stocked.reduce((t, x) => t + x.stockBottles, 0) / Math.max(1, stocked.reduce((t, x) => t + (x.salesEma ?? 0), 0)));
      this.stockoutProductMonths += ws.filter((x) => x.stockBottles <= 0 && (x.salesEma ?? 0) > 0).length;
      for (const p of stocked) {
        const sug = currentSuggested(s, p);
        if (sug > 0) this.multiples.push(p.price / sug);
        const before = this.lastPrice.get(p.id);
        if (before && before > 0) this.priceMoves.push(Math.abs(p.price - before) / before);
        this.lastPrice.set(p.id, p.price);
      }
    }
    this.productCapital.push(s.commerce.products.reduce((t, p) => t + p.stockBottles * p.unitCost, 0));
    this.negRun = s.finance.cash < 0 ? this.negRun + 1 : 0;
    this.maxNegRun = Math.max(this.maxNegRun, this.negRun);
    const min = campaignMinOakMonths(s);
    if ([144, 168, 180].includes(s.month)) this.oldCasks[s.month] = s.inventory.casks.filter((c) => c.contents && !c.owner && c.contents.oakMonths >= min && (c.contents.kind === 'malt' || c.contents.kind === 'grain')).length;
    // 보관된 옛 제품(productArchive)에는 숙성 정보가 없다 → 살아 있을 때 본 12년↑ 제품 id를 기억해 둔다
    for (const p of s.commerce.products) if ((p.oakMonths ?? (p.ageYears ?? 0) * 12) >= min) this.oldIds.add(p.id);
    const oldLive = s.commerce.products.filter((p) => this.oldIds.has(p.id)), gone = s.commerce.productArchive.filter((p) => this.oldIds.has(p.id));
    this.oldSold = [...oldLive, ...gone].reduce((t, p) => t + p.totalSold, 0);
    this.oldBottled = this.oldSold + oldLive.reduce((t, p) => t + p.stockBottles, 0);
  }
  summary() {
    const op = this.op;
    // 영업 흑자 전환 달: 그 달부터 12개월 이동 합이 처음으로 0 이상이 되는 달(한 달 반짝 흑자는 세지 않는다)
    let breakEven = NaN;
    for (let i = 0; i + 12 <= op.length; i++) if (op.slice(i, i + 12).reduce((a, b) => a + b, 0) >= 0) { breakEven = i + 1; break; }
    const med = (xs: number[]) => quantile(xs, 0.5);
    const lost = (c: string) => { const d = this.demand[c]; return d && d[0] > 0 ? 1 - d[1] / d[0] : NaN; };
    return {
      opMin: op.length ? Math.min(...op) : NaN, opMean: op.length ? op.reduce((a, b) => a + b, 0) / op.length : NaN, breakEven, maxNegRun: this.maxNegRun, oldCasks: this.oldCasks, oldBottled: this.oldBottled, oldSold: this.oldSold,
      // 가격 정책 지표 (AP3-MGT-1)
      minCash: this.minCash, crisisMonths: this.crisisMonths, negMonths: this.negMonths,
      stockMonthsWhisky: med(this.stockMonths.whisky!), stockMonthsSoju: med(this.stockMonths.soju_distilled!),
      lostWhisky: lost('whisky'), lostSoju: lost('soju_distilled'), shortShare: this.sellMonths ? this.shortMonths / this.sellMonths : NaN,
      whiskyPrice: this.whiskyBottles ? this.whiskyRev / this.whiskyBottles : NaN,
      priceVolatility: this.priceMoves.length ? this.priceMoves.reduce((a, b) => a + b, 0) / this.priceMoves.length : NaN,
      domRevenue: this.domRevenue, domBottles: this.domBottles, expRevenue: this.expRevenue, expBottles: this.expBottles,
      productCapital: this.productCapital.length ? this.productCapital.reduce((a, b) => a + b, 0) / this.productCapital.length : NaN,
      // MKT AP3=1 표와 같은 정의
      stockMonthsLive: this.liveMonths.length ? this.liveMonths.reduce((a, b) => a + b, 0) / this.liveMonths.length : NaN,
      stockoutProductMonths: this.stockoutProductMonths, unmetBottles: this.unmetBottles,
      avgMultiple: this.multiples.length ? this.multiples.reduce((a, b) => a + b, 0) / this.multiples.length : NaN,
    };
  }
}

/**
 * 정책 비교 — 같은 시드 짝 차이와 위험조정 판단 (AP3-MGT-1, MGT 시각). a·b는 같은 시드 순서의 판 결과.
 *  평균 차이 · t · 이긴 시드 — 기대값
 *  하위 20% 평균(CVaR 20%) 차이 — 나쁜 판에서 얼마나 덜 무너지나(위험)
 *  판단: "위험조정 우위" = 평균 차이 > 0이고 CVaR 차이 ≥ 0(나쁜 판에서도 지지 않는다) · "기대 우위·위험 열위" = 평균 > 0, CVaR < 0 · 반대도 같다
 *  현금흐름 위험은 MonthTracker의 위기 개월·최저 현금으로 따로 본다 — 순자산이 같아도 위기 개월이 많으면 사람에게는 다른 판이다
 */
export function comparePaired(a: RunOutcome[], b: RunOutcome[]) {
  const d = a.map((x, i) => x.netWorth - b[i]!.netWorth);
  const n = d.length, m = d.reduce((t, x) => t + x, 0) / Math.max(1, n);
  const sd = Math.sqrt(d.reduce((t, x) => t + (x - m) ** 2, 0) / Math.max(1, n - 1));
  const cvar = (os: RunOutcome[]) => summarize(os).nwCVaR20;
  const dCvar = cvar(a) - cvar(b);
  const verdict = m > 0 && dCvar >= 0 ? '위험조정 우위' : m < 0 && dCvar <= 0 ? '위험조정 열위' : m > 0 ? '기대 우위·위험 열위' : '기대 열위·위험 우위';
  return { meanDiff: m, t: sd > 0 ? m / (sd / Math.sqrt(n)) : NaN, wins: d.filter((x) => x > 0).length, n, cvarDiff: dCvar, verdict };
}

// ───────────── 새 승리 판정 지표 (P-MGT-46 · 결정 #308·#312·#320) — F4 전에 넣는 순수 함수 ─────────────
// 판 하나를 승리 / 파산 / 기타 종료 / 관측 종료(적격 있음 · 없음)로 나누고, 여러 판을 묶어 비율·누적 승리 곡선·짝 비교를 낸다.
// **게임 상태를 읽지 않는다** — 부르는 쪽이 게임 판정(F4 progress.win · status · 통 단위 적격성 조회)에서 읽은 값을 넘긴다.
// 도구가 승리를 스스로 판정하지 않는다(#312). 지금은 P8이 부르지 않는다 → P8 출력 불변. 연결은 F4 뒤 MGT PR(mgt-stage-t.md 「F4 대비 변경 목록」).

/** 판 하나의 분류 (측정 창 W에서, 서로 겹치지 않음) */
export type WinClass = 'win' | 'bankrupt' | 'ended' | 'censored_ready' | 'censored_none';

export const WIN_CLASSES: readonly WinClass[] = ['win', 'bankrupt', 'ended', 'censored_ready', 'censored_none'];

export const WIN_CLASS_LABEL: Record<WinClass, string> = {
  win: '승리',
  bankrupt: '파산',
  ended: '기타 종료',
  censored_ready: '관측 종료 · 적격 원액 있음(출고 실패)',
  censored_none: '관측 종료 · 적격 원액 없음',
};

/** 분류에 넘기는 값 — 모두 게임 판정에서 읽은 것 */
export interface WinInput {
  /** 측정 창(개월) — 게임 종료가 아니다. 기본 180, 민감도 240 */
  window: number;
  /** `progress.win.month` — 없으면 승리하지 않았다 */
  winMonth?: number;
  /** 게임이 끝난 달(파산·면허 취소·해임 등) — 끝나지 않았으면 없음 */
  endMonth?: number;
  /** 끝난 이유가 파산인가(`status === 'bankrupt'`) — 아니면 기타 종료 */
  endBankrupt?: boolean;
  /** 측정 창 끝에 적격 원액(통·탱크·병)이 있었나 — 통 단위 적격성 조회(F2)의 결과 */
  eligibleAtWindow: boolean;
}

/**
 * 분류 규칙 (P-MGT-46): 창 안에 승리가 있으면 **승리**(승리 뒤 파산해도 — 사건이 먼저) ·
 * 아니면 창 안에 게임이 끝났으면 **파산** 또는 **기타 종료** · 아니면 **관측 종료**(적격 원액 유무로 둘)
 */
export function classifyWin(x: WinInput): WinClass {
  if (x.winMonth != null && x.winMonth <= x.window) return 'win';
  if (x.endMonth != null && x.endMonth <= x.window) return x.endBankrupt ? 'bankrupt' : 'ended';
  return x.eligibleAtWindow ? 'censored_ready' : 'censored_none';
}

/** 승리 뒤 창 안에서 파산했다 — 분류는 승리, 성과 열에 따로 적는다 */
export const bankruptAfterWin = (x: WinInput): boolean =>
  x.winMonth != null && x.winMonth <= x.window && !!x.endBankrupt && x.endMonth != null && x.endMonth <= x.window;

/** 판 하나의 새 승리 결과 — 분류 + 승리 달(창 안일 때만) */
export interface WinOutcome { cls: WinClass; winMonth?: number; window: number }

export function winOutcomeOf(x: WinInput): WinOutcome {
  const cls = classifyWin(x);
  return { cls, window: x.window, ...(cls === 'win' ? { winMonth: x.winMonth! } : {}) };
}

/** 누적 승리 곡선의 눈금(개월) — A = 144(#309) 직후부터. 창을 넘는 눈금은 NaN */
export const WIN_CURVE_MONTHS = [144, 150, 156, 168, 180, 240] as const;

/** 여러 판(같은 정책·티어·창)을 묶은 새 승리 지표 — 분류 수·비율·Wilson 구간 · 승리 달 분포(승리 판만) · 누적 승리 곡선 */
export function summarizeWin(os: WinOutcome[]) {
  const n = os.length;
  const window = os[0]?.window ?? NaN;
  if (os.some((o) => o.window !== window)) throw new Error('summarizeWin: 측정 창이 다른 판을 섞었다');
  const count = Object.fromEntries(WIN_CLASSES.map((c) => [c, os.filter((o) => o.cls === c).length])) as Record<WinClass, number>;
  const rate = Object.fromEntries(WIN_CLASSES.map((c) => [c, n ? count[c] / n : NaN])) as Record<WinClass, number>;
  const ci = Object.fromEntries(WIN_CLASSES.map((c) => [c, wilson(count[c], n)])) as Record<WinClass, [number, number]>;
  const months = os.filter((o) => o.cls === 'win').map((o) => o.winMonth!);
  const cum = Object.fromEntries(WIN_CURVE_MONTHS.map((m) => [m, m > window || !n ? NaN : months.filter((x) => x <= m).length / n])) as Record<(typeof WIN_CURVE_MONTHS)[number], number>;
  return {
    n, window, count, rate, ci,
    winMonthMedian: quantile(months, 0.5),
    winMonthP10: quantile(months, 0.1),
    winMonthP90: quantile(months, 0.9),
    cum,
  };
}

/**
 * 승리 짝 비교 (같은 시드 순서) — 관측 종료가 섞여 승리 달 평균이 정의되지 않으므로 네 칸으로 센다:
 * A만 승리 · B만 승리 · 둘 다 · 둘 다 아님. 둘 다 승리한 시드는 승리 달 차이(A − B, 음수 = A가 빠름)의 평균·t
 */
export function comparePairedWin(a: WinOutcome[], b: WinOutcome[]) {
  if (a.length !== b.length) throw new Error('comparePairedWin: 판 수가 다르다(같은 시드 목록이어야 한다)');
  let onlyA = 0, onlyB = 0, both = 0, neither = 0;
  const d: number[] = [];
  a.forEach((x, i) => {
    const y = b[i]!, wa = x.cls === 'win', wb = y.cls === 'win';
    if (wa && wb) { both++; d.push(x.winMonth! - y.winMonth!); } else if (wa) onlyA++; else if (wb) onlyB++; else neither++;
  });
  const k = d.length, m = k ? d.reduce((t, v) => t + v, 0) / k : NaN;
  const sd = k > 1 ? Math.sqrt(d.reduce((t, v) => t + (v - m) ** 2, 0) / (k - 1)) : NaN;
  return { n: a.length, onlyA, onlyB, both, neither, winMonthDiff: m, t: sd > 0 ? m / (sd / Math.sqrt(k)) : NaN };
}
