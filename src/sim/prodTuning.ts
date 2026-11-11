// PROD 수치 손잡이 (단계 T 측정 준비 T-0, docs/design/prod-stage-t.md) — 파트 PROD.
// 게임은 이 값을 읽기만 한다. 실험 스크립트(scripts/experiments/prodKnobs.ts)가 환경 변수로 바꿔 40시드를 돌린다.
// 기본값은 단계 P의 값 그대로다(바꾸면 출력이 바뀐다 — 단계 T 판정 뒤 [제안]으로만). 수치는 모두 `[튜닝]`
export const PROD_TUNING = {
  /** 자동 납품이 남겨 두는 플래그십 후보 통 수 (#259, P-PROD-39 — economics.ts flagshipReserve). 4통 ≈ 700ml 40% 약 1,500병 */
  flagshipReserve: 4,
  /** 위스키 원액 생산 건너뛰기 — 월초 현금 < 이 값 × 매달 나가는 돈이면 쉰다 (#267, P-PROD-42 — production.ts whiskySkipCheck) */
  whiskySkipFixedMonths: 0.5,
  /** 어린 위스키(3년 미만) 인식 — 1.18 × (floor + (1 − floor) × (개월/36)^curve). 0개월 0.47 · 12개월 0.77 · 24개월 0.98 (PRD §6 v0.8 — blending.ts agePerception) */
  youngWhiskyFloor: 0.4,
  youngWhiskyCurve: 0.8,
};
