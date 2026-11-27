// [P-PROD-83] 제품 이름의 「n년」과 숙성 표기가 어긋날 때 병입 미리보기 경고 — 10차 153개월 세이브
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { nameAgeClaim, nameAgeMismatch, previewBlend, type BottleOptions } from './blending';
import { restockBottleOptions } from './restockAutoPick';
import type { GameState } from './types';

const load = (): GameState => migrateSave(JSON.parse(readFileSync('docs/playtest/10/distillery-mvp-standard-y13m10-202611270816.json', 'utf8')).save)!;
const opts = (name: string): BottleOptions => ({ name, targetAbv: 0.43, bottleMl: 700, chillFilter: true, packagingId: 'standard' });
const mismatch = (w: string[]) => w.find((x) => x.startsWith('이름에 「'));

describe('[P-PROD-83] 이름 「n년」 · 숙성 표기 어긋남', () => {
  it('이름에서 연수 읽기', () => {
    expect(nameAgeClaim('김포 싱글그레인 12년')).toBe(12);
    expect(nameAgeClaim('김포 12 년 셰리')).toBe(12);
    expect(nameAgeClaim('김포 3년 프루티 블랜드')).toBe(3);
    expect(nameAgeClaim('김포 블렌디드')).toBeNull();
    expect(nameAgeMismatch('김포 12년', 12)).toBeNull();
    expect(nameAgeMismatch('김포 12년', 10)).toMatch(/「12년」.*숙성 표기는 10년/);
    expect(nameAgeMismatch('김포 3년', null)).toMatch(/숙성 표기는 없음/);
  });
  it('새 제품: 목재 125개월 그레인(표기 10년)을 「싱글그레인 12년」으로 내면 경고 · 「10년」이면 없다', () => {
    const s = load();
    const k = s.inventory.casks.find((c) => c.id === 'K382')!; // 그레인 · 목재 126개월
    const comps = [{ source: 'cask' as const, id: k.id, liters: 10 }];
    const a = previewBlend(s, comps, opts('김포 싱글그레인 12년'));
    expect(a.ageYears).toBe(10);
    expect(mismatch(a.warnings)).toMatch(/「12년」.*숙성 표기는 10년/);
    expect(mismatch(previewBlend(s, comps, opts('김포 싱글그레인 10년')).warnings)).toBeUndefined();
  });
  it('보충: 「싱글몰트 5년」(지금 표기 2년)에 보충하면 경고 — 이름은 제품 이름 · 표기는 보충 뒤 값', () => {
    const s = load();
    const p = s.commerce.products.find((x) => x.name === '김포 싱글몰트 5년')!;
    expect(p.ageYears).toBe(2);
    const k = s.inventory.casks.find((c) => c.id === 'K19')!; // 몰트 · 목재 129개월
    const w = previewBlend(s, [{ source: 'cask', id: k.id, liters: 10 }], restockBottleOptions(p)).warnings;
    expect(mismatch(w)).toMatch(/「5년」.*숙성 표기는 2년/);
  });
});
