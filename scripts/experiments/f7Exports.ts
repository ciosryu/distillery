// F7-A 블록 C — 같은 판본 수출 실험 해제 (MGT `[제안 P-MGT-53]` · PM 배정 2026-11-16, 결정 #327 순서: F7-0 → Normal 값 → F7-A).
// **측정 전용.** 게임 규칙(#311 수출 1.0)은 그대로다. MKT 하네스(`mkt-p8v`)가 끼움 자리 `beforeBottle`에서 `m === 84`일 때 부른다 —
// 끼움 자리 등록은 프로세스에 하나라 이 파일은 등록하지 않고 함수만 내보낸다(MKT 검토 ③). 부작용 없는 순수 함수다.
import type { GameState } from '../../src/sim';

/** 옛 판 `y7_export` 단계가 84개월에 풀던 키와 같다(`content/scenarios.ts` stages). `event:export_inquiry`는 풀지 않는다(MKT 권장 — 반사실을 "수출 탭" 한 요인으로) */
export const EXPORT_UNLOCK_KEYS = ['system:exports', 'action:acceptExportOffer', 'action:setExportPrice', 'action:closeExport'] as const;
/** 수출을 실험으로 푸는 달 — 옛 판 단계와 같은 84개월. 0개월에 풀면 수출 제안이 전역 id(nid)를 밀어 "잠김" 짝과 초반부터 어긋난다(MKT 검토 ②) */
export const EXPORT_UNLOCK_MONTH = 84;

/** 새 상태를 돌려준다(받은 상태는 바꾸지 않는다). 시나리오가 없거나 이미 풀렸으면 같은 객체 */
export function unlockExports(s: GameState): GameState {
  const sc = s.scenario;
  if (!sc || !EXPORT_UNLOCK_KEYS.some((k) => sc.locked.includes(k))) return s;
  return { ...s, scenario: { ...sc, locked: sc.locked.filter((k) => !(EXPORT_UNLOCK_KEYS as readonly string[]).includes(k)) } };
}
