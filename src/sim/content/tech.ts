// 테크 노드 데이터 (docs/design/tech-tree.md §4·§5·§7) — 파트 MGT. 노드 스키마는 전체 트리(약 42노드)를 넣을 그릇이다 (skeleton S-6).
// 단계 P (#170): Phase 2 범위(tech-tree §8 — 공통 4계통 + WHI·WHT + ASN 소주 노드) 28개. BRA·TEQ·RUM·ASN 백주는 Phase 3.
// 게이트 키는 tech-tree §1.2가 "테크 뒤로" 옮긴 기능(이미 게임에 있는 것)만 실제로 잠근다 — 나머지 키는 아직 게임에 없는 기능의 자리다.
// 연구 기간·연구비는 tech-tree §2.1 티어 기준(T1 3개월·T2 5개월·T3 9개월)의 자리표시 값이다 [튜닝]. 처음 4개 노드의 값은 그대로 뒀다.

import type { StaffRole } from '../types';

export type TreeId = 'production' | 'maturation' | 'engineering' | 'business' | 'whisky' | 'white' | 'brandy' | 'tequila' | 'rum' | 'asian';

/** 연구 담당자 스탯 — 직군마다 stats a·b·c의 뜻이 다르다(ROLE_INFO.stats). 노드는 그 직군의 어느 칸을 쓰는지만 적는다 */
export type LeadStat = 'a' | 'b' | 'c';

/**
 * 해금 효과 중 게이트가 아닌 것 (tech-tree §7 TechUnlock의 loss_reduction·risk_scale·info) — research.ts 조회 함수로 읽는다.
 * 지금 읽는 곳: risk_scale의 이벤트 피해(events.ts, #184)·보험료(insurance.ts). loss_reduction·info와 batch_variance는 담당 파트(PROD·MKT)가 붙인다.
 * 게이트(선택지·설비·계약·라벨·이벤트 선택지)는 unlockKeys가 isUnlocked 키로 표현한다
 */
export type TechEffect =
  | { kind: 'loss_reduction'; target: string; value: number }
  | { kind: 'risk_scale'; riskId: string; mul: number }
  | { kind: 'info'; target: string; sigmaMul?: number; detectAdd?: number; forecastMonths?: number };

export interface TechNodeDef {
  id: string;
  nameKo: string;
  tree: TreeId;
  /** 비용·기간 등급 (선행 깊이와 꼭 같지 않다) */
  tier: 1 | 2 | 3;
  /** 모두 충족해야 연구 가능 (AND) */
  prereq: string[];
  /** 연구 시작 조건 (tech-tree §7) — 설비 보유·가동 개월. 지역 게이팅(categoryAvailable)은 단계 P */
  requires?: { facilities?: string[]; operatingMonths?: number };
  research: {
    baseMonths: number;
    monthlyCost: number;
    /** 담당할 수 있는 직군 */
    leadRoles: StaffRole[];
    /** 진행 속도에 쓰는 담당자 스탯 칸 */
    leadStat: LeadStat;
    /** 실적 보너스 기준 (최대 +30%) — 지표 계산은 단계 P. 없으면 보너스 없음 */
    milestone?: { metric: string; target: number };
  };
  /** isUnlocked 키 — research.ts 주석의 키 규칙 */
  unlockKeys: string[];
  /** 게이트가 아닌 효과 — research.ts의 조회 함수(lossReductionMul·riskMul·infoBonus)로 읽는다. 읽는 쪽(생산·숙성·이벤트)은 담당 파트가 붙인다 */
  effects?: TechEffect[];
  /** 아직 게임에 없는 해금·효과 (담당 파트 — 내용). 화면이 "효과 준비 중"으로 표시한다. 없으면 해금이 실제로 무언가를 연다 */
  pending?: string;
}

/** 연구 요건에 쓰는 설비 중 아직 카탈로그에 없는 것 — 화면·거절 문구용 이름 (생기면 카탈로그 이름을 쓴다) */
export const TECH_FACILITY_NAMES: Record<string, string> = {
  lab: '실험실',
  marrying_vat: '매링 뱃',
  malting_floor: '몰팅 플로어·킬른',
};

/** 테크 게이트 켜짐 (#174) — 노드가 해금하는 키는 연구 전까지 닫힌다. 지금 실제로 판정하는 키는 행동 키(`action:`)뿐이라 잠기는 기존 기능은
 *  로테이션(MAT-3a)·캐스크 오너십(BIZ-1b) 둘이다(tech-tree §1.2). false로 두면 모든 키가 열린다 */
export const TECH_GATING = true;

/** ENG-3 매크로 이벤트 조기 경보 (#189) — 조짐 감지 확률 = min(maxDetect, baseDetect + 사무직 행정 스탯 / statDivisor) [튜닝].
 *  상한 90%: 감지율 100%면 거의 완벽한 예지(실측 정밀도 0.91~0.96·재현율 1.00)라 P2(정보에도 불확실성)를 위해 놓치는 몫을 남긴다 */
export const MACRO_WARNING = { baseDetect: 0.6, statDivisor: 333, maxDetect: 0.9 };

const T1 = { baseMonths: 3, monthlyCost: 4_000_000 };
const T2 = { baseMonths: 5, monthlyCost: 6_000_000 };
const T3 = { baseMonths: 9, monthlyCost: 10_000_000 };

export const TECH_NODES: TechNodeDef[] = [
  // ── 생산·발효 (PRO, tech-tree §4.1) — 담당: 마스터 디스틸러(공정) ──
  { id: 'PRO-1', nameKo: '발효 공정 관리', tree: 'production', tier: 1, prereq: [], research: { ...T1, leadRoles: ['distiller'], leadStat: 'b' },
    unlockKeys: ['recipe:ferment.profile=staged', 'info:ferment_log'],
    effects: [{ kind: 'loss_reduction', target: 'ferment', value: 0.15 }, { kind: 'risk_scale', riskId: 'acetic', mul: 0.7 }, { kind: 'risk_scale', riskId: 'batch_variance', mul: 0.7 }],
    pending: 'PROD — 단계별 발효 온도 프로파일·발효 로그, 발효 손실·편차 (발효 오염 이벤트의 이취 ×0.7은 적용됨)' },
  { id: 'PRO-2', nameKo: '하우스 효모 뱅크', tree: 'production', tier: 2, prereq: ['PRO-1'], requires: { facilities: ['lab'] }, research: { ...T2, leadRoles: ['distiller'], leadStat: 'a' },
    unlockKeys: ['recipe:yeast=house_strain', 'label:house_yeast'],
    pending: 'PROD — 실험실 설비·균주 분리·보존 / MKT — 라벨 "자사 효모"' },
  { id: 'PRO-3', nameKo: '장인 전수 체계', tree: 'production', tier: 3, prereq: ['PRO-1'], requires: { operatingMonths: 36 }, research: { ...T3, leadRoles: ['distiller'], leadStat: 'c' },
    unlockKeys: ['event:artisan_retire=transfer', 'facility:visitor_tour_heritage'],
    pending: 'MKT — 전통 공정 견학 코스. 전통 공정 노드(WHI-2 플로어 몰팅·ASN-3c)의 선행 조건 (장인 은퇴 전수 선택지는 적용됨 — 은퇴 12개월 전)' },

  // ── 숙성·캐스크 (MAT, §4.2) — 담당: 숙성고 매니저 ──
  { id: 'MAT-1', nameKo: '캐스크 이력 DB', tree: 'maturation', tier: 1, prereq: [], research: { baseMonths: 3, monthlyCost: 3_000_000, leadRoles: ['warehouse'], leadStat: 'a' }, unlockKeys: ['info:cask_history'],
    effects: [{ kind: 'info', target: 'cask_fault', detectAdd: 0.15 }, { kind: 'info', target: 'sample_drift', sigmaMul: 0.7 }],
    pending: 'PROD — 누수·오염 감지 +15%p, 샘플 예측 오차가 넓어지는 속도 −30%, 캐스크 순환 위임' },
  { id: 'MAT-2', nameKo: 'STR 재생', tree: 'maturation', tier: 2, prereq: ['MAT-1'], research: { ...T2, leadRoles: ['warehouse'], leadStat: 'b' },
    unlockKeys: ['recipe:cask.treatment=str'],
    pending: 'PROD — STR 처리(깎기·토스트·재탄화, activity 0.85, 캐스크당 1회)' },
  { id: 'MAT-3a', nameKo: '미세기후 활용', tree: 'maturation', tier: 3, prereq: ['MAT-1'], research: { baseMonths: 6, monthlyCost: 8_000_000, leadRoles: ['warehouse'], leadStat: 'b' }, unlockKeys: ['action:rotateWarehouse'],
    pending: '로테이션은 게임에 있다(게이트 켜면 잠김). PROD — 재고 감사, 숙성고 신축 설계' },
  { id: 'MAT-3b', nameKo: '신소재 목재 실증', tree: 'maturation', tier: 3, prereq: ['MAT-1'], requires: { facilities: ['lab'] }, research: { baseMonths: 24, monthlyCost: 2_000_000, leadRoles: ['warehouse'], leadStat: 'a' },
    unlockKeys: ['info:wood_trial', 'label:novel_oak'],
    pending: 'PROD — 실험 캐스크 프로그램(진행도 = 실험 캐스크 숙성 개월, tech-tree §7 maturation_trial) / MKT — 라벨 "○○ 오크"' },
  { id: 'MAT-3c', nameKo: '솔레라 매링', tree: 'maturation', tier: 3, prereq: ['MAT-1'], requires: { facilities: ['marrying_vat'] }, research: { ...T3, leadRoles: ['warehouse'], leadStat: 'c' },
    unlockKeys: ['recipe:marry=solera'],
    pending: 'PROD — 매링 뱃·솔레라 뱃(일부만 비우고 보충)' },

  // ── 설비·ESG (ENG, §4.3) — 건설 해금형. 담당: 마스터 디스틸러(공정) ──
  { id: 'ENG-1', nameKo: '에너지 효율 설계', tree: 'engineering', tier: 1, prereq: [], research: { ...T1, leadRoles: ['distiller'], leadStat: 'b' },
    unlockKeys: ['facility:heat_exchanger', 'facility:mvr_boiler'],
    pending: 'PROD — 열교환기·고효율 보일러 설비(완공 시 에너지비 −15%)' },
  { id: 'ENG-2a', nameKo: '순환 시스템 설계', tree: 'engineering', tier: 2, prereq: ['ENG-1'], research: { ...T2, leadRoles: ['distiller'], leadStat: 'b' },
    unlockKeys: ['facility:biogas', 'facility:effluent_treatment'],
    pending: 'PROD — 바이오가스·폐액 정화 설비 / MGT — 가동 중 폐액 규제 이벤트 면제 (폐액 정화 설비가 생길 때 규제 이벤트와 함께 넣는다, #214)' },
  { id: 'ENG-2b', nameKo: '방재 엔지니어링', tree: 'engineering', tier: 2, prereq: ['ENG-1'], research: { ...T2, leadRoles: ['distiller', 'warehouse'], leadStat: 'b' },
    unlockKeys: ['facility:fire_suppression'],
    // 보험료 −15% (#171, PRD §8.4) — 가입할 때 보험료에 적용 [튜닝]
    // 보험료 −15% (#171) · 숙성고 화재 피해 ×0.6 (#184 — 복구비·소실 캐스크 비율) [튜닝]
    effects: [{ kind: 'risk_scale', riskId: 'premium:property', mul: 0.85 }, { kind: 'risk_scale', riskId: 'premium:inventory', mul: 0.85 }, { kind: 'risk_scale', riskId: 'event:warehouse_fire', mul: 0.6 }],
    pending: 'PROD — 상위 방재 설비 (보험료 −15%·숙성고 화재 피해 ×0.6은 적용됨)' },
  { id: 'ENG-2c', nameKo: '공정 자동화 제어', tree: 'engineering', tier: 2, prereq: ['ENG-1'], research: { ...T2, leadRoles: ['distiller'], leadStat: 'b' },
    unlockKeys: ['facility:process_control'],
    pending: 'PROD — 자동화 제어 시스템(운전 실수↓, 상시 지시 품질 하한↑)' },
  { id: 'ENG-3', nameKo: '공급망 예측', tree: 'engineering', tier: 3, prereq: ['ENG-2c'], research: { ...T3, leadRoles: ['office'], leadStat: 'c' },
    unlockKeys: ['info:price_forecast'],
    effects: [{ kind: 'info', target: 'ingredient_price', forecastMonths: 3 }, { kind: 'info', target: 'macro_event', forecastMonths: 3 }] },

  // ── 경영·브랜드 (BIZ, §4.4) — 담당: 사무·영업 ──
  { id: 'BIZ-1a', nameKo: '정기 납품 계약', tree: 'business', tier: 1, prereq: [], research: { ...T1, leadRoles: ['sales'], leadStat: 'b' },
    unlockKeys: ['contract:standing_retail'],
    pending: 'MKT — 리쿼샵·바틀샵·바 6~12개월 고정 물량·고정가 계약' },
  { id: 'BIZ-1b', nameKo: '캐스크 오너십', tree: 'business', tier: 1, prereq: [], research: { baseMonths: 3, monthlyCost: 4_000_000, leadRoles: ['office', 'sales'], leadStat: 'b' }, unlockKeys: ['action:sellCaskOwnership'] },
  { id: 'BIZ-2a', nameKo: '원액 감정 프로토콜', tree: 'business', tier: 2, prereq: [], requires: { facilities: ['lab'] }, research: { ...T2, leadRoles: ['blender', 'office'], leadStat: 'c' },
    unlockKeys: ['info:bulk_appraisal', 'contract:guaranteed_purchase'],
    effects: [{ kind: 'info', target: 'bulk_fraud', detectAdd: 0.25 }],
    pending: 'MKT — 매입 원액 위조 감지 +25%p(상한 95%)·브로커 신용 이력·보증 조건부 매입' },
  { id: 'BIZ-2b', nameKo: '재무 리스크 관리', tree: 'business', tier: 2, prereq: ['BIZ-1a'], research: { ...T2, leadRoles: ['office'], leadStat: 'a' },
    // 신용보험·팩토링은 적용됨(#214). 선물환·금리 스왑은 막을 위험(환율 변동·변동금리)이 게임에 없어 해금 목록에서 뺐다
    unlockKeys: ['contract:credit_insurance', 'contract:factoring'],
    pending: 'MGT — 선물환·금리 스왑 (환율 변동·변동금리가 게임에 생기면)' },
  { id: 'BIZ-3', nameKo: '글로벌 앰버서더 프로그램', tree: 'business', tier: 3, prereq: ['BIZ-1a'], research: { ...T3, leadRoles: ['sales'], leadStat: 'a' },
    unlockKeys: ['contract:ambassador', 'event:influencer_backlash=ambassador'],
    effects: [{ kind: 'risk_scale', riskId: 'influencer_backlash', mul: 0.5 }],
    pending: 'MKT — 면세·하이엔드 입점·브랜드 지정 (인플루언서 반동 폭 −50%·바이럴 뒤 앰버서더 대응 선택지는 적용됨)' },

  // ── 위스키 (WHI, §5.1) ──
  { id: 'WHI-1', nameKo: '곡물 과학', tree: 'whisky', tier: 1, prereq: [], research: { ...T1, leadRoles: ['distiller'], leadStat: 'b' },
    unlockKeys: ['recipe:grain=heritage_barley', 'label:heritage_barley'],
    effects: [{ kind: 'loss_reduction', target: 'grain_conversion', value: 0.2 }],
    pending: 'PROD — 헤리티지 보리 품종·곡물 전환 손실 감소 / MKT — 라벨 "헤리티지 보리"' },
  { id: 'WHI-2', nameKo: '자가 몰팅·피팅', tree: 'whisky', tier: 2, prereq: ['WHI-1'], requires: { facilities: ['malting_floor'] }, research: { ...T2, leadRoles: ['distiller'], leadStat: 'b' },
    unlockKeys: ['recipe:malt.ppm=continuous', 'recipe:malt.floor=on', 'label:floor_malted'],
    pending: 'PROD — ppm 연속 조절·피트 산지, PRO-3 보유 시 플로어 몰팅 / MKT — 라벨' },
  { id: 'WHI-3', nameKo: '장인급 우드 피니시', tree: 'whisky', tier: 3, prereq: ['WHI-1', 'MAT-2'], research: { baseMonths: 9, monthlyCost: 10_000_000, leadRoles: ['distiller'], leadStat: 'b' }, unlockKeys: ['recipe:finish=exotic', 'recipe:finish=multiple'],
    pending: 'PROD — 이국 시즈닝·더블/트리플 피니시(기본 피니싱 #158은 버번·셰리 1회)' },

  // ── 화이트 스피릿 (WHT, §5.2) ──
  { id: 'WHT-1', nameKo: '정류 운전 최적화', tree: 'white', tier: 1, prereq: [], research: { ...T1, leadRoles: ['distiller'], leadStat: 'b' },
    unlockKeys: ['label:grain_to_glass'],
    effects: [{ kind: 'loss_reduction', target: 'redistill', value: 0.2 }],
    pending: 'PROD — 재정류 회수 손실↓·컬럼 처리량 +15% / MKT — 라벨 Grain-to-Glass' },
  { id: 'WHT-2', nameKo: '정밀 보태니컬 증류', tree: 'white', tier: 2, prereq: ['WHT-1'], research: { ...T2, leadRoles: ['distiller'], leadStat: 'a' },
    unlockKeys: ['recipe:gin.method=split_distill', 'facility:vacuum_gin_still', 'label:local_botanical'],
    pending: 'PROD — 분리 증류·감압 진 스틸·지역 보태니컬' },
  { id: 'WHT-3', nameKo: '보드카 질감 설계', tree: 'white', tier: 3, prereq: ['WHT-1'], research: { ...T3, leadRoles: ['distiller'], leadStat: 'a' },
    unlockKeys: ['recipe:filter.medium', 'label:premium_filtration'],
    pending: 'PROD — 여과 매체·강도(보드카 주종이 아직 없다)' },

  // ── 아시안 스피릿 — 소주 노드 (ASN, §5.6, PRD #56) ──
  { id: 'ASN-1', nameKo: '발효제 미생물 최적화', tree: 'asian', tier: 1, prereq: [], research: { ...T1, leadRoles: ['distiller'], leadStat: 'b' },
    unlockKeys: ['recipe:soju.koji=selectable'],
    effects: [{ kind: 'loss_reduction', target: 'saccharification', value: 0.2 }, { kind: 'risk_scale', riskId: 'mash_spoilage', mul: 0.3 }],
    pending: 'PROD — 입국 균종 선택·당화 손실 감소 (발효 오염 이벤트의 소주 이취 ×0.3은 적용됨)' },
  { id: 'ASN-2', nameKo: '고체·반고체 발효 제어', tree: 'asian', tier: 2, prereq: ['ASN-1'], research: { ...T2, leadRoles: ['distiller'], leadStat: 'b' },
    unlockKeys: ['recipe:soju.deotsul=2|3', 'label:samyangju'],
    pending: 'PROD — 이양주·삼양주 덧술 / MKT — 라벨 "삼양주 원주"' },
  // #169 A(오너 승인 2026-11-07): 옹기 항아리와 라벨 "옹기 N년 숙성"은 기본(#161). ASN-3a는 옹기 등급(통기성) 선택만 연다
  { id: 'ASN-3a', nameKo: '옹기·도자 숙성', tree: 'asian', tier: 3, prereq: ['ASN-1', 'MAT-1'], research: { ...T3, leadRoles: ['distiller', 'warehouse'], leadStat: 'b' },
    unlockKeys: ['recipe:onggi.grade'],
    pending: 'PROD — 옹기 등급(소성 온도·유약 → 통기성: 빠른 제거·높은 증발 ↔ 느린 제거·낮은 증발)' },
  { id: 'ASN-3c', nameKo: '전통 누룩 디디기', tree: 'asian', tier: 3, prereq: ['ASN-1', 'PRO-3'], research: { ...T3, leadRoles: ['distiller'], leadStat: 'c' },
    unlockKeys: ['recipe:nuruk=house', 'label:traditional_nuruk'],
    pending: 'PROD — 자가 누룩(고유 미생물 프로필) / MKT — 라벨 "전통 누룩"' },
];

export const TECH_BY_ID: Record<string, TechNodeDef> = Object.fromEntries(TECH_NODES.map((n) => [n.id, n]));

/** ENG-3 공급망 예측 (#188) — 예측 오차. 90% 범위 = 중심 × exp(±z90 × σ_k), σ_k = baseSigma × √k × (1 − 사무직 행정 스탯 / statDivisor) [튜닝] */
export const PRICE_FORECAST = { baseSigma: 0.05, statDivisor: 200, z90: 1.645 };
