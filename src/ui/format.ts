export function won(v: number): string {
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(v);
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(2)}억`;
  if (a >= 1e4) return `${sign}${Math.round(a / 1e4).toLocaleString('ko-KR')}만`;
  return `${sign}${Math.round(a).toLocaleString('ko-KR')}원`;
}

export const wonFull = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}원`;
export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
export const liters = (v: number) => `${v.toLocaleString('ko-KR', { maximumFractionDigits: v < 100 ? 1 : 0 })}L`;
export const num = (v: number, digits = 0) => v.toLocaleString('ko-KR', { maximumFractionDigits: digits });
export const months = (m: number) => (m >= 12 ? `${Math.floor(m / 12)}년 ${m % 12}개월` : `${m}개월`);
