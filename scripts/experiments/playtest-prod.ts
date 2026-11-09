// 플레이테스트 기록의 PROD 몫 읽기 (생산·숙성·병입·가격) — 4차 MVP 플레이테스트 분석(mvp.md §7.x)용으로 만들었고 다음 판에도 쓴다
// 실행: npx tsx scripts/experiments/playtest-prod.ts <기록 파일.json> [비교할 다른 판 기록.json]
// 세이브를 바꾸지 않는다(읽기만, 가격 비교는 복사본에서). 게임 동작과 무관 — 출력 불변 대상이 아니다
//
// 기록의 한계: 월 결산은 마지막 120개월만 남는다(앞은 연 요약). 플레이 기록에는 행동 종류가 없다.
// 사라진(보관된) 제품은 이름·출시 달·판매 수·품질·값만 남아 병 크기·포장·숙성 개월을 모른다 → 병입비는 700ml 스탠다드로 어림한다
import { readFileSync } from 'node:fs';
import { calendar, isWhiskyCategory, previewBatch, priceOptions, type GameState, type MonthReport, type Product } from '../../src/sim';
import { bestAutoPrice, currentSuggested, AUTO_PRICE_FACTORS } from '../../src/sim/economics';
import { warehouseCapacity } from '../../src/sim/util';
import { PACKAGING } from '../../src/sim/content/catalog';
import { BOTTLING_LABOR_PER_BOTTLE } from '../../src/sim/content/market';
import { SAMPLING } from '../../src/sim/blendTable';
import { parsePlayFile } from '../../src/store/playlog';

const load = (path: string) => {
  const r = parsePlayFile(readFileSync(path, 'utf8'));
  if ('error' in r) { console.error(r.error); process.exit(1); }
  return r;
};
const path = process.argv[2];
if (!path) { console.error('사용: npx tsx scripts/experiments/playtest-prod.ts <기록 파일.json> [비교 기록.json]'); process.exit(1); }
const { save: s, playlog } = load(path);
const other = process.argv[3] ? load(process.argv[3]).save : null;

const eok = (v: number) => `${(v / 1e8).toFixed(2)}억`;
const man = (v: number) => `${Math.round(v / 1e4).toLocaleString()}만`;
const n0 = (v: number) => Math.round(v).toLocaleString();
const isWhiskyName = (c: string) => isWhiskyCategory(c as Product['category']);
const yearOf = (g: GameState, m: number) => g.startYear + Math.floor(m / 12);
const kindOfRecipe = (g: GameState, id: string) => g.production.recipes.find((r) => r.id === id)?.kind ?? '?';
const allProducts = () => [...s.commerce.products.map((p) => ({ id: p.id, name: p.name, category: p.category as string, createdMonth: p.createdMonth, totalSold: p.totalSold, quality: p.quality, price: p.price, live: true })),
  ...s.commerce.productArchive.map((a) => ({ ...a, category: a.category as string, live: false }))];
const catsOf = (g: GameState) => new Map<string, string>([...g.commerce.products.map((p) => [p.id, p.category as string] as const), ...g.commerce.productArchive.map((a) => [a.id, a.category as string] as const)]);

console.log(`# PROD 기록 읽기 — ${s.distilleryName} (${s.scenario?.id ?? '샌드박스'}, ${s.month}개월)`);

// ── 1. 연도별 생산·공급 ──
type Y = { year: number; maltLpa: number; sojuLpa: number; maltBatches: number; sojuBatches: number; whiskyBottles: number; whiskyRev: number; sojuBottles: number; sojuRev: number; otherBottles: number; months: number; liveWhisky: number; liveSoju: number; limited: number; autoSample: number; lost: number };
function yearly(g: GameState): Y[] {
  const by = new Map<number, Y>();
  const catOf = catsOf(g);
  for (const r of g.history.reports as MonthReport[]) {
    const y = yearOf(g, r.month);
    const e = by.get(y) ?? { year: y, maltLpa: 0, sojuLpa: 0, maltBatches: 0, sojuBatches: 0, whiskyBottles: 0, whiskyRev: 0, sojuBottles: 0, sojuRev: 0, otherBottles: 0, months: 0, liveWhisky: 0, liveSoju: 0, limited: 0, autoSample: 0, lost: 0 };
    e.months++;
    for (const p of r.production ?? []) {
      const k = kindOfRecipe(g, p.recipeId);
      if (k === 'malt' || k === 'grain') { e.maltLpa += p.lpa; e.maltBatches += p.batches; } else if (k === 'soju') { e.sojuLpa += p.lpa; e.sojuBatches += p.batches; }
    }
    const w = new Set<string>(); const so = new Set<string>();
    for (const x of r.sales) {
      const c = catOf.get(x.productId) ?? (x.name.includes('소주') ? 'soju_distilled' : '?');
      if (isWhiskyName(c)) { e.whiskyBottles += x.bottles; e.whiskyRev += x.revenue; if (x.bottles > 0) w.add(x.productId); }
      else if (c === 'soju_distilled') { e.sojuBottles += x.bottles; e.sojuRev += x.revenue; if (x.bottles > 0) so.add(x.productId); }
      else e.otherBottles += x.bottles;
      if (x.demandBottles != null && x.bottles < x.demandBottles - 0.5) e.limited++;
    }
    e.liveWhisky += w.size; e.liveSoju += so.size;
    e.autoSample += (r.expenses as Record<string, number>)['자동 샘플'] ?? 0;
    e.lost += r.lostSalesBottles ?? 0;
    by.set(y, e);
  }
  return [...by.values()].sort((a, b) => a.year - b.year);
}

console.log('\n## 1. 연도별 (연 요약 — 15년 전체)');
console.log('| 연도 | 매출 | 판매 병 | 생산 LPA(전체) | 숙성 중 통(연말) | 숙성고 자리(연말) | 현금(연말) | 순자산(연말) |');
console.log('|---|---|---|---|---|---|---|---|');
for (const y of s.history.years) {
  const endMonth = (y.year - s.startYear) * 12 + 11;
  const cap = warehouseCapacity({ ...s, month: endMonth } as GameState);
  console.log(`| ${y.year} | ${eok(y.revenue)} | ${n0(y.bottlesSold)} | ${n0(y.lpaProduced)} | ${y.filledCasksEnd} | ${cap} | ${eok(y.cashEnd)} | ${eok(y.netWorthEnd ?? 0)} |`);
}

const Ys = yearly(s);
console.log('\n## 2. 연도별 (월 결산 — 남은 기간만)');
console.log('| 연도(개월 수) | 몰트 배치·LPA | 소주 배치·LPA | 위스키 병·매출 | 소주 병·매출 | 기타 병 | 팔린 위스키 제품(월 평균) | 팔린 소주 제품(월 평균) | 재고가 수요보다 적은 제품·월 | 자동 샘플 |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const y of Ys) console.log(`| ${y.year}(${y.months}) | ${y.maltBatches}·${n0(y.maltLpa)} | ${y.sojuBatches}·${n0(y.sojuLpa)} | ${n0(y.whiskyBottles)}·${eok(y.whiskyRev)} | ${n0(y.sojuBottles)}·${eok(y.sojuRev)} | ${n0(y.otherBottles)} | ${(y.liveWhisky / y.months).toFixed(1)} | ${(y.liveSoju / y.months).toFixed(1)} | ${y.limited} | ${man(y.autoSample)} |`);

// 공급 전망(#178)과 같은 식: 몰트 LPA → 법정 숙성(min) 뒤 증발 5%/년 → 700ml 40% 병
const minM = s.scenario ? 12 : 36;
const bottleLPA = 0.7 * 0.4;
console.log(`\n### 몰트 생산이 만든 위스키 몫 (공급 전망 #178과 같은 식: 작년 몰트 LPA × 0.95^(${minM}/12) ÷ ${bottleLPA}) 대 실제 위스키 판매`);
for (let i = 1; i < Ys.length; i++) {
  const prev = Ys[i - 1]!; const y = Ys[i]!;
  if (prev.months < 12) continue;
  const could = (prev.maltLpa * Math.pow(0.95, minM / 12)) / bottleLPA;
  console.log(`- ${y.year}: 작년 몰트로 생길 수 있는 위스키 ${n0(could)}병 · 실제 판매 ${n0(y.whiskyBottles)}병 (${(y.whiskyBottles / could * 100).toFixed(0)}% — 나머지는 더 숙성하려고 남김)`);
}

// ── 3. 제품 ──
console.log('\n## 3. 제품 (보관 포함, 출시 순)');
const lastSold = new Map<string, number>(); const firstSold = new Map<string, number>();
for (const r of s.history.reports) for (const x of r.sales) if (x.bottles > 0) { lastSold.set(x.productId, r.month); if (!firstSold.has(x.productId)) firstSold.set(x.productId, r.month); }
console.log('| 제품 | 범주 | 출시 | 마지막 판매(기록 안) | 누적 판매 | 품질 | 값 | 지금 |');
console.log('|---|---|---|---|---|---|---|---|');
for (const p of allProducts().sort((a, b) => a.createdMonth - b.createdMonth)) console.log(`| ${p.name} | ${p.category} | ${p.createdMonth} | ${lastSold.get(p.id) ?? '—'} | ${n0(p.totalSold)} | ${p.quality} | ${n0(p.price)} | ${p.live ? `판매 중(재고 ${n0(s.commerce.products.find((x) => x.id === p.id)!.stockBottles)})` : '보관됨'} |`);
const totalBottled = allProducts().reduce((t, p) => t + p.totalSold, 0) + s.commerce.products.reduce((t, p) => t + p.stockBottles, 0);
const perBottle = PACKAGING.standard!.costBySize[700] + BOTTLING_LABOR_PER_BOTTLE;
console.log(`- 병입 합계(판매 + 남은 재고) ≈ ${n0(totalBottled)}병 → 병입비(700ml 스탠다드 ${n0(perBottle)}원으로 어림) ≈ ${eok(totalBottled * perBottle)} · 20% 인하(#163)면 ${eok(totalBottled * perBottle * 0.2)} 덜 든다`);
// 연도별 병입비 어림 — 판매 병 수 기준(재고 증감 무시). 인하 몫을 연말 현금·순자산과 맞대 본다
let cum = 0;
console.log('| 연도 | 판매 병 | 병입비 어림 | 20% 인하 몫(누적) | 연말 현금 | 매출 대비 병입비 |');
console.log('|---|---|---|---|---|---|');
for (const y of s.history.years) { const c = y.bottlesSold * perBottle; cum += c * 0.2; console.log(`| ${y.year} | ${n0(y.bottlesSold)} | ${man(c)} | ${man(cum)} | ${eok(y.cashEnd)} | ${y.revenue ? (c / y.revenue * 100).toFixed(0) : '—'}% |`); }
for (const p of s.commerce.products) console.log(`- 「${p.name}」 병당 원가 ${n0(p.unitCost)}원 중 병입(포장·인건비) ${n0((PACKAGING[p.packagingId]?.costBySize[p.bottleMl as 700] ?? 0) + BOTTLING_LABOR_PER_BOTTLE)}원 · 출고가 ${n0(p.price)}원`);
for (const p of s.commerce.products) {
  const recent = s.history.reports.slice(-6).reduce((t, r) => t + (r.sales.find((x) => x.productId === p.id)?.bottles ?? 0), 0) / 6;
  console.log(`- 끝 재고 「${p.name}」 ${n0(p.stockBottles)}병 = 최근 6개월 평균 판매(${n0(recent)}병/월)의 ${recent > 0 ? (p.stockBottles / recent).toFixed(1) : '∞'}개월 치`);
}

// ── 4. 숙성·샘플 ──
console.log('\n## 4. 숙성·샘플');
const ms = (id: string) => s.progress.milestones.find((m) => m.id === id) as { month: number; value?: number } | undefined;
console.log(`- 첫 통입 ${ms('first_fill')?.month ?? '—'}개월 · 첫 위스키 병입 ${ms('first_whisky_bottled')?.month ?? '—'}개월 · 플래그십 병입 ${ms('flagship_bottled')?.month ?? '—'}개월(품질 ${ms('flagship_bottled')?.value ?? '—'})`);
const casks = s.inventory.casks.filter((c) => c.contents && (c.contents.kind === 'malt' || c.contents.kind === 'grain'));
const ages = casks.map((c) => c.contents!.oakMonths).sort((a, b) => b - a);
console.log(`- 끝에 숙성 중인 몰트 통 ${casks.length}개 · 가장 오래된 통 ${ages[0] ?? 0}개월 · 상위 5개 ${ages.slice(0, 5).join(', ')}`);
const samplesNow = s.inventory.casks.reduce((t, c) => t + (c.samples ?? 0), 0);
const autoSampleTotal = s.history.reports.reduce((t, r) => t + ((r.expenses as Record<string, number>)['자동 샘플'] ?? 0), 0);
console.log(`- 남은 통에 기록된 샘플 ${samplesNow}회(병입·판매로 사라진 통은 빠짐) · 자동 샘플 비용(월 결산 ${s.history.reports.length}개월) ${man(autoSampleTotal)} = ${n0(autoSampleTotal / SAMPLING.cost)}회 · 그 기간 매출의 ${(autoSampleTotal / s.history.reports.reduce((t, r) => t + r.revenue, 0) * 100).toFixed(2)}%`);
const autoNotes = s.history.reports.flatMap((r) => r.notes.filter((n) => n.startsWith('자동 샘플')).map((n) => ({ m: r.month, n })));
if (autoNotes.length) {
  const oldWording = autoNotes.filter((x) => x.n.includes('개월 넘게 안 뜬 통부터')).length;
  console.log(`- 자동 샘플 메모 ${autoNotes.length}건 중 옛 문구("6개월 넘게 안 뜬 통부터", #201 이전 빌드) ${oldWording}건 · 새 문구 ${autoNotes.length - oldWording}건 — 첫 ${autoNotes[0]!.m}개월, 마지막 ${autoNotes.at(-1)!.m}개월`);
}

// ── 5. 가격 ──
console.log('\n## 5. 가격');
const ratioRows: string[] = [];
for (const r of s.history.reports) {
  const xs = r.sales.filter((x) => x.bottles > 0).map((x) => {
    const p = s.commerce.products.find((q) => q.id === x.productId);
    return p ? (x.revenue / x.bottles) / currentSuggested(s, p) : null;
  }).filter((v): v is number => v != null);
  if (xs.length) ratioRows.push(`${r.month}:${Math.min(...xs).toFixed(2)}~${Math.max(...xs).toFixed(2)}`);
}
console.log(`- 판매 중인 제품의 실제 출고가 ÷ 지금 권장가(끝 품질 기준, 근사) — 달:최소~최대 (끝까지 남은 제품만): ${ratioRows.slice(-30).join(' · ')}`);
// 끝 세이브 그대로, 이번 달 국내 진열 기댓값 — 지금 값 / 옛 자동 가격(제품 하나 공헌 최대, 차례로) / 지금 자동 가격(#220 진열 기준)
const moy = calendar(s).monthOfYear;
const lineup = (g: GameState) => { const p = g.commerce.products.find((x) => x.stockBottles > 0 && !x.dutyFreeOnly)!; const o = priceOptions(g, p, moy, [1])[0]!; return { rev: o.lineupRevenue, con: o.lineupContribution }; };
const sold = (g: GameState) => g.commerce.products.filter((p) => p.stockBottles > 0 && !p.dutyFreeOnly);
if (sold(s).length) {
  const base = lineup(s);
  const oldAuto = structuredClone(s);
  for (const p of sold(oldAuto)) {
    const b = currentSuggested(oldAuto, p);
    const cands = [...new Set([p.price, ...AUTO_PRICE_FACTORS.map((f) => Math.max(100, Math.round((b * f) / 100) * 100))])];
    const opts = priceOptions(oldAuto, p, moy, cands.map((x) => x / p.price)).filter((o) => o.contribution > 0);
    if (opts.length) p.price = opts.reduce((a, o) => (o.contribution > a.contribution ? o : a)).price;
  }
  const newAuto = structuredClone(s);
  for (const p of sold(newAuto)) { const v = bestAutoPrice(newAuto, p); if (v) p.price = v; }
  const a = lineup(oldAuto); const n = lineup(newAuto);
  console.log(`- 끝 세이브(${s.month}개월) 이번 달 국내 진열 기댓값 — 지금 값: 매출 ${man(base.rev)} · 공헌 ${man(base.con)} / 옛 자동 가격(#200, 제품 하나 기준·차례로): ${man(a.rev)} · ${man(a.con)} / 지금 자동 가격(#220 진열 기준): ${man(n.rev)} · ${man(n.con)}`);
  for (const p of sold(s)) console.log(`  - 「${p.name}」 지금 ${n0(p.price)}(권장 ×${(p.price / currentSuggested(s, p)).toFixed(2)}) → 옛 자동 ${n0(oldAuto.commerce.products.find((x) => x.id === p.id)!.price)} → 진열 기준 ${n0(newAuto.commerce.products.find((x) => x.id === p.id)!.price)}${p.restMonths ? ` · 옹기 ${p.restMonths}개월` : ''}`);
}

// ── 6. 기능 흔적 ──
console.log('\n## 6. 4차 판 중 넣은 기능의 흔적');
const exp = (k: string) => s.history.reports.filter((r) => ((r.expenses as Record<string, number>)[k] ?? 0) > 0).map((r) => r.month);
console.log(`- 자동 납품 병입 비용이 있는 달: ${exp('자동 납품 병입').join(', ') || '없음'}`);
console.log(`- 자동 가격을 켠 제품(끝): ${s.commerce.products.filter((p) => p.autoPrice).map((p) => p.name).join(', ') || '없음'} · 자동 납품을 켠 제품(끝): ${s.commerce.products.filter((p) => p.autoRestock).map((p) => p.name).join(', ') || '없음'} · 자동 샘플 설정: ${JSON.stringify(s.inventory.autoSample ?? '기본(없음)')}`);
console.log(`- 탱크에 남은 숙성 원액(통에서 뺀 흔적): ${s.inventory.lots.filter((l) => l.oakMonths > 0 || (l.restMonths ?? 0) > 0).map((l) => `${l.id} ${l.kind} 오크 ${l.oakMonths}·옹기 ${l.restMonths ?? 0}개월`).join(', ') || '없음'}`);
console.log(`- 재고 0인데 목록에 남은 제품: ${s.commerce.products.filter((p) => p.stockBottles <= 0).map((p) => `「${p.name}」(출시 ${p.createdMonth}, 지난달 판매 ${p.lastMonthSold})`).join(', ') || '없음'} · 보관된 제품 ${s.commerce.productArchive.length}개`);
if (playlog) console.log(`- 플레이 기록: 시작 ${new Date(playlog.startedAt).toISOString()} · 활동 ${Math.round(playlog.activeMs / 60000)}분 · 행동 ${playlog.actions} · 되돌리기 ${playlog.undos ?? '기록 없음'}`);

// ── 7. 다른 판과 비교 ──
if (other) {
  const Yo = yearly(other);
  console.log(`\n## 7. 비교 — ${other.distilleryName} (${other.month}개월)`);
  console.log('| 연도 | 이 판 매출 · 판매 병 · 생산 LPA | 비교 판 매출 · 판매 병 · 생산 LPA |');
  console.log('|---|---|---|');
  const yo = new Map(other.history.years.map((y) => [y.year - other.startYear, y]));
  for (const y of s.history.years) { const i = y.year - s.startYear; const o = yo.get(i); console.log(`| ${i + 1}년 차 | ${eok(y.revenue)} · ${n0(y.bottlesSold)} · ${n0(y.lpaProduced)} | ${o ? `${eok(o.revenue)} · ${n0(o.bottlesSold)} · ${n0(o.lpaProduced)}` : '—'} |`); }
  console.log('\n비교 판 월 결산(남은 기간):');
  for (const y of Yo) console.log(`- ${y.year - other.startYear + 1}년 차(${y.months}개월): 몰트 ${y.maltBatches}배치·${n0(y.maltLpa)} LPA · 위스키 ${n0(y.whiskyBottles)}병 ${eok(y.whiskyRev)} · 소주 ${n0(y.sojuBottles)}병 ${eok(y.sojuRev)}`);
  const stop = other.history.reports.filter((r) => (r.production ?? []).every((p) => { const k = kindOfRecipe(other, p.recipeId); return k !== 'malt' && k !== 'grain'; })).map((r) => r.month);
  console.log(`- 비교 판에서 몰트 생산이 0인 달: ${stop.join(', ') || '없음'}`);
}
void previewBatch;
