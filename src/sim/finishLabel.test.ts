// [결정 #362] 피니시 표기의 판매 효과(#270 A · B) — 표기 + `finishMonths`(PROD #878, 병입 때 · v16 판만) 3개월↑일 때만, 통 종류와 무관 (ARCH 검토 2026-11-24)
import { describe, expect, it } from 'vitest';
import { FINISH_LABEL } from './content/market';
import { FINISH_EFFECT_MIN_MONTHS, finishLabelOn } from './finishLabel';
import { productLuxury } from './brands';
import { appeal, demandFor, expectedPricePerL } from './market';
import { regionOf } from './content/regions';
import { newScenarioGame } from './newScenario';
import { applyAction, newGame } from '.';
import { emptyCaskOf } from './newGame';
import type { Cask, Flavor, GameState, Product } from './types';

type P = Product;
const base = { id: 'P', name: '시험 몰트', category: 'whisky', ageYears: 6, oakMonths: 72, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 75, typicity: 70, style: null, sourcedShare: 0, stockBottles: 300, price: 100_000, unitCost: 20_000, createdMonth: 90, lastMonthSold: 0, totalSold: 0 } as unknown as P;
/** 72개월 중 마지막 m개월을 피니시 통에서 보낸 제품 — 통 구성 기록(caskMonthsMix)도 함께 둔다(효과 판정은 이것을 읽지 않는다) */
const finished = (m: number, typeId: 'oloroso_butt' | 'ex_bourbon_barrel' = 'oloroso_butt', withMonths = true): P => ({
  ...base, finish: typeId, ...(withMonths ? { finishMonths: m } : {}),
  caskMonthsMix: [{ typeId: typeId === 'oloroso_butt' ? 'ex_bourbon_barrel' : 'oloroso_butt', share: (72 - m) / 72 }, { typeId, share: m / 72 }],
});

describe('finishLabelOn — finishMonths만 읽는다', () => {
  it('문턱 상수(PROD 보충 경고가 읽는 값)는 판매 효과 문턱과 같다', () => {
    expect(FINISH_EFFECT_MIN_MONTHS).toBe(FINISH_LABEL.minMonths);
    expect(finishLabelOn(finished(FINISH_EFFECT_MIN_MONTHS))).toBe(true);
    expect(finishLabelOn(finished(FINISH_EFFECT_MIN_MONTHS - 1))).toBe(false);
  });
  it(`${FINISH_LABEL.minMonths}개월부터 켜진다`, () => {
    expect(finishLabelOn(finished(2))).toBe(false);
    expect(finishLabelOn(finished(3))).toBe(true);
  });
  it('표기 없음 · finishMonths 없음(옛 판 · 옛 제품 — PROD가 v16 판 병입에서만 쓴다)은 꺼짐. caskMonthsMix가 있어도 대신 읽지 않는다', () => {
    expect(finishLabelOn(base)).toBe(false);
    expect(finishLabelOn(finished(12, 'oloroso_butt', false))).toBe(false);
    expect(finishLabelOn({ ...base, finishMonths: 12 })).toBe(false);
  });
});

describe('효과 — A 매력도 · 기대 가격 ×1.08 · B 럭셔리 +10, 통 종류마다 같다', () => {
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 5 });
  const region = regionOf(s);
  // 표기 효과만 떼어 보려고 styleFit이 ×1인 시장(styleKey '')으로 잰다
  it('매력도 — 3개월↑ 피니시는 2개월 피니시의 ×1.08', () => {
    expect(appeal(finished(3), s, '') / appeal(finished(2), s, '')).toBeCloseTo(FINISH_LABEL.appeal, 6);
  });
  it('기대 가격 ×1.08', () => {
    expect(expectedPricePerL(region, finished(6)) / expectedPricePerL(region, base)).toBeCloseTo(FINISH_LABEL.expectedPrice, 6);
  });
  it('럭셔리 +10 · 품질 게이트(L_p ≤ 품질) 그대로', () => {
    expect(productLuxury(finished(6)) - productLuxury(base)).toBe(FINISH_LABEL.luxury);
    expect(productLuxury({ ...finished(6), quality: 20 })).toBe(20);
  });
  it('통 종류가 달라도 같은 배수(시장 차이는 styleFit만)', () => {
    expect(appeal(finished(6, 'ex_bourbon_barrel'), s, '') / appeal(finished(2, 'ex_bourbon_barrel'), s, '')).toBeCloseTo(FINISH_LABEL.appeal, 6);
  });
});

describe('옛 판 세이브 — finishMonths가 없는 피니시 제품은 전후가 같다 (#362 범위, PM · ARCH 2026-11-24)', () => {
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 5 });
  const old = { ...s, rulesVersion: 'legacy-v15' as const };
  const region = regionOf(s);
  const legacy = finished(12, 'oloroso_butt', false);
  it('매력도 · 기대 가격 · 럭셔리 모두 표기 효과 없음', () => {
    expect(appeal(legacy, old, '') / appeal({ ...legacy, finish: undefined } as P, old, '')).toBeCloseTo(1, 9);
    expect(expectedPricePerL(region, legacy)).toBe(expectedPricePerL(region, base));
    expect(productLuxury(legacy)).toBe(productLuxury(base));
  });
});

describe('병입부터 수요까지 — 피니싱한 통으로 병입한 제품 (PM 요청 2026-11-24 · 봇은 피니싱을 하지 않아 v16 X0로는 재지 못한다)', () => {
  const FLAVOR: Flavor = { fresh_fruit: 30, vanilla_caramel: 35, dried_fruit: 10, integration: 40 };
  /** 버번 통 48개월 뒤 와인 바리끄에서 m개월 피니싱한 몰트 통 */
  const cask = (s: GameState, m: number): Cask => {
    const c = emptyCaskOf(s, 'wine_barrique');
    c.contents = { id: `W${m}`, name: 'W', kind: 'malt', volumeL: 200, abv: 0.6, flavor: { ...FLAVOR }, createdMonth: 0, oakMonths: 48 + m, sourced: false, costPerLPA: 10_000,
      caskHistory: [{ typeId: 'ex_bourbon_barrel', fromMonth: 0, months: 48 }, { typeId: 'wine_barrique', fromMonth: 48, months: m }] };
    c.filledMonth = 48;
    s.inventory.casks.push(c);
    return c;
  };
  const opts = { name: 't', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };
  const bottle = (s: GameState, months: number[]): Product => {
    const comps = months.map((m) => ({ source: 'cask' as const, id: cask(s, m).id, liters: 150 }));
    return applyAction(s, { type: 'bottle', components: comps, options: opts }).state.commerce.products.at(-1)!;
  };
  const game = () => newGame({ seed: 3, startingCash: 50_000_000_000 });
  // 같은 병입 제품에서 표기 효과만 끈 짝(가격 · 품질 · 맛은 같다)과 견준다
  const off = (p: Product): Product => ({ ...p, finishMonths: FINISH_EFFECT_MIN_MONTHS - 1 });

  it('6개월 · 10개월을 섞으면 finishMonths는 짧은 쪽 6 — 효과가 켜지고 기대 가격 ×1.08 · 수요가 는다', () => {
    const s = game();
    const p = bottle(s, [6, 10]);
    expect(p.finish).toBe('wine_barrique');
    expect(p.finishMonths).toBe(6);
    expect(finishLabelOn(p)).toBe(true);
    const region = regionOf(s);
    expect(expectedPricePerL(region, p) / expectedPricePerL(region, off(p))).toBeCloseTo(FINISH_LABEL.expectedPrice, 6);
    expect(demandFor(s, p, 1, 6).demandBottles).toBeGreaterThan(demandFor(s, off(p), 1, 6).demandBottles);
  });
  it('2개월 · 10개월을 섞으면 짧은 쪽 2 — 문턱 미만이라 효과가 꺼지고 수요 · 기대 가격이 효과 없는 짝과 같다', () => {
    const s = game();
    const p = bottle(s, [2, 10]);
    expect(p.finishMonths).toBe(2);
    expect(finishLabelOn(p)).toBe(false);
    const noLabel: Product = { ...p, finish: undefined, finishMonths: undefined };
    expect(demandFor(s, p, 1, 6).demandBottles).toBeCloseTo(demandFor(s, noLabel, 1, 6).demandBottles, 9);
    expect(expectedPricePerL(regionOf(s), p)).toBe(expectedPricePerL(regionOf(s), noLabel));
  });
  it('옛 판(legacy-v15)은 같은 통으로 병입해도 finishMonths가 없어 효과가 없다', () => {
    const s = game();
    s.rulesVersion = 'legacy-v15';
    const p = bottle(s, [6, 10]);
    expect(p.finish).toBe('wine_barrique');
    expect(p.finishMonths).toBeUndefined();
    expect(finishLabelOn(p)).toBe(false);
  });
});
