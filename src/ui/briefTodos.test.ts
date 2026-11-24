import { describe, expect, it } from 'vitest';
import { briefTodos, type Todo } from './alerts';

// [결정 #373] 소식 창 「새 할 일」 — 지난번에 본 warn · danger에 없던 것만 · 계속인 것은 개수 · info는 넣지 않는다
const td = (id: string, level: Todo['level']): Todo => ({ id, level, text: `${id} — 설명`, action: '가기', target: { tab: 'home' } as never });

describe('briefTodos', () => {
  const now = [td('handfill', 'warn'), td('fill', 'warn'), td('cash', 'danger'), td('sample', 'info')];
  it('처음(본 기록 없음)이면 warn · danger 전부가 새것 · info 빠짐', () => {
    expect(briefTodos(now, null)).toEqual({ fresh: now.slice(0, 3), continuing: 0 });
  });
  it('지난번에 본 것은 개수만 — 새로 생긴 것만 fresh', () => {
    const r = briefTodos(now, ['fill', 'sample']);
    expect(r.fresh.map((t) => t.id)).toEqual(['handfill', 'cash']);
    expect(r.continuing).toBe(1);
  });
});
