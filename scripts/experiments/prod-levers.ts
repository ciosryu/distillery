// G01-PROD-1 죽은 레버 감사 (game-program.md §4, 결정 #280 GAME-01 향미 ↔ 수요 — MKT G01-MKT-1의 입력) · docs/design/prod-stage-t.md 「요구사항」
// 게임 규칙을 바꾸지 않는다. 기준 레시피(지역 첫 몰트 프리셋)에서 크래프팅 레버를 **하나씩만** 바꿔
// 뉴메이크 → 표준 조건 숙성(ex-버번 새 배럴, 입지 연평균 기후) → 병입 미리보기까지 게임 함수로 돌리고
// Δ육각형 · Δ품질 · Δ전형성 · Δ권장가 · Δ월 수요(그 권장가에, 같은 범주 1제품)를 표로 낸다.
// 수요가 어디로 움직였는지 가른다: 기준 제품에 변형의 품질만(→ "품질만") / 품질 + 전형성(→ "+전형성")을 넣은 반사실과 비교 — 남는 차이는 향미 방향(트렌드·인센스) 등.
//
// 실행: npx tsx scripts/experiments/prod-levers.ts                — 새 판(한국 MVP 표준) 상태, 12·36개월
//   SAVE=<세이브.json>   그 상태(인지도·트렌드·시세)로 수요를 본다 — 판 중반은 P8 DUMP(예: `P8=1 TIER=standard DUMP=out mvp-human.ts 1 180` → out/bot-m59.json)
//   AGES=12,36,72        병입 시점(개월)
import { readFileSync } from 'node:fs';
import { CASKS } from '../../src/sim/content/catalog';
import { siteOf } from '../../src/sim/content/regions';
import { hexOf, HEX_AXES, HEX_LABEL } from '../../src/sim/blendRadar';
import { demandFor } from '../../src/sim/market';
import { matureCask } from '../../src/sim/maturation';
import { simulateBatch, stillDefOf } from '../../src/sim/production';
import { migrateSave, newScenarioGame, previewBlend, type BottleOptions, type Cask, type GameState, type Product, type Recipe, type SpiritLot } from '../../src/sim';
import { bestBy, calendar, staffOf } from '../../src/sim/util';

const env = process.env;
const AGES = (env.AGES ?? '12,36').split(',').map(Number);
const s: GameState = env.SAVE ? migrateSave(JSON.parse(readFileSync(env.SAVE, 'utf8')))! : newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 1 });
const base = s.production.recipes.find((r) => r.kind === 'malt')!;

interface Variant { lever: string; name: string; recipe?: (r: Recipe) => Recipe; tempC?: number; fermenter?: 'stainless' | 'onggi'; cask?: string; fills?: number; entryAbv?: number; finish?: { cask: string; months: number }; bottleAbv?: number; chillFilter?: boolean }
const R = (f: (r: Recipe) => void) => (r: Recipe) => { const x = structuredClone(r); f(x); return x; };
const VARIANTS: Variant[] = [
  { lever: '기준', name: `${base.name} · 18°C · 스테인리스 · ex-버번 새 배럴 · 통입 63.5% · 병입 40% · 냉각 여과` },
  { lever: '곡물 배합', name: '피트 몰트 100%', recipe: R((r) => { r.mashBill = [{ ingredientId: 'malt_peated', ratio: 1 }]; }) },
  { lever: '곡물 배합', name: '국산 몰트 100%', recipe: R((r) => { r.mashBill = [{ ingredientId: 'malt_korean', ratio: 1 }]; }) },
  { lever: '곡물 배합', name: '피트 50% + 언피트 50%', recipe: R((r) => { r.mashBill = [{ ingredientId: 'malt_unpeated', ratio: 0.5 }, { ingredientId: 'malt_peated', ratio: 0.5 }]; }) },
  { lever: '효모', name: '에일 효모', recipe: R((r) => { r.yeast = 'ale'; }) },
  { lever: '효모', name: '누룩 자연 발효', recipe: R((r) => { r.yeast = 'nuruk_native'; }) },
  { lever: '발효 기간', name: '3일', recipe: R((r) => { r.fermentDays = 3; }) },
  { lever: '발효 기간', name: '7일', recipe: R((r) => { r.fermentDays = 7; }) },
  { lever: '발효 온도', name: '8°C (겨울)', tempC: 8 },
  { lever: '발효 온도', name: '28°C (여름 고온 — 산패 난수는 끔)', tempC: 28 },
  { lever: '발효조', name: '옹기 발효조', fermenter: 'onggi' },
  { lever: '컷', name: '좁게 (c1 +0.05 · c2 −0.05)', recipe: R((r) => { r.cut = { c1: r.cut.c1 + 0.05, c2: r.cut.c2 - 0.05 }; }) },
  { lever: '컷', name: '넓게 (c1 −0.05 · c2 +0.05)', recipe: R((r) => { r.cut = { c1: Math.max(0, r.cut.c1 - 0.05), c2: Math.min(1, r.cut.c2 + 0.05) }; }) },
  { lever: '증류 횟수', name: '1회(단식 1회)', recipe: R((r) => { r.runs = 1; }) },
  { lever: '캐스크 종류', name: '올로로소 셰리 벗 500L', cask: 'oloroso_butt' },
  { lever: '캐스크 종류', name: '한국 참나무 쿼터 125L', cask: 'korean_oak_quarter' },
  { lever: '캐스크 종류', name: '미즈나라 혹스헤드 250L', cask: 'mizunara_hogshead' },
  { lever: '캐스크 필 수', name: 'ex-버번 3번째 통입', fills: 2 },
  { lever: '통입 도수', name: '60%', entryAbv: 0.6 },
  { lever: '통입 도수', name: '70%', entryAbv: 0.7 },
  { lever: '피니싱(MVP 잠김)', name: '마지막 6개월 올로로소 벗', finish: { cask: 'oloroso_butt', months: 6 } },
  { lever: '병입 도수', name: '46%', bottleAbv: 0.46 },
  { lever: '냉각 여과', name: '안 함(46%)', chillFilter: false, bottleAbv: 0.46 },
];

const site = siteOf(s);
const climate = { tempC: site.tempC.reduce((a, x) => a + x, 0) / 12, humidity: site.humidity.reduce((a, x) => a + x, 0) / 12 };
const still = stillDefOf(s, base.stillId)!;
const distiller = bestBy(staffOf(s, 'distiller'), 'b');
const moy = calendar(s).monthOfYear;

interface Point { hex: Record<string, number>; quality: number; typicity: number; price: number; demand: number; product: Product; bottles: number }
function run(v: Variant, months: number): Point | null {
  const r = v.recipe ? v.recipe(base) : base;
  const b = simulateBatch(r, still, v.fermenter ?? 'stainless', distiller, s.world.priceIndex, 0, { tempC: v.tempC ?? 18, regionId: s.regionId });
  const def = CASKS[(v.cask ?? 'ex_bourbon_barrel') as keyof typeof CASKS];
  const fills = v.fills ?? 0;
  const entry = Math.min(v.entryAbv ?? 0.635, b.abv);
  const lot: SpiritLot = { id: '__lever', name: r.name, kind: r.kind, volumeL: def.sizeL, abv: entry, flavor: b.flavor, createdMonth: s.month, oakMonths: 0, sourced: false, costPerLPA: 0, recipeId: r.id,
    ...(r.mashBill.length ? { mashShare: Object.fromEntries(r.mashBill.map((m) => [m.ingredientId, m.ratio])) } : {}) };
  const mk = (d: typeof def, f: number, l: SpiritLot): Cask & { contents: SpiritLot } => ({ id: '__lever', typeId: d.id, sizeL: d.sizeL, wood: d.wood, activity: d.activity * Math.pow(0.6, f), seasoning: d.seasoning * Math.pow(0.35, f), fills: f, recharCount: 0, char: d.char, contents: l });
  let cask = mk(def, fills, lot);
  const finishAt = v.finish ? Math.max(0, months - v.finish.months) : Infinity;
  for (let m = 0; m < months; m++) {
    if (m === finishAt && v.finish) { const fd = CASKS[v.finish.cask as keyof typeof CASKS]; cask = mk(fd, 0, cask.contents); }
    cask = matureCask(cask, climate, { control: 0 }).cask as typeof cask;
  }
  const l = { ...cask.contents, oakMonths: months };
  const t = { ...s, inventory: { ...s.inventory, lots: [...s.inventory.lots, l] } } as GameState;
  const opts: BottleOptions = { name: '', targetAbv: v.bottleAbv ?? 0.4, bottleMl: 700, chillFilter: v.chillFilter ?? true, packagingId: 'standard' };
  const p = previewBlend(t, [{ source: 'lot', id: l.id, liters: Math.min(l.volumeL, 100) }], opts);
  if (!p.evaluation || !p.category) return null;
  const product = { id: '__lever', name: '', category: p.category, ageYears: p.ageYears, oakMonths: p.minOakMonths, abv: p.finalAbv, bottleMl: 700, chillFiltered: opts.chillFilter, packagingId: 'standard', flavor: p.flavor,
    quality: p.evaluation.quality, typicity: p.evaluation.typicity, style: p.evaluation.style, sourcedShare: 0, stockBottles: 1, price: p.suggestedPrice, unitCost: p.unitCost, createdMonth: s.month, lastMonthSold: 0, totalSold: 0, ...(p.traditional ? { traditional: true } : {}) } as Product; // 전통주 주세 경감(국산 원료 + 등록 설비) — 소비자가가 달라진다
  return { hex: hexOf(p.flavor) as Record<string, number>, quality: p.evaluation.quality, typicity: p.evaluation.typicity, price: p.suggestedPrice, demand: demandFor(s, product, 1, moy).demandBottles, product, bottles: p.bottles };
}

const pct = (a: number, b: number) => (b ? `${((a / b - 1) * 100).toFixed(1)}%` : '—');
const sgn = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;
console.log(`# G01-PROD-1 죽은 레버 감사 — ${s.regionId} ${s.scenario ? `MVP ${s.scenario.tierId}` : '샌드박스'} ${s.month}개월째 상태(인지도·트렌드·시세), 기준 ${VARIANTS[0]!.name}\n`);
for (const months of AGES) {
  const b0 = run(VARIANTS[0]!, months)!;
  console.log(`## 병입 ${months}개월 — 기준: 품질 ${b0.quality.toFixed(1)} · 전형성 ${b0.typicity.toFixed(0)} · 권장가 ${b0.price.toLocaleString()}원 · 월 수요 ${b0.demand.toFixed(0)}병 · ${b0.bottles}병/100L`);
  console.log('| 레버 | 변형 | Δ육각형(합) · 가장 큰 축 | Δ품질 | Δ전형성 | Δ권장가 | Δ월 수요 | 수요 차이의 출처 | 분류 |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  const cls = { dead: [] as string[], qualityOnly: [] as string[] };
  for (const v of VARIANTS.slice(1)) {
    const x = run(v, months);
    if (!x) { console.log(`| ${v.lever} | ${v.name} | (병입 불가) ||||||| `); continue; }
    const dh = HEX_AXES.map((a) => [a, x.hex[a]! - b0.hex[a]!] as const);
    const sumAbs = dh.reduce((t, [, d]) => t + Math.abs(d), 0);
    const top = [...dh].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]!;
    // 반사실: 기준 제품에 변형의 품질만 / 품질+전형성만 넣는다(향미·도수·숙성은 기준 그대로)
    const qOnly = demandFor(s, { ...b0.product, quality: x.quality }, 1, moy).demandBottles;
    const qTyp = demandFor(s, { ...b0.product, quality: x.quality, typicity: x.typicity }, 1, moy).demandBottles;
    const near = (a: number, b: number) => Math.abs(a / b - 1) < 0.005;
    const dPrice = Math.abs(x.price / b0.price - 1), dDem = Math.abs(x.demand / b0.demand - 1);
    // 수요는 그 제품의 권장가에서 잰다 — 권장가가 같은 식(품질·연수·도수)으로 움직이면 가격 반응이 상쇄되므로, 출처는 "같은 값일 때"의 매력도로 가른다
    const atBasePrice = (p: Product) => demandFor(s, { ...p, price: b0.price }, 1, moy).demandBottles;
    const xb = atBasePrice(x.product), qb = atBasePrice({ ...b0.product, quality: x.quality }), qtb = atBasePrice({ ...b0.product, quality: x.quality, typicity: x.typicity });
    const src = near(xb, atBasePrice(b0.product)) ? '없음' : near(xb, qb) ? '품질만' : near(xb, qtb) ? '품질 + 전형성' : '그 밖(향미 방향·도수 등)';
    const dead = Math.abs(x.quality - b0.quality) < 0.5 && dPrice < 0.005 && dDem < 0.005;
    const label = dead ? (sumAbs > 1 ? '**향만 바뀜(경제 효과 없음)**' : '**죽은 레버**') : src === '품질만' || src === '품질 + 전형성' ? '품질 점수로만' : '그 밖의 경로 있음';
    if (dead) cls.dead.push(`${v.lever}:${v.name}`);
    else if (label === '품질 점수로만') cls.qualityOnly.push(`${v.lever}:${v.name}`);
    void qOnly; void qTyp;
    console.log(`| ${v.lever} | ${v.name} | ${sumAbs.toFixed(1)} · ${HEX_LABEL[top[0]]} ${sgn(top[1])} | ${sgn(x.quality - b0.quality)} | ${sgn(x.typicity - b0.typicity, 0)} | ${pct(x.price, b0.price)} | ${pct(x.demand, b0.demand)} | ${src} | ${label} |`);
  }
  console.log(`\nSUMMARY ${months}개월: 경제 효과 없음 ${cls.dead.length}개 [${cls.dead.join(' · ')}] · 품질 점수로만 ${cls.qualityOnly.length}개 · 그 밖 ${VARIANTS.length - 1 - cls.dead.length - cls.qualityOnly.length}개\n`);
}
