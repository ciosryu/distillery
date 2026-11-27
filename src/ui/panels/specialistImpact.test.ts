import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../../store/playlog';
import { makeCandidate } from '../../sim/hr';
import { rngFor } from '../../sim/rng';
import { blenderOf, QUALITY_SIGMA_PER_HEX } from '../../sim/blendTable';
import { sampledSigma } from '../../sim/blendRadar';
import { hireImpact } from './staffImpact';

// P-MGT-73 (가)(10차 153개월): 핵심 전문가 후보 카드에 「지금 막힌 곳」을 숫자로 — 블렌더는 샘플 한 번의 품질 추정 오차, 숙성고는 지난 12개월 손실. 화면 계산만
const load = () => {
  const r = parsePlayFile(readFileSync('docs/playtest/10/distillery-mvp-standard-y6m11-202611261003.json', 'utf8')); if ('error' in r) throw new Error(r.error);
  return r.save;
};

describe('P-MGT-73 (가) 전문가 후보 카드 숫자', () => {
  it('블렌더 후보: 샘플 한 번의 품질 추정 오차 ±(대표) → ±(그 사람) — 샘플 기록이 쓰는 식과 같다 · 상태 불변', () => {
    const s = load();
    const c = makeCandidate(s, rngFor(s.seed, 120, 'specialist:blender'), 'blender', 'KS-blender');
    const before = JSON.stringify(s);
    const line = hireImpact(s, c).find((l) => l.label === '샘플 한 번의 품질 추정 오차')!;
    expect(JSON.stringify(s)).toBe(before);
    const g = { ...s, hr: { ...s.hr, staff: [...s.hr.staff, { ...c, salary: c.askSalary }] } };
    expect(line.before).toBe(`±${(sampledSigma(blenderOf(s), 0) * QUALITY_SIGMA_PER_HEX).toFixed(1)}점`);
    expect(line.after).toBe(`±${(sampledSigma(blenderOf(g), 0) * QUALITY_SIGMA_PER_HEX).toFixed(1)}점`);
    expect(line.before).toBe('±19.6점'); // 블렌더 없이 대표가 직접(10차 판 — 첫 채움 K197을 「90」으로 읽은 오차)
  });

  it('숙성고 후보(숙성고 매니저가 없을 때): 지난 12개월 누수 · 증발 손실을 보인다', () => {
    const s = load();
    const c = makeCandidate(s, rngFor(s.seed, 120, 'specialist:warehouse'), 'warehouse', 'KS-warehouse');
    const line = hireImpact(s, c).find((l) => l.label === '지난 12개월 숙성고 손실')!;
    const evap = s.history.reports.slice(-12).flatMap((r) => r.lossEvents ?? []).filter((e) => e.kind === 'evaporation').reduce((a, e) => a + e.lpa, 0);
    expect(line.before).toContain(`증발 ${Math.round(evap).toLocaleString()} LPA`);
  });
});
