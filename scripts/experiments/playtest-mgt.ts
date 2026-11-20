// 플레이테스트 기록의 MGT 몫 표 (7차 중간 기록에서 시작, docs/playtest/7/mgt/README.md) — 읽기 전용, 게임 규칙 함수를 그대로 부른다.
//   npx tsx scripts/experiments/playtest-mgt.ts <기록 파일.json> [끝 개월=26]
// ① 런웨이 경고 재구성: 매달 결산 뒤(= 다음 턴 시작) 화면 `cashAlert`가 보던 값 — 최근 3개월 `recurringCash` 평균과 월말 현금으로 같은 식을 다시 계산한다
// ② 연차 요약: 현금·순자산(처분 예상액 #317)·지출·매출·생산 LPA
// ③ 급여: 월 급여가 바뀐 달 · 레벨업 달 · 시작 대비 인상분 중 정기 임금 조정(#330) 몫(`salaryRaiseSinceStart`)
// 한계: 월 결산은 최근 120개월만 남는다(그 앞은 연 요약뿐). 턴 중 행동(대출 실행 등)은 다음 달 결산에 잡힌다
import { readFileSync } from 'node:fs';
import { recurringCash, RUNWAY_WARN_MONTHS } from '../../src/ui/alerts';
import { salaryRaiseSinceStart } from '../../src/sim/hr';
import type { GameState, MonthReport } from '../../src/sim';

const file = process.argv[2];
if (!file) throw new Error('기록 파일 경로가 필요하다');
const until = Number(process.argv[3] ?? 26);
const raw = JSON.parse(readFileSync(file, 'utf8')) as { save: GameState };
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
