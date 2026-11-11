// AP3-PROD-1 — 보충이 느린 한정 재고(장기 숙성 제품)에서 B(그달 최적)와 C(기준가 × k 유지)의 총 공헌 비교 (docs/design/prod-stage-t.md 「AP3-PROD-1」 2.)
// 정상 상태 근사: 세이브의 그달 수요 곡선을 매달 그대로 쓴다(달이 흐르지 않는다 — 현금 시간 가치·재고 적체·제품 잊힘·형제 변화 없음). 게임 규칙은 바꾸지 않는다.
// 세이브 만들기: DUMP=<폴더> ONLY=S0 npx tsx scripts/experiments/prod-style-p8.ts 1 180   → <폴더>/bot-m179.json
// 실행: STOCK=300 AGE=12 [QUAL=0] npx tsx scripts/experiments/prod-scarce-price.ts <세이브.json>
//   그 판 진열 중인 첫 위스키 제품을 본떠 AGE년 표기·재고 STOCK병인 제품을 진열에 더하고(첫 값 = 기준가 × 1.3), 재고가 없어지거나 60개월이 될 때까지 판다
import { readFileSync } from 'node:fs';
import { migrateSave } from '../../src/sim/migrate';
import { bottleMargin, domesticDemands } from '../../src/sim/market';
import { bestAutoPrice, currentSuggested } from '../../src/sim/economics';
import { outboundLogistics } from '../../src/sim/sites';
import { calendar } from '../../src/sim/util';
import type { GameState, Product } from '../../src/sim';

const file = process.argv[2];
if (!file) throw new Error('세이브 파일 경로를 주세요 (위 주석의 "세이브 만들기")');
/** 기록 파일(playtest 묶음)이든 세이브 그대로든 inventory가 있는 객체를 찾는다 */
const findState = (o: unknown): unknown => {
  if (!o || typeof o !== 'object') return null;
  if ('inventory' in o) return o;
  for (const v of Object.values(o)) { const r = findState(v); if (r) return r; }
  return null;
};
const s0 = migrateSave(findState(JSON.parse(readFileSync(file, 'utf8'))));
if (!s0) throw new Error('세이브를 읽지 못했다');
const moy = calendar(s0).monthOfYear;
const STOCK = Number(process.env.STOCK ?? 300), AGE = Number(process.env.AGE ?? 12), QUAL = Number(process.env.QUAL ?? 0);
const base = s0.commerce.products.find((p) => p.category === 'whisky' && p.stockBottles > 0) ?? s0.commerce.products.find((p) => p.category === 'whisky'); // 진열 중인 위스키를 본뜬다
if (!base) throw new Error('세이브에 위스키 제품이 없다');

const aged = (s: GameState): Product => {
  const p: Product = { ...base, id: 'P_AGED', name: `싱글 몰트 ${AGE}년`, ageYears: AGE, oakMonths: AGE * 12, quality: base.quality + QUAL, stockBottles: STOCK, autoPrice: true, autoRestock: undefined, salesEma: undefined };
  p.price = Math.round(currentSuggested(s, p) * 1.3);
  return p;
};

function run(label: string, priceOf: (s: GameState, p: Product) => number): void {
  const s = structuredClone(s0!);
  const p = aged(s);
  s.commerce.products.push(p);
  const ref = currentSuggested(s, p);
  let stock = STOCK, contribution = 0, revenue = 0, m = 0;
  const factors: number[] = [];
  for (; m < 60 && stock > 0; m++) {
    p.price = priceOf(s, p);
    p.stockBottles = stock;
    factors.push(p.price / ref);
    const sell = Math.min(stock, Math.round(domesticDemands(s, moy).get(p.id)?.demandBottles ?? 0));
    contribution += sell * bottleMargin(p, outboundLogistics(s)).perBottle;
    revenue += sell * p.price;
    stock -= sell;
  }
  const path = factors.slice(0, 4).map((x) => x.toFixed(2)).join('→') + (factors.length > 4 ? `…${factors.at(-1)!.toFixed(2)}` : '');
  console.log(`| ${label} | ${(contribution / 1e6).toFixed(1)}백만 | ${(revenue / 1e6).toFixed(1)}백만 | ${stock > 0 ? `남음 ${stock}병(60개월)` : `${m}개월`} | ${path} |`);
}

console.log(`세이브 ${s0.month}개월 · ${AGE}년 표기 · 재고 ${STOCK}병 · 품질 ${(base.quality + QUAL).toFixed(1)} · 기준가 ${Math.round(currentSuggested(s0, aged(s0))).toLocaleString()}원 (정상 상태 근사)`);
console.log('| 정책 | 총 공헌 | 총 매출 | 다 팔린 달 | 값(기준가 배수) |\n|---|---|---|---|---|');
run('B 그달 최적(`bestAutoPrice`, 매달)', (s, p) => bestAutoPrice(s, p, moy) ?? p.price);
for (const k of [1.0, 1.3, 1.5, 2.0, 2.5]) run(`C 기준가 × ${k}`, (s, p) => Math.round(currentSuggested(s, p) * k));
