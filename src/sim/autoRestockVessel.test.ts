// [결정 #369] 옹기 · 오크에서 쉰 원액으로 만든 소주 제품(숙성 표기 6개월 미만)의 자동 납품은 탱크가 아니라 같은 용기의 통에서 채운다 (v16만)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { advanceMonth } from './step';
import { newScenarioGame } from './newScenario';
import { emptyCaskOf } from './newGame';
import { autoRestockSources, autoRestockVesselNeed } from './economics';
import type { GameState, Product, SpiritLot } from './types';

const soju = (id: string, extra: Partial<SpiritLot> = {}): SpiritLot => ({ id, name: id, kind: 'soju', volumeL: 300, abv: 0.48, flavor: { fresh_fruit: 20 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 5000, recipeId: 'RX', ...extra });

function setup(rules: 'v16' | 'legacy-v15', withJar = true) {
  const s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 1 });
  s.rulesVersion = rules;
  s.inventory.lots.push(soju('TANK'));
  if (withJar) {
    const jar = emptyCaskOf(s, 'onggi_jar');
    jar.contents = soju('JAR', { restMonths: 3 });
    s.inventory.casks.push(jar);
  }
  const p = { id: 'P1', name: '옹기소주', category: 'soju_distilled', abv: 0.25, bottleMl: 375, restMonths: 2, oakMonths: 0, recipeIds: ['RX'], stockBottles: 0 } as unknown as Product;
  return { s, p };
}

describe('#369 용기에서 쉰 소주 제품의 자동 납품 원액', () => {
  it('v16: 옹기 2개월 제품은 옹기에서 2개월 이상 쉰 통에서 채운다(탱크 아님)', () => {
    const { s, p } = setup('v16');
    const src = autoRestockSources(s, p);
    expect(src.length).toBe(1);
    expect(src[0]!.comp.source).toBe('cask');
  });
  it('v16: 옹기 통이 없으면 탱크로 대신하지 않는다', () => {
    const { s, p } = setup('v16', false);
    expect(autoRestockSources(s, p)).toEqual([]);
  });
  it('옛 판(legacy-v15)은 지금대로 탱크 원액 — X0L 바이트 동일', () => {
    const { s, p } = setup('legacy-v15');
    const src = autoRestockSources(s, p);
    expect(src.map((x) => x.comp.source)).toEqual(['lot']);
  });
  it('용기에서 쉬지 않은 제품(옹기 · 오크 0개월)은 v16에서도 탱크', () => {
    const { s, p } = setup('v16');
    const src = autoRestockSources(s, { ...p, restMonths: 0 });
    expect(src.map((x) => x.comp.source)).toEqual(['lot']);
  });
  it('autoRestockVesselNeed — 화면과 같이 읽는 용기 · 개월 (표기 제품은 표기 개월, v16 용기 제품은 제품 개월)', () => {
    const { s, p } = setup('v16');
    expect(autoRestockVesselNeed(s, p)).toEqual({ vessel: 'onggi', months: 2 });
    expect(autoRestockVesselNeed(s, { ...p, restMonths: 0, oakMonths: 3 })).toEqual({ vessel: 'oak', months: 3 });
    expect(autoRestockVesselNeed(s, { ...p, restMonths: 0 })).toBeNull();
    expect(autoRestockVesselNeed({ rulesVersion: 'legacy-v15' }, p)).toBeNull();
    expect(autoRestockVesselNeed({ rulesVersion: 'legacy-v15' }, { ...p, restMonths: 26 })).toEqual({ vessel: 'onggi', months: 24 });
    expect(autoRestockVesselNeed(s, { ...p, category: 'whisky', restMonths: 0, oakMonths: 36 })).toBeNull();
  });
});

// PM 요청(2026-11-24): 봇이 이 기능을 쓰지 않으므로 기능을 실제로 켠 시나리오로 확인한다 — 9차 세이브 「김포 옹기소주」(옹기 2개월 · R4)
describe('#369 시나리오 — 9차 세이브에서 옹기소주 자동 납품을 켜고 진행', () => {
  const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y6m5-202611240759.json', 'utf8')).save)!;
  const onggiL = (s: GameState) => s.inventory.casks.filter((c) => c.typeId === 'onggi_jar' && c.contents?.recipeId === 'R4').reduce((t, c) => t + c.contents!.volumeL, 0);
  const setup = () => {
    const s = load();
    const p = s.commerce.products.find((x) => x.name === '김포 옹기소주')!;
    p.autoRestock = 3;
    p.stockBottles = 0; // 모자라게 — 그달 반드시 채운다
    return { s, id: p.id };
  };
  it('켠 달: 옹기 통에서만 채운다 — 옹기 원액이 줄고 재고가 늘며 메모에 통 id가 남는다(탱크가 아니다)', () => {
    const { s, id } = setup();
    const before = onggiL(s);
    const next = advanceMonth(s);
    const note = next.history.reports.at(-1)!.notes.find((n) => n.includes('「김포 옹기소주」'))!;
    expect(note).toMatch(/\+[\d,]+병/);
    expect(note).toMatch(/원액 K\d+/);
    expect(note).not.toContain('탱크');
    expect(onggiL(next)).toBeLessThan(before - 1);
    expect(next.commerce.products.find((x) => x.id === id)!.stockBottles).toBeGreaterThan(0);
  });
  it('경계값: 옹기 2개월 이상 쉰 통만 — 1개월 쉰 통은 쓰지 않는다', () => {
    const { s } = setup();
    const p = s.commerce.products.find((x) => x.name === '김포 옹기소주')!;
    for (const c of s.inventory.casks) if (c.typeId === 'onggi_jar' && c.contents) c.contents.restMonths = 1;
    expect(autoRestockSources(s, p)).toEqual([]);
    const k = s.inventory.casks.find((c) => c.typeId === 'onggi_jar' && c.contents)!;
    k.contents!.restMonths = 2;
    expect(autoRestockSources(s, p).map((x) => x.comp.id)).toEqual([k.id]);
  });
  it('모자랄 때: 맞는 옹기 통이 없으면 탱크로 대신하지 않고 알린다 — 재고 그대로', () => {
    const { s, id } = setup();
    for (const c of s.inventory.casks) if (c.typeId === 'onggi_jar' && c.contents) c.contents.restMonths = 0;
    const next = advanceMonth(s);
    const note = next.history.reports.at(-1)!.notes.find((n) => n.includes('「김포 옹기소주」'))!;
    expect(note).toContain('옹기에서 2개월 이상 쉰 같은 레시피 통이 필요');
    expect(next.commerce.products.find((x) => x.id === id)!.stockBottles).toBe(0);
  });
});

