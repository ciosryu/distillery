// 커뮤니티 피드 v3 문장 규칙 ([결정 #400] · #402 ~ #406 · 설계 docs/design/mkt-feed.md) — 문장 틀 데이터만 본다(판매 · 리뷰 셈과 무관)
import { describe, expect, it } from 'vitest';
import * as C from './content/feed';

/** 내보낸 문장 묶음을 모두 모은다(이름 · 숫자 표는 뺀다) */
const POOLS: Record<string, unknown> = {
  WB_VERDICT: C.WB_VERDICT, WB_FINISH: C.WB_FINISH, WB_NOSE_ADJ: C.WB_NOSE_ADJ, CAFE_OPEN: C.CAFE_OPEN, CAFE_CLOSE: C.CAFE_CLOSE, CAFE_LINES: C.CAFE_LINES,
  DCW_OPEN: C.DCW_OPEN, DCW_CLOSE: C.DCW_CLOSE, DCW_LINES: C.DCW_LINES, DCW_FEATURE: C.DCW_FEATURE, DCJ_OPEN: C.DCJ_OPEN, DCJ_CLOSE: C.DCJ_CLOSE, DCJ_LINES: C.DCJ_LINES,
  DCJ_OFFTOPIC: C.DCJ_OFFTOPIC, REPLIES: C.REPLIES, COMPARE_LINES: C.COMPARE_LINES, FEED_KIND_LINES: C.FEED_KIND_LINES, NOTE_PARTS: C.NOTE_PARTS, WB_KIND_LINES: C.WB_KIND_LINES,
};
const strings = (o: unknown): string[] => (typeof o === 'string' ? [o] : Array.isArray(o) ? o.flatMap(strings) : o && typeof o === 'object' ? Object.values(o).flatMap(strings) : []);
const ALL = Object.values(POOLS).flatMap(strings);
const SLOTS = new Set(['name', 'short', 'price', 'bench', 'benchCo', 'cat', 'age', 'finish', 'abv', 'n1', 'n2', 'n3', 'off', 'winner', 'loser', 'reason']);

describe('피드 문장 규칙', () => {
  it('[결정 #403] 욕설이 없다(비속어는 둔다) · 욕설 단계 2 묶음이 없다', () => {
    const swear = /ㅅㅂ|ㅆㅂ|시발|씨발|씨바|존나|ㅈㄴ|좆|ㅈ됨|ㅈ같|개씹|병신|ㅄ|새끼|이돈씨|닥쳐/;
    expect(ALL.filter((x) => swear.test(x))).toEqual([]);
    for (const tiered of [C.DCW_LINES, C.DCJ_LINES]) for (const t of Object.values(tiered)) expect(Object.keys(t ?? {})).not.toContain('2');
  });
  it('[결정 #400 ④ · #404] 미성년 · 음주 운전 · 혐오 낱말이 없다(자기 과음 · 실수 뻘글은 둔다)', () => {
    const banned = /미성년|고딩|중딩|초딩|고등학생|중학생|초등|여고생|음주\s?운전|운전대|충들|틀딱|급식충/;
    expect(ALL.filter((x) => banned.test(x))).toEqual([]);
  });
  it('빈칸은 정해진 이름만 쓴다', () => {
    const bad = ALL.flatMap((x) => [...x.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!)).filter((k) => !SLOTS.has(k));
    expect(bad).toEqual([]);
  });
  it('한 묶음 안에 같은 문장이 없다', () => {
    const dup: string[] = [];
    const walk = (o: unknown, path: string) => {
      if (Array.isArray(o)) { const seen = new Set<string>(); for (const x of o) if (typeof x === 'string' && x && seen.has(x)) dup.push(`${path}: ${x}`); else if (typeof x === 'string') seen.add(x); }
      else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
    };
    for (const [k, v] of Object.entries(POOLS)) walk(v, k);
    expect(dup).toEqual([]);
  });
  it('채널마다 평가 밖 글 종류가 6가지 이상 · 문장 틀이 모두 480개 이상(설계 §0 약 500개)', () => {
    for (const ch of ['dc_whisky', 'dc_jugal', 'cafe'] as const) expect(Object.keys(C.FEED_KIND_LINES[ch]).length).toBeGreaterThanOrEqual(6);
    const body = [C.WB_VERDICT, C.CAFE_LINES, C.DCW_LINES, C.DCW_FEATURE, C.DCJ_LINES, C.DCJ_OFFTOPIC, C.COMPARE_LINES, C.FEED_KIND_LINES, C.NOTE_PARTS, C.WB_KIND_LINES].flatMap(strings);
    expect(body.length).toBeGreaterThanOrEqual(480);
  });
  it('[결정 #402 · #406] 채널 넷 · 실명 — 위갤은 위스키 마이너 갤러리', () => {
    expect(Object.keys(C.FEED_COMMUNITIES).sort()).toEqual(['cafe', 'dc_jugal', 'dc_whisky', 'whiskybase']);
    expect(C.FEED_COMMUNITIES.dc_whisky.whisky).toContain('위스키 마이너 갤러리');
    expect(C.FEED_COMMUNITIES.dc_jugal.whisky).toContain('주류 갤러리');
  });
  it('[결정 #405] 비교 대상 실제 제품은 회사 이름을 가진다(모르면 비움) — 문장에 쓰는 회사 이름 빈칸은 {benchCo} 하나', () => {
    const all = Object.values(C.FEED_BENCHMARKS).flat();
    expect(all.filter((b) => b.co).length).toBeGreaterThanOrEqual(15);
  });
});
