import type { ProductCategory, RegionId } from '../types';

// 이벤트 정의 — 선언형 데이터 (Godot 이식 시 JSON으로 옮길 수 있게 함수 없이 작성). 확률·수치 [튜닝]
// 원칙: ① 큰 악재는 예보(빗나갈 수 있음)로 대비할 시간을 준다 ② 호재와 악재를 섞는다
//       ③ 같은 전략이 늘 이기지 않도록 원가·수요·B2B 시세를 번갈아 흔든다

export type EventCategory = 'market' | 'supply' | 'disaster' | 'regulation' | 'b2b' | 'opportunity' | 'people';

export type Effect =
  | { type: 'modifier'; key: string; factor: number; months: [number, number]; delay?: number; label?: string }
  | { type: 'cash'; amount: number }
  | { type: 'awareness'; delta: number }
  | { type: 'trust'; delta: number }
  | { type: 'caskLoss'; share: [number, number] }
  | { type: 'caskVolumeLoss'; share: number }
  | { type: 'stillDown'; months: number }
  | { type: 'lotSpoil'; acetic: number }
  | { type: 'specialContract'; capacityShare: number; prepayShare: number; priceFactor: number; termMonths: number }
  | { type: 'buyerDefault' }
  | { type: 'loseStaff' }
  | { type: 'raiseSalary'; share: number }
  | { type: 'gamble'; chance: number; success: Effect[]; failure: Effect[] }
  | { type: 'qualityGamble'; success: Effect[]; failure: Effect[] }
  | { type: 'exportOrder'; category: ProductCategory; bottles: number; priceFactor: number }
  | { type: 'hypeBestSeller'; factor: number; months: number; backlash: number; backlashMonths: number };

export type Requirement = 'activeContract' | 'filledCasks' | 'whiskyStock' | 'twoStaff' | 'still' | 'products' | 'highQualityProduct';

export interface EventChoiceDef { label: string; detail: string; effects: Effect[] }

export interface EventDef {
  id: string;
  title: string;
  category: EventCategory;
  text: string;
  /** 월 기본 발생 확률 */
  chance: number;
  cooldown: number;
  minMonth?: number;
  /** 발생 가능한 달(1~12) */
  months?: number[];
  /** 발생 가능한 지역 (없으면 모든 지역) */
  regions?: RegionId[];
  requires?: Requirement[];
  /** 몇 달 앞서 예보. certainty = 실제로 일어날 확률 */
  forecast?: { months: number; certainty: number; text: string };
  effects?: Effect[];
  choices?: EventChoiceDef[];
  defaultChoice?: number;
}

const m = (key: string, factor: number, months: [number, number], label?: string): Effect => ({ type: 'modifier', key, factor, months, label });

export const EVENTS: EventDef[] = [
  // ── 시장 국면 ──
  { id: 'highball_boom', title: '하이볼 열풍', category: 'market', chance: 0.018, cooldown: 48, text: '하이볼이 유행하며 위스키와 진 수요가 늘어납니다.',
    effects: [m('demand:whisky', 1.25, [12, 24], '하이볼 열풍'), m('demand:blended_whisky', 1.35, [12, 24], '하이볼 열풍'), m('demand:gin', 1.15, [12, 24], '하이볼 열풍')] },
  { id: 'peat_craze', title: '피트 위스키 열풍', category: 'market', chance: 0.014, cooldown: 48, text: '스모키한 위스키가 화제입니다. 피트 원액의 매력도와 벌크 시세가 오릅니다.',
    effects: [m('appeal:peated', 1.4, [18, 30], '피트 열풍'), m('bulk:peated', 1.2, [18, 30], '피트 열풍')] },
  { id: 'sherry_trend', title: '셰리 캐스크 인기', category: 'market', chance: 0.014, cooldown: 48, text: '셰리 캐스크 숙성 위스키가 인기를 끕니다.',
    effects: [m('appeal:sherried', 1.3, [18, 30], '셰리 캐스크 인기')] },
  { id: 'whisky_boom', title: '위스키 붐', category: 'market', chance: 0.01, cooldown: 72, minMonth: 24, text: '위스키 소비가 급증하고 블렌더들이 원액 확보 경쟁에 나섭니다.',
    forecast: { months: 3, certainty: 0.7, text: '업계 보고서: 위스키 수요가 크게 늘 조짐이 보입니다.' },
    effects: [m('demand:whisky', 1.25, [24, 36], '위스키 붐'), m('demand:blended_whisky', 1.2, [24, 36], '위스키 붐'), m('bulk', 1.35, [24, 36], '위스키 붐')] },
  { id: 'whisky_glut', title: '위스키 공급 과잉', category: 'market', chance: 0.01, cooldown: 72, minMonth: 36, text: '업계 전체가 증산한 결과 원액이 남아돌고 가격이 무너집니다.',
    forecast: { months: 4, certainty: 0.7, text: '업계 보고서: 원액 재고가 과잉 수준으로 쌓이고 있다는 경고가 나옵니다.' },
    effects: [m('bulk', 0.65, [18, 36], '공급 과잉'), m('demand:whisky', 0.85, [18, 36], '공급 과잉'), m('demand:blended_whisky', 0.85, [18, 36], '공급 과잉')] },
  { id: 'gin_fatigue', title: '진 열기가 식다', category: 'market', chance: 0.014, cooldown: 48, text: '크래프트 진이 너무 많아져 소비자 관심이 떨어집니다.',
    effects: [m('demand:gin', 0.7, [12, 24], '진 피로감')] },
  { id: 'traditional_revival', title: '전통주 재조명', category: 'market', chance: 0.014, cooldown: 48, regions: ['KR'], text: '방송과 SNS에서 증류식 소주가 재조명됩니다.',
    effects: [m('demand:soju_distilled', 1.4, [12, 18], '전통주 재조명')] },
  { id: 'recession', title: '경기 침체', category: 'market', chance: 0.009, cooldown: 72, minMonth: 12, text: '소비 심리가 위축되어 고가 주류부터 판매가 줄어듭니다.',
    forecast: { months: 2, certainty: 0.6, text: '경제 전망: 하반기 소비 위축 우려가 커지고 있습니다.' },
    effects: [m('demand:whisky', 0.8, [12, 24], '경기 침체'), m('demand:blended_whisky', 0.85, [12, 24], '경기 침체'), m('demand:soju_distilled', 0.9, [12, 24], '경기 침체'), m('demand:gin', 0.9, [12, 24], '경기 침체')] },
  { id: 'influencer_viral', title: '인플루언서 바이럴', category: 'market', chance: 0.015, cooldown: 24, requires: ['products'], text: '유명 인플루언서가 우리 제품을 소개했습니다. 반짝 품귀 뒤에는 반동이 올 수 있습니다.',
    effects: [{ type: 'awareness', delta: 0.04 }, { type: 'hypeBestSeller', factor: 1.8, months: 2, backlash: 0.85, backlashMonths: 6 }] },

  // ── 원가·공급 ──
  { id: 'barley_failure', title: '보리 흉작', category: 'supply', chance: 0.014, cooldown: 36, text: '주요 산지의 보리 작황이 나빠 맥아 가격이 급등합니다.',
    forecast: { months: 3, certainty: 0.75, text: '작황 예보: 주요 산지의 보리 작황이 부진할 전망입니다.' },
    effects: [m('ingredient:malt_unpeated', 1.5, [9, 15], '보리 흉작'), m('ingredient:malt_peated', 1.5, [9, 15], '보리 흉작'), m('ingredient:malt_korean', 1.4, [9, 15], '보리 흉작')] },
  { id: 'rice_spike', title: '쌀값 급등', category: 'supply', chance: 0.012, cooldown: 36, text: '작황 부진으로 쌀값이 오릅니다.',
    effects: [m('ingredient:rice_domestic', 1.35, [9, 12], '쌀값 급등'), m('ingredient:rice_processing', 1.3, [9, 12], '쌀값 급등')] },
  { id: 'rice_surplus', title: '정부 가공용 쌀 할인 공급', category: 'supply', chance: 0.012, cooldown: 36, regions: ['KR'], text: '쌀 과잉으로 정부가 가공용 쌀을 할인 공급합니다.',
    effects: [m('ingredient:rice_processing', 0.6, [12, 12], '가공용 쌀 할인')] },
  { id: 'corn_spike', title: '국제 곡물가 급등', category: 'supply', chance: 0.014, cooldown: 36, text: '국제 옥수수·밀 가격이 급등합니다. 그레인 원가가 오릅니다.',
    forecast: { months: 2, certainty: 0.7, text: '국제 곡물 시장: 주요 수출국 가뭄 소식이 들립니다.' },
    effects: [m('ingredient:corn', 1.5, [6, 12], '곡물가 급등'), m('ingredient:wheat', 1.35, [6, 12], '곡물가 급등')] },
  { id: 'energy_spike', title: '에너지 가격 급등', category: 'supply', chance: 0.012, cooldown: 36, text: '연료비가 크게 올라 증류 비용이 늘어납니다.',
    effects: [m('energy', 1.6, [6, 12], '에너지 가격 급등')] },
  { id: 'glass_shortage', title: '유리병 품귀', category: 'supply', chance: 0.012, cooldown: 36, text: '유리병 공급이 달려 포장재 가격이 오릅니다.',
    effects: [m('packaging', 1.5, [4, 8], '유리병 품귀')] },
  { id: 'barrel_shortage', title: '버번 배럴 품귀', category: 'supply', chance: 0.012, cooldown: 36, text: '미국산 중고 배럴 공급이 줄어 가격이 뜁니다.',
    effects: [m('cask:ex_bourbon_barrel', 1.7, [9, 15], '배럴 품귀')] },
  { id: 'gns_hike', title: '주정 가격 인상', category: 'supply', chance: 0.01, cooldown: 48, text: '주정 공급가가 인상됩니다. 진 원가가 오릅니다.',
    effects: [m('ingredient:gns', 1.3, [12, 24], '주정 가격 인상')] },

  // ── 재해·운영 ──
  { id: 'warehouse_fire', title: '숙성고 화재', category: 'disaster', chance: 0.003, cooldown: 60, requires: ['filledCasks'], text: '숙성고 일부가 불에 탔습니다.',
    effects: [{ type: 'caskLoss', share: [0.05, 0.15] }, { type: 'cash', amount: -20_000_000 }] },
  { id: 'flood', title: '집중호우 침수', category: 'disaster', chance: 0.02, cooldown: 24, months: [7, 8], regions: ['KR', 'JP'], text: '집중호우로 공장이 침수되어 한 달간 생산이 멈춥니다.',
    effects: [{ type: 'caskVolumeLoss', share: 0.02 }, m('production', 0, [1, 1], '침수 복구'), { type: 'cash', amount: -10_000_000 }] },
  { id: 'heatwave', title: '기록적 폭염', category: 'disaster', chance: 0.06, cooldown: 12, months: [7, 8], text: '폭염으로 숙성고 온도가 치솟아 증발이 늘어납니다.',
    effects: [m('evaporation', 1.7, [2, 2], '폭염')] },
  { id: 'still_breakdown', title: '증류기 고장', category: 'disaster', chance: 0.015, cooldown: 12, requires: ['still'], text: '증류기 하나가 고장 났습니다.',
    choices: [
      { label: '긴급 수리', detail: '3,000만 원 — 생산 중단 없음', effects: [{ type: 'cash', amount: -30_000_000 }] },
      { label: '일반 수리', detail: '500만 원 — 해당 증류기 2개월 중단', effects: [{ type: 'cash', amount: -5_000_000 }, { type: 'stillDown', months: 2 }] },
    ], defaultChoice: 1 },
  { id: 'ferment_infection', title: '발효 오염', category: 'disaster', chance: 0.015, cooldown: 12, text: '발효조에 잡균이 번져 탱크 원액에 시큼한 이취가 생겼습니다.',
    effects: [{ type: 'lotSpoil', acetic: 8 }] },

  // ── 규제 ──
  { id: 'tax_hike', title: '고도주 주세 인상', category: 'regulation', chance: 0.006, cooldown: 120, minMonth: 24, text: '세법 개정으로 소비자 가격이 올라 수요가 줄어듭니다.',
    forecast: { months: 6, certainty: 0.6, text: '국회: 고도주 주세 인상안이 논의되고 있습니다.' },
    effects: [m('consumerPrice:all', 1.06, [240, 240], '주세 인상')] },
  { id: 'ad_regulation', title: '주류 광고 규제 강화', category: 'regulation', chance: 0.008, cooldown: 72, text: '주류 광고 규제가 강화되어 마케팅 효과가 줄어듭니다.',
    effects: [m('awareness_gain', 0.6, [24, 36], '광고 규제')] },
  { id: 'korean_label_rule', title: '국산 위스키 표기 기준 강화', category: 'regulation', chance: 0.008, cooldown: 120, minMonth: 12, regions: ['KR'], text: '"국산 위스키" 표기 요건이 엄격해져 블렌더들이 국산 원액을 더 비싸게 찾습니다.',
    effects: [m('domestic_premium', 1.6, [36, 60], '국산 원액 수요 증가')] },
  { id: 'export_support', title: 'K-주류 수출 지원 사업 공모', category: 'regulation', chance: 0.012, cooldown: 24, regions: ['KR'], text: '정부가 수출 지원금을 공모합니다.',
    choices: [
      { label: '지원한다', detail: '서류 준비 500만 원 — 성공 확률 60%, 성공 시 8,000만 원', effects: [{ type: 'cash', amount: -5_000_000 }, { type: 'gamble', chance: 0.6, success: [{ type: 'cash', amount: 80_000_000 }], failure: [] }] },
      { label: '지원하지 않는다', detail: '비용 없음', effects: [] },
    ], defaultChoice: 1 },

  // ── 원액 B2B ──
  { id: 'blender_rush', title: '블렌더 원액 긴급 매입', category: 'b2b', chance: 0.02, cooldown: 12, text: '대형 블렌더가 원액이 모자라 현물 시세가 일시적으로 오릅니다.',
    effects: [m('bulk', 1.3, [2, 3], '긴급 매입')] },
  { id: 'blender_default', title: '거래 블렌더 부도', category: 'b2b', chance: 0.01, cooldown: 36, requires: ['activeContract'], text: '계약 중인 블렌더가 부도났습니다. 계약이 끝나고 지난달 대금을 받지 못합니다.',
    effects: [{ type: 'buyerDefault' }] },
  { id: 'mega_contract', title: '대형 블렌더 장기 계약 제안', category: 'b2b', chance: 0.012, cooldown: 24, minMonth: 6, text: '대형 블렌더가 선급금 40% 조건의 장기 공급 계약을 제안합니다.',
    effects: [{ type: 'specialContract', capacityShare: 0.6, prepayShare: 0.4, priceFactor: 1.05, termMonths: 36 }] },

  // ── 기회·사람 ──
  { id: 'export_inquiry', title: '해외 바이어 문의', category: 'opportunity', chance: 0.015, cooldown: 12, requires: ['whiskyStock'], text: '해외 바이어가 위스키 300병을 출고가의 120%에 사고 싶어 합니다.',
    choices: [
      { label: '수락', detail: '위스키 재고 300병을 120% 가격에 판매', effects: [{ type: 'exportOrder', category: 'whisky', bottles: 300, priceFactor: 1.2 }] },
      { label: '거절', detail: '국내 판매용 재고 유지', effects: [] },
    ], defaultChoice: 0 },
  { id: 'competition_medal', title: '{competition} 수상', category: 'opportunity', chance: 0.012, cooldown: 24, requires: ['highQualityProduct'], text: '우리 제품이 {competition}에서 메달을 받았습니다.',
    effects: [{ type: 'awareness', delta: 0.06 }] },
  { id: 'critic_visit', title: '평론가 {critic} 방문', category: 'opportunity', chance: 0.012, cooldown: 24, requires: ['products'], text: '평론가 {critic}이(가) 시음하러 왔습니다. 평가는 제품 품질에 달려 있습니다.',
    effects: [{ type: 'qualityGamble', success: [{ type: 'awareness', delta: 0.05 }, m('demand:all', 1.15, [6, 6], '평론가 호평')], failure: [m('demand:all', 0.88, [6, 6], '평론가 혹평')] }] },
  // ── 지역 고유 ──
  { id: 'typhoon', title: '태풍 상륙', category: 'disaster', chance: 0.05, cooldown: 12, months: [8, 9, 10], regions: ['JP', 'TW'], text: '태풍으로 공장이 피해를 입고 한 달간 생산이 멈춥니다.',
    effects: [{ type: 'caskVolumeLoss', share: 0.02 }, m('production', 0, [1, 1], '태풍 복구'), { type: 'cash', amount: -15_000_000 }] },
  { id: 'earthquake', title: '지진', category: 'disaster', chance: 0.004, cooldown: 60, regions: ['JP'], requires: ['filledCasks'], text: '강한 지진으로 숙성고 랙이 무너지고 증류기가 손상됐습니다.',
    effects: [{ type: 'caskLoss', share: [0.02, 0.06] }, { type: 'stillDown', months: 1 }, { type: 'cash', amount: -30_000_000 }] },
  { id: 'jp_whisky_shortage', title: '재패니즈 위스키 원액 부족', category: 'b2b', chance: 0.012, cooldown: 60, minMonth: 12, regions: ['JP'], text: '재패니즈 위스키 인기로 대형 회사들이 일본산 원액을 구하지 못해 웃돈을 붙입니다.',
    effects: [m('domestic_premium', 1.5, [24, 36], '일본산 원액 부족'), m('demand:whisky', 1.2, [24, 36], '재패니즈 위스키 인기')] },
  { id: 'shochu_boom', title: '본격 쇼추 붐', category: 'market', chance: 0.012, cooldown: 48, regions: ['JP'], text: '본격 쇼추가 젊은 층에게 다시 인기를 끕니다.',
    effects: [m('demand:soju_distilled', 1.3, [12, 24], '쇼추 붐')] },
  { id: 'tw_bubble_burst', title: '대만 위스키 투기 거품 붕괴', category: 'market', chance: 0.012, cooldown: 72, minMonth: 24, regions: ['TW'], text: '수집·재판매용으로 사들이던 싱글 몰트 수요가 꺼지고 재고가 쏟아집니다.',
    forecast: { months: 3, certainty: 0.6, text: '시장 동향: 위스키 재판매 가격이 흔들리고 있습니다.' },
    effects: [m('demand:whisky', 0.75, [18, 30], '투기 거품 붕괴'), m('bulk', 0.85, [12, 18], '투기 거품 붕괴')] },
  { id: 'tw_collector_boom', title: '싱글 캐스크 수집 열풍', category: 'market', chance: 0.012, cooldown: 48, regions: ['TW'], text: '대만 수집가들 사이에서 싱글 캐스크·고숙성 위스키 열풍이 붑니다.',
    effects: [m('demand:whisky', 1.3, [12, 24], '수집 열풍'), m('appeal:all', 1.05, [12, 24], '수집 열풍')] },
  { id: 'staff_poaching', title: '경쟁사 스카우트 제안', category: 'people', chance: 0.015, cooldown: 18, requires: ['twoStaff'], text: '경쟁사가 우리 직원에게 이직을 제안했습니다.',
    choices: [
      { label: '연봉 20% 인상', detail: '직원 한 명의 연봉을 20% 올려 붙잡는다', effects: [{ type: 'raiseSalary', share: 0.2 }] },
      { label: '보낸다', detail: '직원 한 명이 퇴사한다', effects: [{ type: 'loseStaff' }] },
    ], defaultChoice: 0 },
];

export const EVENT: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
