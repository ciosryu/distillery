// PROD 연동 할 일 (7차 판 뒤) — 생산 되돌리기(#725) · 소주 과잉(#728) · 자동 통입 줄로 이동(#729). 화면만 읽는다
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GameState } from '../sim';
import { parsePlayFile } from '../store/playlog';
import { AUTOFILL_ROW_ANCHOR, monthTodos, TODO_ORDER } from './alerts';
import { AUTOFILL_ANCHOR } from './panels/AutoFill';

const load = (f: string): GameState => { const r = parsePlayFile(readFileSync(f, 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };
const P7END = 'docs/playtest/7/distillery-mvp-standard-y13m12-202611201440.json';
const todo = (s: GameState, id: string) => monthTodos(s).find((t) => t.id === id);

describe('PROD 연동 할 일 — 7차 완료 세이브', () => {
  it('생산 되돌리기: 줄인 지 n개월 · 위스키 바닥이라 danger · 생산 지시로', () => {
    const t = todo(load(P7END), 'cutback')!;
    expect(t.level).toBe('danger');
    expect(t.text).toMatch(/^몰트·그레인을 줄인 지 \d+개월 — 지금 월 \d+배치\(줄이기 전 \d+배치\) · 현금은 고정비 \d+개월 치/);
    expect(t.target).toEqual({ anchor: 'mvp-orders' });
  });
  it('소주 과잉(soju-glut): 탱크까지 세면 12개월 치↑ → warn · 기존 soju 줄과 따로', () => {
    const s = load(P7END);
    const t = todo(s, 'soju-glut')!;
    expect(t.level).toBe('warn');
    expect(t.text).toMatch(/^병입하지 않은 소주까지 4\d개월 치 — 탱크 5,423L/);
    expect(TODO_ORDER.indexOf('soju-glut')).toBe(TODO_ORDER.indexOf('defense') - 1);
    // 화면 순서: warn 소주 과잉이 info 줄(방재·위스키 재고·샘플)보다 위 — PM 대조에서 info 두 줄 뒤에 놓였다
    const ids = monthTodos(s).map((x) => x.id);
    for (const info of ['defense', 'whisky', 'soju', 'sample']) if (ids.includes(info)) expect(ids.indexOf('soju-glut')).toBeLessThan(ids.indexOf(info));
  });
  it('TODO_ORDER 꼬리는 info만 내는 id — warn·danger가 info 뒤에 묻히지 않는다', () => {
    expect(TODO_ORDER.slice(-7)).toEqual(['defense', 'whisky', 'soju', 'idle-cash', 'onggi-idle', 'reserve-tannin', 'sample']); // #385 idle-cash · #425 onggi-idle · #411 reserve-tannin도 info만
  });
  it('7차 완료 세이브: warn·danger 줄이 info 꼬리(방재·위스키·소주·샘플)보다 모두 위', () => {
    const tail = new Set(['defense', 'whisky', 'soju', 'idle-cash', 'onggi-idle', 'reserve-tannin', 'sample']);
    const rows = monthTodos(load(P7END));
    const firstTail = rows.findIndex((r) => tail.has(r.id));
    expect(firstTail).toBeGreaterThan(-1);
    expect(rows.slice(firstTail).every((r) => r.level === 'info')).toBe(true);
  });
  it('통입 대기 할 일은 자동 통입 줄로 이동(+ 바로 켜기 버튼) · 앵커는 PROD AutoFill과 같은 값', () => {
    const t = todo(load(P7END), 'fill')!;
    expect(t.target).toEqual({ anchor: AUTOFILL_ROW_ANCHOR });
    expect(t.quick?.label).toBe('자동 통입 켜기');
    expect(AUTOFILL_ROW_ANCHOR).toBe(AUTOFILL_ANCHOR);
  });
});
