// 공급 지평 — [제안 P-PROD-54] 실험판 (docs/design/prod-stage-t.md 「AP3-PROD-1」 2.). 기존 상태만 읽는다 — 게임 규칙·상태를 바꾸지 않는다.
// 자동 가격 3정책(#288) 측정에서 "공급이 유한하고 보충이 늦은 제품"(장기 숙성 표기·플래그십)을 가려내는 잣대. 승인되면 src/sim/economics.ts로 옮긴다.
//   지금 채울 수 있는 병 = 자동 납품이 지금 쓸 수 있는 원액(`autoRestockSources` — 보호 태그·피니시·도수·표기 연수 규칙 그대로)
//   곧 닿는 병 = soonMonths(기본 12) 안에 그 제품 자동 납품 하한(표기 연수)에 닿는 통(위스키만 — 같은 거름 규칙, 숙성만 [하한 − soonMonths, 하한))
//   공급 지평(개월) = (재고 + 지금 채울 수 있는 병) ÷ 판매 속도(`salesEma`) — 판매가 없으면 Infinity
//   보충 끊김(refillGap) = 곧 닿는 병이 0 — 지금 원액을 다 쓰면 1년 안에 다시 채울 수 없다(위스키만. 탱크 주종은 생산이 매달 흐르므로 false)
// 다른 래퍼에서: import { supplyHorizon } from './prodSupply' — 예) 장기 계열 제품의 정책 고르기 조건, AP3 조건표의 "장기 숙성" 칸 정의
import { autoRestockExcluded, autoRestockFloor, autoRestockSources, autoRestockSupported } from '../../src/sim/economics';
import { isCaskStrength, isWhiskyCategory } from '../../src/sim/blending';
import { finishOf, vesselMaterial } from '../../src/sim/maturation';
import type { GameState, Product, SpiritLot } from '../../src/sim';

export interface SupplyHorizon {
  /** 지금 재고(병) */
  stock: number;
  /** 지금 채울 수 있는 병 — 자동 납품 규칙으로 쓸 수 있는 원액 */
  readyBottles: number;
  /** soonMonths 안에 표기 연수에 닿는 통의 병 */
  soonBottles: number;
  /** 판매 속도(병/월, salesEma) */
  salesPerMonth: number;
  /** 공급 지평(개월) = (재고 + 지금 채울 수 있는 병) ÷ 판매 속도 */
  months: number;
  /** 보충 끊김 — 위스키이고 곧 닿는 병이 0 */
  refillGap: boolean;
}

const bottlesOf = (lots: SpiritLot[], p: Pick<Product, 'bottleMl' | 'abv'>) => {
  const perBottle = (p.bottleMl / 1000) * p.abv;
  return perBottle > 0 ? Math.floor(lots.reduce((t, l) => t + l.volumeL * l.abv, 0) / perBottle) : 0;
};

export function supplyHorizon(s: GameState, p: Product, soonMonths = 12): SupplyHorizon {
  const ready = autoRestockSources(s, p);
  const readyBottles = bottlesOf(ready.map((x) => x.lot), p);
  let soonBottles = 0;
  const whisky = isWhiskyCategory(p.category) && autoRestockSupported(p); // 블렌디드는 자동 납품 대상이 아니다 → 0
  if (whisky) {
    // autoRestockSources의 위스키 거름 규칙(보호 태그·피니시·도수·종류)을 그대로 쓰되, 숙성은 [하한 − soonMonths, 하한)
    // (autoRestockFloor는 법정 최소로 묶여 있어 하한만 낮춰 다시 부르면 3년 제품의 24~35개월 통을 못 잡는다)
    const floor = autoRestockFloor(s, p);
    const kind = p.category === 'grain_whisky' ? 'grain' : 'malt';
    const minAbv = isCaskStrength(p) ? 0.4 : p.abv - 1e-9;
    const finish = p.finish ?? null;
    const excluded = autoRestockExcluded(s, p);
    const near = s.inventory.casks.flatMap((c) => (c.contents && !c.owner && !c.handfill && !c.contaminationKnown && vesselMaterial(c) === 'wood'
      && c.contents.kind === kind && !c.contents.sourced && c.contents.oakMonths >= floor - soonMonths && c.contents.oakMonths < floor
      && c.contents.abv >= minAbv && (finishOf(c.contents)?.typeId ?? null) === finish && !excluded.has(c.id) ? [c.contents] : []));
    soonBottles = bottlesOf(near, p);
  }
  const salesPerMonth = p.salesEma ?? 0;
  const months = salesPerMonth > 0 ? (p.stockBottles + readyBottles) / salesPerMonth : Infinity;
  return { stock: p.stockBottles, readyBottles, soonBottles, salesPerMonth, months, refillGap: whisky && soonBottles === 0 };
}
