// 난이도 손잡이 — PROD 몫 (F6b, [결정 #314] · P-PROD-56). 표의 값은 아직 모두 1(자리)이라, 여기서는 임시 값을 넣어 "손잡이가 먹는지"와
// "Normal은 그대로인지"를 본다. 그리고 난이도로 바꾸지 않는 것(숙성 물리·고온 산패·샘플 오차)이 손잡이를 읽지 않는지를 소스에서 고정한다
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { applyAction, type GameState } from './index';
import { KNOBS, type KnobDef } from './content/difficulty';
import { EVENT, EVENTS, type Effect } from './content/events';
import { fireEvent } from './events';
import { cooperageLeadMonths, priceWalkSigma, tuneEventEffects, tuneForecast } from './prodKnobs';
import { PRICE_INDEX_WALK } from './content/production';
import { advanceMonth } from './index';
import { newScenarioGame } from './newScenario';

const saved = new Map<string, KnobDef>();
/** 임시 손잡이 값 — 테스트가 끝나면 되돌린다 */
const setKnob = (id: string, easy: number, hard: number) => { if (!saved.has(id)) saved.set(id, { ...KNOBS[id]! }); KNOBS[id] = { ...KNOBS[id]!, easy, hard }; };
afterEach(() => { for (const [id, v] of saved) KNOBS[id] = v; saved.clear(); });

const game = (level?: 'easy' | 'normal' | 'hard'): GameState => {
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1, ...(level ? { difficulty: level } : {}) });
  s.finance.cash = 5e9;
  return s;
};
const mod = (effects: Effect[], key: string) => effects.find((e): e is Extract<Effect, { type: 'modifier' }> => e.type === 'modifier' && e.key === key)!;
const PROD_KNOBS = ['supply.windfallSize', 'supply.forecastMonths', 'supply.forecastCertainty', 'supply.priceWalkSigma', 'supply.caskLead', 'incidents.stillDownMonths', 'incidents.spoilSize'];

describe('표 — PROD 손잡이 자리', () => {
  it('일곱 행이 있고 지금 값은 모두 1(자리) — 크기는 F7 측정 뒤 정한다', () => {
    for (const id of PROD_KNOBS) expect(KNOBS[id]).toMatchObject({ easy: 1, hard: 1 });
  });

  it('영역 태그 — 원가 악재는 supply, 재난·사고는 incidents · 호재(가공용 쌀 할인)는 태그하지 않는다(Hard가 호재를 늘리지 않게)', () => {
    for (const e of EVENTS.filter((x) => x.category === 'supply' && x.id !== 'rice_surplus')) expect(e.domain, e.id).toBe('supply');
    for (const e of EVENTS.filter((x) => x.category === 'disaster')) expect(e.domain, e.id).toBe('incidents');
    expect(EVENT.rice_surplus!.domain).toBeUndefined();
    expect(EVENT.tariff_retaliation!.domain).toBe('supply');
    expect(EVENT.spain_drought!.domain).toBe('supply');
  });
});

describe('Normal·옛 판·샌드박스 — 받은 것을 그대로 돌려준다(출력 불변)', () => {
  it('손잡이가 모두 1이면 같은 배열 객체 · 임시 값을 넣어도 Normal 판과 옛 판은 그대로', () => {
    const barley = EVENT.barley_failure!;
    const fire = EVENT.warehouse_fire!;
    expect(tuneEventEffects(game('hard'), barley, barley.effects!)).toBe(barley.effects); // 표 값이 1
    for (const id of PROD_KNOBS) setKnob(id, 0.5, 2);
    const normal = game('normal');
    const legacy = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1, rules: 'legacy-v15' });
    for (const s of [normal, legacy]) {
      expect(tuneEventEffects(s, barley, barley.effects!)).toBe(barley.effects);
      expect(tuneEventEffects(s, fire, fire.effects!)).toBe(fire.effects);
      expect(tuneForecast(s, barley, barley.forecast!)).toBe(barley.forecast);
      expect(cooperageLeadMonths(s)).toBe(2);
      expect(priceWalkSigma(s)).toBe(PRICE_INDEX_WALK.sigma);
    }
  });

  it('공급·사고가 아닌 범주(시장·규제…)의 이벤트는 손잡이를 받지 않는다', () => {
    for (const id of PROD_KNOBS) setKnob(id, 0.5, 2);
    const boom = EVENT.highball_boom!;
    expect(tuneEventEffects(game('hard'), boom, boom.effects!)).toBe(boom.effects);
  });
});

describe('공급 영역 — 임시 Easy ≠ Hard로 손잡이가 먹는지', () => {
  it('원가 악재의 크기·기간은 PROD가 곱하지 않는다 — 코어 한 자리(supply.eventMagnitude·eventDuration). 합친 상태: 보리 흉작 ×1.5가 Hard 2에서 ×2.0(두 번 곱한 ×2.5가 아님)', () => {
    setKnob('supply.eventMagnitude', 0.5, 2);
    setKnob('supply.eventDuration', 1, 1);
    for (const id of PROD_KNOBS) setKnob(id, 0.5, 2); // PROD 손잡이를 모두 움직여도
    const def = EVENT.barley_failure!;
    // PROD 식은 원가 악재 배수를 건드리지 않는다
    expect(mod(tuneEventEffects(game('hard'), def, def.effects!), 'ingredient:malt_unpeated').factor).toBe(1.5);
    // 게임 경로(이벤트 발생 → 효과 적용)로 실제 붙은 배수
    const applied = (lv: 'easy' | 'normal' | 'hard') => {
      const s = game(lv);
      fireEvent(s, 'barley_failure', { month: s.month, events: [], notes: [], expenses: {} } as never);
      return s.world.modifiers.find((m) => m.key === 'ingredient:malt_unpeated')!.factor;
    };
    expect(applied('normal')).toBeCloseTo(1.5, 9);
    expect(applied('hard')).toBeCloseTo(2.0, 9);
    expect(applied('easy')).toBeCloseTo(1.25, 9);
    expect(readFileSync(new URL('./prodKnobs.ts', import.meta.url), 'utf8')).not.toMatch(/eventMagnitude'\)|eventDuration'\)|costSize|costMonths/);
  });

  it('호재는 반대 방향 손잡이: 가공용 쌀 ×0.6 → Easy에서 더 싸지고 Hard에서 덜 싸진다 · 악재 손잡이에는 움직이지 않는다', () => {
    const def = EVENT.rice_surplus!;
    setKnob('supply.eventMagnitude', 0.5, 2); // 태그 없는 호재는 코어 손잡이도 받지 않는다
    expect(mod(tuneEventEffects(game('hard'), def, def.effects!), 'ingredient:rice_processing').factor).toBeCloseTo(0.6, 9);
    setKnob('supply.windfallSize', 1.5, 0.5);
    expect(mod(tuneEventEffects(game('easy'), def, def.effects!), 'ingredient:rice_processing').factor).toBeCloseTo(0.4, 9);
    expect(mod(tuneEventEffects(game('hard'), def, def.effects!), 'ingredient:rice_processing').factor).toBeCloseTo(0.8, 9);
  });

  it('예보: 보리 흉작 3개월·75% → Easy는 더 일찍·더 정확히, Hard는 반대(확률은 0.05~0.95)', () => {
    setKnob('supply.forecastMonths', 2, 1 / 3);
    setKnob('supply.forecastCertainty', 2, 0.5);
    const def = EVENT.barley_failure!;
    expect(tuneForecast(game('easy'), def, def.forecast!)).toMatchObject({ months: 6, certainty: 0.95 });
    expect(tuneForecast(game('hard'), def, def.forecast!)).toMatchObject({ months: 1, certainty: 0.375 });
  });

  it('통 납기: 쿠퍼리지 2개월 → Hard에서 늘고, 주문한 통의 도착 달과 안내 문구가 같은 값을 쓴다', () => {
    setKnob('supply.caskLead', 1, 1.5);
    const s = game('hard');
    expect(cooperageLeadMonths(s)).toBe(3);
    const r = applyAction(s, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: 1 });
    expect(r.error).toBeUndefined();
    expect(r.state.inventory.caskOrders.at(-1)!.arriveMonth).toBe(s.month + 3);
    expect(r.message).toContain('3개월 뒤 도착');
    expect(applyAction(game('easy'), { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: 1 }).state.inventory.caskOrders.at(-1)!.arriveMonth).toBe(2);
  });
});

describe('호재 손잡이의 범위 — 태그 없는 호재의 원재료 할인만 (ARCH 발견)', () => {
  it('tariff_retaliation의 bulk ×0.9(현물가 하락 = 악재)는 windfall을 받지 않는다 — Hard에서 그 악재가 줄어들면 안 된다', () => {
    setKnob('supply.windfallSize', 1.5, 0.5);
    const def = EVENT.tariff_retaliation!;
    expect(def.domain).toBe('supply');
    for (const lv of ['easy', 'hard'] as const) expect(mod(tuneEventEffects(game(lv), def, def.effects!), 'bulk').factor).toBe(0.9);
    // 태그 없는 호재(rice_surplus)의 원재료 할인에는 닿는다
    const rice = EVENT.rice_surplus!;
    expect(rice.domain).toBeUndefined();
    expect(mod(tuneEventEffects(game('hard'), rice, rice.effects!), 'ingredient:rice_processing').factor).toBeCloseTo(0.8, 9);
  });
});

describe('공급 영역 — 기본 시세 변동폭(이벤트가 열리기 전에도 닿는 손잡이)', () => {
  it('σ 0.02 → Easy는 좁게, Hard는 넓게 · 같은 시드로 12개월 돌리면 Hard의 시세가 1에서 더 멀리 움직이고 Normal은 임시 값에도 그대로', () => {
    const drift = (s0: GameState) => { let s = s0; for (let i = 0; i < 12; i++) s = advanceMonth(s); return Object.values(s.world.priceIndex).reduce((t, v) => t + Math.abs(v - 1), 0); };
    const base = drift(game('normal'));
    setKnob('supply.priceWalkSigma', 0.5, 3);
    expect(priceWalkSigma(game('easy'))).toBeCloseTo(0.01, 12);
    expect(priceWalkSigma(game('hard'))).toBeCloseTo(0.06, 12);
    expect(drift(game('normal'))).toBe(base);
    expect(drift(game('easy'))).toBeLessThan(base);
    expect(drift(game('hard'))).toBeGreaterThan(base);
  });
});

describe('사고 영역 — 임시 Easy ≠ Hard로 손잡이가 먹는지', () => {
  it('통 소실·원액 손실 비율은 PROD가 곱하지 않는다 — `incidents.lossSize`는 손실 원장(damageMul, MGT) 한 자리에서만 읽는다(두 번 곱하면 Hard에서 k²)', () => {
    for (const id of PROD_KNOBS) setKnob(id, 0.5, 2);
    KNOBS['incidents.lossSize'] = { easy: 0.5, hard: 2 }; // MGT 행이 있든 없든, 임시 값을 넣어도
    try {
      const fire = EVENT.warehouse_fire!;
      const flood = EVENT.flood!;
      const h = game('hard');
      expect(tuneEventEffects(h, fire, fire.effects!).find((e) => e.type === 'caskLoss')).toEqual(fire.effects!.find((e) => e.type === 'caskLoss'));
      const f = tuneEventEffects(h, flood, flood.effects!);
      expect(f.find((e) => e.type === 'caskVolumeLoss')).toEqual(flood.effects!.find((e) => e.type === 'caskVolumeLoss'));
      expect(f.find((e) => e.type === 'cash')).toEqual(flood.effects!.find((e) => e.type === 'cash'));
      expect(mod(f, 'production').factor).toBe(0);
      expect(readFileSync(new URL('./prodKnobs.ts', import.meta.url), 'utf8')).not.toMatch(/knob\(s, 'incidents\.lossSize'\)/);
    } finally { delete KNOBS['incidents.lossSize']; }
  });

  it('증류기 중단 개월(일반 수리 2개월)·발효 오염 이취(+8): Hard에서 늘고 Easy에서 준다 — 선택지 효과에도 같은 손잡이', () => {
    setKnob('incidents.stillDownMonths', 0.5, 2);
    setKnob('incidents.spoilSize', 0.5, 2);
    const still = EVENT.still_breakdown!;
    const slow = still.choices![1]!.effects;
    const down = (s: GameState) => (tuneEventEffects(s, still, slow).find((e) => e.type === 'stillDown') as Extract<Effect, { type: 'stillDown' }>).months;
    expect(down(game('easy'))).toBe(1);
    expect(down(game('hard'))).toBe(4);
    const inf = EVENT.ferment_infection!;
    const spoil = (s: GameState) => (tuneEventEffects(s, inf, inf.effects!)[0] as Extract<Effect, { type: 'lotSpoil' }>).acetic;
    expect(spoil(game('easy'))).toBe(4);
    expect(spoil(game('hard'))).toBe(16);
  });
});

describe('난이도로 바꾸지 않는 것 — 소스에서 고정 ([결정 #314] "숙성 물리 인과·숨은 참 품질·샘플 오차는 난이도로 제거하지 않는다")', () => {
  const src = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
  it('숙성(증발·추출)·숙성고(누수·오염 추첨)·생산(고온 발효 산패·수율)·샘플(읽기 오차)·블렌딩 파일은 손잡이를 읽지 않는다', () => {
    for (const f of ['maturation.ts', 'warehouse.ts', 'production.ts', 'blendTable.ts', 'blendRadar.ts', 'blending.ts', 'flavor.ts', 'ledger.ts']) {
      expect(src(f), f).not.toMatch(/\bknob\(/);
      expect(src(f), f).not.toMatch(/from '\.\/prodKnobs'/);
    }
  });

  it('PROD 손잡이를 읽는 곳은 prodKnobs.ts 한 파일 — 그 함수를 부르는 곳은 이벤트 적용(events.ts)·통 주문(actions.prod.ts)·월 시세 변동(step.ts)', () => {
    const body = src('prodKnobs.ts');
    for (const id of PROD_KNOBS) expect(body, id).toContain(`'${id}'`);
    expect(src('events.ts')).toMatch(/tuneEventEffects\(/);
    expect(src('actions.prod.ts')).toMatch(/cooperageLeadMonths\(s\)/);
    expect(src('step.ts')).toMatch(/priceWalkSigma\(s\)/);
    expect(src('step.ts')).not.toMatch(/\bknob\(/);
    expect(src('actions.prod.ts')).not.toMatch(/tuneEventEffects|tuneForecast|\bknob\(/);
  });
});
