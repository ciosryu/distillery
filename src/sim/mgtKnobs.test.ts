// F6b MGT 손잡이 (P-MGT-48·51 · architecture §10.10 F6 규약) — Normal은 바이트 동일, 임시 Easy≠Hard 값으로 손잡이가 실제로 먹는지
import { afterEach, describe, expect, it } from 'vitest';
import { advanceMonth, applyAction, type GameState } from './index';
import { KNOBS } from './content/difficulty';
import { LOAN_OFFERS } from './content/catalog';
import { regionOf } from './content/regions';
import { newScenarioGame } from './newScenario';
import { effectiveOffer, inventoryLtv } from './loans';
import { factoringProceeds, insurancePremium, newLedger } from './insurance';
import { staffLaborCost } from './mgtKnobs';

const game = (difficulty?: 'easy' | 'hard') => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 5, ...(difficulty ? { difficulty } : {}) });
const offer = (id: string) => LOAN_OFFERS.find((o) => o.id === id)!;
const IDS = ['finance.loanRate', 'finance.loanLimit', 'finance.loanGrace', 'finance.inventoryLtv', 'finance.fees', 'finance.laborMul', 'finance.wageDrift', 'incidents.lossSize'] as const;
const saved = Object.fromEntries(IDS.map((id) => [id, KNOBS[id]]));
/** 시험용 값 — Easy 0.5 · Hard 2 (임금 상승만 Easy 1 · Hard 1.05). 끝나면 되돌린다 */
const setTestValues = () => { for (const id of IDS) KNOBS[id] = id === 'finance.wageDrift' ? { easy: 1, hard: 1.05 } : { easy: 0.5, hard: 2 }; };
afterEach(() => { for (const id of IDS) KNOBS[id] = saved[id]!; });

describe('F6b — MGT 손잡이: 표에 자리가 있고 Normal은 그대로', () => {
  it('KNOBS에 8행(값 1) · Normal에서 상품·LTV·인건비·피해 크기가 지금 값과 같다(같은 객체)', () => {
    for (const id of IDS) expect(KNOBS[id]).toMatchObject({ easy: 1, hard: 1 });
    const s = game();
    for (const o of LOAN_OFFERS) expect(effectiveOffer(s, o)).toBe(o);
    expect(staffLaborCost(s)).toBe(regionOf(s).laborCost);
    expect(inventoryLtv({ regionId: 'JP', siteId: 'hokkaido', difficulty: s.difficulty })).toBe(0.6);
    expect(newLedger(s, 'fire').damageMul).toBe(1);
  });
});

describe('F6b — 임시 Easy≠Hard 값으로 손잡이가 실제로 먹는다', () => {
  it('금리·한도·거치: Hard ×2(급전은 20% 상한, 거치는 기간 − 1 이하) · Easy ×0.5 · 실행(takeLoan)도 같은 값', () => {
    setTestValues();
    const h = game('hard'), e = game('easy');
    expect(effectiveOffer(h, offer('working')).annualRate).toBeCloseTo(0.15);
    expect(effectiveOffer(e, offer('working')).annualRate).toBeCloseTo(0.0375);
    expect(effectiveOffer(h, offer('emergency')).annualRate).toBe(0.2);
    expect(effectiveOffer(h, offer('working')).max).toBe(600_000_000);
    expect(effectiveOffer(e, offer('working')).max).toBe(150_000_000);
    expect(effectiveOffer(h, offer('facility')).graceMonths).toBe(48);
    expect(effectiveOffer(h, offer('policy')).graceMonths).toBe(24);
    const r = applyAction(h, { type: 'takeLoan', offerId: 'working', amount: 500_000_000 });
    expect(r.error).toBeUndefined();
    const loan = r.state.finance.loans.find((l) => l.offerId === 'working')!;
    expect(loan.annualRate).toBeCloseTo(0.15);
    expect(loan.principal).toBe(500_000_000); // Normal 한도(3억)를 넘는 금액이 Hard 한도(6억) 안이라 그대로 나온다
  });

  it('LTV · 보험료 · 팩토링 · 피해 크기: Hard ×2 · Easy ×0.5', () => {
    setTestValues();
    const n = game(), h = game('hard'), e = game('easy');
    expect(inventoryLtv({ regionId: 'JP', siteId: 'hokkaido', difficulty: h.difficulty })).toBeCloseTo(1.2);
    expect(inventoryLtv({ regionId: 'JP', siteId: 'hokkaido', difficulty: e.difficulty })).toBeCloseTo(0.3);
    expect(inventoryLtv({ regionId: 'KR', difficulty: h.difficulty })).toBe(0); // LTV 없는 입지는 그대로 0
    const pn = insurancePremium(n, 'property', 1_000_000_000), ph = insurancePremium(h, 'property', 1_000_000_000);
    expect(Math.abs(ph - 2 * pn)).toBeLessThanOrEqual(1); // 월 보험료 반올림
    const rec = { dueMonth: n.month + 3, amount: 100_000_000 };
    expect(factoringProceeds(h, rec)).toBeLessThan(factoringProceeds(n, rec));
    expect(factoringProceeds(e, rec)).toBeGreaterThan(factoringProceeds(n, rec));
    expect(newLedger(h, 'fire').damageMul).toBe(2); // = 연구 감면 riskMul('event:fire') × 난이도 — 연구 없는 새 판이라 riskMul 1. 연구가 있으면 둘을 곱한다(의도)
    expect(newLedger(e, 'fire').damageMul).toBe(0.5);
  });

  it('인건비 배수: 새로 정하는 급여(창업 멤버)에 곱한다 · 정기 임금 상승: Hard만 매년 1월 ×1.05, Normal은 그대로', () => {
    setTestValues();
    const n = game(), h = game('hard');
    expect(staffLaborCost(h)).toBeCloseTo(2 * regionOf(h).laborCost);
    const sn = n.hr.staff.reduce((t, x) => t + x.salary, 0), sh = h.hr.staff.reduce((t, x) => t + x.salary, 0);
    expect(sh / sn).toBeGreaterThan(1.9); // 급여 반올림이 있어 정확히 2는 아니다
    // 정기 임금 상승: 두 번째 해 1월(달 12) 틱 뒤 Hard만 오른다 — 인건비 배수의 영향을 빼려고 같은 급여에서 시작
    KNOBS['finance.laborMul'] = { easy: 1, hard: 1 };
    let a: GameState = game(), b: GameState = game('hard');
    const base = (g: GameState) => g.hr.staff.map((x) => x.salary);
    expect(base(b)).toEqual(base(a));
    for (let m = 0; m < 13; m++) { a = advanceMonth(a); b = advanceMonth(b); } // 12개월 차(1월)의 틱까지
    const ids = a.hr.staff.map((x) => x.id);
    for (const id of ids) {
      const xa = a.hr.staff.find((x) => x.id === id)!, xb = b.hr.staff.find((x) => x.id === id);
      if (!xb) continue;
      expect(xb.salary).toBe(Math.round(xa.salary * 1.05));
    }
    expect(b.history.reports.some((r) => r.notes.some((t) => t.startsWith('정기 임금 조정')))).toBe(true);
    expect(a.history.reports.some((r) => r.notes.some((t) => t.startsWith('정기 임금 조정')))).toBe(false);
  });
});

describe('F6b — 재해 피해 크기(incidents.lossSize)는 원장 damageMul 한 자리 · 원액 손실 비율 상한', () => {
  it('Hard ×2에서 원액 손실 비율 0.6 → 1.2가 아니라 0.9로 묶인다(통 원액이 음수가 되지 않는다)', async () => {
    setTestValues();
    const { applyEffects } = await import('./events');
    const { rngFor } = await import('./rng');
    const s = game('hard');
    const { emptyCaskOf } = await import('./index');
    const c = emptyCaskOf(s, 'ex_bourbon_barrel'); c.id = 'T1';
    c.contents = { id: 'LT1', name: 'T1', kind: 'malt', volumeL: 180, abv: 0.6, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: 24, sourced: false, costPerLPA: 10_000 };
    s.inventory.casks.push(c);
    const ledger = newLedger(s, 'flood');
    expect(ledger.damageMul).toBe(2);
    applyEffects(s, [{ type: 'caskVolumeLoss', share: 0.6 }], rngFor(1, 0, 't'), '시험', ledger, null);
    const after = s.inventory.casks.find((x) => x.id === 'T1')!.contents!;
    expect(after.volumeL).toBeCloseTo(180 * 0.1, 5); // 0.9 상한 — 1.2를 곱했다면 음수

  });
});
