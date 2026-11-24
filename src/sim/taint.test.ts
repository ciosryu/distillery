import { describe, expect, it } from 'vitest';
import { mixTaint, taintOnExtract, taintShown, TAINT_SHOW_SHARE } from './taint';

// [결정 #382] 아는 오염 원액 꼬리표 — 아는 오염만 따라가고(I1 / I2), 섞이면 LPA 몫으로 묽어지며, 문턱 이상이면 보인다
describe('taint — 아는 오염 원액 꼬리표 (#382)', () => {
  const lot = { id: 'L', knownTaint: undefined } as never;
  it('아는 오염 통에서 꺼내면 몫 1 · 모르는 오염(숨은 값)은 붙지 않는다 — 공개 정보가 같으면 결과가 같다', () => {
    expect(taintOnExtract({ contamination: 'mold', contaminationKnown: true, contents: lot })).toEqual({ kind: 'mold', share: 1 });
    expect(taintOnExtract({ contamination: 'tca', contaminationKnown: false, contents: lot })).toBeUndefined();
    expect(taintOnExtract({ contamination: undefined, contaminationKnown: undefined, contents: lot })).toBeUndefined();
    // 원액이 이미 꼬리표를 가졌으면 깨끗한 통에서 꺼내도 그대로 따라간다
    expect(taintOnExtract({ contents: { knownTaint: { kind: 'tca', share: 0.3 } } as never })).toEqual({ kind: 'tca', share: 0.3 });
  });
  it('섞으면 LPA 몫으로 묽어진다 · 종류는 큰 몫 · 없으면 undefined', () => {
    expect(mixTaint([{ taint: { kind: 'mold', share: 1 }, lpa: 100 }, { lpa: 300 }])).toEqual({ kind: 'mold', share: 0.25 });
    expect(mixTaint([{ taint: { kind: 'mold', share: 1 }, lpa: 10 }, { taint: { kind: 'tca', share: 1 }, lpa: 30 }, { lpa: 60 }])).toEqual({ kind: 'tca', share: 0.4 });
    expect(mixTaint([{ lpa: 100 }, { lpa: 0 }])).toBeUndefined();
    expect(mixTaint([])).toBeUndefined();
  });
  it('문턱 이상이면 보인다', () => {
    expect(taintShown({ knownTaint: { kind: 'mold', share: TAINT_SHOW_SHARE } })).toBe(true);
    expect(taintShown({ knownTaint: { kind: 'mold', share: TAINT_SHOW_SHARE - 0.001 } })).toBe(false);
    expect(taintShown({})).toBe(false);
    expect(taintShown(null)).toBe(false);
  });
});
