// [제안 P-ARCH-66] 품절 + 병입할 원액이 있으면 warn (7차 끝: 전 제품 품절이 info로 가장 약하게 보였다)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GameState } from '../sim';
import { parsePlayFile } from '../store/playlog';
import { bottleableNow, monthTodos } from './alerts';

const load = (f: string): GameState => { const r = parsePlayFile(readFileSync(f, 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };
const P7END = 'docs/playtest/7/distillery-mvp-standard-y13m12-202611201440.json';

describe('품절 등급', () => {
  it('7차 완료 세이브: 품절 + 병입할 통 33개 · 탱크 소주 → warn · 위스키 줄과 같은 통 수', () => {
    const s = load(P7END);
    const todos = monthTodos(s);
    const so = todos.find((t) => t.id === 'stockout')!;
    expect(so.level).toBe('warn');
    expect(so.text).toMatch(/병입할 통 33개 · 탱크 소주 5,423L 병입 가능/);
    expect(bottleableNow(s).ready).toBe(33);
    expect(todos.find((t) => t.id === 'whisky')!.text).toMatch(/통 33개를 병입할 수 있다/);
  });
  it('품절이어도 병입할 원액이 없으면 info 그대로', () => {
    const s = load(P7END);
    for (const c of s.inventory.casks) if (c.contents && (c.contents.kind === 'malt' || c.contents.kind === 'grain')) c.contents = { ...c.contents, oakMonths: 0 };
    s.inventory.lots = s.inventory.lots.filter((l) => l.kind !== 'soju');
    const so = monthTodos(s).find((t) => t.id === 'stockout')!;
    expect(so.level).toBe('info');
    expect(so.text).not.toMatch(/병입할 통/);
  });
});
