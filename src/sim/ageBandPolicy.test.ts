// [결정 #399 · #386] 위스키 재고 자동 채우기 — 통 범위(하한 ~ 상한) · 통 종류 · 연령 띠 정책. 자동 납품만 읽는다(손 병입 · 맡기기 · IB는 그대로)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { advanceMonth, applyAction } from './index';
import { newScenarioGame } from './newScenario';
import { AGE_BANDS, ageBand, agePolicyFilter, bandCounts, defaultAgePolicy, THIN_BAND_CASKS } from './ageBand';
import { autoRestockCeiling, autoRestockFloor, autoRestockShortReason, autoRestockSources, whiskyRange } from './economics';
import type { Cask, GameState } from './types';

// 9차 134개월 세이브 — 찬 통 54: 0 ~ 2년 29 · 3 ~ 4년 13 · 5 ~ 9년 3 · 10년+ 9. 진행 중 v16 세이브라 띠 정책 필드가 없다(#399 A)
const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')).save)!;
const SHERRY6 = 'P926'; // 「김포 싱글몰트 셰리 6년」 — 표기 3년(하한 36개월) · 재고 0
const ids = (s: GameState, id: string) => autoRestockSources(s, s.commerce.products.find((p) => p.id === id)!).map((x) => x.comp.id);
const oakOf = (s: GameState, id: string) => s.inventory.casks.find((c) => c.id === id)!.contents!.oakMonths;

describe('#399 띠 정책 — 기본값은 새 판에만(A)', () => {
  it('새 v16 판은 기본값(10년+ 안 씀 · 5 ~ 9년 6통 남김) · 옛 판 · 진행 중 세이브는 필드 없음', () => {
    expect(newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 1 }).inventory.agePolicy).toEqual(defaultAgePolicy());
    expect(defaultAgePolicy()).toEqual({ '10+': { auto: 'off' }, '5-9': { auto: 'keep', keep: THIN_BAND_CASKS } });
    expect(newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 1, rules: 'legacy-v15' }).inventory.agePolicy).toBeUndefined();
    expect(load().inventory.agePolicy).toBeUndefined();
  });
  it('정책이 없으면 지금 동작 그대로 — 9차 134 세이브의 셰리 6년은 9년 통(K609 · 5 ~ 9년)과 10년 통(K14)까지 내려간다', () => {
    const s = load();
    expect(ids(s, SHERRY6)).toContain('K609');
    expect(ids(s, SHERRY6)).toContain('K14');
  });
});

describe('#399 agePolicyFilter — 순수 거르기', () => {
  it('off 띠는 빼고 · keep 띠는 (띠 통 수 − k)통만 쓸 순서대로 · held에 뺀 수', () => {
    const s = load();
    const casks = s.inventory.casks.filter((c): c is Cask & { contents: NonNullable<Cask['contents']> } => !!c.contents && (c.contents.kind === 'malt' || c.contents.kind === 'grain') && !c.owner)
      .sort((a, b) => a.contents.oakMonths - b.contents.oakMonths);
    const n = bandCounts(s);
    s.inventory.agePolicy = { '3-4': { auto: 'keep', keep: 10 }, '10+': { auto: 'off' } };
    const { allowed, held } = agePolicyFilter(s, casks);
    const used = (b: string) => allowed.filter((c) => ageBand(c.contents.oakMonths) === b).length;
    expect(used('3-4')).toBe(Math.max(0, n['3-4'].casks - 10));
    expect(used('10+')).toBe(0);
    expect(used('0-2') + used('5-9')).toBe(casks.filter((c) => ['0-2', '5-9'].includes(ageBand(c.contents.oakMonths))).length);
    expect(held['10+']).toBe(casks.filter((c) => ageBand(c.contents.oakMonths) === '10+').length);
    // 쓸 순서는 그대로(어린 통부터)
    expect(allowed.map((c) => c.contents.oakMonths)).toEqual([...allowed.map((c) => c.contents.oakMonths)].sort((a, b) => a - b));
  });
  it('옛 판은 정책을 읽지 않는다', () => {
    const s = load();
    s.rulesVersion = 'legacy-v15';
    s.inventory.agePolicy = { '0-2': { auto: 'off' } };
    const casks = s.inventory.casks.filter((c): c is Cask & { contents: NonNullable<Cask['contents']> } => !!c.contents);
    expect(agePolicyFilter(s, casks).allowed.length).toBe(casks.length);
  });
});

describe('#399 9차 134 세이브 — 기본 띠 정책을 켜면', () => {
  it('셰리 6년(표기 3년)의 자동 납품이 9년 통 · 10년 통을 쓰지 않는다 — 3 ~ 4년 통만', () => {
    let s = load();
    const r = applyAction(s, { type: 'setAgePolicy', policy: defaultAgePolicy() });
    expect(r.error).toBeUndefined();
    s = r.state;
    expect(s.inventory.agePolicy).toEqual(defaultAgePolicy());
    const got = ids(s, SHERRY6);
    expect(got.length).toBeGreaterThan(0);
    for (const id of got) expect(ageBand(oakOf(s, id))).toBe('3-4'); // 5 ~ 9년은 3통(< 6) · 10년+는 끔
  });
  it('켜고 한 달 진행 — 자동 납품이 채우되 5 ~ 9년 · 10년+ 띠 통 수는 그대로', () => {
    let s = load();
    s = applyAction(s, { type: 'setAgePolicy', policy: defaultAgePolicy() }).state;
    s = applyAction(s, { type: 'setAutoRestock', productId: SHERRY6, months: 3 }).state;
    const before = bandCounts(s);
    s = advanceMonth(s);
    const note = s.history.reports.at(-1)!.notes.find((n) => n.includes('「김포 싱글몰트 셰리 6년」'));
    expect(note).toBeDefined();
    expect(note).toMatch(/\+[\d,]+병/);
    expect(s.commerce.products.find((p) => p.id === SHERRY6)!.stockBottles).toBeGreaterThan(0);
    const after = bandCounts(s);
    expect(after['5-9'].casks).toBeGreaterThanOrEqual(before['5-9'].casks); // 자동이 이 띠를 줄이지 않았다(3 ~ 4년 통이 한 달 묵어 들어올 수는 있다)
    expect(after['10+'].casks).toBeGreaterThanOrEqual(before['10+'].casks);
  });
  it('막혀서 못 채우면 사유를 메모한다 — 하한 60개월(5년↑) 제품: 5 ~ 9년 3통 < 6 · 10년+ 끔', () => {
    let s = load();
    s = applyAction(s, { type: 'setAgePolicy', policy: defaultAgePolicy() }).state;
    const r = applyAction(s, { type: 'setAutoRestock', productId: SHERRY6, months: 3, source: { vessel: 'oak', months: 60 } });
    expect(r.error).toBeUndefined();
    s = r.state;
    const p = s.commerce.products.find((x) => x.id === SHERRY6)!;
    expect(autoRestockSources(s, p)).toEqual([]);
    const why = autoRestockShortReason(s, p)!;
    expect(why).toContain('5 ~ 9년 띠는 6통을 남기도록 정했다(지금 3통)');
    expect(why).toContain('10년 이상 띠는 자동이 쓰지 않도록 정했다');
    s = advanceMonth(s);
    const note = s.history.reports.at(-1)!.notes.find((n) => n.includes('「김포 싱글몰트 셰리 6년」'))!;
    expect(note).toContain('쓸 원액이 없어 못 채웠다');
    expect(note).toContain('띠 정책');
    expect(s.commerce.products.find((x) => x.id === SHERRY6)!.stockBottles).toBe(0);
  });
  it('손 병입은 정책과 무관하다(B) — 10년 통으로 직접 병입할 수 있다', () => {
    let s = load();
    s = applyAction(s, { type: 'setAgePolicy', policy: defaultAgePolicy() }).state;
    const r = applyAction(s, { type: 'bottle', components: [{ source: 'cask', id: 'K14', liters: 20 }], options: { name: '손 병입 시험', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' } });
    expect(r.error).toBeUndefined();
  });
});

describe('#399 위스키 통 범위 · 통 종류', () => {
  it('하한 ~ 상한 · 통 종류 안의 통만, 어린 통부터 — 옛 하한(#267)은 지운다', () => {
    let s = load();
    s.commerce.products.find((p) => p.id === SHERRY6)!.autoRestockMinMonths = 40;
    const r = applyAction(s, { type: 'setAutoRestock', productId: SHERRY6, months: 2, source: { vessel: 'oak', months: 36, maxMonths: 47, caskTypes: ['ex_bourbon_barrel'] } });
    expect(r.error).toBeUndefined();
    s = r.state;
    const p = s.commerce.products.find((x) => x.id === SHERRY6)!;
    expect(p.autoRestockMinMonths).toBeUndefined();
    expect(whiskyRange(s, p)).toEqual({ vessel: 'oak', months: 36, maxMonths: 47, caskTypes: ['ex_bourbon_barrel'] });
    expect(autoRestockFloor(s, p)).toBe(36);
    expect(autoRestockCeiling(s, p)).toBe(47);
    const got = ids(s, SHERRY6);
    expect(got.length).toBeGreaterThan(0);
    for (const id of got) {
      const c = s.inventory.casks.find((x) => x.id === id)!;
      expect(c.contents!.oakMonths).toBeGreaterThanOrEqual(36);
      expect(c.contents!.oakMonths).toBeLessThanOrEqual(47);
      expect(c.typeId).toBe('ex_bourbon_barrel');
    }
    // 옛 하한 고르기(판매 줄 #267)는 범위의 하한을 바꾼다
    const r2 = applyAction(s, { type: 'setAutoRestock', productId: SHERRY6, months: 2, minMonths: 40 });
    expect(r2.error).toBeUndefined();
    expect(r2.state.commerce.products.find((x) => x.id === SHERRY6)!.autoRestockSource).toEqual({ vessel: 'oak', months: 40, maxMonths: 47, caskTypes: ['ex_bourbon_barrel'] });
  });
  it('상한 안에 통이 없으면 그 사유', () => {
    let s = load();
    s = applyAction(s, { type: 'setAutoRestock', productId: SHERRY6, months: 2, source: { vessel: 'oak', months: 36, maxMonths: 36 } }).state;
    const p = s.commerce.products.find((x) => x.id === SHERRY6)!;
    expect(autoRestockSources(s, p)).toEqual([]);
    expect(autoRestockShortReason(s, p)).toContain('상한 36개월(3년) 안에 쓸 통이 없다');
  });
  it('막는 입력 — 상한 < 하한 · 법정 숙성 미만 · 옹기 · 탱크 · 옛 판', () => {
    const s = load();
    const set = (source: Parameters<typeof applyAction>[1] extends infer A ? A extends { type: 'setAutoRestock'; source?: infer X } ? X : never : never) => applyAction(s, { type: 'setAutoRestock', productId: SHERRY6, months: 2, source });
    expect(set({ vessel: 'oak', months: 48, maxMonths: 40 }).error).toBeDefined();
    expect(set({ vessel: 'oak', months: 6 }).error).toBeDefined();
    expect(set({ vessel: 'oak', months: 36, caskTypes: ['onggi_jar'] }).error).toBeDefined();
    expect(set({ vessel: 'tank', months: 0 }).error).toBeDefined();
    const old = load();
    old.rulesVersion = 'legacy-v15';
    expect(applyAction(old, { type: 'setAutoRestock', productId: SHERRY6, months: 2, source: { vessel: 'oak', months: 36 } }).error).toBeDefined();
    expect(applyAction(old, { type: 'setAgePolicy', policy: defaultAgePolicy() }).error).toBeDefined();
  });
});

describe('#399 setAgePolicy', () => {
  it('띠 id · 규칙을 다듬는다 — keep 0은 제한 없음 · 빈 정책은 지운다 · 알 수 없는 띠는 막는다', () => {
    const s = load();
    const r = applyAction(s, { type: 'setAgePolicy', policy: { '3-4': { auto: 'keep', keep: 0 }, '5-9': { auto: 'keep', keep: 4.7 } } });
    expect(r.error).toBeUndefined();
    expect(r.state.inventory.agePolicy).toEqual({ '5-9': { auto: 'keep', keep: 4 } });
    expect(applyAction(s, { type: 'setAgePolicy', policy: { '3-4': { auto: 'keep', keep: 0 } } }).state.inventory.agePolicy).toBeUndefined();
    expect(applyAction(s, { type: 'setAgePolicy', policy: { '20+': { auto: 'off' } } as never }).error).toBeDefined();
    const on = applyAction(s, { type: 'setAgePolicy', policy: defaultAgePolicy() }).state;
    expect(applyAction(on, { type: 'setAgePolicy', policy: null }).state.inventory.agePolicy).toBeUndefined();
    expect(AGE_BANDS.map((b) => b.id)).toEqual(['0-2', '3-4', '5-9', '10+']);
  });
});
