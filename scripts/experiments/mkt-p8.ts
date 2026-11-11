// MKT 측정을 판정용 봇 P8 위에서 (#265 — "파트 측정 스크립트는 이 봇 위에 손잡이만 얹는다", docs/design/mkt-stage-t.md)
// P8(`mvp-human.ts`, MGT)은 고치지 않는다. 콘텐츠 값을 실험 안에서만 바꾼 뒤 P8을 그대로 불러 돌린다(모듈 싱글턴이라 바뀐 값이 P8에 닿는다).
// 실행: npx tsx scripts/experiments/mkt-p8.ts [시드=10] [개월=180]  — 출력은 P8 표 그대로(X0 대 X1 "− 수출"이 수출 증분, T-MKT-1)
//   ALLOC=margin|domestic|proportional  수출 배분(EXPORT_SALES.allocation) — domestic이면 수출은 국내를 채운 뒤 남는 재고만
//   SUPPLY=<배수>                       증류기 1회 투입량 배수(pot_onion_1000 chargeL, ×2까지 — 발효조 2,000L에 들어가야 한다) — 원액 공급을 늘려 수출이 국내를 대신하는지 보탤 수 있는지
//   EXPORT_MKT=<배수>                   수출 현지 마케팅 분담 배수(시장 monthlyCost) — 인지도 성장도 같이 바뀐다
//   TIER(기본 standard)·YEARLY·SPLIT 등 mvp-human.ts의 다른 환경 변수는 그대로 쓴다
import { EXPORT_MARKETS, EXPORT_SALES } from '../../src/sim/content/exports';
import { PRODUCTION_EQUIPMENT } from '../../src/sim/content/production';

if (process.env.ALLOC) EXPORT_SALES.allocation = process.env.ALLOC as typeof EXPORT_SALES.allocation;
if (process.env.SUPPLY) {
  const still = PRODUCTION_EQUIPMENT.pot_onion_1000 as { chargeL: number };
  still.chargeL = Math.round(still.chargeL * Math.min(2, Number(process.env.SUPPLY)));
}
if (process.env.EXPORT_MKT) for (const m of Object.values(EXPORT_MARKETS)) m.monthlyCost = Math.round(m.monthlyCost * Number(process.env.EXPORT_MKT));
process.env.P8 = '1';
process.env.TIER ??= 'standard';
console.log(`[mkt-p8] 손잡이: 배분 ${EXPORT_SALES.allocation} · 공급(증류기 투입량) ×${process.env.SUPPLY ?? 1} · 수출 마케팅 분담 ×${process.env.EXPORT_MKT ?? 1}`);
await import('./mvp-human');
