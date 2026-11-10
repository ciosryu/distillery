import type { ProductCategory } from '../types';

// 가상 주류 커뮤니티 피드 콘텐츠 ([결정 #247], 오너 2026-11-10) — 파트 MKT. 순수 연출(판매에 영향 없음).
// 오너 결정 4: 개인 프로젝트이므로 커뮤니티 이름·주류 회사·제품명은 모두 실제 이름을 쓴다.
// 오너 결정 5: 거친 말 수위 — 긍정 0.5(강조 은어만), 부정은 정도에 따라 1~2(2는 드물게). 혐오·차별·성적 표현은 넣지 않는다.
// 슬롯: {name} 제품 · {n1}{n2}{n3} 주요 향 · {off} 이취 · {price} 소비자가 · {bench} 비교 대상 실제 제품 · {cat} 주종 · {other}{winner}{loser} 비교 제품

export type FeedStyle = 'whiskybase' | 'cafe' | 'dc';
/** 0 정중 · 0.5 강조 은어(개~·미쳤다·ㄹㅇ) · 1 비아냥·가벼운 비속어(이돈씨·창렬·에반데) · 2 거친 욕설(드물게) */
export type Harsh = 0 | 0.5 | 1 | 2;
export type FeedSituation =
  | 'raise' | 'great' | 'good' | 'meh' | 'cheapLow' | 'pricey' | 'ripoff' | 'bad'
  | 'stockout' | 'launch' | 'priceUp' | 'priceDown' | 'forgotten';

export const FEED_COMMUNITIES: Record<FeedStyle, { whisky: string; white: string }> = {
  whiskybase: { whisky: 'Whiskybase', white: 'Whiskybase' },
  cafe: { whisky: '네이버 카페 · 위코클', white: '네이버 카페 · 슬위생' },
  dc: { whisky: '디시 · 위스키 갤러리', white: '디시 · 주류 갤러리' },
};

export const FEED_AUTHORS: Record<FeedStyle, readonly string[]> = {
  whiskybase: ['MaltManiac_88', 'peatfreak', 'DramDiary', 'Sherrybomb_KR', 'caskhunter', 'NoseFirst', 'Glencairn_Joe', 'SeoulSipper'],
  cafe: ['피트러버', '셰리몽', '주말한잔', '보틀헌터', '니트파', '하이볼장인', '위린이', '숙성덕후'],
  dc: ['ㅇㅇ(118.235)', 'ㅇㅇ(211.36)', 'ㅇㅇ(223.38)', '위붕이', '주붕이', 'ㅇㅇ(175.223)', '피트중독자', 'ㅇㅇ(39.7)'],
};

/**
 * 비교 대상 실제 제품 — 소비자가 구간(원/병)으로 고른다. 가격은 대략값 `[확인 불가]`이고 화면에 찍지 않는다(구간 선택용).
 * peat = 피트 위스키를 비교할 때 우선
 */
export const FEED_BENCHMARKS: Partial<Record<ProductCategory, readonly { name: string; price: number; peat?: boolean }[]>> = {
  whisky: [
    { name: '제임슨', price: 35_000 }, { name: '조니워커 블랙', price: 60_000 }, { name: '글렌리벳 12년', price: 75_000 },
    { name: '글렌피딕 12년', price: 80_000 }, { name: '라프로익 10년', price: 100_000, peat: true }, { name: '아드벡 10년', price: 110_000, peat: true },
    { name: '발베니 12년 더블우드', price: 150_000 }, { name: '맥캘란 12년 셰리오크', price: 180_000 }, { name: '라가불린 16년', price: 200_000, peat: true },
  ],
  blended_whisky: [{ name: '조니워커 레드', price: 30_000 }, { name: '조니워커 블랙', price: 60_000 }, { name: '시바스 리갈 12년', price: 65_000 }],
  soju_distilled: [{ name: '화요 25', price: 12_000 }, { name: '일품진로', price: 16_000 }, { name: '안동소주', price: 15_000 }, { name: '문배주', price: 25_000 }, { name: '화요 XP', price: 35_000 }],
  gin: [{ name: '봄베이 사파이어', price: 35_000 }, { name: '탱커레이', price: 40_000 }, { name: '헨드릭스', price: 60_000 }],
  baijiu: [{ name: '연태고량주', price: 15_000 }, { name: '수정방', price: 120_000 }],
};

/** 위스키베이스 — 테이스팅 노트 + 점수. 판단 문장(상황별) */
export const WB_VERDICT: Record<FeedSituation, readonly string[]> = {
  raise: ['이 품질에 이 가격은 말이 안 된다. 명백한 저평가 — 가격이 오르기 전에 확보 권장.', 'QPR이 비정상적으로 높다. 생산자가 가격을 잘못 매긴 듯.'],
  great: ['밸런스가 훌륭함.', '숙성감이 잘 녹아 있고 구조가 단단하다.', '레이어가 많고 잔에서 계속 열린다.'],
  good: ['무난하게 잘 만든 한 병.', '크게 흠잡을 데 없는 데일리.'],
  meh: ['특징이 약하다. 블라인드면 못 맞힐 듯.', '평범. 나쁘지도 좋지도 않음.'],
  cheapLow: ['가격을 감안하면 납득은 되나 니트로는 비추.', '믹서용으로는 쓸 만하다.'],
  pricey: ['잘 만들었지만 {bench}와 비교하면 가격이 부담.', '품질은 인정, 가격은 글쎄.'],
  ripoff: ['이 가격대면 {bench}를 사겠다. 숙성감 부족.', '가격에 비해 내용물이 따라오지 못한다.'],
  bad: ['알코올 자극이 튄다. 아쉬움.', '{off} 뉘앙스가 거슬린다. 다음 배치에 기대.'],
  stockout: ['품귀 — 다음 배치를 기다린다.'],
  launch: ['신규 릴리스. 첫인상 기록.'],
  priceUp: ['가격 인상 뒤 재평가.'],
  priceDown: ['가격 인하 — QPR 재평가.'],
  forgotten: ['한동안 시장에서 보이지 않는다.'],
};

/** 네이버 카페 — 정중·정보 공유 (거친 말 0) */
export const CAFE_LINES: Record<FeedSituation, readonly string[]> = {
  raise: [
    '회원님들, {name} 이 품질에 {price}이면 정말 저렴합니다. 조만간 가격 오를 것 같아요 — 보이면 일단 담으세요!',
    '{name} {n1} 향이 이 가격대에서 나오기 힘든데요... 솔직히 사장님이 가격 올리셔도 될 것 같습니다 ^^',
  ],
  great: ['{name} 마셔봤는데 {n1}·{n2} 밸런스가 정말 좋네요. 데일리 니트로 강추합니다~', '국산 {cat} 이 정도면 자랑할 만합니다. 다들 득템하세요~'],
  good: ['{name} 무난하게 좋습니다. 하이볼로도 니트로도 괜찮아요.', '{name} 가격 대비 만족스러운 한 병이었습니다. 참고하세요~'],
  meh: ['{name} 나쁘지는 않은데 특별한 개성은 잘 모르겠어요. 취향 타실 듯합니다.', '{name} 평범한 편이에요. 한 병 정도는 경험해 보셔도 좋을 듯.'],
  cheapLow: ['{name}은 니트보다는 하이볼용으로 추천드려요. 가격이 착해서 부담은 없네요.', '{name} 맛은 기대 안 하시는 게 좋고, 가볍게 섞어 드시기엔 괜찮습니다.'],
  pricey: ['{name} 맛은 좋은데 {price}은 조금 부담되네요. 할인할 때 노려보시길~', '{name} 품질은 좋지만 같은 돈이면 {bench}도 고민되긴 합니다.'],
  ripoff: ['솔직히 {name}은 이 가격이면 {bench} 쪽이 낫다고 생각합니다... 개인 의견입니다.', '{name} 가격이 품질보다 많이 앞서가는 느낌이에요. 신중히 구매하세요.'],
  bad: ['{name} {off} 느낌이 좀 올라와서 저는 아쉬웠습니다. 다음 배치 기대해 볼게요.', '{name} 알코올 자극이 꽤 있네요. 에어링 길게 하시는 걸 추천드려요.'],
  stockout: ['{name} 동네 보틀샵에서 품절이네요 ㅠ 재입고 소식 아시는 분 공유 부탁드려요.', '{name} 구하기 정말 힘드네요. 보이면 바로 담으세요!'],
  launch: ['{name} 신상 나왔습니다! 시음 후기 올라오면 공유해 주세요~', '{name} 출시 소식 공유드립니다. 첫 배치라 기대되네요.'],
  priceUp: ['{name} 가격이 올랐네요. 그래도 품질 생각하면 이해는 됩니다.', '{name} 가격 인상됐습니다. 참고하세요.'],
  priceDown: ['{name} 가격 인하 소식입니다. 이 기회에 한 병 들여 보세요~'],
  forgotten: ['요즘 {name} 통 안 보이네요. 단종된 건가요?'],
};

/** 디시 — 밈·직설. 거친 말 수위별 (긍정 0.5, 부정 1~2) */
export const DC_LINES: Record<FeedSituation, Partial<Record<Harsh, readonly string[]>>> = {
  raise: { 0.5: ['{name} 이 가격 실화냐? 사장 가격 실수한 듯 ㅋㅋ 오르기 전에 박스떼기 간다', '야 {name} 이 품질에 {price}? 이거 곧 오른다 닥치고 쟁여라', '{name} 사장아 가격 좀 올려라 ㅋㅋ 이건 거의 기부 수준'] },
  great: { 0.5: ['{name} {n1} 펀치력 미쳤네 ㅋㅋㅋ 국산이 이 정도면 개추', '{name} ㄹㅇ 개맛있음 이 가격이면 닥치고 박스떼기', '{name} 마셔봤냐? {n1} {n2} 개쩐다 ㅋㅋ'] },
  good: { 0.5: ['{name} 생각보다 괜찮네 ㅇㅇ 데일리로 무난', '{name} 하이볼 타 먹으니 개꿀 ㅋㅋ', '{name} 가성비 ㄱㅊ 재구매함'] },
  meh: { 0.5: ['{name} 걍 그럭저럭임 특징이 없음', '{name} 무난무난 노잼 ㅇㅇ'] },
  cheapLow: { 1: ['{name} 싼 맛에 먹는 소독약 ㅋㅋ 하이볼 아니면 못 먹음', '이 가격에 뭘 바라냐 ㅋㅋ {name} 걍 콜라 타라', '{name} 맛없는데 싸서 용서됨 ㅋㅋ'] },
  pricey: { 1: ['{name} 맛은 인정하는데 {price}? 이돈씨 ㅋㅋ', '{name} 이 가격이면 {bench} 사지 누가 사냐'] },
  ripoff: {
    1: ['아 {name} 품질 개에반데;; 이돈씨 차라리 {bench} 마심 ㅉㅉ', '{name} 창렬 오지네 ㅋㅋ 가격표 보고 웃음', '{name} 이걸 {price} 받는다고? 양심 어디감'],
    2: ['ㅅㅂ {name} 이게 {price}? 사기 아님? 돈 버렸다', '{name} 시발 이걸 돈 받고 파네 ㅋㅋㅋ 개창렬'],
  },
  bad: {
    1: ['{name} {off} 냄새 올라오던데 나만 그럼?', '{name} 알콜 부즈 쩔어 목 타들어감', '{name} 마시다 버림 ㅉㅉ'],
    2: ['{name} ㅅㅂ {off} 냄새 미쳤네 하수구냐', '{name} 존나 독함 이걸 어케 니트로 마심'],
  },
  stockout: { 0.5: ['{name} 품절 뭐냐 ㅋㅋ 오픈런 실패함', '{name} 어디 파는 데 있냐 다 털림', '{name} 리셀가 붙는 거 실화냐 ㅋㅋ'] },
  launch: { 0.5: ['{name} 신상 나옴 누가 마루타 해 봐라', '{name} 출시했네 후기 ㄱㄱ'] },
  priceUp: { 1: ['{name} 가격 또 올림 ㅋㅋ 배짱장사 오지네', '{name} 가격 올렸네 ㅅㄱ 이제 안 삼'] },
  priceDown: { 0.5: ['{name} 가격 내렸다 줍줍 ㄱ', '{name} 가격 인하 ㅋㅋ 안 팔리나 봄'] },
  forgotten: { 0.5: ['{name} 아직도 파냐? 존재감 0', '{name} 기억하는 사람 있냐 ㅋㅋ'] },
};

/** 비교 글 (오너 결정 6) — 같은 주종 제품끼리 */
export const COMPARE_LINES: Record<FeedStyle, readonly string[]> = {
  whiskybase: ['{winner} vs {loser} 나란히 비교. {winner} 쪽이 한 단계 위.', 'Side by side: {winner}가 {loser}보다 구조가 좋다.'],
  cafe: ['{winner}이랑 {loser} 둘 다 마셔 봤는데, 저는 {winner} 쪽이 더 좋았습니다. {reason}', '같은 증류소 {winner}·{loser} 비교 후기 남깁니다. {reason} 저는 {winner} 추천드려요.'],
  dc: ['{winner} vs {loser} 비교하면 {winner} 압승 ㅋㅋ', '{loser} 살 돈이면 {winner} 산다 ㅇㅇ', '{loser} 마시다가 {winner} 마시니까 차원이 다름 ㅋㅋ'],
};
export const COMPARE_REASON = { quality: '품질 차이가 확실히 느껴지네요.', price: '가격 대비로는 이쪽이 낫습니다.' } as const;
