// PROD-A 장기 숙성 투자 모델 — 2층: 판 단위 5경로 (requirements-audit.md §5 PROD-A, 결정 #273 · docs/design/prod-stage-t.md 「요구사항」 REQ-PROD-1·3)
// 판정용 봇 P8(`mvp-human.ts`, MGT 소유)을 **고치지 않는다.** 실행할 때 P8 원본을 읽어 "통 보유 규칙"만 덧붙인 사본을 만들어 돌리고 지운다.
// MGT가 P8에 보유 훅(hold)을 넣으면 이 래퍼는 지운다(prod-stage-t.md 「MGT에 요청」). P8 원본이 바뀌어 붙일 자리가 없으면 바로 멈춘다(조용히 틀린 값을 내지 않는다).
//
// 보유 규칙(hold): 통이 at개월(기본 36)이 되면 그달 같은 나이가 된 통 묶음에서 share만큼을 "장기"로 정한다(몫은 소수까지 다음 달로 넘겨 경로끼리 같은 수).
//   select 'any' = 통 번호 순(품질 무관) · 'sample' = 묶음을 모두 샘플(통당 3만 원)해 추정 품질 높은 순 · 'cool' = 숙성고 칸이 서늘한(아래 단) 순(CP-MGT-1). 장기 통은 age개월(기본 120)이 되면
//   「싱글 몰트 10년」 계열로 병입(그 계열 재고 600병 밑일 때 한 달 3통까지). 장기 통은 일반 병입(3년 계열)에서 빠진다. 나머지는 P8 X0 그대로.
//
// 실행: npx tsx scripts/experiments/prod-hold-p8.ts [시드=10] [개월=180]   (TIER 기본 standard, 이벤트 켬 — P8과 같다)
//   ONLY=HA,HC,...   돌릴 경로(기본 아래 표 전부) · SPLIT=1 순자산 나누기 표(P8 그대로)
//   끝에 PAIRED 줄: 같은 시드끼리 순자산 차이 평균·t·이긴 시드 수, HELD 줄: 경로별 장기 지정 통 수(판 평균)
//   SUPPLY=1  장기 계열의 공급 지평(src/sim/economics.ts supplyHorizon) 경로별 평균 — 진단만(판 결과 불변)
//   DCF=1     실험 A 할인값(MGT-C capitalCost.ts — 같은 시드 짝 증분 현금흐름의 NPV 띠·marginal·IRR)과 경로별 증발 리터·LPA
//   PRICE=1   AUTO-PRICE-3 장기 숙성 조건 — 보유 3종(HC·HS·HSF) × 가격 정책(#200·B′+가드·C 1.3·C 1.5), 장기 계열만 정책을 거는 「-L」 경로 포함. MKT 손잡이(mktP8Hooks.ts, PR #324) 필요
//             식 v1 위에서: SCRIPT=prod-hold-p8.ts PRICE=1 V=c3+s4m1.08+k npx tsx scripts/experiments/mkt-b1.ts 10 180
// 보유 규칙은 P8의 이름 붙은 끼움 자리(`p8Hooks.ts`)에 건다 — policies·run·before-whisky-bottle(`api.bottleAs`)·bottle-skip·after-month·at-end.
//   글자 패치 방식(prodHoldPatch.ts)에서 2026-11-14에 옮겼다(출력 바이트 동일). PRICE=1은 MKT 손잡이(mktP8Hooks.ts — 등록 없는 함수 묶음)를 같은 등록 안에서 부른다
import { applyAction, netWorth, type GameState } from '../../src/sim';
import { knownReads } from '../../src/sim/blendTable';
import { supplyHorizon } from '../../src/sim/economics';
import type { Cask } from '../../src/sim/types';
import * as dcf from './capitalCost';
import * as mkt from './mktP8Hooks';
import { setP8Hooks, type P8Hooks } from './p8Hooks';

export const LONG_LINE_NAME = '싱글 몰트 10년';
type Hold = { age: number; share: number; select: 'any' | 'sample' | 'cool'; at?: number; stopAt?: number };
/** P8 Policy에서 이 래퍼가 읽는 것 — 래퍼 고유 값은 `ext`(hold · longPrice) */
type P = { name: string; autoPrice?: boolean; pricePolicy?: unknown; engineA?: boolean; ext?: { hold?: Hold; longPrice?: Record<string, unknown> } };
type R = { nw: number };
const PRICE = !!process.env.PRICE;
const hold = (p: P) => p.ext?.hold;
const longPrice = (p: P) => p.ext?.longPrice;
/** 장기 계열에만 거는 정책 — P8 정책 위에 longPrice를 얹고 자동 가격을 끈 것(MKT 손잡이가 읽는다) */
const longPol = (p: P) => ({ ...p, ...longPrice(p), autoPrice: false });

// 상태 — 통별 장기 지정 · 남은 몫 · 지정 통 수
const HOLD = new Map<string, boolean>(); const HOLDN = new Map<string, number>(); const HOLDSTAT = new Map<string, number>();
const holdKey = (p: P, s: GameState, c: { id: string; filledMonth?: number }) => `${p.name}|${s.seed}|${c.id}|${c.filledMonth ?? -1}`;

// ── 경로 ──
const H = (o: Hold) => ({ ext: { hold: o } });
const PATHS: [string, Record<string, unknown>][] = [
  ['HA 전량 3년(= X0)', {}],
  ['HB 전량 6년(43개월부터 72개월↑만 병입)', { labelFrom: [43, 72] }],
  ['HC 25% 장기(품질 무관, 3년에 정함)', H({ age: 120, share: 0.25, select: 'any' })],
  ['HD 25% 장기(3년 샘플 상위)', H({ age: 120, share: 0.25, select: 'sample' })],
  ['HE 전량 장기(10년)', H({ age: 120, share: 1, select: 'any' })],
  ['HC72 25% 장기(품질 무관, 6년에 정함)', H({ age: 120, share: 0.25, select: 'any', at: 72 })],
  ['HD72 25% 장기(6년 샘플 상위)', H({ age: 120, share: 0.25, select: 'sample', at: 72 })],
  ['HS 25% 장기(서늘한 칸, 3년에 정함)', H({ age: 120, share: 0.25, select: 'cool' })],
  ['HA6 6배치 · 전량 3년', { maltB: 6 }],
  ['HS6 6배치 · 25% 장기(서늘한 칸, 3년)', { maltB: 6, ...H({ age: 120, share: 0.25, select: 'cool' }) }],
  ['HS672 6배치 · 25% 장기(서늘한 칸, 6년)', { maltB: 6, ...H({ age: 120, share: 0.25, select: 'cool', at: 72 }) }],
  ['HC6 6배치 · 25% 장기(품질 무관, 3년)', { maltB: 6, ...H({ age: 120, share: 0.25, select: 'any' }) }],
  ['HD6 6배치 · 25% 장기(3년 샘플 상위)', { maltB: 6, ...H({ age: 120, share: 0.25, select: 'sample' }) }],
  ['HC672 6배치 · 25% 장기(품질 무관, 6년)', { maltB: 6, ...H({ age: 120, share: 0.25, select: 'any', at: 72 }) }],
  ['HD672 6배치 · 25% 장기(6년 샘플 상위)', { maltB: 6, ...H({ age: 120, share: 0.25, select: 'sample', at: 72 }) }],
];
// PRICE=1 — AUTO-PRICE-3 장기 숙성 조건(MKT 요청, 결정 대기 66 (d)): 장기 보유 3종 × 가격 정책. 「…-L…」 경로는 장기 계열(「싱글 몰트 10년」)에만 그 정책을 건다
//   보유: HC 품질 무관 · HS 서늘한 칸 · HSF 서늘한 칸 + 48개월부터 장기 지정 중단(유한 재고형 — 보충이 끊긴다)
//   정책: A = #200(P-MKT-31 A) · B2g = B′ + 가드 0.1 · C13 = C 목표 1.3 · C15 = C 목표 1.5 · B2 = 가드 없는 B′ · B2g3 = 가드 + 지평 3개월
const PRICE_PATHS: [string, Record<string, unknown>][] = [];
{
  const HOLDS: [string, Hold][] = [['HC', { age: 120, share: 0.25, select: 'any' }], ['HS', { age: 120, share: 0.25, select: 'cool' }], ['HSF', { age: 120, share: 0.25, select: 'cool', stopAt: 48 }]];
  const POLS: [string, Record<string, unknown> | null][] = [['A', null], ['B2g', { price: 'profit2', guard: 0.1 }], ['C13', { price: 'premium', anchor: 1.3 }], ['C15', { price: 'premium', anchor: 1.5 }],
    ['B2', { price: 'profit2' }], ['B2g3', { price: 'profit2', guard: 0.1, horizon: 3 }]];
  for (const [hk, h] of HOLDS) {
    for (const [pk, pv] of POLS) PRICE_PATHS.push([`${hk}-${pk} 장기 25%(${hk}) · 전체 ${pk}`, { ext: { hold: h }, ...(pv ? { autoPrice: false, ...pv } : {}) }]);
    if (hk !== 'HC') for (const [pk, pv] of POLS.slice(1)) PRICE_PATHS.push([`${hk}-L${pk} 장기 25%(${hk}) · 장기 계열만 ${pk}`, { ext: { hold: h, longPrice: pv! } }]);
  }
}
const PRICE_NAMES = PRICE_PATHS.map(([n]) => n.split(' ')[0]!);

// SUPPLY=1 · DCF=1 기록
const SUPPLYSTAT = new Map<string, { n: number; months: number; gap: number; ready: number; soon: number }>();
const DCFS = new Map<string, { e: number[]; nw: number; r: number[]; evapL: number; evapLPA: number }>();
let ABV = 0;

const hooks: P8Hooks<P, R> = {
  policies: (list, make) => [...(PRICE ? PRICE_PATHS : PATHS).map(([n, o]) => make(n, o as never)), ...list],
  // P8의 ONLY 필터는 이미 걸린 목록을 받는다 — ONLY가 없으면 이 래퍼의 경로만 돈다
  run: (list) => list.filter((p) => (PRICE ? PRICE_NAMES.includes(p.name.split(' ')[0]!) : /^H[A-ES]/.test(p.name))),
  // 병입 — 장기 지정·장기 계열 병입을 위스키 병입 앞에
  beforeWhiskyBottle: (s0, p, api) => {
    const h = hold(p);
    if (!h) return undefined;
    let s = s0;
    const pk = `${p.name}|${s.seed}`;
    const key = (c: { id: string; filledMonth?: number }) => `${pk}|${c.id}|${c.filledMonth ?? -1}`;
    const cohort = s.inventory.casks.filter((c) => c.contents && !c.owner && c.contents.kind === 'malt' && c.contents.oakMonths >= (h.at ?? 36) && !HOLD.has(key(c)));
    if (cohort.length) {
      const quota = h.stopAt != null && s.month >= h.stopAt ? 0 : (HOLDN.get(pk) ?? 0) + h.share * cohort.length; // stopAt: 그 달부터 장기 지정을 멈춘다(유한 재고형 장기 계열)
      const k = Math.min(cohort.length, Math.floor(quota + 1e-9));
      HOLDN.set(pk, quota - k);
      let order = [...cohort].sort((a, b) => a.id.localeCompare(b.id));
      if (h.select === 'cool') order = [...cohort].sort((a, b) => (a.slot?.tier ?? 9) - (b.slot?.tier ?? 9) || a.id.localeCompare(b.id));
      if (h.select === 'sample' && h.share < 1) {
        const est = new Map<string, number>();
        for (const c of cohort) { const r = applyAction(s, { type: 'sampleCask', caskIds: [c.id] }); if (!r.error) s = r.state; est.set(c.id, knownReads(s).get(c.id)?.estQuality ?? -1); }
        order = [...cohort].sort((a, b) => est.get(b.id)! - est.get(a.id)! || a.id.localeCompare(b.id));
      }
      const longIds = new Set(order.slice(0, k).map((c) => c.id));
      for (const c of cohort) { HOLD.set(key(c), longIds.has(c.id)); if (longIds.has(c.id)) HOLDSTAT.set(pk, (HOLDSTAT.get(pk) ?? 0) + 1); }
    }
    const longReady = s.inventory.casks.filter((c) => c.contents && c.contents.kind === 'malt' && HOLD.get(key(c)) && c.contents.oakMonths >= h.age).slice(0, 3);
    const stock10 = s.commerce.products.filter((x) => x.name.startsWith(LONG_LINE_NAME)).reduce((a, x) => a + x.stockBottles, 0);
    if (longReady.length && stock10 < 600) s = api.bottleAs(s, p, longReady.map((c) => ({ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL })), { name: LONG_LINE_NAME, targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' }, 'whisky');
    return s;
  },
  // 장기 통은 일반 병입에서 뺀다
  bottleSkip: (s, p, c: Cask) => !!(hold(p) && HOLD.get(holdKey(p, s, c))),
  beforeAdvance: (s) => {
    if (!process.env.DCF) return;
    let l = 0, a = 0;
    for (const c of s.inventory.casks) if (c.contents) { l += c.contents.volumeL; a += c.contents.volumeL * c.contents.abv; }
    ABV = l > 0 ? a / l : 0;
  },
  afterMonth: (s, p, _m, seed) => {
    // SUPPLY=1 — 장기 계열의 공급 지평(economics.ts supplyHorizon, [결정 #291] P-PROD-54)을 매달 잰다(진단 — 결과 불변)
    if (process.env.SUPPLY) for (const x of s.commerce.products.filter((y) => y.name.startsWith(LONG_LINE_NAME) && y.stockBottles > 0)) { const h = supplyHorizon(s, x); const k = p.name.split(' ')[0]!; const b = SUPPLYSTAT.get(k) ?? { n: 0, months: 0, gap: 0, ready: 0, soon: 0 }; SUPPLYSTAT.set(k, { n: b.n + 1, months: b.months + Math.min(60, h.months), gap: b.gap + (h.refillGap ? 1 : 0), ready: b.ready + h.readyBottles, soon: b.soon + h.soonBottles }); }
    // DCF=1 — 실험 A 할인값(REQ-PROD-1 · MGT-C P-MGT-30): 같은 시드 짝의 증분 현금흐름. 증발 LPA는 결산 전 통 원액의 LPA 가중 평균 도수로 환산(근사)
    if (process.env.DCF) { const k = `${p.name}|${seed}`; const d = DCFS.get(k) ?? { e: [s.scenario ? s.scenario.equity : 0], nw: 0, r: [] as number[], evapL: 0, evapLPA: 0 }; const ev = s.history.reports.at(-1)?.angelsShareL ?? 0; d.e.push(s.finance.cash - s.finance.loans.reduce((t, l) => t + l.balance, 0)); d.nw = netWorth(s); d.r.push(dcf.discountRate(s, 'marginal')); d.evapL += ev; d.evapLPA += ev * ABV; DCFS.set(k, d); }
  },
  atEnd: (ALL) => {
    if (PRICE) {
      mkt.report();
      const nw = new Map<string, number[]>();
      for (const [k, rows] of ALL) nw.set(k.split(' ')[0]!, rows.map((r) => r.nw));
      for (const [k, x] of nw) {
        const base = nw.get(k.split('-')[0] + '-A');
        if (!base || k.endsWith('-A')) continue;
        const d = x.map((v, i) => v - base[i]!).filter(Number.isFinite);
        if (d.length < 2) { console.log(`PAIRED ${k} − A: 생존 판 부족`); continue; }
        const mm = d.reduce((t, v) => t + v, 0) / d.length, sd = Math.sqrt(d.reduce((t, v) => t + (v - mm) ** 2, 0) / (d.length - 1));
        console.log(`PAIRED ${k} − ${k.split('-')[0]}-A: ${(mm / 1e8).toFixed(2)}억 · t ${(mm / (sd / Math.sqrt(d.length))).toFixed(1)} · 이긴 시드 ${d.filter((v) => v > 0).length}/${d.length}`);
      }
    } else {
      const nw = new Map<string, number[]>();
      for (const [k, rows] of ALL) nw.set(k.split(' ')[0]!, rows.map((r) => r.nw));
      const pair = (a: string, b: string) => {
        const x = nw.get(a), y = nw.get(b);
        if (!x || !y) return;
        const d = x.map((v, i) => v - y[i]!).filter(Number.isFinite);
        if (d.length < 2) { console.log(`PAIRED ${a} − ${b}: 생존 판 부족`); return; }
        const m = d.reduce((t, v) => t + v, 0) / d.length, sd = Math.sqrt(d.reduce((t, v) => t + (v - m) ** 2, 0) / (d.length - 1));
        console.log(`PAIRED ${a} − ${b}: ${(m / 1e8).toFixed(2)}억 · t ${(m / (sd / Math.sqrt(d.length))).toFixed(1)} · 이긴 시드 ${d.filter((v) => v > 0).length}/${d.length}`);
      };
      for (const [a, b] of [['HC', 'HA'], ['HD', 'HA'], ['HD', 'HC'], ['HS', 'HC'], ['HC72', 'HA'], ['HD72', 'HC72'], ['HC6', 'HA6'], ['HD6', 'HC6'], ['HS6', 'HC6'], ['HC672', 'HA6'], ['HD672', 'HC672'], ['HS672', 'HC672']] as const) pair(a, b);
      const held = new Map<string, number[]>();
      for (const [k, v] of HOLDSTAT) { const n = k.split('|')[0]!.split(' ')[0]!; held.set(n, [...(held.get(n) ?? []), v]); }
      console.log('HELD ' + [...held].map(([n, v]) => `${n} ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}통`).join(' · '));
    }
    if (process.env.SUPPLY) console.log(`SUPPLY ${LONG_LINE_NAME} 계열(재고 있는 제품·달 평균, 지평은 60개월에서 자름) ` + [...SUPPLYSTAT].map(([k, v]) => `${k} 지평 ${(v.months / v.n).toFixed(1)}개월 · 지금 채울 병 ${(v.ready / v.n).toFixed(0)} · 곧 닿는 병 ${(v.soon / v.n).toFixed(0)} · 보충 끊김 ${((100 * v.gap) / v.n).toFixed(0)}%`).join(' | '));
    if (process.env.DCF) {
      const runs = new Map<string, Map<number, { e: number[]; nw: number; r: number[]; evapL: number; evapLPA: number }>>();
      for (const [k, v] of DCFS) { const [name, seed] = k.split('|'); const id = name!.split(' ')[0]!; if (!runs.has(id)) runs.set(id, new Map()); runs.get(id)!.set(Number(seed), v); }
      const full = Math.max(...[...DCFS.values()].map((v) => v.e.length));
      const bands = dcf.discountBands();
      const pv = (flows: number[], rates: number[]) => { let df = 1, t = 0; for (let i = 0; i < flows.length; i++) { df /= 1 + dcf.monthlyRate(rates[i] ?? rates.at(-1) ?? 0); t += flows[i]! * df; } return t; };
      console.log('\n### 실험 A 할인값 — 같은 시드 짝 증분 현금흐름의 NPV(억, 판 평균) · IRR(중앙) · 증분 흐름 = (현금 − 대출) 월 변화 차이 + 끝의 원액·제품 평가액 차이');
      console.log(`| 비교 | 짝 | ${bands.map((b) => `NPV ${(b.annual * 100).toFixed(1)}%`).join(' | ')} | NPV marginal(경로 판) | IRR 중앙(연) |`);
      console.log(`|---|---|${bands.map(() => '---|').join('')}---|---|`);
      const pairsDcf: [string, string][] = [['HC','HA'],['HD','HC'],['HS','HC'],['HC72','HA'],['HC6','HA6'],['HS6','HC6'],['HC672','HA6'],['HS672','HC672'],['HD672','HC672']];
      for (const [a, b] of pairsDcf) {
        const A = runs.get(a), B = runs.get(b);
        if (!A || !B) continue;
        const npvs = bands.map(() => [] as number[]); const marg: number[] = []; const irrs: number[] = [];
        for (const [seed, x] of A) {
          const y = B.get(seed);
          if (!y || x.e.length !== full || y.e.length !== full) continue; // 파산 판은 뺀다
          const flows = x.e.slice(1).map((v, i) => (v - x.e[i]!) - (y.e[i + 1]! - y.e[i]!));
          flows[flows.length - 1] = flows[flows.length - 1]! + (x.nw - x.e.at(-1)!) - (y.nw - y.e.at(-1)!);
          bands.forEach((bd, j) => npvs[j]!.push(pv(flows, [bd.annual])));
          marg.push(pv(flows, x.r));
          const r = dcf.irr(flows.map((amount, i) => ({ month: i + 1, amount })));
          if (Number.isFinite(r)) irrs.push(r);
        }
        if (!marg.length) continue;
        const avg = (v: number[]) => v.reduce((t, z) => t + z, 0) / v.length / 1e8;
        const med = (v: number[]) => { const q = [...v].sort((m, n) => m - n); return q.length ? q[Math.floor(q.length / 2)]! : NaN; };
        console.log(`| ${a} − ${b} | ${marg.length} | ${npvs.map((v) => avg(v).toFixed(2)).join(' | ')} | ${avg(marg).toFixed(2)} | ${irrs.length ? `${(med(irrs) * 100).toFixed(1)}% (${irrs.length}판)` : '—'} |`);
      }
      console.log('\n### 증발 — 경로별 판 평균(파산 판 포함, 판이 끝난 달까지)');
      console.log('| 경로 | 증발 리터 | 증발 LPA(근사) |\n|---|---|---|');
      for (const [id, m] of runs) { const v = [...m.values()]; console.log(`| ${id} | ${Math.round(v.reduce((t, z) => t + z.evapL, 0) / v.length).toLocaleString()} | ${Math.round(v.reduce((t, z) => t + z.evapLPA, 0) / v.length).toLocaleString()} |`); }
    }
  },
};
// PRICE=1 — MKT 가격 손잡이를 mkt-p8v.ts와 같은 자리에 건다(등록은 프로세스에 하나라 이 등록 안에서 MKT 함수를 부른다)
if (PRICE) {
  // ① 병입 직후 — P8의 가격 처리(pricePolicy → 자동 가격 켜기) 앞 자리다. 옛 글자 패치는 그 처리 **뒤**에 붙었으므로 같은 순서를 여기서 만든다:
  //    자동 가격을 끈 정책은 MKT 처리(P8 처리 건너뜀) · longPrice 정책은 P8의 자동 가격 켜기를 그대로 한 뒤 장기 계열만 끄고 장기 계열에만 MKT 처리
  hooks.priceAfterBottle = (s0, p, opts, cat, api) => {
    const lp = longPrice(p);
    if (!lp) return !p.pricePolicy && !p.autoPrice ? mkt.afterBottle(s0, p as never, opts) : undefined;
    if (p.pricePolicy) throw new Error('prod-hold-p8 PRICE: 「-L」 경로는 P8_POLICY(pricePolicy)와 함께 쓸 수 없다 — P8의 정책 처리 뒤 자리가 없다');
    let s = s0;
    // P8 bottleAs의 자동 가격 줄과 같은 처리(이 자리가 그 줄을 대신하므로) — P8의 그 줄이 바뀌면 여기도 맞춘다
    if (p.autoPrice) for (const x of s.commerce.products.filter((y) => y.category === cat && !y.autoPrice && !y.dutyFreeOnly)) s = api.act(s, p.engineA ? { type: 'setPricePolicy', productId: x.id, mode: 'turnover' } : { type: 'setAutoPrice', productId: x.id, on: true });
    else s = mkt.afterBottle(s, p as never, opts);
    for (const x of s.commerce.products.filter((y) => y.name.startsWith(LONG_LINE_NAME) && y.autoPrice)) s = api.act(s, { type: 'setAutoPrice', productId: x.id, on: false });
    if (opts.name.startsWith(LONG_LINE_NAME)) s = mkt.afterBottle(s, longPol(p) as never, opts);
    return s;
  };
  // ② 매달 병입 직전 · ②' 통입 뒤 기록
  hooks.beforeBottle = (s, p, m) => mkt.monthly(s, (longPrice(p) ? longPol(p) : p) as never, m);
  hooks.afterFill = (s, p, m) => { mkt.snap(s, p as never, m); };
}
setP8Hooks<P, R>(hooks);

process.env.P8 = '1';
process.env.TIER ??= 'standard';
await import('./mvp-human'); // 끼움 자리는 프로세스에 하나 — 등록한 뒤에 P8을 읽는다
