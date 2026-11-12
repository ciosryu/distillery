// 향미 방향 항 f2 "스타일 = 플레이어 선택" ([결정 #290] B1-9) — 기본 레시피 ×1(총수요 보존) · 선형 비중 · 시장 key · 구조 규칙 3개
import { describe, expect, it } from 'vitest';
import { addTrendShift, appeal, newGame, styleFit, trendFactor, type Hex, type Product } from './index';
import { STYLE, STYLE_WEIGHTS } from './content/market';

const product = (over: Partial<Product> = {}): Product => ({ id: 'p', name: 'p', category: 'whisky', ageYears: 4, oakMonths: 48, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 70, typicity: 80, style: null, sourcedShare: 0, stockBottles: 5000, price: 60_000, unitCost: 20_000, createdMonth: 0, lastMonthSold: 0, totalSold: 0, ...over });
const KEYS = Object.keys(STYLE_WEIGHTS);

describe('f2 향미 방향 항 (결정 #290 B1-9)', () => {
  it('기본 레시피(언피트 × ex-버번)와 기록 전 제품은 모든 시장에서 정확히 ×1', () => {
    for (const k of [...KEYS, 'XX']) {
      expect(styleFit(product(), k)).toBe(1);
      expect(styleFit(product({ peatShare: 0, caskMix: [{ typeId: 'ex_bourbon_barrel', share: 1 }] }), k)).toBe(1);
    }
  });

  it('몰트 위스키만 — 다른 주종은 피트·셰리여도 ×1', () => {
    for (const category of ['blended_whisky', 'grain_whisky', 'gin', 'soju_distilled'] as const) expect(styleFit(product({ category, peatShare: 1, caskMix: [{ typeId: 'oloroso_butt', share: 1 }] }), 'TW')).toBe(1);
  });

  it('비중은 선형 — 반반 블렌드는 가운데, 탱크 몫(합 < 1)은 중립', () => {
    expect(styleFit(product({ caskMix: [{ typeId: 'oloroso_butt', share: 1 }] }), 'TW')).toBeCloseTo(1.12, 10);
    expect(styleFit(product({ caskMix: [{ typeId: 'oloroso_butt', share: 0.5 }, { typeId: 'ex_bourbon_barrel', share: 0.5 }] }), 'TW')).toBeCloseTo(1.06, 10);
    expect(styleFit(product({ caskMix: [{ typeId: 'oloroso_butt', share: 0.5 }] }), 'TW')).toBeCloseTo(1.06, 10);
    expect(styleFit(product({ peatShare: 0.5 }), 'UK')).toBeCloseTo(1.06, 10);
    expect(styleFit(product({ peatShare: 1, caskMix: [{ typeId: 'oloroso_butt', share: 1 }] }), 'UK')).toBeCloseTo(1.12 * 1.04, 10);
  });

  it('시장마다 이기는 조합이 갈린다 — 국내(KR)는 한국 참나무, 대만은 셰리, 영국은 피트', () => {
    const best = (k: string) => {
      const combos = [0, 1].flatMap((peat) => ['ex_bourbon_barrel', 'oloroso_butt', 'korean_oak_quarter', 'mizunara_hogshead'].map((c) => ({ id: `${peat}:${c}`, v: styleFit(product({ peatShare: peat, caskMix: [{ typeId: c as never, share: 1 }] }), k) })));
      return combos.reduce((a, b) => (b.v > a.v ? b : a)).id;
    };
    expect(best('KR')).toBe('0:korean_oak_quarter');
    expect(best('TW')).toBe('0:oloroso_butt');
    expect(best('UK')).toBe('1:oloroso_butt');
    for (const k of KEYS) expect(Math.max(...Object.values(STYLE_WEIGHTS[k]!.casks).map((x) => x ?? 1), STYLE_WEIGHTS[k]!.peat)).toBeGreaterThan(1);
  });

  it('인센스 프리미엄과 미즈나라 가중은 큰 쪽 하나만', () => {
    const mz = product({ caskMix: [{ typeId: 'mizunara_hogshead', share: 1 }] });
    expect(styleFit(mz, 'JP')).toBeCloseTo(1.1, 10);
    expect(styleFit(mz, 'JP', 1.25)).toBe(1); // ×1.25 인센스가 이미 걸림 → 미즈나라 1.10은 겹치지 않는다
    // 매력도 전체로: 일본 판, 인센스 8 이상 미즈나라 위스키 — 1.25 × 1.10이 아니라 1.25
    const s = newGame({ region: 'JP', seed: 1 });
    const withIncense = product({ flavor: { incense: 9 }, caskMix: [{ typeId: 'mizunara_hogshead', share: 1 }] });
    const plain = product({ flavor: { incense: 9 } });
    expect(appeal(withIncense, s) / appeal(plain, s)).toBeCloseTo(1, 10);
  });

  it('피니시 통 몫은 개월 비중이 기록될 때까지 중립', () => {
    expect(styleFit(product({ finish: 'oloroso_butt', caskMix: [{ typeId: 'oloroso_butt', share: 1 }] }), 'TW')).toBe(1);
  });

  it('매력도: 국내는 지역 key, 세 번째 인자로 수출 시장 key — 기본 레시피는 어느 key로도 같다', () => {
    const s = newGame({ region: 'KR', seed: 1 });
    const sherry = product({ caskMix: [{ typeId: 'oloroso_butt', share: 1 }] });
    expect(appeal(sherry, s) / appeal(product(), s)).toBeCloseTo(1.04, 10);
    expect(appeal(sherry, s, 'TW') / appeal(product(), s, 'TW')).toBeCloseTo(1.12, 10);
    for (const k of KEYS) expect(appeal(product(), s, k)).toBe(appeal(product(), s));
  });

  it('스타일 보너스 × 향미 트렌드 ≤ 1.5 — 트렌드만으로 넘는 몫은 그대로, 스타일 벌칙은 그대로', () => {
    const s = newGame({ region: 'KR', seed: 1 });
    const hex: Hex = { peat: 10, fruit: 0, floral: 0, spicy: 0, woody: 0, sweet: 0 };
    addTrendShift(s, '피트 유행', 'peat', 0.45, 0, 5, 24);
    const tf = trendFactor(s, hex);
    expect(tf).toBeCloseTo(1.45, 10);
    const oak = product({ hex, caskMix: [{ typeId: 'korean_oak_quarter', share: 1 }] }); // KR ×1.08 → 1.45 × 1.08 = 1.566 > 1.5
    expect(appeal(oak, s) / appeal(product({ hex }), s)).toBeCloseTo(STYLE.capWithTrend / tf, 10);
    const peat = product({ hex, peatShare: 1 }); // KR 피트 ×0.92 — 벌칙은 자르지 않는다
    expect(appeal(peat, s) / appeal(product({ hex }), s)).toBeCloseTo(0.92, 10);
  });
});
