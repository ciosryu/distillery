// 플레이테스트 기록의 MGT 몫 표 (7차 중간 기록에서 시작, docs/playtest/7/mgt/README.md) — 읽기 전용, 게임 규칙 함수를 그대로 부른다.
//   npx tsx scripts/experiments/playtest-mgt.ts <기록 파일.json> [끝 개월=26]
// ① 런웨이 경고 재구성: 매달 결산 뒤(= 다음 턴 시작) 화면 `cashAlert`가 보던 값 — 최근 3개월 `recurringCash` 평균과 월말 현금으로 같은 식을 다시 계산한다
// ② 연차 요약: 현금·순자산(처분 예상액 #317)·지출·매출·생산 LPA
// ③ 급여: 월 급여가 바뀐 달 · 레벨업 달 · 시작 대비 인상분 중 정기 임금 조정(#330) 몫(`salaryRaiseSinceStart`)
// ④ F5d 교차 확인(#348 뒤 사람 판 — PM 배정 2026-11-24): 샘플 · 가격 행동 횟수(플레이 기록 `kinds`) · 가격을 바꾼 달의 누적 리뷰 수(σ 대신) · 승리 제품의 추정 대 판정 품질
// ⑤ 대출 · 재무 흐름: 연차별 이자 · 원금 · 재무 현금 · 대출 행동, 지금 보유 대출
// 한계: 월 결산은 최근 120개월만 남는다(그 앞은 연 요약뿐) — ④의 가격 · 리뷰 재구성도 그 창 안만. 턴 중 행동(대출 실행 등)은 다음 달 결산에 잡힌다.
//       σ의 달별 기록은 세이브에 없다 — 가격을 바꾼 달의 σ 대신 「그때까지 그 제품에 달린 리뷰 수」를 쓴다(보충이 추정을 섞는 몫은 못 본다)
import { readFileSync } from 'node:fs';
import { recurringCash, RUNWAY_WARN_MONTHS } from '../../src/ui/alerts';
import { salaryRaiseSinceStart } from '../../src/sim/hr';
import type { GameState, MonthReport, Product } from '../../src/sim';
import type { Playlog } from '../../src/store/playlog';

const file = process.argv[2];
if (!file) throw new Error('기록 파일 경로가 필요하다');
const until = Number(process.argv[3] ?? 26);
const raw = JSON.parse(readFileSync(file, 'utf8')) as { save: GameState; playlog?: Playlog | null; build?: string };
const s = raw.save;
const R: MonthReport[] = s.history.reports;
const eok = (v: number) => (v / 1e8).toFixed(2);
const man = (v: number) => Math.round(v / 1e4).toLocaleString('ko-KR');

console.log(`# ${file.split('/').at(-1)} — ${s.month}개월 · 결산 ${R[0]?.month ?? '-'}~${R.at(-1)?.month ?? '-'}개월\n`);

console.log(`## ① 런웨이 경고 재구성 (경고 기준 ${RUNWAY_WARN_MONTHS}개월 이하, 결산 뒤 다음 턴 화면)\n`);
console.log('| 결산 달 → 보인 턴 | 월말 현금(만) | 최근 3개월 자체 흐름 평균(만) | 런웨이(개월) | 배너 |');
console.log('|---|---|---|---|---|');
R.forEach((r, i) => {
  if (r.month > until) return;
  const recent = R.slice(Math.max(0, i - 2), i + 1);
  const avg = recent.reduce((t, x) => t + recurringCash(x), 0) / recent.length;
  const months = avg < 0 ? Math.floor(Math.max(0, r.cashEnd) / -avg) : null;
  const banner = r.cashEnd < 0 ? '🚨 현금 부족' : months != null && months <= RUNWAY_WARN_MONTHS ? '⚠ 노랑' : '';
  console.log(`| ${r.month} → ${r.month + 1} | ${man(r.cashEnd)} | ${man(avg)} | ${months ?? '흑자'} | ${banner} |`);
});

console.log('\n## ② 연차 요약 (history.years)\n');
console.log('| 연차 | 연말 현금 | 연말 순자산 | 지출 | 제품 매출 | 생산 LPA |');
console.log('|---|---|---|---|---|---|');
s.history.years.forEach((y, i) => console.log(`| ${i + 1}년 차 (${y.year}) | ${eok(y.cashEnd)} | ${y.netWorthEnd != null ? eok(y.netWorthEnd) : '—'} | ${eok(y.expenses)} | ${eok(y.revenue)} | ${Math.round(y.lpaProduced).toLocaleString('ko-KR')} |`));
const nw = R.filter((r) => r.netWorth != null);
const low = nw.reduce((a, b) => (b.netWorth! < a.netWorth! ? b : a), nw[0]!);
if (low) console.log(`\n월말 순자산 최저: ${low.month}개월 ${eok(low.netWorth!)}억 · 음수인 달 ${nw.filter((r) => r.netWorth! < 0).map((r) => r.month).join('·') || '없음'}`);

console.log('\n## ③ 급여\n');
let prev: number | undefined;
for (const r of R) {
  const v = r.expenses.salaries ?? 0;
  const why = (r.notes ?? []).filter((n) => /정기 임금 조정|레벨 \d+ 달성/.test(n)).join(' · ');
  if (v !== prev || why) console.log(`- ${r.month}개월: 월 급여 ${man(v)}만${why ? ` — ${why}` : ''}`);
  prev = v;
}
const raise = salaryRaiseSinceStart(s);
if (raise) {
  const total = raise.now - raise.start;
  console.log(`\n지금 월 급여 ${man(raise.now)}만 · 시작 ${man(raise.start)}만 · 인상 ${man(total)}만(${((total / raise.start) * 100).toFixed(1)}%) = 정기 임금 조정 ${man(raise.annual)}만 + 레벨업 ${man(total - raise.annual)}만`);
}
for (const x of s.hr.staff) console.log(`- ${x.name}(${x.role}) 레벨 ${x.level} · 월 ${man(x.salary)}만 · 입사 ${x.hiredMonth}개월`);

// ④ F5d 교차 확인
console.log('\n## ④ F5d 교차 확인 (샘플 · 가격 · 승리 품질)\n');
const pl = raw.playlog ?? null;
const yearOf = (month: number) => Math.floor(Math.max(0, month - 1) / 12) + 1; // 행동은 그 턴(= 다음 달로 넘어오기 전 달)에 한 것
const KINDS = ['sampleCask', 'setAutoSample', 'bottle', 'setPrice', 'setAutoPrice', 'setPricePolicy'] as const;
const autoCfg = s.inventory.autoSample;
console.log(`- 빌드 ${raw.build ?? '—'} · 자동 샘플 설정(지금): ${!autoCfg ? '켬(기본값)' : autoCfg.off ? '끔' : `켬 ${JSON.stringify(autoCfg)}`}`);
if (!pl) console.log('- 플레이 기록(playlog) 없음 — 행동 횟수는 볼 수 없다');
else {
  const byYear = new Map<number, Record<string, number>>();
  for (const turn of pl.turns) for (const [k, v] of Object.entries(turn.kinds ?? {})) {
    const y = yearOf(turn.month); const row = byYear.get(y) ?? {}; row[k] = (row[k] ?? 0) + v; byYear.set(y, row);
  }
  const autoCost = new Map<number, number>();
  for (const r of R) autoCost.set(yearOf(r.month + 1), (autoCost.get(yearOf(r.month + 1)) ?? 0) + (r.expenses['자동 샘플'] ?? 0));
  console.log(`\n| 연차 | ${KINDS.join(' | ')} | 자동 샘플 비용(만, 결산 창 안) |`);
  console.log(`|---|${KINDS.map(() => '---').join('|')}|---|`);
  for (const y of [...new Set([...byYear.keys(), ...autoCost.keys()])].sort((a, b) => a - b)) {
    const row = byYear.get(y) ?? {};
    console.log(`| ${y}년 차 | ${KINDS.map((k) => row[k] ?? 0).join(' | ')} | ${autoCost.has(y) ? man(autoCost.get(y)!) : '—'} |`);
  }
  const tot = (k: string) => pl.turns.reduce((n, x) => n + (x.kinds?.[k] ?? 0), 0);
  console.log(`\n합계: ${KINDS.map((k) => `${k} ${tot(k)}`).join(' · ')} (행동 종류 기록이 있는 턴 ${pl.turns.filter((x) => x.kinds).length}/${pl.turns.length})`);
}

// 가격을 바꾼 달 — 국내 소매 진열(saleEvents domestic · channel retail) 단가가 앞 판매 달과 다르면 바뀐 달. 그달 priceLog에 그 제품이 있으면 자동 가격, 없으면 수동 · 기타
// 턴 기록(month = 넘어온 달)의 kinds는 그 앞 달(= 결산 r.month = turn.month − 1)에 한 행동이다
const manualMonths = new Set((pl?.turns ?? []).filter((x) => (x.kinds?.setPrice ?? 0) > 0).map((x) => x.month));
const reviewsBy = new Map<string, { month: number; n: number }[]>();
for (const r of R) for (const rv of r.reviews ?? []) reviewsBy.set(rv.productId, [...(reviewsBy.get(rv.productId) ?? []), { month: r.month, n: rv.scores.length }]);
const reviewsBefore = (id: string, month: number) => (reviewsBy.get(id) ?? []).filter((x) => x.month < month).reduce((n, x) => n + x.n, 0);
type Change = { id: string; month: number; from: number; to: number; auto: boolean; setPriceTurn: boolean; reviews: number };
const changes: Change[] = [];
const lastPrice = new Map<string, number>();
for (const r of R) {
  const seen = new Map<string, number>();
  for (const e of r.saleEvents ?? []) if (e.kind === 'domestic' && (e.channel ?? 'retail') === 'retail' && !seen.has(e.productId)) seen.set(e.productId, e.unitPrice);
  for (const [id, price] of seen) {
    const prev = lastPrice.get(id);
    if (prev != null && prev !== price) changes.push({ id, month: r.month, from: prev, to: price, auto: !!r.priceLog?.some((x) => x.productId === id), setPriceTurn: manualMonths.has(r.month + 1), reviews: reviewsBefore(id, r.month) });
    lastPrice.set(id, price);
  }
}
const allProducts: Pick<Product, 'id' | 'name' | 'quality' | 'qualityKnown'>[] = [...s.commerce.products, ...((s.commerce.productArchive ?? []) as Pick<Product, 'id' | 'name' | 'quality' | 'qualityKnown'>[])];
const nameOf = (id: string) => allProducts.find((x) => x.id === id)?.name ?? id;
const manual = changes.filter((c) => !c.auto);
const bucket = (n: number) => (n === 0 ? '0' : n <= 2 ? '1~2' : n <= 9 ? '3~9' : '10+');
const counts = (cs: Change[]) => ['0', '1~2', '3~9', '10+'].map((b) => `${b}: ${cs.filter((c) => bucket(c.reviews) === b).length}`).join(' · ');
console.log(`\n### 가격을 바꾼 달 (국내 소매, 결산 창 안) — 그때까지 그 제품의 리뷰 수 (σ 대신)\n`);
console.log(`- 자동 가격으로 바뀐 달 ${changes.length - manual.length}번 · 수동 · 기타 ${manual.length}번(그 턴에 setPrice가 있던 것 ${manual.filter((c) => c.setPriceTurn).length}번)`);
console.log(`- 수동 · 기타 변경 때 누적 리뷰 수 — ${counts(manual)}`);
console.log(`- 자동 변경 때 누적 리뷰 수 — ${counts(changes.filter((c) => c.auto))}`);
const byProd = new Map<string, Change[]>();
for (const c of manual) byProd.set(c.id, [...(byProd.get(c.id) ?? []), c]);
if (byProd.size) {
  console.log('\n| 제품 | 수동 · 기타 변경 (달: 전 → 후 원, 그때 리뷰 수) | 지금 추정 ± σ (리뷰) | 참 품질 | 추정 − 참 |');
  console.log('|---|---|---|---|---|');
  for (const [id, cs] of [...byProd].sort((a, b) => b[1].length - a[1].length).slice(0, 12)) {
    const p = allProducts.find((x) => x.id === id); const k = p?.qualityKnown;
    console.log(`| ${nameOf(id)} | ${cs.slice(0, 6).map((c) => `${c.month}: ${c.from.toLocaleString('ko-KR')} → ${c.to.toLocaleString('ko-KR')} (r${c.reviews})`).join(' · ')}${cs.length > 6 ? ` 외 ${cs.length - 6}` : ''} | ${k ? `${k.est} ± ${k.sigma} (${k.reviews})` : '공개(추정 없음)'} | ${p?.quality ?? '—'} | ${k && p ? (k.est - p.quality).toFixed(1) : '—'} |`);
  }
}

// 승리 제품 — 판정 품질(참값, 결과 화면이 처음 보여 주는 값) 대 판 중 마지막 추정
const win = s.progress.win; const vd = s.progress.verdict;
console.log('\n### 승리 제품 — 판 중 추정 대 결과 화면 품질\n');
if (!win || !vd) console.log('- 승리 · 판정 없음');
else {
  const p = allProducts.find((x) => x.id === win.productId); const k = p?.qualityKnown;
  console.log(`- 승리 ${win.month}개월 「${p?.name ?? win.productId}」(${win.channel ?? win.kind}) · 판정 ${vd.month}개월 등급 ${vd.grade ?? '—'} · 결과 화면 12년 품질 ${vd.flagshipQuality ?? '—'}`);
  console.log(`- 그 제품의 지금 추정 ${k ? `${k.est} ± ${k.sigma} (리뷰 ${k.reviews}, ${k.month}개월에 갱신)` : '없음(공개 — F5d 전 제품)'} · 제품 참 품질 ${p?.quality ?? '—'}${k && vd.flagshipQuality != null ? ` · 추정 − 판정 품질 ${(k.est - vd.flagshipQuality).toFixed(1)}` : ''}`);
  if (k && k.month > vd.month) console.log(`  - 주의: 추정은 판정 뒤 ${k.month - vd.month}개월 동안 리뷰 · 보충으로 바뀌었을 수 있다(판정 달의 추정은 세이브에 없다). 판정 달 근처 기록이 있으면 그것으로 다시 본다`);
}

// ⑤ 대출 · 재무 흐름
console.log('\n## ⑤ 대출 · 재무 흐름 (결산 창 안)\n');
const fin = new Map<number, { interest: number; principal: number; financing: number; negMonths: number }>();
for (const r of R) {
  const y = yearOf(r.month + 1); const f = fin.get(y) ?? { interest: 0, principal: 0, financing: 0, negMonths: 0 };
  f.interest += r.expenses.interest ?? 0; f.principal += r.expenses.principal ?? 0; f.financing += r.financingCash ?? 0; if (r.cashEnd < 0) f.negMonths++;
  fin.set(y, f);
}
const loanActs = new Map<number, { take: number; repay: number }>();
for (const turn of pl?.turns ?? []) { const y = yearOf(turn.month); const a = loanActs.get(y) ?? { take: 0, repay: 0 }; a.take += turn.kinds?.takeLoan ?? 0; a.repay += turn.kinds?.repayLoan ?? 0; loanActs.set(y, a); }
console.log('| 연차 | 이자(만) | 정기 원금(만) | 재무 현금 합(만) | 월말 현금 음수 달 | 대출 실행 · 조기 상환 행동 |');
console.log('|---|---|---|---|---|---|');
for (const [y, f] of [...fin].sort((a, b) => a[0] - b[0])) { const a = loanActs.get(y); console.log(`| ${y}년 차 | ${man(f.interest)} | ${man(f.principal)} | ${man(f.financing)} | ${f.negMonths} | ${a ? `${a.take} · ${a.repay}` : '—'} |`); }
console.log(`\n지금 보유 대출: ${s.finance.loans.length ? s.finance.loans.map((l) => `${l.name} 원금 ${eok(l.principal)}억 · 잔액 ${eok(l.balance)}억 · 연 ${(l.annualRate * 100).toFixed(1)}% · ${l.startMonth}개월 실행`).join(' / ') : '없음'}`);
