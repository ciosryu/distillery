// 난이도 화면 문구 (F6c, [결정 #314] — architecture §10.10 [P-ARCH-58]). 판정·시뮬은 읽지 않는다 — 새 게임 화면·홈 한 줄·툴팁용
import { DIFFICULTY_DOMAIN_KO, DIFFICULTY_DOMAINS } from '../sim/content/difficulty';
import type { DifficultyConfig, DifficultyDomain, DifficultyLevel, DifficultyPreset } from '../sim';

export const PRESET_KO: Record<DifficultyPreset, string> = { easy: '쉬움', normal: '보통', hard: '어려움', custom: '사용자 설정' };
/** 화면에서 잠근 영역 — 경쟁은 경쟁 AI(1.0) 전까지 보통 고정([결정 #329] — 경쟁 AI가 들어오면 집합을 비운다). 프리셋 값(어려움이면 3)은 저장되지만 화면 문구·세부 설정에서는 '준비 중'으로 보인다(값은 어차피 ×1). 결정이 바뀌면 이 집합만 비운다 */
export const LOCKED_DOMAINS: ReadonlySet<DifficultyDomain> = new Set<DifficultyDomain>(['competition']);
export const LEVEL_KO: Record<DifficultyLevel, string> = { 1: '쉬움', 2: '보통', 3: '어려움' };

/**
 * 판을 크게 바꾸지 않는 영역 — F7-B(봇 3,120판 + 2차): 영역 단독 Hard에서 거시·취향·원자재는 |t| < 2(사고 −6.2억 · 금융 −4.7억과 대비).
 * `[제안 P-ARCH-60]` (A) — [결정 #331]과 같은 날. 값이 커져 영향이 생기면 이 집합을 비운다(경쟁의 `LOCKED_DOMAINS`와 같은 꼴)
 */
export const MINOR_DOMAINS: ReadonlySet<DifficultyDomain> = new Set<DifficultyDomain>(['macro', 'taste', 'supply']);
/** 영역 영향 표시 — 세부 설정 줄 옆 */
export const domainImpactLabel = (d: DifficultyDomain): string => (LOCKED_DOMAINS.has(d) ? '준비 중' : MINOR_DOMAINS.has(d) ? '변덕만 조금' : '영향 큼');
/** 영역이 무엇을 바꾸는지 한 줄 — 손잡이 표(content/difficulty.ts)의 실제로 닿는 행만 */
export const DOMAIN_WHAT: Record<DifficultyDomain, string> = {
  incidents: '사고·재난의 빈도와 손실 · 증류기 수리 기간 (6년 차부터)',
  finance: '대출 금리·한도·거치 · 급여와 해마다 오르는 폭 · 세무조사',
  macro: '불황·붐의 빈도와 폭',
  taste: '향미 유행의 폭·속도',
  supply: '원재료·배럴·에너지 파동 (6년 차부터)',
  competition: '경쟁 AI와 함께 열린다',
};
/** 프리셋 한 줄 — F7-B 최종 후보 값의 체감(final-*.json `felt`)을 줄인 것 */
export const PRESET_WHAT: Record<Exclude<DifficultyPreset, 'custom'>, string> = {
  easy: '사고가 드물고 작다 · 대출이 싸고 한도가 크다 · 급여가 오르지 않는다',
  normal: '기준값',
  hard: '사고가 잦고 크다 · 대출이 비싸고 한도가 작다 · 급여가 해마다 2% 오른다 — 표준 규모는 순자산 등급 기준에 닿기 어렵다(승리 조건은 같다)',
};

/** 영역 하나의 짧은 표기 — "거시 어려움" */
export const domainLevelLabel = (d: DifficultyDomain, lv: DifficultyLevel): string => `${DIFFICULTY_DOMAIN_KO[d]} ${LEVEL_KO[lv]}`;

/** 한 줄 표기 — 프리셋 이름, Custom은 보통이 아닌 영역만 나열: "사용자 설정(거시경제 어려움 · 금융 환경 쉬움)". 전부 보통인 Custom은 "사용자 설정(모두 보통)" */
export function difficultyLabel(cfg: DifficultyConfig): string {
  if (cfg.preset !== 'custom') return PRESET_KO[cfg.preset];
  const parts = DIFFICULTY_DOMAINS.filter((d) => cfg.levels[d] !== 2 && !LOCKED_DOMAINS.has(d)).map((d) => domainLevelLabel(d, cfg.levels[d]));
  return `${PRESET_KO.custom}(${parts.length ? parts.join(' · ') : '모두 보통'})`;
}

/** 영향 큰 영역 중 어려움으로 고른 수 — Hard 중첩 경고([#314] 엣지 "시작 전 경고"). 잠긴 영역·변덕만 조금인 영역은 세지 않는다(P-ARCH-60 — 어려움 5칸 = 실질 2칸이었다) */
export const hardCount = (cfg: DifficultyConfig): number => DIFFICULTY_DOMAINS.filter((d) => cfg.levels[d] === 3 && !LOCKED_DOMAINS.has(d) && !MINOR_DOMAINS.has(d)).length;
/** 경고 문턱 — 영향 큰 영역 하나라도 어려움이면(PM 판단 2026-11-19: F7-B 단독 Hard만으로 사고 −6.2억 · 금융 −4.7억, MGT 의견과 같음) */
export const HARD_STACK_WARN_AT = 1;
/** 어려움으로 고른 영향 큰 영역 — 경고 문구용 */
export const hardMajorDomains = (cfg: DifficultyConfig): DifficultyDomain[] => DIFFICULTY_DOMAINS.filter((d) => cfg.levels[d] === 3 && !LOCKED_DOMAINS.has(d) && !MINOR_DOMAINS.has(d));
