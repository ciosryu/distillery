// [결정 #417 · #418] 증류기 형태 — 기본 조합은 지금 양파형과 같은 값(바이트 동일) · 헤비는 오일리 · 황 · 바디 · 거친 맛 ↑ · 라이트는 과일 · 플로럴 ↑
import { describe, expect, it } from 'vitest';
import { advanceMonth } from './index';
import { newScenarioGame } from './newScenario';
import { EQUIPMENT } from './content/catalog';
import { simulateBatch, stillDefOf } from './production';
import { DEFAULT_STILL_SHAPE, STILL_SHAPE_PRESETS, stillParams, stillShapeNote } from './stillShape';
import type { GameState } from './types';

type StillDef = Extract<(typeof EQUIPMENT)[string], { kind: 'still' }>;
const onion = EQUIPMENT.pot_onion_1000 as StillDef;
const game = (): GameState => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 3 });
const preset = (id: string) => STILL_SHAPE_PRESETS.find((p) => p.id === id)!.shape;

describe('stillParams', () => {
  it('형태가 없으면 카탈로그 값 그대로(같은 객체) · 단식이 아니면 형태를 무시', () => {
    expect(stillParams(onion)).toBe(onion);
    const vac = EQUIPMENT.vacuum_1000 as StillDef;
    expect(stillParams(vac, preset('heavy'))).toBe(vac);
  });
  it('기본 조합 = 양파형 값(환류 0.4 · 구리 1.0 · 쉘) · 축 보정 없음', () => {
    const p = stillParams(onion, DEFAULT_STILL_SHAPE);
    expect({ reflux: p.reflux, copperContact: p.copperContact, condenser: p.condenser }).toEqual({ reflux: onion.reflux, copperContact: onion.copperContact, condenser: onion.condenser });
    expect(p.shapeAdd).toBeUndefined();
    expect(p.shapeMul).toBeUndefined();
  });
  it('세 묶음 — 라이트 환류 0.75 · 구리 1.0 / 헤비 0.20 · 0.4(웜 텁) / 균형 0.40 · 1.0', () => {
    expect(stillParams(onion, preset('light'))).toMatchObject({ reflux: 0.75, copperContact: 1, condenser: 'copper_shell' });
    expect(stillParams(onion, preset('heavy'))).toMatchObject({ reflux: 0.2, copperContact: 0.4, condenser: 'worm_tub' });
    expect(stillParams(onion, preset('balanced'))).toMatchObject({ reflux: 0.4, copperContact: 1 });
    expect(stillShapeNote(preset('heavy'))).toContain('미티');
  });
});

describe('생산 — 기본 조합은 바이트 동일 · 형태가 원액을 바꾼다', () => {
  it('시작 증류기에 기본 조합을 넣고 6개월 진행해도 형태가 없을 때와 상태가 같다(증류기 필드만 다름)', () => {
    let a = game();
    let b = game();
    const still = b.production.equipment.find((e) => EQUIPMENT[e.catalogId]?.kind === 'still')!;
    still.stillShape = { ...DEFAULT_STILL_SHAPE };
    for (let m = 0; m < 6; m++) { a = advanceMonth(a); b = advanceMonth(b); }
    const strip = (s: GameState) => JSON.stringify({ ...s, production: { ...s.production, equipment: s.production.equipment.map(({ stillShape: _x, ...e }) => e) } });
    expect(strip(b)).toBe(strip(a));
    expect(stillDefOf(b, still.id)!.reflux).toBe(0.4);
  });
  it('같은 레시피 · 같은 조건 — 헤비는 오일리 · 황 · 바디 · 거친 맛이 많고, 라이트는 과일 · 플로럴이 많고 오일리가 적다', () => {
    const s = game();
    const r = s.production.recipes.find((x) => x.kind === 'malt')!;
    const run = (shape?: typeof DEFAULT_STILL_SHAPE) => simulateBatch(r, stillParams(onion, shape), 'stainless', undefined, {}, 0).flavor;
    const base = run();
    const heavy = run(preset('heavy'));
    const light = run(preset('light'));
    expect(heavy.oily_waxy!).toBeGreaterThan(base.oily_waxy!);
    expect(heavy.sulfur_meaty!).toBeGreaterThan(base.sulfur_meaty!);
    expect(heavy.body!).toBeGreaterThan(base.body!);
    expect(heavy.harshness!).toBeGreaterThan(base.harshness!);
    expect(light.fresh_fruit!).toBeGreaterThan(base.fresh_fruit!);
    expect(light.floral!).toBeGreaterThan(base.floral!);
    expect(light.oily_waxy!).toBeLessThan(base.oily_waxy!);
    expect(light.sulfur_meaty ?? 0).toBeLessThan(base.sulfur_meaty!);
  });
});
