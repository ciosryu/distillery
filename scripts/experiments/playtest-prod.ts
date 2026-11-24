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
import { CASKS, PACKAGING } from '../../src/sim/content/catalog';
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
  // 출시 달 이후만 평균한다 — 출시 전 달(0병)을 넣으면 새 제품의 재고 개월이 부풀려진다(7차 중간: 61개월 출시 제품이 24.1개월 치 → 실제 약 4개월 치, MKT 지적)
  const live = s.history.reports.slice(-6).filter((r) => r.month >= p.createdMonth);
  const recent = live.length ? live.reduce((t, r) => t + (r.sales.find((x) => x.productId === p.id)?.bottles ?? 0), 0) / live.length : 0;
  // 판매도 재고도 없으면(보관·단종) "∞개월 치"가 아니라 셀 것이 없다 — 재고만 있고 판매가 0이면 개월 수를 셀 수 없다고 적는다(7차 완료)
  const cover = recent > 0 ? `최근 6개월 평균 판매(${n0(recent)}병/월)의 ${(p.stockBottles / recent).toFixed(1)}개월 치` : p.stockBottles > 0 ? '최근 6개월 판매 0 — 개월 수를 셀 수 없음' : '최근 6개월 판매·재고 없음';
  console.log(`- 끝 재고 「${p.name}」 ${n0(p.stockBottles)}병 = ${cover}`);
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
// 자동 가격은 autoPrice가 켜져 있을 때만 돈다(priceEngine) — 끄면 autoPrice만 지우고 pricePolicy(정책·lastFactor)는 남긴다(다시 켜면 마지막 정책).
// 그래서 정책 그릇만 보고 "켜짐"으로 읽으면 틀린다 — 켜짐과 "정책만 남고 꺼짐"을 나눠 적는다
const polOff = s.commerce.products.filter((p) => !p.autoPrice && p.pricePolicy).map((p) => `${p.name}(${p.pricePolicy!.mode})`);
console.log(`- 자동 가격을 켠 제품(끝): ${s.commerce.products.filter((p) => p.autoPrice).map((p) => `${p.name}(${p.pricePolicy?.mode ?? 'A'})`).join(', ') || '없음'}${polOff.length ? ` · 정책만 남고 꺼진 제품: ${polOff.join(', ')}` : ''} · 자동 납품을 켠 제품(끝): ${s.commerce.products.filter((p) => p.autoRestock).map((p) => p.name).join(', ') || '없음'} · 자동 샘플 설정: ${JSON.stringify(s.inventory.autoSample ?? '기본(없음)')}`);
console.log(`- 탱크에 남은 숙성 원액(통에서 뺀 흔적): ${s.inventory.lots.filter((l) => l.oakMonths > 0 || (l.restMonths ?? 0) > 0).map((l) => `${l.id} ${l.kind} 오크 ${l.oakMonths}·옹기 ${l.restMonths ?? 0}개월`).join(', ') || '없음'}`);
console.log(`- 재고 0인데 목록에 남은 제품: ${s.commerce.products.filter((p) => p.stockBottles <= 0).map((p) => `「${p.name}」(출시 ${p.createdMonth}, 지난달 판매 ${p.lastMonthSold})`).join(', ') || '없음'} · 보관된 제품 ${s.commerce.productArchive.length}개`);
if (playlog) console.log(`- 플레이 기록: 시작 ${new Date(playlog.startedAt).toISOString()} · 활동 ${Math.round(playlog.activeMs / 60000)}분 · 행동 ${playlog.actions} · 되돌리기 ${playlog.undos ?? '기록 없음'}`);

// ── 8. 6차 판 뒤 볼 것 (docs/playtest/6/prod.md — 통입 중단·덜 찬 통·핸드필 공백·12년 지연·생산 0인 달) ──
{
  console.log('\n## 8. 6차 판 뒤 볼 것');
  const reps = s.history.reports;
  const notesOf = (re: RegExp) => reps.flatMap((r) => (r.notes ?? []).filter((n) => re.test(n)).map((n) => ({ month: r.month, n })));
  // 탱크 대기 — 자사 몰트·그레인 탱크(가장 오래된 배치 달부터) · 소주 탱크
  const tankMalt = s.inventory.lots.filter((l) => (l.kind === 'malt' || l.kind === 'grain') && !l.sourced);
  const tankL = tankMalt.reduce((t2, l) => t2 + l.volumeL, 0);
  const waitM = tankMalt.length ? s.month - Math.min(...tankMalt.map((l) => l.createdMonth)) : 0;
  // 탱크 합치기(#166)는 첫 배치 달(createdMonth)을 계속 들고 있어, 매달 통입해도 끝자리가 남으면 대기 개월이 판 처음부터 늘어난다(7차 판 중간: 그레인 527L가 "20개월째"였지만 실제로는 4개월 치).
  // 통입이 오래된 원액부터(FIFO) 쓴다고 보고, 남은 LPA를 그 레시피의 최근 생산으로 거슬러 채워 "가장 오래된 원액이 만들어진 달"을 어림한다
  const fifoWait = (l: (typeof tankMalt)[number]) => {
    let need = l.volumeL * l.abv; let m = s.month;
    for (const r of [...reps].reverse()) { if (r.month < l.createdMonth) break; need -= (r.production ?? []).filter((x) => x.recipeId === l.recipeId).reduce((t2, x) => t2 + x.lpa, 0); m = r.month; if (need <= 0) break; }
    return s.month - Math.max(m, l.createdMonth);
  };
  const fifoM = tankMalt.length ? Math.max(...tankMalt.map(fifoWait)) : 0;
  const sojuL = s.inventory.lots.filter((l) => l.kind === 'soju').reduce((t2, l) => t2 + l.volumeL, 0);
  console.log(`- 탱크 몰트·그레인 ${n0(tankL)}L(탱크 첫 배치 ${waitM}개월째 · 오래된 원액부터 통입했다면 남은 원액은 약 ${fifoM}개월 치) · 탱크 소주 ${n0(sojuL)}L · 자동 통입 ${s.inventory.autoFill ? '켬' : '끔'}`);
  const af = notesOf(/자동 통입 \d+통/);
  console.log(`- 자동 통입이 돈 달 ${af.length}개${af.length ? `(${af[0]!.month}~${af.at(-1)!.month}개월)` : ''} · 빈 통 부족 메모 ${notesOf(/자동 통입 못 함/).length}건`);
  // 덜 찬 통 — 숙성 중 통의 처음 채움 비율(증발 연 5%로 되돌린 어림)
  const filled = s.inventory.casks.filter((c) => c.contents);
  const part = filled.filter((c) => { const l = c.contents!; const keep = Math.pow(0.95, (l.oakMonths + (l.restMonths ?? 0)) / 12); return l.volumeL / keep / CASKS[c.typeId].sizeL < 0.6; });
  console.log(`- 덜 찬 통(처음 채움 60% 미만 어림): ${part.length} / ${filled.length}통${part.length ? ` — ${part.slice(0, 8).map((c) => `${c.id}(${c.typeId.split('_')[0]})`).join(', ')}${part.length > 8 ? ' …' : ''}` : ''}`);
  // 핸드필 — 통이 빈 달과 다음 핸드필까지의 공백
  const hf = reps.filter((r) => (r.notes ?? []).some((n) => /^핸드필 \d+병/.test(n))).map((r) => r.month);
  const empty = notesOf(/핸드필.*비었다/).map((x) => x.month);
  const gaps = empty.map((m) => { const next = hf.find((x) => x > m); return `${m}개월에 빔 → ${next != null ? `${next - m - 1}개월 공백` : '끝까지 미지정'}`; });
  console.log(`- 핸드필: 판 달 ${hf.length}개 · ${gaps.join(' · ') || '통이 빈 적 없음'}`);
  // 12년 — 목재 144개월에 처음 닿은 달(남은 통 + 병입 로트 구성) · 병입 · 승리
  const A = 144;
  const woods = [...filled.filter((c) => !c.owner && c.contents!.kind === 'malt' && !c.contents!.sourced).map((c) => s.month - c.contents!.oakMonths + A),
    ...(s.commerce.lots ?? []).flatMap((l) => (l.components ?? []).filter((e) => e.origin === 'self').map((e) => l.bottledMonth - e.woodMonths + A))];
  const ms = (id: string) => s.progress.milestones.find((m) => m.id === id)?.month;
  // 12년 로트가 다 팔려 commerce.lots에서 빠지면 남은 통만으로는 첫 도달이 뒤로 밀린다(7차 완료: 147개월 병입인데 "245개월째(예정)").
  // 플래그십 병입·승리 달이 그보다 앞이면 그 달을 상한으로 쓴다
  const seen = [ms('flagship_bottled'), s.progress.win?.month].filter((m): m is number => m != null);
  const bound = seen.length ? Math.min(...seen) : null;
  const firstWood = woods.length ? Math.min(...woods) : null;
  const dropped = bound != null && (firstWood == null || firstWood > bound);
  const first = dropped ? bound : firstWood;
  const firstLabel = first == null ? '—' : dropped ? `${first}개월째 또는 그 전(구성 로트가 다 팔려 기록에 없음 — 플래그십 병입·승리 달로 대신)` : `${first}개월째${first > s.month ? '(예정)' : ''}(남은 통·병입 로트 구성 기준)`;
  console.log(`- 12년: 목재 ${A}개월 첫 도달 ≈ ${firstLabel} · 플래그십 병입 ${ms('flagship_bottled') ?? '—'} · 승리 ${s.progress.win ? `${s.progress.win.month}개월(${s.progress.win.bottles}병 × ${n0(s.progress.win.unitPrice)}원)` : '아직'}`);
  // 생산 0인 달과 까닭(결산 메모)
  const zero = reps.filter((r) => s.production.orders.some((o) => o.batchesPerMonth > 0) && !(r.production ?? []).length).map((r) => {
    const why = (r.notes ?? []).find((n) => /증류기가 준비되지 않아|생산 중단|건너뛰었다/.test(n));
    return `${r.month}${why ? `(${why.includes('증류기') ? '증류기' : why.includes('건너뛰') ? '건너뜀' : '재해'})` : ''}`;
  });
  console.log(`- 생산 0인 달: ${zero.join(', ') || '없음'} · 지시보다 덜 만든 달: ${notesOf(/배치 생산 못 함/).map((x) => x.month).join(', ') || '없음'}`);
}

// ── 9. 다음(F5d · 피니싱) 판 뒤 볼 것 — 병입 전 샘플 · 피니싱 통과 기간 · 승리 통 · 핸드필 (PM 2026-11-24, 빌드 6df3cb8) ──
// 읽는 곳: 플레이 기록 `turns[].kinds`(달마다 행동 종류 횟수 — 판 전체) · 월 결산 `lossEvents`(sample · transfer LPA, 마지막 120개월) · `saleEvents`(cellar_door) ·
// 제품 `qualityKnown`(F5d — 병입 때 추정이 리뷰로 좁혀진 지금 값) · `finish` · `caskMonthsMix` · 끝 세이브 통 `caskHistory`(finishOf).
// 기록에 없는 것: 병입에 쓴 통 id · 그 통의 활성도(BottledLot.components에는 배치 · 목재 개월만 있다) → 아래 9c는 통 종류 · 품질 · 후보 수만 읽는다
{
  console.log('\n## 9. F5d · 피니싱 판 뒤 볼 것');
  const reps = s.history.reports;
  const turns = playlog?.turns ?? [];
  const sumKinds = (k: string) => turns.reduce((a, x) => a + (x.kinds?.[k] ?? 0), 0);
  const lossLpa = (m: number, k: string) => (reps.find((r) => r.month === m)?.lossEvents ?? []).filter((e) => e.kind === k).reduce((a, e) => a + e.lpa, 0);
  // 9a 병입 전 샘플 — 병입한 달마다, 그 달까지 6개월 동안 손 샘플(sampleCask) · GC · 샘플 손실 LPA(자동 샘플 포함, 회당 0.1L)
  const bottleMonths = [...new Set(turns.filter((x) => (x.kinds?.bottle ?? 0) > 0).map((x) => x.month))].sort((a, b) => a - b);
  const win6 = (m: number, k: string) => turns.filter((x) => x.month > m - 6 && x.month <= m).reduce((a, x) => a + (x.kinds?.[k] ?? 0), 0);
  const sampleL = (m: number) => { let l = 0; for (let k = m - 5; k <= m; k++) l += lossLpa(k, 'sample'); return l; };
  console.log(`- 9a 병입 달 ${bottleMonths.length}개 · 손 샘플 ${sumKinds('sampleCask')}번 · GC ${sumKinds('labAnalyze')}번 · 블렌더 위임 ${sumKinds('delegateBlend')}번(판 전체, 플레이 기록)`);
  const firstRep = reps[0]?.month ?? Infinity;
  const judged = bottleMonths.filter((m) => m - 5 >= firstRep); // 앞 6개월 결산이 다 남은 달만 판정(자동 샘플은 결산 손실로만 보인다)
  const noSample = judged.filter((m) => win6(m, 'sampleCask') + win6(m, 'labAnalyze') === 0 && sampleL(m) < 0.01);
  console.log(`  - 앞 6개월에 손 샘플 · GC · 자동 샘플이 모두 없던 병입 달: ${noSample.join(', ') || '없음'} (판정한 병입 달 ${judged.length}개 — 월 결산 ${Number.isFinite(firstRep) ? firstRep : '—'}개월부터)`);
  const hidden = [...s.commerce.products, ...s.commerce.productArchive].filter((p) => (p as Product).qualityKnown) as Product[];
  if (hidden.length) {
    console.log('  - F5d 제품 — 지금 아는 품질 대 참 품질 (추정은 병입 때 값이 리뷰로 좁혀진 것):');
    for (const p of hidden.slice(-12)) { const k = p.qualityKnown!; console.log(`    - ${p.name} (${p.createdMonth}개월): 추정 ${k.est.toFixed(1)} ±${k.sigma.toFixed(1)} · 리뷰 ${k.reviews} · 참 ${p.quality.toFixed(1)} · 차이 ${(k.est - p.quality).toFixed(1)}`); }
  } else console.log('  - F5d 제품 없음(규칙 전 판이거나 F5d 뒤 병입이 없다)');
  // 9b 피니싱 — 옮긴 달 · 옮김 손실(원액 빼기 손실과 같은 종류) · 제품 표기 · 끝에 피니싱 중인 통
  const tr = turns.filter((x) => (x.kinds?.transferCask ?? 0) > 0).map((x) => `${x.month}(${x.kinds!.transferCask})`);
  console.log(`- 9b 피니싱(옮기기) ${sumKinds('transferCask')}번: ${tr.join(' · ') || '없음'}`);
  const finProds = [...s.commerce.products].filter((p) => p.finish);
  for (const p of finProds) { const mix = p.caskMonthsMix ?? p.caskMix ?? []; const f = mix.find((x) => x.typeId === p.finish); console.log(`  - 제품 ${p.name}: ${CASKS[p.finish!].nameKo} 피니시 · 개월 가중 몫 ${f ? (f.share * 100).toFixed(0) : '?'}% (숙성 ${p.oakMonths ?? '?'}개월 기준이면 약 ${f && p.oakMonths ? Math.round(f.share * p.oakMonths) : '?'}개월) · 품질 ${p.quality.toFixed(1)}`); }
  const finCasks = s.inventory.casks.filter((c) => c.contents?.caskHistory && c.contents.caskHistory.length > 1);
  for (const c of finCasks) { const h = c.contents!.caskHistory!; const last = h.at(-1)!; const closed = h.slice(0, -1).reduce((a, x) => a + x.months, 0); console.log(`  - 피니싱 중 ${c.id}: ${CASKS[last.typeId].nameKo} ${Math.max(0, c.contents!.oakMonths - closed)}개월째 · 활성도 ${c.activity.toFixed(2)} · 목재 ${c.contents!.oakMonths}개월`); }
  // 9c 승리 통 — 승리 제품의 통 종류 · 품질 · 승리 앞뒤 적격 후보 수(월 결산 flagshipCandidates)
  const win = s.progress.win;
  if (win) {
    const wp = [...s.commerce.products, ...s.commerce.productArchive].find((p) => p.id === win.productId) as Product | undefined;
    const cand = reps.filter((r) => r.month >= win.month - 12 && r.month <= win.month).map((r) => `${r.month}:${r.flagshipCandidates ?? '—'}`);
    console.log(`- 9c 승리 ${win.month}개월 · ${wp?.name ?? win.productId} · 참 품질 ${wp?.quality?.toFixed(1) ?? '?'} · 통 ${(wp?.caskMix ?? []).map((x) => `${CASKS[x.typeId].nameKo} ${(x.share * 100).toFixed(0)}%`).join(' · ') || '?'}${wp?.finish ? ` · ${CASKS[wp.finish].nameKo} 피니시` : ''}`);
    console.log(`  - 승리 앞 12개월 적격 후보 수: ${cand.join(' ') || '—'}`);
    console.log('  - 통별 활성도는 기록에 없다 — 12년 적격 통이 처음 생겨 자동 진행이 멈춘 달(#333)의 기록 내보내기가 있으면 그 세이브로 tanninOutlook을 다시 센다');
  } else console.log('- 9c 승리 없음');
  // 9e 핸드필 — 지정 · 판매 사건(cellar_door, 월 결산 기간) · 병·라벨 비용
  const cd = reps.flatMap((r) => (r.saleEvents ?? []).filter((e) => e.kind === 'cellar_door'));
  const hfCost = reps.reduce((a, r) => a + ((r.expenses as Record<string, number>)['핸드필 병·라벨'] ?? 0), 0);
  // 9d 생산 복구(N2 — prod-stage-t.md 「N2 생산 복구」 정의, ARCH 채택 2026-11-24): 줄인 달 C · 회복 달 R(현금 ≥ 고정비 × 6) · 복구 달 B(줄이기 전의 80%) · N2 = B − R
  {
    const kindOf = new Map(s.production.recipes.map((r) => [r.id, r.kind] as const));
    const wb = (r: MonthReport) => (r.production ?? []).filter((x) => { const k = kindOf.get(x.recipeId); return k === 'malt' || k === 'grain'; }).reduce((a, x) => a + x.batches, 0);
    const fixedOf = (r: MonthReport) => ['overhead', 'salaries', 'maintenance', 'storage', 'interest'].reduce((a, k) => a + ((r.expenses as Record<string, number>)[k] ?? 0), 0);
    const bs = reps.map(wb);
    let ci = -1; let pre = 0;
    for (let i = 6; i + 3 < reps.length; i++) { const p = Math.max(...bs.slice(i - 6, i)); if (p > 0 && bs.slice(i, i + 4).every((x) => x <= 0.6 * p)) { ci = i; pre = p; break; } }
    if (ci < 0) console.log(`- 9d 생산 복구(N2): 줄인 달 없음(월 결산 ${reps[0]?.month ?? '—'}개월부터)`);
    else {
      const C = reps[ci]!.month;
      const R = reps.find((r) => r.month >= C + 3 && r.cashEnd >= 6 * fixedOf(r))?.month;
      const B = R != null ? reps.find((r) => r.month > R && wb(r) >= 0.8 * pre)?.month : undefined;
      // C → 첫 복구(R과 무관 — 9차 64개월 기록: 현금 회복 전에 스스로 되돌린 판은 B − R가 1개월로 나와 모습을 담지 못했다, PM 2026-11-24 동의)
      const F = reps.find((r) => r.month > C && wb(r) >= 0.8 * pre)?.month;
      const lost = R != null ? reps.filter((r) => r.month >= R && (r.lostSalesBottles ?? 0) > 0).length : 0;
      const end = reps.at(-1)!.month;
      const n2 = R == null ? '회복 없음' : B != null ? `${B - R}개월` : `≥ ${end - R}개월(판 끝까지 안 되돌림)`;
      const cf = F != null ? `${F - C}개월(첫 복구 ${F}${R != null && F < R ? ' — 현금 회복 전' : ''})` : `≥ ${end - C}개월(판 끝까지 안 되돌림)`;
      console.log(`- 9d 생산 복구(N2): 줄인 달 C ${C}(줄이기 전 월 ${pre}배치) · 회복 달 R ${R ?? '—'}(C → R ${R != null ? R - C : '—'}개월) · 복구 달 B ${B ?? '—'} → **N2 = ${n2}** · **C → 첫 복구 = ${cf}** · R 뒤 판매 손실 달 ${lost}개`);
    }
  }
  console.log(`- 9e 핸드필 통 지정 ${sumKinds('setHandfillCask')}번 · 판매 ${n0(cd.reduce((a, e) => a + e.bottles, 0))}병 · 매출 ${man(cd.reduce((a, e) => a + e.bottles * e.unitPrice, 0))} · 병·라벨 ${man(hfCost)} (월 결산 ${reps.length}개월)`);
}

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
