import { describe, expect, it } from 'vitest';
import { emptyCaskOf, newGame, type GameState, type LedgerEntry, type SpiritLot } from './index';
import { newScenarioGame } from './newScenario';
import { addCost, advanceWood, caskEligibility, coalesce, isCampaignCandidate, ledgerEligibility, ledgerError, ledgerOf, mergeLedgers, newEntry, scaleLedger, splitLedger } from './ledger';

// 구성 원액 원장 (F2, [결정 #308·#309·#323]) — 코어 ARCH. 수용 테스트 이름은 core-integration §5 `ledger:`·`eligibility:` 행

const lot = (over: Partial<SpiritLot> = {}): SpiritLot => ({ id: 'L1', name: 'l', kind: 'malt', volumeL: 200, abv: 0.6, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 10_000, ...over });
const sumL = (es: LedgerEntry[]) => es.reduce((t, e) => t + e.contribLPA, 0);
const sumC = (es: LedgerEntry[]) => es.reduce((t, e) => t + e.costKRW, 0);
const mvp = (): GameState => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });

describe('ledger: 보존·손실·중복 소비 0 (R2·R4)', () => {
  it('새 원액 한 줄 = LPA·총원가 — scale preserve는 원가를 남기고 leak은 같은 비율로 줄인다', () => {
    const e = [newEntry(lot(), 'self', 'default')];
    expect(sumL(e)).toBeCloseTo(120, 9); expect(sumC(e)).toBeCloseTo(1_200_000, 6);
    const p = scaleLedger(e, 0.9, 'preserve'); expect(sumL(p)).toBeCloseTo(108, 9); expect(sumC(p)).toBeCloseTo(1_200_000, 6);
    const k = scaleLedger(e, 0.9, 'leak'); expect(sumL(k)).toBeCloseTo(108, 9); expect(sumC(k)).toBeCloseTo(1_080_000, 6);
  });

  it('split은 손실 없이 나눈다(뗀 것 + 남은 것 = 원래) · addCost는 LPA 비율로 더한다', () => {
    const e = [{ ...newEntry(lot(), 'self', 'default'), contribLPA: 90, costKRW: 900 }, { ...newEntry(lot({ id: 'L2' }), 'self', 'default'), contribLPA: 30, costKRW: 300 }];
    const [take, rest] = splitLedger(e, 0.25);
    expect(sumL(take) + sumL(rest)).toBeCloseTo(120, 9); expect(sumC(take) + sumC(rest)).toBeCloseTo(1200, 9);
    expect(take.map((x) => x.contribLPA)).toEqual([22.5, 7.5]);
    const c = addCost(e, 400); expect(c.map((x) => x.costKRW)).toEqual([1200, 400]);
  });

  it('R2 불변식 — 원장이 로트와 어긋나면 문장, 맞으면 null, 원장이 없으면 검사하지 않는다', () => {
    const l = lot(); expect(ledgerError(l)).toBeNull();
    l.components = [newEntry(l, 'self', 'default')]; expect(ledgerError(l)).toBeNull();
    l.volumeL = 150; expect(ledgerError(l)).toMatch(/Σ contribLPA/);
    l.volumeL = 200; l.components[0]!.costKRW += 1; expect(ledgerError(l)).toMatch(/Σ costKRW/);
    l.components[0]!.costKRW -= 1; l.components[0]!.woodMonths = 3; expect(ledgerError(l)).toMatch(/min\(woodMonths\) 3 ≠ oakMonths 0/); // 전제 2
  });
});

describe('ledger: 합치기 R6 — 키가 같으면 하나로, 부모 보존, 결정적', () => {
  it('(origin, siteId, kind, woodMonths)가 같은 구성 원액은 합쳐지고 사라진 배치가 parents에 남는다 · 다른 키는 그대로', () => {
    const a = [{ ...newEntry(lot({ id: 'A' }), 'self', 'default'), contribLPA: 100, costKRW: 1000 }];
    const b = [{ ...newEntry(lot({ id: 'B' }), 'self', 'default'), contribLPA: 50, costKRW: 400 }];
    const c = [{ ...newEntry(lot({ id: 'C', kind: 'grain' }), 'self', 'default'), contribLPA: 10, costKRW: 90 }];
    const m = mergeLedgers(mergeLedgers(a, b), c);
    expect(m.length).toBe(2);
    expect(m[0]).toMatchObject({ batchId: 'A', contribLPA: 150, costKRW: 1400, parents: [{ batchId: 'B', shareLPA: 50 }] });
    expect(m[1]).toMatchObject({ batchId: 'C', kindAtBirth: 'grain', contribLPA: 10 });
    expect(mergeLedgers(c, mergeLedgers(b, a)).map((e) => e.batchId).sort()).toEqual(['A', 'C']); // 순서를 바꿔도 같은 집합
  });

  it('180개월 연속 합치기 뒤에도 구성 원액 수는 키 수 이하 · parents는 8개 상한', () => {
    let m: LedgerEntry[] = [];
    for (let i = 0; i < 180; i++) m = mergeLedgers(m, [newEntry(lot({ id: `B${i}` }), 'self', 'default')]);
    expect(m.length).toBe(1);
    expect(m[0]!.parents!.length).toBe(8);
    expect(sumL(m)).toBeCloseTo(120 * 180, 6);
  });

  it('advanceWood는 모든 구성 원액 +1 (평균 없음, R3)', () => {
    const e = [{ ...newEntry(lot(), 'self', 'default'), woodMonths: 10 }, { ...newEntry(lot({ id: 'L2' }), 'self', 'default'), woodMonths: 50 }];
    expect(advanceWood(e).map((x) => x.woodMonths)).toEqual([11, 51]);
    expect(coalesce(advanceWood(e)).length).toBe(2); // 개월이 다르면 합치지 않는다
  });
});

describe('isFlagshipCandidate — 코어로 옮겼을 뿐 동작 그대로(F4 전)', () => {
  it('delegateCheck의 재내보내기와 같은 함수이고, 그레인 통도 후보로 세며 goal.months 상한을 쓴다', async () => {
    const { isFlagshipCandidate: viaDelegate } = await import('./delegateCheck');
    const { isFlagshipCandidate } = await import('./ledger');
    expect(viaDelegate).toBe(isFlagshipCandidate);
    const s = mvp(); s.month = 96;
    const c = emptyCaskOf(s, 'ex_bourbon_barrel'); c.contents = lot({ kind: 'grain', oakMonths: 60 });
    expect(isFlagshipCandidate(s, c)).toBe(true); // 60 + 84 ≥ 144
    c.contents.oakMonths = 59; expect(isFlagshipCandidate(s, c)).toBe(false);
  });
});

describe('eligibility: A−1 탈락 / A 통과 · 출처·몰트·입지·소유 · 미상은 적격 아님', () => {
  const withCask = (s: GameState, l: Partial<SpiritLot>, owner = false) => { const c = emptyCaskOf(s, 'ex_bourbon_barrel'); c.id = 'K'; c.contents = lot(l); if (owner) c.owner = { name: '고객', since: 0 } as never; return c; };

  it('새 판(v16) 자가 몰트 — 목재 143개월 탈락 · 144개월 통과(A = campaignGoal.minOakMonths)', () => {
    const s = mvp();
    expect(caskEligibility(s, withCask(s, { oakMonths: 143 }))).toMatchObject({ eligible: false, woodMonths: 143, origin: 'self' });
    expect(caskEligibility(s, withCask(s, { oakMonths: 143 })).reasons.join()).toMatch(/1개월 남음/);
    expect(caskEligibility(s, withCask(s, { oakMonths: 144 }))).toEqual({ eligible: true, woodMonths: 144, origin: 'self', reasons: [] });
  });

  it('매입 원액 · 그레인 · 고객 소유 · 빈 통은 적격이 아니다 — 이유가 남는다', () => {
    const s = mvp();
    expect(caskEligibility(s, withCask(s, { oakMonths: 150, sourced: true })).reasons).toContain('매입 원액이 섞였다');
    expect(caskEligibility(s, withCask(s, { oakMonths: 150, kind: 'grain' })).reasons).toContain('몰트가 아닌 원액이 섞였다');
    expect(caskEligibility(s, withCask(s, { oakMonths: 150 }, true))).toMatchObject({ eligible: false, reasons: ['고객 소유 통(캐스크 오너십)'] });
    expect(caskEligibility(s, emptyCaskOf(s, 'ex_bourbon_barrel')).reasons).toEqual(['빈 통']);
  });

  it('옛 판(legacy-v15)의 원장 없는 원액은 origin unknown → 적격 아님(증거 창작 금지) · 샌드박스(v16)는 self', () => {
    const old = mvp(); old.rulesVersion = 'legacy-v15';
    expect(ledgerOf(old, lot())[0]!.origin).toBe('unknown');
    expect(caskEligibility(old, withCask(old, { oakMonths: 200 }))).toMatchObject({ eligible: false, origin: 'unknown' });
    const g = newGame({ seed: 1, region: 'KR' });
    expect(caskEligibility(g, withCask(g, { oakMonths: 200 })).eligible).toBe(true);
  });

  it('원장이 섞였으면 가장 나쁜 출처·최소 목재 개월로 판정 — 구성 원액 하나라도 어긋나면 탈락 · 다른 입지도 탈락', () => {
    const s = mvp();
    const entries: LedgerEntry[] = [{ ...newEntry(lot(), 'self', 'default'), woodMonths: 160 }, { ...newEntry(lot({ id: 'L2' }), 'self', 'default'), woodMonths: 100 }];
    expect(ledgerEligibility(s, entries)).toMatchObject({ eligible: false, woodMonths: 100, origin: 'self' });
    expect(ledgerEligibility(s, entries, 44).eligible).toBe(true); // 지평 44개월이면 후보
    expect(ledgerEligibility(s, [{ ...entries[0]!, siteId: 'elsewhere' }]).reasons).toContain('다른 입지에서 증류한 원액');
  });

  it('isCampaignCandidate — 지평 안에 적격이 될 통만 · 지평 0 = 지금 적격 · 고객 소유 제외', () => {
    const s = mvp();
    expect(isCampaignCandidate(s, withCask(s, { oakMonths: 100 }), 44)).toBe(true);
    expect(isCampaignCandidate(s, withCask(s, { oakMonths: 100 }), 43)).toBe(false);
    expect(isCampaignCandidate(s, withCask(s, { oakMonths: 144 }), 0)).toBe(true);
    expect(isCampaignCandidate(s, withCask(s, { oakMonths: 100, kind: 'grain' }), 999)).toBe(false);
    expect(isCampaignCandidate(s, withCask(s, { oakMonths: 100 }, true), 999)).toBe(false);
  });
});
