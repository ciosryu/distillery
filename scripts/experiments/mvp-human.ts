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
//   P3=1 이면 3차 MVP 플레이테스트(73개월 파산, mvp.md §7.8) 재현 정책 묶음을 돌린다 — 몰트 4·소주 1배치, 그리고 그 판의 행동을 하나씩:
//     cut 'p3' = 25~39개월 몰트 절반, 35~39개월 전부 0, 40개월부터 원래대로 · loans 'cheap' = 배너를 보고 싼 정책자금(지자체·창업·전통주)만, 시설·운전자금·급전은 안 씀
//     sellNewMake = 48개월부터 몰트 원액을 통에 넣지 않고 현물로 판다
//   SPLIT=1 이면 15년 순자산 분해 표를 더 낸다(현금·대출·원액 현물가·제품, 위스키 매출 시기, 원액 평가액 증가 대 생산비 — #191 정정, mvp.md §7.6)
//   bigMalt 몰트 5배치 + 스테인리스 발효조 2기(끄면 몰트 3배치) · farm 농업경영체 등록(전통주 주세 경감) — 둘 다 켜면 mvp-survival '균형'(FARM=1)과 같은 규모
// 파산 규칙: 지금(월말 마이너스 3개월 연속, step.ts) + 결정 대기 16의 "6개월로 완화"를 같은 판에서 따로 센다(시뮬레이션 상태의 연속 개월을 스크립트가 덮어 써서 3개월 파산을 막고, 6개월은 스크립트가 센다).
import { advanceMonth, applyAction, newScenarioGame, previewBlend, warehouseCapacity, type Action, type GameState, type ProductCategory } from '../../src/sim';
import { EVENTS } from '../../src/sim/content/events';
import { cashAlert } from '../../src/ui/alerts';
import { netWorth } from '../../src/sim/progress';
import { isBulkKind, spotBidPerLPA } from '../../src/sim/bulk';

const SEEDS = Number(process.argv[2] ?? 10);
const MONTHS = Number(process.argv[3] ?? 180);
const TIER = (process.env.TIER ?? 'micro') as 'micro' | 'standard';
const LOAN = Number(process.env.LOAN ?? 0);
EVENTS.splice(0); // MVP: 랜덤 이벤트 OUT (#130)

interface Policy { name: string; soju: 'stock' | 'all'; loans: 'bot' | 'banner' | 'cheap' | 'none'; cut: 'none' | 'onCrisis' | 'at27' | 'y2to5' | 'p3'; visitor: boolean; farm: boolean; bigMalt: boolean; maltB?: number; sojuB?: number; sellNewMake?: boolean }
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
// 3차 판(§7.8): 몰트 4배치(언피티드 2·피티드 2 — 여기서는 언피티드 4)·소주 1배치, 스테인리스 발효조 2기, 비지터 센터 안 지음, 전통주 등록 안 함
const P3 = (name: string, o: Partial<Policy>): Policy => P(name, { bigMalt: true, maltB: 4, sojuB: 1, ...o });
const THIRD = { visitor: false, cut: 'p3', loans: 'cheap', sellNewMake: true } as const;
const P3_POLICIES: Policy[] = [
  P3('R0 3차 규모 · 사람 기준(배너 대출·비지터 지음)', {}),
  P3('R1 R0 + 비지터 센터 안 지음', { visitor: false }),
  P3('R2 R0 + 25~39개월 생산 감축', { cut: 'p3' }),
  P3('R3 R0 + 싼 정책자금만(시설·운전·급전 안 씀)', { loans: 'cheap' }),
  P3('R4 R0 + 48개월부터 몰트 원액 현물 판매', { sellNewMake: true }),
  P3('R5 3차 판 재현 (R1+R2+R3+R4)', { ...THIRD }),
  P3('R6 R5 − 싼 대출만 (배너대로 시설자금까지)', { ...THIRD, loans: 'banner' }),
  P3('R7 R5 − 비지터 안 지음 (지음)', { ...THIRD, visitor: true }),
  P3('R8 R5 − 생산 감축', { ...THIRD, cut: 'none' }),
  P3('R9 R5 − 원액 현물 판매', { ...THIRD, sellNewMake: false }),
];

const act = (s: GameState, a: Action) => applyAction(s, a).state;
const stockOf = (s: GameState, cat: ProductCategory) => s.commerce.products.filter((p) => p.category === cat).reduce((t, p) => t + p.stockBottles, 0);
const recipe = (s: GameState, kind: 'soju' | 'malt') => s.production.recipes.find((r) => r.kind === kind && !r.mashBill.some((m) => m.ingredientId === 'malt_peated'))?.id;
const demandLast = (s: GameState, cat: ProductCategory) => {
  const ids = new Set(s.commerce.products.filter((p) => p.category === cat).map((p) => p.id));
  return (s.history.reports.at(-1)?.sales ?? []).filter((x) => ids.has(x.productId)).reduce((t, x) => t + x.demandBottles, 0);
};
const SOJU_BATCHES = 2;
const maltBatches = (p: Policy) => p.maltB ?? (p.bigMalt ? 5 : 3);
const sojuBatches = (p: Policy) => p.sojuB ?? SOJU_BATCHES;
const setOrders = (s: GameState, soju: number, malt: number) =>
  act(act(s, { type: 'setOrder', recipeId: recipe(s, 'soju')!, batchesPerMonth: soju }), { type: 'setOrder', recipeId: recipe(s, 'malt')!, batchesPerMonth: malt });

function fill(s: GameState, p?: Policy): GameState {
  if (p?.sellNewMake && s.month >= 48) { for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) s = act(s, { type: 'sellBulk', source: 'lot', id: lot.id }); return s; }
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
  if (p.loans === 'cheap') {
    // 3차 판: 배너를 보고 싼 정책자금만 한 건씩 받았다(전통주 2억·지자체 3억·창업 0.5억). 시설·운전자금·급전은 한도가 남아도 안 썼다
    if (!cashAlert(s)) return s;
    for (const [id, amt] of [['kr_regional', 300_000_000], ['kr_startup', 200_000_000], ['policy', 200_000_000]] as [string, number][]) {
      if (has(s, id) || (id === 'policy' && !s.production.flags.producedSoju)) continue;
      const r = applyAction(s, { type: 'takeLoan', offerId: id, amount: amt });
      if (!r.error) { s = r.state; break; }
    }
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

/** 순자산 중 원액(탱크·캐스크) 현물 매각가 — progress.netWorth와 같은 식 */
const spiritsValue = (s: GameState) => [...s.inventory.lots, ...s.inventory.casks.filter((c) => c.contents && !c.owner).map((c) => c.contents!)]
  .reduce((t, l) => t + (isBulkKind(l) ? l.volumeL * l.abv * spotBidPerLPA(s, l) : 0), 0);

interface Split { cash: number; loans: number; spirits: number; products: number; whiskyRevY6to9: number; whiskyRevY10to15: number; spiritsGainY2to5: number; productionY2to5: number }
interface Row { split: Split; cutMonth: number; policy: string; bankrupt3: number; bankrupt6: number; minCash: number; minCashMonth: number; loansMax: number; firstWhisky: number; nw: number; goal: boolean; verdict: string; whiskyY6to9: number }

function play(p: Policy, seed: number): Row {
  let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: TIER, loanAmount: LOAN, seed });
  const t = { firstWhisky: -1 };
  if (p.visitor) s = act(s, { type: 'buyEquipment', catalogId: 'visitor_basic' });
  if (p.bigMalt) for (let i = 0; i < 2; i++) s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' });
  if (p.farm) s = act(s, { type: 'buyEquipment', catalogId: 'kr_farm_registration' });
  s = setOrders(s, sojuBatches(p), maltBatches(p));
  const split: Split = { cash: 0, loans: 0, spirits: 0, products: 0, whiskyRevY6to9: 0, whiskyRevY10to15: 0, spiritsGainY2to5: 0, productionY2to5: 0 };
  let spirits12 = 0;
  let bankrupt3 = -1, bankrupt6 = -1, neg = 0, cut = false, cutMonth = -1, minCash = s.finance.cash, minCashMonth = 0, loansMax = 0, whiskyY6to9 = 0;
  const cats = () => new Map([...s.commerce.products, ...s.commerce.productArchive].map((x) => [x.id, x.category]));
  for (let m = 0; m < MONTHS; m++) {
    if (p.cut === 'y2to5') s = setOrders(s, sojuBatches(p), m >= 12 && m < 60 ? 1 : maltBatches(p));
    if (p.cut === 'p3' && (m === 25 || m === 35 || m === 40)) { s = setOrders(s, m === 35 ? 0 : sojuBatches(p), m === 35 ? 0 : m === 25 ? Math.ceil(maltBatches(p) / 2) : maltBatches(p)); if (cutMonth < 0) cutMonth = m; }
    // 2차 판: 경고(파산 배너 — 주의 단계 포함)를 처음 보고 생산을 모두 0으로 했다. 대출을 먼저 받으면 현금은 음수가 되지 않으므로 '배너가 뜬 때'로 본다
    if (p.cut === 'onCrisis' && !cut && cashAlert(s)) { s = setOrders(s, 0, 0); cut = true; cutMonth = m; }
    if (p.cut === 'at27' && !cut && m >= 27) { s = setOrders(s, 0, 0); cut = true; cutMonth = m; }
    s = bottle(s, p, t);
    s = fill(s, p);
    s = finance(s, p);
    // 6개월 규칙을 따로 세려고 시뮬레이션의 3개월 파산을 막는다(연속 개월을 1 이하로 덮어 쓴다) — 연속 개월은 스크립트가 센다(neg)
    s.finance.negativeCashMonths = Math.min(s.finance.negativeCashMonths, 1);
    s = advanceMonth(s);
    neg = s.finance.cash < 0 ? neg + 1 : 0;
    if (neg >= 3 && bankrupt3 < 0) bankrupt3 = s.month;
    if (neg >= 6) { bankrupt6 = s.month; break; }
    if (s.finance.cash < minCash) { minCash = s.finance.cash; minCashMonth = s.month; }
    loansMax = Math.max(loansMax, s.finance.loans.reduce((x, l) => x + l.balance, 0));
    if (s.month === 12) spirits12 = spiritsValue(s);
    if (s.month === 60) split.spiritsGainY2to5 = spiritsValue(s) - spirits12;
    if (s.month > 12 && s.month <= 60) split.productionY2to5 += s.history.reports.at(-1)?.expenses.production ?? 0;
    if (s.month >= 60) { const c = cats(); const rev = (s.history.reports.at(-1)?.sales ?? []).filter((x) => c.get(x.productId) === 'whisky').reduce((a, x) => a + x.revenue, 0); if (s.month < 108) split.whiskyRevY6to9 += rev; else split.whiskyRevY10to15 += rev; }
    if (s.month >= 60 && s.month < 108) { const c = cats(); whiskyY6to9 += (s.history.reports.at(-1)?.sales ?? []).filter((x) => c.get(x.productId) === 'whisky').reduce((a, x) => a + x.bottles, 0); }
  }
  const alive = bankrupt6 < 0;
  Object.assign(split, { cash: s.finance.cash, loans: s.finance.loans.reduce((x, l) => x + l.balance, 0), spirits: spiritsValue(s), products: s.commerce.products.reduce((x, q) => x + q.stockBottles * q.unitCost, 0) });
  const nw = alive ? netWorth(s) : NaN;
  const v = s.progress.verdict;
  return { split, cutMonth, policy: p.name, bankrupt3, bankrupt6, minCash, minCashMonth, loansMax, firstWhisky: t.firstWhisky, nw, goal: alive && bankrupt3 < 0 && !!s.scenario && nw >= s.scenario.equity * s.scenario.goal.netWorthMultiple, verdict: v ? `${v.result}${v.grade ? ':' + v.grade : ''}` : '-', whiskyY6to9 };
}

const eok = (v: number) => (Number.isFinite(v) ? `${(v / 1e8).toFixed(2)}억` : '—');
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const med = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)]! : NaN; };
const mo = (v: number) => (Number.isFinite(v) ? `${Math.round(v)}월` : '—');

console.log(process.env.P3
  ? `3차 MVP 플레이테스트 재현 — 한국 경기, ${TIER}, 시작 대출 ${eok(LOAN)}, ${SEEDS}시드 × ${MONTHS}개월, 이벤트 끔, 소주 1·언피티드 몰트 4배치, 스테인리스 발효조 2기`
  : `사람처럼 하는 MVP 판 — 한국 경기, ${TIER}, 시작 대출 ${eok(LOAN)}, ${SEEDS}시드 × ${MONTHS}개월, 이벤트 끔, 소주 ${SOJU_BATCHES}·언피티드 몰트 3배치(확장 정책은 5배치)`);
console.log('| 정책 | 파산 (3개월 규칙, 중앙 월) | 파산 (6개월 규칙, 중앙 월) | 최저 현금 중앙값 (그 달) | 최대 대출 잔액 평균 | 첫 위스키 | 6~9년 차 위스키 판매(병, 평균) | 15년 순자산 평균(3개월 규칙 생존) | 순자산 목표 달성 |');
console.log('|---|---|---|---|---|---|---|---|---|');
const ALL = new Map<string, Row[]>();
const RUN = process.env.P3 ? P3_POLICIES : POLICIES;
for (const p of RUN) {
  const rows = Array.from({ length: SEEDS }, (_, i) => play(p, i + 1));
  ALL.set(p.name, rows);
  const b3 = rows.filter((r) => r.bankrupt3 >= 0), b6 = rows.filter((r) => r.bankrupt6 >= 0);
  const alive3 = rows.filter((r) => r.bankrupt3 < 0 && r.bankrupt6 < 0);
  console.log(`| ${p.name} | ${b3.length}/${SEEDS} (${mo(med(b3.map((r) => r.bankrupt3)))}) | ${b6.length}/${SEEDS} (${mo(med(b6.map((r) => r.bankrupt6)))}) | ${eok(med(rows.map((r) => r.minCash)))} (${mo(med(rows.map((r) => r.minCashMonth)))}) | ${eok(avg(rows.map((r) => r.loansMax)))} | ${mo(med(rows.map((r) => r.firstWhisky).filter((x) => x >= 0)))} | ${Math.round(avg(rows.map((r) => r.whiskyY6to9))).toLocaleString()} | ${eok(avg(alive3.map((r) => r.nw)))} | ${rows.filter((r) => r.goal).length}/${SEEDS} |${rows.some((r) => r.cutMonth >= 0) ? ` 생산 중단 ${mo(med(rows.map((r) => r.cutMonth).filter((x) => x >= 0)))}` : ''}`);
}

if (process.env.SPLIT) {
  // 15년 순자산이 어디서 오나 (3개월 규칙 생존 판 평균) — 원액 현물가가 생산비보다 덜 자란다면 "숙성 재고 평가액" 표시는 생산을 말리는 쪽으로 읽힌다
  console.log('\n| 정책 | 15년 순자산 | = 현금 | − 대출 | + 원액 현물가 | + 제품 재고 | 위스키 매출 6~9년 차 | 10~15년 차 | 2~5년 차 원액 평가액 증가 | 같은 기간 생산비(소주 포함) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const p of RUN) {
    const alive = (ALL.get(p.name) ?? []).filter((r) => r.bankrupt3 < 0 && r.bankrupt6 < 0);
    if (!alive.length) { console.log(`| ${p.name} | 생존 판 없음 |||||||||`); continue; }
    const a = (k: keyof Split) => eok(avg(alive.map((r) => r.split[k])));
    console.log(`| ${p.name} | ${eok(avg(alive.map((r) => r.nw)))} | ${a('cash')} | ${a('loans')} | ${a('spirits')} | ${a('products')} | ${a('whiskyRevY6to9')} | ${a('whiskyRevY10to15')} | ${a('spiritsGainY2to5')} | ${a('productionY2to5')} |`);
  }
}
