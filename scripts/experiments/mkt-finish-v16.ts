// 피니싱 병당 손익 — v16 캠페인 세이브에서 이어 굴려 "그대로 k개월 더" 대 "올로로소 셰리 벗으로 k개월 피니싱"을 견준다 (PM 요청 2026-11-24 · 측정만, 게임 코드 0)
// 세이브 만들기: P8=1 MVP=standard ONLY=X0 DUMP=<폴더> npx tsx scripts/experiments/mvp-human.ts 1 180  → <폴더>/bot-m179.json
// 실행: npx tsx scripts/experiments/mkt-finish-v16.ts <세이브.json>
//   PER=<n> 칸마다 통 수(기본 3) · SAMPLE=1 병입 직전 샘플 1회 · AGES=3,6,12 · KS=3,6,12 · SEEDK=<k> 상태 시드 + k×7919
// 현금은 무한으로 두고 자동 보충은 끈다(굴리는 동안 통이 병입되지 않게). 결과: docs/design/cask-types.md "지금 상태"(ARCH)
import { readFileSync } from 'node:fs';
import { advanceMonth, applyAction, emptyCaskOf, type GameState } from '../../src/sim';
import { parsePlayFile } from '../../src/store/playlog';
import { appeal } from '../../src/sim/market';
import { currentSuggested } from '../../src/sim/economics';
import { defaultPolicyPrice } from '../../src/sim/content/market';
import { CASKS } from '../../src/sim/content/production';
import { knownProductQuality } from '../../src/sim/productView';
const parsed = parsePlayFile(readFileSync(process.argv[2]!, 'utf8')) as any;
let s: GameState = parsed.save;
if (process.env.SEEDK) s.seed = s.seed + Number(process.env.SEEDK) * 7919;
const act = (st: GameState, a: any) => { const r = applyAction(st, a); if (r.error) throw new Error(r.error); return r.state; };
const AGES = (process.env.AGES ?? '3,6,12').split(',').map(Number), KS = (process.env.KS ?? '3,6,12').split(',').map(Number), PER = Number(process.env.PER ?? 3);
const BUTT = CASKS.oloroso_butt.price;
const used = new Set<string>();
type R = { q: number; est: number; sig: number; price: number; truePrice: number; app: number; bottles: number; unit: number };
const SAMPLE = process.env.SAMPLE === '1';
function arm(base: GameState, caskId: string, k: number, mode: 'keep' | 'new' | 'refill', usedButt?: any): R {
  let st: GameState = structuredClone(base);
  let id = caskId;
  if (mode !== 'keep') {
    const b = mode === 'new' ? emptyCaskOf(st, 'oloroso_butt') : { ...structuredClone(usedButt), id: `RB${caskId}` };
    st.inventory.casks.push(b);
    st = act(st, { type: 'transferCask', fromCaskId: caskId, toCaskId: b.id });
    id = b.id;
  }
  for (let m = 0; m < k; m++) st = advanceMonth(st);
  if (SAMPLE) { st.inventory.samplesThisMonth = 0; st = act(st, { type: 'sampleCask', caskIds: [id] }); }
  const c = st.inventory.casks.find((x) => x.id === id)!;
  const name = `${mode}-${k}-${caskId}`;
  st = act(st, { type: 'bottle', components: [{ source: 'cask', id, liters: c.contents!.volumeL }], options: { name, targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' } });
  const p = st.commerce.products.find((x) => x.name === name)!;
  const k2 = knownProductQuality(st, p);
  (arm as any).lastButt = st.inventory.casks.find((x) => x.id === id);
  const bare = { ...p }; delete (bare as any).qualityKnown;
  return { q: p.quality, est: k2.q, sig: k2.sigma, price: p.price, truePrice: defaultPolicyPrice(currentSuggested(st, bare as any)), app: appeal(p, st), bottles: p.stockBottles, unit: (p as any).unitCost };
}
s.finance.cash = 1e13;
for (const p of s.commerce.products) { delete (p as any).autoRestock; }
const target = (age: number) => s.inventory.casks.filter((c) => c.contents?.kind === 'malt' && c.typeId === 'ex_bourbon_barrel' && !used.has(c.id) && (c.contents.oakMonths ?? 0) >= age * 12 && c.contents.volumeL >= 100).sort((a, b) => a.contents!.oakMonths - b.contents!.oakMonths).slice(0, PER);
const agg: Record<string, any[]> = {};
let refillButt: any = null;
{ const c0 = target(0)[0]!; used.add(c0.id); arm(s, c0.id, 12, 'new'); refillButt = { ...(arm as any).lastButt }; }
for (const age of AGES) {
  let guard = 0;
  while (target(age).length < PER && guard++ < 300) { s = advanceMonth(s); s.finance.cash = 1e13; }
  const picks = target(age); picks.forEach((c) => used.add(c.id));
  for (const k of KS) for (const c of picks) {
    const keep = arm(s, c.id, k, 'keep');
    const fin = arm(s, c.id, k, 'new');
    const ref = refillButt ? arm(s, c.id, k, 'refill', refillButt) : null;
    for (const [lab, f] of [['새 벗', fin], ['재사용 벗', ref]] as const) {
      if (!f) continue;
      const key = `${age}|${k}|${lab}`;
      const per = (x: R, price: number) => price - x.unit;
      const extra = lab === '새 벗' ? -(BUTT * 2 / 3) / f.bottles : (BUTT / 3) / f.bottles; // 현금 보기: 새 벗은 값 전액, 재사용은 배분 1/3이 현금이 아님
      (agg[key] ??= []).push({ dq: f.q - keep.q, dest: f.est - keep.est, sigK: keep.sig, sigF: f.sig, app: f.app / keep.app, netEst: per(f, f.price) - per(keep, keep.price), netTrue: per(f, f.truePrice) - per(keep, keep.truePrice), extra, kp: keep.price, ktp: keep.truePrice, b: f.bottles });
    }
  }
}
console.log(`월 ${s.month} · 벗 ${BUTT.toLocaleString()}원 · 샘플 ${SAMPLE ? '뜸' : '안 뜸'}
| 숙성 | 피니시 개월 | 통 | 통 수 | 참 품질 차 | 추정 차 (σ 그대로→피니시) | 매력도 비 | 그대로 출고가 | 병당 이익 차 — 추정 값(배분 1/3) | 추정 값(현금) | 참값 값(배분 1/3) | 참값 값(현금) | 병 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
const m = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
for (const [key, v] of Object.entries(agg)) { const [age, k, lab] = key.split('|'); console.log(`| ${age}년 | ${k} | ${lab} | ${v.length} | +${m(v.map((x) => x.dq)).toFixed(1)} | ${m(v.map((x) => x.dest)) >= 0 ? '+' : ''}${m(v.map((x) => x.dest)).toFixed(1)} (σ ${m(v.map((x) => x.sigK)).toFixed(1)}→${m(v.map((x) => x.sigF)).toFixed(1)}) | ×${m(v.map((x) => x.app)).toFixed(3)} | ${Math.round(m(v.map((x) => x.kp))).toLocaleString()} | ${Math.round(m(v.map((x) => x.netEst))).toLocaleString()} | ${Math.round(m(v.map((x) => x.netEst + x.extra))).toLocaleString()} | ${Math.round(m(v.map((x) => x.netTrue))).toLocaleString()} | ${Math.round(m(v.map((x) => x.netTrue + x.extra))).toLocaleString()} | ${Math.round(m(v.map((x) => x.b)))} |`); }
console.log('refill butt', refillButt && { fills: refillButt.fills, seasoning: refillButt.seasoning, activity: refillButt.activity });
