// 정보 비대칭 성질 시험 I2 (외부 검토 D1, 2026-11-24 · architecture §11 · F5d #338) — I1(infoLeak.test.ts)은 화면 파일이 `.quality`를
// "직접" 읽는지만 본다. 화면이 sim 함수를 거쳐 참 품질을 읽는 길은 못 잡는다(검토 재현: 대형 유통 납품 단가 `retailPriceBasis`).
// 성질: **공개 정보가 같고 참 품질만 다른 두 상태에서, 화면이 부르는 sim 읽기 함수의 출력이 같다.**
// 아직 시험으로 묶지 않은 후보(코드 읽기 — 2026-11-24 ARCH): L4 블렌딩 · 병입 화면 면세 한정판 미리보기의 「예상 면세 판매」가 `preview.evaluation.quality`(참)로
// `productDutyFreeDemand`를 부른다(Bottling.tsx — 병 재고 경고는 이미 masked) · L5 브랜드 럭셔리 지수 `productLuxury`가 `min(p.quality, …)`로 참 품질을 상한에 쓴다
// → **확인(2026-11-24): 누수 아님** — 럭셔리 지수는 화면에 나오지 않고(src/ui에 `.luxury` 표시 없음) 판매 셈에만 쓴다(판매는 참 품질이 맞다) · L6 이벤트 조건
// `highQualityProduct`(참 품질 72↑ 제품이 있을 때만 「품평회 수상」 `competition_medal`) — 이벤트가 뜨는 것 자체가 신호다. **[제안] 의도된 공개 신호로 본다**(수상은 바깥 평가가
// 품질을 드러내는 일 — 리뷰와 같은 결) — MGT 확인 · 그 밖의 이벤트 효과(events.ts 210 · 225 — 가장 좋은 제품 품질로 효과 크기)는 MGT가 화면 문구에 값이 드러나는지 본다 ·
// 결과 화면 연표의 플래그십 품질은 승리 뒤 공개(#344 HeritageReveal과 같은 자리)라 누수로 보지 않는다.
// L6 [결정 #376]: 품평회 수상 이벤트 조건이 참 품질 72↑ — 수상 자체가 참 품질 신호(앞서 "의도된 공개 신호"로 제안했으나 #376이 커뮤니티 품질로 바꾸기로 정함). 300달 같은 시드로 「수상」 달 목록을 비교한다
// L6′(MGT P-MGT-62 2026-11-24): 평론가 판정 문구의 품질 숫자(참값) — 판정 구간은 문턱 신호라 빼고 숫자만 시험한다. 오너 답(최소안 = 숫자만 뺌) 뒤 MGT 수리와 함께 it으로
// L7 [결정 #366]: 피드 글의 상위 향 이름 · 방향은 **의도된 공개 신호**(참 향 그대로 — 시트러스 대 열대처럼 향 이름이 다른 두 판은 글이 달라도 된다 · 2026-11-24 MKT 재현). 결함 신호인 잡내 문구만 추정 경로(커뮤니티 품질)를 거친다 → 시험은 잡내 축만 다른 두 판
// 지금 새는 길은 `it.fails`로 적어 둔다 — 고치면 이 시험이 "통과해 버려서" 실패하므로, 고친 PR이 `it.fails`를 `it`으로 바꾼다(목록이 줄어들기만 한다)
import { describe, expect, it } from 'vitest';
import { calendar, domesticDemands, knownState, knownView, newScenarioGame, priceOptions, type GameState, type Product } from '../sim';
import { feedFor } from '../sim/feed';
import { retailPriceBasis } from '../sim/deals';
import { stockoutSoon } from './alerts';
import { applyEffects, runEvents } from '../sim/events';
import { rngFor } from '../sim/rng';

/** 위스키 제품 하나(아는 품질 60 ±8 · 리뷰 3)를 진열한 v16 캠페인 판 — 참 품질만 인자로 */
function withProduct(trueQuality: number, flavor: Product['flavor'] = {}): { s: GameState; p: Product } {
  const s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 5, rules: 'v16' });
  s.month = 40;
  const p: Product = {
    id: 'P1', name: '싱글 몰트 1', category: 'whisky', ageYears: 3, oakMonths: 36, abv: 0.46, bottleMl: 700, chillFiltered: false, packagingId: 'standard',
    flavor, quality: trueQuality, typicity: 70, style: null, sourcedShare: 0, stockBottles: 400, price: 60_000, unitCost: 20_000,
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
  it('[누수 L1 · D1 — 고침 #364 · MKT #935] 대형 유통 납품 단가 `retailPriceBasis`(원액 B2B 화면 · 정산 같은 함수) — 상한을 참 품질 기준가로 센다', () => {
    expect(retailPriceBasis(high.s, high.p)).toEqual(retailPriceBasis(low.s, low.p));
  });
  it('[누수 L2 — 고침] 할 일 「결품」 `stockoutSoon` — 판매 화면처럼 `domesticDemands(knownState(s))`로 센다', () => {
    // 참 수요는 품질 40이면 약 3병 · 80이면 약 10병(소규모 · 인지도 낮음) — 재고 5병이면 결품 판정이 참 품질로 갈린다
    high.p.stockBottles = low.p.stockBottles = 5;
    expect(stockoutSoon(high.s)).toEqual(stockoutSoon(low.s));
  });
  it('[누수 L3 — 고침 MKT #935 · 커뮤니티 품질] 커뮤니티 피드 `feedFor` — 위스키베이스 점수 밖의 글 분위기 · 비교 글이 참 품질을 읽는다(feed.ts 68 · 283)', () => {
    expect(feedFor(high.s, 3, 40).map((x) => x.text)).toEqual(feedFor(low.s, 3, 40).map((x) => x.text));
  });
  it('[누수 L7 — 고침 #366 · MKT #935] 피드 잡내 문구 — 위스키베이스 시음 글의 「옅은 {잡내}」가 참 잡내 축(퓨젤 · 자극 등)을 읽는다(feed.ts offNote). #366 수리(MKT #862) 뒤 it', () => {
    // 품질 · 아는 품질 · 향 이름이 같고 잡내 축만 다르다. 가리는 판의 시음 글은 틱이 남긴 리뷰 점수로만 써지므로 지난달 결산에 리뷰를 둔다(MKT 재현 2026-11-24 —
    // 깨끗 「Palate: 여운.」 대 잡내 「Palate: 여운, 옅은 퓨젤(후류취).」). 향 이름 차이는 #366에서 의도된 공개 신호(위 주석)라 시험하지 않는다
    const mk = (flavor: Product['flavor']) => { const { s } = withProduct(60, flavor); (s.history.reports.at(-1) as { reviews?: unknown }).reviews = [{ productId: 'P1', scores: [83, 84] }]; return s; };
    const base = { fresh_fruit: 30 };
    expect(feedFor(mk({ ...base, feinty: 20, harshness: 60 }), 3, 40).map((x) => x.text)).toEqual(feedFor(mk(base), 3, 40).map((x) => x.text));
  });
  it.fails('[누수 L6 — #376] 품평회 수상 이벤트 조건 `highQualityProduct`가 참 품질 72↑를 본다(events.ts 42) — 이벤트가 뜨는 것 자체가 참 품질 신호. #376(커뮤니티 품질로) MGT 수리 뒤 it', () => {
    // 아는 품질 60 ±8은 같고 참 품질만 60 대 80 — 60 ~ 359개월째 300달을 같은 시드로 돌려 「수상」 기록이 뜬 달의 목록이 같아야 한다
    const medals = (q: number) => {
      const out: number[] = [];
      for (let m = 60; m < 360; m++) {
        const { s } = withProduct(q);
        s.month = m;
        const report = { month: m, events: [], notes: [], sales: [], expenses: {} } as never;
        const before = s.events.log.length;
        runEvents(s, report, calendar(s).monthOfYear);
        if (s.events.log.slice(before).some((e) => e.title.includes('수상'))) out.push(m);
      }
      return out;
    };
    expect(medals(80)).toEqual(medals(60));
  });
  it.fails('[누수 L6′ — MGT P-MGT-62 2026-11-24] 평론가 판정 문구에 최고 참 품질 숫자 — `criticVerdict`가 「무난한 평가 — 품질 ${best}」(참 p.quality)를 이벤트 기록(이벤트 탭 · 소식 창)에 쓴다(events.ts 209)', () => {
    // 판정(극찬 · 무난 · 혹평)은 문턱 신호라 빼고 **숫자만** 본다 — 두 품질 모두 「무난」 구간(murray_visit 문턱 rave 80 · pan 62)
    const effect = { type: 'criticVerdict', rave: 80, pan: 62, raveEffects: [], panEffects: [], mildEffects: [] } as const;
    const say = (q: number) => { const { s } = withProduct(q); return applyEffects(s, [effect as never], rngFor(s.seed, s.month, 'event:test'), '평론가').join(' '); };
    expect(say(65)).toContain('무난한 평가');
    expect(say(75)).toContain('무난한 평가');
    expect(say(75)).toEqual(say(65));
  });
});
