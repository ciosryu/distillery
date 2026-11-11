// PROD-A 장기 숙성 투자 모델 — 1층: 통 하나의 경제성 (requirements-audit.md §5 PROD-A, 결정 #273 OWNER-1 · docs/design/prod-stage-t.md REQ-PROD-1)
// 게임 규칙을 바꾸지 않는다. 게임 함수(matureCask·previewBlend·suggestedPrice·distributionCostPerBottle)로 통 하나를 0~180개월 숙성시키며
// 연수별 "그때 병입하면 얼마"를 내고, 할인율별 최적 병입 연수와 보유의 한계 수익을 비교한다. 수요 제약은 보지 않는다(2층 prod-aging-game에서 본다).
//
// 실행: npx tsx scripts/experiments/prod-aging.ts            — 국가 KR·JP·TW × 몰트 레시피 × 캐스크 4종 × 첫 통입/세 번째 통입
//   REGIONS=KR,JP  CASKS=ex_bourbon_barrel,...  FILLS=0,2  RATES=0,0.05,0.2  AGES=36,72,120,144  DETAIL=1(연 단위 표)
//   SAVE=<세이브.json>  — 새 판 대신 그 세이브의 상태(지역·인지도·유통·시세)로 본다. 월 수요 열이 판 중반 값이 된다(예: P8 96개월 DUMP)
//
// 현금흐름(통 하나, 원):
//   t=0      −(원액 원가 = 배치 LPA당 원가 × 통에 넣은 LPA) − 통 값(새 통 = 정가, 재사용 통 = 0 — 이미 산 통)
//   매달     −보관비(CASK_STORAGE.perCaskPerMonth × 지역 인건비 배수). 보험(월 0.1% × 가치)은 작아서 뺀다
//   t=A      +병 수 × (권장 출고가 − 병·포장·병입 − 유통비)   ← 통 전체를 그 달 권장가에 판다고 본다(수요 제약 없음)
// 할인율 r(연)은 MGT-C가 정할 값이다 — 아직 없으므로 0 · 2.5%(정책자금) · 7.5%(운전자금) · 20%(고금리 급전)로 민감도만 본다
import { readFileSync } from 'node:fs';
import { CASK_STORAGE, CASKS } from '../../src/sim/content/catalog';
import { regionOf, siteOf } from '../../src/sim/content/regions';
import { demandFor, distributionCostPerBottle } from '../../src/sim/market';
import { calendar } from '../../src/sim/util';
import { slotClimate } from '../../src/sim/warehouse';
import { matureCask } from '../../src/sim/maturation';
import { migrateSave, newGame, previewBatch, previewBlend, type BottleOptions, type Cask, type GameState, type Product, type RegionId, type SpiritLot } from '../../src/sim';
import { outboundLogistics } from '../../src/sim/sites';

const env = process.env;
const list = <T extends string>(v: string | undefined, d: T[]): T[] => (v ? (v.split(',') as T[]) : d);
const REGION_IDS = list<RegionId>(env.REGIONS, ['KR', 'JP', 'TW'] as RegionId[]);
const CASK_IDS = list(env.CASKS, ['ex_bourbon_barrel', 'oloroso_butt', 'korean_oak_quarter', 'mizunara_hogshead']);
const FILLS = (env.FILLS ?? '0,2').split(',').map(Number);
const RATES = (env.RATES ?? '0,0.025,0.075,0.2').split(',').map(Number);
const AGES = (env.AGES ?? '36,72,120,144').split(',').map(Number);
// CLIMATE=avg(기본 — 첫 판 결과 재현) | game  ·  TIER=0,2,5 (game일 때 기본 숙성고 랙 단 — 0 아래·5 위)
const CLIMATES: ClimateMode[] = env.CLIMATE === 'game' ? (env.TIER ?? '0,2,5').split(',').map((x) => ({ mode: 'game' as const, tier: Number(x) })) : [{ mode: 'avg' }];
const climateLabel = (c: ClimateMode) => (c.mode === 'avg' ? '입지 연평균' : `기본 숙성고 랙 ${c.tier + 1}/6단(달마다)`);
const MAX = 180;
const ENTRY_ABV = 0.635;
const OPTS: BottleOptions = { name: '', targetAbv: 0.4, bottleMl: 700, chillFilter: true, packagingId: 'standard' };

export interface AgingPoint { month: number; quality: number; bottles: number; price: number; netPerBottle: number; proceeds: number; lpaLeft: number; /** 그 값에 국내 월 수요(병) — 같은 범주 1제품, 이 상태의 인지도·유통(MKT demandFor). 숙성 연수별 상대 비교용 */ demand: number }
export interface AgingCase { region: RegionId; recipe: string; cask: string; fills: number; upfront: number; storagePerMonth: number; points: AgingPoint[] }

/** 통 하나를 0~MAX개월 숙성 — 달마다 그때 병입하면 받는 돈. 상태를 바꾸지 않는다(사본에 가상 원액을 끼워 미리 보기만) */
/** 기후 — 'avg' = 입지 연평균(첫 판, 증발을 낮게 잡는다 — CP-MGT-1) · 'game' = 게임 기본 숙성고(랙 6단) tier단 칸 기후를 달마다(slotClimate, 틱과 같은 식) */
export type ClimateMode = { mode: 'avg' } | { mode: 'game'; tier: number };

export function agingCase(s: GameState, recipeId: string, caskId: string, fills: number, cm: ClimateMode = { mode: 'avg' }): AgingCase | null {
  const r = s.production.recipes.find((x) => x.id === recipeId)!;
  const b = previewBatch(s, r);
  const def = CASKS[caskId as keyof typeof CASKS];
  if (!b || !def) return null;
  const site = siteOf(s);
  const avg = { tempC: site.tempC.reduce((a, x) => a + x, 0) / 12, humidity: site.humidity.reduce((a, x) => a + x, 0) / 12 };
  // 숙성 m개월째 달의 칸 기후 — 통입 달(s.month)부터 달력대로
  const climate = (m: number) => (cm.mode === 'avg' ? avg : slotClimate({ ...s, month: s.month + m } as GameState, { slot: { w: 'W0', tier: cm.tier } } as Cask, ((calendar(s).monthOfYear - 1 + m) % 12) + 1));
  const entry = Math.min(ENTRY_ABV, b.abv);
  // 재사용 통 — 비울 때마다 활성도 ×0.6 · 시즈닝 ×0.35 (maturation.ts emptyCask와 같은 규칙)
  const activity = def.activity * Math.pow(0.6, fills);
  const seasoning = def.seasoning * Math.pow(0.35, fills);
  const lot: SpiritLot = { id: '__age', name: r.name, kind: r.kind, volumeL: def.sizeL, abv: entry, flavor: b.flavor, createdMonth: s.month, oakMonths: 0, sourced: false, costPerLPA: 0, recipeId: r.id,
    ...(r.mashBill.length ? { mashShare: Object.fromEntries(r.mashBill.map((m) => [m.ingredientId, m.ratio])) } : {}) };
  let cask: Cask & { contents: SpiritLot } = { id: '__age', typeId: def.id, sizeL: def.sizeL, wood: def.wood, activity, seasoning, fills, recharCount: 0, char: def.char, contents: lot };
  const lpa0 = def.sizeL * entry;
  const upfront = lpa0 * (b.cost / b.lpa) + (fills === 0 ? def.price : 0);
  const storagePerMonth = CASK_STORAGE.perCaskPerMonth * regionOf(s).laborCost;
  const points: AgingPoint[] = [];
  for (let m = 0; m <= MAX; m++) {
    if (m > 0) cask = matureCask(cask, climate(m - 1), { control: 0 }).cask as typeof cask;
    if (m % 12 !== 0) continue;
    const l = { ...cask.contents, oakMonths: m };
    const t = { ...s, inventory: { ...s.inventory, lots: [...s.inventory.lots, l] } } as GameState;
    const p = previewBlend(t, [{ source: 'lot', id: l.id, liters: l.volumeL }], OPTS);
    if (!p.evaluation || p.bottles <= 0) { points.push({ month: m, quality: 0, bottles: 0, price: 0, netPerBottle: 0, proceeds: 0, lpaLeft: l.volumeL * l.abv, demand: 0 }); continue; }
    const dist = distributionCostPerBottle(p.suggestedPrice, OPTS.bottleMl, outboundLogistics(s));
    const net = p.suggestedPrice - p.unitCost - dist; // costPerLPA = 0 → unitCost는 병·포장·병입만
    const product = { id: '__age', name: '', category: p.category!, ageYears: p.ageYears, oakMonths: p.minOakMonths, abv: p.finalAbv, bottleMl: OPTS.bottleMl, chillFiltered: true, packagingId: 'standard', flavor: p.flavor,
      quality: p.evaluation.quality, typicity: p.evaluation.typicity, style: p.evaluation.style, sourcedShare: 0, stockBottles: 1, price: p.suggestedPrice, unitCost: p.unitCost, createdMonth: s.month, lastMonthSold: 0, totalSold: 0 } as Product;
    const demand = demandFor(s, product, 1, calendar(s).monthOfYear).demandBottles;
    points.push({ month: m, quality: p.evaluation.quality, bottles: p.bottles, price: p.suggestedPrice, netPerBottle: net, proceeds: p.bottles * net, lpaLeft: l.volumeL * l.abv, demand });
  }
  return { region: s.regionId, recipe: r.name, cask: def.nameKo, fills, upfront, storagePerMonth, points };
}

/** A개월에 병입할 때의 순현재가치(연 할인율 r, 월 복리) */
export function npvAt(c: AgingCase, month: number, r: number): number {
  const d = (m: number) => Math.pow(1 + r, -m / 12);
  let v = -c.upfront;
  for (let m = 1; m <= month; m++) v -= c.storagePerMonth * d(m);
  const pt = c.points.find((x) => x.month === month);
  return v + (pt ? pt.proceeds * d(month) : 0);
}

/** A개월 병입의 내부수익률(연) — 이분법 */
export function irrAt(c: AgingCase, month: number): number {
  let lo = -0.99, hi = 50;
  if (npvAt(c, month, lo) < 0) return NaN;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (npvAt(c, month, mid) > 0) lo = mid; else hi = mid; }
  return lo;
}

/** 할인율 r에서 순현재가치가 가장 큰 병입 시점(36개월 이상, 12개월 단위) */
export function bestMonth(c: AgingCase, r: number, from = 36): number {
  let best = from, v = -Infinity;
  for (const p of c.points) if (p.month >= from && p.bottles > 0) { const x = npvAt(c, p.month, r); if (x > v) { v = x; best = p.month; } }
  return best;
}

const eok = (v: number) => `${(v / 1e4).toFixed(0)}만`;
const pct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : '—');
const rate = (v: number) => `${+(v * 100).toFixed(1)}%`;

if (import.meta.url === `file://${process.argv[1]}`) for (const cm of CLIMATES) {
  const cases: AgingCase[] = [];
  const saved = env.SAVE ? migrateSave(JSON.parse(readFileSync(env.SAVE, 'utf8'))) : null;
  for (const region of saved ? [saved.regionId] : REGION_IDS) {
    const s = saved ?? newGame({ region, seed: 1 });
    for (const r of s.production.recipes.filter((x) => x.kind === 'malt')) for (const k of CASK_IDS) for (const f of FILLS) {
      if (k === 'oloroso_butt' && f > 0) continue; // 셰리 벗 재사용은 버번 재사용과 같은 꼴 — 줄 수를 줄인다
      const c = agingCase(s, r.id, k, f, cm);
      if (c) cases.push(c);
    }
  }
  console.log(`# PROD-A 1층 — 통 하나의 경제성 (수요 제약 없음, 권장 출고가에 통 전체를 판다고 볼 때) — 기후: ${climateLabel(cm)}\n`);
  console.log(`| 국가 | 레시피 | 캐스크 | 통입 | 품질 ${AGES.join('·')}개월 | 병입 순수입 ${AGES.join('·')}개월 | 월 수요(병) ${AGES.join('·')}개월 | 3년 병입 IRR | 3→6년 보유 연수익 | 6→10년 | ${RATES.map((r) => `최적 병입(r=${rate(r)})`).join(' | ')} |`);
  console.log(`|---|---|---|---|---|---|---|---|---|---|${RATES.map(() => '---').join('|')}|`);
  for (const c of cases) {
    const at = (m: number) => c.points.find((x) => x.month === m)!;
    const hold = (a: number, z: number) => Math.pow((at(z).proceeds - c.storagePerMonth * (z - a)) / at(a).proceeds, 12 / (z - a)) - 1;
    console.log(`| ${c.region} | ${c.recipe.replace('싱글 몰트 — ', '')} | ${c.cask.split(' ')[0]} | ${c.fills + 1}번째 | ${AGES.map((m) => at(m).quality.toFixed(0)).join('·')} | ${AGES.map((m) => eok(at(m).proceeds)).join('·')} | ${AGES.map((m) => at(m).demand.toFixed(0)).join('·')} | ${pct(irrAt(c, 36))} | ${pct(hold(36, 72))} | ${pct(hold(72, 120))} | ${RATES.map((r) => `${bestMonth(c, r) / 12}년`).join(' | ')} |`);
  }
  // 요약 — 판정 질문 "장기가 합리적인 통과 조기 병입이 합리적인 통이 모두 존재하는가"
  console.log('');
  for (const r of RATES) {
    const dist = new Map<number, number>();
    for (const c of cases) { const m = bestMonth(c, r); dist.set(m, (dist.get(m) ?? 0) + 1); }
    const early = cases.filter((c) => bestMonth(c, r) <= 48).length, long = cases.filter((c) => bestMonth(c, r) >= 120).length;
    console.log(`SUMMARY r=${rate(r)}: 최적 병입 연수 분포 ${[...dist].sort((a, b) => a[0] - b[0]).map(([m, n]) => `${m / 12}년 ${n}`).join(' · ')} — 조기(≤4년) ${early}/${cases.length} · 장기(≥10년) ${long}/${cases.length} → ${early > 0 && long > 0 ? '둘 다 있다' : '한쪽만'}`);
  }
  // PROD-B — 샘플 시점의 품질이 10년 품질을 얼마나 예측하나(통 사이 순위 상관, 스피어만). 낮거나 음수면 "그때 샘플로 장기 통을 고르기"는 함정이다
  const rank = (xs: number[]) => { const o = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]); const r = new Array<number>(xs.length); o.forEach(([, i], k) => (r[i] = k)); return r; };
  const spearman = (a: number[], b: number[]) => { const ra = rank(a), rb = rank(b), n = a.length, m = (n - 1) / 2; let num = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { num += (ra[i]! - m) * (rb[i]! - m); da += (ra[i]! - m) ** 2; db += (rb[i]! - m) ** 2; } return num / Math.sqrt(da * db); };
  const q = (c: AgingCase, m: number) => c.points.find((x) => x.month === m)?.quality ?? NaN;
  { // 10년 연 증발(LPA 감소율) — CP-MGT-1: 연평균 기후는 증발을 낮게 잡는다(증발은 기온의 지수 함수)
    const ev = cases.map((c) => { const a = c.points.find((x) => x.month === 0)!.lpaLeft, z = c.points.find((x) => x.month === 120)!.lpaLeft; return 1 - Math.pow(z / a, 1 / 10); }).sort((x, y) => x - y);
    const byRegion = [...new Set(cases.map((c) => c.region))].map((rg) => { const xs = cases.filter((c) => c.region === rg).map((c) => 1 - Math.pow(c.points.find((x) => x.month === 120)!.lpaLeft / c.points.find((x) => x.month === 0)!.lpaLeft, 1 / 10)).sort((x, y) => x - y); return `${rg} ${(xs[Math.floor(xs.length / 2)]! * 100).toFixed(1)}%`; });
    console.log(`SUMMARY 10년 연 증발(LPA) 중앙값 ${(ev[Math.floor(ev.length / 2)]! * 100).toFixed(1)}% (${byRegion.join(' · ')})`);
  }
  for (const from of [36, 72]) console.log(`SUMMARY 품질 예측력: ${from}개월 품질 → 120개월 품질 순위 상관 ${spearman(cases.map((c) => q(c, from)), cases.map((c) => q(c, 120))).toFixed(2)} (${cases.length}개 경우)`);
  if (env.DETAIL) for (const c of cases.slice(0, Number(env.DETAIL) || 4)) {
    console.log(`\n## ${c.region} ${c.recipe} · ${c.cask} ${c.fills + 1}번째 통입 — 초기 ${eok(c.upfront)} · 보관 월 ${c.storagePerMonth.toLocaleString()}원`);
    console.log('| 개월 | 품질 | 병 | 권장가 | 병당 순수입 | 병입 순수입 | 월 수요 | 남은 LPA | NPV r=0 | NPV r=7.5% |');
    console.log('|---|---|---|---|---|---|---|---|---|---|');
    for (const p of c.points.filter((x) => x.month >= 12)) console.log(`| ${p.month} | ${p.quality.toFixed(1)} | ${p.bottles} | ${p.price.toLocaleString()} | ${Math.round(p.netPerBottle).toLocaleString()} | ${eok(p.proceeds)} | ${p.demand.toFixed(0)} | ${p.lpaLeft.toFixed(1)} | ${eok(npvAt(c, p.month, 0))} | ${eok(npvAt(c, p.month, 0.075))} |`);
  }
}
