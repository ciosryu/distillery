// MKT 측정 공용 봇 — 단계 T MKT 확인 목록(docs/design/mkt-stage-t.md)의 측정 스크립트(mkt-*.ts)가 같이 쓴다.
// 게임 규칙은 바꾸지 않는다. 봇의 뼈대는 mvp-survival.ts(ARCH)의 "균형" 전략(소주 2 · 몰트 5배치, 12년 플래그십 5통, 대출·현물 비상 수단)을 옮겨 왔고,
// 그 위에 MKT 손잡이를 끼울 자리를 둔다: 수출 수락(T-MKT-1·2·9), 같은 주종 제품 수(T-MKT-5), 비지터 센터·어린 위스키(T-MKT-7·11), 세컨드 브랜드(T-MKT-4).
// mvp-survival.ts와 달리 위스키 병입 목표에 수출 수요를 넣는다(수출을 받으면 재고를 그만큼 더 낸다).
import {
  advanceMonth, applyAction, exportShortfalls, netWorth, newGame, newScenarioGame, previewBlend, warehouseCapacity,
  type Action, type BottleOptions, type GameState, type MonthReport, type Product, type ProductCategory,
} from '../../src/sim';
import { houseBrand, secondBrands } from '../../src/sim/brands';
import { currentSuggested } from '../../src/sim/economics';
import { EVENTS } from '../../src/sim/content/events';
import { EXPORT_MARKETS } from '../../src/sim/content/exports';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../../src/store/playlog';

/** MVP와 같게 랜덤 이벤트를 끈다 (EVENTS=1이면 켠다) — import하는 쪽이 이 모듈을 불러오면 바로 적용 */
if (process.env.EVENTS !== '1') EVENTS.splice(0);

export interface BotOpts {
  /** micro|standard = MVP 시나리오 입구, sandbox = 한국 경기 샌드박스(newGame, 잠금 없음 — 세컨드 브랜드는 여기서만) */
  mode: 'micro' | 'standard' | 'sandbox';
  seed: number;
  months: number;
  soju?: number;
  malt?: number;
  /** 비지터 센터 베이직을 짓는 달 (-1 = 안 짓는다, 기본 0 — MVP 생존 실험과 같음) */
  visitorMonth?: number;
  /** 위스키 병입 최소 숙성(개월, 기본 12). 현금이 1억 아래면 12개월짜리도 낸다(mvp-survival.ts와 같음) */
  minAge?: number;
  /** 주종당 제품 수 (0 = 병입마다 새 제품 — mvp-survival.ts와 같음, n = n개 제품을 돌아가며 재고 보충) */
  skus?: number;
  /** 수입사 제안을 받기 시작하는 달 (-1 = 수출 안 함). MVP에서는 84개월(8년 차)에 수출이 열린다 */
  exportFrom?: number;
  /** 수출가 배수 (0 = 제안가 그대로) */
  exportPrice?: number;
  /** 동시에 여는 수출 시장 수 상한 */
  exportMax?: number;
  /** 매달 봇 행동 뒤, 다음 달로 넘기기 전에 부르는 손잡이 (세컨드 브랜드 정책 등) */
  hook?: (s: GameState) => GameState;
}

export interface CurvePoint { month: number; cash: number; netWorth: number; awareness: number }
export interface RunResult {
  s: GameState;
  /** 매달 리포트 — 게임은 최근 24개월만 상세로 남기므로 따로 모은다 */
  reps: MonthReport[];
  curve: CurvePoint[];
  bankrupt: boolean;
  bankruptMonth: number;
  firstWhiskyMonth: number;
  exportOpened: { month: number; marketId: string }[];
  exportClosed: { month: number; marketId: string }[];
}

const act = (s: GameState, a: Action) => applyAction(s, a).state;
const stockOf = (s: GameState, cat: ProductCategory) => s.commerce.products.filter((p) => p.category === cat).reduce((t, p) => t + p.stockBottles, 0);
const recipe = (s: GameState, kind: 'soju' | 'malt') => s.production.recipes.find((r) => r.kind === kind && !r.mashBill.some((m) => m.ingredientId === 'malt_peated'))?.id;
/** 지난달 수요(병) — 국내 + 수출 */
function demandLast(s: GameState, cat: ProductCategory): number {
  const ids = new Set(s.commerce.products.filter((p) => p.category === cat).map((p) => p.id));
  const r = s.history.reports.at(-1);
  return (r?.sales ?? []).filter((x) => ids.has(x.productId)).reduce((t, x) => t + x.demandBottles, 0)
    + (r?.exports ?? []).filter((x) => ids.has(x.productId)).reduce((t, x) => t + x.demandBottles, 0);
}

interface Track { flagship: Set<string>; flagshipBottled: boolean; firstWhiskyMonth: number; closed: Set<string>; opened: RunResult['exportOpened']; closedLog: RunResult['exportClosed'] }

function start(s: GameState, o: Required<Omit<BotOpts, 'hook'>>): GameState {
  const sales = s.hr.candidates.filter((c) => c.role === 'sales').sort((a, b) => b.stats.b - a.stats.b)[0];
  if (sales) s = act(s, { type: 'hire', candidateId: sales.id });
  s = act(s, { type: 'setMarketing', amount: 5_000_000 });
  if (o.visitorMonth === 0) s = act(s, { type: 'buyEquipment', catalogId: 'visitor_basic' });
  if (o.malt > 3) { s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' }); s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' }); }
  if (o.soju > 0) s = act(s, { type: 'setOrder', recipeId: recipe(s, 'soju')!, batchesPerMonth: o.soju });
  return act(s, { type: 'setOrder', recipeId: recipe(s, 'malt')!, batchesPerMonth: o.malt });
}

function fill(s: GameState, t: Track): GameState {
  const cap = warehouseCapacity(s);
  for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) {
    const need = Math.ceil((lot.volumeL * lot.abv) / (200 * 0.635));
    const room = cap - s.inventory.casks.filter((c) => c.contents).length;
    if (room <= 0) return s;
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

/** 새 제품으로 낼지, 기존 제품(skus개를 돌아가며)을 보충할지 — skus = 0이면 언제나 새 제품 */
function bottleInto(s: GameState, skus: number, cat: ProductCategory, base: BottleOptions): BottleOptions {
  if (skus <= 0) return base;
  const mine = s.commerce.products.filter((p) => p.category === cat && p.name.startsWith(base.name.replace(/ \d+$/, '')));
  if (mine.length < skus) return { ...base, name: `${base.name.replace(/ \d+$/, '')} ${String.fromCharCode(65 + mine.length)}` };
  // 돌아가며: 재고가 가장 적은 제품을 채운다
  const target = [...mine].sort((a, b) => a.stockBottles - b.stockBottles || a.id.localeCompare(b.id))[0]!;
  return { ...base, name: target.name, restockId: target.id };
}

/** 병입 — 기존 제품을 보충했으면 값을 지금 권장가로 다시 맞춘다(새 제품은 병입 때 권장가로 나온다).
 *  다시 맞추지 않으면 첫 병입(어린 위스키 할인 ×0.77) 값이 15년 내내 남아 제품 수 비교(T-MKT-5)가 가격 효과로 뒤집힌다 */
function bottleAct(s: GameState, a: Extract<Action, { type: 'bottle' }>): GameState {
  s = act(s, a);
  const id = a.options.restockId;
  const p = id ? s.commerce.products.find((x) => x.id === id) : undefined;
  return p ? act(s, { type: 'setPrice', productId: p.id, price: currentSuggested(s, p) }) : s;
}

function bottle(s: GameState, t: Track, o: Required<Omit<BotOpts, 'hook'>>): GameState {
  for (const lot of [...s.inventory.lots]) {
    if (lot.kind === 'soju' && stockOf(s, 'soju_distilled') < 1500 && s.month - lot.createdMonth >= 1) {
      const opts = bottleInto(s, o.skus, 'soju_distilled', { name: `소주 ${s.month}`, targetAbv: 0.25, bottleMl: 375, chillFilter: true, packagingId: 'standard' });
      s = bottleAct(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: lot.volumeL }], options: opts });
    }
  }
  const flAll = s.inventory.casks.filter((c) => t.flagship.has(c.id) && c.contents);
  if (!t.flagshipBottled && flAll.length && flAll.every((c) => c.contents!.oakMonths >= 144)) {
    const comps = flAll.map((c) => ({ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL }));
    const opts = { name: '12년 플래그십', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };
    if (previewBlend(s, comps, opts).ok) { s = act(s, { type: 'bottle', components: comps, options: opts }); t.flagshipBottled = true; }
  }
  const stock = s.commerce.products.filter((p) => p.category === 'whisky' && p.name !== '12년 플래그십').reduce((a, p) => a + p.stockBottles, 0);
  const target = Math.max(600, demandLast(s, 'whisky') * 1.5);
  if (stock < target) {
    const n = Math.min(10, Math.max(1, Math.ceil((target - stock) / 330)));
    const ready = s.inventory.casks.filter((c) => c.contents && c.contents.kind === 'malt' && c.contents.oakMonths >= (s.finance.cash < 100_000_000 ? 12 : o.minAge) && !t.flagship.has(c.id)).sort((a, b) => b.contents!.oakMonths - a.contents!.oakMonths).slice(0, n);
    if (ready.length) {
      const comps = ready.map((c) => ({ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL }));
      const opts = bottleInto(s, o.skus, 'whisky', { name: `싱글 몰트 ${s.month}`, targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' });
      if (previewBlend(s, comps, opts).ok) { s = bottleAct(s, { type: 'bottle', components: comps, options: opts }); if (t.firstWhiskyMonth < 0) t.firstWhiskyMonth = s.month; }
    }
  }
  return s;
}

function finance(s: GameState): GameState {
  const has = (id: string) => s.finance.loans.some((l) => l.offerId === id);
  if (s.finance.cash < 200_000_000 && !has('kr_regional')) s = act(s, { type: 'takeLoan', offerId: 'kr_regional', amount: 300_000_000 });
  if (s.finance.cash < 100_000_000 && !has('kr_startup')) s = act(s, { type: 'takeLoan', offerId: 'kr_startup', amount: 200_000_000 });
  if (s.finance.cash < 100_000_000 && !has('working')) s = act(s, { type: 'takeLoan', offerId: 'working', amount: 300_000_000 });
  if (s.finance.cash < 50_000_000 && !has('facility')) s = act(s, { type: 'takeLoan', offerId: 'facility', amount: 500_000_000 });
  if (s.production.flags.producedSoju && !has('policy') && s.finance.cash < 300_000_000) s = act(s, { type: 'takeLoan', offerId: 'policy', amount: 200_000_000 });
  if (s.finance.cash < 30_000_000) for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) s = act(s, { type: 'sellBulk', source: 'lot', id: lot.id });
  return s;
}

/** 수출 정책 — exportFrom 달부터 제안을 받는다(현금이 입장료 + 2억 넘을 때, 최대 exportMax곳). 12개월 뒤 최근 6개월 공헌이 현지 마케팅 분담보다 작으면 닫는다(balance-sim.ts와 같은 규칙) */
function exportPolicy(s: GameState, t: Track, o: Required<Omit<BotOpts, 'hook'>>): GameState {
  if (o.exportFrom < 0 || s.month < o.exportFrom) return s;
  for (const offer of [...(s.commerce.exportOffers ?? [])]) {
    if ((s.commerce.exports ?? []).length >= o.exportMax) break;
    if (t.closed.has(offer.marketId) || s.finance.cash <= offer.entryCost + 200_000_000) continue;
    s = act(s, { type: 'acceptExportOffer', offerId: offer.id });
    if (!(s.commerce.exports ?? []).some((e) => e.marketId === offer.marketId)) continue;
    if (o.exportPrice > 0) s = act(s, { type: 'setExportPrice', marketId: offer.marketId, priceFactor: o.exportPrice });
    t.opened.push({ month: s.month, marketId: offer.marketId });
  }
  for (const e of s.commerce.exports ?? []) {
    if (s.month - e.readyMonth < 12) continue;
    const recent = s.history.reports.slice(-6).flatMap((r) => (r.exports ?? []).filter((x) => x.marketId === e.marketId));
    const margin = recent.reduce((a, x) => a + x.revenue - x.freight - x.bottles * (s.commerce.products.find((p) => p.id === x.productId)?.unitCost ?? 0), 0) / 6;
    if (margin < (e.marketingPerMonth ?? EXPORT_MARKETS[e.marketId].monthlyCost)) { s = act(s, { type: 'closeExport', marketId: e.marketId }); t.closed.add(e.marketId); t.closedLog.push({ month: s.month, marketId: e.marketId }); }
  }
  return s;
}

export function runBot(opts: BotOpts): RunResult {
  const o: Required<Omit<BotOpts, 'hook'>> = { soju: 2, malt: 5, visitorMonth: 0, minAge: 12, skus: 0, exportFrom: -1, exportPrice: 0, exportMax: 3, ...opts };
  let s = o.mode === 'sandbox' ? newGame({ seed: o.seed, region: 'KR' }) : newScenarioGame({ scenarioId: 'mvp_kr', tierId: o.mode, loanAmount: 0, seed: o.seed });
  const t: Track = { flagship: new Set(), flagshipBottled: false, firstWhiskyMonth: -1, closed: new Set(), opened: [], closedLog: [] };
  s = start(s, o);
  const reps: MonthReport[] = [];
  const curve: CurvePoint[] = [];
  for (let m = 0; m < o.months && s.status === 'running'; m++) {
    if (o.visitorMonth > 0 && m === o.visitorMonth) s = act(s, { type: 'buyEquipment', catalogId: 'visitor_basic' });
    s = bottle(s, t, o);
    s = fill(s, t);
    s = finance(s);
    s = exportPolicy(s, t, o);
    if (opts.hook) s = opts.hook(s);
    s = advanceMonth(s);
    const last = s.history.reports.at(-1);
    if (last) reps.push(last);
    curve.push({ month: s.month, cash: s.finance.cash, netWorth: netWorth(s), awareness: houseBrand(s).awareness });
  }
  return { s, reps, curve, bankrupt: s.status === 'bankrupt', bankruptMonth: s.status === 'bankrupt' ? s.month : -1, firstWhiskyMonth: t.firstWhiskyMonth, exportOpened: t.opened, exportClosed: t.closedLog };
}

// ---- 지표 ----

/** 제품 id → 제품 (판매 중 + 보관함) — 리포트의 원가를 찾을 때 */
export const productIndex = (s: GameState): Map<string, Product> => new Map([...s.commerce.productArchive, ...s.commerce.products].map((p) => [p.id, p as Product]));

/** 수출 공헌(원): 매출 − 운임 − 병 원가 − 현지 마케팅 분담(export_fixed). from달 이후 */
export function exportContribution(r: RunResult, from = 0): number {
  const idx = productIndex(r.s);
  return r.reps.filter((x) => x.month >= from).reduce((t, x) => t
    + (x.exports ?? []).reduce((a, e) => a + e.revenue - e.freight - e.bottles * (idx.get(e.productId)?.unitCost ?? 0), 0)
    - (x.expenses.export_fixed ?? 0), 0);
}
/** 국내 매출 비중 (국내 ÷ (국내 + 수출)), from달 이후 */
export function domesticShare(r: RunResult, from = 0): number {
  const rs = r.reps.filter((x) => x.month >= from);
  const dom = rs.reduce((t, x) => t + x.sales.reduce((a, y) => a + y.revenue, 0), 0);
  const exp = rs.reduce((t, x) => t + (x.exports ?? []).reduce((a, y) => a + y.revenue, 0), 0);
  return dom + exp > 0 ? dom / (dom + exp) : 1;
}
/** 수출 중인 제품의 국내 미충족(병/년)과 그 제품들의 국내 수요(병/년) — T-MKT-2 판정 "미충족 ≤ 국내 수요의 30%" */
export function exportStarve(r: RunResult, from = 0): { unmetPerYear: number; demandPerYear: number } {
  const rs = r.reps.filter((x) => x.month >= from);
  const years = Math.max(1, rs.length / 12);
  let unmet = 0, demand = 0;
  for (const x of rs) {
    const exported = new Set((x.exports ?? []).filter((e) => e.bottles > 0).map((e) => e.productId));
    unmet += exportShortfalls(x).reduce((a, y) => a + y.unmet, 0);
    demand += x.sales.filter((y) => exported.has(y.productId)).reduce((a, y) => a + y.demandBottles, 0);
  }
  return { unmetPerYear: unmet / years, demandPerYear: demand / years };
}
/** 달 m의 곡선 값 (판이 그 전에 끝났으면 undefined) */
export const at = (r: RunResult, m: number): CurvePoint | undefined => r.curve.find((c) => c.month === m);
/** 세컨드 브랜드 인지도 (없으면 NaN) */
export const secondAwareness = (s: GameState): number => secondBrands(s)[0]?.awareness ?? NaN;

/** 사람 판 세이브(또는 "기록 내보내기" 파일)를 읽는다 — 게임의 "불러오기"와 같은 경로(마이그레이션 포함) */
export function loadSave(path: string): GameState {
  const parsed = parsePlayFile(readFileSync(path, 'utf8'));
  if ('error' in parsed) throw new Error(`${path}: ${parsed.error}`);
  return parsed.save;
}

// ---- 출력 ----
export const eok = (v: number) => (Number.isFinite(v) ? `${(v / 1e8).toFixed(2)}억` : '—');
export const pct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : '—');
export const avg = (xs: number[]) => { const a = xs.filter(Number.isFinite); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; };
export const med = (xs: number[]) => { const a = xs.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)]! : NaN; };
export const args = { seeds: Number(process.argv[2] ?? 10), months: Number(process.argv[3] ?? 180) };
export const MODE = (process.env.MVP ?? 'standard') as BotOpts['mode'];
