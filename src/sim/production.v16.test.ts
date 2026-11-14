// F4 v16 대응 — PROD (결정 #308·#309·#325 고침, ARCH #494). 새 캠페인 규칙에서 후보·예비 보호·병입 적격이 어떻게 보이는지.
// `production.test.ts`에서 옛 규칙(`rules: 'legacy-v15'`)으로 분기된 테스트들의 v16 짝이다:
//   옛 판 — 보호를 푸는 것은 `flagship_sold` 마일스톤, 후보는 "판 끝(180개월)까지 12년을 채울 수 있는 몰트·그레인 통"
//   새 판 — 보호를 푸는 것은 `progress.win`, 예비 보호(지평 144) = 자가 몰트 통이면 처음부터, 안내(지평 36) = 목재 108개월부터, 그레인·매입·고객 소유는 후보가 아니다
import { describe, expect, it } from 'vitest';
import { applyAction, type Cask, type CampaignWin, type GameState, type Product, type SpiritLot } from './index';
import { delegateCheck } from './delegateCheck';
import { applyAutoRestock, autoRestockContest, autoRestockExcluded, autoRestockFloor, autoRestockSources, flagshipGuard, flagshipReserve, supplyHorizon } from './economics';
import { HINT_HORIZON_MONTHS, RESERVE_HORIZON_MONTHS, campaignWon, isFlagshipCandidate } from './ledger';
import { productLots } from './lots';
import { newScenarioGame } from './newScenario';
import { PROD_TUNING } from './prodTuning';
import { campaignMinOakMonths } from './rules';
import { candidateVolumes, flagshipCandidateCount, reserveCaskIds } from './tags';
import type { MonthReport } from './types';

const A = 144;
const WIN: CampaignWin = { month: 150, productId: 'P', lotId: 'P:150:0', kind: 'domestic', unitPrice: 120_000, bottles: 1 };
const BOTTLE = { name: '', targetAbv: 0.43, bottleMl: 700, chillFilter: false, packagingId: 'standard' } as const;

/** 새 캠페인(v16) 판 — 시작 통을 비우고 손으로 채운다 */
function v16(): GameState {
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
  s.inventory.casks = [];
  s.finance.cash = 5e9;
  return s;
}
/** 통 하나 — 원장 없이 만든다(새 판의 원장 없는 자가 원액은 `ledgerOf`가 self로 합성한다) */
function mk(s: GameState, id: string, oak: number, lot: Partial<SpiritLot> = {}, cask: Partial<Cask> = {}): Cask {
  const c = {
    id, typeId: 'ex_bourbon_barrel', sizeL: 200, wood: 'american_oak', activity: 1, seasoning: 1, fills: 1, recharCount: 0, char: 3,
    contents: { id: `L${id}`, name: id, kind: 'malt', volumeL: 190, abv: 0.6, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: oak, sourced: false, costPerLPA: 10_000, ...lot },
    ...cask,
  } as Cask;
  s.inventory.casks.push(c);
  return c;
}
const whisky = (id: string, years: number, over: Partial<Product> = {}): Product => ({
  id, name: `${years}년`, category: 'whisky', ageYears: years, oakMonths: years * 12, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: { cereal: 20 },
  quality: 70, typicity: 50, style: null, sourcedShare: 0, stockBottles: 0, price: 60_000, unitCost: 10_000, createdMonth: 0, lastMonthSold: 0, totalSold: 0, ...over,
}) as Product;
const ids = (xs: { comp: { id: string } }[]) => xs.map((x) => x.comp.id);
const act = (s: GameState, a: Parameters<typeof applyAction>[1]): GameState => {
  const r = applyAction(s, a);
  if (r.error) throw new Error(`${a.type}: ${r.error}`);
  return r.state;
};

describe('v16 예비 보호 — 지평 144: 자가 몰트 통은 처음부터 후보, 그중 목재 오래된 4통 ([결정 #325 고침])', () => {
  it('규칙 값 — A = 144 · 예비 지평 144 · 안내 지평 36 · 예비 통 수 4', () => {
    const s = v16();
    expect(campaignMinOakMonths(s)).toBe(A);
    expect(RESERVE_HORIZON_MONTHS).toBe(144);
    expect(HINT_HORIZON_MONTHS).toBe(36);
    expect(PROD_TUNING.flagshipReserve).toBe(4);
  });

  it('어린 통뿐이어도 가장 오래된 4통이 예비 — 자동 납품이 쓰지 않는다(옛 판은 판 초반에도 같았다 — 동작 유지)', () => {
    const s = v16();
    for (const [id, oak] of [['A', 14], ['B', 20], ['C', 26], ['D', 32], ['E', 38]] as const) mk(s, id, oak);
    expect([...reserveCaskIds(s)].sort()).toEqual(['B', 'C', 'D', 'E']);
    expect([...flagshipReserve(s)].sort()).toEqual(['B', 'C', 'D', 'E']); // economics.ts의 옛 이름도 같은 집합
    const p1 = whisky('W1', 1);
    expect(flagshipGuard(s, p1)).toBe(true);
    expect([...autoRestockExcluded(s, p1)].sort()).toEqual(['B', 'C', 'D', 'E']);
    expect(ids(autoRestockSources(s, p1))).toEqual(['A']); // 예비가 아닌 통만
  });

  it('그레인·매입·고객 소유 통은 더 오래돼도 예비 후보가 아니다 — 승리 자격이 없는 통이 자리를 차지하지 않는다(옛 판은 그레인·매입도 후보였다)', () => {
    const s = v16();
    for (const [id, oak] of [['A', 14], ['B', 20], ['C', 26], ['D', 32], ['E', 38]] as const) mk(s, id, oak);
    const grain = mk(s, 'G', 120, { kind: 'grain' });
    const bought = mk(s, 'S', 130, { sourced: true });
    const owned = mk(s, 'O', 140, {}, { owner: { name: '고객', soldMonth: 0, deliverMonth: 99 } });
    for (const c of [grain, bought, owned]) expect(isFlagshipCandidate(s, c, 'reserve')).toBe(false);
    expect([...reserveCaskIds(s)].sort()).toEqual(['B', 'C', 'D', 'E']);
    // 옛 판은 같은 통에서 그레인·매입 통이 오래된 순으로 예비 자리를 차지했다
    const old = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1, rules: 'legacy-v15' });
    old.inventory.casks = structuredClone(s.inventory.casks);
    expect([...reserveCaskIds(old)].sort()).toEqual(['D', 'E', 'G', 'S']);
  });

  it('플레이어가 직접 붙인 예비 태그는 그대로 보호되고, 후보인 직접 예비만 자리(4)를 차지한다 — 그레인 통에 붙인 예비는 자리를 쓰지 않는다', () => {
    let s = v16();
    for (const [id, oak] of [['A', 14], ['B', 20], ['C', 26], ['D', 32], ['E', 38]] as const) mk(s, id, oak);
    mk(s, 'G', 120, { kind: 'grain' });
    s = act(s, { type: 'tagCasks', caskIds: ['G', 'A'], add: ['flagship_reserve'] });
    // G(후보 아님)는 보호만 되고 자리를 쓰지 않는다 · A(후보)는 자리 하나를 쓴다 → 자동 예비는 오래된 3통
    expect([...reserveCaskIds(s)].sort()).toEqual(['A', 'C', 'D', 'E', 'G']);
  });

  it('승리(progress.win)하면 예비 보호가 풀린다 — flagship_sold 마일스톤만으로는 풀리지 않는다(옛 판 조건)', () => {
    const s = v16();
    for (const [id, oak] of [['A', 14], ['B', 20], ['C', 26], ['D', 32], ['E', 38]] as const) mk(s, id, oak);
    const p1 = whisky('W1', 1);
    s.progress.milestones.push({ id: 'flagship_sold', month: 0 } as never);
    expect(campaignWon(s)).toBe(false);
    expect(reserveCaskIds(s).size).toBe(4);
    expect(ids(autoRestockSources(s, p1))).toEqual(['A']);
    s.progress.win = WIN;
    expect(campaignWon(s)).toBe(true);
    expect(reserveCaskIds(s).size).toBe(0);
    expect(flagshipGuard(s, p1)).toBe(false);
    expect(candidateVolumes(s)).toBeNull();
    expect(ids(autoRestockSources(s, p1))).toEqual(['A', 'B', 'C', 'D', 'E']); // 어린 통부터 모두
  });

  it('12년 표기 제품의 자동 납품은 예비 통을 쓴다 — 예비 통이 바로 쓸 곳이다(승리 전에도)', () => {
    const s = v16();
    for (const [id, oak] of [['A', 150], ['B', 146], ['C', 100]] as const) mk(s, id, oak);
    const p12 = whisky('W12', 12);
    expect(flagshipGuard(s, p12)).toBe(false);
    expect(autoRestockExcluded(s, p12).size).toBe(0);
    expect(ids(autoRestockSources(s, p12))).toEqual(['B', 'A']); // 144개월 이상, 표기에 가까운 통부터
    expect(ids(autoRestockSources(s, whisky('W3', 3)))).toEqual([]); // 3년 제품은 예비 세 통을 쓰지 못한다
  });
});

describe("v16 안내·후보 수 — 지평 36: 목재 108개월부터 '곧 적격' ([결정 #325 고침] · #319와 같은 선)", () => {
  it('107개월 통은 안내 후보가 아니고 108개월 통부터 후보 — 예비 보호(처음부터)와 기준이 다르다', () => {
    const s = v16();
    const young = mk(s, 'Y', 20);
    const near = mk(s, 'N', A - HINT_HORIZON_MONTHS - 1);
    const soon = mk(s, 'H', A - HINT_HORIZON_MONTHS);
    const ready = mk(s, 'R', A);
    expect([young, near, soon, ready].map((c) => isFlagshipCandidate(s, c))).toEqual([false, false, true, true]);
    expect([young, near, soon, ready].map((c) => isFlagshipCandidate(s, c, 'reserve'))).toEqual([true, true, true, true]);
    expect(flagshipCandidateCount(s)).toBe(2);
    expect([...candidateVolumes(s)!.keys()].sort()).toEqual(['H', 'R']);
    expect(reserveCaskIds(s).size).toBe(4); // 네 통 모두 예비(오래된 4통)
  });

  it('그레인·매입 통은 150개월이어도 안내 후보가 아니다', () => {
    const s = v16();
    mk(s, 'G', 150, { kind: 'grain' });
    mk(s, 'S', 150, { sourced: true });
    expect(flagshipCandidateCount(s)).toBe(0);
  });

  it('맡기기 확인(delegateCheck)의 "플래그십 후보" 경고는 안내 지평(108개월부터)을 쓴다 — 어린 예비 통은 보호 태그 경고로만 알린다', () => {
    const s = v16();
    // 맡기기는 샘플 기록이 있는 통만 쓴다 — 기록을 손으로 붙인다
    const withLog = (c: Cask) => { c.samples = 1; c.sampleLog = [{ month: s.month, hex: { fruity: 30, floral: 20, sweet: 30, spicy: 20, smoky: 0, body: 30 }, quality: 70, sigma: 5 }] as never; return c; };
    withLog(mk(s, 'Y', 40));
    withLog(mk(s, 'H', 120));
    s.scenario!.locked = s.scenario!.locked.filter((k) => k !== 'action:delegateBlend' && k !== 'system:commissions');
    const target = { id: 'trend', source: 'trend', label: '유행', hex: { fruity: 30, floral: 20, sweet: 30, spicy: 20, smoky: 0, body: 30 } } as never;
    // 어린 통(40개월): 안내 후보가 아니다 → "플래그십 후보" 경고 없음. 예비(오래된 4통 안)라서 보호 태그 경고로 알린다
    const y = delegateCheck(s, target, ['Y'], 100, { ...BOTTLE });
    if ('error' in y) throw new Error(y.error);
    expect(y.casks).toMatchObject([{ id: 'Y', flagship: false }]);
    expect(y.protectedUsed).toEqual(['Y']);
    expect(y.warnings.some((w) => w.includes('플래그십 후보 통'))).toBe(false);
    expect(y.warnings.some((w) => w.includes('플래그십 예비 1개'))).toBe(true);
    // 120개월 통: 36개월 안에 12년을 채운다 → 후보 경고가 뜨고, 문구는 "판이 끝나기 전"이 아니라 안내 지평을 말한다(새 캠페인은 판 끝이 없다)
    const h = delegateCheck(s, target, ['H'], 100, { ...BOTTLE });
    if ('error' in h) throw new Error(h.error);
    expect(h.casks).toMatchObject([{ id: 'H', flagship: true }]);
    const warn = h.warnings.find((w) => w.includes('플래그십 후보 통 1개'))!;
    expect(warn).toContain(`${HINT_HORIZON_MONTHS}개월 안에 12년`);
    expect(warn).not.toContain('판이 끝나기 전');
    // 옛 판은 문구 그대로
    const old = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1, rules: 'legacy-v15' });
    old.inventory.casks = structuredClone(s.inventory.casks);
    old.scenario!.locked = s.scenario!.locked;
    const o = delegateCheck(old, target, ['H'], 100, { ...BOTTLE });
    if ('error' in o) throw new Error(o.error);
    expect(o.warnings.find((w) => w.includes('플래그십 후보 통'))).toContain('판이 끝나기 전 12년');
  });
});

describe('v16 짝 — 옛 판에서 flagship_sold로 보호를 끄던 테스트 4개: 승리 뒤에는 같은 결과, 승리 전에는 예비 4통이 먼저 빠진다', () => {
  it('자동 납품 통 하한(#267): 승리 전 — 6년 제품은 예비 통을 못 쓴다 · 승리 뒤 — 표기 하한 → 낮춘 하한 순서 그대로', () => {
    let s = v16();
    mk(s, 'A', 20); mk(s, 'B', 40); mk(s, 'C', 80);
    s.commerce.products.push(whisky('W6', 6, { price: 90_000 }));
    s = act(s, { type: 'setAutoRestock', productId: 'W6', months: 2 });
    const p = () => s.commerce.products.find((x) => x.id === 'W6')!;
    expect(autoRestockFloor(s, p())).toBe(72);
    expect(ids(autoRestockSources(s, p()))).toEqual([]); // 세 통 모두 예비(4통 이하) — 6년 < 12년 제품은 쓰지 못한다
    s.progress.win = WIN;
    expect(ids(autoRestockSources(s, p()))).toEqual(['C']); // 표기 하한 함정 — 가장 오래된 통만
    s = act(s, { type: 'setAutoRestock', productId: 'W6', months: 2, minMonths: 36 });
    expect(ids(autoRestockSources(s, p()))).toEqual(['B', 'C']); // 어린 통부터
    expect(applyAction(s, { type: 'setAutoRestock', productId: 'W6', months: 2, minMonths: 6 }).error).toContain('법정');
  });

  it('같은 레시피 통만(#293): 승리 뒤 — 레시피 거름 그대로 · 승리 전 — 거름을 통과한 통도 예비면 빠진다', () => {
    const s = v16();
    mk(s, 'A', 40, { recipeId: 'RA' }); mk(s, 'B', 40, { recipeId: 'RB' }); mk(s, 'N', 40); mk(s, 'A2', 30, { recipeId: 'RA' });
    for (const [id, oak] of [['X1', 90], ['X2', 91], ['X3', 92], ['X4', 93]] as const) mk(s, id, oak, { recipeId: 'RX' }); // 예비 자리를 채우는 오래된 네 통
    const w3 = (recipeIds?: string[]) => whisky('W3', 3, recipeIds ? { recipeIds } : {});
    // 승리 전: 예비는 X1~X4 → A·B·N은 그대로 쓰인다(레시피 거름만)
    expect([...reserveCaskIds(s)].sort()).toEqual(['X1', 'X2', 'X3', 'X4']);
    expect(ids(autoRestockSources(s, w3(['RA'])))).toEqual(['A']);
    expect(ids(autoRestockSources(s, w3(['RX'])))).toEqual([]); // 같은 레시피여도 예비 통은 못 쓴다
    s.progress.win = WIN;
    expect(ids(autoRestockSources(s, w3(['RA'])))).toEqual(['A']);
    expect(ids(autoRestockSources(s, w3(['RA', 'RB']))).sort()).toEqual(['A', 'B']);
    expect(ids(autoRestockSources(s, w3(['RX']))).sort()).toEqual(['X1', 'X2', 'X3', 'X4']);
    expect(supplyHorizon(s, { ...w3(['RA']), salesEma: 10 }).soonBottles).toBeGreaterThan(0); // 30개월 RA 통(A2)
    expect(supplyHorizon(s, { ...w3(['RB']), salesEma: 10 }).soonBottles).toBe(0);
  });

  it('다툼 경고(#297): 승리 뒤 — 긴 제품이 굶는 달에 짧은 제품이 어린 통을 가져가면 알린다(옛 판과 같다)', () => {
    const setup = () => {
      let s = v16();
      s.progress.win = WIN;
      s.commerce.products = [whisky('W1', 1), whisky('W3', 3)];
      s = act(s, { type: 'setAutoRestock', productId: 'W1', months: 2 });
      s = act(s, { type: 'setAutoRestock', productId: 'W3', months: 2 });
      return s;
    };
    const s = setup();
    mk(s, 'A', 20); mk(s, 'A2', 14);
    const c = autoRestockContest(s, s.commerce.products.find((x) => x.id === 'W1')!);
    expect(c?.rival.id).toBe('W3');
    expect(c?.rivalFloor).toBe(36);
    expect(autoRestockContest(s, s.commerce.products.find((x) => x.id === 'W3')!)).toBeNull();
    const report = { notes: [] as string[], expenses: {} } as never as MonthReport;
    applyAutoRestock(s, report);
    expect(report.notes.some((n) => n.includes('「1년」') && n.includes('「3년」'))).toBe(true);
    const u = setup();
    mk(u, 'A', 20); for (const id of ['O1', 'O2', 'O3', 'O4']) mk(u, id, 40);
    expect(autoRestockContest(u, u.commerce.products.find((x) => x.id === 'W1')!)).toBeNull(); // 긴 제품이 채울 통이 있으면 다툼이 아니다
  });

  it('공급 지평(#291): 승리 뒤 — 지금 채울 병·곧 닿는 병·지평이 옛 판과 같은 값 · 승리 전 — 예비 통은 "지금 채울 병"에 들어가지 않는다', () => {
    const s = v16();
    const p = whisky('W3', 3, { stockBottles: 50, salesEma: 100 });
    s.commerce.products = [p];
    for (const [id, oak] of [['READY', 40], ['SOON', 30], ['FAR', 10]] as const) mk(s, id, oak, { volumeL: 100 });
    const perCask = Math.floor((100 * 0.6) / (0.7 * 0.46)); // 60 LPA ÷ 병당 0.322 LPA = 186병
    // 승리 전: 세 통 모두 예비 → 3년 제품이 지금 쓸 통이 없다
    expect(supplyHorizon(s, p).readyBottles).toBe(0);
    s.progress.win = WIN;
    const h = supplyHorizon(s, p);
    expect(h.readyBottles).toBe(perCask);
    expect(h.soonBottles).toBe(perCask);
    expect(h.months).toBeCloseTo((50 + perCask) / 100, 6);
    expect(h.refillGap).toBe(false);
  });
});

describe('v16 병입 적격 — 병입·보충이 원장만 넘기고 `addLot`이 로트 계보로 판정한다 ([결정 #308·#309])', () => {
  const lotOf = (s: GameState, productId: string, i = 0) => productLots(s, productId)[i]!;
  const bottle = (s: GameState, components: { id: string; liters: number }[], restockId?: string) =>
    act(s, { type: 'bottle', components: components.map((c) => ({ source: 'cask' as const, ...c })), options: { ...BOTTLE, ...(restockId ? { restockId } : {}) } });

  it('경계 — 목재 143개월 통은 적격이 아니고 144개월 통은 적격', () => {
    let s = v16();
    mk(s, 'N', A - 1); mk(s, 'R', A);
    s = bottle(s, [{ id: 'N', liters: 20 }]);
    const n = s.commerce.products.at(-1)!;
    s = bottle(s, [{ id: 'R', liters: 20 }]);
    const r = s.commerce.products.at(-1)!;
    expect(lotOf(s, n.id).eligibleAtBottling).toBe(false);
    expect(lotOf(s, r.id).eligibleAtBottling).toBe(true);
    expect(lotOf(s, r.id).components!.every((e) => e.origin === 'self' && e.kindAtBirth === 'malt' && e.woodMonths === A)).toBe(true);
  });

  it('섞으면 가장 어린 구성 원액 기준 — 150개월 통에 100개월 통을 조금 섞어도 탈락 · 매입 원액이 섞여도 탈락', () => {
    let s = v16();
    mk(s, 'OLD', 150); mk(s, 'MID', 100); mk(s, 'BUY', 160, { sourced: true });
    s = bottle(s, [{ id: 'OLD', liters: 40 }, { id: 'MID', liters: 2 }]);
    expect(lotOf(s, s.commerce.products.at(-1)!.id).eligibleAtBottling).toBe(false);
    s = bottle(s, [{ id: 'OLD', liters: 40 }, { id: 'BUY', liters: 2 }]);
    const mixed = lotOf(s, s.commerce.products.at(-1)!.id);
    expect(mixed.eligibleAtBottling).toBe(false);
    expect(mixed.components!.some((e) => e.origin === 'sourced')).toBe(true);
    s = bottle(s, [{ id: 'OLD', liters: 40 }]);
    expect(lotOf(s, s.commerce.products.at(-1)!.id).eligibleAtBottling).toBe(true); // 같은 통만 쓰면 적격
  });

  it('그레인 통을 섞은 블렌디드는 숙성이 길어도 적격이 아니다(싱글 몰트만)', () => {
    let s = v16();
    mk(s, 'M', 150); mk(s, 'G', 150, { kind: 'grain' });
    s = bottle(s, [{ id: 'M', liters: 30 }, { id: 'G', liters: 30 }]);
    const p = s.commerce.products.at(-1)!;
    expect(p.category).toBe('blended_whisky');
    expect(lotOf(s, p.id).eligibleAtBottling).toBe(false);
  });

  it('보충 — 어린 제품에 적격 통을 보충하면 **새 로트만** 적격이고 옛 로트는 그대로 아니다(FIFO: 옛 병이 먼저 팔린다)', () => {
    let s = v16();
    mk(s, 'YOUNG', 40); mk(s, 'OLD', 150);
    s = bottle(s, [{ id: 'YOUNG', liters: 20 }]);
    const p = s.commerce.products.at(-1)!;
    s = bottle(s, [{ id: 'OLD', liters: 20 }], p.id);
    const lots = productLots(s, p.id);
    expect(lots.map((l) => l.eligibleAtBottling)).toEqual([false, true]);
    expect(s.commerce.products.find((x) => x.id === p.id)!.ageYears).toBe(3); // 제품 표기는 가장 어린 원액(#186) — 적격은 로트로만 본다
  });

  it('옛 판(legacy-v15)은 같은 144개월 통을 병입해도 로트가 적격이 아니다 — 원장 없는 옛 원액은 출처 미상(증거 창작 금지)', () => {
    let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1, rules: 'legacy-v15' });
    s.inventory.casks = [];
    mk(s, 'R', A);
    s = bottle(s, [{ id: 'R', liters: 20 }]);
    const lot = lotOf(s, s.commerce.products.at(-1)!.id);
    expect(lot.components![0]!.origin).toBe('unknown');
    expect(lot.eligibleAtBottling).toBe(false);
  });
});

describe('v16 그레인 프리셋 — 새 캠페인에서 그레인 레시피를 만들 길 ([결정 #311·#322] F5a, P-PROD-57)', () => {
  it('새 판(v16): 그레인 주종이 열려 있고 "프리셋으로 시작"에 그레인 프리셋이 **맨 뒤에** 있다 — 시작 레시피·전역 id는 옛 판과 같다', async () => {
    const { craftPresets } = await import('./production');
    const { isLocked } = await import('./scenario');
    const neu = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    const old = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1, rules: 'legacy-v15' });
    expect(isLocked(neu, 'kind:grain')).toBe(false);
    expect(isLocked(old, 'kind:grain')).toBe(true);
    const presets = craftPresets(neu);
    expect(presets.at(-1)).toMatchObject({ name: '그레인 — 옥수수', kind: 'grain', runs: 2 });
    expect(presets.filter((p) => p.kind === 'grain')).toHaveLength(1);
    // 옛 판: 프리셋 목록이 그대로(그레인 없음) — v16 목록에서 그레인만 뺀 것과 같다
    expect(craftPresets(old).map((p) => p.name)).toEqual(presets.slice(0, -1).map((p) => p.name));
    // 시작 레시피·id 카운터는 두 규칙이 같다 — 프리셋은 버튼일 뿐 생성 때 id를 쓰지 않는다(옛 판·v16 판 출력 불변)
    expect(neu.production.recipes.map((r) => [r.id, r.name])).toEqual(old.production.recipes.map((r) => [r.id, r.name]));
    expect(neu.production.recipes.some((r) => r.kind === 'grain')).toBe(false);
    expect(neu.nextId).toBe(old.nextId);
  });

  it('프리셋 → 저장 → 생산 지시 → 통입 → 12개월 뒤 그레인 위스키 병입까지 막힘이 없다(시작 설비 단식 증류기 그대로) · 옛 판은 저장부터 막힌다', async () => {
    const { advanceMonth } = await import('./index');
    const { craftPresets, presetAsRecipe, validateRecipe } = await import('./production');
    let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
    s.finance.cash = 5e9;
    const preset = craftPresets(s).find((p) => p.kind === 'grain')!;
    const malt = s.production.recipes.find((r) => r.kind === 'malt')!;
    const { id: _id, ...recipe } = presetAsRecipe(s, preset, malt);
    expect(validateRecipe(s, { ...recipe, id: 'new' })).toEqual([]);
    s = act(s, { type: 'saveRecipe', recipe });
    const grain = s.production.recipes.find((r) => r.kind === 'grain')!;
    s.production.orders = [];
    s = act(s, { type: 'setOrder', recipeId: grain.id, batchesPerMonth: 4 });
    s = advanceMonth(s);
    const lot = s.inventory.lots.find((l) => l.kind === 'grain')!;
    expect(lot.abv).toBeGreaterThan(0.6); // 2회 증류 — 통입 하한 40%를 넘는다
    expect(lot.components![0]).toMatchObject({ origin: 'self', kindAtBirth: 'grain' });
    const cask = s.inventory.casks.find((c) => !c.contents)!;
    s.production.orders = [];
    s = act(s, { type: 'fillCasks', lotId: lot.id, caskIds: [cask.id], entryAbv: 0.635 });
    for (let i = 0; i < 12; i++) s = advanceMonth(s);
    s = act(s, { type: 'bottle', components: [{ source: 'cask', id: cask.id, liters: 30 }], options: { ...BOTTLE } });
    const p = s.commerce.products.at(-1)!;
    expect(p.category).toBe('grain_whisky');
    expect(productLots(s, p.id)[0]!.eligibleAtBottling).toBe(false); // 그레인은 승리 자격이 없다(싱글 몰트만)
    // 옛 판은 주종 잠금으로 저장부터 막힌다
    const old = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1, rules: 'legacy-v15' });
    expect(applyAction(old, { type: 'saveRecipe', recipe }).error).toBeTruthy();
  });
});
