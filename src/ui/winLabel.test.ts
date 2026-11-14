import { describe, expect, it } from 'vitest';
import { winChannelLabel, winLabel } from './winLabel';

describe('F5c-2 — 승리 채널 문구 (판정은 kind만, 문구는 kind + channel)', () => {
  it('핸드필 · 납품 · 소매 · 면세 · 수출 · 채널 없는 옛 기록', () => {
    expect(winLabel({ kind: 'cellar_door' })).toBe('핸드필 승리');
    expect(winLabel({ kind: 'domestic', channel: 'retail_deal' })).toBe('대형 유통 납품 승리');
    expect(winLabel({ kind: 'domestic', channel: 'retail' })).toBe('국내 소매 승리');
    expect(winLabel({ kind: 'domestic' })).toBe('국내 소매 승리');
    expect(winChannelLabel({ kind: 'dutyfree' })).toBe('지정면세점');
    expect(winChannelLabel({ kind: 'export' })).toBe('수출');
  });
});
