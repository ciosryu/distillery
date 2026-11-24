import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import { monthTodos, recentlySoldIds, STOCKOUT_RECENT_MONTHS, stockoutSoon } from './alerts';

// 9차 판 134개월 세이브 — [결정 #381] 품절 목록 12개월 · [결정 #385] 놀고 있는 현금 줄
const p134 = () => { const r = parsePlayFile(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };

describe('종반 할 일 (#381 · #385)', () => {
  it('#381: 「품절」은 최근 12개월 안에 판 제품만 — 9차 뉴본 3종(33 ~ 35개월 전 끊김)은 빠진다', () => {
    const s = p134();
    const names = stockoutSoon(s).empty.map((x) => x.name);
    expect(names).not.toContain('김포 뉴본 그레인');
    expect(names).not.toContain('김포 뉴본 피티드');
    expect(names).not.toContain('김포 뉴본 언피티드');
    expect(names).toContain('김포 옹기소주'); // 132개월에 팔렸다
    const recent = recentlySoldIds(s, STOCKOUT_RECENT_MONTHS);
    for (const n of names) expect(recent.has(s.commerce.products.find((p) => p.name === n)!.id)).toBe(true);
  });
  it('#385: 현금이 고정비 24개월 치를 넘으면 info 한 줄 — 증류기 여유 · VIP 라운지 · 숙성고 · 빈 옹기를 계산값과 함께', () => {
    const t = monthTodos(p134()).find((x) => x.id === 'idle-cash');
    expect(t?.level).toBe('info');
    expect(t?.text).toMatch(/현금 .* — 고정비 \d+개월 치가 놀고 있다/);
    expect(t?.text).toContain('VIP 테이스팅 라운지');
    expect(t?.text).toMatch(/증류기 \d+\/\d+회/);
  });
});
