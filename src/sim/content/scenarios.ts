import type { RegionId, SpiritKind, StaffRole } from '../types';

// 시나리오 정의 (skeleton S-8, PRD §12.2) — 지역·입지·주종·잠금 키·경제 값·규모 티어를 데이터로 둔다.
// 새 게임은 이 정의를 GameState.scenario에 **복사**한다(세이브가 스스로를 설명한다 — 콘텐츠가 바뀌어도 진행 중인 판의 규칙은 그대로).
// 잠금 키는 테크 게이트(isUnlocked)와 같은 규칙: 'action:<Action.type>' · 'facility:<catalogId>' + 시나리오 전용 'system:<틱 시스템>' · 'kind:<주종>'.
// 끈 시스템의 코드는 지우지 않는다 — 키만 잠근다.

/** 틱 안에서 켜고 끄는 시스템 (step.ts가 'system:<이름>' 키로 판정) */
export type ScenarioSystem = 'events' | 'exports' | 'contracts' | 'broker' | 'caskBids' | 'siteDeals' | 'commissions' | 'hr' | 'research';

export interface ScenarioTierDef {
  id: 'micro' | 'standard' | 'commercial';
  nameKo: string;
  tagline: string;
  /** 있으면 고를 수 없다 (자물쇠 + 툴팁) */
  locked?: { reason: string };
  /** 시작 자기자본 — 순자산 목표의 기준 (#141) */
  equity: number;
  /** 월 관리비 (지역 기본값 대신. 입지 관리비 배수는 그대로 곱한다) */
  overheadPerMonth: number;
  /** 시작 숙성고 기본 용량 (통) — #137 공간 압박 */
  warehouseBase: number;
  /** 창업 디스틸러 외에 처음부터 있는 직원 (MVP는 HR이 꺼져 있어 고정 인력이다) */
  staff: { role: StaffRole; stats: { a: number; b: number; c: number }; ageAtHire: number }[];
  /** 시작 때 미리 당겨 받을 수 있는 기존 대출 상품과 그 합계 상한 (#141). 금리가 낮은 상품부터 채운다 */
  funding: { offers: string[]; max: number };
}

export interface ScenarioDef {
  id: string;
  nameKo: string;
  region: RegionId;
  site?: string;
  /** 생산할 수 있는 주종 — 나머지는 'kind:<주종>'으로 잠긴다 */
  kinds: SpiritKind[];
  /** 잠그는 키 (주종 키는 kinds에서 자동으로 더한다) */
  locked: string[];
  goal: {
    /** 목표 기간 (개월) */
    months: number;
    /** 순자산 목표 = 시작 자기자본 × 이 배수 (#141) */
    netWorthMultiple: number;
    /** 플래그십 최소 숙성 (개월) */
    flagshipMinMonths: number;
  };
  tiers: ScenarioTierDef[];
  defaultTier: ScenarioTierDef['id'];
  /** 판이 진행되면 차례로 여는 기능 (#215, 4차 MVP 플레이테스트: 중반 이후 쉽고 지루하다) */
  stages?: ScenarioStage[];
  /** 중반 목표 — 기한 안에 이루면 보상 (#216) */
  midGoals?: MidGoalDef[];
}

/** 단계 해금 — 그 달이 되면 잠금 키를 푼다. 진행 중인 판에도 적용된다(정의는 콘텐츠에서 읽는다) */
export interface ScenarioStage {
  id: string;
  /** 이 달(경과 개월)부터 */
  month: number;
  /** 풀 잠금 키 */
  unlock: string[];
  title: string;
  /** 열릴 때 안내 */
  text: string;
}

/** 중반 목표 — 판정은 progress.ts의 midGoalMet(id)가 한다 */
export interface MidGoalDef {
  id: 'aged3_sold' | 'commission_done' | 'export_open' | 'revenue_8';
  /** 이 달(경과 개월) 말까지 */
  byMonth: number;
  title: string;
  /** 보상 — 하우스 브랜드 인지도 +(0~1) */
  rewardAwareness: number;
}

const ALL_KINDS: SpiritKind[] = ['soju', 'gin', 'malt', 'grain', 'baijiu'];

/** 창업 영업 직원 — HR이 꺼진 MVP에서도 유통 커버리지(market.coverage)를 만든다. 스탯 [튜닝] */
const FOUNDING_SALES = { role: 'sales' as const, stats: { a: 55, b: 60, c: 50 }, ageAtHire: 35 };

/** MVP — 한국 경기, 증류식 소주 + 싱글 몰트 (결정 #129~#138, #139~3) */
export const MVP_KR: ScenarioDef = {
  id: 'mvp_kr',
  nameKo: 'MVP — 한국 경기, 소주와 싱글 몰트',
  region: 'KR',
  kinds: ['soju', 'malt'],
  locked: [
    // 틱 시스템 (mvp.md §2 OUT)
    'system:events', 'system:exports', 'system:contracts', 'system:broker', 'system:caskBids', 'system:siteDeals', 'system:commissions', 'system:hr', 'system:research',
    // 행동 — 직원·투자·캐스크 오너십·숙성고 로테이션(테크 MAT-3a 게이트 — 연구가 잠긴 MVP에서 풀 길이 없다)·원액 계약·수출·브로커·입지 대표 거래·IB 입찰·블렌딩 테이블 의뢰
    'action:hire', 'action:fire', 'action:takeInvestment', 'action:sellCaskOwnership', 'action:rotateWarehouse', 'action:acceptContract', 'action:cancelContract',
    'action:acceptExportOffer', 'action:setExportPrice', 'action:closeExport', 'action:buyBrokerCask', 'action:acceptRetail', 'action:cancelRetail',
    'action:acceptOem', 'action:acceptCaskBid', 'action:delegateBlend', 'action:labAnalyze', 'action:transferCask', 'action:openBrand', 'action:setProductBrand', 'action:startResearch', 'action:setResearch', 'action:cancelResearch', 'action:signForward', 'action:buyInsurance', 'action:cancelInsurance',
    // 설비 — 비지터 센터는 베이직 투어만(#139), 방재 설비 OUT, 증류기 추가는 다음 단계(§1.2 — 소주 감압 증류기만 연다)
    'facility:visitor_vip', 'facility:visitor_restaurant',
    'facility:facility_storm', 'facility:facility_snow', 'facility:facility_heating', 'facility:facility_dehumid', 'facility:facility_seismic',
    'facility:pot_onion_1000', 'facility:pot_lantern_1000', 'facility:pot_worm_1000', 'facility:hybrid_600', 'facility:pot_large_5000', 'facility:column_2',
  ],
  goal: { months: 180, netWorthMultiple: 3, flagshipMinMonths: 144 },
  // 중반 콘텐츠 (4차 MVP 플레이테스트 2026-11-09: 6년 차 흑자 뒤 "너무 쉽고 지루하다" — 오너 승인 1·2·3·4)
  stages: [
    { id: 'y5_market', month: 60, title: '6년 차 — 시장이 움직이고, 의뢰가 들어온다',
      unlock: ['system:events', 'system:commissions', 'action:delegateBlend', 'action:labAnalyze', 'facility:facility_storm', 'facility:facility_snow', 'facility:facility_heating', 'facility:facility_dehumid'],
      text: '랜덤 이벤트(재해·원재료 값·트렌드·평론가 방문)가 시작되고, 블렌딩 테이블 탭에서 평론가·바이어의 블렌딩 의뢰를 받을 수 있다. 재해에 대비한 방재 설비(배수·제설·난방·제습)도 지을 수 있다' },
    { id: 'y7_export', month: 84, title: '8년 차 — 수출 문이 열린다',
      unlock: ['system:exports', 'action:acceptExportOffer', 'action:setExportPrice', 'action:closeExport'],
      text: '수출 탭에서 해외 수입사의 제안을 받아 시장에 진출할 수 있다. 인지도가 낮은 시장은 마케팅 분담이 크다' },
    // 10년 차 두 번째 브랜드는 뺐다 (P-PROD-27, 오너 승인 2026-11-09) — 브랜드를 나누는 장점(럭셔리 지수·브랜드별 나눔)이
    // 아직 없어 열면 비용만 든다(MKT 점검: 같은 세이브 36개월, 어떻게 나눠도 하우스만보다 현금 −1.5억~−2.6억). 장점이 생기면 다시 단계로
  ],
  midGoals: [
    { id: 'aged3_sold', byMonth: 72, title: '3년 숙성 위스키를 판다', rewardAwareness: 0.03 },
    { id: 'commission_done', byMonth: 108, title: '블렌딩 의뢰 1건 성사', rewardAwareness: 0.03 },
    { id: 'export_open', byMonth: 132, title: '수출 시장 1곳 진출', rewardAwareness: 0.03 },
    { id: 'revenue_8', byMonth: 156, title: '연 매출 8억(최근 12개월)', rewardAwareness: 0.03 },
  ],
  defaultTier: 'micro',
  tiers: [
    {
      // #139(A1+C): 관리비 절반 → #190(2차 MVP 플레이테스트 2026-11-08, 오너 선택): 500만 → 300만. 숙성고 용량은 #137 압박용 [튜닝]
      id: 'micro', nameKo: '소규모 크래프트', tagline: '고정비가 가장 낮다. 대신 숙성고가 작아 중반부터 공간이 모자란다',
      equity: 500_000_000, overheadPerMonth: 3_000_000, warehouseBase: 90,
      staff: [FOUNDING_SALES],
      funding: { offers: ['kr_regional', 'kr_startup', 'facility'], max: 500_000_000 },
    },
    {
      // 값은 생존 실험으로 정한 임시값 [튜닝] — mvp.md §6.3
      id: 'standard', nameKo: '중소형 표준', tagline: '표준 숙성고·보통 고정비. 거치 기간이 끝날 때쯤 위스키 매출로 상환을 버텨야 한다',
      equity: 800_000_000, overheadPerMonth: 10_000_000, warehouseBase: 150,
      staff: [FOUNDING_SALES],
      funding: { offers: ['kr_regional', 'kr_startup', 'facility'], max: 1_000_000_000 },
    },
    {
      // 국내 점유 상한 때문에 MVP에서는 함정이다 → 수출·대형 원액 계약 업데이트 때 연다 (#140). 값은 자리표시
      id: 'commercial', nameKo: '대규모 상업', tagline: '막대한 자본과 고정비 — 글로벌 시장에 물량을 밀어내는 스케일업',
      locked: { reason: '글로벌 수출 업데이트 때 해금' },
      equity: 5_000_000_000, overheadPerMonth: 30_000_000, warehouseBase: 600,
      staff: [FOUNDING_SALES],
      funding: { offers: ['kr_regional', 'kr_startup', 'facility'], max: 1_500_000_000 },
    },
  ],
};

export const SCENARIOS: Record<string, ScenarioDef> = { [MVP_KR.id]: MVP_KR };

/** 시나리오의 잠금 키 전체 (주종 키 포함) */
export const scenarioLockedKeys = (d: ScenarioDef): string[] => [...d.locked, ...ALL_KINDS.filter((k) => !d.kinds.includes(k)).map((k) => `kind:${k}`)];
