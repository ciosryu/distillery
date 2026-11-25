// [결정 #412] 직원에게 맡긴 일의 달마다 효과 (MGT) — `hr.ts runStaffLifecycle`(틱 6단계 운영)가 부른다.
// 맡긴 사람이 없으면 아무것도 하지 않는다(상태 · 난수 · 메모 불변 → 봇 · 옛 판 출력 그대로). 난수는 일 · 직원마다 독립 스트림(`task:<일>:<id>`)
// 결과는 소식 창이 읽는 결산 메모 「직원 일 — …」로 남는다(반론 2 — 배수가 아니라 사건으로 보인다)
import { takeSample, blenderOf, SAMPLING } from './blendTable';
import { lotQuality } from './bulk';
import { houseBrand } from './brands';
import { ROLE_INFO } from './content/catalog';
import { clamp } from './flavor';
import { rngFor } from './rng';
import { FLAGSHIP_RESERVE_TAG } from './tags';
import { onTask, TASK_VALUES } from './staffTaskRules';
import { tanninOutlook } from './warehouse';
import type { Cask, GameState, MonthReport, Staff } from './types';

/** 소식 창이 읽는 메모 머리 — TurnBrief.tsx turnNews 정규식에 들어 있어야 창에 뜬다 */
export const TASK_NOTE = '직원 일 —';
/** 이 직원의 일이 「분기 사건」을 낼 달인가 — 맡긴 달, 또는 맡긴 채 맞은 각 분기 첫 달(달력 분기 ⌊month/3⌋) */
export const taskEventMonth = (s: Pick<GameState, 'month'>, x: Pick<Staff, 'taskMonth'>): boolean => x.taskMonth === s.month || (s.month % 3 === 0 && (x.taskMonth ?? -1) < s.month);

/** 숙성 점검이 맛볼 통 — 목재 기준↑ · 원액 있음 · 고객 소유 아님 · 샘플 횟수 남음. 플래그십 예비 → 12년 감점 큰 통 → 오래 안 뜬 통 순 */
export function agingCheckPicks(s: GameState, n = TASK_VALUES.agingCheck.perMonth): Cask[] {
  const V = TASK_VALUES.agingCheck;
  const last = (c: Cask) => c.sampleLog?.at(-1)?.month ?? -1;
  const pen = (c: Cask) => tanninOutlook(s, c)?.penalty ?? 0;
  return s.inventory.casks
    .filter((c) => c.contents && !c.owner && c.contents.oakMonths >= V.minOakMonths && (c.samples ?? 0) < SAMPLING.maxSamples)
    .map((c) => ({ c, reserve: (c.contents!.tagIds ?? []).includes(FLAGSHIP_RESERVE_TAG) ? 1 : 0, pen: pen(c), last: last(c) }))
    .sort((a, b) => b.reserve - a.reserve || b.pen - a.pen || a.last - b.last || a.c.id.localeCompare(b.c.id))
    .slice(0, n).map((x) => x.c);
}

/** 디스틸러 「숙성 점검」 — 대신 맛보기(돈 · 월 샘플 여력 안 씀) · 숨은 오염 찾기 · 분기마다 12년 감점 큰 통 알림 */
function runAgingCheck(s: GameState, report: MonthReport, x: Staff): void {
  const V = TASK_VALUES.agingCheck;
  const picks = agingCheckPicks(s);
  const blender = blenderOf(s);
  const rng = rngFor(s.seed, s.month, `task:aging_check:${x.id}`);
  const found: string[] = [];
  const rare: string[] = [];
  for (const c of picks) {
    if (takeSample(s, c, blender, lotQuality)) rare.push(c.id);
    if (c.contamination && !c.contaminationKnown && rng.chance(V.contamFind)) { c.contaminationKnown = true; found.push(c.id); }
  }
  if (found.length) report.notes.push(`${TASK_NOTE} 숙성 점검(${x.name}): 캐스크 ${found.join(', ')}에서 오염을 찾았다`);
  if (rare.length) report.notes.push(`${TASK_NOTE} 숙성 점검(${x.name}): 레어 캐스크 발견 — ${rare.join(', ')}`);
  if (!taskEventMonth(s, x)) return;
  const old = s.inventory.casks.filter((c) => c.contents && !c.owner && c.contents.oakMonths >= V.minOakMonths);
  const flagged = old.map((c) => ({ c, t: tanninOutlook(s, c) })).filter((y) => (y.t?.penalty ?? 0) >= V.flagPenalty && !y.t?.moved).sort((a, b) => b.t!.penalty - a.t!.penalty);
  const pens = flagged.map((y) => y.t!.penalty);
  const flagText = flagged.length ? ` · ${flagged[0]!.c.id}${flagged.length > 1 ? ` 외 ${flagged.length - 1}통` : ''}은 지금 통 그대로면 12년 감점 약 ${Math.round(Math.min(...pens))}${pens.length > 1 ? ` ~ ${Math.round(Math.max(...pens))}` : ''}` : old.length ? ' · 12년 감점이 큰 통은 없다' : '';
  report.notes.push(`${TASK_NOTE} 숙성 점검(${x.name}): ${V.minOakMonths / 12}년 넘은 통 ${old.length}개 가운데 이번 달 ${picks.length}통을 맛봤다${flagText} — 그동안 증류장을 비워 새 원액의 이취가 조금 는다`);
}

/** 영업 「시음회」 — 분기 첫 달(맡긴 달 포함) 한 번. 결과는 친화(a)로 기운 난수 */
function runTasting(s: GameState, report: MonthReport, x: Staff): void {
  if (!taskEventMonth(s, x)) return;
  const V = TASK_VALUES.tasting;
  if (s.finance.cash < V.cost) { report.notes.push(`${TASK_NOTE} 시음회(${x.name}): 현금이 모자라 이번 분기에는 열지 못했다`); return; }
  s.finance.cash -= V.cost;
  report.expenses.marketing = (report.expenses.marketing ?? 0) + V.cost;
  const charm = x.stats.a / 100;
  const pGreat = 0.15 + 0.4 * charm;
  const pPoor = Math.max(0.05, 0.35 - 0.3 * charm);
  const r = rngFor(s.seed, s.month, `task:tasting:${x.id}`).next();
  const outcome = r < pGreat ? 'great' : r < pGreat + (1 - pGreat - pPoor) ? 'normal' : 'poor';
  const delta = V.awareness[outcome];
  const h = houseBrand(s);
  const before = h.awareness;
  h.awareness = clamp(h.awareness + delta, 0.001, 0.95);
  const label = { great: '성황 — 자리가 모자랐다', normal: '보통 — 반응이 무난했다', poor: '썰렁 — 손님이 적었다' }[outcome];
  report.notes.push(`${TASK_NOTE} 시음회(${x.name}): ${label} · ${(V.cost / 1e4).toLocaleString()}만 원 · 인지도 ${(before * 100).toFixed(1)}% → ${(h.awareness * 100).toFixed(1)}%`);
}

/** 숙성고 「순찰 강화」 — 발견 확률은 warehouse.ts QC가 `patrolDetect`로 읽는다. 여기서는 야근 수당과 분기 소식만 */
function runPatrol(s: GameState, report: MonthReport, x: Staff): void {
  const V = TASK_VALUES.patrol;
  s.finance.cash -= V.costPerMonth;
  report.expenses.staffTask = (report.expenses.staffTask ?? 0) + V.costPerMonth;
  if (!taskEventMonth(s, x)) return;
  const known = s.inventory.casks.filter((c) => c.contents && c.contaminationKnown).length;
  report.notes.push(`${TASK_NOTE} 순찰 강화(${x.name}): 숙성고를 더 자주 돈다 — 오염 발견 확률 ×${V.detectMul} · 야근 수당 월 ${(V.costPerMonth / 1e4).toLocaleString()}만 원 · 지금 아는 오염 통 ${known}개`);
}

/** 이번 달 맡긴 일 — 틱 6단계(runStaffLifecycle 끝). 맡긴 사람이 없으면 바로 돌아간다 */
export function runStaffTasks(s: GameState, report: MonthReport): void {
  for (const x of s.hr.staff) {
    if (!x.task) continue;
    if (x.role === 'distiller' && onTask(x, 'aging_check')) runAgingCheck(s, report, x);
    else if (x.role === 'sales' && onTask(x, 'tasting')) runTasting(s, report, x);
    else if (x.role === 'warehouse' && onTask(x, 'patrol')) runPatrol(s, report, x);
    else report.notes.push(`${TASK_NOTE} ${x.name}(${ROLE_INFO[x.role].nameKo})에게 맡긴 일을 이 직군은 할 수 없다 — 평소 업무로 본다`);
  }
}
