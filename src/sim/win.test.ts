// 캠페인 승리 판정 (F4 코어 ARCH — [결정 #308·#309], core-integration §5 `win:` 행) · 옛 판(legacy-v15) 분기 보존
import { describe, expect, it } from 'vitest';
import { houseBrand } from './brands';
import { advanceMonth, advanceMonths, advanceUntil, applyAction, DEFAULT_STOPS, GRADE, warehouseCapacity, type Action, type GameState, type MonthReport, type Product } from './index';
import { caskEligibility } from './ledger';
import { addLot, lotsOf, sellFromLots } from './lots';
import { newScenarioGame } from './newScenario';
import { updateProgress } from './progress';

const v16 = (seed = 4) => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed });
const legacy = (seed = 4) => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed, rules: 'legacy-v15' });
const product = (over: Partial<Product> = {}): Product => ({ id: 'P', name: '12년', category: 'whisky', ageYears: 12, oakMonths: 150, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 85, typicity: 80, style: null, sourcedShare: 0, stockBottles: 300, price: 120_000, unitCost: 30_000, createdMonth: 100, lastMonthSold: 0, totalSold: 0, ...over });
const report = (s: GameState): MonthReport => ({ month: s.month, revenue: 0, expenses: {}, netCash: 0, cashEnd: 0, sales: [], production: [], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] });
const SALE = { kind: 'domestic', settlement: 'cash', unitPrice: 120_000 } as const;
const self = (woodMonths: number) => [{ batchId: 'b', origin: 'self' as const, siteId: 'default', kindAtBirth: 'malt' as const, contribLPA: 10, costKRW: 1000, woodMonths }];

describe('win: 미판매 running · 적격 실제 출고 1회 · 중복 0 ([결정 #324] verdict = 승리 달 한 번 + 판 종료만)', () => {
  it('적격 로트의 첫 유상 출고가 있는 달에 progress.win을 한 번 쓰고, 마일스톤·알림·성과 판정(heritage)을 남긴다 — 판은 계속 돈다', () => {
    const s = v16(); s.month = 150;
    s.commerce.products.push(product());
    addLot(s, 'P', 300, { month: 150, eligibleAtBottling: true });
    const r0 = report(s);
    updateProgress(s, r0); // 팔지 않았다 → 승리 없음, 판정 없음
    expect(s.progress.win).toBeUndefined();
    expect(s.progress.verdict).toBeUndefined();
    const r1 = report(s);
    sellFromLots(s, r1, 'P', 7, SALE);
    updateProgress(s, r1);
    expect(s.progress.win).toEqual({ month: 150, productId: 'P', lotId: 'P:150:0', kind: 'domestic', unitPrice: 120_000, bottles: 7 });
    expect(s.progress.milestones.find((m) => m.id === 'campaign_win')).toEqual({ id: 'campaign_win', month: 150, value: 85 });
    expect(r1.notes.join()).toContain('캠페인 승리');
    expect(s.progress.verdict).toMatchObject({ month: 151, result: 'heritage', flagshipQuality: 85 });
    expect(s.progress.verdict!.checks.find((c) => c.id === 'flagship')).toEqual({ id: 'flagship', ok: true, value: 85 });
    // 중복 0 — 다음 달 또 팔아도 win·마일스톤은 그대로
    s.month = 151;
    const r2 = report(s);
    sellFromLots(s, r2, 'P', 5, SALE);
    updateProgress(s, r2);
    expect(s.progress.win!.month).toBe(150);
    expect(s.progress.milestones.filter((m) => m.id === 'campaign_win')).toHaveLength(1);
    // 승리는 멈춤 사유가 아니다 — status running, 다음 달도 돈다
    expect(s.status).toBe('running');
    expect(advanceMonth(s).month).toBe(152);
  });

  it('등급: 승리 달 순자산 ≥ 목표 × 1.5 · 승리 로트 품질 ≥ 80 · 인지도 ≥ 20%면 S, 아니면 A — 핸드필 승리는 품질이 없어 A', () => {
    const s = v16(); s.month = 150;
    s.commerce.products.push(product());
    addLot(s, 'P', 300, { month: 150, eligibleAtBottling: true });
    s.finance.cash = s.scenario!.equity * s.scenario!.goal.netWorthMultiple * GRADE.sNetWorthRatio + 1;
    houseBrand(s).awareness = GRADE.sAwareness + 0.05;
    const r = report(s); sellFromLots(s, r, 'P', 1, SALE); updateProgress(s, r);
    expect(s.progress.verdict).toMatchObject({ result: 'heritage', grade: 'S' });
    const h = v16(); h.month = 150;
    h.finance.cash = s.finance.cash; houseBrand(h).awareness = GRADE.sAwareness + 0.05;
    addLot(h, 'handfill:C1', 3, { month: 150, eligibleAtBottling: true });
    const rh = report(h); sellFromLots(h, rh, 'handfill:C1', 3, { kind: 'cellar_door', settlement: 'cash', unitPrice: 290_000 }); updateProgress(h, rh);
    expect(h.progress.win).toMatchObject({ kind: 'cellar_door', productId: 'handfill:C1' });
    expect(h.progress.verdict).toMatchObject({ result: 'heritage', grade: 'A' });
    expect(h.progress.verdict!.flagshipQuality).toBeUndefined();
    expect(rh.notes.join()).toContain('핸드필');
  });

  it('새 판은 목표 기간(goal.months)에 강제 판정하지 않는다 — 승리 전에는 verdict 없음, 자동 진행도 verdict로 멈추지 않는다 · 파산은 failed', () => {
    const s = v16();
    s.scenario!.goal.months = 4;
    const r = advanceUntil(s, { months: 8, stopOn: DEFAULT_STOPS });
    expect(r.stoppedBy).toBe('maxMonths');
    expect(r.state.progress.verdict).toBeUndefined();
    expect(r.state.status).toBe('running');
    const b = v16(); b.finance.cash = -10_000_000_000;
    const t = advanceMonths(b, 6);
    expect(t.status).toBe('bankrupt');
    expect(t.progress.verdict).toMatchObject({ result: 'failed', grade: null });
    expect(t.progress.win).toBeUndefined();
  });

  it('옛 판(legacy-v15)은 사건이 있어도 win을 쓰지 않는다 — flagship_sold 마일스톤·180개월 판정 그대로', () => {
    const s = legacy(); s.month = 150;
    s.commerce.products.push(product());
    addLot(s, 'P', 300, { month: 150, eligibleAtBottling: true });
    const r = report(s); sellFromLots(s, r, 'P', 7, SALE); updateProgress(s, r);
    expect(s.progress.win).toBeUndefined();
    expect(s.progress.verdict).toBeUndefined();
    expect(s.progress.milestones.some((m) => m.id === 'campaign_win')).toBe(false);
  });
});

describe('win: 어린 제품 판매 + 적격 보충만으로 승리 0 (C03, FIFO #186)', () => {
  it('먼저 병입한 어린 로트가 다 팔린 뒤에야 적격 병이 나가고 그때 승리한다', () => {
    const s = v16(); s.month = 150;
    s.commerce.products.push(product({ stockBottles: 150 }));
    addLot(s, 'P', 100, { month: 60, eligibleAtBottling: false }); // 어린 위스키(5년)
    addLot(s, 'P', 50, { month: 150, eligibleAtBottling: true }); // 적격 보충
    const r1 = report(s); sellFromLots(s, r1, 'P', 80, SALE); updateProgress(s, r1);
    expect(s.progress.win).toBeUndefined();
    s.month = 151;
    const r2 = report(s); sellFromLots(s, r2, 'P', 30, SALE); updateProgress(s, r2);
    expect(s.progress.win).toMatchObject({ month: 151, lotId: 'P:150:0', bottles: 10 });
  });

  it('addLot은 원장을 받으면 적격을 스스로 판정한다 — 자가 몰트 144개월↑ true · 143 false · 원장 없음 비움(창작 금지) · 직접 준 값 우선', () => {
    const s = v16(); s.month = 150;
    expect(addLot(s, 'A', 10, { components: self(144) })!.eligibleAtBottling).toBe(true);
    expect(addLot(s, 'A', 10, { components: self(143) })!.eligibleAtBottling).toBe(false);
    expect(addLot(s, 'A', 10, {})!.eligibleAtBottling).toBeUndefined();
    expect(addLot(s, 'A', 10, { components: self(200), eligibleAtBottling: false })!.eligibleAtBottling).toBe(false);
    const old = legacy(); old.month = 150; // 옛 판은 원장이 있어도 입지·출처 규칙은 같다 — 원장의 origin이 self면 적격
    expect(addLot(old, 'A', 10, { components: self(144) })!.eligibleAtBottling).toBe(true);
  });

  it('통합: 적격 로트가 있는 12년 제품이 한 달 팔리면 그 달에 승리한다 (틱 5 판매 → 9 판정)', () => {
    const s = v16(); s.month = 150;
    houseBrand(s).awareness = 0.6;
    s.commerce.products.push(product({ price: 60_000 }));
    addLot(s, 'P', 300, { month: 150, eligibleAtBottling: true });
    const t = advanceMonth(s);
    const sold = t.history.reports.at(-1)!.sales.find((x) => x.productId === 'P')?.bottles ?? 0;
    expect(sold).toBeGreaterThan(0);
    expect(t.progress.win).toMatchObject({ month: 150, productId: 'P', kind: 'domestic' });
    expect(t.history.reports.at(-1)!.saleEvents!.some((e) => e.eligibleAtSale)).toBe(true);
    expect(applyAction(t, { type: 'acknowledgeVerdict' }).error).toBeUndefined();
  });
});

describe('win: 끝까지 — 생산 → 통입 → 숙성(원장 7·8) → 144개월 뒤 병입(addLot 자동 적격) → 판매 → progress.win (PROD #498 연결 뒤)', () => {
  it('적격 자가 몰트 통을 145개월에 병입하면 그 달 첫 판매로 승리한다 · 판은 계속 돈다 · 옛 flagship 마일스톤도 함께 남는다', () => {
    const act = (st: GameState, a: Action) => { const r = applyAction(st, a); if (r.error) throw new Error(`${a.type}: ${r.error}`); return r.state; };
    let s = v16(1);
    s.finance.cash += 30_000_000_000; // 판정만 본다 — 150개월 고정비를 버틸 돈
    const malt = s.production.recipes.find((r) => r.kind === 'malt' && !r.mashBill.some((x) => x.ingredientId === 'malt_peated'))!.id;
    s = act(s, { type: 'setOrder', recipeId: malt, batchesPerMonth: 2 });
    let bottledAt = -1;
    let productId = '';
    for (let i = 0; i < 160 && s.status === 'running'; i++) {
      if (s.month <= 24) for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) {
        const need = Math.ceil((lot.volumeL * lot.abv) / (200 * 0.635));
        const empty = s.inventory.casks.filter((c) => !c.contents && !c.contamination).length;
        const room = warehouseCapacity(s) - s.inventory.casks.length;
        if (empty < need && room > 0) s = act(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: Math.min(need - empty, room) });
        const ids = s.inventory.casks.filter((c) => !c.contents && !c.contamination).slice(0, need).map((c) => c.id);
        if (ids.length) s = act(s, { type: 'fillCasks', lotId: lot.id, caskIds: ids, entryAbv: 0.635 });
      }
      if (s.month === 26) s = act(s, { type: 'setOrder', recipeId: malt, batchesPerMonth: 0 });
      if (bottledAt < 0 && s.month >= 145) {
        const elig = s.inventory.casks.filter((c) => c.contents?.kind === 'malt' && !c.owner && caskEligibility(s, c).eligible);
        expect(elig.length).toBeGreaterThan(0);
        const before = new Set(s.commerce.products.map((p) => p.id));
        s = act(s, { type: 'bottle', components: elig.slice(0, 2).map((c) => ({ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL })), options: { name: '12년', targetAbv: 0.43, bottleMl: 700, chillFilter: true, packagingId: 'standard' } });
        productId = s.commerce.products.find((p) => !before.has(p.id))!.id;
        s = act(s, { type: 'setPricePolicy', productId, mode: 'turnover' });
        bottledAt = s.month;
        const lot = lotsOf(s).find((l) => l.productId === productId)!;
        expect(lot.eligibleAtBottling).toBe(true);
        expect(lot.components!.every((e) => e.origin === 'self' && e.kindAtBirth === 'malt' && e.woodMonths >= 144)).toBe(true);
      }
      s = advanceMonth(s);
      if (s.progress.win) break;
    }
    expect(bottledAt).toBe(145);
    expect(s.progress.win).toMatchObject({ month: 145, productId, lotId: `${productId}:145:0`, kind: 'domestic' });
    expect(s.progress.win!.bottles).toBeGreaterThan(0);
    expect(s.progress.verdict).toMatchObject({ month: 146, result: 'heritage' });
    expect(s.status).toBe('running');
    const ids = s.progress.milestones.map((m) => m.id);
    for (const id of ['flagship_bottled', 'flagship_sold', 'campaign_win']) expect(ids).toContain(id);
    expect(advanceMonths(s, 3).progress.win).toEqual(s.progress.win); // 중복 0
  });
});
