# 파일 쪼개기 계획 v0.1 — 파트 경계대로 (skeleton S-4)

> 상위 문서: [뼈대 설계](skeleton.md) §3.3·§4 S-4 · [개발 공정](../PROCESS.md) §7.3
> 상태: **실행 완료 (2026-11-06)** — `[결정 #144]` 오너 승인, §6 권장안 4개 채택. 실행 기록은 §7
> 기준 코드: `main` + #14(시나리오, v8) + #15(병 숙성 프리미엄) + #16(숙성 용기, v9)을 합친 트리. 줄 수는 그 트리에서 셌고, 새 파일 줄 수는 추정이다

---

## 0. 요약

1. **목적:** 단계 P에서 파트 세션 3개가 서로의 파일을 건드리지 않고 일하게 한다. 지금은 6개 파일이 여러 파트의 코드를 섞어 들고 있어 행동 하나, 콘텐츠 한 줄을 더할 때마다 같은 파일에서 충돌한다
2. **방법:** **옮기기만 한다.** 로직·이름·수치는 바꾸지 않는다. 매 단계 끝에서 밸런스 골든(DIAG 월간 현금 흐름)이 **바이트 단위로 같아야** 다음 단계로 간다 — #118 슬라이스 재편 때와 같은 기준
3. **결과:** 섞인 파일 6개 → 파트별 파일 약 14개 + 코어 파일 4개. `ops.ts`는 없어지고, `actions.ts`·`content/catalog.ts`는 코어 껍데기(입구·재수출)만 남는다
4. **바깥에서 보이는 변화 없음:** `src/sim/index.ts`가 모든 기호를 계속 재수출한다 → 화면·스크립트의 `from '../../sim'` 가져오기는 그대로. 파일 경로로 직접 가져오는 곳만 바뀐다 — 화면 10개 파일(`ops` 4·`catalog` 6)과 스크립트 2개(`balance-sim.ts`·`bench-tick.ts`)
5. **결정할 것 4가지 (§6):** 평면 대 파트 폴더, PR 한 개 대 여러 개, 밸런스 스크립트를 지금 쪼갤지, `catalog.ts` 재수출을 남길지

---

## 1. 원칙

| # | 원칙 | 이유 |
|---|---|---|
| 1 | 이동과 동작 변경을 한 커밋에 섞지 않는다 | 골든이 바뀌면 원인이 이동인지 변경인지 가를 수 없다 |
| 2 | 단계마다 검사: `typecheck` · `test` · `build` · `DIAG=1 npm run balance -- 2 120 all <KR·JP·KR jeju·JP hokkaido·TW kinmen>` 출력이 이전과 **바이트 동일** · MVP 생존 실험(`MVP=micro`, 4시드) 출력 동일 · 세이브 픽스처 테스트(v5·v7·v8) 통과 | 동작 불변을 사람 눈이 아니라 기계로 확인한다 |
| 3 | 파일 하나 = 파트 하나. 파트가 둘 이상 쓰는 공용 함수는 코어(`util.ts`) 또는 그 함수를 "만드는" 파트로 간다 | 소유가 애매한 파일이 다시 생기지 않게 |
| 4 | 새 가져오기 순환을 만들지 않는다. 지금 순환 1개(`sites → bulk → blending → sites`)는 이번에 끊는다 | 순환은 모듈 초기화 순서 버그의 원인이고, C# 이식(Phase G)에서 프로젝트 분리를 막는다 |
| 5 | 공개 API는 `index.ts` 하나 | 화면·스크립트·Godot 이식 명세가 내부 파일 구조에 묶이지 않게 |

---

## 2. 파일별 계획

### 2.1 `ops.ts` (308줄) → 없앤다

| 지금 있는 것 | 옮길 곳 | 파트 |
|---|---|---|
| 숙성고 공간·기후: `WarehouseView`·`warehousesOf`·`slotOccupancy`·`SlotIndex`·`assignSlot`·`slotClimate`·`climateTable`·`rotationCapacity`·`ROTATION_COST_PER_CASK`·`rotateWarehouse` | **`warehouse.ts`** (새, 약 120줄) | PROD |
| 숙성고 QC 오염: `runContamination` | `warehouse.ts` | PROD |
| 캐스크 시장: `usedCaskPrice` | **`casks.ts`** (새, 약 40줄 — 아래 `caskStorageCost`와 함께) | PROD |
| 소매 처리 역량·재고 적체: `RETAIL`·`hasPremiumChannel`·`retailCapacityCases`·`overhangFactor` | **`retail.ts`** (새, 약 35줄) | MKT |
| 비지터 센터·관광: `TOUR_SEASON`·`NEW_MAKE_BOTTLE`·`visitorTiers`·`tourismFactor`·`runTourism` | **`tourism.ts`** (새, 약 45줄) | MKT |
| 직원 생애주기: `RETIRE_AGE`·`ageOf`·`AGING_*`·`tenureOf`·`masterDistiller`·`APPRENTICE_MONTHS`·`handleDeparture`·`runStaffLifecycle` | **`hr.ts`**에 합친다 (53 → 약 125줄) | MGT |
| 사무직: `runOffice`·`taxAuditDefense` | `hr.ts` | MGT |
| 투자·캐스크 오너십: `OWNERSHIP`·`ownershipOversold`·`deliverOwnedCasks` | **`investment.ts`** (새, 약 30줄) | MGT |
| 투자 상품 데이터: `InvestmentOffer`·`INVESTMENT_OFFERS` | `content/finance.ts` (§2.4) | MGT |
| `ownsFacility` (설비 보유 조회 — 생산·이벤트·블렌딩이 다 쓴다) | **`util.ts`** | 코어 |

### 2.2 `sites.ts` (238줄) → 입지 데이터 접근만 남긴다

| 지금 있는 것 | 옮길 곳 | 파트 |
|---|---|---|
| 고정비·건설비·물류·난방: `siteOverhead`·`equipmentCost`·`siteFreight`·`outboundLogistics`·`bulkFreight`·`heatingCost`·`seasonalEnergyFactor`·`equipmentAvailable`, 입지 원료 `hasLocalIngredient` | **`sites.ts`에 남는다** (약 55줄) | 코어 (입지 데이터) |
| 취수 허가(제주): `waterPermitCap`·`applyWaterPermit`·`resolveWaterPermit` | **`waterPermit.ts`** (새, 약 35줄) — 생산 투입 상한이다 | PROD |
| 면세 채널·한정판(제주): `DUTY_FREE`·`hasDutyFree`·`dutyFreeConsumerPrice`·`dutyFreeAgedAppeal`·`dutyFreeEditionAppeal`·`dutyFreeSuggestedPrice`·`dutyFreeDemand`·`liveDutyFreeEditions`·`dutyFreeSlotBlocker`·`nextDutyFreeEdition`·`resolveDutyFreeEditions` | **`dutyFree.ts`** (새, 약 115줄) | MKT |
| 재고 담보대출(홋카이도): `inventoryCollateral`·`inventoryLtv`·`inventoryLoanRoom`·`inventoryMarginCall` | **`loans.ts`** (새, 약 50줄 — 아래 대출 함수와 함께) | MGT |

- **순환 해소:** `sites.ts`가 `bulk.ts`를 가져오는 이유는 담보대출(`inventoryCollateral`)뿐이고, `blending.ts`가 `sites.ts`를 가져오는 이유는 면세뿐이다. 담보대출이 `loans.ts`로, 면세가 `dutyFree.ts`로 가면 `sites → bulk → blending → sites`가 끊긴다

### 2.3 `actions.ts` (534줄, 행동 38개) → 코어 입구 + 파트 처리기 3개

**모양:** 행동 처리기를 `switch` 한 덩어리에서 **파트별 처리기 표**로 바꾼다. 각 `case` 본문을 그대로 함수 본문으로 옮긴다(로직 불변).

```ts
// actions.ts (코어) — 행동 타입 합집합 · 입구(게임 종료·테크 게이트·시나리오 잠금) · 현금 흐름 기록 · 처리기 표 조립
export type Action = ProdAction | MktAction | MgtAction;
type Handlers<A extends Action> = { [K in A['type']]: (s: GameState, prev: GameState, a: Extract<A, { type: K }>) => ActionResult };
const HANDLERS: Handlers<Action> = { ...PROD_HANDLERS, ...MKT_HANDLERS, ...MGT_HANDLERS }; // 빠진 행동은 타입 오류
const ACTION_CASH_KEY = { ...PROD_CASH_KEY, ...MKT_CASH_KEY, ...MGT_CASH_KEY };
```

| 새 파일 | 행동 | 줄 수 (추정) | 파트 |
|---|---|---|---|
| **`actions.prod.ts`** | `setOrder`·`saveRecipe`·`deleteRecipe`·`buyEquipment`·`buyCasks`·`buySpotCasks`·`orderSeasoning`·`sellUsedCask`·`rotateWarehouse`·`dumpCask`·`fillCasks`·`rechar`·`bottle`·`sampleCask`·`transferCask`·`labAnalyze`·`delegateBlend`·`applyWaterPermit` (18개) | 약 240 | PROD |
| **`actions.mkt.ts`** | `setPrice`·`setMarketing`·`sellBulk`·`buyBrokerCask`·`acceptContract`·`cancelContract`·`acceptCaskBid`·`acceptRetail`·`cancelRetail`·`acceptOem`·`acceptExportOffer`·`setExportPrice`·`closeExport` (13개) | 약 140 | MKT |
| **`actions.mgt.ts`** | `takeLoan`·`repayLoan`·`takeInvestment`·`sellCaskOwnership`·`hire`·`fire`·`resolveEvent` (7개) | 약 95 | MGT |
| `actions.ts` (코어) | 합집합·입구·현금 기록·`fail`·표 조립 | 약 70 | 코어 |

- **파트가 행동을 더할 때:** 자기 파일에 타입 + 처리기 + 현금 분류 3줄. 코어는 바꾸지 않는다(합집합이 파트 타입을 통째로 받는다) → PROCESS §7.3의 "코어 PR 선행"이 행동 추가에는 필요 없어진다
- `buyEquipment`는 비지터 센터(MKT)·방재 설비(MGT)도 사지만 "설비 구매" 행동 하나라 PROD에 둔다. 설비 종류별 규칙(예: 비지터 센터 선행 조건)은 콘텐츠 데이터에 있다

### 2.4 `content/catalog.ts` (284줄) → 파트별 콘텐츠 3개 + 재수출 껍데기

| 새 파일 | 옮길 것 | 파트 |
|---|---|---|
| **`content/production.ts`** | `INGREDIENTS`·`GNS`·`BOTANICALS`·`YEASTS`·`VOLUME_DISCOUNT_TIERS`, 설비 `EquipmentDef`·`WarehouseType`·증류기·발효조·숙성고 항목, 캐스크 `CaskDef`·`CASKS`·`NON_WOOD_VESSEL`·`WOOD_EXTRACT`·`SEASONING_EXTRACT`·`RECHAR_COST`·`CASK_MARKET`·`CASK_STORAGE`·`CASK_COST_SHARE_PER_FILL` | PROD |
| **`content/market.ts`** | `BOTTLE_SIZES`·`PACKAGING`·`packagingCost`·`BOTTLING_LABOR_PER_BOTTLE`·`DISTRIBUTION`·`logisticsCost`·`BULK`, 비지터 센터 설비 항목 | MKT |
| **`content/finance.ts`** | `LoanOfferDef`·`LOAN_OFFERS`·`INVESTMENT_OFFERS`(§2.1), 직원 `ROLE_INFO`·`NAME_POOLS`·`SURNAMES`·`GIVEN_NAMES`, 방재 설비·농업경영체 등록 항목 | MGT |
| `content/catalog.ts` | 위 셋을 재수출 + `EQUIPMENT`를 **원래 순서대로** 조립 (`{ ...생산 설비, ...방재·등록, ...비지터 센터 }`) | 코어 |

- `EQUIPMENT`의 순서는 구매 화면 목록 순서다. 조립 순서를 지금과 같게 해 화면도 바뀌지 않게 한다

### 2.5 `step.ts`에 섞인 도우미 (계획에 추가 — skeleton §3.3 목록에는 없었다)

`step.ts`는 코어(틱 파이프라인)인데 파트 규칙 함수 몇 개가 들어 있다. 파트가 이 규칙을 고치려면 코어 PR이 필요해진다.

| 함수 | 옮길 곳 | 파트 |
|---|---|---|
| `caskStorageCost` | `casks.ts` | PROD |
| `capacityReport` | `production.ts` | PROD |
| `monthlyFixedCost`·`currentLoanPayment` | `loans.ts` (§2.2와 함께) | MGT |
| `roleName` | `hr.ts` | MGT |
| `runFinance`(7단계 본문) | `loans.ts`의 `runFinance` — `step.ts`는 부르기만 | MGT |

### 2.6 `sim.test.ts` (879줄, describe 20개) → 파트별 테스트 파일

| 새 파일 | 옮길 describe / it | 파트 |
|---|---|---|
| **`production.test.ts`** | 컷 포인트 · 숙성 · 증발 보정 · 캐스크 보관비 · 라벨·숙성 연수 · 그레인·블렌디드 · (v1.0 운영) 습도·숙성고 기후·로테이션·발효 온도·캐스크 시장·중고 통·오염 통 | PROD |
| **`market.test.ts`** | 시장 · 마진 사다리 · 원액 B2B · 국산 원액 프리미엄 · 매입 원액 브랜드 가치 · 실명 레지스트리 · (지역) 어린 위스키 인식·숙성 프리미엄·재패니즈 표기 · (v1.0) 소매 역량·영업 효율·재고 적체·비지터 센터 · 수출(#95)·해외 명성(#96)은 `exports.test.ts`로 | MKT |
| **`finance.test.ts`** | 재무 · 월간 보고서 현금 흐름 · 변동 요소 · (v1.0) 부사수·에이징 커브·은퇴·방재 설비·투자·오너십 | MGT |
| `schema.test.ts` (코어, 이미 있음) | 결정론 · (지역) 교차 생산·진먼 고량·최소 숙성·한국 완화책 | 코어 |
| `sites.test.ts` (229줄, 섞여 있음) → 코어로 남기고 나눈다 | 남는 것: 입지 목록·관리비·건설비·입지 원료·원액 운송비. 나가는 것: 취수 허가 → `production.test.ts` · 면세 한정판·대형 유통 납품·위탁생산·미즈나라 인센스 → `market.test.ts` · 재고 담보대출 → `finance.test.ts` | 코어 |

- 테스트 개수가 이동 전후 같아야 한다(지금 150개 — #14~#16 합친 트리). `vitest` 출력의 테스트 이름 목록을 정렬해 비교한다

### 2.7 `scripts/balance-sim.ts` (627줄) — **이번에는 쪼개지 않는다 (권장)**

- 봇 정책은 전략(브랜드·혼합·확장·그레인·입지)별로 짜여 있어 파트 경계로 나뉘지 않는다. 파트 세션은 단계 P에서 봇을 거의 고치지 않는다(스모크 실행만)
- 단계 T 시작 때 BAL 세션이 `scripts/balance/{cli,policy,report}.ts`로 나눈다

---

## 3. 끝난 뒤의 소유 (skeleton §3.1·§3.2 갱신안)

| 소유 | 파일 |
|---|---|
| **코어** | `types.ts`·`step.ts`·`tick.ts`·`engine.ts`·`migrate.ts`·`newGame.ts`·`scenario.ts`·`newScenario.ts`·`rng.ts`·`util.ts`·`modifiers.ts`·`lifecycle.ts`·`index.ts`·**`actions.ts`(입구)**·**`sites.ts`(입지 데이터)**·`content/index.ts`·**`content/catalog.ts`(재수출)**·`content/regions.ts`·`content/scenarios.ts`·`schema.test.ts`·**`sites.test.ts`(입지 데이터만)**·`fixtures/` |
| **PROD** | `production.ts`·`maturation.ts`·`flavor.ts`·`blending.ts`·`blendTable.ts`·`blendRadar.ts`·`weather.ts`·**`warehouse.ts`**·**`casks.ts`**·**`waterPermit.ts`**·**`actions.prod.ts`**·**`content/production.ts`**·`content/axes.ts`·`content/categories.ts`·**`production.test.ts`** |
| **MKT** | `market.ts`·`bulk.ts`·`broker.ts`·`deals.ts`·`exportDeals.ts`·**`retail.ts`**·**`tourism.ts`**·**`dutyFree.ts`**·**`actions.mkt.ts`**·**`content/market.ts`**·`content/exports.ts`·`content/names.ts`·**`market.test.ts`**·`exports.test.ts` |
| **MGT** | `cashflow.ts`·`hr.ts`·`events.ts`·`research.ts`·**`investment.ts`**·**`loans.ts`**·**`actions.mgt.ts`**·**`content/finance.ts`**·`content/events.ts`·`content/tech.ts`·**`finance.test.ts`** |

굵게 = 새 파일 또는 역할이 바뀌는 파일.

---

## 4. 순서

`main`에 #14·#15·#16이 머지된 뒤 시작한다. 단계마다 §1 원칙 2의 검사를 통과해야 다음으로 간다.

| 단계 | 내용 | 위험 |
|---|---|---|
| 1 | `content/catalog.ts` → 콘텐츠 3개 + 재수출 | 낮음 — 데이터만, 재수출이 있어 가져오기가 안 깨진다 |
| 2 | `ops.ts`·`sites.ts`·`step.ts` 도우미 → 파트 파일 (§2.1·§2.2·§2.5). 화면 10개·스크립트 2개의 직접 가져오기 갱신 | 중간 — 가져오기 그래프가 바뀐다. 순환 검사를 함께 돌린다 |
| 3 | `actions.ts` → 처리기 표 + 파트 3개 (§2.3) | 중간 — 기계적이지만 줄 수가 가장 많다. 타입이 빠진 처리기를 잡는다 |
| 4 | `sim.test.ts` → 파트별 테스트 (§2.6) | 낮음 — 테스트 이름 목록 비교 |
| 5 | skeleton §3 갱신, 이 문서를 "완료"로 | — |

- 예상 작업량: 세션 하나에서 반나절 안팎 (추정). 결정이 없는 기계적 작업이다

---

## 5. 리스크

| 리스크 | 대응 |
|---|---|
| 열린·멈춘 브랜치(ciosryu/distillery#5·#6·#9)가 옮긴 파일과 크게 충돌한다 | 이 셋은 이미 v5 코드라 어차피 크게 따라잡아야 한다(STATUS "따라잡기"). 이 문서의 §2 표가 "옛 위치 → 새 위치" 지도다. 기호 이름은 바뀌지 않고 `index.ts`가 재수출하므로, `from './ops'` 같은 직접 경로만 고치면 된다 |
| 옮기다가 동작이 바뀐다 (예: `EQUIPMENT` 순서, 모듈 초기화 순서) | 골든 바이트 비교 + MVP 실험 결정론 비교를 단계마다 |
| 파일이 많아져 찾기 어렵다 | §3 소유 표를 skeleton에 올린다. 이름은 시스템 이름 그대로 |
| 처리기 표의 타입이 복잡해진다 | 매핑 타입 하나(`Handlers<A>`)뿐이다. C#에서는 `switch` 또는 딕셔너리로 1:1 대응 |

---

## 6. 결정 — `[결정 #144]` (권장안 채택)

| # | 질문 | 권장안 | 이유 | 대안 |
|---|---|---|---|---|
| 1 | 구조: 평면(섞인 파일만 쪼갠다) 대 파트 폴더(`src/sim/prod/` 등으로 전부 옮긴다) | **평면** | 이번 목적(충돌 방지)은 섞인 파일 6개만 쪼개면 이룬다. 폴더로 옮기면 거의 모든 가져오기 경로가 바뀌어 멈춘 브랜치(#9 등)의 따라잡기 비용이 두 배가 된다 | 파트 폴더 — 소유가 경로로 보이고 C# 프로젝트(어셈블리) 분리와 맞는다. Phase G 직전에 다시 볼 수 있다 |
| 2 | PR: 한 개(단계별 커밋) 대 단계별 PR 4개 | **한 개, 단계마다 커밋** | 결정이 하나도 없는 기계적 작업이라 오너가 볼 것이 없다. PR을 4개로 나누면 PM 머지와 따라잡기만 4번 는다. 커밋마다 골든 검사 결과를 남겨 커밋 단위로 확인할 수 있게 한다 | 단계별 PR — 되돌리기는 쉽지만 같은 파일(`index.ts`·`step.ts`)을 연달아 고쳐 쌓인 PR이 된다 |
| 3 | 밸런스 스크립트를 지금 쪼갤지 | **단계 T에서 BAL이** | §2.7 | 지금 쪼갠다 — 파트가 봇을 고칠 일이 생기면 그때 충돌 |
| 4 | `content/catalog.ts`를 재수출 껍데기로 남길지 | **남긴다** | 가져오기 경로를 바꾸지 않아도 되고, 콘텐츠 JSON화(S-7) 때 이 파일이 로더 자리가 된다 | 지운다 — 파일이 하나 줄지만 `content/catalog`를 가져오는 26개 파일의 경로가 바뀐다 |

---

## 7. 실행 기록 (2026-11-06, 설계 세션)

`main`(#14~#18 머지 뒤)에서 한 PR, 단계마다 커밋 1개. **모든 단계에서** 타입 오류 0 · 테스트 150개 통과·테스트 이름 목록 동일 · `DIAG=1 npm run balance -- 2 120 all <KR·JP·KR jeju·JP hokkaido·TW kinmen>` 출력과 MVP 생존 실험(`MVP=micro`, 4시드) 출력이 쪼개기 전과 **바이트 동일** · `npm run build` 통과. 마지막에 브라우저에서 MVP(탭 8개)·샌드박스(탭 10개)를 1년씩 진행하고 모든 탭을 열어 콘솔 오류 0을 확인했다.

| 단계 | 커밋 내용 |
|---|---|
| 1 | `content/catalog.ts` → `content/production.ts`·`market.ts`·`finance.ts` + 재수출·설비 조립 (설비 21개 순서 동일 확인) |
| 2 | `ops.ts` 삭제·`sites.ts` 축소·`step.ts`의 파트 코드를 파트 파일로 (§2.1·§2.2·§2.5). 가져오기 순환 1개 → 0개 |
| 3 | `actions.ts` → 입구 + `actions.prod/mkt/mgt.ts` + `actionKit.ts` |
| 4 | `sim.test.ts` 삭제·`sites.test.ts` 축소 → `production/market/finance.test.ts`, `schema.test.ts`·`exports.test.ts`에 덧붙임 |

**계획과 다르게 한 것 (모두 같은 원칙 — 파일 하나 = 파트 하나, 동작 불변):**
1. **`step.ts`에서 규칙 본문도 뺐다.** 계획 §2.5는 도우미와 `runFinance`만 적었는데, 생산 단계(`runProduction`, 약 130줄)·숙성 단계(`runMaturation`)·판매·주세 단계 본문도 파트 규칙이었다. 각각 `production.ts`(PROD)·`warehouse.ts`(PROD)·새 파일 `sales.ts`(MKT, `settleSales`)로 옮겼다. `step.ts`는 457 → 167줄로, 단계 순서·리포트·판정만 남는다. 판매 단계를 `market.ts`가 아니라 새 파일에 둔 이유: `market.ts`와 `exportDeals.ts` 사이에 가져오기 순환이 생긴다
2. **`actionKit.ts`(코어)를 새로 뒀다.** `ActionResult`·`fail`·처리기 표 타입을 입구(`actions.ts`)에 두면 입구와 파트 처리기가 서로 가져오는 순환이 생긴다
3. **테스트 배치:** "한국 완화책(전통주 주세 경감)" 테스트는 v1.0 블록에 있어 계획에서 빠졌다 → 주세라 `market.test.ts`로. 블록을 나눈 곳(`지역 (v0.6)`·`v1.0 운영 시스템`·`입지 목록`·`제주 — 취수 허가·면세 한정판`)은 테스트 이름을 지키려고 블록 제목을 그대로 두었다 — 같은 제목의 블록이 여러 파일에 있다
4. 타입만 가져오는 줄은 `import type { … }`으로 고쳤다(옮긴 파일만)

**결과 줄 수:** `actions.ts` 534 → 43 · `step.ts` 457 → 167 · `sites.ts` 238 → 47 · `content/catalog.ts` 284 → 14 · `ops.ts`·`sim.test.ts` 삭제. 새 파일 19개(코어 1 · PROD 6 · MKT 7 · MGT 5, 테스트 포함)

**남은 것:** `scripts/balance-sim.ts`는 계획대로 단계 T에서 BAL 세션이 나눈다. 멈춘 브랜치(#5·#9)는 §2의 표를 "옛 위치 → 새 위치" 지도로 쓴다 — 기호 이름은 그대로이고 `index.ts`가 재수출한다

