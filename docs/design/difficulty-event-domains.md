# 난이도 이벤트 영역 태그 표 — 초안 (F6, [결정 #313·#314] · architecture §10.10 `[제안 P-ARCH-58]`)

> 등급: **초안(ARCH 합본, 2026-11-14 · PM 태스크 "세 파트 문서를 합쳐 초안")**. 입력: MGT P-MGT-48·P-MGT-51(mgt-stage-t) · MKT P-MKT-37(mkt-stage-t §4) · PROD P-PROD-56(prod-stage-t). 세 파트가 이미 같은 쪽으로 적은 것은 그대로 옮겼고, **겹치거나 비어 있던 것만 `[PM 가름]`** 표시다. 코드 반영(`content/events.ts` 각 항목의 `domain:`)은 PM이 가른 뒤 **콘텐츠 PR 하나**로 — 태그를 붙여도 Normal·옛 판은 ×1이라 출력 불변.

## 원칙 (세 파트 공통)
- 한 이벤트는 한 영역. 효과가 두 영역에 걸치면 **효과의 큰 몫**이 닿는 영역으로(둘로 쪼개지 않는다).
- `domain` 없음 = 영역 없음(늘 ×1): 결과가 **내 제품 품질에 달린 평판 사건**(난이도로 확률을 바꾸면 품질의 보상이 흔들린다 — MKT) · 새 캠페인에서 **잠긴 시스템의 사건**(수출·HR — 태그를 붙여도 v16에서 안 뜨지만, 샌드박스에서 뜨므로 영역 없음으로 둔다) · 발생 확률이 0인 **연쇄 사건**(`TRIGGERED_EVENTS`).
- `EVENT_RATE`·지역 `eventWeights`·입지 `eventBoost`는 그대로 곱한다. 영역 배수는 그 위에 한 번 더(`events.ts rollChance`).
- v16은 `system:events`가 60개월(`y5_market`)에 열리므로 `supply`·`incidents` 손잡이는 6년 차부터 효과(새 게임 화면 문구, F6c).

## 표 — 59개 (`EVENTS` 55 + `TRIGGERED_EVENTS` 4)

| 영역 | 이벤트 | 지금 범주 | 출처·메모 |
|---|---|---|---|
| **macro** (MGT) | `recession` · `whisky_boom` · `whisky_glut` · `tax_hike` | market·regulation | MGT 표 그대로. `whisky_glut`는 경쟁으로도 볼 수 있지만 `bulk` 지수·위스키 수요를 함께 움직여 거시(MGT·MKT 합의) |
| **macro** (MKT 제안) | `tw_bubble_burst` · `jeju_tourism_boom` · `jeju_tourism_slump` · `kansai_inbound_boom` · `kansai_inbound_slump` · `shochu_boom`(JP — MKT는 taste에도 적음, 아래 가름) | market | 관광·거품은 수요 총량(거시) |
| **macro** `[PM 가름]` | `korean_label_rule` · `blender_rush` · `jp_whisky_shortage` · `tax_audit` | regulation·b2b·regulation | MKT: 앞 셋은 원액 현물 지수·국산 프리미엄(`bulk.ts`)을 움직여 거시 손잡이와 같은 값 → **macro 제안**. `tax_audit`(세무조사 — 비용 사건)는 세 파트 표에 없음: **finance 또는 영역 없음** — ARCH 제안 finance(금융 환경의 "규제·세무" 비용 압력, 품질과 무관) |
| **taste** (MKT) | `highball_boom` · `peat_craze` · `sherry_trend` · `gin_fatigue` · `traditional_revival` · `tw_collector_boom` | market | MKT 표 그대로. #313 "취향 변화의 속도·폭·지속성" |
| **taste** `[PM 가름]` | `shochu_boom`(JP) | market | MKT 표에 taste로 적힘, 효과는 카테고리 수요 배수(=`highball_boom`과 같은 꼴) → **taste**(MKT 원안)로 두는 쪽을 ARCH 제안. 위 macro 줄과 중복 표기 — 한쪽만 |
| **competition** (MKT) | `ad_regulation` | regulation | 경쟁 영역의 유일한 사건. [결정 대기 96]에서 경쟁 영역이 Normal 고정이면 이 태그는 자리만(×1) |
| **supply** (PROD) | `barley_failure` · `rice_spike` · `rice_surplus` · `corn_spike` · `energy_spike` · `glass_shortage` · `barrel_shortage` · `gns_hike` | supply | PROD 표 그대로. `rice_surplus`는 호재 — Easy에서 ↑가 뜻이라 손잡이 방향이 반대(`KNOBS`에 별도 행 `supply.goodEventChance` 또는 이벤트별 부호 `[F6b PROD]`) |
| **supply** `[PM 가름]` | `tariff_retaliation` · `spain_drought` | supply | PROD: 둘 다 **supply**(효과 대부분이 수입 맥아·배럴·셰리통 원가). `tariff_retaliation`의 수출 블렌더 수요 ×0.9는 거시 성격, `spain_drought`의 셰리 향 트렌드는 취향 성격 — "한 이벤트 한 영역"이라 **supply**로 두고 부수 효과는 그대로(ARCH 제안 = PROD 원안) |
| **incidents** (MGT·PROD) | `warehouse_fire` · `flood` · `snowstorm` · `typhoon` · `earthquake` · `heatwave` · `cold_wave` · `mold_outbreak` · `still_breakdown` · `ferment_infection` | disaster | PROD 표 그대로(MGT 동의). `heatwave`·`cold_wave`는 기상 입력이지만 발생은 사고 영역. `mold_outbreak`는 이벤트 확률만 — 이벤트 밖 월 오염 추첨(숙성 물리)은 난이도 밖 |
| **finance** `[PM 가름]` | (지금 없음 — `tax_audit` 후보 위) | — | MGT 금융 손잡이는 이벤트가 아니라 금리·한도·심사·LTV·수수료(콘텐츠 상수)라 이벤트 태그는 비어도 된다 |
| **영역 없음** — 평판(MKT) | `influencer_viral` · `ambassador_response` · `competition_medal` · `critic_visit` · `murray_visit` · `intl_competition` · `blind_tasting_upset` · `overseas_critic` | market·opportunity | 결과가 제품 품질(`qualityGamble`)에 달림 — 품질 보상 보존 |
| **영역 없음** — 수출(v16 잠김) | `export_inquiry` · `export_support` · `us_tariff_hike` · `us_tariff_relief` · `cn_tariff_retaliation` | opportunity·regulation | #311. 샌드박스에서만 뜸 |
| **영역 없음** — 계약 기회 | `mega_contract` · `blender_default` | opportunity·b2b | MKT "계약 기회" — 플레이어 선택 사건 |
| **영역 없음** — 사람(v16 잠김) | `staff_poaching` · `salary_review` · `artisan_retire`(연쇄, chance 0) | people | `system:hr` 잠김 — 인건비 압력은 이벤트가 아니라 `finance.laborMul/wageDrift` 손잡이([결정 대기 94]) |
| **영역 없음** — 연쇄 | (`TRIGGERED_EVENTS` 나머지 — chance 0, 선행 사건·연구가 띄움) | — | 발생 확률이 없어 배수가 닿을 자리가 없다 |

- **집계:** macro 8(+가름 4) · taste 6(+가름 1) · competition 1 · supply 8(+가름 2) · incidents 10 · finance 0(+가름 1) · 영역 없음 18 + 연쇄.
- **PM이 가를 것 6건:** ① `korean_label_rule`·`blender_rush`·`jp_whisky_shortage` → macro(MKT 제안) ② `tax_audit` → finance / 없음 ③ `shochu_boom` → taste / macro ④ `tariff_retaliation` → supply(PROD) ⑤ `spain_drought` → supply(PROD) ⑥ `rice_surplus` 호재 방향 처리(F6b PROD 몫 — 태그 자체는 supply).

## 반론·리스크
- 지역 한정 사건(제주·간사이·대만)은 그 입지에서만 뜨므로 영역 배수가 입지별로 다르게 체감된다 — 의도(입지 별점은 창업 화면 몫, 난이도는 그 위에 곱함).
- 영역 없음이 18개라 "Hard는 행운도 적어야 한다"는 반론이 남는다(MKT 리스크 3). 품질 보상 보존을 우선한다 — 1.0에서 평판 사건의 **크기**(확률 아님)를 영역 손잡이로 둘지 재검.
- 이 표는 코드가 아니다. `content/events.ts`에 `domain:`을 붙이는 PR은 PM 가름 뒤 하나로 — 그때 "태그 수 = 표의 수" 테스트를 함께 넣는다.
