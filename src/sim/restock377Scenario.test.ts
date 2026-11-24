// [결정 #377] 시나리오 — PM 요청(2026-11-24): 봇이 섞인 레시피 보충을 하지 않으므로 9차 세이브 「블랜디드 퍼스트 배치」(R8 · R9 · R94)를 실제로 보충해 확인한다
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyAction } from './index';
import { migrateSave } from './migrate';
import type { BlendComponent } from './blending';
import type { GameState } from './types';

const load = (): GameState => {
  const s = migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y6m5-202611240759.json', 'utf8')).save)!;
  const p = s.commerce.products.find((x) => x.id === 'P327')!;
  p.qualityKnown = { ...p.qualityKnown!, est: 66, sigma: 3, reviews: 9 }; // 리뷰로 좁힌 추정(9차에서 #346으로 잃기 전의 꼴)
  return s;
};
const restock = (s: GameState, components: BlendComponent[]) => {
  const r = applyAction(s, { type: 'bottle', components, options: { name: '', targetAbv: 0.4, bottleMl: 700, chillFilter: true, packagingId: 'standard', restockId: 'P327' } });
  expect(r.error).toBeUndefined();
  return r.state.commerce.products.find((x) => x.id === 'P327')!.qualityKnown!;
};
const cask = (id: string, liters = 60): BlendComponent => ({ source: 'cask', id, liters });

describe('#377 시나리오 — 9차 「블랜디드 퍼스트 배치」 보충', () => {
  it('(1) 부분집합(R8 K12 + R94 K65): 리뷰 9건을 잇는다', () => {
    const k = restock(load(), [cask('K12'), cask('K65')]);
    expect(k.reviews).toBeGreaterThanOrEqual(9);
  });
  it('(2) 목록에 없던 레시피가 섞이면(R8 + 새 R77): 리뷰를 잇되 (1)보다 오차가 넓다', () => {
    const a = restock(load(), [cask('K12'), cask('K65')]);
    const s = load();
    s.inventory.casks.find((c) => c.id === 'K65')!.contents!.recipeId = 'R77'; // 같은 그레인 통을 새 레시피로 — 몫만 다르게
    const b = restock(s, [cask('K12'), cask('K65')]);
    expect(b.reviews).toBeGreaterThanOrEqual(9);
    expect(b.sigma).toBeGreaterThan(a.sigma);
  });
  it('(3) 겹치는 레시피가 없으면(새 R77 · R78만): 잇지 않는다 — 리뷰는 남은 재고 몫만큼', () => {
    const s = load();
    s.inventory.casks.find((c) => c.id === 'K65')!.contents!.recipeId = 'R77';
    s.inventory.casks.find((c) => c.id === 'K12')!.contents!.recipeId = 'R78';
    const k = restock(s, [cask('K12'), cask('K65')]);
    expect(k.reviews).toBeLessThan(9);
  });
});
