import { describe, expect, it } from 'vitest';
import { advanceMonths, advanceUntil, applyAction, createLocalEngine, DEFAULT_STOPS, HEX_AXES, hexOf, matchScore, mixHex, perceivedHex, perceptionSigma, previewVat, sampledSigma, weightedAverage, type BlendTarget, type Flavor, isGated, isUnlocked, migrateSave, newGame, productCountEver, SAVE_VERSION, unlockingNodes, V5_FIELD_MAP } from '.';
import fixture from './fixtures/save-v5.json';
import { slotClimate } from './warehouse';
import { addWeatherShock, updateWeather, WEATHER } from './weather';
import { evapTempFactor } from './maturation';
import { categorize, previewBlend, simulateBatch, stillDefOf, type GameState, appeal, presetRecipes, validateRecipe, type Product } from './index';
import { logisticsMultiplier, REGIONS } from './content/regions';

// v5 세이브 픽스처는 리팩터 전 코드로 만들었다(옛 코드가 실제로 쓴 세이브 모양).

describe('세이브 마이그레이션 (결정 #118·#124)', () => {
  it('v5의 모든 필드가 v6 위치에 같은 값으로 옮겨진다 (무손실)', () => {
    const raw = structuredClone(fixture.save) as Record<string, unknown>;
    const s = migrateSave(raw) as unknown as Record<string, Record<string, unknown>>;
    expect(s).not.toBeNull();
    expect(s.version).toBe(SAVE_VERSION);
    for (const [key, value] of Object.entries(raw)) {
      const to = V5_FIELD_MAP[key];
      expect(to, `v5 필드 ${key}의 v6 위치가 정의되지 않았다`).toBeDefined();
      if (key === 'version') continue;
      const got = to === 'root' ? s[key] : to![1] === undefined ? s[to![0]] : s[to![0]]![to![1]];
      if (key === 'modifiers') {
        // v6 → v7(결정 #125): 옛 피트·셰리 유행 보정치는 향미 트렌드 이동으로 옮겨진다 — 나머지 보정치는 그대로
        const legacy = (value as { key: string }[]).filter((m) => m.key === 'appeal:peated' || m.key === 'appeal:sherried');
        expect(got, key).toEqual((value as { key: string }[]).filter((m) => !legacy.includes(m)));
        expect((s.world!.flavorTrend as { shifts: unknown[] }).shifts.length).toBe(legacy.length);
        continue;
      }
      expect(got, key).toEqual(value);
    }
  });

  it('옮긴 v5 세이브를 이어서 진행할 수 있다', () => {
    const s = migrateSave(structuredClone(fixture.save))!;
    const t = advanceMonths(s, 6);
    expect(t.month).toBe(s.month + 6);
    expect(t.status).toBe('running');
    // 리팩터 시점(날씨 도입 전)에는 옛 코드와 결과가 같았다 — fixture.expectedAfter6, 커밋 e1cecd7
  });

  it('입지 특성(#86) 이전 v5 세이브는 빠진 필드를 채운다', () => {
    const { siteState: _a, retailOffers: _b, retailContracts: _c, oemOffers: _d, oemContracts: _e, receivables: _f, ...old } = structuredClone(fixture.save) as Record<string, unknown>;
    const s = migrateSave(old)!;
    expect(s.site).toEqual({});
    expect(s.finance.receivables).toEqual([]);
    expect(s.commerce.retailOffers).toEqual([]);
    expect(advanceMonths(s, 2).month).toBe(s.month + 2);
  });

  it('입력을 바꾸지 않는다 (순수 함수)', () => {
    const raw = structuredClone(fixture.save);
    const before = JSON.stringify(raw);
    migrateSave(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('현재 버전은 그대로, 미래 버전·형식 오류는 null', () => {
    const g = newGame({ seed: 1 });
    expect(migrateSave(g)).toBe(g);
    expect(migrateSave({ ...g, version: 99 })).toBeNull();
    expect(migrateSave(null)).toBeNull();
    expect(migrateSave({ version: 4 })).toBeNull();
  });
});

describe('테크 게이트 isUnlocked (tech-tree §7)', () => {
  it('Phase 1은 게이트가 꺼져 있어 모든 행동이 열려 있다', () => {
    const s = newGame({ seed: 1 });
    expect(isUnlocked(s, 'action:rotateWarehouse')).toBe(true);
    expect(isUnlocked(s, 'action:setOrder')).toBe(true);
  });

  it('게이트를 켜면 노드가 해금한 키만 열린다', () => {
    const s = newGame({ seed: 1 });
    expect(isGated('action:rotateWarehouse')).toBe(true);
    expect(isGated('action:setOrder')).toBe(false);
    expect(isUnlocked(s, 'action:rotateWarehouse', true)).toBe(false);
    expect(isUnlocked(s, 'action:setOrder', true)).toBe(true);
    expect(isUnlocked({ research: { ...s.research, unlocked: ['MAT-3a'] } }, 'action:rotateWarehouse', true)).toBe(true);
    expect(unlockingNodes('action:sellCaskOwnership').map((n) => n.id)).toEqual(['BIZ-1b']);
  });
});

describe('기상 이상치 AR(1) (결정 #120)', () => {
  it('평균 0, 표준편차 σ, 1개월 자기상관 ρ에 가깝다', () => {
    const s = newGame({ seed: 3 });
    const xs: number[] = [];
    for (let m = 0; m < 6000; m++) { s.month = m; updateWeather(s); xs.push(s.world.weather.tempAnom); }
    const n = xs.length;
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    let cov = 0;
    for (let i = 1; i < n; i++) cov += (xs[i]! - mean) * (xs[i - 1]! - mean);
    const rho = cov / (n - 1) / (sd * sd);
    expect(Math.abs(mean)).toBeLessThan(0.1);
    expect(sd).toBeCloseTo(WEATHER.tempSigma, 1);
    expect(rho).toBeCloseTo(WEATHER.rho, 1);
  });

  it('같은 시드면 같은 날씨 (결정론)', () => {
    const a = advanceMonths(newGame({ seed: 11 }), 24).history.reports.map((r) => r.weather?.tempAnom);
    const b = advanceMonths(newGame({ seed: 11 }), 24).history.reports.map((r) => r.weather?.tempAnom);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBeGreaterThan(5);
  });

  it('폭염은 결과가 아니라 외기에 +4°C 충격 — 숙성고 온도·증발이 함께 오른다', () => {
    const s = newGame({ seed: 5 });
    const cask = { slot: { w: 'W0', tier: 3 } } as never;
    const before = slotClimate(s, cask, 7);
    addWeatherShock(s, 'hw', '폭염', 4, -5, 2);
    const after = slotClimate(s, cask, 7);
    expect(after.tempC - before.tempC).toBeGreaterThan(4 * 0.95);
    expect(evapTempFactor(after.tempC) / evapTempFactor(before.tempC)).toBeGreaterThan(1.6);
    s.month = 2;
    expect(slotClimate(s, cask, 7).tempC).toBeCloseTo(before.tempC, 6); // 2개월 뒤 끝
  });
});

describe('엔진 계약·자동 진행 (architecture §3.2, PRD §2.1)', () => {
  it('멈춤 조건이 없으면 advanceMonths와 같은 결과', () => {
    const s = newGame({ seed: 21 });
    const a = advanceUntil(s, { months: 18 });
    expect(a.months).toBe(18);
    expect(a.stoppedBy).toBe('maxMonths');
    expect(a.state).toEqual(advanceMonths(s, 18));
    expect(a.reports.length).toBe(18);
  });

  it('선택 이벤트·예보 등 새 알림이 생기면 그 달에서 멈춘다', () => {
    const r = advanceUntil(newGame({ seed: 25, startingCash: 50_000_000_000 }), { months: 120, stopOn: DEFAULT_STOPS });
    expect(r.stoppedBy).not.toBe('maxMonths');
    expect(r.months).toBeLessThan(120);
  });

  it('엔진은 명령 실패 시 상태를 바꾸지 않고, 성공하면 구독자에게 새 스냅샷을 준다', () => {
    const e = createLocalEngine(newGame({ seed: 2 }));
    const seen: number[] = [];
    e.subscribe((s) => seen.push(s.finance.cash));
    const before = e.snapshot();
    expect(e.dispatch({ type: 'setOrder', recipeId: 'nope', batchesPerMonth: 1 }).error).toBeTruthy();
    expect(e.snapshot()).toBe(before);
    e.advance({ months: 2 });
    expect(e.snapshot().month).toBe(2);
    expect(seen.length).toBe(1);
  });
});

describe('데이터 수명 관리 (architecture §3.7)', () => {
  it('품절 뒤 팔리지 않는 제품은 아카이브로, 12월마다 연 요약', () => {
    let s = newGame({ seed: 31, startingCash: 50_000_000_000 });
    const soju = s.production.recipes.find((r) => r.kind === 'soju')!;
    s = applyAction(s, { type: 'setOrder', recipeId: soju.id, batchesPerMonth: 1 }).state;
    s = advanceMonths(s, 1);
    const lot = s.inventory.lots.find((l) => l.kind === 'soju')!;
    s = applyAction(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: lot.volumeL }], options: { name: '작은 소주', targetAbv: 0.25, bottleMl: 375, chillFilter: true, packagingId: 'standard' } }).state;
    const p = s.commerce.products[0]!;
    s = { ...s, commerce: { ...s.commerce, products: [{ ...p, stockBottles: 0 }] } };
    s = advanceMonths(s, 14);
    expect(s.commerce.products.some((x) => x.id === p.id)).toBe(false);
    expect(s.commerce.productArchive.find((x) => x.id === p.id)?.name).toBe('작은 소주');
    expect(productCountEver(s)).toBeGreaterThanOrEqual(1);
    expect(s.history.years.map((y) => y.year)).toEqual([2027]);
    expect(s.history.years[0]!.revenue).toBe(s.history.reports.slice(0, 12).reduce((t, r) => t + r.revenue, 0));
  });
});

describe('블렌딩 레이더 코어 (결정 #121)', () => {
  const sherry: Flavor = { dried_fruit: 45, wood_spice: 25, vanilla_caramel: 20, nutty_rancio: 10, oak_tannin: 20 };
  const peated: Flavor = { peat_smoke: 55, cereal: 20, vanilla_caramel: 25, oily_waxy: 15, earthy: 5 };
  const bourbon: Flavor = { fresh_fruit: 35, vanilla_caramel: 40, floral: 20, cereal: 15, sweetness: 10 };

  it('투영은 선형 — 블렌드 향미의 육각형 = 원액 육각형의 LPA 가중 평균', () => {
    const blend = weightedAverage([{ flavor: sherry, weight: 3 }, { flavor: peated, weight: 1 }]);
    const mixed = mixHex([{ hex: hexOf(sherry), share: 3 }, { hex: hexOf(peated), share: 1 }]);
    const direct = hexOf(blend);
    for (const a of HEX_AXES) expect(direct[a]).toBeCloseTo(mixed[a], 1);
  });

  it('블렌더 레벨·후각이 높을수록 예측 오차가 작고, 샘플을 더 뜨면 더 작아진다', () => {
    const rookie = { id: 'a', level: 1, nose: 40 };
    const master = { id: 'b', level: 8, nose: 85 };
    expect(perceptionSigma(master)).toBeLessThan(perceptionSigma(rookie) / 2);
    expect(perceptionSigma(null)).toBeGreaterThan(perceptionSigma(rookie));
    expect(sampledSigma(rookie, 3)).toBeCloseTo(perceptionSigma(rookie) / 2, 6);
  });

  it('지각은 (캐스크·블렌더·샘플 수)마다 고정 — 다시 열어도 같은 값', () => {
    const b = { id: 'S1', level: 2, nose: 50 };
    expect(perceivedHex(hexOf(sherry), 7, 'K1', b, 0)).toEqual(perceivedHex(hexOf(sherry), 7, 'K1', b, 0));
    expect(perceivedHex(hexOf(sherry), 7, 'K1', b, 1)).not.toEqual(perceivedHex(hexOf(sherry), 7, 'K1', b, 0));
  });

  it('예측 오차 띠는 캐스크를 여럿 섞을수록 좁아진다 (오차 상쇄)', () => {
    const b = { id: 'S1', level: 3, nose: 60 };
    const one = previewVat([{ id: 'K1', share: 1, actual: hexOf(bourbon), samples: 0 }], 1, b);
    const four = previewVat(['K1', 'K2', 'K3', 'K4'].map((id) => ({ id, share: 1, actual: hexOf(bourbon), samples: 0 })), 1, b);
    expect(four.band).toBeCloseTo(one.band / 2, 6);
    expect(four.actual).toEqual(mixHex([{ hex: hexOf(bourbon), share: 1 }]));
  });

  it('목표와 같으면 100점, 멀어질수록 낮고, 허용이 좁은 의뢰일수록 박하다', () => {
    const hex = hexOf(bourbon);
    const trend: BlendTarget = { id: 't', source: 'trend', label: '스무스', hex, tolerance: 15 };
    expect(matchScore(hex, trend)).toBe(100);
    const off = { ...hex, woody: hex.woody + 15 };
    const wide = matchScore(off, trend);
    const narrow = matchScore(off, { ...trend, source: 'critic', tolerance: 6 });
    expect(wide).toBeGreaterThan(narrow);
    expect(matchScore(off, { ...trend, weights: { woody: 4 } })).toBeLessThan(wide);
  });
});

describe('배치 id — 캐스크 코호트 (architecture §3.4)', () => {
  it('같은 배치를 나눠 통입한 캐스크는 같은 batchId를 갖는다', () => {
    let s = newGame({ seed: 41, startingCash: 50_000_000_000 });
    const malt = s.production.recipes.find((r) => r.kind === 'malt')!;
    s = applyAction(s, { type: 'setOrder', recipeId: malt.id, batchesPerMonth: 2 }).state;
    s = advanceMonths(s, 1);
    const lot = s.inventory.lots.find((l) => l.kind === 'malt')!;
    expect(lot.batchId).toBe(lot.id);
    // 작은 50L 통으로 나눠 담는다 (원액 한 배치 → 여러 캐스크)
    const empty = s.inventory.casks.filter((c) => !c.contents).slice(0, 3).map((c) => c.id);
    s = { ...s, inventory: { ...s.inventory, casks: s.inventory.casks.map((c) => (empty.includes(c.id) ? { ...c, sizeL: 50 } : c)) } };
    s = applyAction(s, { type: 'fillCasks', lotId: lot.id, caskIds: empty, entryAbv: 0.635 }).state;
    const filled = s.inventory.casks.filter((c) => c.contents);
    expect(filled.length).toBeGreaterThanOrEqual(2);
    expect(new Set(filled.map((c) => c.contents!.batchId))).toEqual(new Set([lot.id]));
    expect(new Set(filled.map((c) => c.contents!.id)).size).toBe(filled.length);
  });
});

// ───────────── 결정론·지역 규칙 (결정 #144 — sim.test.ts에서 옮겨 왔다) ─────────────

const recipeId = (s: GameState, prefix: string) => s.production.recipes.find((r) => r.name.startsWith(prefix))!.id;

describe('결정론', () => {
  it('같은 시드와 같은 행동이면 결과가 같다', () => {
    const play = () => {
      let s = newGame({ seed: 77 });
      s = applyAction(s, { type: 'setOrder', recipeId: recipeId(s, '증류식'), batchesPerMonth: 2 }).state;
      s = applyAction(s, { type: 'setOrder', recipeId: recipeId(s, '싱글 몰트 — 언'), batchesPerMonth: 3 }).state;
      return advanceMonths(s, 18);
    };
    expect(JSON.stringify(play())).toBe(JSON.stringify(play()));
  });

  it('행동은 원본 상태를 바꾸지 않는다', () => {
    const s = newGame({ seed: 8 });
    const before = JSON.stringify(s);
    applyAction(s, { type: 'buyCasks', caskType: 'ex_bourbon_barrel', qty: 2 });
    advanceMonths(s, 2);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('지역 (v0.6)', () => {
  const asRecipe = (s: GameState, kind: string) => ({ ...presetRecipes(s.production.equipment[0]!.id, 'KR').find((r) => r.kind === kind)!, id: 'X' });

  it('교차 생산(결정 #67): 원산지 잠금이 없는 주종은 어느 지역에서나 만들 수 있고, 자생하지 않는 원재료는 물류 배수가 붙는다', () => {
    const jp = newGame({ seed: 1, region: 'JP' });
    const tw = newGame({ seed: 1, region: 'TW' });
    expect(validateRecipe(jp, asRecipe(jp, 'baijiu'))).toEqual([]);
    expect(validateRecipe(tw, asRecipe(tw, 'soju'))).toEqual([]);
    expect(logisticsMultiplier(['KR'], 'KR')).toBe(1);
    expect(logisticsMultiplier(['KR'], 'TW')).toBeCloseTo(1.3, 5);
    expect(logisticsMultiplier(['MX'], 'KR')).toBeCloseTo(1.8, 5);
    expect(logisticsMultiplier(undefined, 'JP')).toBe(1);
    // 같은 레시피(국산 쌀·누룩)를 대만에서 만들면 원재료비가 오른다
    const kr = newGame({ seed: 1, region: 'KR' });
    const soju = asRecipe(kr, 'soju');
    const still = stillDefOf(kr, kr.production.equipment[0]!.id)!;
    const home = simulateBatch(soju, still, 'stainless', kr.hr.staff[0], kr.world.priceIndex, 0, { tempC: 18, regionId: 'KR' });
    const away = simulateBatch(soju, still, 'stainless', kr.hr.staff[0], kr.world.priceIndex, 0, { tempC: 18, regionId: 'TW' });
    expect(away.cost).toBeGreaterThan(home.cost * 1.15);
  });

  it('진먼 고량은 대만 자생(다른 곳은 수입), 진먼섬 증류소에서 60% 이상 쓰면 "진먼 고량주" 특산물이 된다', () => {
    const yilan = newGame({ seed: 1, region: 'TW', startingCash: 5_000_000_000 });
    const yk = yilan.production.recipes.find((r) => r.kind === 'baijiu')!;
    const yl = advanceMonths(applyAction(yilan, { type: 'setOrder', recipeId: yk.id, batchesPerMonth: 1 }).state, 1);
    const ylot = yl.inventory.lots.find((l) => l.kind === 'baijiu')!;
    const ypv = previewBlend(yl, [{ source: 'lot', id: ylot.id, liters: ylot.volumeL }], { name: 'k', targetAbv: 0.58, bottleMl: 600, chillFilter: true, packagingId: 'standard' });
    expect(ypv.specialty).toBeNull();
    expect(ypv.warnings.some((w) => w.includes('진먼섬'))).toBe(true);
    let tw = newGame({ seed: 1, region: 'TW', site: 'kinmen', startingCash: 5_000_000_000 });
    const kinmen = tw.production.recipes.find((r) => r.kind === 'baijiu')!;
    tw = advanceMonths(applyAction(tw, { type: 'setOrder', recipeId: kinmen.id, batchesPerMonth: 1 }).state, 1);
    const lot = tw.inventory.lots.find((l) => l.kind === 'baijiu')!;
    const pv = previewBlend(tw, [{ source: 'lot', id: lot.id, liters: lot.volumeL }], { name: 'k', targetAbv: 0.58, bottleMl: 600, chillFilter: true, packagingId: 'standard' });
    expect(pv.specialty).toBe('kinmen');
    const p = { category: 'baijiu', ageYears: null, packagingId: 'standard', flavor: {}, quality: 60, typicity: 80, sourcedShare: 0 } as unknown as Product;
    expect(appeal({ ...p, specialty: 'kinmen' }, tw) / appeal(p, tw)).toBeCloseTo(1.35, 5);
  });

  it('최소 숙성 기간은 나라별: 한국 1년, 일본은 규정이 없어 바로 위스키, 대만 2년, 기본 3년', () => {
    const rules = (r: 'KR' | 'JP' | 'TW') => REGIONS[r].whisky;
    expect(categorize('malt', 11, 0.46, {}, false, true, rules('KR'))).toBe('malt_spirit');
    expect(categorize('malt', 12, 0.46, {}, false, true, rules('KR'))).toBe('whisky');
    expect(categorize('malt', 0, 0.46, {}, false, true, rules('JP'))).toBe('whisky');
    expect(categorize('malt', 23, 0.46, {}, false, true, rules('TW'))).toBe('malt_spirit');
    expect(categorize('malt', 24, 0.46, {}, false, true, rules('TW'))).toBe('whisky');
    expect(categorize('malt', 35, 0.46, {})).toBe('malt_spirit');
  });
});
