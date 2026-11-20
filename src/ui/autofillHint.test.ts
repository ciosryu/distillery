// P-ARCH-65 — 손 통입이 잦으면 자동 통입 권유 · 통입 대기 줄에서 바로 켜기 (7차 판: 손 통입 405번 · 오너 "자동 통입이 어딨는지 못찾았다")
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GameState } from '../sim';
import { parsePlayFile } from '../store/playlog';
import { monthTodos } from './alerts';

const todo = (s: GameState, id: string) => monthTodos(s).find((t) => t.id === id);
describe('통입 대기 줄에서 자동 통입 바로 켜기 (7차 오너 답 "어딨는지 못찾았다" — P-ARCH-65 확장)', () => {
  it('자동 통입이 꺼져 있으면 fill 할 일에 [자동 통입 켜기](setAutoFill) · 켜져 있으면 없음', () => {
    const r = parsePlayFile(readFileSync('docs/playtest/7/distillery-mvp-standard-y6m3-202611200601.json', 'utf8'));
    if ('error' in r) throw new Error(r.error);
    const t = todo(r.save, 'fill')!;
    expect(t.quick).toMatchObject({ label: '자동 통입 켜기', action: { type: 'setAutoFill', settings: {} } });
    const on = { ...r.save, inventory: { ...r.save.inventory, autoFill: {} } } as GameState;
    expect(todo(on, 'fill')?.quick).toBeUndefined();
  });
});
