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
// 판마다 `#G {…}` 한 줄(grade-dist와 같은 칸 + 판정 달 설비 목록 `equip`([catalogId, 원가, 산 달 `boughtMonthOf`]) · 판 끝 상태 · X0-R 기록 `xr`)
import { setP8Hooks } from './p8Hooks';
import { applyAction } from '../../src/sim/actions';
import { EQUIPMENT } from '../../src/sim/content/catalog';
import { boughtMonthOf } from '../../src/sim/valuation';
import { netWorth } from '../../src/sim/progress';
import { campaignWon, caskEligibility } from '../../src/sim/ledger';
import { FLAGSHIP_RESERVE_TAG, reserveCaskIds } from '../../src/sim/tags';
import { knownReads } from '../../src/sim/blendTable';
import type { GameState } from '../../src/sim';
import type { Cask } from '../../src/sim/types';

const XR = process.env.XR === '1';
const AT = Number(process.env.XR_AT ?? 3);
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

type Verdict = { month: number; nw: number; q?: number; aw: number; grade?: string; sTarget?: number; fe?: number };
interface Run { pol: string; seed: number; target: number; v?: Verdict; retail: number; retailAtVerdict?: number; nwEnd: number; months: number; equip?: [string, number, number][]; status?: string; endMonth?: number; xr?: { mode?: string; buyCost?: number; casks: string[]; lostL: number; activity: number[]; bestOpen?: number; usedAtWin?: number; untagged?: string[]; sampled?: [string, number][]; autoOff?: string[] } }
const runs = new Map<string, Run>();
const refill = new Map<number, Set<string>>(); // seed → 2차 채움 예비 통
const buyArrive = new Map<number, number>(); // seed → 리필 통 도착 달(buy)
const bestOpen = new Map<number, number>(); // seed → best 문이 처음 열린 달

/** XR_AT 전에 통입한 첫 채움 버번 배럴 — 통입 이른 순 · id 순 */
const firstFillBourbon = (s: GameState): Cask[] => s.inventory.casks
  .filter((c) => c.contents && !c.owner && c.typeId === 'ex_bourbon_barrel' && c.contents.kind === 'malt' && c.activity >= 0.99 && (c.filledMonth ?? s.month) < s.month)
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

const runOf = (s: GameState, p: { name: string }, seed: number): Run => {
  const pol = p.name.split(' ')[0]!;
  const k = `${pol}:${seed}`;
  const r = runs.get(k) ?? { pol, seed, target: (s.scenario?.equity ?? 0) * (s.scenario?.goal.netWorthMultiple ?? 0), retail: 0, nwEnd: 0, months: 0 };
  runs.set(k, r);
  return r;
};

setP8Hooks({
  ...(XR && MODE === 'buy' ? {
    afterCreate: (s: GameState, p: { name: string }, seed: number) => orderRefill(s, runOf(s, p, seed)),
    beforeBottle: (s: GameState, p: { name: string }) => (buyArrive.has(s.seed) ? fillBought(s, runOf(s, p, s.seed)) : undefined),
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
  bottleSkip: (s: GameState, _p: unknown, c: Cask) => XR && !campaignWon(s) && !!refill.get(s.seed)?.has(c.id),
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
    if (s.status !== 'running' && r.status == null) { r.status = s.status; r.endMonth = m + 1; }
    r.nwEnd = netWorth(s);
    r.months = m + 1;
  },
  atEnd: () => {
    for (const r of runs.values()) console.log('#G ' + JSON.stringify({ mode: XR ? 'x0r' : 'base', tier: process.env.TIER, xrAt: AT, xrN: N, ...(DELAY ? { delay: DELAY } : {}), ...(XR ? { xrMode: MODE, launch: LAUNCH } : {}), ...(STAFF_TASK ? { staffTask: STAFF_TASK } : {}), ...r }));
  },
});
process.env.P8 = '1';
process.env.TIER ??= 'standard';
await import('./mvp-human');
