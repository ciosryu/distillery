# 향미 모델 설계 v0.1

> 상위 문서: [PRD](../PRD.md) §4~6 · 상태: 설계 초안 · 수치는 모두 `[튜닝]` 대상
> 실제 화학을 정확히 재현하는 모델이 아니라, **공정 선택 → 결과**의 인과를 플레이어가 이해할 수 있게 만드는 게임적 근사다.

---

## 1. 설계 목표

1. **하나의 데이터 구조로 전 공정 연결** — 원재료·발효·증류·숙성·블렌딩·병입·평가·수요가 같은 향미 상태를 읽고 쓴다.
2. **주종별로 다른 향미 모델** — 주종마다 의미 있는 축, 표시 축, 전형성 규칙, 스타일, 평가 가중치를 따로 정의한다.
3. **주종 추가 = 데이터 추가** — 엔진(코드)은 공통. 새 주종은 JSON 스키마와 효과 데이터만 추가.
4. **플레이어 가독성** — 화면에는 주종별 6~8개 레이더 축만, 나머지는 상세 패널.

---

## 2. 3계층 구조

```
┌──────────────────────────────────────────────────────────┐
│ ① 전역 축 레지스트리 (Axis Registry)                         │
│    모든 향미 축의 정의: 계열, 증류 시 위치(μ,σ), 무게, 숙성 반응 │
└──────────────────────────────────────────────────────────┘
                 ▲ 참조                     ▲ 참조
┌──────────────────────────────┐  ┌──────────────────────────────┐
│ ② 주종 스키마 (Category Schema) │  │ 공정 효과 데이터 (Effects)       │
│    사용 축, 레이더 축, 전형성,     │  │    원재료·효모·설비·캐스크가       │
│    스타일 프리셋, 평가 가중치      │  │    어떤 축을 얼마나 바꾸는지        │
└──────────────────────────────┘  └──────────────────────────────┘
                 ▲ 해석                     │ 적용
┌──────────────────────────────────────────────────────────┐
│ ③ 향미 상태 (FlavorState) — 실제 원액/제품이 가진 값            │
│    sparse map + 구조 속성 + 숨김 값                            │
└──────────────────────────────────────────────────────────┘
```

- **엔진은 항상 전역 축 공간에서 계산**하고, **평가·표시는 주종 스키마로 해석**한다.
- 그래서 셰리 캐스크는 몰트 위스키든 럼이든 같은 효과(`dried_fruit +`)를 주고, 그 결과가 "좋은지"는 주종 스키마가 판단한다.

---

## 3. 전역 축 레지스트리 (초안 30축)

### 3.1 향미 축

| 계열 | 축 id | 이름 | 증류 위치 μ | 무게 | 주된 출처 |
|---|---|---|---|---|---|
| 과일·에스테르 | `fresh_fruit` | 청사과·배 | 0.30 | 0.2 | 발효(에스테르), 짧은 증류 |
| | `tropical` | 열대과일·바나나·파인애플 | 0.25 | 0.2 | 장기 발효, 에일 효모, 농향 교지 |
| | `citrus` | 시트러스 | 0.30 | 0.2 | 보태니컬, 아가베 |
| | `dried_fruit` | 건과일·셰리 | — | — | 셰리·포트 캐스크, 장기 숙성 |
| | `vinous` | 포도·와인 | 0.40 | 0.3 | 포도 원료, 와인 캐스크 |
| | `orchard` | 사과·과수원 | 0.35 | 0.3 | 사과 원료 |
| 꽃·허브 | `floral` | 플로럴 | 0.40 | 0.2 | 고환류 증류, 보태니컬 |
| | `herbal` | 허브·식물성 | 0.50 | 0.4 | 아가베(디퓨저), 아그리콜, 보태니컬 |
| | `juniper` | 주니퍼·송진 | 0.45 | 0.3 | 진 보태니컬 |
| | `botanical_spice` | 보태니컬 스파이스 | 0.50 | 0.4 | 고수씨·카다멈·산초 등 |
| 원료 | `cereal` | 곡물·몰티 | 0.60 | 0.6 | 맥아·곡물, 저환류 |
| | `cooked_agave` | 익힌 아가베 | 0.50 | 0.5 | 아가베(벽돌 오븐↑) |
| | `nuruk_rice` | 누룩·쌀·입국 | 0.50 | 0.5 | 쌀 + 누룩/코지 |
| | `sorghum_grain` | 고량 곡향 | 0.55 | 0.6 | 고량 + 곡(曲) |
| | `cane` | 사탕수수·당밀 | 0.50 | 0.5 | 당밀, 사탕수수즙 |
| | `toasted_grain` | 구수함·누룽지 | 0.70 | 0.7 | 상압 증류, 직화 |
| 스모크·흙 | `peat_smoke` | 피트·스모크 | 0.70 | 0.8 | 피티드 몰트(ppm), 늦은 c2 |
| | `earthy` | 흙·버섯 | 0.75 | 0.8 | 진흙 교지, 더니지 장기 숙성 |
| 발효 | `funk` | 펑키·하이 에스터 | 0.20 | 0.4 | 던더, 야생 효모, 장기 발효 |
| | `fermented_umami` | 장향·발효 감칠맛 | 0.65 | 0.7 | 장향 백주(다회 발효·증류) |
| 오크·숙성 | `vanilla_caramel` | 바닐라·캐러멜 | — | — | 아메리칸 오크, 탄화 |
| | `oak_tannin` | 오크·탄닌 | — | — | 유러피언 오크, 새 오크, 소형 캐스크 |
| | `wood_spice` | 오크 스파이스(시나몬·정향) | — | — | 새 오크, 라이 |
| | `nutty_rancio` | 견과·란시오 | — | — | 장기 산화 숙성(반응형) |
| | `incense` | 백단·인센스 | — | — | 미즈나라·한국 참나무 장기 숙성 |
| 무게감 | `sulfur_meaty` | 유황·미티 | 0.70 | 0.7 | 구리 접촉↓(웜텁, 스테인리스 응축기) |
| | `oily_waxy` | 오일리·왁시 | 0.75 | 0.8 | 넓은 c2, 저환류 |

### 3.2 이취(off-note) 축 — 모든 주종 공통 감점

| 축 id | 이름 | 증류 위치 μ | 원인 |
|---|---|---|---|
| `solvent` | 용제·아세톤 | 0.05 | 이른 c1(초류 혼입) |
| `feinty` | 퓨젤·젖은 판지 | 0.90 | 늦은 c2(후류 혼입) |
| `acetic` | 식초·산패 | — | 발효 오염 (목재 발효조, 위생↓) |
| `musty` | 곰팡이·TCA | — | 캐스크 오염, 코르크 |

### 3.3 구조 속성 (향이 아닌 값)

| 속성 | 범위 | 결정 요인 |
|---|---|---|
| `body` | 0~100 | `oily_waxy`·`cereal` 잔존, 환류 역수, 칠 필터링(−) |
| `sweetness` | 0~100 | 원료(옥수수·당밀), 아메리칸 오크, 감미(희석식) |
| `harshness` | 0~100 | 뉴메이크 자극 — 숙성 제거 효과로 감소 |
| `integration` | 0~100 | 반응형 숙성·매링 → 높을수록 밸런스↑ |
| `color` | 0~100 | 캐스크 추출, 착색 |
| `abv` | % | 증류·가수·증발 |

### 3.4 축 정의 타입

```ts
interface AxisDef {
  id: AxisId;
  nameKo: string;
  family: 'fruit' | 'floral_herbal' | 'raw_material' | 'smoke_earth' | 'ferment' | 'oak' | 'weight' | 'offnote';
  distill?: { mu: number; sigma: number; heaviness: number }; // 증류로 넘어오는 축만. 없으면 비휘발(캐스크 유래)
  maturation?: { subtractRate?: number; interactiveGrowth?: number };
  polarity: 'positive' | 'contextual' | 'offnote';            // contextual = 주종 스키마가 좋고 나쁨을 판단
}
```

---

## 4. 공정별 변환 파이프라인

각 공정은 `(FlavorState, params, ctx) → FlavorState` 함수이고, 효과 수치는 데이터(JSON)로 정의한다.

```ts
interface FlavorEffect {
  target: AxisId | `family:${string}` | StructAttr;
  op: 'add' | 'mul' | 'saturate';      // saturate: 상한을 향해 지수적으로 접근
  value: number;
  scaleBy?: 'ppm' | 'days' | 'activity' | 'tempFactor' | ...;
}
```

### 4.1 원재료 → 매시(Mash) 기본 벡터

매시빌 비율로 가중 평균한다.

| 원재료 | 주요 기여 `[튜닝]` |
|---|---|
| 맥아 보리 | `cereal 40`, `sweetness 10` |
| 피티드 맥아 | 위 + `peat_smoke = ppm × 0.8` (상한 100) |
| 옥수수 | `sweetness 30`, `cereal 15` |
| 호밀 | `wood_spice 15`(라이 스파이스로 공용), `herbal 10` |
| 밀 | `sweetness 15`, `cereal 10`, `body −5` |
| 블루 아가베 | `cooked_agave 50`, `herbal 15`, `citrus 10` — 쿠킹: 벽돌 오븐 ×1.3 / 오토클레이브 ×1.0 / 디퓨저 `cooked_agave ×0.6, herbal ×1.4` |
| 고량 | `sorghum_grain 50`, `earthy 10` |
| 쌀 + 누룩 | `nuruk_rice 45`, `floral 10`, `fresh_fruit 10` |
| 포도(와인) | `vinous 40`, `fresh_fruit 20`, `floral 15` |
| 사과 | `orchard 50`, `fresh_fruit 15` |
| 당밀 | `cane 40`, `sweetness 20`, `funk 5` |
| 사탕수수즙 | `cane 30`, `herbal 25`, `fresh_fruit 10` |
| 감자 | `body +10`, `cereal 5` (중성 지향) |

### 4.2 발효

| 변수 | 효과 `[튜닝]` |
|---|---|
| 효모 — 증류용 | 기준 (수율↑) |
| 효모 — 에일 | `tropical +`, `fresh_fruit +`, 수율 −3% |
| 효모 — 야생 | `funk ++`, `fresh_fruit +`, `acetic` 위험 ↑, 결과 편차 ↑ (숨김값) |
| 발효 시간 | 일수가 길수록 에스테르(`fresh_fruit`, `tropical`, `floral`) 포화 증가 — 예: `saturate(fruit, 1 − e^(−days/4))` |
| 발효조 — 목재 | 젖산 복합미(`fresh_fruit`, `floral` 소폭↑), `acetic` 위험 ↑ |
| 발효조 — 진흙 교지 | `tropical ↑↑`(농향 핵심), `earthy ↑`, **교지 연식에 비례** |
| 던더(럼) | `funk ↑↑` |

### 4.3 증류 — 컷 포인트와 환류

증류 1회를 진행축 x ∈ [0,1]로 본다. 축 i는 정규분포 N(μᵢ, σᵢ)로 나온다고 가정한다.

```
윈도우 통과율 wᵢ = Φ((c2 − μᵢ)/σᵢ) − Φ((c1 − μᵢ)/σᵢ)        # Φ = 표준정규 CDF
환류 필터     rᵢ = exp(−k_reflux × reflux × heavinessᵢ)       # 무거운 축일수록 환류에 잘 걸러짐
구리 필터     sᵢ = (축이 sulfur_meaty면) exp(−k_cu × copperContact) else 1
결과          vᵢ' = vᵢ × wᵢ × rᵢ × sᵢ × 농축계수
수율          yield = Φ((c2 − μ_EtOH)/σ_EtOH) − Φ((c1 − μ_EtOH)/σ_EtOH)
```

| 설비·조작 | 파라미터 영향 `[튜닝]` |
|---|---|
| 증류기 형태 | `reflux`: 스트레이트 0.2 / 양파 0.4 / 랜턴 0.6 / 볼 0.8 |
| 라인암 | 상향 +0.15 / 수평 0 / 하향 −0.15 (reflux) |
| 응축기 | `copperContact`: 구리 셸앤튜브 1.0 / 스테인리스 0.3 / 웜텁 0.4 (+ `body` 보너스) |
| 증류 횟수 | 회차마다 위 필터를 반복 적용 (2회 증류 = 더 가볍고 깨끗) |
| 연속식 | 컷 대신 `rectification`(정류도) → `rᵢ` 계수 크게. 보드카·주정은 거의 모든 축이 0 근처 |
| 감압 증류 | `toasted_grain ×0.3`, `fresh_fruit`·`floral ×1.2` / 상압은 반대 |

**플레이어가 체감하는 트레이드오프**

- c1을 앞당기면 → 수율↑, `solvent`(이취)↑
- c2를 늦추면 → 수율↑, `peat_smoke`·`oily_waxy`·`body`↑, `feinty`(이취)↑
- 피트 위스키 = c2를 늦게 잡아야 하는데 후류취와 싸워야 함 → 마스터 디스틸러 스탯이 정확도를 높임

### 4.4 진 — 재증류와 보태니컬

- 보태니컬마다 축 기여 벡터를 가짐 (예: 주니퍼 → `juniper 60`, `herbal 10` / 유자 → `citrus 50`, `floral 15` / 오미자 → `fresh_fruit 20`, `botanical_spice 15`, `sweetness 5`)
- 투입량 g/L × 기여 벡터 × 추출 방식 계수
  - 침지(steep): 무거운 향 추출↑, `body`↑
  - 증기 바스켓(vapor): 가벼운 향(시트러스·플로럴) 위주, 섬세
- 재증류에도 컷 적용 (헤드에 시트러스 테르펜, 테일에 뿌리류)

### 4.5 숙성 — 3가지 효과

매월 각 캐스크에 대해:

```
속도 기반   m = sizeFactor × tempFactor(T_slot) × slotBonus(숨김)
① 제거     sulfur_meaty, harshness, cereal(날 곡물) ×= (1 − d_sub × charLevelFactor × activity)
② 추출     vanilla_caramel, oak_tannin, wood_spice, color += a_axis(wood, char) × activity × m × (1 − 현재값/상한)
           시즈닝 축(dried_fruit, vinous …) += a_season × seasoningStrength × m × (1 − 현재값/상한)
③ 반응     fresh_fruit·floral(산화 에스테르) += g_int × 1          # 시간 비례, 크기와 무관
           nutty_rancio += g_rancio × max(0, 숙성연수 − 8)           # 장기 숙성에서만 등장
           incense += g_incense × (wood ∈ {mizunara, korean_mongolica}) × max(0, 숙성연수 − 6)
           integration += g_integ × (1 − integration/100)
```

- **소형 캐스크**: ②추출은 빠름(m↑) / ③반응은 시간 비례 → "빨리 진해지지만 깊어지지 않음"
- **탄닌 과추출**: `oak_tannin`이 주종 스키마의 상한을 넘으면 밸런스 감점(over-oaked)
- **활성도 감소**(1필→2필→3필): `activity`만 줄어들고 ③반응은 유지 → 리필 캐스크 장기 숙성 = 섬세한 스타일

### 4.6 블렌딩

```
결과 vᵢ = Σ_k (LPA_k × v_{k,i}) / Σ_k LPA_k             # LPA 가중 평균
지각 마스킹: perceivedᵢ = vᵢ^γ / Σ_j vⱼ^γ × 총강도         # γ > 1 → 강한 축(피트 등)이 다른 축을 가림
매링: integration += marryingMonths × g_marry (상한 있음)
노이즈: 축별 ±1~2 (아주 작게) — 결과의 불확실성은 최소화, 정보 쪽에 불확실성 부여 (§7)
```

### 4.7 병입

| 옵션 | 효과 |
|---|---|
| 가수 | 지각 강도 ×(ABV/원래ABV)^0.5 `[튜닝]` |
| 칠 필터링 | `body −8`, `oily_waxy ×0.8` |
| NCF + ABV < 46% | 혼탁 리스크(클레임 이벤트) |
| 착색 | `color`만 변경. 대중 세그먼트 일관성↑, 매니아 선호↓ |

---

## 5. 주종 스키마 (Category Flavor Schema)

### 5.1 타입

```ts
interface CategoryFlavorSchema {
  categoryId: CategoryId;
  axes: AxisId[];                 // 이 주종에서 평가에 쓰는 축
  radarAxes: AxisId[];            // UI 레이더 6~8개
  typicity: TypicityRule[];       // 전형성(주종다움) 규칙
  styles: StylePreset[];          // 스타일 = 블렌딩 목표·세그먼트 선호의 기준점
  axisCaps?: Partial<Record<AxisId, number>>;   // 과다 시 감점 상한 (예: 탄닌)
  quality: { balance: number; complexity: number; integration: number; offnotePenalty: number };
  purityMode?: boolean;           // 보드카·주정: 향이 '없을수록' 좋음
}

interface TypicityRule {
  kind: 'min' | 'max' | 'dominant' | 'totalIntensityMax';
  axis?: AxisId; value?: number;
  severity: 'label' | 'score';    // label = 위반 시 주종 표기 불가 / score = 전형성 점수만 감점
}

interface StylePreset {
  id: string; nameKo: string;
  target: Partial<Record<AxisId | StructAttr, number>>;
  weights?: Partial<Record<AxisId, number>>;   // 이 스타일에서 특히 중요한 축
}
```

### 5.2 주종별 설계 요약

| 주종 | 레이더 축 (예시) | 전형성 규칙 | 스타일 프리셋 | 특이사항 |
|---|---|---|---|---|
| 몰트 위스키(스카치 등) | 과일, 플로럴, 곡물, 피트, 셰리(건과일), 바닐라, 오크, 무게감 | (향 규칙 없음 — 법규는 공정 기반) | 아일라 피티드 / 스페이사이드 셰리 / 하이랜드 밸런스 / 로랜드 라이트 | 스카치 표기 = 지역·숙성 규정으로 판정 |
| 버번 | 바닐라·캐러멜, 단맛, 오크 스파이스, 과일, 곡물, 탄닌 | `vanilla_caramel ≥ 25` (score) | 트래디셔널 / 하이 라이(스파이시) / 위티드(부드러움) | 새 오크 = 추출 매우 빠름 |
| 코냑 | 포도, 과일, 플로럴, 건과일, 바닐라, 란시오 | `vinous ≥ 20` (score) | VS 프루티 / VSOP 균형 / XO 란시오 | 반응형 숙성 가중↑ (`nutty_rancio` 핵심) |
| 테킬라 | 아가베, 허브·페퍼, 시트러스, 단맛, 바닐라, 오크 | `cooked_agave ≥ 30` (**label**) | 블랑코 / 레포사도 / 아녜호 | 쿠킹 방식이 핵심 변수 |
| 진 | 주니퍼, 시트러스, 플로럴, 허브, 스파이스, 단맛 | `juniper` **dominant** (**label**) | 런던 드라이 / 컨템포러리 / 올드 톰 / 지역 시그니처 | 런던 드라이 = 증류 후 착향·착색 불가 |
| 백주 | 곡향, 열대과일(에스테르), 발효 감칠맛, 흙, 단맛, 여운 | `sorghum_grain ≥ 25` (score) | 장향 / 농향 / 청향 / 미향 | 향형 = 스타일 프리셋. 전형성 = 향형 프리셋과의 거리 |
| 증류식 소주 | 누룩·쌀, 과일, 플로럴, 구수함, 바디, 깔끔함 | `nuruk_rice ≥ 25` (score) | 감압 깔끔형 / 상압 구수형 / 숙성형(옹기·오크) | 감압/상압 선택이 스타일을 가름 |
| 희석식 소주 | 깔끔함, 단맛, 자극(낮을수록 좋음) | `totalIntensityMax 15` (score) | 클래식 / 순한(저도수) | `purityMode` + 감미 |
| 럼 | 사탕수수, 펑키, 과일, 바닐라, 단맛, 오크 | `cane ≥ 20` (score) | 라이트(컬럼) / 헤비 펑키(포트·던더) / 아그리콜(허브) | 열대 숙성 = 빠른 숙성 |
| 보드카 | 깔끔함, 질감, 미세 곡물/감자 | `totalIntensityMax 10` (score) | 클래식 / 질감형 | `purityMode`: 품질 = 이취 0 + 자극↓ + 질감 |
| 주정 | (표시 안 함) | `totalIntensityMax 3`, ABV ≥ 95% (**label**) | — | B2B 원자재 등급만 |

### 5.3 JSON 예시

```json
{
  "categoryId": "gin",
  "axes": ["juniper", "citrus", "floral", "herbal", "botanical_spice", "sweetness", "solvent", "feinty"],
  "radarAxes": ["juniper", "citrus", "floral", "herbal", "botanical_spice", "sweetness"],
  "typicity": [
    { "kind": "dominant", "axis": "juniper", "severity": "label" }
  ],
  "styles": [
    { "id": "london_dry",   "nameKo": "런던 드라이", "target": { "juniper": 70, "citrus": 40, "botanical_spice": 30, "sweetness": 0 } },
    { "id": "contemporary", "nameKo": "컨템포러리", "target": { "juniper": 45, "citrus": 40, "floral": 40, "herbal": 25 } },
    { "id": "old_tom",      "nameKo": "올드 톰",    "target": { "juniper": 50, "citrus": 25, "sweetness": 35 } }
  ],
  "quality": { "balance": 0.4, "complexity": 0.35, "integration": 0.05, "offnotePenalty": 1.5 }
}
```

```json
{
  "categoryId": "baijiu",
  "axes": ["sorghum_grain", "tropical", "fermented_umami", "earthy", "fresh_fruit", "floral", "sweetness", "solvent", "feinty"],
  "radarAxes": ["sorghum_grain", "tropical", "fermented_umami", "earthy", "floral", "sweetness"],
  "typicity": [{ "kind": "min", "axis": "sorghum_grain", "value": 25, "severity": "score" }],
  "styles": [
    { "id": "jiang", "nameKo": "장향", "target": { "fermented_umami": 70, "earthy": 40, "sorghum_grain": 45 } },
    { "id": "nong",  "nameKo": "농향", "target": { "tropical": 70, "sweetness": 40, "sorghum_grain": 40 } },
    { "id": "qing",  "nameKo": "청향", "target": { "floral": 45, "fresh_fruit": 40, "sorghum_grain": 35, "fermented_umami": 5 } },
    { "id": "mi",    "nameKo": "미향", "target": { "floral": 50, "sweetness": 35, "fresh_fruit": 30 } }
  ],
  "quality": { "balance": 0.35, "complexity": 0.35, "integration": 0.15, "offnotePenalty": 1.5 }
}
```

---

## 6. 평가 함수

```
① 품질 Quality (0~100)
   Balance     = 100 − Σ_i over(스타일·상한 대비 과다) × wᵢ
   Complexity  = 정규화 엔트로피(양의 축 지각 강도 분포) × 100     # 상한 있음 — 축을 다 높이는 꼼수 방지
   Integration = integration 속성
   Penalty     = Σ offnote × offnotePenalty + harshness × k
   Quality     = wB·Balance + wC·Complexity + wI·Integration − Penalty
   (purityMode: Quality = 100 − Penalty − totalIntensity × k + body 보정)

② 전형성 Typicity (0~100, 라벨 통과 여부)
   label 규칙 위반 → 주종 표기 불가 (일반 명칭으로 강등, 기준가↓)
   score 규칙     → 미달 정도만큼 감점
   스타일 거리    → 가장 가까운 스타일 프리셋과의 가중 거리 → 스타일 판정

③ 선호 일치 Match(세그먼트 또는 평론가)
   선호 벡터 P와 제품 지각 벡터 V의 가중 코사인 유사도 (주종 axes 공간)

④ 매력도 Appeal = f(Quality, Typicity, Match, 브랜드, 라벨 속성[연수·NCF·CS…])
   → 수요 공식(PRD §9.2)의 '매력도' 항
```

- **평론가 NPC:** 각자 선호 벡터 + 품질 민감도를 가짐 (예: 피트 애호가, 셰리 애호가, 순수주의자) → 평가가 동전 던지기가 아니라 예측 가능한 성향이 됨
- **품평회:** 출품 부문(주종·스타일) 내 상대 평가

---

## 7. 정보 불확실성 연결 (PRD §5.6)

```
표시값 shownᵢ = trueᵢ + N(0, σᵢ)
σᵢ = σ_base(수단) × difficultyᵢ / (1 + skill/50)
```

- `difficultyᵢ`: 미묘한 축일수록 어려움 (예: `floral` 1.3, `peat_smoke` 0.6)
- 이취는 값이 아니라 **감지 확률**: P(detect) = 1 − exp(−offnote × skill × k)
- 한 번 샘플링한 값은 캐스크에 기록되고, 이후 숙성 변화는 **예측치**로 표시(점점 신뢰 구간이 넓어짐)

---

## 8. 새 주종 추가 절차

1. 필요하면 전역 축 추가 (예: 쇼추 → `sweet_potato` 축)
2. `CategoryFlavorSchema` JSON 작성 (축, 레이더, 전형성, 스타일, 평가 가중치)
3. 원재료·발효·설비 효과 데이터 추가
4. 밸런싱 스크립트로 **스타일 도달 가능성 테스트**: 각 스타일 프리셋에 정해진 레시피로 도달 가능한지 자동 검증
5. 엔진 코드 수정 없음 (목표)

---

## 9. 리스크와 반론

| 리스크 | 대응 |
|---|---|
| 축 30개는 플레이어가 이해하기 어렵다 | 화면은 주종별 레이더 6~8축만. 나머지는 상세 패널·툴팁 |
| 공정 효과 수치가 너무 많아 밸런싱이 어렵다 | 효과 데이터를 스프레드시트로 관리, 헤드리스 시뮬로 스타일 도달 가능성·지배 전략 탐지 |
| 실제 화학과 다르다 | 의도된 근사. 대표적 인과(컷 → 무게감, 환류 → 가벼움, 구리 → 유황 제거, 습도 → 도수)만 지킨다 |
| 지배 전략(한 레시피가 모든 세그먼트를 이김) | 세그먼트 선호 벡터를 서로 상충하게 설계(예: 매니아는 피트↑, 대중은 피트↓) |
| 블렌딩이 너무 결정론적이면 쉬워진다 | 난이도는 정보 불확실성과 재고 제약(연수·수량)에서 나오게 한다 |
