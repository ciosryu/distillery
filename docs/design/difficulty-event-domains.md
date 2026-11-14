# 난이도 이벤트 영역 태그 표 — 초안 (F6, [결정 #313·#314] · architecture §10.10 `[제안 P-ARCH-58]`)

> 등급: **확정 표(ARCH 합본 2026-11-14 → PM 가름 6건 반영, 콘텐츠 `content/events.ts domain:` 태그 41개 = 이 표, 테스트 `eventDomains.test.ts`)**. 입력: MGT P-MGT-48·P-MGT-51(mgt-stage-t) · MKT P-MKT-37(mkt-stage-t §4) · PROD P-PROD-56(prod-stage-t). 세 파트가 이미 같은 쪽으로 적은 것은 그대로, 겹치거나 비어 있던 6건은 PM이 갈랐다(아래 `[PM 가름 → …]`). 태그를 붙여도 Normal·옛 판은 ×1이라 출력 불변.

## 태그가 닿는 손잡이 (코어)
| 손잡이 | 어디에 | 비고 |
|---|---|---|
| `<영역>.eventChance` | `events.ts rollChance` — 월 발생 확률 × k | F6a #561 |
| `<영역>.eventMagnitude` | `events.ts applyEffects` — `modifier` 효과 배수의 **1에서의 거리** × k(`aroundOne`: 0.8 → k 2면 0.6) | #571. 직접 효과(현금·통 소실·발효 오염)는 안 닿음 — `incidents.lossSize` 등 파트 행 |
| `<영역>.eventDuration` | `events.ts applyEffects` — `modifier`·`flavorTrend`·`weather` 개월 × k, **반올림 뒤 하한 1개월** | #571. 난수 호출은 그대로(스트림 불변) · 향미 유행 **세기**는 MKT `taste.flavorTrendStrength`가 한 번만 |
태그 없는 이벤트는 셋 모두 ×1.

**방향 규칙(PROD 확인 ②, 정적 테스트 `eventKnobs.test.ts`):** `supply`·`incidents`·`finance`·`competition` 태그 이벤트의 modifier 효과는 모두 **플레이어에게 불리한 방향**이어야 한다 — 원가 키(`ingredient:`·`energy`·`packaging`·`cask:`)는 배수 ≥ 1, 수요·시세·생산·인지도 키(`demand:`·`bulk`·`dutyfree`·`production`·`awareness_gain`)는 ≤ 1. 그래야 Hard(`eventChance`·`eventMagnitude` ↑)가 호재를 키우지 않는다. 호재(`rice_surplus`)는 무태그 + 전용 크기 행. `macro`·`taste`는 **변동성** 뜻(불황·붐 양방향 — #313 "폭")이라 이 규칙에서 뺀다 — Hard 거시 = 붐도 크고 불황도 크다. 배수 0(`m('production', 0, …)`)은 크기 손잡이가 건드리지 않고, 그 외는 0 하한.

## 원칙 (세 파트 공통)
- 한 이벤트는 한 영역. 효과가 두 영역에 걸치면 **효과의 큰 몫**이 닿는 영역으로(둘로 쪼개지 않는다).
- `domain` 없음 = 영역 없음(늘 ×1): 결과가 **내 제품 품질에 달린 평판 사건**(난이도로 확률을 바꾸면 품질의 보상이 흔들린다 — MKT) · 새 캠페인에서 **잠긴 시스템의 사건**(수출·HR — 태그를 붙여도 v16에서 안 뜨지만, 샌드박스에서 뜨므로 영역 없음으로 둔다) · 발생 확률이 0인 **연쇄 사건**(`TRIGGERED_EVENTS`).
- `EVENT_RATE`·지역 `eventWeights`·입지 `eventBoost`는 그대로 곱한다. 영역 배수는 그 위에 한 번 더(`events.ts rollChance`).
- v16은 `system:events`가 60개월(`y5_market`)에 열리므로 `supply`·`incidents` 손잡이는 6년 차부터 효과(새 게임 화면 문구, F6c).

## 표 — 59개 (`EVENTS` 55 + `TRIGGERED_EVENTS` 4)

| 영역 | 이벤트 | 지금 범주 | 출처·메모 |
|---|---|---|---|
| **macro** (MGT) | `recession` · `whisky_boom` · `whisky_glut` · `tax_hike` | market·regulation | MGT 표 그대로. `whisky_glut`는 경쟁으로도 볼 수 있지만 `bulk` 지수·위스키 수요를 함께 움직여 거시(MGT·MKT 합의) |
| **macro** (MKT 제안) | `tw_bubble_burst` · `jeju_tourism_boom` · `jeju_tourism_slump` · `kansai_inbound_boom` · `kansai_inbound_slump` | market | 관광·거품은 수요 총량(거시) |
| **macro** `[PM 가름 → macro]` | `korean_label_rule` · `blender_rush` · `jp_whisky_shortage` | regulation·b2b | 원액 현물 지수·국산 프리미엄(`bulk.ts`)을 움직여 거시 손잡이와 같은 값(MKT 제안, PM 확정) |
| **taste** (MKT) | `highball_boom` · `peat_craze` · `sherry_trend` · `gin_fatigue` · `traditional_revival` · `tw_collector_boom` | market | MKT 표 그대로. #313 "취향 변화의 속도·폭·지속성" |
| **taste** `[PM 가름 → taste]` | `shochu_boom`(JP) | market | 효과가 카테고리 수요 배수(`highball_boom`과 같은 꼴) — MKT 원안대로 taste |
| **competition** (MKT) | `ad_regulation` | regulation | 경쟁 영역의 유일한 사건. [결정 대기 96]에서 경쟁 영역이 Normal 고정이면 이 태그는 자리만(×1) |
| **supply** (PROD) | `barley_failure` · `rice_spike` · `corn_spike` · `energy_spike` · `glass_shortage` · `barrel_shortage` · `gns_hike` | supply | PROD 표 그대로(호재 `rice_surplus`는 아래 영역 없음) |
| **supply** `[PM 가름 → supply]` | `tariff_retaliation` · `spain_drought` | supply | 효과 대부분이 수입 맥아·배럴·셰리통 원가(PROD 원안, PM 확정). 수출 블렌더 수요·셰리 향 트렌드 부수 효과는 그대로 |
| **incidents** (MGT·PROD) | `warehouse_fire` · `flood` · `snowstorm` · `typhoon` · `earthquake` · `heatwave` · `cold_wave` · `mold_outbreak` · `still_breakdown` · `ferment_infection` | disaster | PROD 표 그대로(MGT 동의). `heatwave`·`cold_wave`는 기상 입력이지만 발생은 사고 영역. `mold_outbreak`는 이벤트 확률만 — 이벤트 밖 월 오염 추첨(숙성 물리)은 난이도 밖 |
| **finance** `[PM 가름 → finance]` | `tax_audit` | regulation | 세무조사 — 품질과 무관한 비용 압력. MGT 금융 손잡이의 본체는 금리·한도·심사·LTV·수수료(콘텐츠 상수, F6b) |
| **영역 없음** — 평판(MKT) | `influencer_viral` · `ambassador_response` · `competition_medal` · `critic_visit` · `murray_visit` · `intl_competition` · `blind_tasting_upset` · `overseas_critic` | market·opportunity | 결과가 제품 품질(`qualityGamble`)에 달림 — 품질 보상 보존 |
| **영역 없음** — 수출(v16 잠김) | `export_inquiry` · `export_support` · `us_tariff_hike` · `us_tariff_relief` · `cn_tariff_retaliation` | opportunity·regulation | #311. 샌드박스에서만 뜸 |
| **영역 없음** — 계약 기회 | `mega_contract` · `blender_default` | opportunity·b2b | MKT "계약 기회" — 플레이어 선택 사건 |
| **영역 없음** — 호재 | `rice_surplus` | supply | PM 가름 ⑥ 정정(PROD 확인): 태그하면 `supply.eventChance`·`eventMagnitude`가 Hard에서 호재 확률·크기까지 키운다 → 무태그, 크기는 PROD `supply.windfallSize` |
| **영역 없음** — 사람(v16 잠김) | `staff_poaching` · `salary_review` · `artisan_retire`(연쇄, chance 0) | people | `system:hr` 잠김 — 인건비 압력은 이벤트가 아니라 `finance.laborMul/wageDrift` 손잡이([결정 대기 94]) |
| **영역 없음** — 연쇄 | (`TRIGGERED_EVENTS` 나머지 — chance 0, 선행 사건·연구가 띄움) | — | 발생 확률이 없어 배수가 닿을 자리가 없다 |

- **집계(태그 40):** macro 12 · taste 7 · competition 1 · supply 9 · incidents 10 · finance 1 · 영역 없음 19(`EVENTS` 18 + 연쇄 `artisan_retire`) — 연쇄 나머지는 chance 0.
- **PM 가름(2026-11-14):** ① `korean_label_rule`·`blender_rush`·`jp_whisky_shortage` → macro ② `tax_audit` → finance ③ `shochu_boom` → taste ④ `tariff_retaliation` → supply ⑤ `spain_drought` → supply ⑥ `rice_surplus` → **영역 없음**(정정 2026-11-14 — PROD 확인: 태그하면 Hard가 호재를 키움), 크기는 PROD `supply.windfallSize`.

## 반론·리스크
- 지역 한정 사건(제주·간사이·대만)은 그 입지에서만 뜨므로 영역 배수가 입지별로 다르게 체감된다 — 의도(입지 별점은 창업 화면 몫, 난이도는 그 위에 곱함).
- 영역 없음이 18개라 "Hard는 행운도 적어야 한다"는 반론이 남는다(MKT 리스크 3). 품질 보상 보존을 우선한다 — 1.0에서 평판 사건의 **크기**(확률 아님)를 영역 손잡이로 둘지 재검.
- 표와 코드는 `eventDomains.test.ts`가 묶는다(태그 수 = 표의 수 · 영역 일치 · 영역 없음은 태그 없음 · 모든 이벤트가 표에 있음). 이벤트를 더하면 표·테스트·태그를 같은 PR에서.
