import { describe, expect, it } from 'vitest';
import { advanceMonth, advanceMonths, allocateFunding, applyAction, isLocked, migrateSave, MVP_KR, netWorth, newGame, newScenarioGame, previewPlan, SAVE_VERSION, siteOverhead, systemOn, monthlyFixedCost, currentLoanPayment } from '.';
import fixture from './fixtures/save-v7.json';

const micro = (loanAmount = 0, seed = 3) => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount, seed });

describe('세이브 v7 → v8 (시나리오 필드, S-8)', () => {
  it('v7 세이브는 시나리오 없는 샌드박스로 이어지고, 진행 결과가 v7 코드와 같다', () => {
    const raw = structuredClone(fixture.save);
    const s = migrateSave(raw)!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.scenario).toBeUndefined();
    const t = advanceMonths(s, 3);
    expect({ month: t.month, cash: t.finance.cash }).toEqual(fixture.expectedAfter3);
  });

  it('시나리오 게임은 세이브(JSON)를 거쳐도 그대로다', () => {
    const s = micro(300_000_000);
    const back = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(back).toEqual(s);
  });
});

describe('시나리오 새 게임 — 사업 계획서 (S-8, #139~3)', () => {
  it('소규모 티어: 자기자본·관리비·숙성고·주종·고정 인력', () => {
    const s = micro();
    const tier = MVP_KR.tiers.find((t) => t.id === 'micro')!;
    expect(s.scenario?.tierId).toBe('micro');
    expect(s.finance.cash).toBe(tier.equity);
    expect(siteOverhead(s)).toBe(tier.overheadPerMonth);
    expect(s.inventory.warehouseBase).toBe(tier.warehouseBase);
    expect(new Set(s.production.recipes.map((r) => r.kind))).toEqual(new Set(['soju', 'malt']));
    expect(s.hr.staff.map((x) => x.role).sort()).toEqual(['distiller', 'sales']);
    expect(s.hr.candidates).toEqual([]);
    expect(s.b2b.brokerOffers).toEqual([]);
    expect(s.b2b.contractOffers).toEqual([]);
  });

  it('잠긴 티어(상업형)는 만들 수 없다', () => {
    expect(() => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'commercial', loanAmount: 0 })).toThrow(/해금/);
  });

  it('잠긴 행동·설비·주종은 실패하고, 열린 것은 된다', () => {
    const s = micro();
    expect(applyAction(s, { type: 'hire', candidateId: 'x' }).error).toMatch(/시나리오/);
    expect(applyAction(s, { type: 'takeInvestment', offerId: 'angel' } as never).error).toMatch(/시나리오/);
    expect(applyAction(s, { type: 'buyEquipment', catalogId: 'visitor_vip' }).error).toMatch(/시나리오/);
    expect(applyAction(s, { type: 'buyEquipment', catalogId: 'pot_large_5000' }).error).toMatch(/시나리오/);
    expect(applyAction(s, { type: 'buyEquipment', catalogId: 'visitor_basic' }).error).toBeUndefined();
    const gin = newGame({ seed: 1 }).production.recipes.find((r) => r.kind === 'gin')!;
    const { id: _id, ...ginRecipe } = gin;
    expect(applyAction(s, { type: 'saveRecipe', recipe: ginRecipe }).error).toMatch(/시나리오/);
    const malt = s.production.recipes.find((r) => r.kind === 'malt')!;
    expect(applyAction(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: 3 }).error).toBeUndefined();
  });

  it('끈 시스템은 틱에서 돌지 않는다 — 이벤트·수출 제안·블렌딩 의뢰·후보·계약 제안', () => {
    const s = micro();
    expect(systemOn(s, 'events')).toBe(false);
    const t = advanceMonths(s, 36);
    expect(t.events.log).toEqual([]);
    expect(t.events.pending).toEqual([]);
    expect(t.events.forecasts).toEqual([]);
    expect(t.commerce.exportOffers).toEqual([]);
    expect(t.commerce.commissions).toEqual([]);
    expect(t.hr.candidates).toEqual([]);
    expect(t.b2b.contractOffers).toEqual([]);
    expect(t.b2b.caskBids).toEqual([]);
    expect(t.commerce.retailOffers).toEqual([]);
  });

  it('샌드박스(시나리오 없음)는 아무것도 잠그지 않는다', () => {
    const s = newGame({ seed: 1 });
    expect(isLocked(s, 'action:hire')).toBe(false);
    expect(systemOn(s, 'events')).toBe(true);
  });
});

describe('시작 자금 조달 — 기존 대출 상품을 미리 당겨 받는다 (#141)', () => {
  const tier = MVP_KR.tiers.find((t) => t.id === 'micro')!;

  it('금리가 낮은 상품부터, 상품 한도·티어 상한까지 나눈다', () => {
    expect(allocateFunding(tier, 400_000_000)).toEqual([{ offerId: 'kr_regional', amount: 300_000_000 }, { offerId: 'kr_startup', amount: 100_000_000 }]);
    expect(allocateFunding(tier, 9_000_000_000).reduce((t, f) => t + f.amount, 0)).toBe(tier.funding.max);
    expect(allocateFunding(tier, 0)).toEqual([]);
  });

  it('시작 대출은 실제 대출이고, 같은 상품을 게임 중에 다시 받을 수 없다 (한도가 겹치지 않는다)', () => {
    const s = micro(400_000_000);
    expect(s.finance.cash).toBe(tier.equity + 400_000_000);
    expect(s.finance.loans.map((l) => l.offerId)).toEqual(['kr_regional', 'kr_startup']);
    expect(applyAction(s, { type: 'takeLoan', offerId: 'kr_regional', amount: 100_000_000 }).error).toMatch(/이미/);
    // 시작 대출도 첫 결산 보고서의 재무 현금 흐름(대출 실행)에 잡힌다
    expect(advanceMonths(s, 1).history.reports[0]!.offTurn?.loan).toBe(400_000_000);
  });

  it('미리보기: 고정 지출은 게임과 같은 함수, 거치 뒤 납부액이 커지고, 대출을 더 받으면 첫 현금은 늘지만 거치 뒤 부담이 커진다', () => {
    const p0 = previewPlan({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0 });
    const p5 = previewPlan({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 500_000_000 });
    const s = micro(0, 1);
    expect(p0.fixedMonthly).toBe(monthlyFixedCost(s) - s.finance.loans.reduce((t, l) => t + currentLoanPayment(s, l), 0));
    expect(p0.loanPaymentNow).toBe(0);
    expect(p0.cashStart).toBe(tier.equity);
    expect(p5.cashStart).toBe(tier.equity + 500_000_000);
    expect(p5.loanPaymentAfterGrace).toBeGreaterThan(p5.loanPaymentNow);
    expect(p0.runwayMonths).toBeGreaterThan(0);
    expect(p5.runwayMonths).toBeGreaterThan(p0.runwayMonths);
    expect(p0.goalNetWorth).toBe(tier.equity * MVP_KR.goal.netWorthMultiple);
  });
});

describe('MVP 화면의 현금·순자산 곡선 기록 (#138·#146)', () => {
  it('월 보고서에 그 달 말 순자산이, 연 요약에 연말 순자산이 남는다 (구버전 보고서에는 없어도 된다)', () => {
    let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 4 });
    const malt = s.production.recipes.find((r) => r.kind === 'malt')!;
    s = applyAction(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: 2 }).state;
    for (let m = 0; m < 12; m++) {
      s = advanceMonth(s);
      expect(s.history.reports.at(-1)!.netWorth).toBe(netWorth(s));
    }
    expect(s.history.years.at(-1)!.netWorthEnd).toBe(s.history.reports.at(-1)!.netWorth);
    // 몰트 뉴메이크는 현물가가 있어 순자산이 현금보다 크다 (대출 없음)
    expect(s.history.reports.at(-1)!.netWorth!).toBeGreaterThan(s.finance.cash);
  });
});
