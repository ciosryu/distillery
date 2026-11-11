// T-MKT-4 측정 — 세컨드 브랜드(#235·#237, 판정 #53) (docs/design/mkt-stage-t.md, PRD §11.2.1)
// 실행: npx tsx scripts/experiments/mkt-brand.ts [시드=10] [개월=180]
//   MVP=standard|micro|sandbox (기본 standard — MVP는 세컨드 브랜드가 잠겨 있어(#219) 이 실험 안에서만 잠금을 푼다.
//   샌드박스(newGame)는 이 봇으로 3시드 중 1시드가 파산해 비교가 흔들린다)
//   OPEN=<달> 브랜드를 여는 달(기본 60) · BRAND_MKT=<원> 세컨드 브랜드 월 마케팅(기본 200만, 하우스 마케팅은 그대로)
//   PREMIUM_Q=<품질> 고급 분리 정책이 옮기는 위스키 품질 하한(기본 70) · SPILL=0.5,0.8 브랜드 연계 계수 s(BRANDS.spillover, 실험 안에서만)
// 정책: 없음 / 저가 라인 분리(소주 제품을 세컨드로) / 고급 분리(품질 PREMIUM_Q 이상 위스키를 세컨드로).
//   새 제품은 첫 판매 전에 옮겨 무료, 이미 판 제품은 리브랜딩 비용을 낸다(게임 규칙 그대로)
// 판정(#53): 브랜드 분리 전략이 "없음"보다 순자산이 높은 시드가 20~80% — 늘 이기면 필수, 늘 지면 함정
import { applyAction, type Action, type GameState, type Product } from '../../src/sim';
import { houseBrand, secondBrands } from '../../src/sim/brands';
import { BRANDS } from '../../src/sim/content/market';
import { args, at, avg, eok, pct, runBot, secondAwareness, type BotOpts, type RunResult } from './mkt-lib';

const MODE = (process.env.MVP ?? 'standard') as BotOpts['mode'];
const OPEN = Number(process.env.OPEN ?? 60);
const BRAND_MKT = Number(process.env.BRAND_MKT ?? 2_000_000);
const PREMIUM_Q = Number(process.env.PREMIUM_Q ?? 70);
const SPILLS = (process.env.SPILL ?? String(BRANDS.spillover)).split(',').map(Number);
const ORIGINAL_SPILL = BRANDS.spillover;
const BRAND_KEYS = ['action:openBrand', 'action:setProductBrand', 'action:closeBrand'];

type Policy = { name: string; pick: ((p: Product) => boolean) | null };
const POLICIES: Policy[] = [
  { name: '없음', pick: null },
  { name: '저가 라인 분리(소주)', pick: (p) => p.category === 'soju_distilled' },
  { name: `고급 분리(위스키 품질 ${PREMIUM_Q}↑)`, pick: (p) => p.category === 'whisky' && p.quality >= PREMIUM_Q },
];

const act = (s: GameState, a: Action) => applyAction(s, a).state;
function brandHook(pick: Policy['pick']): (s: GameState) => GameState {
  return (s) => {
    if (!pick || s.month < OPEN) return s;
    if (s.scenario) s.scenario.locked = s.scenario.locked.filter((k) => !BRAND_KEYS.includes(k)); // MVP: 실험 안에서만 잠금 해제
    if (!secondBrands(s).length) {
      s = act(s, { type: 'openBrand', name: '세컨드' });
      const b = secondBrands(s)[0];
      if (!b) return s; // 현금 부족 — 다음 달 다시
      if (BRAND_MKT > 0) s = act(s, { type: 'setMarketing', amount: BRAND_MKT, brandId: b.id });
    }
    const b = secondBrands(s)[0]!;
    for (const p of s.commerce.products) if (pick(p) && p.brandId !== b.id && p.stockBottles > 0) s = act(s, { type: 'setProductBrand', productId: p.id, brandId: b.id });
    return s;
  };
}

console.log(`T-MKT-4 세컨드 브랜드 — ${MODE}, ${args.seeds}시드 × ${args.months}개월, 개설 ${OPEN}개월, 세컨드 마케팅 월 ${(BRAND_MKT / 1e4).toLocaleString()}만 원, 이벤트 끔`);
for (const spill of SPILLS) {
  BRANDS.spillover = spill;
  const res: Record<string, RunResult[]> = {};
  for (const pol of POLICIES) res[pol.name] = Array.from({ length: args.seeds }, (_, i) => runBot({ mode: MODE, seed: i + 1, months: args.months, hook: brandHook(pol.pick) }));
  const none = res['없음']!;
  console.log(`\n### s = ${spill}`);
  console.log(`| 정책 | 파산 | 순자산 ${OPEN + 36}개월 (없음 대비, 짝 시드 평균) | 순자산 ${args.months}개월 (없음 대비) | 이긴 시드 (${args.months}개월, 둘 다 생존) | 하우스 / 세컨드 인지도 끝 |`);
  console.log('|---|---|---|---|---|---|');
  for (const pol of POLICIES) {
    const rs = res[pol.name]!;
    const d = (m: number) => avg(rs.map((r, i) => (at(r, m)?.netWorth ?? NaN) - (at(none[i]!, m)?.netWorth ?? NaN)));
    const pairs = rs.map((r, i) => [r, none[i]!] as const).filter(([a, b]) => !a.bankrupt && !b.bankrupt);
    const won = pairs.filter(([a, b]) => (at(a, args.months)?.netWorth ?? 0) > (at(b, args.months)?.netWorth ?? 0)).length;
    const alive = rs.filter((r) => !r.bankrupt);
    console.log(`| ${pol.name} | ${rs.length - alive.length}/${rs.length} | ${pol.pick ? `${d(OPEN + 36) >= 0 ? '+' : ''}${eok(d(OPEN + 36))}` : eok(avg(rs.map((r) => at(r, OPEN + 36)?.netWorth ?? NaN)))} | ${pol.pick ? `${d(args.months) >= 0 ? '+' : ''}${eok(d(args.months))}` : eok(avg(alive.map((r) => at(r, args.months)?.netWorth ?? NaN)))} | ${pol.pick ? `${won}/${pairs.length} (${pct(won / Math.max(1, pairs.length))}, #53 기준 20~80%: ${pairs.length && won / pairs.length >= 0.2 && won / pairs.length <= 0.8 ? '통과' : '미달'})` : '—'} | ${avg(alive.map((r) => houseBrand(r.s).awareness)).toFixed(3)} / ${pol.pick ? avg(alive.map((r) => secondAwareness(r.s))).toFixed(3) : '—'} |`);
  }
}
BRANDS.spillover = ORIGINAL_SPILL;
