// PROD 실험 손잡이 (단계 T 측정 준비 T-0, docs/design/prod-stage-t.md) — 환경 변수로 켠다. 아무것도 안 주면 아무 일도 하지 않는다(출력 불변).
//   FLAGSHIP_RESERVE=<통>      자동 납품이 남겨 두는 플래그십 후보 통 수 (기본 4, T-PROD-1 · #259)
//   WHISKY_SKIP=<개월>          위스키 원액 생산 건너뛰기 기준 — 월초 현금 < n × 고정비 (기본 0.5 · 0이면 현금이 0 아래일 때만 · -1e12면 끔, T-PROD-3 · #267)
//   YOUNG_FLOOR=<비율>          어린 위스키 인식의 0개월 바닥 (기본 0.4 → 1.18 × 0.4 = 0.47, T-PROD-6 · MKT T-MKT-11)
//   YOUNG_CURVE=<지수>          어린 위스키 인식 곡선 (기본 0.8 — 12개월 0.77)
// 쓰는 법: 실험 스크립트 맨 앞에서 applyProdKnobs()를 부른다(지금은 단계 T에서 BAL이 판정 스크립트에 한 줄 넣는다 — P8 mvp-human.ts는 MGT,
// mvp-survival.ts는 ARCH 소유라 PROD가 고치지 않았다). 게임 규칙은 src/sim/prodTuning.ts
import { PROD_TUNING } from '../../src/sim/prodTuning';

const env = process.env;

/** 환경 변수를 게임 손잡이에 넣는다. 켠 것이 있으면 한 줄 설명(stderr)을 남긴다 */
export function applyProdKnobs(): string {
  const on: string[] = [];
  const num = (k: string) => (env[k] != null && env[k] !== '' ? Number(env[k]) : null);
  const reserve = num('FLAGSHIP_RESERVE');
  if (reserve != null) { PROD_TUNING.flagshipReserve = reserve; on.push(`flagshipReserve=${reserve}`); }
  const skip = num('WHISKY_SKIP');
  if (skip != null) { PROD_TUNING.whiskySkipFixedMonths = skip; on.push(`whiskySkip=${skip}`); }
  const floor = num('YOUNG_FLOOR');
  if (floor != null) { PROD_TUNING.youngWhiskyFloor = floor; on.push(`youngFloor=${floor}`); }
  const curve = num('YOUNG_CURVE');
  if (curve != null) { PROD_TUNING.youngWhiskyCurve = curve; on.push(`youngCurve=${curve}`); }
  for (const [k, v] of Object.entries(PROD_TUNING)) if (!Number.isFinite(v)) throw new Error(`PROD 손잡이 ${k}가 숫자가 아니다`);
  const label = on.join(' ');
  if (label) console.error(`PROD 손잡이: ${label}`);
  return label;
}
