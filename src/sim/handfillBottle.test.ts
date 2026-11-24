// 핸드필 지정 통을 병입으로 비우면 결과 메시지에 남긴다 (9차 중간 기록 — 지정 통이 메모 없이 끝났다, PM 2026-11-24)
import { describe, expect, it } from 'vitest';
import { applyAction, newGame, type Flavor } from '.';
import { emptyCaskOf } from './newGame';

const F: Flavor = { fresh_fruit: 30, vanilla_caramel: 35, integration: 40 };
const opts = { name: 't', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };

function withHandfill(volumeL: number) {
  const s = newGame({ seed: 3, startingCash: 50_000_000_000 });
  const c = emptyCaskOf(s, 'ex_bourbon_barrel');
  c.contents = { id: 'H', name: 'H', kind: 'malt', volumeL, abv: 0.6, flavor: { ...F }, createdMonth: 0, oakMonths: 48, sourced: false, costPerLPA: 10_000 };
  c.filledMonth = 0;
  c.handfill = true;
  s.inventory.casks.push(c);
  return { s, id: c.id };
}

describe('핸드필 통을 병입에 쓰면', () => {
  it('다 써서 비우면 "핸드필 통 …이 병입으로 비었다" 메시지 — 소식 창 패턴(^핸드필 .*비었다)에 맞는 문구', () => {
    const { s, id } = withHandfill(150);
    const r = applyAction(s, { type: 'bottle', components: [{ source: 'cask', id, liters: 150 }], options: opts });
    expect(r.error).toBeUndefined();
    expect(r.message).toContain(`핸드필 통 ${id}이 병입으로 비었다`);
    expect(r.message!.split(' · ').some((m) => /^핸드필 .*비었다/.test(m))).toBe(true);
  });
  it('일부만 쓰면 메시지 없음(통에 원액이 남아 핸드필이 이어진다)', () => {
    const { s, id } = withHandfill(150);
    const r = applyAction(s, { type: 'bottle', components: [{ source: 'cask', id, liters: 50 }], options: opts });
    expect(r.message ?? '').not.toContain('핸드필 통');
  });
});
