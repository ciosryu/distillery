# 단계 0 — 읽기 전용 기준선·GAP 감사 (PM, 2026-11-13)

> 등급: **기록**. [README.md](README.md) §8 단계 0과 [claude-code-prompts.md](claude-code-prompts.md) 단계 0 지시에 따라 PM 세션이 실행했다. **게임 코드·밸런스 출력을 바꾸지 않았다.** 모든 판정은 아래 커밋의 파일·함수·줄로 가리킨다. 표기: **[사실]** 코드·명령으로 확인 · **[추론]** 사실에서 이끈 판단 · **근거 미확보** 원문이 없어 내용을 알 수 없는 것(추정하지 않는다).

## 0. 기준선

| 항목 | 값 | 근거 |
|---|---|---|
| 감사 기준 `main` | `45a138f6e7eae64453e63646c1429025992386a9` (2026-11-13 10:47 JST) | 감사 패키지 §1 |
| 지금 `main` | `0916d6c48d4267d0f5c67f32f98369bda77d07b2` — 45a138f + 감사 패키지 6파일(`docs/handoff-2026-11-13/`)만. **게임 코드·`docs/` 정본은 45a138f과 같다** | `git show --stat 0916d6c` |
| 기존 비교 기준 | `d0b6886506b3f8da50bf37aa2ad11bbb84e733fe` (2026-11-11) — `main`의 조상 | 감사 verification.md |
| 결정 원장 상한 | **#1~#307** (빈 번호 #97·#110~#116 예약, #98·#99 결번), 다음 번호 **#308** | `docs/DECISIONS.md` "다음 번호" |
| 세이브 스키마 | **v15** (`SAVE_VERSION = 15`, `GameState.version: 15`) | `src/sim/migrate.ts:8` · `src/sim/types.ts:935` |
| 테스트 | 38파일 / **591개** 통과 | 아래 §3 |
| 정본 브랜치 | `main`. GitHub 기본 브랜치 `claude/dazzling-mccarthy-40er1r`는 동결 | `CLAUDE.md` · `docs/README.md` |

### 0.1 d0b6886 → 45a138f 변경 보존 [사실]

- 문서: 50파일 +7,001/−64줄 (`docs/baseline/2026-11-12*`, `design/architecture.md` +430, `balance-spec.md` +175, `game-program.md` +557, `late-game-gate.md` +176, `mgt/mkt/prod-stage-t.md`, `requirements.md` +200, `requirements-audit.md` +225, `t-entry-check.md` +72, `mvp.md` +35/−1).
- 코드·스크립트: 92파일 +6,706/−241줄.
- 결정 **#271~#307**(37건) 추가. 이 감사에서 되돌리지 않는 것: **#300**(S6 = Gauss-Seidel, 최대 3바퀴 — #298을 고침) · **#305**(B1-1 숙성 가치 단일 출처 보류 — #302 c3h를 고침) · **#306**(#273 장기 숙성 경쟁력은 정책을 맞게 고른 판에서 판정) · **#307**(B1-6 = 국내 상한 ×1.08만, ρ 3 유지 — #303을 고침). 감사 A20·A19와 일치한다.
- `mvp.md` §3의 변경은 #263 플래그십 등급제의 구현 기록(`judgeGoal` 결과 넷)과 §7.22 진입 확인 기록 추가다. **목표 정의 자체(12년 플래그십·순자산 ×3·180개월 한 번 판정)는 d0b6886과 같다.**

## 1. 근거 등급 — 감사가 쓴 결정 식별자

감사 패키지의 `CORE-001~109`는 **이 저장소 밖 대화**의 결정이다. 저장소에는 원문이 없고, `evidence/conversation-available.md`에 마지막 5문답만 있다.

| 등급 | 개수 | 번호 | PM 처리 |
|---|---|---|---|
| **직접 문답** (원문 있음) | 3 | CORE-107(취향 변화 난이도 연동) · 108(Easy/Normal/Hard/Custom 6영역) · 109(B안 — 완주 가능한 유료 EA → 1.0) | 오너 확정 의도로 **인용 가능**. 정식 결정 번호는 PM이 오너 승인 뒤 발급(#308~) |
| **요약 연결만** (원문 없음, 이전 감사 요약) | 26 | 18·19·20·21·28·29·30·31·71·73·74·76·77·79·80·82·84·87·88·91·97·98·99·101·102·105 | **근거 미확보(요약)** — 내용은 감사 요약대로 적되, 확정 결정으로 기록하지 않는다. 오너가 이 저장소에서 다시 확인해야 한다 |
| **원문 미확보** | 80 | 나머지 | **근거 미확보** — 내용·범위·처리 관계를 추정하지 않는다. 구현 0 |

- **15년 싱글 몰트 승리 조건(CORE-73·79·105, A02):** 원문은 미확보다. 다만 직접 문답 107("15년 전에 인기 있던 향미"), 108("자체 증류한 15년 숙성 싱글 몰트 위스키의 캠페인 승리 조건은 난이도로 제거하지 않는다"), 109 B안 본문("자체 증류한 15년 숙성 싱글 몰트 위스키의 상업 판매까지 완주")이 이를 **전제로 인용**한다 [사실]. → 등급: **간접 확인**. 저장소의 오너 확정 결정(#133·#141·#145·#263 — 12년 플래그십·순자산 ×3·180개월 판정)과 **충돌**하므로, 어느 쪽이 유효한지는 **오너가 이 공정에서 직접 결정**해야 한다(STATUS 결정 대기 77).
- **12년 유상 출하안(README §11):** 오너의 **질문**이고 감사의 권장이다. 확정이 아니다 → **검토안**으로만 기록한다.
- 감사 규칙 A01~A20의 근거 등급: 직접 문답에 닿는 것 **A11·A14·A15·A16** · 요약 연결에만 닿는 것 **A02~A10·A12·A13** · CORE 번호 없이 "최신 통합 원칙/정책"으로만 적힌 것 **A01·A17·A18**(근거 미확보 — 저장소 결정과 충돌하지 않는 범위에서만 참고) · 저장소 결정의 보존 **A19·A20**(저장소 원장이 근거 — 확정).

## 2. C01~C16 ↔ 코드 대응 — 구현 판정 [사실]

판정: **Implemented** 요구대로 있다 · **Partial** 일부 · **Missing** 없다 · **Conflict** 있지만 최신 요구(감사 A규칙)와 반대. 괄호의 "요구"는 감사 A규칙 기준이며, 그 요구의 근거 등급은 §1을 따른다.

| ID | 우선 | 코드 근거 (파일:줄) | 판정 | 간극 |
|---|---|---|---|---|
| **C01** 승리 적격성 | P0 | `progress.ts:13` `DEFAULT_FLAGSHIP_MONTHS = 144` · `:25-26` `flagshipProducts` = `isWhiskyCategory && oakMonths >= 144` · `blending.ts:112` `WHISKY_CATS`(싱글 몰트·그레인·블렌디드 모두) · `content/scenarios.ts:99` `goal.flagshipMinMonths: 144` · `Product.sourcedShare`(`types.ts`) 존재하나 판정에 안 씀 | **Conflict** (요구 A02: 자가 증류·몰트·180) / 저장소 결정 #133·#145 기준으로는 Implemented | 출처(자가/매입/증류소)·몰트 한정·구성 원액 전원 조건 없음. 상수 하나로 12·15년 전환은 되나 적격성 함수는 없음 |
| **C02** 승리·기간 | P0 | `progress.ts:63-85` `judgeGoal`: `achieved` = 생존 + 순자산 ≥ 자기자본×3(#263) · `:101-109` `updateProgress`: `s.month+1 >= goal.months(180)` 또는 종료 때 **한 번** `verdict` 고정 · `progress.test.ts:56` "한 번 판정하고 자동 진행은 거기서 멈춘다" | **Conflict** (요구 A02·A03) | 순자산만으로 승리, 180개월 강제 판정, 그 뒤 계속은 `acknowledgeVerdict`(목표 없음) |
| **C03** 판매 소급 | P0 | `progress.ts:57` `flagSold = flag.filter(p.totalSold > 0)` · `totalSold` 누적: `market.ts:456·470·489`, `deals.ts:136`, `events.ts:215` · 제품 숙성 = 지금 `oakMonths`(보충 때 가장 어린 원액 기준, #186) · 판매 거래에 로트·적격성 스냅샷 없음(`SalesResult`는 월 리포트) | **Conflict** | 어린 제품을 판 뒤 적격 원액으로 보충만 해도 `flagship_sold` 성립 가능 [추론 — 테스트로 미확인] |
| **C04** 참값 은닉 | P0 | `Sales.tsx:186` `품질 {p.quality}` · `:286` 묶음 품질 범위 · `:386` 비교 선택 · `HeritageReveal.tsx`·`Bottling.tsx`(`masked = fromCasks`만) 등 UI `.quality` 읽기 24곳 · `economics.ts:417` `currentSuggested`가 `p.quality`로 권장가(자동 가격·정책 입력) · `architecture.md §11.1` 등급 **R "병입 뒤 공개"는 #167 확정** | **Conflict** (요구 A04) — 저장소 결정 #167 기준으로는 Implemented | "병입·판매 뒤 참값 공개"가 **결정**이다. 바꾸려면 #167 변경 결정이 필요. `market.ts:125·182`의 `p.quality`는 시장 결과 쪽(허용) |
| **C05** 배치 계보 | P0 | `production.ts:310-331` `TANK_MERGE_KINDS`·`sameTank`·`mergeIntoTank`(LPA 가중 평균, `batchId`를 새 것으로 덮음 `:326`) · `types.ts:89` `batchId?` 선택 · `blending.ts:496-504` `recipeIds`·`caskMix`·`caskMonthsMix` = 집합·비율만 · `SpiritLot.sourced: boolean`(2치, 증류소 식별 없음) | **Partial / Conflict** (요구 A05) | 기여 LPA·분할/혼합 부모·누적 적격 목재 개월·출처 3치(자가/매입/미상) 없음. 묵시적 합치기는 **설계 결정(#166, 실측 근거)**이라 바꾸면 결정 변경 |
| **C06** 캠페인 범위 | P0 | `scenarios.ts:86` `kinds: ['soju','malt']` · `:105-106` 84개월 수출 해금 · `:118-119` 120개월 HR 해금 · `:124` 중반 목표 `export_open` 132개월 | **Conflict** (요구 A08·A09·A10) | 그레인·기본 블렌드 잠김(코드는 있음) · 수출·HR 해금이 캠페인 안에 있음(#215·#232 오너 승인) |
| **C07** 가치평가 | P0 | `progress.ts:30-37` `netWorth` 원액 = `volumeL × abv × spotBidPerLPA` → `bulk.ts:39` `bulkValuePerLPA(quality = lotQuality(lot))` **참값** · 제품 = 원가 · #146 평가액 곡선 같은 정의 · `architecture.md §11.3` 실측: 초반 2년 합계가 배치 참 품질을 0.2~0.3점 해상도로 담음 [사실] · 담보·선판매 권리 원장 없음(`Cask.owner` `types.ts:159`만) | **Conflict** (요구 A12) | 장부/추정/처분 3종 분리 없음. 해상도 누수의 선택지(안 A/B/C)는 P-ARCH-41 **오너 결정 대기** |
| **C08** 결정 복원 | P0 | 저장소에 CORE 원문 없음. `evidence/conversation-available.md` 5문답(107·108·109 직접) | **Open(자료)** | 80개 근거 미확보. 전수 동결 표기 불가(§1) |
| **C09** 난이도 | P1 | 난이도 = 입지 별점 `content/regions.ts:71 difficulty?: 1~5`(표시 — `Dashboard.tsx:143`·`App.tsx:129`) · 규모 티어 `scenarios.ts tiers` micro/standard · `DifficultyConfig`·6영역 설정 없음 | **Missing** (요구 A11·A15, 직접 문답 107·108) | 별점·규모 티어를 난이도 구현으로 세지 않는다 |
| **C10** 관측 계약 | P1 | `types.ts` `SampleRecord {month, hex, sigma, estQuality}` · 자동 샘플 #177·#201·#207(고정 난수, 횟수 안 셈) · 비용 3만·0.1L(#209) · `architecture.md §11.2` I1~I4(제안) | **Partial** (요구 A06) | 비용·소모·오차·시점은 있음. 관측 레코드 통일·재조회/재로드 우회 테스트는 제안 단계 |
| **C11** 자연 변동 | P1 | `rng.ts:52-54` `rngFor(seed, month, stream)` · #290 S1~S7 대상별 스트림(`rngStreams.test.ts` `it.fails` 0) · #299 | **Partial** (요구 A07) | 재현 계약은 있음. "자연 변동"의 대상·범위·상한·난이도 상관은 명세 없음 |
| **C12** 과숙성 | P1 | `maturation.ts` 물리 기반 · `scripts/experiments/prod-aging.ts`(통 단위 최적 연수) · REQ-PROD-1·2 단계 ② · #273·#306 · 40시드 B′ HC−HA +3.75억(`docs/baseline/2026-11-12-p7/`) | **Partial** (요구 A17) | 측정은 **구승리 정의·현 봇** 기준. 새 승리 조건의 "최적 병입 창"은 미검증 |
| **C13** 권리 원장 | P1 | `forwards.ts`(원재료 차액 정산 — 원액 아님) · `loans.ts`·`insurance.ts`·`investment.ts` · `Cask.owner`(오너십 판매 — `netWorth`에서 제외 `progress.ts:32`) | **Partial / Missing** (요구 A12) | 원액 선판매·담보·인도 의무의 중복 방지 계약 없음(해당 기능도 거의 없음) |
| **C14** 봇·지표 | P1 | `scripts/experiments/mvp-survival.ts:192-193` `progress.verdict`·`achieved(outcome)` · `metrics.ts:26 outcomeOf` · P8 CALIB H1~H4(#296) · 40시드 원자료 `docs/baseline/2026-11-12-p7/`(BAL 판정 전) | **Conflict** (새 요구 기준) | 모두 **구승리 정의**를 쓴다. 승리 정의가 바뀌면 판정 함수·봇·기준선을 다시 만들어야 한다 |
| **C15** 저장 규칙 버전 | P1 | `migrate.ts:8` v15 체인 · `scenario.startBuild`(#241, 빌드 해시) · `repair.ts`(#285·#295, 원본 보존 `persist.ts:34`) | **Partial** (요구 A15) | 규칙 버전·난이도 스냅샷·계보 필드 없음. 기반(마이그레이션·원본 보존)은 있다 |
| **C16** 문서 drift | P1 | `STATUS.md` 머리 "마지막 갱신 2026-11-10"(낡음) · 단계 "P" 표기 vs 1a "진입 조건 충족" · `mvp.md §0` "15년 키우는"(캠페인 길이) vs §3 "12년 플래그십"(원액) · `architecture.md §11` P-ARCH-41 제안 vs #167 확정 | **Open** | 단계 1에서 고친다(이 PR) |
| Godot/C# | — | `git ls-files`에 `.cs`·`.csproj`·`project.godot` 0 | **Missing** | #122로 플랫폼 확정, 구현은 단계 G |

## 3. 실행한 검사 [사실]

환경: 세션 컨테이너(Linux), 지금 `main` 0916d6c(게임 코드 = 45a138f).

| 검사 | 명령 | 결과 |
|---|---|---|
| 타입 | `npm run typecheck` | 통과 (exit 0) |
| 테스트 | `npm test` | **38파일 / 591 통과**, 실패 0, 기대 실패 0 |
| 빌드 | `npm run build` | 통과 (`✓ built`) — 큰 번들 경고는 감사 기록과 같음 |
| KR 스모크 | `npx tsx scripts/balance-sim.ts 2 120 all KR` | exit 0 · 5전략 × 2시드 파산 0/10 · brand 25.48 / hybrid 27.17 / expand 21.86 / grain 7.49 / site 27.05억 — **감사 verification.md와 수치 동일** |

- 이 결과는 **구규칙의 회귀 기준**이다. 새 요구(C01~C16)의 충족 증명이 아니고, 40시드 판정도 아니다.
- **Not-run:** 8입지 전체 스모크(이번은 KR만) · 새 수용 테스트(기능 전) · 새 승리 조건 완주·40시드 · Godot 빌드 · 브라우저 조작.

## 4. 수정 묶음별 의존성 (감사 §7 의존 순서 기준)

| 묶음 | 내용 | 먼저 필요한 것 | 지금 상태 |
|---|---|---|---|
| **F0 근거·범위** | CORE 근거 복원, 승리 정의 결정(15년/12년/현행), 범위(수출·HR·주종) 결정 | 오너 결정(STATUS 77~80) | **대기** |
| **F1 RuleSet·저장** | `campaignGoal`(최소 목재 개월·사건 종류·규칙 버전), 난이도 스냅샷 자리, 스키마 v16 마이그레이션 | F0 | 설계 초안([core-integration.md](../design/core-integration.md) §3) |
| **F2 배치·계보** | ComponentLedger(출처 3치·기여 LPA·부모·누적 적격 개월), 묵시적 합치기 → 명시 혼합(#166 변경 결정) | F1 | 초안 |
| **F3 병입 로트·판매 사건** | BottledLot·SaleEvent(당시 적격성·수량·양의 대가·거래 상태) | F2 | 초안 |
| **F4 승리 교체** | `campaignEligibility(A)`·최초 적격 유상 출하 승리·성과 분리·캠페인 지속 | F3 + F0(연수 A 확정) | 초안 — **상수 144→180만 바꾸는 패치로 완료 처리 금지** |
| **F5 관측·가치·범위** | PlayerView·3종 평가·권리 원장·새 캠페인 잠금(#167·#146·#215·#232 변경 결정) | F1·F3 | 초안 |
| **F6 난이도** | DifficultyConfig 6영역 × 3단계·프리셋=Custom 동치 | F1·F5 | 초안(직접 문답 107·108) |
| **F7 새 밸런스** | 새 판정 함수로 봇·40시드·게이트 L | F4~F6 | — |
| **F8 Godot** | TS 동결·골든(`golden-trace.ts` 준비 #433) → C# | F7 | — |

## 5. 완료 조건 자가 확인

- 모든 C항목에 코드 근거 또는 검색 범위가 있다 ✔ (§2)
- 생산 코드 변경 0 ✔ (`git diff --stat 0916d6c -- src scripts` = 없음)
- 모르는 결정의 추정 0 ✔ — 근거 미확보 80건은 내용을 적지 않았다(§1)
- 다음 단계에 필요한 확정 묶음 식별 ✔ — F0(오너 결정 4건)이 F1~F4의 선행 조건이다. **확정 전에 코드로 들어갈 수 있는 것은 없다**(F1의 "값을 바꾸지 않는 매개변수화"도 어느 사건 정의를 넣을지 F0에 달려 있다)
