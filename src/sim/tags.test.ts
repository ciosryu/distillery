import { describe, expect, it } from 'vitest';
import { applyAction, emptyCaskOf, newGame, type GameState } from './index';
import { newScenarioGame } from './newScenario';
import { flagshipReserve } from './economics';
import { caskTagIds, FLAGSHIP_RESERVE_TAG, planTag, protectedCaskIds, reserveCaskIds, selectCasks, tagDefs } from './tags';

// 캐스크 태그 (#249 ①) · 플래그십 예비 통 (#260) — 코어 ARCH

function withCasks(oaks: [string, number][], month = 96): GameState {
  const s: GameState = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1, rules: 'legacy-v15' });
  s.month = month; // 남은 84개월 — 60개월 이상 통이 12년 후보
  s.inventory.casks = [];
  for (const [id, oak] of oaks) {
    const c = emptyCaskOf(s, 'ex_bourbon_barrel'); c.id = id;
    c.contents = { id: `L${id}`, name: id, kind: 'malt', volumeL: 150, abv: 0.6, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: oak, sourced: false, costPerLPA: 10_000 };
    s.inventory.casks.push(c);
  }
  return s;
}
const ok = (s: GameState, a: Parameters<typeof applyAction>[1]) => { const r = applyAction(s, a); expect(r.error).toBeUndefined(); return r.state; };

describe('플래그십 예비 통 (#260)', () => {
  it('손대지 않으면 #252 보호 통(가장 오래된 후보 4통)과 같다 — 비거나 오염되면 다음 후보로 옮겨 간다', () => {
    const s = withCasks([['Y', 40], ['O', 70], ['O2', 66], ['O3', 64], ['O4', 62], ['O5', 61]]);
    expect([...reserveCaskIds(s)].sort()).toEqual([...flagshipReserve(s)].sort());
    expect([...reserveCaskIds(s)].sort()).toEqual(['O', 'O2', 'O3', 'O4']);
    s.inventory.casks.find((c) => c.id === 'O')!.contaminationKnown = true;
    expect([...reserveCaskIds(s)].sort()).toEqual(['O2', 'O3', 'O4', 'O5']);
    expect([...reserveCaskIds(s)].sort()).toEqual([...flagshipReserve(s)].sort());
  });

  it('플레이어가 떼면 다시 붙지 않고 다음 후보가 들어온다 · 다른 통에 붙이면 그 통이 자리를 차지한다 · 플래그십을 팔면 없다', () => {
    let s = withCasks([['O', 70], ['O2', 66], ['O3', 64], ['O4', 62], ['O5', 61], ['O6', 60]]);
    s = ok(s, { type: 'tagCasks', caskIds: ['O'], remove: [FLAGSHIP_RESERVE_TAG] });
    expect(s.inventory.reserveOptOut).toEqual(['LO']);
    expect([...reserveCaskIds(s)].sort()).toEqual(['O2', 'O3', 'O4', 'O5']);
    s = ok(s, { type: 'tagCasks', caskIds: ['O6'], add: [FLAGSHIP_RESERVE_TAG] });
    expect([...reserveCaskIds(s)].sort()).toEqual(['O2', 'O3', 'O4', 'O6']); // 직접 붙인 통 + 남은 3자리
    s = ok(s, { type: 'tagCasks', caskIds: ['O'], add: [FLAGSHIP_RESERVE_TAG] }); // 다시 붙이면 뗀 기록이 지워진다
    expect(s.inventory.reserveOptOut).toBeUndefined();
    expect([...reserveCaskIds(s)].sort()).toEqual(['O', 'O2', 'O3', 'O6']);
    s.progress.milestones.push({ id: 'flagship_sold', month: 95 } as never);
    expect(reserveCaskIds(s).size).toBe(0);
  });

  it('샌드박스에는 기본 태그도 예비 통도 없다', () => {
    const s = newGame({ regionId: 'KR', seed: 1 } as never);
    expect(tagDefs(s).map((t) => t.id)).not.toContain(FLAGSHIP_RESERVE_TAG);
    expect(reserveCaskIds(s).size).toBe(0);
  });
});

describe('캐스크 태그 (#249 ①)', () => {
  it('만들기·붙이기·고르기·지우기 — 보호 태그 통은 excludeProtected에서 빠진다', () => {
    let s = withCasks([['A', 20], ['B', 40], ['C', 80]], 10); // 10개월째 — 셋 다 후보지만 예비는 가장 오래된 순
    s.progress.milestones.push({ id: 'flagship_sold', month: 0 } as never); // 예비 통을 끄고 플레이어 태그만 본다
    s = ok(s, { type: 'defineTag', label: '셰리 후보', color: 'rose', effect: 'protect' });
    s = ok(s, { type: 'defineTag', label: '빨리 팔 것', color: 'sky', effect: 'prefer' });
    const [protect, prefer] = s.inventory.tagDefs!.map((t) => t.id);
    s = ok(s, { type: 'tagCasks', caskIds: ['A', 'B'], add: [protect!] });
    s = ok(s, { type: 'tagCasks', caskIds: ['C'], add: [prefer!] });
    expect(selectCasks(s, { tagIds: [protect!] })).toEqual(['A', 'B']);
    expect(selectCasks(s, { hasContents: true, excludeProtected: true })).toEqual(['C']);
    expect(selectCasks(s, { minAgeM: 30, maxAgeM: 50 })).toEqual(['B']);
    expect([...protectedCaskIds(s)].sort()).toEqual(['A', 'B']);
    s = ok(s, { type: 'editTag', tagId: protect!, effect: null }); // 표시만으로 바꾸면 보호가 풀린다
    expect(protectedCaskIds(s).size).toBe(0);
    s = ok(s, { type: 'deleteTag', tagId: protect! });
    expect(s.inventory.casks.find((c) => c.id === 'A')!.contents!.tagIds).toBeUndefined();
    expect(caskTagIds(s, s.inventory.casks.find((c) => c.id === 'C')!)).toEqual([prefer]);
  });

  it('일괄 계획은 빈 통·고객 소유 통을 이유와 함께 빼고, 행동은 그런 통이 섞이면 아무것도 바꾸지 않는다', () => {
    let s = withCasks([['A', 20], ['B', 40]]);
    s = ok(s, { type: 'defineTag', label: '표시', color: 'stone' });
    const t = s.inventory.tagDefs![0]!.id;
    const empty = emptyCaskOf(s, 'ex_bourbon_barrel'); empty.id = 'E'; s.inventory.casks.push(empty);
    s.inventory.casks.find((c) => c.id === 'B')!.owner = { name: '고객', since: 0 } as never;
    const plan = planTag(s, ['A', 'B', 'E'], { add: [t] });
    expect(plan.ok).toEqual(['A']);
    expect(plan.skipped.map((x) => x.id)).toEqual(['B', 'E']);
    expect(applyAction(s, { type: 'tagCasks', caskIds: ['A', 'B', 'E'], add: [t] }).error).toBeTruthy();
    expect(applyAction(s, { type: 'tagCasks', caskIds: ['A'], add: ['없는 태그'] }).error).toBeTruthy();
    s = ok(s, { type: 'tagCasks', caskIds: plan.ok, add: [t] });
    expect(s.inventory.casks.find((c) => c.id === 'A')!.contents!.tagIds).toEqual([t]);
  });

  it('태그는 원액을 따라간다 — 탱크 원액에 붙은 태그가 통입한 통으로, 원액 빼기로 다시 탱크로', () => {
    let s = withCasks([], 10);
    s = ok(s, { type: 'defineTag', label: '피트', color: 'violet' });
    const t = s.inventory.tagDefs![0]!.id;
    s.inventory.lots.push({ id: 'T1', name: '몰트', kind: 'malt', volumeL: 300, abv: 0.68, flavor: { cereal: 20 }, createdMonth: 9, oakMonths: 0, sourced: false, costPerLPA: 10_000, tagIds: [t] });
    const empty = emptyCaskOf(s, 'ex_bourbon_barrel'); empty.id = 'K1'; s.inventory.casks.push(empty);
    s = ok(s, { type: 'fillCasks', lotId: 'T1', caskIds: ['K1'], entryAbv: 0.635 });
    const k1 = s.inventory.casks.find((c) => c.id === 'K1')!;
    expect(k1.contents!.tagIds).toEqual([t]);
    s = ok(s, { type: 'unfillCask', caskId: 'K1' });
    expect(s.inventory.lots.filter((l) => l.tagIds?.includes(t)).length).toBeGreaterThan(0);
  });
});

describe('후보가 아닌 통에 붙인 예비 (2026-11-11, PROD #300 테스트에서 발견)', () => {
  it('보호는 되지만 예비 자리를 차지하지 않는다 — 진짜 후보 4통은 그대로 예비', () => {
    let s = withCasks([['Y', 44], ['O', 70], ['O2', 66], ['O3', 64], ['O4', 62], ['O5', 61]]); // 96개월 — 60개월 이상이 후보
    s = ok(s, { type: 'tagCasks', caskIds: ['Y'], add: [FLAGSHIP_RESERVE_TAG] });
    expect([...reserveCaskIds(s)].sort()).toEqual(['O', 'O2', 'O3', 'O4', 'Y']); // Y는 보호, 후보 4통도 그대로
    expect(protectedCaskIds(s).has('Y')).toBe(true);
    s = ok(s, { type: 'tagCasks', caskIds: ['O5'], add: [FLAGSHIP_RESERVE_TAG] }); // 후보에 직접 붙이면 그 통이 자리를 차지한다
    expect([...reserveCaskIds(s)].sort()).toEqual(['O', 'O2', 'O3', 'O5', 'Y']);
  });
});
