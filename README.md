# Distillery Tycoon

종합 주류 경영 시뮬레이션 (월 단위 턴제 웹 타이쿤, 개인 프로젝트)

## 실행

```bash
npm install
npm run dev        # 개발 서버 (http://localhost:5173)
npm test           # 시뮬레이션 단위 테스트
npm run balance    # 헤드리스 밸런스 시뮬레이션 (기본 20시드 × 120개월)
npm run build      # 타입 검사 + 프로덕션 빌드
```

## 현재 범위 — Phase 1 샌드박스 MVP (한국)

| 시스템 | 내용 |
|---|---|
| 시간 | 1턴 = 1개월. 1개월 / 분기 / 1년 진행. 생산 지시는 바꿀 때까지 매달 반복 |
| 생산 | 증류식 소주·진·몰트 위스키 레시피(원재료 배합, 효모, 발효 기간, 증류 횟수, 컷 포인트, 상압/감압, 보태니컬) |
| 설비 | 단식(양파·랜턴·웜텁)·하이브리드·감압 증류기, 스테인리스·옹기 발효조, 숙성고 증설 — 설치 기간 있음 |
| 숙성 | 캐스크 3종(ex-버번 배럴·올로로소 벗·한국 참나무 쿼터), 크기·기온에 따른 숙성 속도, 습도에 따른 도수 변화, 재사용·재탄화 |
| 병입 | LPA 가중 블렌딩, 숙성 연수 = 최저 연수, 위스키(36개월·40%)·진(주니퍼 지배) 표기 규칙, 도수·병·칠 필터·패키징 |
| 시장 | 한국 기본 수요(`data/market/base-demand.json`) × 인지도 × 유통 커버리지 × 매력도 × 가격 탄력성, 주세(종가세 72% + 교육세) |
| 재무·HR | 급여·관리비·유지비·마케팅, 대출 3종, 직원 3직군(디스틸러·숙성고 매니저·영업)·레벨업, 원액 브로커(NDP) |
| 저장 | 브라우저 localStorage 자동 저장 |

### 밸런스 기준선 (`npm run balance`, 단순 정책 기준)

- 초기 현금 5억 원 + 기본 설비로 시작
- 2~3년차에 현금이 약 0.6~1.1억 원까지 내려가고, 대부분 운전자금 대출을 사용
- 3개월 평균 기준 흑자 전환 19~37개월(평균 약 26개월). 4년차 위스키 출시 이후 회복
- 아무것도 병입하지 않고 방치하면 파산

수치는 모두 `[튜닝]` 대상입니다. 특히 한국 진 시장 규모는 데이터 공백이라 임시 추정치를 씁니다(PRD §15-8).

## 구조

```
src/sim/      순수 TypeScript 시뮬레이션 코어 (React 의존 없음)
  content/    콘텐츠 데이터 (향미 축, 원재료·설비·캐스크, 주종 스키마, 한국 지역)
  step.ts     advanceMonth(state) — 월간 처리
  actions.ts  applyAction(state, action) — 플레이어 행동
src/store/    Zustand 스토어 (시뮬레이션 래핑 + 저장)
src/ui/       React + Tailwind 화면
scripts/      밸런스 시뮬레이션, 수요 데이터 빌더
```

## 문서

| 문서 | 내용 |
|---|---|
| [docs/PRD.md](docs/PRD.md) | 제품 요구사항 문서 v0.3 — 결정 로그, 시간·지역·생산·숙성·HR·재무·시장 시스템, 로드맵 |
| [docs/design/flavor-model.md](docs/design/flavor-model.md) | 향미 모델 설계 — 전역 축 레지스트리, 주종별 스키마, 공정 변환, 평가 함수 |
| [docs/research/demand-data.md](docs/research/demand-data.md) | 국가·지역 × 주종 기본 수요 조사 (출처·방법론·공백) |
| [data/market/base-demand.json](data/market/base-demand.json) | 게임에 투입할 기본 수요 데이터 (`npm run data:demand`로 생성) |
