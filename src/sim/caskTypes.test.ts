// [결정 #355] 일반 4종 — 용량은 오너 값, 피니시 표기는 종류별, 시즈닝 계약은 버번 · 셰리 계열만, 병입 때 피니시 개월(#362)을 남긴다
import { describe, expect, it } from 'vitest';
import { applyAction, previewBlend, newGame, type Cask, type Flavor } from '.';
import { CASKS, SEASONING_CONTRACT, SEASONING_EXTRACT } from './content/catalog';
import { canFinishInto, finishLabel } from './maturation';
import { emptyCaskOf } from './newGame';

describe('일반 4종 카탈로그', () => {
  it('용량은 오너가 준 값 그대로 — 셰리 혹스헤드 250 · 와인 바리끄 225 · 포트 파이프 650 · 버진 오크 200', () => {
    expect(CASKS.sherry_hogshead.sizeL).toBe(250);
    expect(CASKS.wine_barrique.sizeL).toBe(225);
    expect(CASKS.port_pipe.sizeL).toBe(650);
    expect(CASKS.virgin_oak_barrel.sizeL).toBe(200);
  });
  it('시즈닝 향이 모든 종류에 정의돼 있다 · 버진 오크는 시즈닝 없음이라 피니싱 대상이 아니다', () => {
    for (const d of Object.values(CASKS)) expect(SEASONING_EXTRACT[d.seasoningType]).toBeDefined();
    expect(canFinishInto('virgin_oak_barrel')).toBe(false);
    for (const k of ['sherry_hogshead', 'wine_barrique', 'port_pipe'] as const) expect(canFinishInto(k)).toBe(true);
  });
  it('피니시 표기는 통이 담았던 술 이름 — 와인 통이 "버번"으로 찍히지 않는다', () => {
    expect(finishLabel('ex_bourbon_barrel')).toBe('버번 캐스크 피니시');
    expect(finishLabel('oloroso_butt')).toBe('셰리 캐스크 피니시');
    expect(finishLabel('sherry_hogshead')).toBe('셰리 캐스크 피니시');
    expect(finishLabel('wine_barrique')).toBe('와인 캐스크 피니시');
    expect(finishLabel('port_pipe')).toBe('포트 캐스크 피니시');
  });
});

describe('시즈닝 계약은 버번 · 셰리 계열만', () => {
  it('셰리 혹스헤드는 되고 와인 · 포트 · 버진 오크는 거절', () => {
    expect([...SEASONING_CONTRACT].sort()).toEqual(['bourbon', 'sherry']);
    const s = newGame({ seed: 3, startingCash: 10_000_000_000 });
    expect(applyAction(s, { type: 'orderSeasoning', caskType: 'sherry_hogshead', qty: 1 }).error).toBeUndefined();
    for (const k of ['wine_barrique', 'port_pipe', 'virgin_oak_barrel'] as const) expect(applyAction(s, { type: 'orderSeasoning', caskType: k, qty: 1 }).error).toBeTruthy();
  });
});

describe('병입 때 피니시 개월 (#362)', () => {
  const FLAVOR: Flavor = { fresh_fruit: 30, vanilla_caramel: 35, dried_fruit: 10, integration: 40 };
  const finished = (s: ReturnType<typeof newGame>, finishMonths: number): Cask => {
    const c = emptyCaskOf(s, 'wine_barrique');
    c.contents = { id: `W${finishMonths}`, name: 'W', kind: 'malt', volumeL: 200, abv: 0.6, flavor: { ...FLAVOR }, createdMonth: 0, oakMonths: 48 + finishMonths, sourced: false, costPerLPA: 10_000,
      caskHistory: [{ typeId: 'ex_bourbon_barrel', fromMonth: 0, months: 48 }, { typeId: 'wine_barrique', fromMonth: 48, months: 0 }] };
    c.filledMonth = 48;
    s.inventory.casks.push(c);
    return c;
  };
  const opts = { name: 't', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };
  it('미리보기 · 제품에 피니시 종류와 개월이 남는다 — 원액 LPA 가중(코어 정의)', () => {
    const s = newGame({ seed: 3, startingCash: 50_000_000_000 });
    const a = finished(s, 6);
    const b = finished(s, 10);
    const comps = [a, b].map((c) => ({ source: 'cask' as const, id: c.id, liters: 150 }));
    const pre = previewBlend(s, comps, opts);
    expect(pre.finish).toBe('wine_barrique');
    expect(pre.finishMonths).toBe(8); // 같은 L · 도수의 6개월 · 10개월 → 8
    const p = applyAction(s, { type: 'bottle', components: comps, options: opts }).state.commerce.products.at(-1)!;
    expect(p.finish).toBe('wine_barrique');
    expect(p.finishMonths).toBe(8);
  });
  it('옛 판(legacy-v15)은 피니시 개월을 남기지 않는다 — #362 표기 효과는 v16만(필드 유무로 건다)', () => {
    const s = newGame({ seed: 3, startingCash: 50_000_000_000 });
    s.rulesVersion = 'legacy-v15';
    const a = finished(s, 6);
    const p = applyAction(s, { type: 'bottle', components: [{ source: 'cask', id: a.id, liters: 150 }], options: opts }).state.commerce.products.at(-1)!;
    expect(p.finish).toBe('wine_barrique');
    expect(p.finishMonths).toBeUndefined();
  });
  it('피니시가 없으면 개월도 없다', () => {
    const s = newGame({ seed: 3, startingCash: 50_000_000_000 });
    const c = emptyCaskOf(s, 'ex_bourbon_barrel');
    c.contents = { id: 'B', name: 'B', kind: 'malt', volumeL: 200, abv: 0.6, flavor: { ...FLAVOR }, createdMonth: 0, oakMonths: 48, sourced: false, costPerLPA: 10_000 };
    s.inventory.casks.push(c);
    const p = applyAction(s, { type: 'bottle', components: [{ source: 'cask', id: c.id, liters: 150 }], options: opts }).state.commerce.products.at(-1)!;
    expect(p.finish).toBeUndefined();
    expect(p.finishMonths).toBeUndefined();
  });
});
