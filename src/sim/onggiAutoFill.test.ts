// [결정 #425] 자동 통입 「소주 → 옹기」 — 켜야 동작(기본 끔) · v16만 · 소주는 옹기에만 · 탱크 소주 제품 몫은 남김 · 옹기 산 달 · 빈 채 3개월 알림
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { advanceMonth, applyAction } from './index';
import { newScenarioGame } from './newScenario';
import { emptyCaskOf } from './newGame';
import { vesselMaterial } from './maturation';
import { applyAutoFill, autoFillLots, autoFillPlan, autoFillPreview, ONGGI_IDLE_NOTE_MONTHS, onggiIdleNote, onggiTankReserve } from './autoFill';
import type { GameState, MonthReport, SpiritLot } from './types';

const sojuLot = (id: string, createdMonth: number, volumeL = 400): SpiritLot => ({ id, name: id, kind: 'soju', recipeId: 'R4', volumeL, abv: 0.48, flavor: {}, createdMonth, oakMonths: 0, sourced: false, costPerLPA: 1000 });
const maltLot = (id: string): SpiritLot => ({ id, name: id, kind: 'malt', recipeId: 'R8', volumeL: 400, abv: 0.68, flavor: {}, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 1000 });
const game = (rules?: 'legacy-v15'): GameState => {
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 1, ...(rules ? { rules } : {}) });
  s.finance.cash = 1e10;
  s.inventory.casks = [];
  for (let i = 0; i < 3; i++) s.inventory.casks.push(emptyCaskOf(s, 'onggi_jar'));
  for (let i = 0; i < 3; i++) s.inventory.casks.push(emptyCaskOf(s, 'ex_bourbon_barrel'));
  s.inventory.lots = [sojuLot('LS1', 0), maltLot('LM1')];
  s.commerce.products = [];
  return s;
};
const report = (): MonthReport => ({ notes: [] } as unknown as MonthReport);
const filled = (s: GameState, kind: string) => s.inventory.casks.filter((c) => c.contents?.kind === kind);

describe('#425 소주 → 옹기 자동 통입', () => {
  it('기본(꺼짐 · kinds 없음)은 지금 그대로 — 소주는 탱크에 남고 몰트만 나무 통에', () => {
    const s = game();
    s.inventory.autoFill = {};
    applyAutoFill(s, report());
    expect(filled(s, 'soju')).toHaveLength(0);
    expect(filled(s, 'malt').every((c) => vesselMaterial(c) === 'wood')).toBe(true);
    expect(filled(s, 'malt').length).toBeGreaterThan(0);
    expect(autoFillPreview(s, {}).onggi).toBeUndefined();
  });
  it('켜면 소주는 옹기에만 · 몰트는 나무 통에만', () => {
    let s = game();
    const r = applyAction(s, { type: 'setAutoFill', settings: { kinds: ['malt', 'grain', 'soju'] } });
    expect(r.error).toBeUndefined();
    s = r.state;
    expect(s.inventory.autoFill?.kinds).toEqual(['malt', 'grain', 'soju']);
    const rep = report();
    applyAutoFill(s, rep);
    expect(filled(s, 'soju').length).toBe(2); // 400L ÷ 200L(48% 그대로)
    expect(filled(s, 'soju').every((c) => vesselMaterial(c) === 'onggi')).toBe(true);
    expect(filled(s, 'malt').every((c) => vesselMaterial(c) === 'wood')).toBe(true);
    expect(rep.notes.some((n) => n.includes('소주 → 옹기 2개'))).toBe(true);
  });
  it('소주만(몰트 · 그레인 넣지 않음)도 고를 수 있다', () => {
    const s = applyAction(game(), { type: 'setAutoFill', settings: { kinds: ['soju'] } }).state;
    expect(s.inventory.autoFill?.kinds).toEqual(['soju']);
    expect(autoFillLots(s, s.inventory.autoFill!).map((l) => l.kind)).toEqual(['soju']);
  });
  it('옛 판은 소주를 받지 않는다 — 설정에서 지우고 원액 목록에도 없다', () => {
    const s = applyAction(game('legacy-v15'), { type: 'setAutoFill', settings: { kinds: ['malt', 'soju'] } }).state;
    expect(s.inventory.autoFill?.kinds).toEqual(['malt']);
    expect(autoFillLots(s, { kinds: ['malt', 'grain', 'soju'] }).some((l) => l.kind === 'soju')).toBe(false);
  });
  it('탱크 소주 제품 몫은 남긴다 — 새 원액부터 떼어 두고 오래된 원액을 옹기에', () => {
    const s0 = migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')).save)!;
    const cfg = { kinds: ['malt', 'grain', 'soju'] as ('malt' | 'grain' | 'soju')[] };
    // 9차 133개월: 소주 제품 셋 모두 탱크에서 채운다 → 탱크 소주 1,150L가 다 제품 몫이라 옹기에 넣지 않는다
    const all = autoFillPreview(s0, cfg).onggi!;
    expect(all.tankL).toBeGreaterThan(1000);
    expect(all.reservedL).toBeCloseTo(all.tankL, 6);
    expect(all.casks).toBe(0);
    // 「김포 소주」만 남기면 몫이 줄어 오래된 원액(L1311)의 남는 몫이 옹기로 간다
    s0.commerce.products = s0.commerce.products.filter((p) => p.category !== 'soju_distilled' || p.id === 'P46');
    const res = onggiTankReserve(s0, autoFillLots(s0, cfg));
    const lots = s0.inventory.lots.filter((l) => l.kind === 'soju').sort((a, b) => a.createdMonth - b.createdMonth);
    expect(res.get(lots[1]!.id)).toBeCloseTo(lots[1]!.volumeL, 6); // 새것(L1320)부터 다 남긴다
    expect(res.get(lots[0]!.id)!).toBeLessThan(lots[0]!.volumeL);
    const plan = autoFillPlan(s0, cfg).find((x) => x.lot.id === lots[0]!.id)!;
    expect(plan.caskIds.length).toBeGreaterThan(0);
    expect(plan.caskIds.every((id) => s0.inventory.casks.find((c) => c.id === id)!.typeId === 'onggi_jar')).toBe(true);
    // 자동 납품 목표 개월이 길면 몫도 커진다(꺼져 있으면 2개월)
    s0.commerce.products.find((p) => p.id === 'P46')!.autoRestock = 4;
    expect(onggiTankReserve(s0, autoFillLots(s0, cfg)).get(lots[0]!.id) ?? 0).toBeGreaterThan(res.get(lots[0]!.id)!);
  });
  it('옹기를 산 달 알림 — 꺼져 있을 때만 · 결산 메모와 행동 메시지', () => {
    const s = game();
    const r = applyAction(s, { type: 'buyCasks', caskType: 'onggi_jar', qty: 2 });
    expect(r.error).toBeUndefined();
    expect(r.message).toContain('「소주 → 옹기」');
    const after = advanceMonth(r.state);
    expect(after.history.reports.at(-1)!.notes.some((n) => n.includes('옹기는 자동 통입이 저절로 채우지 않는다'))).toBe(true);
    const on = applyAction(game(), { type: 'setAutoFill', settings: { kinds: ['malt', 'grain', 'soju'] } }).state;
    expect(applyAction(on, { type: 'buyCasks', caskType: 'onggi_jar', qty: 1 }).message).not.toContain('「소주 → 옹기」');
    expect(applyAction(game('legacy-v15'), { type: 'buyCasks', caskType: 'onggi_jar', qty: 1 }).message).not.toContain('「소주 → 옹기」');
  });
  it('빈 옹기가 3개월 놀면 알린다 · 켜면 지운다 · 옛 판은 상태를 만들지 않는다', () => {
    const s = game();
    const notes: string[][] = [];
    for (let m = 0; m <= ONGGI_IDLE_NOTE_MONTHS; m++) { s.month = m; const rep = report(); onggiIdleNote(s, rep); notes.push(rep.notes); }
    expect(s.inventory.onggiIdleSince).toBe(0);
    expect(notes.slice(0, ONGGI_IDLE_NOTE_MONTHS).every((n) => n.length === 0)).toBe(true);
    expect(notes[ONGGI_IDLE_NOTE_MONTHS]!.some((n) => n.includes('빈 옹기 3개가 3개월째'))).toBe(true);
    s.inventory.autoFill = { kinds: ['malt', 'grain', 'soju'] };
    onggiIdleNote(s, report());
    expect(s.inventory.onggiIdleSince).toBeUndefined();
    const old = game('legacy-v15');
    onggiIdleNote(old, report());
    expect(old.inventory.onggiIdleSince).toBeUndefined();
  });
});
