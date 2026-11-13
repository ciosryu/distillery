# 실행 검증 기록

검증일: 2026-11-13 JST. 환경: Windows PowerShell, Node v26.0.0, npm 11.12.1.

## 고정 기준

- 감사 저장소 사본: `repository/`.
- 기존 기준: `d0b6886506b3f8da50bf37aa2ad11bbb84e733fe` (2026-11-11 12:26:38 +09:00).
- 최신 정본: `45a138f6e7eae64453e63646c1429025992386a9` (2026-11-13 10:47:37 +09:00), `origin/main`과 일치.
- `git merge-base --is-ancestor d0b6886 HEAD` 성공. 기준선은 최신 정본의 조상이다.
- `git diff --exit-code` 성공. 추적 파일 수정 없음. 의존성 설치로 `.npm-cache/`만 미추적 생성됨.
- GitHub 메타데이터의 기본 브랜치는 `claude/dazzling-mccarthy-40er1r`. 정본 지도·공정·CLAUDE.md 지시에 따라 main을 별도로 선택했다.

## 실행한 검사

| 검사 | 실행 | 결과 | 해석 |
|---|---|---|---|
| 의존성 | `npm ci --ignore-scripts --cache .npm-cache --no-audit --no-fund --fetch-retries=0 --fetch-timeout=20000` | 62개 패키지 설치 | 설치 스크립트 미실행. 잠금 파일 변경 없음 |
| 타입 | `npm run typecheck` | PASS | 기존 TS 코드 타입 검사 |
| 테스트 | `npm test -- --maxWorkers=2` | **38개 파일 / 591개 PASS**, 14.29초 | 현재 규칙의 테스트. 신규 CORE 수용 테스트 아님 |
| 웹 빌드 | `npm run build` | PASS, 144 modules | JS 번들 약 1,004.86kB, gzip 315.78kB. 500kB 초과 경고 존재 |
| KR 스모크 | `npm run balance -- 2 120 all KR` | 종료 코드 0, 5전략 × 2시드, 파산 0/10 | 샌드박스 120개월의 실행 오류 점검. 새 캠페인·다중시드 합격 증거 아님 |

테스트 실행 중 Node의 localStorage 환경 경고가 나왔으나 테스트 실패는 없었다. 첫 제한 환경의 의존성 설치는 네트워크 대기로 중단했고 정상 네트워크 접근으로 재실행해 완료했다.

## KR 스모크 결과

| 전략 | 파산 | 120개월 평균 순자산 | 수출 비중 |
|---|---|---|---|
| brand | 0/2 | 25.48억 | 41.4% |
| hybrid | 0/2 | 27.17억 | 39.0% |
| expand | 0/2 | 21.86억 | 41.2% |
| grain | 0/2 | 7.49억 | 0.1% |
| site | 0/2 | 27.05억 | 45.0% |

시가 기준 1위는 hybrid 1회, site 1회. 이 작은 표본으로 지배 전략·균형을 판정하지 않는다. 수출 비중이 높은 현재 샌드박스 결과를 수출이 제외될 신규 MVP의 생존 근거로 재사용하지 않는다.

## 실행하지 않은 검사

- 신규 배치 계보·정상 출고·품질 비공개·6영역 난이도의 수용 테스트: 기능 패치 전이므로 Not-run.
- 신규 목표 전체 캠페인 완주·40시드 프리셋 밸런스·Custom 극단 조합: Not-run.
- Godot/C# 빌드·언어 간 골든: 감사한 Git 추적 트리에 구현이 없어 Not-run.
- 브라우저/네이티브 UI 조작 및 실제 Steam 출시 검증: Not-run. 화면 노출 판정은 소스 정적 확인이다.
- 8개 입지 전체 회귀: Not-run. 이번 작업은 소스 변경 없는 감사이며 KR 스모크만 수행했다.

## 자료 범위 검증

- `read_thread`는 turnLimit=10, maxOutputCharsPerItem=20000으로 호출했으나 5개 문답·hasMore=false·nextCursor=null·첨부 없음만 반환했다.
- CORE 109행: 직접 문답 3개(107/108/109), 이전 감사 요약 연결 26개, 원문 미확보 80개.
- LEGACY 270행 중 260개는 원장 본문이 있고 10개는 예약/결번(#97~99, #110~116). 합본 1/26 및 10/25는 각각 별도 ID로 같은 원문에 연결했다.
- 최신 추가 REPO 271~307, 37행을 별도로 보존했다.
- 원문 미확보 CORE는 disposition=null이며 KEEP/OVERRIDE/EXTEND/DEFER로 추정하지 않았다.
- 최신 12년 싱글 몰트 위스키 유상 출하안은 권장 검토안으로 기록했다. 질문을 확정 승인으로 바꾸지 않았다.
