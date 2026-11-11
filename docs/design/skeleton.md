# 뼈대 설계 v0.1 — 시스템 지도 · 파트 경계 · 구조 결정 백로그

> 상위 문서: [PRD](../PRD.md) · [개발 공정](../PROCESS.md) §2 단계 S · 관련: [아키텍처](architecture.md)(코드 구조·Godot 이식 명세)
> 상태: **단계 S 완료(#153, 2026-11-06) — §4 필수 결정은 모두 번호를 받았고, §3 파트 경계가 확정됐다. 지금은 단계 P에서 §1~§3을 현재 상태로 갱신하며 쓴다.** (v0.1 초안은 공정관리 세션이 단계 S 시작용으로 작성)
> 이 문서가 답하는 것: 게임에 어떤 시스템이 있고(§2), 각각 어느 파트가 소유하며(§3), 뼈대를 완성하려면 무엇을 먼저 정해야 하는가(§4)

---

## 0. 뼈대 완성의 정의

단계 S가 끝났다는 것은 아래가 모두 참이라는 뜻이다 ([PROCESS.md](../PROCESS.md) §2):

1. §4의 **필수** 구조 결정이 모두 #번호를 받았다
2. PRD에 있는 모든 시스템(로드맵 Phase 2~5 포함)이 §2 지도에서 **자리**를 가진다 — 상태 슬라이스(필드), 틱 단계, 명령(Action) 타입, 콘텐츠 스키마, 테크 게이트 키. 내용이 비어 있어도(스텁) 된다
3. 세이브 마이그레이션 체인이 새 스키마까지 이어진다
4. §3 파트 경계와 코어 파일 목록이 확정되어, 파트 세션이 서로의 파일을 건드리지 않고 일할 수 있다

**스텁의 뜻:** 타입·슬라이스·명령·틱 단계가 존재하고, 테스트가 통과하고, 게임 동작은 바꾸지 않는다(기능 플래그 꺼짐·빈 목록·no-op). 예: 이미 있는 `isUnlocked` + `TECH_GATING = false`(#118)가 스텁의 모범이다(게이트는 단계 P에서 켰다 — #174).

---

## 1. 이미 확정된 뼈대 (v1.6, 바꾸지 않는다)

| 항목 | 내용 | 근거 |
|---|---|---|
| 플랫폼 | Godot 4 + C#, PC(Steam). TS는 설계 실험실·기준 구현 | #34·#35·#40·#122 |
| 상태 | 단일 `GameState` **v15** = 헤더(+ `scenario`, S-8) + 슬라이스(world·finance·hr·production·inventory·commerce·b2b·events·research·site·history·progress). v14 = 제품 피니싱 표기 `Product.finish?`(#158), v15 = 병입 때 통 구성 `Product.caskMix?`(#176). **다음 코어 PR이 스키마를 올리면 v16** | #118, [architecture.md §3](architecture.md) |
| 시간 | 1턴 = 1개월. 월 틱 0~9단계 파이프라인 + 틱 컨텍스트 | #1·#26, PRD §2.2 |
| 경계 | `GameEngine` 계약 (명령 → 스냅샷) | architecture.md §3.2 |
| 난수 | mulberry32, `rngFor(seed, month, stream)` 독립 스트림 | PRD §13.2 |
| 세이브 | JSON + 버전 + 마이그레이션 체인 (v5 → v6 → v7 → v8 → v9 → v10 → v11 → v12 → v13 → v14 → v15) | #118, S-8, S-10, S-9, S-2, S-6, S-11·S-12, #158, #176 |
| 스키마 버전을 올리는 때 `[결정 #187, 오너 승인 2026-11-08]` | **올린다** — 옛 세이브에 값을 채우거나 옮기거나 지워야 할 때(필수 필드 추가·이름·구조 변경·의미 변경). `migrate.ts` 다음 버전 + 픽스처 테스트(옛 세이브가 그대로 이어지고 진행 결과가 같다). **올리지 않는다** — **선택 필드(`?`)를 더하는데 읽는 쪽이 없을 때를 처리하고 옮길 값이 없을 때**(예: `BrandLine.marketingBudget?` #155, `MonthReport.netWorth?` #159, `SampleRecord.axes?` #183). 그때는 "없으면 어떻게 읽는지"를 필드 주석에 적고, 옛 세이브 픽스처로 테스트가 계속 통과하는지만 본다. 앞선 선택 필드 버전 올림(#158 `Product.finish?`·#176 `Product.caskMix?`)은 그대로 둔다(되돌리지 않는다) | 선례가 섞여 있었다 |
| 테크 게이트 | `isUnlocked(state, key)` 하나로 판정, 키 규칙 고정, **켜짐**(`TECH_GATING = true`, #174 — Phase 1은 꺼져 있었다) | #118, #174, tech-tree §7 |
| 설계 규모 | 30년(360턴) · 원액 든 캐스크 2,500개 | #119 |
| 화면 규칙 — 되돌릴 수 없는 행동 `[결정 #240]` | 통·원액·설비·직원·대출을 바꾸고 다음 진행 전에 되돌릴 길이 없는 행동은 코어 부품 `kit.tsx` `ConfirmButton`(또는 미리보기 상자를 따로 그리면 `useConfirm` 훅)으로: ① 두 번 눌러 확인 ② 첫 누름에 결과 미리보기(무엇이 얼마나 — 숫자) ③ 남는 자원 경고 — 특히 12년 플래그십 후보(`alerts.ts flagshipCandidates`·`flagshipImpact`, 식은 #238 `isFlagshipCandidate` 하나) ④ 조건(`armKey`: 대상·달·수량)이 바뀌면 처음부터 ⑤ 되돌리기 안내(`UNDO_HINT`). 병입처럼 자주 하는 일은 매번 묻지 않는다(#178 재고 12개월 초과 때만). 파트 버튼은 소유 파트가 같은 부품으로 바꾼다 | #240, mvp.md §7.16 |
| 기후 | 입지 평년값 + AR(1) 이상치, 이벤트는 입력(기온·습도) 충격 | #120 |

---

## 2. 시스템 지도

상태: ● 구현 · ◐ 일부 · ○ 설계만 · ✕ 설계도 없음

| 시스템 | PRD | 상태 슬라이스 | 틱 단계 | 코드 | 상태 | 파트 |
|---|---|---|---|---|---|---|
| 지역·입지·법규 | §3, §16.21 | 헤더(regionId·siteId), `site` | 0 | `content/regions.ts`, `sites.ts` | ● | 코어(데이터) |
| 원재료·레시피·발효·증류 | §4 | `production` | 2 | `production.ts`, `content/catalog.ts` | ● | PROD |
| 향미 모델 | §5.4, [flavor-model](flavor-model.md) | (원액·캐스크 안) | 2·3 | `flavor.ts`, `content/axes.ts`, `content/categories.ts` | ● | PROD |
| 숙성·캐스크·숙성고 공간·기후 | §5, §16.3 | `inventory` | 3 (`matureVessel` → 재질별) | `maturation.ts`(`matureCask`·`matureNonWood`), `warehouse.ts`, `casks.ts`, `weather.ts`, `tick.ts` | ● 나무 · ● 옹기(`onggi_jar`, 제거·반응·증발 ×0.5, `SpiritLot.restMonths` — 위스키 오크 개월에 안 들어감, #161) · 스테인리스 휴지는 새 용기 없이 탱크 보관(`restLot`)이 맡는다 | PROD |
| 피니싱 | §5.2 | `SpiritLot.caskHistory` (S-10) · `Product.finish?` (v14) | — | `maturation.ts`(`canFinishInto`·`historyAfterTransfer`·`finishLabel`), 행동 `transferCask` | ● (#158 — 빈 버번·셰리 시즈닝 캐스크로 옮기기·이력·피니시 라벨. 라벨의 판매 효과는 MKT 후속) | PROD |
| 정보 불확실성(샘플링) | §5.6 | `Cask.sampleLog` (샘플 순간의 읽기 기록, S-10) · `commerce.commissions`(블렌딩) | — | `blendTable.ts` (`recordSample`·`knownReads` — 자기 기록, 없으면 형제 통 기록) · 화면: 블렌딩 테이블(#157)·증류소 탭(#159)이 같은 아는 값 | ● (#157). **남은 화면 누수:** 블렌딩·병입 탭(PROD)·원액 B2B 탭(MKT)이 참값을 보인다 — 플레이테스트 전에 고친다(#159). 형제 통 오차는 STATUS 결정 대기 12 | PROD |
| 블렌딩·병입·블렌딩 테이블 | §6, [blending-minigame](blending-minigame.md) | `commerce.lines`·`commissions` | (행동) | `blending.ts`, `blendTable.ts`, `blendRadar.ts` | ◐ (화면·보상 연결 남음) | PROD |
| 수요·판매·주세·소매 역량 | §9, §16.4 | `commerce` | 5 | `market.ts`(같은 카테고리 수요 나눔 CES #154), `sales.ts`, `retail.ts`, 화면 `Sales`(`PriceDesk` — 증류소 탭에도 끼움) | ● | MKT |
| 브랜드·럭셔리·브랜드 라인 | §11, §11.2 | `commerce.brands[]`(v11, S-2) · `Product.brandId` · `BrandLine.marketingBudget?` | 5(유지비·마케팅비)·8 | `brands.ts`(접근자·개설·배정·폐지·비용), `market.ts`(브랜드별 인지도 성장), 행동 `openBrand`·`setProductBrand`·`closeBrand`·`setMarketing{brandId}` | ◐ (세컨드 브랜드 규칙 #155 구현, MVP에서는 잠김. 남은 것: B_brand(럭셔리) 계산, 브랜드 × 수출 시장 인지도) | MKT |
| 원액 B2B·브로커 | §8.3, §8.6 | `b2b` | 4·8 | `bulk.ts`, `broker.ts` | ● | MKT |
| 입지 대표 거래(유통 납품·OEM·면세) | §16.21 | `commerce.retail*`, `b2b.oem*`, `site` | 4·6 | `deals.ts`, `sites.ts`(일부) | ● | MKT |
| 수출·해외 명성 | §16.25, §16.27, §17 | `commerce.exports`·`exportOffers`·`exportEntered`·`acclaim` | 5·6·8 | `market.ts`, `exportDeals.ts`, `content/exports.ts` | ● (9개 시장·수입사 계약 #100~#109) | MKT |
| 재무(대출·급전·투자·캐스크 오너십·담보대출) | §8 | `finance` | 7 | `loans.ts`(재무 단계·월 고정비 예상), `cashflow.ts`, `investment.ts`, `actions.mgt.ts`, `content/finance.ts` | ● (고금리 급전 #160. 은행 심사는 재무 확장으로 — STATUS MGT ③) | MGT |
| 재무 확장(이사회·헷징·보험) | §8.2, §8.4 | `finance.hedges`·`insurance`·`board?` (v13) | 1(재해 보험금 `settleClaims`, #171) · **7**: 보험료(#171) → 대출 → 선도계약 차액 정산(`settleForwards`, #179) → 담보 추가 상환 → **이사회는 7단계 끝**(`runBoard`, #180) | `insurance.ts`·`forwards.ts`·`board.ts`, 행동 `signForward`·`buyInsurance`·`cancelInsurance`, 화면 `Finance`(+ `Board`), 해임 = `GameEnding 'dismissed'`(S-9) | ● 보험·선도계약·이사회(#171·#179·#180, MVP에서 잠김) · ○ PRD §8.4 고급 상품(선물환·금리 스왑·신용보험·팩토링) | MGT |
| HR(직군·에이징·하우스 스타일·마스터 블렌더) | §7, §16.6 | `hr` | 6·8 | `hr.ts`, `ops.ts`(일부) | ● | MGT |
| 이벤트·예보·보정치 | §10 | `events`, `world.modifiers` | 1 | `events.ts`, `content/events.ts`, `modifiers.ts` | ● | MGT |
| 연구·테크트리 | [tech-tree](tech-tree.md) | `research` | 8 (`runResearch`) | `research.ts`(게이트·시작 조건·진행), `content/tech.ts`(노드 스키마 + 4개), 행동 `startResearch`·`setResearch`·`cancelResearch` | ◐ (진행 규칙 구현 — 기간·연구비·담당자·일시정지·이탈. 노드 4개뿐, 게이트 꺼짐, 실적 보너스·본업 효율 −30%·실험실 슬롯·화면은 단계 P) | MGT |
| 관광·비지터 센터 | §16.8 | `commerce.localBuzz` | 6 | `ops.ts`(일부) | ● | MKT |
| 리포트·연 요약·데이터 수명 | §13 | `history` (월 보고서 `netWorth?`·연 요약 `netWorthEnd?`, #159) | 9 | `lifecycle.ts`, `step.ts` | ● | 코어 |
| MVP 단일 화면 (증류소 탭) | [mvp.md](mvp.md) §5.1 | (읽기만) | — | `ui/MvpHome.tsx` — 현금·순자산 곡선, 생산 지시(`Orders`), 판매(`PriceDesk`), 아는 값만 보이는 숙성고(나무·옹기), 숙성고 공간·통입·빈 통 구매 | ● (#159. 생산 지시(PROD `Orders`)·판매(MKT `PriceDesk`)는 펼쳐서, 크래프팅 레버·설비(PROD `RecipeEditor`·`Equipment`)는 접어서 끼운다) | 코어 |
| 시나리오 모드·초기화·기능 플래그·가상 이력 생성기 | §12.2 | 헤더 `scenario` (v8) | 1·8 (끈 시스템 건너뜀) | `content/scenarios.ts`, `scenario.ts`(잠금), `newScenario.ts`(사업 계획서 입구·미리보기), 화면 `ui/BusinessPlan.tsx` | ◐ (입구·플래그·MVP 시나리오 구현, 가상 이력 생성기·JSON 파일 형식은 자리만) | 코어 → META |
| 승패·업적·마일스톤·목표 판정 | §12.1, [mvp.md](mvp.md) §3 | 헤더 `status`(끝난 이유) + `progress` 슬라이스(v10) | 9 (`updateProgress`) | `progress.ts`, `content/milestones.ts`, 행동 `actions.meta.ts`, 화면 `ui/Verdict.tsx` | ◐ (마일스톤 9개·MVP 목표 판정·결과 화면 구현. 면허 취소·해임은 자리만, 여러 판에 걸친 업적은 단계 V) | META |
| 다지역 경영(해외 증류소 인수) | §3.4 | 지금은 증류소 1개. 슬라이스를 회사/증류소 단위로 분류해 둠(§4.10 ③) | — | 인수 시 시작 상태 = 시나리오 입구(`newScenarioGame`, S-8)와 같은 구조 | ○ (분류만, #128) | 코어 결정 → META |
| 경쟁 AI 증류소 | §9.4 | `world.rivals` (v13, 비어 있음) | 5(수요 공식 훅 `rivalShare`)·8(경쟁사 행동 — 규칙 생길 때) | `rivals.ts` | ○ (자리·훅만, 배경 공급이 대신함) | META |
| 추가 지역·주종(스코틀랜드 등) | §14 Phase 3 | (콘텐츠) | — | 지역 = `content/regions.ts`(+ `presets.ts`), 주종 = 공정 모델 코드 | ○ (지역 추가 = 데이터 — §4.8 체크리스트. 스코틀랜드 설계 v0.2 [scotland.md](scotland.md), ciosryu/distillery#9는 옛 구조라 이 체크리스트로 다시 한다) | 콘텐츠 |

---

## 3. 파트 경계 — **확정 (#153, 단계 P 시작 2026-11-06)**

### 3.1 코어 — 설계 세션 소유 (단계 P에서는 코어 PR로만 변경, PROCESS §7.3)

`src/sim/types.ts` · `step.ts`(단계 순서만) · `tick.ts` · `engine.ts` · **`actions.ts`(행동 입구)** · **`actionKit.ts`** · `migrate.ts` · `newGame.ts` · `scenario.ts` · `newScenario.ts` · **`sites.ts`(입지 데이터 접근)** · `rng.ts` · `util.ts` · `modifiers.ts` · `lifecycle.ts` · `index.ts` · `content/index.ts` · **`content/catalog.ts`(재수출·설비 조립)** · `content/regions.ts` · `content/scenarios.ts` · `schema.test.ts` · **`sites.test.ts`** · `scenario.test.ts` · `places.test.ts` · `src/fileNames.test.ts`(대소문자만 다른 파일 이름 금지, #113) · `content/korea.ts`(regions 호환 재수출) · `fixtures/` · `src/store/*`(+ 플레이 기록 `playlog.ts`) · `src/App.tsx` · `src/main.tsx` · `src/ui/BusinessPlan.tsx` · **`src/ui/MvpHome.tsx`(MVP 단일 화면)** · `src/ui/alerts.ts`(계산, 테스트 `alerts.test.ts`)·`AlertsView.tsx`(화면 — 대소문자만 다른 이름을 피해 #90의 `Alerts.tsx`에서 바꿈)(파산 카운트다운·이번 달 할 일·현금 흐름·대출 상환 예정) · `src/ui/kit.tsx`·`format.ts`·`charts.tsx` · **캐스크 태그(#249 ①·#260)** `src/sim/tags.ts`(태그 정의·플래그십 예비 통·`selectCasks`·`protectedCaskIds`·`planTag` — 순수 함수)·`actions.core.ts`(코어 행동 `tagCasks`·`defineTag`·`editTag`·`deleteTag`)·`tags.test.ts`·`src/ui/CaskTags.tsx`(태그 칩·필터·일괄 붙이기·태그 관리)

### 3.2 파트별 소유 파일

| 파트 | 범위 (단계 P에서 할 일 — 초안) | 소유 파일 | PRD 절 |
|---|---|---|---|
| **PROD** 생산·숙성·블렌딩 | 피니싱, 정보 불확실성(샘플링), 블렌딩 테이블 화면·보상 연결, 생산 테크 노드의 효과 데이터 | `production.ts`(+ 생산 단계 `runProduction`)·`maturation.ts`·**`warehouse.ts`**(+ 숙성 단계)·**`casks.ts`**·**`waterPermit.ts`**·`flavor.ts`·`blending.ts`·`blendTable.ts`·`blendRadar.ts`·`weather.ts`·**`actions.prod.ts`**, **`content/production.ts`**·`content/axes.ts`·`categories.ts`, **`economics.ts`**(병당 손익 #173)·**`prodTuning.ts`**(PROD 수치 손잡이 — 단계 T 측정 준비 T-0), 테스트 **`production.test.ts`**·`vessel.test.ts`·`blendTable.test.ts`, 실험 **`scripts/experiments/prodKnobs.ts`**, 화면 `Production`·`Warehouse`·`Bottling`·`BlendLab`·**`AutoSample`**(자동 샘플 설정 줄, #207 — 증류소 탭에 끼움) · **`Sales`(MKT 종료로 임시 소유, #173)** | §4~§6, flavor-model, blending-minigame |
| **MKT** 시장·판매·B2B·수출 — **재개(2026-11-08, 오너)**. 2026-11-07에 종료해 자리를 MGT에 넘겼다가 다시 열었다. `Sales` 화면은 여전히 PROD 임시 소유(#173) | 브랜드 라인(세컨드 브랜드 개설·배정·브랜드별 인지도 성장·B_brand), 수요 공식 정리(SKU √n) | `market.ts`·**`brands.ts`**·**`sales.ts`**(판매·주세 단계)·**`retail.ts`**·**`tourism.ts`**·**`dutyFree.ts`**·`bulk.ts`·`broker.ts`·`deals.ts`·`exportDeals.ts`·**`actions.mkt.ts`**, **`content/market.ts`**·`content/exports.ts`·`names.ts`, `data/market/`, 테스트 **`market.test.ts`**·`exports.test.ts`·**`brands.test.ts`**, 화면 ~~`Sales`~~(→ PROD 임시)·`B2B`·`Exports`·**`ExportShortfallNote.tsx`**(수출-국내 품절 표시, #257), 실험 **`scripts/experiments/mkt-*.ts`**·**`mktP8Hooks.ts`** | §8.3, §8.5~§8.6, §9, §11 |
| **MGT** 재무·HR·이벤트·연구 | 연구 노드 전체(공통 4계통 + 주종 브랜치)·효과·실적 보너스·연구 화면·게이트 켜기(`TECH_GATING`), 재무 확장(이사회·헷징·보험) | `cashflow.ts`·**`loans.ts`**(+ 재무 단계)·**`investment.ts`**·`hr.ts`(+ 생애주기·사무직)·`events.ts`·`research.ts`·**`insurance.ts`**(#171)·**`forwards.ts`**(#179)·**`board.ts`**(#180)·**`forecast.ts`**(ENG-3 가격 예측, #188)·**`earlyWarning.ts`**(매크로 조기 경보, #189)·**`actions.mgt.ts`**, **`content/finance.ts`**·`content/events.ts`·`tech.ts`, 테스트 **`finance.test.ts`**·`fixedcost.test.ts`·`board.test.ts`·`repay.test.ts`·`otherincome.test.ts`·`eventrisk.test.ts`·`events.test.ts`·`research.test.ts`·`forecast.test.ts`·`earlyWarning.test.ts`, 화면 `Finance`·`Staff`·`Events`·`Dashboard`·**`Board`**(#180)·**`FixedCost`**·**`staffImpact.ts`**(직원 탭 효과 숫자 계산, #251, 테스트 `staffImpact.test.ts`), 실험 **`scripts/experiments/mgtKnobs.ts`**·**`mgt-stage-t.ts`**·**`capitalCost.ts`**(자본비용, MGT-C)·**`metrics.ts`**(판정 지표 정본 측정, MGT-D)(증류소 탭에 끼움, #181)·`Research`·**`Forecast`**(#188) | §7, §8.1~§8.2, §8.4, §10, tech-tree |
| **META** 시나리오·진행·경쟁 | 가상 이력 생성기, 면허 취소 규칙, 마일스톤 추가·업적(단계 V), (후속) 경쟁 AI | `progress.ts`·`actions.meta.ts`·`content/milestones.ts`, 테스트 `progress.test.ts`, 화면 `Verdict` | §12, §9.4 |

### 3.3 여러 파트가 나눠 쓰던 파일 — **쪼갰다 (S-4, 결정 #144, 2026-11-06)**

> 굵게 = 쪼개기로 새로 생기거나 역할이 바뀐 파일(§3.1·§3.2). `ops.ts`·`sim.test.ts`는 없어졌다. 남은 것: `scripts/balance-sim.ts`(단계 T에서 BAL). 실행 기록은 [split-plan.md](split-plan.md) §7

> 쪼개기 전 상태 (기록용):

| 파일 | 섞여 있는 것 |
|---|---|
| `ops.ts` | 숙성고 공간·기후(PROD) · 소매 역량·재고 적체·관광(MKT) · 직원 생애주기·QC·사무직(MGT) · 캐스크 오너십(MGT) |
| `sites.ts` | 입지 비용·취수 허가(코어/PROD) · 면세 한정판(MKT) · 재고 담보대출(MGT) |
| `actions.ts` | 모든 플레이어 행동(460줄) — 파트마다 행동을 더하면 충돌 지점 |
| `content/catalog.ts` | 원재료·설비·캐스크(PROD) · 대출·투자 상품(MGT) · 패키징(MKT) |
| `scripts/balance-sim.ts` | 봇 정책(각 파트) · 판정(BAL) |
| `sim.test.ts` | 모든 시스템 테스트(850줄) |

### 3.4 실험 스크립트와 공동 편집 파일 (ARCH 정리, 2026-11-11)

실험 스크립트(`scripts/experiments/`)는 게임 규칙이 아니지만 단계 T 판정이 기대는 도구다. 파트 전용 스크립트는 §3.2에 적었다. 여러 파트가 함께 고치는 파일은 **구역 소유**로 둔다:

| 파일 | 구역 → 소유 | 규칙 |
|---|---|---|
| `scripts/experiments/mvp-human.ts` | 공통 틀(정책 타입·`bottle`·`bottleAs`·`fill`·`finance`·`play` 루프·표 출력) + P3~P7 묶음 → **ARCH** · **P8 묶음**(`P8_POLICIES`·`DV_POLICIES`·`AUTORESTOCK`·`METRICS`·`YEARLY`·`applyTierKnobs`·`mgtPolicy`, #265 판정용 봇) → **MGT** · 손 가격 정책(`price`·`markup`, MKT-B에서 옮김) → **MKT**(검토), 구현 위치는 공통 틀 | ① 자기 구역만 고친다 ② **공통 틀을 고치면 P8 출력이 바뀔 수 있다** — PR에 `P8=1 ONLY=X0 npx tsx scripts/experiments/mvp-human.ts 10 180` 전후 비교를 붙이고 MGT 검토를 받는다 ③ P8은 화면 모듈 `src/ui/alerts.ts`의 `cashAlert`를 읽는다(대출 정책 `cheap`·`banner`) — **`alerts.ts`의 런웨이·경보 식을 바꾸는 PR(코어 UI, ARCH)도 ②를 따른다** ④ 판정(#265·#277·#278)이 걸린 P8 기본값을 바꾸는 것은 MGT PR + PM 기록 |
| `scripts/balance-sim.ts` | 단계 P 동안 **ARCH**(코어 도구 — 샌드박스 120개월 실험, #277 ②) · MGT 연결 2줄(#270 손잡이) → **MGT** · 단계 T에서 BAL로 넘긴다(§3.3) | 봇 정책을 바꾸면 8입지 DIAG 출력이 바뀐다 — 모든 파트 PR의 출력 비교 기준이라 바꾸는 PR은 그 사실을 본문 첫 줄에 적는다 |
| `scripts/experiments/mvp-survival.ts` | **ARCH** | 순자산 정의를 게임과 맞추는 안 — 아래 §3.5 P-MGT-31 의견 |
| `scripts/experiments/info-leak.ts`·`perf-casks.ts`·`playlog-report.ts`·`playtest-years.ts` | **ARCH** | — |

### 3.5 코어 대행 사후 검토 기록 (ARCH)

| 대상 | 결과 | 기록 |
|---|---|---|
| PR #260(MKT) c1e8619 — `step.ts`(IB 입찰 메모)·`TurnBrief.tsx`·`alerts.ts`(IB 할 일 수위·순서·기한) | 문제 없음. 기한 문구는 오히려 옛 코드(`≤ 1` → "이번 달까지")를 바로잡았다 — 제안 다음 달 1, 그다음 달 0, 그 달 틱에서 사라진다 | ciosryu/distillery#290 본문·커밋 7745f01 |
| PR #260(MKT) 3b3dbf7 — `alerts.ts`(수출 품절 할 일·IB 해금 안내 3년↑ 통 수) | 문제 없음. 문구에 이후 결정 「수출 안 함」(#266) 추가 | 같은 곳 |
| PR #259(PROD) — `alerts.ts`(자동 납품 "후보 n통 보호 중") | 문제 없음 | 같은 곳 |
| 코어 선택 필드 `Product.noExport`(#266)·`Product.autoRestockMinMonths`(#267) | 문제 없음 — 재고 보충 합치기(`restockedProduct`)가 `...old`로 펼쳐 두 값이 유지된다. 없으면 지금 동작(수출함·표기 하한). 하한은 `autoRestockFloor`가 법정~표기로 묶는다 | 이 절 |
| `MonthReport.whiskySkipped`·`ProductionSlice.skipSojuMonth`(#268) | 문제 없음. `skipSojuMonth`는 지난 달 값이 남지만 `=== s.month` 비교라 무해 — 다음 소주 버튼 때 덮인다 | 이 절 |
| P8 판정용 봇(`mvp-human.ts` P8 — #265·#271·#276·#281·#289·#292) | 판정 논리는 맞다 — 3개월 파산을 스크립트가 세고 그 달 상태로 결과를 고정(`outcomeOf(s, false)`)하므로 게임 판정(`verdict`)이 파산 판에 붙는 문제는 지표에 새지 않는다. **짚을 것 셋:** ① P7 손잡이(`order`·`labelFrom`·`protect`)를 재사용 — 의미는 같다. 다만 `protect`는 봇의 **손 병입**만 막는 별도 집합이라, PROD가 #252 보호를 태그(#260)로 옮긴 뒤에는 봇도 게임의 `protectedCaskIds`를 읽게 바꾸는 것이 맞다(사람이 보는 예비 태그와 같은 규칙을 판정) `[제안 — MGT 구역]` ② `negativeCashMonths`를 1 이하로 덮어 쓰므로, 그 값을 읽는 게임 식(`cashAlert`의 남은 달)이 실제 판과 다르다 — 대출 정책 `cheap`은 경보 유무만 보므로 결과 영향은 없다 `[추론]` ③ 화면 모듈 `cashAlert` 의존 — 위 §3.4 규칙 ③ | 이 절 |

**의견 (PM 요청 2026-11-11):**
- **P-MGT-31 — `mvp-survival.ts` 순자산 정의를 게임과 맞춘다: ARCH 찬성.** 지금 그 스크립트는 원액을 `bulkValuePerLPA × 0.85`로 세고 국산 프리미엄 절반·신뢰도 보정·포화·운송비가 빠지며 고객 소유 통이 들어간다. 그런데 **같은 출력의 판정 집계**(`verdict`)는 게임의 `judgeGoal`(= `progress.netWorth`)을 쓴다 — 한 표 안에서 "목표 달성" 열과 판정이 다른 순자산을 쓴다. #277로 단계 T 판정에 이 스크립트가 들어가므로 **T 기준선 전에** `metrics.ts outcomeOf`(게임 `netWorth`)로 바꾸는 것이 맞다. 출력이 바뀌므로 오너 결정 대기 57 묶음에서 결정 → ARCH PR 하나(전후 표 첨부: 목표 달성 수·순자산 평균이 약 +11% 이동, 파산·1위 전략은 그대로일 것 `[추론]`)
- **NaN 세이브 복구 — 버전 마이그레이션은 필요 없고, 불러오기 때 "수리" 한 단계가 필요하다 `[제안 P-ARCH-45]`.** [사실] JSON은 NaN을 `null`로 저장하고, 다시 불러오면 `null`은 산술에서 0처럼 굴어(`null − 100 = −100`, `null < 0`은 false) **현금이 조용히 0원**이 된다 — 오류 없이 돈이 사라지거나 생긴다. 안: `migrateSave` 뒤에 버전과 무관한 `repairSave`(코어 `migrate.ts`) — ① 원액 양·도수가 유한하지 않거나 0 이하인 통은 비운다 ② 현금이 유한하지 않으면 마지막 유한한 결산의 월말 현금으로 되돌리고 ③ 고친 것을 한 줄 알림("세이브 복구 — 통 n개 비움, 현금을 m개월째 결산 값으로")으로 보인다. 함께 **"상태에 유한하지 않은 수가 없다"** 불변식 테스트(여러 판 × 180개월)를 건다 — 다음 NaN을 판 전에 잡는다. 구현은 PROD 수정이 머지된 뒤. 대안: 아무것도 안 함(현금 0으로 이어짐 — 오너 판이면 결과가 틀어진다). 확인 필요: NaN이 사람 판 세이브에 실제로 생겼는지(봇에서만이면 우선순위 낮음)

---

## 4. 구조 결정 백로그

필수 = 단계 S 완료 조건. 순서는 **다른 결정의 전제가 되는 것 → 상태 스키마를 바꾸는 것 → 규칙 구조** 순. 각 항목은 설계 세션이 근거·대안·리스크를 붙여 오너에게 제안한다.

| ID | 결정할 것 | 왜 지금 | 필수 | 관련 |
|---|---|---|---|---|
| **S-0** | **MVP 정의와 코어 루프** — MVP의 목적·범위(지역·입지·주종·기간), 플레이어가 매달·매년·한 판에서 하는 일과 목표, 한 판의 끝. 이것이 정해져야 아래 S-2~S-14 중 무엇이 MVP 필수인지 가를 수 있다 | 모든 구조 결정의 범위를 정한다. 지금까지 검증은 봇 전략뿐이고 사람의 플레이 경험은 정의된 적 없다 | **결정됨** — #129~#134, [mvp.md](mvp.md) v0.1 | PRD §1, §12.1 |
| ~~S-1~~ | ~~증류소 1개 전제를 유지할지~~ → **결정(#128, 2026-11-06):** 최종 목표는 해외 증류소를 인수해 **화면 전환으로 여러 증류소를 동시에 관리**하는 것. 지금은 **증류소 1개만** 먼저 돌린다. `[제안]` 나중 비용을 줄이는 최소 준비: 슬라이스를 회사 단위(재무·브랜드·연구·수출)와 증류소 단위(생산·재고·입지·직원)로 **문서에서 분류만** 해 두고 코드는 바꾸지 않는다 | — | 결정됨 | PRD §3.4, #11 |
| **S-2** | **브랜드 단위 상태** — 인지도·럭셔리를 브랜드 라인별로(#54) 둘 구조. `commerce.awareness` 하나 → `brands[]` | 수요 공식·수출·이벤트가 모두 인지도를 읽는다 | 필수 — **구현, `[결정 #148]`** (§4.6) | §11.2 ④, #51~#55 |
| **S-3** | **지역·주종 추가가 데이터만으로 되는가** — 스코틀랜드(ciosryu/distillery#9)가 지금 옛 구조(v5) 위에서 구현 중이다. "지역 추가 = 데이터 추가"(PRD §13.2) 원칙대로 코드 수정 없이 들어가는지, 지역별 특수 규칙(세제·숙성 규정·입지 대표 결정)을 담을 데이터 모양이 충분한지 정한다 | Phase 3 콘텐츠 확장과 열린 PR #9의 정리 방향이 걸려 있다 | 필수 — **구현, `[결정 #150]`** (§4.8) | §3, §13.2, [scotland.md](scotland.md) |
| **S-4** | **파트 경계대로 파일 쪼개기** — `ops.ts`·`sites.ts`·`actions.ts`(행동 처리기를 파트별 모듈로)·`catalog.ts`·`sim.test.ts` (§3.3) | 단계 P 병렬 개발의 충돌을 막는 전제 | 필수 — **완료** (결정 #144, [split-plan.md](split-plan.md) §7) | PROCESS §7.3 |
| **S-5** | **이벤트 난수를 이벤트별 스트림으로** — 지금은 매달 목록 전체를 섞어서 이벤트 하나만 더해도 모든 시드 결과가 바뀐다 | 밸런스가 한 번 바뀌므로 튜닝(T) 전에 해야 한다 | 필수 — **구현, `[결정 #147]`** (§4.5) | architecture §9.3 |
| **S-6** | **연구 시스템 뼈대** — 연구 진행 틱 단계, 담당자·기간·비용 흐름, 노드 데이터 스키마(4개 → 전체를 넣을 그릇) | Phase 2 핵심. 게이트만 있고 진행이 없다 | 필수 — **구현, `[결정 #149]`** (§4.7) | tech-tree §2·§7, #46 |
| **S-7** | **콘텐츠를 엔진 중립 데이터로** — 원재료·설비·캐스크·지역·이벤트·테크를 JSON 스키마로. 시점(지금 대 단계 G 직전) | 파트가 콘텐츠를 늘리기 전에 형식을 정하면 이식 비용이 준다 | 필수 (형식·시점만) — **구현, `[결정 #151]`** (§4.9) | §13.1 이식 계획 ②, #40 |
| **S-8** | **시나리오 초기화 경로** — JSON 시나리오 파일로 `GameState`를 만드는 입구 + 가상 이력 생성기의 자리 | §12.2가 "샌드박스 단계부터 지킬 아키텍처 요구사항"이라고 못 박았다 | 필수 (입구·스텁) — **구현, `[결정 #142]`** ([mvp.md §6.3](mvp.md)). 파일 형식(JSON)은 S-7과 함께 | §12.2 |
| **S-9** | **승패·진행 구조** — 파산 외 실패 조건(면허 취소·해임), 업적·마일스톤의 데이터 모양, 플레이어 목표 | 게임 루프의 끝이 정의돼 있지 않다 | 필수 (모양만) — **구현, `[결정 #145]`** (§4.4) | §12.1 |
| **S-10** | **숙성 용기 일반화 + 피니싱·정보 불확실성의 자리** — 지금 숙성 상태는 목재 캐스크 전제다. 크래프팅 자유 원칙(#134)에 따라 ① 비목재 용기(옹기·스테인리스 휴지 — 화이트 스피릿의 숙성 방식·기간) ② 피니싱(캐스크 이력의 단계) ③ 샘플링으로 얻은 "아는 값" 대 "참값"을 담을 상태 모양을 정한다 | 숙성·블렌딩·판매가 모두 읽는다. 옹기 숙성은 flavor-model §4.5 확장 필요(tech-tree §10 #7) | 필수 — **자리 구현, `[결정 #143]`** (§4.3) | §5.2, §5.6, #134 |
| S-11 | 재무 확장의 자리 — 이사회(지분·해임), 헷징 계약, 보험 | Phase 2 범위. 슬라이스 필드·명령 타입만 | 권장 — **구현, `[결정 #152]`** (§4.10) | §8.2, §8.4 |
| S-12 | 경쟁 AI의 자리 — 시장 점유를 나눌 "다른 공급자" 훅 | Phase 5지만 수요 공식에 들어갈 자리가 필요 | 권장 — **구현, `[결정 #152]`** (§4.10) | §9.4, #28 |
| S-13 | 웹 프로토타입 화면 범위 — Godot가 최종이므로 웹 UI를 어디까지 만들지 | 파트마다 화면 작업량이 달라진다 | 권장 | #122 |
| S-14 | 밸런스 판정 방법 고정 — 시드 수(40), 판정 지표, 난이도 목표(★)를 정량으로 | 단계 T의 완료 기준 | 권장 (T 전까지) | §16.27 노이즈 경고 |

### 4.1 규칙 단계(P)로 넘기는 것 — 구조가 아니라 규칙·공식

| 항목 | 파트 | 출처 |
|---|---|---|
| ~~SKU 수만큼 총수요가 늘어나는 수요 공식~~ → 같은 카테고리 수요 나눔 CES로 해결 (#154) | MKT | PRD §15.3 #12 |
| ~~병 가격의 숙성 반영 (PR #6)~~ → 단계 S에서 설계 세션이 구현 (MVP 필수 #133, #117) | ARCH | PRD §6.2.1 |
| 입소문 평균 품질의 기준 기간 | MKT | §15.3 #18 |
| 제주 면세점 두 종류(#87 지정면세점·#95 공항 면세점) 정리 | MKT | §16.25 |
| 수출 확장의 열린 문제(수출로 돈을 버는 전략은 스코틀랜드에서, #107) | MKT | §17.5 |
| 확장형 안전장치 (PR #5) | BAL (봇 정책) | — |
| 일본 봇이 수출을 안 하는 문제 | BAL | §16.27 |

### 4.2 튜닝 단계(T)로 넘기는 것

브랜드형·site 전략 지배(대만 진먼섬·제주·홋카이도), **통합 기준선 재측정**(해외 명성 #96·수출 확장 #100~#109·아키텍처 재편 #118~#126을 합친 뒤 아직 재지 않음), 제주 면세 한정판의 기회비용 제안(§16.28 `[제안]`), 결정 #77~#126의 `[튜닝]` 수치 전부.

---

### 4.3 S-10 구조 — `[결정 #143]` (2026-11-06, 오너 승인)

동작 불변(밸런스 골든 KR·JP·제주 바이트 동일)인 자리만 넣었다. 규칙·수치·콘텐츠는 단계 P(PROD).

| 항목 | 정한 모양 | 대안 (기각 이유) |
|---|---|---|
| ① 숙성 용기 일반화 | 캐스크 타입 하나로 묶는다 — `CaskDef.material`(없으면 나무, `wood`·`onggi`·`steel`). 틱 3단계 입구 `matureVessel`이 재질로 나눈다(나무 = 기존 `matureCask`, 그 밖 = `matureNonWood` 스텁: 추출 없음·재질별 증발·안정화). 나무가 아닌 용기의 기간은 `SpiritLot.restMonths`에 따로 센다 — 위스키 법정 숙성(나무통)에 안 들어간다 | 별도 `Vessel` 엔티티 — 숙성고 자리·보관비·샘플링·병입 경로를 모두 두 갈래로 만들어야 한다. 이점은 이름이 정확한 것뿐 |
| ② 피니싱 | 원액이 이력을 들고 다닌다 — `SpiritLot.caskHistory: { typeId, fromMonth, months }[]`. 행동 `transferCask`(옮기기)는 타입만 있고 지금은 항상 실패, MVP에서 잠금 | 캐스크에 "거쳐 간 원액" 기록 — 원액이 섞이고 나뉘면(블렌딩·여러 통에 나눠 통입) 추적이 끊긴다. 라벨("셰리 피니시")은 원액에서 읽는 게 맞다 |
| ③ 아는 값 대 참값 | 캐스크에 샘플 순간의 읽기를 **기록**한다 — `Cask.sampleLog: { month, hex, sigma, estQuality }[]` 최근 2개(변화 화살표용). `sampleCask`가 쓰고 화면은 `lastSample`만 읽는다 | 지금처럼 매번 계산 — `perceivedHex`는 고정 오차를 **지금의** 참 향미에 더하므로 샘플 뒤에도 추정치가 참값을 따라 움직인다(정보 누수). #136의 "샘플로만 안다"가 성립하지 않는다 |

- **발견 (단계 P PROD로 넘김, 오너 동의):** 블렌딩 테이블(`readCask`)은 아직 실시간 읽기라 위 누수가 있다. 기록(`sampleLog`)으로 옮길지는 블렌딩 미니게임 규칙과 함께 정한다
- 추정 품질 오차 = 읽기 오차 × 1(`QUALITY_SIGMA_PER_HEX`) `[튜닝]`. 옹기·스테인리스 수치(`NON_WOOD_VESSEL`)는 근거 없는 자리표시 `[확인 불가]`
- 스키마 v9 (모든 새 필드는 선택값) + v8 세이브 픽스처

### 4.4 S-9 구조 — `[결정 #145]` (2026-11-06, 오너 승인)

MVP 완료 기준 1(15년 목표 → 결과 화면 → 계속 운영)이 이 위에 서서, "모양"에 더해 MVP에 필요한 만큼은 동작하게 했다. 돈·재고는 바꾸지 않는다 — 시나리오 없는 게임은 밸런스 골든이 바이트 동일.

| 항목 | 정한 모양 | 대안 (기각 이유) |
|---|---|---|
| ① 끝나는 이유 | `status` = `'running' \| 'bankrupt' \| 'licenseRevoked' \| 'dismissed'` + `progress.ending { reason, month }`. 끝내기는 `endGame(s, 이유)` 하나. 면허 취소·해임은 **자리만**(발동 규칙 없음 — 해임은 이사회 S-11과, 면허 취소는 단계 P META) | `status: 'running' \| 'over'` + 사유 따로 — 옛 세이브의 `'bankrupt'`를 바꾸는 마이그레이션과 코드 수정이 는다 |
| ② 진행 슬라이스 | `progress { milestones[], verdict?, ending? }` (스키마 v10). 마일스톤 9개(첫 증류·첫 통입·첫 대출·첫 소주 판매·첫 위스키 병입·첫 위스키 판매·첫 현금 위기·플래그십 병입·플래그십 판매)를 틱 9단계에서 처음 일어난 달에 한 번 기록 + 월 리포트 메모. 정의(이름·연표 표시)는 `content/milestones.ts` | 리포트에서 매번 다시 찾기 — 리포트는 최근 120개월만 상세라 15년 연표를 못 만든다 |
| ③ 목표 판정 | 시나리오가 있을 때만, 목표 기간(180개월)이 끝나거나 게임이 끝나면 **한 번**: 확인 3개(파산 안 함·12년 이상 위스키 판매·순자산 ≥ 자기자본 × 3) → `heritage`·`achieved`(#263 등급제 — 순자산은 채웠지만 플래그십 없음, B)·`missed`·`failed` + 등급 S·A·B·C. 자동 진행은 판정에서 멈춘다(`verdict` 멈춤 사유). 기준은 `GRADE` `[튜닝]` | 매달 판정 — 15년 목표의 "한 판의 끝"이 흐려진다 |
| ④ 순자산 정의 | **지금 정리하면 받는 돈:** 현금 − 대출 + 매출채권 + 몰트·그레인 원액 현물 매각가 + 제품 재고 × 원가 (소주 원액은 현물 시장이 없어 0) | 병 가격 평가 — 수요 상한 때문에 실현할 수 없다. **`[결정 #146]` (오너 승인): 재고 평가액 곡선(#138)도 같은 정의(`netWorth`)를 쓴다** |
| ⑤ 계속 운영 | 결과 화면에서 확인(`acknowledgeVerdict`, META 행동) → 판정은 남고 목표 없이 계속. 파산이면 새 게임만 | 화면 상태로만 — 새로고침하면 결과 화면이 다시 뜬다 |
| ⑥ 업적 | 게임 상태에 두지 않는다. 마일스톤 id를 조건으로 단계 V(Steam)에서 붙인다 | 지금 업적 목록 — 플랫폼 연동 전에는 쓸 곳이 없다 |

### 4.5 S-5 이벤트 난수 — `[결정 #147]` (2026-11-06, 오너 승인)

| 항목 | 정한 모양 | 대안 (기각 이유) |
|---|---|---|
| 발생 판정 | 이벤트마다 독립 스트림 `rngFor(seed, month, 'event-roll:<id>')`. **모든 이벤트가 매달 한 번 굴린다**(조건이 안 맞아도) — 조건 확인 여부가 다른 이벤트의 난수를 밀지 않는다 | 조건이 맞는 것만 굴리기 — 어떤 이벤트의 조건이 바뀌면 그 이벤트만 영향받아 이것도 안전하지만, "굴린 뒤 조건 확인"이 옛 의미(발생시키는 순간 조건 확인)를 그대로 지킨다 |
| 월 상한(2개) | 성공한 이벤트를 이벤트별 순위 키 `'event-rank:<id>'` 순으로 보며, **그 순간** 조건을 확인하고 상한까지 발생 — 같은 달 먼저 일어난 이벤트가 상태를 바꾸는 효과도 옛 방식과 같다 | 목록 순서대로 — 앞에 있는 이벤트가 늘 유리하다 |
| 예보 확정 | 예보마다 `'forecast:<이벤트 id>:<확정 달>'` — 엔티티 번호(다른 행동에 따라 달라진다)를 키로 쓰지 않는다 | 예보 id 키 — 캐스크를 하나 더 사도 예보 결과가 바뀐다 |
| 효과 난수 | 그대로 `'event:<id>'` | — |

- **보장 (테스트):** 발생하지 않는 이벤트나 조건이 안 맞는 이벤트를 목록 **어디에** 더해도 다른 이벤트의 결과·현금이 그대로다. 옛 코드에서는 이 테스트가 실패한다(확인함)
- **분포:** 90판(한국·일본·대만 × 30시드 × 120개월) 이벤트 발생 월 0.487회 → 0.476회(−2.2%, 표본 오차 1σ 약 ±1.4% — 1.6σ, 노이즈로 본다 `[추정]`). 옛 섞기(`sort(() => rng − 0.5)`)는 균등하지 않았다
- **밸런스가 한 번 바뀐다:** 이벤트가 켜진 판(샌드박스·기존 봇)의 시드별 결과가 달라진다. 8입지 × 5시드 스모크: 파산 합계 15 → 15, 붕괴 없음. MVP는 이벤트가 꺼져 있어 결과가 바이트 동일. 기준선 재측정은 단계 T
- 테스트 3개의 시드를 "첫 달에 생산을 멈추는 이벤트가 없는 시드"로 옮기고(21→23, 41→43, 2→4), v7 세이브 픽스처의 기대값을 새 규칙으로 다시 쟀다

### 4.6 S-2 브랜드 단위 상태 — `[결정 #148]` (2026-11-06, 오너 승인)

동작 불변(밸런스 골든 5입지·MVP 실험 바이트 동일) — 하우스 브랜드 하나뿐이면 옛 회사 인지도와 같다.

| 항목 | 정한 모양 | 대안 (기각 이유) |
|---|---|---|
| ① 자리 | `commerce.brands: BrandLine[]` — 하우스(회사명, id `'house'` 고정, 맨 앞) + 세컨드. `BrandLine { id, name, isHouse, openedMonth, awareness, luxury }` | 별도 `brands` 슬라이스 — 판매·수요와 같은 시장 도메인이라 나눌 이유가 없다 |
| ② 인지도의 정본 | **브랜드에만 있다.** `commerce.awareness`는 없앴다(마이그레이션이 하우스 인지도로 옮김) | `commerce.awareness`를 하우스 값으로 남기고 세컨드만 `brands[]` — 하우스 값이 두 곳에 생긴다 |
| ③ 읽고 쓰기 | 모든 곳이 `brands.ts` 접근자를 거친다. **제품 맥락**(국내 수요·면세 수요·평론가 의뢰 보상·면세 완판 보상)은 `brandOf(s, 제품)`, **회사 맥락**(관광·이벤트·캐스크 오너십 단가·수출 국내 후광·목표 판정·화면)은 하우스 | 직접 필드 접근 — 브랜드별 규칙을 넣을 때 13곳을 다시 찾아야 한다 |
| ④ 제품 배정 | `Product.brandId?` — 없으면 하우스. 옛 제품·세이브는 그대로 하우스 | 필수 필드 — 옛 세이브의 제품을 모두 고쳐야 한다 |
| ⑤ 아직 회사 단위인 것 | 마케팅 예산(`commerce.marketingBudget`), 수출 시장 인지도(`exports[].awareness`), 인지도 성장식(하우스에 적용). PRD §11.2 ④의 브랜드별 마케팅·브랜드 × 시장 인지도·50% 연계(#52·#53)는 규칙이라 단계 P(MKT) | 지금 다 나누기 — 규칙(성장 연계·개설 비용)이 정해지지 않아 빈 필드만 는다 |
| ⑥ 행동 | `openBrand`·`setProductBrand` — 타입만, 지금은 항상 실패, MVP 잠금 | — |
| ⑦ 럭셔리 | `BrandLine.luxury`(B_brand, 0~100) 자리만 — 계산(PRD §11.2 ③)은 단계 P | — |

### 4.7 S-6 연구 시스템 뼈대 — `[결정 #149]` (2026-11-06, 오너 승인)

규칙 자체는 tech-tree §2.1(결정 #46·#56)을 그대로 구현했다. 이 결정은 **틀**이다 — 어디에 무엇을 두는가. 아무도 연구를 시작하지 않으면 아무 일도 없어 동작 불변(밸런스 골든 5입지·MVP 실험 바이트 동일).

| 항목 | 정한 모양 | 대안 (기각 이유) |
|---|---|---|
| ① 노드 스키마 (그릇) | `TechNodeDef` = tech-tree §7 `TechNode`에서 **게이트는 `unlockKeys`(isUnlocked 키, #118 키 규칙)**, 게이트가 아닌 효과(손실 감소·리스크 배수·정보 정밀도)는 `effects`(타입만, 아직 적용 안 함)로 나눈다. `research.leadStat`(담당 직군 스탯 칸), `milestone`(실적 보너스 기준), `requires`(설비·가동 개월) | §7의 `unlocks: TechUnlock[]` 하나로 — 게이트 판정이 효과 종류마다 갈라진다. 키 문자열이면 `isUnlocked` 하나로 끝난다 |
| ② 틱 | 8단계(성장)에서 `runResearch`: 담당자 확인(떠났으면 −25%) → 월 연구비(현금, 리포트 `expenses.research`) → 진행 → 완료 시 `research.unlocked`. 시나리오 시스템 `research` | 7단계(재무)에서 연구비 — 진행과 비용이 다른 단계로 갈라진다 |
| ③ 행동 (MGT) | `startResearch`(노드·담당자) · `setResearch`(일시정지·재개·담당자 교체) · `cancelResearch`(포기 — 진행도 사라짐). 연구비는 행동이 아니라 틱에서 | 일시정지·교체를 따로 — 행동만 는다 |
| ④ 담당자 | 한 사람은 연구 하나만. 담당자가 없으면 진행·비용 정지 | 담당자 없이 느리게 — tech-tree §2.2가 "담당자 불필요"를 컨설턴트(외부 획득)의 대가로 둔다 |
| ⑤ 게이트 | `TECH_GATING`은 **그대로 꺼 둔다** — 해금해도 아직 잠긴 기능이 없다. 노드가 채워지는 단계 P(MGT)에서 켠다 | 지금 켜기 — 오너십·로테이션이 연구 전까지 잠겨 기존 봇·밸런스가 바뀐다 |
| ⑥ 단계 P로 넘김 | 노드 38개 추가·효과 적용·실적 보너스 지표·연구 중 본업 효율 −30%·실험실 슬롯 +1·외부 획득(컨설턴트·경력직)·연구 화면 | — |

- MVP는 연구 OUT(#130) — 행동 3개와 틱 시스템을 잠갔다
- 스키마 v12: 진행 중 연구에 `startedMonth`·`spent`(선택값). 옛 세이브는 버전만 올린다 + v11 픽스처

### 4.8 S-3 지역·주종 추가 — `[결정 #150]` (2026-11-06, 오너 승인)

**조사:** 코드가 지역 id로 분기하던 곳은 4곳뿐이었다 — 새 게임의 지역·입지별 프리셋 레시피 분기(`if region === 'JP'`, `if site === 'jeju'`), 지역별 창업 정보 표(`STARTER`), 직원 이름 풀(`NAME_POOLS`, 경영 콘텐츠에 따로), 화면의 "일본이면 고구마 소주" 기본값. 세제·숙성 규정·시장·특산물·전통주 경감·라벨 프리미엄·이벤트 가중·대출 지역 한정은 이미 데이터였다. → 4곳을 모두 지역 정의로 옮겼다(동작 불변 — 골든 5입지·MVP 바이트 동일).

| 항목 | 정한 것 | 대안 (기각 이유) |
|---|---|---|
| ① 지역·입지 | **데이터만.** 지역에 묶인 값은 모두 `RegionDef`·`SiteDef` 한 곳 — `presets`(새 게임 레시피, `content/presets.ts`)·`starter`(창업자·증류소·시작 캐스크)·`namePool`. 코드는 지역 id로 분기하지 않는다 | 지역별 값을 시스템 파일마다 `Record<RegionId, …>`로 — 지역을 더할 때 찾을 곳이 흩어진다 |
| ② 주종 | **코드 + 데이터.** 새 주종(브랜디·럼·테킬라)은 공정 모델(발효·증류·숙성 규칙)이 다르다 → `SpiritKind`·`ProductCategory`·생산 코드를 고치는 파트 작업(PROD). 지역은 `allowedKinds`로 고를 뿐 | 주종도 데이터로 — 공정 차이를 데이터로 표현하려면 결국 스크립트 언어를 만든다 |
| ③ 입지 대표 결정 | **규칙 모듈(코드).** 대형 유통 납품·위탁생산·면세처럼 입지 고유 메커니즘은 파트 파일의 모듈이고, 입지 데이터(`deals: ['retail']` 등)가 어느 모듈을 켤지 고른다. 스코틀랜드 필링 계약도 MKT 모듈 하나 | 메커니즘을 데이터로 — ②와 같은 이유 |
| ④ `RegionId` | 문자열 유니언 그대로 — 지역을 더하면 이 한 줄과, 타입이 강제하는 수출 표(관세·운임)를 채운다. 콘텐츠 JSON화(S-7) 때 "문자열 + 로드 검증"으로 바꿀지 다시 본다 | 지금 `string` — 수출 표에서 빠진 지역을 컴파일러가 못 잡는다 |
| ⑤ 내수 시장 | 관례: **지역 id = 같은 id의 수출 시장이면 그것이 내수**(`exportMarketsFor`가 뺀다). 영국 `UK`도 맞는다 | 지역 정의에 `homeMarket` 필드 — 지금 관례로 충분하다 |
| ⑥ 자리 | `RegionDef.whiskyOrigin`(주요/신흥 산지 — 수상 이벤트 해외 인지도 보너스용, scotland.md §6.3. 규칙은 단계 P) | — |

**지역 추가 체크리스트** (스코틀랜드가 첫 사용처):
1. `types.ts` `RegionId`에 한 줄
2. `content/regions.ts` `REGIONS`에 항목 — 기후·세제·시장·숙성 규정·`allowedKinds`·`presets`·`starter`·`namePool`·이벤트 가중·입지(`sites`)·`DISTANCE`(원료 물류)
3. `content/exports.ts` 모든 시장의 `tariff`·`freightPerBottle`에 이 지역(타입이 빠진 곳을 잡는다)
4. `data/market/base-demand.json`에 시장 규모 근거
5. 입지 대표 결정이 새 메커니즘이면 → 파트(MKT 등) 규칙 모듈
6. `regions.test.ts` 일관성 테스트가 2·3을 자동으로 검사한다. 가짜 지역을 데이터만으로 넣어 1년을 돌리는 테스트가 "코드 분기 없음"을 지킨다

**발견:** 위스키 병입 최소 도수 40%(`MIN_BOTTLING_ABV`)가 **이미 전 지역 공통**이다. scotland.md §3.1의 "병입 도수 40% 이상(새 제약, 영국 입지에만)"은 새 필드가 필요 없다. 반대로 한국·일본·대만에도 40%가 걸려 있는데, 각국 법규와 맞는지는 확인하지 못했다 `[확인 필요]`

### 4.9 S-7 콘텐츠를 엔진 중립 데이터로 — `[결정 #151]` (2026-11-06, 오너 승인)

**측정:** 콘텐츠 표 44개 중 42개는 이미 JSON으로 왕복해도 값이 그대로였다. 막힌 것은 한국·일본 그레인 현물 시장 깊이 `Infinity`("포화 없음") 하나 — JSON에 `Infinity`가 없다. 콘텐츠 파일에는 규칙 함수 13개(지역 조회·주세 계산·포장비 등)가 섞여 있다. 시장 규모는 이미 JSON(`data/market/base-demand.json`).

| 항목 | 정한 것 | 대안 (기각 이유) |
|---|---|---|
| ① 형식 | **JSON** — Godot C#(`System.Text.Json`)이 기본으로 읽고, 시장 데이터가 이미 JSON이다 | YAML·CSV — 파서가 하나 더 필요하고 중첩 구조(이벤트 효과·지역 시장)를 CSV로 못 담는다 |
| ② 원본 | **TypeScript 콘텐츠가 원본, JSON은 생성물.** `npm run content:export`가 표 하나 = 파일 하나(`data/content/<이름>.json`) + `manifest.json`을 쓴다. 생성물이라 저장소에 넣지 않는다 | 지금 JSON을 원본으로 옮기기 — 타입 검사(`Record<CaskTypeId, …>`, 빠진 지역 표 잡기)를 잃고 로드 검증 라이브러리가 필요하다. 파트가 콘텐츠를 늘리는 단계 P 내내 그 비용을 낸다 |
| ③ 규칙 | **콘텐츠 표에는 JSON으로 그대로 오가는 값만** — 함수·`Infinity`·`NaN`·`undefined`·클래스 금지. `content.test.ts`가 표마다 검사한다(표를 더하면 자동으로 검사 대상). `Infinity`는 `null` = "포화 없음"으로 바꿨다(동작 불변) | 규칙 없이 단계 G 직전에 한꺼번에 — 그동안 섞여 들어간 것을 이식 직전에 정리해야 한다 |
| ④ 규칙 함수 | 콘텐츠 파일에 있어도 되지만 **내보내기에서 빠진다** — C#에서는 규칙 코드로 다시 짠다(이식 명세의 일부). 지금 옮기지 않는다 | 함수를 규칙 모듈로 옮기기 — 가져오기 40여 곳이 바뀌는데 얻는 것은 파일 분류뿐 |
| ⑤ 시점 | 형식·규칙은 **지금** 고정, JSON을 실제로 읽는 쪽(C# 로더·골든 테스트)은 **단계 G** | 지금 C# 로더까지 — 엔진이 아직 없다 |

- 계산으로 만든 값(`casesOf(...)`, `Array(10).fill(...)`)은 내보낼 때 평가된 결과가 들어간다 — 문제없다
- `RegionId` 같은 유니언 타입은 단계 G에서 "문자열 + 로드 때 검증"이 된다(§4.8 ④)

### 4.10 남은 자리 — 재무 확장·경쟁 AI·다지역 분류 — `[결정 #152]` (2026-11-06, 오너 승인)

단계 S 완료 기준 ②("모든 시스템이 지도에 자리를 가진다")의 마지막 빈칸 3개. 동작 불변(밸런스 골든 5입지·MVP 바이트 동일).

| 시스템 | 자리 | 대안 (기각 이유) |
|---|---|---|
| ① 재무 확장 (S-11, MGT) | `finance.hedges: ForwardContract[]`(원재료 선도계약 — 품목·월 kg·고정 가격 지수·기간) · `finance.insurance: InsurancePolicy[]`(재산·재고·영업중단·제조물·신용 — 월 보험료·보상 한도) · `finance.board?`(외부 지분 25%↑일 때 생김 — 신뢰·분기 목표). 행동 `signForward`·`buyInsurance`·`cancelInsurance`(항상 실패, MVP 잠금). 틱: 선도계약은 2단계 원가, 보험료·이사회는 7단계(재무) — (→ #179에서 선도계약은 7단계 **차액 정산**으로 정해졌다. 지금 틱 위치는 §2 표). 해임은 S-9의 `GameEnding 'dismissed'` | 이사회를 항상 두기 — 외부 지분이 없으면 의미가 없다. PRD §8.4의 고급 상품(선물환·금리 스왑·신용보험·팩토링)은 테크 BIZ-2b 해금(#49) — 같은 `insurance`·`hedges` 모양에 종류만 더한다 |
| ② 경쟁 AI (S-12, META) | `world.rivals: RivalDistillery[]`(비어 있음 — 지역·카테고리·인지도·품질) + 국내 수요 공식에 **`× (1 − rivalShare)`** 훅. 경쟁사가 없으면 0이라 값이 정확히 같다. 지금은 PRD §9.4대로 배경 공급(시세 랜덤 워크·공급 과잉 이벤트)이 시장을 대신한다 | 수요 공식의 `shareCap`(점유 상한)을 경쟁사 몫으로 보기 — 상한은 조사로 맞춘 "신생 브랜드가 닿을 수 있는 몫"이라(#85) 뜻이 다르다 |
| ③ 다지역 경영 (S-1, #128) | **문서에서 분류만** (#128의 준비안) — 아래 표. 증류소를 여럿 둘 때 증류소 단위 슬라이스를 `distilleries[]`로 옮기고 회사 단위는 그대로 둔다. 인수한 증류소의 시작 상태는 시나리오 입구(S-8)와 같은 구조로 만든다(PRD §3.4) | 지금 `distilleries[]`로 — 증류소 1개인 동안 모든 접근이 한 단계 깊어지고 얻는 것이 없다 |

**슬라이스 분류 (다지역 경영 대비, v13 기준)**

| 단위 | 슬라이스·필드 |
|---|---|
| **회사** (하나) | `finance` 전부(연결 재무 — 사이트별 손익은 리포트 태그로) · `commerce.brands`·`products`·`productArchive`·`exports`·`commissions`·`lines` · `b2b.trust` · `research`(회사 단위 지식, tech-tree §2.3) · `progress` · `scenario` · 헤더 `seed`·`month`·`startYear`·`status` |
| **증류소** (사이트마다) | 헤더 `regionId`·`siteId`·`distilleryName` · `production` · `inventory` · `site` · `hr`(직원은 사이트 소속, 하우스 스타일 포함) · `commerce.localBuzz`(비지터 센터)·`traditionalReleasedL`·`retailOffers/Contracts`(입지 대표 거래) · `b2b.contracts`(납품 사이트가 필요) · `world.weather`(입지 기후) |
| **세계** (공유) | `world.priceIndex`·`trend`·`flavorTrend`·`modifiers`(지역 한정 이벤트는 보정치에 지역 태그) · `world.rivals` · `events`(재해는 사이트 태그) · `history`(연결 + 사이트 태그) |

## 5. 다음 행동 (설계 세션) — **완료 (단계 S 시작 때의 계획, 기록용)**

아래 1~3은 모두 끝났다 — 필수 결정 #127~#152, 단계 P 전환 #153(2026-11-06).

1. S-0(MVP·코어 루프)은 결정됐다(#129~#134). **MVP에 필요한 것부터** S-2 이후를 제안한다 — MVP 모드 설정(S-8 시나리오 초기화), 숙성 용기 일반화(S-10), 파일 쪼개기(S-4) 순을 권장 — 근거·대안(최소 2개)·리스크·스키마 영향·마이그레이션 비용
2. 결정되면 코어에 스텁으로 넣고(동작 불변), 마이그레이션 버전을 올리고, 이 문서 §2·§3을 갱신한다
3. 필수 항목이 모두 끝나면 PM에게 단계 P 전환을 요청한다
