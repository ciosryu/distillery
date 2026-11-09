import type { RegionId, StaffRole } from '../types';
import type { EquipmentDef } from './production';

// 경영 콘텐츠 (파트 MGT, 결정 #144) — 대출 상품·직원 직군·이름 풀·방재 설비. 모든 수치 [튜닝]

// ── 대출 상품 ──
export interface LoanOfferDef { id: string; nameKo: string; annualRate: number; termMonths: number; max: number; requires?: 'producedSoju'; /** 원금 거치 기간(이자만 납부) */ graceMonths: number; /** 이 지역에서만 신청 가능 */ regions?: RegionId[]; note?: string; /** 숙성 재고 담보 — 담보 인정 비율이 있는 입지에서만, 한도 = 재고 시가 × 비율 (결정 #90) */ collateral?: 'inventory'; /** 고금리 급전 (#133) — 화면이 '마지막 수단'으로 표시한다. 규칙은 다른 상품과 같다 */ emergency?: boolean }

export const LOAN_OFFERS: LoanOfferDef[] = [
  { id: 'facility', nameKo: '시설자금 대출', annualRate: 0.05, termMonths: 120, max: 1_000_000_000, graceMonths: 24 },
  { id: 'working', nameKo: '운전자금 대출', annualRate: 0.075, termMonths: 36, max: 300_000_000, graceMonths: 0 },
  { id: 'policy', nameKo: '전통주 육성 정책자금', annualRate: 0.025, termMonths: 60, max: 200_000_000, requires: 'producedSoju', graceMonths: 12 },
  // 한국 완화책(#73) — 고난도 지역은 유지하되 정책 융자로 버틸 길을 준다. 금리·조건은 게임 단순화 [확인 필요]
  { id: 'kr_regional', nameKo: 'K-위스키 지역 특화 산업 육성자금 (지자체)', annualRate: 0.02, termMonths: 96, max: 300_000_000, graceMonths: 24, regions: ['KR'], note: '경북 등 지자체의 K-위스키 산업 육성 기조를 단순화' },
  { id: 'kr_startup', nameKo: '창업기반지원자금 (중소벤처기업진흥공단)', annualRate: 0.025, termMonths: 72, max: 200_000_000, graceMonths: 18, regions: ['KR'], note: '창업 7년 이내 중소기업 정책 융자를 단순화' },
  // 재고 담보대출 (결정 #90, 홋카이도) — 숙성 원액 시가를 담보로. 시가가 떨어지면 추가 상환 요구 [튜닝]
  // 고금리 급전 (#133, MVP) — 은행 상품을 다 쓴 뒤 현금 공백을 메우는 마지막 수단. 금리는 한국 법정 최고금리(연 20%, 2021-07~) 수준, 기간·한도는 [튜닝].
  // 다른 상품과 같은 규칙(상품당 1건, 조기 상환 가능)이다. 은행 심사(적자·현금 부족이면 거절)는 단계 T 확인 항목(#210, mvp.md §7.11) — 생기면 급전만 남는 순간이 실제로 온다
  { id: 'emergency', nameKo: '고금리 급전 (대부업)', annualRate: 0.2, termMonths: 12, max: 100_000_000, graceMonths: 0, emergency: true, note: '심사 없이 바로 — 연 20%, 12개월 원리금 균등' },
  { id: 'inventory', nameKo: '숙성 재고 담보대출', annualRate: 0.06, termMonths: 60, max: 2_000_000_000, graceMonths: 12, collateral: 'inventory', note: '담보 인정 비율이 있는 입지(홋카이도)에서만' },
];

// ── 원재료 선도계약 (#179, PRD §8.4 "원재료 가격" 줄). 수치 [튜닝] ──
// 차액 정산형: 고정 가격 지수로 매달 kg만큼을 계약하고, 매달 (시장 지수 − 고정 지수) × 기준가 × 물류 배수 × kg를 주고받는다.
// 시세가 오르면 받고 내리면 낸다 → 실제로 사는 원료 원가와 합치면 원가가 고정된다(생산 원가 계산은 그대로 — PROD 파일을 건드리지 않는다).
// 계약량은 지금 생산 지시가 쓰는 월 사용량까지(투기 방지 — 가격 지수는 1로 되돌아가는 성질이 있어 상한 없이는 쉬운 돈이 된다). 중도 해지 없음
export const FORWARD = {
  /** 고정 가격 = 지금 시장 지수 × (1 + spread) — 거래 상대의 마진 */
  spread: 0.03,
  minMonths: 6,
  maxMonths: 24,
  /** 계약 가능 kg = 지금 생산 지시의 월 사용량 × 이 배수 (같은 원료의 기존 계약량을 뺀다) */
  usageCap: 1.0,
  minKgPerMonth: 100,
};

// ── 보험 (#171, PRD §8.4 "화재·홍수" 줄 — 재산·재고·영업중단). 수치 [튜닝] ──
// 보장 대상은 재해(category 'disaster') 이벤트의 피해만: 복구비(현금) · 캐스크 소실·원액 손실 · 생산 중단 개월.
// 곰팡이·오염·폭염(증발)은 보상하지 않는다. 가입한 다음 달부터 보장한다(재해 직전 가입 방지).
// 제조물 책임은 대응하는 사고 이벤트가 아직 없다. 매출채권 신용보험은 고급 상품 — 테크 BIZ-2b(#49) 연구 뒤에만 판다(#214)
export interface InsuranceProductDef {
  kind: 'property' | 'inventory' | 'business_interruption' | 'credit';
  nameKo: string;
  /** 연 보험료율 — value: 보험가입금액 대비 / monthly: 월 보상 한도 대비 */
  annualRate: number;
  /** value = 보험가입금액이 보험가액(설비 취득가·재고 원가)보다 적으면 비례 보상(일부보험) / monthly = 생산이 멈춘 달마다 월 보상 한도까지 /
   *  receivable = 거래처 부도로 못 받은 대금을 가입금액까지 (CREDIT_INSURANCE.share만큼) — 화면의 기준 금액은 지금 미수금 */
  basis: 'value' | 'monthly' | 'receivable';
  /** 연구 해금 키 — 열리기 전에는 가입할 수 없다 (research.ts isUnlocked) */
  unlockKey?: string;
  minCoverage: number;
  maxCoverage: number;
  note: string;
}

export const INSURANCE_PRODUCTS: InsuranceProductDef[] = [
  { kind: 'property', nameKo: '재산 종합보험 (건물·설비)', annualRate: 0.016, basis: 'value', minCoverage: 10_000_000, maxCoverage: 10_000_000_000, note: '재해 복구비를 보상한다. 보험가입금액이 설비 취득가보다 적으면 그 비율만큼만' },
  { kind: 'inventory', nameKo: '재고 보험 (숙성 원액)', annualRate: 0.022, basis: 'value', minCoverage: 10_000_000, maxCoverage: 20_000_000_000, note: '화재·붕괴·침수로 잃은 숙성 원액을 원가로 보상한다. 곰팡이·오염은 제외. 가입금액이 재고 원가보다 적으면 비례 보상' },
  { kind: 'business_interruption', nameKo: '영업중단 보험', annualRate: 0.6, basis: 'monthly', minCoverage: 10_000_000, maxCoverage: 1_000_000_000, note: '재해로 생산이 멈춘 달의 고정비를 월 보상 한도까지 보상한다' },
  // 매출채권 신용보험 (BIZ-2b, #214) [튜닝]
  { kind: 'credit', nameKo: '매출채권 신용보험', annualRate: 0.02, basis: 'receivable', minCoverage: 10_000_000, maxCoverage: 1_000_000_000, unlockKey: 'contract:credit_insurance', note: '거래처(블렌더) 부도로 못 받은 대금의 90%를 가입금액까지 보상한다. 가입한 다음 달부터' },
];

/** 매출채권 신용보험: 못 받은 대금 중 보상 비율 [튜닝] */
export const CREDIT_INSURANCE = { share: 0.9 };
/** 팩토링 (BIZ-2b, #214): 미수금을 지금 현금으로 — 수수료 = 만기까지 남은 개월 × feePerMonth, 최소 minFee [튜닝] */
export const FACTORING = { feePerMonth: 0.015, minFee: 0.01 };

// ── 직원 ──
export const ROLE_INFO: Record<StaffRole, { nameKo: string; stats: [string, string, string]; baseSalary: number }> = {
  office: { nameKo: '사무(백오피스)', stats: ['세무', '협상', '행정'], baseSalary: 3_200_000 },
  distiller: { nameKo: '마스터 디스틸러', stats: ['후각', '공정', '직관'], baseSalary: 4_500_000 },
  warehouse: { nameKo: '숙성고 매니저', stats: ['관찰', '환경통제', '성실'], baseSalary: 3_500_000 },
  sales: { nameKo: '영업', stats: ['친화', '네트워크', '협상'], baseSalary: 3_800_000 },
  /** 마스터 블렌더 (결정 #123) — 후각: 원액을 읽는 정확도, 미각: 블렌드 예측(띠 폭), 감정력: 레어 캐스크 발견 [튜닝] */
  blender: { nameKo: '마스터 블렌더', stats: ['후각', '미각', '감정력'], baseSalary: 4_200_000 },
};

export const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황'];
export const GIVEN_NAMES = ['민준', '서연', '도윤', '지우', '하준', '서윤', '은우', '하은', '지호', '수아', '현우', '지민', '예준', '채원', '건우', '다은', '우진', '소율', '선우', '윤서'];

/** 방재 설비·농업경영체 등록 (EQUIPMENT 항목) */
export const FACILITY_EQUIPMENT: Record<string, EquipmentDef> = {
  // ── 방재 설비 ──
  facility_storm: { id: 'facility_storm', kind: 'facility', nameKo: '태풍·침수 방재 (방수문·배수 펌프)', cost: 60_000_000, leadMonths: 2, maintenance: 200_000, defends: ['typhoon', 'flood'], note: '태풍·집중호우 피해를 막는다' },
  facility_snow: { id: 'facility_snow', kind: 'facility', nameKo: '내설 지붕 보강', cost: 40_000_000, leadMonths: 2, maintenance: 100_000, defends: ['snowstorm'], note: '폭설로 지붕이 무너지는 것을 막는다' },
  facility_heating: { id: 'facility_heating', kind: 'facility', nameKo: '동파 방지·보온 설비', cost: 35_000_000, leadMonths: 1, maintenance: 300_000, defends: ['cold_wave'], note: '한파로 배관이 얼어 생산이 멈추는 것을 막는다' },
  facility_dehumid: { id: 'facility_dehumid', kind: 'facility', nameKo: '제습·환기 설비', cost: 45_000_000, leadMonths: 1, maintenance: 400_000, defends: ['mold_outbreak'], note: '곰팡이 증식을 막고 평소 캐스크 오염 확률을 절반으로' },
  kr_farm_registration: { id: 'kr_farm_registration', kind: 'facility', nameKo: '농업경영체 등록·원료 계약재배 (전통주 요건)', cost: 50_000_000, leadMonths: 6, maintenance: 1_000_000, defends: [], note: '지역특산주 자격 — 국산 원료 70%↑ 제품이 전통주 주세 경감 대상', regions: ['KR'] },
  facility_seismic: { id: 'facility_seismic', kind: 'facility', nameKo: '내진 랙 보강', cost: 80_000_000, leadMonths: 3, maintenance: 200_000, defends: ['earthquake'], note: '지진에 랙이 무너지는 것을 막는다' },
};

// ── 투자 상품 (옛 ops.ts) ──
export interface InvestmentOffer { id: string; nameKo: string; amount: number; share: number; minMonth: number; maxMonth: number; note: string }
export const INVESTMENT_OFFERS: InvestmentOffer[] = [
  { id: 'angel', nameKo: '엔젤 투자', amount: 200_000_000, share: 0.1, minMonth: 0, maxMonth: 48, note: '초기 런웨이용. 지분 10%' },
  { id: 'seed_vc', nameKo: '시드 투자 (VC)', amount: 500_000_000, share: 0.25, minMonth: 12, maxMonth: 84, note: '지분 25%. 엑시트 압박은 후속(이사회 §8.2)' },
];

// ── 이사회 (#180, PRD §8.2 "이사회 시스템") — 외부 지분 25%↑면 분기 목표, 50%↑면 신뢰가 바닥나면 해임. 수치 [튜닝] ──
export const BOARD = {
  /** 이사회가 생기는 외부 지분 */
  formShare: 0.25,
  /** 해임 권한이 생기는 외부 지분 (지금 투자 상품으로는 최대 32.5% — 해임은 아직 일어날 수 없다) */
  dismissShare: 0.5,
  startConfidence: 60,
  metGain: 10,
  missLoss: 15,
  /** 분기 목표: 매출이 있으면 직전 분기 매출 × 이 배수 이상 */
  revenueGrowth: 1.05,
  /** 분기 목표: 매출이 없으면(Death Valley) 분기 말 현금 ≥ 월 고정비 예상 × 이 개월 수 */
  cashBufferMonths: 3,
};
