import { describe, expect, it } from 'vitest';
import { advanceMonths, isGated, isUnlocked, migrateSave, newGame, SAVE_VERSION, unlockingNodes } from '.';
import fixture from './fixtures/save-v5.json';

// v5 세이브 픽스처는 리팩터 전 코드로 만들었다. expectedAfter6 = 옛 코드로 6개월 더 진행한 결과.
// 마이그레이션이 손실 없이 옮겼다면, v6 코드로 6개월 진행한 결과가 같아야 한다.

describe('세이브 마이그레이션 (결정 #95)', () => {
  it('v5 세이브를 v6로 올리고, 옛 코드와 같은 결과로 이어서 진행한다', () => {
    const s = migrateSave(structuredClone(fixture.save));
    expect(s).not.toBeNull();
    expect(s!.version).toBe(SAVE_VERSION);
    const t = advanceMonths(s!, 6);
    const e = fixture.expectedAfter6;
    expect(t.month).toBe(e.month);
    expect(t.finance.cash).toBe(e.cash);
    expect(t.nextId).toBe(e.nextId);
    expect(t.inventory.casks.filter((c) => c.contents).length).toBe(e.filledCasks);
    expect(t.inventory.lots.length).toBe(e.lots);
    expect(t.commerce.products.length).toBe(e.products);
    expect(t.hr.staff.length).toBe(e.staff);
    expect(t.events.log.length).toBe(e.events);
    expect(Math.round(t.history.reports.at(-1)!.angelsShareL * 1000) / 1000).toBe(e.angels);
  });

  it('입지 특성(#86) 이전 v5 세이브는 빠진 필드를 채운다', () => {
    const { siteState: _a, retailOffers: _b, retailContracts: _c, oemOffers: _d, oemContracts: _e, receivables: _f, ...old } = structuredClone(fixture.save) as Record<string, unknown>;
    const s = migrateSave(old)!;
    expect(s.site).toEqual({});
    expect(s.finance.receivables).toEqual([]);
    expect(s.commerce.retailOffers).toEqual([]);
    expect(advanceMonths(s, 2).month).toBe(s.month + 2);
  });

  it('입력을 바꾸지 않는다 (순수 함수)', () => {
    const raw = structuredClone(fixture.save);
    const before = JSON.stringify(raw);
    migrateSave(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('현재 버전은 그대로, 미래 버전·형식 오류는 null', () => {
    const g = newGame({ seed: 1 });
    expect(migrateSave(g)).toBe(g);
    expect(migrateSave({ ...g, version: 99 })).toBeNull();
    expect(migrateSave(null)).toBeNull();
    expect(migrateSave({ version: 4 })).toBeNull();
  });
});

describe('테크 게이트 isUnlocked (tech-tree §7)', () => {
  it('Phase 1은 게이트가 꺼져 있어 모든 행동이 열려 있다', () => {
    const s = newGame({ seed: 1 });
    expect(isUnlocked(s, 'action:rotateWarehouse')).toBe(true);
    expect(isUnlocked(s, 'action:setOrder')).toBe(true);
  });

  it('게이트를 켜면 노드가 해금한 키만 열린다', () => {
    const s = newGame({ seed: 1 });
    expect(isGated('action:rotateWarehouse')).toBe(true);
    expect(isGated('action:setOrder')).toBe(false);
    expect(isUnlocked(s, 'action:rotateWarehouse', true)).toBe(false);
    expect(isUnlocked(s, 'action:setOrder', true)).toBe(true);
    expect(isUnlocked({ research: { ...s.research, unlocked: ['MAT-3a'] } }, 'action:rotateWarehouse', true)).toBe(true);
    expect(unlockingNodes('action:sellCaskOwnership').map((n) => n.id)).toEqual(['BIZ-1b']);
  });
});
