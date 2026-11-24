// [결정 #372] 시나리오 — PM 요청(2026-11-24): 봇이 자동 통입을 쓰지 않으므로 9차 세이브에서 기능을 켜고 진행해 확인한다
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyAction } from './index';
import { migrateSave } from './migrate';
import { advanceMonth } from './step';
import { autoFillPlan } from './autoFill';
import { CASKS } from './content/catalog';
import type { GameState } from './types';

const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y6m5-202611240759.json', 'utf8')).save)!;
const fullIds = (s: GameState) => new Set(s.inventory.casks.filter((c) => c.contents).map((c) => c.id));

describe('#372 시나리오 — 9차 세이브(탱크 몰트 · 그레인 1,388L 대기)', () => {
  it('생산 지시를 모두 끄고 자동 통입을 켜 3개월: 새로 찬 통은 모두 꽉 찬다(덜 찬 통 0) · 끝자리는 탱크에 남는다', () => {
    let s = load();
    for (const o of s.production.orders) o.batchesPerMonth = 0;
    s = applyAction(s, { type: 'setAutoFill', settings: {} }).state;
    const before = fullIds(s);
    for (let m = 0; m < 3; m++) s = advanceMonth(s);
    const fresh = s.inventory.casks.filter((c) => c.contents && !before.has(c.id));
    expect(fresh.length).toBeGreaterThan(0);
    // 꽉 채운 뒤 증발(한여름 몇 %)만큼만 준다 — 덜 채운 통(옛 판 끝자리)은 대개 60% 아래였다
    for (const c of fresh) expect(c.contents!.volumeL / CASKS[c.typeId].sizeL).toBeGreaterThan(0.9);
    const tank = s.inventory.lots.filter((l) => (l.kind === 'malt' || l.kind === 'grain') && !l.sourced && l.oakMonths === 0);
    // 남은 탱크 원액은 빈 통 하나를 꽉 채우지 못하는 끝자리뿐(빈 통이 남아 있는 한)
    if (s.inventory.casks.some((c) => !c.contents && CASKS[c.typeId].sizeL <= 200)) for (const l of tank) expect(l.volumeL).toBeLessThan((200 * 0.635) / l.abv + 1e-6);
  });
  it('옛 판(legacy-v15)이었다면 같은 조건에서 마지막 통을 덜 채운다 — 차이가 실제로 나는 자리', () => {
    const s = load();
    for (const o of s.production.orders) o.batchesPerMonth = 0;
    const cfg = {};
    const v16 = autoFillPlan(s, cfg);
    s.rulesVersion = 'legacy-v15';
    const old = autoFillPlan(s, cfg);
    expect(v16.reduce((t, x) => t + x.heldL, 0)).toBeGreaterThan(0);
    expect(old.reduce((t, x) => t + x.heldL, 0)).toBe(0);
    expect(old.reduce((t, x) => t + x.caskIds.length, 0)).toBeGreaterThan(v16.reduce((t, x) => t + x.caskIds.length, 0));
  });
});
