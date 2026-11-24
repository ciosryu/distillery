// 정보 비대칭 성질 시험 I2 (외부 검토 D1, 2026-11-24 · architecture §11 · F5d #338) — I1(infoLeak.test.ts)은 화면 파일이 `.quality`를
// "직접" 읽는지만 본다. 화면이 sim 함수를 거쳐 참 품질을 읽는 길은 못 잡는다(검토 재현: 대형 유통 납품 단가 `retailPriceBasis`).
// 성질: **공개 정보가 같고 참 품질만 다른 두 상태에서, 화면이 부르는 sim 읽기 함수의 출력이 같다.**
// 아직 시험으로 묶지 않은 후보(코드 읽기 — 2026-11-24 ARCH): L4 블렌딩 · 병입 화면 면세 한정판 미리보기의 「예상 면세 판매」가 `preview.evaluation.quality`(참)로
// `productDutyFreeDemand`를 부른다(Bottling.tsx — 병 재고 경고는 이미 masked) · L5 브랜드 럭셔리 지수 `productLuxury`가 `min(p.quality, …)`로 참 품질을 상한에 쓴다
// (판매 화면 브랜드 칸에 보이면 누수) · L6 이벤트 조건 `highQualityProduct`(참 품질 72↑ 제품이 있을 때만 — 이벤트가 뜨는 것 자체가 신호) ·
// 결과 화면 연표의 플래그십 품질은 승리 뒤 공개(#344 HeritageReveal과 같은 자리)라 누수로 보지 않는다.
// 지금 새는 길은 `it.fails`로 적어 둔다 — 고치면 이 시험이 "통과해 버려서" 실패하므로, 고친 PR이 `it.fails`를 `it`으로 바꾼다(목록이 줄어들기만 한다)
import { describe, expect, it } from 'vitest';
import { calendar, domesticDemands, knownState, knownView, newScenarioGame, priceOptions, type GameState, type Product } from '../sim';
import { feedFor } from '../sim/feed';
import { retailPriceBasis } from '../sim/deals';
import { stockoutSoon } from './alerts';

/** 위스키 제품 하나(아는 품질 60 ±8 · 리뷰 3)를 진열한 v16 캠페인 판 — 참 품질만 인자로 */
function withProduct(trueQuality: number): { s: GameState; p: Product } {
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 5, rules: 'v16' });
  s.month = 40;
  const p: Product = {
    id: 'P1', name: '싱글 몰트 1', category: 'whisky', ageYears: 3, oakMonths: 36, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard',
    flavor: {}, quality: trueQuality, typicity: 70, style: null, sourcedShare: 0, stockBottles: 400, price: 60_000, unitCost: 20_000,
    createdMonth: 30, lastMonthSold: 30, totalSold: 300,
    qualityKnown: { est: 60, sigma: 8, reviews: 3, month: 39 },
  } as Product;
  s.commerce.products.push(p);
  // 지난달 결산 — 피드 · 판매 신호가 읽는 판매 한 줄(두 상태에서 같다)
  s.history.reports.push({ month: 39, sales: [{ productId: 'P1', name: p.name, bottles: 30, revenue: 1_800_000, demandBottles: 40 }], notes: [], expenses: {} } as never);
  return { s, p };
}
const low = withProduct(40);
const high = withProduct(80);
const moy = calendar(low.s).monthOfYear;

describe('I2 — 같은 공개 정보 · 다른 참 품질이면 화면 읽기 함수의 출력이 같다 (외부 검토 D1)', () => {
  it('판매 화면 가격 비교 `priceOptions`(F5d — 아는 품질로 본다)', () => {
    expect(priceOptions(high.s, high.p, moy)).toEqual(priceOptions(low.s, low.p, moy));
  });
  it('판매 화면 수요 `domesticDemands(knownState(s))` · 제품 투영 `knownView`', () => {
    expect([...domesticDemands(knownState(high.s), moy)]).toEqual([...domesticDemands(knownState(low.s), moy)]);
    expect(knownView(high.s, high.p).quality).toBe(knownView(low.s, low.p).quality);
  });
  // ── 지금 새는 길(목록) — 고치는 PR이 it.fails → it ──
  it.fails('[누수 L1 · D1] 대형 유통 납품 단가 `retailPriceBasis`(원액 B2B 화면 · 정산 같은 함수) — 상한을 참 품질 기준가로 센다', () => {
    expect(retailPriceBasis(high.s, high.p)).toEqual(retailPriceBasis(low.s, low.p));
  });
  it.fails('[누수 L2] 할 일 「결품」 `stockoutSoon` — 수요를 `domesticDemands(s)`(참 품질)로 센다(판매 화면은 knownState)', () => {
    // 참 수요는 품질 40이면 약 3병 · 80이면 약 10병(소규모 · 인지도 낮음) — 재고 5병이면 결품 판정이 참 품질로 갈린다
    high.p.stockBottles = low.p.stockBottles = 5;
    expect(stockoutSoon(high.s)).toEqual(stockoutSoon(low.s));
  });
  it.fails('[누수 L3] 커뮤니티 피드 `feedFor` — 위스키베이스 점수 밖의 글 분위기 · 비교 글이 참 품질을 읽는다(feed.ts 68 · 283)', () => {
    expect(feedFor(high.s, 3, 40).map((x) => x.text)).toEqual(feedFor(low.s, 3, 40).map((x) => x.text));
  });
});
