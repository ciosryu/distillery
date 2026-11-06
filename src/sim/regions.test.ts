import { afterEach, describe, expect, it } from 'vitest';
import { advanceMonths, applyAction, EXPORT_MARKETS, newGame, type RegionId } from '.';
import { REGIONS, type RegionDef } from './content/regions';
import { EXPORT_MARKET_IDS } from './content/exports';

// 지역 추가 = 데이터 추가 (skeleton S-3, #150, PRD §13.2)
// 지역에 묶인 값은 모두 RegionDef·SiteDef 한 곳에 있다. 코드는 지역 id로 분기하지 않는다.

const FAKE = 'XX' as RegionId;
afterEach(() => { delete (REGIONS as Record<string, RegionDef>)[FAKE]; });

describe('지역 데이터 일관성 — 지역을 더할 때 채워야 하는 표', () => {
  it('모든 지역에 프리셋·창업 정보·이름 풀이 있고, 프리셋은 그 지역에서 만들 수 있는 주종이다', () => {
    for (const r of Object.values(REGIONS)) {
      expect(r.presets.length, r.id).toBeGreaterThan(0);
      expect(r.starter.casks.length, r.id).toBeGreaterThan(0);
      expect(r.namePool.surnames.length * r.namePool.given.length, r.id).toBeGreaterThan(0);
      for (const p of [...r.presets, ...(r.sites ?? []).flatMap((x) => x.presets ?? [])]) expect(r.allowedKinds, `${r.id} ${p.name}`).toContain(p.kind);
    }
  });

  it('모든 수출 시장이 모든 출발 지역의 관세·운임을 갖는다 (지역 id = 같은 id의 수출 시장이면 그것이 내수)', () => {
    for (const id of EXPORT_MARKET_IDS) for (const r of Object.keys(REGIONS)) {
      expect(EXPORT_MARKETS[id].tariff[r as RegionId], `${id} ← ${r} 관세`).toBeTypeOf('number');
      expect(EXPORT_MARKETS[id].freightPerBottle[r as RegionId], `${id} ← ${r} 운임`).toBeTypeOf('number');
    }
  });
});

describe('가짜 지역을 데이터만으로 더하면 게임이 돈다', () => {
  it('프리셋·창업자·이름 풀·기후가 데이터를 따르고, 1년을 진행할 수 있다', () => {
    const kr = REGIONS.KR;
    (REGIONS as Record<string, RegionDef>)[FAKE] = {
      ...kr, id: FAKE, nameKo: '가짜 지역',
      tempC: kr.tempC.map((t) => t + 5),
      presets: [kr.presets.find((p) => p.kind === 'malt')!],
      starter: { name: '가짜 창업자', distillery: '가짜 증류소', casks: ['oloroso_butt'] },
      namePool: { surnames: ['가'], given: ['짜'] },
      sites: [], defaultSite: undefined,
    };
    // 수출 표는 지역을 더하는 PR이 채운다 (위 일관성 테스트가 빠진 값을 잡는다) — 여기서는 수출을 쓰지 않는다
    let s = newGame({ seed: 1, region: FAKE });
    expect(s.distilleryName).toBe('가짜 증류소');
    expect(s.hr.staff[0]!.name).toBe('가짜 창업자');
    expect(s.production.recipes.map((r) => r.kind)).toEqual(['malt']);
    expect(s.inventory.casks.map((c) => c.typeId)).toEqual(['oloroso_butt']);
    expect(s.hr.candidates.every((c) => c.name === '가짜')).toBe(true);
    s = applyAction(s, { type: 'setOrder', recipeId: s.production.recipes[0]!.id, batchesPerMonth: 2 }).state;
    s = advanceMonths(s, 12);
    expect(s.month).toBe(12);
    expect(s.inventory.lots.some((l) => l.kind === 'malt')).toBe(true);
  });
});
