// T-MKT-6 측정 — 가격 반응 곡선(#198): 권장가 배수별 수요·매출·공헌 표 (docs/design/mkt-stage-t.md)
// 실행: npx tsx scripts/experiments/mkt-price.ts [시드=3] [개월=180]
//   SAVE=<세이브.json>  사람 판 세이브의 판매 중 제품으로 표를 만든다(시드·개월 무시)
//   AT=60,120           봇 판에서 표를 만들 달 (기본 60·120) · MVP=micro|standard|sandbox (기본 standard)
//   FACTORS=0.5,0.8,1,1.2,1.5,2,3  지금 값(가격) 대비 배수
// 판정(제안, 단계 T): 권장가 ±20%에서 공헌 차이 10% 안(플레이어가 조금 틀려도 크게 잃지 않는다), 3배 값이면 수요 ≈ 0
// 표의 "공헌"은 진열 전체 공헌(lineupContribution — 같은 주종 다른 제품으로 옮겨 가는 몫까지, #212)이다
import { calendar, priceOptions, type GameState } from '../../src/sim';
import { currentSuggested } from '../../src/sim/economics';
import { args, loadSave, MODE, runBot } from './mkt-lib';

const FACTORS = (process.env.FACTORS ?? '0.5,0.8,1,1.2,1.5,2,3').split(',').map(Number);
const AT = (process.env.AT ?? '60,120').split(',').map(Number);
const SEEDS = Number(process.argv[2] ?? 3);

function table(s: GameState, label: string): void {
  const moy = calendar(s).monthOfYear;
  const ps = s.commerce.products.filter((p) => p.stockBottles > 0);
  console.log(`\n### ${label} — 판매 중 ${ps.length}개 제품`);
  console.log(`| 제품 | 품질 | 지금 값 (권장가 대비) | ${FACTORS.map((f) => `×${f}`).join(' | ')} |`);
  console.log(`|---|---|---|${FACTORS.map(() => '---').join('|')}|`);
  for (const p of ps) {
    // 기준 = 권장가. 지금 값이 권장가와 다르면 배수를 권장가에 맞춰 다시 잡는다
    const sug = currentSuggested(s, p);
    const base = { ...p, price: sug };
    const opts = priceOptions({ ...s, commerce: { ...s.commerce, products: s.commerce.products.map((x) => (x.id === p.id ? base : x)) } }, base, moy, FACTORS);
    const ref = opts[FACTORS.indexOf(1)] ?? opts[0]!;
    const cell = (o: (typeof opts)[number]) => `${Math.round(o.demandBottles).toLocaleString()}병 · 공헌 ${ref.lineupContribution ? `${Math.round((o.lineupContribution / ref.lineupContribution) * 100)}%` : '—'}`;
    console.log(`| ${p.name} | ${p.quality} | ${p.price.toLocaleString()}원 (×${(p.price / sug).toFixed(2)}) | ${opts.map(cell).join(' | ')} |`);
  }
}

if (process.env.SAVE) {
  const s = loadSave(process.env.SAVE);
  console.log(`T-MKT-6 가격 반응 — 세이브 ${process.env.SAVE} (${s.month}개월째) · 칸 = 월 국내 수요 · 진열 공헌(권장가 = 100%)`);
  table(s, `세이브 ${s.month}개월째`);
} else {
  console.log(`T-MKT-6 가격 반응 — 봇 판 ${MODE}, ${SEEDS}시드, ${AT.join('·')}개월째 · 칸 = 월 국내 수요 · 진열 공헌(권장가 = 100%)`);
  for (let seed = 1; seed <= SEEDS; seed++) for (const m of AT) {
    if (m > args.months) continue;
    const r = runBot({ mode: MODE, seed, months: m });
    if (r.bankrupt) { console.log(`\n### 시드 ${seed} ${m}개월 — 파산(${r.bankruptMonth}개월)`); continue; }
    table(r.s, `시드 ${seed} · ${m}개월째`);
  }
}
