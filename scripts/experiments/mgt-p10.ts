// 10차 판 70개월 기록 MGT 실험 (docs/playtest/10/mgt.md 「70개월」) — 읽기 전용. 세이브를 복제해 갈래를 나눠 돌린다(원본 세이브 · 게임 규칙 불변).
//   npx tsx scripts/experiments/mgt-p10.ts <기록.json> [what=all|casks|aging|tasting]
// casks   — U2: 53개월+ 몰트 통(12년 후보)과 리필 통의 지금 값 · 샘플 추정, 그리고 사람 행동 없이 시간을 돌려 목재 144개월(12년)에 그 통 하나만 46%로 병입했을 때의
//           참 품질(previewBlend — mgt-aged-quality와 같은 읽기). 제품을 비우고 현금을 넉넉히 줘 병입 · 파산이 통을 건드리지 않게 한다(사건 · 오염은 그대로 켬)
// aging   — U1: 70개월부터 12개월, 디스틸러 「숙성 점검」 그대로 대 평소 업무 — 새 원액 품질 · 소주 품질 · 매출 · 순자산 차이
// tasting — U4: 70개월에 영업 「시음회」 한 번(분기 첫 달) 대 같은 1,500만 원을 그 달 마케팅비에 더함 대 아무것도 안 함 — 3개월 뒤 인지도 · 매출
import { readFileSync } from 'node:fs';
import { advanceMonth, applyAction, migrateSave, type GameState } from '../../src/sim';
import { previewBlend } from '../../src/sim/blending';
import { lotQuality } from '../../src/sim/bulk';
import { awarenessOf } from '../../src/sim/brands';
import { netWorth } from '../../src/sim/progress';
import { caskEligibility } from '../../src/sim/ledger';
import { steadyBatch } from '../../src/sim/production';
import type { Cask } from '../../src/sim/types';

const file = process.argv[2];
if (!file) throw new Error('기록 파일 경로가 필요하다');
const what = process.argv[3] ?? 'all';
const load = (): GameState => migrateSave(JSON.parse(readFileSync(file, 'utf8')).save) as GameState;
const clone = (s: GameState): GameState => structuredClone(s);
const BOTTLE = { name: 't', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };
const pq = (s: GameState, c: Cask) => previewBlend(s, [{ source: 'cask', id: c.id, liters: c.contents!.volumeL }], BOTTLE).evaluation?.quality;
const est = (c: Cask) => c.sampleLog?.at(-1)?.estQuality;
const eok = (v: number) => (v / 1e8).toFixed(2);

if (what === 'all' || what === 'casks') {
  const s0 = load();
  const malt = s0.inventory.casks.filter((c) => c.contents && c.contents.kind === 'malt');
  const cand = malt.filter((c) => c.contents!.oakMonths >= 53);
  const refill = malt.filter((c) => c.fills >= 2 || (c.activity < 0.99 && c.typeId === 'ex_bourbon_barrel'));
  const watch = new Map<string, { c: Cask; kind: string; at144?: number; month144?: number; eligible144?: boolean; lost?: string }>();
  for (const c of cand) watch.set(c.id, { c, kind: '후보' });
  for (const c of refill) if (!watch.has(c.id)) watch.set(c.id, { c, kind: '리필' });
  console.log(`# U2 — ${s0.month}개월 · 몰트 통 ${malt.length} · 53개월+ ${cand.length} · 리필(2회+ 채움 또는 활성 < 0.99) ${refill.length}\n`);
  const s = clone(s0);
  s.commerce.products = [];
  s.finance.cash = 1e12;
  for (let m = 0; m < 130 && [...watch.values()].some((w) => w.at144 == null && !w.lost); m++) {
    for (const w of watch.values()) {
      if (w.at144 != null || w.lost) continue;
      const c = s.inventory.casks.find((x) => x.id === w.c.id);
      if (!c?.contents) { w.lost = `${s.month}개월에 통이 비었다`; continue; }
      if (c.contents.oakMonths >= 144) { w.at144 = pq(s, c); w.month144 = s.month; w.eligible144 = caskEligibility(s, c).eligible; }
    }
    s.finance.cash = 1e12;
    if (s.status !== 'running') s.status = 'running';
    const next = advanceMonth(s);
    Object.assign(s, next);
  }
  console.log('| 통 | 구분 | 종류 · 채움 · 활성 | 목재(개월) | 지금 병입 품질 | 샘플 추정(달) | 12년 달 | 12년 병입 품질 | 적격 | 비고 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  const rows = [...watch.values()].sort((a, b) => (b.c.contents!.oakMonths - a.c.contents!.oakMonths) || a.c.id.localeCompare(b.c.id));
  for (const w of rows) {
    const c = w.c;
    const e = est(c);
    console.log(`| ${c.id} | ${w.kind} | ${c.typeId} · ${c.fills} · ${c.activity.toFixed(2)} | ${c.contents!.oakMonths} | ${pq(s0, c)?.toFixed(1) ?? '—'} | ${e ?? '—'}${e != null ? `(${c.sampleLog!.at(-1)!.month})` : ''} | ${w.month144 ?? '—'} | ${w.at144?.toFixed(1) ?? '—'} | ${w.eligible144 == null ? '—' : w.eligible144 ? '예' : '아니오'} | ${w.lost ?? ''} |`);
  }
  const ok = rows.filter((w) => w.at144 != null);
  const firstEl = Math.min(...ok.filter((w) => w.eligible144).map((w) => w.month144!));
  const q80 = ok.filter((w) => (w.at144 ?? 0) >= 80);
  console.log(`\n- 첫 12년 적격(이 통들 가운데): ${firstEl}개월 · 12년 병입 80↑: ${q80.length}통 — ${q80.map((w) => `${w.c.id}(${w.kind} ${w.at144!.toFixed(1)} · ${w.month144}개월)`).join(', ') || '없음'}`);
  console.log(`- 후보 12년 품질 중앙: ${median(ok.filter((w) => w.kind === '후보').map((w) => w.at144!))} · 리필 12년 품질 중앙: ${median(ok.filter((w) => w.kind === '리필').map((w) => w.at144!))}`);
}

if (what === 'all' || what === 'aging') {
  const base = load();
  const run = (task: 'keep' | 'routine') => {
    let s = clone(base);
    const d = s.hr.staff.find((x) => x.role === 'distiller')!;
    if (task === 'routine') d.task = undefined; // 비교용 — 평소 업무(행동 규칙의 분기 제한을 건너뛴다: 같은 출발점에서 일만 다르게)
    const startLots = new Set([...s.inventory.lots.map((l) => l.id), ...s.inventory.casks.flatMap((c) => (c.contents ? [c.contents.id] : []))]);
    let rev = 0;
    for (let m = 0; m < 12; m++) { s = advanceMonth(s); rev += s.history.reports.at(-1)!.revenue; }
    const fresh = [...s.inventory.lots.filter((l) => !startLots.has(l.id)), ...s.inventory.casks.flatMap((c) => (c.contents && !startLots.has(c.contents.id) && (c.filledMonth ?? 0) >= base.month ? [c.contents] : []))];
    const q = (kind: string) => median(fresh.filter((l) => l.kind === kind).map((l) => lotQuality(l)));
    const soju = s.commerce.products.filter((p) => p.category === 'soju_distilled').map((p) => `${p.name} ${p.quality?.toFixed(1)}`).join(' · ');
    return { nw: netWorth(s), rev, malt: q('malt'), soju: q('soju'), grain: q('grain'), products: soju };
  };
  // 레시피마다 정상 상태 배치(steadyBatch — 화면 미리보기와 같은 식, 상태 불변)의 새 원액 품질 · 이취 축: 숙성 점검 대 평소 업무
  console.log(`\n# U1 — 레시피별 새 원액(정상 상태 배치): 숙성 점검 대 평소 업무 (디스틸러 공정 ${base.hr.staff.find((x) => x.role === 'distiller')!.stats.b})\n`);
  console.log('| 레시피 | 종류 | 품질 점검 → 평소 | 용제 · 후류취 · 산미(점검) | (평소) |');
  console.log('|---|---|---|---|---|');
  const off = (f: Record<string, number | undefined>) => ['solvent', 'feinty', 'acetic'].map((k) => (f[k] ?? 0).toFixed(1)).join(' · ');
  for (const r of base.production.recipes) {
    const sa = clone(base); const sb = clone(base);
    sb.hr.staff.find((x) => x.role === 'distiller')!.task = undefined;
    const pa = steadyBatch(sa, r); const pb = steadyBatch(sb, r);
    console.log(`| ${r.name} | ${r.kind} | ${pa?.evaluation?.quality.toFixed(1)} → ${pb?.evaluation?.quality.toFixed(1)} | ${pa ? off(pa.flavor as never) : '—'} | ${pb ? off(pb.flavor as never) : '—'} |`);
  }
  const a = run('keep');
  const b = run('routine');
  console.log(`\n# U1 — ${base.month}개월부터 12개월: 숙성 점검 그대로 대 평소 업무\n`);
  console.log('| 갈래 | 새 몰트 원액 품질 중앙 | 새 소주 원액 | 새 그레인 원액 | 12개월 매출 | 12개월 뒤 순자산 |');
  console.log('|---|---|---|---|---|---|');
  console.log(`| 숙성 점검(지금) | ${a.malt} | ${a.soju} | ${a.grain} | ${eok(a.rev)}억 | ${eok(a.nw)}억 |`);
  console.log(`| 평소 업무 | ${b.malt} | ${b.soju} | ${b.grain} | ${eok(b.rev)}억 | ${eok(b.nw)}억 |`);
  console.log(`\n- 소주 제품 품질(12개월 뒤): 점검 ${a.products} / 평소 ${b.products}`);
}

if (what === 'all' || what === 'tasting') {
  const base = load();
  const sales = base.hr.staff.find((x) => x.role === 'sales')!;
  const branch = (kind: 'none' | 'tasting' | 'marketing') => {
    let s = clone(base);
    // 시음회는 분기 첫 달(맡긴 달 포함)에 열린다 — 이번 달에 맡기면 이번 결산에 한 번
    if (kind === 'tasting') { const x = s.hr.staff.find((y) => y.id === sales.id)!; x.task = 'tasting'; x.taskMonth = s.month; }
    const mk = s.commerce.marketingBudget;
    if (kind === 'marketing') s = applyAction(s, { type: 'setMarketing', amount: mk + 15_000_000 }).state;
    const aw0 = awarenessOf(s);
    let rev = 0;
    s = advanceMonth(s); rev += s.history.reports.at(-1)!.revenue;
    if (kind === 'tasting') { const x = s.hr.staff.find((y) => y.id === sales.id)!; x.task = undefined; }
    if (kind === 'marketing') s = applyAction(s, { type: 'setMarketing', amount: mk }).state;
    for (let m = 0; m < 2; m++) { s = advanceMonth(s); rev += s.history.reports.at(-1)!.revenue; }
    return { aw0, aw: awarenessOf(s), rev, nw: netWorth(s), note: s.history.reports.at(-3)!.notes.find((n) => n.includes('시음회')) ?? '' };
  };
  const rs = { none: branch('none'), tasting: branch('tasting'), marketing: branch('marketing') };
  // 오너 판처럼 8개월 내내 맡긴 채 두기(26 ~ 33개월과 같은 길이) — 시음회는 분기마다 · 커버리지 × 0.5는 맡은 동안 내내(MKT 2026-11-26 지적)
  const hold = (keep: boolean) => {
    let s = clone(base);
    if (keep) { const x = s.hr.staff.find((y) => y.id === sales.id)!; x.task = 'tasting'; x.taskMonth = s.month; }
    let rev = 0; let bottles = 0; const aw0 = awarenessOf(s);
    for (let m = 0; m < 8; m++) { s = advanceMonth(s); const r = s.history.reports.at(-1)!; rev += r.revenue; bottles += r.sales.reduce((a, x) => a + x.bottles, 0); }
    return { rev, bottles, aw0, aw: awarenessOf(s), nw: netWorth(s), events: s.history.reports.slice(-8).flatMap((r) => r.notes.filter((n) => n.includes('시음회'))).length };
  };
  const h0 = hold(false); const h1 = hold(true);
  console.log(`\n# U4 — ${base.month}개월: 시음회 한 번 대 마케팅비 +1,500만 한 달 대 그대로 (3개월 뒤, 지금 월 마케팅비 ${Math.round(base.commerce.marketingBudget / 1e4)}만)\n`);
  console.log('| 갈래 | 인지도 시작 → 3개월 뒤 | 3개월 매출 | 3개월 뒤 순자산 |');
  console.log('|---|---|---|---|');
  for (const [k, r] of Object.entries(rs)) console.log(`| ${k} | ${(r.aw0 * 100).toFixed(2)}% → ${(r.aw * 100).toFixed(2)}% | ${eok(r.rev)}억 | ${eok(r.nw)}억 |`);
  console.log(`\n- 시음회 메모: ${rs.tasting.note}`);
  console.log(`\n## 8개월 내내 맡김(오너 판 길이) 대 그대로\n`);
  console.log('| 갈래 | 8개월 판매(병) | 8개월 매출 | 인지도 | 8개월 뒤 순자산 | 시음회 횟수 |');
  console.log('|---|---|---|---|---|---|');
  for (const [k, r] of [['그대로', h0], ['8개월 시음회', h1]] as const) console.log(`| ${k} | ${r.bottles} | ${eok(r.rev)}억 | ${(r.aw0 * 100).toFixed(2)} → ${(r.aw * 100).toFixed(2)}% | ${eok(r.nw)}억 | ${r.events} |`);
}

function median(xs: number[]): string {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return '—';
  const m = v.length >> 1;
  return (v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2).toFixed(1);
}
