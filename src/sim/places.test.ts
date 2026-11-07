import { describe, expect, it } from 'vitest';
import { advanceMonths, applyAction, migrateSave, newGame, newScenarioGame, rivalShare, SAVE_VERSION } from '.';
import fixture from './fixtures/save-v12.json';

// 재무 확장(S-11)·경쟁 AI(S-12)의 자리 — 동작 불변 (#152)

describe('세이브 v12 → v13', () => {
  it('선도계약·보험·경쟁 증류소는 빈 목록으로 채우고, 진행 결과가 v12 코드와 같다', () => {
    const s = migrateSave(structuredClone(fixture.save))!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.finance.hedges).toEqual([]);
    expect(s.finance.insurance).toEqual([]);
    expect(s.finance.board).toBeUndefined();
    expect(s.world.rivals).toEqual([]);
    const t = advanceMonths(s, 3);
    expect({ month: t.month, cash: t.finance.cash }).toEqual(fixture.expectedAfter3);
  });
});

describe('재무 확장의 자리 (S-11)', () => {
  it('새 게임은 빈 목록, 이사회 없음. 선도계약은 아직 실패하고(보험은 #171) MVP에서는 잠겨 있다', () => {
    const s = newGame({ seed: 1 });
    expect(s.finance.hedges).toEqual([]);
    expect(s.finance.insurance).toEqual([]);
    expect(s.finance.board).toBeUndefined();
    expect(applyAction(s, { type: 'signForward', ingredientId: 'malt_unpeated', kgPerMonth: 1000, months: 12 }).error).toMatch(/다음 단계/);
    // 보험은 규칙이 생겼다 (#171) — 자세한 테스트는 finance.test.ts
    expect(applyAction(s, { type: 'buyInsurance', kind: 'property', coverage: 1_000_000_000 }).error).toBeUndefined();
    expect(applyAction(s, { type: 'cancelInsurance', policyId: 'x' }).error).toMatch(/보험이 없습니다/);
    const mvp = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    expect(applyAction(mvp, { type: 'buyInsurance', kind: 'property', coverage: 1 }).error).toMatch(/시나리오/);
  });
});

describe('경쟁 AI의 자리 (S-12)', () => {
  it('경쟁 증류소가 없으면 시장 몫은 0 — 수요 공식에 (1 − 0)이 곱해진다', () => {
    const s = newGame({ seed: 1 });
    expect(rivalShare(s, 'whisky')).toBe(0);
    s.world.rivals.push({ id: 'R1', name: '경쟁', regionId: 'KR', categories: ['gin'], awareness: 0.5, quality: 70 });
    expect(rivalShare(s, 'whisky')).toBe(0); // 다른 카테고리
  });
});
