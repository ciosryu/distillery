// [결정 #362 · PROD 보충 경고] 보충으로 피니시 표기 효과가 꺼지는가 — 보충 뒤 피니시 개월(매대에 섞이는 병 중 짧은 쪽)이 MKT 문턱 아래로 내려가면 병입 화면 · 자동 납품 메모가 알린다
import { describe, expect, it } from 'vitest';
import { applyAction } from './index';
import { applyAutoRestock } from './economics';
import { restockFinishOff } from './blending';
import { FINISH_EFFECT_MIN_MONTHS, finishLabelOn } from './finishLabel';
import { newScenarioGame } from './newScenario';
import { emptyCaskOf } from './newGame';
import type { GameState, MonthReport, SpiritLot } from './types';

describe('restockFinishOff — 순수', () => {
  const on = { finish: 'oloroso_butt' as const, finishMonths: 4, stockBottles: 100 };
  it('켜진 제품을 짧은 피니시로 보충하면 꺼진다 — 남은 재고가 있으면 짧은 쪽', () => {
    expect(FINISH_EFFECT_MIN_MONTHS).toBe(3);
    expect(restockFinishOff(on, 2)).toEqual({ before: 4, after: 2, min: 3 });
    expect(restockFinishOff(on, 3)).toBeNull();
    expect(restockFinishOff(on, 12)).toBeNull();
  });
  it('재고 0이면 새 배치 그대로 · 꺼진 제품 · 피니시 없는 제품 · 새 배치 개월을 모르면(옛 판) 알리지 않는다', () => {
    expect(restockFinishOff({ ...on, stockBottles: 0 }, 2)).toEqual({ before: 4, after: 2, min: 3 });
    expect(restockFinishOff({ ...on, stockBottles: 0 }, 5)).toBeNull();
    expect(restockFinishOff({ ...on, finishMonths: 2 }, 1)).toBeNull(); // 이미 꺼짐
    expect(restockFinishOff({ finish: undefined, finishMonths: undefined, stockBottles: 10 }, 1)).toBeNull();
    expect(restockFinishOff(on, null)).toBeNull();
  });
});

describe('v16 판 — 셰리 피니시 제품을 짧게 쉰 원액으로 보충', () => {
  const lot = (id: string, oak: number): SpiritLot => ({ id, name: id, kind: 'malt', volumeL: 400, abv: 0.6, flavor: { vanilla_caramel: 20, dried_fruit: 10, oak_tannin: 8 }, createdMonth: 0, oakMonths: oak, sourced: false, costPerLPA: 8000, recipeId: 'R1',
    caskHistory: [{ typeId: 'ex_bourbon_barrel', fromMonth: 0, months: 36 }, { typeId: 'oloroso_butt', fromMonth: 36, months: oak - 36 }] });
  const setup = () => {
    const s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 1 });
    s.finance.cash = 1e10;
    const a = emptyCaskOf(s, 'oloroso_butt'); a.contents = lot('LONG', 40); a.fills = 1; // 피니시 4개월
    const b = emptyCaskOf(s, 'oloroso_butt'); b.contents = lot('SHORT', 38); b.fills = 1; // 피니시 2개월
    s.inventory.casks.push(a, b);
    s.inventory.reserveOptOut = ['LONG', 'SHORT']; // 새 판의 플래그십 예비(가장 오래된 자가 몰트 통 — #260)를 뗀다: 이 시험은 피니시 표기만 본다
    const opts = { name: '셰리 피니시', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };
    const r = applyAction(s, { type: 'bottle', components: [{ source: 'cask', id: a.id, liters: 40 }], options: opts });
    expect(r.error).toBeUndefined();
    const p = r.state.commerce.products.at(-1)!;
    return { s: r.state, p, a: a.id, b: b.id, opts };
  };
  it('첫 병입은 피니시 4개월 — 표기 효과 켜짐', () => {
    const { p } = setup();
    expect(p.finish).toBe('oloroso_butt');
    expect(p.finishMonths).toBe(4);
    expect(finishLabelOn(p)).toBe(true);
  });
  it('자동 납품이 2개월 원액으로 채우면 결산 메모로 알린다(채우는 것은 그대로)', () => {
    const { s, p } = setup();
    const prod = s.commerce.products.find((x) => x.id === p.id)!;
    prod.autoRestock = 3;
    prod.stockBottles = 1;
    const report = { month: s.month, notes: [], expenses: {} } as unknown as MonthReport;
    applyAutoRestock(s, report);
    const after = s.commerce.products.find((x) => x.id === p.id)!;
    expect(report.notes.some((n) => n.includes('+') && n.includes('「셰리 피니시」'))).toBe(true);
    expect(after.finishMonths).toBe(2);
    expect(finishLabelOn(after)).toBe(false);
    expect(report.notes.some((n) => n.includes('피니시 2개월 원액이 섞여 피니시 표기 효과가 꺼졌다(3개월 이상이어야 켜진다 · 전 4개월)'))).toBe(true);
  });
});
