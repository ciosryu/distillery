import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../../store/playlog';
import { coverage } from '../../sim/market';
import { tastingImpact } from './staffImpact';

// P-MGT-71 (다)(10차 70개월 U4) — 시음회를 맡겨 둔 동안 내내 줄어드는 유통 커버리지를 직원 카드에 숫자로. 화면 계산만(상태 불변)
const load = () => {
  const r = parsePlayFile(readFileSync('docs/playtest/10/distillery-mvp-standard-y6m11-202611261003.json', 'utf8')); if ('error' in r) throw new Error(r.error);
  return r.save;
};

describe('P-MGT-71 (다) 시음회 커버리지 풀이', () => {
  it('10차 70: 영업 1명 — 평소 업무 대 시음회 커버리지, 줄어드는 몫 약 40% · 상태 그대로', () => {
    const s = load();
    const x = s.hr.staff.find((y) => y.role === 'sales')!;
    const before = JSON.stringify(s);
    const t = tastingImpact(s, x)!;
    expect(JSON.stringify(s)).toBe(before);
    expect(t.sales).toBe(1);
    expect(x.task ?? 'routine').toBe('routine'); // 70개월에는 평소 업무 — 지금 커버리지가 곧 평소 값
    expect(t.routine).toBe(coverage(s));
    const cut = Math.round((1 - t.tasting / t.routine) * 100);
    expect(cut).toBeGreaterThanOrEqual(35);
    expect(cut).toBeLessThanOrEqual(45);
  });
  it('영업이 아니면 null', () => {
    const s = load();
    expect(tastingImpact(s, s.hr.staff.find((y) => y.role === 'distiller')!)).toBeNull();
  });
});
