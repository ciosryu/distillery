// [결정 #375] · [결정 #376] — 바깥 평가 이벤트가 숨은 품질을 드러내지 않는다 (가리는 판, MGT · mgt-stage-t.md [제안 P-MGT-62])
// #375: 평론 판정(criticVerdict) 문구에 품질 숫자를 쓰지 않는다 — 평가 말만. 옛 판은 숫자 그대로
// #376: 「품평회 수상」 조건(highQualityProduct)은 참 품질 대신 커뮤니티 품질(지난 리뷰 읽기 평균, 없으면 아는 품질). 옛 판은 참 품질 그대로
import { describe, expect, it } from 'vitest';
import { applyEffects, MEDAL_QUALITY, meetsRequirement } from './events';
import { mulberry32 } from './rng';
import type { GameState, Product } from './types';

// feed.test.ts 「I2 L3」와 같은 판: 아는 품질 60 ±8 · 리뷰 3이 같고 참 품질만 다르다
const withProduct = async (trueQuality: number, rules: 'v16' | 'legacy-v15' = 'v16', scores?: number[]): Promise<{ s: GameState; p: Product }> => {
  const { newScenarioGame } = await import('./newScenario');
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 5, rules });
  s.month = 70;
  const p = {
    id: 'P1', name: '싱글 몰트 1', category: 'whisky', ageYears: 5, oakMonths: 60, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard',
    flavor: {}, quality: trueQuality, typicity: 70, style: null, sourcedShare: 0, stockBottles: 400, price: 80_000, unitCost: 20_000,
    createdMonth: 60, lastMonthSold: 69, totalSold: 300, qualityKnown: { est: 60, sigma: 8, reviews: 3, month: 69 },
  } as Product;
  s.commerce.products.push(p);
  s.history.reports.push({ month: 69, sales: [], notes: [], expenses: {}, ...(scores ? { reviews: [{ productId: 'P1', scores }] } : {}) } as never);
  return { s, p };
};

const verdictNote = (s: GameState) => applyEffects(s, [{ type: 'criticVerdict', rave: 80, pan: 62, raveEffects: [], panEffects: [], mildEffects: [] }], mulberry32(1), '테스트')[0]!;

describe('[결정 #375] 평론 판정 문구 — 가리는 판은 품질 숫자를 쓰지 않는다', () => {
  it('아는 품질이 같고 참 품질만 65 · 75면(둘 다 무난 구간) 문구가 같다', async () => {
    const lo = await withProduct(65), hi = await withProduct(75);
    expect(verdictNote(hi.s)).toBe(verdictNote(lo.s));
    expect(verdictNote(hi.s)).toBe('무난한 평가');
    expect(verdictNote(hi.s)).not.toMatch(/\d/);
  });
  it('판정 말(극찬 · 혹평)은 그대로 — 문턱은 참 품질로 정한다', async () => {
    expect(verdictNote((await withProduct(85)).s)).toBe('극찬 (수요 폭증, 가격 저항 감소)');
    expect(verdictNote((await withProduct(50)).s)).toBe('혹평 (수요 급감, 재고 적체 주의)');
  });
  it('옛 판은 숫자 그대로(바이트 동일)', async () => {
    expect(verdictNote((await withProduct(75, 'legacy-v15')).s)).toBe('무난한 평가 — 품질 75');
  });
});

describe('[결정 #376] 품평회 수상 조건 — 가리는 판은 커뮤니티 품질로', () => {
  it('참 품질이 문턱 위 · 아래여도 커뮤니티 품질(아는 품질 60)이 같으면 조건이 같다 — 둘 다 아님', async () => {
    const lo = await withProduct(60), hi = await withProduct(90);
    expect(meetsRequirement(hi.s, 'highQualityProduct')).toBe(meetsRequirement(lo.s, 'highQualityProduct'));
    expect(meetsRequirement(hi.s, 'highQualityProduct')).toBe(false);
  });
  it('지난 리뷰 읽기 평균이 문턱 이상이면 조건이 선다(참 품질과 무관)', async () => {
    // 읽기 = (점수 − 60) / 0.38 → 점수 88 · 89 ≈ 73.7 · 76.3, 평균 75 ≥ 72
    const { s } = await withProduct(50, 'v16', [88, 89]);
    expect(meetsRequirement(s, 'highQualityProduct')).toBe(true);
    expect(MEDAL_QUALITY).toBe(72);
  });
  it('옛 판은 참 품질 그대로(바이트 동일)', async () => {
    expect(meetsRequirement((await withProduct(80, 'legacy-v15')).s, 'highQualityProduct')).toBe(true);
    expect(meetsRequirement((await withProduct(60, 'legacy-v15')).s, 'highQualityProduct')).toBe(false);
  });
});
