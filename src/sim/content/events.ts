import type { HexAxis, ProductCategory, RegionId } from '../types';

// 이벤트 정의 — 선언형 데이터 (Godot 이식 시 JSON으로 옮길 수 있게 함수 없이 작성). 확률·수치 [튜닝]
// 원칙: ① 큰 악재는 예보(빗나갈 수 있음)로 대비할 시간을 준다 ② 호재와 악재를 섞는다
//       ③ 같은 전략이 늘 이기지 않도록 원가·수요·B2B 시세를 번갈아 흔든다

export type EventCategory = 'market' | 'supply' | 'disaster' | 'regulation' | 'b2b' | 'opportunity' | 'people';

export type Effect =
  | { type: 'modifier'; key: string; factor: number; months: [number, number]; delay?: number; label?: string }
  /** 기상 충격 — 결과(증발 배수)가 아니라 입력(외기 기온·습도)을 바꾼다 (결정 #120) */
  | { type: 'weather'; tempC: number; humidity?: number; months: [number, number]; label?: string }
  /** 향미 트렌드 이동 (결정 #125) — 제품 육각형 axis가 lo~hi 구간에서 매력도 × (1 + strength)까지 선형으로 오른다 */
  | { type: 'flavorTrend'; axis: HexAxis; strength: number; lo: number; hi: number; months: [number, number]; label?: string }
  | { type: 'cash'; amount: number }
  | { type: 'awareness'; delta: number }
  /** 해외 명성 (#96) — 수출 시장 현지 인지도를 끌어올리고 상한을 높인다 */
  | { type: 'acclaim'; delta: number }
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
  | { type: 'hypeBestSeller'; factor: number; months: number; backlash: number; backlashMonths: number }
  /** 캐스크 일부에 곰팡이·TCA 오염 */
  | { type: 'contaminate'; share: [number, number]; kind: 'tca' | 'mold' }
  /** 평론가 판정: 최고 제품 품질 ≥ rave면 극찬, < pan이면 혹평 */
  | { type: 'criticVerdict'; rave: number; pan: number; raveEffects: Effect[]; panEffects: Effect[]; mildEffects: Effect[] }
  /** 세무조사: 최근 3개월 주세 × rate 추징, 사무직 세무 스탯으로 감면 */
  | { type: 'taxAudit'; rate: number }
  /** 인플루언서 반동(hypeBestSeller의 '— 반동' 보정치)을 share만큼 1에 가깝게 — BIZ-3 앰버서더 대응 (#213) */
  | { type: 'softenBacklash'; share: number }
  /** 전 직원 급여 +share (협상가는 절반) — 연봉 협상 (P-MGT-24) */
  | { type: 'raiseAll'; share: number }
  /** 전 직원 사기 +delta (떨어질 때 토박이는 절반) — 연봉 협상 (P-MGT-24) */
  | { type: 'moraleAll'; delta: number };

export type Requirement = 'activeContract' | 'filledCasks' | 'whiskyStock' | 'twoStaff' | 'still' | 'products' | 'highQualityProduct' | 'agedWhisky' | 'exportUS' | 'exportCN';

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
  /** 이 입지에서도 발생 (regions에 없어도) / sitesOnly면 이 입지에서만 — 결정 #86 */
  sites?: string[];
  sitesOnly?: boolean;
  requires?: Requirement[];
  /** 몇 달 앞서 예보. certainty = 실제로 일어날 확률 */
  forecast?: { months: number; certainty: number; text: string };
  effects?: Effect[];
  choices?: EventChoiceDef[];
  defaultChoice?: number;
  /** 이 방재 설비가 있으면 피해 없음 (테크트리 도입 전 대체) */
  defense?: string;
  /** 이 이벤트가 일어난 뒤, 연구로 unlockKey가 열려 있으면 이어서 띄우는 선택 이벤트 (TRIGGERED_EVENTS의 id) — 연구 효과 '이벤트 선택지' (#213) */
  followUp?: { eventId: string; unlockKey: string };
}

const m = (key: string, factor: number, months: [number, number], label?: string): Effect => ({ type: 'modifier', key, factor, months, label });

export const EVENTS: EventDef[] = [
  // ── 시장 국면 ──
  { id: 'highball_boom', title: '하이볼 열풍', category: 'market', chance: 0.018, cooldown: 48, text: '하이볼이 유행하며 위스키와 진 수요가 늘어납니다.',
    effects: [m('demand:whisky', 1.25, [12, 24], '하이볼 열풍'), m('demand:blended_whisky', 1.35, [12, 24], '하이볼 열풍'), m('demand:gin', 1.15, [12, 24], '하이볼 열풍')] },
  { id: 'peat_craze', title: '피트 위스키 열풍', category: 'market', chance: 0.014, cooldown: 48, text: '스모키한 위스키가 화제입니다. 피트 원액의 매력도와 벌크 시세가 오릅니다.',
    // v1.6(#125): appeal:peated ×1.4(피트 25↑ 계단) → 육각형 피트 15~25 구간 연속 배수
    effects: [{ type: 'flavorTrend', axis: 'peat', strength: 0.4, lo: 15, hi: 25, months: [18, 30], label: '피트 열풍' }, m('bulk:peated', 1.2, [18, 30], '피트 열풍')] },
  { id: 'sherry_trend', title: '셰리 캐스크 인기', category: 'market', chance: 0.014, cooldown: 48, text: '셰리 캐스크 숙성 위스키가 인기를 끕니다.',
    // v1.6(#125): appeal:sherried ×1.3(건과일 25↑ 계단) → 육각형 스파이시 15~30 구간 연속 배수(셰리 캐스크는 건과일·오크 스파이스가 함께 오른다)
    effects: [{ type: 'flavorTrend', axis: 'spicy', strength: 0.3, lo: 15, hi: 30, months: [18, 30], label: '셰리 캐스크 인기' }] },
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
    effects: [{ type: 'awareness', delta: 0.04 }, { type: 'hypeBestSeller', factor: 1.8, months: 2, backlash: 0.85, backlashMonths: 6 }],
    followUp: { eventId: 'ambassador_response', unlockKey: 'event:influencer_backlash=ambassador' } },

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
  { id: 'flood', title: '집중호우 침수', category: 'disaster', chance: 0.02, cooldown: 24, months: [7, 8], regions: ['KR', 'JP'], defense: 'facility_storm', text: '집중호우로 공장이 침수되어 한 달간 생산이 멈춥니다.',
    effects: [{ type: 'caskVolumeLoss', share: 0.02 }, m('production', 0, [1, 1], '침수 복구'), { type: 'cash', amount: -10_000_000 }] },
  { id: 'heatwave', title: '기록적 폭염', category: 'disaster', chance: 0.06, cooldown: 12, months: [7, 8], text: '폭염으로 숙성고 온도가 치솟아 증발이 늘어납니다.',
    // v1.6(#120): 증발 ×1.7(결과) → 외기 +4°C 2개월(입력). 증발은 exp(0.13×4) ≈ 1.68배로 비슷하고, 추출·발효·도수도 함께 바뀐다
    effects: [{ type: 'weather', tempC: 4, humidity: -5, months: [2, 2], label: '폭염' }] },
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
    effects: [{ type: 'specialContract', capacityShare: 0.8, prepayShare: 0.4, priceFactor: 1.15, termMonths: 36 }] },

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
  // ── v1.0 재해 (방재 설비로 막는다) ──
  { id: 'snowstorm', title: '폭설', category: 'disaster', chance: 0.03, cooldown: 24, months: [12, 1, 2], regions: ['KR', 'JP'], requires: ['filledCasks'], defense: 'facility_snow', text: '폭설로 숙성고 지붕 일부가 무너졌습니다.',
    effects: [{ type: 'caskLoss', share: [0.01, 0.03] }, { type: 'stillDown', months: 1 }, { type: 'cash', amount: -20_000_000 }] },
  { id: 'cold_wave', title: '한파', category: 'disaster', chance: 0.05, cooldown: 12, months: [12, 1, 2], regions: ['KR', 'JP'], defense: 'facility_heating', text: '기록적인 한파로 배관이 얼어 터졌습니다. 한 달간 생산이 멈춥니다.',
    effects: [m('production', 0, [1, 1], '한파 동파 복구'), { type: 'cash', amount: -8_000_000 }, { type: 'weather', tempC: -6, months: [1, 1], label: '한파' }] },
  { id: 'mold_outbreak', title: '곰팡이 증식', category: 'disaster', chance: 0.04, cooldown: 12, months: [6, 7, 8, 9], requires: ['filledCasks'], defense: 'facility_dehumid', text: '장마철 습기로 숙성고에 곰팡이가 번졌습니다. 일부 캐스크가 오염됐습니다.',
    effects: [{ type: 'contaminate', share: [0.03, 0.08], kind: 'mold' }] },
  // ── v1.0 글로벌 경제 ──
  { id: 'tariff_retaliation', title: '관세 보복', category: 'supply', chance: 0.008, cooldown: 72, minMonth: 12, text: '무역 분쟁으로 보복 관세가 붙었습니다. 수입 맥아와 미국산 버번 배럴이 비싸지고, 수출 블렌더의 원액 수요가 줄어듭니다.',
    forecast: { months: 3, certainty: 0.6, text: '통상 갈등이 커지며 보복 관세 가능성이 거론됩니다.' },
    effects: [m('ingredient:malt_unpeated', 1.15, [12, 24], '보복 관세'), m('ingredient:malt_peated', 1.15, [12, 24], '보복 관세'), m('cask:ex_bourbon_barrel', 1.3, [12, 24], '보복 관세'), m('bulk', 0.9, [12, 24], '수출 위축')] },
  { id: 'spain_drought', title: '스페인 가뭄 — 셰리통 파동', category: 'supply', chance: 0.008, cooldown: 72, text: '스페인 가뭄으로 셰리 생산이 줄어 시즈닝된 셰리 캐스크가 귀해졌습니다.',
    forecast: { months: 4, certainty: 0.7, text: '헤레스 지역 가뭄으로 포도 작황이 나쁘다는 소식입니다.' },
    effects: [m('cask:oloroso_butt', 1.8, [24, 36], '셰리통 파동'), { type: 'flavorTrend', axis: 'spicy', strength: 0.1, lo: 15, hi: 30, months: [24, 36], label: '셰리 희소성' }] },
  // ── v1.0 평론가·세무 ──
  { id: 'murray_visit', title: '짐 머레이 기습 방문', category: 'opportunity', chance: 0.006, cooldown: 36, requires: ['products'], text: '평론가 짐 머레이가 예고 없이 찾아와 대표 제품을 시음했습니다.',
    effects: [{ type: 'criticVerdict', rave: 82, pan: 68,
      raveEffects: [{ type: 'awareness', delta: 0.1 }, m('demand:all', 1.8, [12, 12], '짐 머레이 극찬'), m('consumerPrice:all', 0.92, [12, 12], '극찬 프리미엄')],
      panEffects: [m('demand:all', 0.45, [12, 12], '짐 머레이 혹평')],
      mildEffects: [{ type: 'awareness', delta: 0.02 }] }] },
  // ── v1.5 해외 명성 (#96, §16.27) — 실제: 카발란은 2010 블라인드 테이스팅에서 스카치를 이긴 뒤 판매 약 3배 ──
  { id: 'intl_competition', title: '국제 품평회 출품 결과', category: 'opportunity', chance: 0.012, cooldown: 24, minMonth: 36, requires: ['agedWhisky'], text: '{competition}에 대표 위스키를 출품했습니다.',
    effects: [{ type: 'criticVerdict', rave: 75, pan: 58,
      raveEffects: [{ type: 'acclaim', delta: 0.15 }, { type: 'awareness', delta: 0.03 }],
      panEffects: [],
      mildEffects: [{ type: 'acclaim', delta: 0.04 }] }] },
  { id: 'blind_tasting_upset', title: '블라인드 테이스팅 이변', category: 'opportunity', chance: 0.004, cooldown: 60, minMonth: 48, requires: ['agedWhisky'], text: '해외 블라인드 테이스팅에 유명 스카치와 함께 올랐습니다.',
    effects: [{ type: 'criticVerdict', rave: 80, pan: 62,
      raveEffects: [{ type: 'acclaim', delta: 0.35 }, { type: 'awareness', delta: 0.05 }, m('export:all', 1.5, [12, 12], '블라인드 테이스팅 이변')],
      panEffects: [{ type: 'acclaim', delta: -0.05 }],
      mildEffects: [{ type: 'acclaim', delta: 0.05 }] }] },
  { id: 'overseas_critic', title: '해외 평론가 시음', category: 'opportunity', chance: 0.01, cooldown: 24, minMonth: 36, requires: ['agedWhisky'], text: '{critic}이(가) 대표 위스키를 시음했습니다.',
    effects: [{ type: 'criticVerdict', rave: 72, pan: 60,
      raveEffects: [{ type: 'acclaim', delta: 0.08 }, m('export:all', 1.2, [6, 6], '해외 평론 고득점')],
      panEffects: [{ type: 'acclaim', delta: -0.04 }],
      mildEffects: [{ type: 'acclaim', delta: 0.02 }] }] },
  { id: 'tax_audit', title: '세무조사', category: 'regulation', chance: 0.008, cooldown: 48, minMonth: 24, requires: ['products'], text: '국세청 세무조사가 나왔습니다. 주세 신고 내역을 검증합니다.',
    effects: [{ type: 'taxAudit', rate: 0.15 }] },
  // ── 지역 고유 ──
  // 수출 관세 이벤트 (#103) — 기본 관세는 content/exports.ts(2026-07-24 Section 301), 변동은 이벤트로
  { id: 'us_tariff_hike', title: '미국 추가 관세', category: 'regulation', chance: 0.012, cooldown: 48, requires: ['exportUS'], text: '미국이 과잉생산 조사(Section 301)를 근거로 수입 주류에 추가 관세를 매깁니다.',
    forecast: { months: 3, certainty: 0.6, text: '무역 동향: 미국 무역대표부가 주요 교역국 과잉생산 조사를 시작했습니다.' },
    effects: [m('tariff:US', 1.1, [12, 24], '미국 추가 관세')] },
  { id: 'us_tariff_relief', title: '미국 관세 인하 합의', category: 'opportunity', chance: 0.008, cooldown: 60, requires: ['exportUS'], text: '양자 협상으로 미국이 주류 관세를 일부 낮춥니다.',
    effects: [m('tariff:US', 0.93, [24, 36], '미국 관세 인하')] },
  { id: 'cn_tariff_retaliation', title: '중국 보복 관세', category: 'regulation', chance: 0.01, cooldown: 60, requires: ['exportCN'], text: '무역 분쟁으로 중국이 수입 증류주 관세를 올립니다.',
    forecast: { months: 2, certainty: 0.5, text: '무역 동향: 중국 상무부가 수입 증류주 반덤핑 조사를 예고했습니다.' },
    effects: [m('tariff:CN', 1.15, [12, 18], '중국 보복 관세')] },
  // 입지 고유 이벤트 (결정 #86~)
  { id: 'jeju_tourism_boom', title: '제주 관광객 급증', category: 'market', chance: 0.02, cooldown: 36, sites: ['jeju'], sitesOnly: true, text: '제주 관광객이 크게 늘어 지정면세점 매출이 오릅니다.',
    effects: [m('dutyfree', 1.4, [12, 18], '제주 관광 호황')] },
  { id: 'jeju_tourism_slump', title: '제주 관광객 감소', category: 'market', chance: 0.015, cooldown: 36, sites: ['jeju'], sitesOnly: true, text: '항공편 감소와 고물가로 제주 관광객이 줄어듭니다.',
    forecast: { months: 2, certainty: 0.6, text: '관광 동향: 제주 항공 노선 감축 소식이 들립니다.' },
    effects: [m('dutyfree', 0.6, [6, 12], '제주 관광 침체')] },
  { id: 'kansai_inbound_boom', title: '간사이 인바운드 관광 붐', category: 'market', chance: 0.02, cooldown: 36, sites: ['kansai'], sitesOnly: true, text: '외국인 관광객이 몰려 증류소 견학과 기념품 수요가 늘어납니다.',
    effects: [m('demand:all', 1.1, [12, 18], '인바운드 관광 붐')] },
  { id: 'kansai_inbound_slump', title: '인바운드 관광 급감', category: 'market', chance: 0.012, cooldown: 48, sites: ['kansai'], sitesOnly: true, text: '엔화 강세와 항공편 감소로 외국인 관광객이 줄어듭니다.',
    forecast: { months: 2, certainty: 0.6, text: '관광 동향: 방일 관광객 증가세가 꺾이고 있습니다.' },
    effects: [m('demand:all', 0.9, [6, 12], '인바운드 관광 급감')] },
  { id: 'typhoon', title: '태풍 상륙', category: 'disaster', chance: 0.05, cooldown: 12, months: [8, 9, 10], regions: ['JP', 'TW'], sites: ['jeju'], defense: 'facility_storm', text: '태풍으로 공장이 피해를 입고 한 달간 생산이 멈춥니다.',
    effects: [{ type: 'caskVolumeLoss', share: 0.02 }, m('production', 0, [1, 1], '태풍 복구'), { type: 'cash', amount: -15_000_000 }] },
  { id: 'earthquake', title: '지진', category: 'disaster', chance: 0.004, cooldown: 60, regions: ['JP'], defense: 'facility_seismic', requires: ['filledCasks'], text: '강한 지진으로 숙성고 랙이 무너지고 증류기가 손상됐습니다.',
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

/**
 * 연구가 여는 선택 이벤트 (#213, tech-tree §4 — 노드의 `event:` 해금 키). 무작위로 일어나지 않는다(EVENTS와 따로 둔다 —
 * 월 발생 판정·조기 경보·이벤트 수에 영향 없음). 조건이 맞으면 코드가 띄운다: 앞선 이벤트의 followUp, 또는 events.ts runEvents의 조건 확인.
 * 비용·효과 수치는 모두 [튜닝]
 */
export const TRIGGERED_EVENTS: EventDef[] = [
  // PRO-3 장인 전수 체계 — 마스터 디스틸러 은퇴 12개월 전 (events.ts artisanTransferDue)
  { id: 'artisan_retire', title: '마스터 디스틸러 은퇴 예정 — 전수', category: 'people', chance: 0, cooldown: 0,
    text: '마스터 디스틸러가 1년 안에 은퇴합니다. 손에 익은 공정과 하우스 스타일을 기록으로 남길지 정합니다.',
    choices: [
      { label: '전수 기록 프로젝트', detail: '2,000만 원 — 24개월 안에 은퇴하면 하우스 스타일 손실이 10분의 1로 준다(부사수 없으면 0 → 90% 보존, 있으면 90% → 99%)',
        effects: [{ type: 'cash', amount: -20_000_000 }, m('house_style_loss', 0.1, [24, 24], '장인 전수 기록')] },
      { label: '그대로 보낸다', detail: '비용 없음 — 부사수가 없으면 하우스 스타일이 초기화된다', effects: [] },
    ], defaultChoice: 1 },
  // BIZ-3 글로벌 앰버서더 — 인플루언서 바이럴 직후 (influencer_viral.followUp)
  { id: 'ambassador_response', title: '인플루언서 역풍 — 앰버서더 대응', category: 'market', chance: 0, cooldown: 0,
    text: '바이럴 뒤 반동이 예상됩니다. 앰버서더를 앞세워 대응할 수 있습니다.',
    choices: [
      { label: '앰버서더 대응 캠페인', detail: '1,500만 원 — 반동 폭을 절반으로 더 줄인다', effects: [{ type: 'cash', amount: -15_000_000 }, { type: 'softenBacklash', share: 0.5 }] },
      { label: '대응하지 않는다', detail: '비용 없음 — 연구 효과(반동 폭 −50%)만 남는다', effects: [] },
    ], defaultChoice: 1 },
  // 연봉 협상 (P-MGT-24) — 해마다 1월, HR이 열린 판에서 직원이 있으면 (events.ts salaryReviewDue). 고르지 않으면 동결.
  // 수치는 hr.ts MORALE.raise·raiseMorale·freezeMorale과 같게 둔다 [튜닝]
  { id: 'salary_review', title: '연봉 협상', category: 'people', chance: 0, cooldown: 0,
    text: '새해 연봉 협상 철입니다. 직원들이 인상을 기대하고 있습니다.',
    choices: [
      { label: '인상', detail: '전 직원 급여 +5%(협상가는 +2.5%) — 사기 +15', effects: [{ type: 'raiseAll', share: 0.05 }, { type: 'moraleAll', delta: 15 }] },
      { label: '동결', detail: '비용 없음 — 사기 −15(토박이는 −7.5)', effects: [{ type: 'moraleAll', delta: -15 }] },
    ], defaultChoice: 1 },
];

export const EVENT: Record<string, EventDef> = Object.fromEntries([...EVENTS, ...TRIGGERED_EVENTS].map((e) => [e.id, e]));
