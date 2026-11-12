import { describe, expect, it } from 'vitest';
import { advanceMonth, emptyCaskOf, type GameState } from './index';
import { newScenarioGame } from './newScenario';
import { checkInvariants, invariantMode, setInvariantMode } from './invariants';

// 공통 불변식 계약 (INV-ARCH-1) — 코어 ARCH. 범위는 PROD AP3-PROD-1 3. 표

const BASE = { id: 'P', name: 'p', category: 'soju_distilled', ageYears: null, oakMonths: 0, abv: 0.25, bottleMl: 375, chillFiltered: true, packagingId: 'standard', flavor: {}, quality: 50, typicity: 50, style: null, sourcedShare: 0, stockBottles: 0, price: 10000, unitCost: 3000, createdMonth: 0, lastMonthSold: 0, totalSold: 0 };
const fresh = (): GameState => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });

describe('불변식 검사 (INV-ARCH-1)', () => {
  it('새 판·몇 달 진행한 판은 오류가 없다 · 테스트에서는 매달 검사(throw)가 켜져 있다', () => {
    expect(invariantMode()).toBe('throw');
    let s = fresh();
    expect(checkInvariants(s).errors).toEqual([]);
    for (let i = 0; i < 6; i++) s = advanceMonth(s);
    expect(checkInvariants(s).errors).toEqual([]);
  });

  it('범위 밖 값을 오류로 잡는다 — 도수 0·통 부피 초과·향미 음수·재고 소수·품질 초과·값 0·범주 최소 도수 미달', () => {
    const s = fresh();
    const c = emptyCaskOf(s, 'ex_bourbon_barrel'); c.id = 'K';
    c.contents = { id: 'LK', name: 'k', kind: 'malt', volumeL: c.sizeL + 5, abv: 0, flavor: { cereal: -1 }, createdMonth: 0, oakMonths: 3, sourced: false, costPerLPA: 10_000 };
    s.inventory.casks.push(c);
    s.inventory.lots.push({ id: 'T', name: 't', kind: 'malt', volumeL: 0, abv: 1.2, flavor: {}, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: -1 });
    const p = { ...BASE, id: 'P', category: 'whisky', abv: 0.35, price: 0, stockBottles: 2.5, quality: 101 } as never;
    s.commerce.products.push(p);
    const e = checkInvariants(s, 50).errors.join('\n');
    for (const m of ['통 K abv = 0', '통 K volumeL', '통 K.flavor.cereal', '탱크 T abv = 1.2', '탱크 T volumeL = 0', '탱크 T costPerLPA', '제품 P abv = 0.35', '제품 P price = 0', '제품 P stockBottles = 2.5', '제품 P quality = 101']) expect(e).toContain(m);
  });

  it('정상 범위 밖이지만 규칙상 가능한 값은 경고만 — 향미 > 200, 통 도수 0.85', () => {
    const s = fresh();
    const c = emptyCaskOf(s, 'ex_bourbon_barrel'); c.id = 'W';
    c.contents = { id: 'LW', name: 'w', kind: 'malt', volumeL: 100, abv: 0.85, flavor: { vanilla_caramel: 250 }, createdMonth: 0, oakMonths: 3, sourced: false, costPerLPA: 196_600 };
    s.inventory.casks.push(c);
    const r = checkInvariants(s);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join('\n')).toMatch(/통 W abv = 0.850[\s\S]*통 W.flavor.vanilla_caramel = 250.0/);
  });

  it('매달 검사는 읽기만 한다 — 켜고 끈 판의 결과가 같다', () => {
    const run = () => { let s = fresh(); for (let i = 0; i < 24; i++) s = advanceMonth(s); return JSON.stringify(s); };
    const on = run();
    setInvariantMode('off');
    try { expect(run()).toBe(on); } finally { setInvariantMode('throw'); }
  });
});
