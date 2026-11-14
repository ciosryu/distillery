// 가치평가 3종 (코어 ARCH — F5b, [결정 #310 2단계 · #317 · #326], MGT P-MGT-47 표 · architecture §10.10 P-ARCH-57 F5b).
// 참값(숨은 품질)을 읽지 않는다 — 통 원액의 품질 자리에는 **관측값 q̂**(샘플 기록·형제 기록, 없으면 보수적 사전값)만 쓴다. 탱크 원액은 공개값(N 등급 §11.1)이라 참 품질 그대로.
// 같은 관측·다른 참 품질 짝 상태에서 세 값·담보 한도가 같다(REQ-CORE-5 1). 순수 함수 — 상태·난수를 바꾸지 않는다.
//   ① bookValue      장부 원가 — 보험·세무·자본비용. 시장 지수·관측과 무관
//   ② estimatedValue 추정 시장가치 — q̂의 bulkValuePerLPA(전량 포화·매입 할인 없음) + 병 재고 × 세전 출고가. 화면 "추정 가치"·가격 추천
//   ③ liquidationValue 처분 예상액 — q̂의 spotBidPerLPA(매입 할인·신뢰도·운송; **전량 매각 포화는 미적용** — lpa 0을 넘긴다. KR·JP는 그레인 현물 깊이가 없어 MVP 영향 0, 스코틀랜드 그레인만 과대 → F7, MKT 검토 2026-11-14)
//      + 병 재고 원가(최근 12개월 **모든 유상 채널** 판매량 초과분은 처분 계수) − 남은 납품 의무(선급금). "지금 정리하면 받는 돈" = v16 netWorth
//   범위 밖: 병입 제품 `Product.quality`의 공개(가격 책상·권장가·자동 가격·피드)는 이 파일이 다루지 않는다 — #310 "병입·판매 뒤 공개 예외 폐지"는 F5d(결정 대기 95, P-MKT-39)
import { knownReads } from './blendTable';
import { bulkValuePerLPA, isBulkKind, lotQuality, spotBidPerLPA } from './bulk';
import { rulesVersionOf } from './rules';
import type { Cask, GameState, SpiritLot } from './types';

/**
 * 관측이 없는 통의 사전 품질 `[튜닝]` — P25(결정 93 답, PM 2026-11-14 "P25를 초기값으로"). 평균으로 두면 "맛을 안 보는 쪽이 평가가 높은" 판이 생겨 샘플의 정보 가치가 음수가 된다.
 * 주종별 공개 기대 품질의 낮은 분위 자리 — 값은 단계 T에서 분포로 맞춘다 `[확인 불가 — 지금은 자리값]`
 */
export const QHAT_PRIOR: Record<string, number> = { malt: 45, grain: 40, soju: 45, gin: 45, baijiu: 45 };
/** 병 재고 처분(#317): 최근 k개월 판매량까지는 원가, 초과분은 처분 계수를 곱한다 `[튜닝]` — 처음엔 약하게(PM) */
export const BOTTLE_LIQ = { months: 12, excessDiscount: 0.1 } as const;

/** 통 원액의 관측 품질 q̂ — 자기 샘플 기록(가장 최근) → 형제 통 기록(#162) → 사전값. 참 품질(`lotQuality`)은 읽지 않는다 */
export function qHat(s: GameState, cask: Cask, known: Map<string, { estQuality: number }> = knownReads(s)): number {
  const own = cask.sampleLog?.at(-1)?.estQuality;
  if (own != null) return own;
  const rec = known.get(cask.id);
  if (rec) return rec.estQuality;
  return QHAT_PRIOR[cask.contents?.kind ?? 'malt'] ?? 45;
}

/** 평가에 드는 통 — 원액 있음 · 현물 시장 있는 주종 · 고객 소유 아님(#146) · 선판매 묶임 아님(#326 `rights.presold`) */
export const valuedCasks = (s: GameState): (Cask & { contents: SpiritLot })[] =>
  s.inventory.casks.filter((c): c is Cask & { contents: SpiritLot } => !!c.contents && isBulkKind(c.contents) && !c.owner && !c.rights?.presold);
/** 담보로 잡을 수 있는 통 — 평가 통에서 다른 대출 담보(#326 `rights.lien`)를 뺀다(이중 담보 0) */
export const collateralCasks = (s: GameState): (Cask & { contents: SpiritLot })[] => valuedCasks(s).filter((c) => !c.rights?.lien);

const lpaOf = (l: SpiritLot) => l.volumeL * l.abv;
const tankLots = (s: GameState) => s.inventory.lots.filter(isBulkKind);
const receivables = (s: GameState) => s.finance.receivables.reduce((t, r) => t + r.amount, 0);
const loans = (s: GameState) => s.finance.loans.reduce((t, l) => t + l.balance, 0);
/** 선급금을 받고 아직 납품하지 않은 몫 — 재고는 한 번만 세고, 남은 의무는 부채로 한 번 뺀다(P-MGT-47 불변식 3) */
export const prepaidObligations = (s: GameState): number => s.b2b.contracts.reduce((t, c) => t + Math.max(0, c.prepaidRemaining ?? 0), 0);

/**
 * 제품의 최근 k개월 **유상 출하** 병 수 — 결산의 판매 사건(F3 `saleEvents`: 국내 소매·면세·수출·대형 유통 납품·핸드필 모두)으로 센다.
 * `report.sales`는 국내 소매만이라(MKT 재현: 납품 7,200병이 0으로 셈) 쓰지 않는다 — 사건이 없는 옛 결산(F3 전 세이브)만 `sales`로 대신한다
 */
export function recentSoldBottles(s: GameState, productId: string, months = BOTTLE_LIQ.months): number {
  return s.history.reports.slice(-months).reduce((t, r) => t + (r.saleEvents ? r.saleEvents.filter((e) => e.productId === productId).reduce((a, e) => a + e.bottles, 0) : r.sales.filter((x) => x.productId === productId).reduce((a, x) => a + x.bottles, 0)), 0);
}
/** 병 재고 — 'book' 원가 · 'est' 세전 출고가 · 'liq' 원가, 단 최근 k개월 판매량을 넘는 재고는 처분 계수(#317 보강) */
export function bottleStockValue(s: GameState, mode: 'book' | 'est' | 'liq'): number {
  return s.commerce.products.reduce((t, p) => {
    if (mode === 'book') return t + p.stockBottles * p.unitCost;
    if (mode === 'est') return t + p.stockBottles * p.price;
    const excess = Math.max(0, p.stockBottles - recentSoldBottles(s, p.id));
    return t + (p.stockBottles - excess) * p.unitCost + excess * p.unitCost * (1 - BOTTLE_LIQ.excessDiscount);
  }, 0);
}

/** ① 장부 원가 — 원액은 쌓인 원가(`costPerLPA`), 병은 원가. 시장·관측과 무관 */
export function bookValue(s: GameState): number {
  const spirits = [...tankLots(s), ...valuedCasks(s).map((c) => c.contents)].reduce((t, l) => t + lpaOf(l) * l.costPerLPA, 0);
  return Math.round(s.finance.cash - loans(s) + receivables(s) + spirits + bottleStockValue(s, 'book'));
}
/** ② 추정 시장가치 — 통은 q̂, 탱크는 공개 품질. 전량 포화·매입 할인 없음 */
export function estimatedValue(s: GameState): number {
  const known = knownReads(s);
  const tanks = tankLots(s).reduce((t, l) => t + lpaOf(l) * bulkValuePerLPA(s, l), 0);
  const casks = valuedCasks(s).reduce((t, c) => t + lpaOf(c.contents) * bulkValuePerLPA(s, c.contents, qHat(s, c, known)), 0);
  return Math.round(s.finance.cash - loans(s) + receivables(s) + tanks + casks + bottleStockValue(s, 'est'));
}
/** ③ 처분 예상액 — "지금 정리하면 받는 돈". 통은 q̂ 현물 매입가(할인·운송; 전량 매각 포화는 F7), 병은 원가(초과분 할인), 남은 납품 의무는 부채 */
export function liquidationValue(s: GameState): number {
  const known = knownReads(s);
  const tanks = tankLots(s).reduce((t, l) => t + lpaOf(l) * spotBidPerLPA(s, l), 0);
  const casks = valuedCasks(s).reduce((t, c) => t + lpaOf(c.contents) * spotBidPerLPA(s, c.contents, 0, qHat(s, c, known)), 0);
  return Math.round(s.finance.cash - loans(s) + receivables(s) + tanks + casks + bottleStockValue(s, 'liq') - prepaidObligations(s));
}
/** 세 값 한 번에 — 화면·측정용 */
export const valuation = (s: GameState) => ({ book: bookValue(s), est: estimatedValue(s), liq: liquidationValue(s) });

/**
 * 담보 가치(v16) — 담보 가능 통(고객 소유·선판매·다른 담보 제외)의 q̂ 현물 시가(`bulkValuePerLPA`, 지금 식 그대로 품질 자리만 관측값). 한도 = 이 값 × 입지 `inventoryLtv`.
 * 옛 판은 `loans.ts`가 지금 식(참 품질)을 그대로 쓴다 — X0L 바이트 동일
 */
export function collateralValue(s: GameState): number {
  const known = knownReads(s);
  return collateralCasks(s).reduce((t, c) => t + lpaOf(c.contents) * bulkValuePerLPA(s, c.contents, qHat(s, c, known)), 0);
}
/** 이 판이 새 평가(관측 기반)를 쓰는가 — v16(샌드박스 포함). 옛 판(`legacy-v15`)은 참 품질 식 */
export const usesObservedValuation = (s: Pick<GameState, 'rulesVersion'>): boolean => rulesVersionOf(s) !== 'legacy-v15';
/** 참 품질 자리를 쓰는 옛 식과의 차이 확인용(테스트·측정) — 통 참 품질 */
export const trueQualityOf = (c: Cask & { contents: SpiritLot }) => lotQuality(c.contents);
