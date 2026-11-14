// 난이도 화면 문구 (F6c, [결정 #314] — architecture §10.10 [P-ARCH-58]). 판정·시뮬은 읽지 않는다 — 새 게임 화면·홈 한 줄·툴팁용
import { DIFFICULTY_DOMAIN_KO, DIFFICULTY_DOMAINS } from '../sim/content/difficulty';
import type { DifficultyConfig, DifficultyDomain, DifficultyLevel, DifficultyPreset } from '../sim';

export const PRESET_KO: Record<DifficultyPreset, string> = { easy: '쉬움', normal: '보통', hard: '어려움', custom: '사용자 설정' };
/** 화면에서 잠근 영역 — 경쟁은 경쟁 AI(1.0) 전까지 보통 고정([결정 대기 96] PM 권장안). 프리셋 값(어려움이면 3)은 저장되지만 화면 문구·세부 설정에서는 '준비 중'으로 보인다(값은 어차피 ×1). 결정이 바뀌면 이 집합만 비운다 */
export const LOCKED_DOMAINS: ReadonlySet<DifficultyDomain> = new Set<DifficultyDomain>(['competition']);
export const LEVEL_KO: Record<DifficultyLevel, string> = { 1: '쉬움', 2: '보통', 3: '어려움' };

/** 영역 하나의 짧은 표기 — "거시 어려움" */
export const domainLevelLabel = (d: DifficultyDomain, lv: DifficultyLevel): string => `${DIFFICULTY_DOMAIN_KO[d]} ${LEVEL_KO[lv]}`;

/** 한 줄 표기 — 프리셋 이름, Custom은 보통이 아닌 영역만 나열: "사용자 설정(거시경제 어려움 · 금융 환경 쉬움)". 전부 보통인 Custom은 "사용자 설정(모두 보통)" */
export function difficultyLabel(cfg: DifficultyConfig): string {
  if (cfg.preset !== 'custom') return PRESET_KO[cfg.preset];
  const parts = DIFFICULTY_DOMAINS.filter((d) => cfg.levels[d] !== 2 && !LOCKED_DOMAINS.has(d)).map((d) => domainLevelLabel(d, cfg.levels[d]));
  return `${PRESET_KO.custom}(${parts.length ? parts.join(' · ') : '모두 보통'})`;
}

/** 어려움으로 고른 영역 수 — Hard 중첩 경고([#314] 엣지 "시작 전 경고")는 셋 이상일 때 */
export const hardCount = (cfg: DifficultyConfig): number => DIFFICULTY_DOMAINS.filter((d) => cfg.levels[d] === 3 && !LOCKED_DOMAINS.has(d)).length;
export const HARD_STACK_WARN_AT = 3;
