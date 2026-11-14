// 실험 B — 샘플링의 가치 (REQ-PROD-4, docs/design/prod-stage-t.md 「요구사항」 실험 명세 B · G08-PROD-1)
// 판정용 봇 P8(`mvp-human.ts`, MGT 소유)을 **고치지 않는다.** P8의 이름 붙은 끼움 자리(`p8Hooks.ts` — policies·run·after-create·cask-order·before-whisky-bottle·after-month·at-end)에
// "샘플 정보를 쓰는 결정"만 건다. 병입·보호 통은 P8 도우미(`api.bottleAs`·`api.keptCasks`)를 부른다 — P8 함수를 베끼지 않는다. 글자 패치 방식에서 2026-11-14에 옮겼다(출력 바이트 동일).
//
// 기준: P8 X19(X0 + 플래그십 병입) — 시나리오 게임은 자동 샘플이 기본으로 켜져 있다(매 턴 여력만큼, #201). P8은 샘플 정보를 어떤 결정에도 쓰지 않는다(통을 숙성 연수로만 고른다).
// 경로(정책 필드 samp):
//   BS1 = X19 그대로(자동 샘플 기본 — 정보는 쌓이지만 결정에 쓰지 않는다)
//   BS0 = 자동 샘플 끔 — "필수 클릭" 실패 모드: 샘플 없이도 같은 판이 되는가
//   BF  = 플래그십 예비(보호) 통과 플래그십 병입 통을 추정 품질 높은 순으로(기록 없으면 −1 → 숙성 연수 순)
//   BR  = 알려진 레어 통(rareKnown)을 36개월이 차면 단독 병입(「레어 싱글 캐스크」 — 게임이 rareSingleCask 표기를 붙인다)
//   BH  = 핸드필 통을 추정 품질 높은 순으로(지금은 가장 어린 통)
//   BA  = BF + BR + BH
//   BA0 = BA + 자동 샘플 끔 — 같은 규칙을 정보 없이(정보의 값 = BA − BA0)
// 실행: npx tsx scripts/experiments/prod-sample-p8.ts [시드=10] [개월=180]   (TIER 기본 standard, 이벤트 켬 — P8과 같다)
//   METRICS=1 이면 P8 판정 지표(플래그십·등급 S/A/B/C/F)를 같이 낸다 · ONLY=BS1,BF,…
//   끝에 PAIRED(같은 시드 순자산 짝 비교)와 SAMPLE 표(레어 발견·레어 단독 병입·그 매출·핸드필 매출·자동 샘플 비용)
import { applyAction, type GameState } from '../../src/sim';
import { knownReads } from '../../src/sim/blendTable';
import type { Cask } from '../../src/sim/types';
import { setP8Hooks } from './p8Hooks';

type Samp = { off?: boolean; flag?: boolean; rare?: boolean; hand?: boolean };
/** P8 Policy에서 이 래퍼가 읽는 것 — 이름과 래퍼 고유 값(`ext.samp`) */
type P = { name: string; lineup?: number; flagship?: boolean; ext?: { samp?: Samp } };
type R = { nw: number };

/** 추정 품질(샘플 기록 — 자기 기록 → 형제 기록), 기록이 없으면 −1 */
const est = (s: GameState) => { const k = knownReads(s); return (c: { id: string }) => k.get(c.id)?.estQuality ?? -1; };
const SAMPSTAT = new Map<string, { rare: Set<string>; rareBottled: number; rareRev: number; handRev: number; sampleCost: number }>();
let SAMPKEY = '';
const NAMES = ['BS1', 'BS0', 'BF', 'BR', 'BH', 'BA', 'BA0'];
const samp = (p: P) => p.ext?.samp;

setP8Hooks<P, R>({
  // 경로 — P8 정책 목록 앞에, 이 경로들만 돈다
  policies: (list, make) => [
    make('BS1 X19 그대로(자동 샘플 기본)', { flagship: true }),
    make('BS0 자동 샘플 끔', { flagship: true, ext: { samp: { off: true } } }),
    make('BF 플래그십 통을 추정 품질로', { flagship: true, ext: { samp: { flag: true } } }),
    make('BR 알려진 레어 통 단독 병입', { flagship: true, ext: { samp: { rare: true } } }),
    make('BH 핸드필 통을 추정 품질로', { flagship: true, ext: { samp: { hand: true } } }),
    make('BA BF + BR + BH', { flagship: true, ext: { samp: { flag: true, rare: true, hand: true } } }),
    make('BA0 BA + 자동 샘플 끔(정보 없이 같은 규칙)', { flagship: true, ext: { samp: { off: true, flag: true, rare: true, hand: true } } }),
    ...list,
  ],
  run: (list) => list.filter((p) => NAMES.includes(p.name.split(' ')[0]!)),
  // 판 시작 — 자동 샘플 끄기
  afterCreate: (s, p, seed) => {
    SAMPKEY = `${p.name}|${seed}`;
    const r = samp(p)?.off ? applyOff(s) : undefined;
    return r;
  },
  // 플래그십 — 예비(보호) 통과 병입 통을 추정 품질 순으로 · 핸드필 — 추정 품질 높은 통. 후보·개수는 P8이 정하고 순서만 바꾼다
  caskOrder: (s, p, purpose) => {
    const e = est(s);
    if ((purpose === 'kept' || purpose === 'flagship') && samp(p)?.flag) return (a: Cask, b: Cask) => e(b) - e(a) || b.contents!.oakMonths - a.contents!.oakMonths;
    if (purpose === 'handfill' && samp(p)?.hand) return (a: Cask, b: Cask) => e(b) - e(a) || a.contents!.oakMonths - b.contents!.oakMonths;
    return undefined;
  },
  // 레어 — 알려진 레어 통을 36개월이 차면 단독 병입(위스키 병입 앞)
  beforeWhiskyBottle: (s0, p, api) => {
    if (!samp(p)?.rare) return undefined;
    let s = s0;
    const keep = api.keptCasks(s, p);
    for (const c of s.inventory.casks.filter((x) => x.contents && !x.owner && !x.handfill && x.rare && x.rareKnown && x.contents.kind === 'malt' && x.contents.oakMonths >= 36 && !keep.has(x.id))) {
      const before = s.commerce.products.length;
      s = api.bottleAs(s, { ...p, lineup: undefined }, [{ source: 'cask', id: c.id, liters: c.contents!.volumeL }], { name: `레어 싱글 캐스크 ${c.id}`, targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' }, 'whisky');
      if (s.commerce.products.length > before) { const b = SAMPSTAT.get(SAMPKEY); if (b) b.rareBottled++; }
    }
    return s;
  },
  // 매달 기록 — 레어 발견(통), 레어 단독 제품 매출, 핸드필 매출(결산 메모), 자동 샘플 비용
  afterMonth: (s) => {
    const b = SAMPSTAT.get(SAMPKEY) ?? { rare: new Set<string>(), rareBottled: 0, rareRev: 0, handRev: 0, sampleCost: 0 };
    const r = s.history.reports.at(-1);
    for (const c of s.inventory.casks) if (c.rare && c.rareKnown) b.rare.add(`${c.id}|${c.filledMonth ?? -1}`);
    if (r) {
      const rareIds = new Set(s.commerce.products.filter((x) => x.rareSingleCask).map((x) => x.id));
      for (const x of r.sales) if (rareIds.has(x.productId)) b.rareRev += x.revenue;
      for (const n of r.notes) { const mm = n.match(/^핸드필 \d+병 \(([\d,]+)원\)/); if (mm) b.handRev += Number(mm[1]!.replace(/,/g, '')); }
      b.sampleCost += r.expenses['자동 샘플'] ?? 0;
    }
    SAMPSTAT.set(SAMPKEY, b);
  },
  // 끝 — 짝 비교와 샘플 표
  atEnd: (ALL) => {
    const nw = new Map<string, number[]>();
    for (const [k, rows] of ALL) nw.set(k.split(' ')[0]!, rows.map((r) => r.nw));
    const pair = (a: string, b: string) => {
      const x = nw.get(a), y = nw.get(b);
      if (!x || !y) return;
      const d = x.map((v, i) => v - y[i]!).filter(Number.isFinite);
      if (d.length < 2) { console.log(`PAIRED ${a} − ${b}: 생존 판 부족`); return; }
      const m = d.reduce((t, v) => t + v, 0) / d.length, sd = Math.sqrt(d.reduce((t, v) => t + (v - m) ** 2, 0) / (d.length - 1));
      console.log(`PAIRED ${a} − ${b}: ${(m / 1e8).toFixed(2)}억 · t ${sd > 0 ? (m / (sd / Math.sqrt(d.length))).toFixed(1) : '—'} · 이긴 시드 ${d.filter((v) => v > 0).length}/${d.length}`);
    };
    for (const a of ['BS0', 'BF', 'BR', 'BH', 'BA']) pair(a, 'BS1');
    pair('BA', 'BA0');
    const by = new Map<string, { rare: Set<string>; rareBottled: number; rareRev: number; handRev: number; sampleCost: number }[]>();
    for (const [k, v] of SAMPSTAT) { const n = k.split('|')[0]!.split(' ')[0]!; by.set(n, [...(by.get(n) ?? []), v]); }
    console.log('\n### SAMPLE — 경로별 판 평균');
    console.log('| 경로 | 레어 발견(통) | 레어 단독 병입(제품) | 레어 단독 매출 | 핸드필 매출 | 자동 샘플 비용 |\n|---|---|---|---|---|---|');
    const av = (v: number[]) => v.reduce((t, x) => t + x, 0) / Math.max(1, v.length);
    for (const [n, v] of by) console.log(`| ${n} | ${av(v.map((x) => x.rare.size)).toFixed(1)} | ${av(v.map((x) => x.rareBottled)).toFixed(1)} | ${(av(v.map((x) => x.rareRev)) / 1e8).toFixed(2)}억 | ${(av(v.map((x) => x.handRev)) / 1e8).toFixed(2)}억 | ${(av(v.map((x) => x.sampleCost)) / 1e8).toFixed(2)}억 |`);
  },
});

/** 자동 샘플 끄기 — P8의 act와 같다(오류면 상태 그대로) */
function applyOff(s: GameState): GameState { return applyAction(s, { type: 'setAutoSample', settings: { off: true } }).state; }

process.env.P8 = '1';
process.env.TIER ??= 'standard';
await import('./mvp-human'); // 끼움 자리는 프로세스에 하나 — 등록한 뒤에 P8을 읽는다
