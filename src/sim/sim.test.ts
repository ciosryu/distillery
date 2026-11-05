import { describe, expect, it } from 'vitest';
import {
  advanceMonths, annuityPayment, applyAction, categorize, demandFor, evaluate, evaporate, heartsFraction,
  matureCask, newGame, previewBlend, sizeFactor, simulateBatch, stillDefOf, windowFraction, type Cask, type GameState, type SpiritLot,
} from './index';

const recipeId = (s: GameState, prefix: string) => s.recipes.find((r) => r.name.startsWith(prefix))!.id;

describe('컷 포인트', () => {
  it('전 구간이면 거의 전부, 좁힐수록 하트 비율이 줄어든다', () => {
    expect(windowFraction(0.5, 0.1, -1, 2)).toBeCloseTo(1, 3);
    expect(heartsFraction(0.15, 0.72)).toBeLessThan(heartsFraction(0.1, 0.8));
  });

  it('후류 전환점(c2)을 늦추면 피트·후류취가 늘고 수율이 오른다', () => {
    const s = newGame({ seed: 1 });
    const still = stillDefOf(s, s.recipes[0]!.stillId)!;
    const peated = s.recipes.find((r) => r.name.endsWith('— 피티드'))!;
    const early = simulateBatch({ ...peated, cut: { c1: 0.15, c2: 0.65 } }, still, 'stainless', s.staff[0], s.priceIndex, 0);
    const late = simulateBatch({ ...peated, cut: { c1: 0.15, c2: 0.85 } }, still, 'stainless', s.staff[0], s.priceIndex, 0);
    expect(late.flavor.peat_smoke ?? 0).toBeGreaterThan(early.flavor.peat_smoke ?? 0);
    expect(late.flavor.feinty ?? 0).toBeGreaterThan(early.flavor.feinty ?? 0);
    expect(late.lpa).toBeGreaterThan(early.lpa);
  });
});

describe('숙성', () => {
  it('습하면 도수가 내려가고 건조하면 올라간다', () => {
    expect(evaporate(200, 0.635, 0.002, 85).abv).toBeLessThan(0.635);
    expect(evaporate(200, 0.635, 0.002, 40).abv).toBeGreaterThan(0.635);
  });

  it('작은 캐스크일수록 숙성 속도 계수가 크다', () => {
    expect(sizeFactor(125)).toBeGreaterThan(1);
    expect(sizeFactor(200)).toBeCloseTo(1, 6);
    expect(sizeFactor(500)).toBeLessThan(1);
  });

  it('숙성하면 바닐라·통합감이 늘고 자극이 줄어든다', () => {
    const s = newGame({ seed: 2 });
    const lot: SpiritLot = { id: 'x', name: 'x', kind: 'malt', volumeL: 200, abv: 0.635, flavor: { cereal: 30, harshness: 65 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 0 };
    let cask: Cask = { ...s.casks[0]!, contents: lot, fills: 1 };
    for (let i = 0; i < 36; i++) cask = matureCask(cask, { tempC: 15, humidity: 70 }, { control: 0 }).cask;
    const f = cask.contents!.flavor;
    expect(f.vanilla_caramel!).toBeGreaterThan(20);
    expect(f.integration!).toBeGreaterThan(20);
    expect(f.harshness!).toBeLessThan(65);
    expect(cask.contents!.oakMonths).toBe(36);
  });
});

describe('라벨·숙성 연수', () => {
  it('36개월 미만이면 몰트 스피릿, 이상이고 40% 이상이면 위스키', () => {
    expect(categorize('malt', 35, 0.46, {})).toBe('malt_spirit');
    expect(categorize('malt', 36, 0.46, {})).toBe('whisky');
    expect(categorize('malt', 48, 0.39, {})).toBe('malt_spirit');
  });

  it('주니퍼가 지배적이지 않으면 진 표기 불가', () => {
    expect(categorize('gin', 0, 0.43, { juniper: 50, citrus: 30 })).toBe('gin');
    expect(categorize('gin', 0, 0.43, { juniper: 20, citrus: 60 })).toBe('flavored_spirit');
  });

  it('블렌드의 숙성 연수 = 가장 어린 원액', () => {
    let s = newGame({ seed: 3 });
    const mk = (id: string, months: number) => ({ id, name: id, kind: 'malt' as const, volumeL: 150, abv: 0.6, flavor: { cereal: 20, vanilla_caramel: 30 }, createdMonth: 0, oakMonths: months, sourced: false, costPerLPA: 10_000 });
    s = { ...s, casks: [{ ...s.casks[0]!, contents: mk('a', 60) }, { ...s.casks[1]!, contents: mk('b', 40) }] };
    const p = previewBlend(s, [{ source: 'cask', id: s.casks[0]!.id, liters: 100 }, { source: 'cask', id: s.casks[1]!.id, liters: 100 }], { name: 't', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' });
    expect(p.ok).toBe(true);
    expect(p.category).toBe('whisky');
    expect(p.ageYears).toBe(3);
  });
});

describe('시장', () => {
  it('가격이 오르면 수요가 줄어든다', () => {
    const s = newGame({ seed: 4 });
    const base = { id: 'p', name: 'p', category: 'gin' as const, ageYears: null, abv: 0.43, bottleMl: 700, chillFiltered: true, packagingId: 'standard', flavor: {}, quality: 55, typicity: 100, style: null, sourcedShare: 0, stockBottles: 100, unitCost: 0, createdMonth: 0, lastMonthSold: 0, totalSold: 0 };
    const cheap = demandFor(s, { ...base, price: 15_000 }, 1, 1);
    const pricey = demandFor(s, { ...base, price: 30_000 }, 1, 1);
    expect(pricey.demandBottles).toBeLessThan(cheap.demandBottles);
  });

  it('품질이 높으면 매력도가 높다', () => {
    expect(evaluate({ fresh_fruit: 30, floral: 20, vanilla_caramel: 30, integration: 60, harshness: 20 }, 'whisky').quality)
      .toBeGreaterThan(evaluate({ fresh_fruit: 10, solvent: 20, feinty: 20, harshness: 70 }, 'whisky').quality);
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
    const b0 = s.loans[0]!.balance;
    s = advanceMonths(s, 3);
    expect(s.loans[0]!.balance).toBeLessThan(b0);
  });
});

describe('결정론', () => {
  it('같은 시드와 같은 행동이면 결과가 같다', () => {
    const play = () => {
      let s = newGame({ seed: 77 });
      s = applyAction(s, { type: 'setOrder', recipeId: recipeId(s, '증류식'), batchesPerMonth: 2 }).state;
      s = applyAction(s, { type: 'setOrder', recipeId: recipeId(s, '싱글 몰트 — 언'), batchesPerMonth: 3 }).state;
      return advanceMonths(s, 18);
    };
    expect(JSON.stringify(play())).toBe(JSON.stringify(play()));
  });

  it('행동은 원본 상태를 바꾸지 않는다', () => {
    const s = newGame({ seed: 8 });
    const before = JSON.stringify(s);
    applyAction(s, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: 2 });
    advanceMonths(s, 2);
    expect(JSON.stringify(s)).toBe(before);
  });
});
