# Distillery Tycoon — 모든 세션이 지킬 것

이 저장소는 여러 Claude 세션이 나눠서 개발한다. 시작하면 먼저 아래를 읽는다:

1. [`docs/PROCESS.md`](docs/PROCESS.md) — 개발 공정 (단계·브랜치·번호·검사·세션 역할)
2. [`docs/STATUS.md`](docs/STATUS.md) — 지금 단계, 누가 무엇을 하는지, 오너 결정 대기
3. 자기 역할의 문서 — 설계 세션은 [`docs/design/skeleton.md`](docs/design/skeleton.md), 파트 세션은 skeleton.md §3의 자기 파트

## 반드시 지킬 규칙

- **정본은 `main`이다.** 작업 브랜치는 최신 `main`에서 시작하고, PR은 `main`으로 보낸다. `claude/dazzling-mccarthy-40er1r`는 동결(커밋·머지 금지)
- **결정 번호를 스스로 매기지 않는다.** 새 결정은 임시 ID `P-<파트>-<n>`(예: `P-MKT-2`)로 쓰고, 정식 번호(#164~)는 머지할 때 공정관리 세션이 [`docs/DECISIONS.md`](docs/DECISIONS.md)에서 발급한다. PRD 새 절도 `§NEW-<파트>-<n>`으로 둔다
- **지금은 단계 P(파트 개발)다** (#153, 2026-11-06). 첫 우선순위는 MVP 완성 → 사람 플레이테스트. 세밀한 수치 튜닝·밸런스 판정은 여전히 하지 않는다(단계 T). 명백한 붕괴만 고친다
- **자기 역할의 파일만 고친다.** 파트별 소유 파일은 skeleton.md §3.2. 코어 파일(§3.1)은 설계 세션 소유이고, 파트가 코어를 바꿔야 하면 작은 **코어 PR**을 따로 올린다(PROCESS §7.3)
- **PR 전 검사:** `npm run typecheck` · `npm test` · `npm run build` · 바꾼 시스템이 닿는 입지에서 `npm run balance -- 2 120 all <지역> [입지]`가 오류 없이 끝나는지
- 규칙을 바꾸면 해당 PRD 절·설계 문서를 같은 PR에서 고친다. 결정은 오너만 한다 — 세션은 근거·대안·리스크와 함께 `[제안]`한다

## 코드 요약

- `src/sim/` 순수 TypeScript 시뮬레이션(React 의존 없음) — 상태 `GameState` v14(도메인 슬라이스 + 시나리오 + 숙성 용기 + 진행 + 브랜드 + 연구 + 재무 확장·경쟁 자리 + 제품 피니싱 표기), 월 틱 `step.ts`, 행동 `actions.ts`, 엔진 계약 `engine.ts`, 세이브 마이그레이션 `migrate.ts`
- `src/sim/content/` 콘텐츠 데이터 · `src/store/` Zustand · `src/ui/` React 웹 프로토타입(최종은 Godot 4 + C#)
- `scripts/balance-sim.ts` 헤드리스 밸런스 시뮬레이션 · `scripts/codemods/v6-slices.mjs` 옛 평면 상태 코드를 슬라이스로 바꾸는 코드모드 · `scripts/experiments/mvp-survival.ts` MVP 생존 실험
