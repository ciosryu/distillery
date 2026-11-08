// 사람처럼 하는 MVP 판 (STATUS 결정 대기 19 "고정비 대비 매출 구조" 판단 자료, mvp.md §7.6) — 게임 규칙은 바꾸지 않는다.
// 봇(mvp-survival.ts)과 사람의 차이를 하나씩 켜고 끄는 "정책 토글"로 나누어, 어떤 실수가 파산을 부르는지 본다.
// 실행: npx tsx scripts/experiments/mvp-human.ts [시드수=10] [개월=180]
//   TIER=<micro|standard> (기본 micro) · LOAN=<원> 시작 대출(기본 0 = 사업 계획서 기본값)
//
// 정책 토글:
//   soju   'stock'  = 소주 재고가 1,500병 밑일 때만 병입(봇) · 'all' = 탱크 소주를 매달 전부 병입(사전 점검 #59의 순진한 사람)
//   loans  'bot'    = 현금이 2억·1억·5천만 밑으로 내려가면 미리 은행·정책 대출(봇)
//          'banner' = 파산 배너(주의: 런웨이 3개월 이하 / 위험: 현금 < 0)가 뜬 뒤에야 싼 대출부터, 그래도 모자라면 급전 + 탱크 뉴메이크 현물 판매
//          'none'   = 대출을 쓰지 않는다
//   cut    'none' · 'onCrisis' = 파산 배너(주의 포함)가 처음 뜨면 생산 지시를 모두 0으로(2차 판, 43개월 파산)
//          'at27' = 27개월째 생산 지시를 모두 0으로(2차 판 그대로 — 23개월째 몰트, 27개월째 전부)
//          'y2to5' = 2~5년 차 몰트를 월 1배치로 줄인다(1차 판, 117개월 파산 — 7~8년 차 위스키 공급 끊김)
//   visitor 비지터 센터 베이직 투어를 시작 때 짓는가
//   bigMalt 몰트 5배치 + 스테인리스 발효조 2기(끄면 몰트 3배치) · farm 농업경영체 등록(전통주 주세 경감) — 둘 다 켜면 mvp-survival '균형'(FARM=1)과 같은 규모
// 파산 규칙: 지금(월말 마이너스 3개월 연속, step.ts) + 결정 대기 16의 "6개월로 완화"를 같은 판에서 따로 센다(시뮬레이션 상태의 연속 개월을 스크립트가 덮어 써서 3개월 파산을 막고, 6개월은 스크립트가 센다).
import { advanceMonth, applyAction, newScenarioGame, previewBlend, warehouseCapacity, type Action, type GameState, type ProductCategory } from '../../src/sim';
import { EVENTS } from '../../src/sim/content/events';
import { cashAlert } from '../../src/ui/alerts';
import { netWorth } from '../../src/sim/progress';

const SEEDS = Number(process.argv[2] ?? 10);
const MONTHS = Number(process.argv[3] ?? 180);
const TIER = (process.env.TIER ?? 'micro') as 'micro' | 'standard';
const LOAN = Number(process.env.LOAN ?? 0);
EVENTS.splice(0); // MVP: 랜덤 이벤트 OUT (#130)

interface Policy { name: string; soju: 'stock' | 'all'; loans: 'bot' | 'banner' | 'none'; cut: 'none' | 'onCrisis' | 'at27' | 'y2to5'; visitor: boolean; farm: boolean; bigMalt: boolean }
const P = (name: string, o: Partial<Policy>): Policy => ({ name, soju: 'stock', loans: 'banner', cut: 'none', visitor: true, farm: false, bigMalt: false, ...o });
const POLICIES: Policy[] = [
  P('A 봇 기준', { loans: 'bot' }),
  P('B 사람 — 배너 보고 대출', {}),
  P('C B + 소주 전부 병입', { soju: 'all' }),
  P('D B + 위기에 생산 중단(2차 판)', { cut: 'onCrisis' }),
  P('D2 B + 27개월째 생산 중단(2차 판 그대로)', { cut: 'at27' }),
  P('E B + 2~5년 몰트 감산(1차 판)', { cut: 'y2to5' }),
  P('F B + 대출 안 씀', { loans: 'none' }),
  P('G B + 비지터 센터 안 지음', { visitor: false }),
  P('H C + D (과잉 병입 + 생산 중단)', { soju: 'all', cut: 'onCrisis' }),
  P('I B + 확장(몰트 5배치·발효조 2기·전통주 등록)', { farm: true, bigMalt: true }),
  P('I1 B + 전통주 등록만', { farm: true }),
  P('I2 B + 몰트 5배치·발효조 2기만', { bigMalt: true }),
  P('J I + 위기에 생산 중단', { farm: true, bigMalt: true, cut: 'onCrisis' }),
  P('K 봇 기준 + 확장 (= mvp-survival 균형)', { loans: 'bot', farm: true, bigMalt: true }),
];

const act = (s: GameState, a: Action) => applyAction(s, a).state;
const stockOf = (s: GameState, cat: ProductCategory) => s.commerce.products.filter((p) => p.category === cat).reduce((t, p) => t + p.stockBottles, 0);
const recipe = (s: GameState, kind: 'soju' | 'malt') => s.production.recipes.find((r) => r.kind === kind && !r.mashBill.some((m) => m.ingredientId === 'malt_peated'))?.id;
const demandLast = (s: GameState, cat: ProductCategory) => {
  const ids = new Set(s.commerce.products.filter((p) => p.category === cat).map((p) => p.id));
  return (s.history.reports.at(-1)?.sales ?? []).filter((x) => ids.has(x.productId)).reduce((t, x) => t + x.demandBottles, 0);
};
const SOJU_BATCHES = 2;
const maltBatches = (p: Policy) => (p.bigMalt ? 5 : 3);
const setOrders = (s: GameState, soju: number, malt: number) =>
  act(act(s, { type: 'setOrder', recipeId: recipe(s, 'soju')!, batchesPerMonth: soju }), { type: 'setOrder', recipeId: recipe(s, 'malt')!, batchesPerMonth: malt });

function fill(s: GameState): GameState {
  const cap = warehouseCapacity(s);
  for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) {
    const need = Math.ceil((lot.volumeL * lot.abv) / (200 * 0.635));
    const room = cap - s.inventory.casks.length;
    const empty = s.inventory.casks.filter((c) => !c.contents && !c.contamination).length;
    if (empty < need && room > 0 && s.finance.cash > 60_000_000) s = act(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: Math.min(need - empty, room) });
    const ids = s.inventory.casks.filter((c) => !c.contents && !c.contamination).slice(0, need).map((c) => c.id);
    if (ids.length) s = act(s, { type: 'fillCasks', lotId: lot.id, caskIds: ids, entryAbv: 0.635 });
  }
  return s;
}

function bottle(s: GameState, p: Policy, t: { firstWhisky: number }): GameState {
  for (const lot of [...s.inventory.lots]) {
    if (lot.kind !== 'soju') continue;
    if (p.soju === 'stock' && (stockOf(s, 'soju_distilled') >= 1500 || s.month - lot.createdMonth < 1)) continue;
    s = act(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: lot.volumeL }], options: { name: `소주 ${s.month}`, targetAbv: 0.25, bottleMl: 375, chillFilter: true, packagingId: 'standard' } });
  }
  // 위스키: 재고가 지난달 수요의 1.5배(최소 600병) 밑이면 12개월 넘은 통부터 (봇과 같은 규칙 — 사람·봇 차이에서 뺀다)
  const stock = stockOf(s, 'whisky');
  const target = Math.max(600, demandLast(s, 'whisky') * 1.5);
  if (stock < target) {
    const n = Math.min(10, Math.max(1, Math.ceil((target - stock) / 330)));
    const ready = s.inventory.casks.filter((c) => c.contents && c.contents.kind === 'malt' && c.contents.oakMonths >= 12).sort((a, b) => b.contents!.oakMonths - a.contents!.oakMonths).slice(0, n);
    if (ready.length) {
      const comps = ready.map((c) => ({ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL }));
      const opts = { name: `싱글 몰트 ${s.month}`, targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };
      if (previewBlend(s, comps, opts).ok) { s = act(s, { type: 'bottle', components: comps, options: opts }); if (t.firstWhisky < 0) t.firstWhisky = s.month; }
    }
  }
  return s;
}

const has = (s: GameState, id: string) => s.finance.loans.some((l) => l.offerId === id);
function finance(s: GameState, p: Policy): GameState {
  if (p.loans === 'none') return s;
  if (p.loans === 'bot') {
    if (s.finance.cash < 200_000_000 && !has(s, 'kr_regional')) s = act(s, { type: 'takeLoan', offerId: 'kr_regional', amount: 300_000_000 });
    if (s.finance.cash < 100_000_000 && !has(s, 'kr_startup')) s = act(s, { type: 'takeLoan', offerId: 'kr_startup', amount: 200_000_000 });
    if (s.finance.cash < 100_000_000 && !has(s, 'working')) s = act(s, { type: 'takeLoan', offerId: 'working', amount: 300_000_000 });
    if (s.finance.cash < 50_000_000 && !has(s, 'facility')) s = act(s, { type: 'takeLoan', offerId: 'facility', amount: 500_000_000 });
    if (s.production.flags.producedSoju && !has(s, 'policy') && s.finance.cash < 300_000_000) s = act(s, { type: 'takeLoan', offerId: 'policy', amount: 200_000_000 });
    if (s.finance.cash < 30_000_000) for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) s = act(s, { type: 'sellBulk', source: 'lot', id: lot.id });
    return s;
  }
  // 'banner': 화면의 파산 배너가 뜬 뒤에야 움직인다 — 싼 대출부터 한 건씩, 위험(현금 < 0)이면 급전·뉴메이크 현물 판매까지
  const a = cashAlert(s);
  if (!a) return s;
  const order: [string, number][] = [['kr_regional', 300_000_000], ['kr_startup', 200_000_000], ['policy', 200_000_000], ['facility', 1_000_000_000], ['working', 300_000_000]];
  for (const [id, amt] of order) {
    if (has(s, id) || (id === 'policy' && !s.production.flags.producedSoju)) continue;
    const r = applyAction(s, { type: 'takeLoan', offerId: id, amount: amt });
    if (!r.error) { s = r.state; break; }
  }
  if (a.level === 'danger' && s.finance.cash < 0) {
    if (!has(s, 'emergency')) s = act(s, { type: 'takeLoan', offerId: 'emergency', amount: 100_000_000 });
    if (s.finance.cash < 0) for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) s = act(s, { type: 'sellBulk', source: 'lot', id: lot.id });
  }
  return s;
}

interface Row { cutMonth: number; policy: string; bankrupt3: number; bankrupt6: number; minCash: number; minCashMonth: number; loansMax: number; firstWhisky: number; nw: number; goal: boolean; verdict: string; whiskyY6to9: number }

function play(p: Policy, seed: number): Row {
  let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: TIER, loanAmount: LOAN, seed });
  const t = { firstWhisky: -1 };
  if (p.visitor) s = act(s, { type: 'buyEquipment', catalogId: 'visitor_basic' });
  if (p.bigMalt) for (let i = 0; i < 2; i++) s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' });
  if (p.farm) s = act(s, { type: 'buyEquipment', catalogId: 'kr_farm_registration' });
  s = setOrders(s, SOJU_BATCHES, maltBatches(p));
  let bankrupt3 = -1, bankrupt6 = -1, neg = 0, cut = false, cutMonth = -1, minCash = s.finance.cash, minCashMonth = 0, loansMax = 0, whiskyY6to9 = 0;
  const cats = () => new Map([...s.commerce.products, ...s.commerce.productArchive].map((x) => [x.id, x.category]));
  for (let m = 0; m < MONTHS; m++) {
    if (p.cut === 'y2to5') s = setOrders(s, SOJU_BATCHES, m >= 12 && m < 60 ? 1 : maltBatches(p));
    // 2차 판: 경고(파산 배너 — 주의 단계 포함)를 처음 보고 생산을 모두 0으로 했다. 대출을 먼저 받으면 현금은 음수가 되지 않으므로 '배너가 뜬 때'로 본다
    if (p.cut === 'onCrisis' && !cut && cashAlert(s)) { s = setOrders(s, 0, 0); cut = true; cutMonth = m; }
    if (p.cut === 'at27' && !cut && m >= 27) { s = setOrders(s, 0, 0); cut = true; cutMonth = m; }
    s = bottle(s, p, t);
    s = fill(s);
    s = finance(s, p);
    // 6개월 규칙을 따로 세려고 시뮬레이션의 3개월 파산을 막는다(연속 개월을 1 이하로 덮어 쓴다) — 연속 개월은 스크립트가 센다(neg)
    s.finance.negativeCashMonths = Math.min(s.finance.negativeCashMonths, 1);
    s = advanceMonth(s);
    neg = s.finance.cash < 0 ? neg + 1 : 0;
    if (neg >= 3 && bankrupt3 < 0) bankrupt3 = s.month;
    if (neg >= 6) { bankrupt6 = s.month; break; }
    if (s.finance.cash < minCash) { minCash = s.finance.cash; minCashMonth = s.month; }
    loansMax = Math.max(loansMax, s.finance.loans.reduce((x, l) => x + l.balance, 0));
    if (s.month >= 60 && s.month < 108) { const c = cats(); whiskyY6to9 += (s.history.reports.at(-1)?.sales ?? []).filter((x) => c.get(x.productId) === 'whisky').reduce((a, x) => a + x.bottles, 0); }
  }
  const alive = bankrupt6 < 0;
  const nw = alive ? netWorth(s) : NaN;
  const v = s.progress.verdict;
  return { cutMonth, policy: p.name, bankrupt3, bankrupt6, minCash, minCashMonth, loansMax, firstWhisky: t.firstWhisky, nw, goal: alive && bankrupt3 < 0 && !!s.scenario && nw >= s.scenario.equity * s.scenario.goal.netWorthMultiple, verdict: v ? `${v.result}${v.grade ? ':' + v.grade : ''}` : '-', whiskyY6to9 };
}

const eok = (v: number) => (Number.isFinite(v) ? `${(v / 1e8).toFixed(2)}억` : '—');
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const med = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)]! : NaN; };
const mo = (v: number) => (Number.isFinite(v) ? `${Math.round(v)}월` : '—');

console.log(`사람처럼 하는 MVP 판 — 한국 경기, ${TIER}, 시작 대출 ${eok(LOAN)}, ${SEEDS}시드 × ${MONTHS}개월, 이벤트 끔, 소주 ${SOJU_BATCHES}·언피티드 몰트 3배치(확장 정책은 5배치)`);
console.log('| 정책 | 파산 (3개월 규칙, 중앙 월) | 파산 (6개월 규칙, 중앙 월) | 최저 현금 중앙값 (그 달) | 최대 대출 잔액 평균 | 첫 위스키 | 6~9년 차 위스키 판매(병, 평균) | 15년 순자산 평균(3개월 규칙 생존) | 순자산 목표 달성 |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const p of POLICIES) {
  const rows = Array.from({ length: SEEDS }, (_, i) => play(p, i + 1));
  const b3 = rows.filter((r) => r.bankrupt3 >= 0), b6 = rows.filter((r) => r.bankrupt6 >= 0);
  const alive3 = rows.filter((r) => r.bankrupt3 < 0 && r.bankrupt6 < 0);
  console.log(`| ${p.name} | ${b3.length}/${SEEDS} (${mo(med(b3.map((r) => r.bankrupt3)))}) | ${b6.length}/${SEEDS} (${mo(med(b6.map((r) => r.bankrupt6)))}) | ${eok(med(rows.map((r) => r.minCash)))} (${mo(med(rows.map((r) => r.minCashMonth)))}) | ${eok(avg(rows.map((r) => r.loansMax)))} | ${mo(med(rows.map((r) => r.firstWhisky).filter((x) => x >= 0)))} | ${Math.round(avg(rows.map((r) => r.whiskyY6to9))).toLocaleString()} | ${eok(avg(alive3.map((r) => r.nw)))} | ${rows.filter((r) => r.goal).length}/${SEEDS} |${rows.some((r) => r.cutMonth >= 0) ? ` 생산 중단 ${mo(med(rows.map((r) => r.cutMonth).filter((x) => x >= 0)))}` : ''}`);
}
