import { describe, expect, it } from 'vitest';
import { advanceMonth, newGame, type GameState } from './index';
import { forecastSigma, priceForecast, truePricePath } from './forecast';

// ENG-3 공급망 예측 (#188) — 파트 MGT

const withEng3 = (seed = 1): GameState => { const s = newGame({ seed, startingCash: 5_000_000_000 }); s.research.unlocked.push('ENG-3'); return s; };

describe('가격 예측 (#188)', () => {
  it('미래 경로 식이 실제 월 진행(step.ts 8단계)과 정확히 같다 — 식이 어긋나면 여기서 깨진다', () => {
    let s = newGame({ seed: 7 });
    const path = truePricePath(s, 3);
    for (let k = 0; k < 3; k++) {
      s = advanceMonth(s);
      expect(s.world.priceIndex).toEqual(path[k]);
    }
  });

  it('ENG-3를 연구하지 않으면 예측이 없고, 연구하면 3개월 범위가 나온다 (상태는 그대로)', () => {
    expect(priceForecast(newGame({ seed: 1 }))).toBeNull();
    const s = withEng3();
    const before = structuredClone(s);
    const f = priceForecast(s)!;
    expect(s).toEqual(before);
    const pts = f.malt_unpeated!;
    expect(pts.map((p) => p.month)).toEqual([s.month + 1, s.month + 2, s.month + 3]);
    for (const p of pts) expect(p.low).toBeLessThan(p.mid), expect(p.mid).toBeLessThan(p.high);
    expect(pts[2]!.high / pts[2]!.low).toBeGreaterThan(pts[0]!.high / pts[0]!.low); // 멀수록 넓다
  });

  it('사무직 행정 스탯이 높을수록 범위가 좁다', () => {
    const s = withEng3();
    const none = forecastSigma(s, 1);
    s.hr.staff.push({ id: 'O', name: '사무', role: 'office', level: 1, xp: 0, stats: { a: 50, b: 50, c: 100 }, salary: 3_000_000, hiredMonth: 0, ageAtHire: 40 });
    expect(forecastSigma(s, 1)).toBeCloseTo(none * 0.5, 10);
  });

  it('90% 범위가 실제 값을 대략 90% 담는다 (40시드 × 원료 × 3개월)', () => {
    let inside = 0; let total = 0;
    for (let seed = 1; seed <= 40; seed++) {
      let s = withEng3(seed);
      const f = priceForecast(s)!;
      for (let k = 1; k <= 3; k++) {
        s = advanceMonth(s);
        for (const [key, pts] of Object.entries(f)) {
          const real = s.world.priceIndex[key]!; // 이벤트 보정 없는 판(새 게임 3개월)
          const p = pts[k - 1]!;
          total++;
          if (real >= p.low && real <= p.high) inside++;
        }
      }
    }
    expect(inside / total).toBeGreaterThan(0.8);
    expect(inside / total).toBeLessThan(0.98);
  });
});
