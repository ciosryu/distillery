import { describe, expect, it } from 'vitest';
import { advanceMonths, isGated, isUnlocked, migrateSave, newGame, SAVE_VERSION, unlockingNodes, V5_FIELD_MAP } from '.';
import fixture from './fixtures/save-v5.json';
import { slotClimate } from './ops';
import { addWeatherShock, updateWeather, WEATHER } from './weather';
import { evapTempFactor } from './maturation';

// v5 세이브 픽스처는 리팩터 전 코드로 만들었다(옛 코드가 실제로 쓴 세이브 모양).

describe('세이브 마이그레이션 (결정 #95)', () => {
  it('v5의 모든 필드가 v6 위치에 같은 값으로 옮겨진다 (무손실)', () => {
    const raw = structuredClone(fixture.save) as Record<string, unknown>;
    const s = migrateSave(raw) as unknown as Record<string, Record<string, unknown>>;
    expect(s).not.toBeNull();
    expect(s.version).toBe(SAVE_VERSION);
    for (const [key, value] of Object.entries(raw)) {
      const to = V5_FIELD_MAP[key];
      expect(to, `v5 필드 ${key}의 v6 위치가 정의되지 않았다`).toBeDefined();
      if (key === 'version') continue;
      const got = to === 'root' ? s[key] : to![1] === undefined ? s[to![0]] : s[to![0]]![to![1]];
      expect(got, key).toEqual(value);
    }
  });

  it('옮긴 v5 세이브를 이어서 진행할 수 있다', () => {
    const s = migrateSave(structuredClone(fixture.save))!;
    const t = advanceMonths(s, 6);
    expect(t.month).toBe(s.month + 6);
    expect(t.status).toBe('running');
    // 리팩터 시점(날씨 도입 전)에는 옛 코드와 결과가 같았다 — fixture.expectedAfter6, 커밋 e1cecd7
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

describe('기상 이상치 AR(1) (결정 #97)', () => {
  it('평균 0, 표준편차 σ, 1개월 자기상관 ρ에 가깝다', () => {
    const s = newGame({ seed: 3 });
    const xs: number[] = [];
    for (let m = 0; m < 6000; m++) { s.month = m; updateWeather(s); xs.push(s.world.weather.tempAnom); }
    const n = xs.length;
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    let cov = 0;
    for (let i = 1; i < n; i++) cov += (xs[i]! - mean) * (xs[i - 1]! - mean);
    const rho = cov / (n - 1) / (sd * sd);
    expect(Math.abs(mean)).toBeLessThan(0.1);
    expect(sd).toBeCloseTo(WEATHER.tempSigma, 1);
    expect(rho).toBeCloseTo(WEATHER.rho, 1);
  });

  it('같은 시드면 같은 날씨 (결정론)', () => {
    const a = advanceMonths(newGame({ seed: 11 }), 24).history.reports.map((r) => r.weather?.tempAnom);
    const b = advanceMonths(newGame({ seed: 11 }), 24).history.reports.map((r) => r.weather?.tempAnom);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBeGreaterThan(5);
  });

  it('폭염은 결과가 아니라 외기에 +4°C 충격 — 숙성고 온도·증발이 함께 오른다', () => {
    const s = newGame({ seed: 5 });
    const cask = { slot: { w: 'W0', tier: 3 } } as never;
    const before = slotClimate(s, cask, 7);
    addWeatherShock(s, 'hw', '폭염', 4, -5, 2);
    const after = slotClimate(s, cask, 7);
    expect(after.tempC - before.tempC).toBeGreaterThan(4 * 0.95);
    expect(evapTempFactor(after.tempC) / evapTempFactor(before.tempC)).toBeGreaterThan(1.6);
    s.month = 2;
    expect(slotClimate(s, cask, 7).tempC).toBeCloseTo(before.tempC, 6); // 2개월 뒤 끝
  });
});
