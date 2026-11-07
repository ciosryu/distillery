import { describe, expect, it } from 'vitest';
import { advanceMonths, applyAction, AWARENESS, awarenessOf, brandOf, demandFor, HOUSE_BRAND_ID, houseBrand, migrateSave, monthlyFixedCost, newGame, newScenarioGame, SAVE_VERSION, secondBrandMonthlyCost, secondBrands, updateAwareness, type GameState, type Product } from '.';
import { BRANDS } from './content/market';
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

  it('MVP에서는 브랜드 개설·배정이 잠겨 있다', () => {
    const mvp = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    expect(applyAction(mvp, { type: 'openBrand', name: '세컨드' }).error).toMatch(/시나리오/);
    expect(applyAction(mvp, { type: 'setProductBrand', productId: 'x', brandId: 'y' }).error).toMatch(/시나리오/);
  });
});

describe('세컨드 브랜드 규칙 (#155, PRD §11.2 ④)', () => {
  const open = (s: GameState, name = '세컨드') => {
    const r = applyAction(s, { type: 'openBrand', name });
    expect(r.error).toBeUndefined();
    return { s: r.state, b: secondBrands(r.state).at(-1)! };
  };

  it('월 고정비 예상(monthlyFixedCost)에 세컨드 브랜드 유지비·마케팅비가 들어간다', () => {
    const s0 = newGame({ seed: 1 });
    const base = monthlyFixedCost(s0);
    let { s, b } = open(s0);
    s = applyAction(s, { type: 'setMarketing', brandId: b.id, amount: 2_000_000 }).state;
    expect(monthlyFixedCost(s) - base).toBe(secondBrandMonthlyCost(s));
    expect(secondBrandMonthlyCost(s)).toBe(BRANDS.monthlyUpkeep + 2_000_000);
  });

  it('개설: 개설비를 내고 하우스 인지도의 50%에서 시작한다 (#52). 이름이 비거나 겹치면 실패', () => {
    const s0 = newGame({ seed: 1 });
    houseBrand(s0).awareness = 0.4;
    const { s, b } = open(s0);
    expect(s0.finance.cash - s.finance.cash).toBe(BRANDS.openCost);
    expect(b).toMatchObject({ isHouse: false, name: '세컨드', awareness: 0.2, openedMonth: s0.month, marketingBudget: 0 });
    expect(applyAction(s, { type: 'openBrand', name: '세컨드' }).error).toMatch(/이미/);
    expect(applyAction(s, { type: 'openBrand', name: '  ' }).error).toMatch(/이름/);
    const poor = structuredClone(s0);
    poor.finance.cash = BRANDS.openCost - 1;
    expect(applyAction(poor, { type: 'openBrand', name: 'x' }).error).toMatch(/현금/);
  });

  it('배정: 아직 안 판 제품은 무료, 판 적 있으면 리브랜딩 비용. 수요는 새 브랜드 인지도를 쓴다', () => {
    const { s: s1, b } = open(newGame({ seed: 1 }));
    s1.commerce.products.push(product({ id: 'new' }), product({ id: 'old', totalSold: 10, stockBottles: 1000 }));
    const r1 = applyAction(s1, { type: 'setProductBrand', productId: 'new', brandId: b.id });
    expect(r1.error).toBeUndefined();
    expect(r1.state.finance.cash).toBe(s1.finance.cash);
    expect(brandOf(r1.state, r1.state.commerce.products.find((p) => p.id === 'new')!).id).toBe(b.id);
    const r2 = applyAction(r1.state, { type: 'setProductBrand', productId: 'old', brandId: b.id });
    expect(r1.state.finance.cash - r2.state.finance.cash).toBe(BRANDS.rebrandFixed + BRANDS.rebrandPerBottle * 1000);
    expect(applyAction(r2.state, { type: 'setProductBrand', productId: 'old', brandId: b.id }).error).toMatch(/이미/);
    // 하우스로 되돌리면 brandId를 지운다
    const back = applyAction(r2.state, { type: 'setProductBrand', productId: 'new', brandId: HOUSE_BRAND_ID }).state;
    expect(back.commerce.products.find((p) => p.id === 'new')!.brandId).toBeUndefined();
  });

  it('유지비 + 브랜드별 마케팅비가 매달 나가 결산표 마케팅 줄에 합쳐진다', () => {
    let { s, b } = open(newGame({ seed: 1 }));
    s = applyAction(s, { type: 'setMarketing', brandId: b.id, amount: 2_000_000 }).state;
    expect(secondBrands(s)[0]!.marketingBudget).toBe(2_000_000);
    const house = s.commerce.marketingBudget;
    const t = advanceMonths(s, 1);
    expect(t.history.reports.at(-1)!.expenses.marketing).toBe(house + BRANDS.monthlyUpkeep + 2_000_000);
  });

  it('성장 연계: 세컨드에만 쓰면 하우스는 그 성장의 s만 받고, 더 투자하면 세컨드가 하우스를 추월한다 (#53·#54)', () => {
    let { s, b } = open(newGame({ seed: 1 }));
    s = applyAction(s, { type: 'setMarketing', amount: 0 }).state;
    s = applyAction(s, { type: 'setMarketing', brandId: b.id, amount: 10_000_000 }).state;
    s.finance.cash = 5_000_000_000;
    const t = advanceMonths(s, 36);
    expect(awarenessOf(t, { brandId: b.id })).toBeGreaterThan(awarenessOf(t));
    expect(awarenessOf(t)).toBeGreaterThan(houseBrand(s).awareness); // 하우스도 연계로 조금 오른다
  });

  it('같은 마케팅이면 세컨드는 하우스를 따라붙되 넘지 못한다 (#54)', () => {
    const s0 = newGame({ seed: 1 });
    houseBrand(s0).awareness = 0.3;
    let { s, b } = open(s0);
    s = applyAction(s, { type: 'setMarketing', brandId: b.id, amount: s.commerce.marketingBudget }).state;
    s.finance.cash = 5_000_000_000;
    const t = advanceMonths(s, 60);
    expect(awarenessOf(t, { brandId: b.id })).toBeLessThan(awarenessOf(t));
    expect(awarenessOf(t, { brandId: b.id }) / awarenessOf(t)).toBeGreaterThan(0.8);
  });

  it('세컨드 브랜드가 없으면 성장식은 옛 회사 인지도 성장식과 같다', () => {
    const s = newGame({ seed: 3 });
    const a0 = houseBrand(s).awareness;
    updateAwareness(s, [{ productId: 'none', name: 'x', bottles: 500, revenue: 0, demandBottles: 500, distribution: 0 }]);
    const q = 50; // 제품 기록 없음 → 평균 품질 50
    const g = (AWARENESS.marketing * Math.log10(1 + s.commerce.marketingBudget / 1_000_000) + AWARENESS.wordOfMouth * 500 * (q / 60)) * (1 - a0);
    expect(houseBrand(s).awareness).toBeCloseTo(a0 + g - AWARENESS.decay * a0, 12);
  });

  it('폐지: 재고 남은 제품이 있으면 못 하고, 폐지하면 남은 제품은 하우스로 돌아가고 유지비가 멈춘다', () => {
    const { s: s1, b } = open(newGame({ seed: 1 }));
    s1.commerce.products.push(product({ id: 'x', brandId: b.id, stockBottles: 5 }));
    expect(applyAction(s1, { type: 'closeBrand', brandId: b.id }).error).toMatch(/재고/);
    s1.commerce.products[0]!.stockBottles = 0;
    const r = applyAction(s1, { type: 'closeBrand', brandId: b.id });
    expect(r.error).toBeUndefined();
    expect(secondBrands(r.state)).toHaveLength(0);
    expect(r.state.commerce.products[0]!.brandId).toBeUndefined();
    expect(applyAction(r.state, { type: 'closeBrand', brandId: HOUSE_BRAND_ID }).error).toBeTruthy();
  });
});

describe('입소문 품질 = 판 병의 품질 (P-MKT-3, §15.3 #18)', () => {
  const sale = (productId: string, bottles: number) => ({ productId, name: productId, bottles, revenue: 0, demandBottles: bottles, distribution: 0 });
  const gain = (s: GameState, sales: ReturnType<typeof sale>[]) => { const a0 = houseBrand(s).awareness; updateAwareness(s, sales); return houseBrand(s).awareness - a0; };
  const base = () => { const s = newGame({ seed: 4 }); s.commerce.marketingBudget = 0; return s; };

  it('같은 병수면 품질에 비례해 입소문이 커진다', () => {
    const hi = base(); hi.commerce.products = [product({ id: 'a', quality: 90 })];
    const lo = base(); lo.commerce.products = [product({ id: 'a', quality: 30 })];
    const decay = AWARENESS.decay * houseBrand(hi).awareness;
    expect((gain(hi, [sale('a', 2000)]) + decay) / (gain(lo, [sale('a', 2000)]) + decay)).toBeCloseTo(3, 9);
  });

  it('예전에 만든 저품질 제품(보관 포함)은 지금 입소문을 깎지 않는다', () => {
    const clean = base(); clean.commerce.products = [product({ id: 'a', quality: 80 })];
    const legacy = base(); legacy.commerce.products = [product({ id: 'a', quality: 80 }), product({ id: 'old', quality: 20, stockBottles: 0 })];
    legacy.commerce.productArchive = Array.from({ length: 10 }, (_, i) => product({ id: `ar${i}`, quality: 15, stockBottles: 0 }));
    expect(gain(legacy, [sale('a', 1500)])).toBeCloseTo(gain(clean, [sale('a', 1500)]), 12);
  });

  it('세컨드 브랜드의 저품질 대량 판매는 하우스 입소문의 품질을 끌어내리지 않는다 (연계 s만큼만 더한다)', () => {
    const mk = (secondQ: number) => {
      const s = base();
      s.commerce.brands.push({ id: 'B2', name: '세컨드', isHouse: false, openedMonth: 0, awareness: 0.01, luxury: 0 });
      s.commerce.products = [product({ id: 'h', quality: 85 }), product({ id: 'c', quality: secondQ, brandId: 'B2' })];
      return gain(s, [sale('h', 1000), sale('c', 5000)]);
    };
    const onlyHouse = (() => { const s = base(); s.commerce.products = [product({ id: 'h', quality: 85 })]; return gain(s, [sale('h', 1000)]); })();
    expect(mk(30)).toBeGreaterThan(onlyHouse); // 세컨드 판매도 s만큼 더해진다
    expect(mk(30)).toBeLessThan(mk(60)); // 세컨드 품질이 낮으면 그 기여만 작다
  });
});
