// 7차 판 뒤 화면 신호 (docs/playtest/7/mgt/README.md — [제안 P-MGT-61] · 오너 답 「핵심 전문가 못봤다」). 화면만 읽는다(상태 불변)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { newScenarioGame, type GameState } from '../sim';
import { parsePlayFile } from '../store/playlog';
import { monthTodos, SPECIALIST_TODO_MONTHS, TODO_ORDER } from './alerts';

const P7 = 'docs/playtest/7/distillery-mvp-standard-y13m12-202611201440.json';
const p7 = (): GameState => { const r = parsePlayFile(readFileSync(P7, 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };
const mvp = (): GameState => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
const todo = (s: GameState, id: string) => monthTodos(s).find((t) => t.id === id);

describe('방재 할 일 (P-MGT-61)', () => {
  it('7차 완료 세이브는 최근 2년 폭설·한파를 설비 없이 겪었다 → 설비에서 짓기 · 상태 불변', () => {
    const s = p7();
    const before = JSON.stringify(s);
    const t = todo(s, 'defense')!;
    expect(JSON.stringify(s)).toBe(before);
    expect(t.level).toBe('info');
    expect(t.text).toBe('최근 2년 폭설 1회 · 한파 1회를 방재 설비 없이 겪었다 — 「내설 지붕 보강」 4,000만 · 「동파 방지·보온 설비」 3,500만이면 막는다');
    expect(t.target).toEqual({ anchor: 'mvp-equipment' });
  });

  it('설비 값을 낼 현금이 없으면 뜨지 않는다', () => {
    const s = p7();
    s.finance.cash = 30_000_000;
    expect(todo(s, 'defense')).toBeUndefined();
  });

  it('순서: 통입 대기 다음 · 위스키 병입 권고 위', () => {
    expect(TODO_ORDER.indexOf('defense')).toBe(TODO_ORDER.indexOf('fill') + 1);
    expect(TODO_ORDER.indexOf('whisky')).toBe(TODO_ORDER.indexOf('defense') + 1);
  });
});

describe('핵심 전문가 할 일 — 7차 「못봤다」 뒤 warn · 더 오래', () => {
  const opened = (month: number) => { const s = mvp(); s.month = month; s.scenario!.stagesDone = [...(s.scenario!.stagesDone ?? []), 'y11_specialist']; return s; };
  it('해금 소식(3개월) 뒤 warn으로 SPECIALIST_TODO_MONTHS개월 — 7차 판이 묻힌 124~131개월도, 판정 무렵(144개월 전)까지도 보인다', () => {
    expect(todo(opened(122), 'specialist')).toBeUndefined();
    expect(todo(opened(124), 'specialist')!.level).toBe('warn');
    expect(todo(opened(143), 'specialist')).toBeDefined();
    expect(todo(opened(123 + SPECIALIST_TODO_MONTHS), 'specialist')).toBeUndefined();
  });
});
