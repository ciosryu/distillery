// [결정 #362] 피니시 표기의 판매 효과(#270 A · B) — 표기 + 피니시 통 3개월↑일 때만, 통 종류와 무관
import { describe, expect, it } from 'vitest';
import { FINISH_LABEL } from './content/market';
import { finishLabelOn, finishMonthsOf } from './finishLabel';
import { productLuxury } from './brands';
import { appeal, expectedPricePerL } from './market';
import { regionOf } from './content/regions';
import { newScenarioGame } from './newScenario';
import type { Product } from './types';

const base = { id: 'P', name: '시험 몰트', category: 'whisky', ageYears: 6, oakMonths: 72, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard', flavor: {}, quality: 75, typicity: 70, style: null, sourcedShare: 0, stockBottles: 300, price: 100_000, unitCost: 20_000, createdMonth: 90, lastMonthSold: 0, totalSold: 0 } as unknown as Product;
/** 72개월 중 마지막 m개월을 셰리 벗에서 보낸 한 통 원액 */
const finished = (m: number, typeId: 'oloroso_butt' | 'ex_bourbon_barrel' = 'oloroso_butt'): Product => ({
  ...base, finish: typeId,
  caskMonthsMix: [{ typeId: typeId === 'oloroso_butt' ? 'ex_bourbon_barrel' : 'oloroso_butt', share: (72 - m) / 72 }, { typeId, share: m / 72 }],
});

describe('finishMonthsOf · finishLabelOn', () => {
  it('한 통 원액이면 피니시 통에 머문 개월을 그대로 읽는다', () => {
    expect(finishMonthsOf(finished(6))).toBeCloseTo(6);
    expect(finishMonthsOf(finished(2))).toBeCloseTo(2);
  });
  it(`${FINISH_LABEL.minMonths}개월부터 켜진다 · 표기 없거나 기록 없는 제품(옛 세이브)은 꺼짐`, () => {
    expect(finishLabelOn(finished(2))).toBe(false);
    expect(finishLabelOn(finished(3))).toBe(true);
    expect(finishLabelOn(base)).toBe(false);
    expect(finishLabelOn({ ...base, finish: 'oloroso_butt' })).toBe(false); // caskMonthsMix 없음 — styleFit과 같은 중립 규칙
  });
  it('탱크 원액이 섞여 통 몫 합이 1보다 작아도 통 몫 안에서 센다', () => {
    const p = { ...base, finish: 'oloroso_butt' as const, caskMonthsMix: [{ typeId: 'ex_bourbon_barrel' as const, share: 0.4 }, { typeId: 'oloroso_butt' as const, share: 0.1 }] };
    expect(finishMonthsOf(p)).toBeCloseTo(72 * 0.2);
  });
});

describe('효과 — A 매력도 · 기대 가격 ×1.08 · B 럭셔리 +10, 통 종류마다 같다', () => {
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 5 });
  const region = regionOf(s);
  // 표기 효과만 떼어 보려고 styleFit이 ×1인 시장(styleKey '')으로 잰다
  it('매력도 — 3개월↑ 피니시는 2개월 피니시의 ×1.08 (향미 · 통 선호는 같게 둔 비교)', () => {
    const on = appeal(finished(3), s, ''), off = appeal(finished(2), s, '');
    expect(on / off).toBeCloseTo(FINISH_LABEL.appeal, 6);
  });
  it('기대 가격 ×1.08', () => {
    expect(expectedPricePerL(region, finished(6)) / expectedPricePerL(region, base)).toBeCloseTo(FINISH_LABEL.expectedPrice, 6);
  });
  it('럭셔리 +10 · 품질 게이트(L_p ≤ 품질) 그대로', () => {
    expect(productLuxury(finished(6)) - productLuxury(base)).toBe(FINISH_LABEL.luxury);
    expect(productLuxury({ ...finished(6), quality: 20 })).toBe(20);
  });
  it('통 종류가 달라도 같은 배수(시장 차이는 styleFit만)', () => {
    expect(appeal(finished(6, 'ex_bourbon_barrel'), s, '') / appeal(finished(2, 'ex_bourbon_barrel'), s, '')).toBeCloseTo(FINISH_LABEL.appeal, 6);
  });
});
