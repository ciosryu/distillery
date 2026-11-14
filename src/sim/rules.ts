// 규칙 묶음 읽기 — 의존 없는 잎 모듈 (코어 ARCH, [제안 P-ARCH-56]).
// 왜 따로: `ledger.ts`가 이 둘을 `progress.ts`에서 가져오면 `ledger → progress → blending → blendTable → maturation` 순환이 생겨
// 숙성 쪽에서 원장을 만지려는 모듈이 첫 진입점일 때 초기화 순서 오류(TDZ)가 났다(PROD #498 실측 → 지점 7·8을 warehouse.ts로 우회).
// 여기는 types만 보므로 어디서든 안전하게 부를 수 있다. `progress.ts`는 호환을 위해 그대로 다시 내보낸다
import type { DifficultyConfig, DifficultyDomain, DifficultyLevel, GameState } from './types';
import { DIFFICULTY_NORMAL, KNOBS, type KnobId } from './content/difficulty';

/** 플래그십 최소 숙성 — 시나리오가 없으면(샌드박스) 12년 */
export const DEFAULT_FLAGSHIP_MONTHS = 144;

/**
 * 캠페인 승리 적격의 최소 목재 숙성 개월 (F1, [결정 #308·#309]) — 모든 읽는 쪽이 이 한 함수를 쓴다.
 * 새 판(v16) = `scenario.campaignGoal.minOakMonths`(144) · 옛 판(`legacy-v15`) = `goal.flagshipMinMonths`(같은 144) · 샌드박스 = 기본 144
 */
export const campaignMinOakMonths = (s: Pick<GameState, 'scenario'>): number => s.scenario?.campaignGoal?.minOakMonths ?? s.scenario?.goal.flagshipMinMonths ?? DEFAULT_FLAGSHIP_MONTHS;
/** 세이브가 따르는 규칙 묶음 — 없으면 옛 판 */
export const rulesVersionOf = (s: Pick<GameState, 'rulesVersion'>) => s.rulesVersion ?? 'legacy-v15';

// ───────────── 난이도 읽기 (F6, [결정 #314] — architecture §10.10 [제안 P-ARCH-58]) ─────────────
/** 판의 난이도 스냅샷 — 없으면(옛 판·샌드박스) Normal */
export const difficultyOf = (s: Pick<GameState, 'difficulty'>): DifficultyConfig => s.difficulty ?? DIFFICULTY_NORMAL;
/** 한 영역의 단계 1·2·3 */
export const levelOf = (s: Pick<GameState, 'difficulty'>, domain: DifficultyDomain): DifficultyLevel => difficultyOf(s).levels[domain] ?? 2;
/**
 * 난이도 손잡이 값 — 시스템 코드가 자기 식에 `× knob(s, '<영역>.<이름>')`으로 곱는 **유일한 입구**. 전역 상수를 덮어쓰지 않는다(저장·재현 보존).
 * Normal은 늘 1 · 표에 없는 id도 1(자리가 생기기 전까지 효과 0) · 영역은 id 앞부분. 승리 자격·순자산 정의·숙성 물리는 이 함수를 부르지 않는다(정적 테스트)
 */
export function knob(s: Pick<GameState, 'difficulty'>, id: KnobId): number {
  const def = KNOBS[id];
  if (!def) return 1;
  const lv = levelOf(s, id.slice(0, id.indexOf('.')) as DifficultyDomain);
  return lv === 1 ? def.easy : lv === 3 ? def.hard : 1;
}
/** 이벤트 영역 배수 — `EventDef.domain` 태그가 없으면 1(평판 사건 등 "영역 없음") */
export const domainEventMul = (s: Pick<GameState, 'difficulty'>, domain?: DifficultyDomain): number => (domain ? knob(s, `${domain}.eventChance`) : 1);
