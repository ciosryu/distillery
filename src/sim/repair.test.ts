import { describe, expect, it } from 'vitest';
import { advanceMonth, applyAction, emptyCaskOf, migrateSave, warehouseCapacity, type Action, type GameState } from './index';
import { newScenarioGame } from './newScenario';
import { nonFinitePaths, repairSave } from './repair';

// 세이브 수리 (#285, C-ARCH-2) — 코어 ARCH

const act = (s: GameState, a: Action) => applyAction(s, a).state;

describe('세이브 수리 (#285)', () => {
  it('NaN이 null로 저장된 세이브를 불러오면 고친다 — 통 비움·현금은 마지막 유한 결산·제품 값·메모', () => {
    let s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    s = advanceMonth(advanceMonth(s)); // 결산 두 개
    const lastCash = s.history.reports.at(-1)!.cashEnd;
    const bad = emptyCaskOf(s, 'ex_bourbon_barrel'); bad.id = 'BAD';
    bad.contents = { id: 'LBAD', name: 'bad', kind: 'malt', volumeL: 0, abv: NaN, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: 3, sourced: false, costPerLPA: 10_000 };
    const ok = emptyCaskOf(s, 'ex_bourbon_barrel'); ok.id = 'OK';
    ok.contents = { id: 'LOK', name: 'ok', kind: 'malt', volumeL: 150, abv: 0.6, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: 3, sourced: false, costPerLPA: 10_000 };
    s.inventory.casks.push(bad, ok);
    s.finance.cash = NaN;
    s.commerce.products.push({ ...(s.commerce.products[0] ?? { id: 'P', name: 'p', category: 'soju_distilled', ageYears: null, oakMonths: 0, abv: 0.25, bottleMl: 375, chillFiltered: true, packagingId: 'standard', flavor: {}, quality: 50, typicity: 50, style: null, sourcedShare: 0, stockBottles: 0, price: 10000, unitCost: 3000, createdMonth: 0, lastMonthSold: 0, totalSold: 0 }), id: 'PNAN', price: NaN, unitCost: NaN } as never);
    const saved = JSON.parse(JSON.stringify(s)); // NaN → null (localStorage·기록 파일과 같다)
    expect(saved.finance.cash).toBeNull();
    const t = migrateSave(saved)!;
    expect(t.inventory.casks.find((c) => c.id === 'BAD')!.contents).toBeUndefined();
    expect(t.inventory.casks.find((c) => c.id === 'OK')!.contents!.volumeL).toBe(150);
    expect(t.finance.cash).toBe(lastCash);
    const p = t.commerce.products.find((x) => x.id === 'PNAN')!;
    expect(Number.isFinite(p.price) && Number.isFinite(p.unitCost)).toBe(true);
    expect(t.history.reports.at(-1)!.notes.at(-1)).toMatch(/^세이브 복구 — 원액이 망가진 통 1개를 비웠다 · 현금을 2개월째 결산의 월말 현금/);
    expect(nonFinitePaths(t)).toEqual([]);
    // 불러온 뒤 한 달 진행해도 유한하다
    expect(nonFinitePaths(advanceMonth(t))).toEqual([]);
  });

  it('고칠 것이 없으면 입력 객체를 그대로 돌려준다(migrateSave의 순수성)', () => {
    const s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 2 });
    const r = repairSave(s);
    expect(r.fixes).toEqual([]);
    expect(r.state).toBe(s);
    const loaded = JSON.parse(JSON.stringify(s));
    expect(migrateSave(loaded)).toBe(loaded);
  });
});

describe('불변식 — 상태에 유한하지 않은 수가 없다 (#285)', () => {
  function play(tierId: 'micro' | 'standard', seed: number, months: number): GameState {
    let s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId, loanAmount: 0, seed });
    const recipe = (kind: 'soju' | 'malt') => s.production.recipes.find((r) => r.kind === kind && !r.mashBill.some((m) => m.ingredientId === 'malt_peated'))!.id;
    s = act(s, { type: 'setOrder', recipeId: recipe('malt'), batchesPerMonth: 3 });
    s = act(s, { type: 'setOrder', recipeId: recipe('soju'), batchesPerMonth: 1 });
    for (let m = 0; m < months && s.status === 'running'; m++) {
      for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) {
        const need = Math.ceil((lot.volumeL * lot.abv) / (200 * 0.635));
        const empty = s.inventory.casks.filter((c) => !c.contents && !c.contamination).length;
        const room = warehouseCapacity(s) - s.inventory.casks.length;
        if (empty < need && room > 0 && s.finance.cash > 60_000_000) s = act(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: Math.min(need - empty, room) });
        const ids = s.inventory.casks.filter((c) => !c.contents && !c.contamination).slice(0, need).map((c) => c.id);
        if (ids.length) s = act(s, { type: 'fillCasks', lotId: lot.id, caskIds: ids, entryAbv: 0.635 });
      }
      s = advanceMonth(s);
      const bad = nonFinitePaths(s);
      if (bad.length) throw new Error(`${tierId} 시드 ${seed} ${s.month}개월: ${bad.join(', ')}`);
    }
    return s;
  }
  it('소규모·표준 120개월(몰트 3·소주 1, 매달 통입) 동안 매달 유한하다', () => {
    expect(nonFinitePaths(play('micro', 1, 120))).toEqual([]);
    expect(nonFinitePaths(play('standard', 2, 120))).toEqual([]);
  }, 60_000);
});

describe('수리 멱등성 (INV-ARCH-1 (c))', () => {
  it('repairSave(repairSave(x)) = repairSave(x) · 깨끗한 세이브는 JSON 바이트가 같다', async () => {
    const { checkInvariants } = await import('./invariants');
    let s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 3 });
    s = advanceMonth(advanceMonth(s));
    const clean = JSON.stringify(s);
    expect(JSON.stringify(migrateSave(JSON.parse(clean)))).toBe(clean);
    const bad = emptyCaskOf(s, 'ex_bourbon_barrel'); bad.id = 'BAD';
    bad.contents = { id: 'LBAD', name: 'bad', kind: 'malt', volumeL: NaN, abv: 0.6, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: 3, sourced: false, costPerLPA: 10_000 };
    s.inventory.casks.push(bad);
    s.finance.cash = NaN;
    s.commerce.products.push({ ...{ id: 'P', name: 'p', category: 'soju_distilled', ageYears: null, oakMonths: 0, abv: 0.25, bottleMl: 375, chillFiltered: true, packagingId: 'standard', flavor: {}, quality: 50, typicity: 50, style: null, sourcedShare: 0, stockBottles: 0, price: 10000, unitCost: 3000, createdMonth: 0, lastMonthSold: 0, totalSold: 0 }, id: 'PNAN', stockBottles: NaN, price: NaN } as never);
    s.finance.receivables.push({ amount: NaN } as never);
    const once = repairSave(JSON.parse(JSON.stringify(s)));
    expect(once.fixes.length).toBeGreaterThan(0);
    const twice = repairSave(once.state);
    expect(twice.fixes).toEqual([]);
    expect(twice.state).toBe(once.state);
    expect(checkInvariants(once.state).errors).toEqual([]);
  });
});
