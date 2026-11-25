// [결정 #382] PROD 몫 — 아는 오염 꼬리표가 원액을 따라간다: 원액 빼기 · 피니싱 옮기기 · 통입(나눔) · 탱크 합치기(LPA 몫으로 묽힘). 모르는 오염은 따라가지 않는다(I2)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyAction } from './index';
import { migrateSave } from './migrate';
import { mergeIntoTank } from './production';
import { taintShown } from './taint';
import type { GameState, SpiritLot } from './types';

const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')).save)!;

describe('#382 꼬리표 잇기', () => {
  it('원액 빼기: 아는 오염 통(K388 · TCA)에서 꺼낸 탱크 원액에 꼬리표 1', () => {
    const s0 = load();
    const r = applyAction(s0, { type: 'unfillCask', caskId: 'K388' });
    expect(r.error).toBeUndefined();
    const lot = r.state.inventory.lots.find((l) => l.name.includes('K388에서 뺌'))!;
    expect(lot.knownTaint).toEqual({ kind: 'tca', share: 1 });
    expect(taintShown(lot)).toBe(true);
  });
  it('피니싱 옮기기: 꼬리표가 새 통 원액으로 따라간다', () => {
    const s0 = load();
    const k = s0.inventory.casks.find((c) => c.id === 'K388')!;
    k.contents!.volumeL = 150; // 버번 200L에 들어가게
    const to = s0.inventory.casks.find((c) => !c.contents && c.typeId === 'ex_bourbon_barrel' && !c.contaminationKnown)!;
    const r = applyAction(s0, { type: 'transferCask', fromCaskId: 'K388', toCaskId: to.id });
    expect(r.error).toBeUndefined();
    expect(r.state.inventory.casks.find((c) => c.id === to.id)!.contents!.knownTaint).toEqual({ kind: 'tca', share: 1 });
  });
  it('모르는 오염은 따라가지 않는다(I2) — 숨은 오염만 있는 통에서 빼면 꼬리표 없음', () => {
    const s0 = load();
    const c = s0.inventory.casks.find((x) => x.contents && !x.contamination && !x.owner && x.id !== 'K388')!;
    c.contamination = 'mold'; // 숨은 값만
    const r = applyAction(s0, { type: 'unfillCask', caskId: c.id });
    expect(r.error).toBeUndefined();
    const lot = r.state.inventory.lots.find((l) => l.name.includes(`${c.id}에서 뺌`))!;
    expect(lot.knownTaint).toBeUndefined();
    expect('knownTaint' in lot).toBe(false);
  });
  it('통입은 꼬리표를 그대로 나누고, 탱크 합치기는 LPA 몫으로 묽힌다 — 둘 다 없으면 필드 없음', () => {
    const s0 = load();
    let s = applyAction(s0, { type: 'unfillCask', caskId: 'K388' }).state;
    const lot = s.inventory.lots.find((l) => l.name.includes('K388에서 뺌'))!;
    const empty = s.inventory.casks.find((c) => !c.contents && c.typeId === 'ex_bourbon_barrel' && !c.contaminationKnown)!;
    s = applyAction(s, { type: 'fillCasks', lotId: lot.id, caskIds: [empty.id], entryAbv: 0.6 }).state;
    expect(s.inventory.casks.find((c) => c.id === empty.id)!.contents!.knownTaint).toEqual({ kind: 'tca', share: 1 });
    const base: SpiritLot = { ...lot, volumeL: 100, abv: 0.6 };
    const clean: SpiritLot = { ...lot, knownTaint: undefined, volumeL: 300, abv: 0.6 };
    delete (clean as Partial<SpiritLot>).knownTaint;
    expect(mergeIntoTank(base, clean, 'R', '1월').knownTaint).toEqual({ kind: 'tca', share: 0.25 });
    const merged = mergeIntoTank(clean, { ...clean }, 'R', '1월');
    expect('knownTaint' in merged).toBe(false);
  });
  it('옛 판(legacy-v15)은 꼬리표를 만들지 않는다', () => {
    const s0 = load();
    s0.rulesVersion = 'legacy-v15';
    const r = applyAction(s0, { type: 'unfillCask', caskId: 'K388' });
    expect(r.error).toBeUndefined();
    expect('knownTaint' in r.state.inventory.lots.find((l) => l.name.includes('K388에서 뺌'))!).toBe(false);
  });
});
