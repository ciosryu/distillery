# Distillery Tycoon

종합 주류 경영 시뮬레이션 (턴제 웹 타이쿤, 개인 프로젝트)

## 문서

| 문서 | 내용 |
|---|---|
| [docs/PRD.md](docs/PRD.md) | 제품 요구사항 문서 v0.2 — 결정 로그, 시간·지역·생산·숙성·HR·재무·시장 시스템 |
| [docs/design/flavor-model.md](docs/design/flavor-model.md) | 향미 모델 설계 — 전역 축 레지스트리, 주종별 스키마, 공정 변환, 평가 함수 |
| [docs/research/demand-data.md](docs/research/demand-data.md) | 국가·지역 × 주종 기본 수요 조사 (출처·방법론·공백) |
| [data/market/base-demand.json](data/market/base-demand.json) | 게임에 투입할 기본 수요 데이터 (`node scripts/build-demand-data.mjs`로 생성) |

## 상태

Phase 0 (설계 문서). 샌드박스 모드부터 개발 예정 — 로드맵은 PRD §14.
