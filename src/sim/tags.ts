import { campaignWon, isFlagshipCandidate } from './ledger';
import { vesselMaterial } from './maturation';
import { PROD_TUNING } from './prodTuning';
import type { Cask, GameState, MonthReport, SpiritKind, TagColor, TagDef, TagEffect } from './types';

// 캐스크 태그 (코어 ARCH — #249 QoL ①, 설계 qol.md §4) + 플래그십 예비 통 (#260, #252의 숨은 보호를 보이는 태그로).
// 태그는 원액(SpiritLot.tagIds)에 붙고, 정의는 BUILTIN_TAGS + inventory.tagDefs 한 곳.
// 규칙 효과(protect·prefer)를 쓰는 자동 기능(자동 납품·자동 통입·맡기기·IB 입찰)은 각 파트가 selectCasks(…excludeProtected)·
// protectedCaskIds·isProtected로 같은 식을 읽는다(#249 ② — PROD·MKT). 이 파일은 상태를 바꾸지 않는 순수 함수만 둔다.

/** 플래그십 예비 — 시나리오 판의 기본 태그. 원액에 직접 붙이지 않아도 "가장 오래된 후보 n통"에 자동으로 보인다 */
export const FLAGSHIP_RESERVE_TAG = 'flagship_reserve';

export const BUILTIN_TAGS: readonly TagDef[] = [
  { id: FLAGSHIP_RESERVE_TAG, label: '플래그십 예비', color: 'amber', effect: 'protect' },
];

export const TAG_COLORS: readonly TagColor[] = ['stone', 'rose', 'amber', 'emerald', 'sky', 'violet'];
export const TAG_EFFECT_LABEL: Record<TagEffect | 'none', string> = { protect: '보호', prefer: '먼저 쓰기', none: '표시만' };
/** 태그 이름 최대 길이 · 플레이어 태그 최대 개수 — 화면 한 줄에 들어가게 */
export const TAG_LABEL_MAX = 12;
export const TAG_MAX = 12;

/** 이 판에서 쓸 수 있는 태그 정의 — 기본 태그(시나리오 판만) + 플레이어 태그 */
export function tagDefs(s: GameState): TagDef[] {
  return [...(s.scenario ? BUILTIN_TAGS : []), ...(s.inventory.tagDefs ?? [])];
}

export function tagDef(s: GameState, id: string): TagDef | undefined {
  return tagDefs(s).find((t) => t.id === id);
}

/**
 * 플래그십 예비 통 (#260) — 시나리오 판에서 플래그십을 아직 팔지 않았으면:
 * ① 플레이어가 "플래그십 예비"를 직접 붙인 통 + ② 남은 자리(PROD_TUNING.flagshipReserve − ① 중 후보인 통 수)만큼 가장 오래된 후보 통(플레이어가 뗀 원액 제외).
 * 후보 조건·순서는 #252 `economics.ts flagshipReserve`와 같다(원액 있음·고객 소유 아님·오염 확인 아님·나무 통·isFlagshipCandidate, 오크 긴 순 → id 순) —
 * 플레이어가 손대지 않으면 두 집합이 같다. 비거나 오염되면 다음 후보로 저절로 옮겨 간다(매번 다시 계산).
 * 매번 다시 계산하므로 상태에 저장하지 않는다 — 틱 순서·출력에 영향이 없다
 */
export function reserveCaskIds(s: GameState): Set<string> {
  if (!s.scenario || campaignWon(s)) return new Set();
  const optOut = new Set(s.inventory.reserveOptOut ?? []);
  const manual = s.inventory.casks.filter((c) => !!c.contents && !c.owner && (c.contents.tagIds ?? []).includes(FLAGSHIP_RESERVE_TAG));
  // 자리는 **후보인** 직접 예비만 차지한다 — 후보가 아닌 통(플래그십이 될 수 없는 어린 통)에 붙인 예비는 보호는 되지만 진짜 후보를 밀어내지 않는다
  // (2026-11-11 PROD #300 테스트에서 발견: 44개월 통에 예비를 붙이자 후보 하나가 보호에서 빠졌다)
  const room = Math.max(0, PROD_TUNING.flagshipReserve - manual.filter((c) => isFlagshipCandidate(s, c, 'reserve')).length);
  const manualIds = new Set(manual.map((c) => c.id));
  const auto = s.inventory.casks.filter((c) => !!c.contents && !c.owner && !c.contaminationKnown && vesselMaterial(c) === 'wood' && isFlagshipCandidate(s, c, 'reserve') // 예비 보호는 'reserve' 지평(F4)
      && !manualIds.has(c.id) && !optOut.has(c.contents.id))
    .sort((a, b) => b.contents!.oakMonths - a.contents!.oakMonths || a.id.localeCompare(b.id))
    .slice(0, room);
  return new Set([...manualIds, ...auto.map((c) => c.id)]);
}

/** 통의 태그 id — 원액의 태그 + (예비 통이면) 플래그십 예비. 정의가 지워진 태그는 뺀다 */
export function caskTagIds(s: GameState, c: Cask, reserve: Set<string> = reserveCaskIds(s)): string[] {
  if (!c.contents) return [];
  const known = new Set(tagDefs(s).map((t) => t.id));
  const own = (c.contents.tagIds ?? []).filter((id) => id !== FLAGSHIP_RESERVE_TAG && known.has(id));
  return reserve.has(c.id) ? [FLAGSHIP_RESERVE_TAG, ...own] : own;
}

function hasEffect(s: GameState, c: Cask, effect: TagEffect, reserve: Set<string>): boolean {
  return caskTagIds(s, c, reserve).some((id) => tagDef(s, id)?.effect === effect);
}

/** 보호 태그가 붙은 통인가 — 자동 기능이 쓰지 않는다(#249 ②). 여러 통을 볼 때는 protectedCaskIds가 싸다 */
export const isProtected = (s: GameState, c: Cask): boolean => hasEffect(s, c, 'protect', reserveCaskIds(s));

/** 보호 통 id 모음 — 자동 기능 한 번에 한 번 부른다 */
export function protectedCaskIds(s: GameState): Set<string> {
  const reserve = reserveCaskIds(s);
  return new Set(s.inventory.casks.filter((c) => hasEffect(s, c, 'protect', reserve)).map((c) => c.id));
}

/** 먼저 쓰기 태그가 붙은 통 id 모음 — 자동 기능이 이 통을 먼저 고른다(#249 ②) */
export function preferredCaskIds(s: GameState): Set<string> {
  const reserve = reserveCaskIds(s);
  return new Set(s.inventory.casks.filter((c) => hasEffect(s, c, 'prefer', reserve)).map((c) => c.id));
}

export interface CaskQuery {
  /** 이 태그 중 하나라도 붙은 통 */
  tagIds?: string[];
  /** 숙성 개월(나무 통 = 오크, 옹기 = 쉰 개월) 이상·이하 */
  minAgeM?: number;
  maxAgeM?: number;
  kind?: SpiritKind;
  /** false면 빈 통만 */
  hasContents?: boolean;
  /** 고객 소유(캐스크 오너십) 통 빼기 — 기본 뺀다 */
  excludeOwner?: boolean;
  /** 보호 태그 통 빼기 — 자동 기능은 true로 부른다 */
  excludeProtected?: boolean;
}

const ageOfCask = (c: Cask) => (c.contents ? (vesselMaterial(c) === 'wood' ? c.contents.oakMonths : c.contents.restMonths ?? 0) : 0);

/** 조건에 맞는 통 id (#249 ① — 화면 필터와 자동 기능이 같은 식을 쓴다). 순서는 상태의 통 순서 그대로 */
export function selectCasks(s: GameState, q: CaskQuery = {}): string[] {
  const reserve = reserveCaskIds(s);
  const prot = q.excludeProtected ? protectedCaskIds(s) : null;
  const want = q.tagIds?.length ? new Set(q.tagIds) : null;
  return s.inventory.casks.filter((c) => {
    if (q.hasContents === false) return !c.contents;
    if (q.hasContents && !c.contents) return false;
    if ((q.excludeOwner ?? true) && c.owner) return false;
    if (prot?.has(c.id)) return false;
    if (q.kind && c.contents?.kind !== q.kind) return false;
    if (q.minAgeM != null && ageOfCask(c) < q.minAgeM) return false;
    if (q.maxAgeM != null && ageOfCask(c) > q.maxAgeM) return false;
    if (want && !caskTagIds(s, c, reserve).some((id) => want.has(id))) return false;
    return true;
  }).map((c) => c.id);
}

export interface TagChange { add?: string[]; remove?: string[] }
export interface BulkPlan { ok: string[]; skipped: { id: string; reason: string }[] }

/**
 * 일괄 태그 계획 (#249 ① — 모든 일괄 행동 앞의 순수 plan 함수). 화면은 skipped가 있으면 창을 띄워
 * "가능한 통만 처리 / 모두 취소"를 고르게 하고, 행동(tagCasks)은 ok만 받아 다시 검사한다
 */
export function planTag(s: GameState, caskIds: string[], change: TagChange): BulkPlan & { error?: string } {
  const ids = [...(change.add ?? []), ...(change.remove ?? [])];
  if (!ids.length) return { ok: [], skipped: [], error: '붙이거나 뗄 태그를 고르세요' };
  const unknown = ids.find((id) => !tagDef(s, id));
  if (unknown) return { ok: [], skipped: [], error: `없는 태그입니다: ${unknown}` };
  const ok: string[] = [];
  const skipped: BulkPlan['skipped'] = [];
  for (const id of new Set(caskIds)) {
    const c = s.inventory.casks.find((x) => x.id === id);
    if (!c) skipped.push({ id, reason: '없는 통' });
    else if (!c.contents) skipped.push({ id, reason: '빈 통 — 태그는 원액에 붙는다' });
    else if (c.owner) skipped.push({ id, reason: '고객 소유 통' });
    else ok.push(id);
  }
  return { ok, skipped };
}

// ───────────── 플래그십 후보 감소 기록 (#261 — 화면은 소식 창·할 일, 규칙 불변) ─────────────

/** 플래그십 후보 통 수 — 화면 `alerts.ts flagshipCandidates`와 같은 식(고객 소유 제외 + isFlagshipCandidate) */
export function flagshipCandidateCount(s: GameState): number {
  return s.inventory.casks.filter((c) => !c.owner && isFlagshipCandidate(s, c)).length;
}

/** 자동 납품 전 후보 통의 원액 양 — 시나리오 판·플래그십 판매 전만(아니면 null) */
export function candidateVolumes(s: GameState): Map<string, number> | null {
  if (!s.scenario || campaignWon(s)) return null;
  return new Map(s.inventory.casks.filter((c) => !c.owner && isFlagshipCandidate(s, c)).map((c) => [c.id, c.contents!.volumeL]));
}

/**
 * 자동 납품이 후보 통에서 원액을 가져갔으면 결산 메모 한 줄 — "플래그십 후보 n통에서 자동 납품이 원액을 썼다(m통 비움) — 「제품」".
 * 어느 제품인지는 같은 달 자동 납품 메모의 통 번호로 찾는다. 메모만 남기고 상태는 바꾸지 않는다
 */
export function noteCandidateUse(s: GameState, report: MonthReport, before: Map<string, number> | null, notesFrom: number): void {
  if (!before?.size) return;
  const drawn = [...before].filter(([id, v]) => (s.inventory.casks.find((c) => c.id === id)?.contents?.volumeL ?? 0) < v - 1e-6).map(([id]) => id);
  if (!drawn.length) return;
  const emptied = drawn.filter((id) => !s.inventory.casks.find((c) => c.id === id)?.contents).length;
  const names = new Set<string>();
  for (const n of report.notes.slice(notesFrom)) {
    const m = /^자동 납품 「([^」]+)」/.exec(n);
    if (m && drawn.some((id) => new RegExp(`\\b${id}\\b`).test(n))) names.add(m[1]!);
  }
  report.notes.push(`플래그십 후보 ${drawn.length}통에서 자동 납품이 원액을 썼다${emptied ? `(${emptied}통 비움)` : ''}${names.size ? ` — ${[...names].map((x) => `「${x}」`).join(' ')}` : ''}. 남길 통은 숙성고 카드에서 "플래그십 예비"로 묶는다`);
}
