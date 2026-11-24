// 판매 화면 자동 납품 줄 (#369 옹기 · 오크에서 쉰 소주 · #370 뉴본 탱크) — 9차 판 64 · 133개월 세이브로 잰다
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import { autoRestockSourceLine, autoRestockTitle } from './autoRestockLine';
import { autoRestockSupported, newmakeTankUseL } from '../sim/economics';
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
  it('133개월 「옹기소주」는 쉰 개월이 0(탱크 원액이 섞임)이라 탱크 줄 — 이름과 다르게 채우는 것을 화면이 알린다', () => {
    expect(line(m133(), '김포 옹기소주').text).toBe('같은 레시피의 탱크 원액으로 채운다');
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
