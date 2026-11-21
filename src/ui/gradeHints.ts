// 등급 화면 힌트 (결정 #339 — 등급은 "승리 순간의 성적표" · 지금 만드는 것은 화면만, 값·규칙·판정식은 단계 T).
// 순수 함수만 둔다(스토어를 읽지 않아 Node 테스트·봇에서 불러도 된다). 숨김 정보(원액 맛에서 셈한 12년 예상 품질)는 쓰지 않는다
import { GRADE, rulesVersionOf, type GameState } from '../sim';

/** 판 초반 힌트를 보이는 기간(개월) — 12년 승리 통은 대개 첫 1~2년에 채운 통이다([제안 P-PROD-66] e, PROD `prod-flagship-quality80.md`) */
export const EARLY_CASK_HINT_MONTHS = 24;

/**
 * [제안 P-PROD-66] e — 판 초반 통입 카드 한 줄: 12년 품질은 통 활성도가 가른다.
 * 근거(PROD 계산, 김포 랙 맨 아래 144개월): 새 버번 통(활성도 1.0) 70.5 · 2차 채움(0.6) 84.3 — 새 통은 탄닌이 위스키 상한 45를 넘어 감점.
 * 넣지 않는 것(#339): "채웠다 비우기" 요령 · 원액 맛에서 셈한 예상 품질. 새 캠페인(v16)만 — 옛 판은 S 조건이 다르다
 */
export function flagshipCaskHint(s: GameState): string | null {
  if (rulesVersionOf(s) === 'legacy-v15' || s.month >= EARLY_CASK_HINT_MONTHS) return null;
  return `12년 플래그십 품질은 통의 활성도(나무가 맛을 내는 세기)가 가른다 — 새 통(활성도 1.0)은 12년이면 오크·탄닌이 위스키 상한을 넘어 감점된다. 한 번 비웠다 다시 쓰는 통이나 스팟 매입의 골빈 통처럼 활성도가 낮은 통이 12년용으로 낫다. 12년 품질 ${GRADE.sFlagshipQuality}은 등급 S 조건이다`;
}

/**
 * 결과 화면 문구 (#339 · 문구는 MGT 2026-11-21, `mgt-grade-options.md` "결정 뒤 — 지금 만드는 것") — 숫자 없이 문구만(봇 평균은 규모·난이도마다 달라 유지 부담).
 * 넣지 않는 것: 재판정 · 최고 품질 약속(장치가 아직 없다) · 「채웠다 비우기」 요령 · 품질 안내(P-PROD-66 힌트가 맡는다)
 */
export const GRADE_NOTE = {
  /** 「등급 S 조건」 제목 아래 */
  meaning: 'A는 12년 위스키로 승리한 판이 받는 등급이고, S는 아주 잘 꾸린 판의 목표다.',
  /** 순자산 줄이 미달일 때만 */
  netWorthShort: '순자산 S 조건은 15년(180개월) 경영을 잣대로 한 값이라, 12년 승리 무렵에는 닿기 어렵다.',
  /** 하단 설명 끝 */
  once: '등급은 승리한 달에 한 번 매긴다.',
} as const;
