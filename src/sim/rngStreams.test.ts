import { describe, expect, it } from 'vitest';
import { advanceMonth, applyAction, emptyCaskOf, type GameState } from './index';
import { newScenarioGame } from './newScenario';
import { assignSlot } from './warehouse';

// S1~S5 실패 테스트 (architecture §10.8 ②, 구현 순서 [결정 #290] ⑤) — 공유 난수 스트림 때문에 "상관없는 것"을 바꾸면 결과가 바뀐다.
// 지금은 모두 실패한다(it.fails) — 실패 목록이 S1~S5의 범위 증명이다. 고치는 일은 PROD(S1~S4)·MKT(S5), 고치면 it.fails → it.
// 각 테스트는 "같은 대상 집합, 순서·무관한 명령만 다름"을 비교한다 — 대상 단위 스트림이면 같아야 한다

const base = (): GameState => {
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 7 });
  s.finance.cash = 5_000_000_000;
  return s;
};
const ok = (s: GameState, a: Parameters<typeof applyAction>[1]) => { const r = applyAction(s, a); expect(r.error).toBeUndefined(); return r.state; };

/** 원액을 채운 통 n개 — 숙성·오염·누수 비교용 */
function withFilledCasks(n: number): GameState {
  const s = base();
  s.inventory.casks = [];
  for (let i = 0; i < n; i++) {
    const c = emptyCaskOf(s, 'ex_bourbon_barrel'); c.id = `K${String(i).padStart(3, '0')}`;
    c.contents = { id: `L${i}`, name: `l${i}`, kind: 'malt', volumeL: 180, abv: 0.635, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 10_000 };
    s.inventory.casks.push(c);
  }
  s.inventory.autoSample = { off: true } as never; // 자동 샘플(통 고르기 순서)을 꺼서 난수만 비교한다
  for (const c of s.inventory.casks) assignSlot(s, c); // 칸(기후)을 먼저 정한다 — 순서를 뒤집어도 같은 통은 같은 칸(난수만 비교)
  return s;
}
const run = (s: GameState, months: number) => { for (let i = 0; i < months; i++) s = advanceMonth(s); return s; };
const caskView = (s: GameState) => Object.fromEntries(s.inventory.casks.map((c) => [c.id, { v: c.contents?.volumeL.toFixed(6), cont: c.contamination ?? null, known: !!c.contaminationKnown }]));

describe('S1~S5 — 대상 단위 난수 (지금 실패, 고칠 대상)', () => {
  it.fails('S1 즉시 통 구매 — 앞서 태그를 하나 만들어도(nextId가 오른다) 산 통의 상태가 같아야 한다', () => {
    const a = ok(base(), { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: 10 });
    let b = ok(base(), { type: 'defineTag', label: '표시', color: 'stone' });
    b = ok(b, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: 10 });
    const view = (s: GameState) => s.inventory.casks.slice(-10).map((c) => [c.fills, c.activity.toFixed(6), c.activityKnown]);
    expect(view(b)).toEqual(view(a));
  });

  it.fails('S2 생산 — 생산 지시의 순서만 바꿔도 각 레시피의 산출이 같아야 한다', () => {
    const s0 = base();
    const malt = s0.production.recipes.find((r) => r.kind === 'malt')!.id;
    const soju = s0.production.recipes.find((r) => r.kind === 'soju')!.id;
    const a = base(); a.production.orders = [{ recipeId: malt, batchesPerMonth: 2 }, { recipeId: soju, batchesPerMonth: 1 }];
    const b = base(); b.production.orders = [{ recipeId: soju, batchesPerMonth: 1 }, { recipeId: malt, batchesPerMonth: 2 }];
    const pa = run(a, 3).history.reports.flatMap((r) => r.production), pb = run(b, 3).history.reports.flatMap((r) => r.production);
    const by = (xs: typeof pa, id: string) => xs.filter((p) => p.recipeId === id).map((p) => p.lpa.toFixed(6));
    expect(by(pb, malt)).toEqual(by(pa, malt));
    expect(by(pb, soju)).toEqual(by(pa, soju));
  });

  it.fails('S3 오염 — 통 배열 순서만 바꿔도 각 통의 오염·발견이 같아야 한다', () => {
    const a = withFilledCasks(300);
    const b = withFilledCasks(300); b.inventory.casks.reverse();
    const ca = caskView(run(a, 36)), cb = caskView(run(b, 36));
    const pick = (v: ReturnType<typeof caskView>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, [x.cont, x.known]]));
    expect(pick(cb)).toEqual(pick(ca));
  });

  it.fails('S4 숙성(누수) — 통 배열 순서만 바꿔도 각 통의 남은 양이 같아야 한다', () => {
    const a = withFilledCasks(300);
    const b = withFilledCasks(300); b.inventory.casks.reverse();
    const ca = caskView(run(a, 36)), cb = caskView(run(b, 36));
    const pick = (v: ReturnType<typeof caskView>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.v]));
    expect(pick(cb)).toEqual(pick(ca));
  });

  it('S5 판매 — 제품 배열 순서만 바꿔도 각 제품의 판매 병 수가 같아야 한다', () => {
    const P = { name: 'p', category: 'soju_distilled', ageYears: null, oakMonths: 0, abv: 0.25, bottleMl: 375, chillFiltered: true, packagingId: 'standard', flavor: { cereal: 20 }, quality: 60, typicity: 60, style: null, sourcedShare: 0, stockBottles: 5000, price: 8000, unitCost: 3000, createdMonth: 0, lastMonthSold: 0, totalSold: 0 };
    const mk = () => { const s = base(); s.commerce.products = [{ ...P, id: 'A', name: 'A' }, { ...P, id: 'B', name: 'B', quality: 70 }, { ...P, id: 'C', name: 'C', category: 'gin', abv: 0.4 }] as never; return s; };
    const a = mk(); const b = mk(); b.commerce.products.reverse();
    const sold = (s: GameState) => Object.fromEntries(run(s, 6).history.reports.flatMap((r) => r.sales).reduce((m, x) => m.set(x.productId, (m.get(x.productId) ?? 0) + x.bottles), new Map<string, number>()));
    expect(sold(b)).toEqual(sold(a));
  });
});
