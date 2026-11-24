// [결정 #391] 통 이력 구간에 통 id — 피니싱 옮기기(transferCask)가 앞 통 · 새 통 id를 남긴다(선택 필드 — 옛 이력은 그대로)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyAction } from './index';
import { migrateSave } from './migrate';
import { historyAfterTransfer } from './maturation';
import type { GameState } from './types';

const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')).save)!;

describe('#391 CaskStint.caskId', () => {
  it('피니싱 옮기기: 첫 구간에 앞 통 id, 새 구간에 새 통 id', () => {
    const s0 = load();
    const from = s0.inventory.casks.find((c) => c.id === 'K12')!; // 버번 · 몰트 · 이력 없음
    expect(from.contents!.caskHistory).toBeUndefined();
    const to = s0.inventory.casks.find((c) => !c.contents && c.typeId === 'oloroso_butt' && !c.contaminationKnown)!;
    const r = applyAction(s0, { type: 'transferCask', fromCaskId: 'K12', toCaskId: to.id });
    expect(r.error).toBeUndefined();
    const h = r.state.inventory.casks.find((c) => c.id === to.id)!.contents!.caskHistory!;
    expect(h.map((x) => x.caskId)).toEqual(['K12', to.id]);
    expect(h.map((x) => x.typeId)).toEqual(['ex_bourbon_barrel', 'oloroso_butt']);
  });
  it('id를 주지 않으면 필드가 없다(옛 호출 그대로)', () => {
    const h = historyAfterTransfer({ oakMonths: 10 }, 'ex_bourbon_barrel', 'oloroso_butt', 20);
    expect(h.every((x) => !('caskId' in x))).toBe(true);
  });
  it('이미 있는 옛 이력(id 없음)은 그대로 두고 새 구간에만 id', () => {
    const s = load();
    const k675 = s.inventory.casks.find((c) => c.id === 'K675')!; // 9차: K11 → K675 피니싱(83개월) — id 없는 옛 이력
    const h = historyAfterTransfer(k675.contents!, 'oloroso_butt', 'ex_bourbon_barrel', s.month, 'K675', 'KX');
    expect(h.slice(0, 2).every((x) => !('caskId' in x))).toBe(true);
    expect(h.at(-1)!.caskId).toBe('KX');
  });
});
