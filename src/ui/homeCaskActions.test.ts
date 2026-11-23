// [결정 #345] GAP-PROD-7 — 빈 통 행동(재탄화 · 중고 매각 · 시즈닝 계약)을 홈으로. 규칙은 PROD 그대로, 화면 문구만 확인한다
import { describe, expect, it } from 'vitest';
import { RECHAR_NOTE } from './MvpHome';

describe('홈 빈 나무 통 — 재탄화 안내 (#345 · #339)', () => {
  it('재탄화는 3년용 통에만 — 12년 탄닌이 는다는 이유를 말하고, "채웠다 비우기" 요령은 말하지 않는다', () => {
    expect(RECHAR_NOTE).toContain('3년용 통에만');
    expect(RECHAR_NOTE).toContain('12년용으로는 탄닌이 늘어');
    expect(RECHAR_NOTE).not.toMatch(/채웠다|비웠다 다시/);
  });
});
