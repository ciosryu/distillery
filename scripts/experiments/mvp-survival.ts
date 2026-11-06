// MVP 생존 실험 (docs/design/mvp.md §6, 결정 #130·#133·#135) — 게임 규칙은 바꾸지 않고, MVP 조건을 흉내 내는 봇만 돌린다.
// 실행: npx tsx scripts/experiments/mvp-survival.ts [시드수=10] [개월=180]
//   FARM=1     전통주 경감 등록(농업경영체 5천만 원)을 시작 때 한다
//   EVENTS=1   랜덤 이벤트를 켠다 (MVP는 끔, #130)
//   CAP=<n>    숙성고 용량 상한을 봇이 스스로 지킨다 (#137 압박 미리보기, 기본 = 게임 기본값)
//   MINAGE=<n> 위스키 병입 최소 숙성 개월 (기본 12 = 한국 법정 최소). 현금이 1억 아래면 12개월짜리도 낸다
//
// MVP 근사:
// - 한국 경기 기본 입지, 증류식 소주 + 싱글 몰트만. 고량주·진·비지터 센터·원액 계약·수출·브로커·매입 원액 없음
// - 직원(HR)은 MVP에서 끄지만 시뮬레이션은 직원이 증류를 운전하므로, 시작 디스틸러 + 영업 1명을 고정 인건비로 본다
// - 대출: 기존 은행·정책 대출만. 고금리 급전(#133)은 아직 없다 → 대출이 바닥나면 뉴메이크를 현물로 판다(비상 수단, #135)
// - 위스키: 한국 최소 숙성 12개월부터 병입 가능. 수요의 1.5개월치까지 오래된 캐스크부터 병입.
//   첫 해 통입분 중 5통은 12년 플래그십용으로 묶어 두고 144개월에 병입한다 (15년 목표 #133)
import { advanceMonth, applyAction, bulkValuePerLPA, newGame, previewBlend, warehouseCapacity, type Action, type GameState, type ProductCategory } from '../../src/sim';
import { EVENTS } from '../../src/sim/content/events';

const SEEDS = Number(process.argv[2] ?? 10);
const MONTHS = Number(process.argv[3] ?? 180);
const FARM = process.env.FARM === '1';
const CAP = process.env.CAP ? Number(process.env.CAP) : undefined;
/** 위스키 병입 최소 숙성(개월). 현금이 1억 아래면 12개월짜리도 낸다 (기존 브랜드형 봇의 브리지와 같은 방식) */
const MINAGE = Number(process.env.MINAGE ?? 12);
if (process.env.EVENTS !== '1') EVENTS.splice(0); // MVP: 랜덤 이벤트 OUT

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
  s = act(s, { type: 'setMarketing', amount: 5_000_000 });
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
  if (!t.flagshipBottled && s.month >= 144) {
    const fl = s.inventory.casks.filter((c) => t.flagship.has(c.id) && c.contents);
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

interface Row { plan: string; seed: number; bankrupt: boolean; bankruptMonth: number; minCash: number; minCashMonth: number; firstWhisky: number; flagship: boolean; netWorth: number; spotSoldL: number; sojuShare3y: number; capBlocked: number; loansMax: number }

function netWorth(s: GameState): number {
  const stock = [...s.inventory.lots, ...s.inventory.casks.flatMap((c) => (c.contents ? [c.contents] : []))].reduce((t, l) => t + l.volumeL * l.abv * bulkValuePerLPA(s, l) * 0.85, 0);
  const products = s.commerce.products.reduce((t, p) => t + p.stockBottles * p.unitCost, 0);
  return s.finance.cash - s.finance.loans.reduce((t, l) => t + l.balance, 0) + stock + products + s.finance.receivables.reduce((t, r) => t + r.amount, 0);
}

function play(p: Plan, seed: number): Row {
  let s = newGame({ seed, region: 'KR' });
  const t: Track = { flagship: new Set(), flagshipBottled: false, spotSoldL: 0, firstWhiskyMonth: -1, capBlocked: 0 };
  s = start(s, p);
  let minCash = s.finance.cash, minCashMonth = 0, loansMax = 0;
  for (let m = 0; m < MONTHS && s.status === 'running'; m++) {
    s = bottle(s, t);
    s = fill(s, t);
    s = finance(s, t);
    s = advanceMonth(s);
    if (s.finance.cash < minCash) { minCash = s.finance.cash; minCashMonth = s.month; }
    loansMax = Math.max(loansMax, s.finance.loans.reduce((x, l) => x + l.balance, 0));
  }
  const cats = new Map([...s.commerce.products, ...s.commerce.productArchive].map((x) => [x.id, x.category]));
  if (process.env.YEARLY === p.name && seed === 1) {
    for (let y = 0; y * 12 < s.history.reports.length; y++) {
      const rs = s.history.reports.filter((r) => r.month >= y * 12 && r.month < y * 12 + 12);
      const rev = (cat: string) => rs.flatMap((r) => r.sales).filter((x) => cats.get(x.productId) === cat).reduce((a, x) => a + x.revenue, 0);
      const exp: Record<string, number> = {};
      for (const r of rs) for (const [k, v] of Object.entries(r.expenses)) exp[k] = (exp[k] ?? 0) + v;
      const top = Object.entries(exp).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, v]) => `${k} ${(v / 1e6).toFixed(0)}`).join(', ');
      const wb = rs.flatMap((r) => r.sales).filter((x) => cats.get(x.productId) === 'whisky');
      console.error(`y${y + 1} 소주 ${(rev('soju_distilled') / 1e6).toFixed(0)}백만 · 위스키 ${(rev('whisky') / 1e6).toFixed(0)}백만 (${wb.reduce((a, x) => a + x.bottles, 0)}병/수요 ${wb.reduce((a, x) => a + x.demandBottles, 0)}) · 현물 ${(rs.reduce((a, r) => a + (r.spotBulkRevenue ?? 0), 0) / 1e6).toFixed(0)} | 비용(백만) ${top} | 연말 현금 ${((rs.at(-1)?.cashEnd ?? 0) / 1e8).toFixed(2)}억`);
    }
  }
  const r3 = s.history.reports.filter((r) => r.month < 36).flatMap((r) => r.sales);
  const soju = r3.filter((x) => cats.get(x.productId) === 'soju_distilled').reduce((a, x) => a + x.revenue, 0);
  const all = r3.reduce((a, x) => a + x.revenue, 0);
  return { plan: p.name, seed, bankrupt: s.status === 'bankrupt', bankruptMonth: s.status === 'bankrupt' ? s.month : -1, minCash, minCashMonth, firstWhisky: t.firstWhiskyMonth, flagship: t.flagshipBottled, netWorth: s.status === 'bankrupt' ? NaN : netWorth(s), spotSoldL: t.spotSoldL, sojuShare3y: all ? soju / all : 0, capBlocked: t.capBlocked, loansMax };
}

const eok = (v: number) => (Number.isFinite(v) ? `${(v / 1e8).toFixed(2)}억` : '—');
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const med = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)]! : NaN; };

console.log(`MVP 생존 실험 — 한국 경기, ${SEEDS}시드 × ${MONTHS}개월, 이벤트 ${process.env.EVENTS === '1' ? '켬' : '끔'}, 전통주 등록 ${FARM ? '함' : '안 함'}, 위스키 최소 병입 ${MINAGE}개월${CAP ? `, 숙성고 상한 ${CAP}통` : ''}`);
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
console.log(`\n시드별 1위(생존 중 순자산): ${Object.entries(wins).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
