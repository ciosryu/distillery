import { describe, expect, it } from 'vitest';
import { advanceMonths, annuityPayment, applyAction, demandFor, newGame, newScenarioGame, type GameState, type SpiritLot, inventoryCollateral, inventoryLoanRoom, inventoryMarginCall, type MonthReport } from './index';
import { ownsFacility } from './util';

// 재무·인사·이벤트 테스트 (파트 MGT, 결정 #144 — sim.test.ts·sites.test.ts에서 옮겨 왔다. 테스트 이름·본문 불변)

const recipeId = (s: GameState, prefix: string) => s.production.recipes.find((r) => r.name.startsWith(prefix))!.id;
const lot = (over: Partial<SpiritLot> = {}): SpiritLot => ({ id: 'L1', name: 'l', kind: 'soju', volumeL: 400, abv: 0.45, flavor: { nuruk_rice: 30, fresh_fruit: 20 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 9_000, ...over });
const report = (s: GameState): MonthReport => ({ month: s.month, revenue: 0, expenses: {}, netCash: 0, cashEnd: 0, sales: [], production: [], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] });

describe('변동 요소', () => {
  it('수요 보정치가 활성 기간에만 수요를 바꾼다', () => {
    const s = newGame({ seed: 24 });
    const p = { id: 'p', name: 'p', category: 'gin' as const, ageYears: null, abv: 0.43, bottleMl: 700, chillFiltered: true, packagingId: 'standard', flavor: {}, quality: 55, typicity: 100, style: null, sourcedShare: 0, stockBottles: 100, price: 8000, unitCost: 0, createdMonth: 0, lastMonthSold: 0, totalSold: 0 };
    const base = demandFor(s, p, 1, 1).demandBottles;
    const s2 = { ...s, world: { ...s.world, modifiers: [{ id: 'm', key: 'demand:gin', factor: 0.5, fromMonth: 0, untilMonth: 3, label: 't' }] } };
    expect(demandFor(s2, p, 1, 1).demandBottles).toBeCloseTo(base * 0.5, 6);
    expect(demandFor({ ...s2, month: 3 }, p, 1, 1).demandBottles).toBeCloseTo(base, 6);
  });

  it('10년이면 이벤트가 여러 번 일어나고, 선택 이벤트는 기본값으로 처리된다', () => {
    let s = newGame({ seed: 25, startingCash: 50_000_000_000 });
    s = applyAction(s, { type: 'setOrder', recipeId: recipeId(s, '싱글 몰트 — 언'), batchesPerMonth: 2 }).state;
    s = advanceMonths(s, 120);
    expect(s.events.log.length).toBeGreaterThan(20);
    expect(s.events.pending.every((p) => p.month >= s.month - 1)).toBe(true);
  });

  it('예보된 이벤트는 예고 월이 지나면 발생하거나 빗나간다', () => {
    let s = newGame({ seed: 26 });
    s = { ...s, events: { ...s.events, forecasts: [{ id: 'f', defId: 'barley_failure', title: '보리 흉작', text: 't', fireMonth: 1, certainty: 1 }] } };
    s = advanceMonths(s, 2);
    expect(s.events.forecasts.length === 0 || s.events.forecasts.every((f) => f.defId !== 'barley_failure' || f.fireMonth > 1)).toBe(true);
    expect(s.world.modifiers.some((m) => m.key === 'ingredient:malt_unpeated' && m.factor > 1)).toBe(true);
  });

  it('선택 이벤트를 고르면 효과가 적용된다', () => {
    let s = newGame({ seed: 27 });
    s = { ...s, events: { ...s.events, pending: [{ id: 'v', defId: 'export_support', title: 't', text: 't', month: 0, choices: [], defaultChoice: 1 }] } };
    const cash = s.finance.cash;
    s = applyAction(s, { type: 'resolveEvent', eventId: 'v', choice: 0 }).state;
    expect(s.events.pending.length).toBe(0);
    expect(s.finance.cash).not.toBe(cash);
  });
});

describe('재무', () => {
  it('원리금 균등 상환액', () => {
    expect(annuityPayment(120_000_000, 0, 120)).toBe(1_000_000);
    const p = annuityPayment(100_000_000, 0.06, 12);
    expect(p).toBeGreaterThan(8_600_000);
    expect(p).toBeLessThan(8_610_000);
  });

  it('대출 잔액은 매달 줄어든다', () => {
    let s = newGame({ seed: 5 });
    s = applyAction(s, { type: 'takeLoan', offerId: 'working', amount: 100_000_000 }).state;
    const b0 = s.finance.loans[0]!.balance;
    s = advanceMonths(s, 3);
    expect(s.finance.loans[0]!.balance).toBeLessThan(b0);
  });

  it('고금리 급전 (#133): 은행 상품을 쓰는 중에도 받을 수 있고, 연 20% 12개월 원리금 균등으로 1년 안에 다 갚는다', () => {
    let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 500_000_000, seed: 5 });
    expect(s.finance.loans.length).toBeGreaterThan(0); // 시작 대출(은행·정책 상품)
    const r = applyAction(s, { type: 'takeLoan', offerId: 'emergency', amount: 500_000_000 });
    expect(r.error).toBeUndefined();
    s = r.state;
    const e = s.finance.loans.find((l) => l.offerId === 'emergency')!;
    expect(e.principal).toBe(100_000_000); // 한도
    expect(e.monthlyPayment).toBe(annuityPayment(100_000_000, 0.2, 12));
    expect(applyAction(s, { type: 'takeLoan', offerId: 'emergency', amount: 10_000_000 }).error).toMatch(/이미 이용 중/);
    s = advanceMonths(s, 12);
    expect(s.finance.loans.some((l) => l.offerId === 'emergency')).toBe(false);
    // 다 갚으면 다시 받을 수 있다
    expect(applyAction(s, { type: 'takeLoan', offerId: 'emergency', amount: 50_000_000 }).error).toBeUndefined();
  });
});

describe('v1.0 운영 시스템', () => {
  it('부사수 없이 마스터가 떠나면 하우스 스타일 초기화, 24개월 수련한 부사수가 있으면 이어받는다', () => {
    let s = newGame({ seed: 1, startingCash: 5_000_000_000 });
    s.hr.houseStyle = 50;
    const master = s.hr.staff[0]!;
    let a = applyAction(s, { type: 'fire', staffId: master.id }).state;
    expect(a.hr.houseStyle).toBe(0);
    const cand = s.hr.candidates.find((c) => c.role === 'distiller')!;
    s = applyAction(s, { type: 'hire', candidateId: cand.id, asApprentice: true }).state;
    s.month += 24;
    a = applyAction(s, { type: 'fire', staffId: master.id }).state;
    expect(a.hr.houseStyle).toBe(45);
  });

  it('에이징 커브(근속 기준): 근속 20년 전에는 스탯이 꺾이지 않고, 넘으면 꺾인다', () => {
    let s = newGame({ seed: 3 });
    s.finance.cash = 1e11; // 매출 없이 4년을 돌리므로 파산해서 진행이 멈추지 않게
    const x = s.hr.staff[0]!;
    const id = x.id; // 퇴사 이벤트로 순서가 바뀔 수 있어 id로 추적한다
    const me = (g: GameState) => g.hr.staff.find((y) => y.id === id)!;
    x.ageAtHire = 20;
    s.finance.cash = 1e12; // 개월을 건너뛰는 시나리오라 파산으로 진행이 멈추지 않게 한다
    s.month = 200; x.hiredMonth = 0; const before = { ...x.stats };
    s = advanceMonths(s, 24);
    const st = me(s).stats;
    expect(st.a >= before.a && st.b >= before.b && st.c >= before.c).toBe(true); // 레벨업으로 오를 수는 있어도 꺾이지 않는다
    s.month = 300;
    me(s).level = 1000; // 에이징만 보려고 레벨업을 막는다
    const mid = { ...me(s).stats };
    s = advanceMonths(s, 24);
    const after = me(s).stats;
    expect(after.a + after.b + after.c).toBeLessThan(mid.a + mid.b + mid.c);
  });

  it('에이징 커브: 65세에 은퇴한다', () => {
    let s = newGame({ seed: 1 });
    s.hr.staff[0]!.ageAtHire = 64.95;
    s = advanceMonths(s, 2);
    expect(s.hr.staff.length).toBe(0);
  });

  it('방재 설비가 있으면 재해 피해가 없다', () => {
    const s = newGame({ seed: 1 });
    expect(ownsFacility(s, 'facility_snow')).toBe(false);
    s.production.equipment.push({ id: 'F', catalogId: 'facility_snow', readyMonth: 0 });
    expect(ownsFacility(s, 'facility_snow')).toBe(true);
  });

  it('투자 유치와 캐스크 오너십 선도 판매', () => {
    let s = newGame({ seed: 1, startingCash: 5_000_000_000 });
    const cash = s.finance.cash;
    s = applyAction(s, { type: 'takeInvestment', offerId: 'angel' }).state;
    expect(s.finance.cash).toBe(cash + 200_000_000);
    expect(s.finance.investorShare).toBeCloseTo(0.1, 5);
    const cask = { ...s.b2b.brokerOffers[0]!.cask, contents: { ...s.b2b.brokerOffers[0]!.cask.contents!, sourced: false } };
    s.inventory.casks.push(cask);
    // 캐스크 오너십은 테크 BIZ-1b 뒤 (tech-tree §1.2, 게이트 켜기 P-MGT-5)
    expect(applyAction(s, { type: 'sellCaskOwnership', caskId: cask.id }).error).toMatch(/BIZ-1b/);
    s.research.unlocked.push('BIZ-1b');
    const before = s.finance.cash;
    s = applyAction(s, { type: 'sellCaskOwnership', caskId: cask.id }).state;
    expect(s.finance.cash).toBeGreaterThan(before);
    expect(applyAction(s, { type: 'sellBulk', source: 'cask', id: cask.id }).error).toContain('고객');
  });
});

describe('월간 보고서 — 턴 사이 현금 흐름', () => {
  it('현물 벌크 판매(sellBulk)가 그달 보고서의 현물 매출·순현금에 잡힌다', () => {
    // 첫 달에 생산을 멈추는 이벤트(한파 등)가 없는 시드 — 이벤트 난수가 이벤트별 스트림이 되면서(S-5) 21 → 23
    let s = newGame({ seed: 23 });
    s = applyAction(s, { type: 'setOrder', recipeId: recipeId(s, '싱글 몰트 — 언'), batchesPerMonth: 2 }).state;
    s = advanceMonths(s, 1);
    const lot = s.inventory.lots.find((l) => l.kind === 'malt')!;
    const before = s.finance.cash;
    s = applyAction(s, { type: 'sellBulk', source: 'lot', id: lot.id }).state;
    const sold = s.finance.cash - before;
    expect(sold).toBeGreaterThan(0);
    expect(s.finance.pendingCash?.spotBulk).toBe(sold);

    s = advanceMonths(s, 1);
    const r = s.history.reports.at(-1)!;
    expect(r.spotBulkRevenue).toBe(sold);
    expect(r.offTurn?.spotBulk).toBe(sold);
    // 순현금 = 직전 결산 이후 현금 변화 전체 (현물 판매 포함)
    expect(r.netCash).toBeCloseTo(r.cashEnd - s.history.reports.at(-2)!.cashEnd, 0);
    expect(r.operatingCash).toBeCloseTo(r.netCash, 0);
    // 결산 후 대기 중인 턴 사이 흐름은 비워진다
    expect(s.finance.pendingCash).toEqual({});
  });

  it('대출·캐스크 구매·IB/현물 매각까지 섞여도 순현금 = 월말 현금 차이, 영업+투자+재무 = 순현금', () => {
    let s = newGame({ seed: 22 });
    const cash0 = s.finance.cash;
    s = applyAction(s, { type: 'takeLoan', offerId: 'working', amount: 100_000_000 }).state;
    s = applyAction(s, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: 2 }).state;
    s = applyAction(s, { type: 'buyBrokerCask', offerId: s.b2b.brokerOffers[0]!.id }).state;
    s = applyAction(s, { type: 'sellBulk', source: 'cask', id: s.inventory.casks.at(-1)!.id }).state;
    s = advanceMonths(s, 1);
    let r = s.history.reports.at(-1)!;
    expect(r.netCash).toBeCloseTo(r.cashEnd - cash0, 0);
    expect(r.offTurn?.loan).toBe(100_000_000);
    expect(r.offTurn?.casks).toBeLessThan(0);
    expect(r.offTurn?.brokerCask).toBeLessThan(0);
    expect(r.spotBulkRevenue).toBeGreaterThan(0);
    // 대출(실행 − 그달 원금 상환)은 재무, 빈 캐스크는 투자 — 영업 현금흐름에는 들어가지 않는다
    expect(r.expenses.principal).toBeGreaterThan(0); // 운전자금 대출은 거치 기간이 없다
    expect(r.financingCash).toBe(100_000_000 - r.expenses.principal!);
    expect(r.investingCash).toBe(r.offTurn!.casks);
    expect(r.operatingCash! + r.investingCash! + r.financingCash!).toBeCloseTo(r.netCash, 0);

    // 행동 없는 달: 순현금은 예전과 같다(턴 안의 변화만), 정기 원금 상환은 재무
    s = advanceMonths(s, 1);
    r = s.history.reports.at(-1)!;
    expect(r.offTurn).toEqual({});
    expect(r.netCash).toBeCloseTo(r.cashEnd - s.history.reports.at(-2)!.cashEnd, 0);
    expect(r.financingCash).toBe(-(r.expenses.principal ?? 0));
  });

  it('계약 선급금은 재무로 잡혀 영업 현금흐름에서 빠지고, 납품 때 상계분은 영업 매출로 돌아온다', () => {
    let s = newGame({ seed: 24 });
    const offer = { ...s.b2b.contractOffers[0]!, style: 'any' as const, minQuality: 30, lpaPerMonth: 60, prepayShare: 0.3 };
    s = { ...s, b2b: { ...s.b2b, contractOffers: [offer] } };
    s = applyAction(s, { type: 'setOrder', recipeId: recipeId(s, '싱글 몰트 — 언'), batchesPerMonth: 3 }).state;
    s = applyAction(s, { type: 'acceptContract', offerId: offer.id }).state;
    const prepaid = s.finance.pendingCash!.contractPrepay!;
    expect(prepaid).toBeGreaterThan(0);
    s = advanceMonths(s, 1);
    const r = s.history.reports.at(-1)!;
    // 생산한 달에 바로 납품 → 상계분은 현금이 아니지만 영업 매출로, 같은 금액은 재무(선급금 상환)로
    expect(r.prepayApplied).toBeGreaterThan(0);
    expect(r.financingCash).toBeCloseTo(prepaid - r.prepayApplied!, 0);
    expect(r.operatingCash! + r.investingCash! + r.financingCash!).toBeCloseTo(r.netCash, 0);
    // 선급금 없이 같은 납품을 했을 때와 영업 현금흐름이 같다 (상계분 = 납품 총액 − 받은 현금)
    expect(r.bulkRevenue + r.prepayApplied!).toBeCloseTo(r.bulk[0]!.deliveredLPA * offer.pricePerLPA, -1);
  });

  it('계약 해지 비용은 위약금(영업)과 남은 선급금 반환(재무)으로 나뉜다', () => {
    let s = newGame({ seed: 25 });
    const offer = { ...s.b2b.contractOffers[0]!, minQuality: 30, prepayShare: 0.3 };
    s = { ...s, b2b: { ...s.b2b, contractOffers: [offer] } };
    s = applyAction(s, { type: 'acceptContract', offerId: offer.id }).state;
    const remaining = s.b2b.contracts[0]!.prepaidRemaining;
    const before = s.finance.cash;
    s = applyAction(s, { type: 'cancelContract', contractId: s.b2b.contracts[0]!.id }).state;
    const cost = before - s.finance.cash;
    expect(s.finance.pendingCash!.contractPrepay).toBeCloseTo(remaining - Math.round(remaining), 0); // 입금 − 반환 ≈ 0
    expect(s.finance.pendingCash!.contractCancel).toBeCloseTo(-(cost - Math.round(remaining)), 0);
    expect(s.finance.pendingCash!.contractCancel).toBeLessThan(0);
  });

  it('구버전 세이브(pendingCash 없음)도 그대로 진행된다', () => {
    const g = newGame({ seed: 23 });
    const { pendingCash: _p, ...finance } = g.finance;
    let s: GameState = { ...g, finance };
    s = applyAction(s, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: 1 }).state;
    s = advanceMonths(s, 1);
    expect(s.history.reports.at(-1)!.offTurn?.casks).toBeLessThan(0);
  });
});

describe('홋카이도 재고 담보대출 (결정 #90)', () => {
  it('숙성 재고 시가 × 60%까지, 다른 입지는 불가, 시가가 떨어지면 추가 상환', () => {
    const h = newGame({ seed: 1, region: 'JP', site: 'hokkaido' });
    const k = newGame({ seed: 1, region: 'JP' });
    for (const s of [h, k]) for (const c of s.inventory.casks) c.contents = lot({ id: `c-${c.id}`, kind: 'malt', abv: 0.6, volumeL: 190, oakMonths: 48 });
    expect(inventoryLoanRoom(h)).toBe(Math.floor((inventoryCollateral(h) * 0.6) / 1_000_000) * 1_000_000);
    expect(applyAction(k, { type: 'takeLoan', offerId: 'inventory', amount: 50_000_000 }).error).toContain('입지');
    const res = applyAction(h, { type: 'takeLoan', offerId: 'inventory', amount: 10_000_000_000 });
    expect(res.error).toBeUndefined();
    const loan = res.state.finance.loans.find((l) => l.offerId === 'inventory')!;
    expect(loan.principal).toBeLessThanOrEqual(inventoryCollateral(h) * 0.6);
    const s = structuredClone(res.state);
    s.b2b.bulkIndex = 0.5;
    const paid = inventoryMarginCall(s, report(s));
    expect(paid).toBeGreaterThan(0);
  });
});
