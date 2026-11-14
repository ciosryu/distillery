// 가치평가 3종·관측 품질·권리 최소형 (F5b 코어 ARCH — [결정 #310 2단계 · #317 · #326]) — REQ-CORE-5 수용 테스트 1~6 (core-integration §5 `valuation:`)
import { describe, expect, it } from 'vitest';
import { advanceMonth, applyAction, emptyCaskOf, newGame, type Cask, type GameState, type SpiritLot } from './index';
import { inventoryCollateral, inventoryLoanRoom } from './loans';
import { newScenarioGame } from './newScenario';
import { netWorth, netWorthLegacy } from './progress';
import { autoFillCasks } from './autoFill';
import { BOTTLE_LIQ, QHAT_PRIOR, bookValue, bottleStockValue, collateralValue, estimatedValue, liquidationValue, prepaidObligations, qHat, trueQualityOf } from './valuation';

const v16 = (seed = 1) => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed });
const legacy = (seed = 1) => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed, rules: 'legacy-v15' });
/** 자가 몰트 통 — 향미로 참 품질이 정해진다(숨은 값) */
function malt(s: GameState, id: string, flavor: Record<string, number>, over: Partial<Cask> = {}): Cask & { contents: SpiritLot } {
  const c = emptyCaskOf(s, 'ex_bourbon_barrel'); c.id = id;
  c.contents = { id: `L${id}`, name: id, kind: 'malt', volumeL: 180, abv: 0.6, flavor: { cereal: 20, ...flavor }, createdMonth: 0, oakMonths: 36, sourced: false, costPerLPA: 12_000 };
  Object.assign(c, over);
  s.inventory.casks.push(c);
  return c as Cask & { contents: SpiritLot };
}
const stripInventory = (s: GameState) => { s.inventory.casks = s.inventory.casks.filter((c) => !c.contents); s.inventory.lots = []; s.commerce.products = []; };

describe('valuation: 같은 관측 · 다른 참 품질 → ①②③ · 담보 한도 같다 (REQ-CORE-5 1)', () => {
  it('샘플 기록이 같고 향미(참 품질)만 다른 짝 상태에서 세 값·담보 가치가 같다 — 옛 식(참 품질)은 다르다', () => {
    const a = v16(); stripInventory(a); a.month = 40;
    const b = structuredClone(a);
    const ca = malt(a, 'C', { vanilla_caramel: 10 }); const cb = malt(b, 'C', { vanilla_caramel: 60, sherry_fruit: 50 });
    expect(trueQualityOf(ca)).not.toBe(trueQualityOf(cb)); // 참 품질은 다르다
    for (const c of [ca, cb]) c.sampleLog = [{ month: 30, hex: { peat: 0, fruit: 0, floral: 0, cereal: 0, wood: 0, sweet: 0 } as never, sigma: 6, estQuality: 58 }];
    expect(qHat(a, ca)).toBe(58); expect(qHat(b, cb)).toBe(58);
    expect(bookValue(a)).toBe(bookValue(b));
    expect(estimatedValue(a)).toBe(estimatedValue(b));
    expect(liquidationValue(a)).toBe(liquidationValue(b));
    expect(netWorth(a)).toBe(netWorth(b));
    expect(collateralValue(a)).toBe(collateralValue(b));
    expect(inventoryCollateral(a)).toBe(inventoryCollateral(b));
    expect(netWorthLegacy(a)).not.toBe(netWorthLegacy(b)); // 옛 식은 참 품질을 읽는다
  });

  it('q̂ — 자기 샘플(가장 최근) → 형제 기록 없으면 사전값(P25 자리) · 사전값은 평균보다 낮은 보수값', () => {
    const s = v16(); stripInventory(s);
    const c = malt(s, 'C', {});
    expect(qHat(s, c)).toBe(QHAT_PRIOR.malt);
    c.sampleLog = [{ month: 1, hex: {} as never, sigma: 6, estQuality: 40 }, { month: 5, hex: {} as never, sigma: 6, estQuality: 66 }];
    expect(qHat(s, c)).toBe(66);
    expect(QHAT_PRIOR.malt).toBeLessThan(60);
  });
});

describe('valuation: 고객 소유·선판매·담보 권리 (REQ-CORE-5 2·3·4, #326 최소형)', () => {
  it('고객 소유 통은 세 값 모두 0 · 선판매(rights.presold) 통은 평가·담보에서 빠지고 · 담보 잡힌(rights.lien) 통은 평가에는 들고 담보에서만 빠진다', () => {
    const s = v16(); stripInventory(s); s.month = 40;
    const base = { book: bookValue(s), est: estimatedValue(s), liq: liquidationValue(s), col: collateralValue(s) };
    malt(s, 'O', {}, { owner: { name: '고객', soldMonth: 1, deliverMonth: 99 } });
    expect(bookValue(s)).toBe(base.book); expect(estimatedValue(s)).toBe(base.est); expect(liquidationValue(s)).toBe(base.liq); expect(collateralValue(s)).toBe(base.col);
    malt(s, 'P', {}, { rights: { presold: 'K1' } });
    expect(liquidationValue(s)).toBe(base.liq); expect(collateralValue(s)).toBe(base.col);
    malt(s, 'L', {}, { rights: { lien: 'inventory' } });
    expect(liquidationValue(s)).toBeGreaterThan(base.liq); // 평가에는 든다
    expect(collateralValue(s)).toBe(base.col); // 담보에서는 빠진다 — 이중 담보 0
    malt(s, 'F', {});
    expect(collateralValue(s)).toBeGreaterThan(base.col);
  });

  it('선급금 받은 계약 — 남은 납품 의무를 부채로 한 번 뺀다(재고는 그대로 한 번)', () => {
    const s = v16(); stripInventory(s);
    const liq0 = liquidationValue(s);
    s.b2b.contracts.push({ id: 'K', buyerName: 'x', spirit: 'malt', style: 'any', lpaPerMonth: 100, termMonths: 12, pricePerLPA: 10_000, minQuality: 0, prepayShare: 0.3, penaltyPerLPA: 100, startMonth: 0, monthsDone: 0, deliveredLPA: 0, shortfallLPA: 0, prepaidRemaining: 3_000_000 } as never);
    expect(prepaidObligations(s)).toBe(3_000_000);
    expect(liquidationValue(s)).toBe(liq0 - 3_000_000);
    expect(bookValue(s)).toBe(bookValue(s)); // ①은 의무를 빼지 않는다(원가 장부)
  });
});

describe('valuation: rights.lien은 지금 아무 경로도 채우지 않는다 (MGT 검토 — 풀형 잔액 차감과 겹치면 이중 차감·가짜 마진콜)', () => {
  it('시뮬 코드에 `rights.lien =`·`rights: { lien` 쓰기가 없다 — 통별 lien 대출을 만들 때는 inventoryLoanRoom·inventoryMarginCall을 그 대출의 lien 통 기준으로 바꾼다', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const dir = new URL('.', import.meta.url).pathname;
    const files = readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'));
    const writers = files.filter((n) => /rights\s*[:=]\s*\{[^}]*lien|rights\.lien\s*=/.test(readFileSync(dir + n, 'utf8')));
    expect(writers).toEqual([]);
  });
});

describe('valuation: 병 재고 (#317 보강) · ① 장부는 시장·관측과 무관 (REQ-CORE-5 5)', () => {
  it('최근 12개월 판매량까지는 원가, 초과분은 처분 계수 · ②는 출고가', () => {
    const s = v16(); stripInventory(s);
    s.commerce.products.push({ id: 'P', name: 'p', category: 'whisky', ageYears: 3, oakMonths: 36, abv: 0.4, bottleMl: 700, chillFiltered: true, packagingId: 'standard', flavor: {}, quality: 60, typicity: 70, style: null, sourcedShare: 0, stockBottles: 1000, price: 50_000, unitCost: 20_000, createdMonth: 0, lastMonthSold: 0, totalSold: 0 });
    s.history.reports = [{ month: 1, sales: [{ productId: 'P', name: 'p', bottles: 300, revenue: 0, demandBottles: 300 }] } as never, { month: 2, sales: [{ productId: 'P', name: 'p', bottles: 100, revenue: 0, demandBottles: 100 }] } as never];
    expect(bottleStockValue(s, 'book')).toBe(1000 * 20_000);
    expect(bottleStockValue(s, 'est')).toBe(1000 * 50_000);
    expect(bottleStockValue(s, 'liq')).toBe(400 * 20_000 + 600 * 20_000 * (1 - BOTTLE_LIQ.excessDiscount));
  });

  it('① 장부 원가는 현물 시세 지수·샘플 기록을 바꿔도 같다', () => {
    const s = v16(); stripInventory(s);
    const c = malt(s, 'C', {});
    const b0 = bookValue(s);
    s.b2b.bulkIndex = 1.7; c.sampleLog = [{ month: 1, hex: {} as never, sigma: 6, estQuality: 90 }];
    expect(bookValue(s)).toBe(b0);
    expect(estimatedValue(s)).not.toBe(b0);
  });
});

describe('valuation: 옛 판 보존 (REQ-CORE-5 6) · 새 판은 처분 예상액', () => {
  it('legacy-v15 판의 netWorth는 옛 식과 같고(바이트 동일), 담보도 참 품질 식 — v16은 관측 식', () => {
    let o = legacy(3); for (let i = 0; i < 6; i++) o = advanceMonth(o);
    expect(netWorth(o)).toBe(netWorthLegacy(o));
    const trueCol = o.inventory.casks.reduce((t, c) => t + (c.contents && !c.owner ? c.contents.volumeL * c.contents.abv : 0), 0);
    expect(trueCol).toBeGreaterThanOrEqual(0);
    let n = v16(3); for (let i = 0; i < 6; i++) n = advanceMonth(n);
    expect(netWorth(n)).toBe(liquidationValue(n));
    expect(n.history.reports.at(-1)!.netWorth).toBe(liquidationValue(n)); // 결산 곡선도 같은 값
  });

  it('새 판의 순자산은 샘플을 뜨기 전에는 사전값(보수)으로 — 통이 생기면 옛 식보다 낮거나 같다', () => {
    const s = v16(); stripInventory(s);
    malt(s, 'A', { vanilla_caramel: 60, sherry_fruit: 50 }); // 참 품질이 높은 통
    expect(netWorth(s)).toBeLessThanOrEqual(netWorthLegacy(s));
  });
});

describe('숨은 오염 읽기 제거 (#310 2단계) — 자동 통입·통입·피니싱은 아는 오염만 피한다', () => {
  it('v16: 모르는 오염 통은 자동 통입 후보에 들고 통입도 된다 · 아는 오염 통은 둘 다 빠진다 · 옛 판은 숨은 값을 읽던 그대로', () => {
    const s = v16();
    const dirty = s.inventory.casks.find((c) => !c.contents)!; dirty.contamination = 'mold';
    const known = s.inventory.casks.find((c) => !c.contents && c.id !== dirty.id)!; known.contamination = 'tca'; known.contaminationKnown = true;
    const cands = autoFillCasks(s, { everyMonths: 1, prefer: 'new' } as never).map((c) => c.id);
    expect(cands).toContain(dirty.id);
    expect(cands).not.toContain(known.id);
    const o = legacy();
    const od = o.inventory.casks.find((c) => !c.contents)!; od.contamination = 'mold';
    expect(autoFillCasks(o, { everyMonths: 1, prefer: 'new' } as never).map((c) => c.id)).not.toContain(od.id);
    // 손 통입: 새 판은 모르는 오염 통에 넣어진다(QC로 알게 될 것) — 옛 판은 건너뛴다
    s.inventory.lots.push({ id: 'T', name: 't', kind: 'malt', volumeL: 200, abv: 0.7, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 10_000 });
    const r = applyAction(s, { type: 'fillCasks', lotId: 'T', caskIds: [dirty.id], entryAbv: 0.635 });
    expect(r.error).toBeUndefined();
    expect(r.state.inventory.casks.find((c) => c.id === dirty.id)!.contents).toBeDefined();
    o.inventory.lots.push({ id: 'T', name: 't', kind: 'malt', volumeL: 200, abv: 0.7, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 10_000 });
    expect(applyAction(o, { type: 'fillCasks', lotId: 'T', caskIds: [od.id], entryAbv: 0.635 }).error).toBeDefined();
  });

  it('담보 한도 — 새 판은 관측 기반이라 숨은 오염·품질을 바꿔도 같다', () => {
    let s = newGame({ seed: 5, region: 'JP', site: 'jp_hokkaido' }); // 재고 담보대출이 있는 입지
    for (let i = 0; i < 3; i++) s = advanceMonth(s);
    const t = structuredClone(s);
    for (const c of t.inventory.casks) if (c.contents) { c.contents.flavor.vanilla_caramel = (c.contents.flavor.vanilla_caramel ?? 0) + 30; c.contamination = 'tca'; }
    expect(inventoryLoanRoom(t)).toBe(inventoryLoanRoom(s));
  });
});
