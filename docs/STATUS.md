# 현황판

> 공정관리 세션이 갱신한다. 규칙은 [PROCESS.md](PROCESS.md). **마지막 갱신: 2026-11-06**

## 지금

| 항목 | 상태 |
|---|---|
| 단계 | **S 뼈대** — 시작 2026-11-06. 완료 기준은 [PROCESS.md](PROCESS.md) §2, 할 일은 [skeleton.md](design/skeleton.md) §4 |
| 기준 브랜치 | `main` (ciosryu/distillery#10로 전환). 옛 기준 `claude/dazzling-mccarthy-40er1r`는 동결 |
| `main` 내용 | PRD v1.6 · 결정 #1~#138 (빈 번호: #97·#110~#117은 열린 PR 예약, #98·#99는 결번) · 상태 스키마 v7 · 테스트 130개 |
| 다음 결정 번호 | **#139** ([DECISIONS.md](DECISIONS.md)) |
| 밸런스 기준선 | **없음** — 통합 뒤 재측정은 단계 T에서. 통합 전 수치는 PRD §16.28(아키텍처 재편)·§17.6(수출 확장) |

## 세션

| 세션 | 역할 | 브랜치 | 상태 |
|---|---|---|---|
| 공정관리 | PM | `claude/hopeful-tesla-n0kk50` | 진행 중 |
| 설계 | ARCH | (시작 전) | 오너가 시작한다 — 시작 문구는 PROCESS.md §7.5 |
| 스코틀랜드 | (규칙 이전 세션) | `claude/hopeful-pascal-wm32n3` | ciosryu/distillery#9 WIP — 아래 "열린 PR" 참고 |
| 병 가격 숙성 | (규칙 이전 세션) | `claude/fervent-mccarthy-anosrs` | ciosryu/distillery#6 |
| 확장형 안전장치 | (규칙 이전 세션) | `claude/expand-stage-fix` | ciosryu/distillery#5 |
| 아키텍처 재편 | (규칙 이전 세션) | `claude/distillery-tycoon-architecture-11o9nq` | ciosryu/distillery#7 머지 완료 → **종료 대상** |

## 열린 PR과 처리 방침 (오너 동의 2026-11-06)

| PR | 내용 | 공정상 위치 | 제안 |
|---|---|---|---|
| ciosryu/distillery#9 | 스코틀랜드(영국)·스페이사이드 (예약 #110~#116), WIP | 단계 P/Phase 3 콘텐츠. 뼈대 결정 S-3(지역 추가 = 데이터 추가)에 걸린다 | **일시 정지 권장.** v5 코드라 `main`을 받으려면 코드모드가 필요하다. S-3 결정 뒤 재개 |
| ciosryu/distillery#6 | 병 가격 숙성 프리미엄 (예약 #117) | 단계 P 규칙(MKT) | **보류.** PR #9 브랜치 위에 쌓여 있다. 단계 P에서 `main` 기준으로 다시 올린다 |
| ciosryu/distillery#5 | 확장형 안전장치 (예약 #97) | 단계 T 봇 정책(BAL) | **보류.** 단계 T에서 `main` 기준으로 다시 올린다. §16.26 → 새 절 번호 |

## 따라잡기 필요 (`main`이 바뀐 뒤 각 브랜치가 할 일)

`main`은 상태 스키마 v7(도메인 슬라이스)이다. 아래 브랜치는 v5(평면) 코드다.

1. `git merge origin/main` — 충돌이 많으면 먼저 자기 브랜치에 코드모드를 돌린다: `npm i --no-save ts-morph@24 && node scripts/codemods/v6-slices.mjs` (자세한 방법: ciosryu/distillery#10 설명 "코드 통합 방법")
2. 새 필드는 해당 슬라이스에, 옛 세이브 매핑은 `src/sim/migrate.ts`의 `V5_FIELD_MAP`에 넣는다
3. 결정 번호는 [DECISIONS.md](DECISIONS.md) 예약 표를 따른다. 새 결정은 임시 ID `P-<파트>-<n>`

| 브랜치 | PR | 따라잡기 |
|---|---|---|
| `claude/hopeful-pascal-wm32n3` | #9 | 필요 |
| `claude/fervent-mccarthy-anosrs` | #6 | 필요 (#9 뒤) |
| `claude/expand-stage-fix` | #5 | 필요 (단계 T에서) |

## 오너 결정 대기

| # | 질문 | 누가 묻나 |
|---|---|---|
| 1 | ~~열린 PR 처리 방침~~ → 동의(2026-11-06): #9 일시 정지, #6 `main` 기준 재작업, #5 단계 T까지 보류 | — |
| 2 | 설계 세션을 언제 시작할까? 첫 안건: MVP 모드 설정(S-8)·숙성 용기 일반화(S-10) | PM |

## 다음 할 일

| 순서 | 일 | 세션 |
|---|---|---|
| 1 | ~~MVP 생존 실험~~ → **완료: 현재 수치로는 70~100% 파산(5~7년 차)**, 원인은 시장 크기 대비 고정비 ([mvp.md](design/mvp.md) §6.1). **MVP 경제 규모 결정(A 규모 축소·B 자본·C 비지터 센터·D 수요)이 설계 세션 첫 안건** | 설계 |
| 2 | MVP 모드(시나리오 설정 + 기능 플래그) 뼈대 — S-8 | 설계 |
| 3 | 숙성 용기 일반화·피니싱 자리 — S-10 (#134) | 설계 |
| 4 | 병 가격 숙성 반영(§15.3 #13) — MVP 필수(#133), 재고 평가액 곡선(#138)의 선행 조건. PR #6을 `main` 기준으로 다시 올릴지 결정 | 설계 → MKT |
| 5 | MVP 단일 화면 — 현금·평가액 곡선(#138), 샘플 추정치만 보이는 숙성고(#136), 빈 자리 표시(#137) | 설계 → UI |

## 최근 기록

| 날짜 | 일 |
|---|---|
| 2026-11-06 | `main`을 기준 브랜치로 전환(ciosryu/distillery#10). 기준 브랜치(해외 명성 #96·수출 확장 #100~#109) + PR #7(아키텍처 재편) 통합, PR #7 결정 #118~#126으로 재발급. PR #5·#9 base를 `main`으로 변경 |
| 2026-11-06 | 개발 공정·문서 정본 수립, MVP 정의·코어 루프 확정 — 결정 #127~#134 발급 (ciosryu/distillery#11) |
| 2026-11-06 | MVP v0.2 — 오너 보완안 4가지 승인, 결정 #135~#138 발급 |
| 2026-11-06 | MVP 생존 실험 — 한국 경기 소주 + 몰트로는 70~100% 파산. `scripts/experiments/mvp-survival.ts` |
