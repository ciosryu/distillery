// [P10-1 U5] 증류기 형태(스타일)는 위스키 원액에만 — 소주 원액 · 탱크 이름에 「라이트」가 붙지 않고, 이미 「라이트」가 붙은 소주 제품의 자동 납품도 멈추지 않는다 (10차 153개월 세이브)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { advanceMonth } from './step';
import { autoRestockSources, recipeFilter } from './economics';
import type { GameState } from './types';

const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/10/distillery-mvp-standard-y13m10-202611270816.json', 'utf8')).save)!;

describe('[P10-1 U5] 소주에는 증류기 형태를 남기지 않는다', () => {
  it('한 달 진행: 새 소주 원액은 형태 · 「라이트」 이름이 없고, 새 몰트 · 그레인 원액은 그대로 형태가 있다', () => {
    const before = load();
    const ids = new Set(before.inventory.lots.map((l) => l.id));
    const s = advanceMonth(before);
    const fresh = s.inventory.lots.filter((l) => l.createdMonth === before.month);
    const soju = fresh.filter((l) => l.kind === 'soju' && !ids.has(l.id));
    expect(soju.length).toBeGreaterThan(0);
    for (const l of soju) { expect(l.stillShape).toBeUndefined(); expect(l.name).not.toMatch(/라이트/); }
    const whisky = s.inventory.lots.filter((l) => (l.kind === 'malt' || l.kind === 'grain') && l.oakMonths === 0 && l.stillShape);
    expect(whisky.length).toBeGreaterThan(0);
  });
  it('「라이트」가 붙은 소주 제품(10차 세이브)도 형태 없는 새 소주 원액으로 자동 납품된다', () => {
    const s = load();
    const oak = s.commerce.products.find((p) => p.name === '김포 오크소주')!;
    expect(oak.stillStyle).toBe('light');
    for (const c of s.inventory.casks) if (c.contents?.kind === 'soju') delete c.contents.stillShape;
    expect(autoRestockSources(s, oak).length).toBeGreaterThan(0);
    const keep = recipeFilter(oak);
    const cask = s.inventory.casks.find((c) => c.contents?.kind === 'soju' && c.contents.recipeId)!;
    expect(keep(cask.contents!)).toBe(true);
  });
  it('위스키 원액은 지금처럼 스타일로 가른다', () => {
    const s = load();
    const p = s.commerce.products.find((x) => x.name === '김포 더 퍼스트')!;
    const malt = s.inventory.casks.find((c) => c.contents?.kind === 'malt' && c.contents.stillShape)!;
    expect(recipeFilter(p)(malt.contents!)).toBe(true);
    expect(recipeFilter({ ...p, stillStyle: 'heavy' })(malt.contents!)).toBe(false);
  });
});
