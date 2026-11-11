# 문서 정본 지도

> 어떤 문서가 무엇의 정본인지, 누가 고치는지 정한다. 규칙은 [PROCESS.md](PROCESS.md).

## 정본 원칙

1. **`main` 브랜치의 `docs/`가 정본이다.** 작업 브랜치에서 고친 문서는 머지 전까지 초안이다
2. **한 주제에 정본은 하나다.** 같은 내용을 두 문서에 쓰지 않는다. 다른 문서는 링크로 가리킨다
3. **결정 번호의 원장은 [DECISIONS.md](DECISIONS.md) 하나다.** PRD·설계 문서·코드 주석의 "#n"은 모두 그 번호다
4. 문서마다 **등급**이 있다:
   - **정본** — 지금 유효한 사양·규칙
   - **기록** — 실험·밸런스 측정 결과처럼 당시 사실을 남긴 것. 고치지 않고, 새 결과는 새 절로 덧붙인다
   - **초안** — 아직 결정되지 않은 설계
   - **조사** — 외부 자료 요약·원본

## 문서 목록

| 문서 | 무엇의 정본인가 | 등급 | 고치는 세션 |
|---|---|---|---|
| [PROCESS.md](PROCESS.md) | 개발 공정 — 단계·작업 흐름·브랜치·번호·검사·세션 구성 | 정본 | 공정관리 |
| [STATUS.md](STATUS.md) | 지금 단계·세션·열린 PR·오너 결정 대기 | 정본(수시 갱신) | 공정관리 |
| [DECISIONS.md](DECISIONS.md) | 결정 로그·번호 원장 | 정본 | 공정관리(머지 때) |
| [PRD.md](PRD.md) | 게임 규칙 전체 사양 | §1~§15: 정본 · §16.9 이후 밸런스 측정 표와 §17.2~§17.6: **기록** | 절마다 해당 파트. §0·§14·§15는 공정관리 |
| [design/requirements.md](design/requirements.md) | 공통 요구사항 템플릿·REQ 색인(#279) | 정본(템플릿 `[제안 P-ARCH-39]`) | 설계(템플릿)·공정관리(색인) |
| [design/late-game-gate.md](design/late-game-gate.md) | 후반 경험 게이트 L 설계(#274) | 초안(`[제안 P-ARCH-43]` — 기준은 오너 승인) | 설계 |
| [design/prod-stage-t.md](design/prod-stage-t.md) · [mkt-stage-t.md](design/mkt-stage-t.md) · [mgt-stage-t.md](design/mgt-stage-t.md) | 파트별 단계 T 확인 목록·측정 도구·요구사항(REQ) 초안(#265·#279) | 정본(목록) + 초안(REQ·제안) | PROD · MKT · MGT |
| [design/game-program.md](design/game-program.md) | GAME 개선 프로그램(#280) — GAME-01~09 판단표·PM 역제안·세션별 태스크·의존성·오너 승인 안건·상태판 | 정본(작업 프로그램, 수시 갱신) | 공정관리 |
| [design/requirements-audit.md](design/requirements-audit.md) | 요구사항·핵심 재미 감사 Phase A(2026-11-11) — 규칙 대응표·우선 조사 8개·작업 패키지·의사결정 요청 | 기록 | 공정관리 |
| [design/mvp.md](design/mvp.md) | MVP 정의·코어 루프·한 판 목표·길이·완료 기준 | 정본(결정 부분) + 초안(`[제안]` 부분) | 설계·공정관리 |
| [design/skeleton.md](design/skeleton.md) | 뼈대 — 시스템 지도·파트 경계·구조 결정 백로그 | 정본(단계 S 작업 문서) | 설계 |
| [design/architecture.md](design/architecture.md) | 코드 아키텍처·Godot 이식 명세 | 정본 | 설계 |
| [design/flavor-model.md](design/flavor-model.md) | 향미 모델 | 정본 v0.1 | PROD |
| [design/blending-minigame.md](design/blending-minigame.md) | 블렌딩 테이블 미니게임 | 정본(1차 범위) + 초안(2차) | PROD |
| [design/tech-tree.md](design/tech-tree.md) | 테크트리·연구 | 정본(설계) — 코드는 게이트만 | MGT |
| [design/export.md](design/export.md) | 수출 시장 설계 | 정본(구현됨 #100~#109) | MKT |
| [design/regions.md](design/regions.md) | 지역·입지 특성 원안 | **§0.1 이식 현황만 정본**, 본문은 기록(초안 번호 #57~#72는 이 원장과 다르다) | 공정관리(정리) |
| [design/scotland.md](design/scotland.md) | 스코틀랜드 지역 | 초안 v0.2 (구현은 MVP 플레이테스트 뒤 `main`에서 다시, #195) | 콘텐츠 |
| [research/](research/) | 수요·시장 조사 | 조사 | 조사 |
| [`data/market/base-demand.json`](../data/market/base-demand.json) | 게임에 넣는 기본 수요 | 정본(생성물 — `npm run data:demand`) | MKT |

## 고치는 법

- 정본을 바꾸려면 작업 브랜치에서 고치고 PR로 머지한다. 규칙을 바꾸는 PR은 그 규칙의 PRD 절과 설계 문서를 **같은 PR에서** 고친다
- 새 결정은 임시 ID(`P-<파트>-<n>`)로 적고, 번호는 머지 때 받는다 ([PROCESS.md](PROCESS.md) §5)
- 기록 등급의 절은 고치지 않는다. 숫자가 틀렸으면 새 절에서 정정하고 옛 절 제목에 `⚠ §n.m이 최신`을 단다(PRD §16.9·§16.11의 방식)
