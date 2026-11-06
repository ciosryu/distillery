import { describe, expect, it } from 'vitest';
import { advanceMonths, applyAction, awarenessOf, brandOf, demandFor, HOUSE_BRAND_ID, houseBrand, migrateSave, newGame, newScenarioGame, SAVE_VERSION, type Product } from '.';
import fixture from './fixtures/save-v10.json';

// 브랜드 라인 (skeleton S-2, #148, PRD §11.2 ④)

const product = (over: Partial<Product> = {}): Product => ({ id: 'P1', name: 'p', category: 'whisky', ageYears: 4, oakMonths: 48, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 70, typicity: 80, style: null, sourcedShare: 0, stockBottles: 1000, price: 60_000, unitCost: 20_000, createdMonth: 0, lastMonthSold: 0, totalSold: 0, ...over });

describe('세이브 v10 → v11 (S-2)', () => {
  it('회사 인지도는 하우스 브랜드 인지도가 되고, 진행 결과가 v10 코드와 같다', () => {
    const raw = structuredClone(fixture.save) as unknown as { commerce: { awareness: number } };
    const s = migrateSave(raw)!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.commerce.brands).toHaveLength(1);
    expect(houseBrand(s)).toMatchObject({ id: HOUSE_BRAND_ID, isHouse: true, name: s.distilleryName, awareness: raw.commerce.awareness, luxury: 0 });
    expect((s.commerce as unknown as { awareness?: number }).awareness).toBeUndefined();
    const t = advanceMonths(s, 3);
    expect({ month: t.month, cash: t.finance.cash, awareness: awarenessOf(t) }).toEqual(fixture.expectedAfter3);
  });
});

describe('브랜드 라인 구조 (S-2)', () => {
  it('새 게임은 회사명의 하우스 브랜드 하나로 시작한다', () => {
    const s = newGame({ seed: 1, distilleryName: '달빛 증류소' });
    expect(s.commerce.brands).toEqual([{ id: HOUSE_BRAND_ID, name: '달빛 증류소', isHouse: true, openedMonth: 0, awareness: 0.01, luxury: 0 }]);
  });

  it('제품은 자기 브랜드의 인지도로 수요를 계산한다 — brandId가 없거나 모르면 하우스', () => {
    const s = newGame({ seed: 1 });
    s.commerce.brands.push({ id: 'B2', name: '세컨드', isHouse: false, openedMonth: 0, awareness: 0.5, luxury: 0 });
    houseBrand(s).awareness = 0.1;
    const house = product({ id: 'H' });
    const second = product({ id: 'S', brandId: 'B2' });
    expect(brandOf(s, house).id).toBe(HOUSE_BRAND_ID);
    expect(brandOf(s, { brandId: 'nope' }).id).toBe(HOUSE_BRAND_ID);
    expect(awarenessOf(s, second)).toBe(0.5);
    expect(awarenessOf(s)).toBe(0.1);
    // 수요 공식의 도달률은 인지도에 비례한다 → 같은 제품이면 수요도 인지도 비례
    const dh = demandFor(s, house, 1, 1).demandBottles;
    const ds = demandFor(s, second, 1, 1).demandBottles;
    expect(ds / dh).toBeCloseTo(5, 6);
  });

  it('브랜드 개설·배정 행동은 자리만 있다 (단계 P) — MVP에서는 잠겨 있다', () => {
    const s = newGame({ seed: 1 });
    expect(applyAction(s, { type: 'openBrand', name: '세컨드' }).error).toMatch(/다음 단계/);
    expect(applyAction(s, { type: 'setProductBrand', productId: 'x', brandId: 'y' }).error).toMatch(/다음 단계/);
    const mvp = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    expect(applyAction(mvp, { type: 'openBrand', name: '세컨드' }).error).toMatch(/시나리오/);
  });
});
