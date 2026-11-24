// 피니시 표기의 판매 효과 판정 ([결정 #270] · [결정 #362], MKT) — market.ts(매력도 · 기대 가격)와 brands.ts(럭셔리)가 같이 읽는다. 둘 사이 순환을 피해 따로 둔다
import { FINISH_LABEL } from './content/market';
import type { Product } from './types';

/**
 * 피니시 표기 효과가 켜지는 문턱(개월) — `FINISH_LABEL.minMonths`의 이름 붙인 사본. PROD 병입 화면의 보충 줄이 "보충 뒤 피니시 n개월 → 문턱 미만이라 효과가 꺼진다"를
 * 미리 보일 때 이것을 읽는다(PROD 요청 2026-11-24 — 문턱이 두 곳에 있으면 [튜닝] 때 화면과 판매 효과가 어긋난다). import 방향 PROD → MKT, 코어 거치지 않음(ARCH 동의)
 */
export const FINISH_EFFECT_MIN_MONTHS: number = FINISH_LABEL.minMonths;

/**
 * 피니시 표기 효과가 켜지는가 ([결정 #362] · ARCH 검토 2026-11-24) — 표기(`finish`)가 있고 피니시 통에 FINISH_LABEL.minMonths 이상.
 * 개월은 병입 때 PROD가 남기는 `Product.finishMonths`(#878 — 섞으면 짧은 쪽, 표기와 같은 보수 규칙)만 읽는다. `caskMonthsMix`는 지역 통 선호(`styleFit`, #361) 전용.
 * `finishMonths`는 v16 판 병입에서만 쓰이므로 옛 판(legacy-v15) · 옛 제품은 저절로 중립이다 — 판을 받지 않는다(PM 범위 판단 #308 · #343과 같은 결과)
 */
export const finishLabelOn = (p: Partial<Pick<Product, 'finish'>> & { finishMonths?: number }): boolean =>
  !!p.finish && (p.finishMonths ?? 0) >= FINISH_EFFECT_MIN_MONTHS;
