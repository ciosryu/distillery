import { fail, type CashKeys, type Handlers } from './actionKit';

// 플레이어 행동 — 시나리오·진행 (META, S-9). 결정 #144의 처리기 표 구조를 따른다
// 행동을 더할 때: 아래 타입·처리기·현금 분류 세 곳만 고친다

export type MetaAction =
  /** 결과 화면을 확인했다 — 그 뒤는 목표 없이 계속 운영(샌드박스) */
  | { type: 'acknowledgeVerdict' };

export const META_CASH_KEY: CashKeys<MetaAction> = {
  acknowledgeVerdict: null,
};

export const META_HANDLERS: Handlers<MetaAction> = {
  acknowledgeVerdict: (s, prev, _a) => {
    if (!s.progress.verdict) return fail(prev, '아직 목표 판정이 없습니다');
    // [결정 #433] 「명작」 결과 화면이 떠 있으면 그것을 먼저 닫는다(같은 버튼)
    if (s.progress.masterpiece && !s.progress.masterpiece.acknowledged) {
      s.progress.masterpiece = { ...s.progress.masterpiece, acknowledged: true };
      if (!s.progress.verdict.acknowledged) s.progress.verdict = { ...s.progress.verdict, acknowledged: true };
      return { state: s, message: '계속 운영합니다 — 명작' };
    }
    // 옛 세이브(#422 · #427 재판정 — #433으로 폐지)의 닫히지 않은 재판정 결과 화면도 같은 버튼으로 닫는다
    if (s.progress.verdictBest && !s.progress.verdictBest.acknowledged) {
      s.progress.verdictBest = { ...s.progress.verdictBest, acknowledged: true };
      if (!s.progress.verdict.acknowledged) s.progress.verdict = { ...s.progress.verdict, acknowledged: true };
      return { state: s, message: '계속 운영합니다 — 등급이 올랐다' };
    }
    if (s.progress.verdict.acknowledged) return { state: prev };
    s.progress.verdict = { ...s.progress.verdict, acknowledged: true };
    return { state: s, message: '계속 운영합니다 — 이제 목표 없이 자유롭게' };
  },
};
