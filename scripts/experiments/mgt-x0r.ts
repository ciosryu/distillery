// X0-R — 「아는 사람의 길」: 판 초반에 2차 채움 통(활성도 ×0.6)을 만들어 12년 예비로 쓰는 봇 변형 (MGT, [결정 #378] (나) 실험 — mgt-grade-options.md 「#378 단계 T 실험 설계」 §4)
//   XR=1 ONLY=X0 TIER=standard npx tsx scripts/experiments/mgt-x0r.ts 40 180      ← X0-R
//   XR=0 ONLY=X0 TIER=standard npx tsx scripts/experiments/mgt-x0r.ts 40 180      ← 같은 래퍼의 X0(대조 — grade-dist.ts 「#G」 줄과 같은 꼴)
// P8 끼움 자리만 쓴다(게임 규칙 · 봇 기본 행동 그대로). 게임 행동도 사람이 쓸 수 있는 것만 쓴다:
//   XR_AT개월째(기본 3) — XR_AT 전에 통입한 첫 채움 버번 배럴 XR_N개(기본 전부)에서 원액을 뺀다(`unfillCask` — 손실 0.75%, 통은 한 번 쓴 통 ×0.6 · 원액은 목재 개월을 지닌 채 탱크로)
//   → 같은 원액을 그 통에 다시 넣는다(`fillCasks`) → 「플래그십 예비」 꼬리표(`tagCasks`) — 승리 출시가 예비 통부터 고른다(mvp-human.ts launch)
//   승리 전에는 일반 병입이 그 통을 쓰지 않는다(@hook:bottle-skip). 승리 뒤에는 막지 않는다
//   아는 오염이 생긴 2차 채움 통은 예비 꼬리표를 뗀다(사람과 같은 정보만 — 숨은 오염은 모른다)
//   XR_PICK개월째(기본 138) 예비 통을 샘플로 맛보고, 아는 품질이 가장 좋은 통보다 XR_DROP(기본 15) 넘게 낮은 통은 예비에서 뺀다.
//   같은 달 게임 자동 예비가 채운 첫 채움 통의 예비도 뗀다(승리 출시가 2차 채움 통만 쓰게)
// XR_DELAY(기본 0 = 끼우지 않음)개월 — [결정 #407] 승리 미루기 측정: 첫 적격 통 달(`progress.firstEligibleMonth`)부터 곧바로 출시할 수 있는 달(그다음 달)보다 이만큼 늦게 승리 출시한다(@hook:launch-gate — 판정 달 − 첫 적격 달 − 2 = XR_DELAY).
//   X0 · X0-R 모두에 걸린다. 미루는 동안 일반 병입이 2차 채움 예비 통을 쓰지 않는 것은 그대로(@hook:bottle-skip)
// XR_MODE=buy — [결정 #408] N1 「사기」 방식: 판 처음(생성 직후) 리필(한 번 쓴) 버번 배럴 XR_BUY_N개(기본 6 — 채웠다 빼기 방식의 통 수 중앙)를 쿠퍼리지로 주문(`buyCasks refill`),
//   도착한 달부터 그달 몰트 원액을 그 통에 먼저 넣고(@hook:before-bottle — 나머지는 P8 통입 그대로) 「플래그십 예비」 꼬리표. XR_AT 채웠다 빼기는 하지 않는다. 나머지(샘플 고르기 · 오염 떼기 · 병입 제외)는 같다
// XR_LAUNCH=best — 승리 출시를 「아는 품질이 가장 좋은 예비(2차 채움) 통이 적격일 때」로(@hook:launch-gate). 기본 first = 적격 통이 생긴 첫 달(P8 그대로).
//   XR_DELAY와 함께면 best 문이 처음 열린 달 + XR_DELAY부터. 예비 통이 하나도 없으면 문을 닫지 않는다
// XR_STAFF=aging_check — [결정 #412] 디스틸러에게 「숙성 점검」을 맡긴다(단계 y1_staff가 연 다음 달 13개월째 한 번 — 사람이 쓸 수 있는 행동 `assignStaffTask`). XR=0이어도 걸린다(X0 + 점검)
// XR_STILL=light|heavy|balanced — [결정 #417 · #418] 판을 만든 직후 증류기에 형태 프리셋(PROD STILL_SHAPE_PRESETS)을 넣는다(사업 계획서에서 고르는 것과 같음)
// XR_SHERRY=n — [결정 #418 · #422] 「셰리 15년 명작」 길: 판 처음 새 올로로소 벗 n개를 주문(쿠퍼리지) → 도착한 뒤 몰트 로트 통입을 이 벗에 먼저 한다(@hook:fill-lot — 다 차면 P8 그대로). 15년(목재 180개월) 전에는 어떤 병입도 쓰지 않는다(@hook:bottle-skip).
//   모든 벗이 목재 180개월이 되면 아는 오염 벗을 빼고 「셰리 15년」 새 제품으로 한 번에 병입(P8 bottleAs — 가격 · 판매는 봇 그대로) → 첫 출하 달에 재판정(#422). 승리는 따로(첫 12년 출시 그대로)
// XR_CASK=oloroso_butt — [결정 #418 · PM 2026-11-25] 「채웠다 뺀 셰리 벗」 X0-R: refill 방식(XR_MODE 기본)의 통을 버번 배럴 대신 새 올로로소 벗 XR_BUTT_N개(기본 3)로.
//   판 처음 벗을 주문(쿠퍼리지) → 도착하면 몰트 로트를 먼저 넣고(@hook:fill-lot) → XR_AT개월째(벗일 때 기본 6) 빼서 다시 넣어 2차 채움 셰리 벗(×0.6)으로 예비 꼬리표. 나머지(샘플 고르기 · 오염 떼기 · 병입 제외 · best 출시)는 같다
// XR_REBOTTLE=1 — [결정 #427] 재판정 구멍 측정: 승리 다음 달(병입 앞) 남은 2차 채움 예비 통 가운데 아는 품질이 가장 좋은 적격 통 하나를
//   「리필 12년 B」 새 제품으로 병입(P8 bottleAs) → 첫 출하 달에 재판정. 사람이 「승리 뒤 남은 좋은 통을 따로 낸다」를 흉내 낸다
// 판마다 `#G {…}` 한 줄(grade-dist와 같은 칸 + 판정 달 설비 목록 `equip`([catalogId, 원가, 산 달 `boughtMonthOf`]) · 판 끝 상태 · X0-R 기록 `xr`)
import { setP8Hooks } from './p8Hooks';
import { applyAction } from '../../src/sim/actions';
import { EQUIPMENT } from '../../src/sim/content/catalog';
import { STILL_SHAPE_PRESETS } from '../../src/sim/stillShape';
import { boughtMonthOf } from '../../src/sim/valuation';
import { netWorth, sNetWorthTarget } from '../../src/sim/progress';
import { awarenessOf } from '../../src/sim/brands';
import { campaignWon, caskEligibility } from '../../src/sim/ledger';
import { FLAGSHIP_RESERVE_TAG, reserveCaskIds } from '../../src/sim/tags';
import { knownReads } from '../../src/sim/blendTable';
import type { GameState } from '../../src/sim';
import type { Cask } from '../../src/sim/types';

const XR = process.env.XR === '1';
/** [PM 2026-11-25] X0-R 통 종류 — 기본 버번 배럴 · oloroso_butt = 채웠다 뺀 셰리 벗 */
const XR_CASK = (process.env.XR_CASK ?? 'ex_bourbon_barrel') as 'ex_bourbon_barrel' | 'oloroso_butt';
const BUTT_N = Number(process.env.XR_BUTT_N ?? 3);
const buttFill = new Map<number, Set<string>>(); // seed → 첫 채움을 기다리는 새 벗(XR_CASK=oloroso_butt)
const AT = Number(process.env.XR_AT ?? (XR_CASK === 'oloroso_butt' ? 6 : 3));
const N = Number(process.env.XR_N ?? 99); // 기본 = XR_AT 전에 넣은 첫 채움 버번 전부(가장 오래된 통이 모두 2차 채움이어야 승리 출시 — 목재 긴 순 — 가 첫 채움을 섞지 않는다)
/** 승리 출시 전 예비 통 샘플 달 · 뺄 차이(아는 품질이 가장 좋은 통보다 이만큼 낮으면 예비에서 뺀다) */
const PICK = Number(process.env.XR_PICK ?? 138);
const DROP = Number(process.env.XR_DROP ?? 15); // 샘플 잡음(±7 ~ 20)이 커서 작게 잡으면 깨끗한 통까지 뺀다
/** [결정 #407] 첫 적격 통 달부터 승리 출시를 미룰 개월(0 = 미루지 않음 — 끼움 자리를 걸지 않아 바이트 동일) */
const DELAY = Number(process.env.XR_DELAY ?? 0);
/** [결정 #408] 'refill' = XR_AT에 채웠다 빼기(앞 측정) · 'buy' = 판 처음 리필 통을 산다(N1) */
const MODE = process.env.XR_MODE === 'buy' ? 'buy' : 'refill';
const BUY_N = Number(process.env.XR_BUY_N ?? 6);
/** 승리 출시 시점 — 'first' = 적격 통이 생긴 첫 달(P8) · 'best' = 아는 품질이 가장 좋은 예비 통이 적격일 때 */
const LAUNCH = process.env.XR_LAUNCH === 'best' ? 'best' : 'first';
/** [결정 #412] 맡길 일(디스틸러) — 없으면 맡기지 않는다 */
const STAFF_TASK = process.env.XR_STAFF as 'aging_check' | undefined;
/** [결정 #418] 증류기 형태 프리셋 · 셰리 벗 수 */
const STILL_PRESET = process.env.XR_STILL ? STILL_SHAPE_PRESETS.find((x) => x.id === process.env.XR_STILL) : undefined;
if (process.env.XR_STILL && !STILL_PRESET) throw new Error(`XR_STILL 프리셋 없음: ${process.env.XR_STILL}`);
/** XR_SHAPE='{"condenser":"shell"}' — 프리셋 위에 부품 하나를 바꿔 원인을 가른다(측정 전용) */
const SHAPE_OVERRIDE = process.env.XR_SHAPE ? (JSON.parse(process.env.XR_SHAPE) as Record<string, string>) : {};
const SHERRY_N = Number(process.env.XR_SHERRY ?? 0);
const SHERRY_AT = 180;
const REBOTTLE = process.env.XR_REBOTTLE === '1';
const rebottled = new Map<number, number>(); // seed → 다시 병입한 달
const sherry = new Map<number, { set: Set<string>; launched?: number }>();

type Verdict = { month: number; nw: number; q?: number; aw: number; grade?: string; sTarget?: number; fe?: number };
interface Run { sherry?: { casks: string[]; launch?: number; q?: number; cost?: number }; best?: { grade?: string; month: number; q?: number }; pol: string; seed: number; target: number; v?: Verdict; retail: number; retailAtVerdict?: number; nwEnd: number; months: number; equip?: [string, number, number][]; status?: string; endMonth?: number; xr?: { mode?: string; buyCost?: number; casks: string[]; lostL: number; activity: number[]; bestOpen?: number; usedAtWin?: number; untagged?: string[]; sampled?: [string, number][]; autoOff?: string[] } }
const runs = new Map<string, Run>();
const refill = new Map<number, Set<string>>(); // seed → 2차 채움 예비 통
const buyArrive = new Map<number, number>(); // seed → 리필 통 도착 달(buy)
const bestOpen = new Map<number, number>(); // seed → best 문이 처음 열린 달

/** XR_AT 전에 통입한 첫 채움 버번 배럴 — 통입 이른 순 · id 순 */
const firstFillBourbon = (s: GameState): Cask[] => s.inventory.casks
  .filter((c) => c.contents && !c.owner && c.typeId === XR_CASK && (XR_CASK === 'ex_bourbon_barrel' || !!buttFill.get(s.seed)?.has(c.id)) && c.contents.kind === 'malt' && c.activity >= 0.99 && (c.filledMonth ?? s.month) < s.month)
  .sort((a, b) => (a.filledMonth ?? 0) - (b.filledMonth ?? 0) || a.id.localeCompare(b.id));

function prepareRefill(s: GameState, r: Run): GameState {
  const picks = firstFillBourbon(s).slice(0, N);
  let lost = 0;
  const done: string[] = [];
  for (const c of picks) {
    const before = c.contents!.volumeL;
    const u = applyAction(s, { type: 'unfillCask', caskId: c.id });
    if (u.error) continue;
    s = u.state;
    const lot = s.inventory.lots.at(-1)!; // unfillCask가 탱크에 새 로트를 넣는다
    lost += before - lot.volumeL;
    const f = applyAction(s, { type: 'fillCasks', lotId: lot.id, caskIds: [c.id], entryAbv: lot.abv });
    if (f.error) continue;
    s = f.state;
    done.push(c.id);
  }
  if (done.length) { const t = applyAction(s, { type: 'tagCasks', caskIds: done, add: [FLAGSHIP_RESERVE_TAG] }); if (!t.error) s = t.state; }
  refill.set(s.seed, new Set(done));
  r.xr = { casks: done, lostL: Math.round(lost * 10) / 10, activity: done.map((id) => Math.round((s.inventory.casks.find((c) => c.id === id)?.activity ?? 0) * 100) / 100) };
  return s;
}

/** 승리 출시 전(PICK개월째) 2차 채움 예비 통을 샘플로 맛본다(`sampleCask` — 사람이 쓸 수 있는 행동) → 아는 품질이 가장 좋은 통보다 DROP 넘게 낮은 통은 예비에서 뺀다 */
function pickBySample(s: GameState, r: Run): GameState {
  const ids = [...(refill.get(s.seed) ?? [])].filter((id) => s.inventory.casks.find((c) => c.id === id)?.contents);
  if (!ids.length) return s;
  const a = applyAction(s, { type: 'sampleCask', caskIds: ids });
  if (!a.error) s = a.state;
  const known = knownReads(s);
  const est = ids.map((id) => [id, known.get(id)?.estQuality] as const).filter((x): x is readonly [string, number] => x[1] != null);
  const best = Math.max(...est.map((x) => x[1]));
  const drop = est.filter((x) => x[1] < best - DROP).map((x) => x[0]);
  if (r.xr) r.xr.sampled = est.map(([id, q]) => [id, Math.round(q * 10) / 10]);
  // 게임 자동 예비(목재 긴 순)가 빈자리에 첫 채움 통을 채운다 → 승리 출시가 첫 채움 통을 섞는다. 사람처럼 그 자동 예비를 뗀다(떼면 reserveOptOut — 다시 붙지 않는다)
  const set = refill.get(s.seed)!;
  const autoFirst = [...reserveCaskIds(s)].filter((id) => !set.has(id));
  const off = [...drop, ...autoFirst];
  if (!off.length) return s;
  const t = applyAction(s, { type: 'tagCasks', caskIds: off, remove: [FLAGSHIP_RESERVE_TAG] });
  if (r.xr) { r.xr.untagged = [...(r.xr.untagged ?? []), ...drop]; r.xr.autoOff = autoFirst; }
  return t.error ? s : t.state;
}

/** [결정 #408] 판 처음 리필 통 주문 — 사람이 쓸 수 있는 행동(`buyCasks` refill) */
function orderRefill(s: GameState, r: Run): GameState {
  const cash = s.finance.cash;
  const a = applyAction(s, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: BUY_N, refill: true });
  if (a.error) { r.xr = { mode: 'buy', casks: [], lostL: 0, activity: [] }; return s; }
  buyArrive.set(s.seed, a.state.inventory.caskOrders.at(-1)!.arriveMonth);
  refill.set(s.seed, new Set());
  r.xr = { mode: 'buy', buyCost: cash - a.state.finance.cash, casks: [], lostL: 0, activity: [] };
  return a.state;
}

/** 도착한 리필 통(빈 · 1회 사용 · 활성도 < 1)에 탱크의 몰트 원액을 먼저 넣고 예비 꼬리표 — 도착 달부터 다 찰 때까지 */
function fillBought(s: GameState, r: Run): GameState {
  const at = buyArrive.get(s.seed);
  if (at == null || s.month < at) return s;
  const set = refill.get(s.seed)!;
  // 도착은 arriveMonth 달 결산(phasePrepare)이라 그다음 달 상태에 보인다 — 아직 다 못 잡았으면 빈 1회 사용 버번 통(이 무렵엔 리필 통뿐)을 BUY_N개까지 잡는다
  if (set.size < BUY_N) for (const c of s.inventory.casks) if (set.size < BUY_N && !set.has(c.id) && !c.contents && c.fills === 1 && c.activity < 0.99 && c.typeId === 'ex_bourbon_barrel') set.add(c.id);
  if (!set.size) return s;
  const empty = () => s.inventory.casks.filter((c) => set.has(c.id) && !c.contents && !c.contaminationKnown).map((c) => c.id);
  const done: string[] = [];
  for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) {
    const ids = empty();
    if (!ids.length) break;
    const f = applyAction(s, { type: 'fillCasks', lotId: lot.id, caskIds: ids, entryAbv: 0.635 });
    if (f.error) continue;
    done.push(...ids.filter((id) => f.state.inventory.casks.find((c) => c.id === id)?.contents));
    s = f.state;
  }
  if (done.length) {
    const t = applyAction(s, { type: 'tagCasks', caskIds: done, add: [FLAGSHIP_RESERVE_TAG] });
    if (!t.error) s = t.state;
    if (r.xr) { r.xr.casks.push(...done); r.xr.activity.push(...done.map((id) => Math.round((s.inventory.casks.find((c) => c.id === id)?.activity ?? 0) * 100) / 100)); }
  }
  if (set.size >= BUY_N && !empty().length) buyArrive.delete(s.seed); // 다 찼다 — 더 보지 않는다
  return s;
}

/** XR_LAUNCH=best — 아는 품질이 가장 좋은 예비 2차 채움 통(샘플 값, 없으면 목재 긴 통)이 적격인가. 예비 통이 없으면 true */
function bestReady(s: GameState): boolean {
  const set = refill.get(s.seed);
  const tagged = set ? s.inventory.casks.filter((c) => set.has(c.id) && c.contents && (c.contents.tagIds ?? []).includes(FLAGSHIP_RESERVE_TAG)) : [];
  if (!tagged.length) return !buyArrive.has(s.seed); // 산 통이 아직 안 찼으면 닫고, 예비가 아예 없으면 연다
  const known = knownReads(s);
  const best = [...tagged].sort((a, b) => (known.get(b.id)?.estQuality ?? -1) - (known.get(a.id)?.estQuality ?? -1) || b.contents!.oakMonths - a.contents!.oakMonths || a.id.localeCompare(b.id))[0]!;
  return caskEligibility(s, best).eligible;
}

function launchOk(s: GameState): boolean {
  if (LAUNCH === 'first') return s.progress.firstEligibleMonth != null && s.month - s.progress.firstEligibleMonth >= DELAY + 1;
  // 적격 통이 하나도 없으면 열지 않는다(문은 0개월째부터 매달 물어진다 — 예비가 생기기 전에 「예비 없음 → 연다」로 잘못 열리지 않게)
  if (!bestOpen.has(s.seed)) { if (!s.inventory.casks.some((c) => caskEligibility(s, c).eligible) || !bestReady(s)) return false; bestOpen.set(s.seed, s.month); }
  return s.month - bestOpen.get(s.seed)! >= DELAY;
}

/** 판 처음: 증류기 형태 · 셰리 벗 주문 · (buy) 리필 통 주문 */
function onCreate(s: GameState, r: Run): GameState {
  if (STILL_PRESET) for (const e of s.production.equipment) if ((EQUIPMENT as Record<string, { kind?: string }>)[e.catalogId]?.kind === 'still') e.stillShape = { ...STILL_PRESET.shape, ...SHAPE_OVERRIDE };
  if (SHERRY_N > 0) {
    const cash = s.finance.cash;
    const a = applyAction(s, { type: 'buyCasks', caskType: 'oloroso_butt', qty: SHERRY_N });
    if (!a.error) { s = a.state; sherry.set(s.seed, { set: new Set() }); r.sherry = { casks: [], cost: cash - s.finance.cash }; }
  }
  if (XR && MODE === 'buy') s = orderRefill(s, r);
  if (XR && MODE === 'refill' && XR_CASK === 'oloroso_butt') {
    const a = applyAction(s, { type: 'buyCasks', caskType: 'oloroso_butt', qty: BUTT_N });
    if (!a.error) { s = a.state; buttFill.set(s.seed, new Set()); }
  }
  return s;
}

/** XR_CASK=oloroso_butt: 도착한 새 벗(빈 · 0회 사용)에 몰트 로트를 먼저 넣는다(@hook:fill-lot) — XR_AT 전까지 */
function fillButt(s: GameState, lot: { id: string }): GameState | undefined {
  const set = buttFill.get(s.seed);
  if (!set || s.month >= AT) return undefined;
  for (const c of s.inventory.casks) if (set.size < BUTT_N && !set.has(c.id) && !c.contents && c.typeId === 'oloroso_butt' && c.fills === 0) set.add(c.id);
  const ids = s.inventory.casks.filter((c) => set.has(c.id) && !c.contents && !c.contaminationKnown).map((c) => c.id);
  if (!ids.length) return undefined;
  const f = applyAction(s, { type: 'fillCasks', lotId: lot.id, caskIds: ids, entryAbv: 0.635 });
  return f.error ? undefined : f.state;
}

/** P8 몰트 로트 통입 대신(@hook:fill-lot): 도착한 새 셰리 벗(빈 · 0회 사용)이 남아 있으면 이 로트를 먼저 넣는다. 다 찼으면 P8 그대로 */
function fillSherry(s: GameState, lot: { id: string }, r: Run): GameState | undefined {
  const sh = sherry.get(s.seed);
  if (!sh || sh.launched != null) return undefined;
  for (const c of s.inventory.casks) if (sh.set.size < SHERRY_N && !sh.set.has(c.id) && !c.contents && c.typeId === 'oloroso_butt' && c.fills === 0) sh.set.add(c.id);
  const ids = s.inventory.casks.filter((c) => sh.set.has(c.id) && !c.contents && !c.contaminationKnown).map((c) => c.id);
  if (!ids.length) return undefined;
  const f = applyAction(s, { type: 'fillCasks', lotId: lot.id, caskIds: ids, entryAbv: 0.635 });
  if (f.error) return undefined;
  if (r.sherry) r.sherry.casks = [...sh.set].filter((id) => f.state.inventory.casks.find((c) => c.id === id)?.contents);
  return f.state;
}

/** 모든 셰리 벗이 목재 180개월 → 「셰리 15년」 한 번에 병입(P8 bottleAs — 가격 · 납품 처리 그대로) */
function launchSherry(s: GameState, p: unknown, r: Run, api: { bottleAs: (s: GameState, p: any, comps: { source: 'lot' | 'cask'; id: string; liters: number }[], base: { name: string; targetAbv: number; bottleMl: number; chillFilter: boolean; packagingId: string }, cat: 'whisky') => GameState }): GameState {
  const sh = sherry.get(s.seed);
  if (!sh || sh.launched != null) return s;
  const all = s.inventory.casks.filter((c) => sh.set.has(c.id) && c.contents);
  if (!all.length || all.some((c) => c.contents!.oakMonths < SHERRY_AT)) return s;
  const casks = all.filter((c) => !c.contaminationKnown); // 사람과 같은 정보: 아는 오염(곰팡이 · TCA) 벗은 블렌드에서 뺀다(모르는 오염은 모른다)
  if (!casks.length) { sh.launched = -1; if (r.sherry) (r.sherry as Record<string, unknown>).allSpoiled = true; return s; }
  const before = s;
  s = api.bottleAs(s, p, casks.map((c) => ({ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL })), { name: '셰리 15년', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' }, 'whisky');
  if (s !== before) { sh.launched = s.month; if (r.sherry) { r.sherry.launch = s.month; (r.sherry as Record<string, unknown>).used = casks.length; const x = [...s.commerce.products].reverse().find((y) => y.name.startsWith('셰리 15년')); r.sherry.q = x?.quality; (r.sherry as Record<string, unknown>).name = x?.name; } }
  return s;
}

/** XR_REBOTTLE: 승리 뒤 남은 2차 채움 예비 통 하나(아는 품질 최고 · 적격 · 아는 오염 없음)를 새 제품으로 */
function rebottle(s: GameState, p: unknown, r: Run, api: { bottleAs: (s: GameState, p: any, comps: { source: 'lot' | 'cask'; id: string; liters: number }[], base: { name: string; targetAbv: number; bottleMl: number; chillFilter: boolean; packagingId: string }, cat: 'whisky') => GameState }): GameState {
  const set = refill.get(s.seed);
  if (!set) { rebottled.set(s.seed, -1); return s; }
  const known = knownReads(s);
  const cands = s.inventory.casks.filter((c) => set.has(c.id) && c.contents && !c.contaminationKnown && caskEligibility(s, c).eligible)
    .sort((a, b) => (known.get(b.id)?.estQuality ?? 0) - (known.get(a.id)?.estQuality ?? 0) || b.contents!.oakMonths - a.contents!.oakMonths);
  const c = cands[0];
  if (!c) { rebottled.set(s.seed, -1); return s; }
  const before = s;
  s = api.bottleAs(s, p, [{ source: 'cask', id: c.id, liters: c.contents!.volumeL }], { name: '리필 12년 B', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' }, 'whisky');
  rebottled.set(s.seed, s !== before ? s.month : -1);
  if (s !== before) (r as Run & { rebottle?: unknown }).rebottle = { month: s.month, cask: c.id, est: known.get(c.id)?.estQuality, q: [...s.commerce.products].reverse().find((x) => x.name.startsWith('리필 12년 B'))?.quality };
  return s;
}

const runOf = (s: GameState, p: { name: string }, seed: number): Run => {
  const pol = p.name.split(' ')[0]!;
  const k = `${pol}:${seed}`;
  const r = runs.get(k) ?? { pol, seed, target: (s.scenario?.equity ?? 0) * (s.scenario?.goal.netWorthMultiple ?? 0), retail: 0, nwEnd: 0, months: 0 };
  runs.set(k, r);
  return r;
};

setP8Hooks({
  ...((XR && MODE === 'buy') || (XR && XR_CASK === 'oloroso_butt') || STILL_PRESET || SHERRY_N > 0 ? {
    afterCreate: (s: GameState, p: { name: string }, seed: number) => onCreate(s, runOf(s, p, seed)),
    fillLot: (s: GameState, p: { name: string }, lot: { id: string }) => (buttFill.has(s.seed) ? fillButt(s, lot) : undefined) ?? (sherry.has(s.seed) ? fillSherry(s, lot, runOf(s, p, s.seed)) : undefined),
    beforeBottle: (s: GameState, p: { name: string }, _m: number, api: any) => {
      let t = s;
      if (buyArrive.has(t.seed)) t = fillBought(t, runOf(t, p, t.seed));
      if (sherry.has(t.seed)) t = launchSherry(t, p, runOf(t, p, t.seed), api);
      if (REBOTTLE && campaignWon(t) && !rebottled.has(t.seed)) t = rebottle(t, p, runOf(t, p, t.seed), api);
      return t === s ? undefined : t;
    },
  } : {}),
  afterFill: (s: GameState, p: { name: string }, m: number) => {
    if (STAFF_TASK && m === 13) { const d = s.hr.staff.find((x) => x.role === 'distiller'); const a = d ? applyAction(s, { type: 'assignStaffTask', staffId: d.id, task: STAFF_TASK }) : undefined; if (a && !a.error) s = a.state; }
    if (!XR) return STAFF_TASK && m === 13 ? s : undefined;
    if (m === AT && MODE === 'refill') return prepareRefill(s, runOf(s, p, s.seed));
    if (m === PICK) return pickBySample(s, runOf(s, p, s.seed));
    // 아는 오염(샘플 · 사건으로 드러난 것 — 사람과 같은 정보)이 생긴 2차 채움 통은 예비에서 뺀다 → 승리 출시가 깨끗한 통을 먼저 고른다
    const set = refill.get(s.seed);
    const bad = set ? s.inventory.casks.filter((c) => set.has(c.id) && c.contaminationKnown && (c.contents?.tagIds ?? []).includes(FLAGSHIP_RESERVE_TAG)).map((c) => c.id) : [];
    if (!bad.length) return STAFF_TASK && m === 13 ? s : undefined; // 13개월째 맡긴 일은 돌려줘야 이어진다
    const r = applyAction(s, { type: 'tagCasks', caskIds: bad, remove: [FLAGSHIP_RESERVE_TAG] });
    const run = runOf(s, p, s.seed);
    if (run.xr) run.xr.untagged = [...(run.xr.untagged ?? []), ...bad];
    return r.error ? undefined : r.state;
  },
  // 곧바로 출시 = 첫 적격 달(결산에 적힘)의 다음 달 → DELAY개월 미룸 = 그 달 + DELAY부터(판정 달 − 첫 적격 달 − 2 = DELAY — progress.ts sDelayMonths)
  ...(DELAY > 0 || (XR && LAUNCH === 'best') ? { launchGate: (s: GameState) => launchOk(s) } : {}),
  bottleSkip: (s: GameState, _p: unknown, c: Cask) => (XR && !campaignWon(s) && !!refill.get(s.seed)?.has(c.id)) || (sherry.get(s.seed)?.set.has(c.id) === true && sherry.get(s.seed)!.launched == null),
  afterMonth: (s: GameState, p: { name: string }, m: number, seed: number) => {
    const r = runOf(s, p, seed);
    r.retail += s.history.reports.at(-1)?.retailDealRevenue ?? 0;
    const v = s.progress.verdict;
    if (v && !r.v && v.result === 'heritage') {
      r.v = { month: v.month, nw: v.netWorth ?? netWorth(s), q: v.flagshipQuality, aw: v.awareness, grade: v.grade ?? undefined, sTarget: v.sNetWorthTarget, fe: s.progress.firstEligibleMonth };
      r.retailAtVerdict = r.retail;
      r.equip = s.production.equipment.map((e) => [e.catalogId, (EQUIPMENT as Record<string, { cost?: number }>)[e.catalogId]?.cost ?? 0, boughtMonthOf(e)]); // [#1014] 산 달 — readyMonth는 수리 때 덮어쓴다
      if (r.xr && bestOpen.has(seed)) r.xr.bestOpen = bestOpen.get(seed);
      if (r.xr) r.xr.usedAtWin = r.xr.casks.filter((id) => !s.inventory.casks.find((c) => c.id === id)?.contents).length; // 승리 달까지 비워진(병입된) 2차 채움 통 수
    }
    if (r.sherry?.launch != null && !(r.sherry as Record<string, unknown>).sale) { // 셰리 15년 첫 유료 일반 판매 달: 재판정 조건 셋을 그 달 값으로 남긴다(왜 S가 아닌지)
      const sh = s.history.reports.at(-1)?.saleEvents?.find((e) => e.kind !== 'b2b' && e.bottles > 0 && e.unitPrice > 0 && e.eligibleAtSale && e.productId === s.commerce.products.find((x) => x.name === (r.sherry as Record<string, unknown>).name)?.id);
      if (sh) (r.sherry as Record<string, unknown>).sale = { month: s.month, nw: netWorth(s, s.month), target: sNetWorthTarget(s, s.month), aw: +awarenessOf(s).toFixed(3) };
    }
    const bv = s.progress.verdictBest; // [결정 #422] 재판정으로 오른 등급(있으면)
    if (bv && !r.best) r.best = { grade: bv.grade ?? undefined, month: bv.rejudged.month, q: bv.flagshipQuality };
    if (s.status !== 'running' && r.status == null) { r.status = s.status; r.endMonth = m + 1; }
    r.nwEnd = netWorth(s);
    r.months = m + 1;
  },
  atEnd: () => {
    for (const r of runs.values()) console.log('#G ' + JSON.stringify({ mode: XR ? 'x0r' : 'base', tier: process.env.TIER, xrAt: AT, xrN: N, ...(DELAY ? { delay: DELAY } : {}), ...(XR ? { xrMode: MODE, launch: LAUNCH } : {}), ...(STAFF_TASK ? { staffTask: STAFF_TASK } : {}), ...(STILL_PRESET ? { still: STILL_PRESET.id } : {}), ...(process.env.XR_SHAPE ? { shape: SHAPE_OVERRIDE } : {}), ...(SHERRY_N ? { sherryN: SHERRY_N } : {}), ...(XR_CASK !== 'ex_bourbon_barrel' ? { xrCask: XR_CASK, buttN: BUTT_N } : {}), ...r }));
  },
});
process.env.P8 = '1';
process.env.TIER ??= 'standard';
await import('./mvp-human');
