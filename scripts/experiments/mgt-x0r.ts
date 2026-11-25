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
// 판마다 `#G {…}` 한 줄(grade-dist와 같은 칸 + 판정 달 설비 목록 `equip`([catalogId, 원가, 산 달 `boughtMonthOf`]) · 판 끝 상태 · X0-R 기록 `xr`)
import { setP8Hooks } from './p8Hooks';
import { applyAction } from '../../src/sim/actions';
import { EQUIPMENT } from '../../src/sim/content/catalog';
import { boughtMonthOf } from '../../src/sim/valuation';
import { netWorth } from '../../src/sim/progress';
import { campaignWon } from '../../src/sim/ledger';
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

type Verdict = { month: number; nw: number; q?: number; aw: number; grade?: string };
interface Run { pol: string; seed: number; target: number; v?: Verdict; retail: number; retailAtVerdict?: number; nwEnd: number; months: number; equip?: [string, number, number][]; status?: string; endMonth?: number; xr?: { casks: string[]; lostL: number; activity: number[]; usedAtWin?: number; untagged?: string[]; sampled?: [string, number][]; autoOff?: string[] } }
const runs = new Map<string, Run>();
const refill = new Map<number, Set<string>>(); // seed → 2차 채움 예비 통

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

const runOf = (s: GameState, p: { name: string }, seed: number): Run => {
  const pol = p.name.split(' ')[0]!;
  const k = `${pol}:${seed}`;
  const r = runs.get(k) ?? { pol, seed, target: (s.scenario?.equity ?? 0) * (s.scenario?.goal.netWorthMultiple ?? 0), retail: 0, nwEnd: 0, months: 0 };
  runs.set(k, r);
  return r;
};

setP8Hooks({
  afterFill: (s: GameState, p: { name: string }, m: number) => {
    if (!XR) return;
    if (m === AT) return prepareRefill(s, runOf(s, p, s.seed));
    if (m === PICK) return pickBySample(s, runOf(s, p, s.seed));
    // 아는 오염(샘플 · 사건으로 드러난 것 — 사람과 같은 정보)이 생긴 2차 채움 통은 예비에서 뺀다 → 승리 출시가 깨끗한 통을 먼저 고른다
    const set = refill.get(s.seed);
    const bad = set ? s.inventory.casks.filter((c) => set.has(c.id) && c.contaminationKnown && (c.contents?.tagIds ?? []).includes(FLAGSHIP_RESERVE_TAG)).map((c) => c.id) : [];
    if (!bad.length) return;
    const r = applyAction(s, { type: 'tagCasks', caskIds: bad, remove: [FLAGSHIP_RESERVE_TAG] });
    const run = runOf(s, p, s.seed);
    if (run.xr) run.xr.untagged = [...(run.xr.untagged ?? []), ...bad];
    return r.error ? undefined : r.state;
  },
  bottleSkip: (s: GameState, _p: unknown, c: Cask) => XR && !campaignWon(s) && !!refill.get(s.seed)?.has(c.id),
  afterMonth: (s: GameState, p: { name: string }, m: number, seed: number) => {
    const r = runOf(s, p, seed);
    r.retail += s.history.reports.at(-1)?.retailDealRevenue ?? 0;
    const v = s.progress.verdict;
    if (v && !r.v && v.result === 'heritage') {
      r.v = { month: v.month, nw: v.netWorth ?? netWorth(s), q: v.flagshipQuality, aw: v.awareness, grade: v.grade ?? undefined };
      r.retailAtVerdict = r.retail;
      r.equip = s.production.equipment.map((e) => [e.catalogId, (EQUIPMENT as Record<string, { cost?: number }>)[e.catalogId]?.cost ?? 0, boughtMonthOf(e)]); // [#1014] 산 달 — readyMonth는 수리 때 덮어쓴다
      if (r.xr) r.xr.usedAtWin = r.xr.casks.filter((id) => !s.inventory.casks.find((c) => c.id === id)?.contents).length; // 승리 달까지 비워진(병입된) 2차 채움 통 수
    }
    if (s.status !== 'running' && r.status == null) { r.status = s.status; r.endMonth = m + 1; }
    r.nwEnd = netWorth(s);
    r.months = m + 1;
  },
  atEnd: () => {
    for (const r of runs.values()) console.log('#G ' + JSON.stringify({ mode: XR ? 'x0r' : 'base', tier: process.env.TIER, xrAt: AT, xrN: N, ...r }));
  },
});
process.env.P8 = '1';
process.env.TIER ??= 'standard';
await import('./mvp-human');
