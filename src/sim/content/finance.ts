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
  // 다른 상품과 같은 규칙(상품당 1건, 조기 상환 가능)이다. 은행 심사(아래 BANK_SCREENING, P-MGT-2 초안)가 은행 상품을 거절해도 급전은 심사 없이 받는다 — 그래야 급전만 남는 순간이 실제로 온다
  { id: 'emergency', nameKo: '고금리 급전 (대부업)', annualRate: 0.2, termMonths: 12, max: 100_000_000, graceMonths: 0, emergency: true, note: '심사 없이 바로 — 연 20%, 12개월 원리금 균등' },
  { id: 'inventory', nameKo: '숙성 재고 담보대출', annualRate: 0.06, termMonths: 60, max: 2_000_000_000, graceMonths: 12, collateral: 'inventory', note: '담보 인정 비율이 있는 입지(홋카이도)에서만' },
];

/**
 * 은행 심사 (P-MGT-2, #160에서 넘김 — 초안). 대상: 급전·재고 담보대출을 뺀 은행·정책 상품.
 * 창업 유예 기간에는 사업 계획으로 통과한다(시작 대출·첫 위스키 전 공백). 그 뒤로는 최근 영업현금흐름(적자)과 현금(고정비 몇 달분)을 본다.
 * mode 'and' = 적자이면서 현금도 부족할 때만 거절 / 'or' = 둘 중 하나만 걸려도 거절. 수치 전부 [튜닝]
 */
export const BANK_SCREENING = {
  enabled: true,
  mode: 'and' as 'and' | 'or',
  /** 창업 뒤 이 개월 수까지는 심사 없이 통과 (시설자금·지역 육성자금 거치 24개월과 맞춤) */
  startupMonths: 24,
  /** 적자 판단 — 최근 몇 달 영업현금흐름(월 리포트 operatingCash) 합계가 0 미만이면 적자 */
  lookbackMonths: 6,
  /** 현금 부족 판단 — 현금 < 월 고정비 예상 × 이 개월 수 */
  cashFloorMonths: 3,
};

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
