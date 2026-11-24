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

/** 새 캠페인(v16)의 기본 정기 임금 상승률 — 연 1% ([결정 #330]). 난이도 손잡이 `finance.wageDrift`는 이 상승분에 곱하는 배수다(Normal ×1) */
export const BASE_WAGE_DRIFT_V16 = 0.01;
/**
 * 판의 기본 정기 임금 상승률([결정 #330]) — **v16 판 중 상세 HR(`system:hr`)이 잠긴 판만** 0.01, 옛 판(`legacy-v15`)·HR이 열린 판(샌드박스 `newGame` 등)은 0.
 * 근거를 조건 그대로 둔다(ARCH 제안): HR이 열려 있으면 연봉 협상(`salary_review`)이 이미 임금을 올리므로 겹치지 않는다. 나중에 v16 시나리오가 HR을 열면 그 달부터 자동으로 꺼진다.
 * (`scenario.ts isLocked`와 같은 식 — 이 잎 모듈은 types·content만 보므로 직접 쓴다)
 */
export const baseWageDrift = (s: Pick<GameState, 'rulesVersion' | 'scenario'>): number => (rulesVersionOf(s) === 'v16' && s.scenario?.locked.includes('system:hr') ? BASE_WAGE_DRIFT_V16 : 0);

/**
 * 샘플 읽기 난수 키의 통 몫 ([결정 #351]) — **v16 캠페인(시나리오가 있는 v16 판)이면 통 id + 채움 번호**, 그 밖(옛 판 `legacy-v15` · 샌드박스)은 통 id 그대로.
 * 왜: 키가 통 id + `cask.samples`뿐이었고 `samples`는 채울 때 · 비울 때 비워지므로, 한 통의 첫 읽기 오차가 그 통의 **모든 채움**에 붙었다(앞뒤 채움 오차 상관 0.97, architecture §10.10).
 * 같은 채움 안에서는 그대로다 — 자동 샘플(#201)이 같은 내용물을 다시 떠도 같은 값(참값으로 수렴하지 않음). 새 값 없음.
 * 쓰는 곳: `blendTable.ts` 육각형 읽기(`perceive`) · 축 읽기(`perceive-axes`) · 품질 읽기(`sample-quality`) 세 키
 */
export const sampleNoiseId = (s: Pick<GameState, 'rulesVersion' | 'scenario'>, cask: { id: string; fills: number }): string =>
  rulesVersionOf(s) === 'v16' && !!s.scenario ? `${cask.id}#f${cask.fills}` : cask.id;

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
  const lv = levelOf(s, id.slice(0, id.indexOf('.')) as DifficultyDomain);
  if (lv === 2) return 1;
  // 시작 때 고정한 값이 있으면 그것만(P-MGT-59 C안 — 값 표가 바뀐 빌드에서 이어 해도 같은 판). 없으면 표(메모리 안 실험·테스트)
  const pinned = s.difficulty?.values;
  if (pinned) return pinned[id] ?? 1;
  const def = KNOBS[id];
  if (!def) return 1;
  return lv === 1 ? def.easy : def.hard;
}
/**
 * 난이도 손잡이 k로 배수의 **1에서의 거리**만 늘리고 줄인다(0.8 → k 2면 0.6 · 1.5 → k 0.5면 1.25). k = 1이면 값을 그대로 돌려준다 —
 * `1 + (x − 1) × 1`은 부동소수 오차로 x와 달라질 수 있어 Normal 바이트 동일이 깨진다(MKT #566 `aroundOne`과 같은 식 — 잎 모듈에 둔 사본)
 */
export const aroundOne = (x: number, k: number): number => (k === 1 ? x : 1 + (x - 1) * k);
/** 이벤트 효과 크기 배수(`<영역>.eventMagnitude`) — modifier 효과 배수의 1에서의 거리에 곱한다. 태그 없으면 1 */
export const eventMagnitudeMul = (s: Pick<GameState, 'difficulty'>, domain?: DifficultyDomain): number => (domain ? knob(s, `${domain}.eventMagnitude`) : 1);
/** 이벤트 효과 기간 배수(`<영역>.eventDuration`) — modifier·향미 유행·기상 충격의 개월에 곱한다(반올림, 최소 1). 태그 없으면 1 */
export const eventDurationMul = (s: Pick<GameState, 'difficulty'>, domain?: DifficultyDomain): number => (domain ? knob(s, `${domain}.eventDuration`) : 1);
/** 이벤트 영역 배수 — `EventDef.domain` 태그가 없으면 1(평판 사건 등 "영역 없음") */
export const domainEventMul = (s: Pick<GameState, 'difficulty'>, domain?: DifficultyDomain): number => (domain ? knob(s, `${domain}.eventChance`) : 1);
