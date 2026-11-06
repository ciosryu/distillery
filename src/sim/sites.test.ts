import { describe, expect, it } from 'vitest';
import { applyAction, newGame, spotBidPerLPA, validateRecipe, equipmentCost, hasLocalIngredient, siteOverhead, type SpiritLot } from './index';
import { EQUIPMENT } from './content/catalog';
import { REGIONS, siteOf, sitesOfRegion } from './content/regions';

// 입지 특성 이식 (결정 #86~#90) — docs/design/regions.md

const lot = (over: Partial<SpiritLot> = {}): SpiritLot => ({ id: 'L1', name: 'l', kind: 'soju', volumeL: 400, abv: 0.45, flavor: { nuruk_rice: 30, fresh_fruit: 20 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 9_000, ...over });

describe('입지 목록 (결정 #86)', () => {
  it('한국 경기·안동·제주, 일본 간토·오사카교토·홋카이도, 대만 이란·진먼섬', () => {
    expect(sitesOfRegion('KR').map((x) => x.id)).toEqual(['default', 'andong', 'jeju']);
    expect(sitesOfRegion('JP').map((x) => x.id)).toEqual(['default', 'kansai', 'hokkaido']);
    expect(sitesOfRegion('TW').map((x) => x.id)).toEqual(['default', 'kinmen']);
    expect(siteOf({ regionId: 'KR' }).deals).toEqual(['retail']);
    expect(siteOf({ regionId: 'JP' }).deals).toEqual(['oem']);
    // 기본 입지의 기후는 지역 값 그대로
    expect(siteOf({ regionId: 'KR' }).tempC).toEqual(REGIONS.KR.tempC);
  });

  it('입지 관리비·건설비·숙성고 땅값', () => {
    const k = newGame({ seed: 1, region: 'JP', site: 'kansai' });
    const h = newGame({ seed: 1, region: 'JP', site: 'hokkaido' });
    const j = newGame({ seed: 1, region: 'KR', site: 'jeju' });
    expect(siteOverhead(k)).toBe(Math.round(REGIONS.JP.overheadPerMonth * siteOf(k).overheadFactor!));
    expect(siteOverhead(h)).toBe(Math.round(REGIONS.JP.overheadPerMonth * (siteOf(h).overheadFactor ?? 1)));
    const wh = EQUIPMENT.warehouse_rack_100!;
    expect(equipmentCost(k, wh)).toBe(Math.round(wh.cost * 1.3));
    expect(equipmentCost(h, wh)).toBe(Math.round(wh.cost * 0.7));
    expect(equipmentCost(j, EQUIPMENT.pot_onion_1000!)).toBe(Math.round(EQUIPMENT.pot_onion_1000!.cost * 1.2));
    const before = j.finance.cash;
    const after = applyAction(j, { type: 'buyEquipment', catalogId: 'pot_onion_1000' }).state;
    expect(before - after.finance.cash).toBe(equipmentCost(j, EQUIPMENT.pot_onion_1000!));
  });

  it('입지 전용 원료·프리셋: 제주 고소리술·청귤 진, 홋카이도 감자 — 다른 입지에선 못 쓴다', () => {
    const j = newGame({ seed: 1, region: 'KR', site: 'jeju' });
    const g = newGame({ seed: 1, region: 'KR' });
    const gosori = j.production.recipes.find((r) => r.name.startsWith('고소리술'))!;
    expect(validateRecipe(j, gosori)).toEqual([]);
    expect(validateRecipe(g, { ...gosori, stillId: g.production.equipment[0]!.id }).some((e) => e.includes('입지'))).toBe(true);
    expect(hasLocalIngredient(siteOf(j), gosori)).toBe(true);
    expect(hasLocalIngredient(siteOf(j), j.production.recipes.find((r) => r.name === '제주 청귤 진')!)).toBe(true);
    expect(hasLocalIngredient(siteOf(j), j.production.recipes.find((r) => r.kind === 'malt')!)).toBe(false);
    const h = newGame({ seed: 1, region: 'JP', site: 'hokkaido' });
    expect(h.production.recipes[0]!.name).toContain('감자');
    expect(h.hr.staff[0]!.name).toBe('오노 다이치');
  });

  it('제주 원액 B2B 단가 ×0.85 (섬 운송비)', () => {
    const g = newGame({ seed: 1, region: 'KR' });
    const j = newGame({ seed: 1, region: 'KR', site: 'jeju' });
    const malt = lot({ kind: 'malt', abv: 0.68, oakMonths: 0 });
    expect(spotBidPerLPA(j, malt) / spotBidPerLPA(g, malt)).toBeCloseTo(0.85, 6);
  });
});
