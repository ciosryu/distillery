// [결정 #412] 직원에게 맡긴 일의 달마다 효과 (MGT) — `hr.ts runStaffLifecycle`(틱 6단계 운영)가 부른다.
// 맡긴 사람이 없으면 아무것도 하지 않는다(상태 · 난수 · 메모 불변 → 봇 · 옛 판 출력 그대로). 난수는 일 · 직원마다 독립 스트림(`task:<일>:<id>`)
// 결과는 소식 창이 읽는 결산 메모 「직원 일 — …」로 남는다(반론 2 — 배수가 아니라 사건으로 보인다)
import { takeSample, blenderOf } from './blendTable';
import { brandOf } from './brands';
import { noiseKeyOf } from './market';
import { hidesProductQuality } from './productView';
import { applyReviews, wbScore, WB_SCORE } from './reviews';
import { lotQuality } from './bulk';
import { ROLE_INFO } from './content/catalog';
import { clamp } from './flavor';
import { rngFor } from './rng';
import { FLAGSHIP_RESERVE_TAG } from './tags';
import { onTask, TASK_VALUES } from './staffTaskRules';
import { tanninOutlook } from './warehouse';
import type { Cask, GameState, MonthReport, Product, Staff } from './types';

/** 소식 창이 읽는 메모 머리 — TurnBrief.tsx turnNews 정규식에 들어 있어야 창에 뜬다 */
export const TASK_NOTE = '직원 일 —';
/** 이 직원의 일이 「분기 사건」을 낼 달인가 — 맡긴 달, 또는 맡긴 채 맞은 각 분기 첫 달(달력 분기 ⌊month/3⌋) */
export const taskEventMonth = (s: Pick<GameState, 'month'>, x: Pick<Staff, 'taskMonth'>): boolean => x.taskMonth === s.month || (s.month % 3 === 0 && (x.taskMonth ?? -1) < s.month);

/** 숙성 점검이 맛볼 통 — 목재 기준↑ · 원액 있음 · 고객 소유 · 핸드필 · 아는 오염 아님(자동 샘플과 같은 읽기라 횟수 제한 없음). 플래그십 예비 → 12년 감점 큰 통 → 오래 안 뜬 통 순 */
export function agingCheckPicks(s: GameState, n = TASK_VALUES.agingCheck.perMonth): Cask[] {
  const V = TASK_VALUES.agingCheck;
  const last = (c: Cask) => c.sampleLog?.at(-1)?.month ?? -1;
  const pen = (c: Cask) => tanninOutlook(s, c)?.penalty ?? 0;
  return s.inventory.casks
    // 핸드필 지정 통(고객 몫 — 판매량과 어긋남) · 이미 아는 오염 통은 맛보지 않는다(PROD 2026-11-25)
    .filter((c) => c.contents && !c.owner && !c.handfill && !c.contaminationKnown && c.contents.oakMonths >= V.minOakMonths)
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
    // 자동 샘플과 같은 읽기(counted = false — PROD 2026-11-25): 손 샘플 횟수 · 오차 줄이기는 플레이어 결정으로 남긴다. 원액 손실은 같다
    if (takeSample(s, c, blender, lotQuality, false)) rare.push(c.id);
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

/** 시음회 제품 — 이번 달 판매 병 수가 가장 많은 제품(면세 전용 제외 · 같으면 id 순, MKT 2026-11-25). 난수 없이 플레이어가 예상할 수 있다 */
export function tastingProduct(s: GameState, report: MonthReport): Product | undefined {
  const sold = new Map<string, number>();
  for (const x of report.sales) sold.set(x.productId, (sold.get(x.productId) ?? 0) + x.bottles);
  return s.commerce.products.filter((p) => !p.dutyFreeOnly && (sold.get(p.id) ?? 0) > 0)
    .sort((a, b) => (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0) || a.id.localeCompare(b.id))[0];
}

/**
 * 영업 「시음회」 — 분기 첫 달(맡긴 달 포함) 한 번. 결과(성황 · 보통 · 썰렁)는 친화(a)로 기운 난수 — 품질과 무관(I2 안전).
 * 그 제품 브랜드 인지도 + · 위스키베이스 리뷰 몇 건(참 품질 + 잡음 — 리뷰가 원래 아는 품질을 좁히는 길, MKT). 리뷰는 틱 5′ 뒤라 결산 `reviews`에 덧붙인다
 */
function runTasting(s: GameState, report: MonthReport, x: Staff, held: { tasting?: boolean }): void {
  if (!taskEventMonth(s, x)) return;
  // 같은 달 시음회는 한 번 — 영업 둘이 맡아도 같은 제품 · 같은 리뷰 스트림이 두 번 붙지 않게(MKT 2026-11-25)
  if (held.tasting) { report.notes.push(`${TASK_NOTE} 시음회(${x.name}): 이번 달 시음회는 이미 열렸다 — 다음 분기에 연다`); return; }
  held.tasting = true;
  const V = TASK_VALUES.tasting;
  const p = tastingProduct(s, report);
  if (!p) { report.notes.push(`${TASK_NOTE} 시음회(${x.name}): 이번 달 팔린 제품이 없어 열지 않았다`); return; }
  if (s.finance.cash < V.cost) { report.notes.push(`${TASK_NOTE} 시음회(${x.name}): 현금이 모자라 이번 분기에는 열지 못했다`); return; }
  s.finance.cash -= V.cost;
  report.expenses.marketing = (report.expenses.marketing ?? 0) + V.cost;
  const charm = x.stats.a / 100;
  const pGreat = 0.15 + 0.4 * charm;
  const pPoor = Math.max(0.05, 0.35 - 0.3 * charm);
  const r = rngFor(s.seed, s.month, `task:tasting:${x.id}`).next();
  const outcome = r < pGreat ? 'great' : r < 1 - pPoor ? 'normal' : 'poor';
  const brand = brandOf(s, p);
  const before = brand.awareness;
  brand.awareness = clamp(brand.awareness + V.awareness[outcome], 0.001, 0.95);
  // 리뷰 — 별도 난수 스트림(평소 업무 판은 바이트 동일). 옛 판 · 품질이 공개된 판은 아는 품질을 건드리지 않는다
  const rr = rngFor(s.seed, s.month, `staff:tasting:${noiseKeyOf(p)}`);
  const scores = Array.from({ length: V.reviews[outcome] }, () => wbScore(p.quality, rr.int(-WB_SCORE.noise, WB_SCORE.noise)));
  // 품질을 가리는 판(v16)만 리뷰를 기록한다 — 옛 판 · 공개 판은 결산 리뷰가 원래 비어 있다(MKT 2026-11-25)
  if (scores.length && hidesProductQuality(s)) {
    if (p.qualityKnown) p.qualityKnown = applyReviews(p.qualityKnown, scores, s.month);
    const line = (report.reviews ??= []).find((y) => y.productId === p.id);
    if (line) line.scores.push(...scores); else report.reviews.push({ productId: p.id, scores });
  }
  const label = { great: '성황 — 자리가 모자랐다', normal: '보통 — 반응이 무난했다', poor: '썰렁 — 손님이 적었다' }[outcome];
  report.notes.push(`${TASK_NOTE} 시음회(${x.name}) 「${p.name}」: ${label} · ${(V.cost / 1e4).toLocaleString()}만 원 · 인지도 ${(before * 100).toFixed(1)}% → ${(brand.awareness * 100).toFixed(1)}%${scores.length ? ` · 리뷰 ${scores.length}건` : ''}`);
}

/** 숙성고 「순찰 강화」 — 발견 확률은 warehouse.ts QC가 `patrolDetect`로 읽는다. 여기서는 야근 수당과 분기 소식만 */
function runPatrol(s: GameState, report: MonthReport, x: Staff): void {
  const V = TASK_VALUES.patrol;
  s.finance.cash -= V.costPerMonth;
  report.expenses.warehousePatrol = (report.expenses.warehousePatrol ?? 0) + V.costPerMonth; // 「숙성고 순찰 수당」(PROD 이름)
  if (!taskEventMonth(s, x)) return;
  const known = s.inventory.casks.filter((c) => c.contents && c.contaminationKnown).length;
  report.notes.push(`${TASK_NOTE} 순찰 강화(${x.name}): 숙성고를 더 자주 돈다 — 오염 발견 확률 ×${V.detectMul} · 야근 수당 월 ${(V.costPerMonth / 1e4).toLocaleString()}만 원 · 지금 아는 오염 통 ${known}개`);
}

/** 이번 달 맡긴 일 — 틱 6단계(runStaffLifecycle 끝). 맡긴 사람이 없으면 바로 돌아간다 */
export function runStaffTasks(s: GameState, report: MonthReport): void {
  const held: { tasting?: boolean } = {};
  for (const x of s.hr.staff) {
    if (!x.task) continue;
    if (x.role === 'distiller' && onTask(x, 'aging_check')) runAgingCheck(s, report, x);
    else if (x.role === 'sales' && onTask(x, 'tasting')) runTasting(s, report, x, held);
    else if (x.role === 'warehouse' && onTask(x, 'patrol')) runPatrol(s, report, x);
    else report.notes.push(`${TASK_NOTE} ${x.name}(${ROLE_INFO[x.role].nameKo})에게 맡긴 일을 이 직군은 할 수 없다 — 평소 업무로 본다`);
  }
}
