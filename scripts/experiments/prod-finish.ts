// 피니싱 판 측정 — 개월 가중 통 구성(Product.caskMonthsMix, #290 B1-9 f2 구조 규칙 "피니시는 개월 가중")이 짧은 피니시의 시장 배수를 얼마나 줄이는가
// 세이브 하나에서 숙성 몰트 통을 올로로소 셰리 벗으로 옮겨 k개월 피니싱한 뒤 병입하고, 통 구성 세 가지 읽기로 f2 통 배수를 비교한다. 게임 규칙은 바꾸지 않는다
//   R1 caskMix 그대로(마지막 통 100%) · R2 MKT 임시 규칙(제품 피니시 라벨 계열 몫은 ×1) · R3 caskMonthsMix ?? caskMix(이 기록)
// 세이브 만들기: DUMP=<폴더> P8=1 TIER=standard ONLY=X0 npx tsx scripts/experiments/mvp-human.ts 1 180  → <폴더>/bot-m96.json 등
// 실행: npx tsx scripts/experiments/prod-finish.ts <세이브.json> [개월 목록=0,3,6,12,24,36]
//   MVP는 피니싱이 잠겨 있다(scenarios.ts locked action:transferCask) — 이 측정 안에서만 연다
//   가중표는 MKT 측정용 [가설] 표(scripts/experiments/mkt-b1.ts B1G_W)의 셰리 칸 — 구현(content/market.ts STYLE_WEIGHTS)과 다를 수 있다
import { readFileSync } from 'node:fs';
import { migrateSave } from '../../src/sim/migrate';
import { advanceMonth, applyAction, emptyCaskOf, type GameState, type Product } from '../../src/sim';
import { currentSuggested } from '../../src/sim/economics';

const file = process.argv[2];
if (!file) throw new Error('세이브 파일 경로를 주세요 (위 주석의 "세이브 만들기")');
const MONTHS = (process.argv[3] ?? '0,3,6,12,24,36').split(',').map(Number);
const findState = (o: unknown): unknown => {
  if (!o || typeof o !== 'object') return null;
  if ('inventory' in o) return o;
  for (const v of Object.values(o)) { const r = findState(v); if (r) return r; }
  return null;
};
const s0 = migrateSave(findState(JSON.parse(readFileSync(file, 'utf8'))));
if (!s0) throw new Error('세이브를 읽지 못했다');

/** 시장 셰리 가중 [가설] — mkt-b1.ts B1G_W의 oloroso_butt 칸 */
const SHERRY_W: Record<string, number> = { KR: 1.04, JP: 1.05, TW: 1.12, UK: 1.04, EU: 1.06, US: 1.0, CN: 1.1, DF: 1.05, SEA: 1.08 };
const MARKETS = ['KR', 'TW', 'CN', 'EU'];
type Mix = { typeId: string; share: number }[] | undefined;
/** f2 통 배수 = Σ 비중 × w + (나머지) × 1 — 셰리만 가중, 다른 통은 1 */
const caskMult = (mix: Mix, key: string, neutral?: string | null) => {
  const m = mix ?? [];
  const tot = m.reduce((a, c) => a + c.share, 0);
  return m.reduce((a, c) => a + c.share * (c.typeId === 'oloroso_butt' && c.typeId !== neutral ? SHERRY_W[key]! : 1), 0) + Math.max(0, 1 - tot);
};
const sherry = (mix: Mix) => (mix ?? []).find((c) => c.typeId === 'oloroso_butt')?.share ?? 0;

/** 숙성 몰트 ex-버번 통 — 오크 긴 순 두 통(같은 통으로 모든 변형을 돈다) */
const aged = s0.inventory.casks.filter((c) => c.contents && !c.owner && !c.contaminationKnown && c.typeId === 'ex_bourbon_barrel' && c.contents.kind === 'malt' && c.contents.oakMonths >= 36 && !c.contents.caskHistory?.length)
  .sort((a, b) => b.contents!.oakMonths - a.contents!.oakMonths || a.id.localeCompare(b.id));
if (aged.length < 2) throw new Error(`36개월 이상 ex-버번 몰트 통이 두 개 이상 필요하다 (있음 ${aged.length})`);
const [A, B] = [aged[0]!.id, aged[1]!.id];

function run(k: number, finishedShare: 1 | 0.5): string {
  let s = structuredClone(s0) as GameState;
  if (s.scenario) s.scenario.locked = s.scenario.locked.filter((x) => x !== 'action:transferCask');
  s.finance.cash = Math.max(s.finance.cash, 1e9); // 현금 부족으로 판이 갈리지 않게(측정 대상은 기록뿐)
  let finId = A;
  if (k > 0) {
    const butt = emptyCaskOf(s, 'oloroso_butt');
    s.inventory.casks.push(butt);
    finId = butt.id;
    const r = applyAction(s, { type: 'transferCask', fromCaskId: A, toCaskId: butt.id });
    if (r.error) throw new Error(r.error);
    s = r.state;
    for (let i = 0; i < k; i++) s = advanceMonth(s);
  }
  const fin = s.inventory.casks.find((c) => c.id === finId);
  const plain = s.inventory.casks.find((c) => c.id === B);
  if (!fin?.contents || !plain?.contents) return `| ${k} | ${finishedShare} | (원액 없음 — 그 사이 다른 데 쓰였다) |`;
  const comps = [{ source: 'cask' as const, id: fin.id, liters: 60 }];
  if (finishedShare === 0.5) comps.push({ source: 'cask' as const, id: plain.id, liters: 60 * (fin.contents.abv / plain.contents.abv) });
  const res = applyAction(s, { type: 'bottle', components: comps, options: { name: `피니시 ${k}개월`, targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' } });
  if (res.error) return `| ${k} | ${finishedShare} | 병입 실패: ${res.error} |`;
  const p = res.state.commerce.products.at(-1)! as Product;
  const r1 = MARKETS.map((m) => caskMult(p.caskMix, m).toFixed(3));
  const r2 = MARKETS.map((m) => caskMult(p.caskMix, m, p.finish ?? null).toFixed(3));
  const r3 = MARKETS.map((m) => caskMult(p.caskMonthsMix ?? p.caskMix, m).toFixed(3));
  return `| ${k} | ${finishedShare === 1 ? '피니시 통만' : '반반(피니시 + 버번)'} | ${p.finish ? '셰리 피니시' : '없음'} | ${sherry(p.caskMix).toFixed(3)} | ${sherry(p.caskMonthsMix ?? p.caskMix).toFixed(3)} | ${r1.join(' · ')} | ${r2.join(' · ')} | ${r3.join(' · ')} | ${p.quality.toFixed(1)} | ${Math.round(currentSuggested(res.state, p) / 100) * 100} |`;
}

const a = s0.inventory.casks.find((c) => c.id === A)!.contents!;
console.log(`세이브 ${s0.month}개월 · 피니시할 통 ${A}(오크 ${a.oakMonths}개월) · 섞을 통 ${B} · 셰리 가중 [가설] ${MARKETS.map((m) => `${m} ×${SHERRY_W[m]}`).join(' · ')}`);
console.log(`| 피니시 개월 | 구성 | 라벨 | 셰리 비중 caskMix | 셰리 비중 개월 가중 | R1 caskMix 배수 (${MARKETS.join('·')}) | R2 임시 규칙(라벨 계열 ×1) | R3 개월 가중 | 품질 | 기준가(원) |`);
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const k of MONTHS) for (const f of [1, 0.5] as const) console.log(run(k, f));
