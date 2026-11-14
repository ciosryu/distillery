// F5a 범위 잠금·치환 목표 — 새 캠페인(v16)과 옛 판(legacy-v15)의 단계·중반 목표·잠금을 규칙 묶음별로 (코어 ARCH, [결정 #311·#316·#319·#321·#322] · architecture §10.10 P-ARCH-57 · MKT §7)
import { describe, expect, it } from 'vitest';
import { advanceMonth, emptyCaskOf, isLocked, type GameState } from './index';
import { siteOf } from './content/regions';
import { EVENTS } from './content/events';
import { midGoalMet, midGoalProgress, midGoalsOf } from './progress';
import { newScenarioGame } from './newScenario';
import { pendingStages, stagesOf } from './scenario';
import { applyEffects } from './events';

const v16 = (seed = 1) => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed });
const legacy = (seed = 1) => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed, rules: 'legacy-v15' });
const jump = (s: GameState, month: number) => { s.month = month; return advanceMonth(s); };
const selfMalt = (s: GameState, id: string, oakMonths: number) => { const c = emptyCaskOf(s, 'ex_bourbon_barrel'); c.id = id; c.contents = { id: `L${id}`, name: id, kind: 'malt', volumeL: 180, abv: 0.6, flavor: { cereal: 20 }, createdMonth: 0, oakMonths, sourced: false, costPerLPA: 10_000 }; s.inventory.casks.push(c); };

describe('F5a — 단계·중반 목표는 규칙 묶음별 (콘텐츠를 매달 읽는 자리라 함수로 가른다)', () => {
  it('옛 판(legacy-v15)은 옛 배열 그대로: y7_export(수출) · y11_people(HR) · export_open', () => {
    const s = legacy();
    expect(stagesOf(s).map((x) => x.id)).toEqual(['y5_market', 'y7_export', 'y9_casks', 'y11_people']);
    expect(midGoalsOf(s).map((g) => g.id)).toEqual(['aged3_sold', 'commission_done', 'export_open', 'revenue_8']);
    expect(isLocked(s, 'kind:grain')).toBe(true);
    expect(isLocked(s, 'event:export_inquiry')).toBe(false); // v16 전용 키는 받지 않는다
    expect(pendingStages(s)).toHaveLength(4);
  });

  it('새 판(v16): y7_retail(대형 유통) · y11_specialist(핵심 전문가) · reserve_casks · 그레인 열림 · export_inquiry 잠김', () => {
    const s = v16();
    expect(stagesOf(s).map((x) => x.id)).toEqual(['y5_market', 'y7_retail', 'y9_casks', 'y11_specialist']);
    expect(midGoalsOf(s).map((g) => g.id)).toEqual(['aged3_sold', 'commission_done', 'reserve_casks', 'revenue_8']);
    expect(isLocked(s, 'kind:grain')).toBe(false);
    expect(isLocked(s, 'kind:gin')).toBe(true);
    expect(isLocked(s, 'event:export_inquiry')).toBe(true);
    expect(isLocked(s, 'system:exports')).toBe(true);
    expect(isLocked(s, 'system:siteDeals')).toBe(true);
  });

  it('v16 84개월: 대형 유통(system:siteDeals·acceptRetail)이 열리고 수출은 끝까지 잠김 · 120개월: pickSpecialist만 열리고 hire·system:hr은 잠김', () => {
    let s = v16();
    s = jump(s, 84);
    expect(s.scenario!.stagesDone).toEqual(['y5_market', 'y7_retail']);
    expect(isLocked(s, 'system:siteDeals')).toBe(false);
    expect(isLocked(s, 'action:acceptRetail')).toBe(false);
    expect(isLocked(s, 'action:acceptOem')).toBe(true);
    expect(isLocked(s, 'system:exports')).toBe(true);
    expect(isLocked(s, 'action:acceptExportOffer')).toBe(true);
    expect(s.history.reports.at(-1)!.notes.some((n) => n.includes('8년 차 — 대형 유통'))).toBe(true);
    s = jump(s, 120);
    expect(s.scenario!.stagesDone).toEqual(['y5_market', 'y7_retail', 'y9_casks', 'y11_specialist']);
    expect(isLocked(s, 'action:pickSpecialist')).toBe(false);
    expect(isLocked(s, 'action:hire')).toBe(true);
    expect(isLocked(s, 'system:hr')).toBe(true);
    expect(isLocked(s, 'system:exports')).toBe(true); // 180개월까지 가도 수출은 1.0(#311)
    s = jump(s, 179);
    expect(isLocked(s, 'system:exports')).toBe(true);
  });

  it('옛 판 84개월은 지금처럼 수출이 열린다(바이트 동일 전제) · 120개월 HR', () => {
    let s = legacy();
    s = jump(s, 84);
    expect(isLocked(s, 'system:exports')).toBe(false);
    expect(isLocked(s, 'system:siteDeals')).toBe(true);
    s = jump(s, 120);
    expect(isLocked(s, 'system:hr')).toBe(false);
    expect(isLocked(s, 'action:pickSpecialist')).toBe(false); // 옛 판 잠금 목록에는 없는 키 — 행동 자체가 MGT 몫이고 옛 판에서는 노출되지 않는다(화면이 단계 키로 가른다)
  });
});

describe('F5a — 중반 목표 reserve_casks (#319): 12년 후보 통 3개 = 자가 몰트 · 목재 108개월↑(안내 지평 36)', () => {
  it('108개월↑ 자가 몰트 3통이면 달성 · 어린 통 3개(107개월)로는 미달성 · 그레인·매입·고객 소유는 세지 않는다', () => {
    const s = v16(); s.month = 130;
    s.inventory.casks = s.inventory.casks.filter((c) => !c.contents);
    selfMalt(s, 'A', 107); selfMalt(s, 'B', 107); selfMalt(s, 'C', 107);
    expect(midGoalMet(s, 'reserve_casks')).toBe(false);
    s.inventory.casks.find((c) => c.id === 'A')!.contents!.oakMonths = 108;
    s.inventory.casks.find((c) => c.id === 'B')!.contents!.oakMonths = 120;
    expect(midGoalMet(s, 'reserve_casks')).toBe(false); // 2통
    expect(midGoalProgress(s, 'reserve_casks')).toEqual({ have: 2, need: 3 }); // F5c-2 화면 "후보 2/3" — 판정과 같은 식
    expect(midGoalProgress(s, 'aged3_sold')).toBeNull();
    s.inventory.casks.find((c) => c.id === 'C')!.contents!.oakMonths = 150;
    expect(midGoalMet(s, 'reserve_casks')).toBe(true); // 3통
    selfMalt(s, 'G', 150); s.inventory.casks.find((c) => c.id === 'G')!.contents!.kind = 'grain';
    selfMalt(s, 'S', 150); s.inventory.casks.find((c) => c.id === 'S')!.contents!.sourced = true;
    selfMalt(s, 'O', 150); s.inventory.casks.find((c) => c.id === 'O')!.owner = { name: 'x', soldMonth: 0, deliverMonth: 999 } as never;
    s.inventory.casks.find((c) => c.id === 'C')!.contents!.oakMonths = 100;
    expect(midGoalMet(s, 'reserve_casks')).toBe(false); // 자가 몰트 적격 후보는 A·B 둘뿐
  });

  it('월말 판정: 어느 달이든 한 번 3통이면 done(보상 1회), 132개월까지 한 번도 아니면 missed — 옛 판은 export_open을 판정한다', () => {
    let s = v16(); s.month = 100;
    s.inventory.casks = s.inventory.casks.filter((c) => !c.contents);
    selfMalt(s, 'A', 110); selfMalt(s, 'B', 110); selfMalt(s, 'C', 110);
    s = advanceMonth(s);
    expect(s.progress.midGoals?.find((g) => g.id === 'reserve_casks')?.result).toBe('done');
    expect(s.progress.midGoals?.some((g) => g.id === 'export_open')).toBe(false);
    let t = v16(); t = jump(t, 131);
    expect(t.progress.midGoals?.find((g) => g.id === 'reserve_casks')?.result).toBe('missed');
    let o = legacy(); o = jump(o, 131);
    expect(o.progress.midGoals?.find((g) => g.id === 'export_open')?.result).toBe('missed');
    expect(o.progress.midGoals?.some((g) => g.id === 'reserve_casks')).toBe(false);
  });
});

describe('F5a — 이벤트 잠금 키 event:<id> (#321 대안 ⓐ)', () => {
  it('「해외 바이어 문의」는 v16에서 일어날 수 없고 옛 판·샌드박스에서는 지금처럼 가능하다 — 다른 이벤트는 그대로', () => {
    const def = EVENTS.find((e) => e.id === 'export_inquiry')!;
    expect(def).toBeDefined();
    const s = jump(v16(), 60); // system:events 열림
    expect(isLocked(s, 'event:export_inquiry')).toBe(true);
    const o = legacy();
    expect(isLocked(o, 'event:export_inquiry')).toBe(false);
    void applyEffects; // 효과 자체는 바뀌지 않는다(F3 지점 5 — events.test.ts)
  });
});

describe('F5a — 입지는 고정(사실): 사업 계획서에 입지 선택이 없고 MVP_KR.site가 비어 지역 기본 입지(경기)다', () => {
  it('새 판·옛 판 모두 siteId 없음 · siteOf = 지역 기본 입지 · 원장 siteId 문자열 default', () => {
    for (const s of [v16(), legacy()]) {
      expect(s.siteId).toBeUndefined();
      expect(siteOf(s).basis).toBe('지역 기본 입지');
    }
  });
});
