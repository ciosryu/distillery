import type { RegionId, SpiritKind, StaffRole } from '../types';

// 시나리오 정의 (skeleton S-8, PRD §12.2) — 지역·입지·주종·잠금 키·경제 값·규모 티어를 데이터로 둔다.
// 새 게임은 이 정의를 GameState.scenario에 **복사**한다(세이브가 스스로를 설명한다 — 콘텐츠가 바뀌어도 진행 중인 판의 규칙은 그대로).
// 잠금 키는 테크 게이트(isUnlocked)와 같은 규칙: 'action:<Action.type>' · 'facility:<catalogId>' + 시나리오 전용 'system:<틱 시스템>' · 'kind:<주종>'.
// 끈 시스템의 코드는 지우지 않는다 — 키만 잠근다.

/** 틱 안에서 켜고 끄는 시스템 (step.ts가 'system:<이름>' 키로 판정) */
export type ScenarioSystem = 'events' | 'exports' | 'contracts' | 'broker' | 'caskBids' | 'siteDeals' | 'commissions' | 'hr';

export interface ScenarioTierDef {
  id: 'micro' | 'standard' | 'commercial';
  nameKo: string;
  tagline: string;
  /** 있으면 고를 수 없다 (자물쇠 + 툴팁) */
  locked?: { reason: string };
  /** 시작 자기자본 — 순자산 목표의 기준 (P-ARCH-3) */
  equity: number;
  /** 월 관리비 (지역 기본값 대신. 입지 관리비 배수는 그대로 곱한다) */
  overheadPerMonth: number;
  /** 시작 숙성고 기본 용량 (통) — #137 공간 압박 */
  warehouseBase: number;
  /** 창업 디스틸러 외에 처음부터 있는 직원 (MVP는 HR이 꺼져 있어 고정 인력이다) */
  staff: { role: StaffRole; stats: { a: number; b: number; c: number }; ageAtHire: number }[];
  /** 시작 때 미리 당겨 받을 수 있는 기존 대출 상품과 그 합계 상한 (P-ARCH-3). 금리가 낮은 상품부터 채운다 */
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
    /** 순자산 목표 = 시작 자기자본 × 이 배수 (P-ARCH-3) */
    netWorthMultiple: number;
    /** 플래그십 최소 숙성 (개월) */
    flagshipMinMonths: number;
  };
  tiers: ScenarioTierDef[];
  defaultTier: ScenarioTierDef['id'];
}

const ALL_KINDS: SpiritKind[] = ['soju', 'gin', 'malt', 'grain', 'baijiu'];

/** 창업 영업 직원 — HR이 꺼진 MVP에서도 유통 커버리지(market.coverage)를 만든다. 스탯 [튜닝] */
const FOUNDING_SALES = { role: 'sales' as const, stats: { a: 55, b: 60, c: 50 }, ageAtHire: 35 };

/** MVP — 한국 경기, 증류식 소주 + 싱글 몰트 (결정 #129~#138, P-ARCH-1~3) */
export const MVP_KR: ScenarioDef = {
  id: 'mvp_kr',
  nameKo: 'MVP — 한국 경기, 소주와 싱글 몰트',
  region: 'KR',
  kinds: ['soju', 'malt'],
  locked: [
    // 틱 시스템 (mvp.md §2 OUT)
    'system:events', 'system:exports', 'system:contracts', 'system:broker', 'system:caskBids', 'system:siteDeals', 'system:commissions', 'system:hr',
    // 행동 — 직원·투자·캐스크 오너십·원액 계약·수출·브로커·입지 대표 거래·IB 입찰·블렌딩 테이블 의뢰
    'action:hire', 'action:fire', 'action:takeInvestment', 'action:sellCaskOwnership', 'action:acceptContract', 'action:cancelContract',
    'action:acceptExportOffer', 'action:setExportPrice', 'action:closeExport', 'action:buyBrokerCask', 'action:acceptRetail', 'action:cancelRetail',
    'action:acceptOem', 'action:acceptCaskBid', 'action:delegateBlend', 'action:labAnalyze',
    // 설비 — 비지터 센터는 베이직 투어만(P-ARCH-1), 방재 설비 OUT, 증류기 추가는 다음 단계(§1.2 — 소주 감압 증류기만 연다)
    'facility:visitor_vip', 'facility:visitor_restaurant',
    'facility:facility_storm', 'facility:facility_snow', 'facility:facility_heating', 'facility:facility_dehumid', 'facility:facility_seismic',
    'facility:pot_onion_1000', 'facility:pot_lantern_1000', 'facility:pot_worm_1000', 'facility:hybrid_600', 'facility:pot_large_5000', 'facility:column_2',
  ],
  goal: { months: 180, netWorthMultiple: 3, flagshipMinMonths: 144 },
  defaultTier: 'micro',
  tiers: [
    {
      // P-ARCH-1(A1+C): 관리비 절반. 숙성고 용량은 #137 압박용 [튜닝]
      id: 'micro', nameKo: '소규모 크래프트', tagline: '고정비가 가장 낮다. 대신 숙성고가 작아 중반부터 공간이 모자란다',
      equity: 500_000_000, overheadPerMonth: 5_000_000, warehouseBase: 90,
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
      // 국내 점유 상한 때문에 MVP에서는 함정이다 → 수출·대형 원액 계약 업데이트 때 연다 (P-ARCH-2). 값은 자리표시
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
