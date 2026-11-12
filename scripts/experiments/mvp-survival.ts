// MVP 생존 실험 (docs/design/mvp.md §6, 결정 #130·#133·#135) — 게임 규칙은 바꾸지 않고, MVP 조건을 흉내 내는 봇만 돌린다.
// 실행: npx tsx scripts/experiments/mvp-survival.ts [시드수=10] [개월=180]
//   FARM=1     전통주 경감 등록(농업경영체 5천만 원)을 시작 때 한다
//   EVENTS=1   랜덤 이벤트를 켠다 (MVP는 끔, #130)
//   CAP=<n>    숙성고 용량 상한을 봇이 스스로 지킨다 (#137 압박 미리보기, 기본 = 게임 기본값)
//   MINAGE=<n> 위스키 병입 최소 숙성 개월 (기본 12 = 한국 법정 최소). 현금이 1억 아래면 12개월짜리도 낸다
//   VARIANT=<토큰,...> MVP 경제 규모 후보 (mvp.md §6.2) — 이 실험 안에서만 콘텐츠 값을 바꾼다
//     A1  관리비 월 1,000만 → 500만 (소규모 크래프트)
//     A2  관리비 → 400만 + 인건비 ×0.8 + 봇 마케팅 500만 → 300만(게임 기본값)
//     B   시작 자본 5억 → 10억
//     Bg  시설·지자체·창업 대출 거치 +24개월, 상환 기간 +24개월
//     C   비지터 센터 베이직 투어를 시작 때 짓는다
//     D   위스키 점유 상한 0.0055 → 0.01 (#85 이전 값)
//   CASH=<원> 시작 자본을 직접 정한다 (규모 티어 검토용, B보다 우선)
//   MVP=<micro|standard> 실제 MVP 시나리오 입구(newScenarioGame)로 시작한다 — VARIANT·CASH·EVENTS는 무시(시나리오가 정한다)
//     LOAN=<원>      사업 계획서의 시작 대출 (기본 0)
//     VISITOR=<월>   비지터 센터 베이직 투어를 짓는 달 (기본 0, -1 = 안 짓는다)
//     SALES2=1       표준 티어에 영업 직원 1명을 더 둔다 (티어 차별화 검토용)
//
// MVP 근사:
// - 한국 경기 기본 입지, 증류식 소주 + 싱글 몰트만. 고량주·진·비지터 센터·원액 계약·수출·브로커·매입 원액 없음
// - 직원(HR)은 MVP에서 끄지만 시뮬레이션은 직원이 증류를 운전하므로, 시작 디스틸러 + 영업 1명을 고정 인건비로 본다
// - 대출: 기존 은행·정책 대출만. 고금리 급전(#133)은 아직 없다 → 대출이 바닥나면 뉴메이크를 현물로 판다(비상 수단, #135)
// - 위스키: 한국 최소 숙성 12개월부터 병입 가능. 수요의 1.5개월치까지 오래된 캐스크부터 병입.
//   첫 해 통입분 중 5통은 12년 플래그십용으로 묶어 두고 144개월에 병입한다 (15년 목표 #133)
import { advanceMonth, applyAction, bulkValuePerLPA, MVP_KR, newGame, newScenarioGame, previewBlend, warehouseCapacity, type Action, type GameState, type ProductCategory } from '../../src/sim';
import { EVENTS } from '../../src/sim/content/events';
import { LOAN_OFFERS } from '../../src/sim/content/catalog';
import { REGIONS } from '../../src/sim/content/regions';
import { applyMgtKnobs, mgtPolicy } from './mgtKnobs';
// TECH-02 판정 도구 통일 ([결정 #292] ③, P-MGT-42 (a)): 순자산·목표 달성은 게임 정의(metrics.ts outcomeOf = progress.netWorth — 판정·P8과 같다)로 센다.
// 옛 정의(원액 = bulkValuePerLPA × 0.85)는 METRICS=1 비교 표에만 남긴다
import { achieved, outcomeOf, summarize, type RunOutcome } from './metrics';
applyMgtKnobs(); // MGT 실험 손잡이 (T-0) — 환경 변수가 없으면 아무 일도 하지 않는다

const SEEDS = Number(process.argv[2] ?? 10);
const MONTHS = Number(process.argv[3] ?? 180);
const FARM = process.env.FARM === '1';
const CAP = process.env.CAP ? Number(process.env.CAP) : undefined;
/** 위스키 병입 최소 숙성(개월). 현금이 1억 아래면 12개월짜리도 낸다 (기존 브랜드형 봇의 브리지와 같은 방식) */
const MINAGE = Number(process.env.MINAGE ?? 12);
if (process.env.EVENTS !== '1') EVENTS.splice(0); // MVP: 랜덤 이벤트 OUT
const VARIANT = new Set((process.env.VARIANT ?? '').split(',').filter(Boolean));
const KR = REGIONS.KR;
if (VARIANT.has('A1')) KR.overheadPerMonth = 5_000_000;
if (VARIANT.has('A2')) { KR.overheadPerMonth = 4_000_000; KR.laborCost = 0.8; }
const MARKETING = VARIANT.has('A2') ? 3_000_000 : 5_000_000;
const STARTING_CASH = process.env.CASH ? Number(process.env.CASH) : VARIANT.has('B') ? 1_000_000_000 : undefined;
if (VARIANT.has('Bg')) for (const o of LOAN_OFFERS) if (['facility', 'kr_regional', 'kr_startup'].includes(o.id)) { o.graceMonths += 24; o.termMonths += 24; }
if (VARIANT.has('D')) KR.market.whisky!.shareCap = 0.01;
const MVP = process.env.MVP as 'micro' | 'standard' | undefined;
const LOAN = Number(process.env.LOAN ?? 0);
const VISITOR = Number(process.env.VISITOR ?? 0);
if (process.env.SALES2 === '1') MVP_KR.tiers.find((t) => t.id === 'standard')!.staff.push({ role: 'sales', stats: { a: 50, b: 55, c: 50 }, ageAtHire: 33 });
if (MVP && (VARIANT.size || process.env.CASH)) throw new Error('MVP 모드에서는 VARIANT·CASH를 쓰지 않는다');

type Plan = { name: string; soju: number; malt: number };
const PLANS: Plan[] = [
  { name: '소주 위주', soju: 4, malt: 3 },
  { name: '균형', soju: 2, malt: 5 },
  { name: '몰트 위주', soju: 1, malt: 7 },
  { name: '위스키만(대조)', soju: 0, malt: 7 },
];

const act = (s: GameState, a: Action) => applyAction(s, a).state;
const stockOf = (s: GameState, cat: ProductCategory) => s.commerce.products.filter((p) => p.category === cat).reduce((t, p) => t + p.stockBottles, 0);
const recipe = (s: GameState, kind: 'soju' | 'malt') => s.production.recipes.find((r) => r.kind === kind && !r.mashBill.some((m) => m.ingredientId === 'malt_peated'))?.id;
const demandLast = (s: GameState, cat: ProductCategory) => {
  const ids = new Set(s.commerce.products.filter((p) => p.category === cat).map((p) => p.id));
  return (s.history.reports.at(-1)?.sales ?? []).filter((x) => ids.has(x.productId)).reduce((t, x) => t + x.demandBottles, 0);
};

interface Track { flagship: Set<string>; flagshipBottled: boolean; spotSoldL: number; firstWhiskyMonth: number; capBlocked: number }

function start(s: GameState, p: Plan): GameState {
  const sales = s.hr.candidates.filter((c) => c.role === 'sales').sort((a, b) => b.stats.b - a.stats.b)[0];
  if (sales) s = act(s, { type: 'hire', candidateId: sales.id });
  s = act(s, { type: 'setMarketing', amount: MARKETING });
  if (VARIANT.has('C') || (MVP && VISITOR === 0)) s = act(s, { type: 'buyEquipment', catalogId: 'visitor_basic' });
  if (FARM) s = act(s, { type: 'buyEquipment', catalogId: 'kr_farm_registration' });
  if (p.malt > 3) { s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' }); s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' }); }
  if (p.soju > 0) s = act(s, { type: 'setOrder', recipeId: recipe(s, 'soju')!, batchesPerMonth: p.soju });
  return act(s, { type: 'setOrder', recipeId: recipe(s, 'malt')!, batchesPerMonth: p.malt });
}

function fill(s: GameState, t: Track): GameState {
  const cap = Math.min(CAP ?? Infinity, warehouseCapacity(s));
  for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) {
    const need = Math.ceil((lot.volumeL * lot.abv) / (200 * 0.635));
    const room = cap - s.inventory.casks.filter((c) => c.contents).length;
    if (room <= 0) { t.capBlocked++; return s; }
    const n = Math.min(need, room);
    const empty = s.inventory.casks.filter((c) => !c.contents && !c.contamination).length;
    if (empty < n && s.finance.cash > 60_000_000) s = act(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: n - empty });
    const ids = s.inventory.casks.filter((c) => !c.contents && !c.contamination).slice(0, n).map((c) => c.id);
    if (!ids.length) return s;
    const before = new Set(s.inventory.casks.filter((c) => c.contents).map((c) => c.id));
    s = act(s, { type: 'fillCasks', lotId: lot.id, caskIds: ids, entryAbv: 0.635 });
    if (s.month < 12 && t.flagship.size < 5) for (const c of s.inventory.casks) if (c.contents && !before.has(c.id) && t.flagship.size < 5) t.flagship.add(c.id);
  }
  return s;
}

function bottle(s: GameState, t: Track): GameState {
  for (const lot of [...s.inventory.lots]) {
    if (lot.kind === 'soju' && stockOf(s, 'soju_distilled') < 1500 && s.month - lot.createdMonth >= 1)
      s = act(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: lot.volumeL }], options: { name: `소주 ${s.month}`, targetAbv: 0.25, bottleMl: 375, chillFilter: true, packagingId: 'standard' } });
  }
  // 12년 플래그십
  // 모든 플래그십 캐스크가 12년(144개월)을 채운 뒤 — 라벨 연수는 가장 어린 원액 기준이다 (경과 144개월이 아니라 숙성 144개월)
  const flAll = s.inventory.casks.filter((c) => t.flagship.has(c.id) && c.contents);
  if (!t.flagshipBottled && flAll.length && flAll.every((c) => c.contents!.oakMonths >= 144)) {
    const fl = flAll;
    const comps = fl.map((c) => ({ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL }));
    const opts = { name: '12년 플래그십', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };
    if (comps.length && previewBlend(s, comps, opts).ok) { s = act(s, { type: 'bottle', components: comps, options: opts }); t.flagshipBottled = true; }
  }
  const stock = stockOf(s, 'whisky');
  const target = Math.max(600, demandLast(s, 'whisky') * 1.5);
  if (stock < target) {
    const n = Math.min(10, Math.max(1, Math.ceil((target - stock) / 330)));
    const ready = s.inventory.casks.filter((c) => c.contents && c.contents.kind === 'malt' && c.contents.oakMonths >= (s.finance.cash < 100_000_000 ? 12 : MINAGE) && !t.flagship.has(c.id)).sort((a, b) => b.contents!.oakMonths - a.contents!.oakMonths).slice(0, n);
    if (ready.length) {
      const comps = ready.map((c) => ({ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL }));
      const opts = { name: `싱글 몰트 ${s.month}`, targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };
      if (previewBlend(s, comps, opts).ok) { s = act(s, { type: 'bottle', components: comps, options: opts }); if (t.firstWhiskyMonth < 0) t.firstWhiskyMonth = s.month; }
    }
  }
  return s;
}

function finance(s: GameState, t: Track): GameState {
  const has = (id: string) => s.finance.loans.some((l) => l.offerId === id);
  if (s.finance.cash < 200_000_000 && !has('kr_regional')) s = act(s, { type: 'takeLoan', offerId: 'kr_regional', amount: 300_000_000 });
  if (s.finance.cash < 100_000_000 && !has('kr_startup')) s = act(s, { type: 'takeLoan', offerId: 'kr_startup', amount: 200_000_000 });
  if (s.finance.cash < 100_000_000 && !has('working')) s = act(s, { type: 'takeLoan', offerId: 'working', amount: 300_000_000 });
  if (s.finance.cash < 50_000_000 && !has('facility')) s = act(s, { type: 'takeLoan', offerId: 'facility', amount: 500_000_000 });
  if (s.production.flags.producedSoju && !has('policy') && s.finance.cash < 300_000_000) s = act(s, { type: 'takeLoan', offerId: 'policy', amount: 200_000_000 });
  // 비상 수단: 현금이 바닥이면 탱크의 뉴메이크를 현물로 판다 (#135)
  if (s.finance.cash < 30_000_000) for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) { t.spotSoldL += lot.volumeL; s = act(s, { type: 'sellBulk', source: 'lot', id: lot.id }); }
  // 위스키만(대조): 현금이 빠듯하면 뉴메이크 일부를 판다
  return s;
}

interface Row { verdict: string; goal: boolean; plan: string; seed: number; bankrupt: boolean; bankruptMonth: number; minCash: number; minCashMonth: number; firstWhisky: number; flagship: boolean; netWorth: number; spotSoldL: number; sojuShare3y: number; capBlocked: number; loansMax: number; outcome: RunOutcome; legacyNetWorth: number; legacyGoal: boolean }

/** 옛 정의 (TECH-02 전) — 원액 = bulkValuePerLPA × 0.85, 국산 프리미엄·신뢰도·포화·운송비 없음, 고객 소유 통 포함. METRICS=1 비교 표에만 쓴다 */
function legacyNetWorth(s: GameState): number {
  const stock = [...s.inventory.lots, ...s.inventory.casks.flatMap((c) => (c.contents ? [c.contents] : []))].reduce((t, l) => t + l.volumeL * l.abv * bulkValuePerLPA(s, l) * 0.85, 0);
  const products = s.commerce.products.reduce((t, p) => t + p.stockBottles * p.unitCost, 0);
  return s.finance.cash - s.finance.loans.reduce((t, l) => t + l.balance, 0) + stock + products + s.finance.receivables.reduce((t, r) => t + r.amount, 0);
}

function play(p: Plan, seed: number): Row {
  let s = MVP ? newScenarioGame({ scenarioId: 'mvp_kr', tierId: MVP, loanAmount: LOAN, seed }) : newGame({ seed, region: 'KR', startingCash: STARTING_CASH });
  const t: Track = { flagship: new Set(), flagshipBottled: false, spotSoldL: 0, firstWhiskyMonth: -1, capBlocked: 0 };
  s = start(s, p);
  let minCash = s.finance.cash, minCashMonth = 0, loansMax = 0;
  // 월 리포트는 게임 안에서 최근 24개월만 상세로 남는다(lifecycle) → 실험 지표는 매달 따로 모은다
  const reps: GameState['history']['reports'] = [];
  for (let m = 0; m < MONTHS && s.status === 'running'; m++) {
    if (MVP && VISITOR > 0 && m === VISITOR) s = act(s, { type: 'buyEquipment', catalogId: 'visitor_basic' });
    s = bottle(s, t);
    s = fill(s, t);
    s = finance(s, t);
    s = mgtPolicy(s);
    s = advanceMonth(s);
    const last = s.history.reports.at(-1);
    if (last) reps.push(last);
    if (s.finance.cash < minCash) { minCash = s.finance.cash; minCashMonth = s.month; }
    loansMax = Math.max(loansMax, s.finance.loans.reduce((x, l) => x + l.balance, 0));
  }
  const cats = new Map([...s.commerce.products, ...s.commerce.productArchive].map((x) => [x.id, x.category]));
  if (process.env.YEARLY === p.name && seed === 1) {
    for (let y = 0; y * 12 < reps.length; y++) {
      const rs = reps.filter((r) => r.month >= y * 12 && r.month < y * 12 + 12);
      const rev = (cat: string) => rs.flatMap((r) => r.sales).filter((x) => cats.get(x.productId) === cat).reduce((a, x) => a + x.revenue, 0);
      const exp: Record<string, number> = {};
      for (const r of rs) for (const [k, v] of Object.entries(r.expenses)) exp[k] = (exp[k] ?? 0) + v;
      const top = Object.entries(exp).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, v]) => `${k} ${(v / 1e6).toFixed(0)}`).join(', ');
      const wb = rs.flatMap((r) => r.sales).filter((x) => cats.get(x.productId) === 'whisky');
      console.error(`y${y + 1} 소주 ${(rev('soju_distilled') / 1e6).toFixed(0)}백만 · 위스키 ${(rev('whisky') / 1e6).toFixed(0)}백만 (${wb.reduce((a, x) => a + x.bottles, 0)}병/수요 ${wb.reduce((a, x) => a + x.demandBottles, 0)}) · 현물 ${(rs.reduce((a, r) => a + (r.spotBulkRevenue ?? 0), 0) / 1e6).toFixed(0)} · 관광 ${(rs.reduce((a, r) => a + (r.tourismRevenue ?? 0), 0) / 1e6).toFixed(0)} | 비용(백만) ${top} | 연말 현금 ${((rs.at(-1)?.cashEnd ?? 0) / 1e8).toFixed(2)}억`);
    }
  }
  const r3 = reps.filter((r) => r.month < 36).flatMap((r) => r.sales);
  const soju = r3.filter((x) => cats.get(x.productId) === 'soju_distilled').reduce((a, x) => a + x.revenue, 0);
  const all = r3.reduce((a, x) => a + x.revenue, 0);
  const outcome = outcomeOf(s, s.status !== 'bankrupt');
  const nw = s.status === 'bankrupt' ? NaN : outcome.netWorth;
  const legacy = s.status === 'bankrupt' ? NaN : legacyNetWorth(s);
  const target = s.scenario ? s.scenario.equity * s.scenario.goal.netWorthMultiple : NaN;
  const v = s.progress.verdict;
  return { outcome, legacyNetWorth: legacy, legacyGoal: !!s.scenario && legacy >= target, verdict: v ? `${v.result}${v.grade ? ':' + v.grade : ''}` : '-', goal: !!s.scenario && achieved(outcome), plan: p.name, seed, bankrupt: s.status === 'bankrupt', bankruptMonth: s.status === 'bankrupt' ? s.month : -1, minCash, minCashMonth, firstWhisky: t.firstWhiskyMonth, flagship: t.flagshipBottled, netWorth: nw, spotSoldL: t.spotSoldL, sojuShare3y: all ? soju / all : 0, capBlocked: t.capBlocked, loansMax };
}

const eok = (v: number) => (Number.isFinite(v) ? `${(v / 1e8).toFixed(2)}억` : '—');
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const med = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)]! : NaN; };

console.log(`MVP 생존 실험 — 한국 경기, ${SEEDS}시드 × ${MONTHS}개월, 이벤트 ${process.env.EVENTS === '1' ? '켬' : '끔'}, 전통주 등록 ${FARM ? '함' : '안 함'}, 위스키 최소 병입 ${MINAGE}개월${CAP ? `, 숙성고 상한 ${CAP}통` : ''}, 변형 ${MVP ? `MVP ${MVP} · 시작 대출 ${(LOAN / 1e8).toFixed(1)}억 · 비지터 센터 ${VISITOR < 0 ? '없음' : `${VISITOR}월`}${process.env.SALES2 === '1' ? ' · 영업 2명' : ''}` : [...VARIANT].join('+') || 'base'}`);
const byPlan: Record<string, Row[]> = {};
const wins: Record<string, number> = {};
for (let seed = 1; seed <= SEEDS; seed++) {
  const rows = PLANS.map((p) => play(p, seed));
  for (const r of rows) (byPlan[r.plan] ??= []).push(r);
  const alive = rows.filter((r) => !r.bankrupt);
  const best = alive.length ? alive.reduce((a, b) => (b.netWorth > a.netWorth ? b : a)).plan : '전멸';
  wins[best] = (wins[best] ?? 0) + 1;
}
console.log('| 전략 | 파산 (평균 파산 월) | 최저 현금 중앙값 (그 달) | 최대 대출 잔액 평균 | 첫 위스키 병입 월 | 12년 플래그십 | 뉴메이크 현물 매각 (L, 평균) | 3년간 매출 중 소주 비중 | 15년 순자산 평균 (생존) | 숙성고 꽉 참 (월, 평균) |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const p of PLANS) {
  const rs = byPlan[p.name]!;
  const br = rs.filter((r) => r.bankrupt);
  const alive = rs.filter((r) => !r.bankrupt);
  console.log(`| ${p.name} (소주 ${p.soju} · 몰트 ${p.malt}배치) | ${br.length}/${rs.length}${br.length ? ` (${Math.round(avg(br.map((r) => r.bankruptMonth)))}월)` : ''} | ${eok(med(rs.map((r) => r.minCash)))} (${Math.round(med(rs.map((r) => r.minCashMonth)))}월) | ${eok(avg(rs.map((r) => r.loansMax)))} | ${Math.round(med(rs.filter((r) => r.firstWhisky >= 0).map((r) => r.firstWhisky)))}월 | ${rs.filter((r) => r.flagship).length}/${rs.length} | ${Math.round(avg(rs.map((r) => r.spotSoldL))).toLocaleString()} | ${(avg(rs.map((r) => r.sojuShare3y)) * 100).toFixed(0)}% | ${eok(avg(alive.map((r) => r.netWorth)))} | ${avg(rs.map((r) => r.capBlocked)).toFixed(0)} |`);
}
if (MVP) {
  // 게임의 실제 목표 판정 (S-9 progress.ts) — 결과·등급 분포
  for (const p of PLANS) {
    const c: Record<string, number> = {};
    for (const r of byPlan[p.name]!) c[r.verdict] = (c[r.verdict] ?? 0) + 1;
    console.log(`판정 ${p.name}: ${Object.entries(c).sort().map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  }
}
console.log(`\n시드별 1위(생존 중 순자산): ${Object.entries(wins).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
// 변형 비교표용 한 줄: 변형 | 전략별 파산 | 1위 분포 | 전략별 생존 순자산 평균 | 첫 위스키 병입 월(중앙값)
console.log(`SUMMARY | ${MVP ? `MVP:${MVP}:loan${LOAN / 1e8}:visitor${VISITOR}${process.env.SALES2 === '1' ? ':sales2' : ''}` : [...VARIANT].join('+') || 'base'} | 목표(×${MVP_KR.goal.netWorthMultiple}) 달성 ${PLANS.map((p) => byPlan[p.name]!.filter((r) => r.goal).length).join(' · ')} | ${PLANS.map((p) => `${byPlan[p.name]!.filter((r) => r.bankrupt).length}/${SEEDS}`).join(' · ')} | ${Object.entries(wins).map(([k, v]) => `${k} ${v}`).join(' · ')} | ${PLANS.map((p) => eok(avg(byPlan[p.name]!.filter((r) => !r.bankrupt).map((r) => r.netWorth)))).join(' · ')} | ${PLANS.map((p) => Math.round(med(byPlan[p.name]!.filter((r) => r.firstWhisky >= 0).map((r) => r.firstWhisky)))).join(' · ')}`);

if (process.env.METRICS === '1') {
  // TECH-02: 같은 판을 두 정의로 — 옛 정의(TECH-02 전 — 원액 = bulkValuePerLPA × 0.85, 국산 프리미엄·신뢰도·포화·운송비 없음) 대 게임 순자산(progress.netWorth — 판정·P8과 같다)
  const pc = (x: number) => `${Math.round(x * 100)}%`;
  console.log('\n| 전략 | 목표 달성 — 옛 정의 · 게임 순자산 | 생존 판 순자산 평균 — 옛 정의 · 게임 | 게임 정의 등급 S/A/B/C/F | 게임 정의 P10 · 하위 20% | 생존 |');
  console.log('|---|---|---|---|---|---|');
  for (const p of PLANS) {
    const rs = byPlan[p.name]!;
    const os = rs.map((r) => r.outcome);
    const m = summarize(os);
    const aliveOld = rs.filter((r) => !r.bankrupt).map((r) => r.legacyNetWorth), aliveNew = os.filter((o) => o.survived).map((o) => o.netWorth);
    // 시나리오 기간(MVP_KR.goal.months = 180)보다 짧게 돌리면 끝나지 않은 판도 등급이 매겨져 모두 C로 보인다(ARCH #337 검토) → 등급 대신 "판 중간"
    const grades = MONTHS < MVP_KR.goal.months ? `— (판 중간 ${MONTHS}/${MVP_KR.goal.months}개월)` : `${m.grades.S}/${m.grades.A}/${m.grades.B}/${m.grades.C}/${m.grades.F}`;
    console.log(`| ${p.name} | ${rs.filter((r) => r.legacyGoal).length}/${rs.length} · ${Math.round(m.goal * rs.length)}/${rs.length} | ${eok(avg(aliveOld))} · ${eok(avg(aliveNew))} | ${grades} | ${eok(m.nwP10)} · ${eok(m.nwCVaR20)} | ${pc(m.survival)} 생존 |`);
  }
}
