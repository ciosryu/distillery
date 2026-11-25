// [결정 #399 · #386 ④] 알리기 — 손 보충이 잦은 위스키에 「자동 납품을 켜면」 한 줄 · 자동 납품이 연달아 못 채운 달 수(ARCH 할 일 warn이 읽는다)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { advanceMonth, applyAction } from './index';
import { AUTO_RESTOCK_STARVED_WARN, autoRestockHint, autoRestockStarvedMonths, HAND_RESTOCK_HINT, handRestockCount } from './economics';
import type { GameState, MonthReport } from './types';

// 9차 64개월 세이브 — 「김포 3년 셰리 캐스크」(P510)는 최근 12개월에 손으로 여러 번 보충했다 · 「김포 퍼스트 배치」(P298)는 0번
const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y6m5-202611240759.json', 'utf8')).save)!;

describe('#386 ④ 손 보충 횟수 · 「자동 납품을 켜면」', () => {
  it('손 보충이 문턱 이상이고 자동 납품이 꺼진 v16 위스키만 — 켜면 · 옛 판이면 보이지 않는다', () => {
    const s = load();
    const p = s.commerce.products.find((x) => x.id === 'P510')!;
    expect(handRestockCount(s, p)).toBeGreaterThanOrEqual(HAND_RESTOCK_HINT);
    expect(autoRestockHint(s, p)).toBe(true);
    expect(autoRestockHint(s, s.commerce.products.find((x) => x.id === 'P298')!)).toBe(false); // 0번
    expect(autoRestockHint(s, { ...p, autoRestock: 2 })).toBe(false);
    const old = load();
    old.rulesVersion = 'legacy-v15';
    expect(autoRestockHint(old, old.commerce.products.find((x) => x.id === 'P510')!)).toBe(false);
    expect(autoRestockHint(s, s.commerce.products.find((x) => x.category === 'soju_distilled')!)).toBe(false); // 위스키만
  });
  it('손으로 한 번 보충하면 1 늘고 · 자동 납품 보충은 세지 않는다', () => {
    let s = load();
    const p0 = s.commerce.products.find((x) => x.id === 'P298')!;
    const before = handRestockCount(s, p0);
    const cask = s.inventory.casks.filter((c) => c.contents && c.contents.kind === 'malt' && p0.recipeIds?.includes(c.contents.recipeId ?? '') && c.contents.oakMonths >= (p0.ageYears ?? 0) * 12 && !c.contaminationKnown && !c.owner && !c.handfill && !c.contents.sourced)
      .sort((a, b) => a.contents!.oakMonths - b.contents!.oakMonths)[0]!;
    const r = applyAction(s, { type: 'bottle', components: [{ source: 'cask', id: cask.id, liters: 20 }], options: { name: '', targetAbv: p0.abv, bottleMl: p0.bottleMl, chillFilter: p0.chillFiltered, packagingId: p0.packagingId, ...(p0.packaging ? { packaging: p0.packaging } : {}), restockId: p0.id } });
    expect(r.error).toBeUndefined();
    s = r.state;
    expect(handRestockCount(s, s.commerce.products.find((x) => x.id === 'P298')!)).toBe(before + 1);
    // 자동 납품으로 채운 달 — 로트는 늘어도 메모 「+n병」만큼 빼서 손 보충 수는 그대로
    const p1 = s.commerce.products.find((x) => x.id === 'P298')!;
    p1.autoRestock = 3;
    p1.stockBottles = 0;
    s = advanceMonth(s);
    const filled = s.history.reports.at(-1)!.notes.some((n) => n.startsWith('자동 납품 「김포 퍼스트 배치」 +'));
    expect(filled).toBe(true);
    expect(handRestockCount(s, s.commerce.products.find((x) => x.id === 'P298')!)).toBe(before + 1);
  });
});

describe('#386 ④ autoRestockStarvedMonths', () => {
  const rep = (month: number, notes: string[]) => ({ month, notes, expenses: {} }) as unknown as MonthReport;
  it('가장 최근 결산부터 「쓸 원액이 없어 못 채웠다」가 이어진 달 수 · 끊기면 멈춘다 · 자동 납품이 꺼져 있으면 0', () => {
    const s = load();
    const p = { ...s.commerce.products.find((x) => x.id === 'P510')!, autoRestock: 2 };
    const miss = `자동 납품 「${p.name}」 — 쓸 원액이 없어 못 채웠다 (5 ~ 9년 띠는 6통을 남기도록 정했다(지금 3통))`;
    s.history.reports = [rep(60, [miss]), rep(61, [`자동 납품 「${p.name}」 +120병`]), rep(62, [miss]), rep(63, ['다른 메모', miss]), rep(64, [miss])];
    expect(autoRestockStarvedMonths(s, p)).toBe(AUTO_RESTOCK_STARVED_WARN);
    s.history.reports.push(rep(65, []));
    expect(autoRestockStarvedMonths(s, p)).toBe(0);
    expect(autoRestockStarvedMonths(s, { ...p, autoRestock: undefined })).toBe(0);
  });
});
