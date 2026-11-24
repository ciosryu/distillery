// [결정 #392] 자동 납품 「채울 원액」 고르기 — 9차 134개월 세이브 「김포 옹기소주」(restMonths 0 — 탱크 소주 보충으로 옹기 표기가 빠짐 · 옹기 통 12개 모두 빔)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyAction } from './index';
import { migrateSave } from './migrate';
import { advanceMonth } from './step';
import { autoRestockSourceChoices, autoRestockSources, autoRestockVesselNeed } from './economics';
import type { GameState } from './types';

const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')).save)!;
const onggiSoju = (s: GameState) => s.commerce.products.find((x) => x.name === '김포 옹기소주')!;

describe('#392 채울 원액 고르기', () => {
  it('고르지 않으면 지금 규칙 — 옹기 표기가 빠진 제품은 탱크로 채운다(9차 그대로)', () => {
    const s = load();
    const p = onggiSoju(s);
    expect(p.restMonths ?? 0).toBe(0);
    expect(autoRestockVesselNeed(s, p)).toBeNull();
    expect(autoRestockSources(s, p).every((x) => x.comp.source === 'lot')).toBe(true);
  });
  it('「옹기 2개월↑」을 고르면 옹기에서만 — 옹기가 모두 비었으니 못 채웠다는 메모 · 재고 0 그대로(탱크로 대신하지 않음)', () => {
    let s = load();
    const id = onggiSoju(s).id;
    const r = applyAction(s, { type: 'setAutoRestock', productId: id, months: 3, source: { vessel: 'onggi', months: 2 } });
    expect(r.error).toBeUndefined();
    expect(r.message).toContain('옹기에서 2개월 이상');
    s = advanceMonth(r.state);
    const note = s.history.reports.at(-1)!.notes.find((n) => n.includes('「김포 옹기소주」'))!;
    expect(note).toContain('옹기에서 2개월 이상 쉰 같은 레시피 통이 필요');
    expect(s.commerce.products.find((x) => x.id === id)!.stockBottles).toBe(0);
  });
  it('옹기에 소주가 다시 들어가 2개월 쉬면 그 통으로 채운다 — 경계값: 1개월 쉰 통은 쓰지 않는다', () => {
    const s = load();
    const p = onggiSoju(s);
    p.autoRestockSource = { vessel: 'onggi', months: 2 };
    const tank = s.inventory.lots.find((l) => l.kind === 'soju' && l.recipeId === 'R4')!;
    const [j1, j2] = s.inventory.casks.filter((c) => c.typeId === 'onggi_jar' && !c.contents);
    j1!.contents = { ...tank, id: 'J1', volumeL: 190, restMonths: 1 };
    j2!.contents = { ...tank, id: 'J2', volumeL: 190, restMonths: 2 };
    expect(autoRestockSources(s, p).map((x) => x.comp.id)).toEqual([j2!.id]);
  });
  it('「탱크」를 고르면 숙성 표기 제품이어도 탱크로 채운다', () => {
    const s = load();
    const p = onggiSoju(s);
    p.restMonths = 8; // 옹기 8개월 표기 제품이었다면
    expect(autoRestockVesselNeed(s, p)).toEqual({ vessel: 'onggi', months: 8 }); // 표기 「옹기 8개월 숙성」
    p.autoRestockSource = { vessel: 'tank', months: 0 };
    expect(autoRestockVesselNeed(s, p)).toBeNull();
  });
  it('선택지 — 지금 규칙 · 탱크 · 옹기 · 오크 n개월↑와 쓸 수 있는 통 수(옹기는 지금 0)', () => {
    const s = load();
    const c = autoRestockSourceChoices(s, onggiSoju(s));
    expect(c[0]!.label).toBe('지금 규칙(탱크)');
    expect(c.find((x) => x.label === '탱크')!.available).toBeGreaterThan(0);
    expect(c.find((x) => x.label === '옹기 2개월↑')!.available).toBe(0);
  });
  it('null이면 지운다 · 옛 판은 고를 수 없고 필드가 있어도 무시', () => {
    const s0 = load();
    const id = onggiSoju(s0).id;
    let s = applyAction(s0, { type: 'setAutoRestock', productId: id, months: 3, source: { vessel: 'onggi', months: 2 } }).state;
    s = applyAction(s, { type: 'setAutoRestock', productId: id, months: 3, source: null }).state;
    expect(onggiSoju(s).autoRestockSource).toBeUndefined();
    const old = load();
    old.rulesVersion = 'legacy-v15';
    expect(applyAction(old, { type: 'setAutoRestock', productId: id, months: 3, source: { vessel: 'onggi', months: 2 } }).error).toBeDefined();
    onggiSoju(old).autoRestockSource = { vessel: 'onggi', months: 2 };
    expect(autoRestockVesselNeed(old, onggiSoju(old))).toBeNull();
  });
});
