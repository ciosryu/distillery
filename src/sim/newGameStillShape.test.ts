// [결정 #417 · #418] 사업 계획서 증류기 형태 — 고르면 시작 단식 증류기에만 넣고, 고르지 않으면 필드 자체가 없다(세이브 바이트 그대로)
import { describe, expect, it } from 'vitest';
import { newScenarioGame } from './newScenario';
import { EQUIPMENT } from './content/catalog';
import { stillDefOf } from './production';
import { STILL_SHAPE_PRESETS } from './stillShape';

const plan = { scenarioId: 'mvp_kr', tierId: 'standard' as const, loanAmount: 0, seed: 7 };
const heavy = STILL_SHAPE_PRESETS.find((p) => p.id === 'heavy')!.shape;

describe('newScenarioGame stillShape', () => {
  it('고르지 않으면 증류기에 stillShape 필드가 없다 — 고르기 전과 같은 세이브', () => {
    const s = newScenarioGame(plan);
    expect(s.production.equipment.some((e) => 'stillShape' in e)).toBe(false);
  });
  it('고르면 시작 단식 증류기 하나에만 넣고(복사본), 다른 상태는 같다', () => {
    const a = newScenarioGame(plan);
    const b = newScenarioGame({ ...plan, stillShape: heavy });
    const stills = b.production.equipment.filter((e) => EQUIPMENT[e.catalogId]?.kind === 'still');
    expect(stills).toHaveLength(1);
    expect(stills[0]!.stillShape).toEqual(heavy);
    expect(stills[0]!.stillShape).not.toBe(heavy);
    expect(stillDefOf(b, stills[0]!.id)).toMatchObject({ reflux: 0.2, condenser: 'worm_tub' });
    const strip = (x: typeof a) => JSON.stringify({ ...x, production: { ...x.production, equipment: x.production.equipment.map(({ stillShape: _s, ...e }) => e) } });
    expect(strip(b)).toBe(strip(a));
  });
});
