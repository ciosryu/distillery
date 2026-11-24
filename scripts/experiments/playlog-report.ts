// 플레이테스트 기록 읽기 (mvp.md §7.2) — 오너가 "기록 내보내기"로 받은 파일을 mvp.md §7 기준·§7.1 "볼 것"으로 요약한다
// 실행: npx tsx scripts/experiments/playlog-report.ts <기록 파일.json>
// 같은 판을 화면에서 다시 보려면 게임의 "불러오기"로 같은 파일을 연다
import { readFileSync } from 'node:fs';
import { monthLabel, type MonthReport } from '../../src/sim';
import { LOAN_OFFERS } from '../../src/sim/content/catalog';
import { activeMsAt, parsePlayFile, type Playlog } from '../../src/store/playlog';
import { EVENT } from '../../src/sim/content/events';
import { stagesOf } from '../../src/sim/scenario';
import { MORALE, moraleOf, TRAIT_INFO } from '../../src/sim/hr';
import { difficultyOf, rulesVersionOf } from '../../src/sim/rules';
import { reserveCaskIds } from '../../src/sim/tags';
import { finishLabel, finishOf } from '../../src/sim/maturation';
import { stalestCasks } from '../../src/sim/blendTable';
import { tankLotWaitMonths } from '../../src/sim/economics';

/** 이름을 바꾼 이벤트의 옛 제목 → id — 옛 기록(6차 판 등)의 선택을 표에서 찾는다 */
const OLD_EVENT_TITLES: Record<string, string> = { 'K-주류 수출 지원 사업 공모': 'export_support' }; // [결정 #335]

const path = process.argv[2];
if (!path) { console.error('사용: npx tsx scripts/experiments/playlog-report.ts <기록 파일.json>'); process.exit(1); }
const parsed = parsePlayFile(readFileSync(path, 'utf8'));
if ('error' in parsed) { console.error(parsed.error); process.exit(1); }
const { save: s, playlog } = parsed;

const min = (ms: number | null) => (ms == null ? '—' : ms < 600_000 ? `${(ms / 60_000).toFixed(1)}분` : `${Math.round(ms / 60_000)}분`);
const won = (v: number) => `${(v / 1e8).toFixed(2)}억`;
const ms = (_m: unknown, id: string) => (s.progress.milestones.find((x) => x.id === id) as { month: number } | undefined)?.month ?? null;
const reports: MonthReport[] = s.history.reports;

console.log(`# 플레이테스트 기록 — ${s.distilleryName}`);
console.log(`- 시나리오 ${s.scenario?.id ?? '샌드박스'} · ${s.scenario?.tierId ?? ''} · 진행 ${s.month}개월(${monthLabel(s.startYear, s.month)}) · 상태 ${s.status}${s.progress.verdict ? ` · 판정 ${s.progress.verdict.result} ${s.progress.verdict.grade ?? ''}` : ''}`);

// ── mvp.md §7 기준 ──
console.log('\n## mvp.md §7 기준');
if (!playlog) console.log('- 플레이 기록 없음(세이브만) — 시간 기준은 잴 수 없다');
else {
  const t24 = activeMsAt(playlog, 24);
  const whiskySale = ms(s.progress.milestones, 'first_whisky_sale');
  const tWhisky = whiskySale != null ? activeMsAt(playlog, whiskySale + 1) : null;
  console.log(`- 총 플레이 시간 ${min(playlog.activeMs)} · 행동 ${playlog.actions}번 · 기록된 턴 ${playlog.turns.length}개`);
  // 빌드 (#227) — 판 도중 페이지를 다시 열면 빌드가 바뀐다. 옛 기록에는 없다
  console.log(`- 빌드: ${playlog.builds?.length ? playlog.builds.map((b) => `${b.build}(${b.month}개월째~)`).join(' → ') : '기록 없음(이 기능 전의 판)'}${playlog.builds && playlog.builds.length > 1 ? ' — **판 도중 빌드가 바뀌었다**' : ''}${s.scenario?.startBuild ? ` · 판 시작 빌드(세이브) ${s.scenario.startBuild}` : ''}${playlog.buildAck ? ` · 오너가 확인한 빌드 ${playlog.buildAck}` : ''}`);
  console.log(`- 첫 24턴 ≤ 90분: ${t24 == null ? '아직 24턴 전' : `${min(t24)} ${t24 <= 90 * 60_000 ? '✅' : '❌'}`}`);
  console.log(`- 2시간 안에 첫 위스키 판매: ${whiskySale == null ? '아직 없음' : `${whiskySale}개월째, 그때까지 ${min(tWhisky)} ${tWhisky != null && tWhisky <= 120 * 60_000 ? '✅' : '❌'}`}`);
  slowTurns(playlog);
}

// ── §7.1 볼 것 ──
console.log('\n## mvp.md §7.1 볼 것');
const lowest = reports.reduce<MonthReport | null>((m, r) => (!m || r.cashEnd < m.cashEnd ? r : m), null);
const borrowed = reports.reduce((t, r) => t + Math.max(0, r.offTurn?.loan ?? 0), 0);
console.log(`- 현금: 최저 ${lowest ? `${won(lowest.cashEnd)} (${lowest.month}개월째)` : '—'} · 현금 위기 ${ms(s.progress.milestones, 'first_cash_crisis') ?? '없음'} · 기록 기간 대출 실행 ${won(borrowed)} · 지금 대출 ${s.finance.loans.map((l) => `${l.name} ${won(l.balance)}`).join(', ') || '없음'}`);
const samples = s.inventory.casks.reduce((t, c) => t + (c.samples ?? 0), 0);
const sampled = s.inventory.casks.filter((c) => c.sampleLog?.length).length;
const filled = s.inventory.casks.filter((c) => c.contents).length;
console.log(`- 샘플: 지금 숙성 중 ${filled}통 중 기록 있는 통 ${sampled} · 지금 통들에 뜬 샘플 합계 ${samples}회`);
const stock = new Map<string, number>();
for (const p of s.commerce.products) stock.set(p.category, (stock.get(p.category) ?? 0) + p.stockBottles);
const recent = reports.slice(-3);
for (const [cat, n] of stock) {
  const sold = recent.reduce((t, r) => t + r.sales.filter((x) => s.commerce.products.find((p) => p.id === x.productId)?.category === cat).reduce((a, x) => a + x.bottles, 0), 0) / Math.max(1, recent.length);
  if (n > 0) console.log(`- 재고 ${cat}: ${n.toLocaleString()}병 = 최근 판매로 ${sold > 0 ? `${(n / sold).toFixed(1)}개월치` : '안 팔림'}`);
}
console.log(`- 옹기: ${s.inventory.casks.filter((c) => c.typeId === 'onggi_jar').length}개 보유 · 마일스톤 ${s.progress.milestones.map((m) => `${m.id}@${m.month}`).join(' ')}`);

bankScreeningCheck();
hrCheck();
v16Observe();
f5dFinishObserve();

/**
 * 은행 심사(#65, 닫힘) 다시 열 조건 — 결정 #192 PR(#125) 본문의 ①②③. 게임은 바꾸지 않고 기록만 센다
 * ③ "심사가 있었다면 거절됐을 대출": #65 초안 규칙(AND) — 창업 24개월 뒤, 최근 6개월 영업현금 합 < 0 이고 현금 < 월 고정비 × 3. 급전·재고 담보는 심사 밖
 * 근사: 대출은 그달 턴 사이에 받으므로 판단 시점 = 직전 결산 직후. 현금 = 직전 달 월말 현금, 월 고정비 = 직전 달 결산의 고정 지출(급여·관리비·난방·마케팅·유지비·보관비·이자·원금·보험료).
 * 상품은 지금 남은 대출의 실행 달로 맞춘다 — 다 갚아 사라진 대출은 상품을 알 수 없다(심사 대상으로 셈)
 */
function bankScreeningCheck(): void {
  const SCREEN = { startupMonths: 24, lookback: 6, cashBufferMonths: 3, reopenBorrowed: 1_000_000_000 } as const;
  const FIXED = ['salaries', 'overhead', 'heating', 'marketing', 'maintenance', 'storage', 'interest', 'principal', 'insurance'];
  const exempt = new Set(LOAN_OFFERS.filter((o) => o.emergency || o.collateral === 'inventory').map((o) => o.id));
  const byMonth = new Map(reports.map((r) => [r.month, r]));
  const rows: { month: number; amount: number; what: string; screened: boolean; deficit: number | null; cash: number | null; fixed: number | null; refused: boolean; why: string }[] = [];
  for (const r of reports) {
    const total = Math.max(0, r.offTurn?.loan ?? 0);
    if (!total) continue;
    const here = s.finance.loans.filter((l) => l.startMonth === r.month);
    const parts = here.map((l) => ({ amount: l.principal, what: l.name, screened: !exempt.has(l.offerId) }));
    const rest = total - parts.reduce((t, x) => t + x.amount, 0);
    if (rest > 0) parts.push({ amount: rest, what: '상품 미상(이미 다 갚음)', screened: true });
    const prev = byMonth.get(r.month - 1);
    const window = reports.filter((x) => x.month >= r.month - SCREEN.lookback && x.month < r.month);
    const deficit = window.length ? window.reduce((t, x) => t + (x.operatingCash ?? x.netCash), 0) : null;
    const cash = prev?.cashEnd ?? null;
    const fixed = prev ? FIXED.reduce((t, k) => t + (prev.expenses[k] ?? 0), 0) : null;
    for (const x of parts) {
      let refused = false; let why: string;
      if (!x.screened) why = '심사 밖(급전·재고 담보)';
      else if (r.month < SCREEN.startupMonths) why = `창업 ${SCREEN.startupMonths}개월 안 — 사업 계획으로 통과`;
      else if (deficit == null || cash == null || fixed == null) why = '직전 기록 없음';
      else {
        const loss = deficit < 0; const short = cash < fixed * SCREEN.cashBufferMonths;
        refused = loss && short;
        why = `영업현금 ${SCREEN.lookback}개월 ${won(deficit)}(${loss ? '적자' : '흑자'}) · 현금 ${won(cash)} vs 고정비×${SCREEN.cashBufferMonths} ${won(fixed * SCREEN.cashBufferMonths)}(${short ? '부족' : '충분'})`;
      }
      rows.push({ month: r.month, ...x, deficit, cash, fixed, refused, why });
    }
  }
  // 월 결산은 최근 REPORTS_KEPT(120)개월만 남는다(step.ts) — 그 전에 받은 대출: 아직 남은 것은 실행 달로 세고, 다 갚아 사라진 것은 셀 수 없다
  const first = reports[0]?.month ?? 0;
  for (const l of s.finance.loans.filter((x) => x.startMonth < first)) {
    const screened = !exempt.has(l.offerId);
    rows.unshift({ month: l.startMonth, amount: l.principal, what: `${l.name} (월 결산 기록 밖)`, screened, deficit: null, cash: null, fixed: null, refused: false,
      why: !screened ? '심사 밖(급전·재고 담보)' : l.startMonth < SCREEN.startupMonths ? `창업 ${SCREEN.startupMonths}개월 안 — 사업 계획으로 통과` : '기록 밖 — 판정 불가' });
  }
  const firstLoan = ms(s.progress.milestones, 'first_loan');
  const missed = first > 0 && firstLoan != null && firstLoan < first && !rows.some((x) => x.month === firstLoan);
  const borrowed = rows.reduce((t, x) => t + x.amount, 0);
  const refusedAmt = rows.filter((x) => x.refused).reduce((t, x) => t + x.amount, 0);
  const survived = s.status !== 'bankrupt' && (s.progress.verdict != null || s.month >= 180);
  console.log('\n## 은행 심사(#65) 다시 열 조건 — 기록으로 센 것 (게임 변경 없음)');
  for (const x of rows) console.log(`- ${x.month}개월째(${monthLabel(s.startYear, x.month)}) ${x.what} ${won(x.amount)} → ${x.refused ? '**거절됐을 것**' : '통과'} — ${x.why}`);
  if (!rows.length) console.log('- 기록 기간에 받은 대출 없음');
  if (missed) console.log(`- ⚠ 월 결산이 ${first}개월째부터만 남아 있다(최근 120개월). 첫 대출은 ${firstLoan}개월째인데, 그 대출은 이미 다 갚아 기록에 없다 → 아래 ②③은 **하한**이다. 대출 상품·금액은 결산의 이자·원금 흐름으로 따로 추정한다`);
  console.log(`- ① 파산 없이 목표 판정까지: ${survived ? '✅' : `❌ (${s.status === 'bankrupt' ? `${s.month}개월째 파산` : `${s.month}개월째 진행 중`})`}`);
  const lower = missed ? ' — 하한(기록 밖 대출 미포함)' : '';
  console.log(`- ② 누적 대출 ≥ ${won(SCREEN.reopenBorrowed)}: ${borrowed >= SCREEN.reopenBorrowed ? '✅' : missed ? '❓' : '❌'} (${won(borrowed)}${lower})`);
  console.log(`- ③ 심사에 걸렸을 대출 ≥ 절반: ${borrowed > 0 && refusedAmt * 2 >= borrowed ? '✅' : missed ? '❓' : '❌'} (${won(refusedAmt)} / ${won(borrowed)}${lower})`);
  const met = survived && borrowed >= SCREEN.reopenBorrowed && borrowed > 0 && refusedAmt * 2 >= borrowed;
  console.log(`- 다시 열 조건(①②③ 모두): ${met ? '충족 — #65 재검토' : !survived ? '불충족 — 은행 심사 보류 유지' : missed ? '기록만으로는 판정 불가(②③ 하한) — 기록 밖 대출을 추정해 판단' : '불충족 — 은행 심사 보류 유지'}`);
}

/**
 * 직원 관리(HR) — MVP 11년 차 단계(#232)·사기·연봉 협상(#225)·해고 확인(#246)을 사람이 어떻게 썼나. 게임 변경 없음.
 * 플레이 기록은 행동 종류를 남기지 않는다 → 채용·해고는 직원 목록(입사 달)·리포트 메모로, 연봉 협상·스카우트는 이벤트 기록(최근 60건)으로 센다.
 * 고르지 않으면 다음 달 기본값이 적용되는데, 기록에는 같은 글로 남는다 → 기본값과 같은 선택은 "직접 골랐는지 알 수 없음"
 */
function hrCheck(): void {
  console.log('\n## 직원 관리 (#222·#225·#232·#246) — 기록으로 센 것 (게임 변경 없음)');
  const stage = stagesOf(s).find((st) => st.unlock.includes('system:hr')); // F5a: 규칙 묶음별 단계
  const openMonth = !s.scenario ? 0 : stage && s.scenario.stagesDone?.includes(stage.id) ? stage.month : null;
  if (openMonth == null) { console.log(`- HR이 아직 열리지 않았다${stage ? ` (${stage.month}개월째에 열림)` : ''}`); return; }
  const man = (v: number) => `${Math.round(v / 10_000).toLocaleString()}만`;
  console.log(`- HR 열림: ${openMonth}개월째 · 그 뒤 ${s.month - openMonth}개월 플레이`);
  const hired = s.hr.staff.filter((x) => x.hiredMonth >= openMonth && x.hiredMonth > 0);
  const notesAfter = reports.filter((r) => r.month >= openMonth).flatMap((r) => r.notes.map((n) => ({ month: r.month, n })));
  const left = notesAfter.filter((x) => /퇴사|이직|은퇴/.test(x.n) && !/위험/.test(x.n));
  console.log(`- 직원 ${s.hr.staff.length}명: ${s.hr.staff.map((x) => `${x.name}(${x.role} Lv.${x.level}, 월 ${man(x.salary)}, 사기 ${Math.round(moraleOf(x))}${x.traits?.length ? `, ${x.traits.map((k) => TRAIT_INFO[k].nameKo).join('·')}` : ''}${x.hiredMonth > 0 ? `, ${x.hiredMonth}개월째 입사` : ', 창업 멤버'})`).join(' · ')}`);
  console.log(`- 열린 뒤 채용 ${hired.length}명 · 떠난 직원(메모) ${left.length}건${left.length ? ` — ${left.map((x) => `${x.month}: ${x.n.slice(0, 40)}`).join(' / ')}` : ''} · 남은 채용 후보 ${s.hr.candidates.length}명`);
  const marks = s.world.modifiers.filter((m) => m.key.startsWith('training:') || m.key.startsWith('headhunt:'));
  console.log(`- 교육·헤드헌팅: 행동 종류가 기록되지 않아 셀 수 없다 — 지금 남은 표식 ${marks.length}개(교육 표식은 12개월, 헤드헌팅은 1개월 남는다 — 0개면 최근 12개월 교육은 없었다)${marks.length ? ` (${marks.map((m) => m.key).join(', ')})` : ''}`);
  const pay = (m: number) => reports.find((r) => r.month === m)?.expenses.salaries;
  const p0 = pay(openMonth); const p1 = reports.at(-1)?.expenses.salaries;
  if (p0 != null && p1 != null) console.log(`- 월 급여 합계: ${openMonth}개월째 ${man(p0)} → ${reports.at(-1)!.month}개월째 ${man(p1)} (${p0 ? `${p1 >= p0 ? '+' : ''}${(((p1 - p0) / p0) * 100).toFixed(0)}%` : '—'})`);
  const log = s.events.log;
  const capped = log.length >= 60 && log[0]!.month > openMonth;
  const choice = (id: string) => log.filter((e) => e.month >= openMonth && e.title.startsWith(`${EVENT[id]?.title} → `)).map((e) => {
    const label = e.title.split(' → ')[1]!;
    const def = EVENT[id]!;
    const isDefault = def.choices?.[def.defaultChoice ?? 0]?.label === label;
    return `${e.month}: ${label}${isDefault ? '(기본값과 같음 — 직접 골랐는지 알 수 없음)' : '(직접 고름)'}`;
  });
  const skipped = notesAfter.filter((x) => x.n.startsWith('연봉 협상 없음')).map((x) => x.month);
  console.log(`- 연봉 협상: ${choice('salary_review').join(' · ') || '없음'}${skipped.length ? ` · 적자로 안 열림 ${skipped.join(', ')}개월째` : ''}${capped ? ' — ⚠ 이벤트 기록이 60건으로 잘려 앞부분이 없다' : ''}`);
  console.log(`- 경쟁사 스카우트 제안: ${choice('staff_poaching').join(' · ') || '없음'}`);
  const low = notesAfter.filter((x) => x.n.includes('이직 위험'));
  const quits = notesAfter.filter((x) => x.n.includes('사기 저하로 이직'));
  console.log(`- 사기: 지금 최저 ${s.hr.staff.length ? Math.round(Math.min(...s.hr.staff.map(moraleOf))) : '—'} · ${MORALE.quitBelow} 아래로 떨어진 알림 ${low.length}건 · 사기 저하 이직 ${quits.length}건 (월별 사기는 기록되지 않는다)`);
}

/** 가장 오래 걸린 턴 5개 — 사람이 어디서 머뭇거렸나 */
function slowTurns(l: Playlog): void {
  const d = l.turns.map((t, i) => ({ month: t.month, ms: t.activeMs - (i ? l.turns[i - 1]!.activeMs : 0), actions: t.actions - (i ? l.turns[i - 1]!.actions : 0), kinds: t.kinds }));
  const top = [...d].sort((a, b) => b.ms - a.ms).slice(0, 5);
  // 행동 종류(옛 기록에는 없다) — 많은 순 4개
  const kindText = (k?: Record<string, number>) => (k ? ` [${Object.entries(k).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, n]) => `${t}×${n}`).join(' ')}]` : '');
  console.log(`- 오래 걸린 턴: ${top.map((x) => `${x.month - 1}→${x.month}월 ${min(x.ms)}(행동 ${x.actions})${kindText(x.kinds)}`).join(' · ')}`);
  // 진행 방식(옛 기록에는 없다) — 버튼별로 넘긴 달 수
  const adv = l.turns.filter((t) => t.advance).reduce<Record<string, number>>((m, t) => ({ ...m, [t.advance!]: (m[t.advance!] ?? 0) + 1 }), {});
  if (Object.keys(adv).length) console.log(`- 진행 방식(넘긴 달 수): ${Object.entries(adv).map(([k, n]) => `${({ month: '1개월', quarter: '분기', year: '1년', until: '다음 알림까지', other: '기타' } as Record<string, string>)[k] ?? k} ${n}`).join(' · ')}`);
  const total = l.turns.reduce<Record<string, number>>((m, t) => { for (const [k, n] of Object.entries(t.kinds ?? {})) m[k] = (m[k] ?? 0) + n; return m; }, {});
  if (Object.keys(total).length) console.log(`- 행동 종류(판 전체, 많은 순 8개): ${Object.entries(total).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} ${n}`).join(' · ')}`);
  const first24 = d.filter((x) => x.month <= 24);
  if (first24.length) console.log(`- 첫 24턴 평균: 턴당 ${(first24.reduce((t, x) => t + x.ms, 0) / first24.length / 60_000).toFixed(1)}분 · 행동 ${(first24.reduce((t, x) => t + x.actions, 0) / first24.length).toFixed(1)}번`);
}



/**
 * 6차(첫 v16 판) 관찰 질문 9개의 근거를 기록 파일에서 뽑는다 (mvp.md §7.24 ② — 오너의 한 줄 답과 나란히 본다). 게임 변경 없음.
 * 플레이 기록은 행동 종류를 남기지 않는다 → 세이브 상태·결산 메모·판매 사건·이벤트 기록으로 센다. 결산 상세는 최근 120개월만 남는다(앞은 연 요약)
 */
function v16Observe(): void {
  if (rulesVersionOf(s) !== 'v16' || !s.scenario) return;
  console.log('\n## 6차 관찰 질문 근거 (mvp.md §7.24 ② — v16 판, 게임 변경 없음)');
  const span = reports.length ? `${reports[0]!.month}~${reports.at(-1)!.month}개월 결산` : '결산 없음';
  console.log(`- 범위: ${span}${reports.length && reports[0]!.month > 0 ? ' (앞은 연 요약만 — 그 기간 메모는 셀 수 없다)' : ''}`);
  const notes = reports.flatMap((r) => r.notes.map((n) => ({ month: r.month, n })));
  const man = (v: number) => `${Math.round(v / 10_000).toLocaleString()}만`;
  // 1 인건비 (#327·#330)
  const wage = notes.filter((x) => x.n.startsWith('정기 임금 조정'));
  const pay0 = reports[0]?.expenses.salaries, pay1 = reports.at(-1)?.expenses.salaries;
  console.log(`- ① 인건비: 정기 임금 조정 ${wage.length}회${wage.length ? `(${wage.map((x) => x.month).join('·')}개월)` : ''} · 월 급여 ${pay0 != null ? man(pay0) : '—'} → ${pay1 != null ? man(pay1) : '—'} · 직원 ${s.hr.staff.length}명`);
  // 2 소량 병입 (#328)
  const small = [...s.commerce.products, ...(s.commerce.productArchive ?? [])].filter((p) => {
    const made = ('stockBottles' in p ? (p as { stockBottles: number }).stockBottles : 0) + (p.totalSold ?? 0);
    return made > 0 && made <= 60 && !(p as { dutyFreeOnly?: boolean }).dutyFreeOnly;
  });
  console.log(`- ② 소량 병입(제품 하나에 60병 이하): ${small.length}개${small.length ? ` — ${small.slice(0, 6).map((p) => `「${p.name}」(${p.createdMonth}개월)`).join(' · ')}` : ''} · 샘플 뜬 통 ${s.inventory.casks.filter((c) => c.sampleLog?.length).length}/${s.inventory.casks.filter((c) => c.contents).length}`);
  // 3 대형 유통 납품
  const retailRev = reports.reduce((t, r) => t + (r.retailDealRevenue ?? 0), 0);
  const retailMonths = reports.filter((r) => (r.retailDealRevenue ?? 0) > 0).map((r) => r.month);
  const retailNotes = notes.filter((x) => /납품 계약|납품 위약|납품 해지|납품 만료/.test(x.n));
  console.log(`- ③ 대형 유통 납품: 지금 계약 ${s.commerce.retailContracts.length}건 · 납품 대금이 들어온 달 ${retailMonths.length}개월${retailMonths.length ? `(${retailMonths[0]}~${retailMonths.at(-1)})` : ''} · 합계 ${(retailRev / 1e8).toFixed(2)}억 · 관련 메모 ${retailNotes.length}건${retailNotes.length ? ` — ${retailNotes.slice(0, 3).map((x) => `${x.month}: ${x.n.slice(0, 40)}`).join(' / ')}` : ''}`);
  // 4 핵심 전문가 (#316)
  const ks = s.hr.staff.find((x) => x.keySpecialist);
  const stage = stagesOf(s).find((st) => st.unlock.includes('action:pickSpecialist'));
  console.log(`- ④ 핵심 전문가: ${ks ? `${ks.role}(${ks.hiredMonth}개월에 합류)` : stage && s.month > stage.month ? '고르지 않았다' : '아직 열리지 않았다'}`);
  // 5 예비 통·후보
  const cands = reports.map((r) => ({ m: r.month, n: r.flagshipCandidates })).filter((x) => x.n != null);
  const drops = cands.filter((x, i) => i && x.n! < cands[i - 1]!.n!).map((x) => x.m);
  console.log(`- ⑤ 예비·후보: 지금 예비 ${reserveCaskIds(s).size}통 · 후보 수가 줄어든 달 ${drops.length}회${drops.length ? `(${drops.slice(0, 8).join('·')})` : ''} — 줄어든 까닭(병입·판매·사고)은 그 달 메모로`);
  // 6 승리·계속 운영
  const win = s.progress.win;
  console.log(`- ⑥ 승리: ${win ? `${win.month}개월 ${win.kind}${win.channel ? `/${win.channel}` : ''} · 그 뒤 ${s.month - win.month}개월 더 함 · 결과 화면 확인 ${s.progress.verdict?.acknowledged ? '함(계속 운영)' : '안 함'}` : '아직 없음'}${s.status !== 'running' ? ` · 끝남(${s.status})` : ''}`);
  // 7 선택 이벤트 — 기본값과 같은 선택은 직접 골랐는지 알 수 없다
  const chosen = s.events.log.filter((e) => e.title.includes(' → ')).map((e) => {
    const [title, label] = e.title.split(' → ');
    const def = Object.values(EVENT).find((d) => d.title === title) ?? (title ? EVENT[OLD_EVENT_TITLES[title] ?? ''] : undefined);
    const isDefault = def?.choices?.[def.defaultChoice ?? 0]?.label === label;
    return { month: e.month, title: title!, label: label!, isDefault };
  });
  console.log(`- ⑦ 선택 이벤트: ${chosen.length}건 · 기본값과 다른 선택(직접 고름이 확실) ${chosen.filter((x) => !x.isDefault).length}건${chosen.length ? ` — ${chosen.slice(-5).map((x) => `${x.month}: ${x.title}→${x.label}${x.isDefault ? '(기본)' : ''}`).join(' / ')}` : ''} (이벤트 기록은 최근 60건)`);
  // 8 블렌딩 의뢰
  const comm = s.commerce.commissions ?? [];
  const mg = s.progress.midGoals?.find((g) => g.id === 'commission_done');
  console.log(`- ⑧ 블렌딩 의뢰: 성사 ${comm.filter((c) => c.fulfilledBy).length}건 · 남은 의뢰 ${comm.filter((c) => !c.fulfilledBy).length}건 · 중반 목표 ${mg ? `${mg.result}(${mg.month}개월)` : '판정 전'}`);
  // 9 난이도
  const d = difficultyOf(s);
  console.log(`- ⑨ 난이도: ${d.preset} · ${Object.entries(d.levels).map(([k, v]) => `${k} ${v}`).join(' · ')}${s.difficulty ? '' : ' (스냅샷 없음 = 보통)'}`);
}

/**
 * 다음 사람 판(§7.27 개정안 7 ~ 11 · 12번) 근거 — F5d(병입 제품 품질 가리기 #338 · #348) · #351 · 피니싱(#345 ② · #354). 게임 변경 없음.
 * 행동 종류는 턴 기록(`kinds` — 그 달에 한 행동이 다음 턴 번호에 붙는다: 턴 m의 kinds = m−1개월에 한 행동)에서, 품질은 세이브의 제품에서 읽는다
 */
function f5dFinishObserve(): void {
  if (rulesVersionOf(s) !== 'v16' || !s.scenario) return;
  console.log('\n## F5d · 피니싱 근거 (mvp.md §7.27 개정안 7 ~ 11번 — v16 판, 게임 변경 없음)');
    const hidden = s.commerce.products.filter((p) => p.qualityKnown && !p.dutyFreeOnly);
  const shown = s.commerce.products.filter((p) => !p.qualityKnown && !p.dutyFreeOnly);
  // 7 · 10 아는 품질 대 참 품질 (지금 판매 중인 제품)
  console.log(`- ⑦ 아는 품질(가린 제품) ${hidden.length}개 · 공개 제품(F5d 전에 병입) ${shown.length}개`);
  if (hidden.length) {
    const rows = hidden.map((p) => { const k = p.qualityKnown!; const err = k.est - p.quality; return { p, k, err, z: k.sigma > 0 ? err / k.sigma : 0 }; });
    const mean = rows.reduce((t, r) => t + r.err, 0) / rows.length;
    const out2 = rows.filter((r) => r.k.sigma > 0 && Math.abs(r.z) > 2).length;
    console.log(`  - 추정 − 참: 평균 ${mean >= 0 ? '+' : ''}${mean.toFixed(1)} · |z| > 2 ${out2}개 · 리뷰 0인 제품 ${rows.filter((r) => r.k.reviews === 0).length}개`);
    for (const r of rows.sort((a, b) => Math.abs(b.err) - Math.abs(a.err)).slice(0, 8)) console.log(`  - 「${r.p.name}」 추정 ${r.k.est} ±${r.k.sigma} · 참 ${r.p.quality.toFixed(1)} · 리뷰 ${r.k.reviews} · 출고가 ${r.p.price.toLocaleString()}원${r.p.autoPrice ? ' (자동 가격)' : ''}`);
  }
  // 10 승리 제품의 12년 품질 — 결과 화면 값과 판 중 추정
  const v = s.progress.verdict;
  if (v?.flagshipQuality != null) {
    const winP = s.progress.win ? s.commerce.products.find((p) => p.id === s.progress.win!.productId) : undefined;
    console.log(`- ⑩ 결과 화면 12년 품질 ${v.flagshipQuality}${winP?.qualityKnown ? ` · 승리 제품 「${winP.name}」의 지금 추정 ${winP.qualityKnown.est} ±${winP.qualityKnown.sigma}(리뷰 ${winP.qualityKnown.reviews}) — 승리 달의 추정은 기록되지 않는다` : winP ? ` · 승리 제품 「${winP.name}」은 공개 제품(F5d 전 병입)` : ' · 승리 제품이 판매 목록에 없다(정리됨)'}`);
  }
  // 8 리뷰 — 결산에 남은 리뷰 점수(최근 120개월)
  const revMonths = reports.filter((r) => r.reviews?.length).length;
  const revCount = reports.reduce((t, r) => t + (r.reviews ?? []).reduce((u, x) => u + x.scores.length, 0), 0);
  console.log(`- ⑧ 리뷰: 결산에 남은 위스키베이스 점수 ${revCount}건(${revMonths}개월) — 피드 열람은 기록되지 않는다(질문만)`);
  // 9 병입 전 직접 샘플 — 병입한 턴마다 그 턴 포함 앞 3턴에 sampleCask가 있었나
  if (playlog?.turns.length) {
    const T = playlog.turns;
    const at = (m: number, k: string) => T.filter((t) => t.month === m).reduce((n, t) => n + (t.kinds?.[k] ?? 0), 0);
    const bottleTurns = T.filter((t) => (t.kinds?.bottle ?? 0) > 0).map((t) => t.month);
    const pre = bottleTurns.filter((m) => [0, 1, 2, 3].some((d) => at(m - d, 'sampleCask') > 0));
    const sum = (k: string) => T.reduce((n, t) => n + (t.kinds?.[k] ?? 0), 0);
    console.log(`- ⑨ 병입한 달 ${bottleTurns.length}번 중 그 달 포함 3개월 안에 직접 샘플을 뜬 달 ${pre.length}번 · 직접 샘플 ${sum('sampleCask')}회 · 실험실 분석 ${sum('labAnalyze')}회 · 자동 샘플 설정 바꿈 ${sum('setAutoSample')}회`);
    const prices = T.filter((t) => (t.kinds?.setPrice ?? 0) + (t.kinds?.setPricePolicy ?? 0) + (t.kinds?.setAutoPrice ?? 0) > 0).map((t) => t.month - 1);
    console.log(`  - ⑦ 값을 바꾼 달(직접 · 정책 · 자동 가격 토글) ${prices.length}번${prices.length ? ` — ${prices.slice(0, 12).join('·')}${prices.length > 12 ? ' …' : ''}` : ''}`);
  } else console.log('- ⑨ 플레이 기록 없음(세이브만) — 병입 전 샘플 · 값 바꾼 달은 셀 수 없다');
  const autoSampleMonths = reports.filter((r) => (r.expenses['자동 샘플'] ?? 0) > 0).length;
  console.log(`  - 자동 샘플이 뜬 달 ${autoSampleMonths}/${reports.length}개월 (설정 ${s.inventory.autoSample?.off ? '끔' : '켬'}) · 지금 아무 기록 없는 통 ${stalestCasks(s, Infinity).filter((c) => !c.sampleLog?.length).length}개`);
  // 11 피니싱 (#354 — 60개월 y5_finish)
  const opened = s.scenario.stagesDone?.includes('y5_finish');
  const fin = s.inventory.casks.flatMap((c) => { const f = c.contents ? finishOf(c.contents) : null; return f ? [{ id: c.id, label: finishLabel(f.typeId), months: f.months }] : []; });
  const finProducts = s.commerce.products.filter((p) => p.finish);
  const transfers = playlog?.turns.reduce((n, t) => n + (t.kinds?.transferCask ?? 0), 0);
  console.log(`- ⑪ 피니싱: ${opened ? '열림(60개월 y5_finish)' : s.month >= 60 ? '아직 안 열림 — 이 빌드 전 세이브면 다음 달 틱에 열린다(#354)' : '아직 안 열림(60개월)'} · 옮기기 ${transfers ?? '—'}회 · 지금 피니싱 중인 통 ${fin.length}개${fin.length ? ` — ${fin.slice(0, 5).map((f) => `${f.id} ${f.label} ${f.months}개월`).join(' · ')}` : ''} · 24개월 넘김 ${fin.filter((f) => f.months > 24).length}개 · 피니시 표기 제품 ${finProducts.length}개${finProducts.length ? ` — ${finProducts.slice(0, 4).map((p) => `「${p.name}」 판매 ${(p.totalSold ?? 0).toLocaleString()}병`).join(' · ')}` : ''}`);
  // N1 (외부 검토 2026-11-24 — 7차: 손 통입 405회 · 자동 통입 0회): 월당 손 통입 · 자동 통입을 처음 켠 달(행동 기록) · 결산 메모 "자동 통입 n통" 첫 달(대조)
  if (playlog?.turns.length) {
    const T = playlog.turns;
    const fills = T.reduce((n, t) => n + (t.kinds?.fillCasks ?? 0), 0);
    const firstAuto = T.find((t) => (t.kinds?.setAutoFill ?? 0) > 0);
    const autoNote = reports.find((r) => r.notes.some((n) => /^자동 통입 \d+통/.test(n)));
    // N1 탱크 대기 (PM 2026-11-24 · 9차 arch.md ① [제안 P-ARCH-82] (다)): 통입 횟수 대신 "원액이 탱크에서 기다린 개월".
    // 탱크 원액은 달마다 한 로트에 섞여 쌓여(createdMonth = 탱크 시작 달) 판 전체의 배치별 대기는 기록에 없다 → 두 값으로 어림한다:
    // (가) 통입한 턴 사이 간격(행동 기록 — 몰아서 통입하면 길다) · (나) 지금 탱크의 FIFO 대기(`tankLotWaitMonths` — 할 일 「통입 대기 n개월째」와 같은 셈)
    const fillMonths = T.filter((t) => (t.kinds?.fillCasks ?? 0) > 0).map((t) => t.month);
    const gaps = fillMonths.slice(1).map((m, i) => m - fillMonths[i]!);
    const gapHist = ([[1, 1], [2, 2], [3, 3], [4, 5], [6, Infinity]] as const).map(([a, b]) => `${b === Infinity ? `${a}개월+` : a === b ? `${a}개월` : `${a}~${b}개월`} ${gaps.filter((x) => x >= a && x <= b).length}`).join(' · ');
    const tank = s.inventory.lots.filter((l) => (l.kind === 'malt' || l.kind === 'grain') && !l.sourced && l.volumeL >= 1);
    const tankTxt = tank.length ? tank.map((l) => `${l.name.split(' · ')[0]} ${Math.round(l.volumeL)}L ${tankLotWaitMonths(s, l)}개월째`).join(' · ') : '비었음';
    console.log(`- N1 탱크 대기 — 통입한 턴 ${fillMonths.length}개 · 사이 간격 평균 ${gaps.length ? (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1) : '—'}개월 · 최장 ${gaps.length ? Math.max(...gaps) : '—'}개월 (${gapHist}) · 지금 탱크(FIFO 어림): ${tankTxt}`);
    // P-ARCH-88: 턴 기록의 손 통입 합계(fill — 이 기능 뒤 기록에만 있다). 없으면 "기록 없음"
    const fillOf = (t: unknown) => (t as { fill?: { casks: number; partial: number } }).fill;
    const tallied = T.map(fillOf).filter((f): f is { casks: number; partial: number } => !!f);
    const fc = tallied.reduce((n, f) => n + f.casks, 0);
    const fp = tallied.reduce((n, f) => n + f.partial, 0);
    console.log(`- N1 손 통입으로 찬 통 — ${tallied.length ? `${fc}통 · 그중 덜 찬 통(95% 미만) ${fp}통(${fc ? Math.round((fp / fc) * 100) : 0}%) · 기록된 턴 ${tallied.length}개` : '기록 없음(P-ARCH-88 전 기록)'}`);
    console.log(`- N1 손 통입 ${fills}회(월당 ${(fills / Math.max(1, T.length)).toFixed(1)}회 · 기록된 턴 ${T.length}개) · 자동 통입 설정을 처음 바꾼 달 ${firstAuto ? `${firstAuto.month - 1}개월` : '없음'} · 결산에 "자동 통입 n통"이 처음 남은 달 ${autoNote ? `${autoNote.month}개월` : '없음(최근 120개월 결산 안)'} — 7차: 손 통입 405회 · 자동 통입 0회`);
  }
  const care = playlog?.turns.reduce<Record<string, number>>((m, t) => { for (const k of ['rechar', 'sellUsedCask', 'orderSeasoning']) m[k] = (m[k] ?? 0) + (t.kinds?.[k] ?? 0); return m; }, {});
  if (care) console.log(`  - 빈 통 관리(#345 ①): 재탄화 ${care.rechar} · 중고 통 매각 ${care.sellUsedCask} · 시즈닝 통 주문 ${care.orderSeasoning}`);
}
