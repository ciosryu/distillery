import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import { applyAction, type GameState } from '../sim';
import { buyRows } from './panels/Production';

// 오너(10차 시작): "구매 탭에서 발주하면 … 발주버튼이 사라지게 하는 동시에 취소선을 사용하여 이미 구매했음을 알수있게해"
const load = (): GameState => {
  const r = parsePlayFile(readFileSync('docs/playtest/9/distillery-mvp-standard-y14m4-202611250055.json', 'utf8')); if ('error' in r) throw new Error(r.error);
  return r.save;
};

describe('설비 구매 줄 — 이미 산 시설', () => {
  it('한 번만 사는 시설은 산 뒤 done · 맨 아래 · 다시 발주하면 sim이 거절한다', () => {
    const s = load();
    const rows = buyRows(s);
    const basic = rows.find((r) => r.d.id === 'visitor_basic')!;
    expect(basic.done).toBe(true);
    const firstDone = rows.findIndex((r) => r.done);
    expect(firstDone).toBeGreaterThan(0);
    expect(rows.slice(firstDone).every((r) => r.done)).toBe(true); // 산 것은 모두 아래
    expect(applyAction(s, { type: 'buyEquipment', catalogId: 'visitor_basic' }).error).toMatch(/이미 있습니다/);
  });
  it('여러 개 사는 설비(증류기 · 발효조 · 숙성고)는 막지 않는다 — 「보유 n」만', () => {
    const s = load();
    for (const r of buyRows(s).filter((x) => x.d.kind === 'still' || x.d.kind === 'fermenter' || x.d.kind === 'warehouse')) expect(r.done).toBe(false);
    const owned = buyRows(s).filter((r) => !r.done && r.owned.length > 0);
    expect(owned.length).toBeGreaterThan(0);
  });
  it('발주한 달에 바로 done(공사 중)으로 내려간다', () => {
    const s = load();
    const id = buyRows(s).find((r) => !r.done && (r.d.kind === 'visitor' || r.d.kind === 'facility') && (() => { const req = 'requires' in r.d ? r.d.requires : undefined; return !req || s.production.equipment.some((e) => e.catalogId === req); })())!.d.id;
    const next = applyAction(s, { type: 'buyEquipment', catalogId: id }).state;
    const row = buyRows(next).find((r) => r.d.id === id)!;
    expect(row.done).toBe(true);
    expect(row.owned.every((e) => e.readyMonth > next.month)).toBe(true);
  });
});
