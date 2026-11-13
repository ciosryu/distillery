export function won(v: number): string {
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(v);
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(2)}억`;
  if (a >= 1e4) return `${sign}${Math.round(a / 1e4).toLocaleString('ko-KR')}만`;
  return `${sign}${Math.round(a).toLocaleString('ko-KR')}원`;
}

/** 공개 KPI(순자산·재고 평가액)의 표시 단위 — 늘 100만 원 ([결정 #310] 1단계 = architecture §11.4 안 A). 정보 계약 I3: 배치 묶음의 참 품질이 샘플 1회 오차보다 촘촘하게 드러나지 않게 */
export const KPI_UNIT_WON = 1_000_000;
/**
 * 거친 금액 표시 — 늘 100만 원 단위(0.01억) ([결정 #310] 1단계, 안 A). 순자산·재고 평가액 같은 **참값 합계 KPI**에만 쓴다.
 * 현금·대출·목표는 판단에 쓰는 숫자라 `won()` 그대로(§11.4 반론). 판정·결산 기록은 바꾸지 않는다(참값 그대로)
 */
export function wonCoarse(v: number): string {
  const sign = v < 0 ? '−' : '';
  const units = Math.round(Math.abs(v) / KPI_UNIT_WON);
  return `${sign}${(units / 100).toFixed(2)}억`;
}

export const wonFull = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}원`;
export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
export const liters = (v: number) => `${v.toLocaleString('ko-KR', { maximumFractionDigits: v < 100 ? 1 : 0 })}L`;
export const num = (v: number, digits = 0) => v.toLocaleString('ko-KR', { maximumFractionDigits: digits });
export const months = (m: number) => (m >= 12 ? `${Math.floor(m / 12)}년 ${m % 12}개월` : `${m}개월`);
