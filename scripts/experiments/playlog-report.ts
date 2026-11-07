// 플레이테스트 기록 읽기 (mvp.md §7.2) — 오너가 "기록 내보내기"로 받은 파일을 mvp.md §7 기준·§7.1 "볼 것"으로 요약한다
// 실행: npx tsx scripts/experiments/playlog-report.ts <기록 파일.json>
// 같은 판을 화면에서 다시 보려면 게임의 "불러오기"로 같은 파일을 연다
import { readFileSync } from 'node:fs';
import { monthLabel, type MonthReport } from '../../src/sim';
import { activeMsAt, parsePlayFile, type Playlog } from '../../src/store/playlog';

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

/** 가장 오래 걸린 턴 5개 — 사람이 어디서 머뭇거렸나 */
function slowTurns(l: Playlog): void {
  const d = l.turns.map((t, i) => ({ month: t.month, ms: t.activeMs - (i ? l.turns[i - 1]!.activeMs : 0), actions: t.actions - (i ? l.turns[i - 1]!.actions : 0) }));
  const top = [...d].sort((a, b) => b.ms - a.ms).slice(0, 5);
  console.log(`- 오래 걸린 턴: ${top.map((x) => `${x.month - 1}→${x.month}월 ${min(x.ms)}(행동 ${x.actions})`).join(' · ')}`);
  const first24 = d.filter((x) => x.month <= 24);
  if (first24.length) console.log(`- 첫 24턴 평균: 턴당 ${(first24.reduce((t, x) => t + x.ms, 0) / first24.length / 60_000).toFixed(1)}분 · 행동 ${(first24.reduce((t, x) => t + x.actions, 0) / first24.length).toFixed(1)}번`);
}


