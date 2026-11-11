// G02-MGT-1 보유 한계 손익 — 현물 기준(MGT-C) 대 병입 기준(PROD-A 1층)을 **같은 통·같은 숙성 경로**에서 한 표로 (docs/design/mgt-stage-t.md 「요구사항」 REQ-MGT-7)
// 게임 규칙을 바꾸지 않는다. 병입 순수입은 PROD `prod-aging.ts` agingCase와 같은 식(previewBlend 권장가 − 병·포장·병입 − 유통비, 통 전체를 그 달에 판다)이고,
// 같은 통의 원액 현물 매입가(spotBidPerLPA)를 나란히 잰다. NPV·최적 연수는 prod-aging의 npvAt·bestMonth를 그대로 쓴다.
// 기후 두 가지: 'avg' = 입지 연평균 기온·습도(1층과 같다 — 첫 줄에서 agingCase와 같은지 확인) · 'game' = 게임 숙성고 칸 기후(slotClimate, 랙 6단 중 TIER단, 달마다)
// 실행: npx tsx scripts/experiments/mgt-hold-basis.ts   (REGIONS·CASKS·FILLS·RATES는 prod-aging.ts와 같은 환경 변수, TIER=2 기본)
import { CASKS } from '../../src/sim/content/catalog';
import { siteOf } from '../../src/sim/content/regions';
import { slotClimate } from '../../src/sim/warehouse';
import { matureCask, type Climate } from '../../src/sim/maturation';
import { distributionCostPerBottle } from '../../src/sim/market';
import { outboundLogistics } from '../../src/sim/sites';
import { newGame, previewBatch, previewBlend, type BottleOptions, type Cask, type GameState, type RegionId, type SpiritLot } from '../../src/sim';
import { spotBidPerLPA } from '../../src/sim/bulk';
import { agingCase, bestMonth, npvAt, type AgingCase } from './prod-aging';

const env = process.env;
const list = <T extends string>(v: string | undefined, d: T[]): T[] => (v ? (v.split(',') as T[]) : d);
const REGION_IDS = list<RegionId>(env.REGIONS, ['KR', 'JP', 'TW'] as RegionId[]);
const CASK_IDS = list(env.CASKS, ['ex_bourbon_barrel', 'oloroso_butt', 'korean_oak_quarter', 'mizunara_hogshead']);
const FILLS = (env.FILLS ?? '0,2').split(',').map(Number);
const RATES = (env.RATES ?? '0,0.025,0.075,0.2').split(',').map(Number);
const TIER = Number(env.TIER ?? 2);
const ENTRY_ABV = 0.635;
const MAX = 180;
const OPTS: BottleOptions = { name: '', targetAbv: 0.4, bottleMl: 700, chillFilter: true, packagingId: 'standard' }; // prod-aging과 같다

type Mode = 'avg' | 'game';
/** 통 하나를 0~180개월 숙성 — 12개월마다 병입 순수입(agingCase와 같은 식)과 원액 현물 매입가. 상태는 바꾸지 않는다 */
function path(s: GameState, recipeId: string, caskId: string, fills: number, mode: Mode): { bottled: AgingCase; spot: AgingCase } {
  const r = s.production.recipes.find((x) => x.id === recipeId)!;
  const b = previewBatch(s, r)!;
  const def = CASKS[caskId as keyof typeof CASKS];
  const site = siteOf(s);
  const avg: Climate = { tempC: site.tempC.reduce((a, x) => a + x, 0) / 12, humidity: site.humidity.reduce((a, x) => a + x, 0) / 12 };
  const climate = (m: number): Climate => (mode === 'avg' ? avg : slotClimate({ ...s, month: m } as GameState, { slot: { w: 'W0', tier: TIER } } as Cask, (m % 12) + 1));
  const lot: SpiritLot = { id: '__mgt', name: r.name, kind: r.kind, volumeL: def.sizeL, abv: Math.min(ENTRY_ABV, b.abv), flavor: b.flavor, createdMonth: s.month, oakMonths: 0, sourced: false, costPerLPA: 0, recipeId: r.id,
    ...(r.mashBill.length ? { mashShare: Object.fromEntries(r.mashBill.map((m) => [m.ingredientId, m.ratio])) } : {}) };
  let cask: Cask & { contents: SpiritLot } = { id: '__mgt', typeId: def.id, sizeL: def.sizeL, wood: def.wood, activity: def.activity * Math.pow(0.6, fills), seasoning: def.seasoning * Math.pow(0.35, fills), fills, recharCount: 0, char: def.char, contents: lot };
  const base = agingCase(s, recipeId, caskId, fills)!; // 원가·보관비·레시피 이름은 1층과 같게
  const bottled: AgingCase = { ...base, points: [] };
  const spot: AgingCase = { ...base, points: [] };
  for (let m = 0; m <= MAX; m++) {
    if (m > 0) cask = matureCask(cask, climate(m - 1), { control: 0 }).cask as typeof cask;
    if (m % 12 !== 0) continue;
    const l = { ...cask.contents, oakMonths: m };
    const lpaLeft = l.volumeL * l.abv;
    const sp = lpaLeft * spotBidPerLPA(s, l);
    spot.points.push({ month: m, quality: 0, bottles: 1, price: 0, netPerBottle: 0, proceeds: sp, lpaLeft, demand: 0 });
    const t = { ...s, inventory: { ...s.inventory, lots: [...s.inventory.lots, l] } } as GameState;
    const p = previewBlend(t, [{ source: 'lot', id: l.id, liters: l.volumeL }], OPTS);
    if (!p.evaluation || p.bottles <= 0) { bottled.points.push({ month: m, quality: 0, bottles: 0, price: 0, netPerBottle: 0, proceeds: 0, lpaLeft, demand: 0 }); continue; }
    const net = p.suggestedPrice - p.unitCost - distributionCostPerBottle(p.suggestedPrice, OPTS.bottleMl, outboundLogistics(s));
    bottled.points.push({ month: m, quality: p.evaluation.quality, bottles: p.bottles, price: p.suggestedPrice, netPerBottle: net, proceeds: p.bottles * net, lpaLeft, demand: 0 });
  }
  return { bottled, spot };
}

interface Row { region: RegionId; cask: string; fills: number; avg: { bottled: AgingCase; spot: AgingCase }; game: { bottled: AgingCase; spot: AgingCase } }
const rows: Row[] = [];
let mismatch = 0;
for (const region of REGION_IDS) {
  const s = newGame({ region, seed: 1 });
  for (const r of s.production.recipes.filter((x) => x.kind === 'malt')) for (const k of CASK_IDS) for (const f of FILLS) {
    if (k === 'oloroso_butt' && f > 0) continue; // prod-aging과 같은 경우 집합
    const ref = agingCase(s, r.id, k, f);
    if (!ref) continue;
    const a = path(s, r.id, k, f, 'avg');
    // 확인: 'avg' 병입 순수입이 1층(agingCase)과 같아야 한다
    for (const p of ref.points) { const q = a.bottled.points.find((x) => x.month === p.month); if (!q || Math.abs(q.proceeds - p.proceeds) > 1) mismatch++; }
    rows.push({ region, cask: ref.cask, fills: f, avg: a, game: path(s, r.id, k, f, 'game') });
  }
}

const rate = (v: number) => `${+(v * 100).toFixed(1)}%`;
const pct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—');
const dist = (cs: AgingCase[], r: number) => { const m = new Map<number, number>(); for (const c of cs) { const y = bestMonth(c, r) / 12; m.set(y, (m.get(y) ?? 0) + 1); } return [...m].sort((a, b) => a[0] - b[0]).map(([y, n]) => `${y}년 ${n}`).join(' · '); };
const cnt = (cs: AgingCase[], r: number, f: (y: number) => boolean) => cs.filter((c) => f(bestMonth(c, r) / 12)).length;
const med = (xs: number[]) => { const a = [...xs].filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)]! : NaN; };

console.log(`# G02-MGT-1 보유 한계 손익 — 현물 기준 대 병입 기준 (같은 통 ${rows.length}개 경우: ${REGION_IDS.join('·')} × 몰트 레시피 × 캐스크 × 통입, 수요 제약 없음)`);
console.log(`확인: 연평균 기후의 병입 순수입이 prod-aging 1층과 ${mismatch === 0 ? '같다' : `${mismatch}곳 다르다`}\n`);
console.log(`| 할인율(연) | 기후 | 병입 기준 최적 연수 | 현물 기준 최적 연수 | 장기(≥10년) 병입 · 현물 | 조기(≤4년) 병입 · 현물 |`);
console.log('|---|---|---|---|---|---|');
for (const r of RATES) for (const mode of ['avg', 'game'] as const) {
  const b = rows.map((x) => x[mode].bottled), p = rows.map((x) => x[mode].spot);
  console.log(`| ${rate(r)} | ${mode === 'avg' ? '연평균(1층)' : `숙성고 ${TIER}단`} | ${dist(b, r)} | ${dist(p, r)} | ${cnt(b, r, (y) => y >= 10)} · ${cnt(p, r, (y) => y >= 10)} | ${cnt(b, r, (y) => y <= 4)} · ${cnt(p, r, (y) => y <= 4)} |`);
}

// 연 증가율 분해 (중앙값, 국가별) — 보유 a→z년
const g = (a: number, z: number, va: number, vz: number) => (va > 0 && vz > 0 ? Math.pow(vz / va, 12 / (z - a)) - 1 : NaN);
const at = (c: AgingCase, m: number) => c.points.find((x) => x.month === m)!;
for (const mode of ['avg', 'game'] as const) {
  console.log(`\n**${mode === 'avg' ? '연평균 기후(1층)' : `게임 숙성고 ${TIER}단`}** — 보유 한 해당 증가율(중앙값)과 보유 비용률`);
  console.log('| 국가 | 보유 구간 | 현물 가치(통) | 병 가격(병 1개) | 병입 순수입(통) | 증발(LPA) | 보관비율 현물 · 병입 |');
  console.log('|---|---|---|---|---|---|---|');
  for (const region of REGION_IDS) for (const [a, z] of [[36, 72], [72, 120], [120, 144]] as const) {
    const rs = rows.filter((x) => x.region === region).map((x) => x[mode]);
    const spotG = med(rs.map((x) => g(a, z, at(x.spot, a).proceeds, at(x.spot, z).proceeds)));
    const priceG = med(rs.map((x) => g(a, z, at(x.bottled, a).price, at(x.bottled, z).price)));
    const netG = med(rs.map((x) => g(a, z, at(x.bottled, a).proceeds, at(x.bottled, z).proceeds)));
    const evap = med(rs.map((x) => -g(a, z, at(x.bottled, a).lpaLeft, at(x.bottled, z).lpaLeft)));
    const kSpot = med(rs.map((x) => (12 * x.bottled.storagePerMonth) / at(x.spot, a).proceeds));
    const kBot = med(rs.map((x) => (12 * x.bottled.storagePerMonth) / at(x.bottled, a).proceeds));
    console.log(`| ${region} | ${a / 12}→${z / 12}년 | ${pct(spotG)} | ${pct(priceG)} | ${pct(netG)} | ${pct(evap)} | ${pct(kSpot)} · ${pct(kBot)} |`);
  }
}

console.log('\n| 국가 | 3년 통 하나 — 현물 매입가(중앙) | 병입 순수입(중앙) | 병입 ÷ 현물 | 3년 병입 NPV(r=0) 중앙 |');
console.log('|---|---|---|---|---|');
for (const region of REGION_IDS) {
  const rs = rows.filter((x) => x.region === region).map((x) => x.avg);
  const sp = med(rs.map((x) => at(x.spot, 36).proceeds)), bo = med(rs.map((x) => at(x.bottled, 36).proceeds));
  console.log(`| ${region} | ${(sp / 1e4).toFixed(0)}만 | ${(bo / 1e4).toFixed(0)}만 | ×${(bo / sp).toFixed(1)} | ${(med(rs.map((x) => npvAt(x.bottled, 36, 0))) / 1e4).toFixed(0)}만 |`);
}

// 같은 통(버번 배럴 첫 통입) 10년 증발 — 기후를 어떻게 넣느냐에 따라. 증발은 기온에 지수(e^{0.13(T−10)})라 연평균 기온으로 계산하면 덜 나온다
console.log('\n| 국가 | 10년 증발(연, LPA) ① 연평균 기후(1층) | ② 달마다 외기 | ③ 숙성고 랙 아래 · 가운데 · 위 칸 |');
console.log('|---|---|---|---|');
for (const region of REGION_IDS) {
  const s = newGame({ region, seed: 1 });
  const site = siteOf(s);
  const r = s.production.recipes.find((x) => x.kind === 'malt')!;
  const b = previewBatch(s, r)!;
  const def = CASKS.ex_bourbon_barrel;
  const run = (climate: (m: number) => Climate) => {
    let c: Cask & { contents: SpiritLot } = { id: '__ev', typeId: def.id, sizeL: def.sizeL, wood: def.wood, activity: def.activity, seasoning: def.seasoning, fills: 0, recharCount: 0, char: def.char,
      contents: { id: '__ev', name: r.name, kind: r.kind, volumeL: def.sizeL, abv: Math.min(ENTRY_ABV, b.abv), flavor: b.flavor, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 0, recipeId: r.id } };
    const lpa0 = c.contents.volumeL * c.contents.abv;
    for (let m = 0; m < 120; m++) c = matureCask(c, climate(m), { control: 0 }).cask as typeof c;
    return 1 - Math.pow((c.contents.volumeL * c.contents.abv) / lpa0, 1 / 10);
  };
  const avg = { tempC: site.tempC.reduce((a, x) => a + x, 0) / 12, humidity: site.humidity.reduce((a, x) => a + x, 0) / 12 };
  const slot = (tier: number) => (m: number) => slotClimate({ ...s, month: m } as GameState, { slot: { w: 'W0', tier } } as Cask, (m % 12) + 1);
  console.log(`| ${region} | ${pct(run(() => avg))} | ${pct(run((m) => ({ tempC: site.tempC[m % 12]!, humidity: site.humidity[m % 12]! })))} | ${pct(run(slot(0)))} · ${pct(run(slot(3)))} · ${pct(run(slot(5)))} |`);
}
