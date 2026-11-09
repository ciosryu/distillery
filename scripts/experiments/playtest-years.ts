// 플레이테스트 기록을 해마다 나눠 본다 (mvp.md §7.8, 3차 MVP 플레이테스트 분석) — playlog-report.ts가 §7 기준을 판정한다면, 이 스크립트는 "무엇을 했고 돈이 어디로 갔나"를 연도별로 본다
// 실행: npx tsx scripts/experiments/playtest-years.ts <기록 파일.json>
// 게임 규칙·상태는 바꾸지 않는다. 월 보고서는 최근 120개월만 남으므로(step.ts) 10년이 넘는 판은 앞부분이 빠진다
import { readFileSync } from 'node:fs';
import { monthLabel, type MonthReport } from '../../src/sim';
import { activeMsAt, parsePlayFile } from '../../src/store/playlog';

const path = process.argv[2];
if (!path) { console.error('사용: npx tsx scripts/experiments/playtest-years.ts <기록 파일.json>'); process.exit(1); }
const parsed = parsePlayFile(readFileSync(path, 'utf8'));
if ('error' in parsed) { console.error(parsed.error); process.exit(1); }
const { save: s, playlog } = parsed;

const eok = (v: number) => `${(v / 1e8).toFixed(2)}억`;
const man = (v: number) => `${Math.round(v / 1e4).toLocaleString()}만`;
const reports: MonthReport[] = s.history.reports;
/** 판매 중 제품과 보관된(품절·단종) 제품을 한 모양으로 — 보관 항목에는 재고·숙성 표기가 없다 */
type AnyProduct = { id: string; name: string; category: string; createdMonth: number; quality: number; price: number; totalSold: number; stockBottles?: number; oakMonths?: number; ageYears?: number | null; archived?: boolean };
const allProducts: AnyProduct[] = [...s.commerce.products, ...s.commerce.productArchive.map((p) => ({ ...p, archived: true }))];
const productOf = new Map(allProducts.map((p) => [p.id, p]));
const recipeKind = new Map(s.production.recipes.map((r) => [r.id, r.kind]));
const isWhisky = (cat: string | undefined) => cat === 'whisky' || cat === 'grain_whisky' || cat === 'blended_whisky';

console.log(`# ${s.distilleryName} — ${s.scenario?.id ?? '샌드박스'} ${s.scenario?.tierId ?? ''} · ${s.regionId}${s.siteId ? `·${s.siteId}` : ''} · 관리비 월 ${man(s.scenario?.economy.overheadPerMonth ?? 0)} · ${s.month}개월(${monthLabel(s.startYear, s.month)}) · ${s.status}`);
console.log(`- 설비: ${s.production.equipment.map((e) => e.catalogId).join(', ')}`);
console.log(`- 지금 생산 지시: ${s.production.orders.map((o) => `${s.production.recipes.find((r) => r.id === o.recipeId)?.name ?? o.recipeId} ${o.batchesPerMonth}`).join(' · ') || '없음'} · 마케팅 예산 월 ${man(s.commerce.marketingBudget)}`);

// ── 해마다 ──
console.log('\n| 연차 | 제품 매출 (소주 · 위스키 · 몰트 스피릿 등) | 비지터 | 원액 현물·계약 | 생산비 | 급여 | 관리비 | 설비 유지 | 마케팅 | 대출 납부 | 병입비(행동) | 대출 실행 | 생산 LPA (몰트 · 소주) | 위스키 판매 병 | 연말 현금 | 연말 순자산 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const years = Math.ceil((reports.at(-1)!.month + 1) / 12);
for (let y = 0; y < years; y++) {
  const rs = reports.filter((r) => Math.floor(r.month / 12) === y);
  if (!rs.length) continue;
  const sum = (f: (r: MonthReport) => number) => rs.reduce((t, r) => t + f(r), 0);
  const salesBy = (pred: (cat: string | undefined) => boolean) => sum((r) => r.sales.filter((x) => pred(productOf.get(x.productId)?.category)).reduce((t, x) => t + x.revenue, 0));
  const soju = salesBy((c) => c === 'soju_distilled');
  const whisky = salesBy(isWhisky);
  const other = sum((r) => r.revenue) - soju - whisky;
  const visitor = sum((r) => r.tourismRevenue ?? 0);
  const exp = (k: string) => sum((r) => r.expenses[k] ?? 0);
  const loanPay = exp('interest') + exp('principal');
  const lpa = (kind: string) => sum((r) => r.production.filter((b) => recipeKind.get((b as { recipeId?: string }).recipeId ?? '') === kind).reduce((t, b) => t + b.lpa, 0));
  const whiskyBottles = sum((r) => r.sales.filter((x) => isWhisky(productOf.get(x.productId)?.category)).reduce((t, x) => t + x.bottles, 0));
  const last = rs.at(-1)!;
  console.log(`| ${y + 1}년 차 (${rs[0]!.month}~${last.month}월) | ${eok(soju + whisky + other)} (${eok(soju)} · ${eok(whisky)} · ${eok(other)}) | ${eok(visitor)} | ${eok(sum((r) => (r.spotBulkRevenue ?? 0) + r.bulkRevenue))} | ${eok(exp('production'))} | ${eok(exp('salaries'))} | ${eok(exp('overhead'))} | ${eok(exp('maintenance'))} | ${eok(exp('marketing'))} | ${eok(loanPay)} | ${eok(-sum((r) => r.offTurn?.bottling ?? 0))} | ${eok(sum((r) => Math.max(0, r.offTurn?.loan ?? 0)))} | ${Math.round(lpa('malt')).toLocaleString()} · ${Math.round(lpa('soju')).toLocaleString()} | ${whiskyBottles.toLocaleString()} | ${eok(last.cashEnd)} | ${last.netWorth != null ? eok(last.netWorth) : '—'} |`);
}

// ── 생산 지시가 바뀐 달 (월 보고서의 배치 수로 본다) ──
console.log('\n## 생산 배치가 바뀐 달');
let prev = '';
for (const r of reports) {
  const cur = s.production.recipes.map((rc) => `${rc.name} ${r.production.filter((b) => (b as { recipeId?: string }).recipeId === rc.id).reduce((t, b) => t + ((b as { batches?: number }).batches ?? 0), 0)}`).join(' · ');
  if (cur !== prev) console.log(`- ${r.month}개월째: ${cur}`);
  prev = cur;
}

// ── 마케팅 지출이 바뀐 달 ──
console.log('\n## 마케팅 지출이 바뀐 달');
let pm = -1;
for (const r of reports) { const m = r.expenses.marketing ?? 0; if (m !== pm) console.log(`- ${r.month}개월째: 월 ${man(m)}`); pm = m; }

// ── 턴 사이 행동의 큰 돈 (대출·원액 현물 판매·설비·투자) ──
console.log('\n## 턴 사이 큰 돈 (1,000만 이상)');
for (const r of reports) {
  const big = Object.entries(r.offTurn ?? {}).filter(([, v]) => Math.abs(v ?? 0) >= 10_000_000);
  if (big.length) console.log(`- ${r.month}개월째: ${big.map(([k, v]) => `${k} ${eok(v ?? 0)}`).join(' · ')} (월말 현금 ${eok(r.cashEnd)})`);
}

// ── 제품 수 (같은 이름이 여러 번 생겼나 — #186 재고 보충) ──
console.log('\n## 제품 (보관 포함)');
const byCat = new Map<string, typeof allProducts>();
for (const p of allProducts) byCat.set(p.category, [...(byCat.get(p.category) ?? []), p]);
for (const [cat, ps] of byCat) {
  const names = new Map<string, number>();
  for (const p of ps) names.set(p.name, (names.get(p.name) ?? 0) + 1);
  const dup = [...names].filter(([, n]) => n > 1);
  console.log(`- ${cat}: 제품 ${ps.length}개 · 이름 ${names.size}종${dup.length ? ` · 같은 이름 여러 개: ${dup.map(([n, k]) => `「${n}」×${k}`).join(', ')}` : ''} · 총 판매 ${ps.reduce((t, p) => t + (p.totalSold ?? 0), 0).toLocaleString()}병`);
  for (const p of ps) console.log(`  - 「${p.name}」 ${p.id} · 병입 ${p.createdMonth ?? '?'}개월째 · 품질 ${Math.round(p.quality ?? NaN)} · 출고가 ${(p.price ?? 0).toLocaleString()}원 · 판매 ${(p.totalSold ?? 0).toLocaleString()}병 · 재고 ${(p.stockBottles ?? 0).toLocaleString()}병${p.archived ? ' · 보관(품절·단종)' : ''}${p.oakMonths != null ? ` · 오크 ${p.oakMonths}개월` : ''}${p.ageYears != null ? ` · 표기 ${p.ageYears}년` : ''}`);
}

// ── 숙성 재고 ──
const filled = s.inventory.casks.filter((c) => c.contents);
console.log(`\n## 지금 숙성고: 통 ${s.inventory.casks.length}개(원액 든 통 ${filled.length}) · 탱크 로트 ${s.inventory.lots.length}개 ${Math.round(s.inventory.lots.reduce((t, l) => t + l.volumeL, 0)).toLocaleString()}L`);

// ── 시간 ──
if (playlog) {
  const yrs = [12, 24, 36, 48, 60, 72].map((m) => `${m}개월 ${((activeMsAt(playlog, m) ?? NaN) / 60_000).toFixed(0)}분`);
  console.log(`\n## 누적 플레이 시간: ${yrs.join(' · ')} · 전체 ${(playlog.activeMs / 60_000).toFixed(0)}분 · 행동 ${playlog.actions}번`);
}

