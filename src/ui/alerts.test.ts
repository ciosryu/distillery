import { describe, expect, it } from 'vitest';
import { advanceMonth, advanceMonths, applyAction, BANKRUPT_AFTER_MONTHS, newScenarioGame, type GameState } from '../sim';
import { AUTO_SAMPLE_EXPENSE, AUTO_SAMPLE_MIN_AGE } from '../sim/blendTable';
import { cashAlert, flagshipCandidates, flagshipImpact, runway, lastMonthFlow, loanSchedule, maltStoppedMonths, monthTodos, paymentJump, SAMPLE_STALE_MONTHS, spotSaleStake, TODO_ORDER } from './alerts';
import { AUTO_RESTOCK_EXPENSE, productionValue, whiskySupplyForecast } from '../sim/economics';
import { spotQuote } from '../sim';

// 1차 MVP 플레이테스트 대응 ①~④ — 화면용 계산이 시뮬레이션과 같은 값을 내는지 (코어 UI)
const mvp = (loanAmount = 0) => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount, seed: 1 });

describe('파산 카운트다운 (①)', () => {
  it('현금 부족 n개월째면 월말 (파산 기준 − n)번 남았다고 말한다 — 1이면 이번 달 말', () => {
    const s = mvp();
    expect(cashAlert(s)).toBeNull();
    s.finance.cash = -1;
    expect(cashAlert(s)?.kind).toBe('belowZeroNow');
    s.finance.negativeCashMonths = BANKRUPT_AFTER_MONTHS - 1;
    const a = cashAlert(s)!;
    expect(a.level).toBe('danger');
    expect(a.monthEndsLeft).toBe(1);
  });

  it('카운트다운 1이 뜬 상태에서 월말에도 마이너스면 실제로 파산한다 (step.ts와 같은 기준)', () => {
    let s: GameState = mvp();
    s.finance.cash = -1_000_000_000;
    s.finance.negativeCashMonths = BANKRUPT_AFTER_MONTHS - 1;
    expect(cashAlert(s)!.monthEndsLeft).toBe(1);
    s = advanceMonth(s);
    expect(s.status).toBe('bankrupt');
    expect(cashAlert(s)).toBeNull();
  });

  it('현금이 플러스여도 최근 3개월 속도로 3개월 안에 바닥나면 미리 노랑', () => {
    const s = mvp();
    s.finance.cash = 30_000_000;
    s.history.reports.push(...[1, 2, 3].map((m) => ({ month: m, netCash: -12_000_000 }) as unknown as GameState['history']['reports'][number]));
    const a = cashAlert(s)!;
    expect(a.kind).toBe('runway');
    expect(a.level).toBe('warn');
    expect(a.runwayMonths).toBe(2);
  });
});

describe('대출 상환 예정 (②)', () => {
  it('예정 원리금이 실제 결산의 이자 + 원금과 같다', () => {
    let s: GameState = mvp(300_000_000);
    expect(s.finance.loans.length).toBeGreaterThan(0);
    const sched = loanSchedule(s, 3);
    for (let i = 0; i < 3; i++) {
      s = advanceMonth(s);
      const r = s.history.reports.at(-1)!;
      expect((r.expenses.interest ?? 0) + (r.expenses.principal ?? 0)).toBe(sched[i]!.payment);
    }
  });

  it('거치가 끝나 납부가 뛰는 달을 찾는다', () => {
    const s = mvp();
    s.finance.loans = [{ id: 'L', offerId: 'x', name: 'x', principal: 100_000_000, balance: 100_000_000, annualRate: 0.06, termMonths: 60, monthlyPayment: 2_000_000, graceMonths: 3, startMonth: s.month }];
    const j = paymentJump(loanSchedule(s, 12))!;
    expect(j.month).toBe(s.month + 3);
    expect(j.from).toBe(500_000);
    expect(j.to).toBe(2_000_000);
  });
});

describe('이번 달 할 일 (③) · 지난달 현금 흐름 (④)', () => {
  it('탱크 몰트가 있으면 통입 대기를 알린다', () => {
    let s: GameState = mvp();
    const malt = s.production.recipes.find((r) => r.kind === 'malt')!;
    s = applyAction(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: 2 }).state;
    expect(monthTodos(s).some((t) => t.id === 'fill')).toBe(false);
    s = advanceMonth(s);
    expect(monthTodos(s).some((t) => t.id === 'fill')).toBe(true);
  });

  it('들어온 돈 + 나간 돈 = 그달 순현금 (결산표와 같은 원천)', () => {
    let s: GameState = mvp(200_000_000);
    const soju = s.production.recipes.find((r) => r.kind === 'soju')!;
    s = applyAction(s, { type: 'setOrder', recipeId: soju.id, batchesPerMonth: 2 }).state;
    s = advanceMonths(s, 6);
    for (const r of s.history.reports) {
      const f = lastMonthFlow(r);
      const sum = [...f.inflow, ...f.outflow].reduce((t, p) => t + p.amount, 0);
      expect(Math.abs(sum - r.netCash)).toBeLessThanOrEqual(f.inflow.length + f.outflow.length);
      expect(f.outflow.every((p) => p.amount < 0) && f.inflow.every((p) => p.amount > 0)).toBe(true);
    }
  });
});

describe('ARCH 사후 검토 (#90) — 시뮬레이션이 쓰는 지출 키는 모두 이름이 있다', () => {
  it('선도계약 정산(hedge, #179)·자동 샘플(#177)은 "기타"로 빠지지 않는다', () => {
    const r = { ...mvp().history.reports.at(-1), month: 0, revenue: 0, bulkRevenue: 0, netCash: -150, expenses: { hedge: 100, [AUTO_SAMPLE_EXPENSE]: 50 }, offTurn: {}, sales: [] } as never;
    const f = lastMonthFlow(r);
    expect(f.outflow.map((p) => p.label).sort()).toEqual(['샘플·분석', '선도계약 정산']);
  });
  it('자동 납품(#206) 병입비는 턴 사이 병입과 같은 "병입"으로 묶인다 — "기타"로 빠지지 않는다 (사후 검토)', () => {
    const r = { ...mvp().history.reports.at(-1), month: 0, revenue: 0, bulkRevenue: 0, netCash: -300, expenses: { [AUTO_RESTOCK_EXPENSE]: 200 }, offTurn: { bottling: -100 }, sales: [] } as never;
    expect(lastMonthFlow(r).outflow).toEqual([{ label: '병입', amount: -300 }]);
  });
  it('"샘플 시기" 기준 = 자동 샘플이 뜨는 기준', () => {
    expect(SAMPLE_STALE_MONTHS).toBe(AUTO_SAMPLE_MIN_AGE);
  });
});

describe('런웨이 — 한 번 나가는 설비 구매는 "이 속도"에 넣지 않는다', () => {
  it('시작하자마자 비지터 센터를 지어도 첫 달에 "약 3개월 뒤 바닥" 경보가 뜨지 않는다', () => {
    let s = mvp();
    s = applyAction(s, { type: 'buyEquipment', catalogId: 'visitor_basic' }).state;
    s = advanceMonth(s);
    expect(s.history.reports.at(-1)!.offTurn?.equipment).toBeLessThan(0);
    expect(runway(s).months!).toBeGreaterThan(6);
    expect(cashAlert(s)).toBeNull();
  });
});

describe('이번 달 할 일 — 비지터 센터 (3차 MVP 플레이테스트: 못 찾았다)', () => {
  it('MVP에서 비지터 센터가 없으면 할 일에 올리고, 지으면(공사 중 포함) 내린다', () => {
    let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    expect(monthTodos(s).some((t) => t.id === 'visitor')).toBe(true);
    s = applyAction(s, { type: 'buyEquipment', catalogId: 'visitor_basic' }).state;
    expect(monthTodos(s).some((t) => t.id === 'visitor')).toBe(false);
  });
});

describe('3차 MVP 플레이테스트 대응 (#203) — 멈춘 몰트 생산 · 원액 현물 판매의 대가 · 할 일 순서', () => {
  const maltId = (s: GameState) => s.production.recipes.find((r) => r.kind === 'malt')!.id;
  const setMalt = (s: GameState, n: number) => applyAction(s, { type: 'setOrder', recipeId: maltId(s), batchesPerMonth: n }).state;

  it('몰트 생산 지시가 0이면 "몰트 생산이 멈춰 있다 — n개월째"를 띄운다 — 생산 지시 칸의 빨간 경고(#185)와 같은 조건, 다시 켜면 사라진다', () => {
    const fresh = advanceMonth(setMalt(mvp(), 0)); // 한 번도 안 만들었으면 "멈췄다"가 아니라 "지시가 없다"
    expect(monthTodos(fresh).find((t) => t.id === 'malt-stopped')!.text).toMatch(/^몰트 생산 지시가 없다/);
    let s: GameState = advanceMonths(setMalt(mvp(), 2), 2);
    expect(monthTodos(s).some((t) => t.id === 'malt-stopped')).toBe(false);
    s = setMalt(s, 0);
    for (const o of s.production.orders) if (s.production.recipes.find((r) => r.id === o.recipeId)?.kind === 'grain') o.batchesPerMonth = 0;
    expect(productionValue(s).whiskyBottlesPerYear).toBe(0); // #185가 빨강으로 보이는 조건
    expect(monthTodos(s).find((t) => t.id === 'malt-stopped')).toMatchObject({ level: 'warn', action: '생산 지시로', target: { anchor: 'mvp-orders' } });
    expect(monthTodos(s).find((t) => t.id === 'malt-stopped')!.text).toContain('이번 달부터');
    s = advanceMonths(s, 3);
    expect(maltStoppedMonths(s)).toBe(3);
    expect(monthTodos(s).find((t) => t.id === 'malt-stopped')!.text).toMatch(/3개월째\. 1년 뒤부터 새로 팔 위스키가 없다/);
    s = setMalt(s, 1);
    expect(monthTodos(s).some((t) => t.id === 'malt-stopped')).toBe(false);
  });

  it('할 일은 위기 > 생산 멈춤 > 비지터 센터 > 통입·병입 > 샘플 순서로 보인다', () => {
    let s: GameState = advanceMonths(setMalt(mvp(), 2), 1); // 탱크 몰트 → 통입 대기
    s = setMalt(s, 0);
    const ids = monthTodos(s).map((t) => t.id);
    expect(ids.indexOf('malt-stopped')).toBeLessThan(ids.indexOf('fill'));
    const ranks = ids.map((id) => (TODO_ORDER.includes(id) ? TODO_ORDER.indexOf(id) : 5.5));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(TODO_ORDER.slice(0, 4)).toEqual(['flagship-low', 'loan-jump', 'malt-stopped', 'visitor']); // 남은 플래그십 후보(#261)는 맨 위 — 되돌릴 수 없다
    expect(TODO_ORDER.at(-1)).toBe('sample');
    expect(TODO_ORDER.indexOf('stockout')).toBe(TODO_ORDER.indexOf('visitor') + 1);
  });

  it('새로 열린 기능(#215)은 열린 뒤 3개월 동안 할 일 맨 위 — 결품·통입보다 위 (5차 전 점검)', async () => {
    const { advanceMonth } = await import('../sim');
    let s: GameState = advanceMonths(setMalt(mvp(), 2), 2); // 탱크 몰트 → 통입 할 일
    s.month = 59; s = advanceMonth(s); s = advanceMonth(s); // 60월 틱 — 6년 차 단계가 열린다
    const ids = monthTodos(s).map((t) => t.id);
    expect(ids[0]).toBe('stage-y5_market');
    expect(ids.indexOf('stage-y5_market')).toBeLessThan(ids.indexOf('fill')); // 결품(#204)은 비지터 센터 다음, 통입·병입보다 위
  });

  it('원액 현물 판매의 대가 — 지금 받는 돈은 B2B 견적, 위스키 병 수는 공급 전망(#178)의 탱크·통 몫 그대로, 탱크와 숙성 중인 통을 나눈다', () => {
    let s: GameState = mvp();
    expect(spotSaleStake(s)).toBeNull();
    s = advanceMonths(setMalt(s, 2), 2);
    const v1 = spotSaleStake(s)!;
    const f = whiskySupplyForecast(s, 1);
    expect(v1.tank!.bottles).toBe(f.reduce((t, y) => t + y.fromTank, 0));
    expect(v1.tank!.spotNow).toBe(s.inventory.lots.filter((l) => l.kind === 'malt').reduce((t, l) => t + spotQuote(s, l, l.volumeL), 0));
    expect(v1.tank!.revenue).toBe(v1.tank!.bottles * productionValue(s).pricePerBottle!);
    expect(v1.tank!.revenue!).toBeGreaterThan(v1.tank!.spotNow * 2);
    // 통에 넣으면 숙성 중인 통 쪽으로 옮겨 간다
    const lot = s.inventory.lots.find((l) => l.kind === 'malt')!;
    s = applyAction(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: 3 }).state;
    s = applyAction(s, { type: 'fillCasks', lotId: lot.id, caskIds: s.inventory.casks.filter((c) => !c.contents).slice(0, 3).map((c) => c.id), entryAbv: 0.635 }).state;
    const v2 = spotSaleStake(s)!;
    expect(v2.casks!.count).toBeGreaterThan(0);
    expect(v2.casks!.bottles).toBe(whiskySupplyForecast(s, 1).reduce((t, y) => t + y.fromCasks, 0));
    expect(v2.ready).toBeNull();
  });
});

describe('품절 제품 유지 · 결품 예고 (2026-11-09 오너 요청)', () => {
  const withSoju = () => {
    let s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const soju = s.production.recipes.find((r) => r.kind === 'soju')!;
    s = applyAction(s, { type: 'setOrder', recipeId: soju.id, batchesPerMonth: 1 }).state;
    s = advanceMonths(s, 2);
    const lot = s.inventory.lots.find((l) => l.kind === 'soju')!;
    return applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: 3 }], options: { name: '작은 소주', targetAbv: 0.4, bottleMl: 700, chillFilter: true, packagingId: 'standard' } }).state;
  };
  it('재고가 이번 달 수요보다 적으면 결품 예고, 다 팔리면 품절로 알린다', () => {
    let s = withSoju();
    expect(monthTodos(s).find((t) => t.id === 'stockout')?.text).toContain('다음 달 결품 예상');
    s = advanceMonths(s, 2);
    expect(monthTodos(s).find((t) => t.id === 'stockout')?.text).toContain('품절');
  });
  it('MVP에서는 품절 제품이 몇 달이 지나도 목록에 남는다', () => {
    let s = withSoju();
    const id = s.commerce.products.at(-1)!.id;
    s = advanceMonths(s, 8);
    expect(s.commerce.products.some((p) => p.id === id)).toBe(true);
    expect(s.commerce.products.find((p) => p.id === id)!.stockBottles).toBe(0);
  });
});

describe('IB 캐스크 입찰 — 10년 차 해금 (#224)', () => {
  it('제안이 있으면 할 일에 값·만료·판단 기준을 올리고 원액 B2B 탭으로 보낸다, 열린 달에는 새로 열림 안내도 B2B로', () => {
    let s = mvp();
    s.month = 108; s = advanceMonth(s);
    const stage = monthTodos(s).find((t) => t.id === 'stage-y9_casks');
    expect(stage?.target).toEqual({ tab: 'b2b' });
    expect(monthTodos(s).some((t) => t.id === 'cask-bid')).toBe(false);
    s.b2b.caskBids = [{ id: 'I1', buyerName: '테스트 병입자', caskId: 'KX', price: 3_800_000, expiresMonth: s.month + 2 }];
    const t = monthTodos(s).find((x) => x.id === 'cask-bid')!;
    expect(t.target).toEqual({ tab: 'b2b' });
    expect(t.text).toContain('380만');
    expect(t.text).toContain('다음 달까지');
    expect(t.level).toBe('warn'); // 기한 있는 제안 — 놓치지 않게(#253)
    s.b2b.caskBids[0]!.expiresMonth = s.month; // 마지막 턴
    expect(monthTodos(s).find((x) => x.id === 'cask-bid')!.text).toContain('이번 달까지');
  });
});

describe('수출이 국내를 굶김 (#257) · IB 해금 안내 통 수 (#259)', () => {
  it('지난달 수출된 제품이 국내 수요를 못 채웠으면 판매 탭으로 보내는 경고, 아니면 없다', () => {
    const s = mvp();
    const r = { ...s.history.reports.at(-1), month: s.month - 1, sales: [{ productId: 'a', name: '더 퍼스트', bottles: 10, revenue: 0, demandBottles: 130 }], exports: [{ marketId: 'JP', productId: 'a', name: '더 퍼스트', bottles: 200, revenue: 0, demandBottles: 200, freight: 0 }] } as never;
    s.history.reports = [...s.history.reports, r];
    const t = monthTodos(s).find((x) => x.id === 'export-starve')!;
    expect(t.level).toBe('warn');
    expect(t.text).toContain('120병');
    expect(t.target).toEqual({ tab: 'sales' });
    s.history.reports = s.history.reports.slice(0, -1);
    expect(monthTodos(s).some((x) => x.id === 'export-starve')).toBe(false);
  });

  it('IB 해금 안내에 3년 이상 통 수 — 없으면 제안이 오지 않는다고 말한다', () => {
    let s = mvp();
    s.month = 108; s = advanceMonth(s);
    expect(monthTodos(s).find((t) => t.id === 'stage-y9_casks')!.text).toContain('3년 이상 통이 없어 제안이 오지 않는다');
  });
});

describe('핸드필 존 할 일 (#233)', () => {
  it('지었고 비지터 센터가 있는데 지정한 통이 없으면 할 일에 올린다 — 통을 지정하면 사라진다', () => {
    const s = mvp();
    s.production.equipment.push({ id: 'EV', catalogId: 'visitor_basic', readyMonth: 0 } as never, { id: 'EH', catalogId: 'handfill_zone', readyMonth: 0 } as never);
    expect(monthTodos(s).find((t) => t.id === 'handfill')?.target).toEqual({ anchor: 'mvp-warehouse' });
    const c = s.inventory.casks.find((x) => !x.contents) ?? s.inventory.casks[0]!;
    c.contents = { id: 'LX', name: 'x', kind: 'malt', volumeL: 100, abv: 0.6, flavor: {}, createdMonth: 0, oakMonths: 30, sourced: false, costPerLPA: 1, batchId: 'BX' };
    c.handfill = true;
    expect(monthTodos(s).some((t) => t.id === 'handfill')).toBe(false);
  });
});

describe('자동 통입과 통입 대기 안내 (#239)', () => {
  it('자동 통입이 켜져 있고 빈 통이 넉넉하면 안내하지 않고, 모자라면 "통을 사라"로 바꾼다', () => {
    const s = mvp();
    s.inventory.lots.push({ id: 'TX', name: '몰트', kind: 'malt', volumeL: 400, abv: 0.68, flavor: {}, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 1, batchId: 'BX' });
    expect(monthTodos(s).find((t) => t.id === 'fill')?.target).toEqual({ anchor: 'mvp-fill' });
    s.inventory.autoFill = {};
    const empties = s.inventory.casks.filter((c) => !c.contents).length;
    const t = monthTodos(s).find((x) => x.id === 'fill');
    if (empties >= 3) expect(t).toBeUndefined();
    s.inventory.casks = s.inventory.casks.filter((c) => c.contents); // 빈 통 없음
    expect(monthTodos(s).find((x) => x.id === 'fill')?.target).toEqual({ anchor: 'mvp-space' });
  });
});

describe('자동 납품 원액 없음 할 일 (#243)', () => {
  it('자동 납품을 켠 제품이 판매 속도보다 재고가 적은데 같은 레시피 원액이 없으면 레시피 이름과 함께 알린다', () => {
    const s = mvp();
    const r = s.production.recipes.find((x) => x.kind === 'soju')!;
    s.inventory.lots = [];
    s.commerce.products.push({ id: 'PX', name: '옹기소주', category: 'soju_distilled', ageYears: null, abv: 0.4, bottleMl: 700, chillFiltered: true, packagingId: 'standard', flavor: {}, quality: 50, typicity: 50, style: '', sourcedShare: 0, stockBottles: 0, price: 15000, unitCost: 5000, createdMonth: 0, lastMonthSold: 100, totalSold: 100, autoRestock: 2, recipeIds: [r.id] } as never);
    const t = monthTodos(s).find((x) => x.id === 'restock-short');
    expect(t?.text).toContain('옹기소주');
    expect(t?.text).toContain(r.name);
    expect(t?.target).toEqual({ anchor: 'mvp-orders' });
  });
});

describe('12년 플래그십 후보 (#240 — 되돌릴 수 없는 행동의 남는 자원 경고)', () => {
  it('#238 isFlagshipCandidate와 같은 식 — 고객 소유 통은 빼고, 쓰고 나면 남는 수와 "새 통은 더 후보가 될 수 없다(final)"를 준다', async () => {
    const { isFlagshipCandidate } = await import('../sim/delegateCheck');
    let s: GameState = mvp();
    const malt = s.production.recipes.find((r) => r.kind === 'malt')!;
    s = applyAction(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: 2 }).state;
    s = advanceMonth(s);
    const lot = s.inventory.lots.find((l) => l.kind === 'malt')!;
    s = applyAction(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: 3 }).state;
    s = applyAction(s, { type: 'fillCasks', lotId: lot.id, caskIds: s.inventory.casks.filter((c) => !c.contents).slice(0, 3).map((c) => c.id), entryAbv: 0.635 }).state;
    const filled = s.inventory.casks.filter((c) => c.contents);
    expect(flagshipCandidates(s).map((c) => c.id)).toEqual(filled.filter((c) => isFlagshipCandidate(s, c)).map((c) => c.id));
    expect(filled.length).toBeGreaterThan(0);
    expect(flagshipCandidates(s).length).toBe(filled.length); // 1개월째에 넣은 통은 판이 끝나기 전 144개월을 채운다
    expect(flagshipImpact(s, [filled[0]!.id])).toEqual({ using: 1, left: filled.length - 1, before: filled.length, final: false });
    filled[0]!.owner = { name: '고객', soldMonth: s.month, deliverMonth: s.month + 60 }; // 고객 소유 통은 후보가 아니다
    expect(flagshipCandidates(s).length).toBe(filled.length - 1);
    s.month = 40; // 남은 140개월 < 144 — 새 통은 후보가 될 수 없다
    expect(flagshipImpact(s, []).final).toBe(true);
  });
});

describe('플래그십 후보 감소 알림 (#261)', () => {
  const withCasks = (month: number, oaks: number[]) => {
    const s = mvp();
    s.month = month;
    s.inventory.casks = s.inventory.casks.filter((c) => !c.contents);
    oaks.forEach((oak, i) => {
      const c = { ...s.inventory.casks[0]!, id: `C${i}`, contents: { id: `LC${i}`, name: `C${i}`, kind: 'malt' as const, volumeL: 150, abv: 0.6, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: oak, sourced: false, costPerLPA: 10_000 } };
      s.inventory.casks.push(c);
    });
    return s;
  };

  it('후보 집합이 닫힌 뒤 3통 이하이면 할 일 맨 위 — 닫히기 전·4통 이상·0통·판매 뒤는 없다', () => {
    const s = withCasks(100, [70, 66]); // 남은 80개월 — 64개월 이상이 후보
    expect(flagshipCandidates(s).length).toBe(2);
    const t = monthTodos(s);
    expect(t[0]?.id).toBe('flagship-low');
    expect(t[0]?.text).toContain('2통');
    expect(TODO_ORDER[0]).toBe('flagship-low');
    expect(monthTodos(withCasks(100, [70, 69, 68, 67])).some((x) => x.id === 'flagship-low')).toBe(false); // 4통
    expect(monthTodos(withCasks(20, [10])).some((x) => x.id === 'flagship-low')).toBe(false); // 아직 새 통이 후보가 될 수 있다
    const sold = withCasks(100, [70]);
    sold.progress.milestones.push({ id: 'flagship_sold', month: 99 } as never);
    expect(monthTodos(sold).some((x) => x.id === 'flagship-low')).toBe(false);
  });

  it('결산에 후보 수가 남고, 줄어든 진행은 소식 창(turnNews)에 "a → b통"으로 — 자동 납품이 쓴 달은 메모도', async () => {
    const { turnNews } = await import('./TurnBrief');
    const { noteCandidateUse, candidateVolumes } = await import('../sim/tags');
    let s = withCasks(100, [70, 66, 64]);
    s = advanceMonth(s);
    expect(s.history.reports.at(-1)!.flagshipCandidates).toBe(flagshipCandidates(s).length);
    const n0 = s.history.reports.at(-1)!.flagshipCandidates!;
    // 손으로 한 통을 비운 뒤 진행 — 후보가 하나 준다
    s.inventory.casks = s.inventory.casks.filter((c) => c.id !== 'C0');
    const from = s.month;
    s = advanceMonth(s);
    const news = turnNews(s, from);
    expect(news.notes[0]?.text).toContain(`플래그십 후보 ${n0} → ${n0 - 1}통`);
    // 자동 납품 메모 — 후보 통 원액이 줄면 제품 이름과 함께
    const before = candidateVolumes(s)!;
    const report = { notes: ['자동 납품 「안성 3년」 +300병 (목표 600병 = 2개월분 · 원액 C1)'] } as never as Parameters<typeof noteCandidateUse>[1];
    s.inventory.casks.find((c) => c.id === 'C1')!.contents!.volumeL -= 50;
    noteCandidateUse(s, report, before, 0);
    expect(report.notes.at(-1)).toMatch(/^플래그십 후보 1통에서 자동 납품이 원액을 썼다 — 「안성 3년」/);
  });
});
