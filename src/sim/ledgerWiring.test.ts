// F2 원장·F3 병입 로트 — PROD 지점 연결 ([결정 #308·#323], P-PROD-55 지점표 1·2·4~15·17·18 + 로트 생성·단종)
// 지점마다: 로트 필드(출력의 정본)는 그대로이고, 원장이 같은 사건에서 함께 움직여 R2(Σ LPA·Σ 원가)와 전제 2(min 목재 개월 = oakMonths)가 산다
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { advanceMonth, applyAction, emptyCaskOf, type Cask, type GameState, type LedgerEntry, type MonthReport, type SpiritLot } from './index';
import { CASK_COST_SHARE_PER_FILL, CASKS } from './content/catalog';
import { applyEffects } from './events';
import { checkInvariants } from './invariants';
import { ledgerEligibility, ledgerError, lpaOf, newEntry, EXTERNAL_SITE_ID } from './ledger';
import { addLot, lotBottles, productLots } from './lots';
import { FINISH } from './maturation';
import { newGame } from './newGame';
import { newScenarioGame } from './newScenario';
import { rngFor } from './rng';

const act = (s: GameState, a: Parameters<typeof applyAction>[1]): GameState => {
  const r = applyAction(s, a);
  if (r.error) throw new Error(`${a.type}: ${r.error}`);
  return r.state;
};
const sumLPA = (c: readonly LedgerEntry[] | undefined) => (c ?? []).reduce((t, e) => t + e.contribLPA, 0);
const sumCost = (c: readonly LedgerEntry[] | undefined) => (c ?? []).reduce((t, e) => t + e.costKRW, 0);
const costOf = (l: SpiritLot) => l.costPerLPA * lpaOf(l);
const filled = (s: GameState) => s.inventory.casks.filter((c): c is Cask & { contents: SpiritLot } => !!c.contents);
const caskOf = (s: GameState, id: string) => s.inventory.casks.find((c) => c.id === id)!;
const BOTTLE = { name: '', targetAbv: 0.43, bottleMl: 700, chillFilter: false, packagingId: 'standard' } as const;

/** MVP 소규모 판 — 몰트만 n배치 지시하고 `months`달 진행(통입은 하지 않는다). 자동 통입·자동 샘플은 끈다(지점을 하나씩 본다) */
function game(months = 1, batches = 2): GameState {
  let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
  s.finance.cash = 5e9;
  s = act(s, { type: 'setAutoSample', settings: { off: true } });
  const malt = s.production.recipes.find((r) => r.kind === 'malt')!;
  s.production.orders = [];
  s = act(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: batches });
  for (let i = 0; i < months; i++) s = advanceMonth(s);
  return s;
}
const tank = (s: GameState) => s.inventory.lots.find((l) => l.kind === 'malt')!;
/** 탱크 몰트를 빈 통 n개에 통입 */
function fill(s: GameState, n: number): { s: GameState; ids: string[] } {
  const ids = s.inventory.casks.filter((c) => !c.contents).slice(0, n).map((c) => c.id);
  return { s: act(s, { type: 'fillCasks', lotId: tank(s).id, caskIds: ids, entryAbv: 0.635 }), ids };
}

describe('지점 1·2 — 생산이 원장을 만들고, 탱크 합치기가 이어 붙인다', () => {
  it('첫 달 생산 로트 = 자가 구성 원액 한 줄(목재 0개월, 이 입지) · R2', () => {
    const l = tank(game(1));
    expect(l.components).toHaveLength(1);
    expect(l.components![0]).toMatchObject({ origin: 'self', kindAtBirth: 'malt', woodMonths: 0, batchId: l.batchId });
    expect(sumLPA(l.components)).toBeCloseTo(lpaOf(l), 9);
    expect(sumCost(l.components)).toBeCloseTo(costOf(l), 3);
    expect(ledgerError(l)).toBeNull();
  });

  it('둘째 달 합치기 — 키가 같아 한 줄로 합쳐지고(R6) 사라진 배치는 parents에, LPA·원가는 합', () => {
    const one = tank(game(1));
    const two = tank(game(2));
    expect(two.components).toHaveLength(1);
    expect(two.components![0]!.parents?.map((p) => p.batchId)).toContain(one.batchId);
    expect(sumLPA(two.components)).toBeCloseTo(lpaOf(two), 9);
    expect(ledgerError(two)).toBeNull();
  });

  it('원장이 없는 탱크(옛 세이브·연결 전)에 새 원액이 합쳐지면 없는 쪽은 합성해 잇는다 — R2가 깨지지 않는다', () => {
    let s = game(1);
    const i = s.inventory.lots.findIndex((l) => l.kind === 'malt');
    const { components: _drop, ...bare } = s.inventory.lots[i]!;
    s.inventory.lots[i] = bare;
    s = advanceMonth(s);
    expect(tank(s).components?.length).toBeGreaterThan(0);
    expect(ledgerError(tank(s))).toBeNull();
    expect(checkInvariants(s).errors).toEqual([]);
  });
});

describe('지점 4·5·6 — 통입은 분할 + 통값 배분, 취소는 통값만 되돌리고, 원액 빼기는 원가가 함께 나간다', () => {
  it('통입: 통 원장 Σ LPA = 통 LPA · 원가 = 원액 몫 + 통값 배분 · 남은 탱크 + 통 = 통입 전(LPA 보존)', () => {
    const s0 = game(2, 6);
    const before = tank(s0);
    const { s, ids } = fill(s0, 2);
    const casks = ids.map((id) => caskOf(s, id).contents!);
    for (const c of casks) {
      expect(c.components![0]).toMatchObject({ origin: 'self', woodMonths: 0 });
      expect(ledgerError(c)).toBeNull();
      const share = CASKS[caskOf(s, ids[0]!).typeId].price * CASK_COST_SHARE_PER_FILL;
      expect(sumCost(c.components)).toBeCloseTo(before.costPerLPA * lpaOf(c) + share, 2);
    }
    const rest = tank(s);
    expect(ledgerError(rest)).toBeNull();
    expect(sumLPA(rest.components) + casks.reduce((t, c) => t + sumLPA(c.components), 0)).toBeCloseTo(lpaOf(before), 6);
  });

  it('통입 취소(같은 달): 원장 원가에서 통값 배분만 빠진다 — LPA·목재 개월 그대로', () => {
    const { s: s1, ids } = fill(game(2, 6), 1);
    const inCask = caskOf(s1, ids[0]!).contents!;
    const s2 = act(s1, { type: 'unfillCask', caskId: ids[0]! });
    const back = s2.inventory.lots.at(-1)!;
    expect(ledgerError(back)).toBeNull();
    expect(sumLPA(back.components)).toBeCloseTo(sumLPA(inCask.components), 9);
    expect(sumCost(inCask.components) - sumCost(back.components)).toBeCloseTo(CASKS[caskOf(s1, ids[0]!).typeId].price * CASK_COST_SHARE_PER_FILL, 2);
  });

  it('원액 빼기(다음 달부터): 손실 0.75%만큼 LPA와 원가가 같은 비율로 준다(유출) · 목재 개월은 원액에 남고 다시 통입하면 이어서 센다', () => {
    let { s, ids } = fill(game(2, 6), 1);
    for (let i = 0; i < 3; i++) s = advanceMonth(s);
    const inCask = caskOf(s, ids[0]!).contents!;
    expect(inCask.components![0]!.woodMonths).toBe(3);
    s = act(s, { type: 'unfillCask', caskId: ids[0]! });
    const out = s.inventory.lots.at(-1)!;
    expect(ledgerError(out)).toBeNull();
    expect(sumLPA(out.components)).toBeCloseTo(sumLPA(inCask.components) * (1 - FINISH.lossShare), 9);
    expect(sumCost(out.components)).toBeCloseTo(sumCost(inCask.components) * (1 - FINISH.lossShare), 3);
    expect(out.components![0]!.woodMonths).toBe(3);
    // 탱크에서 한 달 — 목재 개월은 늘지 않는다(R3) → 다시 통입해 한 달 → 4
    s = advanceMonth(s);
    expect(s.inventory.lots.find((l) => l.id === out.id)!.components![0]!.woodMonths).toBe(3);
    const empty = s.inventory.casks.find((c) => !c.contents)!;
    s = act(s, { type: 'fillCasks', lotId: out.id, caskIds: [empty.id], entryAbv: 0.6 });
    s = advanceMonth(s);
    const again = caskOf(s, empty.id).contents!;
    expect(again.oakMonths).toBe(4);
    expect(again.components![0]!.woodMonths).toBe(4);
    expect(ledgerError(again)).toBeNull();
  });
});

describe('지점 7·8·9·10 — 숙성은 나무 통에서만 목재 개월 +1, 증발·누수는 원가를 남긴다', () => {
  it('나무 통 12개월: 목재 개월 = oakMonths = 12 · 증발로 LPA는 줄고 총원가는 그대로(보존) · 매달 R2', () => {
    let { s, ids } = fill(game(2, 6), 3);
    const cost0 = sumCost(caskOf(s, ids[0]!).contents!.components);
    const lpa0 = sumLPA(caskOf(s, ids[0]!).contents!.components);
    for (let i = 0; i < 12; i++) { s = advanceMonth(s); expect(checkInvariants(s).errors).toEqual([]); }
    const c = caskOf(s, ids[0]!).contents!;
    expect(c.oakMonths).toBe(12);
    expect(c.components!.map((e) => e.woodMonths)).toEqual([12]);
    expect(sumLPA(c.components)).toBeLessThan(lpa0);
    expect(sumCost(c.components)).toBeCloseTo(cost0, 2);
  });

  it('옹기 6개월: restMonths만 늘고 목재 개월은 0 그대로(탱크·옹기·병 불산입) · R2', () => {
    let s = game(2, 6);
    const jar = emptyCaskOf(s, 'onggi_jar');
    s.inventory.casks.push(jar);
    s = act(s, { type: 'fillCasks', lotId: tank(s).id, caskIds: [jar.id], entryAbv: 0.6 });
    for (let i = 0; i < 6; i++) s = advanceMonth(s);
    const c = caskOf(s, jar.id).contents!;
    expect(c.restMonths).toBe(6);
    expect(c.oakMonths).toBe(0);
    expect(c.components!.every((e) => e.woodMonths === 0)).toBe(true);
    expect(ledgerError(c)).toBeNull();
  });

  it('손실 사건(R5): 숙성 달의 결산에 증발이 월 합계 한 줄로 남는다 — 원가는 남으므로 0', () => {
    let { s } = fill(game(2, 6), 3);
    s = advanceMonth(s);
    const ev = s.history.reports.at(-1)!.lossEvents?.filter((e) => e.kind === 'evaporation') ?? [];
    expect(ev).toHaveLength(1);
    expect(ev[0]!.lpa).toBeGreaterThan(0);
    expect(ev[0]!.costKRW).toBe(0);
  });

  it('매입 통에 원장이 있어도(지점 25가 켜진 뒤) 한 달 숙성 뒤 R2가 살고 출처는 매입 그대로다', () => {
    let s = newGame({ seed: 7 });
    s = act(s, { type: 'buyBrokerCask', offerId: s.b2b.brokerOffers[0]!.id });
    const bought = s.inventory.casks.at(-1)!;
    bought.contents!.components = [newEntry(bought.contents!, 'sourced', EXTERNAL_SITE_ID)];
    const wood = bought.contents!.oakMonths;
    s = advanceMonth(s);
    const after = caskOf(s, bought.id).contents!;
    expect(ledgerError(after)).toBeNull();
    expect(after.components![0]).toMatchObject({ origin: 'sourced', siteId: EXTERNAL_SITE_ID, woodMonths: wood + 1 });
    expect(ledgerEligibility(s, after.components!).eligible).toBe(false);
  });
});

describe('지점 11·12·13 — 샘플은 유출, 피니싱 옮기기는 보존 + 통값, 사고 손실은 보존', () => {
  it('샘플: 0.1L만큼 LPA와 원가가 같은 비율로 준다 · R2', () => {
    let { s, ids } = fill(game(2, 6), 1);
    s = advanceMonth(s);
    const before = caskOf(s, ids[0]!).contents!;
    s = act(s, { type: 'sampleCask', caskIds: [ids[0]!] });
    const after = caskOf(s, ids[0]!).contents!;
    const k = after.volumeL / before.volumeL;
    expect(k).toBeLessThan(1);
    expect(ledgerError(after)).toBeNull();
    expect(sumCost(after.components)).toBeCloseTo(sumCost(before.components) * k, 3);
  });

  it('피니싱: 옮겨도 목재 개월이 이어지고(원 통 + 피니싱 통의 실제 합), 손실은 원가를 남기며 새 통값이 더해진다', () => {
    let { s, ids } = fill(game(2, 6), 1);
    for (let i = 0; i < 4; i++) s = advanceMonth(s);
    s.scenario!.locked = s.scenario!.locked.filter((k) => k !== 'action:transferCask');
    const butt = emptyCaskOf(s, 'oloroso_butt');
    s.inventory.casks.push(butt);
    const before = caskOf(s, ids[0]!).contents!;
    s = act(s, { type: 'transferCask', fromCaskId: ids[0]!, toCaskId: butt.id });
    const moved = caskOf(s, butt.id).contents!;
    expect(ledgerError(moved)).toBeNull();
    expect(moved.components![0]!.woodMonths).toBe(4);
    expect(sumLPA(moved.components)).toBeCloseTo(sumLPA(before.components) * (1 - FINISH.lossShare), 9);
    expect(sumCost(moved.components)).toBeCloseTo(sumCost(before.components) + CASKS.oloroso_butt.price * CASK_COST_SHARE_PER_FILL, 2);
    for (let i = 0; i < 6; i++) s = advanceMonth(s);
    const fin = caskOf(s, butt.id).contents!;
    expect(fin.components![0]!.woodMonths).toBe(10);
    expect(ledgerError(fin)).toBeNull();
  });

  it('사고(침수 원액 손실·통 소실): 남은 통은 R2가 살고, 결산이 있으면 손실 사건이 남는다', () => {
    const { s } = fill(game(2, 6), 4);
    const report = { month: s.month } as MonthReport;
    const lpa0 = filled(s).reduce((t, c) => t + lpaOf(c.contents), 0);
    applyEffects(s, [{ type: 'caskVolumeLoss', share: 0.02 }], rngFor(1, 1, 't'), '침수', undefined, report);
    for (const c of filled(s)) expect(ledgerError(c.contents)).toBeNull();
    expect(report.lossEvents?.[0]).toMatchObject({ kind: 'incident', costKRW: 0 });
    expect(report.lossEvents![0]!.lpa).toBeCloseTo(lpa0 * 0.02, 6);
    const n = filled(s).length;
    applyEffects(s, [{ type: 'caskLoss', share: [0.5, 0.5] }], rngFor(1, 2, 't'), '화재', undefined, report);
    expect(filled(s).length).toBeLessThan(n);
    expect(report.lossEvents![0]!.costKRW).toBeGreaterThan(0); // 소실은 원가도 함께 사라진다
    expect(checkInvariants(s).errors).toEqual([]);
  });
});

describe('지점 17·18 + F3 로트 생성 — 병입은 원장을 떼어 병입 로트에 이어 붙이고, 보충은 새 로트다', () => {
  /** 25개월 통 하나 + 그 뒤 통입한 13개월 통 하나 (둘 다 한국 법정 숙성 12개월을 넘긴 위스키) */
  function twoAges(): { s: GameState; old: string; young: string } {
    let { s, ids } = fill(game(2, 6), 1);
    for (let i = 0; i < 12; i++) s = advanceMonth(s);
    const b = fill(s, 1);
    s = b.s;
    for (let i = 0; i < 13; i++) s = advanceMonth(s);
    return { s, old: ids[0]!, young: b.ids[0]! };
  }

  it('두 통을 섞어 병입: 병입 로트 원장에 두 목재 개월이 **평균 없이** 남고, 적격은 가장 어린 구성 원액으로 본다 · 남은 통은 R2 · 로트 합 = 재고', () => {
    const { s: s0, old, young } = twoAges();
    const oldLot = caskOf(s0, old).contents!;
    const youngLot = caskOf(s0, young).contents!;
    const s = act(s0, { type: 'bottle', components: [{ source: 'cask', id: old, liters: 40 }, { source: 'cask', id: young, liters: 20 }], options: { ...BOTTLE } });
    const p = s.commerce.products.at(-1)!;
    const lots = productLots(s, p.id);
    expect(lots).toHaveLength(1);
    expect(lots[0]!.bottles).toBe(p.stockBottles);
    expect(lotBottles(s, p.id)).toBe(p.stockBottles);
    const comp = lots[0]!.components!;
    expect(comp.map((e) => e.woodMonths).sort((a, b) => a - b)).toEqual([youngLot.oakMonths, oldLot.oakMonths]);
    expect(sumLPA(comp)).toBeCloseTo(40 * oldLot.abv + 20 * youngLot.abv, 6);
    expect(ledgerEligibility(s, comp).woodMonths).toBe(youngLot.oakMonths);
    expect(lots[0]!.eligibleAtBottling).toBeUndefined(); // F4가 채운다
    for (const id of [old, young]) {
      const rest = caskOf(s, id).contents!;
      expect(ledgerError(rest)).toBeNull();
    }
    expect(sumLPA(caskOf(s, old).contents!.components)).toBeCloseTo(sumLPA(oldLot.components) - 40 * oldLot.abv, 6);
    const inv = checkInvariants(s);
    expect(inv.errors).toEqual([]);
    expect(inv.warnings.filter((w) => w.includes('로트 합'))).toEqual([]);
  });

  it('보충: 제품 칸은 합쳐지지만 로트는 **새로 하나 더** 생긴다(FIFO — 옛 병과 새 병의 계보가 섞이지 않는다)', () => {
    const { s: s0, old, young } = twoAges();
    let s = act(s0, { type: 'bottle', components: [{ source: 'cask', id: young, liters: 20 }], options: { ...BOTTLE } });
    const p = s.commerce.products.at(-1)!;
    s = act(s, { type: 'bottle', components: [{ source: 'cask', id: old, liters: 20 }], options: { ...BOTTLE, restockId: p.id } });
    const lots = productLots(s, p.id);
    expect(lots).toHaveLength(2);
    expect(lots.map((l) => l.components![0]!.woodMonths)).toEqual([caskOf(s0, young).contents!.oakMonths, caskOf(s0, old).contents!.oakMonths]);
    expect(lotBottles(s, p.id)).toBe(s.commerce.products.find((x) => x.id === p.id)!.stockBottles);
    expect(checkInvariants(s).errors).toEqual([]);
  });

  it('원장이 없는 원액(옛 세이브)도 병입 로트에는 합성 원장이 붙는다 — 옛 판은 unknown이라 적격이 아니다(증거 창작 금지)', () => {
    const { s: s0, old } = twoAges();
    const s1 = structuredClone(s0);
    delete caskOf(s1, old).contents!.components;
    s1.rulesVersion = 'legacy-v15';
    const s = act(s1, { type: 'bottle', components: [{ source: 'cask', id: old, liters: 20 }], options: { ...BOTTLE } });
    const comp = productLots(s, s.commerce.products.at(-1)!.id)[0]!.components!;
    expect(comp[0]!.origin).toBe('unknown');
    expect(caskOf(s, old).contents!.components).toBeUndefined(); // 남은 통에 원장을 지어내지 않는다
  });

  it('단종: 제품을 지우면 그 로트도 지운다', () => {
    const { s: s0, young } = twoAges();
    let s = act(s0, { type: 'bottle', components: [{ source: 'cask', id: young, liters: 20 }], options: { ...BOTTLE } });
    const p = s.commerce.products.at(-1)!;
    s.commerce.products.find((x) => x.id === p.id)!.stockBottles = 0;
    s.commerce.lots = [];
    addLot(s, p.id, 3);
    s = act(s, { type: 'archiveProduct', productId: p.id });
    expect(productLots(s, p.id)).toEqual([]);
  });
});

describe('전 판 — 자동 통입·자동 샘플·병입·판매가 함께 도는 36개월', () => {
  it('매달 불변식 오류 0 · 모든 통 원액이 원장을 갖고 min(목재 개월) = oakMonths · 구성 원액 수는 작게 유지된다(R6)', () => {
    let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 3 });
    s.finance.cash = 5e9;
    s.production.orders = [];
    s = act(s, { type: 'setOrder', recipeId: s.production.recipes.find((r) => r.kind === 'malt')!.id, batchesPerMonth: 4 });
    let bottled = false;
    for (let m = 0; m < 36; m++) {
      const lot = s.inventory.lots.find((l) => l.kind === 'malt' && l.volumeL > 250);
      const empties = s.inventory.casks.filter((c) => !c.contents && !c.contamination).slice(0, 3).map((c) => c.id);
      if (lot && empties.length) s = act(s, { type: 'fillCasks', lotId: lot.id, caskIds: empties, entryAbv: 0.635 });
      const aged = filled(s).find((c) => c.contents.kind === 'malt' && c.contents.oakMonths >= 13 && !c.owner);
      if (aged && m % 6 === 0) { s = act(s, { type: 'bottle', components: [{ source: 'cask', id: aged.id, liters: Math.min(60, aged.contents.volumeL) }], options: { ...BOTTLE } }); bottled = true; }
      s = advanceMonth(s);
      const inv = checkInvariants(s, 50);
      expect(inv.errors).toEqual([]);
      expect(inv.warnings.filter((w) => w.includes('로트 합'))).toEqual([]);
    }
    expect(bottled).toBe(true);
    const casks = filled(s);
    expect(casks.length).toBeGreaterThan(5);
    for (const c of casks) {
      expect(c.contents.components?.length).toBeGreaterThan(0);
      expect(Math.min(...c.contents.components!.map((e) => e.woodMonths))).toBe(c.contents.oakMonths);
      expect(c.contents.components!.length).toBeLessThanOrEqual(2);
    }
  });
});

describe('모듈 순환 방지', () => {
  it('maturation.ts는 ledger.ts를 불러오지 않는다 — 불러오면 ledger → progress → blending → blendTable → maturation 순환으로 초기화 순서가 깨진다', () => {
    const src = readFileSync(new URL('./maturation.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from '\.\/ledger'/);
  });
});
