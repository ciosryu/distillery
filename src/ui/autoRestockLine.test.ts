// 판매 화면 자동 납품 줄 (#369 옹기 · 오크에서 쉰 소주 · #370 뉴본 탱크) — 9차 판 64 · 133개월 세이브로 잰다
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import { autoRestockRangeOptions, autoRestockSourceLine, autoRestockSourceOptions, autoRestockTitle, rangeKey, sourceKey } from './autoRestockLine';
import { applyAction } from '../sim';
import { autoRestockShortReason, autoRestockSources, autoRestockSupported, newmakeTankUseL } from '../sim/economics';
import { knownState, knownView, type GameState } from '../sim';

const load = (f: string): GameState => { const r = parsePlayFile(readFileSync(`docs/playtest/9/${f}`, 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };
const m64 = () => load('distillery-mvp-standard-y6m5-202611240759.json');
const m133 = () => load('distillery-mvp-standard-y12m2-202611241000.json');
const byName = (s: GameState, name: string) => s.commerce.products.find((p) => p.name === name)!;
const line = (s: GameState, name: string) => autoRestockSourceLine(s, knownState(s), byName(s, name));

describe('#369 옹기 · 오크에서 쉰 소주 — 같은 용기 · 제품 개월 이상 쉰 같은 레시피 통으로만', () => {
  it('64개월 「옹기소주」(옹기 2개월): 옹기 통으로 채운다 · 맞는 통 수 · 병 수', () => {
    const l = line(m64(), '김포 옹기소주');
    expect(l.warn).toBe(false);
    expect(l.text).toMatch(/^옹기에서 2개월 이상 쉰 같은 레시피 통으로 채운다 — 맞는 통 \d+개 · 약 [\d,]+병$/);
  });
  it('64개월 「오크소주」(오크 3개월): 오크 통으로', () => {
    expect(line(m64(), '김포 오크소주').text).toMatch(/^오크 통에서 3개월 이상 쉰 같은 레시피 통으로 채운다/);
  });
  it('맞는 통이 없으면 warn — 탱크 원액으로 대신하지 않는다', () => {
    const s = m64();
    const p = byName(s, '김포 옹기소주');
    s.inventory.casks = s.inventory.casks.filter((c) => !(c.contents && (c.contents.restMonths ?? 0) > 0));
    const l = autoRestockSourceLine(s, knownState(s), p);
    expect(l.warn).toBe(true);
    expect(l.text).toBe('옹기에서 2개월 이상 쉰 같은 레시피 통이 없어 보충하지 않는다 — 탱크 원액으로 대신하지 않는다');
    expect(autoRestockTitle(s, knownState(s), p)).toContain('탱크 원액으로 대신하지 않는다');
  });
  it('133개월 「옹기소주」 · 「오크소주」는 쉰 개월이 0(탱크 원액이 섞임)이라 탱크로 채운다 — warn으로 까닭을 알린다(PM 2026-11-24)', () => {
    const s = m133();
    const l = line(s, '김포 옹기소주');
    expect(l.warn).toBe(true);
    expect(l.text).toBe('이 제품은 지금 규칙으로 탱크 원액으로 채운다 — 병입 · 보충 때 탱크 원액이 섞여 쉰 개월이 0이 됐다. 옹기로 채우려면 「채울 원액」에서 옹기를 고른다');
    expect(line(s, '김포 오크소주').text).toContain('오크 통으로 채우려면 「채울 원액」에서 오크 통을 고른다');
    expect(autoRestockTitle(s, knownState(s), byName(s, '김포 옹기소주'))).toContain('옹기에서 채우지 않는다');
  });
  it('통 구성 기록이 없는 탱크 소주(「김포 소주」)는 까닭 없이 탱크 줄', () => {
    const l = line(m133(), '김포 소주');
    expect(l.warn).toBe(false);
    expect(l.text).toBe('같은 레시피의 탱크 원액으로 채운다');
  });
  it('옛 판(legacy-v15)은 표기 없는 옹기 제품을 지금대로 탱크로', () => {
    const s = m64();
    s.rulesVersion = 'legacy-v15';
    expect(line(s, '김포 옹기소주').text).toBe('같은 레시피의 탱크 원액으로 채운다');
  });
});

describe('#370 뉴본 — 같은 레시피 탱크 원액 · 한 달에 쓰는 양', () => {
  it('64개월 뉴본 피티드 · 그레인: 원액 이름과 월 사용량(newmakeTankUseL, 아는 품질)', () => {
    const s = m64();
    const ks = knownState(s);
    const p = byName(s, '김포 뉴본 피티드');
    const l = autoRestockSourceLine(s, ks, p);
    expect(l.warn).toBe(false);
    expect(l.text).toBe(`탱크 몰트를 월 약 ${Math.round(newmakeTankUseL(ks, knownView(s, p))!)} L 쓴다 — 그만큼 통입(숙성)할 원액이 준다`);
    expect(line(s, '김포 뉴본 그레인').text).toMatch(/^탱크 그레인을 월 약 \d+ L 쓴다/);
    expect(autoRestockTitle(s, ks, p)).toMatch(/한 달에 약 \d+ L를 쓴다/);
  });
  it('탱크에 같은 레시피 원액이 없으면 warn', () => {
    const s = m64();
    s.inventory.lots = s.inventory.lots.filter((l) => l.kind !== 'malt' && l.kind !== 'grain');
    const l = line(s, '김포 뉴본 피티드');
    expect(l.warn).toBe(true);
    expect(l.text).toBe('같은 레시피의 탱크 원액이 없어 지금은 채우지 못한다');
  });
  it('F5d — 참 품질만 바뀌면 월 사용량 줄이 같다(아는 품질로 센다)', () => {
    const a = m64();
    const b = m64();
    for (const p of b.commerce.products) p.quality = Math.min(100, p.quality + 20);
    expect(line(b, '김포 뉴본 피티드').text).toBe(line(a, '김포 뉴본 피티드').text);
  });
  it('옛 판은 뉴본 자동 납품을 고를 수 없다(고르기 자체를 보이지 않음)', () => {
    const s = m64();
    s.rulesVersion = 'legacy-v15';
    expect(autoRestockSupported(byName(s, '김포 뉴본 피티드'), s)).toBe(false);
  });
});

describe('[결정 #392] 채울 원액 고르기 — 선택지와 안내 줄', () => {
  const pick = (s: GameState, name: string, source: { vessel: 'tank' | 'onggi' | 'oak'; months: number } | null) => {
    const p = byName(s, name);
    const r = applyAction(s, { type: 'setAutoRestock', productId: p.id, months: 3, source });
    return r.state;
  };
  it('133개월 「옹기소주」 선택지: 지금 규칙(탱크) · 탱크 · 옹기 n개월↑(통 수) — PROD 선택지 그대로에 원액 수', () => {
    const s = m133();
    const o = autoRestockSourceOptions(s, byName(s, '김포 옹기소주'));
    expect(o[0]!.key).toBe('auto');
    expect(o[0]!.text).toMatch(/^지금 규칙\(탱크\) — 탱크 원액 \d+개$/);
    expect(o.map((x) => x.key)).toContain('onggi:2');
    expect(o.find((x) => x.key === 'onggi:2')!.text).toBe('옹기 2개월↑ — 통 없음'); // 옹기 12개가 모두 비었다(PROD #994 사실)
  });
  it('「옹기 2개월↑」을 고르면 안내 줄이 그 값을 따른다 — 통이 없으면 warn · 탱크로 대신하지 않는다', () => {
    const s = pick(m133(), '김포 옹기소주', { vessel: 'onggi', months: 2 });
    const l = line(s, '김포 옹기소주');
    expect(l.warn).toBe(true);
    expect(l.text).toBe('옹기에서 2개월 이상 쉰 같은 레시피 통이 없어 보충하지 않는다 — 탱크 원액으로 대신하지 않는다');
    expect(sourceKey(byName(s, '김포 옹기소주').autoRestockSource)).toBe('onggi:2');
  });
  it('「탱크」를 직접 고르면 까닭 warn을 띄우지 않는다(플레이어가 고른 값)', () => {
    const s = pick(m133(), '김포 옹기소주', { vessel: 'tank', months: 0 });
    const l = line(s, '김포 옹기소주');
    expect(l.warn).toBe(false);
    expect(l.text).toBe('같은 레시피의 탱크 원액으로 채운다');
  });
  it('64개월 「옹기소주」에 「옹기 2개월↑」: 맞는 통이 있으면 통 수 · 병 수', () => {
    const s = pick(m64(), '김포 옹기소주', { vessel: 'onggi', months: 2 });
    expect(line(s, '김포 옹기소주').text).toMatch(/^옹기에서 2개월 이상 쉰 같은 레시피 통으로 채운다 — 맞는 통 \d+개 · 약 [\d,]+병$/);
  });
  it('위스키 · 뉴본 · 옛 판은 고르기가 없다', () => {
    const s = m64();
    expect(autoRestockSourceOptions(s, byName(s, '김포 뉴본 피티드'))).toEqual([]);
    const w = s.commerce.products.find((p) => p.category === 'whisky');
    if (w) expect(autoRestockSourceOptions(s, w)).toEqual([]);
    s.rulesVersion = 'legacy-v15';
    expect(autoRestockSourceOptions(s, byName(s, '김포 옹기소주'))).toEqual([]);
  });
});

describe('[결정 #399] 위스키 「통 범위 · 통 종류」 고르기 — 선택지 · 못 채운 까닭', () => {
  const W = '김포 퍼스트 배치';
  it('133개월 위스키: 첫 칸은 지금 규칙, 그다음 (상한 +12 · +24 · +36 · 없음) × (아무거나 · 버번 · 셰리) — 값(열쇠)은 모두 다르다', () => {
    const s = m133();
    const o = autoRestockRangeOptions(s, byName(s, W));
    expect(o[0]!.key).toBe('auto');
    expect(o[0]!.text).toMatch(/^지금 규칙\(.+ 이상 · 상한 없음\) — 통 (\d+개|없음)$/);
    expect(new Set(o.map((x) => x.key)).size).toBe(o.length);
    expect(o.some((x) => x.text.includes('버번 계열'))).toBe(true);
    expect(o.some((x) => x.text.includes('셰리 계열'))).toBe(true);
  });
  it('하나를 고르면 제품 값의 열쇠가 그 칸과 같다(화면 select 값이 맞는다)', () => {
    const s0 = m133();
    const p0 = byName(s0, W);
    const pick = autoRestockRangeOptions(s0, p0).find((x) => x.key !== 'auto' && x.text.includes('버번 계열'))!;
    const s = applyAction(s0, { type: 'setAutoRestock', productId: p0.id, months: 3, source: pick.source }).state;
    expect(rangeKey(byName(s, W).autoRestockSource)).toBe(pick.key);
    expect(autoRestockRangeOptions(s, byName(s, W)).filter((x) => x.key === pick.key)).toHaveLength(1);
  });
  it('소주 · 뉴본 · 옛 판은 통 범위 고르기가 없다', () => {
    const s = m133();
    expect(autoRestockRangeOptions(s, byName(s, '김포 소주'))).toEqual([]);
    expect(autoRestockRangeOptions(s, byName(s, '김포 뉴본 피티드'))).toEqual([]);
    s.rulesVersion = 'legacy-v15';
    expect(autoRestockRangeOptions(s, byName(s, W))).toEqual([]);
  });
  it('띠 정책이 모든 띠를 막으면 못 채운 까닭이 나온다(판매 줄 warn이 그대로 쓴다)', () => {
    const s0 = m133();
    const s = applyAction(s0, { type: 'setAgePolicy', policy: { '0-2': { auto: 'off' }, '3-4': { auto: 'off' }, '5-9': { auto: 'off' }, '10+': { auto: 'off' } } as never }).state;
    const why = autoRestockShortReason(s, byName(s, W));
    expect(autoRestockSources(s0, byName(s0, W)).length).toBeGreaterThan(0); // 정책 전에는 쓸 통이 있다(133개월: 21통) — 시험이 헛돌지 않게
    expect(autoRestockShortReason(s0, byName(s0, W))).toBeNull();
    expect(why).toMatch(/띠는 자동이 쓰지 않도록 정했다/);
  });
});
