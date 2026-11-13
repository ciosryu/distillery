import { describe, expect, it } from 'vitest';
import { advanceMonths, annuityPayment, applyAction, demandFor, newGame, newScenarioGame, type GameState, type SpiritLot, inventoryCollateral, inventoryLoanRoom, inventoryMarginCall, type MonthReport } from './index';
import { ownsFacility } from './util';
import { forwardNotionalPerKg, forwardRoomKg, marketIndex, monthlyUsageKg, settleForwards } from './forwards';
import { applyEffects, fireEvent } from './events';
import { mulberry32 } from './rng';
import { INSURANCE_PRODUCTS } from './content/catalog';
import { claimFor, creditClaim, factoringProceeds, insuredInventoryValue, insuredPropertyValue, newLedger } from './insurance';
import { isLocked } from './scenario';
import { availableLoans, currentLoanPayment, loanRoomTotal, loanTerms } from './loans';
import { caskEligibility, isCampaignCandidate, newEntry, siteIdOf, splitLedger } from './ledger';
import { checkInvariants } from './invariants';
import { deliverOwnedCasks } from './investment';

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

  it('지금 받을 수 있는 대출 (#192): takeLoan과 같은 조건 — 열린 상품은 한도까지 실행되고, 막힌 상품은 거절된다', () => {
    const check = (s: GameState) => {
      for (const x of availableLoans(s)) {
        const r = applyAction(s, { type: 'takeLoan', offerId: x.offer.id, amount: x.offer.max });
        if (x.blocked) expect(r.error, x.offer.id).toBeDefined();
        else {
          expect(r.error, x.offer.id).toBeUndefined();
          expect(r.state.finance.loans.at(-1)!.principal, x.offer.id).toBe(x.max);
          // 실행하면 내는 돈 = 실제 첫 납부 · 거치 뒤 납부
          const l = r.state.finance.loans.at(-1)!;
          const t = loanTerms(x.offer, x.max, s.month);
          expect(currentLoanPayment(r.state, l)).toBe(t.paymentNow);
          expect(l.monthlyPayment).toBe(t.paymentAfterGrace);
          expect(currentLoanPayment({ ...r.state, month: t.graceEndMonth }, l)).toBe(t.paymentAfterGrace);
        }
      }
    };
    // MVP 소규모, 시작 대출 없음 — 정책자금은 소주 생산 실적이 있어야 한다
    let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 5 });
    const ids = availableLoans(s).map((x) => x.offer.id);
    expect(ids).toEqual(expect.arrayContaining(['facility', 'working', 'policy', 'kr_regional', 'kr_startup', 'emergency']));
    expect(ids).not.toContain('inventory'); // 한국은 재고 담보 없음
    expect(availableLoans(s).find((x) => x.offer.id === 'policy')!.blocked).toMatch(/소주/);
    check(s);
    const before = loanRoomTotal(s);
    s = applyAction(s, { type: 'takeLoan', offerId: 'kr_regional', amount: 100_000_000 }).state;
    expect(availableLoans(s).some((x) => x.offer.id === 'kr_regional')).toBe(false); // 이용 중이면 뺀다
    expect(loanRoomTotal(s)).toBe(before - 300_000_000);
    s.production.flags.producedSoju = true;
    expect(availableLoans(s).find((x) => x.offer.id === 'policy')!.blocked).toBeUndefined();
    check(s);
    // 샌드박스 홋카이도 — 재고 담보대출은 숙성 재고가 있어야 열린다
    const h = newGame({ seed: 1, region: 'JP', site: 'hokkaido' });
    expect(availableLoans(h).find((x) => x.offer.id === 'inventory')?.blocked).toBeDefined();
    check(h);
  });
});

describe('원재료 선도계약 (#179)', () => {
  /** 언피티드 몰트를 월 2배치 생산하는 판 */
  const malting = (): GameState => applyAction(newGame({ seed: 1, startingCash: 5_000_000_000 }), { type: 'setOrder', recipeId: recipeId(newGame({ seed: 1 }), '싱글 몰트 — 언'), batchesPerMonth: 2 }).state;
  const ING = 'malt_unpeated';

  it('계약량은 지금 생산 지시의 월 사용량까지 — 지시가 없으면 계약할 수 없다', () => {
    expect(applyAction(newGame({ seed: 1 }), { type: 'signForward', ingredientId: ING, kgPerMonth: 1000, months: 12 }).error).toMatch(/생산 지시가 쓰는 양/);
    const s = malting();
    const use = monthlyUsageKg(s)[ING]!;
    expect(use).toBeGreaterThan(100);
    const r = applyAction(s, { type: 'signForward', ingredientId: ING, kgPerMonth: 1e9, months: 12 });
    expect(r.error).toBeUndefined();
    const h = r.state.finance.hedges[0]!;
    expect(h.kgPerMonth).toBe(Math.floor(use));
    expect(h.priceIndex).toBeCloseTo(marketIndex(s, ING) * 1.03, 3);
    expect(h.untilMonth - h.fromMonth).toBe(12);
    expect(forwardRoomKg(r.state, ING)).toBe(0);
    expect(applyAction(r.state, { type: 'signForward', ingredientId: ING, kgPerMonth: 100, months: 12 }).error).toMatch(/남은 한도/);
    expect(applyAction(s, { type: 'signForward', ingredientId: ING, kgPerMonth: 100, months: 3 }).error).toMatch(/6~24개월/);
  });

  it('시세가 오르면 차액을 받고, 내리면 차액을 낸다 (이벤트 보정 포함)', () => {
    const s = applyAction(malting(), { type: 'signForward', ingredientId: ING, kgPerMonth: 1000, months: 12 }).state;
    const h = s.finance.hedges[0]!;
    const notional = forwardNotionalPerKg(s, ING) * h.kgPerMonth;
    const up = structuredClone(s);
    up.world.modifiers.push({ id: 'm', key: `ingredient:${ING}`, factor: 1.5, fromMonth: 0, untilMonth: 99, label: '보리 흉작' });
    const r1 = report(up); const c1 = up.finance.cash;
    settleForwards(up, r1);
    expect(up.finance.cash - c1).toBeCloseTo((marketIndex(up, ING) - h.priceIndex) * notional, -1);
    expect(up.finance.cash).toBeGreaterThan(c1);
    const down = structuredClone(s);
    down.world.priceIndex[ING] = 0.7;
    const r2 = report(down); const c2 = down.finance.cash;
    settleForwards(down, r2);
    expect(down.finance.cash).toBeLessThan(c2);
    expect(r2.expenses.hedge).toBeCloseTo(c2 - down.finance.cash, 0);
  });

  it('기간이 끝나면 계약이 사라진다, MVP에서는 잠겨 있다', () => {
    let s = applyAction(malting(), { type: 'signForward', ingredientId: ING, kgPerMonth: 500, months: 6 }).state;
    s = advanceMonths(s, 5);
    expect(s.finance.hedges.length).toBe(1);
    s = advanceMonths(s, 1);
    expect(s.finance.hedges).toEqual([]);
    expect(isLocked(newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 }), 'action:signForward')).toBe(true);
  });
});

describe('보험 (#171)', () => {
  /** 원액이 든 캐스크 몇 개가 있는 판 */
  const withCasks = (seed = 1): GameState => {
    const s = newGame({ seed, startingCash: 5_000_000_000 });
    for (const o of s.b2b.brokerOffers.slice(0, 3)) s.inventory.casks.push({ ...o.cask, id: `C-${o.id}` });
    return s;
  };
  const buy = (s: GameState, kind: 'property' | 'inventory' | 'business_interruption', coverage: number) => {
    const r = applyAction(s, { type: 'buyInsurance', kind, coverage });
    expect(r.error).toBeUndefined();
    return r.state;
  };
  const rate = (kind: string) => INSURANCE_PRODUCTS.find((p) => p.kind === kind)!.annualRate;
  /** 보장 시작 달을 지금으로 당긴다 (대기 기간을 건너뛰는 테스트용) */
  const now = (s: GameState): GameState => { for (const x of s.finance.insurance) x.fromMonth = s.month; return s; };

  it('가입하면 다음 달부터 보장하고, 보험료는 재무 단계에서 매달 나간다. 해지하면 멈춘다', () => {
    let s = buy(newGame({ seed: 1 }), 'property', 100_000_000);
    const pol = s.finance.insurance[0]!;
    expect(pol.fromMonth).toBe(s.month + 1);
    expect(pol.premiumPerMonth).toBe(Math.round((100_000_000 * rate('property')) / 12));
    expect(applyAction(s, { type: 'buyInsurance', kind: 'property', coverage: 1e8 }).error).toMatch(/이미 가입/);
    s = advanceMonths(s, 1);
    expect(s.history.reports.at(-1)!.expenses.insurance).toBe(pol.premiumPerMonth);
    s = applyAction(s, { type: 'cancelInsurance', policyId: pol.id }).state;
    s = advanceMonths(s, 1);
    expect(s.history.reports.at(-1)!.expenses.insurance).toBeUndefined();
  });

  it('숙성고 화재: 재산 보험은 복구비를, 재고 보험은 잃은 원액의 원가를 준다 (가입금액이 보험가액 이상이면 전액)', () => {
    let s = withCasks();
    s = now(buy(buy(s, 'property', insuredPropertyValue(s) + 1e6), 'inventory', insuredInventoryValue(s) + 1e6));
    const before = insuredInventoryValue(s);
    const cash = s.finance.cash;
    fireEvent(s, 'warehouse_fire', report(s));
    const lost = before - insuredInventoryValue(s);
    expect(lost).toBeGreaterThan(0);
    expect(s.finance.cash - cash).toBeCloseTo(-20_000_000 + 20_000_000 + lost, -1);
    expect(s.events.log.at(-1)!.text).toMatch(/보험금/);
  });

  it('가입한 그달의 재해는 보상하지 않는다 (대기 기간)', () => {
    const s = buy(withCasks(), 'property', 1e10);
    const cash = s.finance.cash;
    fireEvent(s, 'warehouse_fire', report(s));
    expect(s.finance.cash - cash).toBe(-20_000_000);
  });

  it('일부보험은 비례 보상 — 가입금액 / 보험가액만큼만', () => {
    const s = withCasks();
    const value = insuredPropertyValue(s);
    const t = now(buy(s, 'property', Math.round(value / 2 / 1e6) * 1e6));
    const c = claimFor(t, { ...newLedger(t), property: 10_000_000 });
    expect(c.property).toBeCloseTo(10_000_000 * (Math.round(value / 2 / 1e6) * 1e6) / value, -1);
    expect(c.ratio.property).toBeLessThan(1);
  });

  it('영업중단 보험: 한파로 생산이 한 달 멈추면 월 고정비(월 보상 한도까지)를 준다', () => {
    const s = now(buy(newGame({ seed: 1 }), 'business_interruption', 10_000_000));
    const c = claimFor(s, { ...newLedger(s), stopMonths: 1 });
    expect(c.interruption).toBe(10_000_000); // 한도 < 고정비
    const cash = s.finance.cash;
    fireEvent(s, 'cold_wave', report(s));
    expect(s.finance.cash - cash).toBe(-8_000_000 + 10_000_000);
  });

  it('곰팡이(오염)는 보상하지 않는다, 방재 설비가 막으면 청구할 피해가 없다', () => {
    const s = now(buy(buy(withCasks(), 'inventory', 1e10), 'property', 1e10));
    const cash = s.finance.cash;
    fireEvent(s, 'mold_outbreak', report(s));
    expect(s.finance.cash).toBe(cash);
    expect(s.events.log.at(-1)!.text).not.toMatch(/보험금/);
  });

  it('제조물 책임·신용보험은 아직 팔지 않고, MVP에서는 보험이 잠겨 있다', () => {
    const s = newGame({ seed: 1 });
    expect(applyAction(s, { type: 'buyInsurance', kind: 'credit', coverage: 1e8 }).error).toMatch(/BIZ-2b/);
    expect(applyAction(s, { type: 'buyInsurance', kind: 'product_liability', coverage: 1e8 }).error).toMatch(/아직/);
    const m = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    expect(isLocked(m, 'action:buyInsurance')).toBe(true);
  });

  it('보험료는 월 고정비 예상에 들어가고, 테크 ENG-2b가 재산·재고 보험료를 15% 깎는다', () => {
    const s = newGame({ seed: 1 });
    s.research.unlocked.push('ENG-2b');
    const t = buy(s, 'inventory', 120_000_000);
    expect(t.finance.insurance[0]!.premiumPerMonth).toBe(Math.round((120_000_000 * rate('inventory') * 0.85) / 12));
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
    // 캐스크 오너십은 테크 BIZ-1b 뒤 (tech-tree §1.2, 게이트 켜기 #174)
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

// BIZ-2b 재무 리스크 관리 (#214) — 매출채권 신용보험·팩토링. 선물환·금리 스왑은 막을 위험(환율 변동·변동금리)이 없어 아직 없다
describe('BIZ-2b 신용보험·팩토링 (#214)', () => {
  const defaulting = (unlocked: string[]) => {
    const s = newGame({ seed: 1, region: 'KR' });
    s.research.unlocked.push(...unlocked);
    const terms = { spirit: 'malt_newmake' as const, domestic: true, style: 'any' as const, lpaPerMonth: 100, termMonths: 12, pricePerLPA: 15_000, minQuality: 40, prepayShare: 0, penaltyPerLPA: 4_500, startMonth: 0, monthsDone: 0, deliveredLPA: 0, shortfallLPA: 0, prepaidRemaining: 0 };
    s.b2b.contracts = [{ ...terms, id: 'C2', buyerId: 'hanra', buyerName: '한라 블렌디드 컴퍼니' }];
    return s;
  };

  it('연구 전에는 신용보험을 팔지 않고, BIZ-2b 뒤에는 가입할 수 있다', () => {
    expect(applyAction(defaulting([]), { type: 'buyInsurance', kind: 'credit', coverage: 1e8 }).error).toMatch(/BIZ-2b/);
    const r = applyAction(defaulting(['BIZ-2b']), { type: 'buyInsurance', kind: 'credit', coverage: 1e8 });
    expect(r.error).toBeUndefined();
    expect(r.state.finance.insurance[0]).toMatchObject({ kind: 'credit', coverage: 100_000_000, premiumPerMonth: Math.round((1e8 * 0.02) / 12) });
  });

  it('거래처 부도: 신용보험이 못 받은 대금의 90%를 가입금액까지 — 가입한 다음 달부터', () => {
    const unpaid = 100 * 15_000; // lpaPerMonth × pricePerLPA × (1 − 선급 0)
    let s = applyAction(defaulting(['BIZ-2b']), { type: 'buyInsurance', kind: 'credit', coverage: 1e8 }).state;
    expect(creditClaim(s, unpaid)).toBe(0); // 가입한 달은 아직 보장 전
    s.month += 1;
    const cash = s.finance.cash;
    applyEffects(s, [{ type: 'buyerDefault' }], mulberry32(1), 'test');
    expect(cash - s.finance.cash).toBe(unpaid - Math.round(unpaid * 0.9));
    s = applyAction(defaulting(['BIZ-2b']), { type: 'buyInsurance', kind: 'credit', coverage: 1e7 }).state;
    s.month += 1;
    expect(creditClaim(s, 50_000_000)).toBe(10_000_000); // 가입금액까지
  });

  it('팩토링: 미수금 전부를 수수료(남은 달 × 1.5%, 최소 1%)를 떼고 지금 현금으로 — 연구 전엔 막힌다', () => {
    const s = defaulting([]);
    s.finance.receivables = [{ dueMonth: s.month + 2, amount: 10_000_000, label: 'a' }, { dueMonth: s.month, amount: 5_000_000, label: 'b' }];
    expect(applyAction(s, { type: 'factorReceivables' }).error).toMatch(/BIZ-2b/);
    s.research.unlocked.push('BIZ-2b');
    expect(factoringProceeds(s, s.finance.receivables[0]!)).toBe(9_700_000);
    expect(factoringProceeds(s, s.finance.receivables[1]!)).toBe(4_950_000);
    const r = applyAction(s, { type: 'factorReceivables' });
    expect(r.error).toBeUndefined();
    expect(r.state.finance.cash - s.finance.cash).toBe(14_650_000);
    expect(r.state.finance.receivables).toHaveLength(0);
    expect(applyAction(r.state, { type: 'factorReceivables' }).error).toMatch(/미수금이 없/);
  });
});

// 은행 심사 — 실험 손잡이 (T-0, M2 · #210). 게임 기본은 꺼짐
describe('은행 심사 손잡이 (T-0)', () => {
  it('기본은 꺼져 있어 늘 통과, 켜면 창업 24개월 뒤 적자·현금 부족에서 은행 상품만 거절(급전은 통과)', async () => {
    const { BANK_SCREENING } = await import('./content/finance');
    const { bankScreening } = await import('./loans');
    const { LOAN_OFFERS } = await import('./content/catalog');
    const { newGame } = await import('./index');
    const s = newGame({ seed: 1 });
    s.month = 30; s.finance.cash = 0;
    s.history.reports = [{ month: 29, revenue: 0, expenses: {}, netCash: -1, operatingCash: -10_000_000, cashEnd: 0, sales: [], production: [], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] }];
    const facility = LOAN_OFFERS.find((o) => o.id === 'facility')!;
    const emergency = LOAN_OFFERS.find((o) => o.id === 'emergency')!;
    expect(BANK_SCREENING.enabled).toBe(false);
    expect(bankScreening(s, facility).ok).toBe(true);
    BANK_SCREENING.enabled = true;
    try {
      expect(bankScreening(s, facility).ok).toBe(false);
      expect(bankScreening(s, emergency).ok).toBe(true);
      expect(bankScreening({ ...s, month: 10 }, facility).ok).toBe(true);
    } finally { BANK_SCREENING.enabled = false; }
  });
});

// F2 원장 지점 24 — 캐스크 오너십 판매·인도 ([결정 #323], PROD P-PROD-55 표 24행 · Q3). **원장 갱신 코드는 없다(테스트로만 보장)**:
// 판매는 권리만 옮기고(`cask.owner` — 적격 제외는 caskEligibility가 맡는다), 인도는 통째로 나가 원장도 함께 사라진다.
// 인도는 손실(LossKind)이 아니다 — 권리 소멸은 F5 `Rights`에서 기록한다(PM·MGT 합의 2026-11-13)
describe('원장 지점 24 — 캐스크 오너십', () => {
  const setup = (withLedger: boolean) => {
    const s = newGame({ seed: 1, startingCash: 5_000_000_000 });
    s.research.unlocked.push('BIZ-1b');
    const src = s.b2b.brokerOffers[0]!.cask;
    const contents: SpiritLot = { ...src.contents!, sourced: false };
    if (withLedger) {
      // 구성 원액 둘(같은 목재 개월) — R2 합이 맞는 원장
      const [a, b] = splitLedger([newEntry(contents, 'self', siteIdOf(s))], 0.4);
      contents.components = [...a, { ...b[0]!, batchId: `${contents.id}-b` }];
    }
    const cask = { ...src, contents };
    s.inventory.casks.push(cask);
    return { s, id: cask.id };
  };
  const ledgerErrors = (s: GameState) => checkInvariants(s).errors.filter((e) => e.includes('원장'));

  it('판매: 원장은 그대로, 적격은 고객 소유로 빠진다, R2 통과', () => {
    let { s, id } = setup(true);
    const before = structuredClone(s.inventory.casks.find((c) => c.id === id)!.contents!.components);
    expect(ledgerErrors(s)).toEqual([]);
    s = applyAction(s, { type: 'sellCaskOwnership', caskId: id }).state;
    const cask = s.inventory.casks.find((c) => c.id === id)!;
    expect(cask.owner).toBeDefined();
    expect(cask.contents!.components).toEqual(before);
    const e = caskEligibility(s, cask);
    expect(e.eligible).toBe(false);
    expect(e.reasons.some((r) => r.includes('고객 소유'))).toBe(true);
    expect(isCampaignCandidate(s, cask, 10_000)).toBe(false);
    expect(ledgerErrors(s)).toEqual([]);
  });

  it('판매~인도 사이: 고객 통도 우리 숙성고에서 나무 숙성이 매달 +1 계속된다(원장 woodMonths는 R1·전제 2로 oakMonths를 따른다)', () => {
    let { s, id } = setup(false);
    s = applyAction(s, { type: 'sellCaskOwnership', caskId: id }).state;
    const cask0 = s.inventory.casks.find((c) => c.id === id)!;
    const oak0 = cask0.contents!.oakMonths, wait = cask0.owner!.deliverMonth - s.month;
    expect(wait).toBeGreaterThan(2);
    s = advanceMonths(s, 2);
    const cask = s.inventory.casks.find((c) => c.id === id)!;
    expect(cask.contents!.oakMonths).toBe(oak0 + 2);
    expect(caskEligibility(s, cask).woodMonths).toBe(oak0 + 2);
    expect(caskEligibility(s, cask).eligible).toBe(false);
  });

  it('인도: 통이 통째로 나가 원장도 함께 사라진다 — 손실 사건 없음, 남은 원액 R2 통과', () => {
    let { s, id } = setup(true);
    s = applyAction(s, { type: 'sellCaskOwnership', caskId: id }).state;
    s.inventory.casks.find((c) => c.id === id)!.owner!.deliverMonth = s.month; // 이번 달 결산에서 인도
    const report = { notes: [] as string[] } as unknown as MonthReport;
    deliverOwnedCasks(s, report);
    expect(s.inventory.casks.some((c) => c.id === id)).toBe(false);
    expect(report.notes.some((n) => n.includes('인도'))).toBe(true);
    expect(report.lossEvents).toBeUndefined(); // 인도는 손실 사건(R5)이 아니다
    expect(ledgerErrors(s)).toEqual([]);
  });
});
