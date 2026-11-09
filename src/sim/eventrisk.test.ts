import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type MonthReport } from './index';
import { fireEvent, resolvePending, runEvents } from './events';
import { handleDeparture, masterDistiller, RETIRE_AGE } from './hr';
import { addModifier } from './modifiers';

// 이벤트 리스크 배수 (#184, tech-tree P3 "면역 대신 크기 감소") — 연구한 노드의 risk_scale이 이벤트 피해를 줄인다

const rep = (s: GameState): MonthReport => ({ month: s.month, revenue: 0, expenses: {}, netCash: 0, cashEnd: 0, sales: [], production: [], bulk: [], bulkRevenue: 0, angelsShareL: 0, liquorTaxRemitted: 0, events: [], notes: [] });
const game = (unlocked: string[] = []): GameState => {
  const s = newGame({ seed: 1, startingCash: 5_000_000_000 });
  for (const o of s.b2b.brokerOffers.slice(0, 3)) s.inventory.casks.push({ ...o.cask, id: `C-${o.id}` });
  s.inventory.lots.push({ id: 'L-S', name: '소주', kind: 'soju', volumeL: 400, abv: 0.45, flavor: {}, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 9_000 });
  s.inventory.lots.push({ id: 'L-M', name: '몰트', kind: 'malt', volumeL: 400, abv: 0.68, flavor: {}, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 9_000 });
  s.research.unlocked.push(...unlocked);
  return s;
};

describe('이벤트 리스크 배수 (#184)', () => {
  it('ENG-2b(방재 엔지니어링): 숙성고 화재의 복구비가 ×0.6', () => {
    const plain = game(); const c0 = plain.finance.cash; fireEvent(plain, 'warehouse_fire', rep(plain));
    const eng = game(['ENG-2b']); const c1 = eng.finance.cash; fireEvent(eng, 'warehouse_fire', rep(eng));
    expect(c0 - plain.finance.cash).toBe(20_000_000);
    expect(c1 - eng.finance.cash).toBe(12_000_000);
  });

  it('발효 오염: PRO-1이면 이취 ×0.7, ASN-1이면 소주만 ×0.3 더', () => {
    const acetic = (unlocked: string[]) => { const s = game(unlocked); fireEvent(s, 'ferment_infection', rep(s)); return Object.fromEntries(s.inventory.lots.map((l) => [l.kind, l.flavor.acetic ?? 0])); };
    expect(acetic([])).toEqual({ soju: 8, malt: 8 });
    const pro = acetic(['PRO-1']);
    expect(pro.malt).toBeCloseTo(5.6, 10);
    expect(pro.soju).toBeCloseTo(5.6, 10);
    const both = acetic(['PRO-1', 'ASN-1']);
    expect(both.malt).toBeCloseTo(5.6, 10);
    expect(both.soju).toBeCloseTo(8 * 0.7 * 0.3, 10);
  });

  it('BIZ-3(앰버서더): 인플루언서 바이럴 뒤 반동의 수요 감소 폭이 절반', () => {
    const backlash = (unlocked: string[]) => {
      const s = game(unlocked);
      s.commerce.products.push({ id: 'P1', name: 'p', category: 'whisky', ageYears: null, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 60, typicity: 100, style: null, sourcedShare: 0, stockBottles: 100, price: 50_000, unitCost: 0, createdMonth: 0, lastMonthSold: 10, totalSold: 10 } as never);
      fireEvent(s, 'influencer_viral', rep(s));
      return s.world.modifiers.find((m) => m.label.endsWith('반동'))!.factor;
    };
    expect(backlash([])).toBeCloseTo(0.85, 10);
    expect(backlash(['BIZ-3'])).toBeCloseTo(1 - 0.15 * 0.5, 10);
  });
});

// 연구가 여는 선택 이벤트 (P-MGT-20) — PRO-3 장인 전수, BIZ-3 앰버서더 대응. 연구하지 않은 판은 아무 일도 없다
describe('연구 선택 이벤트 (P-MGT-20)', () => {
  /** 마스터 디스틸러가 은퇴까지 monthsLeft개월 남은 판 */
  const retiring = (unlocked: string[], monthsLeft = 6) => {
    const s = game(unlocked);
    const m = masterDistiller(s)!;
    m.ageAtHire = RETIRE_AGE - monthsLeft / 12 - (s.month - m.hiredMonth) / 12;
    s.hr.houseStyle = 50;
    return s;
  };

  it('PRO-3: 은퇴 12개월 안이면 전수 선택 이벤트가 한 번 뜬다 — 연구 전·은퇴가 멀면 안 뜬다', () => {
    const s = retiring(['PRO-3']);
    runEvents(s, rep(s), 1);
    expect(s.events.pending.filter((p) => p.defId === 'artisan_retire')).toHaveLength(1);
    // 다음 달: 기본값(그대로 보낸다)으로 처리되고 다시 묻지 않는다
    s.month += 1;
    runEvents(s, rep(s), 2);
    expect(s.events.pending.some((p) => p.defId === 'artisan_retire')).toBe(false);
    const none = retiring([]); runEvents(none, rep(none), 1);
    expect(none.events.pending.some((p) => p.defId === 'artisan_retire')).toBe(false);
    const far = retiring(['PRO-3'], 24); runEvents(far, rep(far), 1);
    expect(far.events.pending.some((p) => p.defId === 'artisan_retire')).toBe(false);
  });

  it('PRO-3 전수 기록: 2,000만, 부사수 없이 은퇴해도 하우스 스타일 90% 보존 (기록 없으면 0)', () => {
    const s = retiring(['PRO-3']);
    runEvents(s, rep(s), 1);
    const p = s.events.pending.find((x) => x.defId === 'artisan_retire')!;
    const cash = s.finance.cash;
    resolvePending(s, p.id, 0, rep(s));
    expect(cash - s.finance.cash).toBe(20_000_000);
    const notes: string[] = [];
    handleDeparture(s, masterDistiller(s)!, notes);
    expect(s.hr.houseStyle).toBe(45);
    const plain = retiring([]);
    handleDeparture(plain, masterDistiller(plain)!, []);
    expect(plain.hr.houseStyle).toBe(0);
  });

  it('전수 기록이 있으면 부사수 승계 손실도 10% → 1%', () => {
    const s = retiring([]);
    const m = masterDistiller(s)!;
    s.hr.staff.push({ ...m, id: 'S-heir', name: '부사수', level: 1, apprenticeOf: m.id, hiredMonth: s.month - 30 });
    s.month = 30;
    addModifier(s, 'house_style_loss', 0.1, 24, 'test');
    handleDeparture(s, m, []);
    expect(s.hr.houseStyle).toBe(Math.round(50 * 0.99));
  });

  it('BIZ-3: 바이럴 뒤 앰버서더 대응 선택 이벤트 — 고르면 반동 폭이 절반 더 준다(0.925 → 0.9625). 연구 전엔 안 뜬다', () => {
    const viral = (unlocked: string[]) => {
      const s = game(unlocked);
      s.commerce.products.push({ id: 'P1', name: 'p', category: 'whisky', ageYears: null, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 60, typicity: 100, style: null, sourcedShare: 0, stockBottles: 100, price: 50_000, unitCost: 0, createdMonth: 0, lastMonthSold: 10, totalSold: 10 } as never);
      fireEvent(s, 'influencer_viral', rep(s));
      return s;
    };
    const plain = viral([]);
    expect(plain.events.pending.some((p) => p.defId === 'ambassador_response')).toBe(false);
    const s = viral(['BIZ-3']);
    const p = s.events.pending.find((x) => x.defId === 'ambassador_response')!;
    expect(p).toBeTruthy();
    const back = () => s.world.modifiers.find((x) => x.label.endsWith('— 반동'))!.factor;
    expect(back()).toBeCloseTo(0.925, 10);
    resolvePending(s, p.id, 0, rep(s));
    expect(back()).toBeCloseTo(0.9625, 10);
  });
});
