import { describe, expect, it } from 'vitest';
import { advanceMonths, newGame } from './index';
import { EVENT } from './content/events';
import { MACRO_CATEGORIES, macroWarnings } from './events';
import { macroDetect, macroForecast } from './earlyWarning';

// ENG-3 매크로 이벤트 조기 경보 (#189) — 파트 MGT

describe('매크로 이벤트 조기 경보 (#189)', () => {
  it('ENG-3를 연구하지 않으면 없고, 연구하면 목록이 나온다 (상태는 그대로)', () => {
    expect(macroForecast(newGame({ seed: 1 }))).toBeNull();
    const s = newGame({ seed: 1 });
    s.research.unlocked.push('ENG-3');
    const before = structuredClone(s);
    expect(Array.isArray(macroForecast(s))).toBe(true);
    expect(s).toEqual(before);
  });

  it('감지율 100%면 경보 대부분이 실제로 일어나고, 일어난 거시 이벤트 대부분을 미리 잡는다 (40시드 × 12개월 창)', () => {
    let warned = 0; let hit = 0; let occurred = 0; let caught = 0;
    for (let seed = 1; seed <= 40; seed++) {
      let s = advanceMonths(newGame({ seed, startingCash: 5_000_000_000 }), 12);
      const w = macroWarnings(s, 3, 1);
      const start = s.month;
      s = advanceMonths(s, 3);
      const fired = Object.entries(s.events.lastFired).filter(([id, m]) => m >= start && m < start + 3 && MACRO_CATEGORIES.includes(EVENT[id]!.category));
      warned += w.length;
      hit += w.filter((x) => s.events.lastFired[x.defId] === x.month).length;
      occurred += fired.length;
      caught += fired.filter(([id, m]) => w.some((x) => x.defId === id && x.month === m)).length;
    }
    expect(warned).toBeGreaterThan(20);
    expect(hit / warned).toBeGreaterThan(0.6); // 정밀도 — 월 상한·조건 변화로 빗나간다
    expect(caught / occurred).toBeGreaterThan(0.8); // 재현율 — 조건이 나중에 생긴 이벤트는 못 잡는다
  });

  it('감지율이 낮으면 경보가 높을 때의 부분집합이다 (같은 조짐이 깜빡이지 않는다), 행정 스탯 100이면 감지율 상한 90%', () => {
    const s = advanceMonths(newGame({ seed: 3, startingCash: 5_000_000_000 }), 12);
    const all = macroWarnings(s, 3, 1).map((x) => `${x.defId}@${x.month}`);
    const some = macroWarnings(s, 3, 0.6).map((x) => `${x.defId}@${x.month}`);
    for (const k of some) expect(all).toContain(k);
    expect(macroDetect(s)).toBeCloseTo(0.6, 10);
    s.hr.staff.push({ id: 'O', name: '사무', role: 'office', level: 1, xp: 0, stats: { a: 50, b: 50, c: 100 }, salary: 3_000_000, hiredMonth: 0, ageAtHire: 40 });
    expect(macroDetect(s)).toBeCloseTo(0.9, 10);
  });
});
