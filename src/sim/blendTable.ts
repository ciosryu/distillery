import { HEX_AXES, HEX_LABEL, hexDistance, hexOf, matchScore, mixHex, perceivedHex, sampledSigma, type BlenderSkill, type BlendTarget } from './blendRadar';
import { clamp } from './flavor';
import { RARE_EXTRACT_BOOST } from './maturation';
import { rngFor, type Rng } from './rng';
import type { BlendCommission, Cask, GameState, Hex, HexAxis, MonthReport, SampleRecord, Staff, TrendShift } from './types';
import type { BlendComponent, BottleOptions } from './blending';
import { nid, staffOf } from './util';

// 블렌딩 테이블 (결정 #124, docs/design/blending-minigame.md) — 1차 범위:
//   P1 정보 구매(샘플링·실험실 분석) · P2 도달 가능 영역 · P5 목표 3종(트렌드·의뢰·코어 레인지) · P6 결과 공개 · P7 위임 · P8 레어 캐스크
// 실제 결과는 결정론(향미 가중 평균). 불확실한 것은 블렌더가 "읽은" 값뿐이다(PRD #18). 수치는 모두 [튜닝].

// ───────────── 마스터 블렌더 (결정 #123) ─────────────

export interface BlenderView extends BlenderSkill {
  name: string;
  /** 감정력 0~100 — 레어 캐스크 발견·샘플링 여력 */
  appraisal: number;
}

/** 블렌딩을 맡는 사람: 가장 잘 읽는 마스터 블렌더(후각·미각 평균 + 레벨). 없으면 null(대표가 직접 — 오차 큼) */
export function blenderOf(s: GameState): BlenderView | null {
  const bs = staffOf(s, 'blender');
  if (!bs.length) return null;
  const score = (x: Staff) => (x.stats.a + x.stats.b) / 2 + x.level * 5;
  const b = [...bs].sort((x, y) => score(y) - score(x))[0]!;
  return { id: b.id, name: b.name, level: b.level, nose: (b.stats.a + b.stats.b) / 2, appraisal: b.stats.c };
}

// ───────────── P1 정보 구매 ─────────────

export const SAMPLING = {
  /** 샘플 1회 비용(원) — 시음·기록 인건비 */
  cost: 30_000,
  /** 샘플 1회에 빠지는 원액(L) */
  lossL: 0.5,
  /** 캐스크당 최대 샘플 수 — 그 이상은 오차가 거의 줄지 않는다 */
  maxSamples: 6,
  /** 블렌더 없이 대표가 한 달에 뜰 수 있는 샘플 */
  ownerPerMonth: 6,
};

/** 이번 달 샘플링 여력 — 블렌더 1명당 20 + 감정력/5 */
export function samplingCapacity(s: GameState): number {
  const bs = staffOf(s, 'blender');
  return bs.length ? bs.reduce((t, x) => t + 20 + Math.round(x.stats.c / 5), 0) : SAMPLING.ownerPerMonth;
}

export const LAB = {
  /** 실험실(GC) 분석 외주 비용(원/캐스크) */
  cost: 150_000,
  /** 분석으로 정확히 아는 축 — 페놀(피트)·오크 추출물(우디) */
  axes: ['peat', 'woody'] as HexAxis[],
};

/**
 * 블렌더가 **지금** 캐스크를 맛보면 읽을 육각형 (실험실 분석 축은 정확). 지금의 참 향미에 고정 오차를 더한다 —
 * 샘플을 뜨는 순간(recordSample)에만 쓴다. 화면·블렌딩 판단은 이 값이 아니라 기록(knownRead)을 읽는다(#157, #143 정보 누수)
 */
export function readCask(s: GameState, cask: Cask): Hex | null {
  if (!cask.contents) return null;
  const actual = hexOf(cask.contents.flavor);
  const seen = perceivedHex(actual, s.seed, cask.id, blenderOf(s), cask.samples ?? 0);
  if (cask.labAnalyzed) for (const a of LAB.axes) seen[a] = actual[a];
  return seen;
}

// ───────────── 샘플 기록 — "아는 값" (S-10, #136) ─────────────
// readCask는 지금의 참 향미에 고정된 오차를 더해 매번 다시 계산한다 → 샘플 뒤에도 추정치가 참값을 따라 움직인다(정보 누수).
// MVP 숙성고 화면과 블렌딩 테이블(#157)은 대신 샘플을 뜬 그 순간의 읽기를 남긴 기록(sampleLog)만 본다

/** 남기는 샘플 기록 수 — 마지막 샘플과 그 직전(변화 화살표용) */
export const SAMPLE_LOG_KEPT = 2;
/** 추정 품질의 오차 = 읽기 오차(육각형 점수 σ) × 이 값 `[튜닝]` */
export const QUALITY_SIGMA_PER_HEX = 1;

/** 샘플을 뜬 순간의 읽기를 기록한다 (sampleCask가 부른다). trueQuality는 호출 측이 계산한 참 품질 */
export function recordSample(s: GameState, cask: Cask, trueQuality: number): SampleRecord {
  const hex = readCask(s, cask)!;
  const sigma = readSigma(s, cask);
  const r = rngFor(s.seed, 0, `sample-quality:${cask.id}:${cask.samples ?? 0}`);
  const rec: SampleRecord = { month: s.month, hex, sigma, estQuality: Math.round(clamp(trueQuality + r.normal(0, sigma * QUALITY_SIGMA_PER_HEX), 0, 100)) };
  cask.sampleLog = [...(cask.sampleLog ?? []), rec].slice(-SAMPLE_LOG_KEPT);
  return rec;
}

/** 마지막 샘플 기록과 직전 대비 변화(축별 차이·품질 차이). 기록이 없으면 null — 화면은 "샘플 없음" */
export function lastSample(cask: Pick<Cask, 'sampleLog'>): { last: SampleRecord; delta: { hex: Hex; quality: number } | null } | null {
  const log = cask.sampleLog ?? [];
  const last = log.at(-1);
  if (!last) return null;
  const prev = log.length >= 2 ? log.at(-2)! : null;
  if (!prev) return { last, delta: null };
  const hex = {} as Hex;
  for (const a of HEX_AXES) hex[a] = last.hex[a] - prev.hex[a];
  return { last, delta: { hex, quality: last.estQuality - prev.estQuality } };
}

// ───────────── 블렌딩 테이블이 아는 값 (#157) ─────────────
// 블렌딩 테이블·위임·결과 공개는 샘플 기록만 읽는다. 기록은 다음 샘플 전까지 움직이지 않는다 → 오래된 샘플은 오래된 정보다(다시 떠야 한다).
// 같은 배치를 같은 종류 캐스크에 나눠 담은 형제 캐스크는 서로의 기록을 빌린다 — 블렌더는 한 배치에서 대표 통 몇 개만 맛본다.
// 레어 캐스크처럼 형제와 다른 통은 자기 샘플을 떠야 드러난다

export interface KnownRead {
  hex: Hex;
  sigma: number;
  /** 기록한 달 — 지금과의 차이가 정보의 나이 */
  month: number;
  estQuality: number;
  /** 자기 기록인지, 형제 캐스크(같은 배치·같은 캐스크 종류)의 기록을 빌렸는지 */
  from: 'own' | 'sibling';
  /** 기록을 뜬 캐스크 id — 같은 기록을 빌린 통들은 오차가 함께 움직인다(독립이 아니다) */
  sourceId: string;
}

/** 형제 = 같은 배치·같은 캐스크 종류·같은 달 통입 — 다른 달에 통입한 통은 숙성 개월이 달라 기록을 빌리지 않는다 (#166) */
const siblingKey = (c: Cask) => (c.contents?.batchId ? `${c.contents.batchId}:${c.typeId}:${c.filledMonth ?? ''}` : null);

/**
 * 형제 기록을 빌리는 최소 액량 비율(작은 쪽 ÷ 큰 쪽) — 같은 배치라도 마지막 통은 일부만 채워져(실측 185L 옆 14.6L·43L)
 * 표면적/부피가 달라 숙성 속도가 다르다. 이보다 차이가 크면 빌리지 않는다 (#162, 결정 대기 12) `[튜닝]`
 */
export const SIBLING_MIN_VOLUME_RATIO = 0.75;

/** 모든 캐스크의 아는 값 (기록이 없고 빌릴 형제도 없으면 빠진다). 한 번에 계산 — 형제 묶음 안에서만 비교한다 */
export function knownReads(s: GameState): Map<string, KnownRead> {
  // 형제 묶음(같은 배치·같은 캐스크 종류)마다 기록이 있는 통
  const recorded = new Map<string, { id: string; volumeL: number; rec: SampleRecord }[]>();
  for (const c of s.inventory.casks) {
    const last = c.contents ? c.sampleLog?.at(-1) : undefined;
    const k = siblingKey(c);
    if (!last || !k) continue;
    recorded.set(k, [...(recorded.get(k) ?? []), { id: c.id, volumeL: c.contents!.volumeL, rec: last }]);
  }
  const out = new Map<string, KnownRead>();
  for (const c of s.inventory.casks) {
    if (!c.contents) continue;
    const own = c.sampleLog?.at(-1);
    let rec = own;
    let sourceId = c.id;
    if (!rec) {
      const k = siblingKey(c);
      const v = c.contents.volumeL;
      // 액량이 비슷한 형제 중 가장 최근 기록
      for (const x of (k ? recorded.get(k) : undefined) ?? []) {
        if (Math.min(v, x.volumeL) / Math.max(v, x.volumeL) < SIBLING_MIN_VOLUME_RATIO) continue;
        if (!rec || x.rec.month > rec.month) { rec = x.rec; sourceId = x.id; }
      }
    }
    if (rec) out.set(c.id, { hex: rec.hex, sigma: rec.sigma, month: rec.month, estQuality: rec.estQuality, from: own ? 'own' : 'sibling', sourceId });
  }
  return out;
}

/** 캐스크 하나의 아는 값 — 자기 기록 → 형제 기록 → 없음(null = 모른다) */
export function knownRead(s: GameState, cask: Cask): KnownRead | null {
  return knownReads(s).get(cask.id) ?? null;
}

/** 캐스크 1개를 읽는 오차(1σ) — 실험실 분석 축 제외 평균 */
export function readSigma(s: GameState, cask: Cask): number {
  const sd = sampledSigma(blenderOf(s), cask.samples ?? 0);
  return cask.labAnalyzed ? sd * Math.sqrt((HEX_AXES.length - LAB.axes.length) / HEX_AXES.length) : sd;
}

// ───────────── P8 레어 캐스크 ─────────────

export const RARE = {
  /** 통입할 때 레어 캐스크가 될 확률 */
  chance: 0.02,
  /** 레어 캐스크의 목재 추출 배수 — 남달리 진한 프로파일(육각형 꼭짓점) */
  extractBoost: RARE_EXTRACT_BOOST,
  /** 샘플 1회에 레어임을 알아챌 확률: 블렌더 0.25 + 0.5 × 감정력/100, 대표 0.1 */
  findBase: 0.25,
  findPerAppraisal: 0.5,
  findOwner: 0.1,
  /** 레어 싱글 캐스크 병입의 매력도 배수 */
  singleCaskAppeal: 1.3,
};

// ───────────── 트렌드 (결정 #125) ─────────────

/** 시장의 주류 취향 (위스키 계열, 유행 없을 때의 트렌드 목표) */
export const TREND_BASE: Hex = { peat: 3, fruit: 30, floral: 22, spicy: 12, woody: 14, sweet: 32 };
export const TREND_TOLERANCE = 15;

export const activeShifts = (s: Pick<GameState, 'world' | 'month'>): TrendShift[] =>
  s.world.flavorTrend.shifts.filter((x) => x.fromMonth <= s.month && s.month < x.untilMonth);

/** 트렌드 매력도 배수 — 유행하는 축이 lo 이하면 1, hi 이상이면 1 + strength, 사이는 선형. 유행이 없으면 1 */
export function trendFactor(s: Pick<GameState, 'world' | 'month'>, hex: Hex): number {
  let f = 1;
  for (const x of activeShifts(s)) f *= 1 + x.strength * clamp((hex[x.axis] - x.lo) / (x.hi - x.lo), 0, 1);
  return f;
}

/** 지금 시장이 원하는 육각형 — 주류 취향에 유행 축을 hi까지 올린 모양 */
export function trendTarget(s: Pick<GameState, 'world' | 'month'>): BlendTarget {
  const hex = { ...TREND_BASE };
  const shifts = activeShifts(s);
  for (const x of shifts) hex[x.axis] = Math.max(hex[x.axis], x.hi);
  return { id: 'trend', source: 'trend', label: shifts.length ? `시장 트렌드 — ${[...new Set(shifts.map((x) => x.label))].join(', ')}` : '시장 주류 취향', hex, tolerance: TREND_TOLERANCE };
}

export function addTrendShift(s: GameState, label: string, axis: HexAxis, strength: number, lo: number, hi: number, months: number): void {
  s.world.flavorTrend.shifts.push({ id: nid(s, 'T'), label, axis, strength, lo, hi, fromMonth: s.month, untilMonth: s.month + months });
}

// ───────────── 평론가·바·매체 의뢰 ─────────────

/** 가상 의뢰처 — 실존 인물의 발언·요청은 만들지 않는다 (PRD §11.1) */
export const COMMISSION_CLIENTS = ['위스키 매거진 편집부', '몰트 바 연합', '수입사 한정판 기획팀', '위스키 동호회 연례 행사'];

export const COMMISSION = {
  tolerance: 7,
  months: 6,
  /** 숙성 캐스크(2년↑)가 3개 이상일 때 매달 새 의뢰가 들어올 확률, 동시에 받을 수 있는 의뢰 수 */
  chance: 0.06,
  maxOpen: 2,
  reward: { awareness: 0.02, appealBonus: 0.25, months: 24 },
  /** 이 점수 미만이면 의뢰처가 받지 않는다 */
  minScore: 50,
};

/** 내 숙성 캐스크(2년↑) 2~3개를 섞은 육각형 근처를 의뢰한다 — 대체로 도달 가능하지만 정밀하게 맞춰야 한다 */
export function makeCommission(s: GameState, rng: Rng): BlendCommission | null {
  const pool = s.inventory.casks.filter((c) => c.contents && !c.owner && c.contents.oakMonths >= 24 && (c.contents.kind === 'malt' || c.contents.kind === 'grain'));
  if (pool.length < 3) return null;
  const picks = Array.from({ length: rng.int(2, 3) }, () => rng.pick(pool));
  const hex = mixHex(picks.map((c) => ({ hex: hexOf(c.contents!.flavor), share: rng.range(0.2, 1) })));
  for (const a of HEX_AXES) hex[a] = Math.max(0, hex[a] + rng.normal(0, 3));
  const focus = rng.pick(HEX_AXES);
  const client = rng.pick(COMMISSION_CLIENTS);
  return {
    id: nid(s, 'Q'), client, label: `${client} — ${HEX_LABEL[focus]} 중심 블렌드`, hex, tolerance: COMMISSION.tolerance,
    weights: { [focus]: 3 }, expiresMonth: s.month + COMMISSION.months, reward: { ...COMMISSION.reward },
  };
}

/**
 * 8 성장 단계: 새 의뢰 — 원액 계약 제안처럼 독립 난수 스트림('commissions')으로 굴린다.
 * 이벤트 목록에 넣지 않는 이유: 이벤트 엔진이 매달 목록 전체를 섞어 판정하므로, 항목 하나를 더하면 모든 시드의 이벤트 순서가 바뀐다
 */
export function refreshCommissions(s: GameState, rng: Rng, report: MonthReport): void {
  const open = s.commerce.commissions.filter((c) => !c.fulfilledBy && c.expiresMonth > s.month).length;
  if (open >= COMMISSION.maxOpen || !rng.chance(COMMISSION.chance)) return;
  const c = makeCommission(s, rng);
  if (!c) return;
  s.commerce.commissions.push(c);
  report.notes.push(`블렌딩 의뢰 — ${c.label} · ${c.expiresMonth - s.month}개월 안에 블렌딩 테이블에서 병입`);
}

/** 0 준비 단계: 끝난 트렌드 이동 정리, 마감 지난 의뢰 정리 */
export function pruneTrendsAndCommissions(s: GameState, report: MonthReport): void {
  s.world.flavorTrend.shifts = s.world.flavorTrend.shifts.filter((x) => x.untilMonth > s.month);
  for (const c of s.commerce.commissions) if (!c.fulfilledBy && c.expiresMonth <= s.month) report.notes.push(`블렌딩 의뢰 마감 — ${c.label}`);
  s.commerce.commissions = s.commerce.commissions.filter((c) => !c.fulfilledBy && c.expiresMonth > s.month);
}

// ───────────── 목표 목록 ─────────────

export const CORE_TOLERANCE = 8;

export function blendTargets(s: GameState): BlendTarget[] {
  return [
    trendTarget(s),
    ...s.commerce.commissions.filter((c) => !c.fulfilledBy && c.expiresMonth > s.month)
      .map((c): BlendTarget => ({ id: c.id, source: 'critic', label: c.label, hex: c.hex, tolerance: c.tolerance, weights: c.weights, expiresMonth: c.expiresMonth })),
    ...Object.entries(s.commerce.lines).map(([name, l]): BlendTarget => ({ id: `line:${name}`, source: 'core', label: `코어 레인지 「${name}」 재현 (${l.batches}배치째)`, hex: l.refHex, tolerance: CORE_TOLERANCE })),
  ];
}

export const findTarget = (s: GameState, id: string | undefined) => (id ? blendTargets(s).find((t) => t.id === id) : undefined);

// ───────────── P2 도달 가능 영역 · P7 위임 (최적화) ─────────────

/** 축별 최소·최대 — 목표가 이 범위 밖이면 어떤 비율로도 못 맞춘다 (필요조건) */
export function reachableEnvelope(points: Hex[]): { min: Hex; max: Hex } | null {
  if (!points.length) return null;
  const min = { ...points[0]! };
  const max = { ...points[0]! };
  for (const p of points) for (const a of HEX_AXES) { min[a] = Math.min(min[a], p[a]); max[a] = Math.max(max[a], p[a]); }
  return { min, max };
}

/**
 * 목표에 가장 가까운 비율 — 단체(simplex) 위의 가중 제곱 거리 최소화(Frank-Wolfe).
 * 위임·"이 재고로 낼 수 있는 최고 점수"에 쓴다. 입력은 블렌더가 읽은 값이므로, 서툰 블렌더의 최적은 실제로는 최적이 아니다
 */
export function optimizeShares(points: Hex[], target: Pick<BlendTarget, 'hex' | 'weights'>, iters = 300): number[] {
  const n = points.length;
  if (!n) return [];
  const w = (a: HexAxis) => target.weights?.[a] ?? 1;
  let x = Array(n).fill(1 / n) as number[];
  for (let k = 0; k < iters; k++) {
    const mix = mixHex(points.map((p, i) => ({ hex: p, share: x[i]! })));
    let best = 0;
    let bestG = Infinity;
    for (let i = 0; i < n; i++) {
      let g = 0;
      for (const a of HEX_AXES) g += 2 * w(a) * (mix[a] - target.hex[a]) * points[i]![a];
      if (g < bestG) { bestG = g; best = i; }
    }
    const gamma = 2 / (k + 2);
    x = x.map((v, i) => (1 - gamma) * v + (i === best ? gamma : 0));
  }
  return x.map((v) => (v < 1e-3 ? 0 : v));
}

// ───────────── P6 결과 공개 ─────────────

/** 받침이 있으면 '이', 없으면 '가' — "과일이", "피트가" */
const subj = (w: string): string => {
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  return c >= 0 && c <= 11171 && c % 28 !== 0 ? `${w}이` : `${w}가`;
};

/** 예상과 실제의 차이 중 큰 축 두 개를 문장으로 (위스키 계열 육각형 — 소주·진 병입에는 쓰지 않는다) */
export function revealNotes(predicted: Hex, actual: Hex): string[] {
  return HEX_AXES.map((a) => ({ a, d: actual[a] - predicted[a] }))
    .filter((x) => Math.abs(x.d) >= 3)
    .sort((p, q) => Math.abs(q.d) - Math.abs(p.d))
    .slice(0, 2)
    .map((x) => `${subj(HEX_LABEL[x.a])} 예상보다 ${x.d > 0 ? '강했다' : '약했다'} (${x.d > 0 ? '+' : ''}${x.d.toFixed(0)})`);
}

export { hexDistance, matchScore };

// ───────────── P7 위임 — 블렌더가 비율을 정한다 ─────────────

/**
 * 목표에 맞춰 블렌더가 고른 캐스크별 사용량(L). 블렌더가 기록해 둔 육각형(knownReads)으로 최적화하므로, 서툰 블렌더나 오래된 샘플의 계획은 실제로는 빗나간다.
 * 기록이 없는 캐스크는 뺀다(unknown = 뺀 수). 병 수가 재고보다 많으면 가능한 만큼만 쓴다
 */
export function delegatePlan(s: GameState, target: BlendTarget, caskIds: string[], bottles: number, opts: BottleOptions): { components: BlendComponent[]; unknown: number } | { error: string } {
  const usable = caskIds.map((id) => s.inventory.casks.find((c) => c.id === id)).filter((c): c is Cask => !!c?.contents && !c.owner && !(c.contamination && c.contaminationKnown));
  if (!usable.length) return { error: '맡길 캐스크가 없습니다' };
  if (bottles <= 0) return { error: '병 수를 정하세요' };
  // 블렌더는 맛본(기록이 있는) 원액만 섞는다 (#157)
  const known = knownReads(s);
  const casks = usable.filter((c) => known.has(c.id));
  if (!casks.length) return { error: '샘플 기록이 있는 캐스크가 없습니다 — 블렌더는 맛본 원액만 섞는다. 먼저 샘플을 뜨세요' };
  const shares = optimizeShares(casks.map((c) => known.get(c.id)!.hex), target);
  const total = shares.reduce((t, x) => t + x, 0) || 1;
  const avgAbv = casks.reduce((t, c, i) => t + c.contents!.abv * shares[i]!, 0) / total;
  const abv = opts.targetAbv === 'cask' ? avgAbv : opts.targetAbv;
  let needLPA = (bottles * opts.bottleMl * abv) / 1000;
  // 어느 캐스크도 가진 것보다 많이 쓰지 않게 전체를 줄인다
  for (let i = 0; i < casks.length; i++) {
    const sh = shares[i]! / total;
    if (sh <= 0) continue;
    const avail = casks[i]!.contents!.volumeL * casks[i]!.contents!.abv;
    needLPA = Math.min(needLPA, avail / sh);
  }
  const components: BlendComponent[] = casks
    .map((c, i) => ({ source: 'cask' as const, id: c.id, liters: Math.floor(((shares[i]! / total) * needLPA / c.contents!.abv) * 10) / 10 }))
    .filter((x) => x.liters >= 0.5);
  if (!components.length) return { error: '블렌더가 쓸 만한 조합을 찾지 못했습니다' };
  return { components, unknown: usable.length - casks.length };
}
