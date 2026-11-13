// F2 원장 지점 25 — 브로커 매입 원액의 원장 (결정 #323 R2 · 전제 2). PROD 지점 7(matureCask 증발)이 연결돼야 두 번째 단언이 통과한다
import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { makeBrokerOffer } from './broker';
import { checkInvariants } from './invariants';
import { caskEligibility, EXTERNAL_SITE_ID } from './ledger';
import { newGame } from './newGame';
import { rngFor } from './rng';
import { advanceMonth } from './step';

describe('브로커 매입 원장 (지점 25)', () => {
  it('매입 직후: 원장 한 줄(sourced · 외부 입지), Σ cost = 원가, woodMonths = oakMonths, 불변식 오류 0 — 적격 아님(매입)', () => {
    const s0 = newGame({ seed: 7, region: 'KR' });
    s0.finance.cash = 5e9;
    const o = makeBrokerOffer(s0, rngFor(7, 1, 'brk'));
    s0.b2b.brokerOffers.push(o);
    const r = applyAction(s0, { type: 'buyBrokerCask', offerId: o.id });
    expect(r.error).toBeUndefined();
    const c = r.state.inventory.casks.find((x) => x.id === o.cask.id)!;
    const e = c.contents!.components!;
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ origin: 'sourced', siteId: EXTERNAL_SITE_ID, kindAtBirth: 'malt', woodMonths: c.contents!.oakMonths });
    expect(checkInvariants(r.state).errors).toEqual([]);
    expect(caskEligibility(r.state, c).eligible).toBe(false);
    expect(caskEligibility(r.state, c).reasons.join(' ')).toContain('매입');
  });
  it('매입 뒤 1개월 진행해도 불변식 오류 0 (증발이 원장을 같이 줄인다 — PROD 지점 7)', () => {
    const s0 = newGame({ seed: 7, region: 'KR' });
    s0.finance.cash = 5e9;
    const o = makeBrokerOffer(s0, rngFor(7, 1, 'brk'));
    s0.b2b.brokerOffers.push(o);
    const s1 = advanceMonth(applyAction(s0, { type: 'buyBrokerCask', offerId: o.id }).state);
    expect(checkInvariants(s1).errors.filter((x) => x.includes('원장'))).toEqual([]);
  });
});
