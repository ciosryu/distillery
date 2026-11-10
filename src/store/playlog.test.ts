import { describe, expect, it } from 'vitest';
import { advanceMonths, newScenarioGame, SAVE_VERSION } from '../sim';
import { activeMsAt, buildDrift, freshPlaylog, parsePlayFile, withBuild, withTurns, type PlayFile } from './playlog';

// 플레이 기록 (mvp.md §7.2) — 순수한 부분만. 시계(입력·화면 보임)는 브라우저에서만 돈다

describe('플레이 기록', () => {
  it('진행으로 넘어온 달마다 그때까지의 시간·행동 수를 남긴다 (여러 달이면 같은 값으로 한 달씩)', () => {
    let l = { ...freshPlaylog(0), activeMs: 60_000, actions: 5 };
    l = withTurns(l, 0, 1);
    l = { ...l, activeMs: 180_000, actions: 9 };
    l = withTurns(l, 1, 4);
    expect(l.turns).toEqual([
      { month: 1, activeMs: 60_000, actions: 5 },
      { month: 2, activeMs: 180_000, actions: 9 },
      { month: 3, activeMs: 180_000, actions: 9 },
      { month: 4, activeMs: 180_000, actions: 9 },
    ]);
    expect(withTurns(l, 4, 4)).toBe(l); // 달이 안 넘어가면 그대로
    expect(activeMsAt(l, 3)).toBe(180_000);
    expect(activeMsAt(l, 24)).toBeNull();
  });

  it('기록 파일과 세이브 JSON을 모두 읽는다 — 옛 버전은 올리고, 아니면 오류', () => {
    const s = advanceMonths(newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 2 }), 2);
    const pl = withTurns({ ...freshPlaylog(1), activeMs: 90_000, actions: 3 }, 0, 2);
    const file: PlayFile = { kind: 'distillery-playtest', v: 1, exportedAt: '2026-11-07T00:00:00Z', playlog: pl, save: s };
    const a = parsePlayFile(JSON.stringify(file));
    expect('error' in a).toBe(false);
    if (!('error' in a)) { expect(a.save.month).toBe(2); expect(a.save.version).toBe(SAVE_VERSION); expect(a.playlog).toEqual(pl); }
    const b = parsePlayFile(JSON.stringify(s));
    expect(!('error' in b) && b.playlog).toBeNull();
    expect(parsePlayFile('not json')).toEqual({ error: 'JSON 파일이 아닙니다' });
    expect('error' in parsePlayFile(JSON.stringify({ hello: 1 }))).toBe(true);
  });

  it('빌드가 바뀐 달을 남긴다 — 같은 빌드면 그대로 (#227, 4차: 페이지를 다시 열 때 빌드가 말없이 바뀌었다)', () => {
    let l = withBuild(freshPlaylog(0), 'aaa1111', 0, 1);
    expect(withBuild(l, 'aaa1111', 5, 2)).toBe(l);
    l = withBuild(l, 'bbb2222', 20, 3);
    expect(l.builds).toEqual([{ build: 'aaa1111', month: 0, at: 1 }, { build: 'bbb2222', month: 20, at: 3 }]);
    // 옛 기록(빌드 없음)도 그대로 읽힌다
    expect(withBuild(freshPlaylog(0), 'x', 3, 0).builds).toEqual([{ build: 'x', month: 3, at: 0 }]);
  });

  it('판 도중 빌드 변경 경고 (#241) — 기준은 확인한 빌드 → 세이브의 시작 빌드 → 기록의 첫 빌드', () => {
    const log = { builds: [{ build: 'aaa', month: 0, at: 0 }, { build: 'bbb', month: 27, at: 1 }] };
    expect(buildDrift(log, 'aaa', 'bbb')).toEqual({ from: 'aaa', to: 'bbb', sinceMonth: 27 });
    expect(buildDrift(log, undefined, 'bbb')).toEqual({ from: 'aaa', to: 'bbb', sinceMonth: 27 }); // 옛 세이브 — 기록의 첫 빌드
    expect(buildDrift(log, 'bbb', 'bbb')).toBeNull();
    expect(buildDrift({ ...log, buildAck: 'bbb' }, 'aaa', 'bbb')).toBeNull(); // "이 빌드로 계속"을 눌렀다
    expect(buildDrift({ ...log, buildAck: 'bbb' }, 'aaa', 'ccc')).toEqual({ from: 'bbb', to: 'ccc', sinceMonth: null }); // 또 바뀌면 다시
    expect(buildDrift({}, undefined, 'x')).toBeNull(); // 기준을 모른다
  });
});
