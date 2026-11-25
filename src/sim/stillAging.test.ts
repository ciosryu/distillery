// [결정 #422] 증류기 PR ④ — 저숙성 황 이취 · 셰리 × 미티 반응 · 원액 형태(공개) · 제품 스타일 · 탄닌 전망(I2) · 개조 전후 가름
import { describe, expect, it } from 'vitest';
import { advanceMonth, applyAction } from './index';
import { newScenarioGame } from './newScenario';
import { evaluate, lotEvalCtx, YOUTH_SULFUR, YOUTH_WEIGHT } from './flavor';
import { matureCask } from './maturation';
import { emptyCaskOf } from './newGame';
import { sameTank, steadyBatch } from './production';
import { tanninOutlook } from './warehouse';
import { autoRestockSources } from './economics';
import { DEFAULT_STILL_SHAPE, majorityShape, shapeWeight, STILL_SHAPE_PRESETS, stillStyleOf } from './stillShape';
import type { Cask, Flavor, GameState, SpiritLot, StillShape } from './types';

const preset = (id: string): StillShape => STILL_SHAPE_PRESETS.find((p) => p.id === id)!.shape;
const game = (): GameState => {
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 1 });
  s.finance.cash = 1e11;
  return s;
};
const lotOf = (flavor: Flavor, extra: Partial<SpiritLot> = {}): SpiritLot => ({ id: 'L', name: 'L', kind: 'malt', volumeL: 190, abv: 0.635, flavor, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 1, recipeId: 'R8', ...extra });

describe('#422 공개 스타일 · 무게 — 형태 표에서만', () => {
  it('묶음 셋: 라이트 · 미디엄(균형) · 헤비, 무게는 헤비만 1', () => {
    expect(stillStyleOf(preset('light'))).toBe('light');
    expect(stillStyleOf(preset('balanced'))).toBe('medium');
    expect(stillStyleOf(preset('heavy'))).toBe('heavy');
    expect(shapeWeight(preset('heavy'))).toBe(1);
    expect(shapeWeight(preset('balanced'))).toBe(0);
    expect(shapeWeight(preset('light'))).toBe(0);
  });
  it('섞으면 LPA가 가장 많은 원액의 형태 — 형태 없는 원액이 많으면 없음', () => {
    expect(majorityShape([{ lot: { stillShape: preset('heavy') }, lpa: 30 }, { lot: {}, lpa: 10 }])).toEqual(preset('heavy'));
    expect(majorityShape([{ lot: { stillShape: preset('heavy') }, lpa: 10 }, { lot: {}, lpa: 30 }])).toBeUndefined();
  });
});

describe('#422 (c) 저숙성 황 이취 — 형태를 고른 증류기 원액 · 위스키 · 5년 미만', () => {
  const f: Flavor = { sulfur_meaty: 3, oak_tannin: 20, vanilla_caramel: 20, cereal: 20, harshness: 30, integration: 30 };
  it('맥락이 없으면 지금 식 그대로 · 있으면 k × (황 − 문턱) × (1 − 목재 ÷ 60)', () => {
    const base = evaluate(f, 'whisky');
    expect(evaluate(f, 'whisky', undefined)).toEqual(base);
    const y3 = evaluate(f, 'whisky', { youthOakMonths: 36 });
    expect(y3.offnotes - base.offnotes).toBeCloseTo(YOUTH_SULFUR.k * (3 - YOUTH_SULFUR.fromSulfur) * (1 - 36 / 60), 1);
    expect(y3.quality).toBeLessThan(base.quality);
    expect(evaluate(f, 'whisky', { youthOakMonths: 60 })).toEqual(base);
    expect(evaluate(f, 'grain_whisky', { youthOakMonths: 36 })).toEqual(evaluate(f, 'grain_whisky'));
    expect(evaluate({ ...f, sulfur_meaty: 0.4 }, 'whisky', { youthOakMonths: 36 })).toEqual(evaluate({ ...f, sulfur_meaty: 0.4 }, 'whisky')); // 균형 원액 황은 문턱 아래
  });
  it('[P-PROD-73] 무거운 원액(바디 30 넘는 몫, 최대 5)도 어릴 때 감점 — 쉘로 황을 낮춰도 피하지 못한다 · 균형 바디는 0', () => {
    const lowS = { ...f, sulfur_meaty: 0.4 };
    const heavy = { ...lowS, body: 34 };
    const d = evaluate(heavy, 'whisky', { youthOakMonths: 36 }).offnotes - evaluate(heavy, 'whisky').offnotes;
    expect(d).toBeCloseTo(YOUTH_WEIGHT.k * 4 * (1 - 36 / 60), 1);
    const capped = evaluate({ ...lowS, body: 50 }, 'whisky', { youthOakMonths: 36 }).offnotes - evaluate({ ...lowS, body: 50 }, 'whisky').offnotes;
    expect(capped).toBeCloseTo(YOUTH_WEIGHT.k * YOUTH_WEIGHT.cap * (1 - 36 / 60), 1);
    expect(evaluate({ ...lowS, body: 26 }, 'whisky', { youthOakMonths: 36 })).toEqual(evaluate({ ...lowS, body: 26 }, 'whisky'));
    expect(evaluate(heavy, 'whisky', { youthOakMonths: 60 })).toEqual(evaluate(heavy, 'whisky'));
  });
  it('원액 맥락은 형태가 있을 때만', () => {
    expect(lotEvalCtx(lotOf({}))).toBeUndefined();
    expect(lotEvalCtx(lotOf({}, { stillShape: preset('heavy'), oakMonths: 40 }))).toEqual({ youthOakMonths: 40 });
  });
});

describe('#422 (b) 셰리 × 미티 반응 — 셰리 통 · 8년 뒤 · 무거운 원액만', () => {
  const heavyFlavor: Flavor = { body: 43, oak_tannin: 70, integration: 70, sulfur_meaty: 1 };
  const step = (typeId: 'oloroso_butt' | 'ex_bourbon_barrel', lot: SpiritLot) => {
    const c: Cask = { ...emptyCaskOf(game(), typeId), contents: lot };
    return matureCask(c, { tempC: 12, humidity: 75 }, { control: 0 }).cask.contents!.flavor;
  };
  it('형태 있는 헤비 원액 · 셰리 벗 · 100개월 → 탄닌이 덜 붙고 어우러짐이 더 붙는다', () => {
    const plain = step('oloroso_butt', lotOf(heavyFlavor, { oakMonths: 100 }));
    const shaped = step('oloroso_butt', lotOf(heavyFlavor, { oakMonths: 100, stillShape: preset('heavy') }));
    expect(shaped.oak_tannin!).toBeLessThan(plain.oak_tannin!);
    expect(shaped.integration!).toBeGreaterThan(plain.integration!);
  });
  it('8년 전 · 버번 통 · 가벼운 원액(바디 27)은 반응이 없다', () => {
    expect(step('oloroso_butt', lotOf(heavyFlavor, { oakMonths: 50, stillShape: preset('heavy') }))).toEqual(step('oloroso_butt', lotOf(heavyFlavor, { oakMonths: 50 })));
    expect(step('ex_bourbon_barrel', lotOf(heavyFlavor, { oakMonths: 100, stillShape: preset('heavy') }))).toEqual(step('ex_bourbon_barrel', lotOf(heavyFlavor, { oakMonths: 100 })));
    const light = { ...heavyFlavor, body: 27 };
    expect(step('oloroso_butt', lotOf(light, { oakMonths: 100, stillShape: preset('balanced') }))).toEqual(step('oloroso_butt', lotOf(light, { oakMonths: 100 })));
  });
});

describe('#422 탄닌 전망 — 형태(공개)로 반응을 넣는다 · 원액 맛은 읽지 않는다(I2)', () => {
  const butt = (s: GameState, lot?: SpiritLot): Cask => {
    const c = emptyCaskOf(s, 'oloroso_butt');
    return lot ? { ...c, contents: lot, filledMonth: s.month } : c;
  };
  it('헤비 형태 원액이면 15년 탄닌이 낮다 · 12년(기준 144)까지는 8년 뒤 몫만', () => {
    const s = game();
    const none = tanninOutlook(s, butt(s, lotOf({})), 180)!;
    const heavy = tanninOutlook(s, butt(s, lotOf({}, { stillShape: preset('heavy') })), 180)!;
    expect(heavy.tannin).toBeLessThan(none.tannin);
    expect(heavy.penalty).toBeLessThan(none.penalty);
    expect(tanninOutlook(s, butt(s, lotOf({}, { stillShape: preset('heavy') })), 96)).toEqual(tanninOutlook(s, butt(s, lotOf({})), 96));
    expect(tanninOutlook(s, butt(s, lotOf({}, { stillShape: preset('balanced') })), 180)).toEqual(none);
  });
  it('I2 — 원액 맛(바디 · 황)을 바꿔도 전망이 같다 · 빈 통은 채울 원액 형태로', () => {
    const s = game();
    const a = tanninOutlook(s, butt(s, lotOf({ body: 15 }, { stillShape: preset('heavy') })), 180);
    const b = tanninOutlook(s, butt(s, lotOf({ body: 60, sulfur_meaty: 9 }, { stillShape: preset('heavy') })), 180);
    expect(a).toEqual(b);
    const empty = butt(s);
    expect(tanninOutlook(s, empty, 180, preset('heavy'))!.tannin).toBeLessThan(tanninOutlook(s, empty, 180)!.tannin);
  });
});

describe('#422 원액 형태 · 제품 스타일 · 개조 전후 가름', () => {
  it('형태를 고른 증류기 원액에 형태 · 이름에 스타일 · 형태가 다르면 탱크를 가른다', () => {
    let s = game();
    s.production.equipment.find((e) => e.id === 'E1')!.stillShape = preset('heavy');
    s = applyAction(s, { type: 'setOrder', recipeId: 'R8', batchesPerMonth: 2 }).state;
    s = advanceMonth(s);
    const lot = s.inventory.lots.find((l) => l.recipeId === 'R8')!;
    expect(lot.stillShape).toEqual(preset('heavy'));
    expect(lot.name).toContain('헤비');
    expect(sameTank(lot, { ...lot, id: 'X', stillShape: undefined })).toBe(false);
    expect(sameTank(lot, { ...lot, id: 'X' })).toBe(true);
    // 형태가 없는 증류기(지금 판 · 봇)는 필드가 없다
    let p = game();
    p = applyAction(p, { type: 'setOrder', recipeId: 'R8', batchesPerMonth: 2 }).state;
    p = advanceMonth(p);
    expect('stillShape' in p.inventory.lots.find((l) => l.recipeId === 'R8')!).toBe(false);
  });
  it('병입하면 제품에 공개 스타일 — 형태 없는 원액이면 필드 없음 · 자동 납품은 같은 스타일 원액만', () => {
    const s = game();
    const mk = (id: string, shape?: StillShape): Cask => ({ ...emptyCaskOf(s, 'ex_bourbon_barrel'), id, contents: lotOf({ vanilla_caramel: 30, oak_tannin: 30 }, { id: `L${id}`, oakMonths: 40, ...(shape ? { stillShape: shape } : {}) }), filledMonth: 0 });
    s.inventory.casks.push(mk('KH', preset('heavy')), mk('KH2', preset('heavy')), mk('KN'), mk('KN2'));
    const opts = { name: '헤비 3년', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' } as const;
    const r = applyAction(s, { type: 'bottle', components: [{ source: 'cask', id: 'KH', liters: 100 }], options: opts });
    expect(r.error).toBeUndefined();
    const ph = r.state.commerce.products.at(-1)!;
    expect(ph.stillStyle).toBe('heavy');
    const r2 = applyAction(r.state, { type: 'bottle', components: [{ source: 'cask', id: 'KN', liters: 100 }], options: { ...opts, name: '그냥 3년' } });
    const pn = r2.state.commerce.products.at(-1)!;
    expect('stillStyle' in pn).toBe(false);
    const src = (p: typeof ph) => autoRestockSources(r2.state, { ...p, autoRestock: 2 }).map((x) => x.comp.id);
    expect(src(ph).every((id) => id.startsWith('KH'))).toBe(true);
    expect(src(pn).some((id) => id.startsWith('KH'))).toBe(false);
  });
  it('기본 조합 형태(균형)도 형태가 있으니 미디엄 — 무게 0이라 반응 · 저숙성 황은 0', () => {
    expect(stillStyleOf(DEFAULT_STILL_SHAPE)).toBe('medium');
    expect(shapeWeight(DEFAULT_STILL_SHAPE)).toBe(0);
  });
});

describe('[P-PROD-74] 증류기 형태는 위스키 원액에만 — 소주는 카탈로그 증류기 값', () => {
  it('헤비 · 하향 형태여도 소주 배치는 형태 없음과 같다 · 몰트 뉴메이크는 달라진다', () => {
    const plain = game();
    for (const sh of [preset('heavy'), { ...DEFAULT_STILL_SHAPE, lineArm: 'down' as const }]) {
      const s = game();
      s.production.equipment.find((e) => e.id === 'E1')!.stillShape = sh;
      const soju = s.production.recipes.find((r) => r.kind === 'soju')!;
      const malt = s.production.recipes.find((r) => r.kind === 'malt')!;
      expect(steadyBatch(s, soju)!.flavor).toEqual(steadyBatch(plain, soju)!.flavor);
      expect(steadyBatch(s, malt)!.flavor).not.toEqual(steadyBatch(plain, malt)!.flavor);
    }
  });
});
